---
id: S07-Ab-acerto-contas
titulo: Tela de acerto de contas
trilha: T1
responsavel: abner
revisor: fernando
semana: S07
requisitos: [RF06]
secoes_doc: [22.1]
branch: feat/S07-Ab-acerto-contas
tipo: [tela]
depende_de: []
status: backlog
---
# Tela de acerto de contas

> **Abner** · semana **S07** (07 a 13/10) · marco da semana: _Primeiro E2E verde no CI_

## 1. Contexto

Saldo por membro e transferências sugeridas.

## 2. Arquivos afetados

Sem migration e sem mudança de RLS: a tela só **lê** o que já existe na main.
`expenses.paid_by`, `expense_shares` (`amount`, `weight`, `settled_at`) e as
policies de leitura vêm de `supabase/migrations/20260926102023_financeiro_rateio.sql`
(S04-F); `calcularSaldos()` e `minimizarTransferencias()` já estão em
`lib/finance/balances.ts` (S05-Ab-balances, PR #28); `formatarCentavos()` já está
em `lib/finance/rateio.ts` (S06-Ab-rateio-ui, PR #31). `types/database.ts` não muda.

Criados:

- `lib/finance/acerto.ts` — **novo**: função pura `montarAcerto()` que recebe as
  linhas lidas do banco (despesas, partes em aberto, membros), monta o formato
  `DespesaDividida` e delega o cálculo a `calcularSaldos()` e
  `minimizarTransferencias()`. Não reimplementa nenhuma conta de saldo: só
  adapta a entrada, separa por moeda e completa com saldo zero quem é membro e
  não tem movimento.
- `app/api/trips/[tripId]/acerto/route.ts` — **novo**: `GET` protegido por
  `exigirMembro()`; lê os dados, chama `montarAcerto()` e devolve JSON.
- `app/dashboard/trips/[id]/acerto/page.tsx` — **novo**: tela de acerto de
  contas (client component), no mesmo molde de
  `app/dashboard/trips/[id]/expenses/new/page.tsx`: busca na API, estados de
  carregamento e erro, `toast()` e "Tentar novamente".
- `components/acerto-contas.tsx` — **novo**: apresentação dos saldos por membro
  e das transferências sugeridas (sem cálculo, só exibição).
- `tests/lib/finance-acerto.test.ts` — **novo**: unit de `montarAcerto()`.
- `tests/api/acerto-route.test.ts` — **novo**: integração da rota (200/401/403/400).
- `tests/components/acerto-contas.test.tsx` — **novo**: tela em jsdom.
- `e2e/acerto-contas.spec.ts` — **novo**: fluxo com screenshots, projetos
  `chromium` e `mobile`.

Editados:

- `app/dashboard/trips/[id]/page.tsx` — **editar**, só um botão/link
  "Acerto de contas" no cabeçalho da aba Despesas, ao lado de
  "Adicionar Despesa". O arquivo é do domínio da Audrey: a mudança se limita a
  esse link e será avisada a ela antes do PR.

Não mudam: `lib/finance/balances.ts` e `lib/finance/rateio.ts` (só consumidos),
`supabase/migrations/`, `supabase/seed.sql`, `types/database.ts`.

Fora do escopo (S08-Ab-transferencias e seguintes): tabela `settlements`,
registrar ou liquidar transferência, marcar parte como quitada (RF06.12),
qualquer escrita em `expense_shares`, a correção da Issue #36 (ordem do centavo
no rateio, tratada em branch própria), conversão entre moedas (S10).

## 3. Passos

### Arquitetura escolhida

**Rota de leitura dedicada + tela cliente que consome a rota.**

- `GET /api/trips/[tripId]/acerto` concentra autorização, leitura e cálculo.
- A tela `app/dashboard/trips/[id]/acerto/page.tsx` só busca e exibe.

Motivos:

1. **Autorização testável nos quatro caminhos.** A regra do projeto exige teste de
   integração 200/401/403/400 para quem toca dado de viagem. Uma rota com
   `exigirMembro()` se testa igual a `tests/api/expense-item-route.test.ts`;
   num server component, o 403 viraria um `redirect` difícil de provar.
2. **Mesmo padrão das telas financeiras já entregues.** A S06 carrega dados por
   `fetch` à API com carregamento, erro, `toast()` e "Tentar novamente"
   (`expenses/new/page.tsx`). O plano pede esses estados explicitamente, e eles
   são naturais num client component.
3. **Reuso pela S08.** A S08 (marcar quitado, registrar transferência) vai
   recarregar o acerto depois de cada ação; com a rota, basta chamá-la de novo.
4. **Cálculo em um lugar só.** A rota chama `montarAcerto()`, que chama
   `calcularSaldos()` e `minimizarTransferencias()`. A tela não soma nada.

Caminho: o plano norte cita `/api/acertos` no domínio financeiro. Esta
atividade usa `app/api/trips/[tripId]/acerto/route.ts` porque todo dado de
viagem no projeto é aninhado em `/api/trips/[tripId]/...`, que é de onde vem o
`tripId` que `exigirMembro()` precisa. `/api/acertos` fica livre para a escrita
de `settlements` na S08, se for o caso.

Autorização:

- `supabase.auth.getUser()` sem usuário → **401**.
- `tripId` que não é UUID (zod) → **400**, antes de qualquer consulta.
- `exigirMembro(supabase, tripId, user.id)` → **403** para quem não participa.
- As consultas seguintes correm com o cliente da sessão
  (`lib/supabase/server.ts`), sob RLS: `expense_shares_select`
  (`pode_acessar_despesa`) e `expenses_select` (`can_access_trip`) são a
  segunda linha de defesa. Sem service role.
- Erro do banco → 500 genérico, sem a mensagem crua do Postgres (mesma regra do
  `GET` de despesas).

### Passos

1. **`lib/finance/acerto.ts` — `montarAcerto()`, função pura.**
   - Entrada:
     - despesas `{ id, paid_by, currency }`;
     - partes em aberto `{ expense_id, user_id, amount }`;
     - membros `{ user_id, role }`;
     - `usuarioAtualId`.
   - Para cada despesa com partes, monta
     `DespesaDividida { pagadorId: paid_by, partes: [{ participanteId, valor }] }`.
   - Agrupa por `expenses.currency`: saldos de moedas diferentes não se somam.
     A conversão é da S10.
   - Para cada moeda:
     - `saldos = calcularSaldos(despesas)`;
     - `transferencias = minimizarTransferencias(saldos)`.
   - Completa a lista com saldo `0` para todo membro que não aparece no cálculo,
     para que todo membro da viagem seja exibido.
   - Rótulos: `"Você"` para o usuário atual e `"Participante N"` para os demais,
     junto com o papel (Dono/Membro), na mesma convenção da S06.
     - Ordem estável, a mesma da tela de nova despesa: quem consulta
       primeiro, depois o dono, depois os demais por `user_id`. Assim
       "Participante N" é o mesmo número nas duas telas.
     - Quem tem parte ou pagou mas já saiu da viagem aparece como
       `"Ex-participante"`, porque a dívida continua existindo.
   - Devolve também:
     - `totalDespesas`;
     - `despesasSemRateio`: despesas antigas sem `expense_shares`, que não geram
       dívida e não entram no cálculo; a tela informa a quantidade.
2. **Partes já quitadas.**
   - Só entram partes com `settled_at` nulo. `calcularSaldos()` não conhece
     `settled_at`; o comentário dela diz que quem chama filtra. O filtro fica
     em `montarAcerto()`, e não na consulta: a rota lê também as partes
     quitadas para saber que a despesa foi rateada. Sem isso, uma despesa
     totalmente quitada seria contada como "sem divisão".
   - Uma parte quitada sai dos dois lados ao mesmo tempo: o devedor deixa de
     dever e o pagador deixa de ter aquele crédito.
   - Hoje nenhuma parte é quitada (isso é a S08), mas o filtro já fica correto
     e testado.
3. **Rota `GET /api/trips/[tripId]/acerto`.** Segue o molde de
   `app/api/trips/[tripId]/expenses/route.ts`: `await params`, `getUser()`,
   `exigirMembro()`, `respostaDeErro()`. Três leituras:
   - `expenses` `(id, paid_by, currency)` filtrado por `trip_id`;
   - `expense_shares` `(expense_id, user_id, amount, settled_at)` com
     `expenses!inner(trip_id)` filtrado pela viagem. O join evita mandar a
     lista de ids da viagem na URL;
   - `trip_members` `(user_id, role)` filtrado por `trip_id`, a mesma leitura
     de `GET /api/trips/[tripId]` e da página da viagem. Não existe helper de
     listagem em `lib/authz/`; se o Fernando preferir expor um
     (`listarMembros()`), a rota passa a usá-lo.

   Depois, `montarAcerto()` e `NextResponse.json(...)`. Valores em reais, como
   o resto da API, com a moeda de cada grupo.
4. **Componente `components/acerto-contas.tsx`.** Só apresentação. Para cada
   moeda, dois blocos:
   - **Saldo por membro:**
     - credor em verde, com o texto "a receber" e o valor;
     - devedor em vermelho, com o texto "deve" e o valor absoluto;
     - quite em neutro, com "R$ 0,00".

     O texto acompanha a cor, porque cor sozinha não é acessível.
   - **Transferências sugeridas:** uma linha por transferência, no formato
     **"Participante 2 paga R$ 30,00 para Você"**.

   Valores formatados com `formatarCentavos()` (`Intl.NumberFormat("pt-BR")`):
   em BRL sai `R$ 1.234,56`.
5. **Estados da tela.**
   - **Carregando:** "Carregando acerto de contas...".
   - **Erro:** caixa com "Não foi possível carregar o acerto de contas.",
     botão "Tentar novamente" e `toast()` destrutivo.
   - **Viagem sem despesas:** "Nenhuma despesa lançada nesta viagem ainda." e
     link para "Adicionar Despesa".
   - **Despesas sem nenhum rateio:** aviso de que despesas sem divisão não
     entram no acerto.
   - **Saldos todos zerados:** "Tudo acertado: ninguém deve nada a ninguém.",
     sem lista de transferências.
6. **Página `app/dashboard/trips/[id]/acerto/page.tsx`.**
   - Client component com `use(params)`, `fetch` à rota e `useToast()`.
   - Link "Voltar para a viagem" para `?aba=despesas`.
   - Sem `alert()` nem `confirm()`: a tela não tem ação destrutiva nem
     confirmação.
7. **Entrada na tela.** Link "Acerto de contas" no cabeçalho da aba Despesas
   (`app/dashboard/trips/[id]/page.tsx`), avisando a Audrey.
8. **Responsividade.**
   - Em largura de celular (Pixel 7, 412 px), cada membro e cada transferência
     ocupa um cartão em linha inteira, com valor abaixo do nome, sem rolagem
     horizontal.
   - A partir de `sm`, nome e valor ficam na mesma linha.
9. **Rastreabilidade.** Tags `@RF06.11` (saldo por membro) e `@RF06.13`
   (transferências sugeridas) na rota, em `lib/finance/acerto.ts`, no
   componente e em cada teste. Commits `feat(RF06.11): ...` /
   `feat(RF06.13): ...`.
10. **Testes e evidência** conforme os blocos 4 e 6. Depois, `npm run verify`,
    `npm run pfc:rastreabilidade` e o PR com os critérios do bloco 5.

## 4. O que testar

Obrigatórios pelo tipo (`tela`) e pela rota nova:

- [x] **Unit — `tests/lib/finance-acerto.test.ts`** (`montarAcerto()`):
  - [x] viagem com despesas: saldos e transferências batem com o cenário do
        roteiro manual (Ana +45,00 · Bruno −15,00 · terceira conta −30,00;
        transferências 30,00 e 15,00 para Ana);
  - [x] parte com `settled_at` preenchido não entra no saldo de nenhum dos dois
        lados;
  - [x] despesa sem `expense_shares` não gera dívida e é contada em
        `despesasSemRateio`;
  - [x] membro sem movimento aparece com saldo 0;
  - [x] ex-membro com parte em aberto aparece como "Ex-participante";
  - [x] duas moedas na mesma viagem geram dois grupos, sem somar entre si;
  - [x] centavo quebrado (R$ 10,00 entre 3) fecha em zero;
  - [x] em todo cenário, a soma dos saldos é 0 e aplicar as transferências
        sobre os saldos zera todo mundo;
  - [x] rótulos: "Você" para o usuário atual, ordem estável (dono primeiro).
  - [x] Cobertura de `lib/finance/acerto.ts` ≥ 70% (meta: 100%).
- [x] **Integração — `tests/api/acerto-route.test.ts`** (Supabase mockado, no
      molde de `tests/api/expense-item-route.test.ts`):
  - [x] **200** viagem com despesas: corpo traz saldos e transferências corretos;
  - [x] **200** viagem sem despesas: listas de saldo com todos em 0 e
        transferências vazias, `totalDespesas = 0`;
  - [x] **200** saldos zerados: todos com 0 e nenhuma transferência;
  - [x] **200** transferências sugeridas no formato `{ de, para, valor }` e
        quitando todos os saldos;
  - [x] **200** consulta das partes filtra `settled_at is null`; conforme o
        passo 2, o filtro ficou em `montarAcerto()` e não na consulta. O teste
        "parte com settled_at não entra no cálculo" prova o efeito pela rota;
  - [x] **401** sem sessão: nada é consultado;
  - [x] **403** usuário autenticado que não participa da viagem;
  - [x] **400** `tripId` que não é UUID;
  - [x] **500** erro do banco responde mensagem genérica, sem vazar o Postgres.
- [x] **Componente — `tests/components/acerto-contas.test.tsx`** (jsdom):
      carregamento; erro com `toast()` e "Tentar novamente" que refaz a busca;
      viagem sem despesas; "Tudo acertado"; saldos com sinal e texto;
      transferências como frase "X paga R$ Y para Z"; valores em `R$`;
      `window.alert` e `window.confirm` vigiados e nunca chamados.
- [x] **E2E — `e2e/acerto-contas.spec.ts`**, projetos `chromium` (desktop) e
      `mobile` (Pixel 7). Viagem de três membros reais, preparada como em
      `e2e/rateio-despesa.spec.ts`: Ana dona, Bruno e terceira conta entram por
      `entrarPorConvite`; despesas criadas pela API com a sessão de quem paga.
  - [x] com despesas: saldos e as duas transferências na tela;
  - [x] sem despesas: mensagem de viagem vazia;
  - [x] tudo zerado: "Tudo acertado";
  - [x] erro: rota interceptada com 500 → caixa de erro + toast; desbloquear e
        "Tentar novamente" carrega;
  - [x] em todos os cenários: nenhum diálogo nativo (`page.on("dialog")`
        falha o teste) e sem rolagem horizontal no `mobile`;
  - [x] screenshot de cada cenário em `docs/pfc/evidencias/`.
- [x] **Regressão:** suíte completa (`npm run test`) e `npm run test:rls`
      verdes. A RLS não muda, mas a rota nova depende dela como segunda linha.

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

Preparação:

- `npm run setup` (ou `npm run db:reset` se o banco já existir), depois
  `npm run dev`.
- Criar uma terceira conta em `/auth/sign-up`, por exemplo
  `teste.c@viajamais.local` com senha `viajamais123`.
- Logado como `teste.a@viajamais.local` (Ana), criar a viagem "Acerto S07" e
  convidar `teste.b@viajamais.local` (Bruno) e a terceira conta.
- Cada convidado aceita o convite pelo e-mail em http://localhost:54324.

| # | Ação | Resultado esperado |
|---|---|---|
| 1 | Como Ana, abrir a viagem → aba Despesas → clicar "Acerto de contas". | Aparece "Carregando acerto de contas..." e, em seguida, "Nenhuma despesa lançada nesta viagem ainda." com link para adicionar despesa. Os três membros aparecem com R$ 0,00. Nenhuma transferência. |
| 2 | Voltar para a viagem. Como Ana, "Adicionar Despesa": "Hotel", R$ `90,00`, rateio "Igual" entre os três. Salvar. | Toast "Despesa adicionada". |
| 3 | Sair, entrar como Bruno, abrir a viagem e adicionar "Jantar", R$ `30,00`, rateio "Igual" só entre Ana e Bruno (desmarcar a terceira conta). Salvar. | Toast "Despesa adicionada". |
| 4 | Como Bruno, abrir "Acerto de contas". | Saldos, nesta ordem: **Você** (Bruno) "Membro · deve R$ 15,00"; "Participante 2" com selo **Dono** (Ana) "a receber R$ 45,00"; "Participante 3" (terceira conta) "Membro · deve R$ 30,00". |
| 5 | Na mesma tela, ler "Transferências sugeridas". | Exatamente duas linhas: "Participante 3 paga R$ 30,00 para Participante 2" e "Você paga R$ 15,00 para Participante 2". |
| 6 | Conferir à mão. | 45 − 15 − 30 = 0. Transferências: 30 + 15 = 45, o que Ana tem a receber. Depois delas, ninguém fica com saldo. |
| 7 | Entrar como Ana e abrir o acerto. | Mesmos valores; agora "Você" é a linha de R$ 45,00 a receber, e as transferências dizem "... para Você". |
| 8 | Criar uma segunda viagem "Quite S07" com os mesmos três membros. Cada um lança uma despesa de R$ `30,00` com rateio "Igual" entre os três. Abrir o acerto. | "Tudo acertado: ninguém deve nada a ninguém."; os três com R$ 0,00; nenhuma transferência. |
| 9 | Na viagem "Acerto S07", DevTools → Network → bloquear `/api/trips/*/acerto` e recarregar. | Caixa "Não foi possível carregar o acerto de contas." com "Tentar novamente" e toast de erro. Desbloquear e clicar "Tentar novamente": saldos voltam. |
| 10 | Com a janela em 400 px de largura (ou DevTools → Pixel 7), repetir os passos 4 e 8. | Cartões em coluna, valor abaixo do nome, sem rolagem horizontal, texto legível. |
| 11 | Em janela anônima (sem sessão), abrir `http://localhost:3000/api/trips/<id da viagem>/acerto`. | HTTP 401, `{"error":"Não autenticado"}`. |
| 12 | Criar uma quarta conta que não participa da viagem, entrar com ela e abrir a mesma URL. | HTTP 403, "Sem permissão para acessar esta viagem". Nenhum valor da viagem no corpo. |
| 13 | Como Ana, abrir `http://localhost:3000/api/trips/abc/acerto`. | HTTP 400. |
| 14 | Em todos os passos. | Nenhum diálogo nativo do navegador (`alert`/`confirm`). |

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [x] Funciona em mobile e desktop: E2E aprovado nos projetos `chromium` e
      `mobile`, sem rolagem horizontal no `mobile`.
- [x] Feedback por `toast()` no erro de carregamento.
- [x] Nenhum `alert()` nem `confirm()`: `grep` nos arquivos novos sem
      ocorrência, e teste de componente e E2E vigiando os dois.
- [x] Estado de erro tratado: caixa de erro + toast + "Tentar novamente" que
      recarrega (componente e E2E).
- [x] Estado de carregamento tratado: texto de carregamento visível antes da
      resposta (componente).
- [x] Viagem sem despesas e saldos zerados têm mensagem própria (componente e
      E2E).
- [x] O saldo de cada membro exibido é igual ao de `calcularSaldos()` para os
      mesmos dados (unit + cenário do roteiro: +45,00 / −15,00 / −30,00).
- [x] Todo membro da viagem aparece, inclusive com saldo R$ 0,00.
- [x] A soma dos saldos de cada moeda é exatamente 0 (unit, em centavos).
- [x] Aplicar as transferências sugeridas sobre os saldos deixa todos em
      exatamente 0: nenhum valor positivo ou negativo residual (unit, em
      centavos).
- [x] Partes com `settled_at` preenchido não entram no cálculo (unit + rota).
- [x] Transferências exibidas no formato "X paga R$ Y para Z".
- [x] Valores em BRL formatados em pt-BR (`R$ 1.234,56`), via
      `formatarCentavos()`.
- [x] Quem não está autenticado recebe 401 e quem não participa da viagem
      recebe 403, sem nenhum dado financeiro no corpo (integração + roteiro 11
      e 12). Validado pela integração (401 e 403) e pelo E2E "quem não
      participa da viagem não consulta o acerto"; os passos 11 e 12 do
      roteiro manual ficam para a revisão.
- [x] Nenhuma lógica de saldo duplicada: a rota e a tela não somam valores, só
      `lib/finance/balances.ts` calcula (revisão de código).
- [x] Nenhuma escrita no banco: a rota só tem `GET`, e não há migration nem
      mudança de RLS no diff.

## 6. Evidência

- [x] Saída dos testes de unidade, integração e componente →
      `docs/pfc/evidencias/S07-Ab-acerto-contas-integracao.txt`
      (`npx vitest run tests/lib/finance-acerto.test.ts tests/api/acerto-route.test.ts tests/components/acerto-contas.test.tsx`).
- [x] Saída do E2E → `docs/pfc/evidencias/S07-Ab-acerto-contas-e2e.txt`
      (`npx playwright test e2e/acerto-contas.spec.ts`, contra o Supabase
      local, projetos `chromium` e `mobile`).
- [x] Screenshots desktop e mobile, gerados pelo E2E aprovado:
      `docs/pfc/evidencias/S07-Ab-acerto-contas-{saldos,sem-despesas,quite,erro}-{chromium,mobile}.png`
      (8 arquivos). O de `saldos-chromium` é o candidato à figura da seção 22.1.
- [x] Cobertura → `docs/pfc/evidencias/S07-Ab-acerto-contas-cobertura.txt`:
      `lib/finance/acerto.ts` ≥ 70%. `lib/finance/balances.ts` só entra se for
      alterado; o plano prevê que não seja.
- [x] Suíte completa (`npm run test`) e `npm run test:rls` verdes, com a
      contagem de testes registrada aqui.
- [x] `npm run verify` verde (lint, typecheck, test, build).
- [x] `npm run pfc:rastreabilidade` sem falha, com RF06.11 e RF06.13 ligados a
      código e teste. O script saiu com código 0. A única inconsistência
      apontada é preexistente e fora da S07 (tag órfã `@RNF04` em
      `tests/lib/env.test.ts`); por isso, de `docs/pfc/rastreabilidade.md`
      só as linhas RF-06.11 e RF-06.13 foram mantidas.

### Resultado da validação final (21/10/2026)

Executada contra o Supabase local, com `supabase db reset` (6 migrations +
seed) antes da bateria.

| Verificação | Resultado |
|---|---|
| Testes específicos (unit + integração + componente) | 47/47 |
| Suíte completa (`npm run test`) | 468/468 |
| RLS (`npm run test:rls`) | 111/111 |
| Typecheck (`npm run typecheck`) | sem erros |
| Lint (`npm run lint`) | 0 erros, 56 warnings preexistentes |
| Build (`npm run build`) | aprovado |
| E2E (`e2e/acerto-contas.spec.ts`) | 12/12 — Chromium 6/6 · Mobile 6/6 |
| Cobertura de `lib/finance/acerto.ts` | linhas 100% · ramos 100% · funções 100% |
| `npm run verify` | aprovado |

Evidências geradas em `docs/pfc/evidencias/`:

- 3 evidências de texto: `S07-Ab-acerto-contas-integracao.txt`,
  `S07-Ab-acerto-contas-e2e.txt` e `S07-Ab-acerto-contas-cobertura.txt`;
- 8 screenshots E2E:
  `S07-Ab-acerto-contas-{saldos,sem-despesas,quite,erro}-{chromium,mobile}.png`.
