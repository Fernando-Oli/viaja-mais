#!/bin/bash
# Papéis do banco. Roda uma vez, na criação do volume.
#
# O modelo, em uma frase: a aplicação conecta com um papel que sozinho não lê
# nada, e em cada transação assume o papel do usuário — e aí a RLS decide.
#
#   postgres       superusuário. Só scripts/db/*, nunca a aplicação.
#   app_api        login da API. Nenhum privilégio próprio. Pode fazer SET ROLE
#                  para authenticated ou service_role, mas NÃO herda os
#                  privilégios deles: sem o SET ROLE explícito, não lê tabela
#                  nenhuma. Esquecer o `comoUsuario()` vira erro, não vazamento.
#   app_auth       login do Better Auth. Só as tabelas do schema auth.
#   authenticated  usuário logado. Sujeito à RLS. É o papel das policies.
#   anon           visitante. Mantido porque as migrations o referenciam.
#   service_role   ignora a RLS (BYPASSRLS). Só pelo comoServico() da API.
#
# authenticated, anon e service_role têm os mesmos nomes do Supabase de
# propósito: as 35 policies e as grants das migrations continuam valendo sem
# edição.
#
# As senhas vêm do ambiente (docker-compose.yml). São de desenvolvimento local.
set -euo pipefail

: "${APP_API_SENHA:?defina APP_API_SENHA}"
: "${APP_AUTH_SENHA:?defina APP_AUTH_SENHA}"

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_api_senha="$APP_API_SENHA" \
  -v app_auth_senha="$APP_AUTH_SENHA" <<-'SQL'
	create role anon          nologin noinherit;
	create role authenticated nologin noinherit;
	create role service_role  nologin noinherit bypassrls;

	create role app_api  login noinherit password :'app_api_senha';
	create role app_auth login noinherit password :'app_auth_senha';

	-- Postgres 16+: SET sem INHERIT. app_api pode assumir o papel, mas não
	-- carrega os privilégios dele enquanto não assumir.
	grant authenticated to app_api with inherit false, set true;
	grant service_role  to app_api with inherit false, set true;

	-- Sem isto, qualquer papel com login enxerga o schema public por padrão.
	-- As migrations concedem USAGE nominalmente a anon, authenticated e
	-- service_role; app_api e app_auth ficam de fora.
	revoke all on schema public from public;
SQL
