---
id: S01-Ab-catalogo-social-ia
titulo: Catálogo de requisitos: Social e IA, e fluxo de navegação
trilha: T5
responsavel: abner
revisor: fernando
semana: S01
requisitos: []
secoes_doc: [14, 15, 16]
branch: docs/S01-Ab-catalogo-social-ia
tipo: [documentacao]
status: backlog
---
# Catálogo de requisitos: Social e IA, e fluxo de navegação

> **Abner** · semana **S01** (26/08 a 01/09) · marco da semana: _Base mergeada e backlog inteiro no quadro_

## 1. Contexto

RF e RNF de perfil, feed, seguir e avaliações, mais a tela de roteiro por IA. Inclui o fluxo de navegação da seção 16.1.

## 2. Arquivos afetados

_A preencher antes de comecar: caminhos concretos, incluindo migration se houver dado novo._

## 3. Passos

_A preencher._

## 4. O que testar

Obrigatórios pelo tipo (`documentacao`):

- [ ] Cada requisito tem ID, descrição, status e prioridade
- [ ] O fluxo cobre da entrada ate cada funcionalidade principal
- [ ] `npm run pfc:check` sem bloqueio novo

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. _A preencher._

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [ ] Esta claro o que e público e o que e privado em cada tela: e o que define a RLS depois
- [ ] A landing page promete recomendações e avaliações que não existem — ou vira requisito, ou sai da página
- [ ] Extensao respeita o limite da seção em `docs/pfc/_regras.md`
- [ ] Nenhuma afirmação sem evidência no repositório
- [ ] Parte 00 atualizada com o que mudou

## 6. Evidência

- [ ] Saida dos testes
- [ ] Screenshot ou gravação do fluxo (se houver tela)
- [ ] Delta de cobertura (se mexeu em `lib/`)
