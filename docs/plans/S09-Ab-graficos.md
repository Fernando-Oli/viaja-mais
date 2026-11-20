---
id: S09-Ab-graficos
titulo: Gráficos com recharts e relatório por categoria
trilha: T1
responsavel: abner
revisor: fernando
semana: S09
requisitos: [RF06]
secoes_doc: [22.1]
branch: feat/S09-Ab-graficos
tipo: [tela]
depende_de: []
status: em-desenvolvimento
---
# Gráficos com recharts e relatório por categoria

> **Abner** · semana **S09** (21 a 27/10) · marco da semana: _Rede social ponta a ponta_

## 1. Contexto

Hoje os gráficos são barras de CSS; recharts esta instalado e nunca foi importado.

Análise do estado atual de `app/dashboard/finances/page.tsx` (Server Component):

- `byCategory` soma `amount` por categoria **sem separar a moeda**: Hospedagem
  BRL 300 + Hospedagem USD 100 vira "400", exibido como `R$ 400.00` (prefixo
  fixo e `toFixed(2)`, sem `Intl`). O percentual também mistura moedas.
- O card "Categoria Principal" usa o mesmo `byCategory` e herda o erro.
- A moeda de cada despesa é a coluna `expenses.currency`: o formulário de
  despesa deixa escolher a moeda por lançamento. O acerto de contas
  (`lib/finance/acerto.ts`) já agrupa por `expense.currency || "BRL"`; o
  relatório por categoria segue a mesma regra.
- As consultas de `trips` e `expenses` descartam o `error` do Supabase: uma
  falha aparece como "Nenhuma despesa registrada", sem aviso.
- Carregamento e erro inesperado já têm padrão no dashboard:
  `app/dashboard/loading.tsx` (esqueleto) e `app/dashboard/error.tsx`
  (`components/estado-erro.tsx`, com "Tentar novamente").
- A tela é só leitura: não há operação de escrita cujo resultado precise de
  `toast()`.

Sem migration, sem mudança de schema, de RLS ou de `types/database.ts`: os
campos necessários (`amount`, `category`, `currency`) já são lidos hoje.

## 2. Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `lib/finance/categorias.ts` (novo) | `relatorioPorCategoria()`: agrupa por moeda e, dentro dela, por categoria, em centavos; ordena; calcula percentual. Exporta `ROTULOS_CATEGORIA`. |
| `components/finance-category-chart.tsx` (novo) | Client Component com o `BarChart` do Recharts por moeda e a tabela textual do relatório. Recebe só o relatório pronto. |
| `app/dashboard/finances/page.tsx` | Troca `byCategory` pelo relatório; aba "Por Categoria" usa o componente; card "Categoria Principal" passa a ser por moeda; rótulos vêm de `lib/finance/categorias.ts`; erro de consulta vai para `error.tsx`. |
| `tests/lib/finance-categorias.test.ts` (novo) | Unit da transformação. |
| `tests/components/finance-category-chart.test.tsx` (novo) | Componente: tabela, rótulos, ordem, moedas separadas, vazio. |
| `e2e/graficos-categoria.spec.ts` (novo) | E2E chromium + mobile, com screenshots. |
| `docs/pfc/evidencias/S09-Ab-graficos-*` (novos) | Screenshots e saída dos testes. |

Fora do escopo (não muda): criação, edição, rateio e pagamento de despesas;
acerto e `settlements`; abas "Visão Geral" e "Por Viagem"; card "Total de
Gastos"; banco.

## 3. Passos

1. `lib/finance/categorias.ts` e o unit `tests/lib/finance-categorias.test.ts`.
2. `components/finance-category-chart.tsx`: um bloco por moeda com o código da
   moeda, o total, `ResponsiveContainer` + `BarChart` horizontal (categoria no
   eixo Y, valor no eixo X, valor e % na ponta da barra, `Tooltip` com valor
   formatado e %) e, abaixo, a tabela Categoria · Despesas · Valor ·
   Participação. Estado vazio no componente, com o texto atual da tela.
3. Teste do componente.
4. `page.tsx`: consulta inalterada (só passa a checar `error`), relatório
   calculado no servidor, aba "Por Categoria" com o componente, card
   "Categoria Principal" com a principal de cada moeda.
5. E2E com conta recém-cadastrada (estado vazio) e com viagem própria com
   despesas BRL e USD lançadas pela API; screenshots em chromium e mobile.
6. `lint`, `typecheck`, `test`, `build` (`verify`), E2E da S09 e regressão
   direcionada das specs financeiras.

## 4. O que testar

Obrigatórios pelo tipo (`tela`):

- [x] E2E do fluxo com screenshot arquivado em `docs/pfc/evidências/`

Previstos nesta atividade:

- [x] Unit `tests/lib/finance-categorias.test.ts`: soma por categoria em
      centavos (0,10 + 0,20 = 0,30, sem erro de ponto flutuante); rótulos
      pt-BR das seis categorias; categoria desconhecida mantém a chave como
      rótulo; ordem por valor decrescente com desempate por rótulo;
      percentual sobre o total **da moeda**; moedas separadas (Hospedagem
      BRL 300 + USD 100 → dois grupos, nenhum "400"); `currency` nulo vira
      BRL; lista vazia devolve `[]`; contagem de despesas por categoria.
- [x] Componente `tests/components/finance-category-chart.test.tsx`: estado
      vazio; um bloco por moeda; linhas da tabela na ordem do relatório, com
      rótulo, valor em `Intl` pt-BR e percentual com uma casa.
- [x] E2E `e2e/graficos-categoria.spec.ts` (chromium e mobile): conta nova →
      aba "Por Categoria" mostra o estado vazio; com despesas BRL e USD → um
      bloco por moeda, gráfico (SVG do Recharts) visível, tabela com
      categorias, valores e percentuais esperados em ordem decrescente, sem
      rolagem horizontal e sem diálogo nativo; screenshots
      `S09-Ab-graficos-vazio-<projeto>.png` e
      `S09-Ab-graficos-categorias-<projeto>.png`.
- [x] Regressão: `rateio-despesa`, `editar-despesa`, `acerto-contas`,
      `acerto-transferencias`, `financeiro-jornada`.

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. `npm run db:reset`, depois `npm run build` e `npm run start`. Cadastrar
   uma conta nova em `/auth/sign-up`. Esperado: cai no `/dashboard`.
2. Abrir `/dashboard/finances` e clicar na aba "Por Categoria". Esperado:
   "Nenhuma despesa por categoria" e "Registre despesas para ver a
   distribuição"; o card "Categoria Principal" mostra "-".
3. Criar uma viagem e lançar nela, pela tela "Adicionar Despesa":
   "Hotel" Hospedagem BRL 300,00; "Jantar" Alimentação BRL 100,00;
   "Ônibus" Transporte BRL 50,00; "Hostel" Hospedagem USD 100,00.
4. Voltar a `/dashboard/finances` → "Por Categoria". Esperado: dois blocos,
   "BRL" com total R$ 450,00 e "USD" com total US$ 100,00.
5. No bloco BRL, a tabela, nesta ordem: Hospedagem R$ 300,00 66,7% ·
   Alimentação R$ 100,00 22,2% · Transporte R$ 50,00 11,1%. O gráfico mostra
   três barras na mesma ordem, com valor e % na ponta.
6. No bloco USD: Hospedagem US$ 100,00 100,0%. Em nenhum lugar da aba
   aparece R$ 400,00.
7. Passar o mouse (ou tocar, no celular) numa barra. Esperado: tooltip com a
   categoria, o valor na moeda do bloco e a participação.
8. Card "Categoria Principal": "Hospedagem", com a moeda indicada em cada
   linha (BRL e USD).
9. Repetir 4–7 com a janela em 412 px de largura (DevTools, Pixel 7).
   Esperado: gráfico e tabela legíveis, sem rolagem horizontal da página.

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [x] Funciona em mobile e desktop
- [ ] Feedback por `toast()`; sem `alert()` nem `confirm()` — `toast()` não se aplica (tela só de leitura); ausência de `alert()`/`confirm()` comprovada no E2E, ver critério específico abaixo
- [ ] Estado de erro e de carregamento tratados — ver o critério específico abaixo

Critérios específicos:

- [x] A aba "Por Categoria" renderiza um gráfico Recharts (`BarChart` dentro
      de `ResponsiveContainer`); `recharts` só é importado em Client Component.
- [x] `app/dashboard/finances/page.tsx` continua Server Component (sem `"use client"`).
- [x] Nenhum valor de moedas diferentes é somado: com Hospedagem BRL 300 e
      USD 100, a aba mostra dois blocos e nenhum "R$ 400,00".
- [x] Cada categoria mostra rótulo pt-BR, valor em `Intl.NumberFormat("pt-BR")`
      na moeda do bloco e percentual com uma casa, no gráfico e na tabela.
- [x] Categorias ordenadas por valor decrescente dentro de cada moeda.
- [x] Relatório textual (tabela) presente além do gráfico.
- [x] Sem despesas: estado vazio "Nenhuma despesa por categoria".
- [x] No Pixel 7 (412 px) não há rolagem horizontal da página.
- [ ] Carregamento: o `app/dashboard/loading.tsx` existente cobre a rota.
      Erro: falha na consulta de viagens ou de despesas é lançada e cai no
      `app/dashboard/error.tsx` (antes virava lista vazia silenciosa).
      _Situação:_ implementado, mas não exercitado por teste automatizado — não há
      como fazer a consulta falhar de fora sem quebrar o banco (mesma limitação
      registrada em `e2e/estados-erro.spec.ts`). A tela de erro em si é coberta
      por `tests/components/estado-erro.test.tsx`. Fica para a revisão confirmar.
- [x] `toast()`: não se aplica — a tela é só leitura, sem operação mutável.
      Nenhum `alert()`/`confirm()` (vigiado no E2E).
- [x] Sem migration, sem mudança de RLS, de schema ou de `types/database.ts`.
- [x] Cards "Total de Gastos" e "Viagens Ativas" e abas "Visão Geral" e
      "Por Viagem" inalterados.
- [x] `npm run verify` verde; E2E da S09 verde em chromium e mobile;
      regressão financeira verde.

## 6. Evidência

- [x] Saida dos testes
- [x] Screenshot ou gravação do fluxo (se houver tela)
- [x] Delta de cobertura (se mexeu em `lib/`)

Arquivos em `docs/pfc/evidencias/`:

| Arquivo | Conteúdo |
|---|---|
| `S09-Ab-graficos-vazio-chromium.png` / `-mobile.png` | Aba "Por Categoria" de conta sem despesas |
| `S09-Ab-graficos-categorias-chromium.png` / `-mobile.png` | Relatório com BRL e USD separados |
| `S09-Ab-graficos-e2e.txt` | E2E da S09: 4 de 4 (chromium e mobile) |
| `S09-Ab-graficos-regressao-financeira.txt` | Regressão financeira: 38 de 38 |
| `S09-Ab-graficos-cobertura.txt` | Unit e componente (17 testes) e cobertura de `lib/finance/categorias.ts`: 100% em linhas, ramos, funções e instruções |

Suíte completa (`npm run test`): 61 arquivos, 945 testes. `npm run verify` verde.

O roteiro manual da seção 4 não foi executado à mão nesta atividade: o E2E
cobre os passos 2 e 4 a 9, com as despesas lançadas pela API em vez da tela.
