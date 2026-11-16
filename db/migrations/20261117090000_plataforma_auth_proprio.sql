-- Autenticação própria: o perfil nasce do usuário do Better Auth.
--
-- Até aqui, quem gravava em auth.users era o GoTrue do Supabase, e o nome
-- digitado no cadastro chegava em `raw_user_meta_data ->> 'full_name'`. O Better
-- Auth grava o nome direto na coluna `auth.users.name` (db/init/03-auth.sql), e
-- `raw_user_meta_data` não existe mais.
--
-- Só a origem do nome muda. O gatilho `on_auth_user_created`, criado na
-- migration base, continua apontando para esta função; o corte em 120
-- caracteres e o `on conflict do nothing` continuam, pelos motivos registrados
-- em 20261014230500_plataforma_membros_por_convite_e_cadastro.sql.
--
-- Não há policy nova: a função é SECURITY DEFINER porque grava em
-- public.profiles a partir de um INSERT feito por app_auth, que não tem
-- privilégio nenhum em public.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, left(coalesce(new.name, ''), 120))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Função de gatilho não é chamada por ninguém diretamente.
revoke all on function public.handle_new_user() from public, anon, authenticated;
