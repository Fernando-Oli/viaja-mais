---
id: S11-Ab-tela-roteiro-ia
titulo: Tela de roteiro por IA
trilha: T1
responsavel: abner
revisor: fernando
semana: S11
requisitos: []
secoes_doc: [26]
branch: feat/S11-Ab-tela-roteiro-ia
tipo: [tela]
status: backlog
---
# Tela de roteiro por IA

> **Abner** · semana **S11** (04 a 10/11) · marco da semana: _IA ponta a ponta com provider fake no CI_

## 1. Contexto

Preview dos itens gerados; o usuário aceita ou edita antes de gravar. Nunca escrever no banco direto a partir da saida do modelo.

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

- [ ] Funciona em mobile e desktop
- [ ] Feedback por `toast()`; sem `alert()` nem `confirm()`
- [ ] Estado de erro e de carregamento tratados

## 6. Evidência

- [ ] Saida dos testes
- [ ] Screenshot ou gravação do fluxo (se houver tela)
- [ ] Delta de cobertura (se mexeu em `lib/`)
