#!/usr/bin/env node
/**
 * Renderiza os diagramas PlantUML do documento.
 *
 * A fonte de cada figura é um `.puml` em `docs/pfc/diagramas/`; o PNG ao lado é
 * gerado e versionado junto, porque é ele que o `pfc:build` embute no DOCX.
 *
 * Roda pela imagem Docker oficial do PlantUML: ninguém precisa instalar Java e
 * Graphviz, e a fonte do diagrama não sai da máquina (o servidor público do
 * plantuml.com receberia o texto de todas as figuras).
 *
 * Uso: npm run pfc:diagramas            (todos)
 *      npm run pfc:diagramas -- 20-     (só os que começam com "20-")
 */
import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { RAIZ_PFC } from "./secoes.mjs"

const PASTA = path.resolve(RAIZ_PFC, "diagramas")
const filtro = process.argv[2] ?? ""
const fontes = fs
  .readdirSync(PASTA)
  // "_tema.puml" é incluído pelos demais e não gera figura.
  .filter((f) => f.endsWith(".puml") && !f.startsWith("_") && f.startsWith(filtro))
  .sort()

if (!fontes.length) {
  console.error(`Nenhum .puml em ${PASTA}${filtro ? ` começando com "${filtro}"` : ""}.`)
  process.exit(1)
}

try {
  execFileSync(
    "docker",
    [
      "run", "--rm", "-v", `${PASTA}:/data`, "plantuml/plantuml",
      "-tpng", "-charset", "UTF-8", "-Sdpi=160", "-failfast2",
      ...fontes.map((f) => `/data/${f}`),
    ],
    { stdio: "inherit" },
  )
} catch {
  console.error("\nFalha ao renderizar. O Docker está rodando? A mensagem acima aponta o arquivo e a linha.")
  process.exit(1)
}

// O PlantUML devolve código 0 mesmo quando desenha a imagem de erro de sintaxe;
// conferir que cada fonte gerou o seu PNG pega o caso de nome trocado em @startuml.
const faltando = fontes.filter((f) => !fs.existsSync(path.join(PASTA, f.replace(/\.puml$/, ".png"))))
if (faltando.length) {
  console.error(`Sem PNG para: ${faltando.join(", ")} — confira o nome em @startuml.`)
  process.exit(1)
}
console.log(`${fontes.length} diagramas renderizados em ${path.relative(".", PASTA)}`)
