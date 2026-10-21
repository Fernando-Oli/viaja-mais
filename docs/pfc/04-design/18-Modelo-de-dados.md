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

**RNE-020 — Soma exata do rateio:** a soma das parcelas atribuídas aos participantes é sempre igual ao valor total da despesa, em centavos. Na divisão igual, o resíduo de arredondamento é distribuído um centavo por participante seguindo ordem determinística por identificador. Na divisão por peso, o resíduo é atribuído conforme o maior resto, com empate resolvido pela mesma ordem determinística.

Exemplo: R$ 10,00 entre 3 pessoas resulta em 3,34 + 3,33 + 3,33, e o 3,34 fica com o participante de menor `user_id`, qualquer que seja a ordem em que os participantes foram informados. A ordem é a comparação simples dos identificadores, a mesma no navegador e no servidor; assim, a criação da despesa e a edição do seu valor atribuem o centavo à mesma pessoa (Issue #36). A regra está implementada em `lib/finance/rateio.ts` (`dividirIgual()` e `dividirPorPeso()`), usada tanto na prévia da tela quanto no recálculo do route handler. `lib/finance/balances.ts` não participa do rateio: ele parte das parcelas já gravadas para calcular saldos e transferências.