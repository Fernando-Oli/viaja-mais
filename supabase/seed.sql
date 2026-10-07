-- Dados de desenvolvimento local. Rodam a cada `npm run db:reset`.
--
-- Nada aqui vai para produção. Todo dado é fictício, de propósito: o banco de
-- desenvolvimento não pode conter e-mail, nome ou telefone de pessoa real —
-- é dado pessoal de terceiro num ambiente sem os controles de produção.

-- ---------------------------------------------------------------------------
-- Quatro usuários de teste.
--
-- São pelo menos dois, e não um, porque metade do valor da suíte está em
-- provar que o usuário B *não* enxerga o que é do A. Teste de RLS com um
-- usuário só não prova isolamento nenhum. A terceira existe por causa do
-- social: uma solicitação de seguir tem dois lados, e provar que ela não vaza
-- exige alguém que não é nenhum deles. O quarto é dos E2E de perfil, que
-- editam o próprio perfil e a senha: com usuário só deles, um E2E
-- interrompido no meio não quebra os testes de RLS, que contam com Ana, Bruno
-- e Carla exatamente como o seed os deixa.
--
-- As senhas são fixas e públicas — só existem no ambiente local, e estarem no
-- repositório é o que permite que E2E e testes de RLS rodem sem configuração.
-- ---------------------------------------------------------------------------

-- Ana Teste — usuária A
-- id: 11111111-1111-4111-8111-111111111111 / senha: viajamais123
-- Bruno Teste — usuário B
-- id: 22222222-2222-4222-8222-222222222222 / senha: viajamais123
-- Carla Teste — usuária C (terceiro, para provar que quem não é parte de uma
-- solicitação pendente não a enxerga — RF09.3)
-- id: 33333333-3333-4333-8333-333333333333 / senha: viajamais123
-- Davi Teste — usuário D (reservado aos E2E de perfil e senha)
-- id: 44444444-4444-4444-8444-444444444444 / senha: viajamais123

do $$
declare
  usuarios jsonb := jsonb_build_array(
    jsonb_build_object(
      'id',    '11111111-1111-4111-8111-111111111111',
      'email', 'teste.a@viajamais.local',
      'nome',  'Ana Teste'
    ),
    jsonb_build_object(
      'id',    '22222222-2222-4222-8222-222222222222',
      'email', 'teste.b@viajamais.local',
      'nome',  'Bruno Teste'
    ),
    jsonb_build_object(
      'id',    '33333333-3333-4333-8333-333333333333',
      'email', 'teste.c@viajamais.local',
      'nome',  'Carla Teste'
    ),
    jsonb_build_object(
      'id',    '44444444-4444-4444-8444-444444444444',
      'email', 'teste.d@viajamais.local',
      'nome',  'Davi Teste'
    )
  );
  u jsonb;
  uid uuid;
begin
  for u in select * from jsonb_array_elements(usuarios) loop
    uid := (u->>'id')::uuid;

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000',
      uid, 'authenticated', 'authenticated',
      u->>'email',
      extensions.crypt('viajamais123', extensions.gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', u->>'nome'),
      '', '', '', ''
    )
    on conflict (id) do nothing;

    -- Sem a identity correspondente o login por e-mail e senha falha:
    -- o GoTrue procura o provider aqui, não em auth.users.
    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), uid,
      jsonb_build_object('sub', uid::text, 'email', u->>'email', 'email_verified', true),
      'email', uid::text,
      now(), now(), now()
    )
    on conflict (provider, provider_id) do nothing;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Perfis sociais dos usuários de teste
--
-- Os perfis nascem pelo trigger handle_new_user no INSERT acima. Aqui damos a
-- eles username, bio e visibilidade, com um público e um privado de propósito:
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
-- Entram assim que o schema estiver versionado em supabase/migrations/.
-- Enquanto a pasta estiver vazia não há tabela para popular — ver
-- supabase/README.md.
-- ---------------------------------------------------------------------------
