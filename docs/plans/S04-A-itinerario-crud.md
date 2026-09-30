---
id: S04-A-itinerario-crud
titulo: Editar, excluir e concluir item de itinerário
trilha: T1
responsavel: audrey
revisor: fernando
semana: S04
requisitos: [RF05]
secoes_doc: [22.1]
branch: feat/S04-A-itinerario-crud
tipo: [route-handler, tela]
depende_de: [S03-A-editar-viagem]
status: em-revisao
---
# Editar, excluir e concluir item de itinerário

> **Audrey** · semana **S04** (16 a 22/09) · marco da semana: _RLS provada por teste_

## 1. Contexto

O campo status existe no tipo e não há interface para altera-lo. Também não há como
editar nem excluir um item depois de criado: a lista do itinerário é só leitura.

Depende de `S03-A-editar-viagem`, que criou `lib/schemas/itinerario.ts` e passou a
criação de item pela API. A branch parte da branch da S03.

## 2. Arquivos afetados

- `lib/schemas/itinerario.ts` (editar) — `atualizarItemItinerarioSchema`: todos os
  campos opcionais, ao menos um obrigatório, mesma regra de horário da criação
- `app/api/trips/[tripId]/itinerary/[itemId]/route.ts` (criar) — `GET`, `PATCH` e
  `DELETE` de um item. `exigirMembro` (qualquer participante edita o roteiro, como na
  criação) e filtro por `trip_id` **e** `id`, para um item de outra viagem responder 404
- `app/dashboard/trips/[id]/itinerary/[itemId]/edit/page.tsx` (criar) — formulário de edição
- `components/itinerary-list.tsx` (editar) — ações por item: **Concluir/Reabrir**,
  **Editar** e **Excluir** (com `ConfirmModal`); item concluído riscado e esmaecido
- `tests/api/itinerary-item-route.test.ts` (criar) — integração de PATCH e DELETE
- `e2e/itinerario-crud.spec.ts` (criar) — concluir, editar e excluir pela UI
- `docs/pfc/05-arquitetura/22-implementacao.md` (criar) — seção 22.1 (Frontend), cobrindo
  as telas entregues na S03 e nesta atividade
- `docs/pfc/03-publico/14-requisitos-funcionais.md` (editar) — status de RF03 e RF05
  revistos pelo critério "Existente = implementação + teste automatizado"
- Nenhuma migration: `itinerary_items.status` já existe, com CHECK
  (`planned`, `confirmed`, `completed`, `cancelled`), e as policies de UPDATE/DELETE
  para membros também.

## 3. Passos

1. Schema de atualização em `lib/schemas/itinerario.ts`.
2. Rota `[itemId]` no molde de `app/api/trips/[tripId]/route.ts`: `await params`,
   `getUser()`, `exigirMembro`, zod, update campo a campo, `respostaDeErro`.
3. Tela de edição, carregando o item pelo `GET` da rota e salvando pelo `PATCH`.
4. Ações na lista: concluir chama `PATCH { status }`; excluir abre `ConfirmModal` e
   chama `DELETE`; ambos com `toast()` e `router.refresh()`.
5. Testes de integração e E2E; `npm run verify`.

## 4. O que testar

Obrigatórios pelo tipo (`route-handler, tela`):

- [x] Integração cobrindo os 4 caminhos: 200 feliz, 401 sem sessão, 403 não-membro, 400 payload invalido
  — `tests/api/itinerary-item-route.test.ts`: PATCH e DELETE nos quatro caminhos, mais 404 para
  item de outra viagem e prova de que `trip_id`/`id` do corpo são descartados
- [x] E2E do fluxo com screenshot arquivado em `docs/pfc/evidencias/` (um por projeto: `chromium` e `mobile`)
  — `e2e/itinerario-crud.spec.ts`: concluir, reabrir, editar, cancelar exclusão e excluir

> Como nos E2E da S03, a viagem e a atividade de partida são criadas pela API; o
> fluxo desta atividade (concluir, editar, excluir) é feito todo pela UI.

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

Pré-requisito: `npm run setup` concluído e `npm run dev` rodando em http://localhost:3000.

1. Entrar como `teste.a@viajamais.local` / `viajamais123`, abrir uma viagem e, na aba
   **Itinerário**, adicionar uma atividade (título, data, 09:00–12:00).
   → O item aparece na lista com os botões **Concluir**, **Editar** e **Excluir**.
2. Clicar em **Concluir**.
   → Toast "Atividade concluída"; o título fica riscado, o card esmaecido, aparece o
   selo "Concluída" e o botão passa a se chamar **Reabrir**.
3. Clicar em **Reabrir**.
   → Toast "Atividade reaberta"; o item volta ao visual normal.
4. Clicar em **Editar**.
   → Abre `/dashboard/trips/<id>/itinerary/<itemId>/edit` com "Carregando..." e depois
   o formulário preenchido.
5. Trocar o título e o local e clicar em **Salvar alterações**.
   → Toast "Atividade atualizada"; volta ao detalhe com os dados novos.
6. Em **Editar**, colocar término 10:00 e início 15:00 e salvar.
   → Toast de erro "o horário de término não pode ser anterior ao de início"; nada muda.
7. Clicar em **Excluir** e, no modal, em **Cancelar**.
   → O modal fecha e o item continua na lista.
8. Clicar em **Excluir** e confirmar.
   → Toast "Atividade excluída"; o item some e o contador "Itinerário" do topo diminui.
9. Entrar como `teste.b@viajamais.local` e abrir direto a URL de edição de um item de A.
   → Toast "Não foi possível carregar a atividade" e volta para "Minhas Viagens".
10. Repetir os passos 2, 4, 5 e 8 no DevTools em modo celular (ex.: Pixel 7).
    → Os botões cabem no card sem rolagem lateral e o modal fica utilizável.

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [x] Item concluido se distingue visualmente — título riscado, cartão esmaecido e selo "Concluída";
  o E2E confere a classe `line-through` e o selo
- [x] So participante da viagem altera o item — 403 em PATCH, DELETE e GET para quem não participa;
  404 para item de outra viagem (filtro por `trip_id` **e** `id`)
- [x] `await params` (nesta versão do Next, params e Promise) — rota usa `await params`; a tela usa `use(params)`
- [x] Corpo validado por zod, com campos extraidos um a um — nunca `...body` — `atualizarItemItinerarioSchema`
  + `.update({ title, description, date, … })`
- [x] Autorização checada no servidor via `exigirMembro` / `exigirDono` — `exigirMembro` nos três métodos
- [x] Funciona em mobile e desktop — E2E passa nos projetos `chromium` e `mobile` (Pixel 7)
- [x] Feedback por `toast()`; sem `alert()` nem `confirm()` — exclusão confirmada pelo `ConfirmModal`
- [x] Estado de erro e de carregamento tratados — "Carregando..." na edição, "Salvando..." no submit,
  botões do item desabilitados durante a requisição, toast de erro com a mensagem do servidor

## 6. Evidência

- [x] Saida dos testes — arquivada em `docs/pfc/evidencias/`:
  - `S04-A-itinerario-integracao.txt` — rota do item: 16 de 16 (PATCH, DELETE e GET)
  - `S04-A-itinerario-e2e.txt` — E2E: 2 de 2 (chromium, mobile)
- [x] Screenshot ou gravação do fluxo (se houver tela):
  - `S04-A-itinerario-concluida-chromium.png` e `-mobile.png` — item concluído (riscado, esmaecido, selo "Concluída")
  - `S04-A-itinerario-excluida-chromium.png` e `-mobile.png` — lista vazia após a exclusão
- [x] Delta de cobertura (se mexeu em `lib/`) — `lib/schemas/itinerario.ts`: 100% de linhas e ramos
  (mantido, com o schema de atualização); `app/api/trips/[tripId]/itinerary/[itemId]/route.ts`
  (novo): 100% de linhas, 83% de ramos

Também nesta atividade: seção 22.1 redigida (`docs/pfc/05-arquitetura/22-implementacao.md`) e
status de RF03.2 e RF05.1–RF05.3, RF05.6, RF05.7 atualizados para Existente no catálogo da
seção 14, pelo critério de implementação com teste automatizado.
