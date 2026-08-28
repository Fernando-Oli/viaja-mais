---
id: S02-Ab-notion-ci
titulo: Espelho do quadro no Notion pelo CI
trilha: T0
responsavel: abner
revisor: fernando
semana: S02
requisitos: []
secoes_doc: []
branch: chore/S02-Ab-notion-ci
tipo: [infra]
status: concluido
---
# Espelho do quadro no Notion pelo CI

> **Abner** · semana **S02** (02 a 08/09) · marco da semana: _Quadro do Notion vivo, movido pelo CI_

## 1. Contexto

Scripts de seed, sync e pull, mais o workflow que move os cards conforme o estado do PR.

## 2. Arquivos afetados

_A preencher antes de comecar: caminhos concretos, incluindo migration se houver dado novo._

## 3. Passos

_A preencher._

## 4. O que testar

Obrigatórios pelo tipo (`infra`):

- [ ] Sem NOTION_TOKEN os scripts saem com sucesso
- [ ] `npm run verify` verde

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. _A preencher._

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [ ] Status do card vem do git, não e digitado
- [ ] Falha de sincronização não trava trabalho
- [ ] Funciona em máquina limpa, seguindo só o README

## 6. Evidência

- [ ] Saida dos testes
- [ ] Screenshot ou gravação do fluxo (se houver tela)
- [ ] Delta de cobertura (se mexeu em `lib/`)
