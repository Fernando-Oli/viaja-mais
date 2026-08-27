# Testes de RLS

Estes testes são a evidência que a **seção 25 (Segurança da Informação)** do
documento do PFC exige. Não são opcionais nem "nice to have".

## O que eles precisam provar

Os três clientes Supabase da aplicação (navegador, servidor e middleware) usam a
chave anon. Isso significa que a RLS é a fronteira real de autorização — o que a
policy não bloquear, qualquer usuário autenticado alcança.

Cada teste usa **dois usuários reais** e prova que A não acessa dados de B:

- **Leitura** — `SELECT` de A sobre linha de B devolve zero linhas.
- **Escrita** — `INSERT`, `UPDATE` e `DELETE` de A sobre dado de B são rejeitados.

O segundo é o que costuma ser esquecido. Um `SELECT` vazio não prova nada se o
`INSERT` passa: existe policy de leitura e não existe de escrita.

## Como rodar

```bash
DATABASE_URL=postgresql://... npm run test:rls
```

No CI isso roda em `db.yml`, contra um Postgres efêmero com as migrations
aplicadas do zero — o que também prova que o banco é reproduzível só a partir do
repositório.
