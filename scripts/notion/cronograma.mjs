#!/usr/bin/env node
/**
 * Preenche as datas das 14 semanas na database Cronograma.
 *
 * O calendário do Notion só posiciona linha em propriedade do tipo `date`. A
 * coluna de texto ("26/08 a 01/09") é legível para humano e invisível para a
 * view — por isso o calendário aparecia vazio mesmo com as datas escritas.
 *
 * As semanas saem de uma única âncora, a S01 da seção 4 do plano norte, em vez
 * de uma tabela copiada à mão: catorze intervalos de quarta a terça, fechando a
 * S14 exatamente em 01/12/2026, a data da entrega.
 *
 *   uso: node scripts/notion/cronograma.mjs
 *        node scripts/notion/cronograma.mjs --dry
 */
import { notion, exigirToken } from "./api.mjs"

exigirToken("o preenchimento do cronograma")

const db = process.env.NOTION_DB_CRONOGRAMA
if (!db) {
  console.log("Notion: NOTION_DB_CRONOGRAMA não definido — rode `npm run notion:seed` primeiro.")
  process.exit(0)
}

const seco = process.argv.includes("--dry")

const INICIO_S01 = Date.UTC(2026, 7, 26) // 26/08/2026, quarta
const SEMANAS = 14
const DIA = 86_400_000
const iso = (ms) => new Date(ms).toISOString().slice(0, 10)

const semanas = Array.from({ length: SEMANAS }, (_, i) => {
  const inicio = INICIO_S01 + i * 7 * DIA
  return {
    nome: `S${String(i + 1).padStart(2, "0")}`,
    start: iso(inicio),
    end: iso(inicio + 6 * DIA),
  }
})

/**
 * A propriedade de data é procurada pelo tipo, não pelo nome: o quadro em uso
 * ganhou uma coluna `Data` criada à mão, e um seed novo cria a dele. Casar por
 * tipo faz o script funcionar nos dois sem precisar renomear nada no Notion.
 */
const esquema = await notion(`/databases/${db}`, { method: "GET" })
const campoData = Object.entries(esquema.properties).find(([, v]) => v.type === "date")?.[0]

if (!campoData) {
  console.error("A database Cronograma não tem nenhuma propriedade do tipo Data.")
  console.error("Crie uma (o seed chama de `Data`) e rode de novo — sem ela o calendário não funciona.")
  process.exit(1)
}
console.log(`Propriedade de data: "${campoData}"`)

const existentes = await notion(`/databases/${db}/query`, { body: { page_size: 100 } })
const porNome = new Map(
  existentes.results.map((p) => {
    const titulo = Object.values(p.properties).find((v) => v.type === "title")
    return [titulo?.title?.map((t) => t.plain_text).join("").trim(), p.id]
  }),
)

let escritas = 0
let ausentes = 0
for (const s of semanas) {
  const pagina = porNome.get(s.nome)
  if (!pagina) {
    console.log(`ausente    ${s.nome}  — nenhuma linha com esse título no Cronograma`)
    ausentes++
    continue
  }
  if (seco) {
    console.log(`(dry)      ${s.nome}  ${s.start} → ${s.end}`)
    continue
  }
  await notion(`/pages/${pagina}`, {
    method: "PATCH",
    body: { properties: { [campoData]: { date: { start: s.start, end: s.end } } } },
  })
  console.log(`preenchida ${s.nome}  ${s.start} → ${s.end}`)
  escritas++
}

console.log(`\n${escritas} semana(s) preenchida(s)${ausentes ? `, ${ausentes} sem linha correspondente` : ""}.`)
if (escritas) console.log(`Agora troque a view para Calendário usando "${campoData}".`)
