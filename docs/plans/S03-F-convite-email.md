---
id: S03-F-convite-email
titulo: Convite por e-mail funcionando
trilha: T1
responsavel: fernando
revisor: audrey
semana: S03
requisitos: [RF04]
secoes_doc: [22.2, 25]
branch: feat/S03-F-convite-email
tipo: [route-handler, seguranca]
status: backlog
---
# Convite por e-mail funcionando

> **Fernando** · semana **S03** (09 a 15/09) · marco da semana: _Convite chega no e-mail de verdade_

## 1. Contexto

O cliente chamado supabaseAdmin e na verdade o cliente anon: inviteUserByEmail sempre falha com 403 e o erro e engolido. Nenhum convite jamais foi enviado.

## 2. Arquivos afetados

_A preencher antes de comecar: caminhos concretos, incluindo migration se houver dado novo._

## 3. Passos

_A preencher._

## 4. O que testar

Obrigatórios pelo tipo (`route-handler, segurança`):

- [ ] Convite chega no Inbucket (localhost:54324)
- [ ] Integração cobrindo os 4 caminhos: 200 feliz, 401 sem sessão, 403 não-membro, 400 payload invalido
- [ ] Teste que prova a **exploração bloqueada**, não o caminho feliz

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. _A preencher._

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [ ] Chave service role só em `lib/supabase/admin.ts`, nunca em componente
- [ ] Falha de envio não e silenciosa
- [ ] `await params` (nesta versão do Next, params e Promise)
- [ ] Corpo validado por zod, com campos extraidos um a um — nunca `...body`
- [ ] Autorização checada no servidor via `exigirMembro` / `exigirDono`
- [ ] A correção tem teste
- [ ] Risco residual registrado em `docs/pfc/evidências/segurança/`

## 6. Evidência

- [ ] Saida dos testes
- [ ] Screenshot ou gravação do fluxo (se houver tela)
- [ ] Delta de cobertura (se mexeu em `lib/`)
