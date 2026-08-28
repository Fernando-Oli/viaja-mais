---
id: S05-A-reservas
titulo: Reservas: aba, entradas e edição
trilha: T1
responsavel: audrey
revisor: fernando
semana: S05
requisitos: [RF07]
secoes_doc: [22.1]
branch: feat/S05-A-reservas
tipo: [tela, route-handler]
status: backlog
---
# Reservas: aba, entradas e edição

> **Audrey** · semana **S05** (23 a 29/09) · marco da semana: _Zero escrita no banco a partir do navegador_

## 1. Contexto

A tela de criar reserva existe com 257 linhas e não tem nenhum link apontando para ela. Funcionalidade morta.

## 2. Arquivos afetados

_A preencher antes de comecar: caminhos concretos, incluindo migration se houver dado novo._

## 3. Passos

_A preencher._

## 4. O que testar

Obrigatórios pelo tipo (`tela, route-handler`):

- [ ] E2E do fluxo com screenshot arquivado em `docs/pfc/evidências/`
- [ ] Integração cobrindo os 4 caminhos: 200 feliz, 401 sem sessão, 403 não-membro, 400 payload invalido

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. _A preencher._

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [ ] Reserva e alcançável a partir da viagem
- [ ] Editar e excluir funcionam
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
