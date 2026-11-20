import { test, expect, type APIRequestContext, type Page } from "@playwright/test"
import { Client } from "pg"
import sharp from "sharp"
import { exigirLocal } from "../tests/rls/guarda-ambiente"
import { cadastrar, emailUnico, entrar } from "./fixtures/contas"
import { zerarLimites } from "./fixtures/limite"
import { USUARIOS } from "../tests/fixtures/usuarios"

/**
 * O "Perfil" do menu é o próprio perfil, no modelo do Instagram
 * (S06-M-perfil-instagram):
 *
 * - @RF02.1 /dashboard/perfil mostra o cabeçalho (foto, nome, @username,
 *   visibilidade, contadores e bio), "Editar perfil", "Criar" e as abas;
 * - @RF09.6 os contadores de seguidores e de seguindo abrem as listas;
 * - @RF09.16 a grade de Publicações abre o post (/feed/<id>), e o contador
 *   bate com a grade; @RF09.14 a aba Marcações está ao lado;
 * - "Editar perfil" abre o formulário em /dashboard/perfil/editar, e salvar
 *   volta ao perfil;
 * - quem não tem username cai direto no formulário.
 *
 * Usa o Davi, usuário do seed reservado aos E2E de perfil. Estado: a bio volta
 * à do seed, o post criado pela rota sai no fim (e o que sobrou de uma
 * execução interrompida sai no começo), e a conta sem username é apagada.
 */

const DAVI = USUARIOS.davi
const BIO_DO_SEED = "Viajante de teste — usado pelo E2E de perfil."
const LEGENDA = "Perfil próprio: post da grade (E2E)"

const projeto = () => test.info().project.name
const evidencia = (page: Page, passo: string) =>
  page.screenshot({ path: `docs/pfc/evidencias/S06-M-perfil-${passo}-${projeto()}.png`, fullPage: true })

const cabecalho = (page: Page) => page.getByRole("region", { name: "Perfil de @davi" })
const contadores = (page: Page) => cabecalho(page).getByRole("list", { name: "Contadores do perfil" })

/** O caminho de quem usa: a aba "Perfil" do rodapé no celular, "Meu perfil" no menu do avatar no desktop. */
async function abrirPerfilPeloMenu(page: Page) {
  if (projeto() === "mobile") {
    await page.getByRole("navigation", { name: "Atalhos" }).getByRole("link", { name: "Perfil" }).click()
  } else {
    await page.getByRole("button", { name: /Minha conta/ }).click()
    await page.getByRole("menuitem", { name: "Meu perfil" }).click()
  }
  await page.waitForURL("/dashboard/perfil")
}

type ItemDaGrade = { id: string; descricao: string }

async function gradeDoDavi(api: APIRequestContext): Promise<ItemDaGrade[]> {
  const itens: ItemDaGrade[] = []
  let cursor: string | null = null
  do {
    const sufixo: string = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""
    const resposta = await api.get(`/api/social/perfis/davi/posts${sufixo}`)
    expect(resposta.ok(), "a grade do Davi").toBeTruthy()
    const pagina = (await resposta.json()) as { posts: ItemDaGrade[]; proximo: string | null }
    itens.push(...pagina.posts)
    cursor = pagina.proximo
  } while (cursor)
  return itens
}

async function apagarPost(api: APIRequestContext, id: string) {
  expect([200, 404], `o post ${id} precisa sair no fim`).toContain((await api.delete(`/api/social/posts/${id}`)).status())
}

/** Cria um post do Davi pela rota, como o "Criar" faz, com uma foto gerada na hora. */
async function criarPost(api: APIRequestContext) {
  await zerarLimites()
  const foto = await sharp({ create: { width: 400, height: 400, channels: 3, background: "#2050e0" } }).png().toBuffer()
  const form = new FormData()
  form.append("fotos", new File([new Uint8Array(foto)], "praia.png", { type: "image/png" }))
  form.append("legenda", LEGENDA)
  const resposta = await api.post("/api/social/posts", { multipart: form })
  expect(resposta.status(), "criar o post").toBe(201)
  return (await resposta.json()).post.id as string
}

async function apagarConta(email: string) {
  const db = new Client({ connectionString: exigirLocal(process.env.DATABASE_URL ?? "", "DATABASE_URL") })
  await db.connect()
  try {
    await db.query("delete from auth.users where email = $1", [email])
  } finally {
    await db.end()
  }
}

test("@RF02.1 o Perfil do menu mostra o cabeçalho com contadores, Editar perfil, Criar e as abas", async ({ page }) => {
  await entrar(page, DAVI.email)
  await abrirPerfilPeloMenu(page)

  await expect(cabecalho(page).getByRole("heading", { level: 1, name: DAVI.nome })).toBeVisible()
  await expect(cabecalho(page).getByText("@davi", { exact: true })).toBeVisible()
  await expect(cabecalho(page).getByText("Público", { exact: true })).toBeVisible()
  await expect(cabecalho(page).getByText(BIO_DO_SEED)).toBeVisible()
  const itens = contadores(page).getByRole("listitem")
  await expect(itens).toHaveCount(3)
  await expect(itens.nth(0)).toHaveText(/^\d+ publicaç(ão|ões)$/)
  await expect(itens.nth(1)).toHaveText(/^\d+ seguidor(es)?$/)
  await expect(itens.nth(2)).toHaveText(/^\d+ seguindo$/)
  await expect(cabecalho(page).getByRole("link", { name: "Editar perfil" })).toHaveAttribute("href", "/dashboard/perfil/editar")
  await expect(cabecalho(page).getByRole("button", { name: "Criar" })).toBeVisible()
  await expect(page.getByRole("tab", { name: "Publicações" })).toHaveAttribute("aria-selected", "true")
  await expect(page.getByRole("tab", { name: "Marcações" })).toBeVisible()
  // Nada de "Ver página pública" (decisão do Micael em 14/10).
  await expect(page.getByRole("link", { name: /página pública/i })).toHaveCount(0)
  await evidencia(page, "01-cabecalho")

  await page.getByRole("tab", { name: "Marcações" }).click()
  await expect(page.getByRole("tab", { name: "Marcações" })).toHaveAttribute("aria-selected", "true")
})

test("@RF09.6 os contadores abrem as listas de seguidores e de seguindo", async ({ page }) => {
  await entrar(page, DAVI.email)
  await page.goto("/dashboard/perfil")

  await contadores(page).getByRole("link", { name: /^\d+ seguidor(es)?$/ }).click()
  await page.waitForURL("/u/davi/seguidores")
  await expect(page.getByRole("heading", { level: 1, name: "Seguidores de @davi" })).toBeVisible()
  await evidencia(page, "02-lista-seguidores")

  await page.goBack()
  await page.waitForURL("/dashboard/perfil")
  await contadores(page).getByRole("link", { name: /^\d+ seguindo$/ }).click()
  await page.waitForURL("/u/davi/seguindo")
  await expect(page.getByRole("heading", { level: 1, name: "@davi segue" })).toBeVisible()
  await evidencia(page, "03-lista-seguindo")
})

test("@RF09.16 a grade abre o post, e o contador de publicações bate com ela", async ({ page }) => {
  await entrar(page, DAVI.email)
  const api = page.request
  // Resíduo de uma execução interrompida.
  for (const item of (await gradeDoDavi(api)).filter((p) => p.descricao === LEGENDA)) await apagarPost(api, item.id)

  const id = await criarPost(api)
  try {
    const total = (await gradeDoDavi(api)).length
    await page.goto("/dashboard/perfil")

    await expect(contadores(page).getByRole("listitem").nth(0)).toHaveText(
      `${total} ${total === 1 ? "publicação" : "publicações"}`,
    )
    const grade = page.getByRole("region", { name: "Publicações" })
    await expect(grade.getByRole("link", { name: new RegExp(LEGENDA.replace(/[()]/g, "\\$&")) })).toBeVisible()
    await evidencia(page, "04-grade")

    await grade.getByRole("link", { name: new RegExp(LEGENDA.replace(/[()]/g, "\\$&")) }).click()
    await page.waitForURL(`/feed/${id}`)
    await expect(page.getByText(LEGENDA).first()).toBeVisible()
    await evidencia(page, "05-post-aberto")
  } finally {
    await apagarPost(api, id)
  }
})

test("Editar perfil abre o formulário, e salvar volta ao perfil", async ({ page }) => {
  await entrar(page, DAVI.email)
  const bioNova = `Bio do E2E do perfil (${projeto()})`
  try {
    await page.goto("/dashboard/perfil")
    await cabecalho(page).getByRole("link", { name: "Editar perfil" }).click()
    await page.waitForURL("/dashboard/perfil/editar")
    await expect(page.getByRole("heading", { level: 1, name: "Editar perfil" })).toBeVisible()
    await expect(page.locator("#username")).toHaveValue("davi")
    await expect(page.getByRole("link", { name: "Voltar ao perfil" })).toHaveAttribute("href", "/dashboard/perfil")

    await page.locator("#bio").fill(bioNova)
    await evidencia(page, "06-editar")
    await page.getByRole("button", { name: "Salvar perfil" }).click()

    await page.waitForURL("/dashboard/perfil")
    await expect(cabecalho(page).getByText(bioNova)).toBeVisible()
    await evidencia(page, "07-salvo-volta-ao-perfil")
  } finally {
    const resposta = await page.request.patch("/api/social/perfil", { data: { bio: BIO_DO_SEED } })
    expect(resposta.ok(), "a bio do Davi volta à do seed").toBeTruthy()
  }
})

test("conta sem username cai no formulário de editar", async ({ page }) => {
  const email = emailUnico("perfil.semnome")
  await zerarLimites()
  await cadastrar(page, "Sem Nome", email)
  try {
    await page.goto("/dashboard/perfil")

    await page.waitForURL("/dashboard/perfil/editar")
    await expect(page.getByRole("heading", { level: 1, name: "Editar perfil" })).toBeVisible()
    await expect(page.locator("#username")).toHaveValue("")
    // Sem username, voltar ao perfil só traria de volta para cá.
    await expect(page.getByRole("link", { name: "Voltar ao perfil" })).toHaveCount(0)
    await expect(page.getByRole("region", { name: /^Perfil de @/ })).toHaveCount(0)
    await evidencia(page, "08-sem-username-no-editar")
  } finally {
    await page.context().close()
    await apagarConta(email)
  }
})
