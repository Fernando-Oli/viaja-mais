import { test, expect, type Page } from "@playwright/test"

/**
 * @RF02.2 foto de perfil por upload, com enquadramento: o lápis na bolinha do
 * avatar abre o seletor; escolhida a foto, um modal deixa arrastar e dar zoom,
 * como no Instagram; "Aplicar" envia o que está no círculo, em 512×512.
 *
 * Usa o Davi, usuário do seed reservado aos E2E de perfil, e remove a foto no fim.
 *
 * A imagem de teste é um degradê de 900×600 em que o vermelho cresce da esquerda
 * para a direita. Arrastar a foto para a direita enquadra a parte esquerda: o
 * centro da foto enviada fica menos vermelho do que no recorte centralizado
 * (~127). É assim que o teste prova que o enquadramento escolhido é o enviado.
 */

const FOTO = "e2e/fixtures/foto-perfil.png"

async function abrirPerfilDoDavi(page: Page) {
  await page.goto("/auth/login")
  await page.fill("#email", "teste.d@viajamais.local")
  await page.fill("#password", "viajamais123")
  await page.click('button[type="submit"]')
  await page.waitForURL("/dashboard")
  await page.goto("/dashboard/perfil")
}

async function escolherNoMenu(page: Page, item: string) {
  await page.getByRole("button", { name: "Alterar foto de perfil" }).click()
  await page.getByRole("menuitem", { name: item }).click()
}

async function escolherArquivo(page: Page, arquivo: Parameters<import("@playwright/test").FileChooser["setFiles"]>[0]) {
  const [seletor] = await Promise.all([page.waitForEvent("filechooser"), escolherNoMenu(page, "Enviar nova foto")])
  await seletor.setFiles(arquivo)
}

/** Vermelho do pixel central da foto, lida pelos bytes (sem depender de CORS do Storage). */
async function vermelhoNoCentro(page: Page, url: string) {
  const bytes = (await (await page.request.get(url)).body()).toString("base64")
  return page.evaluate(async (base64) => {
    const binario = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const imagem = await createImageBitmap(new Blob([binario]))
    const canvas = new OffscreenCanvas(imagem.width, imagem.height)
    const contexto = canvas.getContext("2d")!
    contexto.drawImage(imagem, 0, 0)
    return contexto.getImageData(imagem.width / 2, imagem.height / 2, 1, 1).data[0]
  }, bytes)
}

test("enquadra a foto no modal, envia o que está no círculo e remove", async ({ page }) => {
  await abrirPerfilDoDavi(page)
  try {
    const cartao = page.getByRole("region", { name: "Como os outros veem seu perfil" })
    await expect(cartao.getByText("DT")).toBeVisible()

    // Sem foto, o menu só oferece enviar.
    await page.getByRole("button", { name: "Alterar foto de perfil" }).click()
    await expect(page.getByRole("menuitem", { name: "Remover foto" })).toHaveCount(0)
    await page.keyboard.press("Escape")

    await escolherArquivo(page, FOTO)

    // Escolher a foto não envia nada: abre o modal de enquadramento.
    const modal = page.getByRole("dialog", { name: "Ajustar foto" })
    await expect(modal).toBeVisible()
    const area = modal.getByRole("application")

    // Arrasta a foto para a direita (enquadra a parte esquerda) e dá zoom.
    const caixa = (await area.boundingBox())!
    await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2)
    await page.mouse.down()
    await page.mouse.move(caixa.x + caixa.width / 2 + 200, caixa.y + caixa.height / 2, { steps: 10 })
    await page.mouse.up()
    await modal.getByRole("slider", { name: "Zoom" }).fill("2")

    const projeto = test.info().project.name
    await page.screenshot({ path: `docs/pfc/evidencias/S04-M-foto-enquadrar-${projeto}.png` })

    await modal.getByRole("button", { name: "Aplicar" }).click()
    await expect(page.getByText("Foto atualizada").first()).toBeVisible()
    await expect(modal).toBeHidden()

    // A foto vem do bucket do projeto, na pasta do Davi, em 512×512…
    const foto = cartao.getByRole("img", { name: "Foto de perfil" })
    await expect(foto).toHaveAttribute("src", /\/storage\/v1\/object\/public\/avatars\/44444444-4444-4444-8444-444444444444\//)
    await expect.poll(() => foto.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])).toEqual([512, 512])

    // …e é o pedaço enquadrado, não o centro da imagem.
    const vermelho = await vermelhoNoCentro(page, (await foto.getAttribute("src"))!)
    expect(vermelho, "arrastar para a direita deveria enquadrar a parte esquerda, menos vermelha").toBeLessThan(105)

    // O menu lateral também troca as iniciais pela foto.
    await expect(page.locator("aside img[src*='/avatars/']")).toBeVisible()

    // Recarregar prova que ficou gravado.
    await page.reload()
    await expect(cartao.getByRole("img", { name: "Foto de perfil" })).toBeVisible()
    await page.screenshot({ path: `docs/pfc/evidencias/S04-M-foto-perfil-${projeto}.png`, fullPage: true })

    await escolherNoMenu(page, "Remover foto")
    await expect(page.getByText("Foto removida").first()).toBeVisible()
    await expect(cartao.getByRole("img", { name: "Foto de perfil" })).toHaveCount(0)
    await expect(cartao.getByText("DT")).toBeVisible()
  } finally {
    // Só depois do login: deixa o Davi sem foto para a próxima execução.
    await page.request.delete("/api/social/perfil/foto")
  }
})

test("Cancelar no modal não envia nada", async ({ page }) => {
  await abrirPerfilDoDavi(page)
  const envios: string[] = []
  page.on("request", (r) => {
    if (r.url().includes("/api/social/perfil/foto") && r.method() === "POST") envios.push(r.url())
  })

  await escolherArquivo(page, FOTO)
  const modal = page.getByRole("dialog", { name: "Ajustar foto" })
  await expect(modal).toBeVisible()
  await modal.getByRole("button", { name: "Cancelar" }).click()

  await expect(modal).toBeHidden()
  expect(envios).toEqual([])
  await expect(
    page.getByRole("region", { name: "Como os outros veem seu perfil" }).getByRole("img", { name: "Foto de perfil" }),
  ).toHaveCount(0)
})

test.describe("recusa o que não é imagem", () => {
  for (const [caso, arquivo] of [
    ["PDF", { name: "documento.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") }],
    ["PDF renomeado para .png", { name: "foto.png", mimeType: "image/png", buffer: Buffer.from("%PDF-1.4") }],
  ] as const) {
    test(caso, async ({ page }) => {
      await abrirPerfilDoDavi(page)

      await escolherArquivo(page, arquivo)

      await expect(page.getByText(/Não foi possível ler essa imagem/).first()).toBeVisible()
      await expect(page.getByRole("dialog", { name: "Ajustar foto" })).toHaveCount(0)
    })
  }
})
