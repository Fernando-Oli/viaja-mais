-- S14-F-marcacao-privada — fecha duas ressalvas da revisão de segurança do
-- PR #51 (22/11/2026), consequências da marcação aberta a qualquer perfil
-- (20261118174100_social_posts, seção 7.2):
--
--   1. A recusa era por viagem ou por post. Quem removeu a marca de uma autora
--      voltava a ser marcado por ela num post novo sem viagem. Agora a recusa
--      vale por (autora, pessoa), em qualquer post: é o "não deixar @fulana me
--      marcar". As colunas trip_id e post_id continuam dizendo onde a recusa
--      nasceu, mas ela não morre mais com o post nem com a viagem — senão a
--      autora a apagaria apagando o próprio post (seção 1).
--
--   2. Um estranho marcava uma pessoa privada em post público, e qualquer
--      autenticado lia a ligação, também pela lista agregada da Data API
--      (post_tags?tagged_id=eq.X). Agora:
--        a) perfil privado só é marcado por quem ele segue (follow aceito) ou,
--           no post de viagem, por colega daquela viagem — o vínculo é uma
--           escolha da pessoa privada;
--        b) a marca de pessoa privada só aparece para ela, para a autora e
--           para quem pode ver a rede dela (pode_ver_rede). Defesa em
--           profundidade para as marcas que (a) permite.
--
-- Substitui o "limite aceito" de 20261116234030 (seção 4, comentário de
-- post_tags_select). Risco residual, documentado na seção 25: marcação em
-- massa de perfis PÚBLICOS pela Data API, com sessão válida, criando muitos
-- posts — limitada pelos 20 por post e pela recusa de cada pessoa.
--
-- @RF09.13 @RF09.14 @RNF02.4


-- ---------------------------------------------------------------------------
-- 1. A recusa passa a ser uma por (autora, pessoa) e a sobreviver ao post
-- ---------------------------------------------------------------------------
-- Se a recusa morresse com o post ou com a viagem (como era, em cascata), a
-- autora a apagaria apagando o próprio post, e marcaria a pessoa de novo num
-- post novo. Agora:
--   - trip_id e post_id ficam como registro de onde a recusa nasceu, e viram
--     nulos quando a viagem ou o post somem (set null), em vez de levar a
--     recusa junto;
--   - por isso o CHECK aceita nenhum dos dois (mas continua recusando os dois);
--   - uma recusa por (autora, pessoa): a segunda remoção, em outro post, cai no
--     `on conflict do nothing` do trigger social_gravar_recusa_de_marcacao.
-- Apagar a conta da autora ou da pessoa continua levando a recusa (cascata das
-- FKs de author_id e tagged_id, que não mudam).

-- Antes do índice único: se já houver mais de uma recusa do mesmo par (por
-- viagens ou posts diferentes), fica a mais antiga.
delete from public.post_tag_recusas r
 using public.post_tag_recusas mais_antiga
 where mais_antiga.author_id = r.author_id
   and mais_antiga.tagged_id = r.tagged_id
   and mais_antiga.id < r.id;

-- Cobre também a FK de author_id, então o índice de coluna única sai.
create unique index post_tag_recusas_autor_marcado_key
  on public.post_tag_recusas (author_id, tagged_id);

drop index public.post_tag_recusas_author_id_idx;

alter table public.post_tag_recusas
  drop constraint post_tag_recusas_trip_id_fkey,
  add constraint post_tag_recusas_trip_id_fkey
    foreign key (trip_id) references public.trips (id) on delete set null,
  drop constraint post_tag_recusas_post_id_fkey,
  add constraint post_tag_recusas_post_id_fkey
    foreign key (post_id) references public.posts (id) on delete set null,
  drop constraint post_tag_recusas_viagem_ou_post,
  add constraint post_tag_recusas_viagem_ou_post
    check (num_nonnulls(trip_id, post_id) <= 1);


-- ---------------------------------------------------------------------------
-- 2. Quem pode marcar quem
-- ---------------------------------------------------------------------------
-- Verdadeiro se:
--   - a sessão é a autora do post (nunca responde sobre post alheio);
--   - no post de viagem, a autora ainda participa dela;
--   - o marcado é outra pessoa, com username;
--   - o marcado é público, OU segue a autora (aceito), OU é colega da viagem
--     do post;
--   - o marcado nunca recusou uma marca desta autora, em post nenhum.
--
-- O que ela revela além do que já revelava: se X segue a autora — que a
-- autora já lê nos próprios seguidores — e se X é colega da viagem dela, que
-- ela já lê em trip_members. Continua só sobre a sessão.
create or replace function public.social_pode_marcar(post uuid, marcado uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.posts p
      join public.profiles perfil
        on perfil.id = marcado
       and perfil.username is not null
     where p.id = post
       and p.author_id = (select auth.uid())
       and marcado <> p.author_id
       and (
         p.trip_id is null
         or exists (
           select 1
             from public.trip_members eu
            where eu.trip_id = p.trip_id
              and eu.user_id = (select auth.uid())
         )
       )
       and (
         perfil.is_public
         or exists (
           select 1
             from public.follows f
            where f.follower_id = marcado
              and f.followee_id = p.author_id
              and f.status = 'accepted'
         )
         or (
           p.trip_id is not null
           and exists (
             select 1
               from public.trip_members colega
              where colega.trip_id = p.trip_id
                and colega.user_id = marcado
           )
         )
       )
       and not exists (
         select 1
           from public.post_tag_recusas r
          where r.author_id = p.author_id
            and r.tagged_id = marcado
       )
  );
$$;

comment on function public.social_pode_marcar(uuid, uuid) is
  'Verdadeiro se a sessão é autora do post (e, no post de viagem, ainda participa dela) e o marcado é outra pessoa com username, pública ou com vínculo (segue a autora ou é colega da viagem), que nunca recusou marca desta autora (RF09.13, RF09.14). Nunca responde sobre post de outra pessoa.';


-- ---------------------------------------------------------------------------
-- 3. As leituras de recusa acompanham a regra
-- ---------------------------------------------------------------------------
-- A rota confere as recusas antes de gravar (lib/social/marcacoes.ts,
-- conferirRecusas) para responder 400 marcado_recusou em vez de 42501. As
-- duas funções continuam com a mesma assinatura e passam a devolver todas as
-- recusas da autora da sessão — assim a rota não muda.
create or replace function public.social_recusas_do_post(post uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct r.tagged_id
    from public.posts p
    join public.post_tag_recusas r
      on r.author_id = p.author_id
   where p.id = post
     and p.author_id = (select auth.uid());
$$;

comment on function public.social_recusas_do_post(uuid) is
  'Ids de quem não pode ser marcado pela sessão porque já removeu uma marca dela, em qualquer post (RF09.13, RF09.14). Vazio para quem não é a autora do post.';

create or replace function public.social_recusas_da_viagem(viagem uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct r.tagged_id
    from public.post_tag_recusas r
   where r.author_id = (select auth.uid())
     and exists (
       select 1
         from public.trip_members eu
        where eu.trip_id = viagem
          and eu.user_id = (select auth.uid())
     );
$$;

comment on function public.social_recusas_da_viagem(uuid) is
  'Ids de quem não pode ser marcado pela sessão porque já removeu uma marca dela, em qualquer post (RF09.13, RF09.14). Vazio para quem não é membro da viagem.';

-- CREATE OR REPLACE mantém o ACL; os revokes repetidos só documentam.
revoke all on function public.social_pode_marcar(uuid, uuid) from public, anon;
revoke all on function public.social_recusas_do_post(uuid) from public, anon;
revoke all on function public.social_recusas_da_viagem(uuid) from public, anon;


-- ---------------------------------------------------------------------------
-- 4. Quem lê a marca de uma pessoa privada
-- ---------------------------------------------------------------------------
-- Antes: quem enxergasse o post lia todas as marcas dele. Agora a marca só
-- aparece a quem enxerga o post E pode ver a rede da pessoa marcada (ela é
-- pública, ou é seguida com aceite). A pessoa marcada e a autora continuam
-- lendo sempre. O exists roda com a RLS de posts.
drop policy post_tags_select on public.post_tags;

create policy post_tags_select on public.post_tags
  for select to authenticated
  using (
    (select auth.uid()) = tagged_id
    or (select auth.uid()) = author_id
    or (
      exists (select 1 from public.posts p where p.id = post_id)
      and public.pode_ver_rede(tagged_id)
    )
  );
