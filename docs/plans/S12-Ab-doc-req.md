---
id: S12-Ab-doc-req
titulo: Seções 22.2, 13, 14 e 15
trilha: T5
responsavel: abner
revisor: fernando
semana: S12
requisitos: []
secoes_doc: [22.2, 13, 14, 15]
branch: docs/S12-Ab-doc-req
tipo: [documentacao]
depende_de: []
status: concluido
---
# Seções 22.2, 13, 14 e 15

> **Abner** · semana **S12** (11 a 17/11) · marco da semana: _Evidencias datadas geradas_

## 1. Contexto

O Documento de Especificação ainda não tinha a seção 13 (Regras de Negócio), a
seção 22 tinha apenas a subseção 22.1 (Frontend), e as seções 14 e 15 traziam o
domínio financeiro com o texto da S01: RF06.2 e RF06.3 como planejados, RF06.6 e
RF06.7 "a confirmar", RF06.8 a RF06.13 com a afirmação de que "ainda não têm
nenhuma evidência no código", e RNF08.1 e RNF02.9 como planejados porque a RLS
financeira "ainda não existe no repositório". Desde então, foram versionadas as
migrations `20260926102023_financeiro_rateio.sql`,
`20261111100000_financeiro_settlements.sql` e
`20261112010000_plataforma_rls_participante.sql`, as rotas de despesa e de
acerto, as bibliotecas de `lib/finance/` e os testes correspondentes. A seção 14
mantinha ainda uma pendência apontando o RF06 como parcial.

Esta atividade escreve a 13 e a 22.2 e revisa o domínio financeiro das seções 14
e 15 usando somente evidência do repositório (código, migrations e testes),
sem alterar a 22.1 nem os grupos de outros domínios.

Linha de base de `npm run pfc:check` antes da atividade (22/11/2026):

- seções preenchidas: **8/28**
- avisos: **4**
- bloqueios: **18**

## 2. Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `docs/pfc/03-publico/13-regras-negocio.md` | Novo: regras RNE-001 a RNE-020 |
| `docs/pfc/03-publico/14-requisitos-funcionais.md` | Blocos 14.1 e 14.2 substituídos pelo grupo RF06 único; pendência removida |
| `docs/pfc/03-publico/15-requisitos-nao-funcionais.md` | Bloco financeiro reescrito como RNF08, movido para o fim |
| `docs/pfc/05-arquitetura/22-implementacao.md` | Nova subseção 22.2 Backend, 22.1 intacta |
| `docs/pfc/00-historico-versao.md` | Versão 2.19 |
| `docs/pfc/evidencias/S12-Ab-doc-req-pfc-check.txt` | Saída final do `pfc:check` |
| `docs/plans/S12-Ab-doc-req.md` | Este plano |

Sem migration, sem código e sem teste: a atividade é só de documentação.

## 3. Passos

1. Rodar `npm run pfc:check` e registrar a linha de base.
2. Ler `docs/pfc/_regras.md`, o modelo `docs/pfc/_template/regra-de-negocio.md`,
   as seções 14, 15 e 22 e a Parte 00.
3. Levantar a evidência: migrations financeiras e de participação, rotas de
   `app/api/**`, `lib/authz/trip.ts`, `lib/http.ts`, `lib/finance/`,
   `lib/schemas/`, e os testes de `tests/api/`, `tests/lib/`, `tests/rls/` e
   `e2e/`.
4. Escrever a seção 13 só com regras aplicadas por rota, biblioteca ou banco.
5. Reclassificar cada RF06 pelo critério da seção 14 (Existente = implementação
   + teste automatizado; Parcial = implementação sem teste suficiente; Não
   iniciado = sem implementação), preservando a numeração.
6. Revisar RNF08.1 e RNF02.9 contra migrations e testes de RLS.
7. Escrever a 22.2, registrando as exceções ao padrão de autorização.
8. Acrescentar a versão 2.19 à Parte 00.
9. Rodar `npm run pfc:check`, `npm run pfc:rastreabilidade:check` e
   `git diff --check`, e arquivar a saída final do `pfc:check`.

## 4. O que testar

Obrigatórios pelo tipo (`documentacao`):

- [x] `npm run pfc:check` sem bloqueio novo

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. `npm run pfc:check` → "Seções preenchidas: 9/28", 3 avisos, 17 bloqueios; a
   seção 13 não aparece entre os bloqueios e a seção 14 não aparece entre os
   avisos.
2. `npm run pfc:rastreabilidade:check` → "Sem inconsistências" e catálogo com o
   mesmo total de antes (140): a revisão não criou nem apagou requisito.
3. `git diff --check` → nenhuma saída.
4. `git diff docs/pfc/05-arquitetura/22-implementacao.md` → apenas linhas
   acrescentadas, a partir de `### 22.2 Backend`.
5. Para cada RF06 marcado como Existente na seção 14, abrir os testes citados no
   detalhamento e confirmar que exercitam o requisito (por exemplo,
   `e2e/editar-despesa.spec.ts` para RF06.2 e RF06.3).
6. Para RF06.12, procurar `settled_at` em `app/` e confirmar que nenhuma rota o
   grava.

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [x] Extensao respeita o limite da seção em `docs/pfc/_regras.md` (13, 14 e 15
      em tabela por item com detalhamento; 22.2 sem limite fixado)
- [x] Nenhuma afirmação sem evidência no repositório
- [x] Parte 00 atualizada com o que mudou
- [x] Seção 13 reconhecida pelo `pfc:check` e bloqueios de 18 para 17
- [x] Seção 22.1 preservada
- [x] Numeração dos requisitos preservada (RF06.1 a RF06.13, RNF08.1, RNF02.9)

## 6. Evidência

- [x] Saida dos testes — `docs/pfc/evidencias/S12-Ab-doc-req-pfc-check.txt`

Não se aplicam captura de tela, por não haver tela alterada, nem delta de
cobertura, por não haver alteração em `lib/`.

| Medida | Antes | Depois |
|---|---|---|
| Seções preenchidas | 8/28 | 9/28 |
| Avisos | 4 | 3 |
| Bloqueios | 18 | 17 |

O aviso removido é a pendência da seção 14 (RF06, RNF03 e RNF05): o RF06 foi
documentado nesta atividade, e RNF03 e RNF05 já estavam redigidos na seção 15
desde a versão 2.12 da Parte 00.

Mudanças de status, com a evidência usada:

| Requisito | Antes | Depois | Evidência |
|---|---|---|---|
| RF06.2, RF06.3 | Planejado | Existente | `tests/api/expense-item-route.test.ts`, `e2e/editar-despesa.spec.ts` |
| RF06.6, RF06.7 | A confirmar | Parcial | `app/dashboard/finances/page.tsx` (sem teste; 80% só visual) |
| RF06.8 | Planejado | Parcial | `expenses.paid_by` preenchido pelo gatilho com quem registra; não escolhível |
| RF06.9, RF06.10 | Planejado | Existente | `tests/lib/finance-rateio.test.ts`, `tests/lib/expenses-route.test.ts`, `tests/rls/02-rateio.test.ts`, `e2e/rateio-despesa.spec.ts` |
| RF06.11 | Planejado | Existente | `tests/lib/finance-balances.test.ts`, `tests/api/acerto-route.test.ts`, `e2e/acerto-contas.spec.ts` |
| RF06.12 | Planejado | Não iniciado | nenhuma rota grava `settled_at`; RLS bloqueia (`tests/rls/13-participante.test.ts`) |
| RF06.13 | Planejado | Existente | `tests/api/acerto-transferencias-route.test.ts`, `tests/rls/07-settlements.test.ts`, `e2e/acerto-transferencias.spec.ts` |
| RNF08.1 | Planejado | Atendido | gatilho `expense_shares_soma_fecha`, `tests/lib/finance-rateio.test.ts`, `tests/rls/02-rateio.test.ts` |
| RNF02.9 | Planejado | Atendido | políticas de `expense_shares` e `settlements`, `tests/rls/02-rateio.test.ts`, `tests/rls/07-settlements.test.ts` |
