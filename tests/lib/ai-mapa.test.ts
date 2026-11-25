import { describe, it, expect } from "vitest"
import { linkDoMapa } from "@/lib/ai/mapa"

/**
 * "Ver no mapa" do roteiro da Avori: o link de busca do Google Maps que cada
 * atividade abre em nova aba.
 *
 * @RF12.2 revisar o roteiro gerado antes de gravá-lo
 */

const BUSCA = "https://www.google.com/maps/search/?api=1&query="
const consulta = (link: string | null) => decodeURIComponent((link ?? "").slice(BUSCA.length))

describe("linkDoMapa", () => {
  it("usa o endereço público de busca do Google Maps, sem chave", () => {
    const link = linkDoMapa({ local: "Castelo de São Jorge", titulo: "Suba ao castelo", destino: "Lisboa" })
    expect(link?.startsWith(BUSCA)).toBe(true)
    expect(link).not.toMatch(/key=/)
  })

  it("busca pelo lugar que a IA informou, e não pelo título", () => {
    const link = linkDoMapa({ local: "Castelo de São Jorge, Alfama", titulo: "Suba ao castelo", destino: "Lisboa" })
    expect(consulta(link)).toBe("Castelo de São Jorge, Alfama, Lisboa")
  })

  it("sem lugar, busca pelo título atual da atividade", () => {
    expect(consulta(linkDoMapa({ local: null, titulo: "Check-in na hospedagem", destino: "Lisboa" }))).toBe(
      "Check-in na hospedagem, Lisboa",
    )
    // Lugar só com espaços conta como ausente.
    expect(consulta(linkDoMapa({ local: "   ", titulo: "Mercado da Ribeira", destino: "Lisboa" }))).toBe(
      "Mercado da Ribeira, Lisboa",
    )
  })

  it("não repete o destino que já está no texto, sem diferença de maiúsculas nem acentos", () => {
    expect(consulta(linkDoMapa({ local: "Pátio do Colégio, São Paulo", titulo: "x", destino: "São Paulo" }))).toBe(
      "Pátio do Colégio, São Paulo",
    )
    expect(consulta(linkDoMapa({ local: "MASP, Avenida Paulista, sao paulo", titulo: "x", destino: "São Paulo" }))).toBe(
      "MASP, Avenida Paulista, sao paulo",
    )
  })

  it("sem destino, busca só pelo lugar", () => {
    expect(consulta(linkDoMapa({ local: "Torre de Belém", titulo: "x", destino: "  " }))).toBe("Torre de Belém")
  })

  it("tira os espaços das pontas", () => {
    expect(consulta(linkDoMapa({ local: "  Torre de Belém  ", titulo: "x", destino: "  Lisboa " }))).toBe(
      "Torre de Belém, Lisboa",
    )
  })

  it("codifica acentos e caracteres que mudariam o endereço", () => {
    const link = linkDoMapa({ local: "Café & Bar #1 / Chiado?", titulo: "x", destino: "Lisboa" }) ?? ""
    expect(link.slice(BUSCA.length)).not.toMatch(/[ &#/?]/)
    expect(consulta(link)).toBe("Café & Bar #1 / Chiado?, Lisboa")
  })

  it("sem lugar nem título não há link", () => {
    expect(linkDoMapa({ local: null, titulo: "   ", destino: "Lisboa" })).toBeNull()
    expect(linkDoMapa({ local: "", titulo: "", destino: "Lisboa" })).toBeNull()
  })
})
