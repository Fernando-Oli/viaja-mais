#!/usr/bin/env node
/**
 * Monta o documento único a partir das seções e gera o DOCX.
 *
 * O PDF é exportado manualmente a partir do DOCX — decisão da equipe, para
 * conferir capa e paginação antes de subir no AVA, onde não há reenvio.
 */
import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { SECOES, RAIZ_PFC } from "./secoes.mjs"

const DESTINO = path.join(RAIZ_PFC, "build")
const VERSAO = process.env.PFC_VERSAO ?? "2.0"
const BASE = `Documento-Especificacao-ViajaMais-v${VERSAO}`

fs.mkdirSync(DESTINO, { recursive: true })

const partes = [
  `---
title: "Documento de Especificação do Projeto Integrador"
subtitle: "ViajaMais — 7º Período"
author: "Fernando Luis Rodrigues de Oliveira · Audrey Pereira Lacerda · Micael Martins · Abner de Oliveira Cosmo"
date: "${new Date().toLocaleDateString("pt-BR")}"
lang: pt-BR
toc: true
toc-depth: 2
---
`,
]

const faltando = []
for (const s of SECOES) {
  const caminho = path.join(RAIZ_PFC, s.arquivo)
  if (!fs.existsSync(caminho)) {
    if (s.obrigatoria) faltando.push(`${s.n} ${s.titulo}`)
    continue
  }
  partes.push(`\n\newpage\n\n${fs.readFileSync(caminho, "utf8").trim()}\n`)
}

const md = path.join(DESTINO, `${BASE}.md`)
fs.writeFileSync(md, partes.join("\n"))
console.log(`Markdown único: ${md}`)

if (faltando.length) {
  console.log(`\nAtenção: ${faltando.length} seções obrigatórias ficaram de fora:`)
  for (const f of faltando) console.log(`  - ${f}`)
  console.log("Rode `npm run pfc:check` para o diagnóstico completo.")
}

// pandoc é opcional: sem ele fica o markdown único, que já dá para converter
// à mão. Travar o build por falta de uma ferramenta externa seria pior.
const referencia = path.join(RAIZ_PFC, "_template", "reference.docx")
const args = [md, "-o", path.join(DESTINO, `${BASE}.docx`), "--from", "gfm", "--toc"]
if (fs.existsSync(referencia)) args.push(`--reference-doc=${referencia}`)

try {
  execFileSync("pandoc", args, { stdio: "inherit" })
  console.log(`\nDOCX: ${path.join(DESTINO, `${BASE}.docx`)}`)
  console.log("Abra, confira capa e paginação, e exporte o PDF para o AVA.")
} catch {
  console.log("\npandoc não encontrado — só o markdown único foi gerado.")
  console.log("Instale em https://pandoc.org/installing.html para gerar o DOCX.")
}
