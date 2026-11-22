import {
  test,
  expect,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
  type Response,
} from "@playwright/test"
import { convidar, entrar } from "./fixtures/contas"
import { zerarRecusas } from "./fixtures/recusas"
import { USUARIOS } from "../tests/fixtures/usuarios"

/**
 * @RF09.14 a aba "Marcações" do perfil: a pessoa marcada vê os posts em que
 * foi marcada e remove a própria marca; quem é de fora não remove nada nem vê
 * o post que está fechado para ele; e quem removeu a marca não pode ser
 * marcado de novo pelo mesmo autor naquela viagem (decisão de 18/11).
 *
 * Quem é marcado é o Davi, usuário do seed reservado aos specs de perfil. A
 * Carla (perfil público) publica posts abertos; o Bruno (perfil privado, que o
 * Davi não segue) publica um post fechado para o Davi, e ser marcado não o abre
 * (opção 2, como no Instagram). A Ana faz o papel de terceira pessoa.
 *
 * O estado é preparado pela API da aplicação, como nos outros specs: viagem por
 * POST /api/trips, convite e aceite (`convidar`), publicação e marcação por
 * POST /api/social/viagens/<tripId>/post. A tela de publicar não entra aqui.
 *
 * Dois grupos, porque remover a marca deixa uma recusa que só some com a
 * viagem:
 * - "lendo a aba": um post aberto e um fechado, criados uma vez e só lidos;
 * - "removendo a marca": cada teste tem a própria viagem e o próprio post,
 *   criados antes e apagados depois dele.
 * Apagar a viagem leva o post, as marcas e as recusas em cascata. Os títulos
 * são fixos, para servirem de figura: no começo, qualquer viagem que sobrou de
 * uma execução interrompida, com esses títulos e dessas contas, sai pela API.
 * No fim, a privacidade de Carla, Bruno e Davi volta a ser a que era.
 *
 * Cada pessoa entra uma vez só pela tela de login (`entrar`) e os testes
 * reaproveitam os cookies dessa sessão: o Auth local limita o login a 30 por
 * 5 minutos, e o spec roda nos dois projetos, duas vezes seguidas.
 */

const DAVI = USUARIOS.davi
const CARLA = USUARIOS.carla
const BRUNO = USUARIOS.bruno
const ANA = USUARIOS.ana

type Sessao = { contexto: BrowserContext; api: APIRequestContext; id: string }

type Modelo = { titulo: string; destino: string; legenda: string }
type PostPreparado = Modelo & { autora: Sessao; tripId: string | null; postId: string }

const ABERTA: Modelo = {
  titulo: "Fim de semana em Pirenópolis",
  destino: "Pirenópolis",
  legenda: "Cachoeiras, doce de leite e muita estrada de terra.",
}
const FECHADA: Modelo = {
  titulo: "Viagem privada do Bruno",
  destino: "Alto Paraíso de Goiás",
  legenda: "Só para quem me segue.",
}
const REMOCAO: Modelo = {
  titulo: "Feriado na Cidade de Goiás",
  destino: "Cidade de Goiás",
  legenda: "Becos de pedra e pastelinho.",
}
const TITULOS = [ABERTA.titulo, FECHADA.titulo, REMOCAO.titulo]

const projeto = () => test.info().project.name
const evidencia = (page: Page, passo: string) =>
  page.screenshot({ path: `docs/pfc/evidencias/S06-M-marcacoes-${passo}-${projeto()}.png`, fullPage: true })

const sessoes: Sessao[] = []
let carla: Sessao
let bruno: Sessao
let davi: Sessao
let ana: Sessao
/** A privacidade de cada sessão antes do spec, para devolver no fim. */
const privacidadeOriginal = new Map<Sessao, boolean>()

async function perfilDe(api: APIRequestContext) {
  const resposta = await api.get("/api/social/perfil")
  expect(resposta.ok()).toBeTruthy()
  return (await resposta.json()).perfil as { id: string; is_public: boolean }
}

async function abrirSessao(browser: Browser, baseURL: string, email: string): Promise<Sessao> {
  const contexto = await browser.newContext({ baseURL, locale: "pt-BR", timezoneId: "America/Sao_Paulo" })
  const pagina = await contexto.newPage()
  await entrar(pagina, email)
  const sessao = { contexto, api: pagina.request, id: (await perfilDe(pagina.request)).id }
  sessoes.push(sessao)
  return sessao
}

async function definirPrivacidade(sessao: Sessao, publico: boolean) {
  const resposta = await sessao.api.patch("/api/social/perfil", { data: { is_public: publico } })
  expect(resposta.ok(), "a privacidade do perfil precisa mudar pela rota").toBeTruthy()
}

/** Guarda a privacidade atual e põe a que o spec precisa. */
async function exigirPrivacidade(sessao: Sessao, publico: boolean) {
  privacidadeOriginal.set(sessao, (await perfilDe(sessao.api)).is_public)
  await definirPrivacidade(sessao, publico)
}

/** Apaga, pela rota do dono, as viagens de `dona` com os títulos do spec que sobraram de outra execução. */
async function apagarResiduos(dona: Sessao) {
  const resposta = await dona.api.get("/api/trips")
  expect(resposta.ok()).toBeTruthy()
  const { trips } = (await resposta.json()) as { trips: { id: string; title: string; user_id: string }[] }
  for (const viagem of trips.filter((t) => t.user_id === dona.id && TITULOS.includes(t.title))) {
    expect((await dona.api.delete(`/api/trips/${viagem.id}`)).ok(), `resíduo "${viagem.title}"`).toBeTruthy()
  }
}

/** O corpo de POST e PATCH do post: só a legenda e os marcados; sem roteiro nem lugares. */
const corpoDoPost = (post: PostPreparado, marcados: string[]) => ({
  legenda: post.legenda,
  roteiro: null,
  lugares: null,
  marcados,
})

const publicar = (post: PostPreparado, marcados: string[]) =>
  post.autora.api.post(`/api/social/viagens/${post.tripId}/post`, { data: corpoDoPost(post, marcados) })

/** Viagem nova de `autora` com o Davi como membro, e o post dela marcando o Davi. */
async function prepararPost(autora: Sessao, modelo: Modelo): Promise<PostPreparado> {
  const post: PostPreparado = { ...modelo, autora, tripId: null, postId: "" }
  const viagem = await autora.api.post("/api/trips", {
    data: {
      title: post.titulo,
      destination: post.destino,
      start_date: "2026-12-01",
      end_date: "2026-12-05",
      currency: "BRL",
      status: "planning",
    },
  })
  expect(viagem.ok(), `a viagem "${post.titulo}" precisa ser criada`).toBeTruthy()
  post.tripId = (await viagem.json()).data[0].id as string

  await convidar(autora.api, davi.api, DAVI.email, post.tripId)

  const publicado = await publicar(post, [davi.id])
  expect(publicado.status(), `publicar "${post.titulo}" marcando o Davi`).toBe(201)
  post.postId = (await publicado.json()).post.id as string
  return post
}

/** Apaga a viagem pela rota do dono: post, marcas e recusas saem em cascata. */
async function apagarViagem(post: PostPreparado | undefined) {
  if (!post?.tripId) return
  const resposta = await post.autora.api.delete(`/api/trips/${post.tripId}`)
  expect(resposta.ok(), `a viagem "${post.titulo}" precisa sair no fim`).toBeTruthy()
}

/** A página do teste passa a usar a sessão já aberta de `sessao`. */
async function usarSessao(page: Page, sessao: Sessao) {
  await page.context().addCookies(await sessao.contexto.cookies())
}

type LeituraDaAba = { cabecalhos: Record<string, string>; corpo: { marcacoes: { post_id: string }[] } }

/**
 * Abre /u/<username>, clica na aba Marcações e devolve o GET da aba como o
 * navegador o recebeu. Espera o `requestfinished`, e não a primeira resposta:
 * no `next dev` o Strict Mode do React dispara o efeito duas vezes, e o corpo
 * da primeira chamada, que a tela descarta sem ler, pode nunca terminar de
 * carregar (a leitura dele ficava presa até o timeout).
 */
async function abrirMarcacoes(page: Page, username: string): Promise<LeituraDaAba> {
  await page.goto(`/u/${username}`)
  const leitura = page.waitForEvent(
    "requestfinished",
    (r) => new URL(r.url()).pathname === `/api/social/perfis/${username}/marcacoes` && r.method() === "GET",
  )
  await page.getByRole("tab", { name: "Marcações" }).click()
  const resposta: Response = (await (await leitura).response())!
  const aba = { cabecalhos: resposta.headers(), corpo: await resposta.json() }
  await expect(page.getByRole("status", { name: "Carregando marcações" })).toHaveCount(0)
  return aba
}

/** Davi remove a própria marca pela rota, como a aba faz. */
async function daviRemove(post: PostPreparado) {
  const resposta = await davi.api.delete(`/api/social/marcacoes/${post.postId}`)
  expect(resposta.status(), "o Davi remove a própria marca").toBe(200)
}

/** Todas as chaves de um JSON, em qualquer nível. */
function chaves(valor: unknown): string[] {
  if (Array.isArray(valor)) return valor.flatMap(chaves)
  if (valor && typeof valor === "object") {
    return Object.entries(valor).flatMap(([chave, filho]) => [chave, ...chaves(filho)])
  }
  return []
}

const cartao = (page: Page, modelo: Modelo) => page.getByRole("article", { name: modelo.titulo })
const cartaoFechado = (page: Page) => page.getByRole("article", { name: "Marcação de @bruno" })
const removerDaCarla = (page: Page) =>
  page.getByRole("button", { name: "Remover marcação na publicação de @carla" })
const confirmarRemocao = (page: Page) =>
  page.getByRole("alertdialog", { name: "Remover sua marcação?" }).getByRole("button", { name: "Remover" }).click()

test.beforeAll(async ({ browser }, info) => {
  test.setTimeout(120_000)
  const baseURL = info.project.use.baseURL!

  carla = await abrirSessao(browser, baseURL, CARLA.email)
  bruno = await abrirSessao(browser, baseURL, BRUNO.email)
  davi = await abrirSessao(browser, baseURL, DAVI.email)
  ana = await abrirSessao(browser, baseURL, ANA.email)

  await apagarResiduos(carla)
  await apagarResiduos(bruno)
  await zerarRecusas([CARLA.email, BRUNO.email, DAVI.email, ANA.email])

  await exigirPrivacidade(carla, true)
  await exigirPrivacidade(bruno, false)
  await exigirPrivacidade(davi, true)
})

test.afterAll(async () => {
  try {
    for (const [sessao, publico] of privacidadeOriginal) await definirPrivacidade(sessao, publico)
  } finally {
    await Promise.all(sessoes.map((sessao) => sessao.contexto.close()))
  }
})

test.describe("lendo a aba", () => {
  let aberta: PostPreparado
  let fechada: PostPreparado

  test.beforeAll(async () => {
    test.setTimeout(120_000)
    aberta = await prepararPost(carla, ABERTA)
    fechada = await prepararPost(bruno, FECHADA)
  })

  test.afterAll(async () => {
    await apagarViagem(aberta)
    await apagarViagem(fechada)
  })

  test("a pessoa marcada vê o cartão do post aberto com título, destino, datas, legenda e autor", async ({ page }) => {
    await usarSessao(page, davi)

    await abrirMarcacoes(page, "davi")

    const aberto = cartao(page, ABERTA)
    await expect(aberto.getByRole("heading", { level: 3, name: ABERTA.titulo })).toBeVisible()
    await expect(aberto.getByText(ABERTA.destino, { exact: true })).toBeVisible()
    await expect(aberto.getByText("1 de dez. – 5 de dez. de 2026", { exact: true })).toBeVisible()
    await expect(aberto.locator("p", { hasText: ABERTA.legenda })).toHaveText(`Carla Teste ${ABERTA.legenda}`)
    await expect(aberto.getByRole("link", { name: /Carla Teste/ })).toHaveAttribute("href", "/u/carla")
    await evidencia(page, "01-cartao-aberto")
  })

  test("o post de autor privado que a pessoa não segue aparece só como aviso, sem destino nem capa", async ({ page }) => {
    await usarSessao(page, davi)

    await abrirMarcacoes(page, "davi")

    const fechado = cartaoFechado(page)
    await expect(fechado.getByText(/marcou você numa publicação/)).toHaveText(
      "Bruno Teste marcou você numa publicação que só os seguidores veem.",
    )
    await expect(fechado.getByRole("link", { name: /Bruno Teste/ })).toHaveAttribute("href", "/u/bruno")
    await expect(fechado.getByText(FECHADA.destino)).toHaveCount(0)
    await expect(fechado.getByText(FECHADA.titulo)).toHaveCount(0)
    await expect(fechado.getByText(FECHADA.legenda)).toHaveCount(0)
    await expect(fechado.locator('img[alt=""]'), "a capa é a única imagem decorativa do cartão").toHaveCount(0)
    await evidencia(page, "02-cartao-fechado")
  })

  test("cancelar a remoção fecha o diálogo sem apagar a marcação", async ({ page }) => {
    const apagamentos: string[] = []
    page.on("request", (pedido) => {
      if (pedido.method() === "DELETE") apagamentos.push(new URL(pedido.url()).pathname)
    })
    await usarSessao(page, davi)
    await abrirMarcacoes(page, "davi")

    await removerDaCarla(page).click()
    const dialogo = page.getByRole("alertdialog", { name: "Remover sua marcação?" })
    await expect(dialogo).toContainText("Você deixa de aparecer na publicação de @carla.")
    await evidencia(page, "03-confirmar-remocao")
    await dialogo.getByRole("button", { name: "Cancelar" }).click()

    await expect(dialogo).toBeHidden()
    await expect(cartao(page, ABERTA)).toBeVisible()
    expect(apagamentos, "cancelar não pode chamar nenhum DELETE").toEqual([])
  })

  test("o GET da aba não traz ids internos, caminho da capa nem e-mail", async ({ page }) => {
    await usarSessao(page, davi)

    const { corpo } = await abrirMarcacoes(page, "davi")

    const ids = corpo.marcacoes.map((m) => m.post_id).sort()
    expect(ids, "a resposta tem as duas marcações do Davi").toEqual([aberta.postId, fechada.postId].sort())
    const proibidas = ["trip_id", "author_id", "tagged_id", "cover_path", "email"]
    expect(chaves(corpo).filter((chave) => proibidas.includes(chave))).toEqual([])
    expect(JSON.stringify(corpo)).not.toContain("@viajamais.local")
  })

  test("o GET da aba sai com Cache-Control private, no-store", async ({ page }) => {
    await usarSessao(page, davi)

    const { cabecalhos } = await abrirMarcacoes(page, "davi")

    expect(cabecalhos["cache-control"]).toBe("private, no-store")
  })

  test("outra conta vê a aba do perfil público sem nenhum botão de remover", async ({ page }) => {
    await usarSessao(page, ana)

    await abrirMarcacoes(page, "davi")

    await expect(cartao(page, ABERTA)).toBeVisible()
    await expect(page.getByRole("button", { name: /Remover/ })).toHaveCount(0)
    await evidencia(page, "05-visto-por-outra-conta")
  })

  test("outra conta não recebe o post que está fechado para ela", async ({ page }) => {
    await usarSessao(page, ana)

    const { corpo } = await abrirMarcacoes(page, "davi")

    expect(corpo.marcacoes.map((m) => m.post_id)).toEqual([aberta.postId])
    await expect(cartao(page, ABERTA)).toBeVisible()
    await expect(cartaoFechado(page)).toHaveCount(0)
    await expect(page.getByText(/marcou você numa publicação/)).toHaveCount(0)
  })

  test("no celular, as abas ocupam a largura e o botão de remover fica abaixo do autor", async ({ page }) => {
    test.skip(projeto() !== "mobile", "layout do celular")
    await usarSessao(page, davi)

    await abrirMarcacoes(page, "davi")

    const abas = (await page.getByRole("tablist").boundingBox())!
    const perfil = (await page.getByRole("region", { name: "Perfil de @davi" }).boundingBox())!
    expect(Math.abs(abas.width - perfil.width), "a barra de abas tem a largura do cartão do perfil").toBeLessThanOrEqual(1)
    const autor = (await cartao(page, ABERTA).getByRole("link", { name: /Carla Teste/ }).boundingBox())!
    const botao = (await removerDaCarla(page).boundingBox())!
    expect(botao.y, "o botão começa abaixo do autor").toBeGreaterThanOrEqual(autor.y + autor.height - 1)
    expect(botao.x + botao.width, "o botão cabe na tela").toBeLessThanOrEqual(page.viewportSize()!.width)
    await evidencia(page, "06-celular")
  })
})

test.describe("removendo a marca", () => {
  let propria: PostPreparado | undefined

  test.beforeEach(async () => {
    propria = await prepararPost(carla, REMOCAO)
  })

  test.afterEach(async () => {
    await apagarViagem(propria)
    propria = undefined
    // A recusa não sai com a viagem (S14-F-marcacao-privada): o próximo teste marca o Davi de novo.
    await zerarRecusas([CARLA.email, DAVI.email])
  })

  test("confirmar a remoção avisa, tira o cartão e deixa a aba no estado vazio", async ({ page }) => {
    await usarSessao(page, davi)
    await abrirMarcacoes(page, "davi")

    await removerDaCarla(page).click()
    await confirmarRemocao(page)

    await expect(page.getByText("Marcação removida", { exact: true }).first()).toBeVisible()
    await expect(cartao(page, REMOCAO)).toHaveCount(0)
    await expect(page.getByText("Nenhuma marcação ainda")).toBeVisible()
    await expect(page.getByText("Quando alguém marcar você numa publicação, ela aparece aqui.")).toBeVisible()
    await evidencia(page, "04-marcacao-removida")
    const depois = await (await page.request.get("/api/social/perfis/davi/marcacoes")).json()
    expect(depois.marcacoes, "a marca saiu do banco, não só da tela").toEqual([])
  })

  test("remover passa só por DELETE /api/social/marcacoes/<postId>, sem chamada direta às tabelas", async ({ page }) => {
    const escritas: string[] = []
    const direto: string[] = []
    page.on("request", (pedido) => {
      const url = new URL(pedido.url())
      if (/\/rest\/v1\/(post_tags|trip_posts)/.test(url.pathname)) direto.push(`${pedido.method()} ${url.pathname}`)
      if (url.pathname.startsWith("/api/") && pedido.method() !== "GET") escritas.push(`${pedido.method()} ${url.pathname}`)
    })
    await usarSessao(page, davi)
    await abrirMarcacoes(page, "davi")

    const apagou = page.waitForResponse((r) => r.request().method() === "DELETE")
    await removerDaCarla(page).click()
    await confirmarRemocao(page)
    const resposta = await apagou

    expect(resposta.status()).toBe(200)
    await expect(cartao(page, REMOCAO)).toHaveCount(0)
    expect(escritas).toEqual([`DELETE /api/social/marcacoes/${propria!.postId}`])
    expect(direto, "nenhuma requisição do navegador a /rest/v1/post_tags nem a /rest/v1/trip_posts").toEqual([])
  })

  test("quem removeu a marca não pode ser marcado de novo pelo mesmo autor ao atualizar o post", async () => {
    await daviRemove(propria!)

    const resposta = await propria!.autora.api.patch(`/api/social/viagens/${propria!.tripId}/post`, {
      data: corpoDoPost(propria!, [davi.id]),
    })

    expect(resposta.status()).toBe(400)
    expect((await resposta.json()).codigo).toBe("marcado_recusou")
  })

  test("quem removeu a marca não pode ser marcado de novo ao despublicar e publicar outra vez", async () => {
    await daviRemove(propria!)
    const despublicado = await propria!.autora.api.delete(`/api/social/viagens/${propria!.tripId}/post`)
    expect(despublicado.ok(), "a Carla despublica").toBeTruthy()

    const resposta = await publicar(propria!, [davi.id])

    expect(resposta.status()).toBe(400)
    expect((await resposta.json()).codigo).toBe("marcado_recusou")
  })
})
