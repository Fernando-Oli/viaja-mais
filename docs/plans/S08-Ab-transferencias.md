---
id: S08-Ab-transferencias
titulo: Minimizar transferências e marcar quitado
trilha: T1
responsavel: abner
revisor: fernando
semana: S08
requisitos: [RF06]
secoes_doc: []
branch: feat/S08-Ab-transferencias
tipo: [regra-de-negocio, tela]
status: backlog
---
# Minimizar transferências e marcar quitado

> **Abner** · semana **S08** (14 a 20/10) · marco da semana: _Acerto de contas funcional_

## 1. Contexto

Reduz o número de pagamentos necessários para zerar os saldos do grupo.

## 2. Arquivos afetados

_A preencher antes de comecar: caminhos concretos, incluindo migration se houver dado novo._

## 3. Passos

_A preencher._

## 4. O que testar

Obrigatórios pelo tipo (`regra-de-negocio, tela`):

- [ ] Unit com casos de borda
- [ ] Cobertura de ao menos 70% no arquivo
- [ ] E2E do fluxo com screenshot arquivado em `docs/pfc/evidências/`

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. _A preencher._

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [ ] Função pura, sem I/O
- [ ] Casos de arredondamento cobertos
- [ ] Funciona em mobile e desktop
- [ ] Feedback por `toast()`; sem `alert()` nem `confirm()`
- [ ] Estado de erro e de carregamento tratados

## 6. Evidência

- [ ] Saida dos testes
- [ ] Screenshot ou gravação do fluxo (se houver tela)
- [ ] Delta de cobertura (se mexeu em `lib/`)
