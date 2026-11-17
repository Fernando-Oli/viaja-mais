import { randomUUID } from "node:crypto"
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { app } from "@/api/app"
import { apagarArquivos, enviarArquivo, listarPasta } from "@/api/arquivos/armazenamento"
import { envApi } from "@/api/env"
import { admin, ORIGEM } from "./apoio"

/**
 * Foto de perfil na API (`/api/social/perfil/foto`), com sessão, banco e
 * armazenamento S3 reais (o SeaweedFS do docker-compose). Substitui
 * `tests/api/social-perfil-foto-route.test.ts`, que simulava o Supabase Storage.
 *
 * Usa uma conta descartável, criada pelo cadastro do Better Auth.
 *
 * Precisa da stack local: `docker compose up -d --wait` e `npm run db:reset`.
 *
 * @RF02.2 foto de perfil · @RNF02.8 limite de envios por usuário · @RNF02.11 erro não vaza
 */

const EMAIL = `foto-integracao-${Date.now()}@exemplo.local`
const SENHA = "Foto+perfil123"
const IP = `10.7.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`
const BUCKET = envApi.S3_BUCKET_AVATARES

let userId: string
let cookie: string

// Assinaturas mínimas: a rota confere os bytes do começo, não decodifica a imagem.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 5, 6, 7, 8])
const PDF = new TextEncoder().encode("%PDF-1.7 não é imagem")

function enviar(bytes: Uint8Array | null, comCookie = true, nome = "foto.png") {
  const corpo = new FormData()
  if (bytes) corpo.set("foto", new File([bytes.buffer as ArrayBuffer], nome, { type: "image/png" }))
  return app.request("/api/social/perfil/foto", {
    method: "POST",
    headers: { origin: ORIGEM, "x-forwarded-for": IP, ...(comCookie ? { cookie } : {}) },
    body: corpo,
  })
}

const remover = () =>
  app.request("/api/social/perfil/foto", { method: "DELETE", headers: { origin: ORIGEM, "x-forwarded-for": IP, cookie } })

const avatarNoBanco = async () =>
  (await admin.query("select avatar_url from public.profiles where id = $1", [userId])).rows[0].avatar_url as string | null

const naPasta = async () => (await listarPasta(BUCKET, userId)).map((a) => a.caminho)

async function esperarAte(condicao: () => Promise<boolean>, limiteMs = 10_000) {
  const fim = Date.now() + limiteMs
  while (!(await condicao())) {
    if (Date.now() > fim) throw new Error("condição não aconteceu a tempo")
    await new Promise((r) => setTimeout(r, 20))
  }
}

beforeAll(async () => {
  await admin.connect()
  const r = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { origin: ORIGEM, "x-forwarded-for": IP, "content-type": "application/json" },
    body: JSON.stringify({ name: "Conta da foto", email: EMAIL, password: SENHA }),
  })
  if (r.status !== 200) throw new Error(`cadastro falhou: ${r.status} ${await r.text()}`)
  userId = (await r.json()).user.id
  cookie = r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ")
})

afterAll(async () => {
  // Apagar a conta não apaga os arquivos dela no bucket: sai a pasta inteira.
  await apagarArquivos(BUCKET, await naPasta())
  await admin.query("delete from auth.users where id = $1", [userId])
  await admin.end()
})

describe("POST e DELETE /api/social/perfil/foto", () => {
  it("200: envia, grava na pasta da pessoa e devolve um link assinado que abre a imagem", async () => {
    const r = await enviar(PNG)
    expect(r.status).toBe(200)
    expect(r.headers.get("cache-control")).toBe("private, no-store")
    const { perfil } = await r.json()

    const caminho = await avatarNoBanco()
    expect(caminho).toMatch(new RegExp(`^${userId}/[0-9a-f-]{36}\\.png$`))
    expect(await naPasta()).toEqual([caminho])

    expect(perfil.avatar_url).toContain("X-Amz-Signature")
    const imagem = await fetch(perfil.avatar_url)
    expect(imagem.status).toBe(200)
    expect(new Uint8Array(await imagem.arrayBuffer())).toEqual(PNG)

    // O mesmo link chega pelo perfil por id (o cabeçalho do painel).
    const porId = await app.request(`/api/profile/${userId}`, { headers: { cookie, origin: ORIGEM } })
    expect((await porId.json()).profile.avatar_url).toBe(perfil.avatar_url)
  })

  it("trocar apaga a foto anterior e as sobras antigas da pasta", async () => {
    const anterior = await avatarNoBanco()
    const sobra = `${userId}/${randomUUID()}.webp`
    await enviarArquivo(BUCKET, sobra, PNG, "image/webp")
    // O relógio do armazenamento tem resolução de segundo: a foto nova precisa
    // ser gravada depois da sobra para ela sair.
    await new Promise((r) => setTimeout(r, 1100))

    const r = await enviar(JPEG, true, "nome-que-mente.png")
    expect(r.status).toBe(200)
    const nova = await avatarNoBanco()
    expect(nova).toMatch(/\.jpg$/)
    expect(nova).not.toBe(anterior)
    expect(await naPasta()).toEqual([nova])
  })

  it("400: arquivo que não é imagem (pelo conteúdo, não pelo nome) e campo ausente", async () => {
    const r = await enviar(PDF)
    expect(r.status).toBe(400)
    expect((await r.json()).error).toBe("Envie uma imagem JPEG, PNG ou WebP")
    expect((await enviar(null)).status).toBe(400)
  })

  it("413: acima de 2 MB, sem gravar nada", async () => {
    const antes = await naPasta()
    const grande = new Uint8Array(2 * 1024 * 1024 + 1)
    grande.set(PNG)
    expect((await enviar(grande)).status).toBe(413)
    expect(await naPasta()).toEqual(antes)
  })

  it("401: sem sessão", async () => {
    expect((await enviar(PNG, false)).status).toBe(401)
  })

  it("409: outra aba trocou a foto no meio do envio; o arquivo deste envio não fica órfão", async () => {
    const daOutraAba = `${userId}/${randomUUID()}.webp`
    await admin.query("begin")
    // Segura a linha do perfil: o envio grava o arquivo e para na troca.
    await admin.query("select 1 from public.profiles where id = $1 for update", [userId])
    const envio = enviar(PNG)
    try {
      await esperarAte(async () => {
        await admin.query("select pg_stat_clear_snapshot()")
        const { rows } = await admin.query(
          `select count(*)::int as n from pg_stat_activity
            where datname = current_database() and wait_event_type = 'Lock' and pid <> pg_backend_pid()`,
        )
        return rows[0].n === 1
      })
      await admin.query("update public.profiles set avatar_url = $2 where id = $1", [userId, daOutraAba])
    } finally {
      await admin.query("commit")
    }

    const r = await envio
    expect(r.status).toBe(409)
    expect(await avatarNoBanco()).toBe(daOutraAba)
    const pasta = await naPasta()
    expect(pasta.filter((c) => c.endsWith(".png"))).toEqual([])
  })

  it("DELETE: tira a foto do perfil e apaga o arquivo", async () => {
    await admin.query("update public.profiles set avatar_url = null where id = $1", [userId])
    expect((await enviar(PNG)).status).toBe(200)
    const r = await remover()
    expect(r.status).toBe(200)
    expect((await r.json()).perfil.avatar_url).toBeNull()
    expect(await avatarNoBanco()).toBeNull()
    expect(await naPasta()).not.toContainEqual(expect.stringMatching(/\.png$/))
  })

  it("429: com o limite estourado, nada é gravado", async () => {
    await admin.query(
      `insert into public.rate_limits (user_id, chave, janela_inicio, contagem)
       values ($1, 'foto-perfil', to_timestamp(floor(extract(epoch from now()) / 600) * 600), 10)
       on conflict (user_id, chave) do update set janela_inicio = excluded.janela_inicio, contagem = 10`,
      [userId],
    )
    const antes = await naPasta()
    const r = await enviar(PNG)
    expect(r.status).toBe(429)
    expect(await naPasta()).toEqual(antes)
  })
})
