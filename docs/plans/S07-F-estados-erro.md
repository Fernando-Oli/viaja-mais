---
id: S07-F-estados-erro
titulo: Estados de erro, 404 e carregamento
trilha: T1
responsavel: fernando
revisor: audrey
semana: S07
requisitos: []
secoes_doc: [19, 23]
branch: chore/S07-F-estados-erro
tipo: [tela, infra]
status: backlog
---
# Estados de erro, 404 e carregamento

> **Fernando** · semana **S07** (07 a 13/10) · marco da semana: _Primeiro E2E verde no CI_

## 1. Contexto

Não há error.tsx, not-found.tsx nem loading.tsx em nenhum segmento: erro aparece como mensagem crua do Supabase ou some no console.

## 2. Arquivos afetados

_A preencher antes de comecar: caminhos concretos, incluindo migration se houver dado novo._

## 3. Passos

_A preencher._

## 4. O que testar

Obrigatórios pelo tipo (`tela, infra`):

- [ ] E2E do fluxo com screenshot arquivado em `docs/pfc/evidências/`
- [ ] `npm run verify` verde

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. _A preencher._

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [ ] Funciona em mobile e desktop
- [ ] Feedback por `toast()`; sem `alert()` nem `confirm()`
- [ ] Estado de erro e de carregamento tratados
- [ ] Funciona em máquina limpa, seguindo só o README

## 6. Evidência

- [ ] Saida dos testes
- [ ] Screenshot ou gravação do fluxo (se houver tela)
- [ ] Delta de cobertura (se mexeu em `lib/`)
