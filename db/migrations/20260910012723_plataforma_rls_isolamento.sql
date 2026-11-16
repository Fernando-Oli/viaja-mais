-- Fecha dois buracos de isolamento entre contas, ambos provados por
-- tests/rls/01-isolamento.test.ts antes desta migration existir.
--
-- Os três clientes Supabase da aplicação usam a chave anon, então a RLS é a
-- fronteira real de autorização: o que a policy não bloquear, qualquer usuário
-- autenticado alcança.
--
-- Nota de performance, seguindo o guia da Supabase: `auth.uid()` e `auth.jwt()`
-- vão envolvidos em `(select ...)` para serem avaliados uma vez por consulta em
-- vez de uma vez por linha.


-- 1. Leitura de viagem alheia -----------------------------------------------
--
-- A policy abaixo usava `USING (true)`: qualquer usuário autenticado lia toda
-- viagem de todo mundo. O acesso legítimo continua coberto pelas policies que
-- expressam a regra de verdade e já existem na migration base:
--   trips_select_owner  -> user_id = auth.uid()
--   trips_select_member -> is_trip_member(id, auth.uid())

drop policy if exists "Allow authenticated users to read trips" on public.trips;


-- 2. Entrar sozinho em viagem alheia ----------------------------------------
--
-- `trip_members_insert` aceitava `user_id = auth.uid()` como condição
-- suficiente, então bastava inserir a própria linha para virar participante de
-- qualquer viagem. E participante passa em `can_access_trip`, o que dava
-- leitura *e escrita* em despesas, reservas, itinerário e lugares alheios.
--
-- A regra correta tem dois caminhos legítimos, e só eles:
--   - o dono adiciona quem quiser;
--   - a pessoa convidada se adiciona, e só enquanto houver convite pendente
--     para o e-mail dela naquela viagem (é o que o fluxo de aceitar convite faz).

drop policy if exists "trip_members_insert" on public.trip_members;

create policy "trip_members_insert" on public.trip_members
  for insert to authenticated
  with check (
    public.is_trip_owner(trip_id, (select auth.uid()))
    or (
      user_id = (select auth.uid())
      and exists (
        select 1
        from public.trip_invitations i
        where i.trip_id = trip_members.trip_id
          and i.invitee_email = (select auth.jwt() ->> 'email')
          and i.status = 'pending'
      )
    )
  );


-- 3. Auto-promoção a dono ----------------------------------------------------
--
-- `trip_members_update` também aceitava `user_id = auth.uid()`, o que permitia
-- a um membro legítimo editar a própria linha e trocar o papel para `owner`.
-- Gerir papel é do dono. Sair da viagem continua possível: é DELETE, não
-- UPDATE, e a policy de DELETE segue permitindo remover a própria linha.

drop policy if exists "trip_members_update" on public.trip_members;

create policy "trip_members_update" on public.trip_members
  for update to authenticated
  using (public.is_trip_owner(trip_id, (select auth.uid())));
