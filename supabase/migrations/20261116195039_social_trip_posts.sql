-- S06-M-publicar-viagem: publicar uma viagem no perfil (RF09.7).
--
-- PROPOSTA do domínio Social (Micael), no mesmo fluxo das S04 e S05: sobe no
-- PR, passa no CI ("Migrations e RLS"), e o merge espera a revisão do Fernando,
-- dono das migrations e das policies. Cria também o bucket da capa, que é
-- decisão da plataforma.
--
-- O que é: cada membro de uma viagem pode publicar a SUA cópia dela — título,
-- destino, datas, capa e os itens do itinerário que escolher. Decisões do
-- Micael em 11/11 (docs/plans/S06-M-publicar-viagem.md):
--   - qualquer membro publica, e cada um tem o próprio post da mesma viagem;
--   - o post é uma cópia: editar a viagem depois não o muda; excluir a viagem
--     o apaga; se o autor sai da viagem, o post continua dele;
--   - do itinerário entram só título, data, horários, categoria, local e
--     descrição; notas, coordenadas e preço nunca;
--   - a visibilidade segue o perfil do autor (pode_ver_rede, S03).
--
-- O post nunca expõe despesas, orçamento, moeda nem os outros membros. A cópia
-- é montada no servidor a partir de lib/trips/publico.ts (domínio de Viagem &
-- Itinerário); esta migration garante o formato, para que nem uma escrita
-- direta pela Data API grave campo fora da lista.
--
-- @RF09.7 @RNF02.4


-- ---------------------------------------------------------------------------
-- 1. Formato do itinerário copiado
-- ---------------------------------------------------------------------------
-- `items` é um array de objetos, um por item do itinerário. Cada objeto tem
-- `title` e, se o autor escolheu mostrá-los, `date`, `start_time`, `end_time`,
-- `category`, `location` e `description`. Qualquer outra chave é recusada:
-- `notes`, `latitude`, `longitude`, `price`, o `id` do item. Quem monta a cópia
-- omite o campo desligado ou vazio, então um campo presente é sempre texto.
--
-- Os limites espelham lib/schemas/itinerario.ts e o CHECK de categoria de
-- itinerary_items (20260910000333_plataforma_schema_base.sql).
--
-- plpgsql, e não SQL: em SQL o Postgres não garante a ordem de avaliação do
-- OR, e jsonb_object_keys quebraria com um item que não é objeto em vez de a
-- função responder falso.
create or replace function public.social_itens_do_post_validos(itens jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  item  jsonb;
  chave text;
begin
  if itens is null or jsonb_typeof(itens) <> 'array' or jsonb_array_length(itens) > 200 then
    return false;
  end if;

  for item in select value from jsonb_array_elements(itens) loop
    if jsonb_typeof(item) <> 'object' then
      return false;
    end if;

    for chave in select jsonb_object_keys(item) loop
      if chave not in ('title', 'date', 'start_time', 'end_time', 'category', 'location', 'description') then
        return false;
      end if;
      if jsonb_typeof(item -> chave) <> 'string' then
        return false;
      end if;
    end loop;

    if not (item ? 'title') or btrim(item ->> 'title') = '' or char_length(item ->> 'title') > 120 then
      return false;
    end if;
    if item ? 'date' and (item ->> 'date') !~ '^\d{4}-\d{2}-\d{2}$' then
      return false;
    end if;
    if item ? 'start_time' and (item ->> 'start_time') !~ '^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$' then
      return false;
    end if;
    if item ? 'end_time' and (item ->> 'end_time') !~ '^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$' then
      return false;
    end if;
    if item ? 'category' and (item ->> 'category') not in
        ('accommodation', 'transport', 'activity', 'restaurant', 'attraction', 'other') then
      return false;
    end if;
    if item ? 'location' and char_length(item ->> 'location') > 200 then
      return false;
    end if;
    if item ? 'description' and char_length(item ->> 'description') > 2000 then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

comment on function public.social_itens_do_post_validos(jsonb) is
  'Verdadeiro se o itinerário copiado para um post tem só as chaves permitidas (RF09.7): nunca notas, coordenadas, preço nem o id do item.';

-- O CHECK roda com o papel de quem escreve, que precisa de EXECUTE. A função
-- não lê tabela nenhuma: responder sobre um jsonb qualquer não revela nada.
revoke all on function public.social_itens_do_post_validos(jsonb) from public, anon;
grant execute on function public.social_itens_do_post_validos(jsonb) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 2. Tabela
-- ---------------------------------------------------------------------------
-- Um post por membro e viagem: publicar de novo é atualizar o mesmo post.
--
-- trip_id em cascata: excluir a viagem apaga os posts dela (decisão do
-- Micael). Não depende de quem exclui: a ação referencial não passa pela RLS.
-- O arquivo da capa fica no bucket, inalcançável (só se assina caminho que
-- está num post) — limite registrado no plano.
--
-- author_id em cascata, como em search_history: o post some com a conta.
create table public.trip_posts (
  id          uuid        not null default gen_random_uuid(),
  trip_id     uuid        not null,
  author_id   uuid        not null,
  title       text        not null,
  destination text        not null,
  start_date  date        not null,
  end_date    date        not null,
  items       jsonb       not null default '[]'::jsonb,
  cover_path  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint trip_posts_pkey primary key (id),
  constraint trip_posts_trip_id_fkey
    foreign key (trip_id) references public.trips (id) on delete cascade,
  constraint trip_posts_author_id_fkey
    foreign key (author_id) references public.profiles (id) on delete cascade,
  constraint trip_posts_um_por_membro unique (trip_id, author_id),
  -- Os limites de lib/schemas/viagem.ts.
  constraint trip_posts_title_check
    check (btrim(title) <> '' and char_length(title) <= 120),
  constraint trip_posts_destination_check
    check (btrim(destination) <> '' and char_length(destination) <= 160),
  constraint trip_posts_datas_check check (end_date >= start_date),
  constraint trip_posts_items_check check (public.social_itens_do_post_validos(items)),
  -- O formato que a rota da capa grava, na pasta do autor: o mesmo de
  -- profiles.avatar_url. A chave de serviço só apaga e assina caminho assim.
  constraint trip_posts_cover_path_check check (
    cover_path is null
    or (
      cover_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|png)$'
      and split_part(cover_path, '/', 1) = author_id::text
    )
  )
);

comment on table public.trip_posts is
  'Cópia pública de uma viagem, publicada por um membro (RF09.7). Nunca guarda despesas, orçamento, moeda, notas nem os membros.';
comment on column public.trip_posts.trip_id is
  'Ilegível para authenticated (grant por coluna): dois posts com o mesmo trip_id revelariam quem viajou junto.';

-- A unique (trip_id, author_id) cobre a FK de trip_id e a busca do autor pelo
-- próprio post (seção 5). Este cobre a FK de author_id e a grade de "Viagens
-- publicadas" no perfil, do mais recente para o mais antigo.
create index trip_posts_autor_recentes_idx on public.trip_posts (author_id, created_at desc);


-- ---------------------------------------------------------------------------
-- 3. updated_at
-- ---------------------------------------------------------------------------
-- Quem escreve updated_at é o banco: a coluna não está no grant de UPDATE.
create or replace function public.trip_posts_tocar_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Disparar o trigger não confere EXECUTE.
revoke all on function public.trip_posts_tocar_updated_at() from public, anon, authenticated;

create trigger trip_posts_tocar_updated_at
  before update on public.trip_posts
  for each row execute function public.trip_posts_tocar_updated_at();


-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
-- Sem FORCE ROW LEVEL SECURITY, como no resto do schema.
alter table public.trip_posts enable row level security;

-- SELECT: a visibilidade segue o perfil do autor — o próprio autor, qualquer
-- autenticado se o perfil é público, seguidor aceito se é privado. anon não tem
-- policy nem grant.
create policy trip_posts_select on public.trip_posts
  for select to authenticated
  using (public.pode_ver_rede(author_id));

-- INSERT: em nome de si mesmo, numa viagem de que participa, e só com
-- username — o post vive na página /u/<username>.
create policy trip_posts_insert on public.trip_posts
  for insert to authenticated
  with check (
    (select auth.uid()) = author_id
    and public.is_trip_member(trip_id, (select auth.uid()))
    and exists (
      select 1 from public.profiles p
       where p.id = (select auth.uid())
         and p.username is not null
    )
  );

-- UPDATE: só o autor, e só enquanto participa da viagem ("Atualizar
-- publicação" copia a viagem de novo). Quais colunas mudam, decide o grant.
create policy trip_posts_update on public.trip_posts
  for update to authenticated
  using ((select auth.uid()) = author_id)
  with check (
    (select auth.uid()) = author_id
    and public.is_trip_member(trip_id, (select auth.uid()))
  );

-- DELETE: só o autor, mesmo depois de sair da viagem — o post é dele.
create policy trip_posts_delete on public.trip_posts
  for delete to authenticated
  using ((select auth.uid()) = author_id);


-- ---------------------------------------------------------------------------
-- 5. O autor acha o próprio post de uma viagem
-- ---------------------------------------------------------------------------
-- Como ninguém lê trip_id, o autor não acharia o próprio post pela viagem. A
-- função responde só sobre a sessão: o post de outra pessoa na mesma viagem
-- volta nulo, e por ela não se descobre quem mais publicou.
create or replace function public.social_meu_post_da_viagem(viagem uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
    from public.trip_posts p
   where p.trip_id = viagem
     and p.author_id = (select auth.uid());
$$;

comment on function public.social_meu_post_da_viagem(uuid) is
  'Id do post da sessão naquela viagem, ou nulo. Nunca responde sobre outra pessoa.';

revoke all on function public.social_meu_post_da_viagem(uuid) from public, anon;
grant execute on function public.social_meu_post_da_viagem(uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 6. Privilégios explícitos
-- ---------------------------------------------------------------------------
-- Mesmo padrão de follows: alcançável pela Data API antes de a RLS decidir as
-- linhas, sem depender de DEFAULT PRIVILEGES. anon fica sem nada.
--
-- SELECT em todas as colunas, menos trip_id (ver o comentário da coluna).
-- Consequência: `select=*` responde 42501; as rotas listam as colunas.
--
-- INSERT sem cover_path: a capa só entra pela rota da capa, depois de conferir
-- os bytes. Sem id e datas: vêm dos defaults.
--
-- UPDATE só no conteúdo. O WITH CHECK não vê a linha antiga: sem o grant de
-- coluna, o autor poderia repontar trip_id para outra viagem de que participa.
revoke all on public.trip_posts from anon, authenticated;
grant select (id, author_id, title, destination, start_date, end_date, items, cover_path, created_at, updated_at)
  on public.trip_posts to authenticated;
grant insert (trip_id, author_id, title, destination, start_date, end_date, items)
  on public.trip_posts to authenticated;
grant update (title, destination, start_date, end_date, items, cover_path)
  on public.trip_posts to authenticated;
grant delete on public.trip_posts to authenticated;
grant all on public.trip_posts to service_role;


-- ---------------------------------------------------------------------------
-- 7. Bucket da capa
-- ---------------------------------------------------------------------------
-- Privado desde o início, como avatars depois do S04-M-foto-privada: a capa só
-- é lida por URL assinada, gerada pelo servidor depois de a rota conferir quem
-- pode ver o post. Os limites ficam também no bucket, atrás da rota.
--
-- Nenhuma policy em storage.objects: sem policy, a RLS nega tudo a
-- authenticated e anon. Enviar, apagar e assinar são só da rota, com a chave
-- de serviço — uma policy de SELECT deixaria o usuário assinar com o próprio
-- JWT e escolher a validade do link.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('capas-posts', 'capas-posts', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
