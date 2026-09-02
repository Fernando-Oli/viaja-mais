---
id: S01-Ab-catalogo-financeiro
titulo: Catálogo de requisitos: Financeiro e modelo do rateio
trilha: T5
responsavel: abner
revisor: fernando
semana: S01
requisitos: [RF06.1, RF06.2, RF06.3, RF06.4, RF06.5, RF06.6, RF06.7, RF06.8, RF06.9, RF06.10, RF06.11, RF06.12, RF06.13, RNF02.9, RNF08.1]
secoes_doc: [14, 15, 18]
branch: docs/S01-Ab-catalogo-financeiro
tipo: [documentacao]
status: em-desenvolvimento
---

# Catálogo de requisitos: Financeiro e modelo do rateio

> **Abner** · semana **S01** (26/08 a 01/09) · marco da semana: *Base mergeada e backlog inteiro no quadro*

## 1. Contexto

RF e RNF de despesas, mais o modelo entidade-relacionamento da divisão de custos, que é o diferencial do produto.

## 2. Arquivos afetados

- `docs/pfc/03-publico/14-requisitos-funcionais.md` (editar — trecho Financeiro)
- `docs/pfc/03-publico/15-requisitos-nao-funcionais.md` (editar — trecho Financeiro)
- `docs/pfc/04-design/18-Modelo-de-dados.md` (editar — trecho Rateio)
- `docs/pfc/00-historico-versao.md` (editar — nova linha de versão)
- Nenhuma migration: T0 (schema no repositório) ainda não rodou nesta semana, então não há dado novo para versionar agora.

## 3. Passos

1. Puxar o RF06 (Controle Financeiro) já existente em `docs/ARCHITECTURE.md` §6 e trazer para a seção 14, corrigindo o Status de cada item conforme o que está de fato no código hoje — não repetir o problema já identificado no `_regras.md` de a doc antiga inventar funcionalidades sem tela.

2. Verificar contra o repositório quais itens do RF06 têm evidência: adicionar despesa (existe, ainda que sem validação — ver T1), editar/excluir despesa (não existe — T1 lista como CRUD faltando), visualizar total/por categoria (existe, `app/dashboard/finances/page.tsx:225-273`, ainda com barras CSS em vez de gráfico).

3. Redigir os requisitos novos do rateio (seção 14): quem pagou, tipo de divisão, cálculo automático, saldo por membro, marcar como quitado — usando os nomes reais já decididos em `plano-norte.md` §T2 (`expense_shares`, `settlements`, `paid_by`, `lib/finance/balances.ts`), não inventar nomes novos.

4. Redigir os RNF correspondentes (seção 15): soma exata do rateio e isolamento por RLS.

5. Modelar o diagrama de dados (seção 18) a partir do schema planejado em T2 — deixar claro que é modelo planejado, porque o schema ainda não está no repositório (T0 é pré-requisito e ainda não rodou).

6. Atualizar a Parte 00 com a entrada desta entrega.

7. Rodar `npm run pfc:check` e resolver bloqueios novos.

8. Abrir PR na branch `docs/S01-Ab-catalogo-financeiro`, sinalizando para o Fernando a observação de domínio do frontmatter.

## 4. O que testar

Obrigatórios pelo tipo (`documentacao`):

- [ ] Cada requisito tem ID, descrição, status e prioridade
- [ ] O modelo cobre: quem pagou, quem deve, e quanto
- [ ] `npm run pfc:check` sem bloqueio novo

**Roteiro de teste manual**

1. Abrir `app/dashboard/finances/page.tsx` e conferir se dá para adicionar uma despesa pela tela. Esperado: existe formulário de adicionar; RF06.1 fica "Existente".

2. Na mesma tela, procurar botão/link de editar ou excluir uma despesa já criada. Esperado: não existe (confirma o achado do T1); RF06.2/RF06.3 ficam "Planejado", não "Existente".

3. Conferir se a tela mostra total gasto e gasto por categoria. Esperado: sim, via as barras CSS de `:225-273`; RF06.4/RF06.5 ficam "Existente", com a ressalva de que a visualização é simples (CSS, não gráfico — isso vira nota para a seção 22.2 do Micael, não para este card).

4. Buscar no código por `paid_by`, `expense_shares` ou `settlements`. Esperado: não encontrado (ainda não implementado); confirma que os requisitos de rateio são "Planejado".

5. Rodar `npm run pfc:check`. Esperado: nenhum bloqueio novo.

## 5. O que validar

- [ ] O rateio contempla divisão igual, por peso e por valor exato
- [ ] Arredondamento de centavo está decidido (R$ 10 entre 3 pessoas)
- [ ] Extensão respeita o limite da seção em `docs/pfc/_regras.md`
- [ ] Nenhuma afirmação sem evidência no repositório
- [ ] Parte 00 atualizada com o que mudou
- [ ] Nomes de tabela/campo batem com os já decididos em `plano-norte.md` §T2 (não inventar `expense_splits` nem outro nome alternativo)

## 6. Evidência

- [ ] Saída de `npm run pfc:check`
- [ ] Não aplicável: screenshot/cobertura (card é documentação pura, sem código nesta semana)