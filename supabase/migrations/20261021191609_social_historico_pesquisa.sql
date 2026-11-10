-- S05-M-pesquisa: o histórico de pesquisa da aba Rede social (RF09.12).
--
-- PROPOSTA do domínio Social (Micael), no mesmo fluxo da S04: sobe no PR, passa
-- no CI ("Migrations e RLS"), e o merge espera a revisão do Fernando, dono das
-- migrations e das policies. Inclui habilitar o pg_cron, que é decisão da
-- plataforma (seção 4).
--
-- O que é: os perfis que cada pessoa abriu a partir da pesquisa, do mais recente
-- para o mais antigo, como os "Recentes" do Instagram. Decisões do Micael em
-- 21/10:
--   - só perfis abertos, não termos digitados;
--   - na conta (no banco), para acompanhar a pessoa em qualquer aparelho e
--     sumir junto com a conta;
--   - no máximo 15 entradas, apagadas aos 30 dias.
--
-- É dado sensível: revela quem a pessoa olhou. Só o dono lê e apaga, e a
-- pessoa pesquisada nunca vê nada.
--
-- @RF09.12 @RNF02.4


-- ---------------------------------------------------------------------------
-- 1. Tabela
-- ---------------------------------------------------------------------------
-- A chave é o par: cada pessoa aparece uma vez só no histórico de alguém.
-- Reabrir é apagar a entrada antiga e gravar de novo (a rota faz isso), para a
-- data vir sempre do banco e nunca do cliente.
--
-- As duas colunas apontam para profiles, com apagar em cascata: a entrada some
-- quando o dono apaga a conta, e também quando a pessoa aberta apaga a dela.
create table public.search_history (
  user_id     uuid        not null,
  profile_id  uuid        not null,
  searched_at timestamptz not null default now(),
  constraint search_history_pkey primary key (user_id, profile_id),
  constraint search_history_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete cascade,
  constraint search_history_profile_id_fkey
    foreign key (profile_id) references public.profiles (id) on delete cascade,
  constraint search_history_sem_si_mesmo check (user_id <> profile_id)
);

comment on table public.search_history is
  'Perfis que cada usuário abriu pela pesquisa: no máximo 15, apagados aos 30 dias. Só o dono lê (RF09.12).';

-- A PK cobre o que a aplicação pede: o histórico de um dono (user_id) e a FK
-- de user_id. A FK de profile_id precisa do próprio índice: sem ele, apagar uma
-- conta varre a tabela inteira para achar as entradas em que ela foi aberta.
create index search_history_profile_idx on public.search_history (profile_id);


-- ---------------------------------------------------------------------------
-- 2. Poda: 15 entradas e 30 dias, a cada registro
-- ---------------------------------------------------------------------------
-- Depois de cada registro, o mesmo dono fica só com as 15 entradas mais
-- recentes entre as que têm menos de 30 dias; o resto sai. Uma condição só
-- cobre as duas regras: o vencido nunca está entre as 15 que ficam.
--
-- SECURITY INVOKER: roda com os privilégios de quem registra, e a RLS (seção 3)
-- o deixa apagar só o próprio histórico. NEW.user_id é sempre o de quem está na
-- sessão, pela policy de INSERT.
--
-- O lock por dono (transacional, solto no fim da transação) faz dois registros
-- ao mesmo tempo da mesma pessoa podarem um depois do outro. Sem ele, cada
-- trigger enxergava só o próprio registro e os já confirmados, e o teto de 15
-- estourava. Em READ COMMITTED, o DELETE depois do lock já enxerga o registro
-- que a outra transação confirmou.
create or replace function public.search_history_podar()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('search_history:' || new.user_id::text, 0));

  delete from public.search_history h
   where h.user_id = new.user_id
     and h.profile_id not in (
       select s.profile_id
         from public.search_history s
        where s.user_id = new.user_id
          and s.searched_at > now() - interval '30 days'
        order by s.searched_at desc, s.profile_id
        limit 15
     );
  return null;
end;
$$;

comment on function public.search_history_podar() is
  'Depois de cada registro no histórico de pesquisa, mantém só as 15 entradas mais recentes, e com menos de 30 dias, do mesmo dono.';

-- Ninguém da Data API a executa direto (os default privileges da base dão
-- EXECUTE a anon nominalmente). O trigger dispara mesmo assim: disparar não
-- confere EXECUTE.
revoke all on function public.search_history_podar() from public, anon, authenticated;

create trigger search_history_podar
  after insert on public.search_history
  for each row execute function public.search_history_podar();


-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------
-- Sem FORCE ROW LEVEL SECURITY, como no resto do schema: o dono da tabela é
-- `postgres`, e a Data API fala como `authenticated`/`anon`, a quem a RLS
-- sempre se aplica.
alter table public.search_history enable row level security;

-- SELECT: só o próprio histórico. O vencido continua visível ao próprio dono
-- até sair (no próximo registro ou no job diário), de propósito: DELETE com
-- WHERE também passa pela policy de SELECT, e escondê-lo aqui impedia o dono
-- de apagá-lo (o "Limpar tudo" o deixava no banco, e reabrir a mesma pessoa não
-- registrava nada). Quem tira o vencido da tela é a leitura da rota
-- (lib/social/pesquisas.ts).
create policy search_history_select on public.search_history
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- INSERT: só em nome de si mesmo. A data vem do default (seção 4).
create policy search_history_insert on public.search_history
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- DELETE: o X de uma entrada e o "Limpar tudo", só no próprio histórico.
create policy search_history_delete on public.search_history
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Não há UPDATE: reabrir é apagar e gravar de novo.


-- ---------------------------------------------------------------------------
-- 4. Privilégios explícitos
-- ---------------------------------------------------------------------------
-- Mesmo padrão de follows: a tabela precisa ser alcançável pela Data API antes
-- de a RLS decidir quais linhas aparecem, e o grant não pode depender de
-- DEFAULT PRIVILEGES. anon fica sem nada.
--
-- INSERT só em user_id e profile_id: searched_at vindo do cliente dá 42501, e a
-- ordem do histórico não pode ser forjada. Sem UPDATE.
revoke all on public.search_history from anon, authenticated;
grant select, delete on public.search_history to authenticated;
grant insert (user_id, profile_id) on public.search_history to authenticated;
grant all on public.search_history to service_role;


-- ---------------------------------------------------------------------------
-- 5. Limpeza diária (pg_cron): apagar aos 30 dias também de quem não volta
-- ---------------------------------------------------------------------------
-- A poda da seção 2 só roda quando a pessoa registra algo. Para o vencido de
-- quem não volta ao app sair do banco, e não só da tela, um job diário apaga o
-- que tem mais de 30 dias, de todo mundo.
--
-- Decisão da plataforma (Fernando): habilitar o pg_cron, como a documentação
-- da Supabase indica (extensão em pg_catalog, jobs no schema cron). Sem ele, a
-- poda e o filtro da leitura continuam valendo, e o vencido de quem não volta
-- fica no banco até o próximo registro dessa pessoa.
--
-- Sem grants manuais no schema cron, de propósito: o event trigger da própria
-- Supabase (issue_pg_cron_access) os dá a postgres a cada CREATE EXTENSION,
-- mesmo quando o IF NOT EXISTS pula a criação. Repetir aqui o "grant all ...
-- to postgres" da documentação grava postgres=r/postgres (postgres concedendo a
-- si mesmo), e o REVOKE do event trigger passa a falhar com "dependent
-- privileges exist" no próximo CREATE EXTENSION pg_cron, de qualquer migration.
--
-- O job roda como o dono (postgres), que é o dono da tabela e não passa pela
-- RLS. cron.schedule é um upsert pelo nome: aplicar de novo não duplica. O
-- cron.job_run_details não se limpa sozinho; um job diário gera ~365 linhas
-- por ano.
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'social-apagar-pesquisas-vencidas',
  '15 3 * * *',
  $$delete from public.search_history where searched_at <= now() - interval '30 days'$$
);
