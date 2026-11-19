-- S06-M-publicar-viagem: o POST da rede social, no modelo do Instagram
-- (RF09.15), do qual a viagem publicada (RF09.7) passa a ser um caso; e a
-- marcação de qualquer perfil com username (RF09.13).
--
-- PROPOSTA do domínio Social (Micael), no mesmo fluxo da trip_posts
-- (20261116195039), da post_tags (20261116234030) e da legenda e lugares
-- (20261118092400): sobe no PR #51, passa no CI ("Migrations e RLS"), e o
-- merge espera a revisão do Fernando, dono das migrations e das policies.
-- Arquivo separado de propósito: NENHUMA das três migrations anteriores é
-- editada. Tudo o que muda está aqui, como ALTER sobre o que elas criaram.
--
-- Decisões do Micael em 18/11 (noite) — o vocabulário é só POST:
--   - um post é 1 a 3 fotos (carrossel, na ordem em que foram escolhidas),
--     legenda opcional e pessoas marcadas;
--   - uma viagem publicada é um post que, além disso, leva a cópia da viagem
--     (título, destino, datas, roteiro, lugares). Só ele pode ter 0 fotos;
--   - marcação como no Instagram: qualquer perfil com username, menos o
--     próprio autor, também no post de viagem (antes: só membros da viagem).
--     Os membros continuam como sugestão na tela (social_membros_marcaveis);
--   - a recusa de remarcação continua: no post de viagem, por (viagem, autor,
--     pessoa), como antes; num post sem viagem, por (post, pessoa);
--   - até 20 pessoas marcadas por post (o limite do Instagram), também no
--     banco: com a marcação aberta, sem ele um autor marcaria a plataforma
--     inteira pela Data API (seção 9);
--   - depois de publicado, editar legenda e marcações e excluir o post.
--
-- Por isso trip_posts vira public.posts: a tabela guarda todo post, e a
-- viagem é opcional nela. Constraints, índices, policies e o trigger trocam o
-- prefixo trip_posts_ por posts_; as funções que citam a tabela pelo nome são
-- recriadas (o corpo de uma função guarda texto, não o OID: depois do RENAME
-- elas quebrariam na primeira chamada). As policies guardam o OID e só
-- mudam de nome — menos as de INSERT e UPDATE, cujo predicado muda.
--
-- @RF09.7 @RF09.13 @RF09.15 @RNF02.4


-- ---------------------------------------------------------------------------
-- 1. trip_posts vira posts
-- ---------------------------------------------------------------------------
-- O RENAME pega ACCESS EXCLUSIVE na tabela até o fim da migration, que roda
-- numa transação só: nenhuma leitura vê o meio do caminho (tabela com nome
-- novo e função com o nome velho).
alter table public.trip_posts rename to posts;

-- Renomear a constraint de PK ou unique renomeia o índice dela junto.
alter table public.posts rename constraint trip_posts_pkey              to posts_pkey;
alter table public.posts rename constraint trip_posts_trip_id_fkey      to posts_trip_id_fkey;
alter table public.posts rename constraint trip_posts_author_id_fkey    to posts_author_id_fkey;
alter table public.posts rename constraint trip_posts_um_por_membro     to posts_um_por_membro;
alter table public.posts rename constraint trip_posts_title_check       to posts_title_check;
alter table public.posts rename constraint trip_posts_destination_check to posts_destination_check;
alter table public.posts rename constraint trip_posts_datas_check       to posts_datas_check;
alter table public.posts rename constraint trip_posts_items_check       to posts_items_check;
alter table public.posts rename constraint trip_posts_caption_check     to posts_caption_check;
alter table public.posts rename constraint trip_posts_places_check      to posts_places_check;
-- trip_posts_cover_path_check sai com a coluna (seção 3).

alter policy trip_posts_select on public.posts rename to posts_select;
alter policy trip_posts_insert on public.posts rename to posts_insert;
alter policy trip_posts_update on public.posts rename to posts_update;
alter policy trip_posts_delete on public.posts rename to posts_delete;

-- O trigger e a função dele: o corpo não cita a tabela (só mexe em NEW), então
-- basta o nome novo. O revoke de EXECUTE (20261116195039) acompanha o OID.
alter trigger trip_posts_tocar_updated_at on public.posts rename to posts_tocar_updated_at;
alter function public.trip_posts_tocar_updated_at() rename to posts_tocar_updated_at;

-- A grade de "Publicações" pagina por (created_at desc, id desc) dentro do
-- autor: o id desempata dois posts do mesmo instante, e sem ele no índice o
-- cursor ordenaria o empate fora do índice. Continua cobrindo a FK de
-- author_id (prefixo).
drop index public.trip_posts_autor_recentes_idx;
create index posts_autor_recentes_idx on public.posts (author_id, created_at desc, id desc);


-- ---------------------------------------------------------------------------
-- 2. Formato das fotos
-- ---------------------------------------------------------------------------
-- `photos` guarda os caminhos no bucket capas-posts, na ordem do carrossel.
-- Verdadeiro se:
--   - são no máximo 3 (o carrossel do contrato), num array simples (uma
--     dimensão, começando em 1: um array '[5:7]={...}' ou '{{a},{b}}' passaria
--     no cardinality e quebraria quem lê pela ordem);
--   - cada uma está na pasta do AUTOR do post, com nome <uuid>.webp. A pasta
--     e o nome seguem a regra do antigo cover_path e de profiles.avatar_url
--     (a extensão, não: veja o último item abaixo): a chave de
--     serviço só assina e apaga caminho assim, e ninguém aponta o próprio post
--     para a foto de outra pessoa (a pasta é o author_id) nem para fora do
--     bucket ('../', outro prefixo);
--   - nenhuma é nula nem se repete (a mesma foto duas vezes no carrossel, e o
--     DELETE do Storage apagaria o mesmo arquivo duas vezes);
--   - todas terminam em .webp. Desde 18/11 a rota reprocessa toda foto com
--     sharp e grava sempre WebP; jpg e png só existiriam em capas enviadas
--     antes disso, e a revisão de 19/11 (achado A5) não achou nenhuma no
--     bucket. Aceitá-los deixava a Data API gravar uma extensão que a rota
--     nunca produz. A cópia do cover_path (seção 3) só traz o que é .webp.
--
-- immutable: depende só dos argumentos. O caminho é montado com o autor
-- dentro do padrão — um uuid em texto só tem hexadecimal e hífen, nada que o
-- regex leia como operador. O avatar (profiles.avatar_url) segue aceitando
-- jpg e png: o bucket avatars ainda pode ter fotos antigas nesses formatos.
--
-- plpgsql, e não SQL, pelo mesmo motivo de social_itens_do_post_validos: a
-- ordem das checagens importa (array_lower de um array vazio é nulo).
create or replace function public.social_fotos_do_post_validas(fotos text[], autor uuid)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  foto   text;
  padrao text;
begin
  if fotos is null or autor is null then
    return false;
  end if;
  if cardinality(fotos) = 0 then
    return true;
  end if;
  if cardinality(fotos) > 3 or array_ndims(fotos) <> 1 or array_lower(fotos, 1) <> 1 then
    return false;
  end if;

  padrao := '^' || autor::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$';

  foreach foto in array fotos loop
    if foto is null or foto !~ padrao then
      return false;
    end if;
  end loop;

  if (select count(distinct f) from unnest(fotos) as f) <> cardinality(fotos) then
    return false;
  end if;

  return true;
end;
$$;

comment on function public.social_fotos_do_post_validas(text[], uuid) is
  'Verdadeiro se as fotos de um post são no máximo 3 caminhos distintos na pasta do autor, <autor>/<uuid>.webp, só WebP (RF09.15).';

-- O CHECK roda com o papel de quem escreve, que precisa de EXECUTE. A função
-- não lê tabela nenhuma: responder sobre um array qualquer não revela nada.
revoke all on function public.social_fotos_do_post_validas(text[], uuid) from public, anon;
grant execute on function public.social_fotos_do_post_validas(text[], uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 3. Post com ou sem viagem; fotos no lugar da capa
-- ---------------------------------------------------------------------------
-- A viagem fica opcional: trip_id e os quatro campos copiados dela aceitam
-- nulo. Os CHECKs de tamanho e de datas continuam valendo quando há valor
-- (um CHECK com nulo passa), e a coerência garante as duas formas, sem meio
-- termo:
--   - sem viagem: os cinco nulos, sem roteiro e sem lugares — um post de fotos
--     não carrega um pedaço de viagem que ninguém publicou;
--   - com viagem: os cinco preenchidos, como era na trip_posts.
-- O autor não troca de forma depois: trip_id não está no grant de UPDATE, e
-- um UPDATE que preenche (ou apaga) o título sozinho cai na coerência.
--
-- A unique (trip_id, author_id) continua: um post por membro e viagem. Com
-- trip_id nulo, os nulos são distintos, e o autor publica quantos posts de
-- fotos quiser.
alter table public.posts
  alter column trip_id     drop not null,
  alter column title       drop not null,
  alter column destination drop not null,
  alter column start_date  drop not null,
  alter column end_date    drop not null,
  add column photos text[] not null default '{}';

-- A capa de um post antigo vira a primeira (e única) foto. O trigger de
-- updated_at fica desligado durante a cópia: migrar a coluna não é editar o
-- post, e o "editado em" não deve mudar. O lock da seção 1 já está tomado.
--
-- Só a capa .webp vem: o posts_photos_check (abaixo) aceita só WebP, e uma
-- capa .jpg/.png copiada faria o ADD CONSTRAINT falhar e a migration inteira
-- voltar. O resto do formato (pasta do autor, nome uuid) o antigo
-- trip_posts_cover_path_check já garantia. Uma capa jpg/png anterior ao
-- reprocessamento de 18/11 ficaria de fora: o post de viagem segue válido sem
-- foto (mostra o grafismo CapaViagem) e o arquivo fica sem referência no
-- bucket. A revisão de 19/11 (A5) conferiu 0 arquivos não-WebP no bucket.
alter table public.posts disable trigger posts_tocar_updated_at;
update public.posts
   set photos = array[cover_path]
 where cover_path ~ '\.webp$';
alter table public.posts enable trigger posts_tocar_updated_at;

-- O cover_path sai, e com ele o CHECK e os grants da coluna. Uma coluna só
-- de fotos evita duas fontes de verdade para a capa.
alter table public.posts drop column cover_path;

alter table public.posts
  add constraint posts_viagem_coerente check (
    (trip_id is null
      and title is null and destination is null
      and start_date is null and end_date is null
      and items = '[]'::jsonb and places = '[]'::jsonb)
    or
    (trip_id is not null
      and title is not null and destination is not null
      and start_date is not null and end_date is not null)
  ),
  add constraint posts_photos_check check (public.social_fotos_do_post_validas(photos, author_id)),
  -- Só o post de viagem pode não ter foto: ele mostra o grafismo CapaViagem.
  -- Um post sem viagem e sem foto seria um post vazio.
  add constraint posts_fotos_ou_viagem check (trip_id is not null or cardinality(photos) >= 1);

comment on table public.posts is
  'Post da rede social: 1 a 3 fotos, legenda e marcações; o post de viagem leva também a cópia dela (RF09.7, RF09.15). Nunca guarda despesas, orçamento, moeda, notas nem os membros.';
comment on column public.posts.trip_id is
  'Nulo no post sem viagem. Ilegível para authenticated (grant por coluna): dois posts com o mesmo trip_id revelariam quem viajou junto.';
comment on column public.posts.photos is
  'Caminhos das fotos no bucket capas-posts, na ordem do carrossel, na pasta do autor; vazio só no post de viagem (RF09.15).';


-- ---------------------------------------------------------------------------
-- 4. Policies de escrita
-- ---------------------------------------------------------------------------
-- SELECT e DELETE não mudam: a visibilidade segue o perfil do autor
-- (pode_ver_rede), e só o autor apaga — inclusive o post de viagem depois de
-- sair dela (equivale a despublicar).
--
-- INSERT: em nome de si mesmo, com username (o post vive em /u/<username>),
-- e, se o post é de uma viagem, numa de que participa. O post sem viagem não
-- depende de viagem nenhuma. Sem o `trip_id is null or`, o post de fotos
-- seria impossível (is_trip_member(null) é falso); sem o is_trip_member, um
-- autor publicaria a cópia de uma viagem alheia.
alter policy posts_insert on public.posts
  with check (
    (select auth.uid()) = author_id
    and (trip_id is null or public.is_trip_member(trip_id, (select auth.uid())))
    and exists (
      select 1 from public.profiles p
       where p.id = (select auth.uid())
         and p.username is not null
    )
  );

-- UPDATE: só o autor; no post de viagem, só enquanto participa dela
-- ("Atualizar publicação" copia a viagem de novo). O post sem viagem o autor
-- edita sempre (legenda e marcações). Quais colunas mudam, decide o grant.
alter policy posts_update on public.posts
  using ((select auth.uid()) = author_id)
  with check (
    (select auth.uid()) = author_id
    and (trip_id is null or public.is_trip_member(trip_id, (select auth.uid())))
  );


-- ---------------------------------------------------------------------------
-- 5. Privilégios das fotos
-- ---------------------------------------------------------------------------
-- A posts dá grant por coluna (20261116195039, seção 6), então a coluna nova
-- nasce ilegível e imutável para authenticated. O cover_path, que tinha
-- SELECT e UPDATE, saiu com a coluna. trip_id segue ilegível.
--
-- INSERT com photos: a rota envia as fotos com a chave de serviço e insere o
-- post com a sessão, com os caminhos. Uma escrita direta pela Data API só
-- consegue apontar para a pasta do próprio autor (posts_photos_check): no
-- pior caso, um caminho que não existe, e a foto não carrega — o mesmo que já
-- valia para o cover_path.
--
-- UPDATE com photos: o post de viagem troca as fotos pelo diálogo de
-- gerenciar (PUT /api/social/viagens/[tripId]/post/fotos, com a sessão). No
-- post sem viagem as fotos não mudam depois de publicado, e o banco trava
-- isso: o grant é da coluna inteira, mas o trigger posts_fotos_imutaveis
-- (seção 12) recusa com 23514 a troca num post sem viagem.
grant select (photos) on public.posts to authenticated;
grant insert (photos) on public.posts to authenticated;
grant update (photos) on public.posts to authenticated;


-- ---------------------------------------------------------------------------
-- 6. Recusas por viagem OU por post
-- ---------------------------------------------------------------------------
-- No post de viagem a recusa continua por (viagem, autor, pessoa): sobrevive
-- a despublicar e publicar de novo (20261116234030, seção 2). No post sem
-- viagem não há "publicar de novo" — cada post é outro post —, então a recusa
-- é por (post, pessoa) e morre com ele (post_id em cascata).
--
-- Exatamente um dos dois: uma recusa com os dois valeria em dois lugares, e
-- uma sem nenhum não valeria em lugar nenhum.
--
-- A PK (trip_id, author_id, tagged_id) não cabe mais (trip_id nulo), e vira
-- um id próprio; as unicidades passam a índices parciais, um por forma. O
-- da viagem cobre a FK de trip_id (a cascata ao apagar a viagem filtra
-- trip_id = X, que implica o predicado) e a busca de social_pode_marcar; o do
-- post cobre a FK de post_id e a busca por post.
alter table public.post_tag_recusas
  drop constraint post_tag_recusas_pkey;

alter table public.post_tag_recusas
  alter column trip_id drop not null,
  add column id      bigint generated always as identity,
  add column post_id uuid,
  add constraint post_tag_recusas_pkey primary key (id),
  add constraint post_tag_recusas_post_id_fkey
    foreign key (post_id) references public.posts (id) on delete cascade,
  add constraint post_tag_recusas_viagem_ou_post check (num_nonnulls(trip_id, post_id) = 1);

create unique index post_tag_recusas_por_viagem_key
  on public.post_tag_recusas (trip_id, author_id, tagged_id)
  where trip_id is not null;
create unique index post_tag_recusas_por_post_key
  on public.post_tag_recusas (post_id, tagged_id)
  where post_id is not null;

comment on table public.post_tag_recusas is
  'Quem removeu a marca que um autor pôs nela: no post de viagem, aquele autor não a marca de novo em post nenhum da viagem; no post sem viagem, ninguém a marca de novo naquele post (RF09.13, RF09.14). Só o trigger de post_tags escreve.';
comment on column public.post_tag_recusas.trip_id is
  'Recusa do post de viagem; nulo na recusa de post sem viagem. Ilegível para authenticated (grant por coluna): como em posts, revelaria quem viajou junto.';
comment on column public.post_tag_recusas.post_id is
  'Recusa de post sem viagem; nulo na de viagem. Ilegível para authenticated: a pessoa lista as próprias recusas sem precisar dele, e o autor consulta pela social_recusas_do_post.';

-- Grants: nada muda para authenticated — o SELECT continua só em author_id,
-- tagged_id e created_at, e as colunas novas (id, post_id) nascem ilegíveis.
-- service_role tem grant all na tabela, que vale para coluna nova.

comment on table public.post_tags is
  'Pessoas marcadas num post (RF09.13). Ser marcado não dá acesso ao post: a leitura dele segue a posts.';


-- ---------------------------------------------------------------------------
-- 7. Funções recriadas: citam a tabela pelo nome
-- ---------------------------------------------------------------------------

-- 7.1 O autor acha o próprio post de uma viagem. Só o nome da tabela muda.
-- Responde só sobre a sessão: o post de outra pessoa na mesma viagem volta
-- nulo, e por ela não se descobre quem mais publicou.
create or replace function public.social_meu_post_da_viagem(viagem uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
    from public.posts p
   where p.trip_id = viagem
     and p.author_id = (select auth.uid());
$$;

-- 7.2 Quem pode marcar quem — agora como no Instagram. Verdadeiro se:
--   - a sessão é a autora do post (nunca responde sobre post alheio);
--   - no post de viagem, a autora ainda participa dela — a mesma regra do
--     UPDATE da posts: quem saiu da viagem não mexe mais no post dela;
--   - o marcado é outra pessoa, com username (a marca aponta para /u/...);
--     NÃO precisa ser membro da viagem (decisão de 18/11, noite);
--   - não há recusa aplicável: no post de viagem, a recusa (viagem, autora,
--     pessoa); em qualquer post, a recusa (post, pessoa). Uma comparação com
--     trip_id nulo é falsa, então o post sem viagem só olha a segunda.
-- O que ela revela — se X tem username — qualquer autenticado já vê em
-- profiles; e a recusa, a autora já lê pela social_recusas_do_post.
--
-- SECURITY DEFINER pelo mesmo motivo de antes (20261116234030, seção 3): lê
-- trip_members e post_tag_recusas, que authenticated não lê assim. A
-- checagem da sessão está no corpo (author_id = auth.uid()): sem ela, a
-- função responderia sobre qualquer post.
create or replace function public.social_pode_marcar(post uuid, marcado uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.posts p
      join public.profiles perfil
        on perfil.id = marcado
       and perfil.username is not null
     where p.id = post
       and p.author_id = (select auth.uid())
       and marcado <> p.author_id
       and (
         p.trip_id is null
         or exists (
           select 1
             from public.trip_members eu
            where eu.trip_id = p.trip_id
              and eu.user_id = (select auth.uid())
         )
       )
       and not exists (
         select 1
           from public.post_tag_recusas r
          where r.trip_id = p.trip_id
            and r.author_id = p.author_id
            and r.tagged_id = marcado
       )
       and not exists (
         select 1
           from public.post_tag_recusas r
          where r.post_id = p.id
            and r.tagged_id = marcado
       )
  );
$$;

comment on function public.social_pode_marcar(uuid, uuid) is
  'Verdadeiro se a sessão é autora do post (e, no post de viagem, ainda participa dela) e o marcado é outra pessoa com username, sem recusa aplicável (RF09.13). Nunca responde sobre post de outra pessoa.';

-- 7.3 A recusa nasce da remoção pela própria pessoa. A lógica de QUANDO
-- gravar não muda (20261116234030, seção 6: só a pessoa marcada, nunca o
-- autor, a chave de serviço nem as cascatas). Muda ONDE: por viagem se o post
-- tem viagem, senão por post.
--
-- `on conflict do nothing` sem alvo: há duas unicidades parciais, uma por
-- forma, e a recusa repetida (a marca recolocada pela chave de serviço, ou de
-- outro post do mesmo autor na mesma viagem) deve seguir sem erro em qualquer
-- das duas.
create or replace function public.social_gravar_recusa_de_marcacao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is distinct from old.tagged_id then
    return null;
  end if;

  insert into public.post_tag_recusas (trip_id, post_id, author_id, tagged_id)
  select p.trip_id,
         case when p.trip_id is null then p.id end,
         old.author_id,
         old.tagged_id
    from public.posts p
   where p.id = old.post_id
     and exists (select 1 from public.profiles perfil where perfil.id = old.tagged_id)
     and exists (select 1 from public.profiles autor where autor.id = old.author_id)
  on conflict do nothing;

  return null;
end;
$$;

comment on function public.social_gravar_recusa_de_marcacao() is
  'Trigger de post_tags: quando a própria pessoa marcada remove a marca, grava a recusa — por viagem e autor no post de viagem, por post no post sem viagem (RF09.14). Não grava quando o autor desmarca, sem sessão, nem nas cascatas do post, da viagem e das contas.';

-- Os grants das três acompanham o OID (CREATE OR REPLACE mantém a função):
-- os revokes de 20261116195039 e 20261116234030 continuam valendo.


-- ---------------------------------------------------------------------------
-- 8. Recusas aplicáveis a um post
-- ---------------------------------------------------------------------------
-- A tela de marcar mostra quem recusou, e a rota recusa a remarcação antes de
-- o banco recusar (regra 2 do CLAUDE.md). A autora não lê post_id nem trip_id
-- da post_tag_recusas (a policy é da pessoa que recusou), então consulta por
-- aqui. Devolve exatamente as recusas que social_pode_marcar aplica: as do
-- post e, no post de viagem, as da viagem com esta autora — as duas não podem
-- discordar.
--
-- Só para a autora: para qualquer outra pessoa (e sem sessão) volta vazio. O
-- que ela revela — quem removeu a marca que a própria sessão pôs — a autora
-- já sabia (foi ela quem marcou).
--
-- SECURITY DEFINER porque authenticated não lê a tabela por post nem por
-- viagem; a checagem da sessão está no corpo (p.author_id = auth.uid()).
-- social_recusas_da_viagem continua para a tela de publicar, antes de existir
-- o post.
create or replace function public.social_recusas_do_post(post uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.tagged_id
    from public.posts p
    join public.post_tag_recusas r
      on r.post_id = p.id
   where p.id = post
     and p.author_id = (select auth.uid())
  union
  select r.tagged_id
    from public.posts p
    join public.post_tag_recusas r
      on r.trip_id = p.trip_id
     and r.author_id = p.author_id
   where p.id = post
     and p.author_id = (select auth.uid());
$$;

comment on function public.social_recusas_do_post(uuid) is
  'Ids de quem não pode ser marcado de novo neste post porque removeu a marca (por post ou, no post de viagem, pela viagem e autora) (RF09.13, RF09.14). Vazio para quem não é a autora.';

revoke all on function public.social_recusas_do_post(uuid) from public, anon;
grant execute on function public.social_recusas_do_post(uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 9. Até 20 pessoas marcadas por post
-- ---------------------------------------------------------------------------
-- Com a marcação aberta a qualquer perfil com username (seção 7.2), um autor
-- poderia marcar a plataforma inteira pela Data API e aparecer na aba
-- Marcações de todo mundo. A rota já limita a 20 (o limite do Instagram,
-- decisão do contrato de 18/11); este trigger é a segunda linha (regra 2 do
-- CLAUDE.md) e vale para toda escrita, inclusive a chave de serviço e a
-- conexão direta.
--
-- Por que trigger, e não CHECK nem policy: a regra é sobre as OUTRAS linhas
-- do mesmo post. Um CHECK só vê a linha; a policy de INSERT roda
-- social_pode_marcar, que é STABLE e enxerga o snapshot do começo do
-- comando — num INSERT de 21 linhas de uma vez, todas contariam 0. Já um
-- trigger BEFORE ROW em plpgsql (VOLATILE) vê as linhas que o próprio
-- comando inseriu antes (documentação do Postgres, "Visibility of Data
-- Changes"), então o lote também para na 21ª, e o comando inteiro desfaz.
--
-- Concorrência: em READ COMMITTED, duas transações com 19 marcas cada uma
-- contariam 19 e inseririam, e o post ficaria com 21. A trava serializa as
-- inserções DAQUELE post: quem chega depois espera o commit de quem chegou
-- antes, e a contagem seguinte (outro comando, snapshot novo) já vê a marca
-- dele. Escolha: pg_advisory_xact_lock, e não `select ... for update` na
-- linha do post, porque
--   - não depende de privilégio nem de RLS na posts (FOR UPDATE exige
--     UPDATE em alguma coluna e passa pela policy de UPDATE, que só a autora
--     atende — a chave de serviço e a cascata ficariam de fora ou diferentes);
--   - não segura a linha do post: "Atualizar publicação" e a edição da
--     legenda não esperam por quem está marcando;
--   - é o padrão do projeto (search_history, 20261021191609): chave de 64
--     bits com o nome da tabela como prefixo, para não colidir com outra trava
--     consultiva; uma colisão de hash só serializaria dois posts, sem erro.
-- A trava é de transação: sai no commit ou rollback, sem unlock manual.
-- Limite conhecido: em REPEATABLE READ ou SERIALIZABLE a contagem usaria o
-- snapshot do começo da transação; a Data API roda em READ COMMITTED.
--
-- 23514 (check_violation), com o nome posts_marcados_limite em CONSTRAINT:
-- é o mesmo código dos CHECKs, e a rota o distingue pelo nome.
--
-- SECURITY INVOKER: quem marca pela Data API é a autora, e a policy de SELECT
-- de post_tags já lhe mostra todas as marcas do próprio post (author_id =
-- sessão; a policy de INSERT garante que toda marca do post tem a autora como
-- author_id). A chave de serviço e a conexão direta ignoram a RLS. Não há
-- nada que o dono da função precise ler por ela.
create or replace function public.social_limitar_marcas_do_post()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('post_tags:' || new.post_id::text, 0));

  if (select count(*) from public.post_tags t where t.post_id = new.post_id) >= 20 then
    raise exception 'Um post pode ter no máximo 20 pessoas marcadas.'
      using errcode = 'check_violation',
            constraint = 'posts_marcados_limite';
  end if;

  return new;
end;
$$;

comment on function public.social_limitar_marcas_do_post() is
  'Trigger de post_tags: recusa a 21ª marca de um post (23514, posts_marcados_limite), serializando as inserções do post com uma trava consultiva de transação (RF09.13).';

-- Disparar o trigger não confere EXECUTE.
revoke all on function public.social_limitar_marcas_do_post() from public, anon, authenticated;

create trigger post_tags_limite_por_post
  before insert on public.post_tags
  for each row execute function public.social_limitar_marcas_do_post();


-- ---------------------------------------------------------------------------
-- 10. Bucket
-- ---------------------------------------------------------------------------
-- Continua capas-posts, privado e sem policy em storage.objects
-- (20261116195039, seção 7): agora guarda TODAS as fotos de post, não só a
-- capa da viagem. O nome fica para não mover arquivo nenhum; os limites (2
-- MB, jpeg/png/webp) já servem à foto reprocessada.


-- ---------------------------------------------------------------------------
-- 11. Fila de fotos a remover do Storage
-- ---------------------------------------------------------------------------
-- O problema (achado A2 de 19/11): um post pode sumir sem passar pela rota
-- DELETE /api/social/posts/[postId], que é quem apaga as fotos do bucket:
--   - a dona apaga a viagem, e a cascata de posts.trip_id leva o post de cada
--     membro;
--   - a conta é apagada, e a cascata de posts.author_id (profiles) leva todos
--     os posts dela;
--   - o autor faz um DELETE direto pela Data API (a policy posts_delete
--     permite: o post é dele).
-- Em todos, as fotos de posts.photos ficavam no bucket capas-posts para
-- sempre. E o banco não resolve sozinho: um DELETE em storage.objects pelo
-- SQL apaga a linha de metadados, mas não o arquivo — só a API do Storage
-- apaga os dois.
--
-- Decisão do Micael (19/11): uma fila. O banco anota o caminho de cada foto
-- de todo post que sai, e o servidor esvazia a fila aos poucos com a chave de
-- serviço, pela API do Storage (lib/social/fila-fotos.ts, chamada depois da
-- resposta nas rotas de criar e de excluir post).
--
-- A tabela não tem acesso pela Data API: RLS ligada, a policy que nega tudo
-- escrita por extenso (o mesmo motivo de rate_limits, 20261111230000: o teste
-- estrutural recusa RLS sem policy, que é indistinguível de policy esquecida)
-- e nenhum grant para anon e authenticated. Um caminho na fila é só o nome de
-- um arquivo, mas a fila diria que post de quem foi apagado e quando, e uma
-- escrita nela apagaria a foto de qualquer pessoa. service_role só lê e
-- apaga: quem insere é o trigger abaixo, como dono da função.
--
-- O caminho é a PK: o mesmo arquivo anotado duas vezes (o post apagado pela
-- rota, que já remove as fotos, e o trigger que as anota de novo) é uma linha
-- só, e a remoção de um arquivo que já não existe é inofensiva — o
-- esvaziamento tira da fila também esses.
create table public.fotos_a_remover (
  caminho   text        not null,
  criado_em timestamptz not null default now(),
  constraint fotos_a_remover_pkey primary key (caminho)
);

comment on table public.fotos_a_remover is
  'Caminhos no bucket capas-posts de fotos de posts que saíram do banco, à espera de remoção pela API do Storage (lib/social/fila-fotos.ts). Só o trigger de posts escreve; só a chave de serviço lê e apaga.';

-- O esvaziamento lê os mais antigos primeiro (order by criado_em limit N):
-- sem o índice, uma fila que crescesse com o Storage fora do ar seria
-- ordenada inteira a cada chamada.
create index fotos_a_remover_criado_em_idx on public.fotos_a_remover (criado_em);

alter table public.fotos_a_remover enable row level security;

create policy fotos_a_remover_sem_acesso_direto on public.fotos_a_remover
  for all to anon, authenticated
  using (false)
  with check (false);

revoke all on public.fotos_a_remover from public, anon, authenticated, service_role;
grant select, delete on public.fotos_a_remover to service_role;

-- O trigger: AFTER DELETE em cada linha de posts, por qualquer caminho de
-- exclusão — a rota, a Data API, a conexão direta e as cascatas (as ações de
-- FK em cascata são DELETEs comuns na tabela filha e disparam os triggers
-- dela). AFTER, e não BEFORE: se o DELETE for desfeito (o post não sai), a
-- anotação some com ele, na mesma transação.
--
-- SECURITY DEFINER porque quem apaga o post (a autora pela Data API, a dona
-- da viagem na cascata) não tem INSERT na fila, e não deve ter: a função roda
-- como o dono dela, que é dono da tabela e passa pela RLS. Ela só insere os
-- caminhos de OLD.photos, que o CHECK posts_photos_check já garantiu estarem
-- no formato <autor>/<uuid>.<ext>, na pasta do autor do post: a sessão não
-- escolhe o que vai para a fila.
--
-- Limite conhecido: se o próprio autor gravou, pela Data API, o mesmo caminho
-- em dois posts dele, apagar um põe na fila a foto que o outro ainda mostra.
-- É o mesmo que a rota de excluir já faz (apaga as fotos do post sem
-- perguntar quem mais as cita), e só atinge o conteúdo do próprio autor.
create or replace function public.social_enfileirar_fotos_do_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.fotos_a_remover (caminho)
  select foto
    from unnest(old.photos) as foto
   where foto is not null
  on conflict (caminho) do nothing;

  return null;
end;
$$;

comment on function public.social_enfileirar_fotos_do_post() is
  'Trigger AFTER DELETE de posts: anota em fotos_a_remover cada caminho de old.photos, para o servidor apagar do Storage (A2, 19/11). Vale para a rota, a Data API, a conexão direta e as cascatas.';

-- Disparar o trigger não confere EXECUTE: ninguém chama a função direto.
revoke all on function public.social_enfileirar_fotos_do_post() from public, anon, authenticated, service_role;

create trigger posts_enfileirar_fotos
  after delete on public.posts
  for each row execute function public.social_enfileirar_fotos_do_post();


-- ---------------------------------------------------------------------------
-- 12. As fotos de um post sem viagem não mudam depois de publicado
-- ---------------------------------------------------------------------------
-- O problema (achado A3 de 19/11): o grant de UPDATE (photos) da seção 5 vale
-- para todo post, então pela Data API a autora trocava as fotos de um post
-- sem viagem — o que a tela nunca oferece. O arquivo que saía ficava órfão no
-- bucket (nenhuma rota o apagava), e o caminho novo podia ser o de outro post
-- dela: dois posts apontando para o mesmo arquivo, e apagar um levava a foto
-- do outro (o "limite conhecido" da seção 11).
--
-- Regra do Micael: depois de publicado, só o post de viagem troca de fotos (a
-- rota PUT /api/social/viagens/[tripId]/post/fotos, que apaga do bucket as
-- que saíram). O grant não resolve: é por coluna, não por linha. A policy
-- posts_update também não: o WITH CHECK só vê a linha nova, e não sabe se
-- photos mudou. Um trigger BEFORE UPDATE OF photos vê OLD e NEW.
--
-- `old.trip_id`, e não `new.trip_id`: a sessão não muda trip_id (sem grant),
-- e é a linha como estava que diz se o post era de viagem. O WHEN filtra antes
-- de chamar a função: um UPDATE que reenvia as mesmas fotos (o corpo com
-- caption e photos iguais) passa, e o da legenda nem cita photos. Vale para
-- todo papel, inclusive a chave de serviço e a conexão direta: nenhum fluxo
-- legítimo troca as fotos de um post sem viagem.
--
-- 23514 (check_violation) com o nome da regra em CONSTRAINT, como se fosse
-- um CHECK. Nenhuma rota chega aqui (a única troca de fotos é a do post de
-- viagem); o nome na mensagem deixa o teste distinguir esta recusa da de
-- posts_fotos_ou_viagem, que tem o mesmo código.
--
-- SECURITY INVOKER: a função não lê tabela nenhuma, só recusa.
create or replace function public.posts_fotos_imutaveis()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'posts_fotos_imutaveis: as fotos de um post sem viagem não mudam depois de publicado'
    using errcode = '23514',
          constraint = 'posts_fotos_imutaveis',
          table = 'posts',
          schema = 'public',
          column = 'photos';
end;
$$;

comment on function public.posts_fotos_imutaveis() is
  'Trigger BEFORE UPDATE OF photos de posts: recusa com 23514 a troca das fotos de um post sem viagem (A3, 19/11). Só o post de viagem troca de fotos depois de publicado.';

-- Disparar o trigger não confere EXECUTE: ninguém chama a função direto.
revoke all on function public.posts_fotos_imutaveis() from public, anon, authenticated, service_role;

create trigger posts_fotos_imutaveis
  before update of photos on public.posts
  for each row
  when (old.trip_id is null and new.photos is distinct from old.photos)
  execute function public.posts_fotos_imutaveis();
