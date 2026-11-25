import type { CategoriaItinerario, DiaDoRoteiro } from "@/lib/ai/roteiro"

/**
 * Do roteiro revisado ao que vai para as rotas de viagem e de itinerário.
 *
 * Roda no navegador (a tela "Nova viagem com a Avori"), então só importa
 * **tipos** de `lib/ai/roteiro.ts` — aquele arquivo puxa `lib/http`, que puxa
 * `next/server`, e nada disso pode ir para o pacote do cliente.
 *
 * Os payloads seguem os contratos da Audrey (`criarViagemSchema` e
 * `criarItemItinerarioSchema`), que as rotas validam de novo: aqui não há
 * atalho para o banco, só a montagem do corpo das requisições.
 *
 * Datas são calculadas em UTC sobre "AAAA-MM-DD": somar dias em horário local
 * erra na virada do horário de verão.
 *
 * Puras: sem I/O, mesma entrada, mesma saída.
 *
 * @RF12.2 revisar e editar o roteiro antes de gravá-lo
 */

/** Mesmos limites de `lib/schemas/viagem.ts`. */
const LIMITE_TITULO_VIAGEM = 120
const LIMITE_DESTINO = 160

const DIAS_DA_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const

const HORARIO = /^([01]\d|2[0-3]):[0-5]\d$/
const DATA = /^(\d{4})-(\d{2})-(\d{2})$/

function paraUtc(iso: string): Date {
  const m = DATA.exec(iso)
  if (!m) throw new Error(`data inválida: ${iso}`)
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
}

function deUtc(data: Date): string {
  return data.toISOString().slice(0, 10)
}

const cortar = (texto: string, limite: number) => Array.from(texto.trim()).slice(0, limite).join("").trim()

/** "2026-12-31" + 1 → "2027-01-01". */
export function somarDias(iso: string, dias: number): string {
  const data = paraUtc(iso)
  data.setUTCDate(data.getUTCDate() + dias)
  return deUtc(data)
}

/** Hoje no fuso de quem está usando, para o `min` do campo de data. */
export function hojeLocal(agora: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`
}

/** "2026-12-12" → "sáb, 12/12". */
export function rotuloDoDia(iso: string): string {
  const data = paraUtc(iso)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${DIAS_DA_SEMANA[data.getUTCDay()]}, ${p(data.getUTCDate())}/${p(data.getUTCMonth() + 1)}`
}

/** Data de cada dia da viagem, a partir do início. */
export function datasDaViagem(inicio: string, dias: number): string[] {
  return Array.from({ length: Math.max(0, dias) }, (_, i) => somarDias(inicio, i))
}

export function tituloPadrao(destino: string): string {
  return cortar(`Viagem para ${destino.trim()}`, LIMITE_TITULO_VIAGEM)
}

/**
 * Só dá para criar quando há ao menos uma atividade, e toda atividade tem
 * título e horário HH:MM. A tela usa isso para habilitar "Criar viagem".
 */
export function roteiroPronto(dias: DiaDoRoteiro[]): boolean {
  const itens = dias.flatMap((d) => d.itens)
  return itens.length > 0 && itens.every((i) => i.titulo.trim().length > 0 && HORARIO.test(i.horario))
}

export type PedidoDeViagem = {
  titulo: string
  destino: string
  inicio: string
  dias: number
}

/** Corpo de `POST /api/trips`. Título em branco cai no padrão. */
export function corpoDaViagem({ titulo, destino, inicio, dias }: PedidoDeViagem) {
  return {
    title: cortar(titulo, LIMITE_TITULO_VIAGEM) || tituloPadrao(destino),
    destination: cortar(destino, LIMITE_DESTINO),
    start_date: inicio,
    end_date: somarDias(inicio, Math.max(1, dias) - 1),
    currency: "BRL",
    status: "planning" as const,
  }
}

export type CorpoDoItem = {
  title: string
  description: string | null
  date: string
  start_time: string
  location: string | null
  category: CategoriaItinerario
  status: "planned"
}

/**
 * Corpo de cada `POST /api/trips/[id]/itinerary`, na ordem do roteiro: o dia i
 * cai em `inicio + i`. Item com título em branco não vai (a tela já impede
 * criar assim; isto é a segunda linha).
 */
export function corposDosItens(dias: DiaDoRoteiro[], inicio: string): CorpoDoItem[] {
  return dias.flatMap((dia, i) => {
    const date = somarDias(inicio, i)
    return dia.itens
      .filter((item) => item.titulo.trim().length > 0)
      .map((item) => ({
        title: item.titulo.trim(),
        description: item.descricao,
        date,
        start_time: item.horario,
        location: item.local,
        category: item.categoria,
        status: "planned" as const,
      }))
  })
}
