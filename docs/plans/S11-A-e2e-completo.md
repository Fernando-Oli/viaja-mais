---
id: S11-A-e2e-completo
titulo: E2E completo com screenshots
trilha: T1
responsavel: audrey
revisor: fernando
semana: S11
requisitos: [RF01.1, RF03.1, RF03.5, RF05.1, RF08.4, RF07.1]
secoes_doc: [24]
branch: feat/S11-A-e2e-completo
tipo: [tela]
depende_de: []
status: em-revisao
---
# E2E completo com screenshots

> **Audrey** · semana **S11** (04 a 10/11) · marco da semana: _IA ponta a ponta com provider fake no CI_

## 1. Contexto

Fluxo inteiro de uma pessoa nova, do cadastro até a publicação, com um screenshot por passo
arquivado em `docs/pfc/evidencias/`. Os specs de cada funcionalidade (S03 a S09) já cobrem os
casos de borda; este prova que as telas se encadeiam para quem acabou de criar a conta, sem
nenhum dado do seed.

A publicação de verdade (RF09.7) está no PR #51 do Micael, ainda fora da `main`. Na `main` o botão
"Publicar" abre a prévia visual do Fernando (`components/prototipo/botao-publicar.tsx`). O último
passo do teste abre o diálogo e confere que ele mostra a viagem certa. O botão ("Publicar") e o
título do diálogo ("Publicar viagem") são os mesmos na prévia e no `PublicarViagem` do Micael, então
o passo continua valendo depois do merge do #51. Gravar o post fica coberto pelos E2E do Micael.

## 2. Arquivos afetados

- `e2e/jornada-completa.spec.ts`: criar.
- `docs/pfc/evidencias/S11-A-e2e-completo-*.png` (6 passos × chromium e mobile) e
  `S11-A-e2e-completo-e2e.txt`: criar.
- `docs/pfc/00-historico-versao.md`: linha da versão.

## 3. Passos

1. Cadastro pela tela (`cadastrar` de `e2e/fixtures/contas.ts`, e-mail único).
2. Viagem pela API (o Destino depende do Google Places), conferida na lista e no detalhe.
3. Atividade pela tela "Adicionar Atividade".
4. Lugar pela API e "Marcar visitado" pela aba Lugares.
5. Reserva pela tela "Adicionar Reserva".
6. Diálogo "Publicar viagem" com o título da viagem.

## 4. O que testar

Obrigatórios pelo tipo (`tela`):

- [x] E2E do fluxo com screenshot arquivado em `docs/pfc/evidencias/` (chromium e mobile, 2 passed)

**Roteiro de teste manual**

1. `npm run build` e `npx playwright test e2e/jornada-completa.spec.ts`. Esperado: `2 passed`.
2. Abrir `docs/pfc/evidencias/S11-A-e2e-completo-01-cadastro-chromium.png` a `06-publicar`.
   Esperado: Painel da conta nova; detalhe da viagem; atividade no itinerário; lugar com o selo
   "Visitado"; reserva na aba Reservas; diálogo "Publicar viagem" com o título da viagem.
3. Repetir o passo 2 com os arquivos `-mobile.png`. Esperado: as mesmas telas no celular, sem
   rolagem horizontal.

## 5. O que validar

- [x] Funciona em mobile e desktop
- [x] Feedback por `toast()`; sem `alert()` nem `confirm()` (toasts "Atividade adicionada",
      "Lugar marcado como visitado" e "Reserva adicionada" aparecem nos screenshots)
- [x] Estado de erro e de carregamento tratados (cobertos pelos specs de cada tela e por
      `e2e/estados-erro.spec.ts`; este spec só encadeia o caminho feliz)

## 6. Evidência

- [x] Saída dos testes: `docs/pfc/evidencias/S11-A-e2e-completo-e2e.txt`
- [x] Screenshots: `docs/pfc/evidencias/S11-A-e2e-completo-0[1-6]-*-{chromium,mobile}.png`
- [ ] Delta de cobertura: não se aplica (não mexe em `lib/`)
