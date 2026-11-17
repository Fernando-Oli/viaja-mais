---
id: S13-F-porte-viagem
titulo: Porte para a API de membros, itinerário, reservas e lugares
trilha: T6
responsavel: fernando
revisor: audrey
semana: S13
requisitos: [RF04.4, RF04.7, RF04.8, RF05.1, RF05.2, RF05.3, RF05.4, RF07.1, RF07.5, RF07.6, RF07.7, RF08.2, RF08.3, RF08.4, RF08.6, RF11.1, RF11.2, RF11.3]
secoes_doc: [20, 22.2, 22.3]
branch: feat/S13-F-sem-supabase
tipo: [route-handler, tela]
depende_de: [S13-F-api-molde]
status: em-desenvolvimento
---
# Porte para a API de membros, itinerário, reservas e lugares

> **Fernando** · semana **S13** · Etapa 2 de 4 do plano "Avori sem Supabase", primeira leva

## 1. Contexto

Com a rota-molde verde (S13-F-api-molde), as rotas restantes do domínio de
viagem saem do Next e vão para a API, no mesmo molde. As telas do painel que
consultavam o Supabase direto pelo servidor passam a ler da API.

## 2. Arquivos afetados

- `api/modulos/viagens/` — membros (`GET`, `DELETE`) e `acesso.ts`, a porta de
  autorização de viagem para os outros módulos.
- `api/modulos/itinerario/`, `api/modulos/reservas/`, `api/modulos/lugares/`
  (com avaliações) — rotas por viagem e as listas de todas as viagens do
  usuário (`/api/itinerary`, `/api/bookings`, `/api/places`).
- `api/http/parametros.ts` — `lerUuid`, `lerCorpo`. `api/http/sessao.ts` valida
  a sessão uma vez por requisição.
- `lib/api-servidor.ts` — `lerDaApi`, `lerDaApiOpcional`, `usuarioDaSessao`
  para server components.
- Telas: `app/dashboard/trips/[id]`, `itinerary`, `bookings`, `places`.
- Removidos: as rotas do Next em `app/api/trips/[tripId]/{members,itinerary,bookings,places}`
  e os testes que simulavam o Supabase para elas.

## 3. O que testar

- [x] Cada rota: 200 · 401 sem sessão · 403 para quem não participa · 400 para
  payload inválido (`tests/integracao/{membros,itinerario,reservas,lugares}.test.ts`).
- [x] Item de outra viagem pela URL desta → 404 (filtro por `trip_id` **e** `id`).
- [x] `trip_id`, `user_id`, `id`, `name` no corpo não chegam ao banco.
- [x] Listas de todas as viagens não trazem viagem de que a pessoa não participa
  (regressão do P0 de S02-A, antes em `tests/app/itinerary-scope.test.ts`).
- [x] Avaliação: 201 na primeira, 200 na edição sem duplicar, só a própria é excluída.
- [x] Navegador: viagem, agenda, reservas e lugares carregam pela API; sem
  sessão, a viagem manda para o login.

## 4. O que validar

- [x] Toda consulta dentro de `comoUsuario()`; autorização explícita antes do dado.
- [x] Nenhuma tela do painel destas quatro áreas importa `lib/supabase/*`.
- [x] Tags de requisito nas rotas novas e nos testes novos.

## Andamento (16/11/2026)

- Integração: 86 de 86. Unitária: 796 de 796. Rastreabilidade sem inconsistências.
- Navegador (Chromium): criação pela tela de viagem, itinerário, reserva e
  lugar via rewrite do Next (`X-Replica: local`); as quatro telas mostram o dado.

Fica para a próxima leva: despesas e acerto (financeiro — a aba de despesas da
viagem fica vazia até lá, por `lerDaApiOpcional`), convites, rede social e
`app/dashboard/finances`. Telas de autenticação (`sign-up`, `reset-password`,
`signout`) são da etapa 3.
