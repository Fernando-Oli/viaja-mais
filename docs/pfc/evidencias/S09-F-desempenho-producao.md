# S09-F — Medição de desempenho (producao)

Gerado por `scripts/pfc/medir-desempenho.mjs` em 2026-11-13 04:00 (UTC), contra `https://viaja-mais.online`.

| Requisito | Meta | p50 | p95 | Máximo | Amostras | Resultado |
|---|---|---|---|---|---|---|
| RNF01.1 — carregamento do painel | < 3 s no p95 | 355 ms | 623 ms | 638 ms | 30 | **cumpre** |
| RNF01.2 — escrita pela API | < 1 s no p95 | 635 ms | 865 ms | 886 ms | 30 | **cumpre** |

## RNF01.3 — indicação sob concorrência

| Leitura de `/api/trips` | p50 | p95 | Amostras |
|---|---|---|---|
| Sequencial | 435 ms | 689 ms | 20 |
| 50 em paralelo | 1019 ms | 1738 ms | 50 |

Degradação do p50 com 50 requisições simultâneas: **135%** (a meta do RNF01.3 é até 20% com 1.000 usuários).

Isto **não verifica** o RNF01.3: são 50 requisições de uma única máquina e de uma única sessão, não 1.000 usuários. Verificá-lo exige um teste de carga distribuído, e as camadas gratuitas da Vercel e do Supabase têm limite de execução e de conexões abaixo dessa carga. Fica registrado como indício.

## Como foi medido

- **RNF01.1:** 30 carregamentos de `/dashboard` num Chromium (Playwright), cada um numa aba nova com a sessão já aberta, do início da navegação ao evento `load` (Navigation Timing). Uma carga de aquecimento antes, para não medir o arranque a frio da função.
- **RNF01.2:** 30 chamadas a `POST /api/trips/[id]/itinerary`, cada uma seguida da exclusão do item criado. Tempo do POST, do envio à resposta.
