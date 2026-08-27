---
name: pfc-secao
description: Escreve ou atualiza uma seção numerada do Documento de Especificação do Projeto Integrador, coletando evidência no repositório e delegando a redação ao agente doc-pfc. Use ao final de qualquer trabalho que afete o documento.
---

# Escrever uma seção do documento

Uso: `/pfc-secao 24` · `/pfc-secao 22.2` · `/pfc-secao 14,15` — sem argumento, liste o que está pendente.

## Passos

### 1. Carregue as regras da seção

Leia `docs/pfc/_regras.md` na entrada correspondente: obrigatoriedade no 7º período, extensão esperada em
linhas, formato de tabela, e o que o avaliador observa. Respeitar a extensão é parte da nota — texto longo
demais perde ponto igual a texto curto demais.

### 2. Colete evidência antes de escrever

Esta é a parte que não pode ser pulada. A seção é escrita a partir do repositório, nunca de memória nem da
documentação herdada — que contém afirmações comprovadamente falsas (SWR, Storage, Realtime, Jest e Bun
listados sem existirem; RLS declarada sem policy versionada; CRUDs documentados sem tela).

Onde procurar, por seção:

| Seções | Evidência |
|---|---|
| 13, 14, 15 | `docs/pfc/rastreabilidade.md`, código das rotas, `docs/ARCHITECTURE.md` §6–§7 **com os Status corrigidos** |
| 18 | `supabase/migrations/`, `types/database.ts` |
| 20, 21, 22 | Estrutura de `app/`, `lib/`, `package.json` real, `.github/workflows/` |
| 23 | Árvore de pastas, convenção de branch e commit, histórico do git |
| 24 | Saída de `npm run test`, cobertura, relatório do Playwright em `docs/pfc/evidencias/` |
| 25 | `supabase/migrations/*_rls.sql`, `tests/rls/`, `docs/pfc/evidencias/seguranca/` |
| 16 | `app/**/page.tsx`, screenshots do E2E, protótipo no Figma |
| 26 | `lib/ai/`, tabelas e rotas do social |

Se faltar evidência, **não invente**: marque `> [!] PENDENTE: <o que falta e quem tem>` e siga.

### 3. Delegue a redação

Chame o agente `doc-pfc` via Agent tool, passando: o número da seção, as regras carregadas no passo 1, a
evidência coletada no passo 2 e o caminho do arquivo de destino em `docs/pfc/`.

Ele escreve no registro acadêmico correto e sabe que só pode afirmar o que está provado.

### 4. Atualize a Parte 00

Acrescente uma linha em `docs/pfc/00-historico-versao.md` com versão, data e o que mudou. O histórico só
tem valor se for escrito na hora — reconstruído no fim, vira ficção e o avaliador percebe.

### 5. Verifique

`npm run pfc:check` — acusa seção obrigatória vazia, texto orientador remanescente e link de artefato
quebrado. Rode antes de considerar a seção pronta.

## Regra de ouro

Divergência entre a documentação antiga e o código: **o código vence**, e a correção entra na Parte 00.
