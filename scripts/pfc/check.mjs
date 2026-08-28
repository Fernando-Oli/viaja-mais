#!/usr/bin/env node
/**
 * Checklist de entrega do Documento de Especificação.
 *
 * Existe porque a entrega é única, em PDF, pelo AVA, e **não há reenvio depois
 * do prazo**. Erro descoberto depois do upload não tem conserto — então ele
 * precisa ser descoberto aqui.
 */
import fs from "node:fs"
import path from "node:path"
import { SECOES, TEXTO_ORIENTADOR, RAIZ_PFC } from "./secoes.mjs"

const erros = []
const avisos = []

const ler = (rel) => {
  const p = path.join(RAIZ_PFC, rel)
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null
}

// Um arquivo com só um título e nada abaixo conta como vazio.
// O split é por /\r?\n/ e não por "\n": os arquivos podem chegar com CRLF, e
// em JavaScript o "." não casa \r — regex terminada em (.+)$ falha em silêncio.
const temConteudo = (txt) =>
  txt
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith("#") && !l.trim().startsWith(">"))
    .join("").length > 80

console.log("Checklist do Documento de Especificação — 7º período, Fase 02\n")

/* 1. Seções obrigatórias presentes e preenchidas ------------------------- */
let preenchidas = 0
for (const s of SECOES) {
  const txt = ler(s.arquivo)
  const rotulo = `${s.n.padStart(2)} ${s.titulo}`

  if (txt === null) {
    ;(s.obrigatoria ? erros : avisos).push(`${rotulo} — arquivo não existe (${s.arquivo})`)
    continue
  }
  if (!temConteudo(txt)) {
    ;(s.obrigatoria ? erros : avisos).push(`${rotulo} — arquivo praticamente vazio`)
    continue
  }
  preenchidas++

  /* 2. Texto orientador remanescente ------------------------------------- */
  for (const frag of TEXTO_ORIENTADOR) {
    if (txt.includes(frag)) {
      erros.push(`${rotulo} — texto orientador do template não removido: "${frag}"`)
    }
  }

  /* 3. Marcadores de pendência ------------------------------------------- */
  const pendentes = [...txt.matchAll(/^>?\s*\[!\]\s*PENDENTE:?\s*(.+)$/gim)]
  for (const p of pendentes) {
    avisos.push(`${rotulo} — pendência: ${p[1].trim().slice(0, 90)}`)
  }
  if (/\bTODO\b|\bTBD\b|\bXXX\b|lorem ipsum/i.test(txt)) {
    erros.push(`${rotulo} — contém marcador de rascunho (TODO/TBD/XXX/lorem ipsum)`)
  }
}

/* 4. Links da seção 4 precisam ser públicos e absolutos ------------------ */
const artefatos = ler("01-identificacao/4-repositorios.md")
if (artefatos) {
  const links = [...artefatos.matchAll(/https?:\/\/[^\s)|]+/g)].map((m) => m[0])
  if (links.length === 0) {
    erros.push(" 4 Repositórios e Artefatos — nenhum link informado")
  }
  for (const l of links) {
    if (l.includes("localhost") || l.includes("127.0.0.1")) {
      erros.push(` 4 Repositórios e Artefatos — link não é público: ${l}`)
    }
  }
}

/* 5. Parte 00 atualizada nesta entrega ----------------------------------- */
const historico = ler("00-historico-versao.md")
if (historico && !/\b7º?\b/.test(historico)) {
  erros.push("00 Histórico de Versão — não há linha registrando a entrega do 7º período")
}

/* Relatório -------------------------------------------------------------- */
const obrigatorias = SECOES.filter((s) => s.obrigatoria).length
console.log(`Seções preenchidas: ${preenchidas}/${SECOES.length} (obrigatórias: ${obrigatorias})\n`)

if (avisos.length) {
  console.log(`Avisos (${avisos.length}) — não bloqueiam, mas revise:`)
  for (const a of avisos) console.log(`  ~ ${a}`)
  console.log()
}

if (erros.length) {
  console.log(`Bloqueios (${erros.length}):`)
  for (const e of erros) console.log(`  x ${e}`)
  console.log("\nO documento NÃO está pronto para entrega.")
  process.exit(1)
}

console.log("Nenhum bloqueio. Revise os avisos e rode `npm run pfc:build`.")
