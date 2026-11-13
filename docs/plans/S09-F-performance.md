---
id: S09-F-performance
titulo: Performance e observabilidade
trilha: T0
responsavel: fernando
revisor: audrey
semana: S09
requisitos: [RNF01.1, RNF01.2, RNF01.3, RNF01.4, RNF01.5, RNF06.4]
secoes_doc: [15, 20]
branch: chore/S09-F-performance
tipo: [infra, migration, route-handler]
depende_de: []
status: em-revisao
---
# Performance e observabilidade

> **Fernando** · planejada para a S09, feita na S12 (13/11).

## 1. Contexto

Os cinco requisitos de performance (RNF01) estavam como "Planejado", e o catálogo dizia que nenhum tinha sido medido. Quatro problemas eram conhecidos:

1. **Índices.** As 12 chaves estrangeiras das tabelas herdadas do dump original não tinham índice, entre elas `trip_id` de despesas, reservas, lugares e itinerário, lida em toda abertura de viagem. As tabelas criadas pela equipe tinham índice em todas.
2. **N+1 nos convites.** `GET /api/invitations` fazia uma consulta por convite para buscar a viagem. **E as N voltavam vazias:** quem foi convidado ainda não enxerga a viagem pela RLS, então o cartão do convite nunca mostrava o nome dela.
3. **Listas sem limite** (RNF01.4, RNF06.4).
4. **Log sem padrão:** não havia como achar no log o erro que alguém relatou.

## 2. Arquivos afetados

- `supabase/migrations/20261113100000_plataforma_indices.sql` — 15 índices; os das abas da viagem são compostos com a coluna de ordenação da tela
- `supabase/migrations/20261113101000_plataforma_meus_convites.sql` + `app/api/invitations/route.ts` — convites com a viagem (título, destino, datas) numa consulta só
- `lib/listagem.ts` + rotas de listagem de `app/api/trips/**` e páginas de reservas e lugares — `limit(500)`; `lib/trips/publico.ts` — no máximo 200 itens, o limite que `trip_posts` aceita
- `lib/http.ts` — `respostaDeErro` gera um código por erro inesperado, no log e no cabeçalho `X-Codigo-Erro`
- `scripts/pfc/medir-desempenho.mjs` (`npm run pfc:desempenho`) — mede RNF01.1, RNF01.2 e um indício do RNF01.3 contra qualquer URL
- testes: `tests/rls/15-indices.test.ts`, `tests/rls/16-meus-convites.test.ts`, `tests/api/invitations-get.test.ts`, conferência do `limit` nos testes de listagem, `tests/lib/http.test.ts`
- `docs/pfc/03-publico/15-requisitos-nao-funcionais.md` — status com os números

## 3. Passos

1. Migration de índices + teste estrutural e de plano de execução.
2. N+1 dos convites, com função no banco.
3. Limite nas listagens.
4. Código de erro no log.
5. Medição e status no catálogo.

## 4. O que testar

- [x] `tests/rls/15-indices.test.ts`: **toda** chave estrangeira do schema `public` tem índice que começa por ela (falhava antes da migration: 12)
- [x] `EXPLAIN` das quatro abas da viagem usa os índices novos, com volume sintético em transação desfeita. Aba Despesas com 100 mil linhas: 12,2 ms → 0,49 ms
- [x] `GET /api/invitations`: com 10 convites, **1** consulta, e o cartão recebe a viagem
- [x] `meus_convites_pendentes`: só o e-mail da sessão, só pendentes, só as quatro colunas, sem `EXECUTE` para anon
- [x] Listagens: o teste de cada rota confere `limit(500)`; o helper do post confere `limit(200)`
- [x] `respostaDeErro`: o mesmo código no log e no cabeçalho, e o corpo continua genérico
- [ ] `npm run verify`, RLS e E2E completo verdes

## 5. O que validar

- [x] Nenhuma chave estrangeira sem índice (RNF01.5)
- [x] O plano de execução das abas da viagem não faz `Seq Scan` na tabela grande
- [x] Convites em 1 consulta, independente da quantidade
- [x] Toda listagem com limite explícito (RNF06.4), exceto o acerto e os totais de finanças, que somam despesas
- [x] RNF01.1 e RNF01.2 medidos no build de produção local: p95 de 249 ms e 220 ms
- [ ] RNF01.1 e RNF01.2 medidos no ambiente publicado (`MEDIR_URL=… MEDIR_EMAIL=… MEDIR_SENHA=… MEDIR_AMBIENTE=producao npm run pfc:desempenho`)
- [x] RNF01.3 com status honesto: indício com 50 simultâneas, e justificativa de por que mil não se verificam aqui

## 6. Evidência

- [x] `docs/pfc/evidencias/S09-F-indices.md`
- [x] `docs/pfc/evidencias/S09-F-desempenho-local.md`
