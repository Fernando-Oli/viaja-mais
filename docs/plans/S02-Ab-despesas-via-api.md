---
id: S02-Ab-despesas-via-api
titulo: Despesas passam a escrever por route handler
trilha: T1
responsavel: abner
revisor: fernando
semana: S02
requisitos: [RF06]
secoes_doc: [22.2]
branch: feat/S02-Ab-despesas-via-api
tipo: [route-handler]
status: backlog
---
# Despesas passam a escrever por route handler

> **Abner** · semana **S02** (02 a 08/09) · marco da semana: _Quadro do Notion vivo, movido pelo CI_

## 1. Contexto

Hoje a tela de nova despesa escreve direto do navegador, dependendo só da RLS.

## 2. Arquivos afetados

_A preencher antes de comecar: caminhos concretos, incluindo migration se houver dado novo._

## 3. Passos

_A preencher._

## 4. O que testar

Obrigatórios pelo tipo (`route-handler`):

- [ ] Integração cobrindo os 4 caminhos: 200 feliz, 401 sem sessão, 403 não-membro, 400 payload invalido

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. _A preencher._

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [ ] Nenhum insert de despesa a partir de componente client
- [ ] Valor validado por zod: negativo e zero tratados
- [ ] `await params` (nesta versão do Next, params e Promise)
- [ ] Corpo validado por zod, com campos extraidos um a um — nunca `...body`
- [ ] Autorização checada no servidor via `exigirMembro` / `exigirDono`

## 6. Evidência

- [ ] Saida dos testes
- [ ] Screenshot ou gravação do fluxo (se houver tela)
- [ ] Delta de cobertura (se mexeu em `lib/`)
