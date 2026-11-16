-- Plataforma: índices das tabelas herdadas (S09-F-performance, RNF01.5).
--
-- As tabelas criadas pela equipe (expense_shares, follows, settlements,
-- place_reviews...) têm índice em toda chave estrangeira. As herdadas do dump
-- do projeto original não tinham nenhum: 12 chaves estrangeiras sem índice,
-- entre elas o trip_id de despesas, reservas, lugares e itinerário, lido toda
-- vez que uma viagem é aberta. O Postgres não cria esse índice sozinho.
--
-- Sem ele, cada aba da viagem lê a tabela inteira e ordena em memória — o
-- custo cresce com o total de linhas de TODAS as viagens, não com o tamanho da
-- viagem aberta. tests/rls/15-indices.test.ts prova pelo plano de execução, com
-- volume sintético, que as quatro abas passam a usar o índice.
--
-- Os índices das abas são compostos com a coluna de ordenação da tela, então
-- servem ao filtro e à ordem de uma vez (sem o nó Sort no plano).
--
-- CREATE INDEX sem CONCURRENTLY: a migration roda numa transação, e as tabelas
-- de produção ainda são pequenas — o bloqueio de escrita dura milissegundos.
--
-- @RNF01.5 coluna de filtro frequente com índice, verificável no plano

-- Abas da viagem: filtro por trip_id + a ordem da tela.
create index if not exists itinerary_items_trip_id_date_idx
  on public.itinerary_items (trip_id, date, start_time);
create index if not exists expenses_trip_id_date_idx
  on public.expenses (trip_id, date desc);
create index if not exists bookings_trip_id_start_date_idx
  on public.bookings (trip_id, start_date);
create index if not exists places_trip_id_created_at_idx
  on public.places (trip_id, created_at desc);

-- "Minhas viagens" filtra trip_members por user_id. O índice único
-- (trip_id, user_id) começa por trip_id e não serve a esse filtro.
create index if not exists trip_members_user_id_idx on public.trip_members (user_id);

-- Policy de dono (trips_select_owner, trips_update_owner: user_id = auth.uid()).
create index if not exists trips_user_id_idx on public.trips (user_id);

-- Convites: a lista de pendentes e a policy filtram por invitee_email; o
-- aceite e a policy de trip_members procuram por (trip_id, invitee_email).
create index if not exists trip_invitations_invitee_email_idx on public.trip_invitations (invitee_email);
create index if not exists trip_invitations_trip_id_idx on public.trip_invitations (trip_id, invitee_email);
create index if not exists trip_invitations_inviter_id_idx on public.trip_invitations (inviter_id);
create index if not exists trip_invitations_invitee_id_idx on public.trip_invitations (invitee_id);

-- Autor: policies de alteração (user_id = auth.uid()) e a cascata ao excluir
-- uma conta, que percorre estas colunas.
create index if not exists expenses_user_id_idx on public.expenses (user_id);
create index if not exists bookings_user_id_idx on public.bookings (user_id);
create index if not exists places_user_id_idx on public.places (user_id);
