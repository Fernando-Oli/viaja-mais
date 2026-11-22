# Métricas de CI/CD e de processo — 22/11/2026

Gerado por `npm run pfc:metricas`, a partir do git e da API do GitHub. Período: de
26/08/2026 até hoje. `main` em `b524d98`.

## Execuções da esteira

508 execuções concluídas no período. A taxa de sucesso desconsidera as canceladas,
que são execuções substituídas por um push mais novo na mesma branch.

| Workflow | Execuções | Sucesso | Falha | Cancelada | Taxa de sucesso | Mediana | P90 |
|---|---|---|---|---|---|---|---|
| CI | 199 | 155 | 11 | 33 | 93,4% | 97 s | 8,5 min |
| Notion | 196 | 190 | 6 | 0 | 96,9% | 32 s | 65 s |
| Banco de dados | 95 | 79 | 16 | 0 | 83,2% | 2,3 min | 3,0 min |
| Evidências | 12 | 11 | 1 | 0 | 91,7% | 36 s | 80 s |
| Copilot | 4 | 4 | 0 | 0 | 100,0% | 3,7 min | 6,3 min |
| Copilot cloud agent | 2 | 2 | 0 | 0 | 100,0% | 3,9 min | 3,9 min |

## Última execução bem-sucedida na `main`

| Workflow | Etapa | Resultado | Duração |
|---|---|---|---|
| CI | Build de produção | success | 54 s |
| CI | Lint, tipos e testes | success | 2,2 min |
| CI | O que mudou | success | 5 s |
| CI | Playwright (1/4) | success | 8,3 min |
| CI | Playwright (2/4) | success | 6,0 min |
| CI | Playwright (3/4) | success | 7,6 min |
| CI | Playwright (4/4) | success | 7,1 min |
| Banco de dados | Migrations e RLS | success | 2,3 min |

| Verificação | Quantidade | Resultado |
|---|---|---|
| Unidade e integração de rotas (Vitest) | 1532 em 86 arquivos | todos passando |
| Cobertura | 98,21% das linhas | instruções 95,88% · desvios 91,03% · funções 96,94% |
| Ponta a ponta (Playwright, 4 partes) | 274 passando | 4 pulados |
| Migrations aplicadas do zero | 22 | sem erro |
| Isolamento por RLS e integração com banco real | 475 | todos passando |

## Disponibilidade em produção

_O monitor ainda não tem execuções agendadas registradas._

## Pull requests

84 abertos no período: 77 integrados, 7 fechados sem integração e 0 em aberto.
Tempo entre abrir e integrar: mediana de 1,0 h, P90 de 7,2 dias.
19 dos 84 têm revisão registrada no GitHub.

| Autor | Abertos | Integrados |
|---|---|---|
| Fernando-Oli | 45 | 43 |
| audreylacerda | 14 | 14 |
| AbnerCosmo | 13 | 11 |
| deffmain | 12 | 9 |

## Commits na `main`

171 commits (sem contar os 83 merges) e 81 planos de atividade em `docs/plans/`.

| Autor | Commits |
|---|---|
| Fernando Oliveira | 82 |
| Micael Cruz Batista Martins | 58 |
| Audrey Lacerda | 15 |
| Abner Cosmo | 14 |
| copilot-swe-agent[bot] | 2 |

| Tipo (Conventional Commits) | Commits |
|---|---|
| feat | 60 |
| fix | 35 |
| docs | 30 |
| chore | 21 |
| test | 11 |
| sem tipo | 8 |
| refactor | 3 |
| ci | 1 |
| perf | 1 |
| revert | 1 |

| Requisito no escopo | Commits |
|---|---|
| RF09 | 30 |
| RF02 | 30 |
| RNF05 | 11 |
| RNF03 | 11 |
| RNF02 | 10 |
| RF03 | 7 |
| RNF04 | 6 |
| RF06 | 5 |
| RF04 | 4 |
| RF01 | 3 |
| RF05 | 3 |
| RF07 | 2 |
| RNF01 | 2 |
| RF11 | 1 |
| RF08 | 1 |
| RNF08 | 1 |
