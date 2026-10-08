import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js"
import { Client } from "pg"
import { exigirLocal, variavelObrigatoria } from "./guarda-ambiente"

/**
 * Bucket de avatares e o trigger de `profiles.avatar_url` (proposta S04-M-foto-perfil).
 *
 * O bucket não tem policy nenhuma para usuário: quem grava e apaga é a rota de
 * foto, com a chave de serviço, depois de conferir os bytes. Aqui se prova que,
 * com o JWT que está no navegador, ninguém faz nada nele pela API do Storage —
 * nem na própria pasta: enviar, sobrescrever, mover, copiar, listar, apagar.
 *
 * Como nenhum usuário consegue enviar, o arquivo de teste é criado direto no
 * banco. "Apagar deu certo" do Storage não prova nada (ele responde sem erro e
 * apaga zero), então cada caso confere o estado depois, pelo banco.
 *
 * E avatar_url só aceita nulo ou `<id do perfil>/<uuid>.(webp|jpg|png)`, também
 * pelo PostgREST direto e no INSERT.
 *
 * @RF02.2 @RNF02.4
 */

const API = exigirLocal(variavelObrigatoria("API_URL"), "API_URL")
const CHAVE = variavelObrigatoria("ANON_KEY")
const CONEXAO = exigirLocal(variavelObrigatoria("DATABASE_URL"), "DATABASE_URL")

const VIOLA_CHECK = "23514"
const BUCKET = "avatars"
const ARQUIVO = "0b6f2c4e-5d7a-4a8e-9b1c-2f3e4d5a6b7c"
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])

function novoCliente() {
  return createClient(API, CHAVE, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function logar(email: string) {
  const cliente = novoCliente()
  const { data, error } = await cliente.auth.signInWithPassword({ email, password: "viajamais123" })
  if (error) throw new Error(`falha ao logar como ${email}: ${error.message}`)
  return { cliente, usuario: data.user as User }
}

let ana: SupabaseClient
let bruno: SupabaseClient
let visitante: SupabaseClient
let db: Client
let idAna: string
let idBruno: string
let idCarla: string
let arquivoDaAna: string

/** Nomes no bucket, vistos pelo banco — a prova de estado depois de cada tentativa. */
async function objetosNoBucket() {
  const { rows } = await db.query("select name from storage.objects where bucket_id = $1 order by name", [BUCKET])
  return rows.map((r) => r.name as string)
}

/** Limpa o bucket pelo banco. O Storage bloqueia DELETE direto; a configuração abaixo é a liberação dele. */
async function limparBucket() {
  await db.query("begin")
  await db.query("set local storage.allow_delete_query = 'true'")
  await db.query("delete from storage.objects where bucket_id = $1", [BUCKET])
  await db.query("commit")
}

beforeAll(async () => {
  const a = await logar("teste.a@viajamais.local")
  const b = await logar("teste.b@viajamais.local")
  ana = a.cliente
  bruno = b.cliente
  idAna = a.usuario.id
  idBruno = b.usuario.id
  visitante = novoCliente()

  db = new Client({ connectionString: CONEXAO })
  await db.connect()
  const { rows } = await db.query("select id from auth.users where email = 'teste.c@viajamais.local'")
  idCarla = rows[0].id

  await limparBucket()
  arquivoDaAna = `${idAna}/${ARQUIVO}.png`
  await db.query("insert into storage.objects (bucket_id, name, owner_id) values ($1, $2, $3)", [
    BUCKET,
    arquivoDaAna,
    idAna,
  ])
})

afterAll(async () => {
  await limparBucket()
  await ana.from("profiles").update({ avatar_url: null }).eq("id", idAna)
  await db.end()
})

describe("bucket avatars — configuração", () => {
  it("é público para leitura, com 2 MB e só JPEG, PNG e WebP", async () => {
    const { rows } = await db.query(
      "select public, file_size_limit, allowed_mime_types from storage.buckets where id = $1",
      [BUCKET],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].public).toBe(true)
    expect(Number(rows[0].file_size_limit)).toBe(2 * 1024 * 1024)
    expect([...rows[0].allowed_mime_types].sort()).toEqual(["image/jpeg", "image/png", "image/webp"])
  })
})

describe("bucket avatars — nenhum usuário escreve, lista ou apaga pela API", () => {
  it("Ana não envia nem na própria pasta (só a rota envia)", async () => {
    const { error } = await ana.storage
      .from(BUCKET)
      .upload(`${idAna}/${ARQUIVO.replace("0b", "1b")}.png`, PNG, { contentType: "image/png" })
    expect(error).not.toBeNull()
    expect(await objetosNoBucket()).toEqual([arquivoDaAna])
  })

  it("Ana não envia na pasta do Bruno, e o visitante não envia em lugar nenhum", async () => {
    const { error: daAna } = await ana.storage
      .from(BUCKET)
      .upload(`${idBruno}/${ARQUIVO}.png`, PNG, { contentType: "image/png" })
    expect(daAna).not.toBeNull()

    const { error: doVisitante } = await visitante.storage
      .from(BUCKET)
      .upload(`${idAna}/${ARQUIVO.replace("0b", "2b")}.png`, PNG, { contentType: "image/png" })
    expect(doVisitante).not.toBeNull()

    expect(await objetosNoBucket()).toEqual([arquivoDaAna])
  })

  it("ninguém lista o bucket: nem a própria pasta, nem a dos outros, nem a raiz", async () => {
    for (const [cliente, pasta] of [
      [ana, idAna],
      [bruno, idAna],
      [bruno, ""],
      [visitante, idAna],
    ] as const) {
      const { data } = await cliente.storage.from(BUCKET).list(pasta)
      expect(data ?? []).toEqual([])
    }
  })

  it("ninguém apaga pela API: nem a Ana o próprio arquivo, nem o Bruno o dela", async () => {
    // O Storage responde sem erro e apaga zero arquivos: só o estado prova.
    await ana.storage.from(BUCKET).remove([arquivoDaAna])
    await bruno.storage.from(BUCKET).remove([arquivoDaAna])
    expect(await objetosNoBucket()).toEqual([arquivoDaAna])
  })

  it("ninguém sobrescreve, move nem copia", async () => {
    const { error: sobrescreveu } = await bruno.storage
      .from(BUCKET)
      .update(arquivoDaAna, PNG, { contentType: "image/png" })
    expect(sobrescreveu).not.toBeNull()

    const { error: moveu } = await ana.storage.from(BUCKET).move(arquivoDaAna, `${idBruno}/${ARQUIVO}.png`)
    expect(moveu).not.toBeNull()

    const { error: copiou } = await bruno.storage.from(BUCKET).copy(arquivoDaAna, `${idBruno}/${ARQUIVO}.png`)
    expect(copiou).not.toBeNull()

    expect(await objetosNoBucket()).toEqual([arquivoDaAna])
  })
})

describe("profiles.avatar_url — só arquivo no formato da rota, na própria pasta", () => {
  const gravar = async (valor: string | null) => {
    const { error } = await ana.from("profiles").update({ avatar_url: valor }).eq("id", idAna)
    return error
  }

  it.each([
    ["URL externa", () => "https://exemplo.com/foto.png"],
    ["URL externa imitando o caminho do bucket", () => `https://exemplo.com/storage/v1/object/public/avatars/${idAna}/${ARQUIVO}.png`],
    ["arquivo na pasta de outra pessoa", () => `${idBruno}/${ARQUIVO}.webp`],
    ["arquivo fora de pasta", () => `${ARQUIVO}.webp`],
    ["subpasta", () => `${idAna}/sub/${ARQUIVO}.webp`],
    ["nome que não é uuid", () => `${idAna}/foto.webp`],
    ["extensão que não é imagem", () => `${idAna}/${ARQUIVO}.svg`],
    ["extensão disfarçada no fim", () => `${idAna}/${ARQUIVO}.png.svg`],
    ["subida de pasta depois do nome", () => `${idAna}/${ARQUIVO}.png/../${idBruno}/x.png`],
    ["quebra de linha no fim", () => `${idAna}/${ARQUIVO}.png\n`],
    ["maiúsculas", () => `${idAna}/${ARQUIVO}.PNG`],
  ])("recusa %s, mesmo pelo PostgREST direto", async (_caso, valor) => {
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
