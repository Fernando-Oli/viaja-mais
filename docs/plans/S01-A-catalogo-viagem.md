---
id: S01-A-catalogo-viagem
titulo: "Catálogo de requisitos: Viagem e Itinerário"
trilha: T5
responsavel: audrey
revisor: fernando
semana: S01
requisitos: [RF03, RF05, RF07, RF08]
secoes_doc: [14, 15]
branch: docs/S01-A-catalogo-viagem
tipo: [documentacao]
status: em-desenvolvimento
---
# Catálogo de requisitos: Viagem e Itinerário

> **Audrey** · semana **S01** (26/08 a 01/09) · marco da semana: _Base mergeada e backlog inteiro no quadro_

## 1. Contexto

Levantar RF e RNF de viagens, itinerário, reservas e lugares. É o contrato que permite trabalho paralelo: com requisito numerado e com dono, ninguém precisa perguntar o que e seu.

## 2. Arquivos afetados

Somente documentação — nenhuma migration nem código de aplicação nesta atividade.

- `docs/pfc/03-publico/14-requisitos-funcionais.md` — grupos RF03, RF05, RF07 e RF08
- `docs/pfc/03-publico/15-requisitos-nao-funcionais.md` — requisitos não funcionais relacionados ao domínio
- `docs/pfc/00-historico-versao.md` — registro da atualização
- `docs/plans/S01-A-catalogo-viagem.md` — este plano

## 3. Passos

1. Levantar os requisitos RF03, RF05, RF07 e RF08 definidos em `docs/ARCHITECTURE.md`.
2. Conferir o estado real de cada requisito com base nas telas, rotas e funcionalidades existentes no repositório.
3. Registrar cada requisito com ID, descrição, status e prioridade.
4. Catalogar os requisitos não funcionais correspondentes ao domínio.
5. Atualizar a Parte 00 com o registro das alterações.
6. Rodar `npm run pfc:rastreabilidade` e `npm run pfc:check`.

## 4. O que testar

Obrigatórios pelo tipo (`documentacao`):

- [x] Cada requisito tem ID, descrição, status e prioridade
- [x] `npm run pfc:rastreabilidade` roda sem tag órfã
- [x] `npm run pfc:check` sem bloqueio novo

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. Abrir `docs/pfc/03-publico/14-requisitos-funcionais.md` e conferir RF03, RF05, RF07 e RF08 → esperado: todos possuem ID, descrição, status e prioridade.

2. Abrir `docs/pfc/03-publico/15-requisitos-nao-funcionais.md` e conferir os RNFs relacionados ao domínio → esperado: requisitos verificáveis, com status e prioridade.

3. Rodar `npm run pfc:rastreabilidade` → esperado: nenhuma tag órfã relacionada aos requisitos catalogados.

4. Rodar `npm run pfc:check` → esperado: nenhum bloqueio novo.

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [x] Status reflete a realidade, não a intenção: `docs/ARCHITECTURE.md` §6 marca como implementado coisas que não tem tela
- [x] Todo requisito e verificável: 'o sistema deve ser rápido' não vale
- [x] Extensao respeita o limite da seção em `docs/pfc/_regras.md`
- [x] Nenhuma afirmação sem evidência no repositório
- [x] Parte 00 atualizada com o que mudou

## 6. Evidência

- [x] Saida dos testes
- [ ] Screenshot ou gravação do fluxo (se houver tela)
- [ ] Delta de cobertura (se mexeu em `lib/`)
