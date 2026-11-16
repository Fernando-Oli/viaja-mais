---
id: S13-F-banco-proprio
titulo: Banco próprio em Postgres, sem Supabase
trilha: T6
responsavel: fernando
revisor: audrey
semana: S13
requisitos: [RNF02.2, RNF02.4, RNF02.10, RNF04.3, RNF04.5]
secoes_doc: [18, 20, 25]
branch: feat/S13-F-sem-supabase
tipo: [migration, rls, infra, seguranca]
depende_de: []
status: em-desenvolvimento
---
# Banco próprio em Postgres, sem Supabase

> **Fernando** · semana **S13** · Etapa 0 de 4 do plano "Avori sem Supabase"

## 1. Contexto

Decisão de 16/11/2026: remover o Supabase, separar a API do Next e rodar tudo
local com `docker compose`. Esta etapa entrega só a base: um Postgres nosso onde as
16 migrations aplicam do zero e as 35 policies de RLS continuam valendo, sem
GoTrue, PostgREST nem Storage.

Branch longa: todas as etapas da migração vão para `feat/S13-F-sem-supabase`. A
`main` fica intocada e entregável até a virada (corte final em 26/11).

Efeito colateral aceito: nesta branch, `npm run dev`, os testes de RLS antigos e
o CI ficam quebrados até as etapas 1 a 3. Nenhum PR vai para a `main` antes disso.

## 2. Arquivos afetados

- `docker-compose.yml` — reescrito: `db`, `minio`, `mailpit`. O serviço `app`
  (Next com variáveis do Supabase) sai; volta na etapa 3 como `web` + `api`.
- `db/Dockerfile` — `postgres:17` com `postgresql-17-cron`.
- `db/init/01-papeis.sh` — papéis e senhas locais (lidas do ambiente).
- `db/init/02-schemas.sql` — schemas `auth` e `extensions`, funções `auth.uid()`
  e `auth.jwt()`.
- `db/init/03-auth.sql` — tabelas do Better Auth no schema `auth`.
- `db/migrations/` — as 16 migrations, movidas com `git mv` de
  `supabase/migrations/`, com edição mínima:
  - `20260910000333_plataforma_schema_base.sql`: sem `pg_graphql`,
    `supabase_vault` e `supabase_realtime`;
  - `20261007200000_social_avatares.sql` e
    `20261021130434_social_avatares_privado.sql`: sem `storage.buckets` (o bucket
    passa a ser criado no MinIO).
  Cada arquivo editado ganha um comentário dizendo o que saiu e por quê.
- `db/migrations/20261117090000_plataforma_auth_proprio.sql` — nova:
  `handle_new_user` lendo `new.name` em vez de `raw_user_meta_data`.
- `db/seed.sql` — o seed atual, sem o bloco de `auth.users`/`auth.identities`.
- `scripts/db/migrar.mjs` — aplica `db/migrations/` em ordem, cada arquivo numa
  transação, registrando em `public.schema_migrations`.
- `scripts/db/semear.mjs` — cria os 4 usuários com os UUIDs de
  `tests/fixtures/usuarios.ts` e a senha com o hash do Better Auth; depois roda
  `db/seed.sql`.
- `scripts/db/resetar.mjs` + `package.json` — `db:reset` = derrubar volume, subir,
  migrar, semear.
- `tests/rls/00-banco-proprio.test.ts` — novo (ver bloco 4).
- `.env.example` — conexões locais do banco novo.

## 3. Passos

1. Carregar `supabase-postgres-best-practices` antes de qualquer SQL.
2. Conferir na documentação do Better Auth: id em UUID, nomes de tabela e coluna
   configuráveis (`users`, `email_verified`, `created_at`...), schema `auth` via
   `search_path`, e a função de hash de senha exportada.
3. Imagem do banco e `db/init/`.
4. `git mv` das migrations e as edições mínimas; migration nova do
   `handle_new_user`.
5. `migrar.mjs`, `semear.mjs`, `resetar.mjs` e os scripts do `package.json`.
6. `tests/rls/00-banco-proprio.test.ts`.
7. `npm run db:reset` duas vezes seguidas e `npx vitest run --config
   vitest.rls.config.mts tests/rls/00-banco-proprio.test.ts`.

### Modelo de papéis

| Papel | Login | O que pode |
|---|---|---|
| `postgres` | sim | Superusuário. Só `scripts/db/*`, nunca a aplicação. |
| `app_api` | sim | **Nenhum privilégio próprio.** `SET ROLE` para `authenticated` ou `service_role`, sem herdar (`with inherit false, set true`). |
| `app_auth` | sim | Só as tabelas de `auth`. É a conexão do Better Auth. |
| `authenticated` | não | As grants atuais. Sujeito à RLS. |
| `anon` | não | Mantido porque as migrations o referenciam. |
| `service_role` | não | `BYPASSRLS`. Só pelo `comoServico()` da etapa 1. |

## 4. O que testar

**Testes automatizados** (`migration`, `rls`, `seguranca`):

- [ ] Aplicação limpa do zero: `npm run db:reset` termina sem erro duas vezes
  seguidas, e `schema_migrations` tem uma linha por arquivo de `db/migrations/`.
- [ ] `tests/rls/00-banco-proprio.test.ts`, conectado como `app_api`:
  - [ ] sem `SET ROLE`, `select` em `public.trips` falha com `permission denied`;
  - [ ] como Ana (`set local role authenticated` + claims), a viagem da Ana
    aparece;
  - [ ] como Bruno, a mesma viagem não aparece (leitura isolada);
  - [ ] como Bruno, `update` na viagem da Ana afeta 0 linhas e `insert` de item
    de itinerário nela é recusado pela RLS (escrita isolada);
  - [ ] `auth.uid()` devolve o `sub` das claims e `null` sem claims.
- [ ] Exploração bloqueada:
  - [ ] `app_api`, mesmo como `authenticated`, não lê `auth.accounts` (onde
    ficam os hashes de senha);
  - [ ] `app_auth` não lê `public.trips`;
  - [ ] a transação termina e a conexão volta ao pool sem papel nem claims
    (`set local`, não `set`).
- [ ] Toda tabela de `public` tem RLS habilitada (o teste `00-estrutura`,
  apontado para `db/migrations/`).

**Roteiro de teste manual:**

1. `docker compose up -d` → os três serviços ficam `healthy`.
2. `npm run db:reset` → termina com "4 usuários e seed aplicados".
3. `docker compose exec db psql -U postgres -d avori -c "select cron.jobname from
   cron.job"` → aparece o job de poda do histórico de pesquisa.
4. Mailpit em http://localhost:58025 e console do MinIO em http://localhost:59001
   abrem.

## 5. O que validar

- [ ] Nenhum `supabase` em `db/`, `scripts/db/` e `docker-compose.yml`, exceto nos
  comentários que explicam o que foi retirado.
- [ ] As 35 `create policy` das migrations continuam presentes e sem edição.
- [ ] Nenhuma senha de banco no repositório além das locais de desenvolvimento,
  lidas do ambiente pelo `db/init/01-papeis.sh`.
- [ ] Uma conexão como `app_api` sem `SET ROLE` não lê nenhuma tabela de `public`
  nem de `auth`.
- [ ] As portas não colidem com o Supabase local (54321-54324): banco 55432,
  MinIO 59000/59001, Mailpit 58025/51025.
- [ ] Toda edição numa migration existente tem comentário com o motivo.

## Andamento (16/11/2026)

Feito e verificado:

- `npm run db:reset` duas vezes seguidas, sem erro: 17 migrations, 4 usuários,
  job `social-apagar-pesquisas-vencidas` no `pg_cron`, 49 policies em `public`.
- `tests/rls/00-banco-proprio.test.ts`: 17 de 17. Com a RLS de `trips`
  desligada e `app_api` herdando `authenticated`, 5 falham, como deveriam.
- As migrations aparecem como renomeação: 45 linhas a mais e 12 a menos nos 17
  arquivos, das quais 32 são a migration nova.

Mudou em relação ao plano:

- **MinIO fora do compose desta etapa.** O armazenamento só é usado pelos
  avatares (etapa 2). A escolha do serviço fica para lá; conferir antes se a
  imagem comunitária do MinIO ainda é publicada e mantida.
- **O seed não cria usuário em SQL.** O hash do Better Auth (scrypt) não sai do
  SQL; `semear.mjs` grava os usuários e depois roda `db/seed.sql`. Os ids
  passaram a morar em `tests/fixtures/usuarios.ts`.
- **Better Auth fixado em 1.7.14** (26/10), não na última versão (14/11).

Fica para a etapa 1:

- `tests/rls/00-estrutura.test.ts` e os demais ainda leem `supabase/` e o
  `supabase-js`; voltam com o `apoio.ts` novo.
- `public.get_current_user_email()` lê o e-mail de `auth.jwt()`. O
  `comoUsuario()` da API precisa pôr `email` nas claims, não só `sub`.
- `npm run db:types` ainda chama o Supabase; vira `kysely-codegen`.
- `supabase/config.toml`, `templates/` e `README.md` continuam no repositório
  até a etapa 3.

## 6. Evidência

- [ ] Saída de duas execuções seguidas de `npm run db:reset`
- [ ] Saída de `tests/rls/00-banco-proprio.test.ts`
- [ ] Saída de `\du` mostrando os papéis e atributos
