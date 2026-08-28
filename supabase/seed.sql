-- Dados de desenvolvimento local. Rodam a cada `npm run db:reset`.
--
-- Nada aqui vai para produção. Todo dado é fictício, de propósito: o banco de
-- desenvolvimento não pode conter e-mail, nome ou telefone de pessoa real —
-- é dado pessoal de terceiro num ambiente sem os controles de produção.

-- ---------------------------------------------------------------------------
-- Dois usuários de teste.
--
-- São dois, e não um, porque metade do valor da suíte está em provar que o
-- usuário B *não* enxerga o que é do A. Teste de RLS com um usuário só não
-- prova isolamento nenhum.
--
-- As senhas são fixas e públicas — só existem no ambiente local, e estarem no
-- repositório é o que permite que E2E e testes de RLS rodem sem configuração.
-- ---------------------------------------------------------------------------

-- Ana Teste — usuária A
-- id: 11111111-1111-4111-8111-111111111111 / senha: viajamais123
-- Bruno Teste — usuário B
-- id: 22222222-2222-4222-8222-222222222222 / senha: viajamais123

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
-- Fixtures de domínio (viagens, despesas, itinerário)
--
-- Entram assim que o schema estiver versionado em supabase/migrations/.
-- Enquanto a pasta estiver vazia não há tabela para popular — ver
-- supabase/README.md.
-- ---------------------------------------------------------------------------
