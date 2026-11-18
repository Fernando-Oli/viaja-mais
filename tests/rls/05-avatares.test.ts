import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { Client } from "pg"
import { type Cliente, CONEXAO, logar } from "./apoio"
import { USUARIOS } from "../fixtures/usuarios"

/**
 * `profiles.avatar_url` só aceita nulo ou `<id do perfil>/<uuid>.(webp|jpg|png)`
 * (migration social_avatares), também na escrita direta e no INSERT.
 *
 * Os casos do bucket (ninguém envia, lista, apaga ou lê com a própria sessão)
 * eram do Storage do Supabase e saíram com ele. O armazenamento agora é S3, com
 * o bucket privado e sem credencial nenhuma no navegador: quem envia, apaga e
 * assina link é só a API, e isso é provado em `tests/integracao/foto.test.ts` e
 * `tests/api/avatares.test.ts`.
 *
 * @RF02.2 @RNF02.4
 */

const VIOLA_CHECK = "23514"
const ARQUIVO = "0b6f2c4e-5d7a-4a8e-9b1c-2f3e4d5a6b7c"

let ana: Cliente
let db: Client
let idAna: string
let idBruno: string
let idCarla: string
let fotoOriginal: string | null

beforeAll(async () => {
  const a = await logar(USUARIOS.ana.email)
  const b = await logar(USUARIOS.bruno.email)
  const c = await logar(USUARIOS.carla.email)
  ana = a.cliente
  idAna = a.id
  idBruno = b.id
  idCarla = c.id
  db = new Client({ connectionString: CONEXAO })
  await db.connect()
  fotoOriginal = (await db.query("select avatar_url from public.profiles where id = $1", [idAna])).rows[0].avatar_url
})

afterAll(async () => {
  await db.query("update public.profiles set avatar_url = $2 where id = $1", [idAna, fotoOriginal])
  await db.end()
})

describe("profiles.avatar_url — só arquivo no formato da rota, na própria pasta", () => {
  const gravar = async (valor: string | null) => {
    const { error } = await ana.from("profiles").update({ avatar_url: valor }).eq("id", idAna)
    return error
  }

  it.each([
    ["URL externa", () => "https://exemplo.com/foto.png"],
    ["URL externa imitando o caminho do bucket", () => `https://exemplo.com/avatars/${idAna}/${ARQUIVO}.png`],
    ["arquivo na pasta de outra pessoa", () => `${idBruno}/${ARQUIVO}.webp`],
    ["arquivo fora de pasta", () => `${ARQUIVO}.webp`],
    ["subpasta", () => `${idAna}/sub/${ARQUIVO}.webp`],
    ["nome que não é uuid", () => `${idAna}/foto.webp`],
    ["extensão que não é imagem", () => `${idAna}/${ARQUIVO}.svg`],
    ["extensão disfarçada no fim", () => `${idAna}/${ARQUIVO}.png.svg`],
    ["subida de pasta depois do nome", () => `${idAna}/${ARQUIVO}.png/../${idBruno}/x.png`],
    ["quebra de linha no fim", () => `${idAna}/${ARQUIVO}.png\n`],
    ["maiúsculas", () => `${idAna}/${ARQUIVO}.PNG`],
  ])("recusa %s, mesmo na escrita direta", async (_caso, valor) => {
    expect((await gravar(valor()))?.code).toBe(VIOLA_CHECK)
  })

  it("aceita um arquivo no formato da rota, na própria pasta, e aceita nulo", async () => {
    expect(await gravar(`${idAna}/${ARQUIVO}.webp`)).toBeNull()
    expect(await gravar(null)).toBeNull()
  })

  it("vale também no INSERT do perfil", async () => {
    try {
      await db.query("begin")
      await db.query("delete from public.profiles where id = $1", [idCarla])
      const erro = await db
        .query("insert into public.profiles (id, full_name, avatar_url) values ($1, 'Carla', 'https://exemplo.com/a.png')", [
          idCarla,
        ])
        .then(() => null)
        .catch((e: { code?: string }) => e)
      expect(erro?.code).toBe(VIOLA_CHECK)
    } finally {
      await db.query("rollback")
    }
  })
})
