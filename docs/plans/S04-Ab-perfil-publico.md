---
id: S04-Ab-perfil-publico
titulo: Perfil público em /u/[username]
trilha: T1
responsavel: abner
revisor: fernando
semana: S04
requisitos: []
secoes_doc: [22.1]
branch: feat/S04-Ab-perfil-publico
tipo: [tela, route-handler]
status: backlog
---
# Perfil público em /u/[username]

> **Abner** · semana **S04** (16 a 22/09) · marco da semana: _RLS provada por teste_

## 1. Contexto

Primeira superficie pública do produto.

## 2. Arquivos afetados

_A preencher antes de comecar: caminhos concretos, incluindo migration se houver dado novo._

## 3. Passos

_A preencher._

## 4. O que testar

Obrigatórios pelo tipo (`tela, route-handler`):

- [ ] E2E: visitante anônimo ve perfil público e não ve o privado
- [ ] E2E do fluxo com screenshot arquivado em `docs/pfc/evidências/`
- [ ] Integração cobrindo os 4 caminhos: 200 feliz, 401 sem sessão, 403 não-membro, 400 payload invalido

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. _A preencher._

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [ ] Perfil privado devolve 404 para quem não segue
- [ ] Nenhuma despesa ou dado de outro membro aparece
- [ ] Funciona em mobile e desktop
- [ ] Feedback por `toast()`; sem `alert()` nem `confirm()`
- [ ] Estado de erro e de carregamento tratados
- [ ] `await params` (nesta versão do Next, params e Promise)
- [ ] Corpo validado por zod, com campos extraidos um a um — nunca `...body`
- [ ] Autorização checada no servidor via `exigirMembro` / `exigirDono`

## 6. Evidência

- [ ] Saida dos testes
- [ ] Screenshot ou gravação do fluxo (se houver tela)
- [ ] Delta de cobertura (se mexeu em `lib/`)
