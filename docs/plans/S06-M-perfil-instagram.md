---
id: S06-M-perfil-instagram
titulo: O "Perfil" do menu vira o próprio perfil, no modelo do Instagram
trilha: T1
responsavel: micael
revisor: fernando
semana: S06
requisitos: [RF02.1, RF09.6, RF09.14, RF09.16]
secoes_doc: [14, 22.1]
branch: feat/S06-M-publicar-viagem   # sem branch própria: decisão do Micael em 19/11, entra no PR #51
tipo: [regra-de-negocio, tela]
depende_de: [S06-M-publicar-viagem]
status: validacao
---
# O "Perfil" do menu vira o próprio perfil, no modelo do Instagram

> **Micael** · semana **S06** · desenho aprovado pelo Micael em 19/11 · tela testada e **aprovada no app** por ele em 19/11.
> Commit pendente: sai na conferência conjunta com o lote de correções do POST (mesma árvore, PR #51).

## 1. Contexto

Hoje o "Perfil" do menu (`/dashboard/perfil`) é só o formulário de edição. Publicações, Marcações e
os contadores existem só em `/u/<username>`, e a pessoa só chega lá digitando o endereço ou pela
busca. A atividade faz de `/dashboard/perfil` o próprio perfil, como no Instagram: cabeçalho com
foto, nome, @username, visibilidade, contadores (publicações, seguidores e seguindo) e bio; os
botões "Editar perfil" e "Criar"; e as abas Publicações e Marcações. O formulário passa para
`/dashboard/perfil/editar`, sem mudança de comportamento.

Decisões do Micael (19/11):

- O contador "N publicações" entra no `PerfilVisto` (`lib/social/perfil-visto.ts`), contado com a
  sessão de quem vê. Fora da rede visível ele vem nulo ("— publicações"): a RLS esconderia os posts
  e a contagem daria 0, o que seria falso. Mostrá-lo em perfil privado exigiria função `SECURITY
  DEFINER` (migration), fora do escopo.
- Os contadores abrem as listas que já existem, `/u/<eu>/seguidores` e `/u/<eu>/seguindo`.
- Nenhum link "Ver página pública" (rejeitado em 14/10). O `/u/<username>` continua sendo o endereço
  que os outros abrem, com o mesmo cabeçalho.

## 2. Arquivos afetados

- `components/social/perfil-cabecalho.tsx` (novo) — cabeçalho compartilhado pelos dois perfis
- `components/social/perfil-abas.tsx` (novo) — abas Publicações e Marcações compartilhadas
- `app/dashboard/perfil/page.tsx` — o próprio perfil; sem username, vai para o editar
- `app/dashboard/perfil/editar/{page.tsx,enquadrar-foto.tsx,recortar-foto.ts}` — o formulário, movido;
  salvar volta ao perfil (só com username)
- `app/(rede-social)/u/[username]/page.tsx` — usa os componentes novos; "Editar perfil" aponta para o editar
- `lib/social/perfil-visto.ts` — campo `publicacoes`
- `tests/api/perfil-visto-dubles.ts`, `tests/api/social-perfil-visto-route.test.ts` — contagem
- `tests/components/perfil-cabecalho.test.tsx` (novo)
- `e2e/perfil-proprio.spec.ts` (novo); `e2e/editar-perfil.spec.ts` e `e2e/foto-perfil.spec.ts` no endereço novo

Fora do escopo: migration, RLS, rotas novas, `app/dashboard/layout.tsx`, o menu, o diálogo de
publicar viagem.

## 3. Passos

1. `publicacoes` no `PerfilVisto` + testes da rota.
2. Extrair cabeçalho e abas do `/u/[username]`.
3. Mover o formulário para `/dashboard/perfil/editar`.
4. Nova `/dashboard/perfil`.
5. E2E novo, ajuste dos E2E antigos e regressão.

## 4. O que testar

**Testes automatizados:**

- [x] `e2e/perfil-proprio.spec.ts` (chromium e mobile, screenshots `docs/pfc/evidencias/S06-M-perfil-*`):
  1. "Perfil" do menu mostra o cabeçalho com contadores, as abas e "Criar";
  2. os contadores abrem as listas de seguidores e de seguindo;
  3. a grade abre o post (`/feed/<id>`);
  4. "Editar perfil" abre o formulário, e salvar volta ao perfil;
  5. conta sem username cai no editar.
- [x] `e2e/editar-perfil.spec.ts` e `e2e/foto-perfil.spec.ts` no endereço novo do formulário.
- [x] Regressão: `e2e/seguir.spec.ts`, `e2e/marcacoes.spec.ts`, `e2e/posts.spec.ts`, `e2e/listas.spec.ts`.
- [x] Unit/integração: `publicacoes` na rota do perfil (contado com a sessão, nulo fora da rede e
      quando a contagem falha); cabeçalho (contadores como link só com a rede visível, selo de visibilidade).

**Roteiro de teste manual:**

1. Entrar como `teste.a@viajamais.local` → clicar em "Perfil" no menu → esperado: `/dashboard/perfil`
   com foto, "Ana", "@ana · Público", contadores, bio, "Editar perfil", "Criar", abas.
2. Clicar em "N seguidores" → esperado: lista de seguidores da Ana. Voltar; idem "seguindo".
3. Clicar num post da grade → esperado: `/feed/<id>`.
4. "Editar perfil" → mudar a bio → "Salvar perfil" → esperado: volta ao perfil com a bio nova.
5. Cadastrar conta nova → abrir `/dashboard/perfil` → esperado: cai em `/dashboard/perfil/editar`.

## 5. O que validar

- [x] `/dashboard/perfil` de quem tem username mostra o cabeçalho com "N publicações", "N seguidores" e
      "N seguindo", e os dois últimos são links para `/u/<username>/seguidores` e `/u/<username>/seguindo`.
- [x] Quem não tem username, ao abrir `/dashboard/perfil`, é levado a `/dashboard/perfil/editar` sem ver o perfil.
- [x] O formulário em `/dashboard/perfil/editar` se comporta como antes (só o alterado vai no PATCH,
      foto com enquadramento, username em branco recusado); salvar com username volta ao perfil.
- [x] `/u/<username>` e `/dashboard/perfil` usam o mesmo componente de cabeçalho e de abas.
- [x] `publicacoes` é contado com a sessão (nunca com a chave de serviço) e vem nulo quando quem vê não
      pode ver a rede do perfil (privado sem vínculo aceito) ou quando a contagem falha — sem derrubar o perfil.
- [x] Nenhum `supabase.from` em tela; nenhuma rota, migration ou policy nova; nenhum link "Ver página pública".
- [x] Funciona em mobile e desktop; carregando, erro e sessão vencida tratados; feedback por `toast()`.

## 6. Evidência

- [x] Saída dos testes
- [x] Screenshots `docs/pfc/evidencias/S06-M-perfil-*`
- [ ] Delta de cobertura de `lib/social/perfil-visto.ts`

## 7. Resultado (19/11)

- E2E `perfil-proprio.spec.ts`: 10/10 (chromium e mobile), no dev e no build de produção.
- Regressão contra o build de produção: `listas`, `editar-perfil` e `perfil-proprio` 34/34; `seguir`, `marcacoes`,
  `posts`, `solicitacoes` e `foto-perfil` verdes no dev. No dev, 6 testes de `listas` falham por StrictMode
  (carregamento inicial em dobro, que eles contam) — não é regressão.
- `editar-perfil.spec.ts`: o locator do menu do avatar passou a ser pelo nome ("Minha conta"); o antigo
  `button[aria-haspopup="menu"]` também pegava o botão das Dev Tools do Next no dev.
- vitest 1459, typecheck, build e `pfc:rastreabilidade:check` verdes; lint verde com `--ignore-pattern ".micael/**"`.
- Mutação: tirar o filtro de visibilidade do contador de publicações derruba 2 testes da rota.
