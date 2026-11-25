---
id: S12-Ab-doc-req
titulo: Seções 22.2, 13, 14 e 15
trilha: T5
responsavel: abner
revisor: fernando
semana: S12
requisitos: []
secoes_doc: [22.2, 13, 14, 15]
branch: docs/S12-Ab-doc-req
tipo: [documentacao]
depende_de: []
status: concluido
---
# Seções 22.2, 13, 14 e 15

> **Abner** · semana **S12** (11 a 17/11) · marco da semana: _Evidencias datadas geradas_

## 1. Contexto

**Encerrada em 25/11/2026 sem merge próprio.** O PR #89, desta atividade, partiu
de uma `main` anterior à versão 4.0, e o PR #83 (S14-F-entrega) já tinha
reconstruído as seções 13, 14, 15 e 22 nesse intervalo. A seção 13 do PR usava
outra numeração de regras, e a 22.2 já existia com outra estrutura. A
conferência S13-Ab-conferencia-req (PR #90), do próprio Abner, validou o
conteúdo que está na `main`, inclusive os status do RF06. O PR #89 foi fechado
com essa explicação, e o trabalho desta atividade está coberto pelo #83 e pelo
#90.

Os blocos abaixo ficaram como estavam no modelo, porque a entrega veio por
aquelas duas atividades.

## 2. Arquivos afetados

_A preencher antes de comecar: caminhos concretos, incluindo migration se houver dado novo._

## 3. Passos

_A preencher._

## 4. O que testar

Obrigatórios pelo tipo (`documentacao`):

- [ ] `npm run pfc:check` sem bloqueio novo

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. _A preencher._

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [ ] Extensao respeita o limite da seção em `docs/pfc/_regras.md`
- [ ] Nenhuma afirmação sem evidência no repositório
- [ ] Parte 00 atualizada com o que mudou

## 6. Evidência

- [ ] Saida dos testes
- [ ] Screenshot ou gravação do fluxo (se houver tela)
- [ ] Delta de cobertura (se mexeu em `lib/`)
