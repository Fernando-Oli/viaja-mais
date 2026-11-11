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
depende_de: []
status: backlog
---
# Minimizar transferências e marcar quitado

> **Abner** · semana **S08** (14 a 20/10) · marco da semana: _Acerto de contas funcional_

## 1. Contexto

Reduz o número de pagamentos necessários para zerar os saldos do grupo.

A minimização em si já existe: `minimizarTransferencias()` (S05, PR #28) sugere
as transferências e a S07 as exibe na tela de acerto de contas, só para leitura.
O que falta, e é o escopo desta atividade, é **marcar como pago**: registrar que
uma transferência sugerida (ou parte dela) já foi feita, e o acerto passar a
refletir isso.

### Objetivo

O participante que deve vê, na tela de acerto, "Você paga R$ X para
Participante Y", registra que pagou (o valor todo ou parte dele) e o acerto é
recalculado: a dívida dele e o crédito de quem recebeu diminuem, as
transferências sugeridas são refeitas sobre o saldo novo e, quando tudo zera,
aparece o estado "Tudo acertado" que a S07 já tem.

### Escopo

Dentro:

- tabela `settlements` com RLS (migration da S08);
- `POST /api/trips/[tripId]/acerto/transferencias` para registrar um pagamento;
- `GET /api/trips/[tripId]/acerto` passa a considerar os pagamentos registrados;
- validação pura do pagamento contra o saldo atual (`lib/finance/transferencia.ts`);
- botão "Registrar pagamento" na transferência que sai de quem consulta, com
  diálogo de confirmação, valor editável (pagamento parcial) e `toast()`;
- idempotência simples contra envio duplicado.

Fora:

- fluxo pendente → confirmado pelo recebedor;
- editar, apagar ou estornar pagamento;
- tela de histórico de pagamentos;
- marcar parcela de `expense_shares` como quitada (`settled_at`) — ver decisão 1;
- E2E completo do fluxo financeiro (atividade `S08-Ab-e2e-financeiro`);
- gráficos (S09) e conversão entre moedas (S10).

### Decisões

1. **`settlements` é a fonte da verdade dos pagamentos, não `expense_shares.settled_at`.**
   `minimizarTransferencias()` colapsa cadeias de dívida: "Carla paga Ana" pode
   existir sem que Carla tenha parcela nenhuma numa despesa paga pela Ana. Um
   pagamento entre duas pessoas não corresponde a uma parcela. `settled_at`
   continua existindo e continua sendo respeitado por `montarAcerto()` (parcela
   quitada sai do saldo), mas a S08 não escreve nele.
2. **Nomes das colunas** seguem a convenção em inglês do schema (`paid_by`,
   `amount`, `currency`): `trip_id`, `from_user_id`, `to_user_id`, `amount`,
   `currency`, `created_at`, mais `idempotency_key`. O plano norte §T2 esboçava
   `de`, `para`, `valor`, `status`; `status` não existe porque o registro é de um
   pagamento já realizado.
3. **Pagamento entra no saldo como uma "despesa" de quem pagou** com uma única
   parte de quem recebeu: `de → para (V)` vira
   `{ pagadorId: de, partes: [{ participanteId: para, valor: V }] }` dentro de
   `montarAcerto()`. `calcularSaldos()` lança +V para `de` e −V para `para`. Sem
   segunda fórmula de saldo; `balances.ts` e `rateio.ts` não mudam.
4. **Imutável.** Sem policy nem grant de UPDATE/DELETE.
5. **Só o pagador registra.** Rota (403) e RLS (`from_user_id = auth.uid()`).
6. **Pagamento parcial permitido**; valor limitado pela dívida atual do pagador e
   pelo crédito atual do recebedor, conferidos no servidor sobre o acerto
   recalculado na hora (422 se não cabe).
7. **Ordem de checagem da rota**: sessão (401) antes de validar `tripId` e corpo
   (400), igual ao `GET` do acerto — quem não está logado não recebe detalhe de
   validação.
8. **Idempotência**: o navegador gera uma `chave` (UUID) por abertura do diálogo;
   `unique (from_user_id, idempotency_key)` no banco. Reenvio da mesma chave
   devolve 200 com o registro existente em vez de gravar outro.
9. **Rótulo dos requisitos**: o registro de pagamento foi rastreado como parte de
   RF-06.13 (transferências do acerto) e RNF-02.9 (RLS de `settlements`). O
   catálogo não tem um requisito próprio para "registrar pagamento"; RF-06.12
   ("marcar parcela como quitada") continua sem implementação, pela decisão 1.

## 2. Arquivos afetados

Migration (regra do projeto: migration e policy passam pela revisão do Fernando):

- `supabase/migrations/20261111100000_financeiro_settlements.sql` — **novo**:
  tabela, constraints, índices, RLS e grants.
- `types/database.ts` — **regenerado** (`supabase gen types --local`), só o
  bloco `settlements` foi acrescentado.

Regra de negócio:

- `lib/finance/transferencia.ts` — **novo**: `validarTransferencia()`, pura.
- `lib/finance/acerto.ts` — **editado**: `PagamentoLido`, `pagamentos` em
  `montarAcerto()`, `usuarioAtualId` no resultado.
- `lib/schemas/transferencia.ts` — **novo**: contrato zod do POST.

API:

- `app/api/trips/[tripId]/acerto/carregar-acerto.ts` — **novo**: leitura
  compartilhada por GET e POST (não é rota).
- `app/api/trips/[tripId]/acerto/route.ts` — **editado**: usa `carregarAcerto`,
  que lê também `settlements`.
- `app/api/trips/[tripId]/acerto/transferencias/route.ts` — **novo**: `POST`.

Tela:

- `components/registrar-pagamento.tsx` — **novo**: diálogo de confirmação.
- `components/acerto-contas.tsx` — **editado**: botão na transferência de quem
  consulta; `data-testid="transferencia"` passou da `<li>` para a frase, para os
  testes da S07 continuarem lendo só a frase.
- `app/dashboard/trips/[id]/acerto/page.tsx` — **editado**: envio, toast e recarga.

Testes:

- `tests/lib/finance-transferencia.test.ts` — **novo**.
- `tests/lib/finance-acerto.test.ts` — **editado** (pagamentos registrados).
- `tests/api/acerto-transferencias-route.test.ts` — **novo**.
- `tests/api/acerto-route.test.ts` — **editado** (mock lê `settlements`; casos com pagamentos).
- `tests/components/acerto-contas.test.tsx` — **editado** (fluxo de registro).
- `tests/rls/07-settlements.test.ts` — **novo**.
- `e2e/acerto-transferencias.spec.ts` — **novo**.

Documentação:

- `docs/pfc/04-design/18-Modelo-de-dados.md` — entrada de `settlements`.
- `docs/pfc/rastreabilidade.md` — linhas RF-06.11, RF-06.13 e RNF-02.9.

Não mudam: `lib/finance/balances.ts`, `lib/finance/rateio.ts`, `supabase/seed.sql`,
`supabase/config.toml`.

## 3. Passos

1. Migration `settlements` com RLS e grants; `db reset` local; `db:types`.
2. `montarAcerto()` recebe `pagamentos` e os converte para o formato de
   `calcularSaldos()` (decisão 3), por moeda.
3. `validarTransferencia(acerto, pedido)` em centavos, nesta ordem: pessoas
   diferentes; valor inteiro > 0; moeda de um grupo do acerto; pagador e
   recebedor no acerto da moeda (membro, ou ex-participante com movimento);
   pagador com dívida e recebedor com crédito; valor ≤ dívida; valor ≤ crédito.
4. `carregarAcerto()` lê despesas, partes, membros e pagamentos em paralelo, sob
   RLS, e monta o acerto; o `GET` passa a usá-la.
5. `POST`: `getUser` (401) → `tripId` e corpo com zod (400) → `exigirMembro`
   (403) → pagador = sessão (403) → chave já gravada? (200) → `carregarAcerto` +
   `validarTransferencia` (422) → `insert` campo a campo → 201. Unique da chave
   (23505) → relê e devolve 200. Outros erros → 500 genérico.
6. Tela: botão só em `t.de.userId === acerto.usuarioAtualId`; diálogo com valor
   sugerido editável; botões desabilitados e diálogo travado enquanto envia;
   sucesso → toast "Pagamento registrado", fecha e busca o acerto de novo; erro
   → toast com a mensagem da API e diálogo aberto para nova tentativa (mesma chave).
7. Testes, evidências, matriz de rastreabilidade.

### Riscos

| Risco | Tratamento |
|---|---|
| Dois pagamentos com chaves diferentes ao mesmo tempo (duas abas) passam juntos pela conferência de saldo e somam mais que a dívida | **Limitação aceita nesta entrega.** Não há transação entre a leitura do saldo e o `insert`. O excesso não quebra a conta: o saldo só se inverte e `minimizarTransferencias()` sugere a devolução. Fechar isso exige RPC com lock por viagem — fora do escopo. |
| Clique duplo / reenvio depois de queda de rede | Botão desabilitado durante o envio + chave de idempotência com unique no banco. |
| Pagamento registrado em nome de outra pessoa | 403 na rota e `WITH CHECK (from_user_id = auth.uid())` na RLS. |
| Recebedor que não participa da viagem | A rota recusa (422, "recebedor não participa do acerto"). A RLS **não** confere o recebedor: as funções de participação só respondem sobre quem está na sessão, de propósito (S06-F). |
| Ex-participante | Pode ser **recebedor** (aparece no acerto enquanto tem saldo). Não consegue ser **pagador** pela aplicação: perdeu acesso à viagem (`exigirMembro`). |
| Despesa editada ou excluída depois de um pagamento | O pagamento continua; o saldo pode se inverter e a sugestão vira a devolução. Comportamento coerente, mas sem aviso na tela. |
| Lógica de saldo duplicada | Nenhum cálculo novo de saldo: `validarTransferencia()` só compara com o saldo que `montarAcerto()` → `calcularSaldos()` devolve. |
| Erro irreversível do usuário | Sem estorno nesta entrega; o diálogo avisa "O registro não pode ser desfeito". |

## 4. O que testar

Obrigatórios pelo tipo (`regra-de-negocio, tela`):

- [x] Unit com casos de borda
- [x] Cobertura de ao menos 70% no arquivo
- [x] E2E do fluxo com screenshot arquivado em `docs/pfc/evidências/`

Detalhe:

- [x] **Unit — `tests/lib/finance-transferencia.test.ts`** (27): transferência
      total; parcial; um centavo; par diferente do sugerido; soma dos saldos
      zero depois de pagamentos em sequência; ex-participante pagador; recusa
      de valor zero, negativo e fracionado; pagador = recebedor; acima da
      dívida; acima do crédito; moeda sem saldo; pagador sem dívida; recebedor
      sem crédito; pessoa fora do acerto; segundo pagamento depois de quitado;
      schema zod (normalização, campos descartados, 8 recusas).
- [x] **Unit — `tests/lib/finance-acerto.test.ts`** (+10): sem pagamentos o
      resultado é idêntico ao da S07; total zera; parcial reduz no valor exato;
      vários pagamentos; outra moeda não se mistura; moeda só de pagamento vira
      grupo próprio; moeda vazia cai no BRL; R$ 10,00 / 3 quitado aos centavos;
      ex-participante com pagamento parcial; ex-participante recebedor.
- [x] **Integração — `tests/api/acerto-transferencias-route.test.ts`** (26):
      201 total (insert só com os campos do contrato, pagador da sessão); 201
      parcial; conferência contra saldo que já inclui pagamentos; 200 chave
      repetida; 200 corrida resolvida pelo unique; 409; 401; 403 não-membro;
      403 em nome de outra pessoa; 400 (7 payloads + não JSON + `tripId`); 422
      (5 regras); 500 genérico no insert, na leitura e na busca por chave.
- [x] **Integração — `tests/api/acerto-route.test.ts`** (+3): pagamento parcial
      altera saldos e sugestões; pagamentos que quitam tudo → `tudoAcertado`;
      500 se a leitura de `settlements` falha; leitura escopada pela viagem.
- [x] **Componente — `tests/components/acerto-contas.test.tsx`** (+7): botão só
      na transferência de quem consulta; valor sugerido, botões desabilitados
      durante o envio, toast e recarga (GET → POST → GET); parcial; valor
      inválido não envia; erro da API com toast, diálogo aberto e nova
      tentativa com a mesma chave; falha de rede; cancelar.
- [x] **RLS — `tests/rls/07-settlements.test.ts`** (15): membro lê; estranho não
      lê; anônimo não lê; pagador insere o próprio; não insere em nome de
      outro; não-membro não insere; `created_at` do cliente recusado; chave
      repetida recusada; 4 CHECKs; UPDATE negado (2); DELETE negado.
- [x] **E2E — `e2e/acerto-transferencias.spec.ts`** (6 × chromium e mobile):
      parcial; restante; último pagamento → "Tudo acertado"; credora sem botão;
      erro 500 → toast, diálogo aberto, nova tentativa; API recusa 403 e 422.
- [x] **Regressão**: `e2e/acerto-contas.spec.ts` (S07) 12/12, suíte completa,
      `npm run test:rls`.

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

- [ ] Roteiro manual executado (passos 1–13) — **pendente**: ainda não foi
      repetido à mão; os mesmos cenários estão cobertos pelos testes automáticos.

Preparação:

- `npm run db:reset` (aplica a migration nova), depois `npm run dev`.
- Criar uma terceira conta em `/auth/sign-up` (ex.: `teste.c@viajamais.local`,
  senha `viajamais123`).
- Como `teste.a@viajamais.local` (Ana), criar a viagem "Pagamentos S08" e
  convidar `teste.b@viajamais.local` (Bruno) e a terceira conta (Carla); cada
  um aceita o convite pelo e-mail em http://localhost:54324.
- Ana lança "Hotel" R$ 90,00, rateio "Igual" entre os três. Bruno lança
  "Jantar" R$ 30,00, rateio "Igual" só entre Ana e Bruno.

| # | Ação | Resultado esperado |
|---|---|---|
| 1 | Como Carla, abrir a viagem → aba Despesas → "Acerto de contas". | "Você · deve R$ 30,00"; Ana "a receber R$ 45,00"; Bruno "deve R$ 15,00". Transferências: "Você paga R$ 30,00 para Participante 2" **com** botão "Registrar pagamento"; "Participante 3 paga R$ 15,00 para Participante 2" **sem** botão. |
| 2 | Clicar "Registrar pagamento". | Diálogo "Registrar pagamento", campo "Valor pago (BRL)" com `30,00`. |
| 3 | Trocar para `0` e confirmar. | Mensagem "Informe um valor maior que zero, com até duas casas."; nada é enviado. |
| 4 | Trocar para `10,00` e confirmar. | Botão vira "Registrando..." e fica desabilitado; depois toast "Pagamento registrado", diálogo fecha. Saldos: Você deve R$ 20,00; Ana a receber R$ 35,00. Transferência: "Você paga R$ 20,00 para Participante 2". |
| 5 | Registrar de novo com o valor sugerido (`20,00`). | Toast; "Você · quite R$ 0,00"; sobra só "Participante 3 paga R$ 15,00 para Participante 2"; nenhum botão. |
| 6 | Entrar como Bruno, abrir o acerto e registrar `15,00`. | "Tudo acertado: ninguém deve nada a ninguém."; os três "quite R$ 0,00"; nenhuma transferência. |
| 7 | Entrar como Ana e abrir o acerto. | "Tudo acertado"; nenhum botão "Registrar pagamento". |
| 8 | Em outra viagem com o mesmo cenário, como Carla, DevTools → Network → bloquear `*/acerto/transferencias` e confirmar um pagamento. | Toast de erro; diálogo continua aberto e habilitado; saldo inalterado. Desbloquear e confirmar de novo: toast "Pagamento registrado" e saldo atualizado — **um** pagamento só. |
| 9 | Como Ana, `POST /api/trips/<id>/acerto/transferencias` com `{"de":"<id da Carla>","para":"<id da Ana>","valor":"1,00","moeda":"BRL","chave":"<uuid>"}`. | 403 "Só quem pagou pode registrar o próprio pagamento". |
| 10 | Como Bruno (devendo 15), mesmo POST com `de` = Bruno e `valor` `15,01`. | 422 "O valor passa da dívida atual do pagador (R$ 15,00)". |
| 11 | Sem sessão, o mesmo POST. | 401. |
| 12 | Repetir o passo 4 com a janela em 412 px (Pixel 7). | Botão em largura cheia abaixo da frase; diálogo cabe na tela; sem rolagem horizontal. |
| 13 | Em todos os passos. | Nenhum `alert`/`confirm` nativo. |

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [x] Função pura, sem I/O — `lib/finance/transferencia.ts` e `montarAcerto()`
      só recebem dados; nenhum import de Supabase, `fetch` ou React.
- [x] Casos de arredondamento cobertos — R$ 10,00 / 3 quitado aos centavos fecha
      em 0; valor com três casas é recusado; tudo em centavos inteiros.
- [x] Funciona em mobile e desktop — E2E nos projetos `chromium` e `mobile`, sem
      rolagem horizontal.
- [x] Feedback por `toast()`; sem `alert()` nem `confirm()` — vigiados no teste
      de componente e no E2E.
- [x] Estado de erro e de carregamento tratados — envio: "Registrando..." com
      botões desabilitados; erro: toast e diálogo aberto para nova tentativa;
      carga do acerto: estados da S07 preservados.
- [x] Só o pagador registra — rota 403 (integração e E2E) e RLS 42501.
- [x] Valor acima da dívida ou do crédito é recusado — 422 (unit, integração, E2E).
- [x] Pagamento parcial aceito e refletido no saldo e na sugestão (unit, integração, componente, E2E).
- [x] Após pagar tudo, "Tudo acertado" (unit, integração, E2E).
- [x] A soma dos saldos continua exatamente 0 depois de pagamentos (unit).
- [x] Moedas não se misturam (unit).
- [x] Settlement imutável — UPDATE e DELETE negados (RLS).
- [x] Estranho não lê nem insere (RLS); quem não participa recebe 403 (integração).
- [x] Insert campo a campo, sem espalhar o corpo (integração confere a linha gravada).
- [x] Erro do banco não vaza mensagem interna (integração).
- [x] Sem service role na rota (revisão de código).
- [x] `balances.ts` e `rateio.ts` sem alteração (`git diff`).

## 6. Evidência

- [x] Saida dos testes —
      `docs/pfc/evidencias/S08-Ab-transferencias-integracao.txt` (unit + integração
      + componente, 120/120), `docs/pfc/evidencias/S08-Ab-transferencias-rls.txt`
      (126/126, banco recriado com as 7 migrations),
      `docs/pfc/evidencias/S08-Ab-transferencias-e2e.txt` (12/12).
- [x] Screenshot ou gravação do fluxo (se houver tela) —
      `docs/pfc/evidencias/S08-Ab-transferencias-{dialogo,parcial,registrado,quitado,erro}-{chromium,mobile}.png`
      (10 arquivos).
- [x] Delta de cobertura (se mexeu em `lib/`) —
      `docs/pfc/evidencias/S08-Ab-transferencias-cobertura.txt`:
      `lib/finance/transferencia.ts` e `lib/finance/acerto.ts` em 100% de linhas,
      ramos e funções.

### Resultado da validação (11/11/2026)

Contra o Supabase local, depois de `supabase db reset --local` (7 migrations + seed).

| Verificação | Resultado |
|---|---|
| Testes específicos (unit + integração + componente) | 120/120 |
| Suíte completa (`npm run test`) | 552/552 |
| RLS (`npm run test:rls`) | 126/126 (15 novos) |
| E2E S08 (`e2e/acerto-transferencias.spec.ts`) | 12/12 — Chromium 6/6 · Mobile 6/6 |
| E2E S07, regressão (`e2e/acerto-contas.spec.ts`) | 12/12 |
| Typecheck | sem erros |
| Lint | 0 erros, 56 warnings preexistentes (nenhum nos arquivos da S08) |
| Build | aprovado |
| `npm run verify` | aprovado |
| `npm run pfc:rastreabilidade` | código 0; única inconsistência preexistente (tag `@RNF04` em `tests/lib/env.test.ts`) |
| `git diff --check` | sem problemas |

### Pendências e limitações

Pendentes para a revisão:

- [ ] Roteiro manual (passos 1–13 do bloco 4).
- [ ] Revisão da migration `20261111100000_financeiro_settlements.sql` e das
      policies de `settlements` pelo Fernando.

Limitações registradas, fora do escopo desta entrega:

- **Concorrência entre abas** — dois pagamentos com chaves diferentes ao mesmo
  tempo podem passar juntos pela conferência de saldo (ver "Riscos", bloco 3).
- **RF-06.12** ("marcar parcela do rateio como quitada") continua sem
  implementação, pela decisão 1; falta decidir no catálogo se o registro de
  pagamento ganha requisito próprio (decisão 9).
- **Seção 15** — RNF-02.9 segue "Planejado" e o detalhamento ainda diz que a
  RLS não existe; atualizar pela atividade de documentação (`/pfc-secao`).
- **CLI do Supabase** — a versão 3.x rejeita a seção `[inbucket]` de
  `supabase/config.toml`; a validação local usou a CLI 2.x. O workflow
  `.github/workflows/db.yml` usa `version: latest` e pode falhar do mesmo modo
  (domínio da plataforma).
