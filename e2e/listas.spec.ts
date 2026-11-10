import { test, expect, type Browser, type Page, type Route } from "@playwright/test"
import { Client } from "pg"
import { exigirLocal } from "../tests/rls/guarda-ambiente"

/**
 * @RF09.6 @RF09.9 as listas de seguidores e de seguindo no perfil, e remover
 * seguidor (S05-M-listas).
 *
 * A Carla do seed é pública e começa sem vínculos; quem a segue é o Davi, numa
 * sessão própria do navegador, e no fim ele desfaz o vínculo pela própria rota.
 * O Bruno do seed é privado e também começa sem vínculos. "Ver mais" usa
 * respostas simuladas: o seed não tem 20 seguidores de ninguém, e a paginação
 * real (empate, cursor, sem duplicata nem salto) é provada em
 * tests/rls/10-listas.test.ts.
 */

const ANA = "teste.a@viajamais.local"
const SENHA = "viajamais123"
const CARLA = "teste.c@viajamais.local"
const DAVI = "teste.d@viajamais.local"

async function entrar(page: Page, email: string) {
  await page.goto("/auth/login")
  await page.fill("#email", email)
  await page.fill("#password", SENHA)
  await page.click('button[type="submit"]')
  await page.waitForURL("/dashboard")
}

/** O Davi numa sessão própria, que não se mistura com a da página do teste. */
async function sessaoDoDavi(browser: Browser) {
  const contexto = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: "pt-BR" })
  const pagina = await contexto.newPage()
  await entrar(pagina, DAVI)
  return pagina
}

async function daviSegueACarla(davi: Page) {
  const resposta = await davi.request.post("/api/social/perfis/carla/seguir")
  expect(resposta.ok(), "o Davi precisa conseguir seguir a Carla").toBeTruthy()
  expect((await resposta.json()).perfil.vinculo).toBe("seguindo")
}

/** Desfaz o vínculo do Davi com a Carla, se houver (deixar de seguir quem não se segue não dá erro). */
async function daviDesfaz(davi: Page) {
  const resposta = await davi.request.delete("/api/social/perfis/carla/seguir")
  expect(resposta.ok(), "o vínculo do Davi com a Carla precisa sair no fim").toBeTruthy()
  await davi.context().close()
}

/** Nada sai do navegador direto para a tabela (regra 1 do CLAUDE.md). */
function vigiarDataApi(page: Page) {
  const direto: string[] = []
  page.on("request", (pedido) => {
    if (/\/rest\/v1\/follows/.test(pedido.url())) direto.push(`${pedido.method()} ${pedido.url()}`)
  })
  return () => expect(direto, "nenhuma requisição do navegador a /rest/v1/follows").toEqual([])
}

const evidencia = (page: Page, nome: string) =>
  page.screenshot({ path: `docs/pfc/evidencias/S05-M-listas-${nome}-${test.info().project.name}.png`, fullPage: true })

function pessoaFalsa(i: number) {
  const username = `fake${String(i).padStart(2, "0")}`
  return { username, full_name: `Pessoa ${i}`, avatar_url: null, is_public: true }
}

test("o contador de seguidores abre a lista, e voltar retorna ao perfil; o de seguindo também", async ({ page, browser }) => {
  const nenhumDireto = vigiarDataApi(page)
  const davi = await sessaoDoDavi(browser)
  try {
    await daviSegueACarla(davi)
    await entrar(page, ANA)

    await page.goto("/u/carla")
    await page.getByRole("link", { name: "1 seguidor" }).click()
    await expect(page).toHaveURL("/u/carla/seguidores")
    await expect(page.getByRole("heading", { level: 1, name: "Seguidores de @carla" })).toBeVisible()
    const lista = page.getByRole("list", { name: "Seguidores de @carla" })
    await expect(lista.getByRole("link", { name: /@davi/ })).toBeVisible()
    // Não é a lista da Ana: ninguém tem Remover.
    await expect(page.getByRole("button", { name: /^Remover/ })).toHaveCount(0)
    await evidencia(page, "seguidores")

    await page.goBack()
    await expect(page).toHaveURL("/u/carla")
    await page.getByRole("link", { name: "0 seguindo" }).click()
    await expect(page).toHaveURL("/u/carla/seguindo")
    await expect(page.getByRole("heading", { level: 1, name: "@carla segue" })).toBeVisible()
    await expect(page.getByText("@carla ainda não segue ninguém.")).toBeVisible()

    // Pela lista, o perfil de quem está nela.
    await page.goto("/u/carla/seguidores")
    await lista.getByRole("link", { name: /@davi/ }).click()
    await expect(page).toHaveURL("/u/davi")
  } finally {
    await daviDesfaz(davi)
  }
  nenhumDireto()
})

test("perfil privado sem acesso: os contadores não são links, e a lista diz que a conta é privada", async ({ page }) => {
  await entrar(page, ANA)

  await page.goto("/u/bruno")
  await expect(page.getByText("0 seguidores")).toBeVisible()
  await expect(page.getByRole("link", { name: /seguidores|seguindo/ })).toHaveCount(0)

  await page.goto("/u/bruno/seguidores")
  await expect(page.getByText("Esta conta é privada")).toBeVisible()
  await expect(page.getByRole("list", { name: "Seguidores de @bruno" })).toHaveCount(0)
  await evidencia(page, "privado")

  for (const lado of ["seguidores", "seguindo"]) {
    expect((await page.request.get(`/api/social/perfis/bruno/${lado}`)).status()).toBe(403)
  }
})

test("remover pede confirmação, tira a pessoa em silêncio, e o removido segue de novo", async ({ page, browser }) => {
  const nenhumDireto = vigiarDataApi(page)
  const davi = await sessaoDoDavi(browser)
  try {
    await daviSegueACarla(davi)
    await entrar(page, CARLA)

    await page.goto("/u/carla")
    await page.getByRole("link", { name: "1 seguidor" }).click()
    // O Remover não espreme o nome: no celular ele cortava "Davi Teste" em "Davi Tes…" (regressão).
    const nome = page.getByRole("list", { name: "Seguidores de @carla" }).getByText("Davi Teste", { exact: true })
    await expect(nome).toBeVisible()
    expect(await nome.evaluate((el) => el.scrollWidth <= el.clientWidth), "o nome cabe inteiro, sem reticências").toBe(true)
    await page.getByRole("button", { name: "Remover @davi" }).click()

    const dialogo = page.getByRole("alertdialog")
    await expect(dialogo.getByRole("heading", { name: "Remover @davi dos seus seguidores?" })).toBeVisible()
    await expect(dialogo.getByText("@davi não recebe nenhum aviso e pode voltar a seguir você.")).toBeVisible()
    // A foto do diálogo sai depois da animação de entrada, não no meio dela.
    await dialogo.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)))
    await evidencia(page, "remover")
    await dialogo.getByRole("button", { name: "Remover", exact: true }).click()

    await expect(page.getByText("Ninguém segue você ainda.")).toBeVisible()
    await expect(page.getByRole("status").filter({ hasText: "@davi saiu dos seus seguidores." })).toBeAttached()
    await expect(page.getByRole("heading", { level: 1, name: "Seguidores de @carla" })).toBeFocused()
    await evidencia(page, "removido")

    await page.goBack()
    await expect(page).toHaveURL("/u/carla")
    await expect(page.getByRole("link", { name: "0 seguidores" })).toBeVisible()

    // Silencioso e sem barreira: o Davi vê "Seguir" de novo, e segue.
    expect((await (await davi.request.get("/api/social/perfis/carla")).json()).perfil.vinculo).toBe("nenhum")
    await daviSegueACarla(davi)
  } finally {
    await daviDesfaz(davi)
  }
  nenhumDireto()
})

test("Ver mais traz a página seguinte pelo cursor e some na última", async ({ page }) => {
  await entrar(page, ANA)
  const cursores: (string | null)[] = []
  await page.route("**/api/social/perfis/carla/seguidores*", async (rota) => {
    const cursor = new URL(rota.request().url()).searchParams.get("cursor")
    cursores.push(cursor)
    const corpo =
      cursor === "fake20"
        ? { pessoas: [21, 22, 23].map(pessoaFalsa), proximo: null, proprio: false }
        : { pessoas: Array.from({ length: 20 }, (_, i) => pessoaFalsa(i + 1)), proximo: "fake20", proprio: false }
    await rota.fulfill({ json: corpo })
  })

  await page.goto("/u/carla/seguidores")
  const itens = page.getByRole("list", { name: "Seguidores de @carla" }).getByRole("listitem")
  await expect(itens).toHaveCount(20)

  await page.getByRole("button", { name: "Ver mais" }).click()
  await expect(itens).toHaveCount(23)
  await expect(itens.last()).toContainText("@fake23")
  await expect(page.getByRole("button", { name: "Ver mais" })).toHaveCount(0)
  expect(cursores).toEqual([null, "fake20"])
})

test("se o cursor não acha mais a pessoa, a lista recomeça do início e avisa", async ({ page }) => {
  await entrar(page, ANA)
  const cursores: (string | null)[] = []
  await page.route("**/api/social/perfis/carla/seguidores*", async (rota) => {
    const cursor = new URL(rota.request().url()).searchParams.get("cursor")
    cursores.push(cursor)
    if (cursor) return rota.fulfill({ status: 400, json: { error: "A lista mudou; recarregue", codigo: "cursor_invalido" } })
    await rota.fulfill({ json: { pessoas: Array.from({ length: 20 }, (_, i) => pessoaFalsa(i + 1)), proximo: "fake20", proprio: false } })
  })

  await page.goto("/u/carla/seguidores")
  await page.getByRole("button", { name: "Ver mais" }).click()

  await expect(page.getByRole("status").filter({ hasText: "A lista mudou e foi carregada de novo." })).toBeAttached()
  await expect.poll(() => cursores).toEqual([null, "fake20", null])
})

test("com a sessão vencida, remover oferece entrar de novo", async ({ page, browser }) => {
  const davi = await sessaoDoDavi(browser)
  try {
    await daviSegueACarla(davi)
    await entrar(page, CARLA)
    await page.goto("/u/carla/seguidores")
    await page.getByRole("button", { name: "Remover @davi" }).click()

    await page.context().clearCookies()
    await page.getByRole("alertdialog").getByRole("button", { name: "Remover", exact: true }).click()

    await expect(page.getByText("Sua sessão expirou.")).toBeVisible()
    await expect(page.getByRole("link", { name: "Entrar de novo" })).toBeVisible()
    // A sessão vencida não removeu ninguém.
    expect((await (await davi.request.get("/api/social/perfis/carla")).json()).perfil.vinculo).toBe("seguindo")
  } finally {
    await daviDesfaz(davi)
  }
})

test("sem sessão, as listas mandam para o login, e as rotas respondem 401", async ({ page }) => {
  await page.goto("/u/carla/seguidores")
  await expect(page).toHaveURL(/\/auth\/login/)

  for (const [metodo, endereco] of [
    ["GET", "/api/social/perfis/carla/seguidores"],
    ["GET", "/api/social/perfis/carla/seguindo"],
    ["DELETE", "/api/social/seguidores/davi"],
  ] as const) {
    const resposta = await page.request.fetch(endereco, { method: metodo })
    expect(resposta.status(), `${metodo} ${endereco}`).toBe(401)
  }
})

/**
 * Conta nova pelo cadastro (sem confirmação de e-mail no ambiente local), como
 * no rateio-despesa: o perfil nasce sem username. Sai no fim pela conexão
 * direta, só no stack local, com os vínculos em cascata.
 */
async function contaSemUsername(browser: Browser) {
  const email = `listas.semnome.${Date.now()}@viajamais.local`
  const contexto = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: "pt-BR" })
  const pagina = await contexto.newPage()
  await pagina.goto("/auth/sign-up")
  await pagina.fill("#fullName", "Sem Nome")
  await pagina.fill("#email", email)
  await pagina.fill("#password", SENHA)
  await pagina.fill("#confirmPassword", SENHA)
  await pagina.click('button[type="submit"]')
  await pagina.waitForURL("/dashboard")
  return { pagina, email }
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

test("quem não tem username vê o aviso no lugar do Seguir, e o contador bate com a lista (regressão)", async ({ page, browser }) => {
  const { pagina: semNome, email } = await contaSemUsername(browser)
  try {
    await semNome.goto("/u/carla")
    await expect(semNome.getByText("Escolha um nome de usuário para seguir pessoas.")).toBeVisible()
    await expect(semNome.getByRole("link", { name: "Escolher nome de usuário" })).toHaveAttribute("href", "/dashboard/perfil")
    await expect(semNome.getByRole("button", { name: /^(Seguir|Solicitar)$/ })).toHaveCount(0)
    await evidencia(semNome, "sem-username")

    // Nem pela rota: quem não tem username não entra na rede de ninguém.
    const seguir = await semNome.request.post("/api/social/perfis/carla/seguir")
    expect(seguir.status()).toBe(403)
    expect((await seguir.json()).codigo).toBe("sem_username")

    // O contador da Carla é o número de pessoas da lista dela.
    await entrar(page, ANA)
    const perfil = (await (await page.request.get("/api/social/perfis/carla")).json()).perfil
    const lista = await (await page.request.get("/api/social/perfis/carla/seguidores")).json()
    expect(perfil.seguidores).toBe(lista.pessoas.length)
  } finally {
    await semNome.context().close()
    await apagarConta(email)
  }
})

test("uma remoção que termina depois de um recarregamento não traz a pessoa de volta (regressão)", async ({ page, browser }) => {
  const davi = await sessaoDoDavi(browser)
  const contextoDaAna = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: "pt-BR" })
  const anaPagina = await contextoDaAna.newPage()
  try {
    await daviSegueACarla(davi)
    await entrar(anaPagina, ANA)
    expect((await anaPagina.request.post("/api/social/perfis/carla/seguir")).ok()).toBeTruthy()

    await entrar(page, CARLA)
    // O Remover @davi fica preso até o recarregamento já ter trazido o davi.
    let soltarDavi!: () => void
    const daviPreso = new Promise<void>((r) => (soltarDavi = r))
    await page.route("**/api/social/seguidores/davi", async (rota: Route) => {
      await daviPreso
      await rota.continue()
    })
    // O recarregamento pedido pelo 404 da Ana sai ainda com o davi na lista, e
    // a resposta dele só chega depois de o Remover @davi terminar.
    let cargas = 0
    let soltarCarga!: () => void
    const cargaPresa = new Promise<void>((r) => (soltarCarga = r))
    await page.route("**/api/social/perfis/carla/seguidores", async (rota: Route) => {
      cargas++
      if (cargas !== 2) return rota.continue()
      const resposta = await rota.fetch()
      soltarDavi()
      await cargaPresa
      await rota.fulfill({ response: resposta })
    })

    await page.goto("/u/carla/seguidores")
    await expect(page.getByRole("button", { name: "Remover @ana" })).toBeVisible()

    await page.getByRole("button", { name: "Remover @davi" }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Remover", exact: true }).click()

    // A Ana deixa de seguir em outra aba; o Remover @ana dá 404 e recarrega.
    expect((await anaPagina.request.delete("/api/social/perfis/carla/seguir")).ok()).toBeTruthy()
    await page.getByRole("button", { name: "Remover @ana" }).click()
    const remocaoDoDavi = page.waitForResponse((r) => r.url().endsWith("/api/social/seguidores/davi"))
    await page.getByRole("alertdialog").getByRole("button", { name: "Remover", exact: true }).click()

    expect((await remocaoDoDavi).status()).toBe(200)
    await expect(page.getByRole("button", { name: "Remover @davi" })).toHaveCount(0)
    soltarCarga()

    await expect(page.getByText("Ninguém segue você ainda.")).toBeVisible()
    await expect(page.getByRole("button", { name: "Remover @davi" })).toHaveCount(0)
  } finally {
    await anaPagina.request.delete("/api/social/perfis/carla/seguir")
    await contextoDaAna.close()
    await daviDesfaz(davi)
  }
})
