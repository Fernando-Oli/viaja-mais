---
id: S13-F-telas-auth
titulo: Telas de autenticação e CSP sem Supabase
trilha: T6
responsavel: fernando
revisor: micael
semana: S13
requisitos: [RF01.1, RF01.4, RF01.7, RNF02.11, RNF02.12]
secoes_doc: [5, 20, 22.2, 25]
branch: feat/S13-F-sem-supabase
tipo: [tela, route-handler]
depende_de: [S13-F-porte-senha, S13-F-foto-s3]
status: em-desenvolvimento
---
# Telas de autenticação e CSP sem Supabase

> **Fernando** · semana **S13** · Etapa 3 de 4 do plano "Avori sem Supabase"

## 1. Contexto

Com a etapa 2, nenhuma rota de API depende do Supabase. Sobram no navegador:

- `app/auth/sign-up`: `supabase.auth.signUp`.
- `app/auth/reset-password`: `resetPasswordForEmail` e `updateUser`, que
  dependem do e-mail do GoTrue.
- `app/auth/signout/route.ts`: ninguém chama mais (o menu usa
  `authCliente.signOut()` desde a etapa 1). Sai.
- CSP (`proxy.ts` → `lib/seguranca/csp.ts`): libera o Supabase em
  `connect-src` e `img-src` e lê `NEXT_PUBLIC_SUPABASE_URL`.

## 2. O que muda

- **Cadastro:** `authCliente.signUp.email({ name, email, password })`. O nome
  vai para `auth.users.name`, e o gatilho `handle_new_user` já o copia para o
  perfil. O e-mail do convite (`?email=`) vem preenchido.
- **Recuperação de senha:** `sendResetPassword` no Better Auth, com o e-mail
  por `api/email/enviar.ts` (Mailpit local). O link passa pela API
  (`/api/auth/reset-password/:token`), que confere o token e devolve para
  `/auth/reset-password?token=` (ou `?error=INVALID_TOKEN`). A tela troca a
  senha com `authCliente.resetPassword` e tira o token da barra de endereço.
  Token vale 1 hora, uso único, e a troca derruba as sessões abertas
  (`revokeSessionsOnPasswordReset`). O pedido responde igual para e-mail com e
  sem conta, e o limite de 3 por minuto por IP já existe.
- **Saída:** remove a rota morta e a entrada dela no proxy.
- **CSP:** sem Supabase. `connect-src` fica com a própria origem e o Google;
  `upgrade-insecure-requests` passa a depender de a aplicação ser https, não da URL do
  Supabase.

## 3. O que testar

- [x] Cadastro pela tela cria conta com o nome no perfil e entra no painel
  (navegador).
- [x] Recuperação (integração, `tests/integracao/recuperar-senha.test.ts`):
  - pedido para e-mail cadastrado envia o e-mail com link para a API;
  - o link redireciona para a tela com o token; token inválido volta com
    `error=INVALID_TOKEN`;
  - a troca com o token vale para o login, derruba a sessão antiga e o token
    não serve uma segunda vez;
  - senha fraca é recusada (400) e o token continua valendo;
  - e-mail sem conta: mesma resposta, nenhum e-mail enviado;
  - redirecionamento para outro site é recusado.
- [x] CSP (`tests/lib/csp.test.ts`): nada de Supabase; `connect-src` sem
  curinga; `upgrade-insecure-requests` só fora do desenvolvimento.
- [x] Navegador: recuperação pelo link do Mailpit até o login com a senha nova,
  sem violação de CSP.

## 4. O que validar

- [x] A resposta do pedido de recuperação não revela se o e-mail tem conta.
- [x] O token não fica na URL depois de lido (não vaza por histórico nem Referer).
- [x] Variáveis só por `api/env.ts` e `lib/env.ts`.
- [x] Tags de requisito nas telas, na configuração e nos testes.

## Achado durante a leva

O Better Auth **desliga sozinho a checagem de origem quando `NODE_ENV=test`**
(`skipOriginCheck` em `context/create-context.mjs`). Em produção ela valia, mas
nenhum teste de integração exercitava o CSRF nem os endereços de volta: o teste
do link para outro site passou com 200. `api/auth/auth.ts` agora fixa
`advanced.disableOriginCheck: false`, e dois testes provam a regra (endereço de
volta de outro site → 403; `sign-out` com o cookie da pessoa vindo de outro
site → 403 e a sessão continua). Os dois falham sem a configuração.

## Andamento (17/11/2026)

- Integração: 176 de 176 (8 novos em `tests/integracao/recuperar-senha.test.ts`).
- Unitária: 477 de 477 (telas de cadastro e recuperação reescritas sem Supabase).
- Rastreabilidade sem inconsistências.
- Navegador (Chromium): cadastro pela tela com o e-mail do convite preenchido
  → painel com o nome; recuperação pelo link do Mailpit → token fora da URL →
  login com a senha nova; o mesmo link de novo mostra "expirou ou já foi
  usado"; CSP sem Supabase e nenhuma violação.

Fica para a próxima leva (limpeza da etapa 3): `lib/supabase/*`, as variáveis
`NEXT_PUBLIC_SUPABASE_*` em `lib/env.ts`, `@supabase/*` no `package.json`,
`supabase/` e os testes em `tests/rls` que ainda rodam contra a stack antiga.
