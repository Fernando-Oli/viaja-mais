import type { GerarRoteiro } from "@/lib/schemas/roteiro"
import type { GeradorDeRoteiro } from "@/lib/ai/provider"
import { normalizarRoteiro, type CategoriaItinerario } from "@/lib/ai/roteiro"

/**
 * Gerador determinístico, sem rede: o padrão em dev, no CI e no E2E.
 *
 * Mesmo pedido, mesmo roteiro — o E2E pode conferir textos, e a suíte nunca
 * falha porque o provedor estava lento ou fora do ar. O roteiro é plausível o
 * bastante para a tela ser testada de verdade: o primeiro dia tem check-in, o
 * último tem check-out, o ritmo muda a quantidade de itens, o orçamento muda as
 * refeições e os interesses escolhem as atividades da tarde.
 *
 * Passa pelo mesmo `normalizarRoteiro` que a resposta do modelo real: o fake não
 * tem atalho para fora do contrato.
 *
 * @RF12.1 gerar roteiro por IA
 */

type Molde = { horario: string; titulo: string; categoria: CategoriaItinerario; descricao?: string }

const ITENS_POR_RITMO: Record<GerarRoteiro["ritmo"], number> = { tranquilo: 3, equilibrado: 4, intenso: 5 }

const REFEICAO: Record<GerarRoteiro["orcamento"], string> = {
  economico: "Opção barata e bem avaliada pelos moradores",
  moderado: "Restaurante de cozinha local, preço médio",
  confortavel: "Restaurante com reserva antecipada",
}

/** Atividade da tarde por interesse. Interesse fora da lista cai no genérico. */
const POR_INTERESSE: Record<string, Omit<Molde, "horario">> = {
  comida: { titulo: "Mercado e comidas típicas", categoria: "restaurant" },
  historia: { titulo: "Roteiro pelo centro histórico", categoria: "attraction" },
  natureza: { titulo: "Trilha ou parque com vista", categoria: "activity" },
  museus: { titulo: "Museu mais visitado da cidade", categoria: "attraction" },
  "vida noturna": { titulo: "Bairro boêmio", categoria: "activity" },
  compras: { titulo: "Rua de comércio e feirinha local", categoria: "activity" },
}

/** "Museus" e "museus " viram a mesma chave; acentos não importam. */
function chave(interesse: string): string {
  return interesse
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
}

function atividadeDaTarde(pedido: GerarRoteiro, dia: number): Omit<Molde, "horario"> {
  const interesses = pedido.interesses
  if (interesses.length === 0) return { titulo: `Passeio livre por ${pedido.destino}`, categoria: "activity" }
  const escolhido = interesses[dia % interesses.length]
  return POR_INTERESSE[chave(escolhido)] ?? { titulo: `${escolhido} em ${pedido.destino}`, categoria: "activity" }
}

function moldesDoDia(pedido: GerarRoteiro, dia: number): { titulo: string; itens: Molde[] } {
  const ultimo = dia === pedido.dias - 1
  const refeicao = REFEICAO[pedido.orcamento]
  const tarde = atividadeDaTarde(pedido, dia)

  if (dia === 0) {
    return {
      titulo: "Chegada e primeiro passeio",
      itens: [
        { horario: "14:00", titulo: "Check-in na hospedagem", categoria: "accommodation" },
        { horario: "16:00", titulo: `Caminhada de reconhecimento por ${pedido.destino}`, categoria: "activity" },
        { horario: "18:30", ...tarde },
        { horario: "20:00", titulo: "Jantar perto da hospedagem", categoria: "restaurant", descricao: refeicao },
        { horario: "22:00", titulo: "Mirante ou praça à noite", categoria: "attraction" },
      ],
    }
  }

  const itens: Molde[] = [
    { horario: "09:00", titulo: "Ponto mais conhecido, cedo para evitar fila", categoria: "attraction" },
    { horario: "12:30", titulo: "Almoço com comida local", categoria: "restaurant", descricao: refeicao },
    { horario: "15:00", ...tarde },
    { horario: "19:30", titulo: "Jantar", categoria: "restaurant", descricao: refeicao },
    { horario: "21:30", titulo: "Programa noturno", categoria: "activity" },
  ]
  if (ultimo) {
    itens.unshift({ horario: "08:00", titulo: "Check-out e bagagem guardada", categoria: "accommodation" })
    return { titulo: "Último dia e volta", itens }
  }
  return { titulo: `Dia ${dia + 1} em ${pedido.destino}`, itens }
}

export function roteiroFake(pedido: GerarRoteiro) {
  const quantos = ITENS_POR_RITMO[pedido.ritmo]
  const dias = Array.from({ length: pedido.dias }, (_, dia) => {
    const { titulo, itens } = moldesDoDia(pedido, dia)
    // Check-in e check-out ficam sempre; o ritmo corta do fim do dia.
    const fixos = itens.filter((i) => i.categoria === "accommodation")
    const resto = itens.filter((i) => i.categoria !== "accommodation").slice(0, Math.max(0, quantos - fixos.length))
    return {
      titulo,
      itens: [...fixos, ...resto].map((i) => ({
        horario: i.horario,
        titulo: i.titulo,
        descricao: i.descricao ?? null,
        local: null,
        categoria: i.categoria,
      })),
    }
  })
  return normalizarRoteiro({ dias }, pedido.dias)
}

export const geradorFake: GeradorDeRoteiro = {
  nome: "fake",
  async gerar(pedido) {
    return roteiroFake(pedido)
  },
}
