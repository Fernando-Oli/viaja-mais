---
id: S14-F-entrega
titulo: Build do documento, deploy estavel e ensaio
trilha: T5
responsavel: fernando
revisor: audrey
semana: S14
requisitos: []
secoes_doc: ["00", 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27]
branch: docs/S14-F-entrega
tipo: [documentacao]
depende_de: [S13-F-montar-documento, S14-A-congelamento-a, S14-Ab-congelamento-ab, S14-M-congelamento-m]
status: em-desenvolvimento
---
# Build do documento, deploy estável e ensaio

> **Fernando** · semana **S14** (25/11 a 01/12) · marco da semana: _Entrega em 01/12_

## 1. Contexto

Entrega em 01/12, em PDF, pelo AVA. Não há reenvio depois do prazo.

A última versão completa do documento (v3.9, de 18/10) só existia em PDF: a fonte
editável se perdeu e `docs/pfc/` tinha 8 das 27 seções. Esta atividade reconstrói
as seções no repositório, atualiza tudo para a `main` e atende à devolutiva do
professor: parágrafos curtos, RF ligado a RN, diagramas em PlantUML (casos de uso,
DER, C4, implantação, sequência das rotas, esteira), dados de CI/CD e a seção de
portabilidade para o backend separado.

## 2. Arquivos afetados

- `docs/pfc/**/*.md` — as 27 seções e a Parte 00
- `docs/pfc/diagramas/*.puml` e `*.png` — 19 figuras; sai `docs/pfc/04-design/diagramas/`
- `docs/pfc/_template/reference.docx`, `docs/pfc/_regras.md`, `docs/pfc/README.md`
- `docs/pfc/evidencias/2026-11-22/metricas.md`, `docs/pfc/rastreabilidade.md`
- `scripts/pfc/build.mjs`, `check.mjs`, novos `metricas.mjs`, `diagramas.mjs`,
  `tabelas.lua`, `reference-docx.py`; `package.json`

Nenhuma migration e nenhum código de aplicação.

## 3. Passos

1. Extrair o texto do PDF da v3.9 e reconstruir as seções que faltavam.
2. Atualizar cada seção contra o código da `main`; o código vence o texto antigo.
3. Escrever os diagramas em PlantUML e renderizar (`npm run pfc:diagramas`).
4. Coletar as métricas (`npm run pfc:metricas`) e regenerar a matriz.
5. Montar (`npm run pfc:build`) e revisar o PDF página a página.

## 4. O que testar

Obrigatórios pelo tipo (`documentacao`):

- [ ] `npm run pfc:check` sem bloqueio
- [ ] `npm run verify` verde
- [ ] `npm run pfc:check` sem bloqueio novo

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. `npm run pfc:diagramas` — termina com "19 diagramas renderizados".
2. `npm run pfc:check` — termina com "Nenhum bloqueio" e sem aviso.
3. `npm run pfc:build` — gera o PDF em `docs/pfc/build/`.
4. Abrir o PDF: capa com os quatro nomes; nenhuma página em branco; toda tabela que atravessa página continua na seguinte; as 20 figuras legíveis.

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [ ] Nenhum texto orientador do template remanescente
- [ ] Todos os links da seção 4 acessiveis publicamente
- [ ] PDF conferido: capa, sumário e paginação
- [ ] Extensao respeita o limite da seção em `docs/pfc/_regras.md`
- [ ] Nenhuma afirmação sem evidência no repositório
- [ ] Parte 00 atualizada com o que mudou

## 6. Evidência

- [ ] Saida dos testes
- [ ] Screenshot ou gravação do fluxo (se houver tela)
- [ ] Delta de cobertura (se mexeu em `lib/`)
