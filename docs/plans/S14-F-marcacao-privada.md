---
id: S14-F-marcacao-privada
titulo: Recusa de marcação por pessoa e marcação de perfil privado só com vínculo
trilha: T1
responsavel: fernando
revisor: audrey
semana: S14
requisitos: [RF09.13, RF09.14, RNF02.4]
secoes_doc: [25]
branch: fix/S14-F-marcacao-privada
tipo: [migration, rls, seguranca]
depende_de: [S06-M-publicar-viagem]
status: concluido
---

## 1. Contexto

A revisão de segurança do PR #51 (22/11) achou duas consequências da marcação
aberta a qualquer perfil (`20261118174100_social_posts.sql`):

1. **A recusa é contornável.** B remove a marca que A pôs no post da viagem T;
   A cria um post só de fotos e marca B de novo — a recusa valia só para T.
   No post sem viagem, a recusa vale só para aquele post.
2. **Um estranho marca uma pessoa privada em post público**, e qualquer
   autenticado lê a ligação, inclusive a lista agregada pela Data API
   (`post_tags?tagged_id=eq.X`). O risco tinha sido aceito quando só colegas de
   viagem podiam marcar.

## 2. Arquivos afetados

- `supabase/migrations/20261122130000_social_marcacao_privada.sql` — nova
- `tests/rls/17-post-tags.test.ts` — testes que mudam de expectativa e os novos
- `e2e/fixtures/recusas.ts` — novo; limpa recusas entre contas do seed (só banco local)
- `e2e/marcacoes.spec.ts`, `e2e/posts.spec.ts` — limpam recusas; Bruno (privado) segue a Carla antes de ser marcado

## 3. Passos

1. `social_pode_marcar`: a recusa passa a ser por (autora, pessoa), em qualquer
   post; perfil privado só é marcável por quem ele segue (aceito) ou por colega
   da viagem do post.
2. `social_recusas_do_post` e `social_recusas_da_viagem` devolvem todas as
   recusas da autora da sessão — a rota continua dando 400 `marcado_recusou`
   antes de gravar, sem mudar `lib/`.
3. A recusa sobrevive ao post e à viagem: `trip_id`/`post_id` viram
   `on delete set null` (senão a autora a apagaria apagando o próprio post,
   achado ao rodar o E2E), CHECK aceita nenhum dos dois, e índice único
   `(author_id, tagged_id)` no lugar do `(author_id)`. Os E2E que removem
   marca passam a limpar as recusas do seed (`e2e/fixtures/recusas.ts`).
4. `post_tags_select`: a marca de pessoa privada só aparece para ela, para a
   autora e para quem pode ver a rede dela (`pode_ver_rede`).
5. Testes de RLS com dois usuários provando cada exploração bloqueada.

## 4. O que testar

**Testes automatizados:**

- [ ] `npm run db:reset` aplica todas as migrations do zero
- [ ] RLS: B recusa a marca de A na viagem T → A não marca B num post sem
      viagem, nem em outra viagem (42501)
- [ ] RLS: B recusa a marca de A num post sem viagem → A não marca B em outro post
- [ ] RLS: o estranho, que a pessoa privada não segue, não a marca (42501);
      quem a pessoa privada segue (aceito) marca; o colega de viagem marca no
      post da viagem
- [ ] RLS: quem não segue a pessoa privada não lê a marca dela no post público,
      nem pela lista `tagged_id=eq.X`; a própria pessoa e a autora leem
- [ ] `npm run test:rls`, `npm test` e o E2E do CI verdes

**Roteiro manual:**

1. Como A, publicar post só de fotos marcando B (público) → aparece a marca
2. Como B, remover a marca → some da aba Marcações
3. Como A, criar outro post e tentar marcar B → 400 `marcado_recusou`

## 5. O que validar

- [ ] `INSERT` em `post_tags` com sessão de A, marcando B que já recusou uma
      marca de A em qualquer post, devolve 42501
- [ ] `INSERT` em `post_tags` marcando perfil privado que não segue A e não é
      colega da viagem do post devolve 42501
- [ ] `GET /rest/v1/post_tags?tagged_id=eq.<privada>` com sessão de quem não a
      segue devolve lista vazia, mesmo vendo o post público
- [ ] As funções novas/recriadas mantêm `set search_path = ''` e sem EXECUTE para `anon`
- [ ] Risco residual (marcação em massa pela Data API) registrado na seção 25

## 6. Evidência

- [ ] Saída de `npm run test:rls`
- [ ] Saída de `npm run db:reset`
