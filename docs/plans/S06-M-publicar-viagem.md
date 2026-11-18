---
id: S06-M-publicar-viagem
titulo: Publicar viagem no perfil, sem vazar despesas nem os outros membros
trilha: T1
responsavel: micael
revisor: fernando
semana: S06
requisitos: [RF09.7, RF09.13, RF09.14]
secoes_doc: [14, 16, 22.1, 25]
branch: feat/S06-M-publicar-viagem
tipo: [migration, rls, route-handler, regra-de-negocio, tela]
depende_de: [S05-M-listas, helper lib/trips/publico.ts (Audrey), página trips/[id]/publicar (Audrey), helper de membros da viagem (Fernando ou Audrey), aval da migration post_tags (Fernando)]
status: em-desenvolvimento
---
# Publicar viagem no perfil, sem vazar despesas nem os outros membros

> **Micael** · semana **S06** · decisões do Micael em 11/11. É a primeira de três atividades da S06,
> empilhadas: esta (banco, rotas, a tela de publicar e, desde 16/11, a marcação de membros) e
> `S06-M-posts-no-perfil` ("Viagens publicadas" no `/u/<username>` e o detalhe em `/feed/<postId>`).
> A antiga `S06-M-marcacao` entrou nesta atividade (decisão do Micael em 16/11).

## 1. Contexto

O RF09.7 pede publicar uma viagem expondo só título, destino, datas, capa e itinerário, e nunca
despesas, orçamento ou os demais membros. É o ponto técnico da seção 25: a viagem é dado privado do
grupo, e o post é a única janela dela para fora.

**Decisões do Micael (11/11).**
- **Qualquer membro publica** (`exigirMembro`), e cada membro tem **o próprio post** da mesma viagem
  (`unique (trip_id, author_id)`), que aparece no perfil dele. Cada um despublica só o seu.
- **O post é uma cópia.** Ao publicar, o post guarda título, destino, datas e os itens escolhidos.
  Editar a viagem depois não muda o post; "Atualizar publicação" copia de novo. Excluir a viagem
  apaga os posts dela. Se o autor sai da viagem, o post continua dele.
- **Itinerário.** O título do item entra sempre. **Local, descrição, data e hora e categoria** são
  opcionais, escolhidos pelo autor **para o post inteiro**. **Notas, coordenadas e preço nunca
  entram.** Cada item tem uma caixa; os de hospedagem vêm desmarcados, mas podem ser marcados. Itens
  cancelados não aparecem.
- **Capa:** upload opcional, num bucket privado, servida por URL assinada como a foto de perfil.
  Sem capa, o post mostra um fundo com o destino.
- **Membros:** o post nunca mostra a lista de membros da viagem. Outros participantes só aparecem
  por marcação (ver "Marcação", abaixo).
- **Despublicar** apaga o post e a capa. Não há legenda.

**Quem lê.** A visibilidade segue o perfil do autor, pela `pode_ver_rede(author_id)` da S03: o
próprio autor, qualquer autenticado se o perfil for público, ou seguidor aceito se for privado.
Visitante sem sessão não lê nada. Só publica quem tem username, porque o post vive na página
`/u/<username>`.

**O vazamento que não é óbvio: o `trip_id`.** Se dois membros publicam a mesma viagem, os dois posts
carregam o mesmo `trip_id`. Quem lê os dois pela Data API descobre que essas pessoas viajaram juntas,
que é exatamente "os demais membros". Por isso:
- `authenticated` **não tem SELECT na coluna `trip_id`** (grant por coluna);
- o autor acha o próprio post de uma viagem pela função `social_meu_post_da_viagem(viagem uuid)`,
  `SECURITY DEFINER`, que só responde sobre `auth.uid()`;
- as rotas são chaveadas pela viagem (`/api/social/viagens/[tripId]/post`) e nunca devolvem
  `trip_id`, `author_id` nem os `id` dos itens a quem lê.

**O banco garante o formato da cópia.** `items` é um `jsonb` com um array de objetos. Um `CHECK`, por
uma função `immutable`, aceita só as chaves `title`, `date`, `start_time`, `end_time`, `category`,
`location` e `description`, com tipos e tamanhos dos limites do itinerário, e no máximo 200 itens.
Assim nem uma escrita direta pela Data API grava `notes`, coordenadas, preço ou o `id` do item.

**Escritas.** Como na S05, a rota escreve com o cliente da sessão, e a RLS é a segunda linha:
- INSERT: `author_id = auth.uid()`, o autor é membro da viagem (`is_trip_member`) e tem username;
- UPDATE: só o autor, ainda membro, e só nas colunas do conteúdo (grant por coluna); `trip_id`,
  `author_id` e `created_at` não mudam;
- DELETE: só o autor, mesmo que já tenha saído da viagem.

**Escrita direta pela Data API (decisão do Micael em 11/11, opção A):** fica a policy de INSERT,
como em `follows`. Com ela, um membro consegue gravar pela Data API um post da própria viagem com
texto inventado, sem passar pelo zod nem pelo helper; o `CHECK` acima impede que ele inclua campo
proibido, mas não o texto livre, que é dele. A alternativa recusada era tirar a escrita de
`authenticated` e gravar pela rota com a chave de serviço, o que deixaria a escrita sem a RLS como
segunda linha.

**A capa.** Bucket privado `capas-posts`, 2 MB, `image/jpeg`, `image/png` e `image/webp`, sem policy
de usuário. A rota envia com a chave de serviço para `<author_id>/<uuid>.<ext>`, conferindo a
assinatura dos bytes (`tipoDaImagem` de `lib/social/foto.ts`). Um `CHECK` exige esse formato e a
pasta do autor em `cover_path`. A URL assinada vale 10 min e é reaproveitada por 5, como no avatar.
Trocar ou despublicar apaga o arquivo antigo.
- **Limite conhecido:** excluir a viagem apaga os posts em cascata, mas o arquivo da capa fica no
  bucket. Ele fica inalcançável, porque só se assina caminho que está num post, mas ocupa espaço. É a
  mesma pendência da ação 4 da foto, e fica registrada, sem correção nesta atividade.

**Fronteira com a Audrey.** `trips` e `itinerary_items` são dela. Esta atividade depende de:
1. `lib/trips/publico.ts`, com `projecaoPublicaDaViagem(supabase, tripId)`: título, destino e datas
   da viagem; de cada item não cancelado, `id`, `title`, `date`, `start_time`, `end_time`,
   `category`, `location` e `description`, em ordem de data e hora. Nada de `notes`, coordenadas,
   `status`, `budget`, `currency`, descrição da viagem nem membros, e um unit test que trava as
   chaves;
2. `app/dashboard/trips/[id]/publicar/page.tsx`, que só renderiza `<PublicarViagem tripId={id} />`;
3. o botão "Publicar no feed" na tela da viagem, para qualquer membro, que vira "Publicada ·
   gerenciar" quando a pessoa já publicou (pelo `postDaViagem` de `lib/social/posts.ts`).

Enquanto o helper não existe, a integração usa um dublê com o mesmo contrato, e o E2E espera a
página dela.

**Marcação (decisões do Micael em 16/11; RF09.13 e RF09.14).** Substituem o item 7 de 11/11.
- No diálogo de publicar, a opção **"Marcar membros"**: o autor escolhe **só entre os membros da
  viagem** que têm username; quem não tem aparece desabilitado. Ninguém marca a si mesmo.
- A pessoa marcada vê os posts em que foi marcada na **aba "Marcações" do `/u/<username>` dela** e
  remove a própria marcação ali, com `ConfirmModal`. Sem aviso no sino.
- **Ser marcado não abre o post** (opção 2, como no Instagram): se o autor é privado e a pessoa
  marcada não o segue com vínculo aceito, ela vê só quem a marcou e o botão de remover. A
  `trip_posts` e a policy de leitura dela, já aprovadas, não mudam.
- A marca continua se a pessoa sair da viagem (como o post); some com o post; o autor desmarca.
- **Banco:** migration separada `20261116234030_social_post_tags.sql` (proposta, aval do Fernando).
  Tabela `post_tags (post_id, tagged_id, author_id, created_at)`, PK `(post_id, tagged_id)`;
  `author_id` repete o autor para a pessoa marcada saber quem a marcou sem ler o post. A RLS não
  consegue checar a filiação de outra pessoa pelas `is_trip_*` (só respondem sobre quem pergunta,
  B1/#34), então a função `social_pode_marcar(post, marcado)`, `SECURITY DEFINER`, responde só
  dentro do post da sessão, enquanto ela participa da viagem. A rota confere de novo pelo helper de
  membros (regra 2: a RLS é a segunda linha).

## 2. Arquivos afetados

- `supabase/migrations/<timestamp>_social_trip_posts.sql` (criar, **proposta**, aval do Fernando):
  tabela, grants por coluna, `CHECK` dos itens e da capa, policies, `social_meu_post_da_viagem`,
  trigger de `updated_at`, índice `(author_id, created_at desc)` e o bucket `capas-posts`.
- `types/database.ts` (regenerado).
- `lib/social/posts.ts` (criar): `montarPost` (pura: projeção + itens escolhidos + campos ligados →
  cópia), `postDaViagem`, `publicar`, `atualizar`, `despublicar`.
- `lib/social/capa.ts` (criar): caminho, envio, remoção e `assinarCapas`, reaproveitando
  `lib/social/foto.ts`.
- `lib/schemas/post.ts` (criar): `{ itens: uuid[], mostrar: { local, descricao, horario, categoria } }`;
  com a marcação, ganha `marcados: uuid[]` (vazio por padrão).
- `supabase/migrations/20261116234030_social_post_tags.sql` (criar, **proposta**, aval do Fernando).
- `lib/social/marcacoes.ts` (criar): sincronizar as marcas ao publicar e atualizar, listar os marcados
  (nome, username, foto), remover a minha marca, posts em que alguém foi marcado.
- `app/api/social/marcacoes/[postId]/route.ts` (criar): `DELETE` remove a marca da sessão.
- `app/api/social/perfis/[username]/marcacoes/route.ts` (criar): `GET` da aba Marcações.
- `app/api/social/viagens/[tripId]/post/route.ts` (criar): `GET` (a projeção para a prévia e o post
  da sessão, se houver), `POST`, `PATCH` e `DELETE`.
- `app/api/social/viagens/[tripId]/post/capa/route.ts` (criar): `PUT` (multipart) e `DELETE`.
- `components/social/publicar-viagem.tsx` (criar): a tela.
- `docs/pfc/03-publico/14-requisitos-funcionais.md` (editar): o detalhamento do RF09.7 com as
  decisões de 11/11.
- Testes:
  - `tests/lib/social-posts.test.ts` (criar);
  - `tests/api/social-post-route.test.ts`, `tests/api/social-post-capa-route.test.ts` e o dublê
    `tests/api/post-dubles.ts` (criar);
  - `tests/rls/12-trip-posts.test.ts` (criar) e `tests/rls/17-post-tags.test.ts` (criar);
  - integração das duas rotas de marcação e dos `marcados` no POST/PATCH do post;
  - `e2e/publicar-viagem.spec.ts` (criar).

## 3. Passos

1. Plano, pedido à Audrey e pedido de aval ao Fernando.
2. Desenho do SQL aprovado pelo Micael; proposta de migration, aplicada com `migration up --local`;
   tipos.
3. RLS 12 com os usuários do seed.
4. `lib/social/posts.ts`, `capa.ts` e o schema, com unit.
5. Rotas, com integração.
6. Tela (rascunho aprovado pelo Micael) e E2E com screenshots, quando a página da Audrey existir.
7. Mutação, advisors, EXPLAIN, revisão independente do `seguranca`, evidências e commit local. Push
   e PR só com o aval do Micael.

## 4. O que testar

*Preenchido antes da implementação.*

**Testes automatizados:**

- [ ] **Unit** (`montarPost`, cobertura ≥ 70%):
  - com todos os campos opcionais desligados, cada item tem só `title`;
  - cada campo ligado aparece, e os desligados não aparecem nem como `null`;
  - `notes`, coordenadas, `status` e `id` nunca aparecem, mesmo que a projeção os traga;
  - item escolhido que não está na projeção (cancelado, de outra viagem ou inventado) é ignorado;
  - a ordem dos itens é a da projeção; lista vazia publica a viagem sem itinerário.
- [ ] **Integração** de `/api/social/viagens/[tripId]/post`:
  - `POST`: **201** grava a cópia montada da projeção, nunca do corpo; **401** sem sessão; **403**
    não-membro, sem gravar; **403** `sem_username`; **400** corpo inválido (item fora do formato,
    chave extra em `mostrar`, mais de 200 itens), sem consultar; **409** quando a sessão já
    publicou essa viagem; erro do banco sem a mensagem crua;
  - `PATCH`: **200** copia de novo; 401; 403 de quem saiu da viagem; 404 sem post; 400;
  - `DELETE`: **200** apaga o post e a capa; 401; 404 sem post; funciona para quem saiu da viagem;
  - `GET`: 200 com a prévia e o estado; 401; 403 não-membro;
  - nenhuma resposta traz `trip_id`, `author_id`, `budget`, `currency`, `notes`, e-mail nem membros;
    todas com `Cache-Control: private, no-store`.
- [ ] **Integração** da capa: `PUT` 200 com imagem válida; 400 com bytes que não são imagem, acima de
  2 MB ou sem arquivo; 404 sem post; 401; 403 não-membro; a capa antiga é apagada; `DELETE` 200.
- [x] **RLS** (`tests/rls/12-trip-posts.test.ts`, 43 testes, em 11/11), com contas descartáveis
  logadas de verdade pela Data API (criadas como no seed, para não mexer na população local):
  - **leitura:** post de autor público é lido por qualquer autenticado; de autor privado, só pelo
    autor e por seguidor aceito; o pendente e o não-seguidor recebem vazio; o visitante sem sessão
    não lê; o seguidor removido perde o acesso;
  - **o `trip_id`:** um terceiro que lê dois posts da mesma viagem não consegue ler o `trip_id`
    (42501), nem filtrar por ele; `social_meu_post_da_viagem` devolve o post da sessão e `null` para
    o post de outra pessoa;
  - **escrita:** não-membro não insere (42501); membro não insere com `author_id` de outra pessoa;
    sem username não insere; o mesmo autor não publica a mesma viagem duas vezes (23505); o autor não
    muda `trip_id` nem `author_id`; outra pessoa não altera nem apaga o post (0 linhas); quem saiu da
    viagem não atualiza, mas apaga;
  - **o formato:** inserir `items` com `notes`, `latitude`, `price`, `id` ou um campo desconhecido
    falha (23514); `cover_path` fora da pasta do autor falha (23514);
  - **a cascata:** excluir a viagem apaga os posts dela;
  - **as tabelas de outros domínios continuam fechadas:** ler o post não dá acesso a `trips`,
    `expenses` nem `trip_members` da viagem;
  - **o caso legítimo:** dois membros publicam a mesma viagem, cada um com o seu post.
- [x] **RLS da marcação** (`tests/rls/17-post-tags.test.ts`, 22 testes, em 16/11): a autora marca
  membro com username; não marca quem não foi na viagem, membro sem username, a si mesma, nem em
  post de viagem alheia; outro membro não marca nem forja a autora; quem saiu da viagem não marca;
  sem UPDATE; anon não lê nem escreve; marcas de post público lidas por qualquer autenticado, de
  privado só por seguidor aceito; **o marcado que não segue o autor privado vê a própria marca e o
  autor, mas não o post**; terceiro não apaga; o marcado remove a sua mesmo sem ver o post; a
  autora desmarca; cascata do post; a marca fica quando o marcado sai; a função só responde sobre
  o post da sessão; anon não a executa.
- [ ] **Integração da marcação:** `POST`/`PATCH` com `marcados` — 400 para quem não é membro, para
  si mesmo e acima do limite, sem gravar; a resposta lista os marcados sem id interno nem e-mail;
  `DELETE /api/social/marcacoes/[postId]` — 200 remove a da sessão, 401, 404 sem marca; `GET` da aba
  — 200 com post visível e com o "marcou você numa publicação que só os seguidores veem", 401, perfil
  privado da pessoa marcada fechado a quem não a segue.
- [ ] **E2E** (`chromium` e `mobile`, com screenshots):
  - marcar membros no diálogo; o nome aparece no post; remover a própria marca pela aba Marcações;
  - na tela de publicar, a prévia mostra exatamente o que fica público; ligar e desligar local,
    descrição, data e hora e categoria muda a prévia; hospedagem vem desmarcada;
  - publicar mostra a confirmação e o estado "Publicada"; atualizar copia de novo; despublicar pede
    confirmação (`ConfirmModal`) e volta ao estado inicial;
  - capa: enviar, trocar e remover; arquivo que não é imagem mostra o erro;
  - a resposta da rota, vista pelo navegador, não tem `budget`, `currency`, `notes`, e-mail nem
    membros;
  - nenhuma requisição do navegador vai a `/rest/v1/trip_posts`;
  - sessão vencida ao publicar oferece entrar de novo;
  - no fim, os posts criados saem.
- [ ] **Mutação** no código e na migration (cada policy, grant por coluna, `CHECK` e a função),
  com o script copiando e devolvendo os dados, e não só o schema.

**Roteiro de teste manual.**

1. Entrar como `teste.a@viajamais.local` / `viajamais123` numa viagem com itens de hospedagem, de
   restaurante e um cancelado, com orçamento e com notas preenchidas, e com `teste.d` como membro.
2. Na tela da viagem, clicar em **Publicar no feed**. → A prévia lista os itens, sem o cancelado, com
   a hospedagem desmarcada; não aparece orçamento, moeda, nota nem membro.
3. Ligar **Local** e **Data e hora**. → A prévia passa a mostrá-los.
4. Enviar uma capa e clicar em **Publicar**. → "Publicada", e o botão da tela da viagem vira
   "Publicada · gerenciar".
5. Sair e entrar como `teste.d`; publicar a mesma viagem. → Ele tem o próprio post.
6. Sair e entrar como `teste.c`; pela Data API (DevTools), pedir `trip_posts?select=trip_id`. → 401
   ou 42501, sem `trip_id`.
7. Voltar como `teste.a`, **Despublicar** e confirmar. → O post e a capa somem; o de `teste.d`
   continua.
8. No celular (DevTools), o mesmo fluxo.

## 5. O que validar

*Escrito antes da implementação.*

- [ ] A resposta de `GET /api/social/viagens/[tripId]/post` e o post gravado não têm `budget`,
  `currency`, `notes`, coordenadas, `status`, a descrição da viagem, e-mail nem a lista de membros; o
  teste confere as chaves exatas, e não só a ausência de algumas.
- [ ] Um autenticado que lê os posts de dois membros da mesma viagem pela Data API não consegue saber
  que são da mesma viagem: o `trip_id` não é legível.
- [ ] Post de perfil privado não é lido por quem não segue com vínculo aceito, nem pela Data API.
- [ ] `POST` com sessão de quem não está em `trip_members` responde 403 e não grava; a cópia vem
  da projeção do servidor, e item escolhido fora dela é ignorado.
- [ ] Nem pela Data API dá para gravar `items` com campo fora da lista permitida.
- [ ] `trip_posts` tem RLS habilitada e policy para cada operação usada (SELECT, INSERT, UPDATE,
  DELETE); a migration segue `<timestamp>_social_<descricao>.sql` e aplica limpa no CI.
- [ ] `types/database.ts` regenerado e commitado junto.
- [ ] Corpo validado por zod e passado campo a campo, sem spread; a autorização (`exigirMembro` e o
  username) é checada no servidor antes da RLS.
- [ ] A chave de serviço só envia, apaga e assina a capa, e só em caminho na pasta do autor; não lê
  dado da aplicação.
- [ ] Tela funciona em mobile e desktop; feedback por `toast()`, confirmação por `ConfirmModal`,
  sem `alert()` nem `confirm()`; estados de carregamento e de erro tratados.
- [ ] Nada consulta `trips` nem `itinerary_items` fora de `lib/trips/publico.ts`.
- [ ] Ser marcado não dá leitura do post: a policy `trip_posts_select` é idêntica à aprovada em 11/11.
- [ ] Só membros da viagem com username são marcáveis, conferido na rota e na RLS.
- [ ] Tags `@RF09.7`, `@RF09.13` e `@RF09.14` no código e nos testes; `pfc:rastreabilidade` sem
  inconsistência nova.

## 6. Evidência

- [ ] Saída dos testes (unit, integração, RLS e E2E)
- [ ] Screenshots do fluxo em `docs/pfc/evidencias/`
- [ ] Delta de cobertura de `lib/social/`
- [ ] Mutação, advisors e EXPLAIN

## 7. Decisões

- 11/11: as decisões de produto do bloco 1, tomadas pelo Micael.
- 11/11: a policy de UPDATE usa `trip_id` sem que `authenticated` tenha SELECT na coluna. Conferido
  no banco: a expressão da policy não exige o grant de coluna, e a RLS 12 prova os dois lados (o
  autor atualiza; quem saiu da viagem não).
- 11/11: o PR abre como rascunho só com a parte do banco (migration, tipos, RLS 12), para o aval do
  Fernando sobre a migration; o resto entra em commits novos no mesmo PR.
- 11/11: escrita direta pela Data API, opção A — policy de INSERT com o `CHECK` de formato, como em
  `follows` (bloco 1).
