---
id: S05-Ab-balances
titulo: Cálculo de saldos em lib/finance
trilha: T1
responsavel: abner
revisor: fernando
semana: S05
requisitos: [RF06]
secoes_doc: [22.2]
branch: feat/S05-Ab-balances
tipo: [regra-de-negocio]
depende_de: []
status: em-revisao
---
# Cálculo de saldos em lib/finance

> **Abner** · semana **S05** (23 a 29/09) · marco da semana: _Zero escrita no banco a partir do navegador_

## 1. Contexto

Funções puras de saldo e de minimização de transferências. É a peça mais testável do projeto e o melhor exemplo para a seção 24.

## 2. Arquivos afetados

Sem migration — são funções puras, sem leitura nem escrita de banco.

- `lib/finance/balances.ts` (novo) — `calcularSaldos()` e `minimizarTransferencias()`, nomes e caminho já
  decididos em `docs/plans/00-plano-norte.md` §T2 e no catálogo de requisitos (RF-06.11, RF-06.13 em
  `docs/pfc/03-publico/14-requisitos-funcionais.md`); não inventei nomes novos.
- `tests/lib/finance-balances.test.ts` (novo) — unit, sem mock de I/O (não há I/O para mockar)

## 3. Passos

1. Levantar o que já existe: `lib/finance/` ainda não existia; `expenses`/`expense_shares` (migration
   `20260926102023_financeiro_rateio.sql`) já guardam `paid_by` e a parte de cada membro, mas nenhuma rota
   ainda lê isso para calcular saldo — esta atividade só entrega a lógica pura, desacoplada do formato exato
   das tabelas.
2. Desenhar um formato de entrada agnóstico de Supabase: `DespesaDividida { pagadorId, partes: { participanteId, valor }[] }`.
   Quem chamar a função (rota ou tela, em atividade futura) mapeia as linhas do banco para este formato.
3. `calcularSaldos`: para cada parte que não é do próprio pagador, o pagador fica credor e o participante
   fica devedor daquele valor. Soma por participante usando `Map`, em centavos inteiros.
4. `minimizarTransferencias`: algoritmo guloso de "min cash flow" — ordena credores e devedores por valor
   decrescente e casa sempre os dois extremos. É heurística (o mínimo global de transferências é
   NP-difícil), documentado como tal no código.
5. `paraCentavos`/`paraReais`: borda de conversão reais↔centavos. `paraCentavos` usa `toFixed(2)` antes de
   multiplicar por 100, para não herdar ruído de ponto flutuante do valor de entrada.
6. Testes cobrindo os casos de borda listados no bloco 4 abaixo.

## 4. O que testar

Obrigatórios pelo tipo (`regra-de-negocio`):

- [x] Casos de borda: zero, negativo, R$ 10 entre 3 pessoas — `tests/lib/finance-balances.test.ts`
- [x] Unit com casos de borda — 19 casos (ver bloco 6)
- [x] Cobertura de ao menos 70% no arquivo — 100% em statements/branches/funcs/lines (ver bloco 6)

**Roteiro de teste manual** — não há tela nem rota: a função é consumida por código, não por uma pessoa.
O "manual" possível aqui é rodar a suíte e inspecionar o resultado de um caso concreto:

1. Rodar `npm run test -- tests/lib/finance-balances.test.ts`. Esperado: todos os testes passam (ver bloco 6
   para o que foi de fato executado nesta sessão).
2. Num script Node/ts-node, chamar:
   ```ts
   import { calcularSaldos, minimizarTransferencias } from "@/lib/finance/balances"
   const saldos = calcularSaldos([
     { pagadorId: "A", partes: [{ participanteId: "A", valor: 3.34 }, { participanteId: "B", valor: 3.33 }, { participanteId: "C", valor: 3.33 }] },
   ])
   console.log(saldos) // esperado: [{A,6.66},{B,-3.33},{C,-3.33}]
   console.log(minimizarTransferencias(saldos)) // esperado: [{de:B,para:A,valor:3.33},{de:C,para:A,valor:3.33}]
   ```
3. Confirmar à mão que `6.66 - 3.33 - 3.33 === 0` e que as duas transferências do passo 2 somam 6.66 — a
   soma dos saldos positivos bate com a soma do que será transferido.

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [x] Soma dos saldos e sempre zero — testado em todo cenário de `calcularSaldos` (helper `somaSaldos`) e
      verificado de volta após `minimizarTransferencias` (aplica as transferências sobre os saldos originais
      e confere que todo mundo fecha em zero)
- [x] Função pura, sem I/O — `lib/finance/balances.ts` não importa Supabase, `fetch`, Next ou React; os
      testes não mockam nada porque não há nada para mockar
- [x] Casos de arredondamento cobertos — R$ 10 entre 3 pessoas, R$ 100 entre 7 pessoas, `toFixed`/`Math.round`
      testados isoladamente

## 6. Evidência

- [x] Saída dos testes — `npm run test -- tests/lib/finance-balances.test.ts`: **19 testes, 19 passando**.
      Suíte completa do repositório (`npm run test`): **151 testes, 19 arquivos, todos passando** — sem
      regressão em nenhum outro módulo.
- [x] `npm run typecheck`: sem erros (depois de limpar um cache `.next/` desatualizado de outra branch —
      ver observação fora do escopo abaixo).
- [x] `npm run lint`: 0 erros, 58 warnings pré-existentes (nenhum em arquivo novo ou modificado desta
      atividade); limite do script é 79.
- [ ] Screenshot ou gravação do fluxo — não aplicável; atividade é `regra-de-negocio`, sem tela nem rota.
- [x] Delta de cobertura — `lib/finance/balances.ts`: **100% statements, 100% branches, 100% functions,
      100% lines** (comando: `vitest run tests/lib/finance-balances.test.ts --coverage --coverage.include="lib/finance/**/*.ts"`).
      Bem acima do piso de 70% do RNF05.

### Observação fora do escopo

`npm run typecheck` falhava antes da limpeza por causa de `.next/types/validator.ts` (cache de build do
Next, gitignored, não rastreado) com referências a `app/api/trips/[tripId]/expenses/[expenseId]/route.ts` e
`app/dashboard/trips/[id]/expenses/[expenseId]/edit/page.tsx` — arquivos de uma atividade de outra semana
(S03-Ab-editar-despesa) que não existem nesta branch. Removi a pasta `.next/` (puro artefato de build,
regenerado automaticamente; não é código-fonte nem configuração) só para obter um sinal limpo do typecheck
desta atividade. Nenhum arquivo versionado foi alterado por essa limpeza.
