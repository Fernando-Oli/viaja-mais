/**
 * Cliente mínimo da API do Notion.
 *
 * `fetch` puro em vez de @notionhq/client: usamos meia dúzia de endpoints e não
 * vale adicionar dependência (e superfície de atualização) para isso.
 */
import fs from "node:fs"
import path from "node:path"

/**
 * `node script.mjs` não lê `.env.local` — quem faz isso é o `next dev`. Sem esta
 * linha o script anuncia "NOTION_TOKEN não definido" com a chave ali no arquivo.
 *
 * `loadEnvFile` não sobrescreve variável já presente no ambiente: no CI o `env:`
 * do workflow continua vencendo, e lá o `.env.local` nem existe (é gitignored).
 * Os três scripts do Notion importam este módulo, então basta carregar aqui.
 */
try {
  // Resolvido a partir do módulo, não do cwd: funciona rodando de qualquer pasta.
  process.loadEnvFile(path.join(import.meta.dirname, "..", "..", ".env.local"))
} catch {
  // Sem .env.local (CI, ou máquina recém-clonada): segue com o ambiente do shell.
}

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

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * O Notion limita a integração a ~3 requisições por segundo.
 *
 * `sync.mjs --all` faz duas chamadas por plano (busca o card, depois grava) —
 * com 57 planos são 114 chamadas. Disparadas em rajada, a metade final leva 429
 * e o quadro fica pela metade, que é exatamente o caso em que o `--all` é usado.
 * Daí o espaçamento fixo mais o respeito ao `Retry-After` que o Notion devolve.
 */
const INTERVALO_MS = 350
let ultimaChamada = 0

export async function notion(caminho, { method = "POST", body, tentativas = 4 } = {}) {
  for (let tentativa = 1; ; tentativa++) {
    // Sequencial por construção (os scripts usam for/await), então um timestamp basta.
    const espera = ultimaChamada + INTERVALO_MS - Date.now()
    if (espera > 0) await dormir(espera)
    ultimaChamada = Date.now()

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

    if (resposta.status === 429 && tentativa < tentativas) {
      const segundos = Number(resposta.headers.get("retry-after")) || tentativa * 2
      console.log(`  429 — aguardando ${segundos}s (tentativa ${tentativa}/${tentativas - 1})`)
      await dormir(segundos * 1000)
      continue
    }

    if (!resposta.ok) {
      throw new Error(`Notion ${resposta.status} em ${caminho}: ${dados.message ?? "erro desconhecido"}`)
    }
    return dados
  }
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

/**
 * Extrai um bloco numerado do corpo do plano (ex.: "## 4. O que testar").
 *
 * Split em vez de regex de propósito: a versão anterior montava o padrão com
 * template literal, onde `\s` vira `s` e `\n` vira quebra de linha de verdade —
 * a regex saía como `^##s*4.` e nunca casava, então "O que testar" e "O que
 * validar" chegavam vazios em todos os cards. Com `^##\s+` num split não há
 * escape para errar, e `###` não casa (o `\s+` exige espaço depois dos dois #).
 */
export function bloco(corpo, numero) {
  const secao = corpo.split(/^##\s+/m).find((s) => s.startsWith(`${numero}.`))
  return secao ? secao.slice(secao.indexOf("\n") + 1).trim() : ""
}
