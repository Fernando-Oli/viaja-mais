---
id: S06-Ab-rateio-ui
titulo: Rateio na criação da despesa
trilha: T1
responsavel: abner
revisor: fernando
semana: S06
requisitos: [RF06]
secoes_doc: [22.1]
branch: feat/S06-Ab-rateio-ui
tipo: [tela]
depende_de: []
status: backlog
---
# Rateio na criação da despesa

> **Abner** · semana **S06** (30/09 a 06/10) · marco da semana: _Fluxo de grupo ponta a ponta_

## 1. Contexto

Interface para escolher entre divisão igual, por peso ou por valor exato.

## 2. Arquivos afetados

Sem migration: `expense_shares`, `expenses.split_type` e a constraint trigger
de soma já estão na main desde `S04-F-migration-rateio`
(`supabase/migrations/20260926102023_financeiro_rateio.sql`), e
`types/database.ts` já traz as duas.

- `lib/finance/rateio.ts` — **novo**: cálculo puro do rateio em centavos
  (igual, por peso, por valor exato) e avaliação do formulário.
- `lib/schemas/despesa.ts` — **editar**: campo opcional `rateio` no contrato de
  criação (tipo + participantes, com peso ou valor conforme o tipo).
- `app/api/trips/[tripId]/expenses/route.ts` — **editar**: o `POST` valida que
  cada participante é membro da viagem (`papelNaViagem`, de `lib/authz/trip.ts`),
  **recalcula as partes no servidor** e grava `split_type` + `expense_shares`.
- `components/expense-split.tsx` — **novo**: seletor do tipo de divisão,
  participantes, pesos/valores e prévia do valor de cada um.
- `app/dashboard/trips/[id]/expenses/new/page.tsx` — **editar**: carrega os
  membros por `GET /api/trips/[tripId]`, com estados de carregamento e erro, e
  envia o rateio junto da despesa.
- `tests/lib/finance-rateio.test.ts` — **novo**: unit com casos de borda.
- `tests/lib/despesa-schema.test.ts` — **editar**: contrato do campo `rateio`.
- `tests/lib/expenses-route.test.ts` — **editar**: 200/401/403/400 com rateio.
- `tests/components/expense-split.test.tsx` — **novo**: componente e página.
- `e2e/rateio-despesa.spec.ts` — **novo**: as três formas de divisão.

Fora do escopo: escolher quem pagou (`paid_by`, RF-06.8 — o trigger mantém
"quem registrou pagou"), exibir as partes na lista de despesas, saldo e acerto.

## 3. Passos

1. `lib/finance/rateio.ts`: tudo em centavos inteiros. Divisão igual com
   `floor` e o resto distribuído um centavo por vez a partir do primeiro
   participante (R$ 10,00 / 3 = 3,34 + 3,33 + 3,33). Peso pelo método do maior
   resto, em `BigInt` para não estourar o inteiro seguro. Valor exato confere
   soma, falta e excesso. Toda função devolve partes cuja soma é o total.
2. Schema zod: `rateio` como união discriminada por `tipo`
   (`equal` | `weight` | `exact`, os mesmos valores do CHECK de `split_type`),
   participantes sem repetição, peso > 0 e ≤ 9999,99, valor ≥ 0 com até dois
   decimais.
3. Rota: o servidor não confia nos valores calculados pelo navegador — refaz o
   cálculo com a mesma função de `lib/finance/`. Participante que não é membro
   da viagem → 400. Rateio que não fecha → 400 antes de tocar no banco. As
   partes vão num único `insert` (uma transação, onde a constraint trigger
   adiada confere a soma); se ele falhar, a despesa recém-criada é removida
   para não ficar um lançamento órfão.
4. Tela: membros vindos da API; o usuário atual aparece como "Você" e os demais
   como "Participante N" (ver bloco 7). Prévia por participante, soma, falta /
   excede, botão de envio desabilitado enquanto o rateio for inválido, feedback
   por `toast()`.
5. Testes unit, de rota e de componente; E2E das três formas com screenshot em
   `docs/pfc/evidencias/` (padrão `S06-Ab-rateio-ui-<cenário>-<projeto>.png`).

## 4. O que testar

Obrigatórios pelo tipo (`tela`):

- [x] E2E das três formas de divisão — `e2e/rateio-despesa.spec.ts` (igual,
      peso, valor exato, carregamento/erro; projetos `chromium` e `mobile`).
      `npx playwright test e2e/rateio-despesa.spec.ts` em 14/10/2026, contra o
      Supabase local: **8 aprovados, 0 reprovados**.
- [x] E2E do fluxo com screenshot arquivado em `docs/pfc/evidencias/` — 10
      arquivos gerados pela execução aprovada (ver bloco 6).

Executados (Vitest), todos verdes:

- [x] `tests/lib/finance-rateio.test.ts` — 66 casos: R$ 10,00 / 3 = 3,34 + 3,33 +
      3,33; soma fecha para totais de 1 centavo a 9.999.999.999 centavos e de 1
      a 7 pessoas; maior resto no peso; peso 0, negativo, acima do teto e com 3
      casas; valor exato que falta, excede, negativo; conversão sem float.
- [x] `tests/lib/despesa-schema.test.ts` — contrato do campo `rateio`.
- [x] `tests/lib/expenses-route.test.ts` — 200 nas três formas (partes
      recalculadas no servidor), 401, 403, 400 por rateio que não fecha, por
      participante de fora da viagem e por peso inválido; desfaz a despesa se
      gravar as partes falhar.
- [x] `tests/components/expense-split.test.tsx` — página em jsdom: carregamento,
      erro com toast e "Tentar novamente", as três formas, envio bloqueado
      enquanto o rateio é inválido, erro da API em toast; `alert`/`confirm`
      vigiados em todos os casos.

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

Preparação: `npm run setup`, `npm run dev`. Criar uma terceira conta em
`/auth/sign-up`. Logado como `teste.a@viajamais.local`, criar uma viagem e
incluir `teste.b@viajamais.local` e a terceira conta como membros. O aceite de
convite hoje falha (ver bloco 7); até ser corrigido, inclua os membros em
`trip_members` pelo Studio, como faz o E2E.

1. Viagem → aba Despesas → "Adicionar Despesa" → esperado: "Carregando
   participantes..." e, em seguida, três linhas: "Você", "Participante 2",
   "Participante 3", todas marcadas; "Igual" selecionado; botão "Salvar
   Despesa" desabilitado (sem valor).
2. Descrição "Pizza", Valor `10.00` → esperado: partes R$ 3,34 · R$ 3,33 ·
   R$ 3,33; "Soma das partes" R$ 10,00; "A soma das partes fecha com o total.";
   botão habilitado.
3. Desmarcar "Participante 3" → esperado: R$ 5,00 · R$ 5,00 · "Fora".
   Remarcar.
4. Salvar → esperado: toast "Despesa adicionada" e volta para a aba Despesas.
   No Studio, `expense_shares` da despesa: 3,34 · 3,33 · 3,33;
   `expenses.split_type = 'equal'`.
5. Nova despesa, Valor `100`, "Por peso". Peso de "Você" = `0` → esperado:
   campo marcado como inválido, mensagem "Informe um peso maior que zero…",
   botão desabilitado. Peso = `2` → R$ 50,00 · R$ 25,00 · R$ 25,00. Salvar →
   `expense_shares.weight` = 2, 1, 1.
6. Nova despesa, Valor `100`, "Valor exato". Você `50`, Participante 2 `30` →
   esperado: Soma R$ 80,00, "Falta R$ 20,00", botão desabilitado. Participante
   3 `30` → "Excedeu R$ 10,00", mensagem "A soma excede o total em R$ 10,00",
   botão desabilitado. Participante 3 `20` → "Falta R$ 0,00", botão habilitado.
   Salvar → partes 50 · 30 · 20.
7. DevTools → Network → bloquear `/api/trips/<id>` e recarregar a página →
   esperado: caixa "Não foi possível carregar os participantes da viagem." com
   "Tentar novamente", toast de erro, botão de salvar desabilitado. Desbloquear e
   clicar "Tentar novamente" → participantes aparecem.
8. Repetir 2 e 6 com a janela em 400 px de largura → esperado: linhas quebram
   sem rolagem horizontal; campos e partes legíveis.
9. Em nenhum passo surge diálogo nativo do navegador.

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [x] Soma sempre fecha com o total, inclusive com centavo quebrado — provado por
      unit (`finance-rateio.test.ts`), pela rota (partes recalculadas no
      servidor) e, no banco, pela constraint trigger de S04-F.
- [x] Funciona em mobile e desktop — E2E aprovado nos projetos `chromium` e
      `mobile` (Pixel 7). A primeira execução mostrou, em
      `exato-nao-fecha-mobile`, o selo "Dono"/"Membro" sobreposto ao campo de
      valor e o nome do participante sumido: em tela estreita, nome e campo
      dividiam a mesma linha. Corrigido em `components/expense-split.tsx`: abaixo
      de `sm`, nome e papel ocupam a linha inteira e campo + parte descem para a
      linha seguinte; em desktop o layout segue em linha única. Screenshots
      regenerados após a correção, 8/8 aprovados.
- [x] Feedback por `toast()`; sem `alert()` nem `confirm()` — teste de
      componente vigia os dois em todos os casos; o E2E também, nos 8 casos.
- [x] Estado de erro e de carregamento tratados — provado em jsdom e no E2E
      (executado, aprovado em `chromium` e `mobile`).

## 6. Evidência

- [x] Saída dos testes — `docs/pfc/evidencias/S06-Ab-rateio-ui-integracao.txt`
      (119 testes, 4 arquivos). Suíte completa: 227 testes, 20 arquivos, verde.
- [x] Screenshot do fluxo —
      `docs/pfc/evidencias/S06-Ab-rateio-ui-{igual,peso,exato,exato-nao-fecha,erro}-{chromium,mobile}.png`
      (10 arquivos), gerados em 14/10/2026 pela execução com 8/8 aprovados.
- [x] Cobertura de `lib/` — `lib/finance/rateio.ts` 100% (linhas, ramos,
      funções); `lib/schemas/despesa.ts` 100%; rota de despesas 95,2% das linhas.

## 7. Observações

- **Preparo do E2E sem convite**: o spec montava a viagem de três membros por
  `POST /api/invitations` + `POST /api/invitations/[id]/accept`. O aceite
  devolve 404 (`PGRST116`, "The result contains 0 rows"): a rota lê o convite
  com `trips!inner`, e as policies de SELECT de `trips` só liberam dono e
  membro — o convidado ainda não é membro, então o join zera o resultado. É
  defeito do RF04 (aceite de convite), fora do escopo desta atividade; a
  aplicação não foi alterada. O spec passou a incluir os membros como a dona,
  direto em `trip_members` sob RLS (`trip_members_insert` / `is_trip_owner`), o
  mesmo preparo de `tests/rls/02-rateio.test.ts`. A terceira conta continua
  sendo criada pelo cadastro: o seed só tem duas.

- **Nomes dos participantes**: a policy de `profiles` só deixa ler o próprio
  perfil, e não existe helper que exponha o nome dos membros de uma viagem. Por
  isso a tela usa "Você" / "Participante N" com o papel (Dono/Membro). Trocar por
  nome real depende de um helper do dono de `profiles` (Micael) ou de policy
  nova (Fernando).
- **Redirecionamento após salvar**: a tela voltava para `?tab=expenses`, que a
  página da viagem não lê (ela usa `?aba=despesas`) — a pessoa caía no
  itinerário. Corrigido no mesmo arquivo, porque é o fim do fluxo testado.
- **Atomicidade**: despesa e partes são duas chamadas ao PostgREST. Se a segunda
  falhar, a rota apaga a despesa recém-criada. Uma função SQL única daria
  transação real, mas exige migration (Fernando) e não era necessária aqui.
- **Sobreposição com S05-Ab-balances** (ainda não mergeada): aquela branch tem
  `paraCentavos`/`paraReais` em `lib/finance/balances.ts`. Este módulo tem
  `reaisParaCentavos`/`centavosParaReais`, que leem o texto sem multiplicar em
  float. Ao mergear as duas, unificar a conversão num lugar só.
