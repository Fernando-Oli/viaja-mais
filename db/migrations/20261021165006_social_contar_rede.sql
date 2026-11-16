-- S05-M-seguir: os contadores do perfil, ou seja, quantos seguidores e quantos
-- seguidos aceitos uma pessoa tem.
--
-- PROPOSTA do domínio Social (Micael), no mesmo fluxo da S04: sobe no PR, passa
-- no CI ("Migrations e RLS"), e o merge espera a revisão do Fernando, dono das
-- migrations e das policies.
--
-- Por que uma função, e não a RLS de follows: o perfil de outra pessoa mostra os
-- dois números também em perfil privado (decisão do Micael, S05-M-seguir). Pela
-- RLS, um visitante não enxerga os vínculos de um perfil privado, e a contagem
-- feita com a sessão dele sairia errada. A primeira versão contava com a chave
-- de serviço, que ignora a RLS inteira, e o contrato de lib/supabase/admin.ts a
-- reserva ao GoTrue. A função devolve só os dois números: nenhuma linha, nenhum
-- nome, nenhum id.
--
-- SECURITY DEFINER, no padrão de pode_ver_rede (S03):
--   - search_path vazio e nomes qualificados;
--   - STABLE: só lê;
--   - confere a sessão no corpo. Sem auth.uid(), não devolve linha nenhuma: é a
--     segunda barreira, se um dia o EXECUTE voltar para anon;
--   - EXECUTE só para authenticated. Sai de public E de anon (os default
--     privileges da base dão EXECUTE a anon nominalmente, e o revoke de public
--     não o tira). Sai também de service_role, ao contrário de pode_ver_rede:
--     sem sessão a função não devolve nada, e um grant que não responde só
--     esconderia um erro de quem a chamasse com a chave de serviço.
--
-- Como toda função em public com EXECUTE para authenticated, ela também é
-- alcançável direto pela Data API (/rest/v1/rpc/contar_rede), sem passar por
-- /api/**: um limite de taxa em route handler não a cobre (bloco 6 do plano).
--
-- Os índices já existem: "seguidores" filtra por followee_id
-- (follows_followee_recentes_idx), e "seguindo" por follower_id (a PK).
--
-- @RF02.8 @RNF02.4

create or replace function public.contar_rede(perfil uuid)
returns table (seguidores bigint, seguindo bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.follows f
      where f.followee_id = perfil and f.status = 'accepted'),
    (select count(*) from public.follows f
      where f.follower_id = perfil and f.status = 'accepted')
  where (select auth.uid()) is not null;
$$;

comment on function public.contar_rede(uuid) is
  'Quantos seguidores e seguidos aceitos o perfil tem. Só os dois números, e só para quem tem sessão (RF02.8).';

revoke all on function public.contar_rede(uuid) from public, anon, service_role;
grant execute on function public.contar_rede(uuid) to authenticated;
