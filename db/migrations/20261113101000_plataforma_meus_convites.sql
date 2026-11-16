-- Plataforma: convites pendentes da sessão, com a viagem, numa consulta só
-- (S09-F-performance).
--
-- GET /api/invitations lia os convites e depois fazia UMA consulta por convite
-- para buscar a viagem (N+1). E as N consultas voltavam sempre vazias: quem foi
-- convidado ainda não é membro, e a RLS de trips só libera dono e membro. O
-- cartão do convite mostrava "Viagem em grupo" no lugar do nome — a pessoa
-- aceitava sem saber para onde.
--
-- A função devolve, só para os convites pendentes do e-mail da sessão, quatro
-- colunas da viagem: título, destino e datas. Nada de orçamento, descrição,
-- membros nem itinerário — o mesmo recorte que o convite por e-mail já mostra.
--
-- SECURITY DEFINER para ler trips por cima da RLS, então o filtro pelo e-mail
-- da sessão é o que garante que ninguém vê convite de outra pessoa.
--
-- @RF04.3 aceitar convite · @RNF01.2 uma consulta, independente da quantidade

create or replace function public.meus_convites_pendentes()
returns table (
  id uuid,
  trip_id uuid,
  created_at timestamptz,
  title text,
  destination text,
  start_date date,
  end_date date
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.trip_id, i.created_at, t.title, t.destination, t.start_date, t.end_date
    from public.trip_invitations i
    join public.trips t on t.id = i.trip_id
   where i.status = 'pending'
     and i.invitee_email = (select auth.jwt() ->> 'email')
   order by i.created_at desc;
$$;

comment on function public.meus_convites_pendentes() is
  'Convites pendentes do e-mail da sessão, com título, destino e datas da viagem. Uma consulta (S09-F).';

revoke all on function public.meus_convites_pendentes() from public, anon;
grant execute on function public.meus_convites_pendentes() to authenticated, service_role;
