---
id: S03-M-migration-social
titulo: Migration do social: perfil público e follows
trilha: T1
responsavel: micael
revisor: fernando
semana: S03
requisitos: [RF02.5, RF02.6, RF02.7, RF09.1, RF09.2, RF09.3, RF09.4, RF09.5, RF09.6, RF09.9, RF13.2]
secoes_doc: [18, 25]
branch: feat/S03-M-migration-social
tipo: [migration, rls]
depende_de: [S03-F-schema-base]
status: em-desenvolvimento
---
# Migration do social: perfil público e follows

> **Micael** · semana **S03** (09 a 15/09) · marco da semana: _Convite chega no e-mail de verdade_

## 1. Contexto

Primeira migration do domínio Social. `profiles` ganha `username` (única),
`bio` e `is_public`; entra a tabela `follows`, com estado pendente/aceito, que é
a base do seguir estilo Instagram (RF09). Sustenta os requisitos RF02.5–RF02.7 e
RF09.1–RF09.6/RF09.9 — que, sem esta migration, não têm coluna nem tabela onde
existir. A RLS de visibilidade definida aqui é o estudo de caso da seção 25.

**Divisão do trabalho.** Migration e RLS são do Fernando (CLAUDE.md), e esta
atividade segue a regra sem exceção:

| Quem | Entrega |
|---|---|
| Micael | Esta especificação; a proposta executável em [`S03-M-migration-social.proposta.sql`](S03-M-migration-social.proposta.sql); o seed; o teste de RLS `tests/rls/04-social.test.ts`; as evidências |
| Fernando | A migration final em `supabase/migrations/<timestamp>_social_perfil_e_follows.sql`, livre para reescrever a proposta, e o `types/database.ts` regenerado junto |

A proposta já foi aplicada localmente sobre a `main` e exercitada pelo teste — é
o que garante que a especificação é coerente, e não só plausível. **Ordem de
merge:** o seed e o teste referenciam colunas e tabela que só existem com a
migration, então este PR só entra em `main` junto com ela (o Fernando pode
empurrar a migration para esta branch, ou mergear a dele antes).

## 2. Arquivos afetados

- `docs/plans/S03-M-migration-social.proposta.sql` — **novo** (Micael). A proposta
  de SQL: fica fora de `supabase/migrations/` de propósito, não é aplicada pelo
  `db:reset` e os scripts do Notion só leem `.md`.
- `supabase/migrations/<timestamp>_social_perfil_e_follows.sql` — **novo** (Fernando).
- `types/database.ts` — **gerado** por `npm run db:types` junto com a migration (Fernando).
- `supabase/seed.sql` — (Micael) terceira usuária de teste, Carla, e `username`/`bio`/
  `is_public` dos três: Ana pública, Bruno privado, Carla pública.
- `tests/rls/04-social.test.ts` — **novo** (Micael). O prefixo `04-` segue
  `02-rateio` e `03-escopo-grupo`.
- `docs/pfc/evidencias/S03-M-social-rls.txt` e `S03-M-social-mutacoes.txt` — evidências.
- `docs/pfc/04-design/18-Modelo-de-dados.md` — `profiles` (colunas novas) e `follows`
  no modelo de dados. **Depois do merge da migration**, via `/pfc-secao 18`: antes
  disso a seção descreveria um schema que não está no repositório.

## 3. Passos

O SQL completo está na proposta; aqui fica o porquê de cada decisão.

1. **`profiles` — colunas novas.**
   - `username extensions.citext unique` (nulo por ora, pois as linhas existentes
     não têm), com `check (username::text ~ '^[a-z0-9_]{3,30}$')`. `citext` dá
     unicidade case-insensitive sem `lower()` espalhado nas queries; o check roda
     sobre o texto para guardar só a forma minúscula.
   - `bio text check (char_length(bio) <= 280)`.
   - `is_public boolean not null default true` — público por padrão alinha com o
     produto de descoberta.

2. **`profiles` — leitura dos dados básicos.** Policy `to authenticated using (true)`.
   Não é o `USING (true)` que o fix de isolamento removeu de `trips`: o
   detalhamento do RF02 (seção 14) diz que nome, username, avatar e bio ficam
   visíveis **mesmo em perfil privado**; a privacidade recai sobre as publicações
   (`trip_posts`, S06). `profiles` não tem e-mail nem dado sensível. Visitante sem
   sessão continua sem ler nada.

3. **Tabela `follows`.** PK composta `(follower_id, followee_id)`, `status in
   ('pending','accepted')`, check que proíbe seguir a si mesmo, FKs com `on delete
   cascade` (RF02.4 apaga vínculos junto com a conta). A PK **não** torna o segundo
   INSERT silencioso — levanta 23505; a idempotência do RF09.2 é do route handler
   (`ON CONFLICT DO NOTHING`, S05).

4. **Trigger de estado inicial (segurança).** `before insert`, `security definer`,
   `search_path = ''`. Sobrepõe **tudo que o cliente não deve escolher**:
   - `status` conforme `is_public` do alvo — sem isso, um INSERT direto gravaria
     `accepted` num perfil privado e furaria a aprovação (o vetor da seção 25);
   - `created_at` e `updated_at` com `now()` — sem isso, o cliente gravaria uma data
     no futuro e ficaria sempre no topo das listas e da central de notificações
     (RF13), que ordenam por data.

   `execute` revogado de `public`, `anon` e `authenticated`. Um segundo trigger
   mantém `updated_at` em toda aprovação.

5. **RLS** — `enable row level security` em `follows`. Sem `force`, como o resto do
   schema: a tabela é de `postgres` e a Data API fala como `authenticated`/`anon`,
   a quem a RLS sempre se aplica. `(select auth.uid())` envelopado, por performance.
   - SELECT → aceitos são públicos (RF09.6); pendentes só para as duas partes (RF09.3).
   - INSERT → `with check (uid = follower_id)`: ninguém cria vínculo em nome de outro.
   - UPDATE → `using (uid = followee_id) with check (uid = followee_id and status =
     'accepted')`: só o dono aprova (RF09.4).
   - DELETE → `using (uid in (follower_id, followee_id))`: deixar de seguir e cancelar
     (RF09.5), recusar (RF09.4) e remover seguidor sem barreira (RF09.9).

6. **Privilégios explícitos**, no padrão da migration do rateio (sem depender de
   `DEFAULT PRIVILEGES`): `revoke all` de `anon` e `authenticated`; `select, insert,
   delete` para `authenticated`; `update (status)` — só a coluna. O `WITH CHECK` não
   vê a linha antiga, então sozinho não impediria repontar `follower_id`/`followee_id`;
   o grant de coluna fecha isso. `anon` fica sem nada.

7. **Índices.** `follows (followee_id)` — a PK só cobre buscas por `follower_id`, e
   "quem me segue"/"minhas solicitações" filtram por `followee_id` (também é o
   índice de FK). Parcial `follows (followee_id) where status = 'pending'` para a
   Zona 1 da central de notificações (RF13.2).

8. **Seed.** Ana pública, Bruno privado, Carla pública. A Carla existe porque uma
   solicitação tem dois lados, e provar que ela não vaza exige alguém que não é
   nenhum deles.

9. **Teste de RLS** em `tests/rls/04-social.test.ts` — ver bloco 4.

**Fora do escopo, registrado para a S05:** quando um perfil passa de privado para
público, as solicitações pendentes continuam pendentes até o dono decidir. Se o
produto quiser aceitá-las automaticamente, isso entra na rota de editar perfil.

## 4. O que testar

Obrigatórios pelo tipo (`migration, rls`):

- [x] Aplicação limpa do zero: `npx supabase db reset` aplica as 4 migrations (a
  proposta como a quarta, localmente) e o seed sem erro
- [x] Teste em `tests/rls/` com os usuários do seed — 23 casos em `04-social.test.ts`
- [x] Usuário A não lê E não escreve dados de B — leitura (pendente invisível para
  terceiro, visitante sem sessão não lê) e escrita (INSERT forjado, UPDATE e DELETE
  de terceiro, UPDATE de perfil alheio, UPDATE de coluna sem grant)
- [x] `npm run test:rls` verde — 61 de 61, as 5 suítes
- [x] **Cada proteção derruba pelo menos um teste quando é removida** — 8 sabotagens
  (trigger, `created_at`, grant de coluna, as quatro policies de `follows` e o UPDATE
  de `profiles`), cada uma sobre banco limpo. Os erros são conferidos pelo código do
  Postgres (42501, 23505, 23514), para que um teste que espera a RLS não passe
  porque um check barrou.

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

Pré-requisito: copiar a proposta para `supabase/migrations/` com um timestamp
posterior ao do rateio (ou usar a migration do Fernando, quando existir) e rodar
`npm run db:reset`. **Não** commitar essa cópia.

1. `npm run db:reset` → aplica as migrations e o seed sem erro.
2. `npm run test:rls` → 5 suítes verdes.
3. No Studio (http://localhost:54323), SQL Editor, trocar o papel de `postgres` para
   **authenticated** e escolher a Ana (`teste.a@viajamais.local`). Sem trocar o papel,
   o editor roda como superusuário e a RLS não se aplica — o passo não provaria nada.
4. Como Ana: `insert into follows (follower_id, followee_id, status, created_at) values
   ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
   'accepted', '2099-01-01')` → a linha nasce `pending` e com `created_at` de agora.
5. Repetir o mesmo INSERT → erro 23505 (a idempotência é do route handler, S05).
6. Como Ana: `update follows set status = 'accepted' where follower_id = '1111…'` →
   0 linhas (só o followee aprova).
7. Trocar para a Carla (`teste.c@…`): `select * from follows` → a pendente Ana→Bruno
   não aparece.
8. Trocar para o Bruno: `update follows set status = 'accepted' where follower_id =
   '1111…'` → 1 linha; agora a Carla a vê (vínculo aceito é lista pública).
9. Como Carla: `delete from follows where follower_id = '1111…'` → 0 linhas.
10. Como Bruno: `update profiles set username = 'ana' where id = '2222…'` → erro 23505;
    `set username = 'AB'` → erro 23514.

## 5. O que validar

Critérios objetivos e binários. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

> Dois critérios mudaram em relação ao rascunho da S03, e o motivo fica registrado:
> "perfil privado não vaza nem o nome em listagem" contradizia o detalhamento do
> RF02 na seção 14, que manda os dados básicos ficarem visíveis; e "policy usa
> participação (trip_members)" é critério de tabela de viagem, que não se aplica a
> `follows`.

- [ ] `username` é único (case-insensitive) e validado por formato
- [ ] Perfil privado expõe só os dados básicos (nome, username, avatar, bio) a
  autenticados; visitante sem sessão não lê perfil nenhum
- [ ] Solicitação pendente só é visível para as duas partes
- [ ] `status`, `created_at` e `updated_at` não são escolhidos pelo cliente no INSERT
- [ ] Só o followee aprova; ninguém reponta `follower_id`/`followee_id` via UPDATE
- [ ] Toda tabela nova tem RLS habilitada e policy por operação usada
- [ ] Privilégios explícitos: `anon` sem nada, UPDATE só em `status`
- [ ] SELECT vazio não é aceito como prova: INSERT, UPDATE e DELETE também são testados
- [ ] Nome do arquivo final segue `<timestamp>_<dominio>_<descrição>.sql` (Fernando)
- [ ] `npm run db:types` rodado e `types/database.ts` commitado junto da migration (Fernando)
- [ ] ~~Policy usa participação (trip_members), não propriedade (user_id)~~ — não se
  aplica: `follows` não pertence a uma viagem

## 6. Evidência

- [x] Saída dos testes — arquivada em `docs/pfc/evidencias/`:
  - `S03-M-social-rls.txt` — `04-social.test.ts`: 23 de 23
  - `S03-M-social-mutacoes.txt` — as 8 sabotagens e os testes que cada uma derrubou
- [ ] Screenshot ou gravação do fluxo (se houver tela) — não há tela nesta atividade
- [ ] Delta de cobertura (se mexeu em `lib/`) — não mexeu
