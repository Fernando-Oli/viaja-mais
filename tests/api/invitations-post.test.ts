import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Testes de contrato do route handler de convites.
 *
 * Nível: handler. O cliente Supabase falso tem a mesma forma encadeada do SDK,
 * então a autorização real (`exigirDono` → `papelNaViagem`) roda de verdade
 * contra ele.
 *
 * O que ISTO prova: os quatro caminhos (200/401/403/400) e que `inviter_id`
 * nunca vem do corpo. O que NÃO prova: isolamento por RLS — isso é
 * `tests/rls/01-isolamento.test.ts`, contra Postgres real.
 *
 * @RF04.1
 */

import { createClient } from "@/lib/supabase/server"
import { POST } from "@/app/api/invitations/route"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

const VIAGEM = "11111111-1111-4111-8111-111111111111"
const DONO = "22222222-2222-4222-8222-222222222222"

const corpoValido = { email: "convidado@viajamais.local", tripId: VIAGEM }

type Opcoes = {
  user?: { id: string; email?: string } | null
  papel?: string | null
  erroInsert?: { message: string } | null
  aoInserir?: (payload: Record<string, unknown>) => void
}

function supabaseFalso(opcoes: Opcoes = {}) {
  const { user = { id: DONO }, papel = "owner", erroInsert = null, aoInserir } = opcoes

  return {
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
      admin: {
        // Existe para o handler não estourar. Devolve erro de propósito: é o
        // que a API responde hoje com a chave anon.
        inviteUserByEmail: async () => ({ error: { message: "not_admin" } }),
      },
    },
    from(tabela: string) {
      if (tabela === "trip_members") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: papel ? { role: papel } : null, error: null }),
              }),
            }),
          }),
        }
      }

      if (tabela === "trip_invitations") {
        return {
          insert: async (payload: Record<string, unknown>) => {
            aoInserir?.(payload)
            return { error: erroInsert }
          },
        }
      }

      throw new Error(`tabela inesperada no teste: ${tabela}`)
    },
  }
}

function requisicao(body: unknown) {
  return new Request("http://localhost/api/invitations", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

beforeEach(() => {
  vi.mocked(createClient).mockReset()
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

describe("POST /api/invitations", () => {
  it("200: o dono convida e o convite é gravado", async () => {
    const inseridos: Record<string, unknown>[] = []
    vi.mocked(createClient).mockResolvedValue(
      supabaseFalso({ aoInserir: (p) => inseridos.push(p) }) as never,
    )

    const resposta = await POST(requisicao(corpoValido))

    expect(resposta.status).toBe(200)
    expect(inseridos).toHaveLength(1)
    expect(inseridos[0]).toMatchObject({
      trip_id: VIAGEM,
      invitee_email: "convidado@viajamais.local",
      status: "pending",
    })
  })

  it("401: sem sessão", async () => {
    vi.mocked(createClient).mockResolvedValue(supabaseFalso({ user: null }) as never)

    const resposta = await POST(requisicao(corpoValido))

    expect(resposta.status).toBe(401)
  })

  it("403: autenticado, participa da viagem, mas não é o dono", async () => {
    // Convidar é ação de dono: membro comum não convida. Espelha a policy
    // `trip_invitations_insert`.
    vi.mocked(createClient).mockResolvedValue(supabaseFalso({ papel: "member" }) as never)

    const resposta = await POST(requisicao(corpoValido))

    expect(resposta.status).toBe(403)
  })

  it("403: autenticado, mas não participa da viagem", async () => {
    vi.mocked(createClient).mockResolvedValue(supabaseFalso({ papel: null }) as never)

    const resposta = await POST(requisicao(corpoValido))

    expect(resposta.status).toBe(403)
  })

  it("400: payload inválido", async () => {
    vi.mocked(createClient).mockResolvedValue(supabaseFalso() as never)

    const resposta = await POST(requisicao({ email: "não-é-email", tripId: "abc" }))

    expect(resposta.status).toBe(400)
  })

  it("ignora o inviterId vindo do corpo e usa a sessão", async () => {
    // Regressão do furo original: o handler não checava sessão e gravava o
    // `inviterId` que viesse no corpo, em nome de quem o cliente quisesse.
    const inseridos: Record<string, unknown>[] = []
    vi.mocked(createClient).mockResolvedValue(
      supabaseFalso({ aoInserir: (p) => inseridos.push(p) }) as never,
    )

    const resposta = await POST(
      requisicao({ ...corpoValido, inviterId: "99999999-9999-4999-8999-999999999999" }),
    )

    expect(resposta.status).toBe(200)
    expect(inseridos[0].inviter_id).toBe(DONO)
  })

  it("não vaza a mensagem crua do banco quando o insert falha", async () => {
    vi.mocked(createClient).mockResolvedValue(
      supabaseFalso({
        erroInsert: { message: 'duplicate key value violates unique constraint "trip_invitations_pkey"' },
      }) as never,
    )

    const resposta = await POST(requisicao(corpoValido))
    const corpo = await resposta.json()

    expect(resposta.status).toBe(400)
    expect(JSON.stringify(corpo)).not.toContain("trip_invitations_pkey")
  })
})
