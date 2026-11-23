---
id: S14-Ab-congelamento-ab
titulo: Correção de bugs e ensaio da apresentação
trilha: T1
responsavel: abner
revisor: fernando
semana: S14
requisitos: [RF06.1, RF06.2]
secoes_doc: []
branch: fix/S14-Ab-congelamento-ab
tipo: [correcao-de-bug]
depende_de: []
status: concluido
---
# Correção de bugs e ensaio da apresentação

> **Abner** · semana **S14** (25/11 a 01/12) · marco da semana: _Entrega em 01/12_

## 1. Contexto

**Bug: o valor da despesa aceitava mais de duas casas decimais e era gravado
diferente do pedido.** O schema (`lib/schemas/despesa.ts`) exigia só número
positivo, e as rotas de criação e de edição levam o total a centavos com
`Math.round(amount * 100)`.

- **Impacto:** `0.004` passava no `positive()` e virava uma despesa de R$ 0,00.
  `expenses.amount` não tem CHECK no banco, então nada a barrava, e o zero
  entrava nos totais, no gráfico por categoria e no acerto. `10.005` era gravado
  como 10,01 e `10.999` como 11,00, sem aviso: o lançamento gravado não era o
  enviado.
- **Reprodução:** `POST /api/trips/<id>/expenses` com `"amount": 0.004`, ou
  `PATCH .../expenses/<id>` com o mesmo valor, responde 200. A tela usa
  `step="0.01"`, mas a rota é a garantia (regra 1 do projeto), e qualquer
  cliente que chame a API grava o valor alterado.
- **Por que este:** o dano é claro (dado financeiro diferente do pedido), a
  reprodução não depende de serviço externo, a correção cabe numa linha do
  schema, sem migration, e a regra certa já existe no projeto: o valor exato do
  rateio e o pagamento do acerto recusam mais de duas casas com `reaisParaCentavos`.

**Candidatos descartados**

- *Data impossível* (`2026-02-31`) passa pela regex do schema, mas o Postgres a
  recusa e a rota responde 400 genérico: não há dado errado gravado, só a
  mensagem pouco específica.
- *Moeda da despesa* aceita qualquer texto de três caracteres (`"1@3"`), enquanto
  a do acerto exige `[A-Z]{3}`. A tela trata código desconhecido sem quebrar, e
  o formulário só oferece moedas válidas; impacto baixo.

## 2. Arquivos afetados

- `lib/schemas/despesa.ts` — `base.amount` passa a exigir até duas casas
- `tests/lib/despesa-valor-centavos.test.ts` — regressão (novo)
- `docs/plans/S14-Ab-congelamento-ab.md` — este plano
- `docs/pfc/evidencias/S14-Ab-congelamento-ab.txt` — antes, depois e regressão

Sem migration, sem mudança de tela, sem mudança no documento do PFC.

## 3. Passos

1. **Diagnóstico:** leitura do schema e das rotas de despesa, comparadas com os
   schemas do rateio (`valorMonetario`) e do acerto (`registrarTransferenciaSchema`),
   que já usam `reaisParaCentavos`; busca de CHECK em `expenses.amount` nas migrations.
2. **Reprodução:** `Math.round(0.004 * 100) / 100` dá `0`; `10.005` dá `10.01`.
3. **Teste:** `tests/lib/despesa-valor-centavos.test.ts`, com a rota de criação
   contra um cliente falso (400 e nenhum insert) e os schemas de criação e de
   edição (recusa e aceite).
4. **Teste falhando:** 6 de 12 falharam pelo comportamento real: a rota
   respondeu 200 e chamou o insert; os schemas aceitaram o valor.
5. **Correção:** um `.refine` em `base.amount` com `reaisParaCentavos`, herdado
   por `criarDespesaSchema` e `atualizarDespesaSchema`.
6. **Mesmo teste passando:** 12 de 12, sem mudar nenhuma expectativa.
7. **Regressão final:** testes do domínio de despesas, suíte completa,
   typecheck, lint e verificadores do PFC.

**Roteiro do ensaio da apresentação (a realizar; ainda não ensaiado)**

Cerca de 10 minutos, com os usuários A e B do seed (`teste.a@viajamais.local`,
`teste.b@viajamais.local`, senha `Viaja+mais123`) em duas janelas.

1. **Problema** (1 min): quem viaja em grupo divide roteiro, reservas e gastos
   entre aplicativos, planilhas e conversas; o Avori junta tudo numa viagem só.
2. **Criação da viagem** (A): Painel → Nova viagem, com destino, datas e moeda.
3. **Participantes:** A convida B pelo e-mail; B aceita na aplicação e passa a ver
   a viagem. Mostrar que sem convite ninguém entra.
4. **Itinerário, reservas e lugares:** uma atividade, uma reserva de voo e um
   lugar marcado como visitado, nas abas da viagem.
5. **Despesas** (A): lançar o jantar, com título, valor, categoria e data.
6. **Rateio:** dividir igual, por peso e por valor exato; mostrar que os
   centavos sempre fecham com o total.
7. **Saldo e acerto:** abrir o acerto de contas, mostrar o saldo de cada um e a
   transferência sugerida; B registra o pagamento e o saldo zera.
8. **Qualidade:** CI com testes de integração, RLS com dois usuários, ponta a
   ponta em computador e celular e corte de cobertura de 70%; mostrar a matriz
   de rastreabilidade.
9. **Bug corrigido nesta S14:** mostrar o teste
   `tests/lib/despesa-valor-centavos.test.ts` e a evidência: antes, `0.004`
   virava despesa de R$ 0,00; agora a API responde 400 e nada é gravado.
10. **Encerramento:** o que ficou para o próximo período (feed, curtidas, IA de
    roteiros, pesquisa com usuários) e perguntas.

## 4. O que testar

Obrigatórios pelo tipo (`correção-de-bug`):

- [x] Teste de regressão que **falha antes** e passa depois do fix

**Roteiro de teste manual**

1. Desfazer só a correção: `git stash push lib/schemas/despesa.ts`.
2. `npx vitest run tests/lib/despesa-valor-centavos.test.ts` — esperado:
   `Tests 6 failed | 6 passed (12)`, com `expected 200 to be 400` na rota.
3. Restaurar: `git stash pop`.
4. Rodar o mesmo comando — esperado: `Tests 12 passed (12)`.
5. `npx vitest run tests/lib/despesa-schema.test.ts tests/lib/expenses-route.test.ts tests/api/expense-item-route.test.ts tests/lib/finance-rateio.test.ts tests/components/expense-split.test.tsx tests/lib/despesa-valor-centavos.test.ts`
   — esperado: `Tests 169 passed (169)`.
6. `npm run test`, `npm run typecheck` e `npm run lint` — esperado: tudo verde,
   lint sem erro.

## 5. O que validar

- [x] O bug original foi reproduzido antes do fix e não reproduz depois
- [x] O teste de regressão falhou antes (6 de 12, pelo comportamento real)
- [x] O mesmo teste passou depois, sem mudar expectativa (12 de 12)
- [x] Os testes relacionados passaram (169 no domínio; 1544 na suíte completa)
- [x] Valor com até duas casas continua aceito e gravado como enviado

## 6. Evidência

- [x] Saída dos testes: `docs/pfc/evidencias/S14-Ab-congelamento-ab.txt`
- Screenshot: não se aplica, pois a correção é na API, sem mudança de tela.
- Delta de cobertura: não medido; a mudança em `lib/schemas/despesa.ts` é uma
  linha coberta pelos testes de recusa e de aceite do teste de regressão.
- Ensaio da apresentação: **não realizado**; o roteiro acima é para o ensaio.
