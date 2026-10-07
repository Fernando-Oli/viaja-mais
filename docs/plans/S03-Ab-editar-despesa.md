---
id: S03-Ab-editar-despesa
titulo: Editar e excluir despesa
trilha: T1
responsavel: abner
revisor: fernando
semana: S03
requisitos: [RF06]
secoes_doc: [22.1]
branch: feat/S03-Ab-editar-despesa
tipo: [route-handler, tela]
depende_de: []
status: em-revisao
---
# Editar e excluir despesa

> **Abner** · semana **S03** (09 a 15/09) · marco da semana: _Convite chega no e-mail de verdade_

## 1. Contexto

Despesas só podem ser criadas. Erro de digitação em valor e permanente.

## 2. Arquivos afetados

Sem migration — a tabela `expenses` já existe desde `20260910000333_plataforma_schema_base.sql`.

- `lib/schemas/despesa.ts` — extrai os campos para um `base` compartilhado e adiciona `atualizarDespesaSchema` (parcial, mesmas regras de `amount`/`date`/`category`)
- `app/api/trips/[tripId]/expenses/[expenseId]/route.ts` (novo) — GET/PATCH/DELETE de uma despesa
- `components/expense-list.tsx` (novo) — lista com editar/excluir, botões visíveis só para autor/dono
- `app/dashboard/trips/[id]/expenses/[expenseId]/edit/page.tsx` (novo) — formulário de edição
- `app/dashboard/trips/[id]/page.tsx` — aba "Despesas" passa a usar `ExpenseList` em vez do `<div>` inline
- `tests/api/expense-item-route.test.ts` (novo) — 200/401/403/404/400, incluindo o 403 de membro que não é autor nem dono
- `e2e/editar-despesa.spec.ts` (novo) — fluxo completo pela UI

## 3. Passos

1. Seguir o molde de `app/api/trips/[tripId]/bookings/[bookingId]/route.ts` para o novo route handler.
2. Diferença do molde: reserva pode ser editada por qualquer membro; despesa não — adicionar `exigirAutorOuDono`
   (local ao arquivo, não em `lib/authz/trip.ts`, que é domínio do Fernando) usando o papel já devolvido por
   `exigirMembro`.
3. Schema de atualização parcial em `lib/schemas/despesa.ts`, no mesmo molde de `atualizarItemItinerarioSchema`.
4. Componente de lista com `ConfirmModal`, no molde de `components/booking-list.tsx`, condicionando os botões
   de ação a `isOwner || expense.user_id === currentUserId`.
5. Tela de edição no molde de `app/dashboard/trips/[id]/bookings/[bookingId]/edit/page.tsx`.
6. Trocar a lista inline da aba Despesas pelo novo componente.

## 4. O que testar

Obrigatórios pelo tipo (`route-handler, tela`):

- [x] Integração cobrindo os 4 caminhos: 200 feliz, 401 sem sessão, 403 não-membro, 400 payload invalido —
      `tests/api/expense-item-route.test.ts`, mais um 403 extra para membro que não é autor nem dono
- [x] E2E do fluxo com screenshot arquivado em `docs/pfc/evidencias/` — `e2e/editar-despesa.spec.ts`
      (escrito; não executado nesta sessão por falta de Node.js/navegador no ambiente — ver bloco 6)

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. Logar como `teste.a@viajamais.local`, abrir uma viagem, aba Despesas, clicar "Adicionar Despesa" e salvar
   uma despesa qualquer. Esperado: volta para a aba Despesas e a despesa aparece na lista.
2. Na despesa criada, clicar "Editar", mudar o valor e salvar. Esperado: volta para a aba Despesas com o novo
   valor.
3. Clicar "Excluir", cancelar no modal. Esperado: despesa continua na lista.
4. Clicar "Excluir" de novo, confirmar no modal. Esperado: despesa some da lista.
5. Logar como `teste.b@viajamais.local` (não-membro desta viagem) e tentar `GET /api/trips/<id>/expenses/<id>`
   direto. Esperado: 403.
6. Convidar o usuário B para a viagem como membro comum (não dono) e, logado como B, tentar editar uma
   despesa registrada por A. Esperado: 403 — botões "Editar"/"Excluir" nem aparecem para B nessa despesa, e a
   rota rejeita mesmo se chamada direto.

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [x] So quem registrou a despesa, ou o dono da viagem, pode altera-la —
      `exigirAutorOuDono` em `app/api/trips/[tripId]/expenses/[expenseId]/route.ts`
- [x] Exclusao pede confirmação pelo ConfirmModal — `components/expense-list.tsx`
- [x] `await params` (nesta versão do Next, params e Promise)
- [x] Corpo validado por zod, com campos extraidos um a um — nunca `...body`
- [x] Autorização checada no servidor via `exigirMembro` (participação) combinado com a checagem de
      autoria/dono acima — não existe `exigirDono` aqui porque a regra é "autor OU dono", não só dono
- [x] Funciona em mobile e desktop — mesmas classes responsivas do `booking-list.tsx` (empilha em telas estreitas)
- [x] Feedback por `toast()`; sem `alert()` nem `confirm()`
- [x] Estado de erro e de carregamento tratados — `isFetching`/`isLoading` na tela de edição

## 6. Evidência

- [ ] Saida dos testes — não executada nesta sessão: o ambiente não tem Node.js/npm acessível
      (`node`/`npm`/`npx` não encontrados no PATH). Rodar `npm run test` para confirmar antes do PR.
- [ ] Screenshot ou gravação do fluxo — `e2e/editar-despesa.spec.ts` escrito, não executado (mesmo motivo;
      também depende do stack local do Supabase rodando). Rodar `npm run e2e` localmente.
- [ ] Delta de cobertura — depende de `npm run test:cov`, não executado pelo mesmo motivo.
