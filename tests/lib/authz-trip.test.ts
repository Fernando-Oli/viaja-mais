import { describe, it, expect } from "vitest"
import { exigirDono, exigirMembro, papelNaViagem } from "@/lib/authz/trip"
import { ErroHttp } from "@/lib/http"

/** O papel que a consulta devolveria. A API passa uma consulta de verdade, pelo Kysely. */
const fonte = (role: string | null) => async () => role

const VIAGEM = "11111111-1111-1111-1111-111111111111"
const USUARIO = "22222222-2222-2222-2222-222222222222"

describe("papelNaViagem", () => {
  it("devolve owner quando o usuário é o dono", async () => {
    const papel = await papelNaViagem(fonte("owner"), VIAGEM, USUARIO)
    expect(papel).toBe("owner")
  })

  it("devolve member para qualquer papel que não seja owner", async () => {
    const papel = await papelNaViagem(fonte("member"), VIAGEM, USUARIO)
    expect(papel).toBe("member")
  })

  it("devolve null quando o usuário não participa da viagem", async () => {
    const papel = await papelNaViagem(fonte(null), VIAGEM, USUARIO)
    expect(papel).toBeNull()
  })

  it("propaga falha do banco em vez de tratar como ausência de permissão", async () => {
    // Confundir erro de infraestrutura com "não é membro" esconde indisponibilidade
    // atrás de um 403 e manda o usuário caçar um problema de permissão inexistente.
    const falha = async () => {
      throw new Error("conexão perdida")
    }
    await expect(papelNaViagem(falha, VIAGEM, USUARIO)).rejects.toThrow("conexão perdida")
    await expect(exigirMembro(falha, VIAGEM, USUARIO)).rejects.not.toMatchObject({ status: 403 })
  })
})

describe("exigirMembro", () => {
  it("aceita membro comum", async () => {
    await expect(exigirMembro(fonte("member"), VIAGEM, USUARIO)).resolves.toBe(
      "member",
    )
  })

  it("recusa com 401 quando não há usuário na sessão", async () => {
    const erro = await exigirMembro(fonte(null), VIAGEM, undefined).catch((e) => e)
    expect(erro).toBeInstanceOf(ErroHttp)
    expect(erro.status).toBe(401)
  })

  it("recusa com 403 quem está autenticado mas não participa da viagem", async () => {
    // Autenticado não é autorizado. É o furo que a aplicação tinha em PATCH e
    // DELETE de viagem: bastava estar logado para alterar viagem alheia.
    const erro = await exigirMembro(fonte(null), VIAGEM, USUARIO).catch((e) => e)
    expect(erro.status).toBe(403)
  })
})

describe("exigirDono", () => {
  it("aceita o dono", async () => {
    await expect(exigirDono(fonte("owner"), VIAGEM, USUARIO)).resolves
      .toBeUndefined()
  })

  it("recusa membro comum com 403", async () => {
    const erro = await exigirDono(fonte("member"), VIAGEM, USUARIO).catch((e) => e)
    expect(erro.status).toBe(403)
    expect(erro.message).toContain("dono")
  })

  it("recusa quem não participa da viagem", async () => {
    const erro = await exigirDono(fonte(null), VIAGEM, USUARIO).catch((e) => e)
    expect(erro.status).toBe(403)
  })
})

describe("a consulta do papel", () => {
  it("exigirMembro lança 401 sem usuário, sem consultar o papel", async () => {
    let consultou = false
    const espia = async () => {
      consultou = true
      return "owner"
    }
    await expect(exigirMembro(espia, VIAGEM, undefined)).rejects.toBeInstanceOf(ErroHttp)
    expect(consultou).toBe(false)
  })

  it("passa viagem e usuário para a função", async () => {
    const recebidos: string[] = []
    await exigirDono(async (t, u) => (recebidos.push(t, u), "owner"), VIAGEM, USUARIO)
    expect(recebidos).toEqual([VIAGEM, USUARIO])
  })
})
