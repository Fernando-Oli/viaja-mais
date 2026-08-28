#!/usr/bin/env node
/**
 * Traz o estado do quadro para docs/plans/_board.json.
 *
 * Serve de contexto para os agentes ("o que está em revisão?", "o que está
 * parado?") sem precisar de acesso ao Notion durante a execução. É leitura:
 * nunca sobrescreve plano, porque o repositório é a fonte da verdade.
 */
import fs from "node:fs"
import { notion, exigirToken } from "./api.mjs"

exigirToken("a leitura do quadro")

const db = process.env.NOTION_DB_ATIVIDADES
if (!db) {
  console.log("Notion: NOTION_DB_ATIVIDADES não definido — rode `npm run notion:seed` primeiro.")
  process.exit(0)
}

const simples = (p) => {
  if (!p) return null
  switch (p.type) {
    case "title":
    case "rich_text":
      return p[p.type].map((t) => t.plain_text).join("")
    case "select":
      return p.select?.name ?? null
    case "multi_select":
      return p.multi_select.map((o) => o.name)
    case "url":
      return p.url
    case "date":
      return p.date?.start ?? null
    default:
      return null
  }
}

const cards = []
let cursor
do {
  const r = await notion(`/databases/${db}/query`, {
    body: { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) },
  })
  for (const pagina of r.results) {
    const c = {}
    for (const [k, v] of Object.entries(pagina.properties)) c[k] = simples(v)
    c._url = pagina.url
    c._atualizado = pagina.last_edited_time
    cards.push(c)
  }
  cursor = r.has_more ? r.next_cursor : undefined
} while (cursor)

const saida = "docs/plans/_board.json"
fs.writeFileSync(saida, JSON.stringify({ gerado: new Date().toISOString(), cards }, null, 2))

const porStatus = cards.reduce((a, c) => ((a[c.Status ?? "—"] = (a[c.Status ?? "—"] ?? 0) + 1), a), {})
console.log(`${cards.length} card(s) em ${saida}`)
for (const [s, n] of Object.entries(porStatus)) console.log(`  ${String(n).padStart(3)}  ${s}`)
