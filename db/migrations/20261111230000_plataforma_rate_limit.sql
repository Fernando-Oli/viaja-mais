-- Plataforma: limite de requisições por usuário (S06-F-rate-limit-csp).
--
-- Quatro rotas podem ser abusadas: o convite dispara e-mail real, a troca de
-- senha confere a senha atual (oráculo para quem tem uma sessão roubada), a foto
-- grava no Storage e o seguir gera notificação. O contador fica no Postgres
-- porque na Vercel cada requisição pode cair numa instância diferente, e um
-- contador em memória não vê as outras.
--
-- Janela fixa, uma linha por (usuário, regra): a tabela tem no máximo
-- usuários × regras linhas, então não precisa de limpeza.
--
-- O usuário não toca a tabela. Só a função, que é SECURITY DEFINER e conta
-- sempre para auth.uid(). Se a pessoa pudesse fazer UPDATE ou DELETE na própria
-- linha, zeraria o próprio contador, e o limite não valeria nada.
--
-- A regra (máximo e janela) vem da rota, não do banco. Quem chama a função
-- direto pelo PostgREST com outro máximo só muda a resposta que ele mesmo
-- recebe: a rota decide pela própria chamada, com os próprios parâmetros, e o
-- contador só sobe.
--
-- @RNF02.8 limite por usuário e por janela de tempo

-- 1. Tabela -------------------------------------------------------------------

create table public.rate_limits (
  user_id       uuid        not null references auth.users (id) on delete cascade,
  chave         text        not null,
  janela_inicio timestamptz not null,
  contagem      integer     not null,
  constraint rate_limits_pkey primary key (user_id, chave),
  constraint rate_limits_chave_formato check (chave ~ '^[a-z0-9-]{1,64}$'),
  constraint rate_limits_contagem_positiva check (contagem > 0)
);

comment on table public.rate_limits is
  'Contador de requisições por usuário e regra, em janela fixa. Sem acesso pela API: só public.consumir_limite() escreve (RNF02.8).';

-- RLS ligada com uma policy que nega tudo, escrita por extenso. "RLS sem
-- policy" também negaria, mas é indistinguível de policy esquecida, e o teste
-- estrutural (tests/rls/00-estrutura) recusa esse caso para toda tabela. Com o
-- grant revogado, a API recusa antes; se o grant um dia voltar, a policy ainda
-- devolve zero linhas e recusa toda escrita.
alter table public.rate_limits enable row level security;

create policy rate_limits_sem_acesso_direto on public.rate_limits
  for all to anon, authenticated
  using (false)
  with check (false);

revoke all on public.rate_limits from anon, authenticated;
grant all on public.rate_limits to service_role;

-- 2. Função -------------------------------------------------------------------

create or replace function public.consumir_limite(
  p_chave text,
  p_maximo integer,
  p_janela_segundos integer
)
returns table (permitido boolean, retry_after integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
  v_inicio  timestamptz;
  v_contagem integer;
begin
  if v_usuario is null then
    raise exception 'consumir_limite exige sessão'
      using errcode = 'insufficient_privilege';
  end if;

  if p_chave is null or p_chave !~ '^[a-z0-9-]{1,64}$' then
    raise exception 'chave de limite inválida' using errcode = 'invalid_parameter_value';
  end if;
  if p_maximo is null or p_maximo not between 1 and 1000 then
    raise exception 'máximo fora da faixa (1 a 1000)' using errcode = 'invalid_parameter_value';
  end if;
  if p_janela_segundos is null or p_janela_segundos not between 1 and 86400 then
    raise exception 'janela fora da faixa (1 s a 1 dia)' using errcode = 'invalid_parameter_value';
  end if;

  -- Início da janela corrente, alinhado ao relógio: com janela de 600 s, toda
  -- requisição entre 10:00:00 e 10:09:59 cai na janela das 10:00.
  v_inicio := to_timestamp(
    floor(extract(epoch from now()) / p_janela_segundos) * p_janela_segundos
  );

  -- Atômico: duas requisições simultâneas do mesmo usuário não leem o mesmo
  -- valor; a segunda espera o lock da linha e soma em cima da primeira.
  insert into public.rate_limits as r (user_id, chave, janela_inicio, contagem)
  values (v_usuario, p_chave, v_inicio, 1)
  on conflict (user_id, chave) do update
    set contagem = case
                     when r.janela_inicio = excluded.janela_inicio then r.contagem + 1
                     else 1
                   end,
        janela_inicio = excluded.janela_inicio
  returning r.contagem into v_contagem;

  permitido := v_contagem <= p_maximo;
  retry_after := case
    when permitido then 0
    else greatest(
      1,
      ceil(extract(epoch from (v_inicio + make_interval(secs => p_janela_segundos) - now())))::integer
    )
  end;
  return next;
end;
$$;

comment on function public.consumir_limite(text, integer, integer) is
  'Conta uma requisição de auth.uid() na regra p_chave e diz se ela cabe em p_maximo por janela de p_janela_segundos. retry_after em segundos (RNF02.8).';

revoke all on function public.consumir_limite(text, integer, integer) from public, anon;
grant execute on function public.consumir_limite(text, integer, integer) to authenticated, service_role;
