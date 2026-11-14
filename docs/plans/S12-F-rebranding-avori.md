---
id: S12-F-rebranding-avori
titulo: Aplicar a marca Avori na interface
trilha: T1
responsavel: fernando
revisor: audrey
semana: S12
requisitos: [RNF03.1, RNF03.5]
secoes_doc: [15, 17]
branch: feat/S12-F-rebranding-avori
tipo: [tela, componente]
depende_de: []
status: concluido
---
# Aplicar a marca Avori na interface

> **Fernando** · semana **S12** (11 a 17/11) · congelamento em 20/11

## 1. Contexto

O produto ganhou identidade nova, **Avori** (Manual de Marca V1.1, kit em `rebranding/`, fora do
versionamento). Hoje a interface mostra "Viaja+", com azul-marinho, laranja e verde fixos em classes
`viaja-*` espalhadas por cerca de 40 arquivos, e fonte Poppins. Esta atividade troca a marca por
tokens: paleta marfim, floresta, grafite e cítrico, fonte Instrument Sans, logotipo em SVG e o nome
Avori em todo texto visível.

Não muda regra, schema nem rota de API.

**Escopo ampliado em 13/11 (decisão do Fernando):** além da troca de tokens, a atividade aplica o
visual das telas do canvas: barra superior no desktop e barra de abas no celular, landing nova,
telas de conta em layout dividido, Painel com a próxima viagem, lista e cabeçalho de viagem com
capa, e a criação de viagem com duas opções — **montar com a Avori** (IA) ou **criar do meu jeito**
(formulário). O que ainda não tem lógica (feed, criação com IA, publicar, comentários) entra só com
o visual e dados de exemplo, marcado na tela com o selo "Prévia com dados de exemplo"
(`components/prototipo/`). A lógica continua com os donos: Micael (S06, S07, S10, S11).

Referências de design: design system https://claude.ai/artifact/BbWEdbTsEfd4K2oxBdmXHJ e telas
https://claude.ai/artifact/5GGDo2PEXLKYQecpdUPakk.

## 2. Arquivos afetados

- `public/brand/*.svg` — logo (floresta, marfim, grafite), símbolo (floresta, marfim), ícone, grafismo Percursos
- `app/icon.svg` — ícone do aplicativo; sai `app/favicon.ico` e `public/icon.svg`
- `components/brand/logo.tsx` — novo: `<Logo variante soSimbolo />`
- `app/globals.css` — tokens Avori no `@theme inline` e no `.dark`; saem `--color-navy/orange/green` e as utilitárias `viaja-*`
- `app/layout.tsx` — `Instrument_Sans` no lugar de `Poppins`; título e descrição
- `app/**`, `components/**` (cerca de 40 arquivos) — `viaja-*` e cinzas fixos viram tokens semânticos; "Viaja+" vira `<Logo />` ou "Avori"
- `supabase/config.toml`, `supabase/templates/convite.html` — nome no assunto e no corpo do convite
- `app/dashboard/layout.tsx` — barra superior (lg+); no celular, barra de abas e as demais seções no menu do avatar
- `app/(rede-social)/layout.tsx`, `sino.tsx` — o menu da aba sai (`navegacao.tsx` removido); o sino vai para a barra
- `app/page.tsx` — landing nova; `app/auth/layout.tsx` (novo) e `app/auth/*/page.tsx` — layout dividido
- `app/dashboard/page.tsx`, `app/dashboard/trips/page.tsx`, `app/dashboard/trips/[id]/page.tsx` — próxima viagem, cartões e cabeçalho com capa
- `app/dashboard/trips/criar/page.tsx` (novo) — escolha entre Avori e manual; `criar/ia/page.tsx` (novo, prévia)
- `app/dashboard/trips/new/page.tsx` — vira "Criar do meu jeito", com atalho para a Avori
- `app/(rede-social)/feed/page.tsx` + `components/prototipo/*` — feed, comentários e publicar como prévia
- `app/dashboard/reservar/{voos,hoteis}` (novos) + `components/prototipo/compra/*` — compra de passagens e hotéis como prévia (dados de exemplo, nada é cobrado); busca no topo de `app/dashboard/bookings` e atalho na aba Reservas da viagem
- `components/brand/capa-viagem.tsx` (novo) — capa com foto ou grafismo
- `e2e/00-fumaca`, `grupo-convite`, `estados-erro`, `rede-social`, `pesquisa` — nome e navegação novos

Não muda: `components/ui/*` (herda dos tokens), `project_id` do Supabase, e-mails do seed
(`@viajamais.local`), nome do repositório, IDs de plano, e a lista de usernames reservados em
`lib/schemas` (incluir `avori` nela é regra de negócio do Micael; fica registrado como pendência).

## 3. Passos

1. Copiar os SVG para `public/brand/` e criar `app/icon.svg`.
2. Criar `components/brand/logo.tsx`.
3. Reescrever os tokens em `app/globals.css`.
4. Trocar a fonte e os metadados em `app/layout.tsx`.
5. Substituir as classes, arquivo por arquivo, pela tabela:

   | De | Para |
   |---|---|
   | `bg-viaja-orange … text-white` (botão) | variante padrão do `<Button>` (`bg-primary text-primary-foreground`) |
   | `bg-viaja-navy`, `bg-viaja-green` | `bg-primary` (com `text-primary-foreground`) |
   | `text-viaja-navy` | `text-foreground` |
   | `text-viaja-orange`, `text-viaja-green` | `text-primary` |
   | `border-viaja-orange` | `border-primary` |
   | `bg-gray-50`, `bg-white` de página | `bg-background`, `bg-card` |
   | `text-gray-600`, `text-slate-600` | `text-muted-foreground` |
   | `text-slate-900` | `text-foreground` |

6. Trocar o nome nos textos, no template e no assunto do convite.
7. Ajustar os dois E2E e rodar a suíte inteira.

## 4. O que testar

**Testes automatizados**

- [x] `e2e/00-fumaca.spec.ts`: o título da página casa com `/Avori/`
- [x] `e2e/grupo-convite.spec.ts`: a mensagem do convite cita "Avori"
- [x] `e2e/rede-social.spec.ts`: Feed e Pesquisar na barra do app, com `aria-current` certo, em computador e celular
- [x] `e2e/compra-previa.spec.ts`: voo e hotel de ponta a ponta, recusa com cartão final 0000, selo de prévia na confirmação
- [x] `e2e/estados-erro.spec.ts`: o 404 dentro do app mantém a barra (link "Viagens")
- [x] `e2e/acessibilidade.spec.ts` (@RNF03.5 · @RNF03.1): zero violações WCAG 2.1 A/AA com a paleta nova, em computador e em celular
- [x] `e2e/csp.spec.ts`: a fonte nova não gera pedido a host externo
- [x] Suíte E2E completa verde, com screenshots regenerados em `docs/pfc/evidencias/`

**Roteiro de teste manual**

1. `npm run dev` e abrir `/` → esperado: logotipo Avori no topo, fundo marfim, texto em Instrument Sans, nenhum "Viaja+".
2. Entrar como `teste.a@viajamais.local` → esperado: barra superior floresta com a assinatura marfim (no celular, barra de abas no rodapé); botões primários floresta com texto marfim.
2b. "Nova viagem" → esperado: escolha entre "Montar com a Avori" e "Criar do meu jeito"; o manual cria a viagem de verdade; o da Avori é prévia e avisa que não grava.
3. Abrir uma viagem, Finanças e Rede social em 412px e em 1440px → esperado: nenhum azul-marinho ou laranja; nenhum texto ilegível.
4. Convidar `novo@exemplo.com` e abrir http://localhost:54324 → esperado: assunto e corpo do e-mail dizem "Avori".
5. Aba do navegador → esperado: ícone floresta com o símbolo, título "Avori".

## 5. O que validar

- [x] `grep -rE "viaja-(navy|orange|green)" app components` não devolve nada
- [x] `grep -rE "Viaja ?\+|ViajaMais" app components supabase/templates supabase/config.toml` não devolve nada
- [x] `app/globals.css` não define `--color-navy`, `--color-orange` nem `--color-green`
- [x] Nenhum arquivo de `components/ui/` foi alterado, exceto `confirm-modal.tsx`
- [x] O logotipo é sempre `<img>` de um SVG de `public/brand/`; a palavra "avori" não é composta em texto para imitar a marca
- [x] Nenhum texto usa cítrico (`#D7EC92`) sobre marfim; sobre fundo cítrico o texto é grafite
- [x] `e2e/acessibilidade.spec.ts` passa sem regra desligada a mais
- [x] Nenhuma rota em `app/api/**`, migration ou arquivo de `lib/` foi alterado
- [x] Funciona em mobile (412px) e desktop; nenhuma tela perde função
- [x] Toda tela com dados de exemplo mostra o selo de prévia e não grava nada
- [x] `npm run verify` verde

## 6. Evidência

- [x] Saída de `npm run verify` e da suíte E2E
- [ ] Screenshots antes e depois da landing, do painel e de uma viagem, em celular e computador
- [x] Saída dos dois `grep` do bloco 5

## 7. Etapas e PRs

A atividade sai em PRs pequenos, mergeados em sequência sobre a `main` (sem PR empilhado).
Branches `feat/S12-F-rebranding-avori-<n>-<slug>`. Plano completo das etapas: este arquivo.

| Etapa | PR | Conteúdo |
|---|---|---|
| 1 | 1 · base-navegacao | tokens, fonte, logo, ícone, nome Avori, convite; barra superior e barra de abas; troca de classes em todas as telas |
| 1 | 2 · landing-conta | landing nova; entrar, criar conta e recuperar senha em layout dividido |
| 1 | 3 · viagem-previas | Painel com a próxima viagem, lista e cabeçalho de viagem com capa, escolha Avori × manual, prévias de IA, feed, comentários e publicar |
| 1 | 4 · compra-previa | compra de voos e hotéis como prévia, a partir de Reservas |
| 2 | 5 · telas-viagem | roteiro, reservas, lugares, grupo, formulários da viagem, Agenda e Lugares gerais |
| 3 | 6 · telas-financas | despesas, rateio, acerto e Finanças |
| 4 | 7 · telas-social | pesquisa, notificações, perfis, seguidores, editar perfil e configurações |
| 5 | 8 · estados-fechamento | carregando, erro, 404, verifique seu e-mail; acessibilidade das telas novas; evidências |

Regra de todas as etapas: só visual. Nenhuma mudança em busca de dados, route handler, `lib/`,
migration ou RLS; o que ainda não tem lógica fica em `components/prototipo/` com o selo de prévia.
