---
id: S14-F-entrega
titulo: Build do documento, deploy estavel e ensaio
trilha: T5
responsavel: fernando
revisor: audrey
semana: S14
requisitos: []
secoes_doc: [00]
branch: docs/S14-F-entrega
tipo: [documentacao]
status: backlog
---
# Build do documento, deploy estável e ensaio

> **Fernando** · semana **S14** (25/11 a 01/12) · marco da semana: _Entrega em 01/12_

## 1. Contexto

Entrega em 01/12, em PDF, pelo AVA. Não há reenvio depois do prazo.

## 2. Arquivos afetados

_A preencher antes de comecar: caminhos concretos, incluindo migration se houver dado novo._

## 3. Passos

_A preencher._

## 4. O que testar

Obrigatórios pelo tipo (`documentacao`):

- [ ] `npm run pfc:check` sem bloqueio
- [ ] `npm run verify` verde
- [ ] `npm run pfc:check` sem bloqueio novo

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. _A preencher._

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [ ] Nenhum texto orientador do template remanescente
- [ ] Todos os links da seção 4 acessiveis publicamente
- [ ] PDF conferido: capa, sumário e paginação
- [ ] Extensao respeita o limite da seção em `docs/pfc/_regras.md`
- [ ] Nenhuma afirmação sem evidência no repositório
- [ ] Parte 00 atualizada com o que mudou

## 6. Evidência

- [ ] Saida dos testes
- [ ] Screenshot ou gravação do fluxo (se houver tela)
- [ ] Delta de cobertura (se mexeu em `lib/`)
