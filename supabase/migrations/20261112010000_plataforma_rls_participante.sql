-- Plataforma: o que um participante consegue fazer além do devido (issue #37,
-- S08-F-revisao-rls-social).
--
-- A suíte provava o isolamento de quem está de fora; tests/rls/13-participante
-- prova o de quem está dentro. Ele confirmou, contra o banco, quatro falhas
-- herdadas da migration base e uma do rateio:
--
--   H1  membro trocava trips.user_id para si e virava dono da viagem;
--   H2  qualquer conta convidava o próprio e-mail para uma viagem sua, trocava
--       o trip_id do convite para a viagem de outra pessoa e entrava nela;
--   H3  membro alterava e apagava a despesa de outro membro, e trocava o autor
--       ou a viagem de despesa, reserva e lugar;
--   H4  a dona trocava o user_id de uma linha de membro (alguém entrava sem
--       convite) ou promovia um membro a dono;
--   H5  participante mexia nas partes do rateio de despesa alheia — marcar a
--       própria parte como paga a tirava do acerto de contas.
--
-- Duas causas:
--
--   1. Cada tabela herdada do dump do projeto original tinha duas famílias de
--      policy: as nossas, estritas, e as do dump, frouxas, com nomes em inglês.
--      Policies permissivas somam por OU — a frouxa vencia. Saem as do dump.
--   2. Os grants deixavam `authenticated` alterar qualquer coluna, inclusive
--      user_id, trip_id e o trip_id do convite. Ficam só as colunas que as rotas
--      de fato alteram.
--
-- A regra que o banco passa a cobrar é a mesma das rotas (app/api/**):
--   - viagem: só o dono edita (exigirDono), e ninguém troca o dono;
--   - convite: o convidado só muda o status (accept/decline);
--   - membro: a linha não é editada (entra pelo convite, sai pelo DELETE);
--   - despesa e partes: o autor ou o dono da viagem (expenses/[expenseId]);
--   - reserva, lugar, itinerário: qualquer membro (exigirMembro), sem trocar
--     autor nem viagem.
--
-- @RNF02.4 isolamento por RLS · @RF04.3 entrar só por convite

-- ---------------------------------------------------------------------------
-- 1. Policies do dump: saem todas
-- ---------------------------------------------------------------------------
-- Lista explícita, e não um laço sobre pg_policies: quem revisa vê exatamente
-- o que sai. tests/rls/13-participante confere que nenhuma com nome do dump
-- sobrou nessas tabelas.

drop policy if exists "Trip owners can delete their trips" on public.trips;
drop policy if exists "Users can insert their own trips" on public.trips;
drop policy if exists "users can insert their own trips" on public.trips;
drop policy if exists "Users can view their own trips or trips they are members of" on public.trips;
drop policy if exists "Users can view trips where they are members" on public.trips;
drop policy if exists "Trip owners and members can update trips" on public.trips;
drop policy if exists "Trip owners can update their trips" on public.trips;

drop policy if exists "Users can delete trip expenses" on public.expenses;
drop policy if exists "Users can create trip expenses" on public.expenses;
drop policy if exists "Users can view trip expenses" on public.expenses;
drop policy if exists "Users can update trip expenses" on public.expenses;

drop policy if exists "Users can delete trip bookings" on public.bookings;
drop policy if exists "Users can create trip bookings" on public.bookings;
drop policy if exists "Users can view trip bookings" on public.bookings;
drop policy if exists "Users can update trip bookings" on public.bookings;

drop policy if exists "Users can delete trip places" on public.places;
drop policy if exists "Users can create trip places" on public.places;
drop policy if exists "Users can view trip places" on public.places;
drop policy if exists "Users can update trip places" on public.places;

drop policy if exists "Trip owners and members can delete itinerary items" on public.itinerary_items;
drop policy if exists "Users can delete itinerary items" on public.itinerary_items;
drop policy if exists "Trip owners and members can create itinerary items" on public.itinerary_items;
drop policy if exists "Users can create itinerary items" on public.itinerary_items;
drop policy if exists "Users can view itinerary items" on public.itinerary_items;
drop policy if exists "Trip owners and members can update itinerary items" on public.itinerary_items;
drop policy if exists "Users can update itinerary items" on public.itinerary_items;

-- ---------------------------------------------------------------------------
-- 2. As nossas, onde a regra da rota é mais larga que a policy estrita
-- ---------------------------------------------------------------------------
-- Sem as do dump, a policy estrita passa a ser a única — e em três tabelas ela
-- era mais estreita que a regra da aplicação, que só funcionava por causa da
-- frouxa.

-- Despesa: o autor ou o dono da viagem (a rota deixa a dona corrigir a despesa
-- de um membro). WITH CHECK igual ao USING, por extenso.
drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses
  for update to authenticated
  using (user_id = (select auth.uid()) or (select public.is_trip_owner(trip_id, (select auth.uid()))))
  with check (user_id = (select auth.uid()) or (select public.is_trip_owner(trip_id, (select auth.uid()))));

drop policy if exists expenses_delete on public.expenses;
create policy expenses_delete on public.expenses
  for delete to authenticated
  using (user_id = (select auth.uid()) or (select public.is_trip_owner(trip_id, (select auth.uid()))));

-- Reserva e lugar: qualquer membro edita e exclui (são do grupo). O autor não
-- muda: o grant do bloco 3 não inclui user_id nem trip_id.
drop policy if exists bookings_update on public.bookings;
create policy bookings_update on public.bookings
  for update to authenticated
  using ((select public.can_access_trip(trip_id, (select auth.uid()))))
  with check ((select public.can_access_trip(trip_id, (select auth.uid()))));

drop policy if exists bookings_delete on public.bookings;
create policy bookings_delete on public.bookings
  for delete to authenticated
  using ((select public.can_access_trip(trip_id, (select auth.uid()))));

drop policy if exists places_update on public.places;
create policy places_update on public.places
  for update to authenticated
  using ((select public.can_access_trip(trip_id, (select auth.uid()))))
  with check ((select public.can_access_trip(trip_id, (select auth.uid()))));

drop policy if exists places_delete on public.places;
create policy places_delete on public.places
  for delete to authenticated
  using ((select public.can_access_trip(trip_id, (select auth.uid()))));

-- Membro: nenhuma rota edita a linha. Com a policy de UPDATE da dona, ela
-- trocava o user_id (pondo na viagem quem nunca foi convidado) ou o role.
drop policy if exists trip_members_update on public.trip_members;

-- ---------------------------------------------------------------------------
-- 3. Grants por coluna: só o que as rotas alteram
-- ---------------------------------------------------------------------------
-- A policy decide QUAL linha; o grant decide QUAIS colunas. Coluna fora da
-- lista dá 42501 antes da policy — inclusive para quem é dono.

revoke update on public.trips from authenticated;
grant update (title, destination, start_date, end_date, description, budget, currency, status, cover_image, updated_at)
  on public.trips to authenticated;

-- O convidado aceita ou recusa: só o status. O trip_id e o invitee_email não
-- mudam nunca — eram a porta de H2.
revoke update on public.trip_invitations from authenticated;
grant update (status, updated_at) on public.trip_invitations to authenticated;

revoke update on public.trip_members from authenticated;

-- Despesa: o que app/api/trips/[tripId]/expenses/[expenseId] altera. paid_by e
-- split_type ficam de fora: nenhuma rota os edita, e trocar quem pagou muda o
-- saldo de todo o grupo.
revoke update on public.expenses from authenticated;
grant update (title, amount, currency, category, date, payment_method, notes, updated_at)
  on public.expenses to authenticated;

revoke update on public.bookings from authenticated;
grant update (type, title, provider, confirmation_number, start_date, end_date, location, price, currency, status, notes, updated_at)
  on public.bookings to authenticated;

revoke update on public.places from authenticated;
grant update (name, address, category, latitude, longitude, notes, place_id, rating, visited)
  on public.places to authenticated;

revoke update on public.itinerary_items from authenticated;
grant update (title, description, date, start_time, end_time, location, latitude, longitude, category, status, notes, updated_at)
  on public.itinerary_items to authenticated;

-- expense_shares mantém UPDATE em expense_id e user_id: o upsert do PostgREST
-- (ON CONFLICT DO UPDATE SET <todas as colunas enviadas>) precisa deles, e é
-- assim que a rota regrava as partes ao editar o valor. A proteção fica na
-- policy do bloco 4.

-- ---------------------------------------------------------------------------
-- 4. Partes do rateio: só o autor da despesa ou o dono da viagem escrevem
-- ---------------------------------------------------------------------------
-- Ler continua aberto a todo membro (pode_acessar_despesa): o acerto é do
-- grupo. Escrever, não: marcar a própria parte como paga a tirava do acerto
-- (lib/finance/acerto.ts pula settled_at), e mover valor entre partes passava
-- dívida para outra pessoa.

create or replace function public.pode_editar_despesa(expense_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.expenses e
     where e.id = expense_uuid
       and (
         e.user_id = (select auth.uid())
         or exists (
           -- Dono é trips.user_id, a mesma fonte de is_trip_owner().
           select 1 from public.trips t
            where t.id = e.trip_id and t.user_id = (select auth.uid())
         )
       )
  );
$$;

comment on function public.pode_editar_despesa(uuid) is
  'A sessão é autora da despesa ou dona da viagem dela: quem pode escrever as partes do rateio (issue #37, H5).';

-- A pessoa de uma parte tem de ser membro da viagem da despesa: sem isto, o
-- autor punha dívida em quem nem está na viagem.
create or replace function public.parte_de_membro(expense_uuid uuid, user_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.expenses e
      join public.trip_members m on m.trip_id = e.trip_id
     where e.id = expense_uuid and m.user_id = user_uuid
  );
$$;

comment on function public.parte_de_membro(uuid, uuid) is
  'A pessoa da parte participa da viagem da despesa (issue #37, H5).';

revoke all on function public.pode_editar_despesa(uuid) from public, anon;
revoke all on function public.parte_de_membro(uuid, uuid) from public, anon;
grant execute on function public.pode_editar_despesa(uuid) to authenticated, service_role;
grant execute on function public.parte_de_membro(uuid, uuid) to authenticated, service_role;

drop policy if exists expense_shares_insert on public.expense_shares;
create policy expense_shares_insert on public.expense_shares
  for insert to authenticated
  with check (
    (select public.pode_editar_despesa(expense_id))
    and (select public.parte_de_membro(expense_id, user_id))
  );

drop policy if exists expense_shares_update on public.expense_shares;
create policy expense_shares_update on public.expense_shares
  for update to authenticated
  using ((select public.pode_editar_despesa(expense_id)))
  with check (
    (select public.pode_editar_despesa(expense_id))
    and (select public.parte_de_membro(expense_id, user_id))
  );

drop policy if exists expense_shares_delete on public.expense_shares;
create policy expense_shares_delete on public.expense_shares
  for delete to authenticated
  using ((select public.pode_editar_despesa(expense_id)));

-- ---------------------------------------------------------------------------
-- 5. Transferência: quem recebe também participa da viagem
-- ---------------------------------------------------------------------------
-- Ficava só na rota (revisão do #48). Agora o banco também recusa.

drop policy if exists settlements_insert on public.settlements;
create policy settlements_insert on public.settlements
  for insert to authenticated
  with check (
    from_user_id = (select auth.uid())
    and (select public.can_access_trip(trip_id, (select auth.uid())))
    -- Subconsulta direta, e não is_trip_member(): desde a S06-F ela só
    -- responde sobre a própria sessão. Quem registra é membro e enxerga os
    -- membros da viagem pela policy de trip_members.
    and exists (
      select 1 from public.trip_members m
       where m.trip_id = settlements.trip_id and m.user_id = settlements.to_user_id
    )
  );
