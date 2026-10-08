import fs from "node:fs"
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js"
import { Client } from "pg"
import { exigirLocal, variavelObrigatoria } from "./guarda-ambiente"

/**
 * Bucket de avatares e o trigger de `profiles.avatar_url` (migration social_avatares).
 *
 * O bucket não tem policy nenhuma para usuário: quem grava e apaga é a rota de
 * foto, com a chave de serviço, depois de conferir os bytes. Aqui se prova que,
 * com o JWT que está no navegador, ninguém faz nada nele pela API do Storage —
 * nem na própria pasta: enviar, sobrescrever, mover, copiar, listar, apagar.
 *
 * O arquivo de teste é criado pela API do Storage com a chave de serviço, para
 * existir de verdade: linha em storage.objects e arquivo no disco. Uma linha
 * inserida só no banco não basta — o Storage confere a RLS e depois copia o
 * arquivo; se uma policy liberasse o move, a cópia falharia por falta do
 * arquivo e o teste veria erro pelo motivo errado. "Apagar deu certo" do
 * Storage também não prova nada (ele responde sem erro e apaga zero), então
 * cada caso confere o estado depois, pelo banco.
 *
 * O bucket é compartilhado com a aplicação (o E2E da foto, por exemplo): a
 * limpeza e as conferências olham só para os nomes que este arquivo usa.
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
/** Outro conteúdo, para que uma sobrescrita bem-sucedida apareça nos bytes. */
const PNG_OUTRO = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

/**
 * Chave de serviço, só no setup e na limpeza — nenhum caso de teste a usa. No
 * CI vem de `supabase status -o env` (SERVICE_ROLE_KEY), como API_URL e
 * ANON_KEY; na máquina, do SUPABASE_SERVICE_ROLE_KEY do `.env.local`, que o
 * preparar-ambiente.ts não repassa. A API_URL já passou por `exigirLocal`, e é
 * só com ela que a chave é usada.
 */
function chaveDeServico(): string {
  const doAmbiente = process.env.SERVICE_ROLE_KEY
  if (doAmbiente) return doAmbiente
  const linha = fs.existsSync(".env.local")
    ? fs.readFileSync(".env.local", "utf8").match(/^\s*SUPABASE_SERVICE_ROLE_KEY\s*=\s*"?([^"#\s]+)/m)
    : null
  return linha?.[1] ?? variavelObrigatoria("SERVICE_ROLE_KEY")
}

function novoCliente(chave = CHAVE) {
  return createClient(API, chave, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** `<pasta>/<variação do ARQUIVO>.png`: cada tentativa escreve num nome conhecido. */
function nomeNaPasta(pasta: string, prefixo = "0b") {
  return `${pasta}/${ARQUIVO.replace("0b", prefixo)}.png`
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
let servico: SupabaseClient
let db: Client
let idAna: string
let idBruno: string
let idCarla: string
let arquivoDaAna: string

/**
 * Todo nome em que algum caso tenta escrever — enviar, mover ou copiar. Se a RLS
 * deixasse passar, o arquivo apareceria num destes; a limpeza e a prova de
 * estado olham só para eles.
 */
function nomesDoTeste() {
  return [
    arquivoDaAna,
    ...["1b", "2b", "3b", "4b"].map((prefixo) => nomeNaPasta(idAna, prefixo)),
    nomeNaPasta(idBruno),
  ]
}

/** Nomes do teste no bucket, vistos pelo banco — a prova de estado depois de cada tentativa. */
async function objetosNoBucket() {
  const { rows } = await db.query(
    "select name from storage.objects where bucket_id = $1 and name = any($2) order by name",
    [BUCKET, nomesDoTeste()],
  )
  return rows.map((r) => r.name as string)
}

/** Bytes do arquivo da Ana pela URL pública: sobrescrever não muda o nome, só o conteúdo. */
async function conteudoDoArquivoDaAna() {
  const resposta = await fetch(`${API}/storage/v1/object/public/${BUCKET}/${arquivoDaAna}`)
  return Buffer.from(await resposta.arrayBuffer())
}

/**
 * Apaga só o que o teste pode ter criado, pela API com a chave de serviço — sai
 * a linha e o arquivo no disco. Confere pelo banco que não sobrou nada.
 */
async function limparArquivosDoTeste() {
  const { error } = await servico.storage.from(BUCKET).remove(nomesDoTeste())
  if (error) throw new Error(`limpeza do bucket falhou: ${error.message}`)
  const sobra = await objetosNoBucket()
  if (sobra.length) throw new Error(`limpeza do bucket deixou: ${sobra.join(", ")}`)
}

beforeAll(async () => {
  const a = await logar("teste.a@viajamais.local")
  const b = await logar("teste.b@viajamais.local")
  ana = a.cliente
  bruno = b.cliente
  idAna = a.usuario.id
  idBruno = b.usuario.id
  visitante = novoCliente()
  servico = novoCliente(chaveDeServico())

  db = new Client({ connectionString: CONEXAO })
  await db.connect()
  const { rows } = await db.query("select id from auth.users where email = 'teste.c@viajamais.local'")
  idCarla = rows[0].id

  arquivoDaAna = nomeNaPasta(idAna)
  await limparArquivosDoTeste() // sobra de uma rodada interrompida

  const { error } = await servico.storage.from(BUCKET).upload(arquivoDaAna, PNG, { contentType: "image/png" })
  if (error) throw new Error(`não criou o arquivo de teste: ${error.message}`)
  // A chave de serviço não tem dono; a Ana como dona é o pior caso, para uma
  // policy por owner_id também aparecer aqui.
  await db.query("update storage.objects set owner_id = $1 where bucket_id = $2 and name = $3", [
    idAna,
    BUCKET,
    arquivoDaAna,
  ])
})

afterAll(async () => {
  try {
    await limparArquivosDoTeste()
    await ana.from("profiles").update({ avatar_url: null }).eq("id", idAna)
  } finally {
    await db.end()
  }
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
  it("o arquivo de teste existe de verdade: linha no banco e bytes no Storage", async () => {
    // Sem isso, os casos de mover e copiar abaixo poderiam passar pelo motivo
    // errado: a RLS deixaria, e a cópia falharia por falta do arquivo.
    expect(await objetosNoBucket()).toEqual([arquivoDaAna])
    expect(await conteudoDoArquivoDaAna()).toEqual(PNG)
  })

  it("Ana não envia nem na própria pasta (só a rota envia)", async () => {
    const { error } = await ana.storage
      .from(BUCKET)
      .upload(nomeNaPasta(idAna, "1b"), PNG, { contentType: "image/png" })
    expect(error).not.toBeNull()
    expect(await objetosNoBucket()).toEqual([arquivoDaAna])
  })

  it("Ana não envia na pasta do Bruno, e o visitante não envia em lugar nenhum", async () => {
    const { error: daAna } = await ana.storage
      .from(BUCKET)
      .upload(nomeNaPasta(idBruno), PNG, { contentType: "image/png" })
    expect(daAna).not.toBeNull()

    const { error: doVisitante } = await visitante.storage
      .from(BUCKET)
      .upload(nomeNaPasta(idAna, "2b"), PNG, { contentType: "image/png" })
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

  it("ninguém sobrescreve, move nem copia — nem a Ana dentro da própria pasta", async () => {
    // Dentro da própria pasta é o caso que uma policy "cada um na sua pasta"
    // liberaria; entre pastas, o WITH CHECK dela ainda barraria o destino.
    for (const cliente of [ana, bruno]) {
      const { error: sobrescreveu } = await cliente.storage
        .from(BUCKET)
        .update(arquivoDaAna, PNG_OUTRO, { contentType: "image/png" })
      expect(sobrescreveu).not.toBeNull()
    }

    const { error: moveuNaPasta } = await ana.storage.from(BUCKET).move(arquivoDaAna, nomeNaPasta(idAna, "3b"))
    expect(moveuNaPasta).not.toBeNull()

    const { error: moveu } = await ana.storage.from(BUCKET).move(arquivoDaAna, nomeNaPasta(idBruno))
    expect(moveu).not.toBeNull()

    const { error: copiouNaPasta } = await ana.storage.from(BUCKET).copy(arquivoDaAna, nomeNaPasta(idAna, "4b"))
    expect(copiouNaPasta).not.toBeNull()

    const { error: copiou } = await bruno.storage.from(BUCKET).copy(arquivoDaAna, nomeNaPasta(idBruno))
    expect(copiou).not.toBeNull()

    expect(await objetosNoBucket()).toEqual([arquivoDaAna])
    expect(await conteudoDoArquivoDaAna()).toEqual(PNG)
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
