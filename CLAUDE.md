@AGENTS.md

# ViajaMais — convenções do projeto

Projeto Integrador (PFC) do 7º período, Engenharia de Software / UniEVANGÉLICA.
Entrega única em **01/12/2026**. O plano norte está em `docs/plans/00-plano-norte.md`.

Equipe e domínios — cada pessoa é dona de uma fatia **vertical** (migration → route handler → tela → teste):

| Pessoa | Domínio | É dono de |
|---|---|---|
| Fernando | Plataforma | `supabase/migrations/`, `lib/supabase/`, `lib/authz/`, `lib/env.ts`, `proxy.ts`, `.github/` |
| Audrey | Viagem & Itinerário + qualidade | `trips`, `itinerary_items`, `bookings`, `places`, `place_reviews`; `app/api/trips/**`; `app/dashboard/trips/**`; `vitest.config.mts`, `e2e/` |
| Micael | Social & Descoberta **e IA de roteiros** | `profiles`, `follows`, `trip_posts`, `post_likes`, `post_comments`; `app/u/**`, `app/feed`, `app/api/social/**`, `app/api/roteiros/**`; `lib/ai/` |
| Abner | Financeiro | `expenses`, `expense_shares`, `settlements`; `app/api/**/expenses`, `app/api/acertos`; `lib/finance/`; `app/dashboard/finances` |

**Não consulte tabela de outro domínio direto.** O dono expõe um helper em `lib/`; os outros consomem.

**Migration e política de RLS são sempre do Fernando**, em qualquer domínio. O dono
da funcionalidade escreve a rota, a tela e o teste; o schema e a policy vêm dele.
O motivo é o modo de falha: policy errada não quebra nada — ela vaza dado ou
devolve vazio, sem stack trace e sem tela de erro. E é o material avaliado na
seção 25.

Grupos de requisito por dono, para o catálogo das seções 14 e 15:

| Dono | Grupos |
|---|---|
| Fernando | RF01 autenticação · RF04 viagens em grupo · RNF01 performance · RNF02 segurança · RNF04 confiabilidade · RNF06 escalabilidade |
| Audrey | RF03 viagens · RF05 itinerário · RF07 reservas · RF08 lugares · RNF03 usabilidade · RNF05 manutenibilidade |
| Micael | RF02 gestão de perfil |
| Abner | RF06 controle financeiro |

Os 84 requisitos herdados do `docs/ARCHITECTURE.md` descrevem o sistema **como ele
existe hoje** — por isso concentram-se em autenticação, viagens e itinerário. Os
requisitos de rateio, rede social e IA ainda não existem: escrevê-los é a
atividade de S01 do Micael e do Abner.

## Regras não negociáveis

1. **Nenhuma escrita no banco a partir do browser.** Todo write passa por route handler em `app/api/**`,
   com validação `zod` e checagem de autorização. O molde é `app/api/trips/[tripId]/route.ts`.
2. **Autorização é explícita no servidor, não só RLS.** Toda rota que toca uma viagem chama
   `exigirMembro()` / `exigirDono()` de `lib/authz/trip.ts`. RLS é a segunda linha de defesa,
   nunca a única.
3. **Nunca espalhe o body do request.** `.update(body)` e `.insert({...body})` são mass-assignment.
   Passe o resultado tipado do `schema.parse(body)`, campo a campo.
4. **`SUPABASE_SERVICE_ROLE_KEY` ignora toda a RLS.** Só em `lib/supabase/admin.ts`, só em route handler.
   Nunca em componente, nunca com prefixo `NEXT_PUBLIC_`.
5. **Variáveis de ambiente só via `lib/env.ts`**, nunca `process.env.X` direto — o boot valida com zod
   e falha com mensagem clara em vez de deixar `undefined` vazar para produção.
6. **Migrations com nome por timestamp**, não sequência, com o domínio no nome:
   `20260902143000_financeiro_expense_shares.sql`. Quatro pessoas criam migrations em paralelo;
   numeração sequencial colide toda semana.
7. **`types/database.ts` é gerado**, não editado à mão. Rode `npm run db:types` depois de qualquer
   migration e commite o resultado junto.
8. **Toda atividade tem plano** em `docs/plans/<ID>-<slug>.md`, com os blocos "O que testar" e
   "O que validar" preenchidos **antes** de começar a implementar. Use `/atividade`.

## Ambiente local

Cada pessoa roda o próprio Supabase em Docker — ninguém compartilha credencial de
banco. `npm run setup` sobe o stack, aplica as migrations, roda o seed e escreve o
`.env.local` sozinho.

| Comando | O que faz |
|---|---|
| `npm run setup` | Sobe tudo e gera o `.env.local`. Idempotente. |
| `npm run db:reset` | Recria o banco: migrations + seed. Rode ao puxar migration nova. |
| `npm run db:diff -- nome` | Gera migration a partir do que você mudou no Studio |
| `npm run db:types` | Regenera `types/database.ts` |

Studio em http://localhost:54323 · e-mails de teste em http://localhost:54324
(confirmação, reset de senha e convite caem ali, sem sair da máquina).

Usuários do seed: `teste.a@viajamais.local` e `teste.b@viajamais.local`,
senha `viajamais123`. São dois porque metade do valor da suíte está em provar que
B **não** vê o que é de A.

## Skills obrigatórias

- Antes de escrever **qualquer SQL** (tabela, coluna, índice, policy, migration):
  carregue `supabase-postgres-best-practices`.
- Para CLI, Auth, `@supabase/ssr` ou erro inesperado do Supabase: `supabase`.

Elas são as skills oficiais da Supabase, instaladas no repositório. São a
autoridade sobre Postgres; `.claude/agents/schema-db.md` cobre só o que é
específico deste projeto.

## Testes obrigatórios por tipo de mudança

| Mudou | Teste obrigatório |
|---|---|
| migration / RLS | aplicação limpa do zero + teste de RLS com dois usuários provando isolamento |
| route handler | integração cobrindo 4 caminhos: **200** feliz · **401** sem sessão · **403** não-membro · **400** payload inválido |
| regra de negócio em `lib/` | unit com casos de borda; cobertura ≥70% no arquivo |
| tela / componente | E2E do fluxo com screenshot arquivado — **escrito por quem construiu a funcionalidade**, não pela pessoa de qualidade: quem implementou sabe onde ela quebra |
| correção de bug | teste de regressão que **falha antes** e passa depois |

## Fluxo

`/atividade <ID>` → implementa → `npm run verify` → PR (cola os critérios de validação) → CI verde →
revisão do Fernando → merge → `/pfc-secao` das seções tocadas.

**ID de atividade**: `S<semana>-<inicial>-<slug>` — `S03-A-editar-viagem`.
Iniciais: **F**ernando, **A**udrey, **M**icael, **Ab**ner (Abner leva duas letras porque
Audrey já ocupa o A).

Branches: `feat/`, `fix/`, `chore/` ou `docs/` + o ID → `feat/S03-A-editar-viagem`.
Commits: Conventional Commits com o requisito no escopo quando houver um →
`feat(RF03): permite editar viagem`. É esse ID que alimenta a matriz de
rastreabilidade e a seção 23 do documento.

## Rastreabilidade

Todo requisito implementado carrega uma tag `@RF03.4` em comentário, no código **e** no teste.
`npm run pfc:rastreabilidade` regenera a matriz e **falha se um RF marcado "Implementado" não tem teste**.

## Não editar

- `AGENTS.md` entre `BEGIN/END:nextjs-agent-rules` — o `next dev` reescreve o bloco.
- `types/database.ts` — gerado.
- `components/ui/*` — shadcn/ui de prateleira. Exceção: `confirm-modal.tsx`, que é nosso.
