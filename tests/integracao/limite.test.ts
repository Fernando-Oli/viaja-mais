import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { sql } from "kysely"
import { comoUsuario } from "@/api/db/como-usuario"
import { exigirLimiteNaTx } from "@/api/http/limite"
import { ErroHttp } from "@/lib/erros"
import { USUARIOS } from "../fixtures/usuarios"
import { admin } from "./apoio"

/**
 * `exigirLimiteNaTx` (`api/http/limite.ts`) contra o banco: a contagem de
 * `public.consumir_limite()` dentro da transação da rota. Substitui os casos de
 * `exigirLimite()` em `tests/lib/limite.test.ts`, que simulavam o PostgREST.
 *
 * @RNF02.8 limite por usuário e por janela de tempo
 */

const { davi } = USUARIOS
const REGRA = { chave: "teste-limite-api", maximo: 2, janelaSegundos: 60 }
const eu = { id: davi.id, email: davi.email }

const limpar = () => admin.query("delete from public.rate_limits where user_id = $1 and chave = $2", [davi.id, REGRA.chave])

beforeAll(async () => {
  await admin.connect()
  await limpar()
})

afterAll(async () => {
  await limpar()
  await admin.end()
})

describe("exigirLimiteNaTx", () => {
  it("passa dentro do limite e lança 429 com Retry-After acima dele", async () => {
    await comoUsuario(eu, (tx) => exigirLimiteNaTx(tx, REGRA))
    await comoUsuario(eu, (tx) => exigirLimiteNaTx(tx, REGRA))
    const erro = await comoUsuario(eu, (tx) => exigirLimiteNaTx(tx, REGRA)).catch((e) => e)
    expect(erro).toBeInstanceOf(ErroHttp)
    expect(erro.status).toBe(429)
    expect(Number(erro.headers?.["Retry-After"])).toBeGreaterThan(0)
  })

  it("fail-open: a contagem que falha libera a requisição, vai para o log e não aborta a transação da rota", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    // Chave fora do formato: consumir_limite() lança no banco.
    const resultado = await comoUsuario(eu, async (tx) => {
      await exigirLimiteNaTx(tx, { ...REGRA, chave: "Chave Inválida" })
      // O savepoint segura o erro: a transação continua utilizável.
      const { rows } = await sql<{ ok: number }>`select 1 as ok`.execute(tx)
      return rows[0].ok
    })
    expect(resultado).toBe(1)
    expect(log).toHaveBeenCalledWith(expect.stringContaining("requisição liberada"), expect.anything())
    log.mockRestore()
  })
})
