-- Convidado entra como membro, nunca como dono.
--
-- A policy `trip_members_insert` (20261014230500) exige que a pessoa insira a
-- si mesma e tenha convite pendente para o e-mail da sessão, mas não olhava a
-- coluna `role`. Com um convite pendente, o convidado conseguia gravar a própria
-- linha com `role = 'owner'`, direto pela API do banco, sem passar pela rota de
-- aceite (que sempre grava 'member').
--
-- O estrago ficava na camada da aplicação: `exigirDono()` lê `trip_members.role`
-- e passava a tratar o convidado como dono. As policies de dono no banco usam
-- `trips.user_id` e continuavam recusando, mas as rotas que agem com a chave de
-- serviço depois de `exigirDono()` não têm essa segunda barreira.
--
-- A linha do dono nunca passa por esta policy: quem a grava é o gatilho
-- `add_trip_owner_as_member`, SECURITY DEFINER, na criação da viagem. Logo, toda
-- inserção feita por usuário é de membro, e a policy pode exigir isso.
--
-- ALTER POLICY em vez de DROP + CREATE: troca a expressão sem deixar a tabela um
-- instante sequer sem a policy.
--
-- Reproduzido e travado por tests/rls/06-plataforma-convite.test.ts
-- ("com convite pendente, o Bruno não entra como dono").

alter policy "trip_members_insert" on public.trip_members
  with check (
    user_id = (select auth.uid())
    and role = 'member'
    and exists (
      select 1
      from public.trip_invitations i
      where i.trip_id = trip_members.trip_id
        and i.invitee_email = (select auth.jwt() ->> 'email')
        and i.status = 'pending'
    )
  );

-- Conferência a rodar em produção antes de aplicar: dono registrado em
-- `trip_members` que não é quem criou a viagem. Deve voltar vazio; linha aqui é
-- alguém que explorou a falha.
--
--   select m.trip_id, m.user_id
--   from public.trip_members m
--   join public.trips t on t.id = m.trip_id
--   where m.role = 'owner' and m.user_id <> t.user_id;
