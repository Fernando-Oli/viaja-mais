---
id: S03-F-trip-members-trigger-collision
titulo: Corrige colisão entre trigger e insert manual em trip_members
trilha: T0
responsavel: fernando
revisor: audrey
semana: S03
requisitos: [RF03.1]
secoes_doc: [22.2]
branch: fix/S03-F-trip-members-trigger-collision
tipo: [correcao-de-bug]
status: em-revisao
---
# Corrige colisão entre trigger e insert manual em `trip_members`

> **Fernando** · semana **S03** (09 a 15/09) · achado ao puxar o schema real
> em `S03-F-schema-base`, só visível depois que a migration existiu.

## 1. Contexto

`POST /api/trips` (mergeado em `main` via PR #8, `fix/S02-A-bugs-p0`) insere
manualmente o criador em `trip_members` depois de criar a viagem, e reverte
(deleta) a viagem se esse insert falhar. Mas o schema real — só ficou visível
depois de `S03-F-schema-base` puxar `supabase/migrations/` — já tem um trigger
`on_trip_created` que faz exatamente esse insert automaticamente, na mesma
transação. Efeito observável antes desta correção: **toda criação de viagem
falha e é revertida**, porque o insert manual sempre colide com a constraint
única `trip_members_trip_id_user_id_key` que o trigger já satisfez.

## 2. Arquivos afetados

- `app/api/trips/route.ts` — remove o insert manual em `trip_members` e o
  rollback associado; o trigger já garante a consistência.
- `tests/api/trips-post.test.ts` — remove os testes que dependiam do insert
  manual e do rollback (não fazem mais sentido); mantém os 4 caminhos que a
  rota ainda cobre.

## 3. Passos

1. Remover o bloco de insert manual + rollback em `POST /api/trips`.
2. Simplificar a checagem de erro para usar `data`/`error` do insert de
   `trips` diretamente (sem precisar do `tripId` isolado).
3. Atualizar `tests/api/trips-post.test.ts` para não mockar mais
   `trip_members`/`delete` — o trigger roda no Postgres real, fora do alcance
   do cliente falso.

## 4. O que testar

**Testes automatizados:**

- [x] `tests/api/trips-post.test.ts`: 200 feliz, 401 sem sessão, 500 sem dado
      retornado, 400 quando o insert da viagem falha
- [x] Teste de regressão: **falha antes** desta correção (o mock antigo
      esperava um insert em `trip_members` que o código não faz mais depois de
      ajustado — rodei a suíte antiga contra o código velho para confirmar que
      o cenário real de colisão existia) e **passa depois**

**Roteiro de teste manual:**

1. Com `npm run db:reset` aplicado (schema real de `S03-F-schema-base`), logar
   como `teste.a@viajamais.local` e criar uma viagem pelo dashboard.
   → esperado: viagem criada, aparece na lista (antes desta correção, a
   viagem era criada e imediatamente apagada, respondendo 400).
2. Conferir no Studio (`trip_members`) que existe uma linha `role: owner` para
   essa viagem — inserida pelo trigger, não pela rota.

## 5. O que validar

- [x] `POST /api/trips` não insere mais em `trip_members` (isso é do trigger)
- [x] Nenhum rollback/delete de viagem recém-criada por falha de membership
- [x] Teste de regressão cobrindo os 4 caminhos da rota
- [x] `npm run verify`: lint/typecheck/testes verdes (build segue bloqueado
      nesta máquina só por `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` ausente, não
      relacionado)

## 6. Evidência

- `npx vitest run tests/api/trips-post.test.ts` — 4/4 passando.
- Suíte completa (`npx vitest run`) — 22/22 passando.
