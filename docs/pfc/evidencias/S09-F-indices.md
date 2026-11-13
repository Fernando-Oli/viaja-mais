# S09-F — Índices: antes e depois

Data: 13/11/2026. Requisito: RNF01.5.

## O que faltava

As 12 chaves estrangeiras das tabelas herdadas do dump original não tinham índice: `bookings`, `expenses`, `places` e `itinerary_items` (`trip_id` e `user_id`), `trip_invitations` (`trip_id`, `inviter_id`, `invitee_id`), `trip_members.user_id` e `trips.user_id`. As tabelas criadas pela equipe tinham índice em todas. A migration `20261113100000_plataforma_indices.sql` cria 15 índices. Os das abas da viagem são compostos com a coluna de ordenação da tela.

## Medição

Banco local, 2.000 viagens com 50 despesas cada (100 mil linhas), consulta da aba Despesas de uma viagem (`where trip_id = … order by date desc`), `EXPLAIN ANALYZE`, dentro de transação desfeita:

| | Plano | Tempo de execução |
|---|---|---|
| Sem índice | `Seq Scan on expenses` + `Sort` | 12,2 ms |
| Com `expenses_trip_id_date_idx` | `Bitmap Index Scan` | **0,49 ms** |

Sem índice, o tempo cresce com o total de despesas **de todas as viagens**; com índice, depende só do tamanho da viagem aberta.

## Prova permanente

`tests/rls/15-indices.test.ts`:
- toda chave estrangeira do schema `public` tem índice que começa por ela (falhava com as 12 acima);
- com volume sintético, o plano das quatro abas da viagem (itinerário, despesas, reservas, lugares) usa o índice e não lê a tabela inteira.
