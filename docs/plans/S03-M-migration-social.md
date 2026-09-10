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
status: backlog
---
# Migration do social: perfil público e follows

> **Micael** · semana **S03** (09 a 15/09) · marco da semana: _Convite chega no e-mail de verdade_

## 1. Contexto

Primeira migration do domínio Social. `profiles` ganha `username` (única),
`bio` e `is_public`; entra a tabela `follows`, com estado pendente/aceito, que é
a base do seguir estilo Instagram (RF09). Sustenta os requisitos RF02.5–RF02.7 e
RF09.1–RF09.5/RF09.9 — que, sem esta migration, não têm coluna nem tabela onde
existir. A RLS de visibilidade definida aqui é o estudo de caso da seção 25.

> **Duas dependências/nuances a resolver antes de começar (bloco 5 do
> Definition of Ready):**
>
> 1. **Depende da fundação de banco (T0).** Não existe migration alguma no repo
>    ainda — `supabase/migrations/` está vazio e `types/database.ts` não foi
>    gerado (só há `types/global.d.ts`). Esta migration **altera** `profiles`,
>    logo precisa que a migration base que **cria** `profiles` já exista. Enquanto
>    a T0 não entra, `npm run db:reset` não tem o que aplicar. Alinhar com o
>    Fernando antes de codar.
> 2. **Migration e RLS são de titularidade do Fernando** (CLAUDE.md: *"Migration e
>    política de RLS são sempre do Fernando, em qualquer domínio"*). Este plano é
>    a **especificação** do que o schema social precisa — quem escreve o `.sql` e
>    as policies é o Fernando; Micael escreve depois as rotas, telas e testes que
>    consomem. Confirmar com ele se o autoria do SQL é dele ou se esta atividade é
>    uma exceção pareada.

## 2. Arquivos afetados

- `supabase/migrations/<timestamp>_social_perfil_e_follows.sql` — **novo**. ALTER
  em `profiles` (colunas `username`/`bio`/`is_public`), CREATE da tabela `follows`,
  índices e todas as policies de RLS. Nome no padrão `<timestamp>_<domínio>_<descrição>`.
- `types/database.ts` — **gerado** por `npm run db:types` após a migration; commitado junto.
- `supabase/seed.sql` — atribuir `username` aos dois usuários do seed
  (`ana` e `bruno`) e deixar um público e um privado, para os testes de RLS terem
  cenários prontos. (Depende de `profiles` já ser criada por trigger na T0.)
- `tests/rls/social.test.ts` — **novo**. Prova de isolamento com os usuários A e B
  do seed (SELECT **e** INSERT).
- `docs/pfc/05-arquitetura/18-modelo-de-dados.md` — acrescentar `profiles`
  (colunas novas) e `follows` ao modelo de dados (seção 18).

## 3. Passos

> A escrita do `.sql` e das policies é do Fernando (ver nuance 2 acima). Os passos
> abaixo são a especificação que ele implementa; os passos 5–8 (types, seed, testes,
> doc) são de Micael.

1. **`profiles` — colunas novas.**
   - `username citext unique` (nulo por ora, pois as linhas existentes não têm),
     com `check (username ~ '^[a-z0-9_]{3,30}$')`. `citext` dá unicidade
     case-insensitive sem depender de `lower(username)` espalhado nas queries.
   - `bio text check (char_length(bio) <= 280)`.
   - `is_public boolean not null default true` — **decisão a confirmar**: default
     público alinha com o produto de descoberta; se a equipe preferir privacidade
     por padrão, vira `default false`.

2. **Tabela `follows`.**
   ```sql
   create table public.follows (
     follower_id uuid not null references public.profiles(id) on delete cascade,
     followee_id uuid not null references public.profiles(id) on delete cascade,
     status text not null default 'pending' check (status in ('pending','accepted')),
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now(),
     primary key (follower_id, followee_id),
     constraint follows_sem_auto check (follower_id <> followee_id)
   );
   ```
   - A PK composta `(follower_id, followee_id)` garante unicidade e torna
     "solicitar duas vezes" idempotente (RF09.2). A `check` proíbe seguir a si mesmo.

3. **Trigger de estado inicial (segurança).** `before insert` em `follows` que
   **força** `status` conforme o alvo: `accepted` se `profiles.is_public` do
   `followee_id` for verdadeiro, senão `pending`. Sem isso, um INSERT direto
   poderia gravar `status='accepted'` num perfil privado e furar a aprovação —
   este é justamente o vetor da seção 25. O route handler não é a única linha de defesa.

4. **RLS — habilitar e forçar** (`enable` + `force row level security`) em
   `follows`; conferir que `profiles` já está com RLS na T0. Policies (com
   `(select auth.uid())` envelopado, por performance):
   - `profiles` SELECT → `to authenticated using (true)`: dados básicos (nome,
     username, avatar, bio) são visíveis mesmo em perfil privado. A privacidade
     recai sobre as **publicações** (`trip_posts`, atividade posterior), não sobre o perfil.
   - `profiles` UPDATE → `using ((select auth.uid()) = id) with check ((select auth.uid()) = id)`.
   - `follows` SELECT → `using (status = 'accepted' or (select auth.uid()) in (follower_id, followee_id))`:
     listas de seguidores/seguindo são públicas (RF09.6); solicitações **pendentes**
     só o solicitante e o dono veem (RF09.3).
   - `follows` INSERT → `with check ((select auth.uid()) = follower_id)`: só dá
     para criar vínculo em nome de si mesmo. O `status` correto quem impõe é o trigger.
   - `follows` UPDATE → `using ((select auth.uid()) = followee_id) with check (status = 'accepted')`:
     só o dono aprova (pendente→aceito) — RF09.4. **Importante:** restringir UPDATE a `status`/`updated_at` (REVOKE/GRANT), para evitar alteração de `follower_id`/`followee_id` via UPDATE.
   - `follows` DELETE → `using ((select auth.uid()) in (follower_id, followee_id))`:
     cobre deixar de seguir e cancelar (follower), e recusar e remover seguidor
     (followee) — RF09.5 e RF09.9.

5. **Índices.**
   - `create index follows_followee_id_idx on public.follows (followee_id)` — a PK
     só cobre buscas por `follower_id` (coluna à esquerda); precisamos de "quem me
     segue / minhas solicitações", que filtram por `followee_id`. Também é o índice
     de FK exigido pela best practice.
   - `create index follows_pendentes_idx on public.follows (followee_id) where status = 'pending'`
     — índice parcial para a Zona 1 da Central de Notificações (RF13.2).

6. **Tipos.** Rodar `npm run db:types` e commitar `types/database.ts` junto da migration.

7. **Seed.** Dar `username` aos dois usuários e deixar um público e um privado,
   para os testes de RLS terem os quatro casos (público×privado × A×B).

8. **Testes de RLS** em `tests/rls/social.test.ts` — ver bloco 4. Só entram em
   verde quando a T0 permitir aplicar as migrations do zero.

## 4. O que testar

Obrigatórios pelo tipo (`migration, rls`):

- [ ] Aplicação limpa do zero: `npm run db:reset` sobe sem erro
- [ ] Teste em `tests/rls/` com os dois usuários do seed
- [ ] Usuário A não le E não escreve dados de B
- [ ] `npm run test:rls` verde

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. `npm run db:reset` → esperado: aplica todas as migrations e o seed sem erro; a
   app sobe (`npm run dev`).
2. No Studio (http://localhost:54323), como usuário A, `insert into follows
   (follower_id, followee_id) values (A, B)` sendo B **público** → esperado: linha
   criada com `status = 'accepted'` (trigger).
3. Repetir o mesmo INSERT → esperado: sem linha nova nem erro que quebre o fluxo
   (idempotência pela PK composta).
4. Como usuário A, seguir um C **privado** → esperado: `status = 'pending'`, mesmo
   que o INSERT tente forçar `'accepted'` (o trigger sobrepõe).
5. Como usuário B, tentar `insert into follows` com `follower_id = A` (forjando
   outro solicitante) → esperado: bloqueado pela RLS (`with check` de INSERT).
6. Como usuário A, tentar `update follows set username`/aprovar uma solicitação de
   que A **não** é o `followee` → esperado: 0 linhas afetadas (RLS de UPDATE).
7. Definir `username` duplicado em dois perfis → esperado: erro de unicidade;
   `username` fora de `^[a-z0-9_]{3,30}$` → esperado: erro de check.

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [ ] username e único e validado
- [ ] Perfil privado não vaza nem o nome em listagem
- [ ] Toda tabela nova tem RLS habilitada e policy por operação usada
- [ ] Nome do arquivo segue `<timestamp>_<dominio>_<descrição>.sql`
- [ ] `npm run db:types` rodado e `types/database.ts` commitado junto
- [ ] SELECT vazio não e aceito como prova: INSERT tambem e testado
- [ ] Policy usa participação (trip_members), não propriedade (user_id)

## 6. Evidência

- [ ] Saida dos testes
- [ ] Screenshot ou gravação do fluxo (se houver tela)
- [ ] Delta de cobertura (se mexeu em `lib/`)
