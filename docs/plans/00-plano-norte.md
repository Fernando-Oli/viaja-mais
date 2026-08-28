# ViajaMais — Plano Norte do PFC (7º Período, entrega única 01/12/2026)

## Contexto

O `viaja-mais` precisa virar entrega de Projeto Integrador do 7º período. Pelo *Orientações Entregas*, o
foco que você descreveu (integração completa, qualidade, testes, segurança) é exatamente a **Fase 02 do
7º período**: cria pela primeira vez as seções **24 (Qualidade do Software e Testes)** e **25 (Segurança
da Informação)**, e obriga a atualização de **20, 21, 22 (22.1/22.2/22.3), Parte 00 e Parte 02**. Na
prática o documento inteiro (seções 1–25) precisa estar preenchido e coerente, sem os textos
orientadores, entregue em **PDF no AVA**.

O problema é a distância entre o que está documentado e o que existe:

- **O banco não está no repositório.** Zero arquivos `.sql`; `scripts/` não existe em disco e ainda por
  cima está no [.gitignore:5](.gitignore#L5). O schema só existe em prosa em
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — e já diverge do código (o doc define
  `trip_invitations.responded_at`, o código grava `updated_at`; o doc não tem `profiles.email`, o código
  seleciona). **O projeto não é reproduzível.**
- **Nenhuma RLS versionada**, e todos os três clientes Supabase usam a chave anon — a RLS é a *única*
  camada de autorização, e ela não está no repo. `SECURITY.md` afirma que está habilitada; isso é
  inverificável.
- **Sem testes, sem CI, sem lint.** `npm run lint` falha (ESLint não instalado).
  [next.config.mjs:3-5](next.config.mjs#L3-L5) desliga erros de TypeScript — o build é verde por supressão.
- **Furos de autorização exploráveis** (detalhados na trilha T1) e **páginas de auth mock** ainda
  navegáveis ([app/login/page.tsx](app/login/page.tsx), [app/register/page.tsx](app/register/page.tsx)).
- Funcionalidades prometidas na doc que não existem: editar viagem, editar/excluir itinerário e despesa,
  reservas sem nenhum ponto de entrada, convite por e-mail que nunca envia.

Este plano cobre três frentes em paralelo até 01/12: **governança do repositório** (agentes, skills,
planos, CI/CD, Notion), **conclusão do software** (consolidação + divisão de custos + rede social + IA de
roteiros) e **o documento de especificação**.

### Premissas (corrija se estiver errado)

| # | Premissa | Origem |
|---|---|---|
| P1 | **Congelamento em 01/12/2026**, entrega única, sem Fase 01 | Sua 1ª mensagem diz "até um de dezembro"; depois você mencionou "dia 12". Planejo para **01/12** (mais conservador). Se for 12/12, é uma semana de folga — não replanejo. |
| P2 | Equipe de 4: **Fernando** (líder técnico — produz e revisa todos os PRs), **Abner**, **Micael**, **Audrey** | Você. Nomes completos vieram da capa do PI V; **matrículas e orientadores ainda faltam** para a seção 3. |
| P3 | Notion via **API token no CI** (sem MCP) | Sua escolha |
| P4 | Documento em **Markdown versionado, export manual** | Sua escolha |
| P5 | IA de roteiros com **provider gratuito**, atrás de um adapter | Sua escolha. Default sugerido: Gemini free tier; troca para Claude é troca de um arquivo. |

### Risco de escopo — leia antes de aprovar

Consolidação + divisão de custos + rede social completa (perfil, feed, seguir, avaliações) + IA de
roteiros, com 4 pessoas e 14 semanas, é **agressivo**. A seção 24 do documento é avaliada por *coerência
entre testes e funcionalidades*, não por quantidade de features. Por isso o plano tem uma **linha de
corte explícita** (§6) e congela features em **20/11**, uma semana e meia antes da entrega. Se algo
escorregar, corta-se de baixo para cima na lista — nunca testes, RLS, migrations ou documento.

---

## 1. Governança do repositório

### 1.1 `.claude/` — agentes e skills

```
.claude/
  settings.json              # permissões (npm/git/supabase/playwright), hook de pre-commit
  agents/
    doc-pfc.md               # redator acadêmico pt-BR; conhece o template e as regras por seção
    schema-db.md             # migrations, RLS, índices, geração de tipos
    feature-web.md           # features Next 16 seguindo o padrão do repo
    qa-testes.md             # Vitest, Playwright, fixtures, cobertura
    seguranca.md             # threat model, testes de RLS, insumo da seção 25
  skills/
    atividade/SKILL.md
    pfc-secao/SKILL.md
    pfc-entrega/SKILL.md
    rastreabilidade/SKILL.md
    evidencias/SKILL.md
    notion/SKILL.md
    revisao-pr/SKILL.md
```

**Agentes** (`.claude/agents/*.md`, frontmatter `name`/`description`/`tools`/`model`) — são o mecanismo de
"trocar de agente durante a execução": as skills abaixo os invocam via Agent tool.

| Agente | Papel | Ferramentas |
|---|---|---|
| `doc-pfc` | Escreve/atualiza seções do documento no registro acadêmico exigido (extensão em linhas, tabelas RNE/RF/RNF, sem jargão desnecessário). Nunca inventa: só escreve a partir de evidência no repo. | Read, Grep, Glob, Write, Edit |
| `schema-db` | Dono de `supabase/migrations/`. Toda mudança de dado passa por ele. Gera `types/database.ts`. | Read, Write, Edit, Bash, Grep |
| `feature-web` | Implementa feature ponta a ponta: migration → route handler com zod → server component → teste. | tudo exceto Agent |
| `qa-testes` | Escreve testes, fixtures e a suíte E2E; mantém a meta de cobertura. | Read, Write, Edit, Bash |
| `seguranca` | Revisa autorização, escreve testes de RLS, produz `docs/pfc/evidencias/seguranca/`. | leitura + Write de relatórios |

**Skills** (`/nome` no terminal):

| Skill | O que faz |
|---|---|
| `atividade` | `/atividade RF03-editar-viagem` → cria `docs/plans/RF03-editar-viagem.md` a partir do template, cria a branch `feat/RF03-editar-viagem`, cria o card no Notion e imprime o DoD. |
| `pfc-secao` | `/pfc-secao 24` → carrega as regras da seção em `docs/pfc/_regras.md`, coleta evidência no código/testes e invoca `doc-pfc` para escrever `docs/pfc/06-qualidade/24-qualidade-testes.md`. Atualiza a Parte 00 automaticamente. |
| `pfc-entrega` | Valida o checklist de entrega (seções obrigatórias preenchidas, nenhum texto orientador remanescente, links de artefatos vivos), monta o documento único e roda `npm run pfc:build`. |
| `rastreabilidade` | Regenera `docs/pfc/rastreabilidade.md` a partir de tags `@RF03` no código e nos testes. **Falha se um RF marcado "Implementado" não tiver teste** — é o que amarra as seções 14, 22 e 24. |
| `evidencias` | Roda a suíte, coleta cobertura + relatório e screenshots do Playwright em `docs/pfc/evidencias/<data>/` com índice. |
| `notion` | Wrapper de `scripts/notion/*.mjs` para sync manual quando o CI não rodou. |
| `revisao-pr` | Orquestra antes do PR: `/code-review` + `/security-review` + `rastreabilidade`. |

**Convenções** vão em [CLAUDE.md](CLAUDE.md), *abaixo* da linha `@AGENTS.md`.
[AGENTS.md](AGENTS.md) é reescrito pelo `next dev` entre os marcadores `BEGIN/END:nextjs-agent-rules` —
não editar dentro do bloco.

### 1.2 Plano por atividade

`docs/plans/<ID>-<slug>.md`. O frontmatter é lido pelo CI e espelhado no Notion; o corpo é o contrato
entre quem faz e quem revisa.

```yaml
---
id: RF03-editar-viagem
titulo: Editar viagem existente
trilha: T1
responsavel: audrey          # quem produz
revisor: fernando            # sempre fernando (ver §1.5)
semana: S05
requisitos: [RF03.4, RNF02.3]
secoes_doc: [22.1, 14]
branch: feat/RF03-editar-viagem
tipo: [route-handler, tela]  # define quais testes são obrigatórios (§1.5)
status: em-desenvolvimento
---
```

O corpo tem **seis blocos fixos**, e os três últimos são o que você pediu:

1. **Contexto** — por que a atividade existe, e o requisito que ela atende
2. **Arquivos afetados** — caminhos concretos, incluindo migrations
3. **Passos** — a sequência de implementação
4. **O que testar** *(preenchido por quem faz, antes de abrir o PR)* — os testes automatizados exigidos
   pelo `tipo` da atividade (tabela em §1.5) **+ o roteiro de teste manual**: passo a passo reproduzível,
   com o resultado esperado de cada passo
5. **O que validar** *(checklist que o revisor confirma)* — critérios objetivos e binários, escritos antes
   da implementação começar. Nada de "funciona bem"; é "usuário não-membro recebe 403 ao chamar
   PATCH /api/trips/:id"
6. **Evidência** — o que anexar no PR: saída dos testes, delta de cobertura, screenshot do Playwright,
   print do fluxo manual. É daqui que saem as seções 22, 24 e 25 do documento

A skill `/atividade` gera esse arquivo já com os blocos 4 e 5 pré-preenchidos a partir do `tipo`, para
ninguém começar a codar sem saber o que vai precisar provar no fim.

### 1.3 CI/CD (`.github/workflows/`)

| Workflow | Gatilho | Jobs |
|---|---|---|
| `ci.yml` | PR + push `main` | `verify` (npm ci → lint → typecheck → vitest + cobertura) · `e2e` (build + start + Playwright) · `build` |
| `db.yml` | mudanças em `supabase/**` | Aplica todas as migrations num Postgres efêmero e roda os testes de RLS |
| `notion.yml` | PR aberto/fechado | `node scripts/notion/sync.mjs` atualiza status do card |
| `evidencias.yml` | push `main` + manual | Publica cobertura e relatório Playwright como artifacts datados (evidência da seção 24) |

Proteção de `main`: `verify` + `e2e` verdes, 1 aprovação, sem push direto.
Branches: `feat/`, `fix/`, `chore/`, `docs/` + ID do requisito.
Commits: Conventional Commits com o ID no escopo — `feat(RF03): permite editar viagem`. É isso que
alimenta a matriz de rastreabilidade e a seção 23.

### 1.4 Notion (visibilidade)

**Repo = fonte da verdade dos planos. Notion = espelho de status**, escrito pelo CI.

Databases (criadas uma vez por `scripts/notion/seed.mjs`):

**Atividades** — o quadro principal. Campos:

| Campo | Tipo | Origem |
|---|---|---|
| ID, Título, Trilha, Semana | texto / select | frontmatter do plano |
| **Responsável** | select: Fernando · Abner · Micael · Audrey | frontmatter |
| **Revisor** | select (sempre Fernando, salvo os PRs dele) | frontmatter |
| **Status** | Backlog → Em desenvolvimento → Em revisão → Ajustes solicitados → Validação → Concluído | git + CI |
| **O que testar** | texto longo | bloco 4 do plano |
| **O que validar** | checkboxes | bloco 5 do plano — o revisor marca no Notion |
| **Evidência** | arquivos / links | anexado no PR pelo autor |
| Requisitos, Seções do doc | relação | frontmatter |
| Branch, PR, Plano | URL | CI |

Views obrigatórias: **por pessoa** (o que cada um tem em mãos), **por semana** (o cronograma),
**fila de revisão do Fernando** (tudo em "Em revisão", ordenado por idade) e **bloqueados**.

- **Requisitos** — RF/RNF/RNE, Descrição, Status, Prioridade, Atividades (espelha as seções 13/14/15)
- **Cronograma** — Semana, Datas, Objetivo, Entregáveis, Responsáveis, Riscos
- **Decisões** — ADR leve; alimenta as seções 19.1, 21 e 27

O `sync.mjs` move o card sozinho: branch criada → *Em desenvolvimento*; PR aberto → *Em revisão*;
review com "changes requested" → *Ajustes solicitados*; review aprovada → *Validação*; merge → *Concluído*.
Ninguém arrasta card à mão — o quadro reflete o git, e é isso que dá visibilidade real.

`scripts/notion/`: `seed.mjs`, `sync.mjs` (upsert a partir de `docs/plans/*.md` + estado do PR),
`pull.mjs` (traz o board para `docs/plans/_board.json`, para os agentes lerem contexto).
Secrets: `NOTION_TOKEN`, `NOTION_PARENT_PAGE_ID`, `NOTION_DB_*`.

### 1.5 Processo de desenvolvimento e responsabilidades

**Papéis.** Somos 4: **Fernando** (você), **Abner**, **Micael** e **Audrey**. Você é o mais sênior:
**produz código e revisa todos os PRs**. Os outros três são donos de trilha e revisam entre si só os
seus PRs (detalhe abaixo).

**Cada um é dono de um domínio, ponta a ponta** — migration, route handler, tela e teste. Não é "o
Micael faz o backend e o Abner o frontend"; é "o financeiro inteiro é do Micael". Isso é o que permite as
quatro pessoas produzirem **toda semana, em paralelo, sem esperar ninguém**: os domínios quase não
compartilham arquivo.

| Pessoa | Domínio que possui | Tabelas / rotas que são suas | Seções do documento |
|---|---|---|---|
| **Fernando** | **Plataforma** — schema, RLS, autorização, CI, segurança, e revisão de todos os PRs | `supabase/migrations/` (schema base), `lib/supabase/*`, `lib/authz/*`, `lib/env.ts`, `middleware.ts`, `.github/` | 1, 2, 3, 4, 19, 20, 21, 22.3, 23, **25**, + Parte 00 e Parte 02 toda semana |
| **Audrey** | **Viagem & Itinerário** + infraestrutura de qualidade | `trips`, `itinerary_items`, `bookings`, `places`; `/api/trips/**`; `/dashboard/trips/**`; `vitest.config`, `playwright/` | 17, 22.1, **24** |
| **Micael** | **Financeiro** — despesa, rateio, saldo, acerto | `expenses`, `expense_shares`, `settlements`; `/api/trips/[id]/expenses`, `/api/acertos`; `lib/finance/`; `/dashboard/finances` | 13, 14, 15, 18, 22.2 |
| **Abner** | **Social & Descoberta** + IA de roteiros | `profiles`, `follows`, `trip_posts`, `post_likes`, `post_comments`, `place_reviews`; `/u/**`, `/feed`, `/api/social/**`, `/api/roteiros/**`; `lib/ai/` | 8, 9, 10, 11, 12, 16, **26** |

**Revisão.** Todo PR é revisado por você. Para você não virar gargalo, duas regras: **PR de no máximo
~400 linhas** (atividade grande vira duas) e **revisão em até 24h** — passou disso, o autor cobra no
Notion. Os seus próprios PRs recebem uma revisão leve de qualquer um dos três, focada em "eu entendi o
que isso faz e sei manter?" — serve de transferência de conhecimento e garante que nenhum commit entra
em `main` sem um segundo par de olhos, o que é exatamente o que a seção 23 pede.

**Fluxo de uma atividade, ponta a ponta:**

```
/atividade <ID>      → plano criado, branch criada, card no Notion (Em desenvolvimento)
   ↓ implementa
autor testa          → escreve os testes do bloco 4, roda `npm run verify`, executa o roteiro manual
   ↓
abre PR              → cola os critérios do bloco 5 na descrição + anexa evidência   (Em revisão)
   ↓
CI                   → verify + e2e; se vermelho, nem entra na fila de revisão
   ↓
Fernando revisa      → /revisao-pr (code-review + security-review + rastreabilidade)
   ↓                    changes requested → volta para o autor  (Ajustes solicitados)
aprovado             → autor confirma os critérios de validação um a um  (Validação)
   ↓
merge                → /pfc-secao das seções tocadas + /rastreabilidade   (Concluído)
```

**Definition of Ready** — só entra em desenvolvimento se: requisito (RF/RNF) identificado, blocos 4 e 5
do plano preenchidos, e dependência de migration resolvida.

**Definition of Done** — o card só vai para Concluído com os 9 itens: migration aplicável do zero ·
testes do tipo escritos · `npm run verify` verde · roteiro manual executado com evidência anexada ·
PR com critérios de validação · CI verde · revisão aprovada · rastreabilidade atualizada · seção do
documento atualizada.

**O que cada tipo de atividade obriga a testar** — é isto que a skill `/atividade` injeta no bloco 4:

| `tipo` | Testes automatizados obrigatórios | Validação manual |
|---|---|---|
| `migration` / `rls` | Aplicação limpa do zero + teste de RLS com dois usuários provando isolamento | Rodar `supabase db reset` e conferir que a app sobe |
| `route-handler` | Integração cobrindo **4 caminhos**: 200 feliz · 401 sem sessão · 403 não-membro/não-dono · 400 payload inválido | Chamar a rota com sessão de outro usuário e confirmar o 403 |
| `regra-de-negocio` (`lib/`) | Unit com casos de borda; cobertura ≥70% no arquivo | — |
| `tela` / `componente` | E2E do fluxo com screenshot arquivado | Percorrer o fluxo em mobile e desktop |
| `correcao-de-bug` | Teste de regressão que **falha antes e passa depois** do fix | Reproduzir o bug original e confirmar que sumiu |
| `seguranca` | Teste que prova a exploração bloqueada (ex.: forjar `inviterId` retorna 401) | Revisão do `seguranca` agent |

**Ritual semanal.** Segunda: 20 min de replanejamento da semana no board do Notion (view por semana).
Sexta: cada um roda `/pfc-secao` das seções que tocou e você fecha a Parte 00 com o resumo da semana —
é isso que faz o histórico de versão do documento ser real em vez de reconstruído no fim.

### 1.6 Como quatro pessoas produzem em paralelo sem colidir

**Existe exatamente um ponto de sincronismo: a S01.** Depois dela, ninguém espera ninguém.

**S01 — você entrega a base; os outros três entregam o contrato.**

- **Você (Fernando)** monta a estrutura sobre a qual eles vão codar: schema real extraído para
  `supabase/migrations/` + RLS explícita + `types/database.ts` gerado · `lib/env.ts` com zod ·
  **uma rota de referência completa** (route handler + zod + checagem de participação + teste dos 4
  caminhos), que vira o molde copiado por todo mundo · Vitest e Playwright configurados com um teste
  verde de cada · CI + branch protection · `.claude/` com agentes e skills · e a faxina que trava o
  resto (apagar páginas mock, montar o `<Toaster/>`, desligar `ignoreBuildErrors`, consertar o Dockerfile).
  **É a semana mais pesada do semestre e é caminho crítico** — se escorregar, todo mundo trava.
- **Os outros três não ficam esperando**, porque o trabalho da S01 deles não precisa de código: montar o
  **catálogo de requisitos** do próprio domínio (RF / RNF / RNE), que é justamente o que falta hoje.
  Partem das 53 RFs e 31 RNFs que já existem em `docs/ARCHITECTURE.md` §6–§7 — **corrigindo o Status,
  que está todo errado** — e acrescentam os requisitos novos (rateio, social, IA).

  Esse catálogo é o contrato que torna o assíncrono possível: com RF/RNF numerados e atribuídos a um
  dono, cada um sabe o que é seu sem precisar perguntar. Ele vira as seções 13, 14 e 15, a base da matriz
  de rastreabilidade **e o backlog inteiro do semestre no Notion**. Entregável da S01: cada um abre as
  atividades do seu domínio no board, já com os blocos "o que testar" e "o que validar" preenchidos.

**Regras anti-colisão** (sem elas, quatro PRs simultâneos viram conflito toda semana):

| Risco | Regra |
|---|---|
| Migrations com número conflitante | Nome por **timestamp**, não sequência: `20260902143000_financeiro_expense_shares.sql`. O domínio vai no nome. |
| `types/database.ts` (gerado) | Regenerado por um job do CI no merge de qualquer migration. Ninguém edita à mão, ninguém commita. |
| Arquivos compartilhados (`app/dashboard/layout.tsx`, `lib/env.ts`, `package.json`) | PR dedicado, pequeno, mergeado no mesmo dia. Nunca junto de feature. |
| Dois domínios precisando da mesma tabela | O dono da tabela expõe um helper em `lib/`; o outro consome. Ninguém faz query na tabela alheia. |
| Fila de revisão travando | PR ≤ ~400 linhas, revisão em 24h. Se você estiver sobrecarregado, o autor segue numa branch empilhada em vez de parar. |

**Cadência mínima.** Cada pessoa merge **pelo menos um PR por semana** no seu domínio, das S02 à S12.
Semana sem merge é sinal de alarme na retrospectiva de segunda — não é para acumular e entregar tudo no fim.

---

## 2. Escopo do software

As trilhas abaixo são **uma taxonomia do trabalho, não uma sequência de etapas**. Só a T0 é ordenada
(S01, você). Da S02 em diante T1, T2, T3 e T4 correm **simultaneamente**, cada uma dentro do domínio do
seu dono — veja o cronograma paralelo em §4. A T5 (qualidade) não é fase: é obrigação de toda atividade,
via a tabela de testes por tipo em §1.5.

| Trilha | Dono | Corre em |
|---|---|---|
| T0 Fundação | Fernando | S01 (bloqueante) |
| T1 Consolidação e segurança | Fernando (authz) + Audrey (bugs e CRUDs) | S02–S06, paralelo |
| T2 Divisão de custos | Micael | S02–S10, paralelo |
| T3 Rede social | Abner | S03–S09, paralelo |
| T4 IA de roteiros | Abner | S10–S11, paralelo |
| T5 Qualidade e segurança | todos, em toda atividade | contínuo |

### T0 — Fundação (bloqueante)

1. **Trazer o banco para o repo.** Remover `/scripts` do [.gitignore:5](.gitignore#L5). Criar
   `supabase/migrations/0001_schema.sql` **a partir do banco real** (`supabase db pull` ou dump do
   dashboard) — *não* a partir de `docs/ARCHITECTURE.md`, que já diverge. Depois `0002_rls.sql` com as
   policies explícitas e `0003_indexes.sql`. Gerar `types/database.ts` com `supabase gen types typescript`
   e trocar os tipos globais de [types/global.d.ts](types/global.d.ts) por ele.
   *Precisa de você: acesso ao projeto Supabase.*
2. `.env.example` com todas as variáveis — **conteúdo pronto logo abaixo**. Hoje
   [app/api/invitations/route.ts:78](app/api/invitations/route.ts#L78) lê `NEXT_PUBLIC_APP_URL`, que não
   está declarada em lugar nenhum → resolve `undefined/dashboard`. Unificar `NEXT_PUBLIC_APP_URL` /
   `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL` numa só + validação com zod em `lib/env.ts`.
3. ESLint (`eslint`, `eslint-config-next`, `@typescript-eslint`) — o script `lint` do
   [package.json:6](package.json#L6) hoje falha por falta do pacote.
4. Remover `typescript.ignoreBuildErrors` de [next.config.mjs:3-5](next.config.mjs#L3-L5) e corrigir o
   fallout: `params` como `Promise` nas 6 rotas que ainda usam objeto plano
   (`app/api/trips/[tripId]/{bookings,expenses,itinerary,places,members}/route.ts` e
   [app/api/invitations/[invitationId]/decline/route.ts:4](app/api/invitations/[invitationId]/decline/route.ts#L4)),
   e o `google: any` de [types/global.d.ts:5](types/global.d.ts#L5) (o `@types/google.maps` já está instalado).
5. Vitest + Testing Library + Playwright configurados, primeiro teste verde, script `verify`.
6. **Limpeza:** apagar [app/login/page.tsx](app/login/page.tsx) e [app/register/page.tsx](app/register/page.tsx)
   (auth mock com `localStorage.setItem("auth_token", "mock_token_")`) e as entradas correspondentes do
   allowlist em [lib/supabase/middleware.ts:36-37](lib/supabase/middleware.ts#L36-L37) e `:49-50`; apagar
   `components/place-search.tsx` (morto); montar `<Toaster />` em [app/layout.tsx](app/layout.tsx) —
   hoje **todo `toast()` do app é no-op silencioso**; remover os ~30 `console.log` `[v0]`.
7. **Dockerfile quebrado:** copia `bun.lockb` (não existe) e espera `.next/standalone` sem
   `output: "standalone"` no config; `NEXT_PUBLIC_*` não são passados como build args, então o bundle do
   browser seria construído com credenciais `undefined`.

#### `.env.example` (arquivo pronto para commitar)

Três regras que o arquivo precisa deixar óbvias: **`NEXT_PUBLIC_` vai para o bundle do browser** — nunca
coloque segredo aí; **`SUPABASE_SERVICE_ROLE_KEY` ignora toda a RLS** — só em route handler, nunca em
componente; e as três variáveis de URL de hoje viram **uma só**.

```bash
# =============================================================================
# ViajaMais — copie para .env.local e preencha. NUNCA commite o .env.local.
# Tudo que começa com NEXT_PUBLIC_ é embutido no JavaScript do navegador
# e fica visível para qualquer usuário. Segredo nenhum entra com esse prefixo.
# =============================================================================

# --- Supabase (obrigatório) --------------------------------------------------
# Dashboard > Project Settings > API
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Chave de servidor: IGNORA TODA A RLS. Sem prefixo NEXT_PUBLIC_ de propósito.
# Só pode ser lida em route handler / server component (lib/supabase/admin.ts).
# Necessária para o convite por e-mail (auth.admin.inviteUserByEmail).
SUPABASE_SERVICE_ROLE_KEY=

# String de conexão direta — usada pelas migrations e pelos testes de RLS.
# Dashboard > Project Settings > Database > Connection string (URI).
DATABASE_URL=postgresql://postgres:[SENHA]@db.xxxx.supabase.co:5432/postgres

# --- URL da aplicação (obrigatório) ------------------------------------------
# Substitui NEXT_PUBLIC_SITE_URL e NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL, que
# hoje coexistem sem motivo. Sem barra no final.
# Local: http://localhost:3000   Produção: https://seu-dominio
NEXT_PUBLIC_APP_URL=http://localhost:3000

# --- Google Maps (obrigatório para busca de lugares) -------------------------
# Exposta no navegador por design (a API JS exige). A proteção é restringir a
# chave por HTTP referrer + por API + cota no Google Cloud Console.
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=

# --- IA de roteiros ----------------------------------------------------------
# fake   = gerador determinístico, sem rede. Padrão em dev e no CI.
# gemini = free tier do Google.        anthropic = Claude, se conseguirem chave.
AI_PROVIDER=fake
GEMINI_API_KEY=
ANTHROPIC_API_KEY=

# --- Notion (só no CI; não precisa em dev) -----------------------------------
# Integração interna em notion.so/my-integrations, compartilhada com a página-mãe.
NOTION_TOKEN=
NOTION_PARENT_PAGE_ID=
NOTION_DB_ATIVIDADES=
NOTION_DB_REQUISITOS=
NOTION_DB_CRONOGRAMA=
NOTION_DB_DECISOES=

# --- Testes E2E (dois usuários, para provar isolamento por RLS) --------------
E2E_USER_A_EMAIL=teste.a@viajamais.local
E2E_USER_A_PASSWORD=
E2E_USER_B_EMAIL=teste.b@viajamais.local
E2E_USER_B_PASSWORD=
```

Para rodar só o app local bastam as quatro primeiras (`NEXT_PUBLIC_SUPABASE_URL`, `ANON_KEY`,
`NEXT_PUBLIC_APP_URL`, `GOOGLE_MAPS_API_KEY`) — `AI_PROVIDER=fake` já vem pronto. O resto entra conforme
as trilhas avançam. As mesmas chaves viram **secrets no GitHub** para o CI (menos as `NEXT_PUBLIC_`, que
o `ci.yml` passa como build args). Um `lib/env.ts` com zod valida tudo no boot e falha com mensagem clara
em vez de deixar `undefined/dashboard` chegar em produção, como acontece hoje em
[app/api/invitations/route.ts:78](app/api/invitations/route.ts#L78).

### T1 — Consolidação e segurança

**Bugs P0**
- [app/dashboard/page.tsx:217](app/dashboard/page.tsx#L217) — texto solto `Past Trips` renderizando na página.
- [app/dashboard/itinerary/page.tsx:27](app/dashboard/itinerary/page.tsx#L27) — `.eq("trips.user_id", ...)`
  sobre embed não-`!inner`: o PostgREST não filtra, a query devolve linhas erradas.
- [app/api/trips/route.ts:77-86](app/api/trips/route.ts#L77-L86) — o insert do dono em `trip_members` está
  comentado, e o GET exige `trip_members!inner` → **viagem criada pode nunca aparecer na lista**.
- [components/trip-invitations.tsx:54](components/trip-invitations.tsx#L54) — aceitar convite chama
  `router.refresh()` mas nunca `refreshTrips()`; a viagem só aparece após reload duro.
- [app/auth/reset-password/page.tsx:22](app/auth/reset-password/page.tsx#L22) — `hasToken` fixo em `true`
  e o `useEffect` de `:27-30` nunca lê a URL.
- [context/auth-context.tsx:49](context/auth-context.tsx#L49) — `addTrip` tipado como `void` mas é `async`;
  [app/dashboard/trips/new/page.tsx:60-64](app/dashboard/trips/new/page.tsx#L60-L64) navega sem esperar nem checar erro.

**Autorização (crítico — é o conteúdo da seção 25)**
- [app/api/invitations/route.ts:53-63](app/api/invitations/route.ts#L53-L63) — POST **sem nenhum
  `auth.getUser()`**, confia no `inviterId` do body. Qualquer um forja convites. Além disso `:66` cria um
  cliente anon com o nome `supabaseAdmin` e chama `auth.admin.inviteUserByEmail` em `:71`, que sempre falha;
  a falha é engolida em `:83` → **nenhum e-mail de convite jamais é enviado**.
- [app/api/trips/[tripId]/route.ts:52](app/api/trips/[tripId]/route.ts#L52) e `:78` — PATCH e DELETE sem
  checagem de dono, e `.update(body)` cru (mass-assignment: dá para reatribuir `user_id`).
- [app/api/trips/[tripId]/members/route.ts:96](app/api/trips/[tripId]/members/route.ts#L96) — DELETE
  aberto a qualquer autenticado; `:50-54` é uma query sem sentido cujo resultado é descartado.
- Inserts em expenses/bookings/itinerary/places espalham `{...body}` sem validação nem checagem de
  participação na viagem.
- Writes direto do browser em [components/trip-members.tsx:81](components/trip-members.tsx#L81),
  `trips/[id]/places/page.tsx:88` e nas páginas `*/new` — dependem só de RLS.

**Padrão único de acesso a dados:** todo write passa por route handler com `zod` (a dependência já está
instalada e não é importada em lugar nenhum) + checagem de participação. Isso elimina os writes
client-side e dá o material das seções 22.2 e 22.3.

**Escopo de grupo:** `finances`, `places`, `bookings` e `itinerary` filtram por `.eq("user_id", ...)` —
dados de viagens compartilhadas ficam invisíveis, contradizendo a premissa do produto. Trocar por escopo
de participação via `trip_members`.

**CRUDs faltando** (todos prometidos na doc): editar viagem (`/dashboard/trips/[id]/edit`, reaproveitando o
PATCH que já existe), editar/excluir/concluir item de itinerário, editar/excluir despesa, aba de reservas
com link para [app/dashboard/trips/[id]/bookings/new/page.tsx](app/dashboard/trips/[id]/bookings/new/page.tsx)
(257 linhas prontas, **zero pontos de entrada**), toggle `visited` em lugares, sair da viagem.

**Convites reais:** `lib/supabase/admin.ts` server-only com service role, ou Resend com link assinado.

### T2 — Divisão de custos

- Migrations: `expense_shares` (expense_id, user_id, valor, quitado), `settlements` (trip_id, de, para, valor, status);
  `expenses` ganha `paid_by`.
- **`lib/finance/balances.ts`** — funções puras `calcularSaldos()` e `minimizarTransferencias()`, sem I/O.
  É a peça mais testável do projeto e o melhor exemplo para a seção 24.
- UI "Acerto de contas": saldo por membro + transferências sugeridas. Substituir as barras CSS de
  [app/dashboard/finances/page.tsx:225-273](app/dashboard/finances/page.tsx#L225-L273) por `recharts`
  (dependência instalada, nunca importada).

### T3 — Rede social

- Migrations: `profiles` ganha `username` (unique), `bio`, `is_public`; novas `follows`, `trip_posts`,
  `post_likes`, `post_comments`, `place_reviews` (a `Avaliacao` que o PI V já previa).
- **RLS de visibilidade é o ponto técnico central**: perfil público vs. privado, e publicar uma viagem
  sem vazar despesas nem dados dos outros membros. Isso vira o estudo de caso da seção 25.
- Rotas: `/u/[username]`, `/feed` (paginação por cursor sobre `follows` + `trip_posts`),
  `/dashboard/trips/[id]/publicar`; seguir/curtir/comentar/avaliar via route handlers.

### T4 — IA de roteiros

- `lib/ai/provider.ts` — interface `GeradorDeRoteiro` com duas implementações: `fake` (determinística,
  usada em dev e no CI, custo zero e sem flakiness) e a real. Default sugerido: Gemini free tier via
  `@google/genai`. Trocar para Claude (`@anthropic-ai/sdk`, `claude-opus-5`, `output_config.format` para
  saída estruturada) é substituir um arquivo, caso consigam chave.
- `app/api/roteiros/gerar/route.ts` — server-only, **chave nunca em `NEXT_PUBLIC_`**; `zod` valida a
  entrada (destino, datas, interesses, orçamento) **e a saída do modelo** antes de persistir; rate limit
  por usuário.
- Tela `/dashboard/trips/[id]/roteiro-ia`: preview dos itens gerados, usuário aceita/edita antes de gravar
  em `itinerary_items`. Nunca escrever direto no banco a partir da saída do modelo.

### T5 — Qualidade e segurança (contínuo)

- **Unit (Vitest):** regras puras — saldos, rateio, schemas zod, formatação de data/moeda.
- **Integração:** route handlers contra Postgres efêmero com as migrations aplicadas; cobrir authz
  (não-membro recebe 403).
- **Testes de RLS:** script com dois usuários provando que A não lê nem escreve dados de B. É exatamente o
  que a seção 25 pede como evidência.
- **E2E (Playwright):** cadastro → criar viagem → convidar → aceitar → itinerário → despesa → acerto →
  publicar post. Screenshots por passo servem de evidência *e* de figura para o manual.
- Headers de segurança em `next.config.mjs` (CSP, HSTS, X-Frame-Options), rate limit em convites e IA.
- Meta declarada como RNF mensurável: **≥70% em `lib/`, ≥50% global**.

---

## 3. Documento de especificação

```
docs/pfc/
  _regras.md          # regras do template por seção (extensão, formato de tabela, o que é obrigatório no 7º)
  _template/          # tabelas modelo: problema, artefatos, RNE, RF, RNF
  00-historico-versao.md
  01-identificacao/   1-produto.md  2-descricao.md  3-equipe.md  4-repositorios.md
  02-planejamento/    5-situacao.md  6-objetivos.md  7-cronograma.md
  03-publico/         8..15
  04-design/          16..19
  05-arquitetura/     20..23
  06-qualidade/       24..27
  rastreabilidade.md
  evidencias/
  build/
```

**Material já existente para reaproveitar:**

| Seção | Fonte |
|---|---|
| 1, 2, 16.2 | `docs/ViajaMais Projeto Integrativo (1).pdf` (problema, público, identidade visual, link do Figma) |
| 3 | Capa do PI V — **faltam matrículas e orientadores** |
| 8, 9, 10 | `docs/BUSINESS_MODEL.md` §§1–4, 7 |
| 13, 14, 15 | `docs/ARCHITECTURE.md` §6 (53 RFs) e §7 (31 RNFs) — reaproveitar as tabelas, **corrigindo o Status para o real** |
| 16.1 | `docs/USER_MANUAL.md` (fluxos capítulo a capítulo) |
| 18 | `supabase/migrations/` (depois de T0) + `docs/ARCHITECTURE.md` §3 |
| 20, 21, 22 | `docs/ARCHITECTURE.md` §§1, 2, 5 — **removendo SWR, Storage, Realtime, Jest e Bun, que não existem** |
| 23 | Estrutura de pastas + convenção de branch/commit + CI |
| 24, 25 | `docs/pfc/evidencias/` (novo) |
| 26 | IA de roteiros + rede social (antecipação do 8º período) |
| 27 | "Não aplicável neste período" |

**Regras do template que viram validação automática em `npm run pfc:check`:**
- Nenhum texto orientador remanescente (o template manda removê-los na versão final).
- Toda regra/requisito em tabela própria com ID, Descrição, Status, Prioridade + bloco "Detalhamento".
- Parte 00 e Parte 02 (seções 5, 6, 7) atualizadas na entrega.
- Todo link de artefato da seção 4 acessível publicamente.
- Todo diagrama explicado no texto (o template é explícito: "não basta inserir a imagem").

**Export manual:** `npm run pfc:build` (pandoc + `reference.docx` com a formatação do template) →
`docs/pfc/build/Documento-Especificacao-ViajaMais-vX.Y.docx` → você revisa e exporta o PDF para o AVA.

---

## 4. Cronograma (14 semanas · 26/08 → 01/12)

**As quatro colunas correm em paralelo, toda semana.** Não existe "a semana da divisão de custos" nem
"a semana do social" — existe o incremento semanal de cada domínio. A única dependência do semestre é a
S01: sua base sólida destrava as outras três colunas, e enquanto você a constrói eles produzem o
catálogo de requisitos, que não depende de código nenhum.

A coluna do Fernando mostra só o que ele **produz** — a revisão de todos os PRs é em todas as semanas.

| Sem | Fernando · Plataforma | Audrey · Viagem & Itinerário | Micael · Financeiro | Abner · Social & IA | Marco da semana |
|---|---|---|---|---|---|
| **S01**<br>26/08 | **BASE SÓLIDA**: migrations + RLS + tipos, rota de referência, Vitest/Playwright, CI, `.claude/`, faxina | Catálogo RF/RNF de viagem, itinerário, reservas, lugares | Catálogo RF/RNF financeiro + modelo ER do rateio | Catálogo RF/RNF social e IA + fluxo de navegação (16.1) | **Base mergeada + backlog inteiro no Notion** |
| **S02**<br>02/09 | Authz nas rotas existentes (dono/membro) + fim do mass-assignment | Bugs P0: texto solto, query do itinerário, owner em `trip_members`, `refreshTrips` | Writes de despesa → route handler + zod | `scripts/notion/` + seed + `notion.yml` | Quadro do Notion vivo, movido pelo CI |
| **S03**<br>09/09 | Convite autenticado + service role + e-mail real | Editar viagem + writes de itinerário → API | Editar/excluir despesa | Migration social (`username`, `is_public`, `follows`) + RLS de visibilidade | Convite chega no e-mail de verdade |
| **S04**<br>16/09 | Testes de RLS com 2 usuários + `db.yml` | Editar/excluir/concluir itinerário | Migration `expense_shares` + `paid_by` | Perfil público `/u/[username]` + editar perfil | **RLS provada por teste** |
| **S05**<br>23/09 | `lib/authz/trip.ts` (escopo de grupo) + doc 20, 21 | Reservas: aba, entradas, editar/excluir | `lib/finance/balances.ts` + unit tests | Seguir / deixar de seguir + contadores | **Zero write client-side no app** |
| **S06**<br>30/09 | Rate limiting + headers de segurança | Lugares (`visited`) + escopo de grupo nas telas | UI de rateio na despesa | `trip_posts` + publicar viagem sem vazar despesa | Fluxo de grupo ponta a ponta |
| **S07**<br>07/10 | Doc 19, 23 + `error.tsx` / `not-found.tsx` / `loading.tsx` | Fixtures + E2E cadastro→viagem→convite→aceite | Tela de acerto de contas (saldos) | Feed com paginação por cursor | 1º E2E verde no CI |
| **S08**<br>14/10 | Revisão da RLS do social + doc 22.3 | E2E do fluxo financeiro | Minimizar transferências + marcar quitado | Curtir + comentar | Acerto de contas funcional |
| **S09**<br>21/10 | Performance + observabilidade | E2E do fluxo social | Recharts + relatório por categoria | `place_reviews` + avaliações de lugares | Rede social ponta a ponta |
| **S10**<br>28/10 | `/security-review` completo + correções | Cobertura global + acessibilidade | Multi-moeda / conversão | `lib/ai/provider.ts` + `/api/roteiros/gerar` com validação de saída | **Cobertura ≥70% em `lib/`** |
| **S11**<br>04/11 | Correções de segurança + evidências | E2E completo do fluxo inteiro, com screenshots | Polimento financeiro + doc 18 | Tela `/roteiro-ia`: preview, aceitar/editar antes de gravar | IA ponta a ponta com provider fake no CI |
| **S12**<br>11/11 | **Doc 25** + evidências de segurança | **Doc 24** + relatório de testes | Doc 22.2, 13, 14, 15 | Doc 16, 26 + vídeo de demonstração | **Evidências datadas geradas** |
| **S13**<br>18/11 | Monta o documento, Parte 00/02, revisão cruzada | Doc 17, 22.1 | Catálogo de requisitos × implementado | Doc 8–12 | **Congelamento em 20/11** |
| **S14**<br>25/11 | Build DOCX/PDF, deploy estável, ensaio | Só bug fix + ensaio | Só bug fix + ensaio | Só bug fix + ensaio | **Entrega 01/12** |

---

## 5. Verificação

```bash
npm run verify        # lint + typecheck + vitest + build   (é o gate do CI)
npm run test:rls      # dois usuários, prova de isolamento por RLS
npm run e2e           # Playwright, com screenshots em docs/pfc/evidencias/
npm run pfc:check     # seções obrigatórias preenchidas, zero texto orientador, links vivos
npm run pfc:build     # gera o DOCX para export manual do PDF
```

Ponta a ponta, o teste que prova a entrega: subir o projeto do zero num Supabase limpo aplicando só
`supabase/migrations/`, criar dois usuários, e percorrer o fluxo completo (viagem → convite → aceite →
itinerário → despesa compartilhada → acerto de contas → publicar no feed → gerar roteiro com IA) com o
Playwright, verde, com screenshots arquivados. Hoje isso é impossível porque o schema não está no repo —
por isso T0 é a primeira coisa.

---

## 6. Linha de corte

Se o cronograma escorregar, cortar **nesta ordem**:

1. Avaliações de lugares (T3)
2. Comentários no feed (T3)
3. Tela de IA — mantém só a API + provider fake, e a seção 26 descreve como prova de conceito (T4)
4. Minimização de transferências no acerto (fica só o saldo por membro) (T2)
5. Feed e seguir — reduz a rede social a perfil público + publicar viagem (T3)

**Nunca cortar:** migrations e RLS versionadas, testes, CI, correções de autorização, e o documento.
São exatamente esses os itens que a Fase 02 do 7º período avalia.

---

## 7. O que preciso de você antes do S01

1. **Data real da entrega** — 01/12 ou 12/12? (planejei para 01/12)
2. **Confirmação da divisão de domínios** (§1.5 e §4) — montei por senioridade e área, mas *quem tem
   mais tempo livre pesa mais do que quem sabe mais*. Se alguém está com semestre pesado, me diga e eu
   reequilibro: o domínio mais fácil de mover é o Social, o mais difícil é a Plataforma (é o seu).
   O domínio do Abner é o mais carregado da grade (social **e** IA) — se ele não tiver folga, a IA
   passa para você ou para o Micael a partir da S10.
3. **Acesso ao projeto Supabase** para extrair o schema real (dump ou credenciais de CLI)
4. **Matrículas dos 4 integrantes e nome dos orientadores** (seção 3, obrigatória)
5. **Notion**: workspace + integração criada (para o `NOTION_TOKEN`) e a página-mãe onde criar as databases
6. **Link do protótipo no Figma** (o PDF tem o link corrompido) e a URL do deploy, se já houver — seção 4
