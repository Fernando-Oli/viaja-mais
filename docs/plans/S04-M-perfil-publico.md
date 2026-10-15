---
id: S04-M-perfil-publico
titulo: Perfil público em /u/[username]
trilha: T1
responsavel: micael
revisor: fernando
semana: S04
requisitos: [RF02.1, RF02.2, RF02.5, RF02.6, RF02.7]
secoes_doc: [22.1]
branch: feat/S04-M-perfil-publico
tipo: [regra-de-negocio, route-handler, tela]
depende_de: [S03-M-migration-social]
status: em-desenvolvimento
---
# Perfil público em /u/[username]

> **Micael** · semana **S04** (16 a 22/09) · marco da semana: _RLS provada por teste_

## 1. Contexto

Primeira superfície pública do produto. Cada pessoa ganha uma página de perfil
em `/u/<username>` e passa a poder editar `username`, `bio` e público/privado
(RF02.5, RF02.6, RF02.7), além de nome e avatar (RF02.2).

Hoje não existe tela `/u/...`. A edição de perfil vive em `/dashboard/settings`,
que só edita nome e avatar por `POST /api/profile/update` — sem zod, validação à
mão. E `app/api/profile/[userId]/route.ts` tem um PATCH com `.update(body)`
(mass-assignment, com TODO), que nenhuma tela usa.

**Duas partes, dois PRs**, empilhados sobre o PR da S03 (#27). A atividade inteira
passaria de ~1.000 linhas, e o limite combinado é ~400 por PR:

| PR | Branch | Conteúdo |
|---|---|---|
| Parte 1 — editar perfil | `feat/S04-M-perfil-publico` | schema zod, rota GET/PATCH do próprio perfil, página Perfil |
| Parte 2 — página pública | `feat/S04-M-perfil-publico-pagina` | rota GET por username, tela `/u/[username]` |

**Dependência:** as colunas `username`, `bio` e `is_public` vêm da migration da S03
(`20261007105848_social_perfil_e_follows.sql`), que subiu no #27 com o aval do
Fernando. Este PR é empilhado sobre ela, e o **merge** espera o da S03. Nenhuma tabela
de outro domínio é consultada, e não há SQL, migration, RLS nem `types/database.ts`
nesta atividade (os clientes Supabase do projeto não usam o tipo `Database`, então
o typecheck não depende dos tipos regenerados).

**Autorização.** `exigirMembro`/`exigirDono` não se aplicam: respondem "participa
desta viagem?", e perfil não é recurso de viagem. A regra aqui é "só o próprio
perfil": o `id` vem **sempre** de `getUser()`, nunca do corpo nem da URL, e a RLS de
`profiles` (`profiles_update_proprio`, da S03) é a segunda linha. Por isso o caminho
403 dos testes de rota vira o teste de que mandar `id`, `created_at` ou dado de
outra pessoa no corpo **não tem efeito**.

## 2. Arquivos afetados

**Parte 1 — editar perfil**
- `lib/schemas/perfil.ts` (criar) — `atualizarPerfilSchema` e `usernameSchema`:
  username normalizado (trim + minúsculas), formato `^[a-z0-9_]{3,30}$` e nomes
  reservados; bio ≤280; nome ≤120; avatar `https://` ou vazio (vira nulo);
  `is_public` booleano. No PATCH tudo é opcional, mas corpo vazio é 400.
- `app/api/social/perfil/route.ts` (criar) — GET e PATCH do próprio perfil, no molde
  de `app/api/trips/[tripId]/route.ts`. O GET alimenta o formulário e funciona com
  `username` nulo (contas novas não têm). O PATCH atualiza campo a campo; username
  repetido (23505) vira 409; qualquer outro erro do banco vira 500 genérico, sem a
  mensagem do Postgres (RNF02.11).
- `lib/schemas/perfil-limites.ts` (criar) — os limites sem dependência, para a tela
  usar no `maxLength` sem levar o zod ao bundle do navegador.
- `app/dashboard/perfil/page.tsx` (criar) — **decisão do Micael:** o perfil ganha página
  própria, aberta pelo menu do usuário (clicar no avatar e nome → "Meu perfil"). No
  topo, um cartão mostra como os outros veem o perfil (avatar, nome, @username, bio,
  selo Público/Privado), atualizado ao salvar; embaixo, o formulário em dois blocos,
  "Dados do perfil" e "Privacidade". Lê e grava por `/api/social/perfil` e envia só o
  que mudou (um campo antigo fora do padrão não bloqueia salvar a bio). A primeira
  versão pôs esses campos em Configurações; o Micael viu no navegador e pediu a
  separação.
- `app/dashboard/settings/page.tsx` (editar) — fica só com Conta (e-mail) e Segurança
  (senha), com um link para Meu perfil. Junto com `app/api/profile/**`, não está na
  lista de caminhos do domínio, mas implementa o RF02, que é do Micael no `CLAUDE.md`.
- `app/dashboard/layout.tsx` (editar, **arquivo compartilhado**) — o item "Meu perfil" no
  menu do usuário: um ícone no import e um `DropdownMenuItem`. O plano norte pede PR
  dedicado para arquivo compartilhado; aqui são duas linhas sem outra mudança, como na
  S03-A, que ajustou o mesmo arquivo dentro do PR dela.
- `app/api/profile/update/route.ts` (apagar) — substituída por `/api/social/perfil`.
- `app/api/profile/[userId]/route.ts` (editar) — sai o PATCH com `.update(body)`
  (mass-assignment, sem uso); o GET, que o `context/auth-context.tsx` (compartilhado)
  usa para o cabeçalho, passa ao molde: `getUser()`, id validado, `respostaDeErro`,
  sem a mensagem crua do Postgres. A resposta continua `{ profile }`.
- `supabase/seed.sql` (editar) — Davi, usuário reservado aos E2E de perfil: os testes
  de RLS contam com Ana, Bruno e Carla como o seed os deixa.
- `tests/lib/perfil-schema.test.ts`, `tests/api/social-perfil-route.test.ts` e
  `tests/api/profile-userid-route.test.ts` (criar) — unit e integração.
- `e2e/editar-perfil.spec.ts` (criar) — fluxo de edição com screenshot e estado de erro.
- O formulário de senha, que continua em Configurações, **não foi tocado**: senha e
  autenticação são da plataforma, não do domínio Social. Uma primeira versão desta
  atividade corrigiu um bug nele; o Micael pediu para desfazer, e o formulário voltou
  a ser idêntico ao da `main`. O bug fica registrado abaixo como achado para o dono.

**Parte 2 — página pública**
- `app/api/social/perfis/[username]/route.ts` (criar) — GET por username.
- `app/u/[username]/page.tsx` (criar) — client component no padrão das telas da
  Audrey (`use(params)` + `fetch` da rota): nenhum `supabase.from` na tela.
- `tests/api/social-perfis-route.test.ts` (criar) e `e2e/perfil-publico.spec.ts` (criar).

**As duas:** `docs/pfc/05-arquitetura/22-implementacao.md` (seção 22.1) e o status de
RF02 no catálogo da seção 14, via `/pfc-secao` depois do merge.

**Riscos e pendências registrados (insumo da seção 25):**
- O avatar é carregado pelo navegador de quem vê (`images.unoptimized` no
  `next.config.mjs`, `<img>` no cabeçalho): o host escolhido pelo dono do perfil
  recebe o IP de quem visita. A rota recusa http, credencial na URL, `localhost` e
  IP literal, mas não escolhe o host — ver o risco aceito no plano S03-M.
- Depois do merge desta parte, nenhuma rota envia `profiles.updated_at`: o grant de
  UPDATE nessa coluna, mantido na S03 só por compatibilidade, pode sair.
- **Achados para o dono da autenticação (plataforma), não corrigidos aqui:**
  - o formulário de senha em `app/dashboard/settings/page.tsx` chama
    `e.currentTarget.reset()` depois de um `await`, quando o React já zerou o
    `currentTarget`. A senha muda, mas os campos continuam preenchidos e aparece o toast
    "Cannot read properties of null" logo depois de "Senha alterada". Reproduzido com o
    usuário Davi; a correção é guardar `const formulario = e.currentTarget` antes do
    primeiro `await`;
  - `app/api/auth/change-password/route.ts` não usa zod e devolve ao cliente a mensagem
    crua do erro do Auth.

## 3. Passos

1. Schema `lib/schemas/perfil.ts` + unit test.
2. Rota `app/api/social/perfil` (GET, PATCH) + integração.
3. Tela de edição (local a decidir) + faxina das rotas antigas.
4. E2E da edição; `npm run verify`; PR da parte 1.
5. Rota `app/api/social/perfis/[username]` + integração.
6. Tela `/u/[username]` (estados de carregando, erro e não encontrado).
7. E2E da página pública; `npm run verify`; PR da parte 2.

## 4. O que testar

Obrigatórios pelo tipo (`regra-de-negocio, route-handler, tela`):

- [x] Unit do schema com casos de borda; cobertura ≥70% em `lib/schemas/perfil.ts`
  — parte 1: `tests/lib/perfil-schema.test.ts`, 100% de linhas e ramos
  (`S04-M-editar-perfil-cobertura.txt`). A revisão do PR acrescentou os casos de
  nome e bio só com caracteres invisíveis, de caracteres de controle e de surrogate
  isolado, que antes passavam (e o NUL virava 500 no banco)
- [ ] Integração das rotas: 200 feliz · 401 sem sessão · 400 payload inválido · e,
  no lugar do 403 (não há perfil-alvo na URL), o corpo não reescreve `id`/`created_at`
  e o update é sempre filtrado pelo `id` da sessão. Mais 409 (username em uso) no
  PATCH e 404 (username inexistente) no GET por username
  — parte 1: `tests/api/social-perfil-route.test.ts` e `tests/api/profile-userid-route.test.ts`,
  100% de linhas e ramos nas duas rotas; o GET por username é da parte 2
- [ ] E2E da edição e da página pública, com screenshot em `docs/pfc/evidencias/`
  (projetos `chromium` e `mobile`), incluindo o estado de erro da tela
  — parte 1: `e2e/editar-perfil.spec.ts` (entrada pelo menu do usuário, edição, Configurações
  isolada e estado de erro); a página pública é da parte 2

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

Pré-requisito: `npm run setup` nesta branch (a migration da S03 vem junto) e
`npm run dev` em http://localhost:3000.

1. Entrar como `teste.d@viajamais.local` / `viajamais123` (Davi, reservado aos testes de
   perfil), clicar no avatar e nome no rodapé do menu e escolher **Meu perfil**.
   → Abre `/dashboard/perfil`: o cartão mostra @davi e o selo Público; o formulário
   traz nome, username `davi`, avatar, bio e o seletor de privacidade ligado.
2. Trocar a bio, desligar "Perfil público" e salvar. → Toast "Perfil atualizado"; o
   cartão passa a mostrar a bio nova e o selo Privado; recarregar mantém os dois.
3. Tentar o username `ana`. → Toast de erro "nome de usuário em uso"; nada muda.
4. Tentar o username `Admin` e depois `ab`. → Erro de validação (reservado; curto demais).
   Apagar o username e salvar. → Aviso de que não dá para deixar em branco; nada muda.
   Salvar sem mudar nada. → Toast "Nada para salvar".
5. Abrir `/u/davi` (parte 2). → Avatar, nome, @davi, bio e o link "Editar perfil" (é você).
6. Sair, entrar como `teste.a@viajamais.local` e abrir `/u/bruno`. → Dados básicos e o
   selo "Perfil privado"; sem "Editar perfil".
7. Abrir `/u/nao_existe`. → Mensagem de perfil não encontrado.
8. Sair e abrir `/u/bruno` sem sessão. → Redireciona para o login (proxy).
9. Repetir os passos 1, 2 e 6 no DevTools em modo celular (ex.: Pixel 7). → Layout
   utilizável, sem rolagem horizontal.
10. Abrir Configurações. → Só Conta e Segurança, com o link "Meu perfil".
11. No DevTools, aba Network, salvar o perfil. → `PATCH /api/social/perfil`, e nenhuma
    requisição direta ao Supabase (`/rest/v1/profiles`).

## 5. O que validar

Critérios objetivos e binários. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

> Critérios ajustados em relação ao rascunho, para bater com o detalhamento do RF02
> na seção 14: "visitante anônimo vê o perfil público" e "perfil privado devolve
> 404" contradiziam o catálogo, que manda os dados básicos ficarem visíveis a
> qualquer **autenticado**, inclusive em perfil privado; quem não tem sessão é
> mandado ao login pelo proxy. "Autorização via `exigirMembro`/`exigirDono`" virou o
> equivalente para perfil.

- [ ] Perfil privado mostra só os dados básicos (nome, username, avatar, bio) e o selo
  de privado; publicações e contadores ficam para a S06 e a S05
- [ ] Sem sessão, `/u/...` redireciona para o login e as rotas respondem 401
- [ ] Username único, minúsculo, no formato e fora da lista de reservados; repetido dá 409
- [ ] Username não pode ser apagado: a tela avisa, em vez de mostrar "salvo" sem salvar
- [ ] A tela envia só o que mudou; sem mudança, nada vai ao servidor
- [ ] O perfil tem página própria, aberta pelo menu do usuário; Configurações fica só
  com conta e senha
- [ ] Ninguém edita perfil alheio: o `id` do update vem da sessão, nunca do corpo ou da URL
- [ ] Nenhuma resposta de erro devolve a mensagem crua do Postgres
- [ ] Nenhuma despesa ou dado de outro membro aparece
- [ ] Funciona em mobile e desktop
- [ ] Feedback por `toast()`; sem `alert()` nem `confirm()`
- [ ] Estado de erro e de carregamento tratados
- [ ] `await params` nas rotas; `use(params)` nas telas (nesta versão do Next, params é Promise)
- [ ] Corpo validado por zod, com campos extraídos um a um — nunca `...body`
- [ ] Nenhum `supabase.from` em tela ou componente: leitura e escrita pelas rotas
- [ ] ~~Autorização via `exigirMembro` / `exigirDono`~~ — não se aplica: perfil não é
  recurso de viagem; ver "Autorização" no bloco 1

## 6. Evidência

- [ ] Saída dos testes (unit, integração e E2E) em `docs/pfc/evidencias/S04-M-*`
  — parte 1: `S04-M-editar-perfil-integracao.txt` (62 de 62), `S04-M-editar-perfil-cobertura.txt`, `S04-M-editar-perfil-e2e.txt`
  (6 de 6)
- [ ] Screenshots do fluxo (chromium e mobile) — parte 1: `S04-M-editar-perfil-chromium.png`
  e `-mobile.png`
- [ ] Delta de cobertura de `lib/schemas/perfil.ts` e das rotas novas — parte 1:
  `lib/schemas/perfil.ts`, `lib/schemas/perfil-limites.ts`, `app/api/social/perfil/route.ts`
  (novos) e `app/api/profile/[userId]/route.ts` (0% → 100%), todos com 100% de linhas e ramos
