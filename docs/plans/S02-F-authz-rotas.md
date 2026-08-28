---
id: S02-F-authz-rotas
titulo: Autorização em todas as rotas e fim do mass-assignment
trilha: T1
responsavel: fernando
revisor: audrey
semana: S02
requisitos: [RNF02]
secoes_doc: [22.2, 25]
branch: feat/S02-F-authz-rotas
tipo: [route-handler, seguranca]
status: backlog
---
# Autorização em todas as rotas e fim do mass-assignment

> **Fernando** · semana **S02** (02 a 08/09) · marco da semana: _Quadro do Notion vivo, movido pelo CI_

## 1. Contexto

So a rota de referência tem autorização. As demais verificam sessão mas não se aquele usuário pode tocar aquele recurso.

## 2. Arquivos afetados

_A preencher antes de comecar: caminhos concretos, incluindo migration se houver dado novo._

## 3. Passos

_A preencher._

## 4. O que testar

Obrigatórios pelo tipo (`route-handler, segurança`):

- [ ] Integração cobrindo os 4 caminhos: 200 feliz, 401 sem sessão, 403 não-membro, 400 payload invalido
- [ ] Teste que prova a **exploração bloqueada**, não o caminho feliz

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. _A preencher._

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [ ] Nenhum `.update(body)` ou `.insert({...body})` restante no repositório
- [ ] POST /api/invitations exige sessão e ignora o inviterId vindo do corpo
- [ ] `await params` (nesta versão do Next, params e Promise)
- [ ] Corpo validado por zod, com campos extraidos um a um — nunca `...body`
- [ ] Autorização checada no servidor via `exigirMembro` / `exigirDono`
- [ ] A correção tem teste
- [ ] Risco residual registrado em `docs/pfc/evidências/segurança/`

## 6. Evidência

- [ ] Saida dos testes
- [ ] Screenshot ou gravação do fluxo (se houver tela)
- [ ] Delta de cobertura (se mexeu em `lib/`)
