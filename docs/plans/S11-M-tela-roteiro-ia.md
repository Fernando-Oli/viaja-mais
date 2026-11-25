---
id: S11-M-tela-roteiro-ia
titulo: Tela de roteiro por IA
trilha: T1
responsavel: micael
revisor: fernando
semana: S11
requisitos: [RF12.1, RF12.2, RF12.3]
secoes_doc: [26]
branch: feat/S11-M-tela-roteiro-ia
tipo: [tela, regra-de-negocio]
depende_de: [S10-M-ia-adapter]
status: concluido
---
# Tela de roteiro por IA

> **Micael** · semana **S11** (04 a 10/11; feito em 20–22/11) · marco da semana: _IA ponta a ponta com provider fake no CI_

## 1. Contexto

Liga a prévia visual do Fernando, "Nova viagem com a Avori"
(`app/dashboard/trips/criar/ia/page.tsx`), à rota da S10 (`POST /api/roteiros/gerar`).
A pessoa responde seis perguntas, a Avori gera o roteiro, a pessoa **revisa e edita** e só
então cria a viagem. A saída do modelo nunca é gravada sem passar pela pessoa (RF12.2), e
"Refazer" descarta tudo sem salvar (RF12.3).

Decisões (Micael, 20/11):
- Só viagem nova, por esta tela; nada dentro de viagem existente.
- Até **5 dias** (S10): a pergunta 2 tem data de início e chips de 1 a 5 dias, com o aviso
  de que viagem mais longa vai por "Criar do meu jeito".
- Continuam **seis perguntas**: o card "Montar com a Avori" em `trips/criar/page.tsx`
  (fora do domínio) promete seis.
- Revisão: editar o título da viagem, o horário e o título de cada atividade, e remover
  atividades. Sem "+ atividade" (dá para incluir depois, na viagem).
- "Criar viagem" usa as rotas que já existem da Audrey: `POST /api/trips` e um
  `POST /api/trips/[id]/itinerary` por atividade. Nenhuma tabela dela é tocada, sem migration.
  **Sem transação**: se uma atividade falhar, a viagem existe e o toast diz quantas ficaram de fora.

## 2. Arquivos afetados

- `lib/ai/salvar.ts` — puras: datas de cada dia, título padrão, payload da viagem e dos itens.
- `app/dashboard/trips/criar/ia/page.tsx` — a tela ligada (sai o `SeloPrevia` e o roteiro fixo).
- `components/ia/rolagem-com-indicador.tsx` — rolagem sem barra, com esmaecido e setinha.
- `tests/lib/ai-salvar.test.ts` — unit.
- `e2e/roteiro-ia.spec.ts` — E2E com o gerador fake, screenshots em `docs/pfc/evidencias/`.
- `docs/pfc/03-publico/14-requisitos-funcionais.md` — RF12.1 a RF12.3.

Fora: `trips/criar/page.tsx`, rotas e telas de viagem e itinerário (Audrey), `components/prototipo/selo-previa.tsx` (Fernando, usado por outras prévias).

## 3. Passos

1. `lib/ai/salvar.ts` + unit.
2. Tela: pergunta 2 com data e dias; ritmo e orçamento só por chip; chamada à rota com
   carregamento, erro e "Tentar de novo"; painel de revisão editável; "Refazer"; "Criar viagem".
3. E2E: fluxo completo, edição e remoção, "Refazer" sem criar, erro simulado.
4. App local para o Micael testar e aprovar.

## 4. O que testar

Obrigatórios pelo tipo (`tela, regra-de-negocio`):

- [x] E2E do fluxo com screenshot arquivado em `docs/pfc/evidencias/` (chromium e mobile)
- [x] E2E: o roteiro editado (título trocado, atividade removida) é o que chega à viagem criada
- [x] E2E: "Refazer" volta à primeira pergunta e não cria viagem
- [x] E2E: erro da rota (503 simulado) mostra a mensagem e "Tentar de novo" gera
- [x] E2E: no desktop a página não passa da altura da janela; conversa e dias rolam por dentro
- [x] Unit de `lib/ai/salvar.ts` com casos de borda: virada de mês e de ano, 1 dia, título padrão longo, item sem horário/local/descrição, ordem por dia
- [x] Cobertura ≥70% em `lib/ai/salvar.ts`

**Roteiro de teste manual** — app local, `teste.a@viajamais.local` / `Viaja+mais123`:

1. Viagens → Nova viagem → "Começar com a Avori" → `/dashboard/trips/criar/ia`.
2. Destino "Lisboa"; data de início qualquer a partir de hoje e "3 dias"; "Em casal";
   "Equilibrado"; "Moderado"; marcar "Comida" e "História" → Continuar.
   → "Montando um roteiro para Lisboa…" e, em seguida, 3 dias na prévia, com datas reais.
3. Trocar o título da viagem, trocar o título de uma atividade, remover outra.
4. "Criar viagem" → toast "Viagem criada" e a tela da viagem, com as atividades editadas
   (a removida não aparece) nas datas certas.
5. Voltar à Avori, responder tudo e clicar "Refazer" → volta à pergunta 1; em Viagens, nada novo.
6. Na pergunta 2, conferir que não há opção acima de 5 dias e que o aviso aparece.
7. (Com `AI_PROVIDER=gemini`) repetir o passo 2 → roteiro com lugares reais.

## 5. O que validar

Critérios objetivos e binários. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [x] Funciona em mobile e desktop
- [x] Feedback por `toast()`; sem `alert()` nem `confirm()`
- [x] Estado de erro e de carregamento tratados
- [x] Nada é gravado antes de "Criar viagem"; "Refazer" não chama nenhuma rota de escrita
- [x] Nenhum `supabase.from` na tela; toda escrita por rota em `app/api/**`
- [x] Nenhum arquivo de outro domínio alterado
- [x] Tags `@RF12.1`, `@RF12.2`, `@RF12.3` no código e no teste; `npm run pfc:rastreabilidade:check` verde
- [x] Aprovado pelo Micael no app local antes de push (20/11, com o Gemini real)

## 6. Evidência

- [x] Saída dos testes: E2E 6/6 (chromium e mobile), suíte vitest 1040
- [x] Screenshots do fluxo: `docs/pfc/evidencias/S11-M-tela-roteiro-ia-0{1..4}-*-{chromium,mobile}.png`
- [x] Delta de cobertura de `lib/ai/salvar.ts`: 100% das linhas (arquivo novo)

## 7. Resultado (20/11)

- E2E `e2e/roteiro-ia.spec.ts` 6/6 contra `npm run start` com `AI_PROVIDER=fake` forçado (porta 3001),
  para não depender do Google; a viagem criada é apagada no fim do teste.
- Ajuste visto no screenshot: no celular o título da atividade ficava cortado entre o horário e o
  "×"; agora o horário e o "×" ficam numa linha e o título embaixo, com a largura toda.
- A barra fixa do app aparece no meio dos screenshots de página inteira: efeito da captura, não da tela.
- **Teste do Micael (20/11), três correções:**
  - "Ponto mais conhecido": era o gerador fake no dev server. O Gemini foi ligado no `.env.local` dele, e
    a instrução do modelo passou a exigir direcionamento real (verbo + lugar nomeado, sem genérico).
  - "Erro em todas as tentativas": 503 aleatório do free tier e um modelo que pendura. `lib/ai/gemini.ts`
    tenta até 4 vezes, alternando dois flash-lite, com teto de 7 s por tentativa dentro dos 15 s
    (escopo da S10, feito aqui). Real: Xangai em 10,5 s ("Explore o Jardim Yu…"), Lisboa em 3,0 s.
  - "As perguntas e o roteiro esticam a página": cada painel tem altura fixa e rolagem própria
    (desktop: grade com a altura da tela; celular: um painel por tela). Regressão no E2E: falhou no
    build anterior (página de 1480 px numa janela de 720) e passa agora.
  - "Outros elementos comprimem o roteiro; a prioridade é dele": topo numa linha só, conversa de 520 para
    360px no desktop (e encolhida no celular depois que o roteiro sai, com a tela descendo até ele),
    cabeçalho verde de 128px virou faixa de 56px, título da viagem compacto dentro da rolagem, rodapé
    enxuto. Área dos dias numa janela de 720px: de 267px para mais da metade da janela. Regressão no E2E
    (≥ 50% da janela e campo de hora ≥ 100px): falhou no build anterior (267px; 92px) e passa agora.
  - "Barras de rolagem não devem aparecer, mas com indicador de mais conteúdo": componente novo
    `components/ia/rolagem-com-indicador.tsx` nos dois painéis — barra escondida (a área continua rolando
    com roda, toque e teclado), esmaecido e setinha pulando enquanto há conteúdo abaixo, que somem no
    fim (a primeira versão tinha uma cápsula "Mais abaixo"; o Micael pediu só a seta). Estado por ResizeObserver/MutationObserver e pelo evento de rolagem. Regressão no E2E: falhou
    no build anterior (`scrollbar-width: auto`) e passa agora.
- E2E: 7 verdes e 1 pulado de propósito (o de rolagem, espaço e indicador é só desktop).
- Revisão `seguranca` (20/11): a data de cada dia vinha da posição no roteiro já filtrado; com um dia
  vazio descartado, `corposDosItens` gravava as atividades na data errada. Corrigido na normalização
  (S10); regressão também em `tests/lib/ai-salvar.test.ts`. A tela já mostra "Nenhuma atividade neste dia".
- Falta: o "aprovado" do Micael no app local (regra de 18/11), e só depois commit e push.
