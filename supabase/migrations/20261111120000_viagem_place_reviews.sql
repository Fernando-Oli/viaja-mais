-- Viagem & Itinerário: avaliações de lugares (a `Avaliacao` prevista no PI V).
--
-- S09-A-avaliacoes. Migration e RLS são do Fernando (CLAUDE.md); ele autorizou
-- a Audrey a escrevê-la e a revisa no PR. Exercitada por
-- tests/rls/07-avaliacoes.test.ts.
--
-- A avaliação se prende ao identificador do Google (`places.place_id`), e não
-- a `places.id`: `places` é uma cópia por viagem, e o mesmo lugar salvo em duas
-- viagens são duas linhas. Presa ao `places.id`, a avaliação de um viajante
-- nunca apareceria para outro (RF11.2).
--
-- Leitura aberta a qualquer autenticado, por decisão do catálogo (seção 14,
-- RF11): as avaliações alimentam a descoberta. Escrita fechada por
-- participação: só avalia quem tem o lugar salvo numa viagem de que participa.
-- Sem isso, qualquer conta recém-criada gravaria notas pelo PostgREST, com o
-- JWT que está no navegador.
--
-- @RF11.1 avaliar · @RF11.2 ver avaliações de outros · @RF11.3 editar/excluir a própria
-- @RNF02.4 isolamento

-- 1. Tabela -------------------------------------------------------------------

create table if not exists public.place_reviews (
  id uuid primary key default gen_random_uuid(),
  google_place_id text not null,
  -- Cópia do nome: quem lê a avaliação não tem acesso à viagem de quem avaliou,
  -- e portanto não alcança a linha de `places` dela.
  place_name text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  rating smallint not null,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint place_reviews_rating_faixa check (rating between 1 and 5),
  constraint place_reviews_comment_tamanho check (char_length(comment) <= 1000),
  constraint place_reviews_place_name_tamanho check (char_length(place_name) between 1 and 200),
  constraint place_reviews_google_place_id_tamanho check (char_length(google_place_id) between 1 and 300),
  -- Uma avaliação por pessoa por lugar: avaliar de novo edita (RF11.3), em vez
  -- de empilhar notas da mesma pessoa e distorcer a média. O índice da
  -- constraint começa por google_place_id e serve à listagem de um lugar.
  constraint place_reviews_uma_por_pessoa unique (google_place_id, user_id)
);

comment on table public.place_reviews is
  'Avaliação de um lugar (nota 1–5 e comentário), por identificador do Google. Pública a autenticados; escrita só por quem tem o lugar numa viagem de que participa (RF11).';

-- Policies filtram por user_id, e o FK com cascade apaga por ele.
create index if not exists place_reviews_user_id_idx on public.place_reviews (user_id);

-- A policy de INSERT procura o lugar em `places` pelo identificador do Google.
create index if not exists places_place_id_idx on public.places (place_id);

-- 2. updated_at mantido pelo servidor ----------------------------------------

create or replace function public.viagem_definir_updated_at()
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

comment on function public.viagem_definir_updated_at() is
  'Trigger BEFORE UPDATE: updated_at é sempre o horário do servidor.';

drop trigger if exists place_reviews_definir_updated_at on public.place_reviews;
create trigger place_reviews_definir_updated_at
  before update on public.place_reviews
  for each row execute function public.viagem_definir_updated_at();

-- 3. Grants -------------------------------------------------------------------
--
-- A policy limita QUAL linha; o grant limita QUAIS colunas. Sem o grant por
-- coluna, a pessoa editaria a própria avaliação trocando `google_place_id` —
-- movendo a nota para um lugar que nunca salvou, por fora da policy de INSERT.

revoke all on public.place_reviews from anon;
revoke insert, update on public.place_reviews from authenticated;
grant select, delete on public.place_reviews to authenticated;
grant insert (google_place_id, place_name, user_id, rating, comment)
  on public.place_reviews to authenticated;
grant update (rating, comment) on public.place_reviews to authenticated;

-- 4. Policies -----------------------------------------------------------------

alter table public.place_reviews enable row level security;

drop policy if exists "place_reviews_select" on public.place_reviews;
create policy "place_reviews_select" on public.place_reviews
  for select to authenticated
  using (true);

drop policy if exists "place_reviews_insert" on public.place_reviews;
create policy "place_reviews_insert" on public.place_reviews
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.places p
      where p.place_id = place_reviews.google_place_id
        and public.can_access_trip(p.trip_id, (select auth.uid()))
    )
  );

drop policy if exists "place_reviews_update" on public.place_reviews;
create policy "place_reviews_update" on public.place_reviews
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "place_reviews_delete" on public.place_reviews;
create policy "place_reviews_delete" on public.place_reviews
  for delete to authenticated
  using (user_id = (select auth.uid()));
