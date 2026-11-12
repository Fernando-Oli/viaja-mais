---
id: S08-F-revisao-rls-social
titulo: Revisão da RLS do participante (issue #37)
trilha: T5
responsavel: fernando
revisor: audrey
semana: S08
requisitos: [RNF02.4, RF04.3]
secoes_doc: [22.3, 25]
branch: fix/S08-F-revisao-rls-participante
tipo: [seguranca, rls, migration]
depende_de: []
status: em-revisao
---
# Revisão da RLS do participante (issue #37)

> **Fernando** · planejada para a S08, feita na S12 (12/11).

## 1. Contexto

A issue #37 apontou quatro pontos em policies herdadas da migration base, sem detalhes, porque o repositório é público. A suíte de RLS provava bem o isolamento de quem está **de fora** da viagem e quase nada sobre o que um **participante** consegue fazer além do devido.

A revisão foi refeita do zero, lendo `pg_policies` e os grants por coluna, e comparando com o que as rotas de `app/api/**` de fato fazem. Duas causas:

1. **Policies duplicadas.** Cada tabela herdada do dump do projeto original tinha as nossas policies, estritas, e as do dump, frouxas, com nomes em inglês (26 ao todo). Policies permissivas somam por OU, então a frouxa vencia.
2. **Grants em todas as colunas.** `authenticated` podia alterar `user_id`, `trip_id` e o `trip_id` do convite.

## 2. Hipóteses, confirmadas por teste contra o banco antes da correção

| # | Exploração | Resultado antes |
|---|---|---|
| H1 | Membro troca `trips.user_id` para si e vira dono | **Confirmada** |
| H2 | Conta qualquer convida o próprio e-mail para uma viagem sua, troca o `trip_id` do convite para a viagem de outra pessoa e entra nela | **Confirmada** |
| H3 | Membro altera ou apaga a despesa de outro; troca autor ou viagem de despesa, reserva ou lugar | **Confirmada** |
| H4 | Dona troca o `user_id` de uma linha de membro (põe alguém na viagem sem convite) ou promove a dono | **Confirmada** |
| H5 | Participante marca a própria parte do rateio como paga (sai do acerto, `lib/finance/acerto.ts:169`) ou apaga partes de despesa alheia | **Confirmada** |
| — | Transferência registrada para quem não participa da viagem (anotado na revisão do #48) | **Confirmada** |

## 3. Arquivos afetados

- `supabase/migrations/20261112010000_plataforma_rls_participante.sql` — remove as 26 policies do dump; ajusta `expenses`, `bookings` e `places` para a regra das rotas; tira o UPDATE de `trip_members`; grants por coluna; `pode_editar_despesa()` e `parte_de_membro()` para `expense_shares`; recebedor membro em `settlements`
- `tests/rls/13-participante.test.ts` — novo: cada exploração, mais os caminhos legítimos que não podem quebrar
- `tests/rls/01-isolamento.test.ts`, `02-rateio.test.ts`, `07-settlements.test.ts` — ajustes. A preparação de dois deles lançava parte e pagamento para quem não era membro, exatamente o que passou a ser proibido; o terceiro esperava zero linhas e agora recebe 42501
- `types/database.ts` — regenerado
- `docs/pfc/evidencias/seguranca/S08-F-rls-participante.md` — material da seção 25

## 4. O que testar

- [x] `tests/rls/13-participante.test.ts` **falha antes** (17 falhas contra o banco da `main`) e passa depois (30/30)
- [x] Caminhos legítimos continuam: a dona edita a viagem e a despesa de um membro, o autor edita a própria despesa e regrava as partes, um membro edita reserva, lugar e itinerário, o convidado aceita ou recusa, e a transferência para um membro funciona
- [x] Suíte RLS completa: 264/264
- [x] `npm run verify` (882) e E2E completo (169/169) verdes: nenhuma tela dependia da policy frouxa

## 5. O que validar

- [x] Cada uma das hipóteses tem teste que prova a exploração bloqueada
- [x] Nenhuma policy com nome do dump sobra em `trips`, `expenses`, `bookings`, `places` e `itinerary_items` (teste estrutural)
- [x] Nenhuma rota altera coluna fora dos grants novos (conferido em todo `update`/`upsert` de `app/api/**`)
- [ ] Aplicada em produção (`supabase db push`), com o resultado informado ao @deffmain para a seção 25
- [x] Risco residual registrado em `docs/pfc/evidencias/seguranca/`

## 6. Evidência

- [x] Saída do teste antes (17 falhas) e depois (30/30)
- [x] Saída do E2E: 169 passed
