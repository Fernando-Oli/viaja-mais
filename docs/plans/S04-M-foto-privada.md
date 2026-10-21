---
id: S04-M-foto-privada
titulo: Foto de perfil privada, servida por URL assinada
trilha: T3
responsavel: micael
revisor: fernando
semana: S04
requisitos: [RF02.2]
secoes_doc: [18, 25]
branch: fix/S04-M-foto-privada
tipo: [migration, rls, route-handler, regra-de-negocio]
depende_de: [S04-M-foto-perfil]
status: em-desenvolvimento
---
# Foto de perfil privada, servida por URL assinada

> **Micael** · semana **S04** · fecha dois riscos aceitos da `S04-M-foto-perfil` (#30, mergeado
> em 14/10). Fica na S04, e não na semana do calendário, por decisão do Micael: o que falta de
> uma semana se faz nela antes de avançar.

## 1. Contexto

A `S04-M-foto-perfil` deixou registrados, no bloco 3, riscos que o Micael pediu para tratar
em 14/10, uma ação por vez. Esta atividade é a primeira ação e fecha dois deles:

- **Bucket público é a internet inteira.** Quem tem a URL de uma foto a vê sem login, e o
  caminho é fixo. A regra do Micael: só quem tem login vê a foto.
- **Remover a foto não é instantâneo para quem já a viu**, porque a URL pública fica no cache
  do navegador e da CDN por até 1 hora.

**Por que URL assinada.** Com o bucket privado, um `<img>` não consegue ler o arquivo: ele
aponta para o domínio do Supabase, que não recebe o cookie de login do app, e o Storage só
aceita o cabeçalho `Authorization`, que um `<img>` não manda. Sobram duas saídas:

- uma **rota do app que serve cada imagem**, conferindo a sessão a cada pedido;
- **URLs assinadas**, links temporários gerados pelo servidor depois de autorizar.

A foto de perfil aparece em tudo: perfil, menu lateral, busca e, depois, feed e listas de
seguidores. Passar cada imagem pelo servidor custaria uma checagem de sessão e um download
por bolinha na tela. Por isso o Micael escolheu a URL assinada, que é o padrão das grandes
redes: as URLs da CDN do Instagram e do Facebook levam assinatura e data de expiração.

**Quem assina é só o servidor**, com a chave de serviço (`lib/supabase/admin.ts`), depois de
a rota decidir que a pessoa pode ver. O bucket continua **sem nenhuma policy para usuário**.
Uma policy de leitura deixaria o usuário assinar com o próprio JWT, escolhendo a validade do
link.

**Validade e cache (decisão do Micael em 21/10).** A URL assinada vale **10 minutos**, e o
servidor **reaproveita o mesmo link por até 5 minutos**. O desenho saiu da revisão
independente, que mostrou duas coisas, ambas reproduzidas:

- **A validade é também o cache do navegador.** O Storage serve a URL assinada com `Expires`
  no fim da validade e sem `Cache-Control`, e ignora o `cacheControl` gravado no arquivo. Uma
  primeira versão desta atividade gravava cache de 5 minutos e prometia que a foto removida
  sumia nesse prazo, mas o navegador seguia com ela pela 1 hora do link.
- **Cada assinatura é um link novo**, e link novo é download novo: sem reaproveitar, a foto
  era baixada de novo a cada carga de página (o menu lateral busca o perfil duas vezes por
  carga).

Com isso, quando a foto é removida:

- o banco deixa de apontar para ela na hora, e o arquivo é apagado na mesma requisição;
- quem carrega de novo já não recebe link nenhum;
- um link já emitido para de ser servido assim que o arquivo some;
- quem já tinha a foto numa tela aberta, ou volta pelo histórico, pode vê-la do cache do
  navegador por até 10 minutos.

Cada pessoa baixa a mesma foto no máximo a cada 5 a 10 minutos. O reaproveitamento fica na
memória de cada instância do servidor.

**SQL como proposta.** Por decisão do Micael, o SQL nasce em `docs/plans/` e é aplicado só numa
cópia local para os testes, como na S03. A migration `20261007200000_social_avatares.sql` já
está na `main` e não se edita. Com o aval do Fernando, a proposta vira uma migration **nova**,
criada com `npx supabase migration new`.

Como no S03, o teste de RLS desta atividade exige o bucket privado. Enquanto a migration não
existir, o job "Migrations e RLS" do CI fica vermelho. Por isso o commit fica local, e o push só
acontece depois do aval.

**Fora desta ação**, cada uma com aval próprio: reprocessar a imagem no servidor (`sharp`,
`package.json` compartilhado), os ajustes finais da remoção imediata e o helper que apaga a
pasta na exclusão de conta (RF02.4, da plataforma). Posts de viagem (S06) decidem de novo a
forma de servir a imagem, porque a regra lá é mais sensível.

## 2. Arquivos afetados

- `docs/plans/S04-M-foto-privada.proposta.sql` (criar): `update storage.buckets set public =
  false where id = 'avatars'`. Nenhuma policy nova.
- `lib/social/foto.ts` (editar):
  - sai `urlPublicaDoAvatar`, para ninguém voltar a montar URL pública;
  - entram as constantes `VALIDADE_URL_AVATAR_S` (10 min) e `REUSO_URL_AVATAR_S` (5 min).
- `lib/social/avatar.ts` (editar): `avatarPublico()` vira
  `assinarAvatares(criarAdmin, perfis)` e o atalho `assinarAvatar`.
  - Recebe a fábrica do cliente de serviço, e não o cliente, para só criá-lo quando há o que
    assinar. Uma revisão mostrou que, criado antes, sem a chave configurada até o perfil sem
    foto respondia 500, e o PATCH gravava a mudança e respondia 500.
  - Recebe o perfil (`id` e `avatar_url`), e só assina caminho no formato do trigger **e na
    pasta do próprio perfil**. O trigger já garante isso em `profiles`; aqui é a defesa para
    quando o feed reusar o helper com outra tabela.
  - Faz uma chamada `createSignedUrls` por resposta, sem repetir caminho, e nenhuma quando não
    há foto ou quando todas já têm link guardado.
  - Guarda o link emitido por `REUSO_URL_AVATAR_S`, no máximo 1000 por instância, e devolve o
    mesmo link nesse prazo.
  - Sem a chave, com a rede caída ou com o Storage fora do ar, a foto vem nula e o erro vai ao
    log: uma foto que não abre não pode derrubar a página de perfil nem o menu.
  - `SEM_CACHE_COMPARTILHADO` (`Cache-Control: private, no-store`): o cabeçalho das respostas
    que levam o link, que vale como senha.
- `app/api/social/perfil/route.ts`, `app/api/social/perfil/foto/route.ts` e
  `app/api/profile/[userId]/route.ts` (editar): as respostas passam a assinar e a mandar o
  cabeçalho sem cache.
  - A rota passa a fábrica de `lib/supabase/admin.ts` ao helper; a rota da foto, que já tem o
    cliente para gravar, passa esse mesmo.
  - A rota `profile/[userId]` é a que alimenta o menu lateral, pelo `context/auth-context.tsx`.
    O contexto, que é compartilhado, não muda: ele já recebe uma URL pronta. Ela ganha a tag
    `@RF02.2`.
- `tests/rls/05-avatares.test.ts` (editar): a conferência "bucket público" vira "privado", e
  entram os casos do bloco 4.
- `tests/lib/avatar.test.ts` (criar) e `tests/lib/foto.test.ts` (editar).
- `e2e/foto-perfil.spec.ts` (editar): o `src` esperado passa a ser a URL assinada, e entram duas
  provas contra o Storage de verdade. A URL pública da mesma foto não abre, e o link assinado
  da foto removida deixa de abrir.
- `tests/api/social-perfil-route.test.ts`, `tests/api/social-perfil-foto-route.test.ts` e
  `tests/api/profile-userid-route.test.ts` (editar): o Storage falso registra o que foi
  assinado.
- `docs/plans/S04-M-foto-perfil.md` (editar): os dois riscos passam a apontar para esta
  atividade.

## 3. Passos

1. Proposta de SQL. `db reset` e a proposta aplicada numa cópia local.
2. Teste de RLS do Storage, com a mutação das proteções.
3. `assinarAvatares` e as constantes, com os testes de unidade.
4. As três rotas e o cache do envio, com a integração.
5. E2E da foto e do perfil como regressão; revisão independente; `npm run verify`;
   rastreabilidade; commit local.

## 4. O que testar

*Preenchido antes da implementação.*

> **Ajustado depois da revisão independente (21/10).** Saíram o cache de 5 minutos, que o
> Storage ignora, e a validade de 1 hora. Entraram os casos que a revisão mostrou faltar:
> cabeçalhos reais da URL assinada, contagem de policies, ausência da chave, reaproveitamento
> do link, pasta do dono e cabeçalho sem cache.

**Testes automatizados** (obrigatórios pelo `tipo`):

- [ ] Aplicação limpa: `db reset` com as migrations da `main` e a proposta aplicada por cima.
- [ ] RLS do Storage (`tests/rls/05-avatares.test.ts`), com dois usuários e visitante:
  - o bucket `avatars` é privado, mantendo os 2 MB e os três tipos;
  - a URL pública de uma foto que existe não abre para o visitante, para a dona nem para
    outro usuário logado;
  - nenhum usuário logado gera URL assinada pela API do Storage, nem para a própria foto;
  - a URL assinada pela chave de serviço abre, com tipo de imagem;
  - removido o arquivo pela API, a URL assinada emitida antes deixa de abrir;
  - a URL assinada é servida com `Expires` no fim da validade e sem `Cache-Control`, ou seja,
    o navegador a guarda até o link vencer;
  - não há policy nenhuma em `storage.objects`.
- [ ] Unit de `assinarAvatares`, com cobertura ≥70% (meta 100%):
  - a ordem da resposta segue a dos perfis, e caminho repetido é assinado uma vez;
  - valor fora do formato (URL antiga, `../`, pasta alheia malformada) e foto na pasta de outra
    pessoa viram nulo sem ir ao Storage;
  - sem foto, ou com todas já guardadas, o cliente de serviço nem é criado;
  - a validade passada é a constante;
  - o mesmo link volta dentro do reuso e um link novo depois dele; com foto nova e foto já
    guardada, só a nova vai ao Storage; o teto de 1000 links guardados;
  - sem a chave, falha da chamada ou resposta vazia viram nulo com log, sem lançar; a falha
    não fica guardada; falha de um item vira nulo só nele.
- [ ] Integração das três rotas:
  - a resposta traz a URL assinada (`/object/sign/avatars/<caminho>?token=`), nunca o caminho
    cru nem `/object/public/`, com `Cache-Control: private, no-store`;
  - é uma chamada de assinatura por resposta, e nenhuma para perfil sem foto;
  - falha do Storage e falta da chave de serviço devolvem 200 com a foto nula;
  - os caminhos existentes de 401, 400 e 409 continuam passando.
- [ ] E2E (`e2e/foto-perfil.spec.ts` e `e2e/editar-perfil.spec.ts`, `chromium` e `mobile`),
  contra o banco com a proposta:
  - a foto enviada aparece no cartão e no menu lateral, nos dois por URL assinada;
  - a URL pública da mesma foto não abre;
  - removida a foto, o Storage para de servir o link.
- [ ] Mutação, cada uma desfeita em seguida, derrubando ao menos um teste:
  - **banco:** bucket público de novo; policy de leitura para `authenticated`, para a dona da
    pasta, para `anon`, ou só para `.webp`;
  - **helper:** assinar sem conferir o formato ou a pasta do dono; sem reaproveitar; sem
    teto de links guardados; criar o cliente de serviço mesmo sem foto; falha que lança;
    validade diferente da constante;
  - **rotas:** resposta com o caminho cru; resposta sem o cabeçalho sem cache.

**Roteiro de teste manual** — passo a passo reproduzível.

Pré-requisito: `npm run setup` nesta branch, a proposta aplicada (`docker exec -i
supabase_db_viaja-mais psql -U postgres < docs/plans/S04-M-foto-privada.proposta.sql`) e
`npm run dev`.

1. Entrar como `teste.d@viajamais.local` / `viajamais123` e abrir **Meu perfil**. Enviar uma
   foto pelo lápis. → A foto aparece no cartão e no menu lateral.
2. No DevTools, aba Network, conferir o endereço da imagem. → `.../storage/v1/object/sign/
   avatars/<id>/<uuid>.webp?token=...`, e nenhum `/object/public/`.
3. Copiar esse endereço, trocar `/object/sign/` por `/object/public/` e tirar o `?token=`.
   Abrir numa janela anônima. → Erro: o arquivo não é público.
4. Abrir o endereço assinado numa janela anônima, sem login. → A foto abre, porque o link
   vale até expirar. É o risco aceito do bloco 6.
5. Voltar ao perfil e **Remover foto**. Na janela anônima do passo 4, abrir o endereço com
   cache desligado (DevTools → Network → "Disable cache") ou num navegador que ainda não o
   abriu. → Erro: o arquivo não existe mais. Sem desligar o cache, o navegador pode mostrar a
   cópia que já tinha por até 10 minutos, até o link vencer: é o risco aceito do bloco 6.
6. Recarregar **Meu perfil** duas vezes seguidas, com uma foto enviada. → Na aba Network, a
   mesma URL assinada nas duas, com a imagem vindo do cache do navegador.
7. No console do navegador, logado, tentar `createSignedUrl` no bucket com o cliente
   Supabase. → Recusado.

## 5. O que validar

*Escrito antes da implementação.*

> Ajustado depois da revisão independente (21/10). "A URL vale 1 hora" e "o envio grava com
> cache de 5 minutos" foram trocados pela validade de 10 minutos, que é também o cache do
> navegador, e pelo reaproveitamento do link. Também entraram a ausência da chave e o
> cabeçalho sem cache.

- [ ] `storage.buckets.public` é `false` para `avatars` (com a proposta aplicada)
- [ ] `GET /storage/v1/object/public/avatars/<caminho existente>` falha para visitante e para
  usuário logado
- [ ] Usuário logado não gera URL assinada pela API do Storage, nem para a própria foto
- [ ] Nenhuma rota devolve caminho cru nem URL pública: só a URL assinada
  (`/object/sign/avatars/...?token=`) ou nulo
- [ ] A URL assinada vale 10 minutos (constante única), e o mesmo link volta por até 5
  minutos; cada resposta faz no máximo uma chamada de assinatura, e nenhuma sem foto
- [ ] Removida a foto, o Storage para de servir a URL assinada emitida antes; quem já tinha a
  foto aberta deixa de vê-la em até 10 minutos
- [ ] Só a foto na pasta do próprio perfil é assinada
- [ ] Falha do Storage, rede caída ou falta da chave de serviço não derrubam a resposta: a
  foto vem nula e o erro vai ao log; o PATCH do perfil não responde 500 depois de gravar
- [ ] As respostas que levam o link vão com `Cache-Control: private, no-store`
- [ ] A chave de serviço só aparece em `lib/supabase/admin.ts`, e a rota passa a fábrica ao
  helper; nenhuma policy em `storage.objects`
- [ ] A foto aparece no Perfil e no menu lateral, e some ao remover (E2E, mobile e desktop)
- [ ] O commit com a proposta e o teste de RLS só vai para a `main` junto com a migration,
  depois do aval do Fernando

## 6. Riscos e pendências (insumo da seção 25)

- **O link assinado vale como senha até expirar.** Quem o copiar abre a foto sem login por
  até 10 minutos. Os dados básicos do perfil, foto inclusive, já são visíveis a qualquer
  autenticado, também em perfil privado: o privado não esconde a foto. Apagar a foto faz o
  Storage parar de servir o link na hora.
- **Navegador que já tinha a foto** (tela aberta, nova aba, voltar pelo histórico) pode
  mostrá-la do cache até o link vencer, em até 10 minutos. O E2E e o teste de RLS provam a
  origem, que para de servir na hora, e não o cache do navegador. Atualizar telas abertas ao
  vivo exige o Realtime, e fica para a S07, junto do feed.
- **CDN:** na Smart CDN (planos Pro em diante), apagar invalida o cache em até 60 s. Na CDN
  básica, a documentação não diz o que acontece depois de apagar, e o `Expires` do link pode
  segurar a cópia até ele vencer.
- **Se apagar o arquivo falhar** (só vai ao log), o link já emitido abre até vencer. A
  varredura do próximo envio remove o arquivo que sobrou.
- **Reaproveitamento por instância:** o link guardado fica na memória de cada instância do
  servidor. Em várias instâncias, cada uma assina por conta própria, o que ainda é bem menos
  que uma assinatura por página.
- **Menu lateral sem foto de reserva.** O `app/dashboard/layout.tsx`, compartilhado, mostra a
  foto com `<img>` cru, sem `onError`. Se ele for remontado com um link vencido ou um arquivo
  apagado, aparece imagem quebrada em vez das iniciais. Na prática o contexto renova o perfil
  quando o token da sessão é renovado. A troca para `AvatarImage` com reserva já está pedida
  ao Fernando na `S04-M-foto-perfil`.
- **Custo por leitura de perfil:** uma chamada ao Storage quando a foto não tem link
  guardado, e nenhuma quando tem ou quando não há foto. Sem a chave de serviço, as rotas de
  perfil seguem funcionando, sem a foto.
- **`lib/supabase/admin.ts` e `lib/env.ts`**, arquivos do Fernando. O primeiro ainda diz que a
  chave de serviço é usada só no `auth.admin` (pendência já registrada na
  `S04-M-foto-perfil`). O segundo diz que a chave "é necessária para convites por e-mail", e
  agora ela também assina as fotos. Os dois textos precisam acompanhar o código, para a seção
  25 bater com ele.
- **A busca (`S05-M-busca-pessoas`, commit local `15a25f1`)** usa `avatarPublico()`. Quando a
  branch dela for rebaseada sobre esta, a rota da busca troca pelo helper novo.
- **O primeiro teste do E2E é lento em servidor recém-subido.** O `editar-perfil` no chromium
  levou 20 a 31 s, e numa rodada estourou o limite de 30 s. Isso já acontecia: a evidência de
  08/10 registra 22 s para ele. O teste não chama o Storage, porque o Davi não tem foto nele.
- **Achados para a plataforma, de código que já está na `main`:**
  - `npm run pfc:rastreabilidade` acusa a tag `@RNF04` sem requisito no catálogo. Ela está em
    `tests/lib/env.test.ts`, do #35.
  - Na máquina do Micael, o `eslint .` quebra com um erro de configuração (regra
    `react-hooks/*` sem o plugin) por causa de um script `.cjs` na pasta pessoal `.micael/`,
    que fica fora do git e não afeta o CI. Fica só registrado, sem mudança no
    `eslint.config.mjs`, que é compartilhado. As etapas do `verify` rodaram uma a uma.

## 7. Evidência

- [ ] Saída dos testes em `docs/pfc/evidencias/S04-M-foto-privada-*`:
  - RLS: `-rls.txt`, 118 de 118 nos 7 arquivos, com a proposta aplicada;
  - integração e unit: `-integracao.txt`, 111 de 111. A suíte de unidade inteira deu 444 de
    444;
  - E2E da foto e do perfil: `-e2e.txt`, 14 de 14 no build de produção. A suíte inteira deu
    44 de 44. O spec da foto passou a provar que a URL pública não abre, que o menu também
    usa URL assinada e que o Storage para de servir o link da foto removida;
  - mutação: `-mutacoes.txt`, com 19 de 19 no código e 5 de 5 no Storage. Duas rodadas
    anteriores pegaram falhas nos testes:
    - uma mutação sobreviveu ("item com erro vira URL"), porque o teste mandava a URL vazia;
      agora há um caso com erro e URL juntos;
    - a policy "só para `.webp`" passaria; agora o teste conta as policies.
- [ ] Delta de cobertura (`-cobertura.txt`):
  - `lib/social/avatar.ts`, `lib/social/foto.ts`, `app/api/social/perfil/route.ts` e
    `app/api/profile/[userId]/route.ts` têm 100% de linhas e ramos;
  - `app/api/social/perfil/foto/route.ts` tem 100% de linhas e 94% de ramos. Os ramos sem
    teste são das linhas 67 (perfil não encontrado) e 155–158 (remoção parcial na
    varredura), código que esta atividade não toca.
