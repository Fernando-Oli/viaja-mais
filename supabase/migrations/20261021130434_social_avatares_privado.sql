-- ===========================================================================
-- social_avatares_privado (S04-M-foto-privada)
-- ===========================================================================
--
-- Nasceu como proposta no plano da atividade (docs/plans/S04-M-foto-privada.md),
-- exercitada pelo teste de RLS e pela mutação, e sobe como migration para passar
-- no CI. Quem decide o merge é a revisão do Fernando: migration e política de
-- acesso são da plataforma.
--
-- Constrói sobre 20261007200000_social_avatares.sql, que criou o bucket público.
-- Aquela migration já está na main e não se edita: esta a corrige para a frente.
--
-- O bucket `avatars` deixa de ser público. A foto de perfil passa a ser lida só
-- por URL assinada, gerada pelo servidor (lib/social/avatar.ts) depois de a rota
-- conferir a sessão: só quem tem login recebe o link, e o link dura 10 minutos.
--
-- Nenhuma policy nova em storage.objects. Gravar, trocar e apagar já eram só da
-- rota, com a chave de serviço; assinar também passa a ser. Uma policy de
-- SELECT para `authenticated` deixaria o usuário assinar com o próprio JWT e
-- escolher a validade do link — um link de meses é um bucket público com outro
-- nome. tests/rls/05-avatares.test.ts prova que o usuário não consegue assinar
-- e que não há policy nenhuma em storage.objects.
--
-- Os limites do bucket (2 MB, JPEG/PNG/WebP) não mudam. `where id` com a chave
-- primária: a atualização é idempotente e não toca outro bucket.

update storage.buckets
   set public = false
 where id = 'avatars';
