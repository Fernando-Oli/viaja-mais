---
id: S05-F-catalogo-plataforma
titulo: "Catálogo de requisitos da plataforma: RF01, RF04, RNF01, RNF02, RNF04 e RNF06"
trilha: T5
responsavel: fernando
revisor: audrey
semana: S05
requisitos: [RF01, RF04, RNF01, RNF02, RNF04, RNF06]
secoes_doc: [14, 15]
branch: docs/S05-F-catalogo-plataforma
tipo: [documentacao]
depende_de: []
status: concluido
---
# Catálogo de requisitos da plataforma: RF01, RF04, RNF01, RNF02, RNF04 e RNF06

> **Fernando** · semana **S05** (23 a 29/09) · débito da S01, cobrado agora pela
> matriz de rastreabilidade

## 1. Contexto

`npm run pfc:rastreabilidade` acusa cinco tags órfãs — requisitos marcados no
código que não existem no catálogo:

| Tag | Onde está marcada | Commit |
|---|---|---|
| `@RF04.1` | `app/api/invitations/route.ts:23` · `tests/api/invitations-post.test.ts` | `5d603af` |
| `@RF04.6` | `app/api/trips/[tripId]/expenses/route.ts:23` | `1ead84a` |
| `@RF04.7` `@RF04.8` | `app/api/trips/[tripId]/members/route.ts:24` · `tests/api/members-route.test.ts` | `5015b38` |
| `@RNF02` | `tests/rls/01-isolamento.test.ts:17` | `58b3fcd` |

A causa é conhecida e está escrita no próprio documento, em
`docs/pfc/03-publico/14-requisitos-funcionais.md:223`:

> `[!] PENDENTE: grupos de outros domínios — RF01 (autenticação), RF04 (grupo),
> RF06 (financeiro); RNF01–RNF06 — a cargo de seus respectivos donos.`

Audrey, Micael e Abner escreveram o catálogo do domínio deles na S01. O da
plataforma não foi escrito, porque a S01 do Fernando foi a fundação técnica
(`S01-F-base-solida`, `S01-F-ambiente-local`). O efeito prático é que o trabalho
de segurança já mergeado — autorização nas rotas, isolamento provado por RLS —
não aparece na matriz, e portanto não conta nas seções 14, 22 e 24.

**Escopo desta atividade são os seis grupos da plataforma**, conforme o quadro de
donos do `CLAUDE.md`: RF01 (autenticação), RF04 (viagens em grupo), RNF01
(performance), RNF02 (segurança), RNF04 (confiabilidade) e RNF06
(escalabilidade). **RNF03 (usabilidade) e RNF05 (manutenibilidade) são da
Audrey** e continuam pendentes — a linha de PENDENTE é reduzida, não removida.

## 2. Arquivos afetados

Documentação, mais dois ajustes de ferramenta que o trabalho revelou — nenhuma
migration e nenhuma mudança de comportamento da aplicação.

- `docs/pfc/03-publico/14-requisitos-funcionais.md` — grupos RF01 e RF04
- `docs/pfc/03-publico/15-requisitos-nao-funcionais.md` — grupos RNF01, RNF02, RNF04, RNF06
- `docs/pfc/00-historico-versao.md` — nova linha de versão
- `docs/plans/S05-F-catalogo-plataforma.md` — este plano
- `tests/rls/01-isolamento.test.ts` — só o comentário: a tag `@RNF02` vira
  `@RNF02.4`, porque a matriz cruza requisito, e não grupo
- `scripts/pfc/check.mjs` — a busca por marcador de rascunho usava `/i`, então a
  palavra portuguesa "todo" era lida como o marcador `TODO` e reprovava a seção

## 3. Passos

1. Partir dos requisitos herdados de `docs/ARCHITECTURE.md` §6–§7 (RF01.1–1.6,
   RF04.1–4.8, RNF01.1–1.5, RNF02.1–2.8, RNF04.1–4.4, RNF06.1–6.4) e **corrigir o
   Status contra o código real**, que é o erro que o `_regras.md` manda não
   repetir. Evidência já levantada:
   - RF01.6 (proteger rotas autenticadas): `proxy.ts` + `lib/supabase/proxy.ts`
     com allowlist e 401 em JSON para `/api` — **Existente**.
   - RF04.1 (convidar por e-mail): a rota existe e autoriza
     (`exigirDono`), mas o e-mail **não sai** — `inviteUserByEmail` exige service
     role e o cliente é anon (`app/api/invitations/route.ts:82-88`, com o
     comentário explicando). É **Parcial**, e o que falta é `S03-F-convite-email`.
   - RF04.2 (notificação do convite): depende do item acima — **Não iniciado**.
   - RF04.7 / RF04.8: `app/api/trips/[tripId]/members/route.ts` com teste em
     `tests/api/members-route.test.ts` — **Existente**.
   - RNF02.4 (RLS): policies versionadas em
     `supabase/migrations/20260910012723_plataforma_rls_isolamento.sql` e
     isolamento provado em `tests/rls/01-isolamento.test.ts` — **Atendido**.
   - RNF02.8 (rate limiting): não existe — **Planejado** (`S06-F-rate-limit-csp`).
2. Acrescentar os requisitos que o código já exercita mas o catálogo herdado não
   previa: autorização explícita no servidor além da RLS (`lib/authz/trip.ts`) e
   proibição de mass-assignment — hoje são regra em `CLAUDE.md` sem RNF que as
   sustente, e são justamente o material da seção 25.
3. Dar valor-alvo mensurável a todo RNF. "Deve ser rápido" não é requisito;
   "primeira resposta em menos de 1 segundo no percentil 95" é.
4. Escrever as tabelas nas seções 14 e 15, uma tabela por grupo seguida do bloco
   `Detalhamento:`, no formato que o `_regras.md` exige.
5. Reduzir a linha de PENDENTE nos dois arquivos para o que de fato continua
   faltando (RNF03 e RNF05, da Audrey; RF03/RF05/RF07/RF08 onde couber).
6. Atualizar `docs/pfc/00-historico-versao.md`.
7. Rodar `npm run pfc:rastreabilidade` e confirmar que as cinco órfãs sumiram;
   abrir PR colando os critérios do bloco 5.

## 4. O que testar

Obrigatórios pelo tipo (`documentacao`):

- [x] Cada requisito tem ID, descrição, status e prioridade
- [x] `npm run pfc:check` sem bloqueio novo
- [x] `npm run pfc:rastreabilidade` sem nenhuma tag órfã

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado
esperado de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. Rodar `npm run pfc:rastreabilidade` → esperado: a lista de inconsistências
   não cita mais `RF04.1`, `RF04.6`, `RF04.7`, `RF04.8` nem `RNF02`.
2. Abrir `docs/pfc/rastreabilidade.md` e procurar a linha de `RF04.1` → esperado:
   a coluna de descrição traz o texto do requisito, não `_(fora do catálogo)_`.
3. Abrir `docs/pfc/03-publico/14-requisitos-funcionais.md` → esperado: grupos RF01
   e RF04 presentes, cada requisito com os quatro campos, cada tabela seguida de
   `Detalhamento:`.
4. Abrir `docs/pfc/03-publico/15-requisitos-nao-funcionais.md` → esperado: todo
   RNF de RNF01, RNF02, RNF04 e RNF06 tem número no valor-alvo.
5. Conferir a linha de PENDENTE dos dois arquivos → esperado: cita RNF03 e RNF05
   (Audrey) e não cita mais os grupos desta atividade.

## 5. O que validar

Critérios objetivos e binários. Escritos **antes** da implementação, de
propósito: critério combinado depois que já existe código para defender deixa de
ser critério.

- [x] Nenhum requisito marcado "Existente" ou "Atendido" sem arquivo do
      repositório citado no `Detalhamento:` — o erro que o `_regras.md` aponta na
      documentação antiga
- [x] RF04.1 está **Parcial**, não Existente: a rota autoriza, mas o e-mail não
      sai (`app/api/invitations/route.ts:82-88`)
- [x] RNF02.8 (rate limiting) está **Planejado**, apontando `S06-F-rate-limit-csp`
- [ ] Todo RNF desta atividade tem valor-alvo numérico verificável — **cumprido
      em parte**: RNF01 e RNF04 têm número (segundos, percentil, disponibilidade,
      retenção); RNF02 e RNF06 são de natureza binária (existe ou não existe
      política de acesso, pool de conexões, limitação de requisições) e por isso
      trazem critério de verificação por inspeção, não valor numérico
- [x] As cinco tags órfãs desaparecem de `npm run pfc:rastreabilidade`
- [x] RNF03 e RNF05 continuam explicitamente pendentes e atribuídos à Audrey —
      esta atividade não invade domínio alheio
- [x] Extensão respeita o limite da seção em `docs/pfc/_regras.md`
- [x] Parte 00 atualizada com o que mudou

## 6. Evidência

- [x] Saída de `npm run pfc:rastreabilidade` antes e depois (as cinco órfãs)
- [x] Não aplicável: screenshot e cobertura — documentação pura, sem código
