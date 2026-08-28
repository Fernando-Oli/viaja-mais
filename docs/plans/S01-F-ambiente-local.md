---
id: S01-F-ambiente-local
titulo: Ambiente local em um comando
trilha: T0
responsavel: fernando
revisor: audrey
semana: S01
requisitos: []
secoes_doc: [23]
branch: chore/S01-F-ambiente-local
tipo: [infra]
status: concluido
---
# Ambiente local em um comando

> **Fernando** · semana **S01** (26/08 a 01/09) · marco da semana: _Base mergeada e backlog inteiro no quadro_

## 1. Contexto

`npm run setup` sobe o Supabase local, aplica migrations, roda o seed e escreve o .env.local. Ninguém precisa receber credencial de banco por mensagem.

## 2. Arquivos afetados

_A preencher antes de comecar: caminhos concretos, incluindo migration se houver dado novo._

## 3. Passos

_A preencher._

## 4. O que testar

Obrigatórios pelo tipo (`infra`):

- [ ] `npm run setup` em máquina limpa com Docker
- [ ] Login com teste.a@viajamais.local funciona
- [ ] `npm run verify` verde

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. _A preencher._

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [ ] Nenhuma credencial de banco circula fora da máquina de quem usa
- [ ] O script explica o que instalar quando falta Docker
- [ ] Funciona em máquina limpa, seguindo só o README

## 6. Evidência

- [ ] Saida dos testes
- [ ] Screenshot ou gravação do fluxo (se houver tela)
- [ ] Delta de cobertura (se mexeu em `lib/`)
