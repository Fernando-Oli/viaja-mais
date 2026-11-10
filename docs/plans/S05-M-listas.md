---
id: S05-M-listas
titulo: Listas de seguidores e de seguindo no perfil, e remover seguidor
trilha: T3
responsavel: micael
revisor: fernando
semana: S05
requisitos: [RF09.6, RF09.9]
secoes_doc: [14, 16, 22.1, 25]
branch: feat/S05-M-listas
tipo: [route-handler, tela, migration, rls]
depende_de: [S05-M-solicitacoes, S05-M-seguir]
status: em-desenvolvimento
---
# Listas de seguidores e de seguindo no perfil, e remover seguidor

> **Micael** · semana **S05** · desenho definido pelo Micael em 10/11, segunda de duas atividades
> (a primeira é a `S05-M-solicitacoes`: a central de Notificações com aprovar e recusar)

## 1. Contexto

O perfil (`/u/<username>`, entregue no `S05-M-seguir`) mostra quantos seguidores e quantos seguidos
a pessoa tem, mas não mostra quem são, e ninguém consegue tirar alguém dos próprios seguidores. O
Micael definiu o desenho em 10/11, no modelo do Instagram:

- **As listas ficam no perfil** e abrem ao clicar nos contadores: "N seguidores" leva a
  `/u/<username>/seguidores`, e "N seguindo" leva a `/u/<username>/seguindo`, os endereços da
  seção 16. Voltar retorna ao perfil.
- **Remover um seguidor o tira da lista de seguidores**, na sua própria lista, com confirmação. A
  remoção é silenciosa (o removido não é avisado) e não impõe barreira: ele pode seguir de novo, se
  o perfil for público, ou pedir de novo, se for privado (detalhamento do RF09.9).

**Quem vê as listas.** A rede de um perfil (as duas listas) segue a função `pode_ver_rede` da S03:
o próprio dono, quem segue com vínculo aceito, ou qualquer autenticado se o perfil for público. Os
contadores continuam visíveis a todos, como já eram; em perfil privado sem acesso eles não viram
link. A tela decide o link com os dados que já tem (`vinculo` e `is_public`), que são exatamente os
três casos da função; quem decide de verdade é a rota.

**Autorização.** `exigirMembro` e `exigirDono` não se aplicam: a rede não é recurso de viagem.
- As listas chamam `pode_ver_rede` no servidor e respondem **403** quando ela diz não. A RLS é a
  segunda linha, e não basta sozinha: pela policy de SELECT da S03, um vínculo aceito aparece a
  quem pode ver a rede de **qualquer um** dos lados. Por isso a Carla, que não segue o Bruno
  (privado), vê pela Data API que a Ana (pública) segue o Bruno, porque isso está na lista de
  seguindo da Ana. É a decisão da S03, igual ao Instagram. O que ela não vê são os vínculos do
  Bruno com perfis privados, e a lista do Bruno como lista ela só alcança pela rota, que dá 403.
- Remover seguidor só existe para o próprio dono: o followee vem sempre de `getUser()`, e a URL só
  diz **quem** sai. Não há 403, porque ninguém alcança os seguidores de outra pessoa nem para ser
  recusado.

**A paginação, sem expor `id`.** As listas vêm 20 por vez, do vínculo mais recente para o mais
antigo, com "Ver mais". Paginar por posição (offset) duplica ou pula gente quando a lista muda
entre as páginas, então a paginação é por chave (keyset). A ordem é `created_at desc` e, no empate,
o username da outra pessoa em ordem alfabética. O empate é real: vínculos criados na mesma transação
têm o mesmo `created_at`, como os da população local.

O cursor é **o username da última pessoa já mostrada**. O servidor busca o `created_at` do vínculo
dela e continua dali: primeiro os de mesmo `created_at` e username maior, depois os mais antigos.
Assim o cursor não revela nada que a lista já não mostre, nem `id` (nem codificado) nem a data do
vínculo. A troca:
- são até três consultas numa página seguinte (o vínculo do cursor, os empatados e os mais
  antigos), contra uma na primeira página;
- se a pessoa do cursor deixar a lista entre uma página e outra (deixou de seguir, trocou de
  username, foi removida), o cursor não acha mais o vínculo. A rota responde 400 com o código
  `cursor_invalido`, e a tela recarrega a lista do começo. Quando o próprio dono remove a última
  pessoa carregada, a tela passa a usar a anterior como cursor, sem recarregar.

**O banco.** A migration da S03 (`20261007105848`) deixou em `follows` a policy de SELECT descrita
acima, o DELETE para qualquer das duas partes e o índice `follows_followee_recentes_idx (followee_id,
created_at desc)` para "quem me segue". "Quem eu sigo" usa a PK `(follower_id, followee_id)`. A
`pode_ver_rede` é `SECURITY DEFINER`, com `search_path` vazio e EXECUTE só para `authenticated`.

**Só entra na rede quem tem username (achado I1 da revisão independente; decisão do Micael em
10/11, como no Instagram).** As listas só mostram quem tem username, porque sem ele a pessoa não tem
página. Toda conta nova nasce sem username, e nada impedia uma conta sem username de seguir alguém,
nem um seguidor aceito de zerar o próprio username pela Data API. O seguidor ficava invisível na lista
do dono, não podia ser removido (a rota o procura pelo username) e continuava vendo a rede; o contador
o contava. A correção tem três camadas:
- **a rota de seguir** recusa a sessão sem username (403 `sem_username`), e o perfil mostra, no lugar
  do Seguir/Solicitar, o aviso para escolher um nome de usuário, com o link para `/dashboard/perfil`.
  Deixar de seguir e cancelar continuam;
- **a migration de PROPOSTA `20261110200043_social_exigir_username`**, no fluxo da S04 (CI verde e
  merge do Fernando):
  - a policy `follows_insert` exige username nas duas pontas;
  - um trigger `BEFORE UPDATE OF username` em `profiles` recusa voltar a nulo um username que já
    existia (23514, `profiles_username_nao_volta_a_nulo`), também para a chave de serviço e o SQL
    direto. A primeira escolha e a troca por outro nome continuam livres;
  - a `contar_rede` conta só vínculos em que a outra ponta tem username, como as listas;
  - os vínculos legados com uma ponta sem username saem: é a remoção silenciosa do RF09.9. No banco
    local eram **0 de 92**;
- **o perfil** já recusava apagar o username: a rota `/api/social/perfil` responde 400 (o
  `usernameSchema` não aceita nulo nem vazio, `tests/lib/perfil-schema.test.ts`), e a tela bloqueia o
  envio vazio (`e2e/editar-perfil.spec.ts`). Nada mudou ali.

## 2. Arquivos afetados

- `lib/social/rede.ts` (criar): `podeVerRede`, `listarRede` (as duas listas, com cursor e foto
  assinada) e `removerSeguidor`.
- `lib/schemas/rede.ts` (criar): a consulta das listas (`cursor`, no formato de username).
- `app/api/social/perfis/[username]/lista-da-rede.ts` (criar): o GET das duas listas, que os dois
  `route.ts` chamam.
- `app/api/social/perfis/[username]/seguidores/route.ts` e `seguindo/route.ts` (criar): `GET`.
- `app/api/social/seguidores/[username]/route.ts` (criar): `DELETE` (remover seguidor).
- `app/(rede-social)/u/[username]/lista-da-rede.tsx` (criar): a tela das duas listas.
- `app/(rede-social)/u/[username]/seguidores/page.tsx` e `seguindo/page.tsx` (criar).
- `app/(rede-social)/u/[username]/page.tsx` (editar): os contadores viram links quando a rede é
  visível; sem username, o aviso no lugar do Seguir.
- `supabase/migrations/20261110200043_social_exigir_username.sql` (criar, **proposta**): a policy, o
  trigger, a `contar_rede` e o legado. `types/database.ts` não muda (conferido com `gen types`).
- `lib/social/perfil-visto.ts` (editar): `temUsername` e o campo `sem_username` do perfil visto.
- `app/api/social/perfis/[username]/seguir/route.ts` (editar): o POST recusa a sessão sem username.
- `docs/pfc/03-publico/14-requisitos-funcionais.md` (editar): o detalhamento do RF09 diz quem vê as
  listas.
- Testes:
  - `tests/api/social-rede-route.test.ts` e o dublê `tests/api/rede-dubles.ts` (criar);
  - `tests/rls/10-listas.test.ts` e `tests/rls/11-exigir-username.test.ts` (criar);
  - `tests/rls/09-solicitacoes.test.ts` (editar: o teste que zerava o username da Ana pela Data API,
    o que a migration agora proíbe);
  - `tests/api/social-seguir-route.test.ts`, `tests/api/social-perfil-visto-route.test.ts` e o dublê
    `tests/api/perfil-visto-dubles.ts` (editar: o username de quem vê);
  - `e2e/listas.spec.ts` (criar).

`/dashboard/perfil` não mostra contadores, então não muda.

## 3. Passos

1. Plano.
2. `lib/social/rede.ts`, o schema e as rotas, com a integração.
3. Teste de RLS, que também roda a lib contra o PostgREST de verdade, inclusive a paginação com
   empate.
4. Telas das listas, links nos contadores e E2E com screenshots.
5. Mutação, EXPLAIN, bateria, evidências e commit local. Push e PR só com o aval do Micael.

## 4. O que testar

*Preenchido antes da implementação.*

**Testes automatizados:**

- [ ] **Integração** das rotas:
  - `GET /perfis/[username]/seguidores` e `/seguindo`: 200 com as pessoas (username, nome, foto
    assinada e selo de privado, sem `id`), o `proximo` e o `proprio`, sem cache compartilhado; o
    cursor vai à lib como veio; 401; **403** quando `pode_ver_rede` diz não, sem listar nada; 400
    com username ou cursor fora do formato, sem consultar; 400 com `cursor_invalido` quando o
    cursor não acha o vínculo; 404 quando ninguém usa o username; erro do banco sem a mensagem crua;
  - `DELETE /seguidores/[username]`: 200, remove só o vínculo aceito daquela pessoa com a sessão
    como followee; 400 com username fora do formato; 404 com `perfil_nao_encontrado` e com
    `nao_e_seguidor`; 401; erro do banco sem a mensagem crua.
- [ ] **RLS** (`tests/rls/10-listas.test.ts`), com usuários do seed logados de verdade:
  - a Carla, que não segue o Bruno (privado), não vê pela Data API o vínculo dele com um perfil
    privado, e a `pode_ver_rede` dela para o Bruno é falsa; a Ana, seguidora aceita, vê os dois, e
    a lista dela pela lib traz os dois;
  - pendentes não aparecem para terceiros nem nas listas, nem na do próprio dono;
  - só o followee remove o próprio seguidor: a Carla apagando o vínculo da Ana com o Bruno não
    afeta linha nenhuma; `removerSeguidor` do Bruno leva a Ana e não leva uma pendente; a Ana pode
    pedir de novo;
  - o visitante sem sessão não lê;
  - a paginação contra o PostgREST de verdade: 25 seguidores com o mesmo `created_at` e mais alguns
    com outros, em páginas de 20, sem duplicata, sem salto e na ordem combinada; o mesmo para a
    lista de seguindo; o cursor de quem saiu da lista volta como inválido; conta sem username não
    aparece.
- [ ] **E2E (`chromium` e `mobile`, com screenshots)**:
  - clicar em "N seguidores" no perfil abre a lista, e voltar retorna ao perfil; o mesmo com "N
    seguindo";
  - "Ver mais" traz a página seguinte, com o cursor, e some na última (respostas simuladas: o seed
    não tem 20 seguidores; a paginação real é provada na RLS);
  - em perfil privado sem acesso, os contadores não são links, e a lista dá "Esta conta é privada";
  - remover pede confirmação, tira a pessoa, anuncia, põe o foco no título, e o contador do perfil
    cai ao voltar; o removido segue de novo;
  - sessão vencida ao remover oferece entrar de novo;
  - nenhuma requisição do navegador vai a `/rest/v1/follows`;
  - no fim, os vínculos criados saem.
- [ ] **Exigir username** (acrescentado com a revisão; cada um falhou antes da correção):
  - RLS 11: conta sem username não segue pela Data API; ninguém segue conta sem username; o seguidor
    aceito não zera o próprio username, nem o SQL direto; a `contar_rede` bate com a lista; a
    migration apaga só os vínculos legados;
  - integração: `POST .../seguir` com sessão sem username responde 403 `sem_username` e não grava;
  - E2E: quem não tem username vê o aviso no lugar do Seguir, e o contador bate com a lista;
  - E2E (m2): uma remoção que termina depois de um recarregamento não traz a pessoa de volta.
- [ ] **Mutação** no código e na migration.

**Roteiro de teste manual.**

1. Entrar como `teste.d@viajamais.local` / `viajamais123`, abrir `/u/carla` e clicar em **Seguir**.
2. Sair e entrar como `teste.a@viajamais.local`; abrir `/u/carla`. → "1 seguidor" é um link.
3. Clicar em **1 seguidor**. → `/u/carla/seguidores`, "Seguidores de @carla", com o Davi.
4. Voltar. → `/u/carla`.
5. Abrir `/u/bruno` (privado). → Os contadores não são links. Abrir `/u/bruno/seguidores` à mão. →
   "Esta conta é privada".
6. Sair e entrar como `teste.c@viajamais.local`; abrir `/u/carla/seguidores`. → O Davi com
   **Remover**.
7. **Remover** → confirmar. → O Davi sai, e a tela anuncia a remoção. Voltar ao perfil. → "0
   seguidores".
8. Entrar como o Davi e abrir `/u/carla`. → "Seguir" de novo; ele não foi avisado.
9. No celular (DevTools), o mesmo fluxo.

## 5. O que validar

*Escrito antes da implementação.*

- [ ] No perfil, "N seguidores" e "N seguindo" levam a `/u/<username>/seguidores` e `/seguindo`
  quando a rede é visível; em perfil privado sem acesso, continuam visíveis e não são links
- [ ] As listas mostram só vínculos aceitos, do mais recente para o mais antigo, com foto, nome,
  @username com link ao perfil e o selo de privado; conta sem username não aparece
- [ ] 20 por vez, com "Ver mais"; sem duplicata nem salto entre as páginas, também com empate
- [ ] O cursor não revela `id` nem data: é o username da última pessoa mostrada
- [ ] `GET` das listas de perfil privado sem acesso responde 403 e não lista ninguém; a tela diz que
  a conta é privada
- [ ] Na própria lista de seguidores, Remover pede confirmação, tira a pessoa na hora, anuncia e põe
  o foco no título; o contador do perfil cai
- [ ] Remover é silencioso e sem barreira: o removido não é avisado e pode seguir ou pedir de novo
- [ ] Só o dono remove os próprios seguidores; o followee vem da sessão, e a URL só diz quem sai;
  uma pendente não é removida por esta rota
- [ ] Nas listas de outras pessoas e na própria lista de seguindo, não há botão
- [ ] A resposta não leva `id`; a foto sai por URL assinada, sem cache compartilhado
- [ ] Nenhuma escrita parte do navegador; nenhum `supabase.from` na tela
- [ ] Erro do banco não volta cru
- [ ] Funciona em mobile e desktop; feedback por `toast()`; carregando, vazio, erro, sessão vencida,
  privado e não encontrado tratados
- [ ] Sem username, ninguém entra na rede: a rota de seguir responde 403 e a tela mostra o aviso; a
  policy recusa pela Data API; quem já tem username não volta a ficar sem; o contador é o número da
  lista; não sobra vínculo legado
- [ ] ~~Autorização via `exigirMembro` / `exigirDono`~~ — não se aplica: a rede não é recurso de
  viagem; a autorização é a `pode_ver_rede`, chamada pela rota (bloco 1)

## 6. Riscos e pendências (insumo da seção 25)

- **Que um perfil público segue um privado é visível** (decisão da S03, como no Instagram): o
  vínculo está na lista do público. A rota do privado dá 403 mesmo assim; quem junta as listas
  públicas consegue reconstruir parte dos seguidores de um privado. É do desenho da S03.
- **Data API direta:** vale a pendência do limite de taxa registrada no `S05-M-seguir`.
- **Cursor de quem saiu da lista:** volta como `cursor_invalido`, e a tela recarrega do começo
  (bloco 1).
- **A migration é de proposta**, e o merge espera o Fernando, como na S04. Para ele, a conferência do
  legado no projeto hospedado (a consulta está no cabeçalho da migration).
- **Quem grava em `follows` sem RLS** (a chave de serviço, o seed) não passa pela policy. A aplicação
  não grava ali com a chave de serviço; se um dia gravar, a regra precisa ir para um trigger em
  `follows`.
- **A policy de SELECT avalia a `pode_ver_rede` por linha** quando quem vê não é parte do vínculo
  (EXPLAIN). Com volume, isso pesa nas listas grandes. É do desenho da S03, e não muda aqui.
- **Sugestão para a plataforma (migration):** a lista de seguindo usa a PK `(follower_id,
  followee_id)` e ordena em memória os vínculos de uma pessoa. Com volume, um índice `(follower_id,
  created_at desc)` faria para o seguindo o que o `follows_followee_recentes_idx` já faz para os
  seguidores.
- **Achado do screenshot do celular, corrigido com teste de regressão que falhou antes**
  (`S05-M-listas-regressao-antes.txt`): com o Remover ao lado, o nome da pessoa era cortado com
  reticências ("Davi Teste" virava "Davi Tes…"). No celular, o botão passou para baixo do nome, como
  nas Notificações, e o E2E confere que o nome cabe inteiro.
- **Achados de teste, não de produto, corrigidos durante a escrita:**
  - a primeira versão da RLS 10 só limpava os vínculos entre usuários do seed, e o vínculo de uma conta
    descartável com o Bruno passava para o teste seguinte. A limpeza passou a tirar todo vínculo da
    Ana, do Bruno e da Carla, que o seed deixa sem vínculo nenhum;
  - o E2E do perfil privado procurava qualquer lista na página e achava os menus. Ele passou a
    procurar a lista de seguidores do Bruno.
- **Revisão independente (agente `seguranca`) sobre o `98883d3`:** dois achados, confirmados no
  código. Cada correção começou por um teste de regressão que **falhou antes**
  (`S05-M-listas-regressao-antes.txt`):
  - **I1 (Importante, corrigido):** um seguidor sem username ficava invisível na lista, não podia ser
    removido e continuava vendo a rede. O Micael decidiu exigir username (bloco 1);
  - **m2 (Menor, corrigido):** um 404 ao remover recarregava a lista, e, se outra remoção terminasse
    antes da resposta, a pessoa já removida voltava à tela. Agora a tela conta as remoções concluídas, e
    a resposta de uma carga pedida antes da última é descartada e a carga, refeita. A mesma correção
    nas Notificações vai num commit separado, fora desta atividade.
- **Achado da mutação, corrigido:** "username perguntado sobre o perfil, e não sobre a sessão"
  sobrevivia, porque o dublê responde o mesmo username a qualquer `id`. O teste do 403 passou a
  conferir que o username lido é o da sessão.
- **A mutação da migration não foi executada:** as 10 sabotagens estão no script, atrás de
  `MUTAR_BANCO=1`, e a execução foi negada pela trava de permissão do ambiente (ela derruba e recria
  o trigger e a função e reescreve a migration no disco). Pendente da autorização do Micael.
- **O `ConfirmModal` (achado m1 da `S05-M-pesquisa`)** devolve o foco ao body no Cancelar também
  aqui. É do componente compartilhado, e não desta atividade.
- **"Ver mais" no E2E usa respostas simuladas**, porque o seed não tem 20 seguidores de ninguém. A
  paginação real, com empate, é provada na RLS 10 contra o PostgREST de verdade.

## 7. Evidência

- [ ] Saída dos testes em `docs/pfc/evidencias/S05-M-listas-*`, regravada em 10/11 depois das duas
  rodadas (a da implementação e a da revisão independente):
  - `S05-M-listas-integracao.txt`: 71 de 71 (as listas, seguir e o perfil visto);
  - `S05-M-listas-rls.txt`: 185 de 185, com o detalhe dos 14 testes das listas e dos 8 do exigir
    username;
  - `S05-M-listas-mutacoes.txt`: 58 de 58 mortas no código. A mutação da migration ficou pendente
    (bloco 6);
  - `S05-M-listas-regressao-antes.txt`: o nome cortado no celular (1ª rodada) e, da revisão, o I1 na
    integração, na RLS e no E2E, e o m2 no E2E, que **falharam antes**;
  - `S05-M-listas-e2e.txt`: 18 de 18, em `chromium` e `mobile`, no build de produção;
  - `S05-M-listas-explain.txt`: as duas listas sob RLS, e a policy `follows_insert` e a `contar_rede`
    novas;
  - `S05-M-listas-advisors.txt`: nenhum advisor cita os objetos da migration; `db lint` limpo; os
    tipos não mudam.
  - A suíte inteira deu 632 testes de unidade e integração, RLS 185 de 185 e E2E 121 passando, com 1
    pulado de propósito (o clique do meio da pesquisa). No fim, nenhum vínculo da Ana, do Bruno nem
    da Carla sobrou, o Davi ficou com os mesmos vínculos da população, e as contas criadas pelos
    testes saíram.
  - A migration foi aplicada com `migration up --local`, sem reset. A aplicação limpa do zero fica com
    o CI, como na S04.
- [ ] Screenshots do fluxo (chromium e mobile): `S05-M-listas-seguidores-*` (a lista aberta pelo
  contador), `S05-M-listas-privado-*` (perfil privado sem acesso), `S05-M-listas-remover-*` (a
  confirmação), `S05-M-listas-removido-*` (depois de remover) e `S05-M-listas-sem-username-*` (o
  aviso no lugar do Seguir)
- [ ] Delta de cobertura (`S05-M-listas-cobertura.txt`): os seis arquivos novos e os dois alterados
  pela correção (`lib/social/perfil-visto.ts` e a rota de seguir), com 100% de linhas, ramos e funções
- [ ] Revisão adversarial independente (agente `seguranca`) sobre o `98883d3`: I1 e m2 corrigidos com
  regressão que falhou antes (bloco 6)
