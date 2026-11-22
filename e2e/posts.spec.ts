import { test, expect, type APIRequestContext, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test"
import sharp from "sharp"
import { entrar } from "./fixtures/contas"
import { zerarLimites } from "./fixtures/limite"
import { zerarRecusas } from "./fixtures/recusas"
import { USUARIOS } from "../tests/fixtures/usuarios"
import { MARCAS, chunksDoWebp, contemTexto, jpegComGps } from "../tests/fixtures/imagens"

/**
 * O post no modelo do Instagram (S06, redesenho de 18/11), visto pelo navegador:
 *
 * - @RF09.15 criar pelo "Criar" do feed: 1 a 3 fotos na ordem escolhida,
 *   legenda e "Marcar pessoas"; editar legenda e marcações; excluir;
 * - @RF09.17 o detalhe /feed/<id>: carrossel, legenda, "Com @…" e data; para
 *   quem não pode ver (ou id que não existe), "Esta publicação não está
 *   disponível";
 * - @RF09.16 a aba "Publicações" do perfil: grade, vazio e "Carregar mais";
 * - @RF09.13 marcar e a recusa: quem removeu a própria marca não volta a ser
 *   marcado pela autora.
 *
 * Papéis: a Carla (perfil público) é a autora; o Davi é marcado (público); o
 * Bruno (privado, que o Davi não segue) é a "outra conta" que vê o post da
 * Carla e o autor do post que o Davi não pode ver. A Ana não entra (o post dela
 * na viagem do seed fica intocado).
 *
 * Estado: os posts que a tela não cria nascem por POST /api/social/posts, com
 * imagens geradas na hora pelo sharp (sem binário no repositório). Todo post
 * criado — pela tela ou pela API — entra em `criados` e sai no `afterAll` por
 * DELETE /api/social/posts/<id>. No começo, posts com as legendas deste spec que
 * sobraram de uma execução interrompida saem do mesmo jeito. A privacidade de
 * Carla, Bruno e Davi volta a ser a que era.
 *
 * Cada pessoa entra uma vez pela tela de login e os testes reaproveitam os
 * cookies (o Auth local limita o login a 30 por 5 minutos). O limite de envios
 * de foto (10 em 10 minutos, `LIMITES.fotoPerfil`) é zerado antes de cada
 * criação (ver ./fixtures/limite): aqui ele não é o assunto.
 */

const CARLA = USUARIOS.carla
const BRUNO = USUARIOS.bruno
const DAVI = USUARIOS.davi

type Sessao = { contexto: BrowserContext; api: APIRequestContext; id: string; username: string }
type Arquivo = { name: string; mimeType: string; buffer: Buffer }

/** Legendas fixas: servem de figura e identificam resíduos de execuções interrompidas. */
const LEGENDA = {
  tela: "Pôr do sol na Chapada, com a turma toda.",
  vitrine: "Três paradas no caminho para Pirenópolis.",
  privado: "Só para quem me segue.",
  editar: "Cachoeira do Abade antes da chuva.",
  editada: "Cachoeira do Abade — a chuva chegou logo depois.",
  excluir: "Esta vai sair do perfil.",
  recusa: "Trilha do Rio dos Couros.",
  seguranca: "Foto tirada no celular, com GPS ligado.",
} as const
const LEGENDA_GRADE = (n: number) => `Página da grade, post ${n}`
const ehResiduo = (descricao: string) =>
  (Object.values(LEGENDA) as string[]).includes(descricao) || /^Página da grade, post \d+$/.test(descricao)

const projeto = () => test.info().project.name
/** `inteira: false` para diálogo aberto: na captura da página inteira, o diálogo fixo fica solto no meio do feed. */
const evidencia = (page: Page, passo: string, { inteira = true } = {}) =>
  page.screenshot({ path: `docs/pfc/evidencias/S06-M-posts-${passo}-${projeto()}.png`, fullPage: inteira })

const sessoes: Sessao[] = []
let carla: Sessao
let bruno: Sessao
let davi: Sessao
const privacidadeOriginal = new Map<Sessao, boolean>()
/** Todo post criado pelo spec, para sair no fim. */
const criados: { autora: Sessao; id: string }[] = []

// ---------------------------------------------------------------- imagens

const CORES = { azul: "#2050e0", verde: "#20a040", vermelho: "#e03020" } as const
type Cor = keyof typeof CORES

async function png(nome: string, cor: Cor, lado = 400): Promise<Arquivo> {
  const buffer = await sharp({ create: { width: lado, height: lado, channels: 3, background: CORES[cor] } })
    .png()
    .toBuffer()
  return { name: nome, mimeType: "image/png", buffer }
}

/** O canal que domina a imagem: prova qual das fotos de teste está numa posição. */
async function corDe(bytes: Buffer): Promise<Cor> {
  const { data } = await sharp(bytes).resize(1, 1).raw().toBuffer({ resolveWithObject: true })
  const [r, g, b] = [data[0], data[1], data[2]]
  if (b > r && b > g) return "azul"
  if (g > r && g > b) return "verde"
  return "vermelho"
}

let PRAIA: Arquivo
let SERRA: Arquivo
let RIO: Arquivo
let CIDADE: Arquivo

// ---------------------------------------------------------------- sessões e estado

async function perfilDe(api: APIRequestContext) {
  const resposta = await api.get("/api/social/perfil")
  expect(resposta.ok()).toBeTruthy()
  return (await resposta.json()).perfil as { id: string; username: string; is_public: boolean }
}

async function abrirSessao(browser: Browser, baseURL: string, email: string): Promise<Sessao> {
  const contexto = await browser.newContext({ baseURL, locale: "pt-BR", timezoneId: "America/Sao_Paulo" })
  const pagina = await contexto.newPage()
  await entrar(pagina, email)
  const perfil = await perfilDe(pagina.request)
  const sessao = { contexto, api: pagina.request, id: perfil.id, username: perfil.username }
  sessoes.push(sessao)
  return sessao
}

async function definirPrivacidade(sessao: Sessao, publico: boolean) {
  const resposta = await sessao.api.patch("/api/social/perfil", { data: { is_public: publico } })
  expect(resposta.ok(), "a privacidade do perfil precisa mudar pela rota").toBeTruthy()
}

async function exigirPrivacidade(sessao: Sessao, publico: boolean) {
  privacidadeOriginal.set(sessao, (await perfilDe(sessao.api)).is_public)
  await definirPrivacidade(sessao, publico)
}

type ItemDaGrade = { id: string; foto: string | null; quantidade_fotos: number; descricao: string }

/** Todas as páginas da aba Publicações de `username`, lidas por `quem`. */
async function gradeCompleta(quem: Sessao, username: string): Promise<ItemDaGrade[]> {
  const itens: ItemDaGrade[] = []
  let cursor: string | null = null
  do {
    const sufixo: string = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""
    const resposta = await quem.api.get(`/api/social/perfis/${username}/posts${sufixo}`)
    expect(resposta.ok(), `a grade de @${username}`).toBeTruthy()
    const pagina = (await resposta.json()) as { posts: ItemDaGrade[]; proximo: string | null }
    itens.push(...pagina.posts)
    cursor = pagina.proximo
  } while (cursor)
  return itens
}

/** Apaga os posts de `autora` com as legendas deste spec que sobraram de outra execução. */
async function apagarResiduos(autora: Sessao) {
  for (const item of (await gradeCompleta(autora, autora.username)).filter((p) => ehResiduo(p.descricao))) {
    expect((await autora.api.delete(`/api/social/posts/${item.id}`)).ok(), `resíduo "${item.descricao}"`).toBeTruthy()
  }
}

/** Cria um post pela rota, como o "Criar" faz, e o registra para sair no fim. */
async function criarPelaApi(
  autora: Sessao,
  { fotos, legenda, marcados = [] }: { fotos: Arquivo[]; legenda: string; marcados?: string[] },
) {
  await zerarLimites()
  const form = new FormData()
  for (const foto of fotos) form.append("fotos", new File([new Uint8Array(foto.buffer)], foto.name, { type: foto.mimeType }))
  form.append("legenda", legenda)
  if (marcados.length > 0) form.append("marcados", JSON.stringify(marcados))
  const resposta = await autora.api.post("/api/social/posts", { multipart: form })
  expect(resposta.status(), `criar o post "${legenda}"`).toBe(201)
  const id = (await resposta.json()).post.id as string
  criados.push({ autora, id })
  return id
}

async function apagarPost(autora: Sessao, id: string) {
  const resposta = await autora.api.delete(`/api/social/posts/${id}`)
  expect([200, 404], `o post ${id} precisa sair no fim`).toContain(resposta.status())
}

async function usarSessao(page: Page, sessao: Sessao) {
  await page.context().addCookies(await sessao.contexto.cookies())
}

// ---------------------------------------------------------------- tela

const dialogo = (page: Page) => page.getByRole("dialog")
const miniaturas = (page: Page) =>
  page.getByRole("list", { name: "Fotos escolhidas, na ordem do carrossel" }).getByRole("img")

async function abrirCriarNoFeed(page: Page) {
  await page.goto("/feed")
  await page.getByRole("button", { name: "Criar", exact: true }).click()
  await expect(dialogo(page)).toBeVisible()
  await expect(page.getByRole("heading", { name: "Criar publicação" })).toBeVisible()
}

async function escolherFotos(page: Page, botao: string, arquivos: Arquivo[]) {
  const [seletor] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: botao }).click()])
  await seletor.setFiles(arquivos)
}

async function conferirMiniaturas(page: Page, nomes: string[]) {
  await expect(miniaturas(page)).toHaveCount(nomes.length)
  for (const [i, nome] of nomes.entries()) {
    await expect(miniaturas(page).nth(i)).toHaveAttribute("alt", `Foto ${i + 1}: ${nome}`)
  }
}

/** Busca no "Marcar pessoas" e marca a pessoa de `username`. */
async function marcar(page: Page, termo: string, username: string) {
  await page.getByRole("combobox", { name: "Marcar pessoas" }).fill(termo)
  await opcaoDe(page, username).click()
  await expect(fichaDe(page, username)).toBeVisible()
}

const opcaoDe = (page: Page, username: string) =>
  page.getByRole("listbox").getByRole("option").filter({ hasText: new RegExp(`@${username}( · .*)?$`) })
const fichaDe = (page: Page, username: string) =>
  page.getByRole("list", { name: "Pessoas marcadas" }).getByRole("listitem").filter({ hasText: `@${username}` })

/** O fluxo inteiro do "Criar" pela tela; devolve o id do post (lido da URL do detalhe). */
async function criarPeloDialogo(
  page: Page,
  { fotos, legenda, marcar: quem }: { fotos: Arquivo[]; legenda: string; marcar?: { termo: string; username: string } },
) {
  await zerarLimites()
  await abrirCriarNoFeed(page)
  await escolherFotos(page, "Selecionar fotos do dispositivo", fotos)
  await conferirMiniaturas(page, fotos.map((f) => f.name))
  await page.getByRole("button", { name: "Avançar" }).click()
  await page.getByLabel("Legenda", { exact: true }).fill(legenda)
  if (quem) await marcar(page, quem.termo, quem.username)
  await page.getByRole("button", { name: "Compartilhar" }).click()
  await expect(page.getByText("Publicação compartilhada", { exact: true }).first()).toBeVisible()
  await page.waitForURL(/\/feed\/[0-9a-f-]{36}$/)
  const id = new URL(page.url()).pathname.split("/").pop()!
  criados.push({ autora: carla, id })
  await expect(artigoDe(page, "carla")).toBeVisible()
  return id
}

const artigoDe = (page: Page, username: string) => page.getByRole("article", { name: `Publicação de @${username}` })
const carrossel = (page: Page, username: string) => page.getByRole("region", { name: `Fotos da publicação de @${username}` })
const indisponivel = (page: Page) => page.getByRole("heading", { name: "Esta publicação não está disponível" })

/** A foto visível do carrossel (o slide que não está escondido do leitor de tela). */
const fotoAtual = (regiao: Locator) => regiao.locator('[aria-roledescription="slide"][aria-hidden="false"] img')

async function corDaFotoNaTela(page: Page, foto: Locator) {
  const src = (await foto.getAttribute("src"))!
  return corDe(await (await page.request.get(src)).body())
}

const dataEsperada = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }).format(
    new Date(iso),
  )

// ---------------------------------------------------------------- ciclo de vida

test.beforeAll(async ({ browser }, info) => {
  test.setTimeout(120_000)
  const baseURL = info.project.use.baseURL!

  ;[PRAIA, SERRA, RIO, CIDADE] = await Promise.all([
    png("praia.png", "azul"),
    png("serra.png", "verde"),
    png("rio.png", "vermelho"),
    png("cidade.png", "azul"),
  ])

  carla = await abrirSessao(browser, baseURL, CARLA.email)
  bruno = await abrirSessao(browser, baseURL, BRUNO.email)
  davi = await abrirSessao(browser, baseURL, DAVI.email)

  await exigirPrivacidade(carla, true)
  await exigirPrivacidade(bruno, false)
  await exigirPrivacidade(davi, true)

  await apagarResiduos(carla)
  await apagarResiduos(bruno)
  await zerarRecusas([CARLA.email, BRUNO.email, DAVI.email])
})

test.afterAll(async () => {
  test.setTimeout(120_000)
  try {
    for (const { autora, id } of criados.splice(0)) await apagarPost(autora, id)
    for (const [sessao, publico] of privacidadeOriginal) await definirPrivacidade(sessao, publico)
  } finally {
    await Promise.all(sessoes.splice(0).map((sessao) => sessao.contexto.close()))
  }
})

// ---------------------------------------------------------------- 1. criar pelo feed

test.describe("criar pelo feed", () => {
  test("escolher duas fotos mostra as miniaturas na ordem da escolha", async ({ page }) => {
    await usarSessao(page, carla)
    await abrirCriarNoFeed(page)

    await escolherFotos(page, "Selecionar fotos do dispositivo", [PRAIA, SERRA])

    await conferirMiniaturas(page, ["praia.png", "serra.png"])
    await expect(dialogo(page).getByText("2 de 3 fotos.", { exact: true })).toBeVisible()
    await evidencia(page, "01-fotos-escolhidas", { inteira: false })
  })

  test("escolher além de três fotos avisa que uma ficou de fora e mantém as três primeiras", async ({ page }) => {
    await usarSessao(page, carla)
    await abrirCriarNoFeed(page)
    await escolherFotos(page, "Selecionar fotos do dispositivo", [PRAIA, SERRA])

    await escolherFotos(page, "Adicionar", [RIO, CIDADE])

    await expect(page.getByText("Um post tem até 3 fotos; 1 ficou de fora.").first()).toBeVisible()
    await conferirMiniaturas(page, ["praia.png", "serra.png", "rio.png"])
    await expect(dialogo(page).getByText("3 de 3 fotos — limite atingido.", { exact: true })).toBeVisible()
    await expect(dialogo(page).getByRole("button", { name: "Adicionar" })).toHaveCount(0)
    await evidencia(page, "02-limite-de-fotos", { inteira: false })
  })

  test("remover a segunda foto renumera a seguinte e mantém a ordem", async ({ page }) => {
    await usarSessao(page, carla)
    await abrirCriarNoFeed(page)
    await escolherFotos(page, "Selecionar fotos do dispositivo", [PRAIA, SERRA, RIO])

    await page.getByRole("button", { name: "Remover a foto 2" }).click()

    await conferirMiniaturas(page, ["praia.png", "rio.png"])
    await expect(dialogo(page).getByText("2 de 3 fotos.", { exact: true })).toBeVisible()
    await evidencia(page, "03-foto-removida", { inteira: false })
  })

  test("Marcar pessoas encontra a pessoa pelo nome e mostra a ficha dela", async ({ page }) => {
    await usarSessao(page, carla)
    await abrirCriarNoFeed(page)
    await escolherFotos(page, "Selecionar fotos do dispositivo", [PRAIA])
    await page.getByRole("button", { name: "Avançar" }).click()
    await page.getByLabel("Legenda", { exact: true }).fill(LEGENDA.tela)

    await page.getByRole("combobox", { name: "Marcar pessoas" }).fill("Davi")
    await expect(opcaoDe(page, "davi")).toContainText("Davi Teste")
    await evidencia(page, "04-busca-para-marcar", { inteira: false })
    await opcaoDe(page, "davi").click()

    await expect(fichaDe(page, "davi")).toBeVisible()
    await expect(page.getByRole("button", { name: "Remover a marcação de @davi" })).toBeVisible()
    await expect(dialogo(page).getByText("1 de 20", { exact: true })).toBeVisible()
    await evidencia(page, "05-ficha-marcada", { inteira: false })
  })

  test("Compartilhar abre o detalhe com as fotos na ordem, a legenda, Com @davi e a data", async ({ page }) => {
    await usarSessao(page, carla)
    const criado = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/social/posts" && r.request().method() === "POST")

    const id = await criarPeloDialogo(page, {
      fotos: [PRAIA, SERRA],
      legenda: LEGENDA.tela,
      marcar: { termo: "Davi", username: "davi" },
    })

    const { post } = await (await criado).json()
    expect(post.id).toBe(id)
    const artigo = artigoDe(page, "carla")
    const fotos = carrossel(page, "carla")
    await expect(fotoAtual(fotos)).toHaveAttribute("alt", "Foto 1 de 2 da publicação de @carla")
    expect(await corDaFotoNaTela(page, fotoAtual(fotos)), "a 1ª foto do carrossel é a praia (azul)").toBe("azul")
    await expect(artigo.locator("p", { hasText: LEGENDA.tela })).toHaveText(`Carla Teste ${LEGENDA.tela}`)
    await expect(artigo.getByRole("heading", { name: "Com", exact: true })).toBeVisible()
    await expect(artigo.getByRole("list", { name: "Pessoas marcadas" }).getByRole("link", { name: "@davi" })).toHaveAttribute(
      "href",
      "/u/davi",
    )
    await expect(artigo.locator("time")).toHaveText(dataEsperada(post.created_at))
    await evidencia(page, "06-detalhe-apos-compartilhar")

    await fotos.getByRole("button", { name: "Próxima foto" }).click()
    await expect(fotoAtual(fotos)).toHaveAttribute("alt", "Foto 2 de 2 da publicação de @carla")
    expect(await corDaFotoNaTela(page, fotoAtual(fotos)), "a 2ª foto do carrossel é a serra (verde)").toBe("verde")
  })
})

// ---------------------------------------------------------------- 2. detalhe

test.describe("detalhe", () => {
  let vitrine: string
  let doBruno: string

  test.beforeAll(async () => {
    test.setTimeout(60_000)
    vitrine = await criarPelaApi(carla, { fotos: [PRAIA, SERRA, RIO], legenda: LEGENDA.vitrine })
    doBruno = await criarPelaApi(bruno, { fotos: [SERRA], legenda: LEGENDA.privado })
  })

  test("as setas e os pontos do carrossel trocam a foto exibida", async ({ page }) => {
    await usarSessao(page, carla)
    await page.goto(`/feed/${vitrine}`)
    const fotos = carrossel(page, "carla")
    await expect(fotoAtual(fotos)).toHaveAttribute("alt", "Foto 1 de 3 da publicação de @carla")
    await expect(fotos.getByRole("button", { name: "Foto anterior" })).toBeDisabled()

    await fotos.getByRole("button", { name: "Próxima foto" }).click()
    await expect(fotoAtual(fotos)).toHaveAttribute("alt", "Foto 2 de 3 da publicação de @carla")
    await expect(fotos.getByRole("button", { name: "Ir para a foto 2" })).toHaveAttribute("aria-current", "true")

    await fotos.getByRole("button", { name: "Ir para a foto 3" }).click()
    await expect(fotoAtual(fotos)).toHaveAttribute("alt", "Foto 3 de 3 da publicação de @carla")
    await expect(fotos.getByRole("status")).toHaveText("Foto 3 de 3")
    await expect(fotos.getByRole("button", { name: "Próxima foto" })).toBeDisabled()
    expect(await corDaFotoNaTela(page, fotoAtual(fotos)), "a 3ª foto é o rio (vermelho)").toBe("vermelho")
    await evidencia(page, "07-carrossel-terceira-foto")
  })

  test("outra conta vê o post público sem os botões de editar e excluir", async ({ page }) => {
    await usarSessao(page, bruno)

    await page.goto(`/feed/${vitrine}`)

    const artigo = artigoDe(page, "carla")
    await expect(artigo.locator("p", { hasText: LEGENDA.vitrine })).toBeVisible()
    await expect(fotoAtual(carrossel(page, "carla"))).toBeVisible()
    await expect(artigo.getByRole("button", { name: "Editar legenda e marcações" })).toHaveCount(0)
    await expect(artigo.getByRole("button", { name: "Excluir" })).toHaveCount(0)
    await evidencia(page, "08-visto-por-outra-conta")
  })

  test("o post de perfil privado que a sessão não segue aparece como indisponível", async ({ page }) => {
    await usarSessao(page, davi)

    await page.goto(`/feed/${doBruno}`)

    await expect(indisponivel(page)).toBeVisible()
    await expect(page.getByText(LEGENDA.privado)).toHaveCount(0)
    await expect(page.getByRole("link", { name: "Ir para o feed" })).toHaveAttribute("href", "/feed")
    expect((await davi.api.get(`/api/social/posts/${doBruno}`)).status(), "a rota responde 404, sem revelar").toBe(404)
    await evidencia(page, "09-post-indisponivel")
  })

  test("um id que não existe mostra a mesma tela de indisponível", async ({ page }) => {
    await usarSessao(page, carla)

    await page.goto("/feed/00000000-0000-4000-8000-000000000000")

    await expect(indisponivel(page)).toBeVisible()
  })

  test("no celular, arrastar o carrossel para a esquerda passa para a foto seguinte", async ({ page }) => {
    test.skip(projeto() !== "mobile", "gesto de toque do celular")
    await usarSessao(page, carla)
    await page.goto(`/feed/${vitrine}`)
    const fotos = carrossel(page, "carla")
    await expect(fotoAtual(fotos)).toHaveAttribute("alt", "Foto 1 de 3 da publicação de @carla")
    const faixa = fotos.locator(":scope > div").first()
    const caixa = (await fotos.boundingBox())!
    const y = caixa.y + caixa.height / 2
    const inicio = [{ identifier: 0, clientX: caixa.x + caixa.width * 0.8, clientY: y }]
    const fim = [{ identifier: 0, clientX: caixa.x + caixa.width * 0.2, clientY: y }]

    await faixa.dispatchEvent("touchstart", { touches: inicio, changedTouches: inicio, targetTouches: inicio })
    await faixa.dispatchEvent("touchend", { touches: [], changedTouches: fim, targetTouches: [] })

    await expect(fotoAtual(fotos)).toHaveAttribute("alt", "Foto 2 de 3 da publicação de @carla")
    await expect(fotos.getByRole("button", { name: "Ir para a foto 2" })).toHaveAttribute("aria-current", "true")
    await evidencia(page, "10-carrossel-arrastado")
  })
})

// ---------------------------------------------------------------- 3. editar

test.describe("editar", () => {
  let id: string

  test.beforeEach(async () => {
    id = await criarPelaApi(carla, { fotos: [PRAIA], legenda: LEGENDA.editar, marcados: [davi.id] })
  })

  test.afterEach(async () => {
    await apagarPost(carla, id)
  })

  async function abrirEditar(page: Page) {
    await usarSessao(page, carla)
    await page.goto(`/feed/${id}`)
    await artigoDe(page, "carla").getByRole("button", { name: "Editar legenda e marcações" }).click()
    await expect(page.getByRole("dialog", { name: "Editar publicação" })).toBeVisible()
  }

  test("salvar uma legenda nova atualiza o detalhe sem recarregar a página", async ({ page }) => {
    await abrirEditar(page)
    const patch = page.waitForRequest((r) => r.method() === "PATCH" && new URL(r.url()).pathname === `/api/social/posts/${id}`)

    await page.getByLabel("Legenda", { exact: true }).fill(LEGENDA.editada)
    await page.getByRole("button", { name: "Salvar" }).click()

    expect((await patch).postDataJSON()).toEqual({ legenda: LEGENDA.editada, marcados: [davi.id] })
    await expect(page.getByText("Publicação atualizada", { exact: true }).first()).toBeVisible()
    await expect(page.getByRole("dialog", { name: "Editar publicação" })).toBeHidden()
    const artigo = artigoDe(page, "carla")
    await expect(artigo.locator("p", { hasText: LEGENDA.editada })).toHaveText(`Carla Teste ${LEGENDA.editada}`)
    await expect(artigo.getByText(LEGENDA.editar, { exact: true })).toHaveCount(0)
    await evidencia(page, "11-legenda-editada")
    const relido = await (await carla.api.get(`/api/social/posts/${id}`)).json()
    expect(relido.post.caption, "a legenda nova está gravada").toBe(LEGENDA.editada)
  })

  test("trocar as marcações tira @davi e põe @bruno no Com do detalhe", async ({ page }) => {
    // O Bruno é privado aqui: só é marcado por quem ele segue (S14-F-marcacao-privada).
    const seguiu = await bruno.api.post("/api/social/perfis/carla/seguir")
    expect(seguiu.ok(), "o Bruno segue a Carla").toBeTruthy()
    try {
      await abrirEditar(page)

      await page.getByRole("button", { name: "Remover a marcação de @davi" }).click()
      await marcar(page, "bruno", "bruno")
      await evidencia(page, "12-editar-marcacoes", { inteira: false })
      await page.getByRole("button", { name: "Salvar" }).click()

      await expect(page.getByRole("dialog", { name: "Editar publicação" })).toBeHidden()
      const marcados = artigoDe(page, "carla").getByRole("list", { name: "Pessoas marcadas" })
      await expect(marcados.getByRole("link")).toHaveText(["@bruno"])
      const relido = await (await carla.api.get(`/api/social/posts/${id}`)).json()
      expect(relido.post.marcados.map((p: { username: string }) => p.username)).toEqual(["bruno"])
    } finally {
      await bruno.api.delete("/api/social/perfis/carla/seguir")
    }
  })
})

// ---------------------------------------------------------------- 4. excluir

test.describe("excluir", () => {
  let id: string

  test.beforeEach(async () => {
    id = await criarPelaApi(carla, { fotos: [SERRA], legenda: LEGENDA.excluir })
  })

  test.afterEach(async () => {
    await apagarPost(carla, id)
  })

  test("cancelar no ConfirmModal fecha o aviso sem apagar o post", async ({ page }) => {
    const apagamentos: string[] = []
    page.on("request", (r) => {
      if (r.method() === "DELETE") apagamentos.push(new URL(r.url()).pathname)
    })
    await usarSessao(page, carla)
    await page.goto(`/feed/${id}`)

    await artigoDe(page, "carla").getByRole("button", { name: "Excluir" }).click()
    const aviso = page.getByRole("alertdialog", { name: "Excluir esta publicação?" })
    await expect(aviso).toContainText("Não dá para desfazer.")
    await evidencia(page, "13-confirmar-exclusao", { inteira: false })
    await aviso.getByRole("button", { name: "Cancelar" }).click()

    await expect(aviso).toBeHidden()
    await expect(artigoDe(page, "carla")).toBeVisible()
    expect(apagamentos).toEqual([])
  })

  test("confirmar a exclusão avisa, volta ao perfil e o link passa a não estar disponível", async ({ page }) => {
    await usarSessao(page, carla)
    await page.goto(`/feed/${id}`)

    await artigoDe(page, "carla").getByRole("button", { name: "Excluir" }).click()
    await page.getByRole("alertdialog", { name: "Excluir esta publicação?" }).getByRole("button", { name: "Excluir" }).click()

    await expect(page.getByText("Publicação excluída", { exact: true }).first()).toBeVisible()
    await page.waitForURL("/u/carla")
    await expect(page.getByRole("region", { name: "Publicações" })).toBeVisible()
    await expect(page.locator(`a[href="/feed/${id}"]`)).toHaveCount(0)
    await evidencia(page, "14-excluido-volta-ao-perfil")
    await page.goto(`/feed/${id}`)
    await expect(indisponivel(page)).toBeVisible()
  })
})

// ---------------------------------------------------------------- 5. aba Publicações

test.describe("aba Publicações", () => {
  let vitrine: string

  test.beforeAll(async () => {
    vitrine = await criarPelaApi(carla, { fotos: [PRAIA, SERRA, RIO], legenda: LEGENDA.vitrine })
  })

  test("a grade mostra a 1ª foto com a legenda no alt, o ícone de várias fotos e o link ao detalhe", async ({ page }) => {
    await usarSessao(page, bruno)

    await page.goto("/u/carla")

    const grade = page.getByRole("region", { name: "Publicações" })
    const quadrado = grade.locator(`a[href="/feed/${vitrine}"]`)
    const foto = quadrado.getByRole("img", { name: LEGENDA.vitrine })
    await expect(foto).toBeVisible()
    await expect(foto).toHaveAttribute("src", /\/storage\/v1\/object\/sign\/capas-posts\/.+\.webp\?token=/)
    expect(await corDaFotoNaTela(page, foto), "o quadrado mostra a 1ª foto (azul)").toBe("azul")
    await expect(quadrado.getByRole("img", { name: "3 fotos" })).toBeVisible()
    await evidencia(page, "15-grade-de-publicacoes")

    await quadrado.click()
    await page.waitForURL(`/feed/${vitrine}`)
    await expect(artigoDe(page, "carla")).toBeVisible()
  })

  test("o próprio perfil sem publicações convida a criar e mostra o botão Criar", async ({ page }) => {
    await usarSessao(page, davi)

    await page.goto("/u/davi")

    const grade = page.getByRole("region", { name: "Publicações" })
    await expect(grade.getByText("Nenhuma publicação ainda")).toBeVisible()
    await expect(grade.getByText(/Compartilhe a primeira/)).toBeVisible()
    await expect(page.getByRole("button", { name: "Criar", exact: true })).toBeVisible()
    await evidencia(page, "16-perfil-vazio-proprio")
  })

  test("o perfil de outra pessoa não tem o botão Criar nem o convite", async ({ page }) => {
    await usarSessao(page, carla)

    await page.goto("/u/davi")

    const grade = page.getByRole("region", { name: "Publicações" })
    await expect(grade.getByText("Nenhuma publicação ainda")).toBeVisible()
    await expect(grade.getByText(/Compartilhe a primeira/)).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Criar", exact: true })).toHaveCount(0)
  })

  test.describe("com mais de 12 publicações", () => {
    const daGrade: string[] = []

    test.beforeAll(async () => {
      test.setTimeout(120_000)
      for (let n = 1; n <= 12; n++) {
        daGrade.push(await criarPelaApi(carla, { fotos: [n % 2 ? SERRA : RIO], legenda: LEGENDA_GRADE(n) }))
      }
    })

    test.afterAll(async () => {
      test.setTimeout(120_000)
      for (const id of daGrade.splice(0)) await apagarPost(carla, id)
    })

    test("Carregar mais traz as publicações além das 12 primeiras e some na última página", async ({ page }) => {
      const total = (await gradeCompleta(bruno, "carla")).length
      expect(total, "a Carla precisa ter mais de 12 publicações").toBeGreaterThan(12)
      await usarSessao(page, bruno)
      await page.goto("/u/carla")
      const grade = page.getByRole("region", { name: "Publicações" })
      await expect(grade.getByRole("link")).toHaveCount(12)

      await grade.getByRole("button", { name: "Carregar mais" }).click()

      await expect(grade.getByRole("link")).toHaveCount(total)
      await expect(grade.getByRole("button", { name: "Carregar mais" })).toHaveCount(0)
      await expect(grade.locator(`a[href="/feed/${vitrine}"]`), "a mais antiga chega na 2ª página").toBeVisible()
      await evidencia(page, "17-carregar-mais")
    })
  })
})

// ---------------------------------------------------------------- 6. recusa

test.describe("recusa de marcação", () => {
  let id: string

  test.beforeEach(async () => {
    id = await criarPelaApi(carla, { fotos: [RIO], legenda: LEGENDA.recusa, marcados: [davi.id] })
  })

  test.afterEach(async () => {
    await apagarPost(carla, id)
    // A recusa não sai com o post (S14-F-marcacao-privada): o próximo teste marca o Davi de novo.
    await zerarRecusas([CARLA.email, DAVI.email])
  })

  async function daviRemove() {
    const resposta = await davi.api.delete(`/api/social/marcacoes/${id}`)
    expect(resposta.status(), "o Davi remove a própria marca").toBe(200)
  }

  test("a pessoa marcada remove a própria marca pela aba Marcações", async ({ page }) => {
    await usarSessao(page, davi)
    await page.goto("/u/davi")
    await page.getByRole("tab", { name: "Marcações" }).click()
    const cartao = page.getByRole("article").filter({ has: page.locator(`a[href="/feed/${id}"]`) })
    await expect(cartao).toContainText(LEGENDA.recusa)

    await cartao.getByRole("button", { name: "Remover marcação na publicação de @carla" }).click()
    await page.getByRole("alertdialog", { name: "Remover sua marcação?" }).getByRole("button", { name: "Remover" }).click()

    await expect(page.getByText("Marcação removida", { exact: true }).first()).toBeVisible()
    await expect(cartao).toHaveCount(0)
    await evidencia(page, "18-marca-removida-pela-aba")
    const visto = await (await carla.api.get(`/api/social/posts/${id}`)).json()
    expect(visto.post.marcados, "a marca saiu do post").toEqual([])
    expect(visto.recusados, "e virou recusa para a autora").toEqual([davi.id])
  })

  test("no editar, quem removeu a marca aparece desabilitado com Removeu a marcação", async ({ page }) => {
    await daviRemove()
    await usarSessao(page, carla)
    await page.goto(`/feed/${id}`)
    await artigoDe(page, "carla").getByRole("button", { name: "Editar legenda e marcações" }).click()

    await page.getByRole("combobox", { name: "Marcar pessoas" }).fill("davi")

    const opcao = opcaoDe(page, "davi")
    await expect(opcao).toContainText("@davi · Removeu a marcação")
    await expect(opcao).toHaveAttribute("aria-disabled", "true")
    // `force`: o Playwright não clica em opção aria-disabled; o clique forçado prova que a tela ignora.
    await opcao.click({ force: true })
    await expect(fichaDe(page, "davi")).toHaveCount(0)
    await evidencia(page, "19-editar-recusado-desabilitado", { inteira: false })
  })

  test("um PATCH forçado marcando quem removeu a marca responde 400 marcado_recusou", async () => {
    await daviRemove()

    const resposta = await carla.api.patch(`/api/social/posts/${id}`, { data: { marcados: [davi.id] } })

    expect(resposta.status()).toBe(400)
    expect((await resposta.json()).codigo).toBe("marcado_recusou")
  })
})

// ---------------------------------------------------------------- 7. segurança vista pelo navegador

test.describe("segurança vista pelo navegador", () => {
  /** Todas as chaves de um JSON e todos os textos, em qualquer nível. */
  function folhas(valor: unknown, chaves: string[] = [], textos: string[] = []) {
    if (Array.isArray(valor)) valor.forEach((v) => folhas(v, chaves, textos))
    else if (valor && typeof valor === "object") {
      for (const [chave, filho] of Object.entries(valor)) {
        chaves.push(chave)
        folhas(filho, chaves, textos)
      }
    } else if (typeof valor === "string") textos.push(valor)
    return { chaves, textos }
  }

  test("criar e ver um post não faz o navegador chamar /rest/v1/ nem enviar arquivo ao Storage", async ({ page }) => {
    const pedidos: { metodo: string; caminho: string }[] = []
    page.on("request", (r) => pedidos.push({ metodo: r.method(), caminho: new URL(r.url()).pathname }))
    await usarSessao(page, carla)

    await criarPeloDialogo(page, { fotos: [PRAIA, SERRA], legenda: LEGENDA.seguranca, marcar: { termo: "Davi", username: "davi" } })
    await expect(fotoAtual(carrossel(page, "carla"))).toBeVisible()

    expect(pedidos.filter((p) => p.caminho.includes("/rest/v1/")), "nenhuma consulta direta às tabelas").toEqual([])
    expect(
      pedidos.filter((p) => p.caminho.startsWith("/storage/v1/object/") && p.metodo !== "GET"),
      "nenhum envio direto ao Storage",
    ).toEqual([])
    expect(pedidos, "o envio passou pela rota").toContainEqual({ metodo: "POST", caminho: "/api/social/posts" })
    expect(pedidos.some((p) => p.caminho.startsWith("/storage/v1/object/sign/capas-posts/"))).toBe(true)
  })

  test("as respostas das rotas não trazem trip_id, author_id, caminho do Storage nem e-mail", async ({ page }) => {
    const corpos: { caminho: string; corpo: unknown }[] = []
    const leituras: Promise<void>[] = []
    // `requestfinished`, e não `response`: no `next dev` o Strict Mode descarta
    // a primeira chamada de cada efeito, e o corpo dela pode nunca terminar.
    page.on("requestfinished", (r) => {
      const caminho = new URL(r.url()).pathname
      if (!caminho.startsWith("/api/social/")) return
      leituras.push(
        (async () => {
          const resposta = await r.response()
          if (!resposta?.headers()["content-type"]?.includes("application/json")) return
          corpos.push({ caminho: `${r.method()} ${caminho}`, corpo: await resposta.json() })
        })(),
      )
    })
    await usarSessao(page, carla)
    const id = await criarPeloDialogo(page, {
      fotos: [PRAIA],
      legenda: LEGENDA.seguranca,
      marcar: { termo: "Davi", username: "davi" },
    })
    await artigoDe(page, "carla").getByRole("button", { name: "Editar legenda e marcações" }).click()
    await page.getByRole("button", { name: "Salvar" }).click()
    await expect(page.getByRole("dialog", { name: "Editar publicação" })).toBeHidden()
    await page.goto("/u/carla")
    await expect(page.locator(`a[href="/feed/${id}"]`)).toBeVisible()

    await Promise.all(leituras)

    const lidas = corpos.map((c) => c.caminho)
    expect(lidas).toEqual(
      expect.arrayContaining([
        "GET /api/social/pessoas",
        "POST /api/social/posts",
        `GET /api/social/posts/${id}`,
        `PATCH /api/social/posts/${id}`,
        "GET /api/social/perfis/carla/posts",
      ]),
    )
    const proibidas = ["trip_id", "author_id", "tagged_id", "photos", "cover_path", "email", "budget", "notes"]
    const caminhoDoStorage = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|jpe?g|png)$/
    for (const { caminho, corpo } of corpos) {
      const { chaves, textos } = folhas(corpo)
      expect(chaves.filter((c) => proibidas.includes(c)), `chaves em ${caminho}`).toEqual([])
      expect(textos.filter((t) => caminhoDoStorage.test(t)), `caminho cru do Storage em ${caminho}`).toEqual([])
      expect(textos.filter((t) => t.includes("@viajamais.local")), `e-mail em ${caminho}`).toEqual([])
      expect(
        textos.filter((t) => t.includes(carla.id) && !t.includes("/storage/v1/object/sign/")),
        `id da autora fora de URL assinada em ${caminho}`,
      ).toEqual([])
    }
  })

  test("a foto exibida no detalhe é um WebP sem EXIF, GPS nem XMP do JPEG enviado", async ({ page }) => {
    const original = Buffer.from(await jpegComGps({ largura: 640, altura: 480 }))
    expect(contemTexto(original, MARCAS.gps), "o JPEG de teste leva o GPS").toBe(true)
    await usarSessao(page, carla)

    await criarPeloDialogo(page, {
      fotos: [{ name: "celular-com-gps.jpg", mimeType: "image/jpeg", buffer: original }],
      legenda: LEGENDA.seguranca,
    })

    const src = (await fotoAtual(carrossel(page, "carla")).getAttribute("src"))!
    const baixada = await page.request.get(src)
    expect(baixada.headers()["content-type"]).toBe("image/webp")
    const bytes = new Uint8Array(await baixada.body())
    const { chunks, flagsVp8x } = chunksDoWebp(bytes)
    expect(chunks.filter((c) => c === "EXIF" || c === "XMP "), "sem chunk de metadado").toEqual([])
    expect((flagsVp8x ?? 0) & 0b1100, "sem as flags de EXIF e XMP no VP8X").toBe(0)
    for (const marca of Object.values(MARCAS)) expect(contemTexto(bytes, marca), `a marca ${marca} vazou`).toBe(false)
  })
})

// ---------------------------------------------------------------- 8. celular

test.describe("no celular", () => {
  test("com o teclado aberto, o diálogo de criar cabe na tela e rola até o botão Compartilhar", async ({ page }) => {
    test.skip(projeto() !== "mobile", "layout do celular")
    // Com o teclado virtual aberto, a área visível do Pixel 7 cai de 839 para
    // cerca de 560 px: é quando o diálogo (max-h 92dvh) precisa rolar.
    await page.setViewportSize({ width: page.viewportSize()!.width, height: 560 })
    await usarSessao(page, carla)
    await abrirCriarNoFeed(page)
    await escolherFotos(page, "Selecionar fotos do dispositivo", [PRAIA, SERRA, RIO])
    await page.getByRole("button", { name: "Avançar" }).click()
    await page.getByLabel("Legenda", { exact: true }).fill(LEGENDA.tela)
    await marcar(page, "Davi", "davi")
    await page.getByRole("combobox", { name: "Marcar pessoas" }).fill("te")
    await expect(page.getByRole("listbox", { name: "Pessoas encontradas" })).toBeVisible()
    const conteudo = dialogo(page)
    const caixa = (await conteudo.boundingBox())!
    expect(caixa.y, "o diálogo começa dentro da tela").toBeGreaterThanOrEqual(0)
    expect(caixa.y + caixa.height, "o diálogo termina dentro da tela").toBeLessThanOrEqual(560)
    await expect(page.getByRole("button", { name: "Compartilhar" })).not.toBeInViewport()

    await conteudo.evaluate((el) => el.scrollTo({ top: el.scrollHeight }))

    await expect(page.getByRole("button", { name: "Compartilhar" })).toBeInViewport()
    await expect(page.getByRole("button", { name: "Voltar" })).toBeInViewport()
    await evidencia(page, "20-celular-dialogo-rolado", { inteira: false })
  })
})
