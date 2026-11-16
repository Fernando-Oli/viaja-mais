---
id: S13-F-api-molde
titulo: API separada em Hono com autenticação própria e rota-molde
trilha: T6
responsavel: fernando
revisor: audrey
semana: S13
requisitos: [RF01.1, RF03.2, RF03.3, RF03.5, RNF02.3, RNF02.5, RNF02.7, RNF02.11, RNF06.1, RNF06.3]
secoes_doc: [20, 22.2, 22.3, 25]
branch: feat/S13-F-sem-supabase
tipo: [route-handler, seguranca, infra]
depende_de: [S13-F-banco-proprio]
status: em-desenvolvimento
---
# API separada em Hono com autenticação própria e rota-molde

> **Fernando** · semana **S13** · Etapa 1 de 4 do plano "Avori sem Supabase"

## 1. Contexto

Com o banco próprio de pé (S13-F-banco-proprio), esta etapa cria a API fora do
Next e prova o caminho inteiro numa rota só: login pela tela → cookie de sessão
→ Next repassa `/api/*` → API valida a sessão → transação como o usuário → RLS.

A rota escolhida é `/api/trips/:tripId` (GET, PATCH, DELETE), o molde
documentado de todo route handler do projeto. Se ela não fechar até 19/11 à
noite, a migração é abandonada e a entrega sai da `main`.

## 2. Arquivos afetados

- `api/env.ts` — variáveis da API validadas com zod no boot.
- `api/db/conexao.ts` — pools `app_api` e `app_auth`, Kysely.
- `api/db/como-usuario.ts` — `comoUsuario()` e `comoServico()`.
- `api/db/tipos.ts` — gerado por `kysely-codegen` (`npm run db:types`).
- `api/auth/auth.ts` — Better Auth: e-mail e senha, política de
  `lib/seguranca/senha.ts`, limite de tentativas no banco.
- `api/http/` — tratamento de erro e middleware de sessão.
- `api/app.ts`, `api/servidor.ts` — aplicação Hono e servidor Node,
  `GET /health`, cabeçalho `X-Replica`.
- `api/modulos/viagens/` — rotas e repositório da rota-molde.
- `lib/erros.ts` — `ErroHttp` sem dependência do Next; `lib/http.ts` passa a
  reexportar dele.
- `lib/authz/trip.ts` — núcleo de autorização independente do cliente de banco.
- `app/api/trips/[tripId]/route.ts` e seus testes — removidos (a rota passa a
  morar na API).
- `next.config.mjs` — `rewrites.fallback` de `/api/*` para a API.
- `proxy.ts` — checagem otimista pelo cookie do Better Auth, sem Supabase.
- `lib/auth-cliente.ts` e `app/auth/login/page.tsx` — login pelo Better Auth.
- `tests/integracao/viagens.test.ts` — novo.
- `vitest.rls.config.mts` — passa a incluir `tests/integracao/` (testes que
  precisam do banco local).

## 3. Passos

1. `api/env.ts`, conexões e `comoUsuario()`.
2. `npm run db:types` com `kysely-codegen`.
3. Better Auth e o middleware de sessão.
4. Rota-molde e repositório; remover a rota antiga e os testes dela.
5. Testes de integração contra o banco local.
6. `rewrites`, `proxy.ts` e tela de login.
7. Teste manual pelo navegador.

## 4. O que testar

**Testes automatizados** (`route-handler`, `seguranca`), em
`tests/integracao/viagens.test.ts`, contra o banco local, com sessão real do
Better Auth:

- [ ] GET `/api/trips/:id`: 200 para a Ana (dona), com `trip_members`; 401 sem
  cookie; 403 para o Bruno; 400 para id que não é UUID.
- [ ] PATCH `/api/trips/:id`: 200 para a Ana, com o título alterado no banco;
  401 sem cookie; 403 para o Bruno, e o título não muda; 400 para payload
  inválido (data de fim antes da de início).
- [ ] PATCH com `user_id` no corpo não muda o dono (mass-assignment).
- [ ] DELETE `/api/trips/:id`: 403 para membro que não é dono; 200 para a dona.
- [ ] Cookie de sessão forjado ou expirado → 401.
- [ ] `POST /api/auth/sign-up/email` com senha fraca → recusado com a mensagem
  da política (`DICA_SENHA`).
- [ ] Erro inesperado → 500 genérico com `X-Codigo-Erro`, sem mensagem do
  Postgres no corpo.
- [ ] `GET /health` → 200 com `X-Replica`.

**Roteiro de teste manual:**

1. `npm run db:reset`, `npm run api:dev` e `npm run dev`.
2. http://localhost:3000/auth/login com `teste.a@viajamais.local` /
   `Viaja+mais123` → redireciona para `/dashboard` (as outras telas ainda
   dependem de rotas não migradas; erro nelas é esperado nesta etapa).
3. Com o cookie do navegador, `GET http://localhost:3000/api/trips/<id>` de uma
   viagem da Ana → 200, respondido pela API (cabeçalho `X-Replica`).
4. Mesma URL numa janela anônima → 401.

## 5. O que validar

- [ ] Toda consulta da rota passa por `comoUsuario()`; nenhuma usa a conexão
  sem papel assumido.
- [ ] Corpo validado por `atualizarViagemSchema`, campos extraídos um a um.
- [ ] `exigirMembro`/`exigirDono` continuam sendo a autorização explícita; a RLS
  é a segunda linha.
- [ ] Nenhum `process.env` fora de `api/env.ts` e `lib/env.ts`.
- [ ] Segredo do Better Auth sem valor padrão fora de desenvolvimento.
- [ ] As tags `@RF03.2`, `@RF03.3` e `@RF03.5` estão na rota nova e no teste
  novo.

## Andamento (16/11/2026)

**Critério de decisão de 19/11 atendido em 16/11.** Login pela tela funciona, a
rota-molde responde pelo Next com `X-Replica`, os testes de rota e de
isolamento passam.

- `tests/integracao/viagens.test.ts`: 18 de 18, com sessão real e banco real.
- `tests/rls/00-banco-proprio.test.ts`: 17 de 17.
- Suíte unitária: 920 de 920 (inclui 5 casos novos em `authz-trip.test.ts`).
- `pfc:rastreabilidade:check` sem inconsistências; `api/` entrou na varredura.
- Navegador (Chromium): senha errada mostra "E-mail ou senha incorretos"; senha
  certa leva a `/dashboard` com cookie `avori.session_token` httpOnly; logado,
  `/auth/login` redireciona para o painel.

Não fecha nesta etapa (é da etapa 3, como previsto):

- O painel fica em "Carregando...": `context/auth-context.tsx` ainda lê a sessão
  pelo Supabase. Por isso não há captura de tela arquivada.
- Recuperação de senha por e-mail: o Better Auth está pronto para ela, falta o
  envio por SMTP (`sendResetPassword`).
- `lib/seguranca/csp.ts` ainda monta `connect-src` com a URL do Supabase.

### Antecipado da etapa 3 (16/11/2026): o painel volta a carregar

Decidido depois do molde verde: sem o contexto de autenticação nenhuma rota
portada na etapa 2 pode ser conferida pela tela.

- `context/auth-context.tsx` lê a sessão por `authCliente.useSession()` e sai
  por `authCliente.signOut()`; expõe um `Usuario` próprio (`id`, `email`) em
  vez do `User` do Supabase.
- Rotas que o contexto consome, portadas para a API e removidas do Next:
  `GET`/`POST /api/trips` (lista e criação, em `api/modulos/viagens/`) e
  `GET /api/profile/:userId` (`api/modulos/perfis/`). `avatar_url` sai `null`
  até existir armazenamento de arquivos — o Storage saiu com o Supabase.
- Testes: `tests/integracao/viagens-lista.test.ts` (7) e
  `tests/integracao/perfis.test.ts` (5), no lugar de `trips-get`, `trips-post`
  e `profile-userid-route`, que simulavam o cliente do Supabase. Integração:
  30 de 30. Unitária: 894 de 894 (eram 920; saíram os 26 casos simulados).
  Rastreabilidade sem inconsistências.
- Navegador (Chromium): login da Ana → `/dashboard` com "Olá, Ana." e a
  viagem dela; `/dashboard/trips` lista as viagens.

Ainda respondem 401 no painel, porque continuam no Next com Supabase:
`/api/invitations` (convites, RF04) e `/api/social/solicitacoes` (sino de
notificações). O contexto tolera a falha e o painel segue navegável.

Encontrado no caminho: espalhar `esquemaAuth` e depois declarar `session`
substituía a chave inteira, e o Better Auth procurava a tabela `session`. O
comentário em `api/auth/auth.ts` registra o motivo do `...esquemaAuth.session`.

## 6. Evidência

- [ ] Saída de `tests/integracao/viagens.test.ts`
- [ ] Captura do login e da resposta da rota com `X-Replica`
