-- S06-M-publicar-viagem: marcar membros da viagem num post (RF09.13), a aba
-- "Marcações" no perfil de quem foi marcado (RF09.14) e a recusa de quem
-- removeu a própria marca.
--
-- PROPOSTA do domínio Social (Micael), no mesmo fluxo da trip_posts
-- (20261116195039): sobe no PR #51, passa no CI ("Migrations e RLS"), e o
-- merge espera a revisão do Fernando, dono das migrations e das policies.
-- Arquivo separado de propósito: a trip_posts já tem o aval dele e não muda.
--
-- Decisões do Micael em 16/11 (docs/plans/S06-M-publicar-viagem.md):
--   - quem publica pode marcar SÓ membros da mesma viagem, com username;
--   - a pessoa marcada remove a própria marca, como no Instagram, pela aba
--     "Marcações" do perfil dela;
--   - ser marcado NÃO dá acesso ao post: se o autor é privado e a pessoa
--     marcada não o segue com vínculo aceito, ela vê só quem a marcou e pode
--     remover a marca (comportamento do Instagram). Por isso a trip_posts e a
--     policy de leitura dela ficam intactas, e a marca guarda o autor.
--
-- Decisões do Micael em 18/11 (revisão de segurança da S06):
--   - quem removeu a própria marca NÃO pode ser marcado de novo por aquele
--     autor naquela VIAGEM: a remoção grava uma recusa (post_tag_recusas), e
--     social_pode_marcar passa a recusar a remarcação. Vale para a viagem, e
--     não só para o post, para o autor não contornar o bloqueio despublicando
--     e publicando de novo. Quando é o autor quem desmarca, não há recusa: ele
--     pode marcar a pessoa de novo;
--   - "igual ao Instagram": a marca é visível a quem vê o post, mesmo que a
--     pessoa marcada seja privada. A policy de leitura das marcas não muda; a
--     aba Marcações de um perfil privado só fecha na rota (ver seção 4).
--
-- @RF09.13 @RF09.14 @RNF02.4

-- ---------------------------------------------------------------------------
-- 1. Tabela das marcas
-- ---------------------------------------------------------------------------
-- Uma marca por pessoa por post. author_id repete o autor do post para que a
-- pessoa marcada saiba quem a marcou sem ler o post (que ela pode não
-- enxergar); a policy de INSERT garante que ele é mesmo o autor, e o autor de
-- um post não muda (sem grant de UPDATE em trip_posts.author_id).
--
-- Cascatas: apagar o post (ou a viagem, que apaga o post) apaga as marcas;
-- apagar a conta do marcado ou do autor também. A marca continua se o marcado
-- sai da viagem, como o próprio post (decisão de 11/11): é ele quem a remove.
create table public.post_tags (
  post_id    uuid        not null,
  tagged_id  uuid        not null,
  author_id  uuid        not null,
  created_at timestamptz not null default now(),
  constraint post_tags_pkey primary key (post_id, tagged_id),
  constraint post_tags_post_id_fkey
    foreign key (post_id) references public.trip_posts (id) on delete cascade,
  constraint post_tags_tagged_id_fkey
    foreign key (tagged_id) references public.profiles (id) on delete cascade,
  constraint post_tags_author_id_fkey
    foreign key (author_id) references public.profiles (id) on delete cascade,
  constraint post_tags_nao_marca_a_si check (tagged_id <> author_id)
);

comment on table public.post_tags is
  'Membros da viagem marcados num post (RF09.13). Ser marcado não dá acesso ao post: a leitura dele segue a trip_posts.';

-- A chave primária cobre a FK de post_id e a lista de marcados de um post.
-- Este cobre a FK de tagged_id e a aba Marcações, do mais recente ao mais antigo.
create index post_tags_marcado_recentes_idx on public.post_tags (tagged_id, created_at desc);
-- Cobre a FK de author_id (cascata ao apagar a conta do autor).
create index post_tags_author_id_idx on public.post_tags (author_id);

-- ---------------------------------------------------------------------------
-- 2. Recusas: quem removeu a própria marca, por viagem e autor
-- ---------------------------------------------------------------------------
-- Uma linha por (viagem, autor, pessoa): a pessoa removeu a marca que aquele
-- autor pôs nela num post daquela viagem (decisão de 18/11). Sem ela, o autor
-- a marcaria de novo no "Atualizar publicação", e a remoção pela aba Marcações
-- não valeria nada.
--
-- Por VIAGEM, e não por post: um post_id morreria com a despublicação (on
-- delete cascade), e o post publicado de novo nasceria sem recusas — o autor
-- contornaria o bloqueio despublicando e publicando. Por isso não há post_id:
-- a recusa sobrevive ao post. E por AUTOR: a recusa é da marca que aquele
-- autor pôs; outro membro da mesma viagem, no post dele, ainda pode marcá-la.
--
-- Só o trigger da seção 6 escreve aqui. Não há como desfazer a recusa pela
-- Data API: authenticated não tem INSERT, UPDATE nem DELETE.
--
-- Cascatas: apagar a viagem leva as recusas dela; apagar a conta da pessoa ou
-- a do autor leva as recusas delas. Despublicar (apagar o post) NÃO leva.
--
-- trip_id é ilegível para authenticated (grant por coluna, seção 7), como na
-- trip_posts: duas recusas com o mesmo trip_id revelariam quem viajou junto.
-- O autor consulta as recusas da viagem pela função da seção 3.
create table public.post_tag_recusas (
  trip_id    uuid        not null,
  author_id  uuid        not null,
  tagged_id  uuid        not null,
  created_at timestamptz not null default now(),
  constraint post_tag_recusas_pkey primary key (trip_id, author_id, tagged_id),
  constraint post_tag_recusas_trip_id_fkey
    foreign key (trip_id) references public.trips (id) on delete cascade,
  constraint post_tag_recusas_author_id_fkey
    foreign key (author_id) references public.profiles (id) on delete cascade,
  constraint post_tag_recusas_tagged_id_fkey
    foreign key (tagged_id) references public.profiles (id) on delete cascade
);

comment on table public.post_tag_recusas is
  'Quem removeu a marca que um autor pôs nela, numa viagem: aquele autor não a marca de novo em post nenhum daquela viagem (RF09.14). Só o trigger de post_tags escreve.';
comment on column public.post_tag_recusas.trip_id is
  'Ilegível para authenticated (grant por coluna): como em trip_posts, revelaria quem viajou junto.';

-- A chave primária (trip_id, author_id, tagged_id) cobre a FK de trip_id (a
-- cascata ao apagar a viagem), a lista de recusas do autor numa viagem
-- (social_recusas_da_viagem, pelo prefixo trip_id, author_id) e a busca exata
-- de social_pode_marcar.
-- Os outros dois cobrem as FKs de author_id e tagged_id: sem eles, apagar uma
-- conta varreria a tabela inteira na cascata. O de tagged_id atende também a
-- pessoa que lista as próprias recusas (a policy da seção 5).
create index post_tag_recusas_author_id_idx on public.post_tag_recusas (author_id);
create index post_tag_recusas_tagged_id_idx on public.post_tag_recusas (tagged_id);

-- ---------------------------------------------------------------------------
-- 3. Quem pode marcar quem
-- ---------------------------------------------------------------------------
-- O banco precisa conferir que o marcado é membro da viagem do post, mas as
-- is_trip_* respondem só sobre quem pergunta (20261014230500, B1). Esta
-- função responde só dentro do post DA SESSÃO, e só enquanto a sessão
-- participa da viagem dele: verdadeiro se a sessão é a autora do post, é
-- membro da viagem, e o marcado é outro membro da mesma viagem, com username,
-- que não recusou uma marca desta autora nesta viagem (seção 2).
-- O que ela revela (se X está na viagem) a sessão já vê na lista de membros;
-- e a recusa, a autora já lê pela social_recusas_da_viagem, logo abaixo.
--
-- SECURITY DEFINER pelo mesmo motivo de social_membros_marcaveis
-- (20261118092400): a resposta não fica à mercê de como a plataforma ajusta a
-- RLS de trip_members e profiles, que são de outro domínio. Hoje essa RLS até
-- deixaria (can_access_trip mostra ao membro os colegas de viagem), então a
-- função não abre nada além do que a autora já vê; as duas funções que dizem
-- "quem é marcável" leem os mesmos dados do mesmo jeito, e não podem
-- discordar. A checagem da sessão está no corpo — o join com `eu` e o
-- author_id —: sem ela, a função responderia sobre qualquer viagem.
--
-- Vem depois das duas tabelas: o corpo em SQL é validado na criação e lê a
-- post_tag_recusas.
create or replace function public.social_pode_marcar(post uuid, marcado uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.trip_posts p
      join public.trip_members eu
        on eu.trip_id = p.trip_id
       and eu.user_id = (select auth.uid())
      join public.trip_members ele
        on ele.trip_id = p.trip_id
       and ele.user_id = marcado
      join public.profiles perfil
        on perfil.id = marcado
       and perfil.username is not null
     where p.id = post
       and p.author_id = (select auth.uid())
       and marcado <> (select auth.uid())
       and not exists (
         select 1
           from public.post_tag_recusas r
          where r.trip_id = p.trip_id
            and r.author_id = p.author_id
            and r.tagged_id = marcado
       )
  );
$$;

comment on function public.social_pode_marcar(uuid, uuid) is
  'Verdadeiro se a sessão é autora do post, participa da viagem dele e o marcado é outro membro da viagem, com username, que não removeu uma marca desta autora nesta viagem (RF09.13). Nunca responde sobre post de outra pessoa.';

revoke all on function public.social_pode_marcar(uuid, uuid) from public, anon;
grant execute on function public.social_pode_marcar(uuid, uuid) to authenticated, service_role;

-- Quem recusou as marcas da SESSÃO numa viagem. A tela de publicar precisa
-- saber disso antes mesmo do primeiro POST — é o caso de quem despublicou e
-- vai publicar de novo, quando ainda não há post —, e a policy da seção 5 não
-- deixa o autor ler a tabela: o trip_id é ilegível para ele (seção 2), e a
-- linha é da pessoa que recusou.
--
-- Responde só sobre as recusas em que a sessão é a autora: para qualquer
-- outra pessoa (e sem sessão) volta vazio. O que ela revela — quem removeu a
-- marca que a própria sessão pôs — o autor já sabia (foi ele quem marcou).
--
-- SECURITY DEFINER porque authenticated não lê a tabela por trip_id; a
-- checagem da sessão está no corpo (author_id = auth.uid()): sem ela, a
-- função abriria as recusas de qualquer pessoa em qualquer viagem.
create or replace function public.social_recusas_da_viagem(viagem uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.tagged_id
    from public.post_tag_recusas r
   where r.trip_id = viagem
     and r.author_id = (select auth.uid());
$$;

comment on function public.social_recusas_da_viagem(uuid) is
  'Ids de quem removeu, nesta viagem, uma marca posta pela sessão: a sessão não pode marcá-los de novo (RF09.13, RF09.14). Vazio para quem não é o autor.';

revoke all on function public.social_recusas_da_viagem(uuid) from public, anon;
grant execute on function public.social_recusas_da_viagem(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. RLS das marcas
-- ---------------------------------------------------------------------------
alter table public.post_tags enable row level security;

-- SELECT: a própria pessoa marcada (a aba Marcações dela, mesmo sem enxergar o
-- post), o autor, e quem enxerga o post — o exists roda com a RLS da
-- trip_posts, então "enxerga o post" é exatamente pode_ver_rede(autor).
--
-- Igual ao Instagram (decisão de 18/11): a marca é visível a quem vê o post,
-- MESMO QUE A PESSOA MARCADA SEJA PRIVADA. A privacidade dela não esconde a
-- marca num post que é do autor. Consequência aceita: pela Data API, um
-- autenticado lista as marcas de uma pessoa privada (tagged_id=eq.X) em todos
-- os posts que ele enxerga — a lista agregada por pessoa. A aba Marcações de
-- um perfil privado, aberta só a seguidores, é regra da ROTA
-- (app/api/social/perfis/[username]/marcacoes), e esta policy NÃO é segunda
-- linha para ela.
create policy post_tags_select on public.post_tags
  for select to authenticated
  using (
    (select auth.uid()) = tagged_id
    or (select auth.uid()) = author_id
    or exists (select 1 from public.trip_posts p where p.id = post_id)
  );

-- INSERT: só o autor do post, enquanto participa da viagem, marcando outro
-- membro com username que não recusou uma marca dele nesta viagem.
create policy post_tags_insert on public.post_tags
  for insert to authenticated
  with check (
    (select auth.uid()) = author_id
    and public.social_pode_marcar(post_id, tagged_id)
  );

-- DELETE: a pessoa marcada remove a própria marca (e grava a recusa, seção 6);
-- o autor desmarca quem quiser (sem recusa).
create policy post_tags_delete on public.post_tags
  for delete to authenticated
  using (
    (select auth.uid()) = tagged_id
    or (select auth.uid()) = author_id
  );

-- Sem UPDATE: trocar a marca é apagar e marcar de novo.

-- ---------------------------------------------------------------------------
-- 5. RLS das recusas
-- ---------------------------------------------------------------------------
alter table public.post_tag_recusas enable row level security;

-- SELECT: só a própria pessoa (as recusas dela), nas colunas do grant — sem o
-- trip_id. O autor NÃO lê a tabela: consulta pela social_recusas_da_viagem
-- (seção 3), que responde por viagem sem expor o trip_id. Um terceiro, mesmo
-- vendo o post, não vê quem recusou: a recusa diz algo sobre a relação entre
-- as duas pessoas.
create policy post_tag_recusas_select on public.post_tag_recusas
  for select to authenticated
  using ((select auth.uid()) = tagged_id);

-- Sem INSERT, UPDATE nem DELETE para authenticated: quem escreve é o trigger
-- da seção 6, como dono da função. Uma recusa forjada pela Data API impediria
-- a marca sem a pessoa ter removido nada; uma recusa apagada a desfaria.

-- ---------------------------------------------------------------------------
-- 6. A recusa nasce da remoção pela própria pessoa
-- ---------------------------------------------------------------------------
-- AFTER DELETE em post_tags, por linha. Grava (viagem do post, autor da marca,
-- pessoa) só quando quem apaga é a pessoa marcada (auth.uid() = old.tagged_id).
-- Nessa hora o post ainda existe — só a marca saiu —, e é dele que vem o
-- trip_id. Casos:
--   - o autor desmarcando: auth.uid() é o autor, não grava — ele pode marcar
--     de novo;
--   - a chave de serviço, a conexão direta, o job sem sessão: auth.uid() é
--     nulo, não grava (por isso o `is distinct from`, e não `<>`);
--   - as cascatas: a pessoa marcada, dona da viagem, apaga a viagem (que leva o
--     post, que leva a marca); a conta dela, ou a do autor, é apagada. A sessão
--     pode ser a própria pessoa, mas o post, a viagem ou um dos perfis já não
--     existem. Gravar ali violaria uma FK da recusa e a cascata inteira
--     FALHARIA — a viagem ou a conta não seriam apagadas. O join com o post e
--     os exists dos dois perfis evitam isso: dentro da cascata, a linha
--     apagada já não é visível ao trigger. (Se o post existe, a viagem dele
--     também: trip_posts.trip_id é FK com cascata.) O exists do perfil do
--     AUTOR é redundante hoje: ao apagar a conta do autor, a cascata de
--     trip_posts.author_id (FK mais antiga, dispara antes) já levou o post, e
--     o join com o post não acha nada — a mutação que o remove passa nos
--     testes por isso. Fica como defesa: se essa FK for recriada e passar a
--     disparar depois da de post_tags.author_id, é ele que impede a cascata
--     de falhar;
--   - a pessoa remove uma marca que alguém recolocou por fora (a chave de
--     serviço não passa pela policy de INSERT), ou a marca de outro post do
--     mesmo autor na mesma viagem: a recusa já existe, e o
--     `on conflict do nothing` deixa a remoção seguir sem erro.
--
-- SECURITY DEFINER porque authenticated não escreve na post_tag_recusas
-- (seção 5); o search_path vazio obriga cada nome a vir com o schema.
-- Função de trigger não é chamável pela Data API, e o EXECUTE fica revogado
-- mesmo assim.
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

  insert into public.post_tag_recusas (trip_id, author_id, tagged_id)
  select p.trip_id, old.author_id, old.tagged_id
    from public.trip_posts p
   where p.id = old.post_id
     and exists (select 1 from public.profiles perfil where perfil.id = old.tagged_id)
     and exists (select 1 from public.profiles autor where autor.id = old.author_id)
  on conflict (trip_id, author_id, tagged_id) do nothing;

  return null;
end;
$$;

comment on function public.social_gravar_recusa_de_marcacao() is
  'Trigger de post_tags: quando a própria pessoa marcada remove a marca, grava a recusa por viagem e autor (RF09.14). Não grava quando o autor desmarca, sem sessão, nem nas cascatas do post, da viagem e das contas.';

revoke all on function public.social_gravar_recusa_de_marcacao() from public, anon, authenticated;

create trigger post_tags_grava_recusa
  after delete on public.post_tags
  for each row execute function public.social_gravar_recusa_de_marcacao();

-- ---------------------------------------------------------------------------
-- 7. Privilégios explícitos
-- ---------------------------------------------------------------------------
revoke all on public.post_tags from anon, authenticated;
grant select (post_id, tagged_id, author_id, created_at) on public.post_tags to authenticated;
grant insert (post_id, tagged_id, author_id) on public.post_tags to authenticated;
grant delete on public.post_tags to authenticated;
grant all on public.post_tags to service_role;

-- Recusas: authenticated só lê, e sem o trip_id; anon, nada. O default do
-- Supabase daria tudo aos dois na criação da tabela, por isso o revoke vem
-- primeiro.
revoke all on public.post_tag_recusas from anon, authenticated;
grant select (author_id, tagged_id, created_at) on public.post_tag_recusas to authenticated;
grant all on public.post_tag_recusas to service_role;
