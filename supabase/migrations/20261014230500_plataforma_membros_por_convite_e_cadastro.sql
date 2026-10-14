-- Plataforma: entrar em viagem só por convite, RPC que só responde sobre quem
-- pergunta, e cadastro que não falha por nome longo.
--
-- Pré-requisitos que a S03-M (docs/plans/S03-M-migration-social.md, bloco 1)
-- deixou para a plataforma. Os dois primeiros estavam cobertos só porque
-- ninguém descobria o UUID de outro usuário; a leitura de `profiles` que a
-- migration social abre os torna exploráveis. Reprodução em
-- docs/pfc/evidencias/S03-M-achado-plataforma.txt. Plano:
-- docs/plans/S06-F-fecha-membros-e-cadastro.md.
--
-- @RNF02.4 RLS por operação · @RF04.3 entrar na viagem é aceitar o convite
-- @RF01.1 cadastro com e-mail e senha

-- 1. Ninguém entra numa viagem sem aceitar ------------------------------------
--
-- O ramo `is_trip_owner` deixava a dona inserir qualquer pessoa, sem convite: a
-- viagem aparecia para a vítima, que passava a poder receber partes de rateio.
-- O app não usa esse ramo — o dono entra pelo trigger `add_trip_owner_as_member`
-- (SECURITY DEFINER, não passa por esta policy) e o único insert de membro é o
-- de aceitar convite, feito pelo próprio convidado.

drop policy if exists "trip_members_insert" on public.trip_members;

create policy "trip_members_insert" on public.trip_members
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.trip_invitations i
      where i.trip_id = trip_members.trip_id
        and i.invitee_email = (select auth.jwt() ->> 'email')
        and i.status = 'pending'
    )
  );

-- 2. As funções de participação só respondem sobre quem pergunta -------------
--
-- São SECURITY DEFINER e recebem o usuário por parâmetro, com EXECUTE para
-- anon e authenticated: qualquer um perguntava por RPC se um UUID participa de
-- uma viagem. Revogar EXECUTE de anon não serve: várias policies da base valem
-- para todos os papéis e chamam `can_access_trip`, e a consulta anônima passaria
-- de "volta vazio" para "erro de permissão".
--
-- Toda policy chama estas funções com `auth.uid()`, então a checagem nova não
-- muda nenhum resultado de RLS — só a resposta sobre terceiros, que vira false.
-- O cabeçalho fica igual (mesmo nome e parâmetros), e com ele os grants e as
-- policies que dependem das funções.
--
-- Risco residual: com o mesmo cabeçalho, quem chama ainda pode perguntar sobre
-- si mesmo em qualquer viagem — o que já sabe pelo próprio painel.

create or replace function public.is_trip_member(trip_uuid uuid, user_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select user_uuid = (select auth.uid())
    and exists (
      select 1 from public.trip_members
      where trip_id = trip_uuid
        and user_id = user_uuid
    );
$$;

create or replace function public.is_trip_owner(trip_uuid uuid, user_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select user_uuid = (select auth.uid())
    and exists (
      select 1 from public.trips
      where id = trip_uuid
        and user_id = user_uuid
    );
$$;

create or replace function public.can_access_trip(trip_uuid uuid, user_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_trip_owner(trip_uuid, user_uuid)
    or public.is_trip_member(trip_uuid, user_uuid);
$$;

-- 3. Cadastro com nome longo não pode falhar ----------------------------------
--
-- O trigger roda dentro do INSERT em auth.users: se o perfil não grava, o
-- cadastro inteiro volta e a pessoa vê só "Database error saving new user". A
-- migration social limita `full_name` a 120; cortar aqui faz o cadastro nunca
-- depender do tamanho do nome. A tela também limita, para a pessoa ver o teto.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
