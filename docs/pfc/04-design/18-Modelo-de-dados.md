# 18. Modelo de Dados — Rateio de Despesas (PLANEJADO — schema ainda não está no repositório)

O diagrama abaixo usa os nomes de tabela e campo já definidos em `docs/plans/00-plano-norte.md` §T2, não uma proposta nova. Ele descreve o que será criado quando a trilha T2 (Micael) rodar as migrations — nada aqui existe hoje no banco, porque a T0 (extração do schema real para `supabase/migrations/`) é pré-requisito e está prevista para a S01, ainda em andamento.

\`\`\`
┌─────────────┐        ┌──────────────────┐        ┌──────────────┐
│  expenses    │  1   * │  expense_shares   │        │  settlements  │
│──────────────│───────►│───────────────────│        │───────────────│
│ id           │        │ expense_id         │        │ trip_id        │
│ trip_id      │        │ user_id            │        │ from_user_id   │
│ paid_by      │        │ valor              │        │ to_user_id     │
│ valor        │        │ quitado            │        │ amount         │
└─────────────┘        └──────────────────┘        │ currency       │
                                                       │ idempotency_key│
                                                       │ created_at     │
                                                       └──────────────┘
\`\`\`

- `expenses.paid_by`: quem pagou a despesa — campo novo na tabela já existente.
- `expense_shares`: uma linha por membro que deve algo naquela despesa; `valor` é o quanto esse membro deve, `quitado` indica se já foi pago.
- `settlements`: registra pagamentos já feitos entre participantes para reduzir o saldo do acerto de contas (S08, migration `20261111100000_financeiro_settlements.sql`). Cada linha diz que `from_user_id` pagou `amount` na moeda `currency` para `to_user_id`. As colunas seguem a convenção em inglês do schema (`paid_by`, `amount`, `currency`) em vez dos nomes provisórios do plano norte (`de`, `para`, `valor`), e não há `status`: o registro representa um pagamento já realizado, sem fluxo de confirmação. O registro é imutável (sem UPDATE nem DELETE pela aplicação). `idempotency_key` impede que o mesmo envio grave duas vezes. O saldo de cada membro passa a ser calculado a partir das parcelas em aberto mais os pagamentos registrados, e as transferências sugeridas por `lib/finance/balances.ts::minimizarTransferencias()` são recalculadas sobre esse saldo.

**RNE-020 — Soma exata do rateio:** a soma das parcelas atribuídas aos participantes é sempre igual ao valor total da despesa, em centavos. Na divisão igual, o resíduo de arredondamento é distribuído um centavo por participante seguindo ordem determinística por identificador. Na divisão por peso, o resíduo é atribuído conforme o maior resto, com empate resolvido pela mesma ordem determinística.

Exemplo: R$ 10,00 entre 3 pessoas resulta em 3,34 + 3,33 + 3,33, e o 3,34 fica com o participante de menor `user_id`, qualquer que seja a ordem em que os participantes foram informados. A ordem é a comparação simples dos identificadores, a mesma no navegador e no servidor; assim, a criação da despesa e a edição do seu valor atribuem o centavo à mesma pessoa (Issue #36). A regra está implementada em `lib/finance/rateio.ts` (`dividirIgual()` e `dividirPorPeso()`), usada tanto na prévia da tela quanto no recálculo do route handler. `lib/finance/balances.ts` não participa do rateio: ele parte das parcelas já gravadas para calcular saldos e transferências.

## Avaliações de Lugares (`place_reviews`)

Tabela criada pela migration `supabase/migrations/20261111120000_viagem_place_reviews.sql` e coberta por `tests/rls/07-avaliacoes.test.ts`. Atende ao grupo RF11.

```
┌──────────────────┐   google_place_id = place_id   ┌──────────────────────┐
│  places           │ *  ─────────────────────────  * │  place_reviews        │
│──────────────────│                                 │──────────────────────│
│ id                │                                 │ id                    │
│ trip_id           │                                 │ google_place_id       │
│ place_id (Google) │                                 │ place_name            │
│ name              │                                 │ user_id → auth.users  │
└──────────────────┘                                 │ rating (1 a 5)        │
                                                      │ comment (até 1000)    │
                                                      │ created_at/updated_at │
                                                      └──────────────────────┘
```

- A avaliação é vinculada ao identificador do lugar no Google, e não ao registro de `places`. Cada viagem guarda a própria cópia do lugar; com o vínculo pelo identificador externo, a avaliação feita por um viajante aparece para qualquer outro que tenha salvo o mesmo lugar (RF11.2).
- `place_name` é uma cópia do nome no momento da avaliação, porque quem lê a avaliação não tem acesso à viagem de quem a escreveu.
- A restrição `unique (google_place_id, user_id)` garante uma avaliação por pessoa por lugar; avaliar novamente altera a nota existente (RF11.3).
- Leitura liberada a qualquer usuário autenticado e negada a anônimos. Inserção permitida somente a quem tem o lugar salvo em uma viagem da qual participa (função `can_access_trip`). Alteração e exclusão restritas ao autor, e a alteração limitada por privilégio de coluna à nota e ao comentário.
