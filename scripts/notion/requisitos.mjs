#!/usr/bin/env node
/**
 * Define a prioridade dos 84 requisitos herdados no quadro do Notion.
 *
 * Os requisitos vieram de `docs/ARCHITECTURE.md`, que os lista como bullets sem
 * nenhuma coluna de prioridade. Empurrados assim, os 84 caíram no Notion com a
 * opção do meio — "Média" em 100% deles, que é o mesmo que não ter prioridade.
 *
 * O critério abaixo não é opinião nova: sai da seção 6 do plano norte, a linha
 * de corte, que já define o que nunca se corta e o que cai primeiro se o
 * cronograma escorregar.
 *
 *   Alta  — o sistema não funciona ou não é seguro sem isso. Inclui o núcleo do
 *           produto (autenticação, viagem, viagem em grupo, itinerário, despesa)
 *           e tudo que a linha de corte marca como "nunca cortar": segurança,
 *           RLS, autorização e testes.
 *   Baixa — está na fila de corte, ou é alegação que não conseguimos sustentar
 *           com evidência num PFC (99,9% de disponibilidade, 1000 usuários
 *           simultâneos, recuperação de desastre em 4h). Declarar RNF sem
 *           lastro é exatamente o erro da documentação herdada — ver o cabeçalho
 *           de scripts/pfc/rastreabilidade.mjs.
 *   Média  — o resto: funcionalidade real do produto, mas o sistema fica de pé
 *           sem ela.
 *
 * A prioridade é do dono do grupo de requisito (ver a tabela no CLAUDE.md).
 * Isto é um ponto de partida defensável para as seções 14 e 15, não a palavra
 * final: quem escrever o catálogo ajusta e este arquivo acompanha.
 *
 *   uso: node scripts/notion/requisitos.mjs
 *        node scripts/notion/requisitos.mjs --dry
 */
import { notion, exigirToken } from "./api.mjs"

exigirToken("a prioridade dos requisitos")

const db = process.env.NOTION_DB_REQUISITOS
if (!db) {
  console.log("Notion: NOTION_DB_REQUISITOS não definido — rode `npm run notion:seed` primeiro.")
  process.exit(0)
}

const seco = process.argv.includes("--dry")

/** Núcleo do produto + o que a linha de corte marca como "nunca cortar". */
const ALTA = new Set([
  // Autenticação inteira: sem ela não existe nada mais.
  "RF01.1", "RF01.2", "RF01.3", "RF01.4", "RF01.5", "RF01.6",
  // CRUD de viagem — a entidade central.
  "RF03.1", "RF03.2", "RF03.3", "RF03.4", "RF03.5",
  // Viagem em grupo: convidar, aceitar, ver, editar itinerário, lançar despesa.
  // É o diferencial do produto e o que o E2E do fluxo completo precisa provar.
  "RF04.1", "RF04.3", "RF04.4", "RF04.5", "RF04.6",
  // Itinerário: criar, editar, excluir e ver por data.
  "RF05.1", "RF05.2", "RF05.3", "RF05.4",
  // Despesa: criar, editar, excluir e total — base do rateio.
  "RF06.1", "RF06.2", "RF06.3", "RF06.4",
  // Segurança inteira. "Nunca cortar", e é o material avaliado na seção 25.
  "RNF02.1", "RNF02.2", "RNF02.3", "RNF02.4", "RNF02.5", "RNF02.6", "RNF02.7", "RNF02.8",
  // Tipagem forte e testes: "nunca cortar", e sustentam a seção 24.
  "RNF05.1", "RNF05.4",
])

/** Fila de corte da seção 6, e RNFs que não temos como comprovar. */
const BAIXA = new Set([
  "RF03.7", // imagem de capa
  "RF06.7", // alerta de 80% do orçamento
  "RF07.3", "RF07.4", // reserva de carro e de atividade
  "RF08.2", "RF08.3", // favoritar lugar e anotar nele
  "RNF01.3", // 1000 usuários simultâneos — sem como demonstrar na entrega
  "RNF01.4", // otimização automática de imagens
  "RNF03.5", // WCAG 2.1 AA por inteiro
  "RNF04.1", "RNF04.2", "RNF04.3", // 99,9%, backup diário, desastre em 4h
  "RNF06.1", "RNF06.2", "RNF06.3", "RNF06.4", // serverless, CDN, pooling, cache
])

const prioridadeDe = (id) => (ALTA.has(id) ? "Alta" : BAIXA.has(id) ? "Baixa" : "Média")

const texto = (p) =>
  (p?.rich_text ?? p?.title ?? []).map((t) => t.plain_text).join("").trim()

const paginas = []
let cursor
do {
  const r = await notion(`/databases/${db}/query`, {
    body: { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) },
  })
  paginas.push(...r.results)
  cursor = r.has_more ? r.next_cursor : undefined
} while (cursor)

console.log(`${paginas.length} requisito(s) na database.\n`)

const contagem = { Alta: 0, Média: 0, Baixa: 0 }
const semId = []
let mudadas = 0

for (const p of paginas) {
  const id = texto(p.properties.ID).replace(/\s|-/g, "")
  if (!id) {
    semId.push(p.id)
    continue
  }
  const nova = prioridadeDe(id)
  contagem[nova]++

  if (p.properties.Prioridade?.select?.name === nova) continue
  if (seco) {
    console.log(`(dry)  ${id.padEnd(9)} ${p.properties.Prioridade?.select?.name ?? "—"} -> ${nova}`)
    mudadas++
    continue
  }
  await notion(`/pages/${p.id}`, {
    method: "PATCH",
    body: { properties: { Prioridade: { select: { name: nova } } } },
  })
  mudadas++
  if (nova !== "Média") console.log(`${nova.padEnd(6)} ${id}`)
}

console.log(`\nAlta ${contagem.Alta} · Média ${contagem.Média} · Baixa ${contagem.Baixa}`)
console.log(`${mudadas} linha(s) ${seco ? "seriam alteradas" : "alteradas"}.`)
if (semId.length) console.log(`${semId.length} linha(s) sem a coluna ID preenchida — ignoradas.`)
