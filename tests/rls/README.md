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
npm run db:start      # se o stack ainda não estiver de pé
npm run test:rls
```

Só isso. A suíte lê `API_URL`, `ANON_KEY` e `DATABASE_URL` do `.env.local`
sozinha, via `tests/rls/preparar-ambiente.ts`. O que já estiver no ambiente tem
precedência, então exportar uma variável para um teste pontual continua
funcionando — é assim que o CI faz.

Antes era preciso exportar as três à mão, e quem não exportasse via os testes
estruturais — "toda tabela tem RLS", "toda tabela com RLS tem policy" — serem
**pulados em silêncio**, com a suíte dizendo "passou". Nenhum teste aqui pula:
falta de variável é erro, com instrução de conserto.

`guarda-ambiente.ts` recusa qualquer alvo que não seja local, tanto para a API
quanto para a conexão direta. É defesa em profundidade, não desconfiança do
`.env.local`: estes testes **escrevem** no banco, e um arquivo copiado de outra
máquina ou uma variável esquecida no shell bastam para o alvo deixar de ser o
que se espera.

No CI isso roda em `db.yml`, contra um Postgres efêmero com as migrations
aplicadas do zero — o que também prova que o banco é reproduzível só a partir do
repositório.
