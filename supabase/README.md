# Banco de dados

## Por que esta pasta existe

Até a semana S01 o schema do ViajaMais **não estava no repositório**. Não havia
nenhum arquivo `.sql`, a pasta `scripts/` estava listada no `.gitignore`, e a única
descrição da estrutura era prosa em `docs/ARCHITECTURE.md` — que já divergia do
código real (o texto define `trip_invitations.responded_at`, o código grava
`updated_at`; o texto não tem `profiles.email`, o código seleciona esse campo).

Na prática o projeto não era reproduzível: ninguém conseguia subir uma cópia
funcional sem receber acesso ao painel do Supabase de outra pessoa.

Esta pasta corrige isso. **A partir daqui, o banco é o que está aqui.**

## Ordem de aplicação

Arquivos são aplicados em ordem alfabética, e o nome começa com timestamp
justamente para que a ordem seja a cronológica:

```
20260827HHMM_plataforma_schema_inicial.sql
20260902HHMM_financeiro_expense_shares.sql
```

O domínio vai no nome porque quatro pessoas criam migrations em paralelo.
Numeração sequencial (`0001`, `0002`) colidiria toda semana.

## Regras

1. **Migration mergeada nunca é editada.** Corrige-se com uma migration nova.
2. **Tabela nova nasce com RLS habilitada** e uma policy por operação que a
   aplicação usa. Os três clientes Supabase da aplicação usam a chave anon —
   uma tabela sem policy é uma tabela pública para qualquer pessoa com conta.
3. **Toda migration vem com teste** em `tests/rls/`, com dois usuários provando
   isolamento de leitura *e* de escrita.
4. Depois de aplicar: `npm run db:types` e commite `types/database.ts` junto.

## Como extrair o schema atual (pendente — S01)

O schema real ainda está apenas no projeto do Supabase. Para trazê-lo:

```bash
npx supabase login
npx supabase link --project-ref <ref-do-projeto>
npx supabase db pull        # gera a migration com o estado atual
npm run db:types            # gera types/database.ts
```

Alternativa sem CLI: no painel, SQL Editor, exportar o schema
(`pg_dump --schema-only`) e salvar como a primeira migration.

**Não transcreva a DDL de `docs/ARCHITECTURE.md`** — ela já está desatualizada em
relação ao banco. O que vale é o que o banco tem hoje; a documentação é corrigida
depois, a partir daqui.

Verificação de que deu certo: o workflow `db.yml` aplica todas as migrations num
Postgres vazio e roda os testes de RLS. Se ele passa, o banco é reproduzível.
