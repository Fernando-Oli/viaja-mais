---
id: S05-A-reservas
titulo: Reservas: aba, entradas e edição
trilha: T1
responsavel: audrey
revisor: fernando
semana: S05
requisitos: [RF07]
secoes_doc: [22.1]
branch: feat/S05-A-reservas
tipo: [tela, route-handler]
depende_de: [S04-A-itinerario-crud]
status: em-revisao
---
# Reservas: aba, entradas e edição

> **Audrey** · semana **S05** (23 a 29/09) · marco da semana: _Zero escrita no banco a partir do navegador_

## 1. Contexto

A tela de criar reserva existe com 257 linhas e não tem nenhum link apontando para ela. Funcionalidade morta.

Além disso, ela grava `bookings` direto do navegador (contra o marco da semana), e a rota
`app/api/trips/[tripId]/bookings/route.ts` faz `.insert({ ...body })` sem zod e sem
`exigirMembro`. Não existe edição nem exclusão de reserva.

A branch parte de `feat/S04-A-itinerario-crud`: esta atividade altera a página de detalhe
da viagem e a seção 22.1, ambas modificadas na S03/S04. A tela de lugares, que também grava
pelo navegador, é escopo de `S06-A-lugares`.

## 2. Arquivos afetados

- `lib/schemas/reserva.ts` (criar) — `criarReservaSchema` e `atualizarReservaSchema`: tipos e
  status espelhando os CHECK de `bookings`, data/hora do `<input type="datetime-local">`,
  término não anterior ao início, preço não negativo
- `app/api/trips/[tripId]/bookings/route.ts` (editar) — GET e POST no molde da rota de
  referência: `exigirMembro`, zod, insert campo a campo, `user_id` da sessão
- `app/api/trips/[tripId]/bookings/[bookingId]/route.ts` (criar) — GET, PATCH e DELETE de uma
  reserva, com filtro por `trip_id` **e** `id`
- `app/dashboard/trips/[id]/bookings/new/page.tsx` (editar) — `fetch` para a rota no lugar do
  insert pelo cliente Supabase do navegador; feedback por `toast()`
- `app/dashboard/trips/[id]/bookings/[bookingId]/edit/page.tsx` (criar) — formulário de edição
- `components/booking-list.tsx` (criar) — lista de reservas da viagem com **Editar** e
  **Excluir** (com `ConfirmModal`)
- `app/dashboard/trips/[id]/page.tsx` (editar) — aba **Reservas** com o botão
  "Adicionar Reserva" (o ponto de entrada que faltava); lista de abas quebra linha no mobile
- `tests/api/bookings-route.test.ts` (criar) — integração do POST/GET da lista
- `tests/api/booking-item-route.test.ts` (criar) — integração de PATCH/DELETE/GET de uma reserva
- `e2e/reservas.spec.ts` (criar) — criar pela aba, editar e excluir
- `docs/pfc/05-arquitetura/22-implementacao.md` (editar) — seção 22.1: telas de reserva e
  retirada da limitação que já não existe
- `docs/pfc/03-publico/14-requisitos-funcionais.md` (editar) — status de RF07
- Nenhuma migration: `bookings` e as policies de INSERT/UPDATE/DELETE para membros já existem.

## 3. Passos

1. Schema em `lib/schemas/reserva.ts`.
2. Reescrever a rota da lista e criar a rota `[bookingId]` no molde de `app/api/trips/[tripId]/route.ts`.
3. Trocar o insert direto de "Nova Reserva" por `POST /api/trips/[id]/bookings`.
4. Tela de edição, carregando pelo `GET` da rota do item e salvando pelo `PATCH`.
5. `components/booking-list.tsx` e aba Reservas no detalhe da viagem.
6. Testes de integração e E2E; `npm run verify`.
7. Atualizar a seção 22.1 e o catálogo.

## 4. O que testar

Obrigatórios pelo tipo (`tela, route-handler`):

- [x] E2E do fluxo com screenshot arquivado em `docs/pfc/evidencias/` (um por projeto: `chromium` e `mobile`)
  — `e2e/reservas.spec.ts`: criar pela aba Reservas, editar, cancelar exclusão e excluir
- [x] Integração cobrindo os 4 caminhos: 200 feliz, 401 sem sessão, 403 não-membro, 400 payload invalido
  — `tests/api/bookings-route.test.ts` (POST e GET) e `tests/api/booking-item-route.test.ts`
  (PATCH, DELETE e GET), mais 404 para reserva de outra viagem e prova de que `user_id`,
  `trip_id` e `id` vindos do corpo são descartados

> Só a viagem de partida é criada pela API; a reserva é criada pela tela, entrando pela
> aba Reservas — é esse ponto de entrada que a atividade precisava provar.

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

Pré-requisito: `npm run setup` concluído e `npm run dev` rodando em http://localhost:3000.

1. Entrar como `teste.a@viajamais.local` / `viajamais123` e abrir uma viagem.
   → Aparece a aba **Reservas** ao lado de Itinerário, Despesas e Lugares.
2. Abrir a aba **Reservas**.
   → Sem reservas: mensagem "Nenhuma reserva cadastrada" e botão **Adicionar Reserva**.
3. Clicar em **Adicionar Reserva**, escolher tipo Voo, preencher título, provedor, início
   e término e clicar em **Salvar Reserva**.
   → Toast "Reserva adicionada"; volta ao detalhe e a reserva aparece na aba, com tipo,
   status, datas e provedor.
4. Repetir o passo 3 com término antes do início.
   → Toast de erro "o término não pode ser anterior ao início"; nada é gravado.
5. Na reserva, clicar em **Editar**, trocar o título e o status para Pendente e salvar.
   → Toast "Reserva atualizada"; a aba mostra o título novo e o selo "Pendente".
6. Clicar em **Excluir** e, no modal, em **Cancelar**.
   → O modal fecha e a reserva continua na lista.
7. Clicar em **Excluir** e confirmar.
   → Toast "Reserva excluída"; a reserva some da aba.
8. No DevTools, aba Network, confirmar que salvar dispara `POST /api/trips/<id>/bookings` e
   nenhuma requisição direta ao Supabase (`/rest/v1/bookings`).
9. Entrar como `teste.b@viajamais.local` e abrir direto a URL de edição de uma reserva de A.
   → Toast "Não foi possível carregar a reserva" e volta para "Minhas Viagens".
10. Repetir os passos 2, 3, 5 e 7 no DevTools em modo celular (ex.: Pixel 7).
    → As quatro abas cabem (quebrando linha se preciso), os botões cabem no cartão e o modal
    fica utilizável.

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [x] Reserva e alcançável a partir da viagem — aba Reservas com "Adicionar Reserva"; o E2E
  entra por ela; criar e editar voltam para `?aba=reservas`
- [x] Editar e excluir funcionam — E2E edita título e status e exclui com confirmação no modal
- [x] Funciona em mobile e desktop — E2E passa nos projetos `chromium` e `mobile` (Pixel 7);
  a lista de abas quebra linha no celular
- [x] Feedback por `toast()`; sem `alert()` nem `confirm()` — exclusão confirmada pelo `ConfirmModal`
- [x] Estado de erro e de carregamento tratados — "Carregando..." na edição, "Salvando..." no
  submit, botão Excluir travado durante a requisição, toast de erro com a mensagem do servidor
- [x] `await params` (nesta versão do Next, params e Promise) — rotas usam `await params`; telas usam `use(params)`
- [x] Corpo validado por zod, com campos extraidos um a um — nunca `...body` — `criarReservaSchema`
  e `atualizarReservaSchema`, com insert/update campo a campo
- [x] Autorização checada no servidor via `exigirMembro` / `exigirDono` — `exigirMembro` em
  todos os métodos das duas rotas

## 6. Evidência

- [x] Saida dos testes — arquivada em `docs/pfc/evidencias/`:
  - `S05-A-reservas-integracao.txt` — rotas de reserva: 24 de 24
  - `S05-A-reservas-e2e.txt` — E2E: 2 de 2 (chromium, mobile)
- [x] Screenshot ou gravação do fluxo (se houver tela):
  - `S05-A-reservas-criada-chromium.png` e `-mobile.png` — aba Reservas logo após criar, com o horário exato digitado
  - `S05-A-reservas-excluida-chromium.png` e `-mobile.png` — aba vazia após a exclusão
- [x] Delta de cobertura (se mexeu em `lib/`) — `lib/schemas/reserva.ts` (novo): 100% de linhas
  e ramos; `app/api/trips/[tripId]/bookings/route.ts`: 0% → 100% de linhas (75% de ramos);
  `app/api/trips/[tripId]/bookings/[bookingId]/route.ts` (novo): 100% de linhas (83% de ramos).
  Cobertura total de `lib/` + `app/api/` foi a 60% de linhas

Também nesta atividade: seção 22.1 atualizada (reservas deixam de ser limitação) e status de
RF07.1, RF07.5 e RF07.6 atualizados para Existente no catálogo da seção 14.
