---
id: S03-F-integridade-rls
titulo: CI aplica o schema de verdade e a RLS passa a ser provada
trilha: T0
responsavel: fernando
revisor: audrey
semana: S03
requisitos: [RNF02, RNF04]
secoes_doc: [25]
branch: fix/S03-F-integridade-rls
tipo: [migration, rls, seguranca]
status: em-desenvolvimento
---
# CI aplica o schema de verdade e a RLS passa a ser provada

> **Fernando** · semana **S03** (09 a 15/09) · consequência direta de
> `S03-F-schema-base`: agora que existe migration, o que era aviso virou falha.

## 1. Contexto

Três problemas encadeados, todos criados ou revelados quando o schema real
entrou no repositório hoje:

1. **`db.yml` está vermelho na `main`** (exit code 3 do `psql`). O workflow
   aplica as migrations com `psql` num `postgres:16` puro, mas a migration é um
   dump do Supabase: depende de `pg_graphql`, `supabase_vault`, do schema `auth`
   e dos roles `anon`/`authenticated`/`service_role`. Nada disso existe em
   Postgres puro. Enquanto `supabase/migrations/` estava vazia o job só emitia
   aviso; agora o caminho estrito ligou e quebra.
2. **Efeito colateral: os testes de RLS não rodam no CI.**
3. **A RLS nunca foi provada.** `tests/rls/` tem 4 testes estruturais — "tem RLS
   ligada?", "tem alguma policy?" — que aprovam sem reclamar a policy
   `"Allow authenticated users to read trips" … USING (true)`, que deixa
   qualquer autenticado ler toda viagem de todo mundo.

O `tests/rls/README.md` já descreve, no presente do indicativo, o teste de dois
usuários que nunca foi escrito. Esta atividade escreve.

## 2. Arquivos afetados

- `.github/workflows/db.yml` — trocar `services: postgres:16` + `psql` pelo
  stack real via `supabase/setup-cli`
- `tests/rls/01-isolamento.test.ts` — **novo**: isolamento com dois usuários
- `tests/rls/guarda-ambiente.ts` — **novo**: trava que recusa rodar fora do
  ambiente local
- `supabase/migrations/20260910012723_plataforma_rls_isolamento.sql` — **novo**:
  fecha os três buracos encontrados

## 3. Passos

1. Consertar o `db.yml`.
2. Escrever a trava de ambiente e o teste de isolamento.
3. Rodar e **registrar a falha** — é a prova de que o buraco existe.
4. Escrever a migration que fecha o buraco (com a skill
   `supabase-postgres-best-practices` carregada antes, como manda o `CLAUDE.md`).
5. `npm run db:reset` e rodar de novo: verde.
6. Só depois de verde, avaliar a consolidação das policies duplicadas que o
   dump trouxe, usando o teste como rede.

### Artefato pronto — `.github/workflows/db.yml`

```yaml
name: Banco de dados

on:
  pull_request:
    paths: ["supabase/**", "tests/rls/**", ".github/workflows/db.yml"]
  push:
    branches: [main]
    paths: ["supabase/**", "tests/rls/**"]

jobs:
  migrations:
    name: Migrations e RLS
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci

      # Stack real do Supabase, e não `services: postgres`, porque o schema
      # versionado é um dump do projeto hospedado: depende de pg_graphql, do
      # schema `auth` e dos roles anon/authenticated/service_role, que não
      # existem num Postgres puro. Foi exatamente assim que este job quebrou
      # quando a primeira migration entrou.
      - uses: supabase/setup-cli@v1
        with:
          version: latest

      # `supabase start` aplica supabase/migrations/ e roda supabase/seed.sql.
      # É a prova de que o banco é reproduzível só a partir do repositório.
      - name: Subir o Supabase local
        run: supabase start

      # Os testes de isolamento logam de verdade pelo GoTrue, então precisam da
      # URL da API e da chave anon deste stack efêmero. O `-o env` sai com aspas
      # e manda ruído para o stderr; filtramos as duas coisas.
      - name: Exportar credenciais do stack
        run: |
          supabase status -o env 2>/dev/null \
            | grep -E '^[A-Z0-9_]+=' | sed 's/"//g' >> "$GITHUB_ENV"
          echo "DATABASE_URL=$(supabase status -o env 2>/dev/null \
            | grep '^DB_URL=' | cut -d= -f2- | tr -d '"')" >> "$GITHUB_ENV"

      - name: Testes de RLS
        run: npm run test:rls
```

O escape hatch "pasta vazia = só aviso" sai: não vale mais, e o teste
estrutural `existe pelo menos uma migration` já cobre esse caso.

### O que o teste encontrou de verdade

O plano previa **um** buraco. O teste, rodado antes de qualquer correção,
provou **dois** — e a análise do segundo revelou um terceiro da mesma família:

| # | Policy | Efeito | Como foi descoberto |
|---|---|---|---|
| 1 | `"Allow authenticated users to read trips"` — `USING (true)` | Qualquer autenticado lê toda viagem de todo mundo | Previsto; teste confirmou |
| 2 | `trip_members_insert` — aceita `user_id = auth.uid()` sozinho | Qualquer autenticado **entra em qualquer viagem** inserindo a própria linha. Virando membro, passa em `can_access_trip` e ganha leitura **e escrita** em despesa, reserva, itinerário e lugar alheios | Teste falhou; não estava previsto |
| 3 | `trip_members_update` — mesmo padrão | Membro legítimo edita a própria linha e troca `role` para `owner` | Encontrado ao corrigir o #2 |

O #2 é mais grave que o #1: o #1 vaza leitura, o #2 dá escrita.

### Artefato pronto — migration

`supabase/migrations/20260910012723_plataforma_rls_isolamento.sql` — fecha os
três. Os dois caminhos legítimos de virar membro passam a ser explícitos: o
dono adiciona quem quiser, ou a pessoa convidada se adiciona **enquanto houver
convite pendente para o e-mail dela naquela viagem** (que é exatamente o que o
fluxo de aceitar convite faz). Sair da viagem continua permitido, porque é
`DELETE` e não `UPDATE`.

Seguindo o guia da Supabase carregado antes de escrever o SQL: `auth.uid()` e
`auth.jwt()` vão envolvidos em `(select ...)`, para serem avaliados uma vez por
consulta em vez de uma vez por linha, e as policies são escopadas para
`authenticated`.

### Decisão: os testes de RLS **não** carregam `.env.local`

O `.env.local` desta máquina tem `DATABASE_URL` apontando para o projeto
**hospedado** — foi ele que usamos no `supabase db pull`. Carregar `.env.local`
em `vitest.rls.config.mts` faria `npm run test:rls` rodar contra **produção**,
criando viagens e despesas de teste lá dentro.

Por isso: nada de dotenv aqui, e uma trava explícita que recusa rodar se o alvo
não for `localhost`/`127.0.0.1`. Um teste de isolamento que escreve no banco
precisa dessa garantia permanentemente, não só hoje.

## 4. O que testar

**Testes automatizados** (obrigatórios pelo tipo `migration`/`rls`/`segurança`):

- [x] Aplicação limpa do zero (`npm run db:reset`) sem erro
- [x] Teste de RLS com dois usuários provando isolamento — 23 casos
- [x] Teste que prova a **exploração bloqueada**, não o caminho feliz
- [x] O teste de leitura de `trips` **falha antes** da migration e passa depois
- [x] Guarda contra correção exagerada: membro legítimo **continua** enxergando
      a viagem e **continua** podendo sair por conta própria

Matriz do que o teste de isolamento cobre — B nunca alcança dado de A:

| Tabela | Leitura (`SELECT` de B) | Escrita (`INSERT`/`UPDATE`/`DELETE` de B) |
|---|---|---|
| `trips` | zero linhas | rejeitado |
| `expenses` | zero linhas | rejeitado |
| `bookings` | zero linhas | rejeitado |
| `itinerary_items` | zero linhas | rejeitado |
| `places` | zero linhas | rejeitado |
| `trip_members` | zero linhas | rejeitado |
| `trip_invitations` | zero linhas | rejeitado |

O bloco de escrita é o que costuma faltar: `SELECT` vazio não prova nada se o
`INSERT` passa — existe policy de leitura e não existe de escrita.

**Roteiro de teste manual:**

1. `npm run db:start` e `npm run db:reset` → esperado: migrations aplicadas e
   seed rodado, sem erro.
2. `npm run test:rls` **antes** da migration do passo 4 → esperado: falha no
   caso "B não lê viagem de A", com a viagem de A aparecendo para B.
3. Aplicar a migration, `npm run db:reset`, `npm run test:rls` → esperado:
   tudo verde.
4. Exportar `DATABASE_URL` de produção e rodar `npm run test:rls` → esperado:
   **recusa imediata** pela trava de ambiente, sem tocar no banco.

## 5. O que validar

- [ ] `db.yml` fica verde no PR — hoje está vermelho na `main` *(confirmar no
      run do PR)*
- [ ] O job realmente executa os testes (não pula): conferir no log do Actions
- [x] Nenhuma policy com `USING (true)` no schema versionado
- [x] `npm run test:rls` falha se a policy `USING (true)` for reintroduzida
- [x] `npm run test:rls` recusa rodar contra alvo não-local
- [x] Nenhuma credencial de produção é lida pelos testes (sem dotenv aqui)

## 6. Evidência

- [x] `npm run test:rls` **antes**: 2 falhas em 20 — "Bruno não lê a viagem da
      Ana" e "Bruno não se auto-adiciona como membro da viagem da Ana"
- [x] `npm run test:rls` **depois**: 23 passando, 0 falhas
- [x] Trava de ambiente: apontando `API_URL` para
      `fpawqbzkbefktpvzlsjp.supabase.co`, recusa com exit 1 antes de tocar no
      banco
- [x] `npm run typecheck` limpo · `npm run lint` 0 erros (68 avisos, abaixo do
      teto de 79) · suíte principal 46/46
- [ ] Link do run do `db.yml` verde no PR

## 7. Achado não corrigido aqui

As quatro funções `SECURITY DEFINER` do schema (`is_trip_owner`,
`is_trip_member`, `can_access_trip`, `add_trip_owner_as_member`) não declaram
`set search_path = ''`. Os corpos já usam nomes qualificados (`public.trips`
etc.), então o risco hoje é baixo, mas é apontamento clássico de revisão de
segurança e vale endereçar antes da seção 25. Ficou de fora **de propósito**:
não é buraco provado por teste, e misturar hardening com correção de buraco faz
o PR perder revisibilidade.
