---
id: S14-F-revisao-banca
titulo: Correções da leitura de banca no documento final
trilha: T5
responsavel: fernando
revisor: audrey
semana: S14
requisitos: [RNF05.3]
secoes_doc: ["00", 5, 11, 13, 14, 15, 16, 17, 19, 20, 22, 24, 25]
branch: docs/S14-F-revisao-banca
tipo: [documentacao]
depende_de: [S14-F-entrega]
status: em_andamento
---
# Correções da leitura de banca no documento final

> **Fernando** · semana **S14** (25/11 a 01/12) · marco da semana: _Entrega em 01/12_

## 1. Contexto

A versão 4.0 foi enviada pelo AVA em 22/11. Uma leitura do PDF no papel de banca
de TCC 1 apontou defeitos que o `pfc:check` não pega, porque são de coerência
entre seções e de forma:

- **Sem lista de referências.** As seções 11 e 12 citam VERISSIMO; ALEXANDRE
  (2020), PEREIRA (2021) e THINK WITH GOOGLE (2016), e o documento não tinha a
  seção de referências (NBR 6023). As referências completas estavam no documento
  do 4º período (`ViajaMais Projeto Integrativo.pdf`).
- **281 palavras partidas no meio de tabela** ("Implementad/o", "RNE-00/1",
  "26/0/8", "Pro/b."). O filtro `tabelas.lua` dava peso relativo às colunas, e o
  peso não garante a largura da maior palavra.
- **Contradições entre seções**: RNF02.8 parcial na 15 e atendido na 20.4;
  RNF06.1 a 06.3 o inverso; "60 requisitos implementados" na 24.5 contra 70 nas
  14 e 15; ordem do limite de requisições na 22.2 contrária ao parágrafo seguinte
  e ao código; quatro rotas com limite na 20.2 e seis na 22.2; "dois casos" de uso
  da chave de serviço na 20.2 e 22.2 e "três" na 18.2 e 25.3; "cinco falhas" e "17
  falhas" do teste de participante sem dizer que são 5 hipóteses e 17 de 30 casos;
  RNF05.3 atendido com 12 requisitos implementados sem marcação no código;
  semestre "de setembro" com S01 em 26/08; "só casos de uso implementados" com UC
  que realizam requisitos parciais; "RNF-08.1"; "quatro limitações resolvidas"
  seguidas de cinco itens.
- **Histórico de versão dentro do corpo** ("passou de não iniciado a implementado
  nesta versão", "a versão anterior o dava como parcial").
- **Cobertura de 98,21% na seção 5 sem a ressalva** de que mede só `lib/` e
  `app/api/`.

## 2. Arquivos afetados

- `docs/pfc/referencias.md` (novo) e `scripts/pfc/secoes.mjs`
- `scripts/pfc/reference-docx.py` e `docs/pfc/_template/reference.docx` — estilo
  "Referencia"
- `scripts/pfc/tabelas.lua` — largura das colunas em centímetros
- `docs/pfc/00-historico-versao.md` e as seções 5, 11, 13, 14, 15, 16, 17, 19,
  20, 22, 24 e 25

Nenhuma migration e nenhum código de aplicação.

## 3. Passos

1. Referências em seção própria, depois da 27, com estilo alinhado à esquerda.
2. Filtro de tabelas: cada coluna recebe primeiro a largura da maior palavra
   (estimada por classe de caractere em Calibri 10 pt e Consolas 9,5 pt); a sobra
   vai para as colunas de texto longo. Código e URL em célula ganham espaço de
   largura zero depois de "/"; nas tabelas que não cabem na página, também entre
   minúscula e maiúscula e antes da extensão.
3. Contradições: corrigir para o que o código e a matriz dizem.
4. Tirar a narração de versão do corpo; achados que são resultado (20.4, 24.7,
   25.5) ficam, com a data no lugar de "nesta versão".
5. `pfc:check`, `pfc:build` e conferência do PDF.

## 4. O que testar

Obrigatórios pelo tipo (`documentacao`):

- [x] `npm run pfc:check` sem bloqueio
- [x] `npm run verify` verde — lint sem erro (39 avisos, teto 79), tipos, 1.532
  testes em 86 arquivos; o build, que neste worktree não tem `.env.local`, passou
  com os mesmos valores substitutos que o `ci.yml` usa
- [x] `npm run pfc:rastreabilidade:check` sem inconsistência

**Roteiro de teste manual**

1. `npm run pfc:build` — gera o PDF; o filtro avisa só nas quatro tabelas de
   identificadores longos (três de rotas e a de fluxos da 22.3).
2. Contar palavras partidas entre linhas: no PDF entregue, 281; depois, nenhuma
   no meio de palavra. As 8 que restam caem em ponto de leitura
   ("atualizarItemItinerario|Schema", "rateio-despesa|.spec.ts").
3. Abrir o PDF: referências na última página; Parte 00, cronograma, seções 13,
   14 e 25.5 sem palavra partida; nenhuma página quase vazia nova.

## 5. O que validar

- [x] Toda citação das seções 11 e 12 tem entrada nas referências
- [x] Status de cada RNF igual nas seções 15 e 20.4
- [x] Contagem de implementados igual nas seções 14.1, 15.1 e 24.5 e na matriz
- [x] Nenhum "nesta versão" ou "versão anterior" narrando mudança de status no corpo
- [x] Parte 00 registra o que mudou

## 6. Evidência

- [x] Saída do `verify` (resumo no item 4)
- [x] Contagem de quebras antes (281) e depois (8, todas em ponto de leitura)

## Andamento

- PDF com 107 páginas (eram 108), montado a partir desta branch.
