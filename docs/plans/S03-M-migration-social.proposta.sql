-- PROPOSTA DE MIGRATION — S03-M-migration-social
--
-- Isto NÃO é uma migration: fica em docs/plans/ e não é aplicado por
-- `db:reset`. Migration e RLS são do Fernando (CLAUDE.md); este arquivo é a
-- especificação executável do que o domínio Social precisa, já exercitada
-- localmente por tests/rls/04-social.test.ts. A versão final, o nome
-- (<timestamp>_social_perfil_e_follows.sql) e o `npm run db:types` são dele.
--
-- PRÉ-REQUISITO DA PLATAFORMA (bloqueante, fora deste arquivo): abrir a
-- leitura de `profiles` torna os UUIDs enumeráveis, e duas peças da base
-- contavam com eles secretos — `trip_members_insert` deixa o dono adicionar
-- qualquer usuário sem convite, e `is_trip_member`/`is_trip_owner`/
-- `can_access_trip` respondem a anon via RPC sobre terceiros. Ver o plano,
-- seção "Pré-requisito da plataforma", e a reprodução em
-- docs/pfc/evidencias/S03-M-achado-plataforma.txt. Esta proposta não deve
-- entrar antes dessa correção, ou junto dela.
--
-- Constrói sobre a base da plataforma (20260910000333_plataforma_schema_base):
-- `profiles` já existe, criada no signup pelo trigger handle_new_user. Aqui ela
-- ganha as colunas de rede social, e entra a tabela `follows`.
--
-- A RLS é a fronteira real: os três clientes Supabase da app usam a chave anon,
-- então o que a policy não bloquear, qualquer autenticado alcança. Seguindo o
-- guia da Supabase, `auth.uid()` vai envolvido em `(select ...)` para ser
-- avaliado uma vez por consulta, não uma vez por linha.
--
-- @RF02.5 username · @RF02.6 bio · @RF02.7 público/privado
-- @RF09.1 @RF09.2 @RF09.3 @RF09.4 @RF09.5 @RF09.6 @RF09.9 seguir/aprovar/remover
-- @RNF02.4 isolamento


-- ---------------------------------------------------------------------------
-- 1. profiles — colunas de rede social
-- ---------------------------------------------------------------------------
-- O username guardado é sempre minúsculo: o check de formato roda sobre o
-- texto (case-sensitive) e só aceita [a-z0-9_]. O citext não está aqui pela
-- unicidade — o check já a garante —, e sim pela busca: `/u/Ana` encontra
-- `ana` com um `where username = 'Ana'` simples, sem lower() nas rotas nem
-- índice funcional. Cuidado: comparar com um parâmetro tipado como text
-- (`$1::text`, ou argumento text de função SQL) vira `text = text` e perde
-- isso; o PostgREST manda literal sem tipo, que vira citext.
create extension if not exists citext with schema extensions;

alter table public.profiles
  add column if not exists username extensions.citext,
  add column if not exists bio text,
  -- default false primeiro: as contas que já existem ficam PRIVADAS. Quem se
  -- cadastrou só para planejar viagem não consentiu em ser descoberto e
  -- seguido com efeito imediato (privacidade por padrão — seção 25).
  add column if not exists is_public boolean not null default false;

-- ...e só então o default vira true, para as contas criadas daqui em diante
-- (produto de descoberta). Trocar o default é só metadado: não reescreve a
-- tabela nem toca nas linhas existentes.
alter table public.profiles alter column is_public set default true;

-- Constraints protegidas pelo nome, como a migration do rateio faz com a de
-- split_type: se a coluna já existir por drift (Studio + db:diff), a
-- constraint entra do mesmo jeito em vez de ser pulada junto com a coluna.
--
-- Usernames reservados ficam no banco, e não só na rota: o grant de UPDATE em
-- username deixa qualquer autenticado gravar direto pelo PostgREST, com o JWT
-- que está no navegador. Recusa os nomes que imitam a equipe ou se confundem
-- com caminhos da aplicação, e qualquer nome que contenha a marca
-- (`suporte_viajamais`, `viajamais_oficial`). A lista espelha
-- USERNAMES_RESERVADOS em lib/schemas/perfil.ts (S04), que dá a mensagem
-- legível antes de chegar aqui. Entra válida: a coluna é nova e nula em todas
-- as contas antigas.
--
-- full_name e avatar_url passaram a ser lidos por qualquer autenticado. O nome
-- ganha teto de tamanho, `not valid` para não exigir que as contas antigas já
-- obedeçam — vale para toda escrita nova; validar depois de conferir os dados
-- com `alter table public.profiles validate constraint profiles_full_name_tamanho`.
-- avatar_url fica sem check no banco de propósito: com `not valid`, uma conta
-- antiga com URL fora do padrão não conseguiria mais editar nem a bio. A
-- validação dele é do route handler (S04). Risco aceito, registrado no plano:
-- a imagem é carregada pelo navegador de quem vê (next.config usa
-- `images.unoptimized` e o cabeçalho usa <img>), então o host escolhido pelo
-- dono do perfil recebe o IP de quem o visita.
do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'profiles_username_key' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_username_key unique (username);
  end if;

  if not exists (select 1 from pg_constraint
                 where conname = 'profiles_username_formato' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_username_formato
      check ((username::text) ~ '^[a-z0-9_]{3,30}$');
  end if;

  if not exists (select 1 from pg_constraint
                 where conname = 'profiles_username_reservado' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_username_reservado
      check (
        (username::text) not in (
          'admin', 'administrador', 'ajuda', 'api', 'auth', 'configuracoes', 'dashboard',
          'equipe', 'feed', 'perfil', 'root', 'settings', 'sistema', 'suporte'
        )
        and (username::text) !~ 'viajamais'
      );
  end if;

  if not exists (select 1 from pg_constraint
                 where conname = 'profiles_bio_tamanho' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_bio_tamanho
      check (char_length(bio) <= 280);
  end if;

  if not exists (select 1 from pg_constraint
                 where conname = 'profiles_full_name_tamanho' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_full_name_tamanho
      check (char_length(full_name) <= 120) not valid;
  end if;
end $$;

comment on column public.profiles.username is 'Nome de usuário único, sempre minúsculo; citext para busca sem distinção de maiúsculas (RF02.5).';
comment on column public.profiles.is_public is 'Perfil público: publicações e rede visíveis a qualquer autenticado. Privado: só a seguidores aceitos (RF02.7). Contas anteriores ao social nascem privadas.';


-- ---------------------------------------------------------------------------
-- 2. updated_at mantido pelo servidor
-- ---------------------------------------------------------------------------
-- Uma função para as duas tabelas. Em profiles, a rota antiga
-- /api/profile/update manda updated_at; com o trigger, o valor que vier é
-- ignorado.
-- Prefixo social_ porque só as tabelas deste domínio a usam: uma utilitária
-- genérica para o schema inteiro seria decisão da plataforma.
create or replace function public.social_definir_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.social_definir_updated_at() is
  'Trigger BEFORE UPDATE: updated_at é sempre o horário do servidor.';

drop trigger if exists profiles_definir_updated_at on public.profiles;
create trigger profiles_definir_updated_at
  before update on public.profiles
  for each row execute function public.social_definir_updated_at();


-- ---------------------------------------------------------------------------
-- 3. profiles — policies
-- ---------------------------------------------------------------------------
-- Leitura. A base só tinha "Users can view their own profile" (SELECT USING
-- id = uid): ninguém via o perfil de ninguém, o que inviabiliza descoberta e o
-- /u/[username].
--
-- A policy nova NÃO é o mesmo `USING (true)` que o fix de isolamento removeu
-- de `trips`. Lá era bug: viagem é dado privado. Aqui é requisito (RF02,
-- detalhamento da seção 14): nome, username, avatar e bio são visíveis mesmo
-- em perfil privado — a privacidade recai sobre as publicações (trip_posts,
-- S06) e sobre a rede (follows, seção 7 abaixo). `profiles` não guarda e-mail
-- nem dado sensível, e tests/rls/04-social.test.ts trava a lista de colunas:
-- uma coluna nova aqui passa a ser pública, e o teste obriga a decidir isso.
--
-- A policy antiga sai porque a nova a contém: para `authenticated`, ver o
-- próprio perfil é caso particular de ver qualquer perfil; para `anon`,
-- `auth.uid()` é nulo e ela nunca devolvia linha. Mantê-la só faria o Postgres
-- avaliar duas policies permissivas por linha (advisor
-- multiple_permissive_policies).
drop policy if exists "Users can view their own profile" on public.profiles;

create policy profiles_select_autenticado on public.profiles
  for select to authenticated
  using (true);

-- Escrita. Mesma regra da base — cada um só escreve o próprio perfil —, com
-- `(select auth.uid())` (advisor auth_rls_initplan) e `to authenticated` em
-- vez de `public`.
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;

create policy profiles_insert_proprio on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

create policy profiles_update_proprio on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Privilégios. A base concede ALL a anon e a authenticated. Visitante sem
-- sessão não tem o que fazer em profiles: sai tudo. Para o autenticado, UPDATE
-- só nas colunas editáveis — o mesmo argumento do grant de coluna de follows:
-- a policy limita QUAL linha, o grant limita QUAIS colunas. Sem ele,
-- created_at ("membro desde") e qualquer coluna futura seriam graváveis por
-- quem chama o PostgREST direto, com o JWT que está no navegador.
-- updated_at continua na lista só por compatibilidade: a rota antiga
-- /api/profile/update o envia, e tirá-lo aqui quebraria a tela de
-- configurações se esta migration entrar antes da S04. A S04 troca essa rota
-- por /api/social/perfil, que não o envia; depois do merge dela, updated_at
-- pode sair do grant. Enquanto isso, quem decide o valor é o trigger da seção 2.
revoke all on public.profiles from anon;
revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url, username, bio, is_public, updated_at)
  on public.profiles to authenticated;


-- ---------------------------------------------------------------------------
-- 4. follows — o vínculo de seguir, com estado pendente/aceito
-- ---------------------------------------------------------------------------
-- FKs com nome explícito: o embed do PostgREST precisa dele para distinguir
-- os dois lados (`profiles!follows_follower_id_fkey`), e `on delete cascade`
-- leva os vínculos junto quando a conta é apagada.
create table if not exists public.follows (
  follower_id uuid not null
    constraint follows_follower_id_fkey references public.profiles(id) on delete cascade,
  followee_id uuid not null
    constraint follows_followee_id_fkey references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    constraint follows_status_valido check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint follows_pkey primary key (follower_id, followee_id),
  constraint follows_sem_auto_seguir check (follower_id <> followee_id)
);

comment on table public.follows is 'Seguir estilo Instagram: público nasce aceito, privado nasce pendente até o dono aprovar (RF09).';

-- A PK composta garante unicidade do par. Ela NÃO torna "seguir duas vezes"
-- idempotente sozinha: um segundo INSERT levanta 23505. O route handler é quem
-- torna idempotente, com INSERT ... ON CONFLICT (follower_id, followee_id) DO NOTHING.

-- Índices do lado do followee, já na ordem em que as listas são mostradas
-- (mais recente primeiro). A PK só cobre buscas por follower_id; "quem me
-- segue" e "minhas solicitações" filtram por followee_id e ordenam por data.
-- O composto também cobre a FK de followee_id.
create index if not exists follows_followee_recentes_idx
  on public.follows (followee_id, created_at desc);

-- Parcial, para a Zona 1 da central de notificações — as solicitações
-- pendentes de um dono (RF13.2). Só indexa as linhas pendentes, que são poucas.
create index if not exists follows_pendentes_idx
  on public.follows (followee_id, created_at desc) where status = 'pending';


-- ---------------------------------------------------------------------------
-- 5. follows — trigger que impõe o estado inicial
-- ---------------------------------------------------------------------------
-- Primeira linha de defesa: o grant de INSERT (seção 8) só aceita
-- follower_id e followee_id, então o cliente que mandar status ou created_at
-- recebe 42501. Este trigger é a segunda: vale também para quem escreve sem
-- passar pelo grant (service_role, SQL direto) e fixa
--   - status conforme is_public do alvo — sem isso, um 'accepted' gravado num
--     perfil privado furaria a aprovação, o vetor central da seção 25;
--   - created_at e updated_at com o horário do servidor.
-- O que ele NÃO impede: quem foi recusado apagar e pedir de novo, voltando ao
-- topo da lista de pendentes. Recusa sem barreira é requisito (RF09.9), e uma
-- espera por par tornaria a remoção detectável; o risco aceito e a mitigação
-- possível (limite global de pendentes por seguidor) estão no plano.
--
-- SECURITY DEFINER para ler profiles.is_public sem depender da policy de
-- SELECT de profiles. Sem ele, uma policy restrita no futuro faria o EXISTS
-- voltar falso e todo vínculo nascer 'pending' — falha fechada, mas quebraria
-- o seguir público.
create or replace function public.follows_definir_estado_inicial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.profiles p where p.id = new.followee_id and p.is_public) then
    new.status := 'accepted';
  else
    new.status := 'pending';
  end if;
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.follows_definir_estado_inicial() is
  'Trigger BEFORE INSERT: status vem do is_public do alvo; datas vêm do servidor.';

-- Higiene: uma função `returns trigger` não pode ser chamada fora de um
-- trigger, e o Postgres não checa EXECUTE ao dispará-la — por isso revogar é
-- inofensivo. Revoga-se mesmo assim para nenhum SECURITY DEFINER aparecer
-- executável por papel exposto (advisor e revisão de segurança).
revoke execute on function public.follows_definir_estado_inicial() from public, anon, authenticated;

drop trigger if exists follows_estado_inicial on public.follows;
create trigger follows_estado_inicial
  before insert on public.follows
  for each row execute function public.follows_definir_estado_inicial();

drop trigger if exists follows_definir_updated_at on public.follows;
create trigger follows_definir_updated_at
  before update on public.follows
  for each row execute function public.social_definir_updated_at();


-- ---------------------------------------------------------------------------
-- 6. follows — quem pode ver a rede de um perfil
-- ---------------------------------------------------------------------------
-- Mesmo critério das publicações: a rede (quem segue e quem é seguido) de um
-- perfil privado só aparece para o próprio dono e para seguidores aceitos.
-- O Instagram faz o mesmo, e o detalhamento do RF02 não põe a rede entre os
-- dados que um perfil privado mantém visíveis.
--
-- Função, e não subconsulta na policy, porque a policy de follows precisa
-- consultar follows: inline, a RLS se aplicaria de novo e recursaria. Recebe
-- só o perfil e resolve o usuário com auth.uid(), como pode_acessar_despesa —
-- não dá para perguntar em nome de terceiros. O que ela revela via RPC (se um
-- perfil é público, se eu o sigo) já é visível por outros caminhos.
create or replace function public.pode_ver_rede(perfil uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select perfil = (select auth.uid())
      or exists (select 1 from public.profiles p where p.id = perfil and p.is_public)
      or exists (
        select 1 from public.follows f
         where f.follower_id = (select auth.uid())
           and f.followee_id = perfil
           and f.status = 'accepted'
      );
$$;

comment on function public.pode_ver_rede(uuid) is
  'Verdadeiro se o usuário da sessão pode ver a rede do perfil: é o dono, o perfil é público, ou ele é seguidor aceito.';

revoke all on function public.pode_ver_rede(uuid) from public;
grant execute on function public.pode_ver_rede(uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 7. follows — RLS
-- ---------------------------------------------------------------------------
-- Sem FORCE ROW LEVEL SECURITY, como no resto do schema: o dono da tabela é
-- `postgres`, e a Data API fala como `authenticated`/`anon`, a quem a RLS
-- sempre se aplica.
alter table public.follows enable row level security;

-- SELECT:
--   - as duas partes sempre veem o próprio vínculo, pendente ou aceito
--     (RF09.3: a solicitação pendente só para solicitante e dono);
--   - um vínculo aceito A→B aparece na lista de seguidores de B e na de
--     seguidos de A; quem pode ver qualquer uma das duas listas vê a linha
--     (RF09.6). Consequência, igual à do Instagram: que um perfil público
--     segue um privado é visível, porque está na lista do público.
create policy follows_select on public.follows
  for select to authenticated
  using (
    (select auth.uid()) in (follower_id, followee_id)
    or (
      status = 'accepted'
      and ((select public.pode_ver_rede(followee_id)) or (select public.pode_ver_rede(follower_id)))
    )
  );

-- INSERT: só dá para criar vínculo em nome de si mesmo. O status quem decide
-- é o trigger.
create policy follows_insert on public.follows
  for insert to authenticated
  with check ((select auth.uid()) = follower_id);

-- UPDATE: só o dono (followee) mexe, e o resultado só pode ser 'accepted' —
-- é a aprovação de uma solicitação pendente (RF09.4). Ele não rebaixa um
-- vínculo aceito para pendente: para desfazer, apaga (RF09.9).
create policy follows_update on public.follows
  for update to authenticated
  using ((select auth.uid()) = followee_id)
  with check ((select auth.uid()) = followee_id and status = 'accepted');

-- DELETE: cobre deixar de seguir e cancelar solicitação (follower), e recusar
-- ou remover seguidor (followee) — RF09.4, RF09.5 e RF09.9. Remoção é
-- silenciosa e sem barreira: nada aqui impede o removido de seguir/solicitar
-- de novo, que é o que o detalhamento do RF09.9 pede.
create policy follows_delete on public.follows
  for delete to authenticated
  using ((select auth.uid()) in (follower_id, followee_id));


-- ---------------------------------------------------------------------------
-- 8. follows — privilégios explícitos
-- ---------------------------------------------------------------------------
-- Mesmo padrão da migration do rateio: a tabela precisa ser alcançável pela
-- Data API antes de a RLS decidir quais linhas aparecem, e o grant não pode
-- depender de DEFAULT PRIVILEGES. anon fica sem nada.
--
-- INSERT só em follower_id e followee_id: status e datas vindos do cliente
-- dão 42501 em vez de serem sobrescritos em silêncio. O upsert idempotente da
-- S05 (ON CONFLICT DO NOTHING) só precisa desses dois.
--
-- UPDATE só em status. O WITH CHECK da policy não vê a linha antiga: ele já
-- impede trocar followee_id (a linha nova precisa ter o dono como followee),
-- mas não impediria o dono de repontar follower_id e fabricar um seguidor. O
-- grant de coluna fecha isso. updated_at não precisa de grant: quem escreve é
-- o trigger.
revoke all on public.follows from anon, authenticated;
grant select, delete on public.follows to authenticated;
grant insert (follower_id, followee_id) on public.follows to authenticated;
grant update (status) on public.follows to authenticated;
grant all on public.follows to service_role;
