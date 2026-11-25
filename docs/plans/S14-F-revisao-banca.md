---
id: S14-F-revisao-banca
titulo: Correções da leitura de banca no documento final
trilha: T5
responsavel: fernando
revisor: audrey
semana: S14
requisitos: [RNF05.3]
secoes_doc: ["00", 5, 6, 7, 11, 13, 14, 15, 16, 17, 19, 20, 21, 22, 24, 25, 26]
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
- **Sem número de página e sem sumário.** O template da disciplina traz o
  sumário (níveis 1 a 3), e o `soffice --convert-to` não preenche o campo: a
  página saía em branco. Sem número de página, o sumário também não serviria.
- **Legenda da figura embaixo e sem fonte.** A NBR 14724 pede a identificação
  acima da ilustração e a fonte abaixo, mesmo quando é produção dos autores.
- **Documento desatualizado pelos PRs de 25/11.** O #93 integrou a geração de
  roteiro por IA, mas marcou RF12.1 a RF12.3 com o rótulo antigo "Existente" e
  não atualizou as contagens; cerca de dez trechos, nas seções 5 a 7, 16, 17,
  19, 20, 22, 24 e 26, ainda a chamavam de prévia. O #90 rebaixou sete RF e
  quatro RNF a parciais sem refletir isso nas seções 20.4 e 24.5, e a linha 4.0
  da Parte 00 dava RF01.7, RF01.8 e RF02.3 como implementados. O #90 também
  mostrou que o UC14 "Sair da viagem" não tem tela, contra a regra da seção 17.

## 2. Arquivos afetados

- `docs/pfc/referencias.md` (novo) e `scripts/pfc/secoes.mjs`
- `scripts/pfc/reference-docx.py` e `docs/pfc/_template/reference.docx` — estilo
  "Referencia"
- `scripts/pfc/tabelas.lua` — largura das colunas em centímetros
- `docs/pfc/00-historico-versao.md` e as seções 5, 11, 13, 14, 15, 16, 17, 19,
  20, 22, 24 e 25
- `scripts/pfc/build.mjs` — sumário depois da capa e exportação do PDF por
  `scripts/pfc/exportar-pdf.py` (novo), que atualiza o sumário antes
- `scripts/pfc/figuras.lua` (novo) — legenda acima, fonte abaixo
- `scripts/pfc/reference-docx.py` — número de página no cabeçalho, capa sem
  número, estilos de legenda e de fonte
- Conciliação: seções 5, 6, 7, 13 a 17, 19 a 22, 24 a 26 e a Parte 00;
  diagramas 16.1, 17.2, 17.3, 20.1 e 20.2 (`.puml` e `.png`); planos
  `S10-M-ia-adapter`, `S11-M-tela-roteiro-ia` e `S12-Ab-doc-req`; remoção de 19
  SVG soltos em `docs/pfc/diagramas/C:/...`, gerados por engano na 4.0

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
6. Número de página no canto superior direito, abaixo do logo, a partir da
   página 2; a capa usa cabeçalho de primeira página, igual ao das demais e sem
   o número. O número vai numa caixa de texto ancorada, como os logos: em
   parágrafo novo do cabeçalho (mesmo com `w:framePr`), o LibreOffice aumentava
   o cabeçalho e descia o texto de todas as páginas em 7 pt.
7. Sumário com os níveis 1 a 3, como no template, logo depois da capa. O PDF
   passa a ser exportado pelo LibreOffice via UNO, que atualiza o índice duas
   vezes (o próprio sumário empurra as páginas) antes de exportar.
8. Figuras: legenda acima, imagem, e "Fonte: elaborado pelos autores (2026)."
   abaixo. A altura máxima da figura cai de 18,5 para 17,5 cm para caber com as
   duas linhas: com 18,5, três figuras iam sozinhas para a página seguinte e
   deixavam meia página em branco.
9. Conciliação depois dos PRs #90 a #93: rótulo e contagens recalculados das
   tabelas das seções 14 e 15 e da matriz; a IA descrita como funcionalidade
   em todas as seções; caso de uso UC08 "Montar viagem com a Avori" e o antigo
   UC14 retirado, com a renumeração de UC08 a UC14 (de UC15 em diante, nada
   muda); Gemini como terceiro sistema externo no C4; R24 (injeção de instrução
   na IA) e o contorno do limite pela janela no R12 da seção 25.
10. Linha de tabela não se parte entre páginas (`IsSplitAllowed`, aplicado pelo
    `exportar-pdf.py`): o fim de uma rota longa ficava sozinho no alto da
    página seguinte.

## 4. O que testar

Obrigatórios pelo tipo (`documentacao`):

- [x] `npm run pfc:check` sem bloqueio
- [x] `npm run verify` verde — lint sem erro (39 avisos, teto 79), tipos, 1.675
  testes em 93 arquivos (eram 1.532 em 86 antes dos PRs #92 e #93); o build, que
  neste worktree não tem `.env.local`, passou com os mesmos valores substitutos
  que o `ci.yml` usa
- [x] `npm run pfc:rastreabilidade:check` sem inconsistência

**Roteiro de teste manual**

1. `npm run pfc:build` — gera o PDF; o filtro avisa só nas quatro tabelas de
   identificadores longos (três de rotas e a de fluxos da 22.3).
2. Contar palavras partidas entre linhas: no PDF entregue, 281; depois, nenhuma
   no meio de palavra. As 8 que restam caem em ponto de leitura
   ("atualizarItemItinerario|Schema", "rateio-despesa|.spec.ts").
3. Abrir o PDF: referências na última página; Parte 00, cronograma, seções 13,
   14 e 25.5 sem palavra partida; nenhuma página quase vazia nova.
4. Conferir, pelo texto extraído do PDF, que cada entrada do sumário aponta a
   página onde o título de fato está.
5. Capa sem número; da página 2 em diante, número abaixo do logo, sem encostar
   nele nem no texto.
6. Cada uma das 20 figuras com a legenda acima e a fonte abaixo, na mesma
   página da imagem.
7. `git grep` pelos termos que marcavam a IA como prévia e pelas contagens
   antigas (39 rotas, 61 funcionais, 70 requisitos, 79 e 83 marcados) fora das
   seções datadas de 22/11 (17.1 e 24): nenhuma ocorrência.

## 5. O que validar

- [x] Toda citação das seções 11 e 12 tem entrada nas referências
- [x] Status de cada RNF igual nas seções 15 e 20.4
- [x] Contagem de implementados igual nas seções 14.1, 15.1 e 24.5 e na matriz
- [x] Nenhum "nesta versão" ou "versão anterior" narrando mudança de status no corpo
- [x] Parte 00 registra o que mudou
- [x] Sumário com as 7 PARTES, as 27 seções, as subseções de nível 3 e as
  Referências, e número de página certo em todas as entradas (101 entradas
  conferidas contra os marcadores do PDF, nenhuma divergente)
- [x] Capa sem número de página; páginas 2 a 110 numeradas, todas com o número
  certo e sem tocar no logo nem no texto
- [x] Toda figura com legenda acima e fonte abaixo (NBR 14724): as 20 com os
  três elementos na mesma página
- [x] Contagens das seções 14.1, 15.1 e 24.5 iguais às tabelas e à matriz
  (57, 30 e 10 RF; 9, 16, 13 e 5 RNF; 66 implementados; 84 no código e 88 com
  teste)
- [x] Nenhuma seção descreve a IA de roteiros como prévia ou não implementada
- [x] Todo caso de uso da seção 17 tem tela e rota; a Avori aparece como UC08
- [x] Status dos RNF iguais nas seções 15 e 20.4 depois do #90 e do #93

## 6. Evidência

- [x] Saída do `verify` (resumo no item 4)
- [x] Contagem de quebras antes (281) e depois (8, todas em ponto de leitura)

## Andamento

- PDF com 107 páginas (eram 108), montado a partir desta branch.
- Com sumário (páginas 2 a 4), 110 páginas. Páginas com mais de metade em
  branco: 4, contra 5 no PDF entregue: as Referências e as que antecedem as
  figuras 16.1, 20.2 e 20.5, que não cabem depois do texto.
- Depois da conciliação, 112 páginas: sumário com 101 entradas, todas na
  página certa; as 20 figuras com legenda e fonte; 8 quebras em ponto de
  leitura; só duas páginas com mais de metade em branco (a de abertura da
  PARTE 04, antes da Figura 16.1, e as Referências). Os 32 casos de uso da
  tabela batem com os três diagramas.
