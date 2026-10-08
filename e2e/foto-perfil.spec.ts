import { test, expect, type Page } from "@playwright/test"

/**
 * @RF02.2 foto de perfil por upload: o lápis na bolinha do avatar envia uma foto,
 * que aparece recortada no cartão e no menu lateral, e depois a remove.
 *
 * Usa o Davi, usuário do seed reservado aos E2E de perfil, e remove a foto no fim.
 * A imagem de teste tem 900×600: chegar como 512×512 prova o recorte quadrado
 * feito no navegador.
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

test("envia a foto pelo lápis, aparece recortada no cartão e no menu lateral, e remove", async ({ page }) => {
  await abrirPerfilDoDavi(page)
  try {
    const cartao = page.getByRole("region", { name: "Como os outros veem seu perfil" })
    await expect(cartao.getByText("DT")).toBeVisible()

    // Sem foto, o menu só oferece enviar.
    await page.getByRole("button", { name: "Alterar foto de perfil" }).click()
    await expect(page.getByRole("menuitem", { name: "Remover foto" })).toHaveCount(0)
    await page.keyboard.press("Escape")

    const [seletor] = await Promise.all([page.waitForEvent("filechooser"), escolherNoMenu(page, "Enviar nova foto")])
    await seletor.setFiles(FOTO)
    await expect(page.getByText("Foto atualizada").first()).toBeVisible()

    // A foto vem do bucket do projeto, na pasta do Davi, já recortada em 512×512.
    const foto = cartao.getByRole("img", { name: "Foto de perfil" })
    await expect(foto).toHaveAttribute("src", /\/storage\/v1\/object\/public\/avatars\/44444444-4444-4444-8444-444444444444\//)
    await expect.poll(() => foto.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])).toEqual([512, 512])

    // O menu lateral também troca as iniciais pela foto.
    await expect(page.locator("aside img[src*='/avatars/']")).toBeVisible()

    // Recarregar prova que ficou gravado.
    await page.reload()
    await expect(cartao.getByRole("img", { name: "Foto de perfil" })).toBeVisible()

    const projeto = test.info().project.name
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

test.describe("recusa o que não é imagem", () => {
  for (const [caso, arquivo] of [
    ["PDF", { name: "documento.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") }],
    ["PDF renomeado para .png", { name: "foto.png", mimeType: "image/png", buffer: Buffer.from("%PDF-1.4") }],
  ] as const) {
    test(caso, async ({ page }) => {
      await abrirPerfilDoDavi(page)

      const [seletor] = await Promise.all([page.waitForEvent("filechooser"), escolherNoMenu(page, "Enviar nova foto")])
      await seletor.setFiles(arquivo)

      await expect(page.getByText(/Não foi possível ler essa imagem/).first()).toBeVisible()
      await expect(
        page.getByRole("region", { name: "Como os outros veem seu perfil" }).getByRole("img", { name: "Foto de perfil" }),
      ).toHaveCount(0)
    })
  }
})
