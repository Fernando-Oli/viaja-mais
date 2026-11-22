#!/usr/bin/env node
/**
 * Verificação de disponibilidade da aplicação em produção.
 *
 * Roda a cada cinco minutos no GitHub Actions (`.github/workflows/disponibilidade.yml`)
 * e pode ser rodada à mão: `node scripts/monitor/verificar.mjs [url]`.
 *
 * Confere duas coisas: a página inicial responde 200, e `/api/saude` responde
 * 200 com o banco ok. Uma falha só conta depois de uma segunda tentativa, 20 s
 * depois, para que um soluço de rede do próprio executor do GitHub não seja
 * registrado como queda da aplicação.
 *
 * O resultado é o código de saída: 0 no ar, 1 fora do ar. Cada execução do
 * workflow vira um ponto da série, e `npm run pfc:metricas` calcula a
 * disponibilidade a partir delas. Nenhum arquivo é escrito no repositório.
 *
 * @RNF04.1 disponibilidade monitorada
 */
import { pathToFileURL } from "node:url"

export const URL_PADRAO = "https://viaja-mais.online"
export const TEMPO_LIMITE_MS = 10_000
export const LENTO_MS = 5_000

/** Uma consulta HTTP, com tempo limite. Nunca lança: falha vira resultado. */
export async function consultar(url, { fetchImpl = fetch, tempoLimiteMs = TEMPO_LIMITE_MS } = {}) {
  const inicio = Date.now()
  try {
    const resposta = await fetchImpl(url, {
      redirect: "follow",
      headers: { "User-Agent": "viaja-mais-monitor", "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(tempoLimiteMs),
    })
    let corpo = null
    if ((resposta.headers.get("content-type") ?? "").includes("application/json")) {
      corpo = await resposta.json().catch(() => null)
    }
    return { url, status: resposta.status, ms: Date.now() - inicio, corpo, erro: null }
  } catch (erro) {
    const motivo = erro?.name === "TimeoutError" ? `sem resposta em ${tempoLimiteMs / 1000} s` : String(erro?.message ?? erro)
    return { url, status: 0, ms: Date.now() - inicio, corpo: null, erro: motivo }
  }
}

/**
 * Decide se a aplicação está no ar a partir das duas consultas. Pura, para ser
 * testada sem rede.
 */
export function avaliar(pagina, saude) {
  const problemas = []
  if (pagina.status !== 200) problemas.push(`página inicial: ${pagina.erro ?? `HTTP ${pagina.status}`}`)
  if (saude.status !== 200) problemas.push(`/api/saude: ${saude.erro ?? `HTTP ${saude.status}`}`)
  else if (saude.corpo?.banco !== "ok") problemas.push("/api/saude: resposta sem banco ok")

  const avisos = []
  for (const c of [pagina, saude]) {
    if (c.status === 200 && c.ms > LENTO_MS) avisos.push(`${new URL(c.url).pathname} levou ${c.ms} ms`)
  }
  return { noAr: problemas.length === 0, problemas, avisos }
}

export async function verificar(base, { fetchImpl = fetch, esperaMs = 20_000, esperar = esperarMs } = {}) {
  const raiz = base.replace(/\/+$/, "")
  const tentar = async () => {
    const [pagina, saude] = await Promise.all([
      consultar(`${raiz}/`, { fetchImpl }),
      consultar(`${raiz}/api/saude`, { fetchImpl }),
    ])
    return { pagina, saude, ...avaliar(pagina, saude) }
  }
  const primeira = await tentar()
  if (primeira.noAr) return { ...primeira, tentativas: 1 }
  await esperar(esperaMs)
  return { ...(await tentar()), tentativas: 2 }
}

function esperarMs(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function relatorio(base, r) {
  const linha = (c) => `| \`${new URL(c.url).pathname}\` | ${c.status || "—"} | ${c.ms} ms | ${c.erro ?? ""} |`
  return [
    `## ${r.noAr ? "No ar" : "FORA DO AR"} — ${base}`,
    "",
    `${new Date().toISOString()} · tentativas: ${r.tentativas}`,
    "",
    "| Caminho | HTTP | Tempo | Erro |",
    "|---|---|---|---|",
    linha(r.pagina),
    linha(r.saude),
    ...(r.problemas.length ? ["", ...r.problemas.map((p) => `- ${p}`)] : []),
    ...(r.avisos.length ? ["", ...r.avisos.map((a) => `- aviso: ${a}`)] : []),
    "",
  ].join("\n")
}

async function principal() {
  const fs = await import("node:fs")
  const base = process.argv[2] ?? process.env.MONITOR_URL ?? URL_PADRAO
  const r = await verificar(base)
  const texto = relatorio(base, r)
  console.log(texto)
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, texto)
  process.exit(r.noAr ? 0 : 1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  principal()
}
