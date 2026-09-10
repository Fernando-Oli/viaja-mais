---
id: S03-F-schema-base
titulo: Trazer o schema real para supabase/migrations/
trilha: T0
responsavel: fernando
revisor: audrey
semana: S03
requisitos: [RNF02, RNF04]
secoes_doc: [18, 25]
branch: chore/S03-F-schema-base
tipo: [migration]
status: em-revisao
---
# Trazer o schema real para `supabase/migrations/`

> **Fernando** · semana **S03** (09 a 15/09) · marco da semana: item bloqueante
> da T0 que ficou pendente da S01 apesar de `S01-F-base-solida` estar marcado
> concluído.

## 1. Contexto

`supabase/migrations/` estava vazio — zero arquivos `.sql` no repositório. O
schema só existia em prosa em `docs/ARCHITECTURE.md`, já divergente do código,
e a RLS (única camada de autorização real, já que os três clientes Supabase
usam a chave anon) não estava versionada nem verificável. Efeito observável:
qualquer `npm run setup`/`db:reset` de máquina limpa não criaria nenhuma tabela
de domínio — só os dois usuários de seed.

## 2. Arquivos afetados

- `supabase/migrations/20260910000333_plataforma_schema_base.sql` — schema
  completo puxado do projeto hospedado (ref `fpawqbzkbefktpvzlsjp`): 8 tabelas,
  funções `SECURITY DEFINER`, triggers, policies de RLS reais.
- `types/database.ts` — regenerado via `supabase gen types typescript --local`
  a partir do banco local já com a migration aplicada.

## 3. Passos

1. Autenticar o CLI (`supabase login` via Personal Access Token, `sbp_...`).
2. `supabase link --project-ref fpawqbzkbefktpvzlsjp`.
3. `supabase db pull` — precisou de Docker Desktop instalado nesta máquina
   (não estava presente); o CLI roda o `pg_dump`/banco de sombra em container,
   não usa binário local.
4. Renomear o arquivo gerado (`..._remote_schema.sql` → `..._plataforma_schema_base.sql`),
   mantendo o timestamp de versão intacto para não dessincronizar o histórico
   de migrations já registrado no projeto remoto.
5. `npm run db:reset` — sobe o Postgres local só com a migration + `seed.sql`,
   sem erro de tabela inexistente.
6. `npm run db:types` — regenera `types/database.ts` a partir do local.

## 4. O que testar

**Testes automatizados:**

- [x] `npm run db:reset` limpo (aplicação de zero, sem tabela criada manualmente)
- [x] `npm run verify` — lint (79 warnings pré-existentes, 0 erro), typecheck e
      os 15 testes passam; o `build` falha nesta máquina por
      `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` ausente no `.env.local` local — gap de
      ambiente pré-existente, sem relação com a migration

**Roteiro de teste manual:**

1. Rodar `npx supabase db pull` de novo na branch → esperado: nenhum diff novo
   (o schema já capturado bate com o remoto).
2. Abrir `docs/pfc/04-design/18-Modelo-de-dados.md` e comparar com
   `supabase/migrations/20260910000333_plataforma_schema_base.sql` → qualquer
   divergência é a doc desatualizada, não a migration.

## 5. O que validar

- [x] Migration aplica do zero via `supabase db reset`, sem erro
- [x] RLS realmente habilitada nas 8 tabelas (`ENABLE ROW LEVEL SECURITY`
      confirmado no dump, não só suposto pelo `SECURITY.md`)
- [x] `types/database.ts` gerado e commitado junto com a migration
- [x] `npm run verify` — lint/typecheck/testes verdes; `build` bloqueado só
      pela chave do Google Maps ausente localmente (não relacionado)

## 6. Evidência

- Saída de `npm run db:reset`: "Applying migration
  20260910000333_plataforma_schema_base.sql... Seeding data from
  supabase/seed.sql..." sem erro.
- 8 tabelas com `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` confirmadas no
  arquivo de migration: `trips`, `trip_members`, `trip_invitations`,
  `expenses`, `bookings`, `itinerary_items`, `places`, `profiles`.

## 7. Riscos residuais encontrados (não corrigidos nesta atividade)

- **Colisão com `fix/S02-A-bugs-p0` (Audrey):** existe um trigger
  `on_trip_created` → `add_trip_owner_as_member()` que já insere o criador em
  `trip_members` como `owner` automaticamente. O commit dela em
  `app/api/trips/route.ts` descomentou um insert manual idêntico — com o
  schema real aplicado, os dois inserts colidem na constraint única
  `trip_members_trip_id_user_id_key` e a criação de viagem passa a devolver
  400 mesmo com a viagem já criada. Precisa de ajuste antes do merge dela.
- **Tipos do Supabase não conectados:** `createServerClient`/`createBrowserClient`
  em `lib/supabase/server.ts`/`client.ts` ainda não usam o generic `Database`.
  Ao testar a conexão, isso revelou ~10 erros de tipo reais em
  `app/dashboard/trips/**` e `app/dashboard/bookings/**` (nulidade de
  `role`/`status`, embed `trip_members→profiles` sem FK direta reconhecida
  pelo PostgREST) — fora do escopo desta atividade, domínio da Audrey.
- **Duas gerações de RLS policy convivendo** nas mesmas tabelas (nomes em
  inglês tipo "Trip owners can update their trips" ao lado de
  `trips_update_owner` fazendo a mesma coisa) — redundante, não quebrado, mas
  vale consolidar numa limpeza futura.
