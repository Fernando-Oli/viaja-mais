---
id: S05-M-busca-pessoas
titulo: Aba Rede social com busca de pessoas
trilha: T3
responsavel: micael
revisor: fernando
semana: S05
requisitos: [RF09.10]
secoes_doc: [14, 22.1]
branch: feat/S05-M-busca-pessoas
tipo: [route-handler, regra-de-negocio, tela, documentacao]
depende_de: [S03-M-migration-social, S04-M-foto-perfil]
status: em-desenvolvimento
---
# Aba Rede social com busca de pessoas

> **Micael** · semana **S05** · primeira das atividades da aba Rede social, desenhada
> pelo Micael em 14/10

## 1. Contexto

A rede social ganha um lugar próprio no app: a aba **Rede social**, no menu lateral,
logo abaixo de Reservas. O desenho é do Micael:

- no centro, o feed, com as viagens publicadas por quem a pessoa segue e, intercaladas,
  sugestões de publicações públicas (S06 e S07);
- à esquerda do feed, um painel que recolhe e expande, com um campo no topo para
  buscar outras pessoas pelo nome;
- clicar numa pessoa abre o perfil dela, com seguir e as viagens publicadas (S05-M-seguir).

Esta atividade entrega a aba, o painel e a busca. O centro mostra um estado vazio até
a S07, e os resultados ainda não abrem nada: viram links na S05-M-seguir, junto com a
página do perfil, para nenhum link levar a uma página que ainda não existe.

Ela substitui a parte 2 da S04-M-perfil-publico. A primeira versão daquela página foi
desfeita em 14/10: o Micael não quis uma página aberta a partir do próprio perfil só
para ver como ele aparece para os outros.

**Requisito novo.** Buscar pessoas não estava no catálogo. Entra como **RF09.10**, junto
com o **RF09.11** (sugestões no feed, da S07), com o rascunho aprovado pelo Micael em
14/10. Pelo catálogo, nome, username e foto são visíveis a qualquer autenticado, também
em perfil privado. A busca encontra perfis privados e mostra que são privados.

**Sem migration.** A busca lê `profiles`, que é do domínio Social, com a policy
`profiles_select_autenticado` da S03. Nenhuma tabela, policy ou `types/database.ts` muda.

**Autorização.** `exigirMembro` e `exigirDono` não se aplicam: buscar não é recurso de
viagem. A regra é "só autenticado", garantida pelo `getUser()` da rota (401). A RLS é a
segunda linha, porque `anon` não lê `profiles`. Não há caminho 403: qualquer
autenticado pode buscar.

## 2. Arquivos afetados

- `app/dashboard/layout.tsx` (editar, **arquivo compartilhado**) — o item "Rede social"
  (`/feed`, ícone `Users`) abaixo de Reservas. É uma linha, como o "Meu perfil" do #29.
- `app/feed/layout.tsx` (criar) — reaproveita o layout do painel por import, para manter o
  menu lateral, e põe o painel de pessoas à esquerda do conteúdo. `app/dashboard/layout.tsx`
  não é editado além da linha do menu.
- `app/feed/page.tsx` (criar) — o centro: estado vazio, com o convite para usar a busca.
- `app/feed/painel-pessoas.tsx` (criar) — o painel. Desktop: coluna à esquerda com um
  botão só de recolher e expandir, que continua montado (o foco do teclado fica nele, e
  o termo e os resultados continuam lá ao expandir). Celular: botão "Buscar pessoas"
  que abre uma gaveta (`Sheet`). A busca começa a partir de 2 caracteres, 300 ms depois
  que a pessoa para de digitar, e cancela a busca anterior (`AbortController`); cada
  resposta guarda o termo a que responde, para uma resposta lenta nunca aparecer no
  lugar da mais nova. Cada resultado mostra a foto (ou o ícone de pessoa), o nome, o
  @username e um cadeado se o perfil for privado. Estados: dica inicial, termo longo ou
  com caractere fora da lista (com a mensagem de cada um), carregando, nenhum resultado,
  sessão expirada (com link para entrar de novo) e erro (com "Tentar de novo"). O leitor
  de tela ouve só o resumo ("3 pessoas encontradas"), numa região viva única.
- `app/api/social/perfis/route.ts` (criar) — `GET ?busca=`, no molde de
  `app/api/trips/[tripId]/route.ts`: `getUser()` (401) → zod (400) → três consultas a
  `profiles` → junta os resultados → `respostaDeErro`. As consultas: o username exato
  (`.eq`, para a @ana aparecer mesmo entre muitas Anas), e os que contêm o termo no
  nome e no username (`.ilike`), **ordenados por nome no banco antes do limite**, para
  os 20 escolhidos serem os primeiros em ordem de nome, e não 20 quaisquer. Fora dos
  resultados: o próprio usuário e contas sem username (contas anteriores ao social, que
  ainda não têm página). Resposta campo a campo: `username`, `full_name`, `avatar_url` e
  `is_public`. O `id` é lido só para o helper da foto conferir a pasta do dono, e não vai
  como campo.
  > **Atualizado no rebase sobre a `S04-M-foto-privada` (#38), em 21/10.** O bucket ficou
  > privado, e o `avatar_url` sai como URL assinada de 10 minutos, por
  > `assinarAvatares(criarClienteAdmin, pessoas)`: uma chamada ao Storage para a resposta
  > inteira, link reaproveitado por 5 minutos, nenhuma chamada sem foto. A resposta vai com
  > `Cache-Control: private, no-store`. Antes, a foto saía como URL pública, por
  > `avatarPublico()`, que deixou de existir.
- `lib/schemas/busca.ts` (criar) — `buscaPessoasSchema`: apara, normaliza (NFC), tira o
  `@` do começo, de 2 a 60 caracteres, e só aceita letras, números, espaço e `' ’ . _ -`.
- `lib/social/busca.ts` (criar) — regras puras: os limites, a normalização do termo, o
  padrão do `ilike` (com `_` escapado, porque é curinga do `LIKE` e aparece em username)
  e a junção das consultas, sem repetir pessoa, com o username exato primeiro e o resto
  em ordem de nome, até o limite.
- `docs/pfc/03-publico/14-requisitos-funcionais.md` (editar) — RF09.10 e RF09.11 na tabela
  do grupo RF09 e no detalhamento, com o que é público e o que é privado.
- `docs/plans/S04-M-perfil-publico.md` (editar) — a parte 2 passa a apontar para esta
  atividade e para a S05-M-seguir.
- Testes: `tests/lib/busca.test.ts`, `tests/api/social-perfis-busca-route.test.ts`,
  `e2e/rede-social.spec.ts` (criar).

**Por que lista de caracteres permitidos, e não escapar tudo.** O texto digitado vai como
valor do `.ilike()`, e não montado num filtro `.or(...)`, então vírgula e parêntese não
viram filtro do PostgREST. Sobram os curingas: `%` e `_` são do `LIKE`, e o PostgREST
ainda troca `*` por `%`. Recusar `%`, `*` e `\` com 400 é previsível. Escapar `*` dependeria
de detalhe do PostgREST. O `_` fica permitido, porque existe em username, e por isso é
escapado.

## 3. Passos

1. Catálogo: RF09.10 e RF09.11 na seção 14.
2. `lib/schemas/busca.ts` e `lib/social/busca.ts`, com os testes de unidade.
3. Rota `GET /api/social/perfis`, com a integração.
4. Item no menu, `app/feed/layout.tsx`, `page.tsx` e o painel.
5. E2E com screenshots; revisão independente; `npm run verify`; rastreabilidade; commit.

## 4. O que testar

*Preenchido por quem implementa, antes de abrir o PR.*

**Testes automatizados** (obrigatórios pelo `tipo`):

- [ ] Unit de `lib/schemas/busca.ts` e `lib/social/busca.ts`, com cobertura ≥70% em
  cada arquivo (meta: 100%). Casos: termo aparado, `@` tirado, limites de 2 e 60,
  caracteres recusados (`%`, `*`, `\`, `,`, `(`, `)`, `;`), acento e apóstrofo aceitos,
  `_` escapado no padrão, junção sem repetir, ordem por nome e limite
- [ ] Integração da rota:
  - 200: acha por nome e por username; o filtro exclui o próprio usuário e contas sem
    username; a resposta não leva `id`; o avatar sai como URL assinada, numa chamada só ao
    Storage, e a foto na pasta de outra pessoa não é assinada; a resposta vai sem cache
    compartilhado;
  - 401: sem sessão, não consulta o banco;
  - 400: termo curto, longo ou com caractere recusado, sem consultar o banco;
  - 500: erro do banco sem a mensagem crua.
  - Não há 403: qualquer autenticado pode buscar (ver bloco 1).
- [ ] E2E (`chromium` e `mobile`), com screenshot em `docs/pfc/evidencias/`: menu →
  Rede social → buscar "carla" → aparece; "Bruno" aparece com o cadeado; "davi" (quem
  busca) não aparece; "n_" não acha ninguém (prova o escape contra o banco de verdade);
  "a%" mostra a dica de caracteres; recolher e expandir o painel pelo teclado, sem perder
  o foco nem o termo; no celular, a gaveta; uma resposta atrasada não aparece no lugar
  da mais nova; sessão expirada; estado de erro com "Tentar de novo"; sem sessão,
  `/feed` leva ao login
- [ ] Mutação: cada proteção da rota e das regras sabotada sozinha derruba algum teste

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado
esperado de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

Pré-requisito: `npm run setup` nesta branch e `npm run dev`.

1. Entrar como `teste.d@viajamais.local` / `viajamais123`. → O menu lateral tem
   **Rede social** logo abaixo de Reservas.
2. Clicar em Rede social. → Abre `/feed`: à esquerda o painel "Pessoas" com o campo de
   busca; no centro, o estado vazio do feed.
3. Digitar `c`. → Nada é buscado; a dica pede pelo menos 2 caracteres.
4. Digitar `carla`. → Aparece Carla Teste, `@carla`, com a bolinha de ícone de pessoa.
5. Buscar `bru`. → Bruno Teste com o cadeado de perfil privado.
6. Buscar `davi`. → "Ninguém encontrado": quem busca não aparece.
7. Buscar `a%`. → Dica de que a busca aceita letras, números e espaço.
8. Recolher o painel pelo botão. → O centro ocupa o espaço; expandir volta como estava.
9. No DevTools em modo celular (Pixel 7). → O painel vira o botão "Buscar pessoas", que
   abre a gaveta com a busca.
10. Na aba Network, buscar `carla`. → `GET /api/social/perfis?busca=carla`, e nenhuma
    requisição direta ao Supabase (`/rest/v1/profiles`).
11. Sair e abrir `/feed`. → Redireciona para o login.

## 5. O que validar

*Escrito **antes** da implementação, de propósito: critério combinado depois que
já existe código para defender deixa de ser critério.*

> Dois critérios entraram depois da revisão independente, que achou os dois problemas:
> o username exato aparecer primeiro (sem ordem no banco, os 20 eram quaisquer) e o
> recolher e expandir manter o foco e o termo.

- [ ] O item "Rede social" fica no menu lateral, logo abaixo de "Reservas", e abre `/feed`
- [ ] Recolher e expandir pelo teclado mantém o foco no botão e o termo buscado
- [ ] Buscar `ana` traz a @ana em primeiro, mesmo que outras 20 pessoas tenham "ana" no
  nome; os demais vêm em ordem de nome
- [ ] O painel de pessoas fica à esquerda do feed e recolhe e expande no desktop; no
  celular, abre como gaveta
- [ ] `GET /api/social/perfis?busca=carla`, com sessão, devolve Carla Teste; buscar pelo
  username (`@carla`) dá o mesmo resultado; maiúsculas não importam
- [ ] Perfil privado aparece na busca, marcado como privado
- [ ] Quem busca não aparece nos próprios resultados
- [ ] A resposta traz só `username`, `full_name`, `avatar_url` e `is_public`, nunca `id`,
  e-mail ou datas; no máximo 20 pessoas
- [ ] Termo com `%`, `*` ou `\` recebe 400 e não chega ao banco; vírgula e parêntese
  não mudam a consulta; `_` é procurado como `_`, não como curinga
- [ ] Sem sessão: `GET /api/social/perfis` responde 401 e `/feed` leva ao login
- [ ] Nenhuma resposta de erro devolve a mensagem crua do Postgres
- [ ] Nenhum `supabase.from` na tela: a busca passa pela rota
- [ ] Uma resposta lenta não sobrescreve o resultado de uma busca mais nova
- [ ] Estados de carregando, nenhum resultado e erro tratados; sem `alert()` nem `confirm()`
- [ ] Funciona em mobile e desktop
- [ ] RF09.10 e RF09.11 no catálogo da seção 14, com o que é público e o que é privado
- [ ] ~~Autorização via `exigirMembro` / `exigirDono`~~ — não se aplica: buscar não é
  recurso de viagem; ver bloco 1

## 6. Riscos e pendências (insumo da seção 25)

- **Acento:** `joao` não acha `João`. Ignorar acento pede a extensão `unaccent` do
  Postgres, que é migration.
- **Escala:** a busca por trecho (`%termo%`) não usa índice e percorre `profiles`. Com
  poucos usuários não pesa. Um índice `pg_trgm` fica como melhoria futura (RNF de
  performance, migration da plataforma).
- **Enumeração:** a busca facilita listar quem existe, mas não expõe nada que um
  autenticado já não leia hoje pelo PostgREST (bloqueante B1 da plataforma, plano S03-M).
- **O UUID** não vai como campo, mas está no caminho da foto (risco aceito na
  S04-M-foto-perfil). O catálogo (RF09.10) diz isso com todas as letras.
- **A resposta de 4 campos não é fronteira de segurança.** Com o JWT do navegador, um
  autenticado lê todas as colunas de `profiles` direto pelo PostgREST, por causa da
  policy `USING (true)` da S03 (bloqueante B1 da plataforma). A RLS barra só o `anon`.
- **Sem limite de taxa.** A revisão mandou 30 buscas paralelas com 60 caracteres, e
  todas deram 200 em ~2,3 s. Cada busca custa dois `getUser()` (proxy e rota) e três
  consultas. Isso facilita enumerar usuários. O limite de taxa é da plataforma
  (`S06-F-rate-limit-csp`).
- **Ordem do banco e da tela.** O banco ordena com a collation dele e a tela com a do
  português. No limite dos 20, a fronteira pode diferir de uma pessoa para outra; a
  ordem mostrada é sempre a do português.
- **Casos que o E2E não prova contra o banco real, porque o seed não tem o dado:** o `_`
  achando um username com `_` (o E2E prova só que "n_" não vira curinga; a revisão
  conferiu o lado positivo à mão no Postgres) e a conta sem username ficando de fora (só
  a integração prova).
- **Cabeçalho de cache.** A resposta autenticada não traz `Cache-Control: private,
  no-store`. As rotas do projeto não usam esse cabeçalho, e a rota é dinâmica (lê
  cookie). Fica como suspeita para a plataforma conferir no deploy.
- **Status no catálogo.** O RF09.10 continua "Não iniciado" até o merge. Pelo fluxo do
  `CLAUDE.md`, o `/pfc-secao` das seções tocadas atualiza o status depois do merge.

## 7. Evidência

- [ ] Saída dos testes (unit, integração e E2E) em `docs/pfc/evidencias/S05-M-busca-*`,
  regravada em 21/10 depois do rebase sobre a `S04-M-foto-privada` (#38):
  - `S05-M-busca-integracao.txt`: 50 de 50;
  - `S05-M-busca-mutacoes.txt`: as 17 de 14/10 e mais 4 das partes novas (foto assinada,
    cabeçalho sem cache, leitura do `id`, `id` fora da resposta), todas mortas;
  - `S05-M-busca-e2e.txt`: 15 de 15 no build de produção, com o de recolher pulado no
    celular, de propósito.
  - A suíte inteira deu 494 testes de unidade e integração, RLS 118 de 118 e E2E 59
    passando. As 4 falhas de `e2e/00-fumaca` que existiam em 14/10 sumiram com as
    correções da `main`.
- [ ] Screenshots do fluxo (chromium e mobile): `S05-M-busca-pessoas-chromium.png`
  (painel com resultados) e `S05-M-busca-pessoas-mobile.png` (gaveta)
- [ ] Delta de cobertura (`S05-M-busca-cobertura.txt`): `lib/schemas/busca.ts`,
  `lib/social/busca.ts` e `app/api/social/perfis/route.ts`, novos, com 100% de linhas
  e ramos
