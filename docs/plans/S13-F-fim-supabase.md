---
id: S13-F-fim-supabase
titulo: Fim do Supabase no repositório
trilha: T6
responsavel: fernando
revisor: audrey
semana: S13
requisitos: [RNF02.4, RNF02.8, RNF02.10, RNF04.6, RF09.7]
secoes_doc: [18, 20, 22.2, 25]
branch: feat/S13-F-sem-supabase
tipo: [infra, rls, seguranca]
depende_de: [S13-F-telas-auth]
status: em-desenvolvimento
---
# Fim do Supabase no repositório

> **Fernando** · semana **S13** · Etapa 3 de 4 do plano "Avori sem Supabase", limpeza

## 1. Contexto

Com as telas de autenticação portadas (S13-F-telas-auth), nenhuma tela e
nenhuma rota usa o Supabase. Sobravam o código de apoio, os pacotes, a pasta
`supabase/`, o CI e os 20 arquivos de `tests/rls`, que logavam pelo GoTrue e
consultavam pelo PostgREST.

## 2. O que muda

- **Testes de RLS sem PostgREST.** `tests/rls/cliente-sql.ts` tem a forma do
  `supabase-js` que os testes usavam e roda cada chamada numa transação com o
  papel e as claims do usuário, como a API (`comoUsuario`). Os 5 mil linhas de
  asserção continuam as mesmas. Onde o teste prova a consulta de uma rota
  (`03`, `09`, `10`), ele passa a chamar o repositório da API por `naApi()`, em
  vez das funções de `lib/` que só existiam para o Supabase.
  - `05-avatares`: os casos do Storage saem com ele; fica o check de
    `avatar_url`. O bucket S3 é provado em `tests/integracao/foto.test.ts`.
  - `14-politica-senha`: a regra é provada no cadastro do Better Auth.
  - `08`: o caso do event trigger `issue_pg_cron_access`, que só existia no
    Supabase, vira só "um novo CREATE EXTENSION não quebra".
- **`search_path` com `extensions`** no banco (`db/init/02-schemas.sql`), como
  o Supabase configurava: sem ele, o `=` do `citext` caía na comparação de
  `text`. A API normaliza o username para minúsculas, então não havia efeito
  visível, mas o banco divergia do que as migrations supõem.
- **Projeção pública da viagem (RF09.7)**: `lib/trips/publico.ts` vira
  `api/modulos/viagens/publico.ts`, em Kysely, com teste contra o banco
  (`tests/rls/17-projecao-publica.test.ts`).
- **Limite por usuário**: sai o `exigirLimite()` do PostgREST; o fail-open do
  `exigirLimiteNaTx()` da API ganha teste contra o banco
  (`tests/integracao/limite.test.ts`).
- **`lib/authz/trip.ts`**: só a fonte de papel por função (a da API).
- **Removidos**: `lib/supabase/*`, `lib/social/{avatar,rede,solicitacoes}.ts`,
  `lib/trips/escopo.ts`, os dublês de `tests/api/`, os pacotes `@supabase/*`,
  a pasta `supabase/`, as variáveis `NEXT_PUBLIC_SUPABASE_*`,
  `SUPABASE_SERVICE_ROLE_KEY` e `DATABASE_URL` de `lib/env.ts`.
- **Ambiente**: `npm run setup` sobe o compose e recria o banco; o Playwright
  sobe a API junto com o Next; `db.yml` e o E2E do `ci.yml` usam o
  `docker-compose.yml`; `.env.example` documenta as variáveis da API.

## 3. O que testar

- [x] `tests/rls`: os 20 arquivos rodando sem Supabase, mais a projeção pública.
- [x] `tests/integracao`: inteira, mais o limite (passa, 429, fail-open sem
  abortar a transação).
- [x] Unitária, cobertura acima do corte, rastreabilidade.
- [x] Build de produção sem as variáveis do Supabase.
- [ ] E2E (Chromium) com a API e o Next locais.

## 4. O que validar

- [x] Nenhum import de `@supabase/*` no repositório.
- [x] Os testes de RLS continuam provando com o papel do usuário, não como
  superusuário (o cliente assume `authenticated`/`anon` por transação).
- [x] A guarda de ambiente continua recusando banco que não seja local.

## Fica para a etapa 4

- `types/database.ts` (gerado pelo Supabase, sem uso no código) e as skills e
  o `.mcp.json` do Supabase: decisão do time.
- `CLAUDE.md`, `README.md` e os agentes em `.claude/` ainda descrevem o fluxo
  do Supabase.
