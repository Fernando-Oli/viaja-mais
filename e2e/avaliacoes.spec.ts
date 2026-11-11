import type { Page } from "@playwright/test"
import { test, expect, DONA } from "./fixtures/contas"

/**
 * @RF11.1 avaliar · @RF11.2 ver avaliações de outros · @RF11.3 editar/excluir a própria
 *
 * A dona avalia, recarrega, edita; outra pessoa, que salvou o mesmo lugar numa
 * viagem própria, vê a avaliação sem poder mexer nela; a dona exclui.
 */

/** Viagem e lugar pela API: a busca do Google não carrega com a chave de teste. */
async function viagemComLugar(page: Page, titulo: string, nome: string, googleId: string) {
  const viagem = await page.request.post("/api/trips", {
    data: {
      title: titulo,
      destination: "Recife",
      start_date: "2026-12-01",
      end_date: "2026-12-10",
      currency: "BRL",
      status: "planning",
    },
  })
  expect(viagem.ok()).toBeTruthy()
  const tripId: string = (await viagem.json()).data[0].id

  const lugar = await page.request.post(`/api/trips/${tripId}/places`, {
    data: { name: nome, latitude: -8.0631, longitude: -34.8711, place_id: googleId },
  })
  expect(lugar.ok()).toBeTruthy()
  return tripId
}

async function abrirAvaliacoes(page: Page, tripId: string, nome: string) {
  await page.goto(`/dashboard/trips/${tripId}?aba=lugares`)
  await page.getByRole("listitem").filter({ hasText: nome }).getByRole("button", { name: "Avaliações" }).click()
  const dialogo = page.getByRole("dialog")
  await expect(dialogo).toBeVisible()
  await expect(dialogo.getByText("Carregando avaliações...")).toHaveCount(0)
  return dialogo
}

test("avaliar, editar, ver a avaliação de outra pessoa e excluir", async ({ dona, convidado }) => {
  const projeto = test.info().project.name
  const sufixo = Date.now()
  const nome = `Marco Zero ${sufixo}`
  const googleId = `e2e-marco-zero-${sufixo}-${projeto}`

  const tripDaDona = await viagemComLugar(dona.page, `Viagem avaliada ${sufixo}`, nome, googleId)

  // Primeira avaliação: sem nota, não salva.
  let dialogo = await abrirAvaliacoes(dona.page, tripDaDona, nome)
  await expect(dialogo.getByText("Nenhuma avaliação ainda")).toBeVisible()
  await expect(dialogo.getByRole("button", { name: "Salvar" })).toBeDisabled()

  await dialogo.getByRole("button", { name: "4 estrelas" }).click()
  await dialogo.getByLabel("Comentário").fill("Vista linda no fim da tarde")
  await dialogo.getByRole("button", { name: "Salvar" }).click()
  await expect(dona.page.getByText("Avaliação salva").first()).toBeVisible()
  await expect(dialogo.getByText("4,0 (1 avaliação)")).toBeVisible()
  await expect(dialogo.getByText("(você)")).toBeVisible()

  // Persiste: depois de recarregar, o formulário volta com a nota salva.
  await dona.page.reload()
  dialogo = await abrirAvaliacoes(dona.page, tripDaDona, nome)
  await expect(dialogo.getByRole("button", { name: "4 estrelas" })).toHaveAttribute("aria-pressed", "true")
  await expect(dialogo.getByLabel("Comentário")).toHaveValue("Vista linda no fim da tarde")
  await expect(dialogo.getByRole("listitem").getByText("Vista linda no fim da tarde")).toBeVisible()

  // Editar: avaliar de novo troca a nota, sem criar uma segunda avaliação.
  await dialogo.getByRole("button", { name: "5 estrelas" }).click()
  await dialogo.getByRole("button", { name: "Salvar" }).click()
  await expect(dialogo.getByText("5,0 (1 avaliação)")).toBeVisible()
  await expect(dialogo.getByRole("listitem")).toHaveCount(1)
  await dona.page.screenshot({ path: `docs/pfc/evidencias/S09-A-avaliacoes-salva-${projeto}.png`, fullPage: true })

  // Outra pessoa, com o mesmo lugar numa viagem própria, vê a avaliação da dona
  // e não tem como excluí-la.
  const tripDoConvidado = await viagemComLugar(convidado.page, `Viagem da Carla ${sufixo}`, nome, googleId)
  const dialogoDela = await abrirAvaliacoes(convidado.page, tripDoConvidado, nome)
  const daDona = dialogoDela.getByRole("listitem").filter({ hasText: DONA.nome })
  await expect(daDona).toBeVisible()
  await expect(daDona.getByText("Vista linda no fim da tarde")).toBeVisible()
  await expect(daDona.getByText("(você)")).toHaveCount(0)
  await expect(dialogoDela.getByRole("button", { name: "Excluir minha avaliação" })).toHaveCount(0)
  await convidado.page.screenshot({
    path: `docs/pfc/evidencias/S09-A-avaliacoes-outra-pessoa-${projeto}.png`,
    fullPage: true,
  })

  // Excluir: cancelar mantém; confirmar remove.
  await dialogo.getByRole("button", { name: "Excluir minha avaliação" }).click()
  const modal = dona.page.getByRole("alertdialog")
  await modal.getByRole("button", { name: "Cancelar" }).click()
  await expect(modal).toHaveCount(0)
  await expect(dialogo.getByText("5,0 (1 avaliação)")).toBeVisible()

  await dialogo.getByRole("button", { name: "Excluir minha avaliação" }).click()
  await dona.page.getByRole("alertdialog").getByRole("button", { name: "Excluir" }).click()
  await expect(dona.page.getByText("Avaliação excluída").first()).toBeVisible()
  await expect(dialogo.getByText("Nenhuma avaliação ainda")).toBeVisible()
  await dona.page.screenshot({ path: `docs/pfc/evidencias/S09-A-avaliacoes-excluida-${projeto}.png`, fullPage: true })
})
