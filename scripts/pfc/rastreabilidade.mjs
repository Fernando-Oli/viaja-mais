#!/usr/bin/env node
/**
 * Matriz de rastreabilidade: requisito ↔ código ↔ teste ↔ commit.
 *
 * É o que amarra as seções 14, 22 e 24 do documento. Sem ela, afirmar na seção 24
 * que o sistema é testado vira declaração sem lastro — que é exatamente o erro da
 * documentação herdada, onde um RNF de testes automatizados foi declarado num
 * projeto com zero testes.
 *
 * Falha (exit 1) quando um requisito marcado "Implementado" não tem teste.
 */
import fs from "node:fs"
import path from "node:path"
import { execSync } from "node:child_process"

const RAIZ_CODIGO = ["app", "lib", "components", "context", "hooks"]
const RAIZ_TESTES = ["tests", "e2e"]
const CATALOGO = ["docs/pfc/03-publico/14-requisitos-funcionais.md", "docs/pfc/03-publico/15-requisitos-nao-funcionais.md"]
const SAIDA = "docs/pfc/rastreabilidade.md"

const TAG = /@(RF|RNF|RNE)[-\s]?(\d+(?:\.\d+)?)/g

function* percorrer(dir) {
  if (!fs.existsSync(dir)) return
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entrada.name)
    if (entrada.isDirectory()) {
      if (["node_modules", ".next", "ui"].includes(entrada.name)) continue
      yield* percorrer(p)
    } else if (/\.(ts|tsx|sql)$/.test(entrada.name)) {
      yield p
    }
  }
}

function coletarTags(raizes) {
  const mapa = new Map()
  for (const raiz of raizes) {
    for (const arquivo of percorrer(raiz)) {
      const texto = fs.readFileSync(arquivo, "utf8")
      for (const m of texto.matchAll(TAG)) {
        const id = `${m[1]}${m[2]}`
        if (!mapa.has(id)) mapa.set(id, new Set())
        mapa.get(id).add(arquivo.replaceAll("\\", "/"))
      }
    }
  }
  return mapa
}

/** Lê as tabelas do catálogo: | RF-001 | Descrição | Status | Prioridade | */
function lerCatalogo() {
  const requisitos = new Map()
  for (const arquivo of CATALOGO) {
    if (!fs.existsSync(arquivo)) continue
    for (const linha of fs.readFileSync(arquivo, "utf8").split("\n")) {
      const m = linha.match(/^\|\s*(RF|RNF|RNE)[-\s]?(\d+(?:\.\d+)?)\s*\|([^|]*)\|([^|]*)\|/)
      if (!m) continue
      requisitos.set(`${m[1]}${m[2]}`, {
        id: `${m[1]}-${m[2]}`,
        descricao: m[3].trim(),
        status: m[4].trim(),
      })
    }
  }
  return requisitos
}

function ultimoCommit(arquivo) {
  try {
    return execSync(`git log -1 --format=%h -- "${arquivo}"`, { encoding: "utf8" }).trim() || "—"
  } catch {
    return "—"
  }
}

const noCodigo = coletarTags(RAIZ_CODIGO)
const nosTestes = coletarTags(RAIZ_TESTES)
const catalogo = lerCatalogo()

const ids = [...new Set([...catalogo.keys(), ...noCodigo.keys(), ...nosTestes.keys()])].sort((a, b) =>
  a.localeCompare(b, "pt-BR", { numeric: true }),
)

const problemas = []
const linhas = []

for (const id of ids) {
  const req = catalogo.get(id)
  const impl = [...(noCodigo.get(id) ?? [])]
  const testes = [...(nosTestes.get(id) ?? [])]
  const status = req?.status ?? "—"

  if (req && /implementad/i.test(status) && testes.length === 0) {
    problemas.push(`${id} está "${status}" no catálogo mas não tem nenhum teste com a tag @${id}.`)
  }
  if (!req && (impl.length || testes.length)) {
    problemas.push(`${id} aparece no código mas não existe no catálogo de requisitos (tag órfã).`)
  }

  linhas.push(
    `| ${req?.id ?? id} | ${req?.descricao ?? "_(fora do catálogo)_"} | ${status} | ` +
      `${impl.map((f) => `\`${f}\``).join("<br>") || "—"} | ` +
      `${testes.map((f) => `\`${f}\``).join("<br>") || "—"} | ` +
      `${impl[0] ? ultimoCommit(impl[0]) : "—"} |`,
  )
}

const conteudo = `# Matriz de Rastreabilidade

> Gerado por \`npm run pfc:rastreabilidade\`. Não edite à mão.
> Última geração: ${new Date().toISOString().slice(0, 10)}

Requisitos são marcados no código e nos testes com uma tag em comentário
(\`// @RF03.4 — permite editar viagem\`). Este arquivo cruza essas tags com o
catálogo das seções 14 e 15.

| Requisito | Descrição | Status | Implementação | Teste | Último commit |
|---|---|---|---|---|---|
${linhas.join("\n") || "| — | _catálogo de requisitos ainda não escrito_ | — | — | — | — |"}

## Resumo

- Requisitos no catálogo: **${catalogo.size}**
- Com implementação marcada: **${noCodigo.size}**
- Com teste marcado: **${nosTestes.size}**
${problemas.length ? `\n## Inconsistências\n\n${problemas.map((p) => `- ${p}`).join("\n")}\n` : "\n_Nenhuma inconsistência._\n"}`

fs.mkdirSync(path.dirname(SAIDA), { recursive: true })
fs.writeFileSync(SAIDA, conteudo)
console.log(`Matriz escrita em ${SAIDA}`)
console.log(`Catálogo: ${catalogo.size} · código: ${noCodigo.size} · testes: ${nosTestes.size}`)

if (catalogo.size === 0) {
  console.log("\nAviso: o catálogo de requisitos (seções 14 e 15) ainda não existe.")
  console.log("É o entregável da S01 de Audrey, Micael e Abner — sem ele a matriz fica vazia.")
  process.exit(0)
}

if (problemas.length) {
  console.log(`\nInconsistências (${problemas.length}):`)
  for (const p of problemas) console.log(`  x ${p}`)
  process.exit(1)
}
console.log("\nSem inconsistências.")
