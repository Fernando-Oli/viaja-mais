# Testes de RLS

Estes testes são a evidência que a **seção 25 (Segurança da Informação)** do
documento do PFC exige. Não são opcionais nem "nice to have".

## O que eles precisam provar

A API autoriza explicitamente em toda rota (`exigirMembro`, `exigirDono`), mas
cada consulta dela roda com o papel `authenticated` e a identidade do usuário
(`comoUsuario()`, em `api/db/como-usuario.ts`). A RLS é a segunda linha de
defesa: o que a rota esquecer de barrar, a policy barra.

Cada teste usa **dois usuários reais** e prova que A não acessa dados de B:

- **Leitura** — `SELECT` de A sobre linha de B devolve zero linhas.
- **Escrita** — `INSERT`, `UPDATE` e `DELETE` de A sobre dado de B são rejeitados.

O segundo é o que costuma ser esquecido. Um `SELECT` vazio não prova nada se o
`INSERT` passa: existe policy de leitura e não existe de escrita.

## Como os testes agem como um usuário

- `cliente-sql.ts`: um cliente com a forma do antigo `supabase-js`
  (`from().select().eq()`, `rpc()`), que roda cada chamada numa transação com
  `role` e `request.jwt.claims` locais — o mesmo que o PostgREST fazia e que a
  API faz hoje. Sem sessão: papel `anon`, o visitante.
- `naApi()` (em `apoio.ts`): roda uma função dos repositórios da API pelo
  `comoUsuario()` de produção. Usado onde o teste prova a consulta que a rota
  faz de fato (`03-escopo-grupo`, `09-solicitacoes`, `10-listas`,
  `17-projecao-publica`).
- `cadastrar()` (em `apoio.ts`): cria a conta pelo cadastro do Better Auth, como
  qualquer pessoa.

## Como rodar

```bash
docker compose up -d --wait
npm run db:reset      # se o banco não estiver com as migrations e o seed atuais
npm run test:rls      # tests/rls e tests/integracao
```

A conexão é a `DATABASE_ADMIN_URL`, com o banco do `docker-compose.yml` como
padrão. `guarda-ambiente.ts` recusa qualquer alvo que não seja local: estes
testes **escrevem** no banco, e uma variável esquecida no shell basta para o
alvo deixar de ser o que se espera.

No CI isso roda em `db.yml`, com o banco recriado do zero — o que também prova
que o banco é reproduzível só a partir do repositório.
