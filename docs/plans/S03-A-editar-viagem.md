---
id: S03-A-editar-viagem
titulo: Editar viagem e gravar itinerário pela API
trilha: T1
responsavel: audrey
revisor: fernando
semana: S03
requisitos: [RF03, RF05]
secoes_doc: [22.1]
branch: feat/S03-A-editar-viagem
tipo: [route-handler, tela]
depende_de: []
status: em-revisao
---
# Editar viagem e gravar itinerário pela API

> **Audrey** · semana **S03** (09 a 15/09) · marco da semana: _Convite chega no e-mail de verdade_

## 1. Contexto

Duas pendências do plano norte para a S03 ("Editar viagem + writes de itinerário → API"):

- **Editar viagem:** o PATCH existe e nunca é chamado: não há tela de edição, apesar de a documentação prometer.
- **Itinerário:** a tela "Nova Atividade" gravava `itinerary_items` direto do navegador
  (regra 1 das convenções do projeto), e a rota `POST /api/trips/[tripId]/itinerary` fazia
  `.insert({ ...body })` sem zod e sem `exigirMembro` (regras 2 e 3).

Editar, excluir e concluir item de itinerário ficam para `S04-A-itinerario-crud`.

## 2. Arquivos afetados

Editar viagem (RF03.2):

- `app/dashboard/trips/[id]/edit/page.tsx` (criar) — formulário de edição
- `app/dashboard/trips/[id]/page.tsx` (editar) — botão "Editar" visível só para o dono;
  cabeçalho empilha no mobile; `{trip.budget && …}` renderizava um "0" solto quando o
  orçamento é zero (virou `Number(trip.budget) > 0`); cabeçalho do card de itinerário
  com `flex-wrap` (o botão "Adicionar Atividade" estourava o card no mobile)
- `tests/api/trips-patch.test.ts` (criar) — integração do PATCH: 200/401/403/400
- `e2e/editar-viagem.spec.ts` (criar) — fluxo completo com screenshot
- `app/api/trips/[tripId]/route.ts` (só comentário) — as tags de requisito estavam
  deslocadas em relação ao catálogo (editar marcado como RF03.4, que é "listar viagens").
  Alinhadas: GET = RF03.5, PATCH = RF03.2, DELETE = RF03.3.

Itinerário pela API (RF05.1, RF05.4):

- `lib/schemas/itinerario.ts` (criar) — `criarItemItinerarioSchema`: lista fechada de
  campos, `category`/`status` espelhando os CHECK da tabela, horário HH:MM e término
  não anterior ao início
- `app/api/trips/[tripId]/itinerary/route.ts` (editar) — GET e POST no molde da rota de
  referência: `exigirMembro`, zod, insert campo a campo, mensagem de erro genérica
- `app/dashboard/trips/[id]/itinerary/new/page.tsx` (editar) — `fetch` para a rota no
  lugar do insert pelo cliente Supabase do navegador; feedback por `toast()`
- `tests/api/itinerary-route.test.ts` (criar) — POST 200/401/403/400 + mass-assignment; GET 200/403
- `e2e/adicionar-atividade.spec.ts` (criar) — fluxo completo com screenshot

Compartilhado:

- `app/dashboard/layout.tsx` (editar) — descoberto pelo E2E no projeto `mobile`:
  o `<main>` sem `min-w-0` estourava a largura e o nome/e-mail do usuário vazava
  da barra lateral de `w-20`, cobrindo o botão "Salvar alterações". Correção só de
  classes CSS, sem mudança de comportamento no desktop.
- Nenhuma migration: as tabelas e as policies de `trips` e `itinerary_items` já existem.

## 3. Passos

1. Criar a tela `app/dashboard/trips/[id]/edit/page.tsx`: busca a viagem via
   `GET /api/trips/[id]`, preenche o formulário e salva via `PATCH`.
2. Adicionar botão "Editar" em `app/dashboard/trips/[id]/page.tsx`, visível só
   quando `isOwner` (o PATCH já é restrito a dono via `exigirDono`).
3. Teste de integração do PATCH (`tests/api/trips-patch.test.ts`).
4. E2E do fluxo completo (`e2e/editar-viagem.spec.ts`).
5. Criar `lib/schemas/itinerario.ts` e reescrever a rota de itinerário no molde da rota de referência.
6. Trocar o insert direto da tela "Nova Atividade" por `POST /api/trips/[id]/itinerary`.
7. Teste de integração da rota de itinerário e E2E de adicionar atividade.
8. `npm run verify`.

## 4. O que testar

Obrigatórios pelo tipo (`route-handler, tela`):

- [x] Integração cobrindo os 4 caminhos: 200 feliz, 401 sem sessão, 403 não-membro, 400 payload invalido
  — `trips-patch.test.ts` (PATCH) e `itinerary-route.test.ts` (POST; GET 200/403)
- [x] E2E do fluxo com screenshot arquivado em `docs/pfc/evidencias/` (um por projeto: `chromium` e `mobile`)
  — `editar-viagem.spec.ts` e `adicionar-atividade.spec.ts`

> Os E2E criam a viagem de partida por `POST /api/trips`, não pela tela "Nova Viagem":
> o campo Destino de lá é o autocomplete do Google Places, que não responde com a
> chave placeholder do ambiente local/CI. O fluxo testado em si é feito todo pela UI.

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

Pré-requisito: `npm run setup` concluído e `npm run dev` rodando em http://localhost:3000.

Editar viagem:

1. Entrar em `/auth/login` com `teste.a@viajamais.local` / `viajamais123`.
   → Redireciona para `/dashboard`.
2. Abrir "Minhas Viagens" e clicar numa viagem criada por A (se não houver, criar uma).
   → A página de detalhe mostra o botão **Editar** ao lado do título.
3. Clicar em **Editar**.
   → Abre `/dashboard/trips/<id>/edit` com "Carregando..." e, em seguida, o formulário
   preenchido com os dados atuais da viagem.
4. Trocar o título e o destino e clicar em **Salvar alterações**.
   → O botão mostra "Salvando...", aparece o toast "Viagem atualizada" e volta para o
   detalhe já com o título e o destino novos.
5. Voltar em **Editar**, colocar a data de término antes da de início e salvar.
   → Toast de erro "a data de fim não pode ser anterior à de início"; nada é gravado.
6. Sair, entrar como `teste.b@viajamais.local` e abrir a URL de detalhe da viagem de A.
   → B não vê a viagem (não é membro). Abrindo direto `/dashboard/trips/<id>/edit`,
   aparece o toast "Não foi possível carregar a viagem" e volta para "Minhas Viagens".
7. Se B for membro comum da viagem (convidado por A), o botão **Editar** não aparece.

Adicionar atividade:

8. Como A, no detalhe da viagem, aba **Itinerário**, clicar em **Adicionar Atividade**.
   → Abre `/dashboard/trips/<id>/itinerary/new`.
9. Preencher título, data, início 09:00, término 12:00 e local; clicar em **Salvar Atividade**.
   → Toast "Atividade adicionada"; volta para o detalhe com o item listado no dia, com
   horário e local, e o contador "Itinerário" do topo em 1.
10. Repetir com término 10:00 e início 15:00.
    → Toast de erro "o horário de término não pode ser anterior ao de início"; nada é gravado.
11. No DevTools, aba Network, confirmar que salvar dispara `POST /api/trips/<id>/itinerary`
    e nenhuma requisição direta ao Supabase (`/rest/v1/itinerary_items`).

Mobile:

12. Repetir os passos 2 a 4 e 8 a 9 com o DevTools em modo celular (ex.: Pixel 7).
    → Título, status e botões empilham sem rolagem lateral; os formulários inteiros ficam clicáveis.

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [x] Membro comum não consegue editar viagem de que não participa — `trips-patch.test.ts` (403)
- [x] Data de fim anterior a de inicio e recusada — `trips-patch.test.ts` (400)
- [x] `await params` (nesta versão do Next, params e Promise) — rotas usam `await params`; telas usam `use(params)`
- [x] Corpo validado por zod, com campos extraidos um a um — nunca `...body` — `atualizarViagemSchema` e
  `criarItemItinerarioSchema`; o teste de itinerário prova que `id`/`created_at` forjados são descartados
  e que `trip_id` vem da URL
- [x] Autorização checada no servidor via `exigirMembro` / `exigirDono` — PATCH de viagem com `exigirDono`;
  GET e POST de itinerário com `exigirMembro`
- [x] Funciona em mobile e desktop — E2E passa nos projetos `chromium` e `mobile` (Pixel 7)
- [x] Feedback por `toast()`; sem `alert()` nem `confirm()`
- [x] Estado de erro e de carregamento tratados — "Carregando..." no fetch, "Salvando..." no submit, toast de erro com a mensagem do zod
- [x] Nenhuma escrita em `itinerary_items` parte do navegador — a tela "Nova Atividade" não importa mais `@/lib/supabase/client`

## 6. Evidência

- [x] Saida dos testes — arquivada em `docs/pfc/evidencias/`:
  - `S03-A-editar-viagem-integracao.txt` — PATCH: 4 de 4 (200, 401, 403, 400)
  - `S03-A-editar-viagem-e2e.txt` — E2E: 2 de 2 (chromium, mobile)
  - `S03-A-adicionar-atividade-integracao.txt` — itinerário: 7 de 7 (POST 200/401/403/400 + mass-assignment; GET 200/403)
  - `S03-A-adicionar-atividade-e2e.txt` — E2E: 2 de 2 (chromium, mobile)
  - Suíte completa (`npm run test`): 15 arquivos, 92 testes passando
- [x] Screenshot ou gravação do fluxo (se houver tela):
  - `S03-A-editar-viagem-chromium.png` e `S03-A-editar-viagem-mobile.png` — detalhe após salvar, com o toast "Viagem atualizada"
  - `S03-A-adicionar-atividade-chromium.png` e `S03-A-adicionar-atividade-mobile.png` — item listado no itinerário, com o toast "Atividade adicionada"
- [x] Delta de cobertura (se mexeu em `lib/`) — `lib/schemas/itinerario.ts`: 100% (arquivo novo);
  `app/api/trips/[tripId]/itinerary/route.ts`: 0% → 100%

> Fora do escopo, registrado para o revisor: `e2e/00-fumaca.spec.ts:47` ("rotas
> removidas") falha na `main` também — `/login` e `/register` respondem 200 em vez
> de 404. Confirmado rodando a suíte de fumaça sem as mudanças desta branch.
