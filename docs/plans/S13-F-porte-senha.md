---
id: S13-F-porte-senha
titulo: Troca de senha pela API, com o limite por usuário na frente do Better Auth
trilha: T6
responsavel: fernando
revisor: audrey
semana: S13
requisitos: [RF01.8, RNF02.8, RNF02.11]
secoes_doc: [20, 22.2, 25]
branch: feat/S13-F-sem-supabase
tipo: [route-handler]
depende_de: [S13-F-porte-social]
status: em-desenvolvimento
---
# Troca de senha pela API

> **Fernando** · semana **S13** · Etapa 2 de 4 do plano "Avori sem Supabase", quinta leva

## 1. Contexto

`app/api/auth/change-password` conferia a senha atual com `signInWithPassword`
e trocava com `updateUser` do GoTrue. O Better Auth tem um endpoint nativo no
mesmo caminho, mas sem o limite por usuário (5 conferências a cada 15 minutos)
— e conferir a senha atual faz da troca um oráculo para quem tem uma sessão
roubada.

A API registra uma rota própria em `POST /api/auth/change-password`, **antes**
do handler do Better Auth, que encobre o endpoint nativo. Ela valida o
formulário, conta a tentativa e delega a troca ao Better Auth. A tela de
configurações não muda: continua mandando o mesmo formulário.

O que mudou de propósito:

- **A troca encerra as outras sessões** e renova a atual (`revokeOtherSessions`):
  quem roubou uma sessão perde o acesso junto com a senha antiga.
- **A tentativa conta mesmo com senha atual errada**: o limite roda numa
  transação própria, confirmada antes da conferência.
- **Senha nova igual à atual** é recusada antes, sem gastar tentativa. Antes,
  quem dizia isso era o GoTrue, depois da conferência.

## 2. Arquivos afetados

- `api/modulos/senha/rotas.ts` e o registro em `api/app.ts`, antes de `/api/auth/*`.
- Removidos: `app/api/auth/change-password/route.ts` e
  `tests/api/change-password-route.test.ts`.

## 3. O que testar

- [x] 200: troca, a senha antiga deixa de entrar, a nova entra; a sessão atual
  recebe cookie novo e a outra sessão aberta passa a receber 401
  (`tests/integracao/senha.test.ts`).
- [x] 401 sem sessão.
- [x] 400 sem gastar tentativa: campo faltando, confirmação diferente, senha
  fraca, senha igual à atual.
- [x] 400 "Senha atual incorreta", em português, gastando tentativa, sem trocar.
- [x] 429 com o limite estourado, sem trocar.
- [x] O endpoint nativo está encoberto: JSON com `currentPassword` e
  `newPassword` não troca a senha.
- [x] Pelo Next, com formulário: troca, login com a nova e a tela de configurações.

## 4. O que validar

- [x] Nenhum caminho até a troca que não passe pelo limite.
- [x] Mensagens do Better Auth não chegam cruas à tela.
- [x] Tags de requisito na rota e no teste.

## Andamento (17/11/2026)

- Integração: 160 de 160. Unitária: 497 de 497. Rastreabilidade sem inconsistências.

Com isto, `app/api` só tem a rota da foto de perfil, que depende do
armazenamento de arquivos (MinIO, próxima leva).
