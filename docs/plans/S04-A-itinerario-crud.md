---
id: S04-A-itinerario-crud
titulo: Editar, excluir e concluir item de itinerário
trilha: T1
responsavel: audrey
revisor: fernando
semana: S04
requisitos: [RF05]
secoes_doc: [22.1]
branch: feat/S04-A-itinerario-crud
tipo: [route-handler, tela]
status: backlog
---
# Editar, excluir e concluir item de itinerário

> **Audrey** · semana **S04** (16 a 22/09) · marco da semana: _RLS provada por teste_

## 1. Contexto

O campo status existe no tipo e não há interface para altera-lo.

## 2. Arquivos afetados

_A preencher antes de comecar: caminhos concretos, incluindo migration se houver dado novo._

## 3. Passos

_A preencher._

## 4. O que testar

Obrigatórios pelo tipo (`route-handler, tela`):

- [ ] Integração cobrindo os 4 caminhos: 200 feliz, 401 sem sessão, 403 não-membro, 400 payload invalido
- [ ] E2E do fluxo com screenshot arquivado em `docs/pfc/evidências/`

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. _A preencher._

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [ ] Item concluido se distingue visualmente
- [ ] So participante da viagem altera o item
- [ ] `await params` (nesta versão do Next, params e Promise)
- [ ] Corpo validado por zod, com campos extraidos um a um — nunca `...body`
- [ ] Autorização checada no servidor via `exigirMembro` / `exigirDono`
- [ ] Funciona em mobile e desktop
- [ ] Feedback por `toast()`; sem `alert()` nem `confirm()`
- [ ] Estado de erro e de carregamento tratados

## 6. Evidência

- [ ] Saida dos testes
- [ ] Screenshot ou gravação do fluxo (se houver tela)
- [ ] Delta de cobertura (se mexeu em `lib/`)
