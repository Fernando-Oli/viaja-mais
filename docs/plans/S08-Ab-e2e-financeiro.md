---
id: S08-Ab-e2e-financeiro
titulo: E2E do fluxo financeiro
trilha: T1
responsavel: abner
revisor: fernando
semana: S08
requisitos: []
secoes_doc: [24]
branch: feat/S08-Ab-e2e-financeiro
tipo: [tela]
depende_de: []
status: backlog
---
# E2E do fluxo financeiro

> **Abner** · semana **S08** (14 a 20/10) · marco da semana: _Acerto de contas funcional_

## 1. Contexto

Despesa, rateio e acerto.

### Objetivo

Provar, pela interface e com mais de um usuário, que os módulos financeiros
funcionam **juntos**: despesa lançada por quem pagou, divisão, saldo do acerto,
transferência sugerida, registro de pagamento (parcial e total) e o estado
final "Tudo acertado" — com os valores vindos do banco a cada passo.

Cada módulo já tem spec própria; esta atividade não as repete:

| Já coberto | Spec |
|---|---|
| Os três tipos de rateio, validação de peso e de valor exato, erro ao carregar participantes | `e2e/rateio-despesa.spec.ts` |
| Criar, editar e excluir despesa | `e2e/editar-despesa.spec.ts` |
| Saldos, viagem vazia, saldos zerados, erro do `GET /acerto`, 401/403 | `e2e/acerto-contas.spec.ts` |
| Registro de pagamento, diálogo, erro do `POST`, recusas 403/422 | `e2e/acerto-transferencias.spec.ts` |

O que só esta atividade prova: despesas **lançadas pela tela** por dois
pagadores diferentes alimentando o mesmo acerto; o pagamento de um membro
mudando o saldo visto pelos **outros** membros; e o saldo **persistindo** depois
de recarregar e de sair e voltar à tela.

### Pré-condições

- Docker Desktop e Supabase local de pé, banco com as 7 migrations (inclui
  `20261111100000_financeiro_settlements.sql`) e o seed (`teste.a` e `teste.b`).
- `.env.local` gerado por `npm run setup`.
- App em produção local: o Playwright sobe `npm run start` (rodar `npm run build` antes).
- Supabase CLI compatível com `supabase/config.toml` (a 3.x rejeita a seção
  `[inbucket]`; a validação usou `npx supabase@2`).

### Escopo

Dentro: `e2e/financeiro-jornada.spec.ts` (2 testes × Chromium e mobile) e
`e2e/fixtures/financeiro.ts` (preparo e leitura de tela compartilhados).

Fora: qualquer mudança em regra financeira, API, migration ou RLS; casos de
erro já cobertos pelas specs acima; S09.

## 2. Arquivos afetados

- `e2e/financeiro-jornada.spec.ts` — **novo**: a jornada.
- `e2e/fixtures/financeiro.ts` — **novo**: `entrar`, `trocarPara`, `idDe`,
  `prepararViagemDeTres`, `rotuloPara`, `vigiarDialogos`,
  `semRolagemHorizontal`, `linhasDeSaldo`, `linhasDeTransferencia`. As specs
  anteriores mantêm as próprias cópias desses helpers; trocá-las para o fixture
  fica fora desta atividade, para não mexer em spec já aprovada.
- `docs/pfc/evidencias/S08-Ab-e2e-financeiro-*` — **novos**: 12 screenshots e a
  saída do E2E.
- `docs/pfc/rastreabilidade.md` — linhas RF-06.11 e RF-06.13 (a spec nova entra
  na coluna de testes).

Sem migration, sem mudança em `lib/`, `app/` ou `components/`.

## 3. Passos

### Dados utilizados

- Ana (`teste.a@viajamais.local`, seed) — dona da viagem.
- Bruno (`teste.b@viajamais.local`, seed) — membro.
- Carla — conta nova criada pelo cadastro **a cada teste**
  (`<cenário>.c.<timestamp>-<aleatório>@viajamais.local`).
- Uma viagem nova **por teste**, criada pela API da Ana, com Bruno e Carla
  entrando pelo convite da aplicação (`POST /api/invitations` + aceite).

Só contas, viagem e convite são preparados pela API — o "Destino" da tela de
nova viagem depende do Google Places, e o seed só tem duas contas. Despesa,
rateio e pagamento acontecem pela tela.

Cenário de valores (os dois testes):

- Ana lança pela tela "Hotel" R$ 90,00, divisão igual entre os três (30 + 30 + 30);
- Bruno lança pela tela "Jantar" R$ 30,00, divisão igual, desmarcando a Carla (15 + 15);
- → Ana **+45,00** · Bruno **−15,00** · Carla **−30,00**.

Não há campo "quem pagou" na tela: quem lança a despesa é quem pagou
(`paid_by`). Por isso cada despesa é lançada com a sessão do pagador.

### Jornada — teste 1: "despesas pela tela, acerto, pagamento parcial, restante e Tudo acertado"

| # | Ação (pela tela) | Assertion |
|---|---|---|
| 1–2 | Ana: Adicionar Despesa → "Hotel" 90,00, Igual | prévia 30,00 / 30,00 / 30,00; "A soma das partes fecha com o total."; toast "Despesa adicionada" |
| 3–4 | Bruno: "Jantar" 30,00, Igual, desmarca Participante 3 | prévia 15,00 / 15,00 / Fora |
| 5 | Bruno recarrega a aba Despesas | exatamente "Hotel" e "Jantar", com R$ 90,00 e R$ 30,00 |
| 6–7 | Bruno: botão "Acerto de contas" | Você deve R$ 15,00 · Participante 2 (Dono) a receber R$ 45,00 · Participante 3 deve R$ 30,00 |
| 8 | — | transferências: "Participante 3 paga R$ 30,00 para Participante 2", "Você paga R$ 15,00 para Participante 2" |
| 9–11 | Bruno registra **R$ 5,00** (sugerido 15,00) | Você deve R$ 10,00 · Dono a receber R$ 40,00 · P3 deve R$ 30,00; "Você paga R$ 10,00 …" continua |
| 12 | Bruno registra o restante (sugerido 10,00) | Você quite R$ 0,00 · Dono a receber R$ 30,00; sobra só a transferência da Carla; nenhum botão |
| 13 | Carla entra, abre o acerto (deve R$ 30,00) e registra o sugerido | "Tudo acertado: ninguém deve nada a ninguém."; os três "quite R$ 0,00"; nenhuma transferência |

### Teste 2: "pagamento persiste ao recarregar e ao voltar, e os outros membros veem o saldo novo"

| # | Ação | Assertion |
|---|---|---|
| 1 | Mesmo cenário de despesas, pela tela | — |
| 2 | Carla registra **R$ 12,34** dos 30,00 | Você deve R$ 17,66 · Dono a receber R$ 32,66 · P3 deve R$ 15,00 |
| 3 | Recarregar a página | mesmos três saldos; transferências 17,66 e 15,00 |
| 4 | "Voltar para a viagem" e "Acerto de contas" de novo | mesmos três saldos |
| 5 | Ana (credora) entra e abre o acerto | Você a receber R$ 32,66; Carla deve R$ 17,66; Bruno deve R$ 15,00; "… paga R$ 17,66 para Você" e "… paga R$ 15,00 para Você" |
| 6 | Bruno entra e abre o acerto | Você deve R$ 15,00 · Dono a receber R$ 32,66 · P3 deve R$ 17,66 |

Os rótulos "Participante N" na visão da Ana dependem da ordem dos ids de Bruno
e Carla; `rotuloPara()` aplica a mesma regra da tela para saber qual é qual.

### Assertions

Toda verificação de valor compara o **texto completo** da linha de saldo ou de
transferência (ex.: `"Você Membro deve R$ 10,00"`), não só a presença de um
card ou botão. Em todos os testes: nenhum diálogo nativo (`page.on("dialog")`) e
nenhuma rolagem horizontal nas telas fotografadas.

### Riscos

| Risco | Tratamento |
|---|---|
| Dados de execuções anteriores interferirem | Viagem e terceira conta novas por teste; nada lê dados que o teste não criou. |
| Ordem das despesas na lista (mesma data) | Confere o conjunto de títulos, não a ordem. |
| Rótulo "Participante N" variar com os ids | Visões de Bruno e Carla têm rótulos fixos (Ana é a dona); na visão da Ana, `rotuloPara()`. |
| Toast cobrindo a lista na evidência | A aba é recarregada antes da conferência e da foto. |
| Specs anteriores regravarem as próprias screenshots na regressão | Screenshots de S03/S06/S07/S08-transferências restauradas depois da execução. |

### Limitações

- O teste 1 é longo (13 passos, três usuários) de propósito: é a jornada. Uma
  falha no meio para o restante; o passo que falhou aparece no relatório do Playwright.
- Os helpers das specs anteriores não foram migrados para `e2e/fixtures/financeiro.ts`.
- Não cobre pagamento concorrente entre abas (limitação registrada na
  `S08-Ab-transferencias`).
- Fora do escopo, observado durante a atividade: na página da viagem,
  "Membros da Viagem" mostra "0 pessoas nesta viagem" para uma viagem de três
  membros (consulta de `trip_members` com `profiles(...)` em
  `app/dashboard/trips/[id]/page.tsx`, igual na `main`), e no mobile os botões
  "Adicionar Despesa" e "Excluir" encostam na borda do card. Nenhum dos dois
  afeta o fluxo financeiro nem foi alterado aqui.

## 4. O que testar

Obrigatórios pelo tipo (`tela`):

- [x] E2E do fluxo com screenshot arquivado em `docs/pfc/evidências/`

- [x] Jornada completa (teste 1): despesa → divisão → outra despesa → acerto →
      pagamento parcial → restante → Tudo acertado, com valores conferidos a
      cada passo.
- [x] Outro participante vê o pagamento (teste 2, passos 5 e 6).
- [x] Pagamento parcial e restante (teste 1, passos 9–12; teste 2, passo 2).
- [x] Persistência: recarregar e sair/voltar (teste 2, passos 3 e 4).
- [x] Chromium e mobile (projetos `chromium` e `mobile` do `playwright.config.ts`).
- [x] Estabilidade: `--repeat-each=3` → 12/12.
- [x] Regressão: `rateio-despesa`, `editar-despesa`, `acerto-contas`,
      `acerto-transferencias` junto com a spec nova → 38/38.

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

- [ ] Roteiro manual executado — **pendente**: ainda não foi repetido à mão.

Preparação: `npm run db:reset`, `npm run dev`; criar `teste.c@viajamais.local`
(senha `viajamais123`) em `/auth/sign-up`; como Ana, criar uma viagem e
convidar Bruno e a terceira conta; cada um aceita pelo e-mail em
http://localhost:54324.

1. Ana → aba Despesas → "Adicionar Despesa": "Hotel", `90.00`, Igual. Esperado:
   prévia R$ 30,00 para cada um; toast "Despesa adicionada".
2. Bruno → "Adicionar Despesa": "Jantar", `30.00`, Igual, desmarcar
   "Participante 3". Esperado: R$ 15,00 / R$ 15,00 / Fora.
3. Bruno → aba Despesas. Esperado: Hotel R$ 90,00 e Jantar R$ 30,00.
4. Bruno → "Acerto de contas". Esperado: Você deve R$ 15,00; Participante 2
   (Dono) a receber R$ 45,00; Participante 3 deve R$ 30,00.
5. Bruno → "Registrar pagamento" → `5,00` → confirmar. Esperado: Você deve
   R$ 10,00; Dono a receber R$ 40,00; "Você paga R$ 10,00 para Participante 2".
6. Recarregar a página. Esperado: os mesmos valores do passo 5.
7. Bruno registra o restante (`10,00`). Esperado: Você quite R$ 0,00.
8. Ana abre o acerto. Esperado: Você a receber R$ 30,00; Bruno quite; a
   terceira conta deve R$ 30,00.
9. Terceira conta abre o acerto e registra `30,00`. Esperado: "Tudo acertado:
   ninguém deve nada a ninguém."
10. Repetir 4–9 em 412 px (Pixel 7). Esperado: sem rolagem horizontal.

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [x] Funciona em mobile e desktop — 4/4 nos projetos `chromium` e `mobile`, sem
      rolagem horizontal.
- [x] Feedback por `toast()`; sem `alert()` nem `confirm()` — toasts "Despesa
      adicionada" e "Pagamento registrado" conferidos; `page.on("dialog")` vazio.
- [x] Estado de erro e de carregamento tratados — cobertos pelas specs
      específicas (`acerto-contas`, `acerto-transferencias`, `rateio-despesa`),
      verdes na regressão; esta jornada não os repete.
- [x] Despesas, divisão e pagamentos da jornada feitos pela tela; API só para
      contas, viagem e convite.
- [x] Saldo conferido com valor exato em cada passo (inicial, parcial, após o
      restante, final).
- [x] O pagamento de um membro aparece no acerto dos outros dois.
- [x] O saldo se mantém depois de recarregar e de sair e voltar.
- [x] Testes independentes: cada um cria a própria viagem e a própria terceira conta.
- [x] Nenhuma alteração em regra financeira, API, migration ou RLS (`git status`).

## 6. Evidência

- [x] Saida dos testes — `docs/pfc/evidencias/S08-Ab-e2e-financeiro-e2e.txt`
      (jornada 4/4 e regressão 38/38).
- [x] Screenshot ou gravação do fluxo (se houver tela) —
      `docs/pfc/evidencias/S08-Ab-e2e-financeiro-{despesas,acerto-inicial,parcial,apos-pagamento,tudo-acertado,visao-credora}-{chromium,mobile}.png`
      (12 arquivos).
- Delta de cobertura (se mexeu em `lib/`) — não se aplica: nenhuma mudança em `lib/`.

### Resultado da validação (11/11/2026)

Contra o Supabase local (7 migrations + seed), app em `npm run start`.

| Verificação | Resultado |
|---|---|
| Jornada (`e2e/financeiro-jornada.spec.ts`) | 4/4 — Chromium 2/2 · Mobile 2/2 |
| Estabilidade (`--repeat-each=3`) | 12/12 |
| Regressão dos E2E financeiros + jornada | 38/38 |
| `npm run verify` (lint, typecheck, 552 testes, build) | aprovado |
| Lint | 0 erros, 56 warnings preexistentes (nenhum nos arquivos novos) |
| `npm run pfc:rastreabilidade` | código 0; única inconsistência preexistente (tag `@RNF04`) |
| `git diff --check` | sem problemas |

Defeitos no fluxo financeiro encontrados pela jornada: nenhum.
