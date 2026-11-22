#!/usr/bin/env node
/**
 * Métricas de CI/CD e de processo para as seções 17, 23 e 24 do documento.
 *
 * Tudo sai do git e do GitHub (`gh`), nada é digitado à mão: o documento só
 * pode afirmar número que alguém consiga recalcular. Grava
 * `docs/pfc/evidencias/<AAAA-MM-DD>/metricas.md`.
 *
 * Uso: npm run pfc:metricas            (desde 26/08/2026, início do semestre)
 *      npm run pfc:metricas -- 2026-09-01
 */
import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { RAIZ_PFC } from "./secoes.mjs"

const DESDE = process.argv[2] ?? "2026-08-26"
const HOJE = new Date().toISOString().slice(0, 10)
const BRANCH = "origin/main"

const rodar = (cmd, args) =>
  execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })
const git = (...a) => rodar("git", a).trim()
const gh = (...a) => JSON.parse(rodar("gh", a))

const contar = (itens, chave) => {
  const m = new Map()
  for (const i of itens) m.set(chave(i), (m.get(chave(i)) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}
const quantil = (ordenado, q) =>
  ordenado.length ? ordenado[Math.min(ordenado.length - 1, Math.floor(ordenado.length * q))] : null
const segundos = (a, b) => (new Date(b) - new Date(a)) / 1000
const duracao = (s) =>
  s === null ? "—" : s < 120 ? `${Math.round(s)} s` : `${(s / 60).toFixed(1).replace(".", ",")} min`
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1).replace(".", ",")}%` : "—")
const tabela = (cab, linhas) =>
  [`| ${cab.join(" | ")} |`, `|${cab.map(() => "---").join("|")}|`, ...linhas.map((l) => `| ${l.join(" | ")} |`)].join("\n")

/* 1. Execuções da esteira -------------------------------------------------- */
// O monitor de disponibilidade roda 288 vezes por dia: numa listagem única, ele
// empurraria a esteira para fora do limite. Ele é lido à parte, na seção 2b.
const MONITOR = "Disponibilidade"
const CAMPOS = "databaseId,workflowName,conclusion,createdAt,updatedAt,event,headBranch,headSha"
const runs = gh("run", "list", "--limit", "3000", "--json", CAMPOS).filter(
  (r) => r.createdAt.slice(0, 10) >= DESDE && r.conclusion && r.workflowName !== MONITOR,
)

const porWorkflow = new Map()
for (const r of runs) {
  const w = porWorkflow.get(r.workflowName) ?? { total: 0, success: 0, failure: 0, cancelled: 0, tempos: [] }
  w.total++
  if (r.conclusion in w) w[r.conclusion]++
  if (r.conclusion === "success") w.tempos.push(segundos(r.createdAt, r.updatedAt))
  porWorkflow.set(r.workflowName, w)
}
const linhasWorkflow = [...porWorkflow.entries()]
  .sort((a, b) => b[1].total - a[1].total)
  .map(([nome, w]) => {
    const t = w.tempos.sort((a, b) => a - b)
    return [
      nome, w.total, w.success, w.failure, w.cancelled,
      pct(w.success, w.success + w.failure),
      duracao(quantil(t, 0.5)), duracao(quantil(t, 0.9)),
    ]
  })

/* 2. Última execução na main: tempo por etapa e resultado dos testes -------- */
const ultimas = {}
for (const nome of ["CI", "Banco de dados"]) {
  ultimas[nome] = runs.find(
    (r) => r.workflowName === nome && r.headBranch === "main" && r.conclusion === "success",
  )
}
// O log do `gh` chega com as cores ora como ESC, ora como o par literal "^[".
const semCor = (s) => s.replace(/(?:\x1b|\^\[)\[[0-9;]*m/g, "")
const virgula = (n) => String(n).replace(".", ",")
const linhasJobs = []
const testes = []
for (const [nome, run] of Object.entries(ultimas)) {
  if (!run) continue
  const { jobs } = gh("run", "view", String(run.databaseId), "--json", "jobs")
  for (const j of jobs.sort((a, b) => a.name.localeCompare(b.name))) {
    linhasJobs.push([nome, j.name, j.conclusion, duracao(segundos(j.startedAt, j.completedAt))])
  }
  let log = ""
  try {
    log = semCor(rodar("gh", ["run", "view", String(run.databaseId), "--log"]))
  } catch {
    continue // log expirado: fica só o tempo por etapa
  }
  if (nome === "CI") {
    const arquivos = [...log.matchAll(/Test Files\s+(\d+) passed/g)].at(-1)
    const casos = [...log.matchAll(/\bTests\s+(\d+) passed/g)].at(-1)
    const cob = log.match(/All files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/)
    const e2eOk = [...log.matchAll(/^Playwright[^\n]*?\s(\d+) passed \(/gm)].reduce((s, m) => s + +m[1], 0)
    const e2ePulados = [...log.matchAll(/^Playwright[^\n]*?\s(\d+) skipped/gm)].reduce((s, m) => s + +m[1], 0)
    if (casos) testes.push(["Unidade e integração de rotas (Vitest)", `${casos[1]} em ${arquivos?.[1] ?? "?"} arquivos`, "todos passando"])
    if (cob) testes.push(["Cobertura", `${virgula(cob[4])}% das linhas`, `instruções ${virgula(cob[1])}% · desvios ${virgula(cob[2])}% · funções ${virgula(cob[3])}%`])
    if (e2eOk) testes.push(["Ponta a ponta (Playwright, 4 partes)", `${e2eOk} passando`, `${e2ePulados} pulados`])
  } else {
    const casos = [...log.matchAll(/\bTests\s+(\d+) passed/g)].at(-1)
    const migs = (log.match(/Applying migration /g) ?? []).length
    if (migs) testes.push(["Migrations aplicadas do zero", String(migs), "sem erro"])
    if (casos) testes.push(["Isolamento por RLS e integração com banco real", casos[1], "todos passando"])
  }
}

/* 2b. Disponibilidade -------------------------------------------------------- */
// Cada execução agendada do monitor é uma amostra: sucesso no ar, falha fora do
// ar. Execução cancelada (substituída pela seguinte) não conta. A janela é de
// 30 dias, a da meta do RNF04.1.
let disponibilidade
{
  const janela = new Date(Date.now() - 30 * 86400_000).toISOString()
  let amostras = []
  try {
    amostras = gh("run", "list", "--workflow", "disponibilidade.yml", "--limit", "9000", "--json", CAMPOS)
      .filter((r) => r.event === "schedule" && r.createdAt >= janela && ["success", "failure"].includes(r.conclusion))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  } catch {
    // workflow ainda não existe na main
  }
  if (!amostras.length) {
    disponibilidade = "_O monitor ainda não tem execuções agendadas registradas._"
  } else {
    const no = amostras.filter((r) => r.conclusion === "success").length
    const quedas = []
    let atual = null
    for (const r of amostras) {
      if (r.conclusion === "failure") atual ??= { inicio: r.createdAt, fim: r.createdAt, n: 0 }
      if (r.conclusion === "failure") Object.assign(atual, { fim: r.createdAt, n: atual.n + 1 })
      else if (atual) quedas.push(atual), (atual = null)
    }
    if (atual) quedas.push(atual)
    const data = (iso) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    const horas = (segundos(amostras[0].createdAt, amostras.at(-1).createdAt) / 3600).toFixed(0)
    const intervalos = amostras.slice(1).map((r, i) => segundos(amostras[i].createdAt, r.createdAt) / 60).sort((a, b) => a - b)
    disponibilidade = [
      `${amostras.length} verificações em ${horas} h (de ${data(amostras[0].createdAt)} a ${data(amostras.at(-1).createdAt)}), uma a cada ${Math.round(quantil(intervalos, 0.5) ?? 5)} min na mediana.`,
      "",
      tabela(["Indicador", "Valor"], [
        ["Disponibilidade amostrada", pct(no, amostras.length)],
        ["Meta (RNF04.1)", "99,5% no mês"],
        ["Verificações fora do ar", String(amostras.length - no)],
        ["Quedas (falhas consecutivas)", String(quedas.length)],
      ]),
      ...(quedas.length
        ? ["", tabela(["Início", "Última falha", "Verificações"], quedas.map((q) => [data(q.inicio), data(q.fim), q.n]))]
        : []),
    ].join("\n")
  }
}

/* 3. Pull requests --------------------------------------------------------- */
const prs = gh(
  "pr", "list", "--state", "all", "--limit", "1000",
  "--json", "number,state,author,createdAt,mergedAt,reviews,additions,deletions",
).filter((p) => p.createdAt.slice(0, 10) >= DESDE)
const integrados = prs.filter((p) => p.state === "MERGED")
const esperas = integrados.map((p) => segundos(p.createdAt, p.mergedAt) / 3600).sort((a, b) => a - b)
const horas = (h) => (h === null ? "—" : h < 48 ? `${h.toFixed(1).replace(".", ",")} h` : `${(h / 24).toFixed(1).replace(".", ",")} dias`)
const linhasPrAutor = contar(prs, (p) => p.author?.login ?? "?").map(([autor, n]) => [
  autor, n, prs.filter((p) => p.author?.login === autor && p.state === "MERGED").length,
])

/* 4. Commits na main ------------------------------------------------------- */
const assuntos = git("log", BRANCH, "--no-merges", `--since=${DESDE}`, "--format=%an\t%s").split("\n").filter(Boolean)
const commits = assuntos.map((l) => {
  const [autor, assunto] = l.split("\t")
  return {
    autor,
    tipo: assunto.match(/^([a-z]+)[(:!]/)?.[1] ?? "sem tipo",
    requisito: assunto.match(/^[a-z]+\((RN?F\d+)/)?.[1] ?? null,
  }
})
const merges = git("log", BRANCH, "--merges", `--since=${DESDE}`, "--format=%h").split("\n").filter(Boolean).length
const planos = fs.readdirSync("docs/plans").filter((f) => /^S\d+-/.test(f)).length

/* 5. Relatório ------------------------------------------------------------- */
const sha = git("rev-parse", "--short", BRANCH)
const md = `# Métricas de CI/CD e de processo — ${HOJE.split("-").reverse().join("/")}

Gerado por \`npm run pfc:metricas\`, a partir do git e da API do GitHub. Período: de
${DESDE.split("-").reverse().join("/")} até hoje. \`main\` em \`${sha}\`.

## Execuções da esteira

${runs.length} execuções concluídas no período. A taxa de sucesso desconsidera as canceladas,
que são execuções substituídas por um push mais novo na mesma branch.

${tabela(["Workflow", "Execuções", "Sucesso", "Falha", "Cancelada", "Taxa de sucesso", "Mediana", "P90"], linhasWorkflow)}

## Última execução bem-sucedida na \`main\`

${tabela(["Workflow", "Etapa", "Resultado", "Duração"], linhasJobs)}

${testes.length ? tabela(["Verificação", "Quantidade", "Resultado"], testes) : "_Log da execução indisponível._"}

## Disponibilidade em produção

${disponibilidade}

## Pull requests

${prs.length} abertos no período: ${integrados.length} integrados, ${prs.filter((p) => p.state === "CLOSED").length} fechados sem integração e ${prs.filter((p) => p.state === "OPEN").length} em aberto.
Tempo entre abrir e integrar: mediana de ${horas(quantil(esperas, 0.5))}, P90 de ${horas(quantil(esperas, 0.9))}.
${prs.filter((p) => p.reviews.length > 0).length} dos ${prs.length} têm revisão registrada no GitHub.

${tabela(["Autor", "Abertos", "Integrados"], linhasPrAutor)}

## Commits na \`main\`

${commits.length} commits (sem contar os ${merges} merges) e ${planos} planos de atividade em \`docs/plans/\`.

${tabela(["Autor", "Commits"], contar(commits, (c) => c.autor))}

${tabela(["Tipo (Conventional Commits)", "Commits"], contar(commits, (c) => c.tipo))}

${tabela(["Requisito no escopo", "Commits"], contar(commits.filter((c) => c.requisito), (c) => c.requisito))}
`

const destino = path.join(RAIZ_PFC, "evidencias", HOJE)
fs.mkdirSync(destino, { recursive: true })
fs.writeFileSync(path.join(destino, "metricas.md"), md)
console.log(md)
console.log(`\nGravado em ${path.join(destino, "metricas.md")}`)
