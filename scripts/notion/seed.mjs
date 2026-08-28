#!/usr/bin/env node
/**
 * Cria as quatro databases do quadro. Roda uma vez, no começo do semestre.
 *
 * Guarde os IDs impressos no fim em .env.local e nos secrets do repositório.
 */
import { notion, exigirToken, titulo } from "./api.mjs"

exigirToken("a criação do quadro")

const pai = process.env.NOTION_PARENT_PAGE_ID
if (!pai) {
  console.error("Falta NOTION_PARENT_PAGE_ID: o id da página onde as databases serão criadas.")
  console.error("Abra a página no Notion, copie o id da URL e compartilhe a página com a integração.")
  process.exit(1)
}

const PESSOAS = ["Fernando", "Audrey", "Micael", "Abner"]

// A ordem dos estados é a do fluxo real, derivada do git — ver scripts/notion/sync.mjs
const ESTADOS = [
  { name: "Backlog", color: "default" },
  { name: "Em desenvolvimento", color: "blue" },
  { name: "Em revisão", color: "yellow" },
  { name: "Ajustes solicitados", color: "orange" },
  { name: "Validação", color: "purple" },
  { name: "Concluído", color: "green" },
]

const SEMANAS = Array.from({ length: 14 }, (_, i) => ({ name: `S${String(i + 1).padStart(2, "0")}` }))

const databases = {
  NOTION_DB_ATIVIDADES: {
    nome: "Atividades",
    propriedades: {
      Título: { title: {} },
      ID: { rich_text: {} },
      Trilha: { select: { options: ["T0", "T1", "T2", "T3", "T4", "T5"].map((name) => ({ name })) } },
      Responsável: { select: { options: PESSOAS.map((name) => ({ name })) } },
      Revisor: { select: { options: PESSOAS.map((name) => ({ name })) } },
      Status: { select: { options: ESTADOS } },
      Semana: { select: { options: SEMANAS } },
      Tipo: { multi_select: {} },
      Requisitos: { multi_select: {} },
      "Seções do doc": { multi_select: {} },
      // Os dois campos que fazem o processo funcionar: o autor declara o que vai
      // testar antes de codar, e o revisor confere o que validar item a item.
      "O que testar": { rich_text: {} },
      "O que validar": { rich_text: {} },
      Evidência: { rich_text: {} },
      Branch: { rich_text: {} },
      PR: { url: {} },
      Plano: { rich_text: {} },
    },
  },

  NOTION_DB_REQUISITOS: {
    nome: "Requisitos",
    propriedades: {
      Título: { title: {} },
      ID: { rich_text: {} },
      Tipo: { select: { options: [{ name: "RF" }, { name: "RNF" }, { name: "RNE" }] } },
      Status: {
        select: {
          options: [
            { name: "Não iniciado", color: "default" },
            { name: "Parcial", color: "yellow" },
            { name: "Implementado", color: "green" },
          ],
        },
      },
      Prioridade: { select: { options: [{ name: "Alta", color: "red" }, { name: "Média" }, { name: "Baixa" }] } },
      Domínio: { select: { options: PESSOAS.map((name) => ({ name })) } },
    },
  },

  NOTION_DB_CRONOGRAMA: {
    nome: "Cronograma",
    propriedades: {
      Semana: { title: {} },
      // date, e uma só coluna de data. A visualização calendário do Notion só
      // posiciona linha em propriedade de data — com texto ("26/08 a 01/09") ela
      // não tem onde colocar nada, por melhor formatada que a string esteja.
      // Preenchida por `node scripts/notion/cronograma.mjs`, com início e fim,
      // para cada semana virar uma barra em vez de um ponto.
      Data: { date: {} },
      Objetivo: { rich_text: {} },
      Entregáveis: { rich_text: {} },
      Responsáveis: { multi_select: { options: PESSOAS.map((name) => ({ name })) } },
      Riscos: { rich_text: {} },
    },
  },

  NOTION_DB_DECISOES: {
    nome: "Decisões",
    propriedades: {
      Decisão: { title: {} },
      Data: { date: {} },
      Contexto: { rich_text: {} },
      Alternativas: { rich_text: {} },
      Consequências: { rich_text: {} },
      Seções: { multi_select: {} },
    },
  },
}

const ids = {}
for (const [chave, { nome, propriedades }] of Object.entries(databases)) {
  const criada = await notion("/databases", {
    body: {
      parent: { type: "page_id", page_id: pai },
      title: titulo(nome).title,
      properties: propriedades,
    },
  })
  ids[chave] = criada.id
  console.log(`Criada: ${nome.padEnd(12)} ${criada.id}`)
}

console.log("\nGuarde em .env.local e nos secrets do repositório:\n")
for (const [k, v] of Object.entries(ids)) console.log(`${k}=${v}`)
console.log("\nDepois crie as views do quadro: por pessoa, por semana,")
console.log('fila de revisão do Fernando (Status = "Em revisão", mais antigo primeiro) e bloqueados.')
