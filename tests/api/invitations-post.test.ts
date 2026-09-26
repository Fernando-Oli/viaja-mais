import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Testes de contrato do route handler de convites.
 *
 * Nível: handler. O cliente Supabase falso tem a mesma forma encadeada do SDK,
 * então a autorização real (`exigirDono` → `papelNaViagem`) roda de verdade
 * contra ele.
 *
 * O que ISTO prova: os quatro caminhos (200/401/403/400), que `inviter_id`
 * nunca vem do corpo, e que o e-mail só sai depois de o convite existir. O que
 * NÃO prova: isolamento por RLS — isso é `tests/rls/01-isolamento.test.ts`,
 * contra Postgres real; nem que a mensagem chega de fato, o que é o roteiro
 * manual no Inbucket.
 *
 * @RF04.1 @RF04.2
 */

import { createClient } from "@/lib/supabase/server"
import { criarClienteAdmin } from "@/lib/supabase/admin"
import { POST } from "@/app/api/invitations/route"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/lib/supabase/admin", () => ({ criarClienteAdmin: vi.fn() }))

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

/** Registra o que o cliente admin recebeu, e na ordem em que recebeu. */
type Envio = { email: string; erro?: { code?: string; message: string } }

function adminFalso(convidados: Envio[], erro?: { code?: string; message: string }) {
  return {
    auth: {
      admin: {
        inviteUserByEmail: async (email: string) => {
          convidados.push({ email, erro })
          return { error: erro ?? null }
        },
      },
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
  vi.mocked(criarClienteAdmin).mockReset()
  vi.mocked(criarClienteAdmin).mockReturnValue(adminFalso([]) as never)
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

describe("POST /api/invitations", () => {
  it("200: o dono convida, o convite é gravado e o e-mail sai", async () => {
    const inseridos: Record<string, unknown>[] = []
    const convidados: Envio[] = []
    vi.mocked(createClient).mockResolvedValue(
      supabaseFalso({ aoInserir: (p) => inseridos.push(p) }) as never,
    )
    vi.mocked(criarClienteAdmin).mockReturnValue(adminFalso(convidados) as never)

    const resposta = await POST(requisicao(corpoValido))

    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toMatchObject({ success: true, envio: "enviado" })
    expect(inseridos).toHaveLength(1)
    expect(inseridos[0]).toMatchObject({
      trip_id: VIAGEM,
      invitee_email: "convidado@viajamais.local",
      status: "pending",
    })
    // O e-mail vai para o endereço normalizado pelo zod, não para o que veio cru.
    expect(convidados).toEqual([{ email: "convidado@viajamais.local", erro: undefined }])
  })

  it("o envio usa o cliente admin, nunca o cliente da sessão", async () => {
    // O bug original: `supabaseAdmin` era o cliente anon, e
    // `auth.admin.inviteUserByEmail` exige a chave de serviço. O cliente da
    // sessão não expõe mais `auth.admin` nenhum — se o handler tentasse usá-lo,
    // este teste quebraria com TypeError em vez de passar em silêncio.
    const convidados: Envio[] = []
    vi.mocked(createClient).mockResolvedValue(supabaseFalso() as never)
    vi.mocked(criarClienteAdmin).mockReturnValue(adminFalso(convidados) as never)

    await POST(requisicao(corpoValido))

    expect(criarClienteAdmin).toHaveBeenCalledTimes(1)
    expect(convidados).toHaveLength(1)
  })

  it("200: convidado que já tem conta não recebe e-mail, mas o convite vale", async () => {
    const inseridos: Record<string, unknown>[] = []
    vi.mocked(createClient).mockResolvedValue(
      supabaseFalso({ aoInserir: (p) => inseridos.push(p) }) as never,
    )
    vi.mocked(criarClienteAdmin).mockReturnValue(
      adminFalso([], { code: "email_exists", message: "A user with this email address has already been registered" }) as never,
    )

    const resposta = await POST(requisicao(corpoValido))

    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toMatchObject({ envio: "ja-cadastrado" })
    // O que importa: a linha existe, então a pessoa vê o convite na aplicação.
    expect(inseridos).toHaveLength(1)
  })

  it("200: falha no envio não derruba o convite já gravado", async () => {
    const inseridos: Record<string, unknown>[] = []
    vi.mocked(createClient).mockResolvedValue(
      supabaseFalso({ aoInserir: (p) => inseridos.push(p) }) as never,
    )
    vi.mocked(criarClienteAdmin).mockImplementation(() => {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada")
    })

    const resposta = await POST(requisicao(corpoValido))

    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toMatchObject({ envio: "falhou" })
    expect(inseridos).toHaveLength(1)
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

  it("não envia e-mail se o convite não chegou a ser gravado", async () => {
    // A ordem importa: e-mail de um convite que não existe manda a pessoa para
    // uma viagem à qual ela não foi convidada.
    const convidados: Envio[] = []
    vi.mocked(createClient).mockResolvedValue(
      supabaseFalso({ erroInsert: { message: "violates foreign key constraint" } }) as never,
    )
    vi.mocked(criarClienteAdmin).mockReturnValue(adminFalso(convidados) as never)

    const resposta = await POST(requisicao(corpoValido))

    expect(resposta.status).toBe(400)
    expect(convidados).toHaveLength(0)
  })

  it("não envia e-mail para quem não é dono da viagem", async () => {
    // Enumeração de e-mail: se o envio acontecesse antes da autorização, um
    // não-membro conseguiria disparar mensagem em nome da plataforma.
    const convidados: Envio[] = []
    vi.mocked(createClient).mockResolvedValue(supabaseFalso({ papel: "member" }) as never)
    vi.mocked(criarClienteAdmin).mockReturnValue(adminFalso(convidados) as never)

    const resposta = await POST(requisicao(corpoValido))

    expect(resposta.status).toBe(403)
    expect(convidados).toHaveLength(0)
  })
})
