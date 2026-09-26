---
id: S04-F-migration-rateio
titulo: Migration do rateio: expense_shares e paid_by
trilha: T1
responsavel: fernando
revisor: audrey
semana: S04
requisitos: []
secoes_doc: [18]
branch: feat/S04-F-migration-rateio
tipo: [migration, rls]
depende_de: []
status: concluido
---
# Migration do rateio: expense_shares e paid_by

> **Fernando** · semana **S04** (16 a 22/09) · marco da semana: _RLS provada por teste_

## 1. Contexto

Base da divisão de custos: quem pagou e quanto cada um deve. Atende RF-06.8 a
RF-06.10 e RF-06.12 do catálogo (seção 14.2), e RNF-08.1.

Hoje `expenses.user_id` acumula dois papéis — quem registrou e quem pagou. São
coisas diferentes: o tesoureiro do grupo lança a conta do hotel que outra pessoa
pagou. Sem essa separação não existe saldo por membro, e sem saldo não existe
acerto de contas.

Destrava `S05-Ab-balances` e `S06-Ab-rateio-ui`, do Abner.

## 2. Arquivos afetados

- `supabase/migrations/20260926102023_financeiro_rateio.sql` — **novo**
- `types/database.ts` — regenerado por `npm run db:types`
- `tests/rls/02-rateio.test.ts` — **novo**: isolamento e integridade

Fora do escopo: `settlements`. Só é consumida a partir de `S07-Ab-acerto-contas`,
e juntar as duas faria um PR grande demais para revisar com atenção — que é
exatamente onde erro de policy passa batido.

## 3. Passos

1. `expenses.paid_by`, com backfill `paid_by = user_id` para o que já existe.
   `on delete restrict`: apagar a conta de quem pagou destruiria o histórico
   financeiro do grupo.
2. Trigger `before insert` preenchendo `paid_by` a partir de `user_id` quando
   omitido. Sem isso, a coluna NOT NULL quebraria toda rota e toda tela que já
   inserem despesa — e `auth.uid()` como default não serve, porque é nulo
   quando a inserção vem do seed ou da chave de serviço.
3. `expenses.split_type` (`equal` | `weight` | `exact`), que é o RF-06.9.
4. Tabela `expense_shares`: valor em `numeric(10,2)`, unicidade por
   (despesa, pessoa), `settled_at` como instante em vez de booleano.
5. Índices nas duas chaves estrangeiras — Postgres não as indexa sozinho — e
   índice parcial em `settled_at is null`, que é a consulta da tela de acerto.
6. Constraint trigger **DEFERRABLE INITIALLY DEFERRED** provando RNF-08.1: a
   soma das partes tem de fechar com o valor da despesa. Adiada para o commit
   de propósito, senão inserir a primeira de três partes já estouraria.
7. RLS por **participação**, via `pode_acessar_despesa()`. A função recebe só o
   id da despesa e resolve o usuário com `auth.uid()` internamente; as funções
   antigas (`is_trip_member`, `can_access_trip`) aceitam o `user_uuid` por
   parâmetro, o que permite perguntar sobre terceiros.
8. `npm run db:reset`, `npm run test:rls`, `npm run db:types`.

## 4. O que testar

Obrigatórios pelo tipo (`migration, rls`):

- [x] Aplicação limpa do zero: `npm run db:reset` sobe sem erro
- [x] Teste em `tests/rls/` com os dois usuários do seed
- [x] Usuário A não le E não escreve dados de B
- [x] `npm run test:rls` verde — 30 testes

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. `npm run db:reset` → esperado: as três migrations aplicam sem erro.
2. `npx supabase status -o env` e exportar `API_URL` e `ANON_KEY`; rodar
   `npm run test:rls` → esperado: 30 passando.
3. No Studio (http://localhost:54323), criar despesa de 100 sem informar
   `paid_by` → esperado: a linha nasce com `paid_by = user_id`.
4. Inserir duas partes de 40 para essa despesa → esperado: erro
   *"a soma das partes (80.00) não fecha com o valor da despesa (100.00)"*.
5. Inserir duas de 50 → esperado: aceito.
6. Logado como `teste.b@viajamais.local`, consultar `expense_shares` de uma
   despesa de viagem da qual ele não participa → esperado: nenhuma linha,
   mesmo havendo parte nominalmente dele.

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [x] Dinheiro em NUMERIC, nunca float — `numeric(10,2)`, igual a `expenses.amount`
- [x] Soma das partes bate com o valor da despesa — constraint trigger, com teste
- [x] Toda tabela nova tem RLS habilitada e policy por operação usada — as quatro
- [x] Nome do arquivo segue `<timestamp>_<dominio>_<descrição>.sql`
- [x] `npm run db:types` rodado e `types/database.ts` commitado junto
- [x] SELECT vazio não e aceito como prova: INSERT tambem e testado
- [x] Policy usa participação (trip_members), não propriedade (user_id) — e há
      teste provando que o membro convidado enxerga o rateio inteiro, não só a
      própria parte
- [x] UPDATE tem `USING` **e** `WITH CHECK` — só com `USING`, um membro moveria a
      parte para despesa de outra viagem, tirando a linha do alcance da policy

## 6. Evidência

- [ ] Saida dos testes
- [ ] Screenshot ou gravação do fluxo (se houver tela)
- [ ] Delta de cobertura (se mexeu em `lib/`)
