---
id: S01-Ab-catalogo-financeiro
titulo: Catálogo de requisitos: Financeiro e modelo do rateio
trilha: T5
responsavel: abner
revisor: fernando
semana: S01
requisitos: []
secoes_doc: [14, 15, 18]
branch: docs/S01-Ab-catalogo-financeiro
tipo: [documentacao]
status: backlog
---
# Catálogo de requisitos: Financeiro e modelo do rateio

> **Abner** · semana **S01** (26/08 a 01/09) · marco da semana: _Base mergeada e backlog inteiro no quadro_

## 1. Contexto

RF e RNF de despesas, mais o modelo entidade-relacionamento da divisão de custos, que e o diferencial do produto.

## 2. Arquivos afetados

_A preencher antes de comecar: caminhos concretos, incluindo migration se houver dado novo._

## 3. Passos

_A preencher._

## 4. O que testar

Obrigatórios pelo tipo (`documentacao`):

- [ ] Cada requisito tem ID, descrição, status e prioridade
- [ ] O modelo cobre: quem pagou, quem deve, e quanto
- [ ] `npm run pfc:check` sem bloqueio novo

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. _A preencher._

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [ ] O rateio contempla divisão igual, por peso e por valor exato
- [ ] Arredondamento de centavo esta decidido (R$ 10 entre 3 pessoas)
- [ ] Extensao respeita o limite da seção em `docs/pfc/_regras.md`
- [ ] Nenhuma afirmação sem evidência no repositório
- [ ] Parte 00 atualizada com o que mudou

## 6. Evidência

- [ ] Saida dos testes
- [ ] Screenshot ou gravação do fluxo (se houver tela)
- [ ] Delta de cobertura (se mexeu em `lib/`)
