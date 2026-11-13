#!/usr/bin/env node
/**
 * Mede os requisitos de performance (RNF01.1, RNF01.2 e uma indicação do
 * RNF01.3) contra um ambiente rodando, e grava a evidência em
 * docs/pfc/evidencias/S09-F-desempenho-<ambiente>.md.
 *
 * Uso:
 *   node scripts/pfc/medir-desempenho.mjs                       # local: http://localhost:3000, conta do seed
 *   MEDIR_URL=https://viajamais-prod.vercel.app \
 *   MEDIR_EMAIL=... MEDIR_SENHA=... MEDIR_AMBIENTE=producao \
 *   node scripts/pfc/medir-desempenho.mjs
 *
 * O que mede:
 *   - RNF01.1 — 30 carregamentos do /dashboard num navegador de verdade
 *     (Chromium), do início da navegação ao evento `load`. Percentil 95.
 *   - RNF01.2 — 30 escritas pela API: cria um item no itinerário de uma viagem
 *     de medição e o apaga. Tempo de resposta do POST. Percentil 95.
 *   - RNF01.3 (indicativo) — 50 leituras de /api/trips em paralelo, comparadas
 *     com 20 sequenciais. Mil usuários simultâneos não se medem de uma máquina
 *     só; o número serve de indício, e a evidência diz isso.
 *
 * Cria uma viagem "Medição de desempenho" na conta usada e a apaga no fim.
 *
 * @RNF01.1 @RNF01.2 @RNF01.3
 */
import fs from "node:fs"
import { chromium } from "@playwright/test"

const URL_BASE = (process.env.MEDIR_URL ?? "http://localhost:3000").replace(/\/$/, "")
const EMAIL = process.env.MEDIR_EMAIL ?? "teste.a@viajamais.local"
const SENHA = process.env.MEDIR_SENHA ?? "viajamais123"
const AMBIENTE = process.env.MEDIR_AMBIENTE ?? "local"
const N = Number(process.env.MEDIR_N ?? 30)

function percentil(valores, p) {
  const ordenados = [...valores].sort((a, b) => a - b)
  const i = Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1)
  return ordenados[Math.max(0, i)]
}
const ms = (v) => `${Math.round(v)} ms`
const resumo = (v) => ({ p50: percentil(v, 50), p95: percentil(v, 95), max: Math.max(...v), n: v.length })

const navegador = await chromium.launch()
const contexto = await navegador.newContext({ baseURL: URL_BASE, locale: "pt-BR" })
const pagina = await contexto.newPage()

// Login pela tela, como uma pessoa: a sessão fica nos cookies do contexto.
await pagina.goto("/auth/login")
await pagina.fill("#email", EMAIL)
await pagina.fill("#password", SENHA)
await pagina.click('button[type="submit"]')
await pagina.waitForURL("**/dashboard", { timeout: 30_000 })

// Aquecimento: a primeira requisição de uma função serverless paga o arranque
// a frio, que não é o que o requisito descreve.
await pagina.goto("/dashboard")

// --- RNF01.1: carregamento do painel ---------------------------------------
const carregamentos = []
for (let i = 0; i < N; i++) {
  const p = await contexto.newPage()
  await p.goto("/dashboard", { waitUntil: "load" })
  const t = await p.evaluate(() => {
    const [nav] = performance.getEntriesByType("navigation")
    return nav.loadEventEnd - nav.startTime
  })
  carregamentos.push(t)
  await p.close()
}

// --- RNF01.2: escrita pela API ---------------------------------------------
const api = pagina.request
const viagem = await api.post("/api/trips", {
  data: { title: "Medição de desempenho", destination: "—", start_date: "2026-12-01", end_date: "2026-12-02", currency: "BRL", status: "planning" },
})
if (!viagem.ok()) throw new Error(`não criou a viagem de medição: ${viagem.status()}`)
const tripId = (await viagem.json()).data[0].id

const escritas = []
try {
  for (let i = 0; i < N; i++) {
    const inicio = performance.now()
    const r = await api.post(`/api/trips/${tripId}/itinerary`, {
      data: { title: `item ${i}`, date: "2026-12-01", category: "activity" },
    })
    escritas.push(performance.now() - inicio)
    if (!r.ok()) throw new Error(`escrita ${i} falhou: ${r.status()}`)
    const { data } = await r.json()
    const id = Array.isArray(data) ? data[0]?.id : data?.id
    if (id) await api.delete(`/api/trips/${tripId}/itinerary/${id}`)
  }

  // --- RNF01.3 (indicativo): leitura sob concorrência -----------------------
  var sequenciais = []
  for (let i = 0; i < 20; i++) {
    const inicio = performance.now()
    await api.get("/api/trips")
    sequenciais.push(performance.now() - inicio)
  }
  var paralelas = await Promise.all(
    Array.from({ length: 50 }, async () => {
      const inicio = performance.now()
      await api.get("/api/trips")
      return performance.now() - inicio
    }),
  )
} finally {
  await api.delete(`/api/trips/${tripId}`)
}

await navegador.close()

const r1 = resumo(carregamentos)
const r2 = resumo(escritas)
const seq = resumo(sequenciais)
const par = resumo(paralelas)
const degradacao = ((par.p50 - seq.p50) / seq.p50) * 100
const agora = new Date().toISOString().slice(0, 16).replace("T", " ")
// Localmente, a degradação mede a máquina, não o sistema — e um 900% solto na
// evidência levaria à conclusão errada.
const notaLocal =
  AMBIENTE === "local"
    ? "**Neste ambiente a degradação não mede o sistema, mede a máquina:** `next start` é um único processo Node, " +
      "que atende uma requisição por vez, e as 50 simultâneas viram fila. Na Vercel, cada requisição ganha a " +
      "própria instância da função (RNF06.1); é lá que este número tem sentido.\n\n"
    : ""

const md = `# S09-F — Medição de desempenho (${AMBIENTE})

Gerado por \`scripts/pfc/medir-desempenho.mjs\` em ${agora} (UTC), contra \`${URL_BASE}\`.

| Requisito | Meta | p50 | p95 | Máximo | Amostras | Resultado |
|---|---|---|---|---|---|---|
| RNF01.1 — carregamento do painel | < 3 s no p95 | ${ms(r1.p50)} | ${ms(r1.p95)} | ${ms(r1.max)} | ${r1.n} | ${r1.p95 < 3000 ? "**cumpre**" : "**não cumpre**"} |
| RNF01.2 — escrita pela API | < 1 s no p95 | ${ms(r2.p50)} | ${ms(r2.p95)} | ${ms(r2.max)} | ${r2.n} | ${r2.p95 < 1000 ? "**cumpre**" : "**não cumpre**"} |

## RNF01.3 — indicação sob concorrência

| Leitura de \`/api/trips\` | p50 | p95 | Amostras |
|---|---|---|---|
| Sequencial | ${ms(seq.p50)} | ${ms(seq.p95)} | ${seq.n} |
| 50 em paralelo | ${ms(par.p50)} | ${ms(par.p95)} | ${par.n} |

Degradação do p50 com 50 requisições simultâneas: **${degradacao.toFixed(0)}%** (a meta do RNF01.3 é até 20% com 1.000 usuários).

${notaLocal}Isto **não verifica** o RNF01.3: são 50 requisições de uma única máquina e de uma única sessão, não 1.000 usuários. Verificá-lo exige um teste de carga distribuído, e as camadas gratuitas da Vercel e do Supabase têm limite de execução e de conexões abaixo dessa carga. Fica registrado como indício.

## Como foi medido

- **RNF01.1:** ${r1.n} carregamentos de \`/dashboard\` num Chromium (Playwright), cada um numa aba nova com a sessão já aberta, do início da navegação ao evento \`load\` (Navigation Timing). Uma carga de aquecimento antes, para não medir o arranque a frio da função.
- **RNF01.2:** ${r2.n} chamadas a \`POST /api/trips/[id]/itinerary\`, cada uma seguida da exclusão do item criado. Tempo do POST, do envio à resposta.
`
fs.mkdirSync("docs/pfc/evidencias", { recursive: true })
const saida = `docs/pfc/evidencias/S09-F-desempenho-${AMBIENTE}.md`
fs.writeFileSync(saida, md)
console.log(md)
console.log(`\nEvidência gravada em ${saida}`)
