---
id: S02-A-bugs-p0
titulo: Correção dos bugs P0 herdados
trilha: T1
responsavel: audrey
revisor: fernando
semana: S02
requisitos: []
secoes_doc: [22.1]
branch: fix/S02-A-bugs-p0
tipo: [correcao-de-bug]
status: backlog
---
# Correção dos bugs P0 herdados

> **Audrey** · semana **S02** (02 a 08/09) · marco da semana: _Quadro do Notion vivo, movido pelo CI_

## 1. Contexto

Cinco defeitos que quebram fluxo visível: texto solto no dashboard, filtro do itinerário sem !inner, dono não inserido em trip_members, convite aceito que só aparece após recarregar, e reset de senha com hasToken fixo em true.

## 2. Arquivos afetados

_A preencher antes de comecar: caminhos concretos, incluindo migration se houver dado novo._

## 3. Passos

_A preencher._

## 4. O que testar

Obrigatórios pelo tipo (`correção-de-bug`):

- [ ] Teste de regressao que **falha antes** e passa depois do fix

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. _A preencher._

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [ ] Viagem criada aparece na lista sem recarregar
- [ ] Convite aceito aparece sem recarregar
- [ ] Itinerário mostra só itens de viagens do próprio usuário
- [ ] O bug original foi reproduzido antes do fix e não reproduz depois

## 6. Evidência

- [ ] Saida dos testes
- [ ] Screenshot ou gravação do fluxo (se houver tela)
- [ ] Delta de cobertura (se mexeu em `lib/`)
