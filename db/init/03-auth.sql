-- Tabelas do Better Auth, no schema auth.
--
-- Geradas por `node scripts/db/gerar-esquema-auth.mjs` a partir de
-- `api/auth/esquema.ts` (better-auth 1.7.14) e qualificadas com o schema. Ao
-- atualizar o better-auth, gere de novo e compare.
--
-- Precisam existir ANTES das migrations: `20260910000333_plataforma_schema_base`
-- cria `references auth.users (id)` e o gatilho `on_auth_user_created`, como era
-- no Supabase. Por isso ficam em db/init e não numa migration.
--
-- Sem RLS de propósito. Só app_auth tem privilégio nessas tabelas, e ele as usa
-- inteiras (o Better Auth lê a sessão de qualquer usuário para validá-la). A
-- barreira aqui é a grant, não a policy: app_api e authenticated não têm
-- SELECT em nada deste schema — e o teste 00-banco-proprio prova isso.

create table auth.users (
  id             uuid primary key default pg_catalog.gen_random_uuid(),
  name           text not null,
  email          text not null unique,
  email_verified boolean not null,
  image          text,
  created_at     timestamptz not null default current_timestamp,
  updated_at     timestamptz not null default current_timestamp
);

create table auth.sessions (
  id         uuid primary key default pg_catalog.gen_random_uuid(),
  expires_at timestamptz not null,
  token      text not null unique,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null,
  ip_address text,
  user_agent text,
  user_id    uuid not null references auth.users (id) on delete cascade
);
create index sessions_user_id_idx on auth.sessions (user_id);

-- `password` guarda o hash (scrypt), nunca a senha. É a tabela mais sensível do
-- banco.
create table auth.accounts (
  id                       uuid primary key default pg_catalog.gen_random_uuid(),
  account_id               text not null,
  provider_id              text not null,
  user_id                  uuid not null references auth.users (id) on delete cascade,
  access_token             text,
  refresh_token            text,
  id_token                 text,
  access_token_expires_at  timestamptz,
  refresh_token_expires_at timestamptz,
  scope                    text,
  password                 text,
  created_at               timestamptz not null default current_timestamp,
  updated_at               timestamptz not null
);
create index accounts_user_id_idx on auth.accounts (user_id);

-- Tokens de verificação de e-mail e de recuperação de senha.
create table auth.verifications (
  id         uuid primary key default pg_catalog.gen_random_uuid(),
  identifier text not null,
  value      text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);
create index verifications_identifier_idx on auth.verifications (identifier);

-- Limite de tentativas compartilhado entre as réplicas da API.
create table auth.rate_limits (
  id           uuid primary key default pg_catalog.gen_random_uuid(),
  key          text not null unique,
  count        integer not null,
  last_request bigint not null
);

grant select, insert, update, delete
  on auth.users, auth.sessions, auth.accounts, auth.verifications, auth.rate_limits
  to app_auth;
