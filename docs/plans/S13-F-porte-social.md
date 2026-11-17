---
id: S13-F-porte-social
titulo: Porte para a API da rede social (perfil, busca, seguir, solicitações, listas e histórico)
trilha: T6
responsavel: fernando
revisor: micael
semana: S13
requisitos: [RF02.1, RF02.5, RF02.6, RF02.7, RF02.8, RF09.1, RF09.2, RF09.3, RF09.4, RF09.5, RF09.6, RF09.9, RF09.10, RF09.12, RF13.2, RNF02.7, RNF02.8, RNF02.11]
secoes_doc: [20, 22.2, 22.3]
branch: feat/S13-F-sem-supabase
tipo: [route-handler]
depende_de: [S13-F-porte-convites]
status: em-desenvolvimento
---
# Porte para a API da rede social

> **Fernando** · semana **S13** · Etapa 2 de 4 do plano "Avori sem Supabase", quarta leva

## 1. Contexto

As 11 rotas de `app/api/social/**` que não envolvem arquivo saem do Next e vão
para a API, em `/api/social`. As regras são as mesmas; o que muda é o caminho
até o banco: os helpers de `lib/social/` que falavam com o PostgREST viram um
repositório Kysely (`api/modulos/social/repositorio.ts`), sempre com a sessão
do usuário e a RLS valendo. As regras puras (`lib/social/busca.ts`,
`lib/schemas/*`) continuam onde estavam.

**Fica de fora a foto de perfil** (`/api/social/perfil/foto`): ela grava e
assina arquivos no Supabase Storage, que saiu junto. O plano de evolução
escolhe o MinIO (compatível com S3), e isso pede uma leva própria: container,
cliente S3, bucket e a URL assinada. Até lá, a rota da foto continua no Next
(respondendo 401) e `avatar_url` sai nulo em todas as respostas sociais. As
telas já tratam a foto ausente.

O que mudou de propósito:

- **Paginação das listas da rede numa consulta só.** O PostgREST não
  comparava a tupla (data, username), e a lib fazia duas ou três consultas por
  página. Agora é um `where` só. A data do cursor vai e volta como texto: um
  `Date` do JavaScript guarda milissegundos, o Postgres guarda microssegundos,
  e o empate nunca casaria (o teste de 25 seguidores com a mesma data pegou isso).
- **Registrar pesquisa é uma transação**: apagar a entrada antiga e gravar no
  topo não pode mais parar no meio.
- **O contador da rede falha sem derrubar o perfil** também dentro da
  transação, por um savepoint.

## 2. Arquivos afetados

- `api/modulos/social/` — `GET`/`PATCH /perfil`, `GET /perfis?busca=`,
  `GET /perfis/:username`, `GET /perfis/:username/{seguidores,seguindo}`,
  `POST`/`DELETE /perfis/:username/seguir`, `DELETE /seguidores/:username`,
  `GET /solicitacoes`, `POST`/`DELETE /solicitacoes/:username`,
  `GET`/`POST`/`DELETE /pesquisas`, `DELETE /pesquisas/:username`.
- Removidos: as 11 rotas do Next, `lib/social/{perfil-visto,pesquisas,perfis}.ts`
  (sem uso) e os testes simulados delas (`tests/api/social-*-route.test.ts`,
  menos o da foto; `tests/lib/perfis.test.ts`).
- Ficam por ora: `lib/social/{rede,solicitacoes}.ts`, usados só por
  `tests/rls/09` e `10`, que ainda rodam contra a stack antiga do Supabase.
  Saem quando esses testes migrarem.

## 3. O que testar

- [x] Cada rota: 200 · 401 · 400 para username fora do formato e corpo
  inválido; 403 onde há regra de visibilidade (a rede de perfil privado para
  quem não segue) e para quem não escolheu username ao seguir (`sem_username`)
  (`tests/integracao/social.test.ts`).
- [x] Perfil próprio: `id` e `avatar_url` no corpo não chegam ao banco;
  username repetido é 409 sem vazar a mensagem do Postgres.
- [x] Busca: sem quem busca, sem `id` na resposta, username exato primeiro.
- [x] Seguir privado vira solicitação; o dono vê no sino (`?contagem=1`) e na
  lista, aprova ou recusa; seguir público é imediato; de novo não duplica.
- [x] Listas: 25 seguidores com a mesma data saem em 20 + 5, em ordem, sem
  repetir nem pular; cursor de quem saiu é `cursor_invalido`.
- [x] Remover seguidor e resolver solicitação: os 404 com código estável.
- [x] Histórico: topo ao reabrir, sem `id`, apagar um e limpar tudo;
  `user_id` no corpo não grava no histórico de outra pessoa.
- [x] Pelo Next: sino, busca, perfil e as telas `/u/[username]`,
  `/notificacoes`, `/pesquisar` e `/dashboard/perfil`.

## 4. O que validar

- [x] Toda consulta dentro de `comoUsuario()`; nenhuma chave de serviço.
- [x] Quem age é sempre a sessão; URL e corpo só dizem sobre quem.
- [x] Nenhuma resposta leva o `id` de outra pessoa.
- [x] Tags de requisito nas rotas novas e nos testes novos.

## Andamento (17/11/2026)

- Integração: 154 de 154. Unitária: 507 de 507. Rastreabilidade sem inconsistências.

Fica para a próxima leva: a foto de perfil com MinIO e
`app/api/auth/change-password`.
