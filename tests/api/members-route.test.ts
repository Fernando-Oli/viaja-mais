import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Testes de contrato do route handler de participação na viagem.
 *
 * Nível: handler. O cliente Supabase falso tem a forma encadeada do SDK, então
 * a autorização real (`exigirMembro` → `papelNaViagem`) roda de verdade.
 *
 * O que ISTO prova: os quatro caminhos (200/401/403/400) e a regra de quem pode
 * remover quem. O que NÃO prova: isolamento por RLS — isso é
 * `tests/rls/01-isolamento.test.ts`, contra Postgres real.
 *
 * @RF04.7 @RF04.8
 */

import { createClient } from "@/lib/supabase/server"
import { DELETE } from "@/app/api/trips/[tripId]/members/route"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

const VIAGEM = "11111111-1111-4111-8111-111111111111"
const EU = "22222222-2222-4222-8222-222222222222"
const OUTRO = "33333333-3333-4333-8333-333333333333"

type Opcoes = {
  user?: { id: string } | null
  papel?: string | null
  erroDelete?: { message: string } | null
  aoApagar?: (filtros: Record<string, unknown>) => void
}

function supabaseFalso(opcoes: Opcoes = {}) {
  const { user = { id: EU }, papel = "owner", erroDelete = null, aoApagar } = opcoes

  return {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from(tabela: string) {
      if (tabela !== "trip_members") throw new Error(`tabela inesperada: ${tabela}`)

      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: papel ? { role: papel } : null, error: null }),
            }),
          }),
        }),
        delete: () => {
          const filtros: Record<string, unknown> = {}
          const encadeia = {
            eq(coluna: string, valor: unknown) {
              filtros[coluna] = valor
              return encadeia
            },
            then(resolver: (r: { error: unknown }) => void) {
              aoApagar?.(filtros)
              resolver({ error: erroDelete })
            },
          }
          return encadeia
        },
      }
    },
  }
}

function requisicao(userId?: string) {
  const url = userId
    ? `http://localhost/api/trips/${VIAGEM}/members?userId=${userId}`
    : `http://localhost/api/trips/${VIAGEM}/members`
  return new Request(url, { method: "DELETE" })
}

const contexto = { params: Promise.resolve({ tripId: VIAGEM }) }

beforeEach(() => {
  vi.mocked(createClient).mockReset()
})

describe("DELETE /api/trips/[tripId]/members", () => {
  it("200: o dono remove outro participante", async () => {
    const apagados: Record<string, unknown>[] = []
    vi.mocked(createClient).mockResolvedValue(
      supabaseFalso({ papel: "owner", aoApagar: (f) => apagados.push(f) }) as never,
    )

    const resposta = await DELETE(requisicao(OUTRO), contexto)

    expect(resposta.status).toBe(200)
    // O filtro carrega o tripId da URL, não do corpo: não dá para remover
    // alguém de uma viagem diferente da que está sendo autorizada.
    expect(apagados[0]).toEqual({ trip_id: VIAGEM, user_id: OUTRO })
  })

  it("200: o membro comum sai da viagem por conta própria", async () => {
    vi.mocked(createClient).mockResolvedValue(supabaseFalso({ papel: "member" }) as never)

    const resposta = await DELETE(requisicao(EU), contexto)

    expect(resposta.status).toBe(200)
  })

  it("401: sem sessão", async () => {
    vi.mocked(createClient).mockResolvedValue(supabaseFalso({ user: null }) as never)

    const resposta = await DELETE(requisicao(OUTRO), contexto)

    expect(resposta.status).toBe(401)
  })

  it("403: quem não participa da viagem", async () => {
    vi.mocked(createClient).mockResolvedValue(supabaseFalso({ papel: null }) as never)

    const resposta = await DELETE(requisicao(OUTRO), contexto)

    expect(resposta.status).toBe(403)
  })

  it("403: membro comum tentando remover outra pessoa", async () => {
    // O furo original: bastava estar autenticado para remover qualquer membro
    // de qualquer viagem.
    vi.mocked(createClient).mockResolvedValue(supabaseFalso({ papel: "member" }) as never)

    const resposta = await DELETE(requisicao(OUTRO), contexto)

    expect(resposta.status).toBe(403)
  })

  it("400: sem dizer quem sai", async () => {
    vi.mocked(createClient).mockResolvedValue(supabaseFalso() as never)

    const resposta = await DELETE(requisicao(), contexto)

    expect(resposta.status).toBe(400)
  })

  it("400: o dono não pode sair da própria viagem", async () => {
    // Deixaria a viagem sem participação do dono, e ela sumiria da lista dele
    // sem deixar de ser dele — o mesmo defeito da viagem que "sumia".
    vi.mocked(createClient).mockResolvedValue(supabaseFalso({ papel: "owner" }) as never)

    const resposta = await DELETE(requisicao(EU), contexto)

    expect(resposta.status).toBe(400)
  })

  it("não vaza a mensagem crua do banco", async () => {
    vi.mocked(createClient).mockResolvedValue(
      supabaseFalso({ erroDelete: { message: 'violates foreign key constraint "trip_members_user_id_fkey"' } }) as never,
    )

    const resposta = await DELETE(requisicao(OUTRO), contexto)
    const corpo = await resposta.json()

    expect(resposta.status).toBe(400)
    expect(JSON.stringify(corpo)).not.toContain("trip_members_user_id_fkey")
  })
})
