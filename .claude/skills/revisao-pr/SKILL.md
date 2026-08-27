---
name: revisao-pr
description: Roda a bateria de revisão antes de abrir ou aprovar um PR — code review, revisão de segurança, rastreabilidade e conferência dos critérios de validação do plano. Use antes de pedir revisão e ao revisar PR de outra pessoa.
---

# Revisar um PR

Uso: `/revisao-pr` na branch atual — ou `/revisao-pr 42` para um PR do GitHub.

O Fernando revisa todos os PRs da equipe. Esta skill existe para que ele receba o PR já limpo do que é
mecânico, e possa gastar o tempo dele no que exige julgamento.

## 1. Antes de tudo: o plano

Abra `docs/plans/<ID>-*.md` e leia os blocos **4 (O que testar)** e **5 (O que validar)**.

Esses critérios foram escritos antes da implementação, de propósito — para não serem renegociados agora
que existe código para defender. **Confira um a um** e diga qual passou e qual não. Critério não atendido
não vira "aceitável"; vira ajuste.

Se o PR não tem plano, pare e diga isso: é o processo acordado pela equipe.

## 2. Bateria automática

- `npm run verify` — lint, typecheck, testes, build. Vermelho aqui e o PR nem entra na fila.
- `/code-review` — correção, reuso, simplificação.
- `/security-review` — obrigatório quando o diff toca `app/api/**`, `lib/authz/`, `lib/supabase/`,
  `proxy.ts` ou `supabase/migrations/`.
- `/rastreabilidade` — nenhum requisito "Implementado" sem teste.

## 3. O que só revisão humana pega

Percorra o diff procurando os erros que este repositório já cometeu:

- **Escrita no banco a partir do browser** — `supabase.from(...).insert/update/delete` dentro de
  `"use client"`.
- **Mass-assignment** — `.update(body)` ou `.insert({ ...body })`. Os campos saem um a um do zod.
- **Autorização só na UI** — `if (isOwner)` escondendo botão sem checagem equivalente no servidor.
- **Autenticado ≠ autorizado** — `getUser()` presente mas sem verificar se *este* usuário pode tocar
  *este* recurso.
- **Tabela nova sem RLS** na migration.
- **`params` sem `await`** — neste Next, `params` é `Promise`.
- **`alert()` / `confirm()`** em vez de `toast()` e `ConfirmModal`.
- **`console.log` de dado de usuário** deixado para trás.
- **Segredo com prefixo `NEXT_PUBLIC_`** — vai inteiro para o bundle do navegador.

## 4. Tamanho

Acima de ~400 linhas, peça para dividir em vez de revisar mal. A fila trava quando os PRs incham, e
revisão superficial de PR grande é pior que revisão nenhuma — dá falsa garantia.

## 5. Feedback

Separe **bloqueante** (correção, segurança, critério do plano não atendido) de **sugestão** (estilo,
nome, refatoração oportunista). Diga qual é qual, explicitamente. Em bloqueante, aponte arquivo e linha e
diga o que precisa mudar — não só o que está errado.
