---
id: S05-M-solicitacoes
titulo: Notificações com as solicitações para seguir, aprovar e recusar
trilha: T3
responsavel: micael
revisor: fernando
semana: S05
requisitos: [RF09.3, RF09.4, RF13.2, RF13.4]
secoes_doc: [14, 16, 22.1, 25]
branch: feat/S05-M-solicitacoes
tipo: [route-handler, tela]
depende_de: [S05-M-pesquisa, S05-M-seguir]
status: em-desenvolvimento
---
# Notificações com as solicitações para seguir, aprovar e recusar

> **Micael** · semana **S05** · desenho definido pelo Micael em 10/11, primeira de duas atividades
> (a segunda é a `S05-M-listas`: listas de seguidores e de seguindo, e remover seguidor)

## 1. Contexto

Quem tem perfil privado recebe solicitações para seguir (RF09.2, entregue no `S05-M-seguir`), mas
ainda não tem onde vê-las nem como aprová-las. O Micael definiu o desenho em 10/11, no modelo do
Instagram:

- **As solicitações pendentes ficam em Notificações**, a central `/notificacoes` da seção 16, na
  Zona 1 (Solicitações): acionável e persistente, só sai quando o dono aprova ou recusa.
- **O acesso é um sino com uma bolinha no canto superior direito** da aba Rede social, no desktop e
  no celular. A bolinha mostra quantas solicitações estão pendentes. O menu da aba (Início e
  Pesquisar; no celular, a barra do rodapé) continua como está.
- **Recusar é silencioso**: quem pediu não é avisado e pode pedir de novo (catálogo, RF09.4).

**Fora desta atividade:** a Zona 2 (Atividades: "começou a seguir você", RF13.1, e "aceitou sua
solicitação", RF13.3) e o contador de não-lidas do RF13.4. Elas precisam da tabela
`notifications`, com usuário destino, tipo, ator, referência e marcação de lida, prevista no
detalhamento do RF13: uma migration nova, que precisa do aval do Fernando. Por isso o RF13.4 fica
**Parcial**: a central existe, com a Zona 1, mas sem a Zona 2 e sem não-lidas. A tela não reserva
espaço para a Zona 2.

**O banco já cobre tudo, sem migration.** A migration da S03 (`20261007105848`) deixou em `follows`:

- **SELECT:** as duas partes sempre veem o próprio vínculo, pendente ou aceito;
- **UPDATE:** só o followee, só na coluna `status` (grant de coluna) e só para `accepted` (WITH
  CHECK). Ele aprova e não rebaixa, e não consegue repontar o `follower_id`;
- **DELETE:** qualquer das duas partes (recusar é o followee apagando a pendente);
- **índice parcial** `follows_pendentes_idx (followee_id, created_at desc) where status = 'pending'`,
  criado para esta Zona 1.

**Autorização.** `exigirMembro` e `exigirDono` não se aplicam: a solicitação não é recurso de
viagem. A regra é "só as próprias solicitações": o followee vem sempre de `getUser()`, nunca da URL
nem do corpo, e a URL só diz **quem** pediu. Não existe 403: ninguém tem acesso às solicitações de
outra pessoa nem para ser recusado. A RLS é a segunda linha.

**A contagem da bolinha.** É o total de pendentes, contado pelo banco (`count: exact`) com o mesmo
filtro da lista. Ela se atualiza ao abrir cada página da aba, ao voltar para a janela e na hora em
que o dono aprova ou recusa. Não há tempo real: o projeto não usa Realtime (detalhamento do RF13).

## 2. Arquivos afetados

- `lib/social/solicitacoes.ts` (criar): lista as pendentes, com o total e a foto assinada; aprova;
  recusa.
- `app/api/social/solicitacoes/route.ts` (criar): `GET` (a lista) e `GET ?contagem=1` (só o total,
  para o sino).
- `lib/schemas/solicitacoes.ts` (criar): a consulta do `GET` (`contagem` só aceita `1`).
- `app/api/social/solicitacoes/[username]/route.ts` (criar): `POST` (aprova) e `DELETE` (recusa).
- `app/(rede-social)/sino.tsx` (criar): o sino com a bolinha.
- `app/(rede-social)/layout.tsx` (editar): o sino no canto superior direito da aba.
- `app/(rede-social)/notificacoes/page.tsx` e `notificacoes.tsx` (criar): a central, com a Zona 1.
- `docs/pfc/03-publico/14-requisitos-funcionais.md` (editar): o detalhamento do RF13 diz de onde
  vem a Zona 1.
- Testes:
  - `tests/api/social-solicitacoes-route.test.ts` e o dublê `tests/api/solicitacoes-dubles.ts`
    (criar);
  - `tests/rls/09-solicitacoes.test.ts` (criar);
  - `e2e/solicitacoes.spec.ts` (criar).

As rotas não têm corpo. O username da URL passa pelo `formatoUsernameSchema` que a pesquisa já usa,
e a consulta do `GET` ganhou um schema próprio na correção da revisão (M5).

## 3. Passos

1. Plano.
2. `lib/social/solicitacoes.ts` e as rotas, com a integração.
3. Teste de RLS, que também roda a consulta da lib contra o PostgREST de verdade.
4. Sino, tela de Notificações e E2E com screenshots.
5. Mutação, bateria, evidências e commit local. Push e PR só com o aval do Micael.

## 4. O que testar

*Preenchido antes da implementação.*

**Testes automatizados:**

- [ ] **Integração** das rotas, nos caminhos que existem (sem 403, ver bloco 1):
  - `GET`: 200 com as pendentes (username, nome, foto assinada e selo de privado, sem `id`), da
    mais recente para a mais antiga, com o total, sem cache compartilhado; só as da sessão como
    followee e só `pending`; 401; erro do banco sem a mensagem crua;
  - `POST /[username]`: 200, aprova só a pendente daquela pessoa com a sessão; 400 com username fora
    do formato, sem consultar; 404 quando ninguém usa o username e quando não há pendente; 401;
    erro do banco sem a mensagem crua;
  - `DELETE /[username]`: os mesmos caminhos, apagando só a pendente.
- [ ] **RLS** (`tests/rls/09-solicitacoes.test.ts`), com usuários do seed logados de verdade:
  - o followee (Bruno, privado) vê a solicitação da Ana, aprova (vira `accepted`) e recusa (some);
  - quem pediu não se auto-aprova: o UPDATE da Ana não afeta linha nenhuma, e o vínculo continua
    pendente;
  - a Carla não vê, não aprova e não recusa a solicitação da Ana ao Bruno;
  - o Bruno não troca o `follower_id` (42501) nem rebaixa um vínculo aceito para pendente;
  - o visitante sem sessão não lê;
  - a consulta da lib, contra o PostgREST de verdade, traz as pendentes do Bruno com o total e não
    traz um vínculo aceito.
- [ ] **E2E (`chromium` e `mobile`, com screenshots)**, com o Davi pedindo para seguir o Bruno:
  - o sino fica no canto superior direito, nos dois tamanhos; a bolinha mostra a contagem e some
    com zero;
  - aprovar tira a solicitação da lista, a bolinha some, o anúncio sai e o foco vai ao título; o
    contador de seguidores do Bruno sobe;
  - recusar faz o mesmo, sem seguidor novo;
  - o vazio diz que não há solicitações pendentes;
  - sessão vencida oferece entrar de novo;
  - nenhuma requisição do navegador vai a `/rest/v1/follows`;
  - no fim, os vínculos criados saem.
- [ ] **Mutação** no código.

**Roteiro de teste manual.**

1. Entrar como `teste.d@viajamais.local` / `viajamais123`, abrir `/u/bruno` e clicar em
   **Solicitar**. → "Solicitado".
2. Sair e entrar como `teste.b@viajamais.local` / `viajamais123`; abrir **Rede social**. → O sino
   no canto superior direito, com a bolinha "1".
3. Clicar no sino. → `/notificacoes`, com "Solicitações para seguir (1)" e o Davi.
4. Clicar em **Aprovar**. → O Davi sai da lista, aparece "Nenhuma solicitação pendente" e a bolinha
   some.
5. Abrir `/u/bruno`. → O contador de seguidores subiu 1.
6. Repetir os passos 1 a 3 com outra conta e clicar em **Recusar**. → A pessoa sai, sem virar
   seguidora; quem pediu vê o botão "Solicitar" de novo.
7. No celular (DevTools), o sino continua no canto superior direito.

## 5. O que validar

*Escrito antes da implementação.*

- [ ] O sino fica no canto superior direito da aba Rede social, no desktop e no celular, e leva a
  `/notificacoes`
- [ ] A bolinha mostra quantas solicitações estão pendentes ("9+" acima de 9) e some com zero; o
  nome acessível do sino diz quantas são
- [ ] `/notificacoes` mostra "Solicitações para seguir (N)", da mais recente para a mais antiga,
  cada uma com foto, nome, @username com link ao perfil, Aprovar e Recusar
- [ ] Aprovar vira o vínculo para aceito: a pessoa passa a ser seguidora, e o contador sobe
- [ ] Recusar apaga a solicitação em silêncio: quem pediu não é avisado e pode pedir de novo
- [ ] Depois de aprovar ou recusar, a pessoa sai da lista na hora, a bolinha se atualiza, o
  resultado é anunciado e o foco vai ao título da lista
- [ ] Só o dono vê, aprova e recusa as próprias solicitações; quem pediu não se auto-aprova
- [ ] O followee vem sempre da sessão; a URL só diz quem pediu
- [ ] A resposta não leva `id`; a foto sai por URL assinada, sem cache compartilhado
- [ ] Nenhuma escrita parte do navegador; nenhum `supabase.from` na tela
- [ ] Erro do banco não volta cru
- [ ] Funciona em mobile e desktop; feedback por `toast()`; carregando, vazio, erro e sessão vencida
  tratados
- [ ] RF13 do catálogo diz que a Zona 1 vem dos vínculos pendentes; RF13.4 continua Parcial até a
  Zona 2
- [ ] ~~Autorização via `exigirMembro` / `exigirDono`~~ — não se aplica: a solicitação não é recurso
  de viagem; ver bloco 1

## 6. Riscos e pendências (insumo da seção 25)

- **A Zona 2 e as não-lidas dependem de migration** (`notifications`), com aval do Fernando. Até
  lá, o RF13.1, o RF13.3 e a parte de não-lidas do RF13.4 ficam **Não iniciado**.
- **A bolinha não é tempo real**: uma solicitação nova aparece ao abrir uma página da aba ou ao
  voltar para a janela.
- **Conta sem username** (anterior ao social) que pedir para seguir não aparece na lista nem na
  contagem, porque não tem página nem endereço para aprovar. A solicitação fica pendente até ela
  escolher um username. Ela só chega a pedir digitando o endereço do perfil, porque a busca não a
  mostra.
- **Ao passar de privado para público**, as solicitações pendentes continuam pendentes (registrado
  na S03) e continuam na Zona 1 até o dono resolvê-las.
- **Data API direta:** vale a pendência do limite de taxa registrada no `S05-M-seguir`.
- **A lista mostra até 50 solicitações**, e o total vem do banco. Acima disso, as mais antigas
  aparecem conforme as mais novas são resolvidas.
- **Achado da mutação, corrigido:** "erro do banco ignorado" (na lista, no aprovar e no recusar)
  sobrevivia. Sem o `throw`, o código quebrava logo depois com `TypeError`, e a resposta continuava
  500 genérica. A diferença real é o log do servidor, que perderia a causa. Os testes de 500 passaram
  a conferir que o erro do banco é o que vai ao log.
- **Achado do screenshot do celular, corrigido com teste de regressão que falhou antes:** com
  Aprovar e Recusar ao lado, o bloco da pessoa encolhia até largura zero, e o nome e o @ sumiam. No
  celular, os botões passaram para baixo do nome, e o E2E confere que o nome e o @ aparecem.
- **Revisão independente (agente `seguranca`) sobre o `05cfa58`:** nenhum achado Bloqueante nem
  Importante. Os Menores foram confirmados lendo o código. Cada correção começou por um teste de
  regressão que **falhou antes** (`S05-M-solicitacoes-regressao-antes.txt`):
  - **M1 (corrigido):** ações seguidas em pessoas diferentes dessincronizavam a tela. O `ocupado`
    guardava uma pessoa só, e o fim do pedido de uma soltava os botões de quem ainda esperava. Todo
    404 também descontava 1 do total, mesmo de quem já tinha saído. Agora cada pessoa em andamento
    fica num `Set`, e só ela é solta ao terminar. O total só cai se a pessoa ainda estava na lista, e
    um 404 recarrega a lista do servidor. O E2E monta 3 pendentes, segura o pedido do Davi e confere
    os botões dele travados, o título "(1)" e a bolinha "1" no fim;
  - **M2 (corrigido):** "perfil não encontrado" era tratado como "já tinha sido resolvida". Se quem
    pediu trocava de username com a lista aberta, Aprovar dava 404, e a pendente sumia da tela sem
    ter sido resolvida. Os dois 404 levam agora um código estável no corpo, `perfil_nao_encontrado` ou
    `sem_pendente`, que não revela nada além da mensagem. Nos dois casos a tela recarrega a lista, e só
    o segundo anuncia "já tinha sido resolvida". O E2E troca o username do Davi antes do clique e
    confere a solicitação com o nome novo e a bolinha "1";
  - **M3 (corrigido):** com a sessão vencida, o sino mantinha a contagem antiga. Com 401, agora ele
    zera. O E2E limpa os cookies, dispara `focus` e espera a bolinha sumir;
  - **M5 (corrigido):** o sino buscava a lista inteira e assinava as fotos só para mostrar um número.
    Agora ele usa `GET /api/social/solicitacoes?contagem=1`, que devolve `{ total }` com
    `count: 'exact', head: true`, sem linhas e sem cliente de serviço. O embed ficou reduzido ao
    `username`, com `!inner`, para a contagem seguir a mesma regra da lista (conta sem username não
    conta). A integração cobre 200, 401, 400 com parâmetro inválido e 500; a RLS prova que a contagem
    só conta as próprias pendentes e que o visitante recebe 401, e não um número;
  - **M4 (registrado, risco aceito, como no Instagram):** quem pediu não é avisado da recusa, mas
    percebe ao reabrir o perfil e ver "Seguir" no lugar de "Solicitado". "Não é avisado" é diferente
    de "não consegue perceber". O catálogo diz "silencioso" no primeiro sentido.
- **2ª revisão independente (agente `seguranca`) sobre `05cfa58..6703fcd`:** dois Menores nas
  Notificações, corrigidos num commit novo (o `6703fcd` já estava publicado no PR #45). Os testes de
  regressão **falharam antes**, em `chromium` e `mobile`:
  - **m1 (corrigido):** o M3 ficou fechado só em parte. Um 401 dentro de `/notificacoes`, ao aprovar,
    recusar ou recarregar a lista, mostrava "Sua sessão expirou", mas a bolinha mantinha a contagem
    antiga. Os dois ramos de 401 agora também zeram o sino. Há dois E2E: um aprova com os cookies
    apagados; o outro fixa a contagem do sino em 1 e deixa o 401 só na recarga, para isolar o ramo
    da carga;
  - **m2 (corrigido):** um 404 pede a recarga da lista, e, se outra ação terminava enquanto a recarga
    estava no ar, a resposta velha trazia de volta quem acabara de ser resolvido. Entrou a mesma
    solução da `S05-M-listas`: o contador `concluidas` de ações terminadas. A resposta de uma carga
    pedida antes da última ação concluída é descartada, e a carga é refeita. O E2E prende o aprovar
    do Davi, faz a Ana cancelar, segura a recarga do 404 dela (com o servidor respondendo com o Davi
    ainda pendente) e só a entrega depois de o Davi ser aprovado. O Davi não volta.
- **Achado para o Fernando (plataforma, `proxy.ts`):** a proteção contra CSRF depende só do
  `SameSite=Lax` padrão dos cookies do `@supabase/ssr`, sem checagem de `Origin`. O revisor testou um
  formulário de outro site e recebeu 401: hoje está protegido. Mas aprovar é o alvo de maior impacto,
  porque libera conteúdo privado, e o ataque volta se a opção do cookie mudar. A sugestão é checar
  `Origin` no proxy para métodos que não são GET em `/api`. O `proxy.ts` não foi tocado.
- **Ressalvas não verificadas:**
  - a ordem dos anúncios num leitor de tela real (o foco no título e o `role="status"` mudam juntos);
  - o erro do banco real, coberto só por dublê na integração.
- **Achado de teste, não de produto:** a Carla vê a própria solicitação ao Bruno pela Data API, porque
  a RLS sempre mostra o vínculo a quem pediu. O primeiro rascunho do teste da contagem com dono forjado
  contava esse pedido e esperava zero; a checagem passou a ser feita antes de a Carla pedir.
- **O sino só existe dentro da aba Rede social.** Fora dela, no painel, não há sino: o
  `app/dashboard/layout.tsx` é compartilhado. Se o Micael quiser o sino em todo o app, a mudança vai
  ao dono desse arquivo.

## 7. Evidência

- [ ] Saída dos testes em `docs/pfc/evidencias/S05-M-solicitacoes-*`, regravada em 10/11 depois das
  duas rodadas (a da implementação e a da revisão independente):
  - `S05-M-solicitacoes-integracao.txt`: 29 de 29;
  - `S05-M-solicitacoes-rls.txt`: 163 de 163, com o detalhe dos 14 testes das solicitações. As
    funções da lib rodam contra o PostgREST de verdade, inclusive a contagem do sino;
  - `S05-M-solicitacoes-mutacoes.txt`: 49 de 49 mortas. São 45 no código e 4 na tela: os dois ramos
    de 401 e o descarte da carga velha, cada um num build próprio, contra o E2E que o cobre, depois de
    um controle sem sabotagem que passou. Na primeira rodada foram 31; a segunda acrescentou o modo
    só de contagem, o schema da consulta e os códigos dos dois 404; a terceira, a tela;
  - `S05-M-solicitacoes-regressao-antes.txt`: os testes que **falharam antes** de cada correção:
    - o nome no celular (1ª rodada; falha no mobile, passa no chromium);
    - M5 e M2 na integração (10 falhas);
    - M1, M2 e M3 no E2E, em `chromium` e `mobile`;
    - m1 (os dois ramos de 401) e m2 (a carga velha) no E2E, em `chromium` e `mobile`;
  - `S05-M-solicitacoes-e2e.txt`: 24 de 24, em `chromium` e `mobile`, no build de produção.
  - A suíte inteira deu 598 testes de unidade e integração e E2E 109 passando, com 1 pulado de
    propósito (o clique do meio da pesquisa).
  - **RLS:** 163 de 163 até a 2ª rodada (evidência em `S05-M-solicitacoes-rls.txt`). Na 3ª, o banco
    local já tinha a migration `20261110200043_social_exigir_username`, da `S05-M-listas`, que não
    existe nesta branch. O trigger dela recusa voltar o username a nulo (23514), então o teste "conta
    sem username não aparece nem conta" falha **só no banco local**: 162 de 163, e é a única falha. A
    3ª rodada não mexeu em nada que a RLS cobre, e no CI a migration não está aplicada. A branch das
    listas já ajusta esse teste. No fim, nenhum vínculo do Bruno sobrou, e os
    usernames do seed estavam no lugar (o Davi voltou de `davi_e2e`).
- [ ] Screenshots do fluxo (chromium e mobile): `S05-M-solicitacoes-sino-*` (o sino com a bolinha no
  feed), `S05-M-solicitacoes-pendente-*` (a solicitação do Davi) e `S05-M-solicitacoes-vazio-*`
  (depois de aprovar)
- [ ] Delta de cobertura (`S05-M-solicitacoes-cobertura.txt`): `lib/social/solicitacoes.ts`,
  `lib/schemas/solicitacoes.ts` e as duas rotas, novos, com 100% de linhas e ramos
- [ ] Revisão adversarial independente (agente `seguranca`), em duas rodadas, sem Bloqueante nem
  Importante:
  - 1ª: os Menores M1, M2, M3 e M5 foram corrigidos com regressão que falhou antes, e o M4 ficou
    registrado como risco aceito (bloco 6);
  - 2ª: os Menores m1 e m2 foram corrigidos com regressão que falhou antes, num commit novo
