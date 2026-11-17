---
id: S13-F-porte-financeiro
titulo: Porte para a API de despesas, acerto de contas e tela de finanças
trilha: T6
responsavel: fernando
revisor: abner
semana: S13
requisitos: [RF04.6, RF06.1, RF06.2, RF06.3, RF06.4, RF06.5, RF06.9, RF06.10, RF06.11, RF06.13, RNF02.9, RNF08.1]
secoes_doc: [20, 22.2, 22.3, 25]
branch: feat/S13-F-sem-supabase
tipo: [route-handler, tela]
depende_de: [S13-F-porte-viagem]
status: em-desenvolvimento
---
# Porte para a API de despesas, acerto de contas e tela de finanças

> **Fernando** · semana **S13** · Etapa 2 de 4 do plano "Avori sem Supabase", segunda leva

## 1. Contexto

Segunda leva da etapa 2: o domínio financeiro (do Abner) sai do Next e vai
para a API, no molde de `api/modulos/reservas/`. A regra de negócio continua
em `lib/finance/` e `lib/schemas/` sem mudança; o que muda é o acesso ao banco.

Duas coisas melhoram com a transação que o PostgREST não dava:

- **Despesa e rateio na mesma transação.** A rota do Next gravava a despesa,
  depois as partes, e desfazia a despesa à mão se as partes falhassem. Agora
  o rollback é do banco.
- **Pagamentos simultâneos.** A limitação aceita em S08-Ab-transferencias
  (dois envios com chaves diferentes passavam juntos pela conferência de
  saldo) fecha com uma trava por viagem (`pg_advisory_xact_lock`) antes da
  leitura do saldo. Ela vale até o fim da transação e só a pega quem já passou
  por `exigirMembro`.

## 2. Arquivos afetados

- `api/modulos/despesas/` — `/api/trips/:tripId/expenses/**` e `/api/expenses`
  (despesas de todas as viagens do usuário, para a tela de finanças).
- `api/modulos/acerto/` — `GET /api/trips/:tripId/acerto` e
  `POST .../acerto/transferencias`.
- `api/modulos/viagens/acesso.ts` — `papelNaViagemTx`, para conferir se o
  participante de um rateio é membro sem que o financeiro consulte `trip_members`.
- Telas: `app/dashboard/finances` passa a ler da API; a aba de despesas da
  viagem volta a carregar (`lerDaApiOpcional` saiu de `lib/api-servidor.ts`,
  sem uso).
- Removidos: `app/api/trips/[tripId]/{expenses,acerto}/**` e os testes que
  simulavam o Supabase para elas (`tests/lib/expenses-route.test.ts`,
  `tests/api/{expense-item,acerto,acerto-transferencias}-route.test.ts`).

## 3. O que testar

- [x] Cada rota: 200 · 401 · 403 para quem não participa · 400 para payload
  inválido (`tests/integracao/{despesas,acerto}.test.ts`).
- [x] Despesa: só o autor ou o dono da viagem carrega, edita e exclui (403 para
  outro membro); despesa de outra viagem → 404.
- [x] `trip_id`, `user_id`, `paid_by`, `id` no corpo não chegam ao banco.
- [x] Rateio igual, por peso e exato; valor que não fecha e participante de
  fora → 400 sem nada gravado; edição de valor refaz as partes (igual e peso),
  recusa o exato e o já quitado (409) e não toca nas partes quando o valor não muda.
- [x] Acerto: saldo e transferência sugerida; pagamento parcial desconta; mesma
  chave → 200 sem duplicar; pagar por outra pessoa → 403; acima da dívida ou
  credor pagando → 422.
- [x] Regressão de S08-Ab: três pagamentos simultâneos da dívida inteira com
  chaves diferentes → um 201 e dois 422. O teste segura as gravações em
  `settlements` até os três estarem esperando no banco; **sem a trava, falha**
  (conferido desligando a linha).
- [x] Pelo Next: lançamento com rateio, acerto, `/dashboard/finances` e a aba
  de despesas da viagem mostram o dado; sem sessão, finanças manda para o login.

## 4. O que validar

- [x] Toda consulta dentro de `comoUsuario()`; autorização explícita antes do dado.
- [x] O financeiro não consulta `trip_members` por conta própria para autorizar:
  pergunta por `api/modulos/viagens/acesso.ts`. (O acerto lê os membros da
  viagem como dado do cálculo, como já fazia.)
- [x] Nenhuma tela do financeiro importa `lib/supabase/*`.
- [x] Tags de requisito nas rotas novas e nos testes novos.

## Andamento (17/11/2026)

- Integração: 120 de 120. Unitária: 709 de 709. Rastreabilidade sem inconsistências.

Fica para a próxima leva: convites (o `POST` envia e-mail e depende do SMTP),
rede social e `app/api/auth/change-password`.
