/**
 * Cliente mínimo da API do Notion.
 *
 * `fetch` puro em vez de @notionhq/client: usamos meia dúzia de endpoints e não
 * vale adicionar dependência (e superfície de atualização) para isso.
 */
import fs from "node:fs"
import path from "node:path"

export const VERSAO_API = "2022-06-28"
const BASE = "https://api.notion.com/v1"

export function token() {
  return process.env.NOTION_TOKEN ?? ""
}

/**
 * O Notion é espelho, não fonte da verdade. Sem token, os scripts avisam e saem
 * com sucesso — trabalho nenhum pode parar porque o quadro não sincronizou.
 */
export function exigirToken(contexto = "sincronizar") {
  if (!token()) {
    console.log(`Notion: NOTION_TOKEN não definido — pulando ${contexto}.`)
    console.log("O plano em docs/plans/ continua sendo a fonte da verdade.")
    process.exit(0)
  }
}

export async function notion(caminho, { method = "POST", body } = {}) {
  const resposta = await fetch(`${BASE}${caminho}`, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Notion-Version": VERSAO_API,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const dados = await resposta.json().catch(() => ({}))
  if (!resposta.ok) {
    throw new Error(`Notion ${resposta.status} em ${caminho}: ${dados.message ?? "erro desconhecido"}`)
  }
  return dados
}

/* ------------------------------------------------------------------ helpers */

export const texto = (v) => ({ rich_text: [{ text: { content: String(v ?? "").slice(0, 2000) } }] })
export const titulo = (v) => ({ title: [{ text: { content: String(v ?? "").slice(0, 200) } }] })
export const selecao = (v) => (v ? { select: { name: String(v) } } : { select: null })
export const multi = (vs) => ({ multi_select: (vs ?? []).map((n) => ({ name: String(n) })) })
export const url = (v) => ({ url: v || null })

/* --------------------------------------------------- leitura dos planos ---- */

/** Frontmatter simples: chave: valor, com listas em [a, b]. Sem dependência. */
export function lerPlano(caminho) {
  const bruto = fs.readFileSync(caminho, "utf8")
  const m = bruto.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!m) return null

  const meta = {}
  for (const linha of m[1].split(/\r?\n/)) {
    const par = linha.match(/^(\w+):\s*(.*)$/)
    if (!par) continue
    let valor = par[2].replace(/\s+#.*$/, "").trim()
    if (valor.startsWith("[") && valor.endsWith("]")) {
      valor = valor
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    }
    meta[par[1]] = valor
  }
  return { meta, corpo: m[2], arquivo: caminho.replaceAll("\\", "/") }
}

export function listarPlanos(dir = "docs/plans") {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md") && !f.startsWith("_") && f !== "README.md" && !f.startsWith("00-"))
    .map((f) => lerPlano(path.join(dir, f)))
    .filter(Boolean)
}

/** Extrai um bloco numerado do corpo do plano (ex.: "## 4. O que testar"). */
export function bloco(corpo, numero) {
  const re = new RegExp(`^##\s*${numero}\.[^\n]*\n([\s\S]*?)(?=\n##\s|\s*$)`, "m")
  return (corpo.match(re)?.[1] ?? "").trim()
}
