-- S06-M-publicar-viagem: marcar membros da viagem num post (RF09.13) e a
-- aba "Marcações" no perfil de quem foi marcado (RF09.14).
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
-- @RF09.13 @RF09.14 @RNF02.4

-- ---------------------------------------------------------------------------
-- 1. Quem pode marcar quem
-- ---------------------------------------------------------------------------
-- O banco precisa conferir que o marcado é membro da viagem do post, mas as
-- is_trip_* respondem só sobre quem pergunta (20261014230500, B1). Esta
-- função responde só dentro do post DA SESSÃO, e só enquanto a sessão
-- participa da viagem dele: verdadeiro se a sessão é a autora do post, é
-- membro da viagem, e o marcado é outro membro da mesma viagem, com username.
-- O que ela revela (se X está na viagem) a sessão já vê na lista de membros.
--
-- SECURITY DEFINER porque lê trip_members de outra pessoa, o que a RLS da
-- plataforma não deixa a sessão fazer; a checagem da sessão está no corpo.
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
  );
$$;

comment on function public.social_pode_marcar(uuid, uuid) is
  'Verdadeiro se a sessão é autora do post, participa da viagem dele e o marcado é outro membro da viagem, com username (RF09.13). Nunca responde sobre post de outra pessoa.';

revoke all on function public.social_pode_marcar(uuid, uuid) from public, anon;
grant execute on function public.social_pode_marcar(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Tabela
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
-- 3. RLS
-- ---------------------------------------------------------------------------
alter table public.post_tags enable row level security;

-- SELECT: a própria pessoa marcada (a aba Marcações dela, mesmo sem enxergar o
-- post), o autor, e quem enxerga o post — o exists roda com a RLS da
-- trip_posts, então "enxerga o post" é exatamente pode_ver_rede(autor).
create policy post_tags_select on public.post_tags
  for select to authenticated
  using (
    (select auth.uid()) = tagged_id
    or (select auth.uid()) = author_id
    or exists (select 1 from public.trip_posts p where p.id = post_id)
  );

-- INSERT: só o autor do post, enquanto participa da viagem, marcando outro
-- membro com username.
create policy post_tags_insert on public.post_tags
  for insert to authenticated
  with check (
    (select auth.uid()) = author_id
    and public.social_pode_marcar(post_id, tagged_id)
  );

-- DELETE: a pessoa marcada remove a própria marca; o autor desmarca quem quiser.
create policy post_tags_delete on public.post_tags
  for delete to authenticated
  using (
    (select auth.uid()) = tagged_id
    or (select auth.uid()) = author_id
  );

-- Sem UPDATE: trocar a marca é apagar e marcar de novo.

-- ---------------------------------------------------------------------------
-- 4. Privilégios explícitos
-- ---------------------------------------------------------------------------
revoke all on public.post_tags from anon, authenticated;
grant select (post_id, tagged_id, author_id, created_at) on public.post_tags to authenticated;
grant insert (post_id, tagged_id, author_id) on public.post_tags to authenticated;
grant delete on public.post_tags to authenticated;
grant all on public.post_tags to service_role;
