---
id: S02-F-authz-rotas
titulo: Autorização em todas as rotas e fim do mass-assignment
trilha: T1
responsavel: fernando
revisor: audrey
semana: S02
requisitos: [RNF02]
secoes_doc: [22.2, 25]
branch: feat/S02-F-authz-rotas
tipo: [route-handler, seguranca]
status: em-desenvolvimento
---
# Autorização em todas as rotas e fim do mass-assignment

> **Fernando** · semana **S02** (02 a 08/09) · marco da semana: _Quadro do Notion vivo, movido pelo CI_

## 1. Contexto

So a rota de referência tem autorização. As demais verificam sessão mas não se aquele usuário pode tocar aquele recurso.

## 2. Arquivos afetados

A atividade passa dos ~400 linhas que o plano norte fixa como teto de PR, então
sai em **três PRs**, cada um coerente por conta própria:

**PR 1 — convites (RF04.1)**
- `lib/schemas/convite.ts` — novo; `inviterId` fica de fora de propósito
- `app/api/invitations/route.ts` — sessão, `exigirDono`, zod, `inviter_id` da sessão
- `components/trip-members.tsx` — para de enviar `inviterId`
- `tests/api/invitations-post.test.ts` — novo

**PR 2 — membros (RF04.4, RF04.7, RF04.8)**
- `app/api/trips/[tripId]/members/route.ts` — GET/POST/DELETE sem authz hoje
- `components/trip-members.tsx` — hoje apaga de `trip_members` **direto do
  navegador**, violando a regra 1 do `CLAUDE.md`; passa a chamar a rota
- `tests/api/members-route.test.ts` — novo

**PR 3 — recursos da viagem**
- `app/api/trips/[tripId]/{bookings,itinerary,places}/route.ts` — `exigirMembro`
  + zod campo a campo, fim do `...body`
- `lib/schemas/{reserva,itinerario,lugar}.ts` — novos, com as colunas e os
  `CHECK` reais da migration base
- testes correspondentes

**Fora de escopo, de propósito:** `app/api/trips/[tripId]/expenses/route.ts`
(o Abner já reescreveu seguindo o molde) e o envio de e-mail do convite (é a
atividade `S03-F-convite-email`).

## 3. Passos

1. A autorização da aplicação **espelha a policy**, não inventa outra regra. A
   RLS puxada em `S03-F-schema-base` diz qual é a regra de cada rota:

   | Rota | Policy | Checagem no servidor | Requisito |
   |---|---|---|---|
   | `POST /api/invitations` | `trip_invitations_insert`: `is_trip_owner` | `exigirDono` | RF04.1 |
   | `members` GET | `trip_members_select`: `can_access_trip` | `exigirMembro` | RF04.4 |
   | `members` DELETE | `trip_members_delete`: `is_trip_owner OR user_id = auth.uid()` | dono **ou** a própria pessoa saindo | RF04.7, RF04.8 |
   | `bookings`, `places` | `*_insert`: `can_access_trip AND user_id = uid` | `exigirMembro` | — |
   | `itinerary_items` | `can_access_trip` | `exigirMembro` | RF04.5 |

2. Molde a seguir: `app/api/trips/[tripId]/route.ts`, e
   `app/api/trips/[tripId]/expenses/route.ts` como segunda referência viva.
3. Cada rota ganha teste dos 4 caminhos antes do PR.

## 4. O que testar

Obrigatórios pelo tipo (`route-handler, segurança`):

- [ ] Integração cobrindo os 4 caminhos: 200 feliz, 401 sem sessão, 403 não-membro, 400 payload invalido
- [ ] Teste que prova a **exploração bloqueada**, não o caminho feliz

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. _A preencher._

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [ ] Nenhum `.update(body)` ou `.insert({...body})` restante no repositório
- [ ] POST /api/invitations exige sessão e ignora o inviterId vindo do corpo
- [ ] `await params` (nesta versão do Next, params e Promise)
- [ ] Corpo validado por zod, com campos extraidos um a um — nunca `...body`
- [ ] Autorização checada no servidor via `exigirMembro` / `exigirDono`
- [ ] A correção tem teste
- [ ] Risco residual registrado em `docs/pfc/evidências/segurança/`

## 6. Evidência

- [ ] Saida dos testes
- [ ] Screenshot ou gravação do fluxo (se houver tela)
- [ ] Delta de cobertura (se mexeu em `lib/`)
