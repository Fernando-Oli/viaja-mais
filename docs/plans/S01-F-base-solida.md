---
id: S01-F-base-solida
titulo: Base sólida do repositório
trilha: T0
responsavel: fernando
revisor: audrey
semana: S01
requisitos: []
secoes_doc: [23]
branch: chore/S01-F-base-solida
tipo: [infra]
status: concluido
---
# Base sólida do repositório

> **Fernando** · semana **S01** (26/08 a 01/09) · marco da semana: _Base mergeada e backlog inteiro no quadro_

## 1. Contexto

Estrutura sobre a qual os outros três vao codar: lint, testes, CI, autorização no servidor, rota de referência e limpeza do scaffolding.

## 2. Arquivos afetados

_A preencher antes de comecar: caminhos concretos, incluindo migration se houver dado novo._

## 3. Passos

_A preencher._

## 4. O que testar

Obrigatórios pelo tipo (`infra`):

- [ ] `npm run verify` verde (lint, tipos, testes, build)
- [ ] 15 testes unitarios de `lib/authz` e `lib/http`
- [ ] `npm run verify` verde

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. _A preencher._

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [ ] Todo route handler novo tem um molde para copiar
- [ ] Nenhuma escrita no banco a partir do navegador na rota de referência
- [ ] CI roda em PR e bloqueia merge
- [ ] Funciona em máquina limpa, seguindo só o README

## 6. Evidência

- [ ] Saida dos testes
- [ ] Screenshot ou gravação do fluxo (se houver tela)
- [ ] Delta de cobertura (se mexeu em `lib/`)
