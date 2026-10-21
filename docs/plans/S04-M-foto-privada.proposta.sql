-- ===========================================================================
-- PROPOSTA (S04-M-foto-privada) — não é migration. Aplicar só em banco local,
-- para os testes, até o aval do Fernando:
--
--   docker exec -i supabase_db_viaja-mais psql -U postgres < docs/plans/S04-M-foto-privada.proposta.sql
--
-- Com o aval, vira uma migration NOVA (`npx supabase migration new
-- social_avatares_privado`): a 20261007200000_social_avatares.sql já está na
-- main e não se edita.
-- ===========================================================================
--
-- O bucket `avatars` deixa de ser público. A foto de perfil passa a ser lida só
-- por URL assinada, gerada pelo servidor (lib/social/avatar.ts) depois de a rota
-- conferir a sessão: só quem tem login recebe o link, e o link dura 10 minutos.
--
-- Nenhuma policy nova em storage.objects. Gravar, trocar e apagar já eram só da
-- rota, com a chave de serviço; assinar também passa a ser. Uma policy de
-- SELECT para `authenticated` deixaria o usuário assinar com o próprio JWT e
-- escolher a validade do link — um link de meses é um bucket público com outro
-- nome. tests/rls/05-avatares.test.ts prova que o usuário não consegue assinar.
--
-- Os limites do bucket (2 MB, JPEG/PNG/WebP) não mudam. `where id` com a chave
-- primária: a atualização é idempotente e não toca outro bucket.

update storage.buckets
   set public = false
 where id = 'avatars';
