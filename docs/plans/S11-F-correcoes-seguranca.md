---
id: S11-F-correcoes-seguranca
titulo: Correções de segurança e evidências
trilha: T5
responsavel: fernando
revisor: audrey
semana: S11
requisitos: []
secoes_doc: [25]
branch: docs/S11-F-correcoes-seguranca
tipo: [seguranca, documentacao]
status: backlog
---
# Correções de segurança e evidências

> **Fernando** · semana **S11** (04 a 10/11) · marco da semana: _IA ponta a ponta com provider fake no CI_

## 1. Contexto

_A preencher por quem assumir a atividade._

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
