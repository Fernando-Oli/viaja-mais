---
id: S10-F-revisao-seguranca
titulo: Revisão de segurança da aplicação inteira e correções
trilha: T5
responsavel: fernando
revisor: audrey
semana: S10
requisitos: [RNF02.2, RNF02.5, RNF02.6, RNF02.11]
secoes_doc: [15, 25]
branch: fix/S10-F-revisao-seguranca
tipo: [seguranca, route-handler]
depende_de: [S08-F-revisao-rls-social, S06-F-rate-limit-csp]
status: em-revisao
---
# Revisão de segurança da aplicação inteira e correções

> **Fernando** · planejada para a S10 (com as correções da S11), feita na S12 (12/11).

## 1. Contexto

Revisão da aplicação inteira, depois das revisões do banco (S08-F) e do limite de requisições com CSP (S06-F). Método, resultado por área e riscos aceitos em `docs/pfc/evidencias/seguranca/S10-F-revisao-seguranca.md`.

Quatro achados: **F1** `POST /api/trips` sem zod; **F2** mensagem interna do Postgres ou do GoTrue devolvida ao cliente em quatro rotas; **F3** cadastro sem confirmação de e-mail (risco aceito); **F4** senha mínima de 6 caracteres, sem requisito.

## 2. Arquivos afetados

- `app/api/trips/route.ts` — zod (`criarViagemSchema`), `respostaDeErro`, sem mensagem do Postgres
- `app/api/trips/[tripId]/route.ts`, `app/api/invitations/[invitationId]/decline/route.ts`, `app/api/auth/change-password/route.ts` — mensagens genéricas
- `lib/seguranca/senha.ts` — política de senha única: 8 caracteres, com letra e número
- `app/auth/sign-up/page.tsx`, `app/auth/reset-password/page.tsx`, `app/dashboard/settings/page.tsx` — usam a política
- `supabase/config.toml` — `minimum_password_length = 8`, `password_requirements = "letters_digits"`
- `docs/pfc/03-publico/15-requisitos-nao-funcionais.md` — RNF02.6 Atendido
- testes: `tests/api/trips-post.test.ts`, `tests/api/trips-get.test.ts`, `tests/api/change-password-route.test.ts`, `tests/lib/senha.test.ts`, `tests/rls/14-politica-senha.test.ts`

## 3. Passos

1. Inventário das 31 rotas pelas quatro perguntas; leitura de cada caso suspeito.
2. Varredura fora das rotas: escrita a partir do navegador, `dangerouslySetInnerHTML`, redirect, chave de serviço, Auth.
3. Correção de F1, F2 e F4 com teste; F3 registrado como risco aceito, por decisão de 12/11.

## 4. O que testar

- [x] F1: seis payloads inválidos respondem 400 sem insert; campo extra (`user_id`, `id`) não chega ao banco
- [x] F2: a constraint do Postgres não aparece na resposta; erro do Auth chega em português
- [x] F4: o Auth recusa senha fraca chamado direto pela API (`weak_password`); a tela e a rota explicam o problema
- [x] RLS 268/268 · `verify` 904
- [x] E2E completo: 169/169 (cadastro e nova viagem com a validação nova)

## 5. O que validar

- [x] Todas as 31 rotas autenticam, autorizam e validam
- [x] Nenhuma rota devolve `error.message` do Postgres ou do GoTrue
- [x] Nenhuma escrita no banco a partir do navegador
- [x] Risco aceito (F3) registrado, com cenário, motivo e caminho para fechar
- [ ] Política de senha aplicada no painel de produção (Authentication → Policies)

## 6. Evidência

- [x] `docs/pfc/evidencias/seguranca/S10-F-revisao-seguranca.md`
- [x] Saída dos testes
