-- Schemas que as migrations herdadas do Supabase esperam encontrar.
--
-- No Supabase, `auth` e `extensions` já existiam antes da primeira migration. Aqui
-- somos nós que os criamos, com o mínimo: as migrations só usam `auth.uid()`,
-- `auth.jwt()`, `auth.users (id)` e funções de extensão em `extensions`.

create schema extensions;
revoke all on schema extensions from public;
grant usage on schema extensions to anon, authenticated, service_role;

-- `extensions` no search_path de toda conexão, como o Supabase configurava.
-- Sem isto, os operadores do citext (que moram em `extensions`) não são
-- encontrados e `profiles.username = 'Ana'` cai na comparação de text, que
-- diferencia maiúsculas: /u/Ana deixava de achar a conta `ana`. Vale no
-- banco, e não por papel, porque papel assumido por SET ROLE não lê a
-- configuração do papel.
do $$
begin
  execute format('alter database %I set search_path = "$user", public, extensions', current_database());
end
$$;

create schema auth;
revoke all on schema auth from public;
-- USAGE para que as policies possam chamar auth.uid(). Não dá acesso a nenhuma
-- tabela: SELECT em auth.users, auth.accounts etc. não é concedido a ninguém
-- além de app_auth (ver 03-auth.sql).
grant usage on schema auth to anon, authenticated, service_role, app_auth;

-- ---------------------------------------------------------------------------
-- Identidade do usuário na transação
--
-- A API abre cada requisição com:
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub": "<uuid>", ...}', true);
-- e as policies leem daqui. `true` em set_config = vale só até o fim da
-- transação; a conexão volta ao pool limpa.
--
-- Mesmo contrato das funções do Supabase, inclusive a leitura de
-- `request.jwt.claim.sub`, que algumas versões do PostgREST preenchiam.
-- ---------------------------------------------------------------------------

create function auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

create function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    auth.jwt() ->> 'sub'
  )::uuid
$$;

create function auth.role() returns text
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    auth.jwt() ->> 'role'
  )::text
$$;

revoke all on function auth.jwt(), auth.uid(), auth.role() from public;
grant execute on function auth.jwt(), auth.uid(), auth.role()
  to anon, authenticated, service_role;

-- Controle de migrations aplicadas. Fora de `public` de propósito: não é dado da
-- aplicação, e o teste de estrutura exige RLS em toda tabela de `public`.
create schema controle;
revoke all on schema controle from public;
create table controle.schema_migrations (
  versao     text primary key,
  aplicada_em timestamptz not null default now()
);
