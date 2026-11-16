-- S05-M-listas: só entra na rede quem tem username, e quem tem não volta a
-- ficar sem (achado I1 da revisão independente; decisão do Micael em 10/11,
-- como no Instagram).
--
-- PROPOSTA do domínio Social (Micael), no mesmo fluxo da S04: sobe no PR, passa
-- no CI ("Migrations e RLS"), e o merge espera a revisão do Fernando, dono das
-- migrations e das policies.
--
-- O defeito. As listas de seguidores e de seguindo só mostram quem tem username,
-- porque sem ele a pessoa não tem página nem endereço (/u/<username>). Toda conta
-- nova nasce com username nulo (handle_new_user), e nada impedia:
--   - uma conta sem username de seguir alguém, pela rota ou pela Data API;
--   - um seguidor aceito de zerar o próprio username pela Data API (o grant de
--     UPDATE em username existe para a edição do perfil, e o check de formato
--     aceita nulo).
-- Nos dois casos o seguidor ficava invisível na lista do dono, a rota de remover
-- seguidor não o achava (ela procura pelo username), e ele continuava vendo a
-- rede do dono (pode_ver_rede). O contador, que vem da contar_rede, contava essa
-- pessoa: "1 seguidor" com a lista vazia.
--
-- O que esta migration faz, idempotente (pode rodar de novo, e o teste do legado
-- a roda dentro de uma transação desfeita):
--
--   1. follows_insert passa a exigir username nas DUAS pontas. Ninguém segue sem
--      username, e ninguém segue uma conta sem username (que também não tem
--      página para ser vista). As subconsultas filtram profiles pelo id, que é a
--      PK (com a tabela local pequena, o planejador prefere o índice de
--      username; a PK aparece quando o custo a favorece: evidência S05-M-listas-
--      explain). A policy de SELECT de profiles já deixa qualquer autenticado
--      ler os dados básicos.
--      `(select auth.uid())` fica dentro de select, para ser avaliado uma vez.
--
--   2. Trigger BEFORE UPDATE OF username em profiles: um username que já existe
--      não volta a nulo. É trigger, e não check, porque a regra compara o valor
--      antigo com o novo. Vale para qualquer escritor, também a chave de serviço
--      e o SQL direto. Erro 23514 (check_violation), com o nome de restrição
--      `profiles_username_nao_volta_a_nulo`. A primeira escolha (de nulo para um
--      nome) e a troca por outro nome continuam livres. A rota /api/social/perfil
--      já recusa username vazio (zod), e a tela também; isto fecha a Data API.
--
--   3. contar_rede conta só vínculos em que a outra ponta tem username, a mesma
--      regra das listas: o contador volta a ser o número de pessoas da lista.
--      Mesma assinatura e mesmos grants da migration 20261021165006.
--
--   4. Legado: os vínculos (pendentes ou aceitos) em que uma das pontas não tem
--      username saem. É a remoção silenciosa que o RF09.9 já prevê: ninguém é
--      avisado, e a pessoa pode voltar a seguir depois de escolher um username.
--      No banco local, em 10/11, eram 0 de 92 vínculos. Para o Fernando: conferir
--      a contagem no projeto hospedado antes do merge, com
--        select count(*) from public.follows f
--         where exists (select 1 from public.profiles p
--                        where p.id in (f.follower_id, f.followee_id) and p.username is null);
--
-- Fica de fora, de propósito: quem grava em follows sem RLS (a chave de serviço,
-- o seed) não passa pela policy. A aplicação não grava em follows com a chave de
-- serviço; se um dia gravar, a regra precisa ir para um trigger em follows.
--
-- @RF09.9 @RF09.6 @RF02.5 @RNF02.4


-- ---------------------------------------------------------------------------
-- 1. follows_insert: username nas duas pontas
-- ---------------------------------------------------------------------------
drop policy if exists follows_insert on public.follows;
create policy follows_insert on public.follows
  for insert to authenticated
  with check (
    (select auth.uid()) = follower_id
    and exists (select 1 from public.profiles p where p.id = follower_id and p.username is not null)
    and exists (select 1 from public.profiles p where p.id = followee_id and p.username is not null)
  );


-- ---------------------------------------------------------------------------
-- 2. profiles: um username que já existe não volta a nulo
-- ---------------------------------------------------------------------------
create or replace function public.social_username_nao_volta_a_nulo()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.username is not null and new.username is null then
    raise exception 'o nome de usuário pode ser trocado, mas não apagado'
      using errcode = 'check_violation',
            constraint = 'profiles_username_nao_volta_a_nulo';
  end if;
  return new;
end;
$$;

comment on function public.social_username_nao_volta_a_nulo() is
  'Trigger BEFORE UPDATE OF username: quem já tem username não volta a ficar sem (S05-M-listas, I1).';

-- Higiene, como em follows_definir_estado_inicial: uma função `returns trigger`
-- não é chamada fora de um trigger, e o Postgres não checa EXECUTE ao dispará-la.
revoke execute on function public.social_username_nao_volta_a_nulo() from public, anon, authenticated;

drop trigger if exists profiles_username_nao_volta_a_nulo on public.profiles;
create trigger profiles_username_nao_volta_a_nulo
  before update of username on public.profiles
  for each row execute function public.social_username_nao_volta_a_nulo();


-- ---------------------------------------------------------------------------
-- 3. contar_rede: só vínculos em que a outra ponta tem username
-- ---------------------------------------------------------------------------
create or replace function public.contar_rede(perfil uuid)
returns table (seguidores bigint, seguindo bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.follows f
       join public.profiles p on p.id = f.follower_id
      where f.followee_id = perfil and f.status = 'accepted' and p.username is not null),
    (select count(*) from public.follows f
       join public.profiles p on p.id = f.followee_id
      where f.follower_id = perfil and f.status = 'accepted' and p.username is not null)
  where (select auth.uid()) is not null;
$$;

comment on function public.contar_rede(uuid) is
  'Quantos seguidores e seguidos aceitos, com username, o perfil tem: o mesmo número das listas. Só os dois números, e só para quem tem sessão (RF02.8, RF09.6).';

revoke all on function public.contar_rede(uuid) from public, anon, service_role;
grant execute on function public.contar_rede(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- 4. Legado: vínculos com uma ponta sem username saem
-- ---------------------------------------------------------------------------
delete from public.follows f
 where exists (
   select 1 from public.profiles p
    where p.id in (f.follower_id, f.followee_id)
      and p.username is null
 );
