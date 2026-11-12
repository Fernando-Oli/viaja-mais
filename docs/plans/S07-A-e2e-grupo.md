---
id: S07-A-e2e-grupo
titulo: Fixtures e E2E do fluxo de grupo
trilha: T1
responsavel: audrey
revisor: fernando
semana: S07
requisitos: [RF03]
secoes_doc: [24]
branch: feat/S07-A-e2e-grupo
tipo: [tela]
depende_de: [S06-A-lugares]
status: em-revisao
---
# Fixtures e E2E do fluxo de grupo

> **Audrey** · semana **S07** (07 a 13/10) · marco da semana: _Primeiro E2E verde no CI_

## 1. Contexto

Cadastro, criar viagem, convidar, aceitar. Os screenshots viram evidência da seção 24 e figura do manual do usuário.

Até aqui nenhum E2E percorre o fluxo de grupo pela tela: os specs existentes criam a viagem
por `page.request.post("/api/trips")` e o do rateio põe os membros na viagem pelo cliente
Supabase (`tests/rls/convite.ts`). Ao ler as telas do fluxo, quatro defeitos impedem o
roteiro ou ferem os critérios do bloco 5:

- **Criar viagem não trata erro.** `addTrip` (contexto) engole a falha com `console.error` e a
  tela vai para o dashboard como se tivesse gravado. Sem `await`, o botão nem fica em "Criando...".
- **Destino travado sem Google Maps.** O campo de `PlaceAutocomplete` fica `disabled` até o
  script do Maps carregar; se ele não carrega (rede, chave inválida), não há como criar viagem.
  O `<Label htmlFor="destination">` também não aponta para nenhum `id`.
- **Convite sem feedback.** `TripMembers` não avisa nada ao enviar — nem sucesso, nem erro (o
  `setError` nunca é alcançado). Remover membro usa `confirm()` e `alert()`.
- **Aceite sem feedback e com data errada.** `TripInvitations` não mostra erro nem trava os
  botões durante a requisição, e formata `start_date` com `new Date("2026-12-01")`, que é
  meia-noite UTC — em Brasília aparece 30/11.

A branch parte de `feat/S06-A-lugares` já sincronizada com a `main` (merge de 21/10): a S06
ainda está em revisão e as duas mexem no histórico de versões e na matriz de rastreabilidade.

## 2. Arquivos afetados

- `e2e/fixtures/contas.ts` (criar) — fixtures do Playwright: `SENHA`, `DONA` (seed A),
  `entrar()`, `cadastrar()` e o `test` estendido com `novaConta` (conta nova pelo cadastro,
  com e-mail único) e `contexto` (página isolada para um segundo usuário)
- `e2e/grupo-convite.spec.ts` (criar) — o fluxo cadastro → criar viagem → convidar → aceitar,
  todo pela tela, com dois navegadores (dona e convidado)
- `context/auth-context.tsx` (editar) — `addTrip` devolve a viagem criada e lança erro com a
  mensagem do servidor
- `app/dashboard/trips/new/page.tsx` (editar) — `await addTrip`, toast de sucesso/erro e ida
  direto para o detalhe da viagem (onde está o convite)
- `components/place-autocomplete.tsx` (editar) — campo editável mesmo sem o Maps; props `id` e
  `required`
- `components/trip-members.tsx` (editar) — toast por desfecho do convite (`enviado`,
  `ja-cadastrado`, `falhou`), toast de erro; remoção pelo `ConfirmModal`
- `components/trip-invitations.tsx` (editar) — toast no aceite/recusa e no erro, botões
  travados durante a requisição, data local
- `tests/components/trip-invitations.test.tsx` (editar) — erro do aceite vira toast; data local
- `tests/components/trip-members.test.tsx` (criar) — toast por desfecho do convite e erro 403
- `docs/pfc/03-publico/14-requisitos-funcionais.md` (editar) — RF03.1 passa a Existente
- `docs/pfc/00-historico-versao.md` (editar) — versão 2.10
- `lib/social/perfis.ts` (criar) e `tests/lib/perfis.test.ts` — nomes dos membros (ver Observações)
- `app/dashboard/trips/[id]/page.tsx` (editar) — membros lidos sem o embed de `profiles`
- `vitest.config.mts` (editar) — `testTimeout` de 15s
- Nenhuma migration nem rota nova: o fluxo usa `POST /api/trips`, `POST /api/invitations` e
  `POST /api/invitations/[id]/accept`, que já existem e já têm teste de integração.

## 3. Passos

1. Fixtures em `e2e/fixtures/contas.ts`.
2. Corrigir as quatro telas do fluxo (bloco 1).
3. Testes de componente de `TripMembers` e `TripInvitations`.
4. `e2e/grupo-convite.spec.ts`, rodando em `chromium` e `mobile`.
5. `npm run verify`, E2E, evidências em `docs/pfc/evidencias/`.
6. Catálogo (RF03.1) e histórico de versões.

## 4. O que testar

Obrigatórios pelo tipo (`tela`):

- [x] E2E do fluxo com screenshot arquivado em `docs/pfc/evidencias/` (um por projeto: `chromium` e `mobile`)
  — `e2e/grupo-convite.spec.ts`: cadastro do convidado, viagem criada pela tela pela dona,
  convite pelo cartão de membros, aceite no dashboard do convidado, e a dona vendo os dois
  membros

Além do obrigatório: testes de componente (`tests/components/`) para os toasts do convite e do
aceite, porque o E2E só passa pelo caminho feliz.

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

Pré-requisito: `npm run db:reset` (há migrations novas na `main`) e `npm run dev` em
http://localhost:3000. Use duas janelas: uma normal e uma anônima.

1. Janela anônima: abrir `/auth/sign-up`, cadastrar "Carla Convidada" com um e-mail novo
   (ex.: `carla@viajamais.local`) e senha `viajamais123`.
   → Vai direto para o dashboard (sem confirmação de e-mail no ambiente local).
2. Janela normal: entrar como `teste.a@viajamais.local` / `viajamais123`, clicar em
   **Nova Viagem**, preencher título "Chapada com a turma" e destino "Chapada dos Veadeiros"
   (digitando, sem escolher sugestão) e clicar em **Criar Viagem**.
   → O botão mostra "Criando..."; toast "Viagem criada" e a tela abre o detalhe da viagem.
3. No cartão **Membros da Viagem**, digitar o e-mail da Carla e clicar em **Enviar Convite**.
   → Toast "Convite enviado"; o campo de e-mail esvazia.
4. No DevTools, aba Network, marcar **Offline**, digitar outro e-mail e clicar em **Enviar Convite**.
   → Toast de erro "Não foi possível enviar o convite"; o e-mail continua no campo. Desmarcar Offline.
5. Janela anônima: recarregar o dashboard.
   → Cartão **Convites Pendentes** com "Chapada com a turma" e as datas certas (sem um dia a menos).
6. Clicar em **Aceitar**.
   → Os botões travam durante a requisição; toast "Convite aceito"; o cartão some e a viagem
   aparece em "Minhas Viagens".
7. Abrir a viagem.
   → Membros da Viagem lista Ana (Dono) e Carla (Membro).
8. Janela normal: recarregar o detalhe da viagem e clicar no **X** ao lado da Carla.
   → Abre o modal "Remover membro?" (não o `confirm` do navegador); **Cancelar** fecha sem
   remover; **Remover** mostra toast "Membro removido" e a Carla some da lista.
9. Repetir os passos 2, 3 e 6 no DevTools em modo celular (ex.: Pixel 7).
   → Formulário, cartão de membros e cartão de convite cabem na tela sem rolagem lateral.

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [x] O fluxo inteiro passa pela tela — o E2E não usa `page.request` nem cliente Supabase:
  cadastro, criar viagem, convite e aceite são cliques e campos
- [x] Funciona em mobile e desktop — E2E passa nos projetos `chromium` e `mobile` (Pixel 7)
- [x] Feedback por `toast()`; sem `alert()` nem `confirm()` — em `trip-members.tsx`,
  `trip-invitations.tsx` e na criação de viagem; remoção de membro pelo `ConfirmModal`
- [x] Estado de erro e de carregamento tratados — "Criando..." e "Enviando..." nos botões,
  Aceitar/Recusar travados durante a requisição, toast de erro com a mensagem do servidor em
  criar viagem, convidar, aceitar, recusar e remover
- [x] Criar viagem funciona sem o Google Maps — o destino aceita texto digitado
- [x] Fixtures reaproveitáveis — `e2e/fixtures/contas.ts` serve aos próximos E2E de grupo
  (S08-Ab, S09-M, S11-A) sem copiar login e cadastro de novo

## 6. Evidência

- [x] Saida dos testes — arquivada em `docs/pfc/evidencias/`:
  - `S07-A-e2e-grupo-e2e.txt` — E2E do fluxo de grupo (chromium e mobile)
  - `S07-A-e2e-grupo-testes.txt` — testes de componente do convite e do aceite
- [x] Screenshot ou gravação do fluxo (se houver tela):
  - `S07-A-e2e-grupo-convite-<projeto>.png` — convite pendente no dashboard do convidado
  - `S07-A-e2e-grupo-membros-<projeto>.png` — viagem com dona e convidada após o aceite
- [x] Delta de cobertura (se mexeu em `lib/`) — não se aplica: nada em `lib/` mudou

## 7. Observações

- **Para o Fernando — convite sem dados da viagem.** `GET /api/invitations` lê a viagem sob a
  RLS de `trips`, que só libera dono e membro; para o convidado ela volta `trip: null` e o
  cartão quebrava o dashboard. A tela agora mostra "Viagem em grupo" e aceita normalmente.
  Mostrar título e datas antes do aceite depende de policy ou RPC nova (domínio da plataforma).
- **Para o Micael — `lib/social/perfis.ts`.** Helper novo que lê `id, full_name` de `profiles`.
  O embed `trip_members(..., profiles(...))` falha com PGRST200 (não há FK direta), e a lista de
  membros da viagem chegava vazia.
- `vitest.config.mts`: `testTimeout` de 15s — o teste de 130 caracteres do cadastro estourava
  os 5s padrão com a suíte inteira rodando.
