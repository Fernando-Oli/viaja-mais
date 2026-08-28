# Banco de dados

## Como rodar (time todo)

**Pré-requisito: Docker Desktop instalado e rodando.** O stack local do Supabase
(Postgres, Auth, Storage, Studio) vive em contêineres.

```bash
npm ci
npm run setup
```

O `setup` sobe o stack, aplica as migrations, roda o seed e **escreve o
`.env.local` sozinho**, com as credenciais que o próprio stack gerou.

Isso é o ponto principal: **ninguém precisa receber credencial de banco por
mensagem.** Cada pessoa tem o próprio Postgres, com as próprias chaves, válidas
só na máquina dela. A única variável que ainda vem de fora é a
`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, que é do Google Cloud e é protegida por
restrição de referrer e cota, não por sigilo.

| Serviço | Endereço |
|---|---|
| Aplicação | http://localhost:3000 |
| API do Supabase | http://localhost:54321 |
| Studio (SQL, tabelas) | http://localhost:54323 |
| **E-mails de teste** | http://localhost:54324 |

O último é o Inbucket: confirmação de cadastro, reset de senha e convite caem
ali, sem sair da máquina. É como se testa o fluxo de e-mail sem mandar mensagem
para ninguém.

**Usuários de teste** (criados por `seed.sql`, senha `viajamais123`):
`teste.a@viajamais.local` e `teste.b@viajamais.local`. São dois porque metade do
valor da suíte está em provar que B **não** vê o que é de A.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run setup` | Sobe tudo e escreve o `.env.local`. Idempotente. |
| `npm run db:reset` | Recria o banco do zero: migrations + seed. Use sempre que puxar migration nova. |
| `npm run db:diff -- nome` | Gera migration a partir das mudanças feitas no Studio |
| `npm run db:types` | Regenera `types/database.ts` |
| `npm run db:stop` | Derruba o stack |
| `npm run db:status` | Mostra URLs e chaves |

## Por que esta pasta existe

Até agosto de 2026 o schema **não estava no repositório**. Não havia nenhum
arquivo `.sql`, a pasta `scripts/` estava no `.gitignore`, e a única descrição da
estrutura era prosa em `docs/ARCHITECTURE.md` — que já divergia do código real
(o texto define `trip_invitations.responded_at`, o código grava `updated_at`;
o texto não tem `profiles.email`, o código seleciona esse campo).

O projeto não era reproduzível: ninguém subia uma cópia funcional sem receber
acesso ao painel de outra pessoa. **A partir daqui, o banco é o que está aqui.**

## Regras

1. **Nome por timestamp, com o domínio**:
   `20260902143000_financeiro_expense_shares.sql`. Quatro pessoas criam migration
   em paralelo; numeração sequencial (`0001`, `0002`) colidiria toda semana.
2. **Migration mergeada nunca é editada.** Corrige-se com uma migration nova.
3. **Tabela nova nasce com RLS habilitada** e uma policy por operação que a
   aplicação usa. Os clientes da aplicação usam a chave anon: tabela sem policy é
   tabela pública para qualquer pessoa com conta.
4. **Toda migration vem com teste** em `tests/rls/`, provando isolamento de
   leitura **e** de escrita entre os dois usuários.
5. Depois de aplicar: `npm run db:types` e commite `types/database.ts` junto.

Antes de escrever SQL, carregue a skill **`supabase-postgres-best-practices`** —
ela cobre tipos de coluna, índices, policies e armadilhas de performance.

## Pendente: trazer o schema do projeto hospedado

As migrations ainda estão vazias. O schema real vive no projeto do Supabase
(`fpawqbzkbefktpvzlsjp`). Só o Fernando faz este passo, uma vez:

```bash
npx supabase login
npx supabase link --project-ref fpawqbzkbefktpvzlsjp
npx supabase db pull        # gera a migration com o estado atual
npm run db:reset            # confere que ela aplica do zero
npm run db:types
```

**Não transcreva a DDL de `docs/ARCHITECTURE.md`** — ela já está desatualizada em
relação ao banco. O que vale é o que o banco tem hoje; a documentação é corrigida
depois, a partir daqui.

Prova de que deu certo: o workflow `db.yml` aplica todas as migrations num
Postgres vazio e roda os testes de RLS.
