-- PROPOSTA DE MIGRATION — S03-M-migration-social
--
-- Isto NÃO é uma migration: fica em docs/plans/ e não é aplicado por
-- `db:reset`. Migration e RLS são do Fernando (CLAUDE.md); este arquivo é a
-- especificação executável do que o domínio Social precisa, já exercitada
-- localmente por tests/rls/04-social.test.ts. A versão final, o nome
-- (<timestamp>_social_perfil_e_follows.sql) e o `npm run db:types` são dele.
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
-- citext dá unicidade case-insensitive de username sem espalhar lower() pelas
-- queries. Fica no schema extensions, como as demais extensões deste projeto.
create extension if not exists citext with schema extensions;

alter table public.profiles
  add column if not exists username extensions.citext unique,
  add column if not exists bio text,
  add column if not exists is_public boolean not null default true;

-- O check roda sobre o texto (case-sensitive) de propósito: só minúsculas,
-- dígitos e underscore, de 3 a 30 caracteres. Sem isso o citext aceitaria
-- 'Ana' e 'ana' como o mesmo nome, mas guardaria a forma que veio.
alter table public.profiles
  add constraint profiles_username_formato
    check (username is null or (username::text) ~ '^[a-z0-9_]{3,30}$');

alter table public.profiles
  add constraint profiles_bio_tamanho
    check (bio is null or char_length(bio) <= 280);

comment on column public.profiles.username is 'Nome de usuário único, case-insensitive (RF02.5).';
comment on column public.profiles.is_public is 'Perfil público: publicações visíveis a qualquer autenticado. Privado: só a seguidores aceitos (RF02.7).';


-- ---------------------------------------------------------------------------
-- 2. profiles — leitura dos dados básicos por qualquer autenticado
-- ---------------------------------------------------------------------------
-- A base só tinha "Users can view their own profile" (SELECT USING id = uid):
-- ninguém via o perfil de ninguém, o que inviabiliza descoberta e o /u/[username].
--
-- Esta policy adicional NÃO é o mesmo `USING (true)` que o fix de isolamento
-- removeu de `trips`. Lá era bug: viagem é dado privado. Aqui é requisito
-- (RF02, detalhamento da seção 14): nome, username, avatar e bio são visíveis
-- mesmo em perfil privado — a privacidade recai sobre as PUBLICAÇÕES
-- (trip_posts, S06), não sobre o perfil. E `profiles` não guarda e-mail nem
-- dado sensível: só id, full_name, avatar_url, username, bio, is_public e datas.
--
-- `to authenticated`: visitante sem sessão continua sem ler perfil nenhum.
create policy "profiles_select_autenticado" on public.profiles
  for select to authenticated
  using (true);


-- ---------------------------------------------------------------------------
-- 3. follows — o vínculo de seguir, com estado pendente/aceito
-- ---------------------------------------------------------------------------
create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint follows_sem_auto_seguir check (follower_id <> followee_id)
);

comment on table public.follows is 'Seguir estilo Instagram: público nasce aceito, privado nasce pendente até o dono aprovar (RF09).';

-- A PK composta garante unicidade do par. Ela NÃO torna "seguir duas vezes"
-- idempotente sozinha: um segundo INSERT levanta 23505. O route handler é quem
-- torna idempotente, com INSERT ... ON CONFLICT (follower_id, followee_id) DO NOTHING.

-- Índice do lado do followee: a PK só cobre buscas por follower_id (coluna à
-- esquerda), mas "quem me segue" e "minhas solicitações" filtram por followee_id.
-- Também é o índice de FK que a best practice exige para JOIN e CASCADE rápidos.
create index if not exists follows_followee_id_idx on public.follows (followee_id);

-- Índice parcial para a Zona 1 da Central de Notificações — as solicitações
-- pendentes de um dono (RF13.2). Só indexa as linhas pendentes, que são poucas.
create index if not exists follows_pendentes_idx on public.follows (followee_id) where status = 'pending';


-- ---------------------------------------------------------------------------
-- 4. follows — trigger que impõe o estado inicial (segurança)
-- ---------------------------------------------------------------------------
-- Nada que o cliente mande em status, created_at ou updated_at é aceito no
-- INSERT. A RLS deixa o próprio usuário inserir a própria linha, então sem
-- isto ele poderia:
--   - gravar status='accepted' apontando para um perfil privado e furar a
--     aprovação — o vetor central da seção 25;
--   - gravar created_at no futuro e ficar sempre no topo das listas e da
--     central de notificações (RF13), que ordenam por data.
-- O route handler não é a única linha de defesa.
--
-- SECURITY DEFINER para ler profiles.is_public independentemente da policy de
-- SELECT de profiles — se ela um dia for restringida, o estado inicial não
-- passa a depender de quem está seguindo.
create or replace function public.follows_definir_status_inicial()
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

-- É trigger: o Postgres não checa EXECUTE ao disparar, então revogamos a
-- execução direta deste SECURITY DEFINER de qualquer papel exposto.
revoke execute on function public.follows_definir_status_inicial() from public, anon, authenticated;

create trigger follows_status_inicial
  before insert on public.follows
  for each row execute function public.follows_definir_status_inicial();

-- Mantém updated_at coerente em toda aprovação.
create or replace function public.follows_touch()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger follows_touch_updated_at
  before update on public.follows
  for each row execute function public.follows_touch();


-- ---------------------------------------------------------------------------
-- 5. follows — RLS
-- ---------------------------------------------------------------------------
-- Sem FORCE ROW LEVEL SECURITY, como no resto do schema: o dono da tabela é
-- `postgres`, e a Data API fala como `authenticated`/`anon`, a quem a RLS
-- sempre se aplica.
alter table public.follows enable row level security;

-- SELECT: vínculos aceitos são públicos (listas de seguidores/seguindo, RF09.6);
-- solicitações pendentes só o solicitante e o dono enxergam (RF09.3).
create policy "follows_select" on public.follows
  for select to authenticated
  using (
    status = 'accepted'
    or (select auth.uid()) in (follower_id, followee_id)
  );

-- INSERT: só dá para criar vínculo em nome de si mesmo. O status correto quem
-- impõe é o trigger, não o cliente.
create policy "follows_insert" on public.follows
  for insert to authenticated
  with check ((select auth.uid()) = follower_id);

-- UPDATE: só o dono (followee) aprova, e o resultado só pode ser 'accepted' —
-- é a aprovação de uma solicitação pendente (RF09.4).
create policy "follows_update" on public.follows
  for update to authenticated
  using ((select auth.uid()) = followee_id)
  with check ((select auth.uid()) = followee_id and status = 'accepted');

-- DELETE: cobre deixar de seguir e cancelar solicitação (follower), e recusar
-- ou remover seguidor (followee) — RF09.4, RF09.5 e RF09.9. Remoção é
-- silenciosa e sem barreira: nada aqui impede o removido de seguir/solicitar
-- de novo, que é o que o detalhamento do RF09.9 pede.
create policy "follows_delete" on public.follows
  for delete to authenticated
  using ((select auth.uid()) in (follower_id, followee_id));


-- ---------------------------------------------------------------------------
-- 6. follows — privilégios explícitos
-- ---------------------------------------------------------------------------
-- Mesmo padrão da migration do rateio: a tabela precisa ser alcançável pela
-- Data API antes de a RLS decidir quais linhas aparecem, e o grant não pode
-- depender de DEFAULT PRIVILEGES.
--
-- UPDATE só na coluna status. O WITH CHECK da policy não vê a linha antiga,
-- então sozinho não impediria repontar follower_id/followee_id; o grant de
-- coluna fecha isso na raiz. updated_at não precisa de grant: quem escreve é o
-- trigger follows_touch.
--
-- anon fica sem nada: visitante sem sessão não segue nem lê vínculos.
revoke all on public.follows from anon, authenticated;
grant select, insert, delete on public.follows to authenticated;
grant update (status) on public.follows to authenticated;
grant all on public.follows to service_role;
