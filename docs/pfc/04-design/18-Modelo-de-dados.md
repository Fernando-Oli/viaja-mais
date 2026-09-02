# 18. Modelo de Dados — Rateio de Despesas (PLANEJADO — schema ainda não está no repositório)

O diagrama abaixo usa os nomes de tabela e campo já definidos em `docs/plans/00-plano-norte.md` §T2, não uma proposta nova. Ele descreve o que será criado quando a trilha T2 (Micael) rodar as migrations — nada aqui existe hoje no banco, porque a T0 (extração do schema real para `supabase/migrations/`) é pré-requisito e está prevista para a S01, ainda em andamento.

\`\`\`
┌─────────────┐        ┌──────────────────┐        ┌──────────────┐
│  expenses    │  1   * │  expense_shares   │        │  settlements  │
│──────────────│───────►│───────────────────│        │───────────────│
│ id           │        │ expense_id         │        │ trip_id       │
│ trip_id      │        │ user_id            │        │ de            │
│ paid_by      │        │ valor              │        │ para          │
│ valor        │        │ quitado            │        │ valor         │
└─────────────┘        └──────────────────┘        │ status        │
                                                       └──────────────┘
\`\`\`

- `expenses.paid_by`: quem pagou a despesa — campo novo na tabela já existente.
- `expense_shares`: uma linha por membro que deve algo naquela despesa; `valor` é o quanto esse membro deve, `quitado` indica se já foi pago.
- `settlements`: registra transferências entre membros para zerar o saldo (o acerto de contas), calculadas por `lib/finance/balances.ts::minimizarTransferencias()`.

Regra de arredondamento: quando a divisão igual não fecha em centavos exatos — por exemplo, R$ 10,00 entre 3 pessoas resulta em 3,33 + 3,33 + 3,34 —, o resíduo é atribuído a quem pagou a despesa, para que a soma de `expense_shares.valor` sempre bata com `expenses.valor`. Essa regra ainda não está implementada em `lib/finance/balances.ts` (o arquivo, pelo plano, nem existe no repositório ainda); fica registrada aqui como decisão de design a ser seguida quando `calcularSaldos()` for escrito.