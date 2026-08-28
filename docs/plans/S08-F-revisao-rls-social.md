---
id: S08-F-revisao-rls-social
titulo: Revisão da RLS do social e integração
trilha: T5
responsavel: fernando
revisor: audrey
semana: S08
requisitos: []
secoes_doc: [22.3, 25]
branch: docs/S08-F-revisao-rls-social
tipo: [seguranca, documentacao]
status: backlog
---
# Revisão da RLS do social e integração

> **Fernando** · semana **S08** (14 a 20/10) · marco da semana: _Acerto de contas funcional_

## 1. Contexto

Visibilidade e a parte mais fácil de errar do social.

## 2. Arquivos afetados

_A preencher antes de comecar: caminhos concretos, incluindo migration se houver dado novo._

## 3. Passos

_A preencher._

## 4. O que testar

Obrigatórios pelo tipo (`segurança, documentacao`):

- [ ] Teste que prova a **exploração bloqueada**, não o caminho feliz
- [ ] `npm run pfc:check` sem bloqueio novo

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. _A preencher._

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [ ] A correção tem teste
- [ ] Risco residual registrado em `docs/pfc/evidências/segurança/`
- [ ] Extensao respeita o limite da seção em `docs/pfc/_regras.md`
- [ ] Nenhuma afirmação sem evidência no repositório
- [ ] Parte 00 atualizada com o que mudou

## 6. Evidência

- [ ] Saida dos testes
- [ ] Screenshot ou gravação do fluxo (se houver tela)
- [ ] Delta de cobertura (se mexeu em `lib/`)
