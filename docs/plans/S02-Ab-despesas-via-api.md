---
id: S02-Ab-despesas-via-api
titulo: Despesas passam a escrever por route handler
trilha: T1
responsavel: abner
revisor: fernando
semana: S02
requisitos: [RF06]
secoes_doc: [22.2]
branch: feat/S02-Ab-despesas-via-api
tipo: [route-handler]
status: em-desenvolvimento
---
# Despesas passam a escrever por route handler

> **Abner** · semana **S02** (02 a 08/09) · marco da semana: _Quadro do Notion vivo, movido pelo CI_

## 1. Contexto

Hoje a tela de nova despesa escreve direto do navegador, dependendo só da RLS.

## 2. Arquivos afetados

- `lib/schemas/despesa.ts` **(novo)** — contrato zod da criação de despesa; lista fechada de campos.
- `app/api/trips/[tripId]/expenses/route.ts` **(modificar)** — `GET` e `POST` no molde de
  `app/api/trips/[tripId]/route.ts`: `await params`, `getUser`, `exigirMembro`, zod, `respostaDeErro`.
- `app/dashboard/trips/[id]/expenses/new/page.tsx` **(modificar)** — troca a escrita direta
  `supabase.from("expenses").insert(...)` por `POST /api/trips/{id}/expenses`; feedback via `toast()`.
- `tests/lib/despesa-schema.test.ts` **(novo)** — unit do schema (valor, campos obrigatórios, mass-assignment).
- `tests/lib/expenses-route.test.ts` **(novo)** — contrato do handler (200/401/403/400 + `user_id`/`trip_id` da sessão/URL).
- **Sem migration.** A tabela `expenses` já existe (fora do repo — `docs/ARCHITECTURE.md` §6). `paid_by`
  e o rateio são T2/S04+, não entram aqui.

Fora do escopo desta atividade (S02-F, Fernando): `invitations`, `members`, `bookings`, `itinerary`,
`places`. Só a rota de `expenses` é minha.

## 3. Passos

1. `lib/schemas/despesa.ts`: `title`, `amount` (`z.coerce.number().positive()` — cobre zero, negativo e
   ausente), `currency` (3 letras, default BRL), `category` (enum do CHECK), `date` (AAAA-MM-DD),
   `payment_method`/`notes` opcionais. Nunca `id`/`trip_id`/`user_id`.
2. `expenses/route.ts` `POST`: `await params` → `usuarioAtual` → `exigirMembro(supabase, tripId, user.id)`
   → `criarDespesaSchema.safeParse` → campos um a um → `.insert({ ...campos, trip_id: tripId, user_id: user.id })`
   → `respostaDeErro`. `GET`: mesmo padrão, com `exigirMembro` (hoje qualquer autenticado lê despesa de
   qualquer viagem).
3. `expenses/new/page.tsx`: `handleSubmit` chama `fetch("/api/trips/${id}/expenses", { method: "POST" })`;
   sucesso → `toast` + `router.push(?tab=expenses)` + `router.refresh()`; erro → `toast` destrutivo.
   Remove `createClient`. Preserva formulário, campos, loading e navegação.
4. Testes: unit do schema + contrato do handler com cliente falso (padrão de `tests/lib/authz-trip.test.ts`).
5. `npm run verify` + roteiro manual + PR com os critérios do bloco 5.

> **Bloqueio conhecido:** `exigirMembro` consulta `trip_members`, que só existe depois do T0 (Fernando).
> Sem T0 + o vínculo do owner (`S02-A`), a validação ponta a ponta e os testes de integração/RLS
> **não rodam**. A estrutura da rota é a correta e definitiva; a comprovação e2e fica pendente da main.

## 4. O que testar

Obrigatórios pelo tipo (`route-handler`):

- [x] Contrato do handler cobrindo os 4 caminhos — `tests/lib/expenses-route.test.ts`:
      **200** membro cria · **401** sem sessão · **403** autenticado não-membro (sem tentar inserir) ·
      **400** payload inválido (valor zero)
- [x] Teste de segurança: `user_id`/`trip_id` no corpo são ignorados; usa `user.id` da sessão e `tripId` da URL
- [x] Unit do schema — `tests/lib/despesa-schema.test.ts`: zero, negativo, ausente, não-numérico, acima do teto,
      categoria/data/moeda inválidas, descarte de `id`/`trip_id`/`user_id`/`paid_by`
- [ ] **BLOQUEADO (T0/S02-A):** teste de integração real e teste de RLS em `tests/rls/` (A não escreve
      despesa na viagem de B) — dependem das migrations e do `trip_members` na main

**Roteiro de teste manual** (executável quando o T0 estiver na main e `npm run setup` tiver rodado):

1. Login como `teste.a@viajamais.local`. Criar uma viagem. Abrir a viagem → aba **Despesas** →
   **Adicionar Despesa**. Preencher (valor 80, categoria Alimentação, hoje) e salvar.
   → Esperado: toast "Despesa adicionada"; volta para a viagem na aba Despesas; a despesa aparece na lista.
2. Repetir com **valor 0** e depois **valor -5**. → Esperado: toast de erro "o valor deve ser maior que zero";
   nada é gravado.
3. Com o DevTools aberto, refazer o `POST` incluindo `"user_id":"<id do B>"` e `"trip_id":"<viagem do B>"`
   no corpo. → Esperado: a despesa criada pertence ao **A** e à **viagem da URL** (nunca aos valores do corpo).
4. Login como `teste.b@viajamais.local` (não é membro da viagem do A). `GET`/`POST` em
   `/api/trips/<viagem do A>/expenses`. → Esperado: **403**, sem vazar título nem dados da viagem.
5. Sem sessão (logout), mesma chamada. → Esperado: **401**.
6. Conferir no código: `grep -n '\.\.\.body' app/api/trips/[tripId]/expenses/route.ts` → vazio;
   nenhum `supabase.from("expenses").insert` em componente `"use client"`.

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [x] Nenhum insert de despesa a partir de componente client — `expenses/new/page.tsx` usa `fetch` na API
- [x] Valor validado por zod: negativo e zero tratados — `criarDespesaSchema.amount` + testes
- [x] `await params` (nesta versão do Next, params e Promise) — `route.ts` GET e POST
- [x] Corpo validado por zod, com campos extraidos um a um — nunca `...body`
- [x] Autorização checada no servidor via `exigirMembro` / `exigirDono` — `exigirMembro` em GET e POST
- [ ] **BLOQUEADO (T0/S02-A):** o 403 e o 200 comprovados ponta a ponta contra o banco real
- [ ] `npm run verify` verde (não rodável neste ambiente — sem `node_modules`; roda no CI)

## 6. Evidência

- [ ] Saída de `npm run test` (após o CI instalar dependências)
- [ ] Saída de `npm run verify` no CI
- [ ] Screenshot do fluxo de adicionar despesa — **pendente do T0** (precisa do banco para logar/criar viagem)
- [ ] Delta de cobertura em `lib/schemas/despesa.ts`
- [ ] `docs/pfc/evidencias/seguranca/<data>-despesas-mass-assignment.md` — risco e teste que o cobre
