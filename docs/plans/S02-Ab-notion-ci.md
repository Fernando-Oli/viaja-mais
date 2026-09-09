---
id: S02-Ab-notion-ci
titulo: Espelho do quadro no Notion pelo CI
trilha: T0
responsavel: abner
revisor: fernando
semana: S02
requisitos: []
secoes_doc: []
branch: chore/S02-Ab-notion-ci
tipo: [infra]
status: concluido
---
# Espelho do quadro no Notion pelo CI

> **Abner** · semana **S02** (02 a 08/09) · marco da semana: _Quadro do Notion vivo, movido pelo CI_

## 1. Contexto

Scripts de seed, sync e pull, mais o workflow que move os cards conforme o estado do PR.

## 2. Arquivos afetados

Atividade de infraestrutura **entregue embutida na S01** (Fernando). Este plano é o
registro retroativo: nenhum código novo, apenas verificação e documentação.

Artefatos já existentes na `main` (autoria do Fernando):

- `scripts/notion/api.mjs` — cliente `fetch` da API do Notion + parser de frontmatter dos planos.
- `scripts/notion/seed.mjs` — cria as 4 databases (Atividades, Requisitos, Cronograma, Decisões). Roda uma vez.
- `scripts/notion/sync.mjs` — upsert de cada plano no quadro; status derivado do estado do PR/git.
- `scripts/notion/pull.mjs` — baixa o quadro para `docs/plans/_board.json` (contexto para agentes).
- `.github/workflows/notion.yml` — dispara `sync.mjs` no abrir/fechar de PR e em review; job `continue-on-error: true`.
- `package.json` — scripts `notion:seed`, `notion:sync`.
- `.claude/skills/notion/SKILL.md` — sincronização manual quando o CI não roda.
- `docs/plans/00-plano-norte.md` §1.4 — design do espelho.

Commits de origem: `a0fb027`, `7f9111d`, `d60e11f`, `6dcedc1` (todos S01, Fernando).

**Nenhum arquivo de código é criado ou modificado nesta atividade.** Só este `.md`.
`.github/` e `scripts/notion/` são domínio do Fernando.

## 3. Passos

Implementação original (S01, Fernando): `scripts/notion/{api,seed,sync,pull}.mjs` +
`.github/workflows/notion.yml` + scripts `notion:*` no `package.json`.

Fechamento documental (esta atividade, Abner):

1. Auditar os artefatos da `main` contra os critérios dos blocos 4 e 5.
2. Preencher este plano como registro retroativo e marcar os critérios que têm evidência de
   código/histórico.
3. Registrar como pendentes os itens que dependem de configuração operacional (secrets,
   `seed.mjs`, execução real do `notion.yml`), até haver evidência verificável.
4. Alinhar com o Fernando os pontos operacionais que não dependem deste plano:
   - configurar os secrets `NOTION_TOKEN`, `NOTION_PARENT_PAGE_ID` e `NOTION_DB_*` no repositório do GitHub;
   - executar `node scripts/notion/seed.mjs` uma vez para criar as 4 databases e registrar os IDs gerados
     em `.env.local` e nos secrets;
   - decidir se o critério "funciona seguindo só o README" exige um parágrafo sobre o Notion no
     `README.md` (arquivo e infraestrutura sob responsabilidade do Fernando).
5. Refletir "concluído — herdado da S01" na matriz de rastreabilidade e nas seções do documento
   na semana de documentação.

## 4. O que testar

Obrigatórios pelo tipo (`infra`):

- [x] Sem `NOTION_TOKEN` os scripts saem com sucesso — comprovado de duas formas:
      (a) **leitura do código** — `scripts/notion/api.mjs:21-27` (`exigirToken()` → `console.log` +
      `process.exit(0)`), invocado no topo de `seed.mjs`, `sync.mjs` e `pull.mjs`;
      (b) **execução runtime** nesta sessão, sem `NOTION_TOKEN` no ambiente — `sync.mjs --all` e
      `pull.mjs` saíram ambos com código 0, imprimindo o aviso de skip e sem escrever nada.
      Detalhe no bloco 6 e no roteiro manual (passos 1 e 2).
- [x] `npm run verify` verde — lint 0 erros · typecheck 0 erros · testes 39/39 · build concluído
      com `NEXT_PUBLIC_*` em placeholder (como no job de build da CI). Evidência: execução
      **anterior** nesta linha de trabalho, com a infra do Notion idêntica à da `main`. Esses
      comandos **não** exercitam os scripts do Notion além do `eslint .` — não constituem teste
      ponta a ponta do Notion.

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. **[EXECUTADO nesta sessão, sem `NOTION_TOKEN`]** `node scripts/notion/sync.mjs --all`.
   → Resultado real: exit code 0; imprimiu "Notion: NOTION_TOKEN não definido — pulando a
   sincronização." + "O plano em docs/plans/ continua sendo a fonte da verdade."; nenhum arquivo
   criado ou modificado.
2. **[EXECUTADO nesta sessão, sem `NOTION_TOKEN`]** `node scripts/notion/pull.mjs`.
   → Resultado real: exit code 0; imprimiu "Notion: NOTION_TOKEN não definido — pulando a leitura
   do quadro." + "O plano em docs/plans/ continua sendo a fonte da verdade."; nenhum arquivo criado
   ou modificado. `docs/plans/_board.json` não existia antes e não foi criado.
3. **[NÃO executado — roteiro]** Abrir um PR e conferir Actions → workflow **Notion** → job
   "Espelhar estado no quadro".
   → Esperado: job verde. Sem os secrets, o passo de sync loga o aviso e o job segue verde (`continue-on-error`).
4. **[NÃO executado — roteiro]** Com os secrets configurados, PR cuja branch bate com o `branch:`
   de um plano.
   → Esperado: o card correspondente vai para "Em revisão"; ao mergear, para "Concluído".

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [x] Status do card vem do git, não é digitado — `scripts/notion/sync.mjs:36-53`
      `estadoDerivado()` deriva de `PR_MERGED` / `REVIEW_ESTADO` / `PR_ESTADO` (env do CI) e,
      na ausência, do `status:` do frontmatter. Não há campo de status manual. Evidência: código.
- [x] Falha de sincronização não trava trabalho — `.github/workflows/notion.yml:15`
      (`continue-on-error: true`); `scripts/notion/api.mjs:21-27` sai 0 sem token;
      `scripts/notion/sync.mjs:113-118` `try/catch` por plano; `sync.mjs:18-21` sai 0 sem
      `NOTION_DB_ATIVIDADES`. Evidência: código.
- [ ] Funciona em máquina limpa, seguindo só o README — **PARCIAL.** Clone + `npm ci` +
      `npm run setup` + `npm run dev` funciona; o Notion é CI-only e no-op sem secrets. O
      `README.md` não menciona o Notion (a configuração está só no plano-norte §1.4 e na skill
      `.claude/skills/notion/SKILL.md`). Incluir ou não um parágrafo no README é decisão do
      Fernando; não bloqueia o fechamento documental desta atividade.

## 6. Evidência

**Comprovada por código / histórico** (verificável no repositório, sem executar nada):

- `scripts/notion/api.mjs:21-27` — `exigirToken()` sai com código 0 sem token; chamado no topo de
  `seed.mjs`, `sync.mjs` e `pull.mjs`.
- `scripts/notion/sync.mjs:36-53` — `estadoDerivado()`; `:113-118` — `try/catch` por plano;
  `:18-21` — sai 0 sem `NOTION_DB_ATIVIDADES`.
- `.github/workflows/notion.yml:15` — `continue-on-error: true`.
- Commits de origem: `a0fb027`, `7f9111d`, `d60e11f`, `6dcedc1` (S01, Fernando).

**Comprovada por execução runtime** (nesta sessão, branch `chore/S02-Ab-notion-ci`, ambiente **sem**
`NOTION_TOKEN` — nenhuma variável `NOTION_*` definida):

- `node scripts/notion/sync.mjs --all` → **exit code 0**; mensagem "Notion: NOTION_TOKEN não
  definido — pulando a sincronização." + "O plano em docs/plans/ continua sendo a fonte da verdade.";
  nenhum arquivo criado ou modificado.
- `node scripts/notion/pull.mjs` → **exit code 0**; mensagem "Notion: NOTION_TOKEN não definido —
  pulando a leitura do quadro." + "O plano em docs/plans/ continua sendo a fonte da verdade.";
  nenhum arquivo criado ou modificado.
- `docs/plans/_board.json` **não existia antes** dos testes e **não foi criado** depois.
- `git status --short` após os dois comandos: inalterado (apenas a deleção pré-existente de
  `.claude/settings.json`, este `.md` em modificação e `.claude/settings.json.backup` não rastreado).

**Testes de gate já executados anteriormente** (nesta linha de trabalho, com a infra do Notion
inalterada desde a S01 — **não** são teste ponta a ponta do Notion):

- `npm run lint` → 0 erros (77 warnings herdados, nenhum em `scripts/notion/`).
- `npm run typecheck` → 0 erros.
- `npm run test` → 39/39.
- `npm run build` → concluído com `NEXT_PUBLIC_*` em placeholder (como no job de build da CI).

**Não comprovado / pendente** (depende de acesso operacional, fora do repositório):

- Secrets `NOTION_TOKEN` / `NOTION_PARENT_PAGE_ID` / `NOTION_DB_*` configurados no GitHub.
- `scripts/notion/seed.mjs` executado uma vez no ambiente real (não há `docs/plans/_board.json`
  nem IDs de database commitados).
- Execução real do workflow `notion.yml` num PR (o histórico está no GitHub Actions).
- Sincronização real com o Notion (criação/atualização de card de atividade).

**Não aplicável:**

- Screenshot / gravação de fluxo — atividade de infraestrutura, sem tela.
- Delta de cobertura — não altera `lib/`.
