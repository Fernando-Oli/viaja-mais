-- Dados de desenvolvimento local. Rodam a cada `npm run db:reset`.
--
-- Nada aqui vai para produção. Todo dado é fictício, de propósito: o banco de
-- desenvolvimento não pode conter e-mail, nome ou telefone de pessoa real —
-- é dado pessoal de terceiro num ambiente sem os controles de produção.
--
-- Os quatro usuários de teste (Ana, Bruno, Carla e Davi) NÃO são criados aqui.
-- A senha precisa do hash do Better Auth (scrypt), que o SQL não sabe calcular;
-- quem os cria é `scripts/db/semear.mjs`, antes de rodar este arquivo, com os
-- ids e e-mails de `tests/fixtures/usuarios.ts`.

-- ---------------------------------------------------------------------------
-- Perfis sociais dos usuários de teste
--
-- Os perfis nascem pelo trigger handle_new_user quando semear.mjs grava em
-- auth.users. Aqui damos a eles username, bio e visibilidade, com um público e um privado de propósito:
-- metade do valor da suíte de RLS está em provar a diferença entre os dois.
--   Ana   → público  (seguir a Ana tem efeito imediato)
--   Bruno → privado  (seguir o Bruno vira solicitação pendente)
--   Carla → público  (terceiro observador)
--   Davi  → público  (só dos E2E de perfil, que o editam e o restauram)
-- ---------------------------------------------------------------------------

update public.profiles
   set username = 'ana', is_public = true, bio = 'Viajante de teste — perfil público.'
 where id = '11111111-1111-4111-8111-111111111111';

update public.profiles
   set username = 'bruno', is_public = false, bio = 'Viajante de teste — perfil privado.'
 where id = '22222222-2222-4222-8222-222222222222';

update public.profiles
   set username = 'carla', is_public = true, bio = 'Viajante de teste — terceiro observador.'
 where id = '33333333-3333-4333-8333-333333333333';

update public.profiles
   set username = 'davi', is_public = true, bio = 'Viajante de teste — usado pelo E2E de perfil.'
 where id = '44444444-4444-4444-8444-444444444444';

-- ---------------------------------------------------------------------------
-- Fixtures de domínio (viagens, despesas, itinerário)
--
-- Nenhuma por enquanto: cada teste cria as viagens de que precisa e as apaga.
-- ---------------------------------------------------------------------------
