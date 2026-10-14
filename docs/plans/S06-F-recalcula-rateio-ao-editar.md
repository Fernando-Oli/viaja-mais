---
id: S06-F-recalcula-rateio-ao-editar
titulo: Editar o valor de uma despesa rateada recalcula as partes
trilha: T1
responsavel: fernando
revisor: abner
semana: S06
requisitos: [RF06.2, RNF08.1]
secoes_doc: []
branch: fix/S06-F-recalcula-rateio-ao-editar
tipo: [route-handler, correcao-de-bug]
depende_de: []
status: em-revisao
---

## 1. Contexto

A tela de nova despesa (S06-Ab-rateio-ui) sempre grava o rateio, e o PATCH de despesa
passou a recusar com 409 qualquer mudança de valor quando há partes — a trigger
`expense_shares_soma_fecha` só dispara nas partes, não em `expenses.amount`. Resultado:
nenhuma despesa criada pela tela pode ter o valor corrigido. O E2E `editar-despesa`
fica parado em "Salvar alterações".

## 2. Arquivos afetados

- `app/api/trips/[tripId]/expenses/[expenseId]/route.ts` — PATCH recalcula as partes
- `tests/api/expense-item-route.test.ts` — casos novos
- `e2e/editar-despesa.spec.ts` — `?aba=despesas` e seletor do valor restrito à lista

## 3. Passos

1. Com valor novo e partes existentes: ler as partes; recalcular com `calcularRateio`
   sobre os mesmos participantes (e pesos, no rateio por peso) **antes** de qualquer escrita.
2. Gravar a despesa e, num único `upsert` (uma transação, a trigger confere a soma no
   commit), as partes. Se o `upsert` falhar, devolver o valor antigo da despesa.
3. Rateio por valor exato ou com alguma parte quitada: 409, sem escrever nada.

## 4. O que testar

- [ ] Integração: 200 recalcula partes iguais (R$ 100 → 150 entre 3: 50/50/50) e por peso
- [ ] 200 com centavo que não divide (R$ 100,01 entre 3) — a soma fecha
- [ ] 409 no valor exato e com parte quitada, sem nenhum `update`/`upsert`
- [ ] 400 quando o `upsert` falha, e o valor antigo é regravado
- [ ] Os 4 caminhos (200/401/403/400) que já existiam continuam verdes
- [ ] E2E `editar-despesa` verde: cria, muda o valor para 120, vê R$ 120,00 na lista

## 5. O que validar

- [ ] Depois de mudar o valor de uma despesa rateada igualmente, a soma das partes em
      `expense_shares` é igual ao novo `expenses.amount`
- [ ] Os participantes e os pesos não mudam; só os valores
- [ ] Rateio por valor exato responde 409 com mensagem que diz o que fazer
- [ ] Parte já quitada nunca muda de valor pela edição da despesa
- [ ] Editar título/categoria/data sem mudar o valor não toca em `expense_shares`

## 6. Evidência

- [ ] Saída dos testes de integração e do E2E
