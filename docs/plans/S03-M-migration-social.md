---
id: S03-M-migration-social
titulo: Migration do social: perfil público e follows
trilha: T1
responsavel: micael
revisor: fernando
semana: S03
requisitos: [RF02.5, RF02.6, RF02.7, RF09.1, RF09.2, RF09.3, RF09.4, RF09.5, RF09.6, RF09.9]
secoes_doc: [18, 25]
branch: feat/S03-M-migration-social
tipo: [migration, rls]
depende_de: [S03-F-schema-base]
status: em-desenvolvimento
---
# Migration do social: perfil público e follows

> **Micael** · semana **S03** (09 a 15/09) · marco da semana: _Convite chega no e-mail de verdade_

## 1. Contexto

Primeira migration do domínio Social. `profiles` ganha `username` (única),
`bio` e `is_public`; entra a tabela `follows`, com estado pendente/aceito, que é
a base do seguir estilo Instagram (RF09). Sustenta os requisitos RF02.5–RF02.7 e
RF09.1–RF09.6/RF09.9 — que, sem esta migration, não têm coluna nem tabela onde
existir. A RLS de visibilidade definida aqui é o estudo de caso da seção 25.

**Divisão do trabalho.** Migration e RLS são do Fernando (CLAUDE.md). O SQL
nasceu como proposta em `docs/plans/`. Depois de revisado, o Fernando autorizou,
em 08/10, subi-lo como migration de verdade, desde que passasse na validação:

| Quem | Entrega |
|---|---|
| Micael | Esta especificação; a migration [`20261007105848_social_perfil_e_follows.sql`](../../supabase/migrations/20261007105848_social_perfil_e_follows.sql), escrita como proposta e promovida com o aval do Fernando; o `types/database.ts` regenerado junto; o seed; o teste de RLS `tests/rls/04-social.test.ts`; as evidências |
| Fernando | A revisão da migration e da RLS, que continuam dele; e a correção da plataforma descrita abaixo |

A migration foi exercitada pelo teste e passou por uma revisão adversarial
independente antes de chegar ao Fernando. Com ela no PR, o seed e o teste têm as
colunas e a tabela que referenciam, e o CI de banco ("Migrations e RLS") roda a
suíte inteira sobre um Supabase criado só a partir do repositório.

### Pré-requisito da plataforma (bloqueante)

A revisão encontrou, e a reprodução em
`docs/pfc/evidencias/S03-M-achado-plataforma.txt` confirma, que **abrir a leitura
de `profiles` torna explorável algo que já existe na base**. Até hoje isso estava
coberto só porque ninguém conseguia descobrir o UUID de outro usuário:

1. `trip_members_insert` (migration `plataforma_rls_isolamento`) deixa o dono da
   viagem adicionar **qualquer** usuário sem convite. Com a lista de perfis, uma
   estranha coloca a vítima numa viagem que ela nunca aceitou (a viagem aparece
   para a vítima) e pode lançar partes de rateio em nome dela.
2. `is_trip_member`, `is_trip_owner` e `can_access_trip` são SECURITY DEFINER,
   recebem o usuário por parâmetro e têm EXECUTE para **anon**: sem login, dá para
   perguntar via RPC se um UUID participa de uma viagem.

Correção sugerida, no domínio do Fernando, antes desta migration ou junto dela:

- (a) Tirar o ramo do dono de `trip_members_insert`, deixando entrar só por convite
  pendente. O app não usa esse ramo: o dono entra pelo trigger
  `add_trip_owner_as_member`, a rota de membros só tem DELETE, e o único insert é
  o de aceitar convite. Quem depende dele são as fixtures de `01-isolamento`,
  `02-rateio` e `03-escopo-grupo`, que passariam a montar o membro por `pg` ou pelo
  fluxo de convite.
- (b) Recriar as três funções sem o parâmetro de usuário, resolvendo
  `auth.uid()` por dentro como `pode_acessar_despesa`, ou ao menos revogar de anon.
- Testes: "dono não adiciona membro sem convite → 42501" e "RPC sobre terceiro não
  responde".

### Segundo pré-requisito da plataforma (bloqueante): cadastro com nome longo

A revisão do PR achou um efeito colateral do teto de `full_name` (passo 1): **quem
se cadastra com nome de mais de 120 caracteres não consegue criar a conta**.

- O trigger `handle_new_user` (migration `plataforma_schema_base`) copia
  `raw_user_meta_data->>'full_name'` para `profiles` sem cortar.
- A constraint `profiles_full_name_tamanho` (≤120) vale para toda linha nova: ela
  derruba o INSERT.
- Como o trigger roda dentro da criação do usuário em `auth.users`, o cadastro
  inteiro volta, e a pessoa vê só "Database error saving new user".
- A tela de cadastro (`app/auth/sign-up`) não tem `maxLength` no campo de nome,
  então nada avisa antes de enviar.

Correção sugerida, no domínio do Fernando (o `handle_new_user` e a tela de cadastro
são da autenticação), antes desta migration ou junto dela, como o pré-requisito
acima:

- `left(..., 120)` no `handle_new_user`, para o cadastro nunca falhar pelo nome;
- `maxLength` de 120 no campo de nome da tela de cadastro, para a pessoa ver o
  limite em vez de ter o nome cortado sem aviso;
- teste: "cadastro com nome de 121 caracteres cria a conta, com o nome cortado em 120".

### Achado para o dono, sem bloqueio: `pode_acessar_despesa` com EXECUTE para anon

A função `pode_acessar_despesa` (migration `financeiro_rateio`, fora do domínio
Social) tem EXECUTE para `anon`. A migration faz `revoke all ... from public` e
concede só a `authenticated` e `service_role`, mas o `alter default privileges` da
`plataforma_schema_base` já dá EXECUTE a `anon`, nominalmente, em toda função criada
no schema `public`, e revogar de `public` não tira esse grant. É o mesmo padrão que a
revisão achou em `pode_ver_rede`, desta migration, cuja correção entra neste PR.

Em `pode_acessar_despesa` o impacto é menor: o usuário vem de `auth.uid()`, então,
para `anon`, a resposta é sempre falsa. Fica registrado para o Fernando decidir, por ser privilégio no banco,
e não corrigido aqui, por estar na migration do rateio.

### Decisões de produto tomadas nesta atividade

| Decisão | Motivo |
|---|---|
| A **rede** (seguidores e seguidos) de um perfil privado só aparece para o dono e para seguidores aceitos | O detalhamento do RF02 não põe a rede entre o que um perfil privado mantém visível; o Instagram esconde. Decidido agora porque a S05 vai construir as listas em cima disso. |
| Contas que já existem ficam **privadas**; contas novas nascem públicas | Quem se cadastrou só para planejar viagem não consentiu em ser descoberto e seguido com efeito imediato (privacidade por padrão — argumento da seção 25). |

### Riscos aceitos (insumo da seção 25)

- **Reordenar ou insistir em solicitações.** Recusa sem barreira é requisito
  (RF09.9), então quem foi recusado pode apagar e pedir de novo, voltando ao topo
  da lista de pendentes. Uma espera por par tornaria a remoção detectável. A
  mitigação compatível é um limite global de pendentes por seguidor (trigger),
  candidata à atividade de rate limit `S06-F-rate-limit-csp`.
- **`updated_at` de um vínculo aceito** mostra o momento da aprovação a quem pode
  ver o vínculo.
- **Username liberado pode ser reutilizado na hora**: quem troca de nome perde
  `/u/antigo`, e outra pessoa pode pegá-lo. Uma espera por nome liberado fica para
  quando houver demanda. Nomes reservados não são mais risco: o check
  `profiles_username_reservado` os recusa no banco, inclusive pelo PostgREST direto.
- **`avatar_url` sem check no banco**: com `not valid`, uma conta antiga com URL
  fora do padrão perderia a edição do perfil inteiro, então a validação fica no
  route handler da S04. **A imagem é carregada pelo navegador de quem vê**
  (`next.config.mjs` usa `images.unoptimized` e o cabeçalho usa `<img>`), e o host
  escolhido pelo dono do perfil recebe o IP e o horário de quem visita. Mitigações,
  todas decisão da plataforma: ligar a otimização de imagem com `remotePatterns`
  (a imagem passa a vir pelo servidor) ou guardar avatares no Storage do projeto.

## 2. Arquivos afetados

- `supabase/migrations/20261007105848_social_perfil_e_follows.sql` — **novo**. Escrita
  pelo Micael como proposta em `docs/plans/` e movida para cá com o aval do
  Fernando, que segue como revisor e dono da RLS.
- `types/database.ts` — **gerado** por `npm run db:types` junto com a migration.
- `supabase/seed.sql` — (Micael) terceira usuária de teste, Carla, e `username`/`bio`/
  `is_public` dos três: Ana pública, Bruno privado, Carla pública.
- `tests/rls/04-social.test.ts` — **novo** (Micael). O prefixo `04-` segue
  `02-rateio` e `03-escopo-grupo`.
- `docs/pfc/evidencias/S03-M-*` — evidências (lista no bloco 6).
- `docs/pfc/04-design/18-Modelo-de-dados.md` — `profiles` e `follows` no modelo de
  dados. **Depois do merge da migration**, via `/pfc-secao 18`: antes disso a
  seção descreveria um schema que não está no repositório.

## 3. Passos

O SQL completo e comentado está na migration; aqui fica o porquê de cada decisão.

1. **`profiles` — colunas novas.** `username extensions.citext`, `bio text`,
   `is_public boolean`.
   - O username guardado é sempre minúsculo (check `^[a-z0-9_]{3,30}$` sobre o
     texto). O `citext` não está pela unicidade, que o check já garante, e sim pela
     busca: `/u/Ana` encontra `ana` com igualdade simples.
   - Usernames reservados recusados **no banco** (`profiles_username_reservado`):
     nomes que imitam a equipe ou caminhos da aplicação, e qualquer nome que
     contenha `viajamais`. Só na rota não bastaria: o grant de UPDATE em username
     deixa gravar direto pelo PostgREST.
   - `is_public` entra com `default false`, para as contas existentes ficarem
     privadas, e só depois o default vira `true` (é só metadado).
   - Constraints protegidas pelo nome, como no rateio: com drift, a constraint
     entra mesmo que a coluna já exista.
   - `full_name` ganha teto de 120 caracteres. Os nomes antigos acima disso são
     cortados antes, e a constraint entra **válida**. A primeira versão usava
     `not valid`, e a revisão do PR mostrou o problema: a constraint vale em todo
     UPDATE da linha, então uma conta antiga com nome longo não mudaria nem a bio, e
     o `update` da migration de avatares abortaria o deploy. É o mesmo motivo que já
     tirava o `not valid` de `avatar_url`.

2. **`updated_at` do servidor.** Uma função `social_definir_updated_at()` para os
   triggers de UPDATE de `profiles` e de `follows`. A rota de perfil ainda manda
   `updated_at`, e o trigger ignora esse valor.

3. **`profiles` — policies e privilégios.**
   - SELECT `to authenticated using (true)`: o detalhamento do RF02 manda os
     dados básicos ficarem visíveis mesmo em perfil privado. A policy antiga ("ver
     o próprio perfil") sai, porque a nova a contém.
   - INSERT e UPDATE do próprio perfil recriados com `(select auth.uid())` e
     `to authenticated`.
   - `anon` sem nada. UPDATE só em `full_name, avatar_url, username, bio,
     is_public, updated_at`: sem o grant de coluna, `created_at` e qualquer coluna
     futura seriam graváveis pelo PostgREST direto.
   - O teste trava a lista de colunas de `profiles`: uma coluna nova vira pública
     no mesmo instante, e o teste obriga a decidir isso.

4. **Tabela `follows`.** PK `(follower_id, followee_id)`, status `pending|accepted`,
   check contra seguir a si mesmo, FKs com nome explícito (o embed
   `profiles!follows_follower_id_fkey` da S05 precisa) e `on delete cascade`. A PK
   não torna o segundo INSERT silencioso: dá 23505, e a idempotência do RF09.2 é do
   route handler (`ON CONFLICT DO NOTHING`, S05).

5. **Estado inicial: duas linhas de defesa.**
   - Grant de INSERT só em `follower_id, followee_id`: o cliente que mandar
     `status` ou `created_at` recebe 42501.
   - Trigger `before insert`, `security definer`, `search_path = ''`: fixa o
     `status` pelo `is_public` do alvo e as datas pelo relógio do servidor, também
     para quem escreve sem passar pelo grant.

6. **Rede de perfil privado.** `pode_ver_rede(perfil)`: é o dono, o perfil é
   público, ou o usuário é seguidor aceito. Precisa ser função porque a policy de
   `follows` consulta `follows` (inline, recursaria). Recebe só o perfil e resolve
   o usuário por `auth.uid()`, no molde de `pode_acessar_despesa`.

7. **RLS de `follows`** — sem `force`, como o resto do schema.
   - SELECT: as partes sempre veem o próprio vínculo (RF09.3). Um vínculo aceito
     aparece para quem pode ver a rede de qualquer um dos lados (RF09.6). Como no
     Instagram, que um perfil público segue um privado é visível, porque está na
     lista do público.
   - INSERT: `uid = follower_id`.
   - UPDATE: só o followee, e o resultado só pode ser `accepted`. Ele aprova, mas
     não rebaixa.
   - DELETE: qualquer das partes (RF09.4, RF09.5, RF09.9).

8. **Privilégios de `follows`.** `revoke all` de anon e authenticated, depois
   `select, delete`, `insert (follower_id, followee_id)` e `update (status)`. O
   WITH CHECK já impede trocar `followee_id`; só o repontar de `follower_id`
   depende do grant de coluna.

9. **Índices.** `(followee_id, created_at desc)` cobre "quem me segue" na ordem da
   tela e a FK, e a versão parcial `where status = 'pending'` (`follows_pendentes_idx`)
   **prepara** a Zona 1 da central de notificações (RF13.2). "Quem eu sigo" usa a PK.
   O RF13.2 em si, a notificação de nova solicitação, não é entregue aqui: não há
   código nem teste dele nesta atividade, só o índice que vai servi-lo. Ele será
   implementado depois, em atividade própria, e por isso não está entre os
   `requisitos` deste plano.

10. **Seed.** Ana pública, Bruno privado, Carla pública. A Carla existe porque uma
    solicitação tem dois lados, e provar que ela não vaza exige alguém que não é
    nenhum deles.

**Fora do escopo, registrado para a S05:** ao passar de privado para público, as
solicitações pendentes continuam pendentes. Se o produto quiser aceitá-las
sozinhas, isso precisa ser trigger em `profiles`, e não regra da rota: `is_public`
é gravável direto pelo PostgREST.

## 4. O que testar

Obrigatórios pelo tipo (`migration, rls`):

- [x] Aplicação limpa do zero: `npx supabase db reset` aplica as 4 migrations e o
  seed sem erro, localmente e no CI ("Migrations e RLS", `supabase start` do zero)
- [x] Teste em `tests/rls/` com os usuários do seed: 40 casos em `04-social.test.ts`
- [x] Usuário A não lê E não escreve dados de B, nos dois sentidos:
  - leitura: pendente e rede privada invisíveis para terceiro; visitante sem sessão
    recebe 42501;
  - escrita: INSERT forjado; UPDATE e DELETE de terceiro; auto-aprovação por
    UPDATE e por upsert; rebaixar e repontar; perfil alheio; colunas sem grant.
- [x] `npm run test:rls` verde: 78 de 78, nas 5 suítes

Além do obrigatório:

- [x] **Cada proteção derruba pelo menos um teste quando é removida.** São 23
  sabotagens, uma por trigger, policy, grant e constraint, cada uma sobre banco
  limpo. Os erros são conferidos pelo código do Postgres (42501, 23505, 23514), para
  que um teste que espera a RLS não passe porque um check barrou.
- [x] **Advisors da Supabase** (`supabase db advisors`): antes das correções, 6
  achados nos objetos desta migration; depois, só o "índice ainda não usado" de
  `follows_pendentes_idx`, que nenhuma tela consulta até a S05.
- [x] **`supabase db lint`** (plpgsql_check): sem erros.
- [x] **Índices**: `EXPLAIN` das consultas de lista e de pendentes, como usuário
  autenticado com RLS ativa, usa os índices, e `(select auth.uid())` aparece como
  InitPlan, avaliado uma vez por consulta.
- [x] **Tipos**: `npm run db:types` gera `follows`, `username`, `bio` e
  `is_public`, o `typecheck` passa com eles, e o arquivo vai commitado junto com
  a migration (regra 7).
- [x] **Regressão da equipe**: o E2E inteiro contra o banco com a migration deu 16
  de 20. As 4 falhas existem sem esta mudança: `00-fumaca` espera 404 em `/login` e
  `/register`, mas o `proxy.ts` redireciona visitante para `/auth/login` antes.
  Fica registrado para quem é dono do E2E.
- [x] **Revisão adversarial independente** da proposta e do teste. Todos os
  achados foram tratados: corrigidos na proposta, decididos acima ou escalados como
  pré-requisito da plataforma.

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

Pré-requisito: estar nesta branch, com o Supabase local no ar (`npm run setup`).

1. `npx supabase db reset` → aplica as migrations e o seed sem erro.
2. `npm run test:rls` → 5 suítes verdes.
3. No Studio (http://localhost:54323), SQL Editor, trocar o papel de `postgres` para
   **authenticated** e escolher a Ana (`teste.a@viajamais.local`). Sem trocar o papel,
   o editor roda como superusuário e a RLS não se aplica — o passo não provaria nada.
4. Como Ana: `insert into follows (follower_id, followee_id, status) values
   ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
   'accepted')` → erro de permissão: o cliente não escolhe o status.
5. Como Ana, sem o status: `insert into follows (follower_id, followee_id) values
   ('1111…', '2222…')` → a linha nasce `pending`. Repetir → erro 23505.
6. Como Ana: `update follows set status = 'accepted' where follower_id = '1111…'` →
   0 linhas (só o followee aprova).
7. Trocar para a Carla (`teste.c@…`): `select * from follows` → a pendente Ana→Bruno
   não aparece.
8. Trocar para o Bruno: `update follows set status = 'accepted' where follower_id =
   '1111…'` → 1 linha. Como a Ana é pública, a Carla agora vê o vínculo, porque ele
   está na lista de seguidos da Ana.
9. Como Carla: `delete from follows where follower_id = '1111…'` → 0 linhas.
10. Como Bruno: `update profiles set username = 'ana' where id = '2222…'` → erro
    23505; `set username = 'AB'` → erro 23514; `set created_at = now()` → erro de
    permissão.

## 5. O que validar

Critérios objetivos e binários. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

> Critérios que mudaram em relação ao rascunho da S03, com o motivo:
> - "perfil privado não vaza nem o nome em listagem" contradizia o detalhamento do
>   RF02 na seção 14, que manda os dados básicos ficarem visíveis;
> - "policy usa participação (trip_members)" é critério de tabela de viagem e não se
>   aplica a `follows`;
> - os dois critérios de rede privada e de contas antigas entraram com as decisões
>   do bloco 1;
> - o critério do pré-requisito da plataforma passou a cobrir dois: o cadastro com
>   nome longo foi achado na revisão do PR, depois do rascunho.

- [ ] `username` é único, validado por formato e fora da lista de reservados — no banco, não só na rota; a busca ignora maiúsculas
- [ ] Perfil privado expõe só os dados básicos (nome, username, avatar, bio) a
  autenticados; a rede dele só aparece para o dono e seguidores aceitos
- [ ] Visitante sem sessão não tem acesso nenhum a `profiles` nem a `follows`
- [ ] Contas existentes antes da migration ficam privadas; contas novas nascem públicas
- [ ] Solicitação pendente só é visível para as duas partes
- [ ] O cliente não escolhe `status` nem datas: o grant de INSERT recusa, e o trigger
  fixa os valores para quem escreve direto
- [ ] Só o followee aprova; ninguém se auto-aprova por UPDATE ou upsert; o dono não
  rebaixa nem reponta o vínculo
- [ ] Em `profiles`, cada um escreve só o próprio perfil e só as colunas editáveis
- [ ] Toda tabela nova tem RLS habilitada e policy por operação usada
- [ ] SELECT vazio não é aceito como prova: INSERT, UPDATE e DELETE também são testados
- [ ] Os dois pré-requisitos da plataforma do bloco 1 (membros e RPCs; cadastro com
  nome longo) resolvidos antes ou junto do merge (Fernando)
- [ ] Nome do arquivo final segue `<timestamp>_<dominio>_<descrição>.sql` (Fernando)
- [ ] `npm run db:types` rodado e `types/database.ts` commitado junto da migration (Fernando)
- [ ] ~~Policy usa participação (trip_members), não propriedade (user_id)~~ — não se
  aplica: `follows` não pertence a uma viagem

## 6. Evidência

- [x] Saída dos testes — arquivada em `docs/pfc/evidencias/`:
  - `S03-M-social-rls.txt` — `04-social.test.ts`: 40 de 40
  - `S03-M-social-mutacoes.txt` — as 23 sabotagens e os testes que cada uma derrubou
  - `S03-M-social-explain.txt` — planos de consulta das listas sob RLS
  - `S03-M-social-advisors.txt` — advisors e lint antes e depois das correções
  - `S03-M-achado-plataforma.txt` — reprodução do pré-requisito da plataforma
- [ ] Screenshot ou gravação do fluxo (se houver tela) — não há tela nesta atividade
- [ ] Delta de cobertura (se mexeu em `lib/`) — não mexeu
