---
id: S12-A-doc-24
titulo: Seção 24: Qualidade do Software e Testes
trilha: T5
responsavel: audrey
revisor: fernando
semana: S12
requisitos: []
secoes_doc: [24]
branch: docs/S12-A-doc-24
tipo: [documentacao]
depende_de: [S11-A-e2e-completo, S14-A-congelamento-a]
status: em-revisao
---
# Seção 24: Qualidade do Software e Testes

> **Audrey** · semana **S12** (11 a 17/11) · marco da semana: _Evidencias datadas geradas_

## 1. Contexto

Criada pela primeira vez nesta entrega. Avaliada por coerência entre testes e funcionalidades, não
por quantidade de testes. A seção cita as evidências datadas de 13/11
(`docs/pfc/evidencias/2026-11-13/`) e as da S11 e da S14, por isso a branch sai da S14.

## 2. Arquivos afetados

- `docs/pfc/06-qualidade/24-qualidade-testes.md`: criar.
- `docs/pfc/00-historico-versao.md`: versão 2.16.

## 3. Passos

1. Levantar no repositório: tipos de teste e pastas, `vitest.config.mts` (corte de 70%),
   `.github/workflows/ci.yml` e `db.yml`, `scripts/pfc/rastreabilidade.mjs`, evidências.
2. Redigir 24.1 estratégia · 24.2 teste por tipo de mudança · 24.3 CI · 24.4 relação com
   requisitos (tabela RF × teste do domínio de viagem) · 24.5 resultados · 24.6 análise crítica.
3. `npm run pfc:check`.

## 4. O que testar

- [x] `npm run pfc:check` sem bloqueio novo

**Roteiro de teste manual**

1. Para cada número da 24.5, abrir o arquivo citado em `docs/pfc/evidencias/2026-11-13/`.
   Esperado: 928 testes em `testes-unit.txt`, 280 em `rls.txt`, 183 passando e 1 pulado em
   `e2e.txt`, 96,55% de linhas na linha "All files".
2. Para cada arquivo de teste da tabela da 24.4, conferir que ele existe e traz a tag do RF.
3. Abrir a Figura 24.1 e conferir que a legenda descreve o que aparece nela.

## 5. O que validar

- [x] Extensão respeita o limite da seção em `docs/pfc/_regras.md` (sem limite em linhas; uma
      página e meia de texto mais três tabelas)
- [x] Nenhuma afirmação sem evidência no repositório
- [x] Parte 00 atualizada com o que mudou

## 6. Evidência

- [x] Saída do `pfc:check` colada no PR
- [x] Figura 24.1: `docs/pfc/evidencias/S11-A-e2e-completo-06-publicar-chromium.png`
- [ ] Delta de cobertura: não se aplica
