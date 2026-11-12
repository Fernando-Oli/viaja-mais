---
id: S06-A-lugares
titulo: Lugares: marcar visitado e escopo de grupo
trilha: T1
responsavel: audrey
revisor: fernando
semana: S06
requisitos: [RF08]
secoes_doc: [22.1]
branch: feat/S06-A-lugares
tipo: [tela, route-handler]
depende_de: []
status: em-revisao
---
# Lugares: marcar visitado e escopo de grupo

> **Audrey** · semana **S06** (30/09 a 06/10) · marco da semana: _Fluxo de grupo ponta a ponta_

## 1. Contexto

O selo de visitado é renderizado e não há como alterná-lo.

Além disso, a tela "Lugares da Viagem" (`app/dashboard/trips/[id]/places/page.tsx`) insere e
exclui `places` direto do navegador, com `confirm()` e `alert()`. A rota
`app/api/trips/[tripId]/places/route.ts` faz `.insert({ ...body })` sem zod e sem
`exigirMembro`, e o GET de quem não participa devolvia lista vazia em vez de 403. É a última
limitação registrada na seção 22.1.

Escopo de grupo: qualquer membro da viagem salva, marca como visitado e exclui lugares. As
policies de `places` para membros já existem (`20260910000333_plataforma_schema_base.sql`) e
são cobertas por `tests/rls/03-escopo-grupo.test.ts`.

A branch parte da `main` com S03, S04 e S05 já mergeados (PR #25).

## 2. Arquivos afetados

- `lib/schemas/lugar.ts` (criar) — `criarLugarSchema` (nome, endereço, coordenadas nas faixas
  de NUMERIC(10,8)/NUMERIC(11,8), nota de 0 a 5, observações) e `atualizarLugarSchema`
  (`visited` e `notes`)
- `app/api/trips/[tripId]/places/route.ts` (editar) — GET e POST no molde da rota de
  referência: `exigirMembro`, zod, insert campo a campo, `user_id` da sessão
- `app/api/trips/[tripId]/places/[placeId]/route.ts` (criar) — PATCH (visitado/observações) e
  DELETE de um lugar, com filtro por `trip_id` **e** `id`
- `components/place-list.tsx` (criar) — lista de lugares com **Marcar visitado** /
  **Desmarcar visitado** e **Excluir** (com `ConfirmModal`), feedback por `toast()`
- `app/dashboard/trips/[id]/places/page.tsx` (editar) — lê e grava pela API; usa `PlaceList`;
  estados de carregamento e de erro; "Voltar" leva à aba Lugares
- `app/dashboard/trips/[id]/page.tsx` (editar) — aba **Lugares** usa `PlaceList`
- `tests/api/places-route.test.ts` (criar) — integração do POST/GET da lista
- `tests/api/place-item-route.test.ts` (criar) — integração de PATCH/DELETE de um lugar
- `e2e/lugares.spec.ts` (criar) — marcar visitado, recarregar, desmarcar, excluir
- `docs/pfc/05-arquitetura/22-implementacao.md` (editar) — seção 22.1: retira a limitação
- `docs/pfc/03-publico/14-requisitos-funcionais.md` (editar) — status de RF08
- Nenhuma migration: a coluna `visited` e as policies de UPDATE/DELETE para membros já existem.

## 3. Passos

1. Schema em `lib/schemas/lugar.ts`.
2. Reescrever a rota da lista e criar a rota `[placeId]` no molde de `app/api/trips/[tripId]/route.ts`.
3. `components/place-list.tsx`, usado na aba Lugares e na tela "Lugares da Viagem".
4. Trocar o insert/delete direto da tela por `fetch` às rotas; `toast()` e `ConfirmModal` no
   lugar de `alert()`/`confirm()`.
5. Testes de integração e E2E; `npm run verify`.
6. Atualizar a seção 22.1 e o catálogo.

## 4. O que testar

Obrigatórios pelo tipo (`tela, route-handler`):

- [x] E2E do fluxo com screenshot arquivado em `docs/pfc/evidencias/` (um por projeto: `chromium` e `mobile`)
  — `e2e/lugares.spec.ts`: marcar visitado na aba, recarregar, conferir na tela de lugares,
  desmarcar, recarregar, cancelar exclusão e excluir
- [x] Integração cobrindo os 4 caminhos: 200 feliz, 401 sem sessão, 403 não-membro, 400 payload invalido
  — `tests/api/places-route.test.ts` (POST e GET) e `tests/api/place-item-route.test.ts`
  (PATCH e DELETE), mais 404 para lugar de outra viagem e prova de que `user_id`, `trip_id`,
  `id`, `name` e `visited` vindos do corpo são descartados onde não são permitidos

> O lugar de partida é criado pela API: a busca usa o Google Places, que não carrega com a
> chave de teste. O que o E2E prova é a tela de marcar visitado e excluir.

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

Pré-requisito: `npm run setup` concluído, `npm run dev` rodando em http://localhost:3000 e
uma chave real em `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (só para o passo 2).

1. Entrar como `teste.a@viajamais.local` / `viajamais123`, abrir uma viagem e a aba **Lugares**.
   → Sem lugares: mensagem "Nenhum lugar salvo" e botão **Adicionar Lugar**.
2. Clicar em **Adicionar Lugar**, buscar "Marco Zero Recife", selecionar, escrever uma
   observação e clicar em **Salvar Lugar**.
   → Toast "Lugar salvo"; o lugar aparece em "Lugares Salvos (1)".
3. Clicar em **Marcar visitado**.
   → Toast "Lugar marcado como visitado"; aparece o selo verde "Visitado" e o botão vira
   **Desmarcar visitado**.
4. Recarregar a página (F5).
   → O selo "Visitado" continua.
5. Clicar em **Voltar**.
   → Abre o detalhe da viagem já na aba Lugares, com o selo "Visitado".
6. Clicar em **Desmarcar visitado** e recarregar.
   → O selo some e continua sumido após recarregar.
7. Clicar na lixeira e, no modal, em **Cancelar**.
   → O modal fecha e o lugar continua.
8. Clicar na lixeira e confirmar **Excluir**.
   → Toast "Lugar removido"; aparece "Nenhum lugar salvo".
9. No DevTools, aba Network, confirmar que salvar, marcar e excluir disparam
   `POST`/`PATCH`/`DELETE` em `/api/trips/<id>/places...` e nenhuma requisição direta ao
   Supabase (`/rest/v1/places`).
10. Entrar como `teste.b@viajamais.local` e abrir `/dashboard/trips/<id de A>/places`.
    → Mensagem de erro "Sem permissão para acessar esta viagem" no lugar da lista.
11. Repetir os passos 3, 4 e 8 no DevTools em modo celular (ex.: Pixel 7).
    → Botões cabem no cartão (quebram linha se preciso) e o modal fica utilizável.

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [x] Estado persiste após recarregar — E2E marca, recarrega e confere o selo; desmarca,
  recarrega e confere o botão "Marcar visitado"
- [x] Funciona em mobile e desktop — E2E roda nos projetos `chromium` e `mobile` (Pixel 7);
  o cabeçalho da aba e os botões do cartão quebram linha
- [x] Feedback por `toast()`; sem `alert()` nem `confirm()` — exclusão confirmada pelo
  `ConfirmModal`; `alert()` e `confirm()` removidos da tela
- [x] Estado de erro e de carregamento tratados — "Carregando lugares..." na abertura,
  mensagem de erro do servidor se a leitura falhar, "Salvando..." no submit, botões do cartão
  travados com spinner durante a requisição, toast de erro com a mensagem do servidor

## 6. Evidência

- [x] Saida dos testes — `docs/pfc/evidencias/S06-A-lugares-testes.txt` e `S06-A-lugares-e2e.txt`
- [x] Screenshot ou gravação do fluxo (se houver tela) — `docs/pfc/evidencias/S06-A-lugares-visitado-{chromium,mobile}.png`
  e `S06-A-lugares-excluido-{chromium,mobile}.png`
- [ ] Delta de cobertura (se mexeu em `lib/`) — `lib/schemas/lugar.ts` é só declaração de
  schema zod, exercitada pelos testes de integração; não há regra de negócio nova em `lib/`
