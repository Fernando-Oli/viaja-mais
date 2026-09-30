---
id: S03-A-editar-viagem
titulo: Editar viagem e itinerário pela API
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
# Editar viagem e itinerário pela API

> **Audrey** · semana **S03** (09 a 15/09) · marco da semana: _Convite chega no e-mail de verdade_

## 1. Contexto

O PATCH existe e nunca e chamado: não há tela de edição, apesar de a documentacao prometer.

## 2. Arquivos afetados

- `app/dashboard/trips/[id]/edit/page.tsx` (criar) — formulário de edição
- `app/dashboard/trips/[id]/page.tsx` (editar) — botão "Editar" visível só para o dono
- `tests/api/trips-patch.test.ts` (criar) — integração do PATCH: 200/401/403/400
- `e2e/editar-viagem.spec.ts` (criar) — fluxo completo com screenshot
- `app/dashboard/layout.tsx` (editar) — descoberto pelo E2E no projeto `mobile`:
  o `<main>` sem `min-w-0` estourava a largura e o nome/e-mail do usuário vazava
  da barra lateral de `w-20`, cobrindo o botão "Salvar alterações". Correção só de
  classes CSS, sem mudança de comportamento no desktop.
- `app/dashboard/trips/[id]/page.tsx` — também: `{trip.budget && …}` renderizava um
  "0" solto quando o orçamento é zero (visível no screenshot); virou `Number(trip.budget) > 0`.
- `app/api/trips/[tripId]/route.ts` (só comentário) — as tags de requisito estavam
  deslocadas em relação ao catálogo (editar marcado como RF03.4, que é "listar viagens").
  Alinhadas: GET = RF03.5, PATCH = RF03.2, DELETE = RF03.3.
- Nenhuma migration: rota (`app/api/trips/[tripId]/route.ts`) e schema
  (`lib/schemas/viagem.ts`) já existem — falta só a tela que chama o PATCH.

## 3. Passos

1. Criar a tela `app/dashboard/trips/[id]/edit/page.tsx`: busca a viagem via
   `GET /api/trips/[id]`, preenche o formulário e salva via `PATCH`.
2. Adicionar botão "Editar" em `app/dashboard/trips/[id]/page.tsx`, visível só
   quando `isOwner` (o PATCH já é restrito a dono via `exigirDono`).
3. Teste de integração do PATCH (`tests/api/trips-patch.test.ts`).
4. E2E do fluxo completo (`e2e/editar-viagem.spec.ts`).
5. `npm run verify`.

## 4. O que testar

Obrigatórios pelo tipo (`route-handler, tela`):

- [x] Integração cobrindo os 4 caminhos: 200 feliz, 401 sem sessão, 403 não-membro, 400 payload invalido
- [x] E2E do fluxo com screenshot arquivado em `docs/pfc/evidencias/` (um por projeto: `chromium` e `mobile`)

> O E2E cria a viagem de partida por `POST /api/trips`, não pela tela "Nova Viagem":
> o campo Destino de lá é o autocomplete do Google Places, que não responde com a
> chave placeholder do ambiente local/CI. A edição em si é feita toda pela UI.

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

Pré-requisito: `npm run setup` concluído e `npm run dev` rodando em http://localhost:3000.

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
8. Repetir os passos 2 a 4 com o DevTools em modo celular (ex.: Pixel 7).
   → Título, status e botão **Editar** empilham sem rolagem lateral; o formulário
   inteiro fica clicável.

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [x] Membro comum não consegue editar viagem de que não participa — `trips-patch.test.ts` (403)
- [x] Data de fim anterior a de inicio e recusada — `trips-patch.test.ts` (400)
- [x] `await params` (nesta versão do Next, params e Promise) — rota usa `await params`; a tela usa `use(params)`
- [x] Corpo validado por zod, com campos extraidos um a um — nunca `...body` — `atualizarViagemSchema` + `.update({ title, destination, … })`
- [x] Autorização checada no servidor via `exigirMembro` / `exigirDono` — `PATCH` chama `exigirDono`
- [x] Funciona em mobile e desktop — E2E passa nos projetos `chromium` e `mobile` (Pixel 7)
- [x] Feedback por `toast()`; sem `alert()` nem `confirm()`
- [x] Estado de erro e de carregamento tratados — "Carregando..." no fetch, "Salvando..." no submit, toast de erro com a mensagem do zod

## 6. Evidência

- [x] Saida dos testes — arquivada em `docs/pfc/evidencias/`:
  - `S03-A-editar-viagem-integracao.txt` — PATCH: 4 de 4 (200, 401, 403, 400)
  - `S03-A-editar-viagem-e2e.txt` — E2E: 2 de 2 (chromium, mobile)
  - Suíte completa (`npm run test`): 14 arquivos, 85 testes passando
- [x] Screenshot ou gravação do fluxo (se houver tela) — `docs/pfc/evidencias/S03-A-editar-viagem-chromium.png`
  e `docs/pfc/evidencias/S03-A-editar-viagem-mobile.png` (detalhe da viagem após salvar, com o toast "Viagem atualizada")
- [x] Delta de cobertura (se mexeu em `lib/`) — não se aplica: nada em `lib/` foi alterado

> Fora do escopo, registrado para o revisor: `e2e/00-fumaca.spec.ts:47` ("rotas
> removidas") falha na `main` também — `/login` e `/register` respondem 200 em vez
> de 404. Confirmado rodando a suíte de fumaça sem as mudanças desta branch.
