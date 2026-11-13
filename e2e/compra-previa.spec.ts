import { expect } from "@playwright/test"
import { test } from "./fixtures/contas"

/**
 * Compra de voos e hotéis — PRÉVIA VISUAL (S12-F-rebranding-avori).
 * Não há fornecedor nem cobrança: o teste prova que o fluxo anda de ponta a
 * ponta com os dados de exemplo, que a tela se declara prévia e que o cartão
 * terminado em 0000 mostra o pagamento recusado.
 */

test("passagens: da busca em Reservas até a confirmação, marcada como prévia", async ({ dona }) => {
  const { page } = dona
  await page.goto("/dashboard/bookings")

  const busca = page.getByRole("region", { name: "Buscar voos e hotéis" })
  await busca.getByRole("button", { name: "Buscar voos" }).click()
  await page.waitForURL("/dashboard/reservar/voos")
  await expect(page.getByRole("note").filter({ hasText: "Prévia" }).first()).toBeVisible()

  await page.getByRole("button", { name: "Selecionar" }).first().click()
  await page.getByRole("radio", { name: /Flex/ }).click()
  await page.getByRole("button", { name: "Continuar para passageiros" }).click()

  // Falta o passaporte de um passageiro: não dá para seguir.
  const seguir = page.getByRole("button", { name: "Continuar para pagamento" })
  await expect(seguir).toBeDisabled()
  await page.getByLabel("Número do passaporte").fill("FX123456")
  await seguir.click()

  // Cartão terminado em 0000: recusado, nada muda de etapa.
  await page.getByLabel("Número do cartão").fill("4000 0000 0000 0000")
  await page.getByRole("button", { name: /^Pagar / }).click()
  await expect(page.getByRole("heading", { name: "O pagamento não foi aprovado." })).toBeVisible()
  await page.getByRole("button", { name: "Tentar outro cartão" }).click()

  await page.getByLabel("Número do cartão").fill("4242 4242 4242 4242")
  await page.getByRole("button", { name: /^Pagar / }).click()
  await expect(page.getByRole("heading", { name: "Passagens compradas." })).toBeVisible()
  await expect(page.getByText("Prévia: nada foi comprado nem salvo")).toBeVisible()
  await page.screenshot({ path: `docs/pfc/evidencias/S12-F-compra-voo-previa-${test.info().project.name}.png`, fullPage: true })
})

test("hotéis: filtro, opção de quarto e pagamento com Pix", async ({ dona }) => {
  const { page } = dona
  await page.goto("/dashboard/reservar/hoteis")

  await page.getByRole("button", { name: "Café da manhã" }).click()
  await expect(page.getByRole("heading", { name: "Hotel Baixa Lisboa" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Casa em Alfama" })).toHaveCount(0)
  await page.getByRole("button", { name: "Café da manhã" }).click()

  await page.getByRole("button", { name: "Ver opções" }).first().click()
  await page.getByRole("radio", { name: /Com café da manhã/ }).click()
  await page.getByRole("button", { name: "Reservar" }).click()

  await page.getByRole("radio", { name: "Pix" }).click()
  await page.getByRole("button", { name: "Já paguei" }).click()
  await expect(page.getByRole("heading", { name: "Hospedagem reservada." })).toBeVisible()
})
