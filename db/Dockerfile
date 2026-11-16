# Postgres do Avori: a imagem oficial mais a extensão pg_cron.
#
# pg_cron vem do repositório PGDG, que a imagem oficial já traz configurado. É
# necessário porque `20261021191609_social_historico_pesquisa.sql` agenda a poda
# diária do histórico de pesquisa com `cron.schedule`. No Supabase ele vinha
# instalado; aqui é a única extensão fora do contrib que o schema usa.
#
# Versão fixada: atualizar é uma decisão, não um efeito colateral de `docker pull`.
FROM postgres:17.10-bookworm

RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-17-cron \
 && rm -rf /var/lib/apt/lists/*

# Rodam uma única vez, quando o volume de dados nasce vazio, em ordem alfabética.
COPY init/ /docker-entrypoint-initdb.d/
