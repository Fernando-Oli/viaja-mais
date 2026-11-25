import { z } from "zod"
import { CATEGORIAS_ITINERARIO } from "@/lib/schemas/itinerario"
import { roteiroInvalido } from "@/lib/ai/erros"

/**
 * O roteiro que sai da IA, e a guarda entre o modelo e a tela.
 *
 * A saída de um modelo é entrada hostil como qualquer outra: pode vir com mais
 * dias do que o pedido, horário "de manhã", categoria inventada, título de mil
 * caracteres ou nem ser um objeto. `normalizarRoteiro` aproveita o que dá e
 * descarta o resto; `roteiroSchema` é a garantia final do formato. Só o que
 * passa nos dois chega à tela — e a tela só grava depois que a pessoa revisa
 * (RF12.2), pelas rotas de itinerário, que validam tudo de novo.
 *
 * Os limites de texto são os de `lib/schemas/itinerario.ts`: um item gerado
 * tem de caber num item de itinerário sem corte surpresa na hora de gravar.
 *
 * @RF12.1 gerar roteiro por IA
 */

export const LIMITES_DO_ROTEIRO = {
  tituloDoDia: 80,
  tituloDoItem: 120,
  descricao: 300,
  local: 200,
  itensPorDia: 8,
} as const

export type CategoriaItinerario = (typeof CATEGORIAS_ITINERARIO)[number]

const horario = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)

export const itemDoRoteiroSchema = z
  .object({
    horario,
    titulo: z.string().min(1).max(LIMITES_DO_ROTEIRO.tituloDoItem),
    descricao: z.string().max(LIMITES_DO_ROTEIRO.descricao).nullable(),
    local: z.string().max(LIMITES_DO_ROTEIRO.local).nullable(),
    categoria: z.enum(CATEGORIAS_ITINERARIO),
  })
  .strict()

export const diaDoRoteiroSchema = z
  .object({
    titulo: z.string().min(1).max(LIMITES_DO_ROTEIRO.tituloDoDia),
    // Pode ficar vazio: um dia sem atividade continua no lugar, porque a posição é a data.
    itens: z.array(itemDoRoteiroSchema).max(LIMITES_DO_ROTEIRO.itensPorDia),
  })
  .strict()

export const roteiroSchema = z
  .object({
    dias: z
      .array(diaDoRoteiroSchema)
      .min(1)
      .refine((dias) => dias.some((d) => d.itens.length > 0), "roteiro sem nenhuma atividade"),
  })
  .strict()

export type ItemDoRoteiro = z.infer<typeof itemDoRoteiroSchema>
export type DiaDoRoteiro = z.infer<typeof diaDoRoteiroSchema>
export type Roteiro = z.infer<typeof roteiroSchema>

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)

/** Texto do modelo: espaços colapsados, cortado por caractere (não por byte) no limite. */
function texto(v: unknown, limite: number): string | null {
  if (typeof v !== "string") return null
  const limpo = v.replace(/\s+/g, " ").trim()
  if (!limpo) return null
  return Array.from(limpo).slice(0, limite).join("").trim()
}

/** Aceita "9:30", "09:30" e "09:30:00"; devolve sempre HH:MM, ou null. */
function normalizarHorario(v: unknown): string | null {
  if (typeof v !== "string") return null
  const m = /^\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*$/.exec(v)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return `${String(h).padStart(2, "0")}:${m[2]}`
}

function normalizarCategoria(v: unknown): CategoriaItinerario {
  return typeof v === "string" && (CATEGORIAS_ITINERARIO as readonly string[]).includes(v)
    ? (v as CategoriaItinerario)
    : "activity"
}

function normalizarItem(bruto: unknown): ItemDoRoteiro | null {
  if (!ehObjeto(bruto)) return null
  const titulo = texto(bruto.titulo, LIMITES_DO_ROTEIRO.tituloDoItem)
  const hora = normalizarHorario(bruto.horario)
  if (!titulo || !hora) return null
  return {
    horario: hora,
    titulo,
    descricao: texto(bruto.descricao, LIMITES_DO_ROTEIRO.descricao),
    local: texto(bruto.local, LIMITES_DO_ROTEIRO.local),
    categoria: normalizarCategoria(bruto.categoria),
  }
}

/**
 * Transforma a resposta crua do modelo num `Roteiro` válido, ou lança 502.
 *
 * Regras, nesta ordem:
 * - só os primeiros `diasPedidos` dias contam (o modelo às vezes "dá um bônus");
 * - item sem título ou com horário que não é HH:MM é descartado;
 * - categoria fora da lista do itinerário vira `activity`;
 * - itens ordenados por horário, no máximo 8 por dia (os primeiros do dia);
 * - dia sem nenhum item aproveitável **fica no lugar, vazio** — a posição do dia
 *   é a data dele na viagem; descartá-lo empurrava os seguintes uma data para
 *   trás (achado da revisão de 20/11) — e dia sem título ganha "Dia N";
 * - se não sobrar nenhuma atividade em nenhum dia, a resposta inteira é inválida.
 *
 * Pura: sem I/O, mesma entrada, mesma saída.
 */
export function normalizarRoteiro(bruto: unknown, diasPedidos: number): Roteiro {
  if (!ehObjeto(bruto) || !Array.isArray(bruto.dias)) throw roteiroInvalido()

  const dias: DiaDoRoteiro[] = []
  bruto.dias.slice(0, Math.max(0, diasPedidos)).forEach((dia, i) => {
    const objeto: Record<string, unknown> = ehObjeto(dia) ? dia : {}
    const itens = (Array.isArray(objeto.itens) ? objeto.itens : [])
      .map(normalizarItem)
      .filter((item): item is ItemDoRoteiro => item !== null)
      // `sort` é estável: dois itens no mesmo horário mantêm a ordem do modelo.
      .sort((a, b) => a.horario.localeCompare(b.horario))
      .slice(0, LIMITES_DO_ROTEIRO.itensPorDia)
    dias.push({ titulo: texto(objeto.titulo, LIMITES_DO_ROTEIRO.tituloDoDia) ?? `Dia ${i + 1}`, itens })
  })

  const analise = roteiroSchema.safeParse({ dias })
  if (!analise.success) throw roteiroInvalido()
  return analise.data
}
