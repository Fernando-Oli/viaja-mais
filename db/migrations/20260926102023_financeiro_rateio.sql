-- Rateio de despesas: quem pagou e quanto cada um deve.
--
-- Base da trilha T2 (divisão de custos). Atende RF-06.8 a RF-06.10 e RF-06.12 do
-- catálogo, e RNF-08.1 — "a soma das partes deve sempre igualar o valor total da
-- despesa", que aqui não é comentário: é uma constraint trigger.
--
-- `settlements` (as transferências de acerto) não entra nesta migration. Ela só
-- é consumida a partir de S07-Ab-acerto-contas, e juntar as duas faria um PR
-- grande demais para revisar com atenção — que é justamente onde erro de policy
-- passa batido.

-- ---------------------------------------------------------------------------
-- 1. expenses: quem pagou, e como a despesa foi dividida
-- ---------------------------------------------------------------------------

-- Até aqui `user_id` acumulava dois papéis: quem registrou a despesa e quem
-- pagou por ela. São coisas diferentes — o tesoureiro do grupo lança a conta do
-- hotel que outra pessoa pagou. `paid_by` separa os dois.
alter table public.expenses
  add column if not exists paid_by uuid references auth.users (id) on delete restrict;

-- Backfill: para o que já existe, quem registrou é quem pagou. É a única
-- suposição possível, e vale para todas as linhas anteriores ao rateio.
update public.expenses set paid_by = user_id where paid_by is null;

-- Quem não informa `paid_by` mantém o comportamento de sempre: quem registrou
-- pagou. Sem isto, a coluna NOT NULL quebraria toda rota e toda tela que já
-- inserem despesa — e o valor certo não é `auth.uid()`, que é nulo quando a
-- inserção vem do seed ou da chave de serviço.
create or replace function public.preencher_paid_by()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.paid_by := coalesce(new.paid_by, new.user_id);
  return new;
end;
$$;

comment on function public.preencher_paid_by() is
  'Compatibilidade: antes de paid_by existir, quem registrava a despesa era quem pagava.';

drop trigger if exists expenses_preenche_paid_by on public.expenses;

create trigger expenses_preenche_paid_by
  before insert on public.expenses
  for each row execute function public.preencher_paid_by();

alter table public.expenses alter column paid_by set not null;

-- `on delete restrict` de propósito: apagar a conta de quem pagou a despesa
-- destruiria o histórico financeiro do grupo. Quem sai da viagem sai de
-- `trip_members`; a despesa que pagou continua de pé.

alter table public.expenses
  add column if not exists split_type text not null default 'equal';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'expenses_split_type_check'
      and conrelid = 'public.expenses'::regclass
  ) then
    alter table public.expenses
      add constraint expenses_split_type_check
      check (split_type in ('equal', 'weight', 'exact'));
  end if;
end $$;

comment on column public.expenses.paid_by is
  'Quem desembolsou. Diferente de user_id, que é quem registrou a despesa.';
comment on column public.expenses.split_type is
  'Como as partes em expense_shares foram calculadas: equal | weight | exact.';

create index if not exists expenses_paid_by_idx on public.expenses (paid_by);

-- ---------------------------------------------------------------------------
-- 2. expense_shares: a parte de cada membro
-- ---------------------------------------------------------------------------

create table if not exists public.expense_shares (
  id uuid primary key default extensions.uuid_generate_v4(),
  expense_id uuid not null references public.expenses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,

  -- numeric(10,2), igual a expenses.amount. Dinheiro em float dá 0.1+0.2=0.30000000000000004,
  -- e aqui a soma das partes precisa bater com o total no centavo.
  amount numeric(10, 2) not null,

  -- Peso usado quando split_type = 'weight' (duas pessoas num quarto = peso 2).
  -- Nulo nos outros modos: o peso não significa nada neles.
  weight numeric(6, 2),

  -- Quitação é um instante, não um booleano: "quando" responde "se", e ainda
  -- diz desde quando. Nulo = em aberto.
  settled_at timestamptz,

  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),

  -- Uma parte por pessoa por despesa. Sem isto, dois inserts concorrentes
  -- duplicam a dívida de alguém e a soma passa a não fechar.
  constraint expense_shares_expense_user_unique unique (expense_id, user_id),

  -- Parte negativa não existe: quem recebe é `paid_by`, não uma parte negativa.
  constraint expense_shares_amount_nonneg check (amount >= 0),
  constraint expense_shares_weight_positive check (weight is null or weight > 0)
);

comment on table public.expense_shares is
  'Quanto cada membro deve de uma despesa. A soma das partes é igual ao valor da despesa (validado por trigger).';

-- Postgres não indexa chave estrangeira sozinho, e as duas são usadas em JOIN e
-- em ON DELETE CASCADE.
create index if not exists expense_shares_expense_id_idx on public.expense_shares (expense_id);
create index if not exists expense_shares_user_id_idx on public.expense_shares (user_id);

-- "O que eu ainda devo" é a consulta da tela de acerto. Índice parcial: só as
-- partes em aberto entram, que é uma fração da tabela e a que se consulta sempre.
create index if not exists expense_shares_abertas_idx
  on public.expense_shares (user_id)
  where settled_at is null;

-- ---------------------------------------------------------------------------
-- 3. A soma das partes tem de fechar com o valor da despesa
-- ---------------------------------------------------------------------------

create or replace function public.validar_soma_das_partes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  id_despesa uuid := coalesce(new.expense_id, old.expense_id);
  total_despesa numeric(10, 2);
  soma_partes numeric(10, 2);
begin
  select amount into total_despesa from public.expenses where id = id_despesa;

  -- A despesa inteira foi apagada: o cascade levou as partes junto, não há o
  -- que validar.
  if total_despesa is null then
    return null;
  end if;

  select coalesce(sum(amount), 0) into soma_partes
    from public.expense_shares where expense_id = id_despesa;

  -- Nenhuma parte é estado legítimo: despesa lançada e ainda não rateada.
  if soma_partes = 0 and not exists (
    select 1 from public.expense_shares where expense_id = id_despesa
  ) then
    return null;
  end if;

  if soma_partes <> total_despesa then
    raise exception
      'a soma das partes (%) não fecha com o valor da despesa (%)', soma_partes, total_despesa
      using errcode = 'check_violation';
  end if;

  return null;
end;
$$;

comment on function public.validar_soma_das_partes() is
  'RNF-08.1. É constraint trigger DEFERRABLE: a checagem roda no commit, para que inserir as partes uma a uma não falhe no meio.';

drop trigger if exists expense_shares_soma_fecha on public.expense_shares;

-- DEFERRABLE INITIALLY DEFERRED é o ponto todo: sem isso, inserir a primeira de
-- três partes já estouraria, porque a soma parcial não fecha. Adiada para o
-- commit, a transação inteira é avaliada de uma vez.
create constraint trigger expense_shares_soma_fecha
  after insert or update or delete on public.expense_shares
  deferrable initially deferred
  for each row execute function public.validar_soma_das_partes();

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------

alter table public.expense_shares enable row level security;

-- Quem enxerga a despesa enxerga o rateio dela. A pergunta é sempre sobre
-- participação na viagem, nunca sobre propriedade da linha: a dívida de outra
-- pessoa faz parte do acerto do grupo e precisa ser visível para todos.
--
-- Recebe só o id da despesa e resolve o usuário internamente, com auth.uid().
-- As funções antigas (is_trip_member, can_access_trip) aceitam o user_uuid por
-- parâmetro, o que permite perguntar sobre terceiros; esta não permite.
create or replace function public.pode_acessar_despesa(expense_uuid uuid)
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
     where e.id = expense_uuid
       and m.user_id = (select auth.uid())
  );
$$;

comment on function public.pode_acessar_despesa(uuid) is
  'Verdadeiro se o usuário da sessão participa da viagem à qual a despesa pertence.';

revoke all on function public.pode_acessar_despesa(uuid) from public;
grant execute on function public.pode_acessar_despesa(uuid) to authenticated, service_role;

create policy expense_shares_select on public.expense_shares
  for select to authenticated
  using ((select public.pode_acessar_despesa(expense_id)));

create policy expense_shares_insert on public.expense_shares
  for insert to authenticated
  with check ((select public.pode_acessar_despesa(expense_id)));

-- USING e WITH CHECK, os dois. Só com USING, um membro poderia mover a parte
-- para uma despesa de outra viagem — a linha sairia do alcance da própria
-- policy que a protege.
create policy expense_shares_update on public.expense_shares
  for update to authenticated
  using ((select public.pode_acessar_despesa(expense_id)))
  with check ((select public.pode_acessar_despesa(expense_id)));

create policy expense_shares_delete on public.expense_shares
  for delete to authenticated
  using ((select public.pode_acessar_despesa(expense_id)));

-- A tabela precisa ser alcançável pela Data API antes de a RLS decidir quais
-- linhas aparecem. Sem os grants, o PostgREST devolve permission denied para
-- todo mundo, RLS correta ou não.
grant select, insert, update, delete on public.expense_shares to authenticated;
grant all on public.expense_shares to service_role;
