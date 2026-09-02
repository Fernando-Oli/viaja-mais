---
id: S01-M-catalogo-social-ia
titulo: Catálogo de requisitos: Social e IA, e fluxo de navegação
trilha: T5
responsavel: micael
revisor: fernando
semana: S01
requisitos: [RF02, RF09, RF10, RF11, RF12, RF13, RNF07]
secoes_doc: [14, 15, 16]
branch: docs/S01-M-catalogo-social-ia
tipo: [documentacao]
status: em-desenvolvimento
---
# Catálogo de requisitos: Social e IA, e fluxo de navegação

> **Micael** · semana **S01** (26/08 a 01/09) · marco da semana: _Base mergeada e backlog inteiro no quadro_

## 1. Contexto

RF e RNF de perfil, feed, seguir e avaliações, mais a tela de roteiro por IA. Inclui o fluxo de navegação da seção 16.1.

## 2. Arquivos afetados

Somente documentação — nenhuma migration nem código de aplicação nesta atividade.

- `docs/pfc/03-publico/14-requisitos-funcionais.md` — grupos RF02, RF09, RF10, RF11, RF12, RF13
- `docs/pfc/03-publico/15-requisitos-nao-funcionais.md` — grupo RNF07
- `docs/pfc/04-design/16-fluxo-de-navegacao.md` — seção 16.1 (telas do domínio)
- `docs/pfc/00-historico-versao.md` — nova linha (versão 2.1)
- `docs/plans/S01-M-catalogo-social-ia.md` — este plano

## 3. Passos

1. Levantar o RF02 herdado (`docs/ARCHITECTURE.md` §6) e o Status real cruzando com as rotas existentes; identificar as promessas da página inicial (`app/page.tsx`) e do modelo de negócio como evidência.
2. Redigir o catálogo de RF do domínio: RF02 (perfil, com público/privado), RF09 (rede social com aprovação de seguidores estilo Instagram), RF10 (interação), RF11 (avaliações), RF12 (IA de roteiros), RF13 (notificações).
3. Redigir o RNF07 com valores-alvo mensuráveis.
4. Redigir o fluxo de navegação 16.1, com a visibilidade (pública/privada/seguidores) explícita em cada tela.
5. Gravar as seções 14, 15 e 16 via agente `doc-pfc`; atualizar a Parte 00.
6. Rodar `npm run pfc:check`; abrir PR colando os critérios do bloco 5.

## 4. O que testar

Obrigatórios pelo tipo (`documentacao`):

- [ ] Cada requisito tem ID, descrição, status e prioridade
- [ ] O fluxo cobre da entrada ate cada funcionalidade principal
- [ ] `npm run pfc:check` sem bloqueio novo

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. Abrir `docs/pfc/03-publico/14-requisitos-funcionais.md` e conferir cada requisito RF02/RF09–RF13 → esperado: todos com ID, descrição, status e prioridade, e visibilidade pública/privada explícita nos requisitos de social.
2. Abrir `docs/pfc/03-publico/15-requisitos-nao-funcionais.md` → esperado: cada RNF07 tem valor-alvo mensurável (número).
3. Abrir `docs/pfc/04-design/16-fluxo-de-navegacao.md` → esperado: o fluxo cobre da entrada (painel) até cada funcionalidade do domínio, com o diagrama explicado no texto.
4. Rodar `npm run pfc:check` → esperado: sem bloqueio novo.

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
