---
id: S13-Ab-doc-8-12
titulo: Seções 8 a 12
trilha: T5
responsavel: abner
revisor: fernando
semana: S13
requisitos: []
secoes_doc: [8, 9, 10, 11, 12]
branch: docs/S13-Ab-doc-8-12
tipo: [documentacao]
depende_de: []
status: concluido
---
# Seções 8 a 12

> **Abner** · semana **S13** (18 a 24/11) · marco da semana: _Congelamento de funcionalidades em 20/11_

## 1. Contexto

As seções 8 (Público-alvo), 9 (Contexto de negócio), 10 (Soluções existentes),
11 (Pesquisa com usuários) e 12 (Resultados da pesquisa) já estavam na `main`
quando esta atividade começou. As cinco entraram no commit `d7ba1bf`
(22/11/2026, "documento final do 7º período, versão 4.0"), do PR #83, e não têm
outro commit desde então.

Esta atividade **não escreveu** as seções. Ela as conferiu contra as regras de
`docs/pfc/_regras.md`, contra o catálogo das seções 14 e 15 e contra as fontes
citadas; consolidou o resultado neste plano; validou com o `pfc:check`; e
registrou a conferência na Parte 00.

A transparência da seção 11 foi tratada como requisito da conferência: a
investigação foi documental e comparativa, e neste semestre não houve
questionário, entrevista nem outra pesquisa primária com usuários.

## 2. Arquivos afetados

- `docs/pfc/00-historico-versao.md` — versão 3.19, antes da 4.0
- `docs/plans/S13-Ab-doc-8-12.md` — este plano
- `docs/pfc/evidencias/S13-Ab-doc-8-12-pfc-check.txt` — saída final do `pfc:check`

Nenhuma das seções 8 a 12 foi alterada: a conferência não encontrou problema
objetivo que pudesse ser corrigido sem inventar conteúdo (ver seção 6). Sem
código, sem teste, sem migration.

## 3. Passos

1. **Linha de base:** `npm.cmd run pfc:check` antes de qualquer alteração.
2. **Auditoria das cinco seções:** leitura integral de cada uma contra a linha
   correspondente da tabela "Seção a seção" de `_regras.md` (extensão e formato)
   e contra as regras gerais (parágrafo de até 550 caracteres, registro formal,
   nada afirmado sem evidência).
3. **Conferência das referências:** busca no repositório inteiro pelas três
   fontes citadas nas seções 11 e 12 e por uma seção de referências do PFC.
4. **Conferência dos requisitos:** cada ID citado na seção 12 procurado nas
   tabelas das seções 14 e 15.
5. **Validação final:** `pfc:check`, `pfc:rastreabilidade:check`,
   `git diff --check`, busca de placeholders e de termos proibidos.

## 4. O que testar

Obrigatórios pelo tipo (`documentacao`):

- [x] `npm run pfc:check` sem bloqueio novo

**Linha de base, antes da atividade** (22/11/2026, `main` em `2e77c31`):
seções preenchidas 28/28 (obrigatórias: 26), nenhum bloqueio, nenhum aviso.

**Roteiro de teste manual**

1. `npm.cmd run pfc:check` — esperado: "Seções preenchidas: 28/28" e "Nenhum bloqueio".
2. `git log --follow --format="%h %ad %s" --date=short -- docs/pfc/03-publico/11-pesquisa-usuarios.md`
   (e o mesmo para 8, 9, 10 e 12) — esperado: um único commit, `d7ba1bf`.
3. `git grep -n -E "VERISSIMO|PEREIRA|THINK WITH GOOGLE"` — esperado: ocorrências
   só nas seções 11 e 12; nenhuma lista de referências.
4. Para cada ID da tabela da seção 12, `git grep -n -E "^\| <ID> \|" docs/pfc/03-publico/`
   — esperado: uma linha na seção 14 ou 15.
5. Abrir a seção 11 — esperado: a frase "neste semestre não aplicamos
   questionário nem fizemos entrevistas com usuários" está presente.
6. `git diff --stat` — esperado: nenhum arquivo de `docs/pfc/03-publico/` alterado.

## 5. O que validar

- [x] Extensão respeita o limite da seção em `docs/pfc/_regras.md`: seção 8 com
      cerca de 12 linhas (limite 10–15), seção 9 com cerca de 14 (12–18), seção
      10 com cerca de 11 (8–12); 11 e 12 sem limite; nenhum parágrafo acima de
      550 caracteres
- [x] Nenhuma afirmação apresentada como pesquisa primária
- [x] Citações das seções 11 e 12 localizadas e procuradas no repositório.
      As referências bibliográficas completas **não** foram validadas, porque
      não existem no PFC; ficam como pendência documental (seção 6)
- [x] IDs de requisitos citados existem nas seções 14 e 15
- [x] Parte 00 atualizada com o que mudou (versão 3.19)
- [x] 28/28 seções mantidas

## 6. Evidência

- [x] Saída dos testes: `docs/pfc/evidencias/S13-Ab-doc-8-12-pfc-check.txt`
- Screenshot: não se aplica, pois é atividade documental.
- Delta de cobertura: não se aplica, pois não há alteração em `lib/`.

**Resultado da auditoria**

| Seção | Verificado | Resultado |
|---|---|---|
| 8 | Perfis, uso de cada perfil, distinção entre individual, grupo/família e recorrente, coerência com 13 e 25 | Conforme. Três perfis, cada um com o modo de uso; "jovens adultos e profissionais que viajam com frequência" é o perfil recorrente; a distinção dono/convidado remete às seções 13 e 25 |
| 9 | Processo atual, fragmentação, oportunidade, não substituir reservas | Conforme. Processo em quatro etapas; a dificuldade está nas transições; declara "Não pretendemos substituir as plataformas de reserva" |
| 10 | Categorias reais, limitações, oportunidade, nenhum concorrente inventado | Conforme. Quatro categorias genéricas (mapas, organizadores de itinerário, divisão de contas, planilhas e mensagens), cada uma com limitação; nenhum produto nomeado |
| 11 | Ausência de pesquisa primária, fontes | Conforme. Declara investigação documental e comparativa, sem questionário nem entrevista, e lista as consequências da limitação |
| 12 | Origem documental, nenhuma resposta atribuída a usuário, ligação com requisitos | Conforme. Cada achado traz a fonte ou "Análise comparativa (seção 10)"; a introdução diz que os achados não vêm de usuários; RF09 e RF10 são deixados de fora por falta de fonte |

**Requisitos conferidos** (seção 12 → tabelas das seções 14 e 15): RF01.5,
RNF03.1, RF04.1, RF04.3, RF04.4, RF06.5, RF06.9, RF06.10, RF06.11, RF06.13 e os
grupos RF03 (8 requisitos), RF05 (7), RF06 (13), RF07 (7), RF08 (6), RF09 (17),
RF10 (4) e RF11 (3). Todos existem.

**Pendência documental encontrada pela auditoria: referências bibliográficas**

- As citações VERISSIMO; ALEXANDRE (2020), PEREIRA (2021) e THINK WITH GOOGLE
  (2016) existem nas seções 11 e 12, e só nelas.
- Não foi encontrada lista de referências correspondente no PFC: o documento não
  tem seção de referências, `_regras.md` não prevê uma, e nenhum arquivo do
  repositório traz os dados completos das obras.
- As referências completas, portanto, não foram validadas por esta atividade.
- Não acrescentamos as entradas, e as seções 8 a 12 não foram alteradas para
  ocultar a pendência. Completar as referências exige consultar as fontes
  originais; quem as tiver deve incluir a lista completa, em formato ABNT.

**Limitação registrada:** a seção 11 cita uma pesquisa primária prevista "na
versão anterior deste documento". Essa versão não está no repositório (o
histórico das seções começa em `d7ba1bf`), então a afirmação não pôde ser
conferida; ela não altera a declaração de que a pesquisa não foi feita.
