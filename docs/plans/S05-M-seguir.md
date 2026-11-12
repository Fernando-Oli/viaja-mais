---
id: S05-M-seguir
titulo: Perfil de outra pessoa, com seguir e deixar de seguir
trilha: T3
responsavel: micael
revisor: fernando
semana: S05
requisitos: [RF02.8, RF09.1, RF09.2, RF09.5]
secoes_doc: [14, 22.1, 25]
branch: feat/S05-M-seguir
tipo: [migration, route-handler, tela, documentacao]
depende_de: [S05-M-busca-pessoas, S04-M-foto-privada]
status: em-desenvolvimento
---
# Perfil de outra pessoa, com seguir e deixar de seguir

> **Micael** · semana **S05** · segunda atividade da aba Rede social, desenhada pelo Micael
> em 14/10 e detalhada em 21/10

## 1. Contexto

Clicar numa pessoa nos resultados da busca (`S05-M-busca-pessoas`) abre o **perfil dela**, dentro
da aba Rede social: o menu lateral e o painel de busca continuam à esquerda. O perfil mostra foto,
nome, @username, bio, o selo de perfil privado, quantos seguidores e quantos seguidos a pessoa tem,
e o botão de seguir.

É a base do feed: só aparece no feed de alguém quem esse alguém segue.

**O banco já está pronto desde a S03** (`follows`, com RLS, grants e trigger):

- seguir um perfil público nasce aceito, e solicitar a um privado nasce pendente. Quem decide é o
  trigger, e o cliente não consegue forjar o estado;
- só se cria vínculo em nome de si mesmo, e ninguém segue a si mesmo;
- desfazer é apagar o vínculo, tanto para deixar de seguir quanto para cancelar a solicitação.

A única migration é a da contagem (abaixo), decidida depois da revisão independente.

**Decisões do Micael em 21/10:**

- **Os números aparecem também em perfil privado**, como no Instagram. Quem são os seguidores
  continua escondido, e as listas ficam para a `S05-M-solicitacoes`.
- **Desfazer passa por um menu com confirmação.** "Seguindo" e "Solicitado" abrem um menu com
  "Deixar de seguir" ou "Cancelar solicitação", para ninguém desfazer com um clique sem querer.
- **Requisito novo, RF02.8:** visualizar o perfil de outro usuário. O RF02.1 fala só do próprio
  perfil.

**O botão conforme o vínculo:**

| Situação | Botão | Ao clicar |
|---|---|---|
| Não segue, perfil público | Seguir | vira "Seguindo" na hora |
| Não segue, perfil privado | Solicitar | vira "Solicitado" (pendente) |
| Já segue | Seguindo | menu com "Deixar de seguir" |
| Solicitação pendente | Solicitado | menu com "Cancelar solicitação" |
| É o próprio perfil | Editar perfil | vai para Meu perfil |

**As viagens publicadas chegam na S06.** Até lá, a área de viagens mostra "Nenhuma viagem publicada
ainda" para quem pode ver o perfil. Para quem não pode, mostra o aviso de conta privada.

**Autorização.** `exigirMembro` e `exigirDono` não se aplicam, porque perfil não é recurso de
viagem. A regra de cada pedido:

- qualquer pessoa autenticada vê os dados básicos de qualquer perfil (catálogo, RF02);
- seguir e desfazer valem só em nome de quem está na sessão: o `follower_id` vem de `getUser()`,
  nunca do corpo nem da URL;
- a RLS de `follows` é a segunda linha.

**Os contadores vêm de uma função no banco.** Eles precisam ser números exatos. Pela RLS, um
visitante não enxerga todos os vínculos de um perfil privado, e a contagem sairia errada.

A primeira versão contava com a chave de serviço (`head: true`). A revisão independente apontou que
isso contraria o contrato de `lib/supabase/admin.ts`, que reserva a chave ao GoTrue. Também apontou
que qualquer mudança na contagem passaria por cima da RLS sem erro. **Decisão do Micael em 21/10:**
uma função `public.contar_rede(perfil)`, no padrão do `pode_ver_rede` da S03:

- `SECURITY DEFINER` com `search_path` vazio, devolvendo só os dois números (seguidores e seguidos
  aceitos), sem linha nem nome;
- confere a sessão no corpo: sem `auth.uid()`, não devolve nada;
- EXECUTE só para `authenticated`, revogado de `public`, de `anon` e de `service_role` (sem
  sessão a função não responde; ajuste da segunda rodada da revisão);
- a rota chama a função com a sessão de quem vê. A chave de serviço fica só para assinar a foto, no
  Storage.

A migration nasce como proposta, no mesmo fluxo da S04: sobe no PR, passa no CI e espera o merge do
Fernando.

**Seguir de novo usa o `ON CONFLICT DO NOTHING` previsto na migration da S03.** A primeira versão
tratava o 23505 da chave primária. A revisão notou que a S03, já mergeada, descreve o
`upsert` idempotente, e os grants foram pensados para ele. Testado em 21/10 no banco local:
repetir não duplica, o trigger continua decidindo o status, e `status` forjado dá 42501.

## 2. Arquivos afetados

- `app/(rede-social)/` (criar, como grupo de rotas do Next, que não muda nenhum endereço). A aba
  Rede social e o perfil dividem o mesmo layout, e por isso o painel de busca, com o termo e os
  resultados, continua lá quando se abre um perfil:
  - `layout.tsx`, `painel-pessoas.tsx` e `feed/page.tsx` saem de `app/feed/`, movidos;
  - `u/[username]/page.tsx` (criar): o perfil de outra pessoa, com os estados de carregando,
    erro e não encontrado.
- `app/(rede-social)/painel-pessoas.tsx` (editar): cada resultado vira link para `/u/<username>`.
- `app/api/social/perfis/[username]/route.ts` (criar): `GET`, que devolve o perfil, o vínculo de
  quem vê com ele e os contadores.
- `app/api/social/perfis/[username]/seguir/route.ts` (criar):
  - `POST` segue ou solicita;
  - `DELETE` deixa de seguir ou cancela;
  - os dois são idempotentes, recusam seguir a si mesmo e devolvem o perfil atualizado.
- `lib/social/perfil-visto.ts` (criar): monta o perfil como quem visita o vê, com a mesma resposta
  nas três rotas. Busca pelo username, vê o vínculo (`proprio`, `nenhum`, `solicitado` ou
  `seguindo`), conta seguidores e seguidos aceitos pela `contar_rede`, assina a foto e monta a
  resposta campo a campo, sem o `id` como campo.
- `supabase/migrations/20261021165006_social_contar_rede.sql` (criar, **proposta**, decisão de 21/10):
  a função `public.contar_rede(perfil)`. `types/database.ts` regenerado junto.
- `tests/rls/07-contar-rede.test.ts` (criar) e `tests/rls/04-social.test.ts` (editar: o `upsert`
  da rota, com os grants reais).
- `lib/schemas/perfil.ts` (editar): `formatoUsernameSchema`, o formato do username sem a lista
  de reservados, que é regra de escrita e não de leitura.
- `docs/pfc/03-publico/14-requisitos-funcionais.md` (editar): RF02.8 na tabela e no detalhamento.
- Testes:
  - `tests/api/social-perfil-visto-route.test.ts` e `tests/api/social-seguir-route.test.ts`
    (criar);
  - `tests/lib/perfil-schema.test.ts` (editar);
  - `e2e/seguir.spec.ts` (criar).

## 3. Passos

1. Plano e RF02.8 no catálogo.
2. `formatoUsernameSchema` e `lib/social/perfil-visto.ts`.
3. As três rotas, com a integração.
4. O grupo de rotas, a página do perfil e os links no painel.
5. E2E com screenshots; mutação; revisão independente; bateria; commit.

## 4. O que testar

*Preenchido antes da implementação.*

**Testes automatizados:**

- [ ] **Integração do `GET`:**
  - 200: devolve os dados básicos, o vínculo e os contadores, nos quatro vínculos (próprio,
    nenhum, solicitado, seguindo);
  - o perfil privado traz os contadores, mas não a lista;
  - não traz `id`, e-mail nem datas;
  - a foto sai por URL assinada, com `Cache-Control: private, no-store`;
  - 401 sem sessão; 400 com username fora do formato; 404 com username que ninguém usa;
  - erro do banco sem a mensagem crua; contadores nulos, e não 500, se a contagem falhar.
- [ ] **Integração do `POST` e do `DELETE`:**
  - 200: cria o vínculo em nome da sessão, com `follower_id` da sessão (nunca do corpo);
  - seguir de novo não duplica (~~o 23505 vira sucesso~~: substituído em 21/10 pelo `ON CONFLICT
    DO NOTHING` da S03, ver bloco 1), e deixar de seguir quem não se segue
    também é sucesso;
  - 400 ao seguir a si mesmo; 401; 400; 404;
  - a resposta é o perfil atualizado.
- [ ] Unit de `formatoUsernameSchema`, com nome reservado aceito na leitura.
- [ ] **E2E (`chromium` e `mobile`, com screenshots)**, como o Davi:
  - busca "carla" → clica → abre `/u/carla` com o painel ainda à esquerda;
  - Seguir → "Seguindo" e o contador sobe; o menu → "Deixar de seguir" → volta;
  - `/u/bruno` (privado) → Solicitar → "Solicitado", sem mudar o contador; o menu → "Cancelar
    solicitação";
  - `/u/nao_existe` → não encontrado; sem login → login;
  - no fim, o teste apaga os vínculos que criou, para os testes de RLS seguirem com o seed intacto.
- [ ] **Mutação:** cada proteção sabotada sozinha derruba algum teste.

*Acrescentado em 21/10, depois da revisão independente e antes das correções:*

- [ ] **RLS da `contar_rede`** (`tests/rls/07-contar-rede.test.ts`), com usuários do seed logados
  de verdade:
  - conta só os vínculos aceitos: a solicitação pendente não entra, e aprovar faz o número subir;
  - um terceiro recebe os mesmos números de um perfil privado que o dono, e nada além dos dois
    números;
  - visitante sem sessão recebe 42501, e não números;
  - UUID que ninguém usa dá zero e zero, como uma conta sem vínculos aceitos (para quem tem
    sessão não é oráculo novo: `profiles` já é legível);
  - no catálogo: `SECURITY DEFINER`, `search_path` vazio, `STABLE`, e EXECUTE só para
    `authenticated` (nem anon, nem `service_role`, a quem a função não responderia);
  - autenticado continua chamando (contra correção exagerada).
- [ ] **RLS do `upsert` da rota** (`04-social`): seguir duas vezes com `ON CONFLICT DO NOTHING`
  não dá erro nem duplica, e `status` no corpo continua barrado (42501), também nessa forma.
- [ ] **Integração:** a contagem vai pela sessão, numa chamada `contar_rede`; o cliente de serviço
  não é criado quando não há foto; o `POST` manda o `upsert` com `ignoreDuplicates`; o dublê é
  preguiçoso como o builder real (um `await` esquecido derruba o teste).
- [ ] **E2E:**
  - no celular, reabrir a gaveta depois de abrir um perfil mostra o termo e os resultados;
  - depois de Seguir e de Deixar de seguir, o foco fica no botão novo, e o resultado é
    anunciado (`role="status"`);
  - com a sessão vencida, seguir mostra "Sua sessão expirou" e o link "Entrar de novo";
  - nenhuma requisição do navegador vai a `/rest/v1/follows` (passo 9 do roteiro);
  - os três primeiros **falham antes** da correção (regressão);
  - *(segunda rodada da revisão)* se seguir falha (500 simulado), o foco volta ao botão, já
    habilitado, e também **falha antes** da correção.

**Roteiro de teste manual.**

Pré-requisito: `npm run setup` nesta branch e `npm run dev`.

1. Entrar como `teste.d@viajamais.local` / `viajamais123` e abrir **Rede social**.
2. Buscar `carla` e clicar no resultado. → Abre `/u/carla`. O painel de busca continua com
   "carla" e o resultado.
3. Clicar em **Seguir**. → Vira "Seguindo", e "seguidores" sobe 1.
4. Clicar em **Seguindo** → **Deixar de seguir**. → Volta a "Seguir", e o contador desce.
5. Buscar `bruno` e abrir. → Selo de perfil privado, os números visíveis e o aviso de conta
   privada.
6. Clicar em **Solicitar**. → "Solicitado", e o contador não muda.
7. Clicar em **Solicitado** → **Cancelar solicitação**. → Volta a "Solicitar".
8. Abrir `/u/davi`. → "Editar perfil", sem botão de seguir.
9. Na aba Network, seguir alguém. → `POST /api/social/perfis/<username>/seguir`, e nenhuma
   requisição a `/rest/v1/follows`.

## 5. O que validar

*Escrito antes da implementação.*

- [ ] Clicar numa pessoa da busca abre `/u/<username>` dentro da aba Rede social, com o menu e o
  painel de busca, que guarda o termo
- [ ] Perfil público: "Seguir" cria o vínculo aceito, e o contador de seguidores sobe na hora
- [ ] Perfil privado: "Solicitar" cria o vínculo pendente, e o contador não muda
- [ ] "Seguindo" e "Solicitado" abrem um menu com confirmação; desfazer apaga o vínculo, e o
  contador volta
- [ ] Seguir duas vezes não duplica; deixar de seguir quem não se segue não dá erro
- [ ] Seguir a si mesmo é recusado (400), e o próprio perfil mostra "Editar perfil"
- [ ] O `follower_id` vem sempre da sessão; nada do corpo vai ao banco
- [ ] Username que não existe mostra "perfil não encontrado" (404 na rota)
- [ ] Os contadores contam só vínculos aceitos e aparecem também em perfil privado
- [ ] A resposta não leva `id`, e-mail nem datas; a foto sai por URL assinada, sem cache
  compartilhado
- [ ] ~~A chave de serviço só conta vínculos, com `head: true`~~ — substituído em 21/10: os
  contadores vêm da `contar_rede`, com a sessão de quem vê, e a chave de serviço não lê nenhum
  dado da aplicação (só assina a foto)
- [ ] A `contar_rede` devolve só os dois números, conta só aceitos, e anon não a executa
- [ ] Seguir de novo usa o `ON CONFLICT DO NOTHING` da S03
- [ ] Depois de seguir ou desfazer, o foco fica no botão (também quando o pedido falha), e o
  resultado é anunciado; com a sessão vencida, a tela oferece entrar de novo
- [ ] Sem sessão, as rotas dão 401, e `/u/...` leva ao login
- [ ] Nenhuma escrita parte do navegador; nenhum `supabase.from` na tela
- [ ] Erro do banco não volta cru; falha na contagem não derruba o perfil
- [ ] Funciona em mobile e desktop; feedback por `toast()`; carregando, erro e não encontrado
  tratados
- [ ] RF02.8 no catálogo da seção 14
- [ ] ~~Autorização via `exigirMembro` / `exigirDono`~~ — não se aplica: perfil não é recurso de
  viagem; ver bloco 1

## 6. Riscos e pendências (insumo da seção 25)

- **A `contar_rede` é migration de proposta**, e o merge espera o Fernando, como na S04. Ela
  substituiu o uso da chave de serviço para contar (achado I1 da revisão independente).
- **Seguir e desfazer em sequência é sem barreira**, como pede o RF09.9 para a remoção. A revisão
  mandou 6 pedidos em paralelo, e todos passaram (com uma linha só no banco).
- **Pendência da plataforma, não risco aceito: o limite de taxa da `S06-F-rate-limit-csp` cobre só
  `/api/**`.** A segunda rodada da revisão mostrou que quem tem sessão alcança o banco direto pela
  Data API, com a chave anon, que é pública no bundle:
  - `POST /rest/v1/follows` segue, e `DELETE` desfaz, sem passar pela rota;
  - `/rest/v1/rpc/contar_rede` responde a POST e a GET (300 chamadas em paralelo em 1,2 s).

  Isso vale desde a S03, para toda tabela e toda função com grant a `authenticated`: a RLS e os
  grants seguram o que cada um pode fazer, mas nada segura quantas vezes. Limitar a Data API exige
  um `db_pre_request` do PostgREST por `auth.uid()`, ou uma regra no gateway. Fica para o Fernando
  decidir; até lá, o limite da `S06-F` não atenua os dois itens abaixo. Cada contagem varre os
  vínculos do perfil pelo índice e filtra o `status` na linha (EXPLAIN em
  `S05-M-seguir-advisors.txt`). Índices parciais `where status = 'accepted'` deixariam a contagem
  só no índice, se o volume pedir.
- **Os contadores mostram números em perfil privado**, por decisão do Micael. Quem são as pessoas
  continua escondido, com uma exceção que vem da S03 e é igual à do Instagram: o vínculo de um
  seguidor **público** com um perfil privado aparece a qualquer autenticado, porque está na lista de
  seguidos do público. Consequências:
  - com o número na mão, quem vê sabe na hora quantos seguidores do perfil privado são privados (o
    total menos os vínculos que ele enxerga);
  - quem observa os números de dois perfis privados ao longo do tempo pode cruzar as mudanças e
    deduzir quem aprovou quem.

  A decisão de mostrar os números fica; o limite de taxa, quando cobrir a Data API, atenua o
  segundo.
- **CSRF (para a plataforma).** As rotas que mudam estado não conferem `Origin` nem
  `Sec-Fetch-Site`. A revisão mandou um POST com `Origin` de outro site e o cookie da sessão, e ele
  passou. No navegador, quem protege é o cookie `SameSite=lax`, padrão do `@supabase/ssr`, e o
  `X-Frame-Options: DENY`. Sobram os subdomínios do mesmo site. Achado para a `S06-F`: checar
  `Origin` no `proxy.ts` ou em `lib/http`.
- **O `id` do perfil não sai como campo**, mas aparece no caminho da foto assinada, e qualquer
  autenticado o lê em `profiles`. Não é segredo desde a S03; a seção 25 diz "não expõe o id como
  campo", e não "não revela o id".
- **Achados para o Fernando:**
  - a tabela de domínios do `CLAUDE.md` cita `app/u/**` e `app/feed`, que agora moram em
    `app/(rede-social)/`. Os endereços não mudaram;
  - o `npm run db:types` falha no Windows (o `supabase` não está no PATH do cmd), e a CLI 2.121 gera
    o arquivo sem formatação (detalhe no bloco 7).

## 7. Evidência

- [ ] Saída dos testes em `docs/pfc/evidencias/S05-M-seguir-*`, regravada em 21/10 depois das
  correções das duas rodadas da revisão independente:
  - `S05-M-seguir-integracao.txt`: 74 de 74 (as duas rotas novas e o `formatoUsernameSchema`);
  - `S05-M-seguir-rls.txt`: 128 de 128, com o detalhe da `contar_rede` (8 testes novos) e dos
    dois testes novos do `upsert` da rota (repetir e `status` no corpo);
  - `S05-M-seguir-mutacoes.txt`: 26 de 26 mortas. São 18 no código: vínculo em nome da sessão,
    `ignoreDuplicates`, os dois `await`, seguir a si mesmo, desfazer filtrado pela sessão, a
    contagem pela função, a falha na contagem sem derrubar o perfil, o cliente de serviço só com
    foto, o `id` fora da resposta, a foto assinada e o cabeçalho sem cache. São 8 na função, no
    banco local: só aceitos, checagem de sessão, `SECURITY DEFINER`, EXECUTE de anon e de
    `service_role`, `search_path`, `STABLE` e a contagem em si;
  - `S05-M-seguir-regressao-antes.txt`: os achados de tela (gaveta, foco, sessão vencida e, na
    segunda rodada, o foco quando seguir falha) viraram teste e **falharam antes** da correção,
    no build sem ela;
  - `S05-M-seguir-e2e.txt`: 14 de 14 no build de produção, em `chromium` e `mobile`, depois da
    correção;
  - `S05-M-seguir-advisors.txt`: nenhum advisor cita a `contar_rede`, o `db lint` passou limpo, e
    o EXPLAIN mostra as duas contagens nos índices que já existiam.
  - A suíte inteira deu 534 testes de unidade e integração, RLS 128 de 128 e E2E 73 passando, com
    1 pulado de propósito. No fim, nenhum vínculo sobrou em `public.follows`, e a Carla continua
    pública.
  - A migration foi aplicada com `migration up`, sem reset, porque outra sessão usa o mesmo banco
    local. A aplicação limpa do zero fica com o job "Migrations e RLS" do CI, como na S04.
  - `types/database.ts` regenerado: o diff é só a `contar_rede`. Achado para o Fernando: o
    `npm run db:types` falha no Windows, porque o `supabase` não está no PATH do cmd, e a CLI 2.121
    gera o arquivo sem formatação. Foi gerado com `npx supabase gen types` e formatado com o
    prettier (`--no-semi`), como as versões anteriores.
- [ ] Screenshots do fluxo (chromium e mobile): `S05-M-seguir-publico-{chromium,mobile}.png`
  (Carla seguida) e `S05-M-seguir-privado-{chromium,mobile}.png` (Bruno com a solicitação)
- [ ] Delta de cobertura (`S05-M-seguir-cobertura.txt`): `lib/social/perfil-visto.ts` e as duas
  rotas, novos, e `lib/schemas/perfil.ts`, com 100% de linhas e ramos. A função SQL é coberta
  pelos testes de RLS e pela mutação do banco.
- [ ] Revisão adversarial independente (agente `seguranca`), em duas rodadas: a primeira sobre a
  atividade inteira, e a segunda sobre as correções. Cada achado foi reproduzido antes de ser
  aceito.
