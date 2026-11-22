# Métricas de CI/CD e de processo — 22/11/2026

Gerado por `npm run pfc:metricas`, a partir do git e da API do GitHub. Período: de
26/08/2026 até hoje. `main` em `9651a8d`.

## Execuções da esteira

481 execuções concluídas no período. A taxa de sucesso desconsidera as canceladas,
que são execuções substituídas por um push mais novo na mesma branch.

| Workflow | Execuções | Sucesso | Falha | Cancelada | Taxa de sucesso | Mediana | P90 |
|---|---|---|---|---|---|---|---|
| CI | 187 | 146 | 11 | 30 | 93,0% | 95 s | 7,4 min |
| Notion | 186 | 180 | 6 | 0 | 96,8% | 32 s | 65 s |
| Banco de dados | 90 | 74 | 16 | 0 | 82,2% | 2,3 min | 3,0 min |
| Evidências | 12 | 11 | 1 | 0 | 91,7% | 36 s | 80 s |
| Copilot | 4 | 4 | 0 | 0 | 100,0% | 3,7 min | 6,3 min |
| Copilot cloud agent | 2 | 2 | 0 | 0 | 100,0% | 3,9 min | 3,9 min |

## Última execução bem-sucedida na `main`

| Workflow | Etapa | Resultado | Duração |
|---|---|---|---|
| CI | Build de produção | success | 79 s |
| CI | Lint, tipos e testes | success | 2,0 min |
| CI | O que mudou | success | 6 s |
| CI | Playwright (1/4) | success | 7,5 min |
| CI | Playwright (2/4) | success | 6,2 min |
| CI | Playwright (3/4) | success | 9,1 min |
| CI | Playwright (4/4) | success | 7,2 min |
| Banco de dados | Migrations e RLS | success | 2,9 min |

| Verificação | Quantidade | Resultado |
|---|---|---|
| Unidade e integração de rotas (Vitest) | 1511 em 83 arquivos | todos passando |
| Cobertura | 97,56% das linhas | instruções 95,3% · desvios 90,36% · funções 96,58% |
| Ponta a ponta (Playwright, 4 partes) | 270 passando | 4 pulados |
| Migrations aplicadas do zero | 21 | sem erro |
| Isolamento por RLS e integração com banco real | 473 | todos passando |

## Pull requests

79 abertos no período: 72 integrados, 7 fechados sem integração e 0 em aberto.
Tempo entre abrir e integrar: mediana de 1,5 h, P90 de 7,2 dias.
19 dos 79 têm revisão registrada no GitHub.

| Autor | Abertos | Integrados |
|---|---|---|
| Fernando-Oli | 40 | 38 |
| audreylacerda | 14 | 14 |
| AbnerCosmo | 13 | 11 |
| deffmain | 12 | 9 |

## Commits na `main`

162 commits (sem contar os 78 merges) e 79 planos de atividade em `docs/plans/`.

| Autor | Commits |
|---|---|
| Fernando Oliveira | 73 |
| Micael Cruz Batista Martins | 58 |
| Audrey Lacerda | 15 |
| Abner Cosmo | 14 |
| copilot-swe-agent[bot] | 2 |

| Tipo (Conventional Commits) | Commits |
|---|---|
| feat | 59 |
| fix | 34 |
| docs | 27 |
| chore | 19 |
| test | 10 |
| sem tipo | 8 |
| refactor | 3 |
| perf | 1 |
| revert | 1 |

| Requisito no escopo | Commits |
|---|---|
| RF09 | 30 |
| RF02 | 30 |
| RNF03 | 11 |
| RNF05 | 8 |
| RNF02 | 8 |
| RF03 | 7 |
| RF06 | 5 |
| RF04 | 4 |
| RNF04 | 3 |
| RF05 | 3 |
| RF07 | 2 |
| RNF01 | 2 |
| RF01 | 2 |
| RF11 | 1 |
| RF08 | 1 |
| RNF08 | 1 |
