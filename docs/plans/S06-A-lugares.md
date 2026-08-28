---
id: S06-A-lugares
titulo: Lugares: marcar visitado e escopo de grupo
trilha: T1
responsavel: audrey
revisor: fernando
semana: S06
requisitos: [RF08]
secoes_doc: [22.1]
branch: feat/S06-A-lugares
tipo: [tela]
status: backlog
---
# Lugares: marcar visitado e escopo de grupo

> **Audrey** · semana **S06** (30/09 a 06/10) · marco da semana: _Fluxo de grupo ponta a ponta_

## 1. Contexto

O selo de visitado e renderizado e não há como alterna-lo.

## 2. Arquivos afetados

_A preencher antes de comecar: caminhos concretos, incluindo migration se houver dado novo._

## 3. Passos

_A preencher._

## 4. O que testar

Obrigatórios pelo tipo (`tela`):

- [ ] E2E do fluxo com screenshot arquivado em `docs/pfc/evidências/`

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. _A preencher._

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [ ] Estado persiste após recarregar
- [ ] Funciona em mobile e desktop
- [ ] Feedback por `toast()`; sem `alert()` nem `confirm()`
- [ ] Estado de erro e de carregamento tratados

## 6. Evidência

- [ ] Saida dos testes
- [ ] Screenshot ou gravação do fluxo (se houver tela)
- [ ] Delta de cobertura (se mexeu em `lib/`)
