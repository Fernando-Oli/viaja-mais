-- Transferências de acerto de contas: o pagamento que um participante já fez a
-- outro para reduzir o saldo do grupo.
--
-- Base da S08-Ab-transferencias. Completa RF-06.13 (as transferências sugeridas
-- passam a poder ser registradas como pagas) e atende RNF-02.9 ("os dados de
-- expense_shares e settlements de uma viagem só devem ser visíveis aos seus
-- membros, via RLS").
--
-- Por que uma tabela própria e não `expense_shares.settled_at`: a transferência
-- sugerida por `minimizarTransferencias()` colapsa cadeias de dívida — "Carla
-- paga Ana" pode existir sem que Carla tenha parcela nenhuma numa despesa paga
-- pela Ana. Um pagamento entre duas pessoas não corresponde a uma parcela; ele
-- é um lançamento do acerto, e o saldo passa a ser "partes em aberto ± pagamentos".
--
-- Nomes: o plano norte §T2 esboçou `settlements (trip_id, de, para, valor,
-- status)`. Aqui as colunas seguem a convenção do schema, que é em inglês
-- (`paid_by`, `amount`, `currency`): `from_user_id`, `to_user_id`, `amount`,
-- `currency`. Sem `status`: nesta entrega o registro é de um pagamento já feito,
-- não há fluxo pendente → confirmado.
--
-- O registro é imutável: nenhuma policy nem grant de UPDATE ou DELETE para
-- quem usa a aplicação. Errou o valor? Não há estorno nesta entrega.

-- ---------------------------------------------------------------------------
-- 1. settlements
-- ---------------------------------------------------------------------------

create table if not exists public.settlements (
  id uuid primary key default extensions.uuid_generate_v4(),

  -- Viagem apagada leva o acerto junto, como leva as despesas.
  trip_id uuid not null references public.trips (id) on delete cascade,

  -- `on delete restrict`, igual a `expenses.paid_by`: apagar a conta de quem
  -- pagou ou recebeu mudaria o saldo de todo o grupo sem ninguém ver.
  from_user_id uuid not null references auth.users (id) on delete restrict,
  to_user_id uuid not null references auth.users (id) on delete restrict,

  -- numeric(10,2), igual a expenses.amount e expense_shares.amount.
  amount numeric(10, 2) not null,

  -- O acerto é separado por moeda (saldo em real e em euro não se somam), então
  -- o pagamento diz em qual grupo de saldo ele entra. Sem default: o cliente
  -- tem de dizer, e a rota confere contra os grupos do acerto.
  currency text not null,

  -- Chave que o navegador gera ao abrir o registro de um pagamento. Dois envios
  -- com a mesma chave (clique duplo, nova tentativa depois de queda de rede)
  -- batem no unique abaixo e viram um registro só.
  idempotency_key uuid not null,

  created_at timestamptz not null default timezone('utc', now()),

  constraint settlements_amount_positive check (amount > 0),
  constraint settlements_partes_distintas check (from_user_id <> to_user_id),
  constraint settlements_currency_formato check (currency ~ '^[A-Z]{3}$'),
  constraint settlements_idempotencia_unique unique (from_user_id, idempotency_key)
);

comment on table public.settlements is
  'Pagamentos já feitos entre participantes de uma viagem para acertar o saldo. Imutável: sem UPDATE nem DELETE pela aplicação.';
comment on column public.settlements.from_user_id is 'Quem pagou. Só a própria pessoa registra (RLS).';
comment on column public.settlements.to_user_id is 'Quem recebeu.';
comment on column public.settlements.idempotency_key is
  'Gerada pelo cliente por tentativa de registro; repetir a chave não duplica o pagamento.';

-- Postgres não indexa chave estrangeira sozinho. `trip_id` é o filtro da
-- leitura do acerto e da policy; `to_user_id` é usado no ON DELETE das contas.
-- `from_user_id` já é a primeira coluna do unique de idempotência.
create index if not exists settlements_trip_id_idx on public.settlements (trip_id);
create index if not exists settlements_to_user_id_idx on public.settlements (to_user_id);

-- ---------------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------------

alter table public.settlements enable row level security;

-- Quem participa da viagem enxerga todos os pagamentos dela: o acerto é do
-- grupo, e o saldo de cada um depende do que os outros já pagaram.
-- `can_access_trip` é a mesma pergunta de `expenses_select`, e desde a S06-F
-- só responde sobre quem está na sessão.
create policy settlements_select on public.settlements
  for select to authenticated
  using ((select public.can_access_trip(trip_id, (select auth.uid()))));

-- Só o próprio pagador registra, e só numa viagem da qual participa. Quem
-- recebe não registra em nome de quem paga — senão poderia "quitar" a dívida
-- de alguém sem o dinheiro ter saído do bolso dele.
--
-- O resto da regra (o recebedor participa, o valor não passa da dívida nem do
-- crédito atual, a moeda é a de um grupo do acerto) depende do saldo, que é
-- calculado em `lib/finance/` — fica na rota, que é a primeira linha de defesa.
create policy settlements_insert on public.settlements
  for insert to authenticated
  with check (
    from_user_id = (select auth.uid())
    and (select public.can_access_trip(trip_id, (select auth.uid())))
  );

-- Sem policy de UPDATE e de DELETE: com RLS ligada, a ausência de policy nega.
-- Os grants abaixo negam antes, com erro de permissão em vez de zero linhas.

-- ---------------------------------------------------------------------------
-- 3. Privilégios explícitos
-- ---------------------------------------------------------------------------
-- Mesmo padrão de `follows`: a tabela precisa ser alcançável pela Data API
-- antes de a RLS decidir, e o grant não depende de DEFAULT PRIVILEGES.
--
-- INSERT só nas colunas que o cliente informa: `id` e `created_at` vindos de
-- fora dão 42501 em vez de serem aceitos. Nada de UPDATE nem DELETE.
revoke all on public.settlements from anon, authenticated;
grant select on public.settlements to authenticated;
grant insert (trip_id, from_user_id, to_user_id, amount, currency, idempotency_key)
  on public.settlements to authenticated;
grant all on public.settlements to service_role;
