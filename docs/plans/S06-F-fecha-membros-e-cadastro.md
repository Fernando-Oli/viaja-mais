---
id: S06-F-fecha-membros-e-cadastro
titulo: Fecha a entrada em viagem sem convite, o RPC sobre terceiros e o cadastro com nome longo
trilha: T1
responsavel: fernando
revisor: audrey
semana: S06
requisitos: [RNF02.4, RF04.3, RF01.1]
secoes_doc: [25, 22.1]
branch: fix/S06-F-fecha-membros-e-cadastro
tipo: [migration, rls, seguranca, correcao-de-bug, tela]
depende_de: []
status: em-revisao
---

## 1. Contexto

São os dois pré-requisitos bloqueantes que a S03-M (`docs/plans/S03-M-migration-social.md`,
bloco 1) deixou para a plataforma. Hoje eles são inofensivos só porque ninguém descobre o
UUID de outro usuário; a migration social abre a leitura de `profiles` e os torna
exploráveis — reprodução em `docs/pfc/evidencias/S03-M-achado-plataforma.txt`:

1. **Entrar em viagem sem aceitar.** `trip_members_insert` tem um ramo "o dono adiciona
   quem quiser". Com a lista de perfis, uma estranha põe a vítima numa viagem que ela nunca
   aceitou, e a viagem aparece no painel da vítima.
2. **RPC responde sobre terceiros.** `is_trip_member`, `is_trip_owner` e `can_access_trip`
   são `SECURITY DEFINER`, recebem o usuário por parâmetro e não conferem quem pergunta: sem
   login, `rpc('is_trip_member', {trip_uuid, user_uuid})` responde `true`.
3. **Cadastro com nome longo falha.** A S03-M limita `profiles.full_name` a 120. O
   `handle_new_user` copia o nome do cadastro sem cortar; com 121+ caracteres o INSERT cai,
   o cadastro inteiro volta e a pessoa vê só "Database error saving new user".

Esta atividade entra **antes** da #27. Corrigir o trigger antes de existir o teto não
quebra nada: `left(..., 120)` sobre nome curto é o próprio nome.

## 2. Arquivos afetados

- `supabase/migrations/20261014230500_plataforma_membros_por_convite_e_cadastro.sql` — nova
- `app/auth/sign-up/page.tsx` — `maxLength={120}` no "Nome completo"
- `tests/rls/convite.ts` — novo: põe alguém na viagem pelo fluxo real de convite
- `tests/rls/01-isolamento.test.ts`, `02-rateio.test.ts`, `03-escopo-grupo.test.ts` — fixtures
  passam a usar o convite em vez do insert direto da dona
- `tests/rls/06-plataforma-convite.test.ts` — novo: as três explorações bloqueadas

`types/database.ts` não muda: nenhuma assinatura de função nem coluna muda.

## 3. Passos

1. Migration:
   - recria `trip_members_insert` só com o ramo do convite pendente;
   - recria as três funções com o mesmo cabeçalho, `set search_path = ''` e
     `user_uuid = (select auth.uid())` no corpo — toda policy já passa `auth.uid()`, então
     para elas nada muda; para quem chama por RPC sobre outra pessoa, a resposta vira `false`;
   - `handle_new_user` com `left(..., 120)`.
2. Teste novo com as três explorações; fixtures antigas pelo convite.
3. `maxLength` na tela de cadastro.
4. `npm run db:reset` + `npm run verify` + `npm run test:rls`.

Por que não `revoke execute ... from anon`: dezenas de policies da base não têm
`to authenticated` e chamam `can_access_trip`. Sem EXECUTE, a consulta anônima a `expenses`
deixaria de voltar vazia e passaria a dar erro de permissão — a checagem por dentro fecha o
mesmo buraco sem mudar esse comportamento.

## 4. O que testar

**Testes automatizados:**

- [ ] `db reset` aplica todas as migrations do zero, com o seed
- [ ] `tests/rls/06-plataforma-convite.test.ts`, com Ana e Bruno do seed:
  - dona insere o Bruno em `trip_members` sem convite → erro (falha antes da migration)
  - Bruno com convite pendente se insere → ok; a viagem passa a aparecer para ele
  - Bruno com convite já recusado não se insere → erro
  - visitante sem login: `rpc('is_trip_member')` sobre Ana numa viagem dela → `false` (antes: `true`)
  - Bruno logado: `rpc('is_trip_owner')` sobre a Ana → `false`; sobre si mesmo → resposta correta
  - cadastro com nome de 121 caracteres cria a conta, e `profiles.full_name` fica com os 120 primeiros
- [ ] `01`, `02`, `03` continuam verdes com o membro entrando pelo convite

**Roteiro manual:**

1. `npm run db:reset`; entrar como `teste.a@viajamais.local` → criar viagem → convidar
   `teste.b@viajamais.local` → esperado: convite criado.
2. Entrar como `teste.b@...` → aceitar o convite → esperado: a viagem aparece no painel.
3. Em `/auth/sign-up`, colar um nome de 130 caracteres → esperado: o campo para em 120.

## 5. O que validar

- [ ] Dono que insere em `trip_members` uma pessoa sem convite pendente para o e-mail dela
      recebe erro de RLS, e a viagem não aparece para essa pessoa
- [ ] Aceitar convite continua funcionando de ponta a ponta (a rota `accept` não muda)
- [ ] Criar viagem continua pondo o dono em `trip_members` (trigger `SECURITY DEFINER`, não a policy)
- [ ] Visitante sem login e usuário logado recebem `false` ao perguntar por RPC sobre a
      participação ou a posse de **outra** pessoa
- [ ] Nenhuma policy existente muda de resultado: `01`, `02`, `03` passam sem alterar asserção,
      só a forma de montar o membro
- [ ] As três funções têm `search_path` fixo
- [ ] Cadastro com nome de 121+ caracteres cria a conta; o nome é cortado em 120
- [ ] O campo "Nome completo" do cadastro não aceita mais de 120 caracteres
- [ ] Risco residual documentado na migration

## 6. Evidência

- [ ] Saída de `npm run test:rls` em `docs/pfc/evidencias/S06-F-convite-rls.txt`
- [ ] Saída de `npm run verify`
