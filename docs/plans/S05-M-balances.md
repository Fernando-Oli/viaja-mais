---
id: S05-M-balances
titulo: Cálculo de saldos em lib/finance
trilha: T1
responsavel: micael
revisor: fernando
semana: S05
requisitos: [RF06]
secoes_doc: [22.2]
branch: feat/S05-M-balances
tipo: [regra-de-negocio]
status: backlog
---
# Cálculo de saldos em lib/finance

> **Micael** · semana **S05** (23 a 29/09) · marco da semana: _Zero escrita no banco a partir do navegador_

## 1. Contexto

Funções puras de saldo e de minimização de transferências. É a peça mais testável do projeto e o melhor exemplo para a seção 24.

## 2. Arquivos afetados

_A preencher antes de comecar: caminhos concretos, incluindo migration se houver dado novo._

## 3. Passos

_A preencher._

## 4. O que testar

Obrigatórios pelo tipo (`regra-de-negocio`):

- [ ] Casos de borda: zero, negativo, R$ 10 entre 3 pessoas
- [ ] Unit com casos de borda
- [ ] Cobertura de ao menos 70% no arquivo

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. _A preencher._

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [ ] Soma dos saldos e sempre zero
- [ ] Função pura, sem I/O
- [ ] Casos de arredondamento cobertos

## 6. Evidência

- [ ] Saida dos testes
- [ ] Screenshot ou gravação do fluxo (se houver tela)
- [ ] Delta de cobertura (se mexeu em `lib/`)
