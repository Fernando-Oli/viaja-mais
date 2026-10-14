import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * @RF04.3 aceitar convite
 *
 * Cliente falso ramificado por tabela, no molde de `expense-item-route.test.ts`.
 * O convite "encontrado" depende dos filtros aplicados: só aparece quando o
 * e-mail filtrado é o do convidado, como a RLS e o `.eq` da rota fariam.
 */

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  colunasConvite: "" as string,
  filtrosConvite: {} as Record<string, string>,
  convite: { id: "conv-1", trip_id: "trip-1", invitee_email: "bruno@x.local", status: "pending" },
  jaMembro: null as { id: string } | null,
  erroInsercao: null as { message: string } | null,
  insercoes: [] as Record<string, unknown>[],
  atualizacoes: [] as Record<string, unknown>[],
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: h.getUser },
    from(tabela: string) {
      if (tabela === "trip_invitations") {
        return {
          select(colunas: string) {
            h.colunasConvite = colunas
            const cadeia = {
              eq(coluna: string, valor: string) {
                h.filtrosConvite[coluna] = valor
                return cadeia
              },
              async maybeSingle() {
                const f = h.filtrosConvite
                const casa =
                  f.id === h.convite.id && f.invitee_email === h.convite.invitee_email && f.status === h.convite.status
                // `trips!inner` some com a linha para quem não é membro: é o defeito que a rota tinha.
                if (colunas.includes("trips")) return { data: null, error: null }
                return { data: casa ? { id: h.convite.id, trip_id: h.convite.trip_id } : null, error: null }
              },
            }
            return cadeia
          },
          update(valores: Record<string, unknown>) {
            h.atualizacoes.push(valores)
            return { eq: () => ({ eq: async () => ({ error: null }) }) }
          },
        }
      }

      // trip_members
      return {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.jaMembro }) }) }) }),
        async insert(valores: Record<string, unknown>) {
          h.insercoes.push(valores)
          return { error: h.erroInsercao }
        },
      }
    },
  }),
}))

import { POST } from "@/app/api/invitations/[invitationId]/accept/route"

const requisicao = () => new Request("http://localhost/api/invitations/conv-1/accept", { method: "POST" })
const contexto = (id = "conv-1") => ({ params: Promise.resolve({ invitationId: id }) })

const logadoComo = (email: string, id = "user-bruno") =>
  h.getUser.mockResolvedValue({ data: { user: { id, email } } })

beforeEach(() => {
  h.getUser.mockReset()
  h.colunasConvite = ""
  h.filtrosConvite = {}
  h.jaMembro = null
  h.erroInsercao = null
  h.insercoes.length = 0
  h.atualizacoes.length = 0
})

describe("POST /api/invitations/[invitationId]/accept", () => {
  it("200: o convidado entra na viagem e o convite fica aceito", async () => {
    logadoComo("bruno@x.local")

    const resposta = await POST(requisicao(), contexto())

    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toEqual({ success: true, trip_id: "trip-1" })
    expect(h.insercoes).toEqual([{ trip_id: "trip-1", user_id: "user-bruno", role: "member" }])
    expect(h.atualizacoes).toEqual([expect.objectContaining({ status: "accepted" })])
  })

  // Regressão: com `trips!inner`, a RLS de `trips` escondia a viagem de quem
  // ainda não é membro e todo aceite respondia 404.
  it("lê o convite sem embutir trips", async () => {
    logadoComo("bruno@x.local")

    await POST(requisicao(), contexto())

    expect(h.colunasConvite).not.toContain("trips")
  })

  it("200: quem já é membro só marca o convite como aceito", async () => {
    logadoComo("bruno@x.local")
    h.jaMembro = { id: "m-1" }

    const resposta = await POST(requisicao(), contexto())

    expect(resposta.status).toBe(200)
    expect(h.insercoes).toEqual([])
  })

  it("401: sem sessão não lê convite nem entra", async () => {
    h.getUser.mockResolvedValue({ data: { user: null } })

    const resposta = await POST(requisicao(), contexto())

    expect(resposta.status).toBe(401)
    expect(h.insercoes).toEqual([])
  })

  it("404: o convite de outra pessoa não é aceito, e nada é gravado", async () => {
    logadoComo("carla@x.local", "user-carla")

    const resposta = await POST(requisicao(), contexto())

    expect(resposta.status).toBe(404)
    expect(h.filtrosConvite.invitee_email).toBe("carla@x.local")
    expect(h.insercoes).toEqual([])
    expect(h.atualizacoes).toEqual([])
  })

  it("400: falha ao entrar não marca o convite como aceito nem vaza a mensagem do banco", async () => {
    logadoComo("bruno@x.local")
    h.erroInsercao = { message: 'new row violates row-level security policy for table "trip_members"' }

    const resposta = await POST(requisicao(), contexto())

    expect(resposta.status).toBe(400)
    expect(JSON.stringify(await resposta.json())).not.toContain("row-level")
    expect(h.atualizacoes).toEqual([])
  })
})
