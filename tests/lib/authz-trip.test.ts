import { describe, it, expect } from "vitest"
import { exigirDono, exigirMembro, papelNaViagem, type ClienteConsulta } from "@/lib/authz/trip"
import { ErroHttp } from "@/lib/http"

/**
 * Cliente falso com a mesma forma encadeada do Supabase. Não é mock de
 * biblioteca: é um objeto que devolve o que o banco devolveria, o que mantém o
 * teste legível e independente de versão do SDK.
 */
function clienteFake(
  resposta: { data: { role: string } | null; error: { message: string } | null },
): ClienteConsulta {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => resposta,
          }),
        }),
      }),
    }),
  }
}

const VIAGEM = "11111111-1111-1111-1111-111111111111"
const USUARIO = "22222222-2222-2222-2222-222222222222"

describe("papelNaViagem", () => {
  it("devolve owner quando o usuário é o dono", async () => {
    const papel = await papelNaViagem(clienteFake({ data: { role: "owner" }, error: null }), VIAGEM, USUARIO)
    expect(papel).toBe("owner")
  })

  it("devolve member para qualquer papel que não seja owner", async () => {
    const papel = await papelNaViagem(clienteFake({ data: { role: "member" }, error: null }), VIAGEM, USUARIO)
    expect(papel).toBe("member")
  })

  it("devolve null quando o usuário não participa da viagem", async () => {
    const papel = await papelNaViagem(clienteFake({ data: null, error: null }), VIAGEM, USUARIO)
    expect(papel).toBeNull()
  })

  it("propaga falha do banco como 500 em vez de tratar como ausência de permissão", async () => {
    // Confundir erro de infraestrutura com "não é membro" esconde indisponibilidade
    // atrás de um 403 e manda o usuário caçar um problema de permissão inexistente.
    const cliente = clienteFake({ data: null, error: { message: "conexão perdida" } })
    await expect(papelNaViagem(cliente, VIAGEM, USUARIO)).rejects.toMatchObject({ status: 500 })
  })
})

describe("exigirMembro", () => {
  it("aceita membro comum", async () => {
    await expect(exigirMembro(clienteFake({ data: { role: "member" }, error: null }), VIAGEM, USUARIO)).resolves.toBe(
      "member",
    )
  })

  it("recusa com 401 quando não há usuário na sessão", async () => {
    const erro = await exigirMembro(clienteFake({ data: null, error: null }), VIAGEM, undefined).catch((e) => e)
    expect(erro).toBeInstanceOf(ErroHttp)
    expect(erro.status).toBe(401)
  })

  it("recusa com 403 quem está autenticado mas não participa da viagem", async () => {
    // Autenticado não é autorizado. É o furo que a aplicação tinha em PATCH e
    // DELETE de viagem: bastava estar logado para alterar viagem alheia.
    const erro = await exigirMembro(clienteFake({ data: null, error: null }), VIAGEM, USUARIO).catch((e) => e)
    expect(erro.status).toBe(403)
  })
})

describe("exigirDono", () => {
  it("aceita o dono", async () => {
    await expect(exigirDono(clienteFake({ data: { role: "owner" }, error: null }), VIAGEM, USUARIO)).resolves
      .toBeUndefined()
  })

  it("recusa membro comum com 403", async () => {
    const erro = await exigirDono(clienteFake({ data: { role: "member" }, error: null }), VIAGEM, USUARIO).catch((e) => e)
    expect(erro.status).toBe(403)
    expect(erro.message).toContain("dono")
  })

  it("recusa quem não participa da viagem", async () => {
    const erro = await exigirDono(clienteFake({ data: null, error: null }), VIAGEM, USUARIO).catch((e) => e)
    expect(erro.status).toBe(403)
  })
})
