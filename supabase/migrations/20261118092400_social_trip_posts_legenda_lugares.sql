-- S06-M-publicar-viagem: legenda e lugares salvos no post (RF09.7), e a lista
-- de quem pode ser marcado (RF09.13).
--
-- PROPOSTA do domínio Social (Micael), no mesmo fluxo da trip_posts
-- (20261116195039) e da post_tags (20261116234030): sobe no PR #51, passa no
-- CI ("Migrations e RLS"), e o merge espera a revisão do Fernando, dono das
-- migrations e das policies. Arquivo separado de propósito: a trip_posts já tem
-- o aval dele e NÃO muda — nenhuma policy, coluna ou grant dela é alterado
-- aqui; só se acrescentam duas colunas, os grants delas e duas funções.
--
-- Decisões do Micael em 18/11 (a tela segue a prévia do Fernando,
-- components/prototipo/botao-publicar.tsx):
--   - legenda opcional, até 280 caracteres; vazia ou só espaços vira nulo;
--   - "Lugares salvos": cada lugar sai com o nome e, se houver, a categoria; o
--     endereço só se o autor escolher mostrá-lo (o do Google ou um digitado).
--     Notas, coordenadas, nota do Google, "visitado" e place_id nunca saem;
--   - "Quem viajou com você": a lista para marcar são os membros da viagem com
--     username, menos a própria sessão.
--
-- Como no itinerário, a cópia é montada no servidor, e esta migration garante o
-- formato para que nem uma escrita direta pela Data API grave campo fora da
-- lista.
--
-- @RF09.7 @RF09.13 @RNF02.4


-- ---------------------------------------------------------------------------
-- 1. Formato dos lugares copiados
-- ---------------------------------------------------------------------------
-- `places` é um array de objetos, um por lugar salvo. Cada objeto tem `name` e,
-- quando existem, `category` e `address`. Qualquer outra chave é recusada:
-- `notes`, `latitude`, `longitude`, `rating`, `visited`, `place_id`, o `id` do
-- lugar. Quem monta a cópia omite o campo vazio ou desligado, então um campo
-- presente é sempre texto — e `address`, quando presente, não é vazio: o
-- endereço "nenhum" é a chave ausente, não uma string em branco.
--
-- Os limites espelham lib/schemas/lugar.ts (name 200, address 300, category 60).
-- O teto de 200 lugares é o mesmo do itinerário.
--
-- plpgsql, e não SQL, pelo mesmo motivo de social_itens_do_post_validos: em SQL
-- o Postgres não garante a ordem de avaliação do OR, e jsonb_object_keys
-- quebraria com um lugar que não é objeto em vez de a função responder falso.
create or replace function public.social_lugares_do_post_validos(lugares jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  lugar jsonb;
  chave text;
begin
  if lugares is null or jsonb_typeof(lugares) <> 'array' or jsonb_array_length(lugares) > 200 then
    return false;
  end if;

  for lugar in select value from jsonb_array_elements(lugares) loop
    if jsonb_typeof(lugar) <> 'object' then
      return false;
    end if;

    for chave in select jsonb_object_keys(lugar) loop
      if chave not in ('name', 'category', 'address') then
        return false;
      end if;
      if jsonb_typeof(lugar -> chave) <> 'string' then
        return false;
      end if;
    end loop;

    if not (lugar ? 'name') or btrim(lugar ->> 'name') = '' or char_length(lugar ->> 'name') > 200 then
      return false;
    end if;
    if lugar ? 'category' and char_length(lugar ->> 'category') > 60 then
      return false;
    end if;
    if lugar ? 'address' and (btrim(lugar ->> 'address') = '' or char_length(lugar ->> 'address') > 300) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

comment on function public.social_lugares_do_post_validos(jsonb) is
  'Verdadeiro se os lugares copiados para um post têm só nome, categoria e endereço (RF09.7): nunca notas, coordenadas, nota do Google, "visitado" nem ids.';

-- O CHECK roda com o papel de quem escreve, que precisa de EXECUTE. A função
-- não lê tabela nenhuma: responder sobre um jsonb qualquer não revela nada.
revoke all on function public.social_lugares_do_post_validos(jsonb) from public, anon;
grant execute on function public.social_lugares_do_post_validos(jsonb) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 2. Colunas novas
-- ---------------------------------------------------------------------------
-- Default constante: o ADD COLUMN não reescreve a tabela. Os CHECKs varrem as
-- linhas que já existem, e todas passam (caption nula, places '[]').
--
-- A legenda vazia é nula, não ''. O btrim tira também tabulação e quebra de
-- linha, como o .trim() do zod na rota: uma legenda só de quebras de linha
-- seria um post "com legenda" que não mostra nada.
alter table public.trip_posts
  add column caption text,
  add column places  jsonb not null default '[]'::jsonb,
  add constraint trip_posts_caption_check check (
    caption is null
    or (btrim(caption, E' \t\r\n') <> '' and char_length(caption) <= 280)
  ),
  add constraint trip_posts_places_check check (public.social_lugares_do_post_validos(places));

comment on column public.trip_posts.caption is
  'Legenda do post, até 280 caracteres; nula quando o autor não escreveu nada (RF09.7).';
comment on column public.trip_posts.places is
  'Lugares salvos copiados para o post: só nome, categoria e o endereço que o autor escolheu mostrar (RF09.7).';


-- ---------------------------------------------------------------------------
-- 3. Privilégios das colunas novas
-- ---------------------------------------------------------------------------
-- A trip_posts dá grant por coluna (20261116195039, seção 6), então coluna nova
-- nasce ilegível e imutável para authenticated: sem estes grants, o autor não
-- publicaria nem leria a legenda. Quem pode — só o autor, membro, com
-- username — continua decidido pelas policies, que não mudam.
--
-- UPDATE nas duas: "Atualizar publicação" copia a viagem de novo. anon segue
-- sem nada; service_role já tem tudo (grant all na tabela).
grant select (caption, places) on public.trip_posts to authenticated;
grant insert (caption, places) on public.trip_posts to authenticated;
grant update (caption, places) on public.trip_posts to authenticated;


-- ---------------------------------------------------------------------------
-- 4. Quem a sessão pode marcar numa viagem
-- ---------------------------------------------------------------------------
-- A tela "Quem viajou com você" precisa dos outros membros da viagem com
-- username — os mesmos que social_pode_marcar aceita. A RLS da plataforma não
-- deixa o domínio Social ler trip_members de outra pessoa, e o CLAUDE.md não
-- deixa a rota consultar a tabela de outro domínio: a função responde só
-- isso, e nada além dos ids.
--
-- Só responde a quem participa da viagem: para quem não é membro (ou para uma
-- chamada sem sessão), volta vazio, e por ela não se descobre quem foi na
-- viagem. O que ela revela ao membro, ele já vê na lista de membros.
--
-- Fica de fora quem não tem username (usar a rede social exige um) e a própria
-- sessão (ninguém marca a si mesmo; post_tags_nao_marca_a_si).
--
-- SECURITY DEFINER, como social_pode_marcar: a resposta não fica à mercê de
-- como a plataforma ajusta a RLS de trip_members e profiles. Hoje essa RLS já
-- deixaria o membro ver os colegas (can_access_trip) e qualquer username — a
-- mutação para SECURITY INVOKER passa nos testes —, então a função não abre
-- nada além do que o membro já vê. A checagem da sessão está no corpo, no join
-- com `eu`: sem ela, a função abriria os membros de qualquer viagem.
create or replace function public.social_membros_marcaveis(viagem uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select ele.user_id
    from public.trip_members eu
    join public.trip_members ele
      on ele.trip_id = eu.trip_id
    join public.profiles perfil
      on perfil.id = ele.user_id
     and perfil.username is not null
   where eu.trip_id = viagem
     and eu.user_id = (select auth.uid())
     and ele.user_id <> (select auth.uid());
$$;

comment on function public.social_membros_marcaveis(uuid) is
  'Ids dos outros membros da viagem, com username, que a sessão pode marcar (RF09.13). Vazio se a sessão não participa da viagem.';

revoke all on function public.social_membros_marcaveis(uuid) from public, anon;
grant execute on function public.social_membros_marcaveis(uuid) to authenticated, service_role;
