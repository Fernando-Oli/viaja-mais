#!/usr/bin/env node
/**
 * Espelha os planos de docs/plans/ no quadro do Notion.
 *
 * O status **não** é escrito à mão: ele é derivado do git e do estado do PR.
 * Card em lugar errado se conserta no repositório, nunca arrastando no quadro —
 * é o que garante que o quadro não minta.
 *
 *   uso: node scripts/notion/sync.mjs --all
 *        node scripts/notion/sync.mjs --plan docs/plans/RF03-editar-viagem.md
 *        node scripts/notion/sync.mjs --pr 42        (chamado pelo CI)
 */
import { notion, exigirToken, listarPlanos, lerPlano, bloco, texto, titulo, selecao, multi, url } from "./api.mjs"

exigirToken("a sincronização")

const db = process.env.NOTION_DB_ATIVIDADES
if (!db) {
  console.log("Notion: NOTION_DB_ATIVIDADES não definido — rode `npm run notion:seed` primeiro.")
  process.exit(0)
}

const argv = process.argv.slice(2)
const arg = (nome) => {
  const i = argv.indexOf(nome)
  return i >= 0 ? argv[i + 1] : undefined
}

const NOMES = { fernando: "Fernando", audrey: "Audrey", micael: "Micael", abner: "Abner" }
const capitalizar = (v) => NOMES[String(v ?? "").toLowerCase()] ?? v

/**
 * Estado derivado, na ordem em que o fluxo acontece. O estado do PR vence o do
 * frontmatter: o git é o que de fato aconteceu.
 */
function estadoDerivado(meta) {
  const { PR_ESTADO, PR_MERGED, REVIEW_ESTADO } = process.env
  if (PR_MERGED === "true") return "Concluído"
  if (REVIEW_ESTADO === "changes_requested") return "Ajustes solicitados"
  if (REVIEW_ESTADO === "approved") return "Validação"
  if (PR_ESTADO === "open") return "Em revisão"

  return (
    {
      backlog: "Backlog",
      "em-desenvolvimento": "Em desenvolvimento",
      "em-revisao": "Em revisão",
      ajustes: "Ajustes solicitados",
      validacao: "Validação",
      concluido: "Concluído",
    }[String(meta.status ?? "backlog")] ?? "Backlog"
  )
}

async function buscarCard(id) {
  const r = await notion(`/databases/${db}/query`, {
    body: { filter: { property: "ID", rich_text: { equals: id } }, page_size: 1 },
  })
  return r.results?.[0]?.id
}

async function espelhar(plano) {
  const { meta, corpo, arquivo } = plano
  const props = {
    Título: titulo(meta.titulo ?? meta.id),
    ID: texto(meta.id),
    Trilha: selecao(meta.trilha),
    Responsável: selecao(capitalizar(meta.responsavel)),
    Revisor: selecao(capitalizar(meta.revisor ?? "fernando")),
    Status: selecao(estadoDerivado(meta)),
    Semana: selecao(meta.semana),
    Tipo: multi(meta.tipo),
    Requisitos: multi(meta.requisitos),
    "Seções do doc": multi(meta.secoes_doc),
    "O que testar": texto(bloco(corpo, 4)),
    "O que validar": texto(bloco(corpo, 5)),
    Evidência: texto(bloco(corpo, 6)),
    Branch: texto(meta.branch),
    PR: url(process.env.PR_URL),
    Plano: texto(arquivo),
  }

  const existente = await buscarCard(meta.id)
  if (existente) {
    await notion(`/pages/${existente}`, { method: "PATCH", body: { properties: props } })
    console.log(`atualizado  ${meta.id}  -> ${props.Status.select.name}`)
  } else {
    await notion("/pages", { body: { parent: { database_id: db }, properties: props } })
    console.log(`criado      ${meta.id}  -> ${props.Status.select.name}`)
  }
}

let planos
if (arg("--plan")) {
  const p = lerPlano(arg("--plan"))
  if (!p) {
    console.error(`Plano sem frontmatter válido: ${arg("--plan")}`)
    process.exit(1)
  }
  planos = [p]
} else if (process.env.PR_BRANCH) {
  // Chamado pelo CI: sincroniza só o plano cuja branch é a do PR.
  planos = listarPlanos().filter((p) => p.meta.branch === process.env.PR_BRANCH)
  if (!planos.length) {
    console.log(`Nenhum plano com branch "${process.env.PR_BRANCH}" — nada a espelhar.`)
    process.exit(0)
  }
} else {
  planos = listarPlanos()
}

for (const p of planos) {
  try {
    await espelhar(p)
  } catch (erro) {
    // Uma atividade com problema não pode derrubar a sincronização das outras.
    console.error(`falhou      ${p.meta.id}: ${erro.message}`)
  }
}
console.log(`\n${planos.length} atividade(s) processada(s).`)
