-- Social: bucket de fotos de perfil e o formato fechado de profiles.avatar_url.
--
-- S04-M-foto-perfil. Migration e RLS são do Fernando (CLAUDE.md). O Micael
-- escreveu o SQL como proposta em docs/plans/, e o Fernando autorizou subi-lo
-- como migration depois da validação. Ela é exercitada por
-- tests/rls/05-avatares.test.ts, e cada proteção foi sabotada para provar que
-- um teste cai (docs/pfc/evidencias/S04-M-foto-mutacoes.txt).
--
-- Constrói sobre 20261007105848_social_perfil_e_follows (policies e grants de
-- profiles: o autenticado atualiza a própria linha, e avatar_url está no grant
-- de UPDATE). Entra no mesmo PR da rota de foto, nem antes nem depois: antes,
-- o trigger da seção 3 recusaria a URL que o formulário da parte 1 ainda envia;
-- depois, a rota de foto não teria bucket.
--
-- O projeto não usava Storage até aqui. Esta é a primeira peça dele.
--
-- @RF02.2 foto de perfil · @RNF02.4 isolamento


-- ---------------------------------------------------------------------------
-- 1. Bucket
-- ---------------------------------------------------------------------------
-- Público para LER pela URL: a foto de perfil é dado básico (detalhamento do
-- RF02), e bucket público dispensa URL assinada que expira. Público quer dizer
-- a internet inteira, não "qualquer autenticado": quem tiver a URL vê a foto
-- sem sessão, e o caminho leva o id do usuário — risco registrado no plano.
--
-- Os limites ficam também no bucket, como segunda barreira atrás da rota.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- ---------------------------------------------------------------------------
-- 2. storage.objects — nenhuma policy para usuário
-- ---------------------------------------------------------------------------
-- De propósito. storage.objects já vem com RLS ligada, e sem policy a RLS nega
-- tudo a `authenticated` e a `anon`: ninguém envia, sobrescreve, move, copia,
-- lista nem apaga nada no bucket pela API do Storage.
--
-- Quem grava e apaga é a rota /api/social/perfil/foto, com a chave de serviço
-- (lib/supabase/admin.ts), e só depois de conferir os bytes do arquivo e montar
-- o caminho com o id de getUser(). Com policy de INSERT para o usuário, o JWT
-- que está no navegador bastaria para enviar qualquer coisa declarada como
-- image/png — o bucket só confere o tipo DECLARADO — e apontar o avatar para
-- ela. E storage.objects é tabela do banco: escrita direta do navegador é o que
-- a regra 1 do CLAUDE.md proíbe.
--
-- O preço: um erro de caminho na rota não seria pego pela RLS. Quem o pega é o
-- teste da rota, que trava o caminho em `<id da sessão>/<uuid>.<ext>`.


-- ---------------------------------------------------------------------------
-- 3. profiles.avatar_url guarda o caminho no bucket, não uma URL
-- ---------------------------------------------------------------------------
-- O avatar é carregado pelo navegador de quem vê o perfil. Com URL livre, o
-- host escolhido pelo dono recebia o IP e o horário de cada visita (risco
-- registrado na S03). Exigir que a URL "contenha /storage/v1/object/public/..."
-- não fecharia isso: o atacante hospeda o mesmo caminho no domínio dele. E o
-- host do projeto não dá para fixar no banco — muda entre local e produção.
--
-- Então o banco guarda só o caminho dentro do bucket, no formato exato que a
-- rota grava — `<id do perfil>/<uuid>.(webp|jpg|png)`, ancorado nas duas
-- pontas —, e as rotas montam a URL pública com o endereço do projeto.
--
-- Isto também substitui o que a migration da S03 diz sobre avatar_url não ter
-- check no banco: com o caminho no formato fechado, passa a ter.
--
-- O trigger vale para toda escrita: o PATCH direto pelo PostgREST (o grant de
-- UPDATE em avatar_url existe porque a rota grava com a sessão do usuário) e o
-- INSERT que a policy profiles_insert_proprio permite quando o perfil ainda não
-- existe.
create or replace function public.social_validar_avatar_url()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' or new.avatar_url is distinct from old.avatar_url)
     and new.avatar_url is not null
     and new.avatar_url !~ (
       '^' || new.id::text
       || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|png)$'
     ) then
    raise exception 'avatar_url precisa ser um arquivo na pasta do próprio usuário no bucket avatars'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

comment on function public.social_validar_avatar_url() is
  'Trigger BEFORE INSERT/UPDATE: avatar_url só recebe nulo ou <id do perfil>/<uuid>.(webp|jpg|png).';

-- As URLs gravadas antes desta migration somem. Deixá-las não fecharia o risco
-- acima: quem pôs um pixel rastreador como avatar nunca vai "trocar a foto". O
-- custo é quem tinha avatar por URL precisar enviar a foto de novo — e a tela de
-- URL deixa de existir junto com esta migration.
update public.profiles
   set avatar_url = null
 where avatar_url is not null
   and avatar_url !~ (
     '^' || id::text
     || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|png)$'
   );

drop trigger if exists profiles_validar_avatar_url on public.profiles;
create trigger profiles_validar_avatar_url
  before insert or update of avatar_url on public.profiles
  for each row execute function public.social_validar_avatar_url();

comment on column public.profiles.avatar_url is
  'Caminho da foto no bucket avatars (<id>/<uuid>.<ext>); as rotas montam a URL pública.';
