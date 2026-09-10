---
id: S02-A-bugs-p0
titulo: Correção dos bugs P0 herdados
trilha: T1
responsavel: audrey
revisor: fernando
semana: S02
requisitos: []
secoes_doc: [22.1]
branch: fix/S02-A-bugs-p0
tipo: [correcao-de-bug]
status: em-revisao
---
# Correção dos bugs P0 herdados

> **Audrey** · semana **S02** (02 a 08/09) · marco da semana: _Quadro do Notion vivo, movido pelo CI_

## 1. Contexto

Cinco defeitos que quebram fluxo visível: texto solto no dashboard, filtro do itinerário sem !inner, dono não inserido em trip_members, convite aceito que só aparece após recarregar, e reset de senha com hasToken fixo em true.

## 2. Arquivos afetados

Nenhuma migration — os bugs são de código de aplicação. As tabelas
(`trips`, `trip_members`, `itinerary_items`) já existem.

| Arquivo | Bug |
|---|---|
| `app/dashboard/page.tsx` | Texto solto `Past Trips` renderizando na página (linha 217). Removido; de brinde, `useEffect` e `useRouter` importados e nunca usados saíram junto. |
| `app/dashboard/itinerary/page.tsx` | `.select("*, trips(title, destination)")` + `.eq("trips.user_id", ...)` sem `!inner`: o PostgREST trata o embed como LEFT JOIN e não filtra. Trocado por `trips!inner`. |
| `app/api/trips/route.ts` | O `insert` do criador em `trip_members` estava comentado; o `GET` usa `trip_members!inner`, então a viagem criada nunca voltava para a lista. Insert reativado (`role: "owner"`). |
| `components/trip-invitations.tsx` | Aceitar/recusar convite chamava só `router.refresh()`, que não recarrega o contexto onde vivem viagens e convites. Passou a chamar `refreshTrips()` / `refreshInvitations()`, e só depois de confirmar `response.ok`. |
| `app/auth/reset-password/page.tsx` | `hasToken` fixo em `true` e o `useEffect` nunca lia a URL — toda visita caía no formulário de "nova senha". Agora começa em `false`, o efeito assina `onAuthStateChange` (`PASSWORD_RECOVERY`) e inspeciona `?code=` / `type=recovery`. |

Testes de regressão:

- `tests/api/trips-post.test.ts` — prova o insert em `trip_members` + caminho 401.
- `tests/app/itinerary-scope.test.ts` — prova o `trips!inner` na consulta.
- `tests/components/trip-invitations.test.tsx` — prova o `refreshTrips` / `refreshInvitations` ao aceitar.
- `tests/auth/reset-password.test.tsx` — prova que, sem token na URL, a tela pede o e-mail.

## 3. Passos

1. Reproduzir cada bug (ver roteiro no bloco 4).
2. Escrever o teste de regressão que **falha** com o código atual.
3. Aplicar a correção mínima de cada bug.
4. Confirmar que os quatro testes passam e que a suíte inteira segue verde.
5. `npm run verify` (lint + typecheck + test + build).

## 4. O que testar

Obrigatórios pelo tipo (`correção-de-bug`):

- [x] Teste de regressao que **falha antes** e passa depois do fix
  — 4 arquivos novos em `tests/`; verificado com `git stash` do código-fonte:
  4 falham antes, todos passam depois (o caso 401 de `trips-post` já passava, de propósito).

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Pré-requisito: `npm run setup` rodado, dois usuários do seed.

1. **Texto solto.** Entrar como `teste.a@viajamais.local` e abrir `/dashboard`.
   → **Antes:** a string `Past Trips` aparece solta acima de "Viagens Anteriores".
   → **Depois:** não aparece.

2. **Viagem criada some.** Em `/dashboard/trips/new`, criar uma viagem e salvar.
   → **Antes:** volta ao dashboard e a viagem **não** está na lista; continua fora após F5.
   → **Depois:** a viagem aparece na lista imediatamente, sem recarregar.

3. **Itinerário vaza.** Com o usuário A, criar viagem + item de itinerário com data futura.
   Fazer o mesmo com o usuário B. Voltar como A e abrir `/dashboard/itinerary`.
   → **Antes:** A vê itens de viagens do B.
   → **Depois:** A vê só os itens das próprias viagens.

4. **Convite só aparece após reload.** A convida B para uma viagem (aba Membros).
   B abre `/dashboard`, clica em **Aceitar** no convite.
   → **Antes:** o card do convite some, mas a viagem só surge na lista após F5.
   → **Depois:** a viagem aparece na lista logo após o "Aceitar", sem recarregar.

5. **Reset de senha.** Abrir `/auth/reset-password` **sem** vir de um link de e-mail.
   → **Antes:** mostra "Nova senha" (formulário de definir senha), que não funciona.
   → **Depois:** mostra "Esqueceu sua senha?" e pede o e-mail. Ao seguir o link
   recebido em http://localhost:54324, a tela passa a mostrar "Nova senha".

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [x] Viagem criada aparece na lista sem recarregar
- [x] Convite aceito aparece sem recarregar
- [x] Itinerário mostra só itens de viagens do próprio usuário
- [x] O bug original foi reproduzido antes do fix e não reproduz depois

## 6. Evidência

- [x] Saida dos testes — `npm run test`: 6 arquivos, 20 testes, verde
  (era 15; +5 dos novos testes de regressão). `npm run lint`: 0 erros, 70 avisos
  (baseline era 79). `npm run typecheck`: limpo. `npm run build`: verde com as
  `NEXT_PUBLIC_*` preenchidas (sem `.env.local` o boot falha na validação do
  `lib/env.ts`, comportamento pré-existente e coberto pelo CI).
- [ ] Screenshot ou gravação do fluxo — anexar no PR (passos 2, 4 e 5 do roteiro).
- [ ] Delta de cobertura — não se aplica: nenhuma mudança em `lib/`.
