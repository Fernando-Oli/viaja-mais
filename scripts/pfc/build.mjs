#!/usr/bin/env node
/**
 * Monta o documento único a partir das seções e gera DOCX e PDF.
 *
 * Caminho: seções em Markdown → um Markdown único (capa, títulos de PARTE,
 * figuras dimensionadas) → DOCX pelo pandoc, com a formatação de
 * `_template/reference.docx` → PDF pelo LibreOffice.
 *
 * O PDF gerado é para conferência. A versão que sobe no AVA deve ser aberta e
 * revisada página a página antes: lá não há reenvio.
 *
 * Uso: npm run pfc:build              (versão lida da Parte 00)
 *      PFC_VERSAO=4.0 npm run pfc:build
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { SECOES, RAIZ_PFC } from "./secoes.mjs"

const DESTINO = path.join(RAIZ_PFC, "build")
fs.mkdirSync(DESTINO, { recursive: true })

/* Capa ------------------------------------------------------------------- */
const CAPA = {
  projeto: "Viaja Mais",
  periodo: "7º Período - Fase 02",
  trilha: "Trilha: planejamento e gestão de viagens",
  equipe: [
    "Fernando Luis Rodrigues de Oliveira 2321056",
    "Audrey Pereira Lacerda 2320113",
    "Micael Cruz Batista Martins 2320740",
    "Abner de Oliveira Cosmo 2320046",
  ],
  local: "Anápolis - GO",
  ano: "2026",
}

/** Título de PARTE que antecede a seção de número `n`. */
const PARTES = {
  "00": "PARTE 00 - HISTÓRICO DE VERSÃO DO PROJETO",
  1: "PARTE 01 - IDENTIFICAÇÃO DO PRODUTO, EQUIPE E REPOSITÓRIO",
  5: "PARTE 02 - PLANEJAMENTO DO SEMESTRE",
  8: "PARTE 03 - ENTENDIMENTO DO PÚBLICO, DO NEGÓCIO E LEVANTAMENTO DE REQUISITOS",
  16: "PARTE 04 - DESIGN, MODELAGEM, DADOS E SOLUÇÃO TECNOLÓGICA",
  20: "PARTE 05 - ARQUITETURA, TECNOLOGIA E IMPLEMENTAÇÃO DO SISTEMA",
  24: "PARTE 06 - QUALIDADE, SEGURANÇA, AVALIAÇÃO E EXTENSÕES DO PROJETO",
}

const estilo = (nome, texto) => `::: {custom-style="${nome}"}\n${texto}\n:::\n`
const vazio = (n) => Array(n).fill(estilo("Capa Texto", "&nbsp;")).join("\n")

const capa = [
  vazio(3),
  estilo("Capa", "UNIVERSIDADE EVANGÉLICA DE GOIÁS - UniEVANGÉLICA"),
  estilo("Capa", "BACHARELADO EM ENGENHARIA DE SOFTWARE"),
  estilo("Capa Documento", "Documento de Especificação do Projeto Integrador"),
  estilo("Capa Projeto", CAPA.projeto),
  estilo("Capa Texto", CAPA.periodo),
  estilo("Capa Texto", CAPA.trilha),
  vazio(2),
  ...CAPA.equipe.map((p) => estilo("Capa Texto", p)),
  vazio(2),
  estilo("Capa Texto", CAPA.local),
  estilo("Capa Texto", CAPA.ano),
].join("\n")

/* Figuras ---------------------------------------------------------------- */
// Área útil da página do template: 15,75 cm de largura. A altura é limitada
// para a figura não ser empurrada sozinha para a página seguinte.
const LARGURA_MAX = 15.5
const ALTURA_MAX = 18.5
const DPI = 160 // o mesmo de scripts/pfc/diagramas.mjs

const dimensoesPng = (arquivo) => {
  const b = fs.readFileSync(arquivo)
  return { largura: b.readUInt32BE(16), altura: b.readUInt32BE(20) }
}

const figurasAusentes = []
const ajustarFiguras = (md, pastaDaSecao) =>
  md.replace(/!\[([^\]]*)\]\(([^)\s]+)\)(\{[^}]*\})?/g, (tudo, legenda, alvo) => {
    if (/^https?:/.test(alvo)) return tudo
    const arquivo = path.resolve(pastaDaSecao, alvo)
    if (!fs.existsSync(arquivo)) {
      figurasAusentes.push(path.relative(RAIZ_PFC, arquivo))
      return `**[figura ausente: ${alvo}]**`
    }
    let atributo = ""
    if (arquivo.toLowerCase().endsWith(".png")) {
      const { largura, altura } = dimensoesPng(arquivo)
      let cm = Math.min((largura / DPI) * 2.54, LARGURA_MAX)
      const alturaCm = (cm * altura) / largura
      if (alturaCm > ALTURA_MAX) cm *= ALTURA_MAX / alturaCm
      atributo = `{width=${cm.toFixed(2)}cm}`
    }
    return `![${legenda}](${arquivo.replaceAll("\\", "/")})${atributo}`
  })

/* Montagem --------------------------------------------------------------- */
const partes = [capa]
const faltando = []

for (const s of SECOES) {
  const caminho = path.join(RAIZ_PFC, s.arquivo)
  if (!fs.existsSync(caminho)) {
    if (s.obrigatoria) faltando.push(`${s.n} ${s.titulo}`)
    continue
  }
  let md = fs.readFileSync(caminho, "utf8").trim()
  if (PARTES[s.n]) {
    // O título de PARTE é "#" e abre página nova pelo estilo do molde. A
    // Parte 00 não tem seção numerada: o título do arquivo é a própria PARTE.
    if (s.n === "00") md = md.replace(/^#{1,2} .*\r?\n/, "")
    partes.push(`# ${PARTES[s.n]}\n`)
  }
  md = ajustarFiguras(md, path.dirname(caminho))
  partes.push(md + "\n")
}

const versao =
  process.env.PFC_VERSAO ??
  [...fs.readFileSync(path.join(RAIZ_PFC, "00-historico-versao.md"), "utf8").matchAll(/^\|\s*(\d+\.\d+)\s*\|/gm)].at(-1)?.[1] ??
  "0.0"
const BASE = `Documento-Especificacao-ViajaMais-7P-Fase02-v${versao}`
const md = path.join(DESTINO, `${BASE}.md`)
const docx = path.join(DESTINO, `${BASE}.docx`)
fs.writeFileSync(md, partes.join("\n"))
console.log(`Markdown único: ${md}`)

if (faltando.length) {
  console.log(`\nAtenção: ${faltando.length} seções obrigatórias ficaram de fora:`)
  for (const f of faltando) console.log(`  - ${f}`)
}
if (figurasAusentes.length) {
  console.log(`\nAtenção: ${figurasAusentes.length} figuras não encontradas (rode \`npm run pfc:diagramas\`):`)
  for (const f of figurasAusentes) console.log(`  - ${f}`)
}

/* DOCX e PDF ------------------------------------------------------------- */
// Procura pelo caminho antes de tentar o PATH. Não se pergunta a versão ao
// LibreOffice: no Windows, `soffice --version` abre a interface e não retorna.
const achar = (nome, candidatos) => {
  const fixo = candidatos.find((c) => fs.existsSync(c))
  if (fixo) return fixo
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [nome], { stdio: "ignore" })
    return nome
  } catch {
    return null
  }
}
const pandoc = achar("pandoc", [
  path.join(os.homedir(), "AppData/Local/Pandoc/pandoc.exe"),
  "C:/Program Files/Pandoc/pandoc.exe",
])
const soffice = achar("soffice", ["C:/Program Files/LibreOffice/program/soffice.exe", "/usr/bin/soffice"])

// Sem pandoc fica o Markdown único, que já dá para converter à mão. Travar o
// build por falta de uma ferramenta externa seria pior.
if (!pandoc) {
  console.log("\npandoc não encontrado — só o Markdown único foi gerado.")
  console.log("Instale com `winget install JohnMacFarlane.Pandoc` ou em https://pandoc.org/installing.html")
  process.exit(0)
}

const referencia = path.join(RAIZ_PFC, "_template", "reference.docx")
const args = [
  md, "-o", docx,
  "--from", "gfm+attributes+fenced_divs+raw_attribute+implicit_figures",
  // Largura das colunas proporcional ao conteúdo; sem o filtro saem todas iguais.
  "--lua-filter", path.join(path.dirname(fileURLToPath(import.meta.url)), "tabelas.lua"),
  "--metadata", "lang=pt-BR",
]
if (fs.existsSync(referencia)) args.push(`--reference-doc=${referencia}`)
else console.log("Aviso: _template/reference.docx não existe; saindo com a formatação padrão do pandoc.")
execFileSync(pandoc, args, { stdio: "inherit" })
console.log(`DOCX: ${docx}`)

if (!soffice) {
  console.log("LibreOffice não encontrado — abra o DOCX e exporte o PDF à mão.")
  process.exit(0)
}
execFileSync(soffice, ["--headless", "--convert-to", "pdf", "--outdir", DESTINO, docx], { stdio: "ignore", timeout: 300_000 })
console.log(`PDF:  ${path.join(DESTINO, `${BASE}.pdf`)}`)
console.log("\nConfira capa, tabelas e figuras página a página antes de subir no AVA.")
