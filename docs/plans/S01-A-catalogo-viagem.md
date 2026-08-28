---
id: S01-A-catalogo-viagem
titulo: Catálogo de requisitos: Viagem e Itinerário
trilha: T5
responsavel: audrey
revisor: fernando
semana: S01
requisitos: []
secoes_doc: [14, 15]
branch: docs/S01-A-catalogo-viagem
tipo: [documentacao]
status: backlog
---
# Catálogo de requisitos: Viagem e Itinerário

> **Audrey** · semana **S01** (26/08 a 01/09) · marco da semana: _Base mergeada e backlog inteiro no quadro_

## 1. Contexto

Levantar RF e RNF de viagens, itinerário, reservas e lugares. É o contrato que permite trabalho paralelo: com requisito numerado e com dono, ninguém precisa perguntar o que e seu.

## 2. Arquivos afetados

_A preencher antes de comecar: caminhos concretos, incluindo migration se houver dado novo._

## 3. Passos

_A preencher._

## 4. O que testar

Obrigatórios pelo tipo (`documentacao`):

- [ ] Cada requisito tem ID, descrição, status e prioridade
- [ ] `npm run pfc:rastreabilidade` roda sem tag órfã
- [ ] `npm run pfc:check` sem bloqueio novo

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. _A preencher._

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [ ] Status reflete a realidade, não a intenção: `docs/ARCHITECTURE.md` §6 marca como implementado coisas que não tem tela
- [ ] Todo requisito e verificável: 'o sistema deve ser rápido' não vale
- [ ] Extensao respeita o limite da seção em `docs/pfc/_regras.md`
- [ ] Nenhuma afirmação sem evidência no repositório
- [ ] Parte 00 atualizada com o que mudou

## 6. Evidência

- [ ] Saida dos testes
- [ ] Screenshot ou gravação do fluxo (se houver tela)
- [ ] Delta de cobertura (se mexeu em `lib/`)
