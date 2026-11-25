---
id: S13-Ab-conferencia-req
titulo: Conferência: catálogo de requisitos versus implementado
trilha: T5
responsavel: abner
revisor: fernando
semana: S13
requisitos: []
secoes_doc: [14, 15]
branch: docs/S13-Ab-conferencia-req
tipo: [documentacao]
depende_de: []
status: concluido
---
# Conferência: catálogo de requisitos versus implementado

> **Abner** · semana **S13** (18 a 24/11) · marco da semana: _Congelamento de funcionalidades em 20/11_

## 1. Contexto

Nenhum requisito pode estar marcado como implementado sem teste associado.

O `pfc:rastreabilidade:check` só confere se existe **alguma** tag de teste para o
requisito marcado "Implementado"; não confere se o teste exercita o que o
requisito descreve, e não olha os RNF "Atendido". Esta conferência faz essa
leitura à mão, requisito a requisito, no estado da `main` em 22/11/2026
(commit `2e77c31`), sem alterar código nem testes.

Critério aplicado, o mesmo da seção 14.1 e do que o catálogo já fazia com
RF03.3 e RF03.4:

- **Implementado** fica só com implementação no código **e** teste que exercite
  o comportamento descrito. Quando o requisito é ação do usuário e a tela existe
  sem teste que a exercite, o status é **Parcial**.
- **Atendido** (só RNF) fica só com evidência verificável no repositório
  (configuração, migration, workflow, registro de medição). Evidência que cobre
  só parte do enunciado leva a **Parcial**.
- Nada foi promovido só por existir código. Requisito testado por teste sem a
  tag correspondente não foi promovido: a tag faz parte do critério 14.1.

## 2. Arquivos afetados

- `docs/pfc/03-publico/14-requisitos-funcionais.md` — 7 status e detalhamentos
- `docs/pfc/03-publico/15-requisitos-nao-funcionais.md` — 4 status e detalhamentos
- `docs/pfc/00-historico-versao.md` — versão 3.18, antes da 4.0
- `docs/plans/S13-Ab-conferencia-req.md` — este plano
- `docs/pfc/evidencias/S13-Ab-conferencia-req-pfc-check.txt` — saída final do `pfc:check`

Sem migration, sem código, sem teste novo. `docs/pfc/rastreabilidade.md` não é
regenerado neste PR (a matriz é regenerada só na `main`); o `:check` não depende dele.

## 3. Passos

1. Linha de base: `npm.cmd run pfc:check` e `npm.cmd run pfc:rastreabilidade:check`.
2. Para cada RF "Implementado": localizar a implementação, o teste com a tag e
   ler o teste para confirmar que ele exercita o enunciado.
3. Para cada RNF "Implementado" ou "Atendido": conferir a configuração, a
   migration, o workflow ou a medição citada no detalhamento.
4. Rebaixar o que não se sustenta, registrando implementação, teste e motivo.
5. Atualizar as contagens das seções 14.1 e 15.1 e a Parte 00.
6. Rodar os verificadores e arquivar a saída final do `pfc:check`.

## 4. O que testar

Obrigatórios pelo tipo (`documentacao`):

- [x] `npm run pfc:check` sem bloqueio novo
- [x] `npm run pfc:rastreabilidade:check` sem inconsistência
- [x] `git diff --check` limpo

**Linha de base, antes da atividade** (22/11/2026, `main` em `2e77c31`):

- `pfc:check`: seções preenchidas 28/28 (obrigatórias: 26), nenhum bloqueio,
  nenhum aviso.
- `pfc:rastreabilidade:check`: catálogo 140 · código 79 · testes 83, sem
  inconsistências.
- Catálogo: RF 61 implementados, 23 parciais, 13 não iniciados; RNF 9
  implementados, 19 atendidos, 8 parciais, 7 não iniciados.

**Roteiro de teste manual**

1. `npm.cmd run pfc:check` — esperado: "Nenhum bloqueio", 28/28 seções.
2. `npm.cmd run pfc:rastreabilidade:check` — esperado: "Catálogo: 140 · código: 79 · testes: 83" e "Sem inconsistências".
3. Contar os status na coluna 4 das tabelas da seção 14 — esperado: 54
   Implementado, 30 Parcial, 13 Não iniciado, os números do texto da 14.1.
4. Idem na seção 15 — esperado: 9 Implementado, 15 Atendido, 12 Parcial, 7 Não
   iniciado, os números do texto da 15.1.
5. Para cada requisito rebaixado, abrir o teste citado no detalhamento e
   confirmar que ele não exercita a parte apontada no motivo.

## 5. O que validar

- [x] Extensão respeita o limite da seção em `docs/pfc/_regras.md` (nenhum parágrafo acima de 550 caracteres)
- [x] Nenhuma afirmação sem evidência no repositório
- [x] Parte 00 atualizada com o que mudou (versão 3.18)
- [x] Todo requisito "Implementado" tem implementação e teste que exercita o enunciado
- [x] Todo status alterado traz implementação, teste e motivo no detalhamento
- [x] Nenhum requisito criado; IDs e numeração preservados
- [x] RF06 (S12), RNF02.9 e RNF08.1 conferidos e mantidos

## 6. Evidência

- [x] Saída dos testes: `docs/pfc/evidencias/S13-Ab-conferencia-req-pfc-check.txt`
- Screenshot: não se aplica (sem tela)
- Delta de cobertura: não se aplica (sem mudança em `lib/`)

**Status alterados**

| Requisito | Antes → depois | Implementação | Teste | Motivo |
|---|---|---|---|---|
| RF01.2 | Implementado → Parcial | `app/auth/sign-up/page.tsx` | `tests/auth/sign-up.test.tsx` | Prova só o desvio da tela com o Auth simulado; o envio é do GoTrue, com `enable_confirmations = false` em `supabase/config.toml` |
| RF01.7 | Implementado → Parcial | `app/auth/reset-password/page.tsx` | `tests/auth/reset-password.test.tsx` | Gravação da nova senha (`updateUser`) sem teste |
| RF01.8 | Implementado → Parcial | `app/api/auth/change-password/route.ts`, `app/dashboard/settings/page.tsx` | `tests/api/change-password-route.test.ts` | Tela de configurações não exercitada; rota sem tag no código |
| RF02.3 | Implementado → Parcial | idem RF01.8 | idem RF01.8 | Mesmo requisito que o RF01.8 |
| RF04.7 | Implementado → Parcial | `app/api/trips/[tripId]/members/route.ts`, `components/trip-members.tsx` | `tests/api/members-route.test.ts` | Remoção pela tela não exercitada |
| RF04.8 | Implementado → Parcial | `app/api/trips/[tripId]/members/route.ts` | `tests/api/members-route.test.ts` | Não há tela para o membro sair |
| RF09.7 | Implementado → Parcial | `app/api/social/viagens/[tripId]/post/**`, `components/social/publicar-viagem.tsx` | `tests/api/social-post-route.test.ts`, `tests/rls/12-trip-posts.test.ts` | A jornada só abre o diálogo; o feed é prévia (RF09.8) |
| RNF02.5 | Atendido → Parcial | `lib/schemas/` nas rotas de escrita | testes de rota com caso 400 | `change-password` valida à mão, sem esquema |
| RNF04.2 | Atendido → Parcial | painel do Supabase (fora do repositório) | — | Só a conferência da equipe registrada em S14-F; retenção de 7 dias não registrada; sem teste de restauração |
| RNF05.3 | Atendido → Parcial | `scripts/pfc/rastreabilidade.mjs` | — | RF01.3–RF01.6, RF04.5, RF04.9, RNF01.5, RNF02.10 e RNF03.1 implementados sem tag no código |
| RNF06.4 | Atendido → Parcial | `lib/listagem.ts` | — | Acerto e totais de finanças leem sem limite, por decisão |

**Conferidos e mantidos** (os de atenção especial): RF01.1 (unit da tela +
`e2e/jornada-completa.spec.ts`, que cadastra pela tela), RF02.8
(`e2e/seguir.spec.ts` abre o perfil pela busca), RF04.1 (`e2e/grupo-convite.spec.ts`),
RF04.2 (já Parcial: e-mail só para quem não tem conta), RF09 restantes (rota,
RLS e E2E), RF13.2 (`e2e/solicitacoes.spec.ts`), RF13.4 (Parcial: sem marcação
de lidas), RF13.1/13.3 (sem tabela de notificações nas 22 migrations), RF06
inteiro, RNF02.4 (`tests/rls/00-estrutura.test.ts` exige RLS e policy em toda
tabela), RNF02.9 (`tests/rls/07-settlements.test.ts`), RNF08.1
(`tests/rls/02-rateio.test.ts`, "rejeita rateio que não soma o total").

**Fora do escopo, não alterado**

- RF03.4 é exercitado pela tela em `e2e/jornada-completa.spec.ts` (lista de
  viagens), e RF05.6/RF05.7 pelos testes citados na 14.6, mas sem a tag; ficam
  parciais até alguém marcar os testes.
- As tags de código ausentes (RNF05.3) só se corrigem editando código, fora
  desta atividade.
- Seção 20.4: a linha "RNF02.5 a RNF02.7" diz "Atendido", e o RNF02.5 passou a
  Parcial; a linha "RNF02.8" diz "Atendido", mas a seção 15 já o dava como
  Parcial antes desta conferência. Precisa de ajuste por quem mantém a 20.
- Seções 17.2 (casos de uso) e 22 (rotas e telas) citam os requisitos
  rebaixados sem status; não há contradição a corrigir.
- O PDF entregue no AVA corresponde à versão 4.0; a 3.18 só existe no repositório.
