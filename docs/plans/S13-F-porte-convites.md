---
id: S13-F-porte-convites
titulo: Porte para a API dos convites de viagem, com e-mail por SMTP
trilha: T6
responsavel: fernando
revisor: audrey
semana: S13
requisitos: [RF04.1, RF04.2, RF04.3, RNF02.7, RNF02.8]
secoes_doc: [20, 22.2, 22.3, 25]
branch: feat/S13-F-sem-supabase
tipo: [route-handler]
depende_de: [S13-F-porte-financeiro]
status: em-desenvolvimento
---
# Porte para a API dos convites de viagem, com e-mail por SMTP

> **Fernando** · semana **S13** · Etapa 2 de 4 do plano "Avori sem Supabase", terceira leva

## 1. Contexto

Os convites eram as últimas rotas de viagem no Next, e o motivo de o sino do
painel responder 401. O envio do convite usava `inviteUserByEmail` do GoTrue,
que não existe mais: o e-mail passa a sair da própria API, por SMTP
(`nodemailer`), para o Mailpit em desenvolvimento. É a mesma peça de que o
cadastro e a recuperação de senha vão precisar na etapa 3.

O comportamento visível se mantém, inclusive os três desfechos que a tela de
membros mostra (`enviado`, `ja-cadastrado`, `falhou`): quem já tem conta não
recebe e-mail e vê o convite ao entrar. A conferência "já tem conta" usa o
adaptador do Better Auth, sem a API ler o schema `auth`.

O que mudou de propósito:

- **Aceitar é uma transação.** Entrar na viagem e marcar o convite aceito
  acontecem juntos; a rota do Next fazia três chamadas e podia parar no meio.
- **Recusar convite inexistente ou de outra pessoa é 404**, como no aceite. A
  rota do Next respondia 200 sem ter recusado nada.
- **O limite de convites conta só o que foi gravado.** A contagem roda na
  transação da rota; se a gravação falha, a tentativa não é cobrada.

## 2. Arquivos afetados

- `api/modulos/convites/` — `GET`/`POST /api/invitations`,
  `POST /api/invitations/:id/{accept,decline}`.
- `api/email/enviar.ts` — transporte SMTP (`SMTP_URL`, `EMAIL_REMETENTE` de
  `api/env.ts`) e escape de HTML para o que vem do usuário.
- `api/http/limite.ts` — `exigirLimiteNaTx`, o `exigirLimite` pela transação,
  fail-open num savepoint. `lib/seguranca/limite.ts` passa a importar
  `ErroHttp` de `lib/erros.ts`, sem arrastar o `next/server` para a API.
- Dependência nova: `nodemailer` 10.3 (e `@types/nodemailer`). A 6.x tem dois avisos de segurança no `npm audit`, corrigidos a partir da 10.2.
- Removidos: `app/api/invitations/**` e `tests/api/{invitations-get,invitations-post,invitation-accept-route}.test.ts`.

## 3. O que testar

- [x] Convidar: 200 do dono · 401 · 403 para membro que não é dono e para quem
  não participa · 400 para e-mail inválido · 429 com o limite estourado, sem
  gravar nem enviar (`tests/integracao/convites.test.ts`).
- [x] `inviterId` e `status` no corpo não chegam ao banco.
- [x] O e-mail chega ao Mailpit com o nome de quem convida e o título da
  viagem; quem já tem conta não recebe e-mail, e o convite vale.
- [x] Convites pendentes: só os do e-mail da sessão, com a viagem junto.
- [x] Aceitar: entra na viagem e marca aceito; quem já é membro só marca; o
  segundo aceite é 404; convite de outra pessoa é 404 e nada muda.
- [x] Recusar: marca recusado sem entrar; de outra pessoa, 404.
- [x] Pelo Next (com `/api/invitations/` terminando em barra, como a tela
  chama): convite, e-mail no Mailpit, a convidada vê, aceita e lê a viagem.

## 4. O que validar

- [x] Toda consulta dentro de `comoUsuario()`; convidar exige dono explícito.
- [x] Nenhuma chave de serviço: a API não lê `auth.users` nem usa `comoServico`.
- [x] Texto do usuário escapado no HTML do e-mail.
- [x] Tags de requisito nas rotas novas e nos testes novos.

## Achado

`insert ... on conflict do nothing` em `trip_members` viola a RLS para quem
está entrando pelo convite: com `on conflict`, o Postgres exige que a linha
nova passe também na policy de leitura (`can_access_trip`), e quem ainda não é
membro não passa. O aceite confere a participação antes e faz `insert` simples.

## Andamento (17/11/2026)

- Integração: 133 de 133. Unitária: 685 de 685. Rastreabilidade sem inconsistências.

Fica para a próxima leva: rede social (`app/api/social/**`) e
`app/api/auth/change-password`.
