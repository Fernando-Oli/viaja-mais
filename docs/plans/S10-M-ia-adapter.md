---
id: S10-M-ia-adapter
titulo: Adapter de IA e rota de geração de roteiro
trilha: T1
responsavel: micael
revisor: fernando
semana: S10
requisitos: [RF12.1, RNF07.3, RNF07.4]
secoes_doc: [26]
branch: feat/S10-M-ia-adapter
tipo: [route-handler, regra-de-negocio]
depende_de: []
status: em-revisao
---
# Adapter de IA e rota de geração de roteiro

> **Micael** · semana **S10** (28/10 a 03/11; feito em 20–22/11) · marco da semana: _Cobertura de 70% em lib/_

## 1. Contexto

A tela "Nova viagem com a Avori" (prévia do Fernando, `app/dashboard/trips/criar/ia/page.tsx`)
faz seis perguntas e mostra um roteiro dia a dia montado com um modelo fixo. Esta atividade
cria o motor por trás dela: uma interface com uma implementação **fake** determinística
(dev, CI e E2E, custo zero e sem flakiness) e a **real** atrás dela, o **Gemini free tier**
(decisão do Micael em 20/11, padrão P5 do plano norte).

A rota **gera e devolve**; não grava nada. Gravar a viagem é a S11, pelas rotas que já
existem da Audrey (`POST /api/trips` e `POST /api/trips/[id]/itinerary`), depois que a
pessoa revisa o roteiro (RF12.2). A saída do modelo é tratada como entrada hostil: passa
por normalização e por um schema zod estrito antes de sair da rota.

Decisões de desenho:
- **Sem `tripId`:** o roteiro nasce antes de a viagem existir. Não há viagem para
  autorizar, então não existe o caminho 403; o controle é sessão + limite por usuário.
- **`fetch` puro**, sem `@google/genai`: nenhuma dependência nova no `package.json`.
- **Chave só no servidor:** `envServidor().GEMINI_API_KEY`, enviada no cabeçalho
  `x-goog-api-key` (nunca na URL, que vai para log).
- **No máximo 5 dias** (`DIAS_MAXIMOS`), decisão do Micael em 20/11 depois da fumaça com chave real:
  7 e 14 dias passaram dos 15 s do RNF07.3. Viagem mais longa vai por "Criar do meu jeito".
- `AI_PROVIDER=anthropic` existe no `lib/env.ts`, mas não tem implementação: responde 503
  com mensagem clara. Trocar para Claude é escrever `lib/ai/anthropic.ts`.
- Texto livre da pessoa vai ao modelo como **dado** (JSON delimitado), nunca como instrução.
  Mesmo que alguém injete instrução, a saída só pode ser um roteiro no schema, só volta
  para quem pediu e só é gravada depois de revisada.

## 2. Arquivos afetados

- `lib/schemas/roteiro.ts` — contrato de entrada da rota (destino, dias, quem, ritmo, orçamento, interesses).
- `lib/ai/roteiro.ts` — schema da saída, limites e `normalizarRoteiro` (pura).
- `lib/ai/provider.ts` — interface `GeradorDeRoteiro`, `escolherGerador()` e o corte de 15 s.
- `lib/ai/fake.ts` — gerador determinístico.
- `lib/ai/gemini.ts` — gerador real, por `fetch`, com `responseSchema`.
- `lib/ai/prompt.ts` — instrução de sistema e montagem da mensagem.
- `app/api/roteiros/gerar/route.ts` — `POST`.
- Testes: `tests/lib/ai-roteiro.test.ts`, `tests/lib/ai-fake.test.ts`, `tests/lib/ai-gemini.test.ts`,
  `tests/lib/ai-provider.test.ts`, `tests/api/roteiros-gerar-route.test.ts`.
- `docs/pfc/03-publico/14-requisitos-funcionais.md` e `15-requisitos-nao-funcionais.md` — status de RF12.1, RNF07.3, RNF07.4.

Sem migration: nada é persistido. O `LIMITES.roteiroIa` (10 por hora) já existe em
`lib/seguranca/limite.ts` (Fernando); só é consumido.

## 3. Passos

1. Schema de entrada e de saída, com os limites de `lib/schemas/itinerario.ts` (título 120, local 200).
2. `normalizarRoteiro`: corta textos no limite, descarta item sem título ou com horário inválido,
   categoria desconhecida vira `activity`, ordena por horário, no máximo 8 itens por dia e
   no máximo os dias pedidos; dia sem item some; nada utilizável → 502.
3. Fake determinístico: mesmo pedido, mesmo roteiro; quantidade de itens pelo ritmo.
4. Gemini: `generateContent` com `responseMimeType: application/json` e `responseSchema`;
   HTTP 429 do Google → 503; outro erro → 502; JSON inválido → 502; tempo → 504.
5. Rota no molde: `getUser()` → zod campo a campo → `exigirLimite(LIMITES.roteiroIa)` → gerar → `{ roteiro }`.
6. Testes, cobertura, rastreabilidade, `npm run verify`.

## 4. O que testar

Obrigatórios pelo tipo (`route-handler, regra-de-negocio`):

- [x] Integração da rota: **200** feliz · **401** sem sessão · **400** payload inválido (e não gasta limite) · **429** limite estourado (não chama o gerador) · **502** saída inválida do modelo · **504** tempo esgotado · **503** provedor não configurado
- [ ] ~~403 não-membro~~ — não se aplica: a rota não recebe viagem (ver Contexto)
- [x] A rota passa ao gerador só os campos do schema (chave extra no corpo é 400: o schema é `.strict()`)
- [x] Unit de `normalizarRoteiro` com casos de borda: texto acima do limite, horário inválido, categoria desconhecida, mais dias que o pedido, dia vazio, nada utilizável, lixo (`null`, string, array)
- [x] Unit do fake: determinístico, respeita `dias`, ritmo muda a quantidade, saída passa no schema
- [x] Unit do Gemini com `fetch` simulado: chave no cabeçalho e não na URL, 429/401/403/5xx → 503, 400/404 → 502, JSON quebrado → 502, aborto → 504, sem chave → 503
- [x] Cobertura ≥70% em cada arquivo de `lib/ai/`

**Roteiro de teste manual** — com `AI_PROVIDER=fake` (padrão) e o app local no ar:

1. Entrar como `teste.a@viajamais.local` / `Viaja+mais123`.
2. No console do navegador, em `/dashboard`:
   `await (await fetch("/api/roteiros/gerar",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({destino:"Lisboa",dias:3,quem:"Em casal",ritmo:"equilibrado",orcamento:"moderado",interesses:["Comida"]})})).json()`
   → `{ roteiro: { dias: [3 dias] } }`, cada dia com 3 itens ordenados por horário.
3. Repetir o passo 2 → o mesmo roteiro (fake determinístico).
4. Mandar `dias: 0` → 400 com `detalhes`.
5. Repetir o passo 2 até a 11ª vez na hora → 429 com `Retry-After`.
6. Com `AI_PROVIDER=gemini` e `GEMINI_API_KEY` no `.env.local`, reiniciar o dev server e repetir o passo 2 → roteiro real para Lisboa em até 15 s.

## 5. O que validar

Critérios objetivos e binários. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [x] Chave de IA nunca com prefixo `NEXT_PUBLIC_`, nunca na URL, nunca no corpo da resposta
- [x] Saída do modelo validada pelo schema estrito antes de sair da rota; nada é gravado no banco
- [x] Corpo validado por zod, com campos extraídos um a um — nunca `...body`
- [x] Sessão checada no servidor com `getUser()`; limite consumido **depois** do zod e **antes** do gerador
- [x] `normalizarRoteiro` e o fake são funções puras, sem I/O
- [x] Toda espera pelo provedor termina em até 15 s (RNF07.3), com mensagem em português
- [x] Nenhum `process.env` direto; ambiente só por `lib/env.ts`
- [x] Nenhum arquivo de outro domínio alterado; nenhuma dependência nova
- [x] Tags `@RF12.1`, `@RNF07.3`, `@RNF07.4` no código e no teste; `npm run pfc:rastreabilidade:check` verde

## 6. Evidência

- [x] Saída dos testes: `docs/pfc/evidencias/S10-M-ia-adapter-testes.txt`
- [x] Delta de cobertura de `lib/ai/`: 100% das linhas, 97,6% dos ramos (arquivo novo; antes não existia)

## 7. Resultado (20/11)

- 90 testes da atividade verdes; suíte completa com 1018. Cobertura de `lib/ai/`: 100% das linhas.
- Mutação: 16 de 17 sabotagens pegas. A viva ("repassa o objeto do parse inteiro") é equivalente:
  com `.strict()`, `analise.data` já tem só os seis campos.
- O modelo do Gemini é a constante `MODELO_GEMINI` (`gemini-3.5-flash-lite`, free tier e saída
  estruturada). O formato `generationConfig.responseFormat.text` foi conferido na documentação do
  AI Studio em 20/11; a chamada real só é provada no passo 6 do roteiro manual, com chave.
- **Fumaça com o Gemini real** (chave do Micael só em variável de ambiente, nunca em arquivo):
  - 3 dias, equilibrado: HTTP 200 em 8,8 s, roteiro coerente — formato confirmado;
  - 14 dias: HTTP 400 "too many states for serving" por `minItems`/`maxItems` no schema. **Corrigido**:
    os limites saíram do schema enviado ao Google e ficam no `normalizarRoteiro`; regressão em
    `tests/lib/ai-gemini.test.ts` (falha no `a1b718e`, passa depois);
  - depois da correção, 14 dias intenso e 7 dias equilibrado passaram de 15 s (504) → teto de 5 dias;
  - em seguida o Google respondeu 503 em todas as chamadas, até em 3 dias: instabilidade do free tier.
    **O tempo de 5 dias (ritmo intenso) ainda não foi medido** — pendência para o roteiro manual.
- Fumaça contra o banco local não executada: o Supabase local estava fora do ar. O limite real é
  coberto por `tests/lib/limite.test.ts` e pela RLS do Fernando.
- Pendências para o Fernando (registro, nada alterado no domínio dele): a regra `roteiroIa` do
  `LIMITES` passou a ser consumida; `AI_PROVIDER=anthropic` responde 503 até existir `lib/ai/anthropic.ts`.
- **Ajustes depois do teste do Micael na tela (20/11, à noite), dentro desta atividade:**
  - instrução do modelo exige **direcionamento real**: verbo no imperativo + lugar real nomeado
    ("Explore o Jardim Yu"), sem título genérico, refeição por rua/mercado/bairro sem inventar restaurante;
  - **novas tentativas**: o free tier recusa pedidos ao acaso com 503 e o `gemini-3.5-flash-lite` às vezes
    pendura. `lib/ai/gemini.ts` tenta até 4 vezes, alternando `gemini-3.1-flash-lite` e
    `gemini-3.5-flash-lite`, só em 429/5xx/rede, com pausa curta que respeita o prazo e **teto de 7 s por
    tentativa** dentro dos 15 s da rota; se todas estourarem o teto, 504. Os `gemini-2.5-*` já dão 404
    para chave nova e o `gemini-3.6-flash` passou de 15 s;
  - mutação da lógica nova: 16 de 17 sabotagens pegas (a viva é equivalente: a pausa seguinte já
    encerra com 504 quando o prazo da rota estourou);
  - real: Xangai em 10,5 s (a 1ª tentativa pendurou e foi cortada, a 2ª entregou "Explore o Jardim Yu e
    o Bazar da Cidade Velha"), Lisboa em 3,0 s ("Suba ao Castelo de São Jorge").

- **Revisão adversarial independente (agente `seguranca`, 20/11), cada achado reproduzido antes de aceitar:**
  - **Alto, fora deste domínio (Fernando):** `consumir_limite` (migration `plataforma_rate_limit`) deixa
    quem chama escolher a janela, e trocar a janela zera o contador. Reproduzido no banco local, como a
    Ana, numa transação desfeita: limite 1 → 2ª chamada negada → uma chamada com janela de 7 s → a
    seguinte volta a ser permitida. Qualquer conta logada zera o próprio limite pelo PostgREST, e isso
    vale para todos os limites do app (convite, troca de senha, foto, seguir, IA). Não mexi: vai ao
    Fernando no PR. Afeta o RNF07.4.
  - **Médio, corrigido:** dia que a IA devolve sem atividade aproveitável era descartado, e os seguintes
    andavam uma data para trás. Agora o dia fica no lugar, vazio (a posição é a data); o roteiro ainda
    exige ao menos uma atividade. Regressões em `tests/lib/ai-roteiro.test.ts` e `ai-salvar.test.ts`
    (falham antes, passam depois); mutação 2/2.
  - **Baixo, corrigido:** o prazo de 15 s começava depois da sessão e do limite. Agora começa na primeira
    linha da rota. Regressão em `tests/api/roteiros-gerar-route.test.ts` (ordem: prazo, sessão, limite).
  - **Baixo/informativo, registrados sem mudança:** falha do provedor gasta tentativa do limite (escolha
    de desenho); janela fixa permite 20 gerações em ~2 min na virada da hora (limite do Fernando);
    `descricao` e `local` gerados não são editáveis, só removíveis com a atividade; nenhuma chave
    vazada, nenhum mass-assignment, nenhum XSS, nenhuma escrita direta do navegador.
