---
id: S10-A-cobertura
titulo: Cobertura global e acessibilidade
trilha: T0
responsavel: audrey
revisor: fernando
semana: S10
requisitos: [RNF03, RNF05]
secoes_doc: [15, 24]
branch: chore/S10-A-cobertura
tipo: [infra]
depende_de: [S09-A-avaliacoes]
status: em-revisao
---
# Cobertura global e acessibilidade

> **Audrey** · semana **S10** (28/10 a 03/11) · marco da semana: _Cobertura de 70% em lib/_

## 1. Contexto

Ligar o corte de cobertura, que ficou desligado em S01 de propósito até haver suíte suficiente
(comentário em `vitest.config.mts`, que previa ativá-lo "em S05").

**Medição antes desta atividade** (`npx vitest run --coverage`, branch com S06, S07 e S09):

| Escopo | Linhas | Ramos |
|---|---|---|
| `lib/` | 91,5% | 91,9% |
| `app/api/` | 86,8% | 77,1% |
| Total | 88,45% | 82,08% |

A meta de 70% em `lib/` já está cumprida. O que falta é o **corte**: hoje a cobertura pode
cair para qualquer valor sem o CI reclamar, porque `test:cov` roda sem limite.

Os pontos fracos que importam ao domínio de Viagem são duas rotas da Audrey:
`app/api/trips/route.ts` (52%, o GET da lista sem teste) e `app/api/trips/[tripId]/route.ts`
(45%, GET e DELETE sem teste). Elas sobem nesta atividade. Os outros arquivos com cobertura
zero são de outros domínios e ficam registrados no PR:
- `app/api/auth/change-password`
- `app/api/invitations/[invitationId]/decline`
- `lib/supabase/{client,server,proxy}.ts`, que são invólucros do SDK

**Acessibilidade.** Não há verificação automática de acessibilidade no projeto. Esta atividade
acrescenta `@axe-core/playwright` e um E2E que passa as telas principais pelo axe com as regras
WCAG 2.1 níveis A e AA.

**Catálogo.** Os grupos RNF03 (usabilidade) e RNF05 (manutenibilidade) estão como `PENDENTE`
na seção 15, a cargo da Audrey. Esta atividade os escreve, já com a evidência produzida aqui.

## 2. Arquivos afetados

- `vitest.config.mts` (editar): `coverage.thresholds`
  - global: 70% em linhas, ramos, funções e instruções
  - `lib/**`: 70% nas quatro métricas
  - remove o comentário que adiava o corte
- `tests/api/trips-get.test.ts` (criar): GET `/api/trips`
- `tests/api/trip-item-route.test.ts` (criar): GET e DELETE `/api/trips/[tripId]`
- `package.json` / `package-lock.json` (editar): `@axe-core/playwright` 4.14.0 em `devDependencies`
- `e2e/acessibilidade.spec.ts` (criar): axe nas telas listadas no bloco 4
- Telas e componentes com violação apontada pelo axe (editar, a definir pela primeira
  execução; `components/ui/*` só se não houver outra saída, e com a justificativa no PR)
- `docs/pfc/03-publico/15-requisitos-nao-funcionais.md` (editar): grupos RNF03 e RNF05
- `docs/pfc/00-historico-versao.md` (editar)

## 3. Passos

1. Ligar o corte e confirmar que `npm run test:cov` passa com a suíte atual.
2. Testes de GET/DELETE das rotas de viagem; medir de novo.
3. Instalar o axe, escrever o E2E, rodar e corrigir as violações.
4. Catálogo RNF03/RNF05, histórico, evidências; `npm run verify`.

## 4. O que testar

Obrigatórios pelo tipo (`infra`):

- [x] `npm run verify` verde
- [x] `npm run test:cov` verde **com** o corte ligado
- [x] Prova de que o corte funciona: com o limite de `lib/**` elevado temporariamente
  acima do valor atual, `npm run test:cov` falha com código de saída diferente de zero
  e mensagem de threshold. A saída vai para a evidência
- [x] Integração das rotas de viagem, nos 4 caminhos:
  - GET da lista: 200 e 401
  - GET de uma viagem: 200, 401, 403 e 404
  - DELETE: 200, 401 e 403 (membro que não é dono)
- [x] E2E `e2e/acessibilidade.spec.ts`, nos projetos `chromium` e `mobile`, sem violação WCAG
  2.1 A/AA nas telas:
  1. login
  2. cadastro
  3. dashboard
  4. detalhe da viagem
  5. aba Lugares com o diálogo de avaliações aberto
  6. aba Itinerário com o formulário de nova atividade

**Roteiro de teste manual**: passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. `npm run test:cov`.
   → Termina com código 0 e a tabela de cobertura. `lib/` fica acima de 70% em todas as colunas.
2. Em `vitest.config.mts`, trocar `lines: 70` de `lib/**` por `lines: 99` e rodar
   `npm run test:cov` de novo.
   → Falha com `ERROR: Coverage for lines (...) does not meet "lib/**" threshold (99%)`.
   Desfazer a troca.
3. `npm run build` e `npx playwright test e2e/acessibilidade.spec.ts`.
   → 2 testes passando (chromium e mobile).
4. Com `npm run dev`, entrar como `teste.a@viajamais.local`, abrir uma viagem e navegar só com
   o teclado (Tab, Shift+Tab, Enter, Esc) até a aba Lugares, abrir **Avaliações**, escolher uma
   nota, salvar e fechar com Esc.
   → Todo elemento focado tem contorno visível, e o diálogo prende o foco enquanto aberto.
   Ao fechar, o foco volta para o botão **Avaliações**.

## 5. O que validar

Critérios objetivos e binários. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [x] Funciona em máquina limpa, seguindo só o README (`npm ci`, `npm run test:cov`)
- [x] `coverage.thresholds` ligado no `vitest.config.mts` (70% global e 70% em `lib/**`) e
  executado no CI pelo passo `test:cov` que já existe em `ci.yml`
- [x] Nenhum arquivo foi tirado da medição para fazer o número passar. Se algo for excluído,
  a exclusão vem com motivo escrito no próprio config
- [x] Cobertura de `app/api/trips/route.ts` e de `app/api/trips/[tripId]/route.ts` ≥ 70% de linhas
- [x] Zero violações do axe (WCAG 2.1 A e AA) nas telas listadas no bloco 4. Regra desligada
  só com justificativa escrita no spec, nunca em silêncio
- [x] Dependência nova fixada em versão publicada há mais de duas semanas
- [x] RNF03 e RNF05 escritos no catálogo, com status coerente com a evidência

## 6. Evidência

- [x] Saída dos testes: `docs/pfc/evidencias/S10-A-cobertura-verify.txt` (lint 0 erros e 42 avisos,
  503 testes, build) e `S10-A-cobertura-acessibilidade.txt` (4 passando: chromium e mobile)
- [x] Screenshot: `S10-A-cobertura-cores-novas-{chromium,mobile}.png`, com as cores novas da marca
- [x] Delta de cobertura: `S10-A-cobertura-test-cov.txt` e `S10-A-cobertura-corte-falha.txt`

## 7. Resultado

**Cobertura** (linhas): total 88,45% → 91,39%; `app/api/trips/route.ts` 52% → 95,7%;
`app/api/trips/[tripId]/route.ts` 45% → 100%. `lib/` sem mudança (91,5%), pois esta atividade
não mexeu em regra de negócio.

**Acessibilidade.** A primeira execução do axe encontrou três classes de violação, todas
corrigidas sem desligar regra:

1. `color-contrast`: o laranja `#ff7f50` (2,5:1 com texto branco) e o verde `#319f43` (3,4:1) da
   marca. Escurecidos em `app/globals.css` para `#c2410c` (5,2:1) e `#267e35` (5,1:1), com
   decisão da Audrey. O link "Esqueceu a senha?" do login passou de `sky-600` para `sky-700`.
2. `button-name`: campos de seleção sem `id` ligando ao `<Label>` (nova atividade, nova e editar
   viagem, nova reserva) e o botão da lixeira dos cards do dashboard, só com ícone
3. `link-name`: os links da barra lateral, que no celular mostram só o ícone

**Fora do escopo, registrado no PR:**
- A tela de nova despesa (Abner) tem os mesmos campos de seleção sem rótulo.
- A tag `@RNF04` em `tests/lib/env.test.ts` (Fernando) não existe no catálogo, então
  `pfc:rastreabilidade` sai com código 1. Isso já acontecia antes desta atividade.
