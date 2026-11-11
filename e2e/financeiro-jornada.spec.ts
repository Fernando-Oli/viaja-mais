import { test, expect, type Page } from "@playwright/test"
import {
  ANA,
  BRUNO,
  linhasDeSaldo,
  linhasDeTransferencia,
  prepararViagemDeTres,
  rotuloPara,
  semRolagemHorizontal,
  texto,
  trocarPara,
  vigiarDialogos,
  type ViagemDeTres,
} from "./fixtures/financeiro"

/**
 * @RF06.1 adicionar despesa · @RF06.9 tipo de rateio · @RF06.10 valor devido por membro
 * @RF06.11 saldo por membro · @RF06.13 transferências sugeridas e registro de pagamento
 *
 * Jornada financeira ponta a ponta, pela tela: os módulos que as specs
 * anteriores provam isoladamente (rateio, despesa, acerto, pagamento)
 * funcionando juntos, com mais de um usuário e com o estado vindo do banco.
 *
 * Não repete o que já tem spec própria: os três tipos de rateio
 * (`rateio-despesa`), editar e excluir (`editar-despesa`), estados de erro e
 * vazio do acerto (`acerto-contas`) e recusas da API de pagamento
 * (`acerto-transferencias`).
 *
 * Só contas, viagem e convite são preparados pela API
 * (`e2e/fixtures/financeiro.ts`). Cada teste prepara a própria viagem e a
 * própria terceira conta: nenhum depende de outro.
 *
 * Cenário de valores, nos dois testes:
 *   - Ana lança "Hotel" R$ 90,00, dividido igual entre os três;
 *   - Bruno lança "Jantar" R$ 30,00, dividido igual entre ele e a Ana;
 *   → Ana +45,00 · Bruno −15,00 · Carla −30,00.
 */

const projeto = () => test.info().project.name
const evidencia = (cenario: string) => `docs/pfc/evidencias/S08-Ab-e2e-financeiro-${cenario}-${projeto()}.png`

/**
 * Lança uma despesa pela tela "Adicionar Despesa" com a sessão atual — quem
 * lança é quem pagou. `excluir` desmarca participantes do rateio igual pelo
 * rótulo que a tela mostra; `partes` é a prévia esperada, em ordem.
 */
async function lancarPelaTela(
  page: Page,
  tripId: string,
  despesa: { titulo: string; valor: string; excluir?: string[]; partes: RegExp[] },
) {
  await page.goto(`/dashboard/trips/${tripId}?aba=despesas`)
  await page.getByRole("link", { name: "Adicionar Despesa" }).click()
  await page.waitForURL(/\/expenses\/new$/)
  await expect(page.getByTestId("participante-rateio")).toHaveCount(3)

  await page.fill("#title", despesa.titulo)
  await page.fill("#amount", despesa.valor)
  await page.fill("#date", "2026-12-02")
  await expect(page.getByRole("radio", { name: "Igual" })).toBeChecked()
  for (const rotulo of despesa.excluir ?? []) {
    await page.getByLabel(`Incluir ${rotulo} no rateio`).click()
  }

  await expect(page.getByTestId("parte-rateio")).toHaveText(despesa.partes)
  await expect(page.getByText("A soma das partes fecha com o total.")).toBeVisible()

  await page.getByRole("button", { name: "Salvar Despesa" }).click()
  await page.waitForURL(/\?aba=despesas$/)
  await expect(page.getByText("Despesa adicionada").first()).toBeVisible()
}

/** Valor exibido na linha da despesa `titulo`, na aba Despesas. */
async function valorDaDespesa(page: Page, titulo: string) {
  const linha = page.getByRole("heading", { name: titulo, level: 4 }).locator("xpath=../..")
  return texto(await linha.locator("p.font-semibold").textContent())
}

/** Hotel (Ana, entre os três) e Jantar (Bruno, entre ele e a Ana), lançados pela tela. */
async function lancarCenario(page: Page, viagem: ViagemDeTres) {
  await trocarPara(page, ANA)
  await lancarPelaTela(page, viagem.tripId, {
    titulo: "Hotel",
    valor: "90.00",
    partes: [/R\$\s30,00/, /R\$\s30,00/, /R\$\s30,00/],
  })

  // Para o Bruno: Você, Participante 2 (Ana, dona) e Participante 3 (Carla).
  await trocarPara(page, BRUNO)
  await lancarPelaTela(page, viagem.tripId, {
    titulo: "Jantar",
    valor: "30.00",
    excluir: ["Participante 3"],
    // Quem fica de fora continua na lista, marcado "Fora".
    partes: [/R\$\s15,00/, /R\$\s15,00/, /^Fora$/],
  })
}

/** Abre o acerto pelo botão da aba Despesas, como o usuário faz. */
async function abrirAcerto(page: Page, tripId: string) {
  await page.goto(`/dashboard/trips/${tripId}?aba=despesas`)
  await page.getByRole("link", { name: "Acerto de contas" }).click()
  await page.waitForURL(/\/acerto$/)
  await expect(page.getByTestId("saldo-membro")).toHaveCount(3)
}

/** Registra pagamento na transferência que sai de "Você", com o valor sugerido ou `valor`. */
async function registrarPagamento(page: Page, valorSugerido: string, valor?: string) {
  await page.getByRole("button", { name: "Registrar pagamento" }).click()
  const dialogo = page.getByRole("dialog")
  const campo = dialogo.getByLabel(/Valor pago/)
  await expect(campo).toHaveValue(valorSugerido)
  if (valor !== undefined) await campo.fill(valor)
  await dialogo.getByRole("button", { name: "Confirmar pagamento" }).click()
  await expect(dialogo).toBeHidden()
  await expect(page.getByText("Pagamento registrado", { exact: true }).first()).toBeVisible()
}

test.describe("jornada financeira", () => {
  // Cada teste cria contas, viagem e lança despesas pela tela.
  test.describe.configure({ timeout: 150_000 })

  test("despesas pela tela, acerto, pagamento parcial, restante e Tudo acertado", async ({ page, browser }) => {
    const viagem = await prepararViagemDeTres(browser, "jornada")
    const dialogos = vigiarDialogos(page)

    // 1–5. Duas despesas, por dois pagadores, com divisões diferentes.
    await lancarCenario(page, viagem)

    // Recarregada: a lista vem do banco, e o toast da última despesa sai da frente.
    await page.reload()
    await expect(page.getByLabel("Despesas").getByRole("heading", { level: 4 })).toHaveCount(2)
    // A lista é ordenada por data e as duas têm a mesma: confere o conjunto, não a ordem.
    const titulos = await page.getByLabel("Despesas").getByRole("heading", { level: 4 }).allTextContents()
    expect(titulos.sort()).toEqual(["Hotel", "Jantar"])
    expect(await valorDaDespesa(page, "Hotel")).toBe("R$ 90,00")
    expect(await valorDaDespesa(page, "Jantar")).toBe("R$ 30,00")
    await semRolagemHorizontal(page)
    await page.screenshot({ path: evidencia("despesas"), fullPage: true })

    // 6–8. Acerto pela visão do Bruno: os saldos vêm das duas despesas juntas.
    await abrirAcerto(page, viagem.tripId)
    expect(await linhasDeSaldo(page)).toEqual([
      "Você Membro deve R$ 15,00",
      "Participante 2 Dono a receber R$ 45,00",
      "Participante 3 Membro deve R$ 30,00",
    ])
    expect(await linhasDeTransferencia(page)).toEqual([
      "Participante 3 paga R$ 30,00 para Participante 2",
      "Você paga R$ 15,00 para Participante 2",
    ])
    await semRolagemHorizontal(page)
    await page.screenshot({ path: evidencia("acerto-inicial"), fullPage: true })

    // 9–11. Pagamento parcial: a transferência continua, com o valor menor.
    await registrarPagamento(page, "15,00", "5,00")
    await expect(page.getByTestId("saldo-membro").first()).toHaveText(/Você\s*Membro\s*deve R\$\s10,00/)
    expect(await linhasDeSaldo(page)).toEqual([
      "Você Membro deve R$ 10,00",
      "Participante 2 Dono a receber R$ 40,00",
      "Participante 3 Membro deve R$ 30,00",
    ])
    expect(await linhasDeTransferencia(page)).toEqual([
      "Participante 3 paga R$ 30,00 para Participante 2",
      "Você paga R$ 10,00 para Participante 2",
    ])
    await semRolagemHorizontal(page)
    await page.screenshot({ path: evidencia("parcial"), fullPage: true })

    // 12. O restante do Bruno: a transferência dele some, a da Carla fica.
    await registrarPagamento(page, "10,00")
    await expect(page.getByTestId("saldo-membro").first()).toHaveText(/Você\s*Membro\s*quite R\$\s0,00/)
    expect(await linhasDeSaldo(page)).toEqual([
      "Você Membro quite R$ 0,00",
      "Participante 2 Dono a receber R$ 30,00",
      "Participante 3 Membro deve R$ 30,00",
    ])
    expect(await linhasDeTransferencia(page)).toEqual(["Participante 3 paga R$ 30,00 para Participante 2"])
    await expect(page.getByRole("button", { name: "Registrar pagamento" })).toHaveCount(0)
    await page.screenshot({ path: evidencia("apos-pagamento"), fullPage: true })

    // 13. A Carla paga a parte dela: ninguém deve mais nada.
    await trocarPara(page, viagem.emailC)
    await abrirAcerto(page, viagem.tripId)
    await expect(page.getByTestId("saldo-membro").first()).toHaveText(/Você\s*Membro\s*deve R\$\s30,00/)
    await registrarPagamento(page, "30,00")

    await expect(page.getByText("Tudo acertado: ninguém deve nada a ninguém.")).toBeVisible()
    const finais = await linhasDeSaldo(page)
    expect(finais).toHaveLength(3)
    expect(finais.every((l) => l?.endsWith("quite R$ 0,00"))).toBe(true)
    await expect(page.getByTestId("transferencia")).toHaveCount(0)
    await semRolagemHorizontal(page)
    await page.screenshot({ path: evidencia("tudo-acertado"), fullPage: true })

    expect(dialogos).toEqual([])
  })

  test("pagamento persiste ao recarregar e ao voltar, e os outros membros veem o saldo novo", async ({
    page,
    browser,
  }) => {
    const viagem = await prepararViagemDeTres(browser, "persiste")
    const dialogos = vigiarDialogos(page)
    await lancarCenario(page, viagem)

    // Carla paga R$ 12,34 dos R$ 30,00 — valor com centavos, para provar a conta exata.
    await trocarPara(page, viagem.emailC)
    await abrirAcerto(page, viagem.tripId)
    await registrarPagamento(page, "30,00", "12,34")
    const esperadoCarla = [
      "Você Membro deve R$ 17,66",
      "Participante 2 Dono a receber R$ 32,66",
      "Participante 3 Membro deve R$ 15,00",
    ]
    await expect(page.getByTestId("saldo-membro").first()).toHaveText(/deve R\$\s17,66/)
    expect(await linhasDeSaldo(page)).toEqual(esperadoCarla)

    // Recarregar: o saldo vem do banco, não do estado da tela.
    await page.reload()
    await expect(page.getByTestId("saldo-membro")).toHaveCount(3)
    expect(await linhasDeSaldo(page)).toEqual(esperadoCarla)
    expect(await linhasDeTransferencia(page)).toEqual([
      "Você paga R$ 17,66 para Participante 2",
      "Participante 3 paga R$ 15,00 para Participante 2",
    ])

    // Sair para a viagem e voltar pelo botão: continua igual.
    await page.getByRole("link", { name: /Voltar para a viagem/ }).click()
    await page.waitForURL(/\?aba=despesas$/)
    await abrirAcerto(page, viagem.tripId)
    expect(await linhasDeSaldo(page)).toEqual(esperadoCarla)

    // A credora vê o crédito reduzido pelo pagamento da Carla.
    await trocarPara(page, ANA)
    await abrirAcerto(page, viagem.tripId)
    const naVisaoDaAna = (id: string) => rotuloPara(viagem.ids.ana, id, viagem)
    const saldosAna = await linhasDeSaldo(page)
    expect(saldosAna[0]).toBe("Você Dono a receber R$ 32,66")
    expect(saldosAna).toContain(`${naVisaoDaAna(viagem.ids.carla)} Membro deve R$ 17,66`)
    expect(saldosAna).toContain(`${naVisaoDaAna(viagem.ids.bruno)} Membro deve R$ 15,00`)
    expect(await linhasDeTransferencia(page)).toEqual([
      `${naVisaoDaAna(viagem.ids.carla)} paga R$ 17,66 para Você`,
      `${naVisaoDaAna(viagem.ids.bruno)} paga R$ 15,00 para Você`,
    ])
    await semRolagemHorizontal(page)
    await page.screenshot({ path: evidencia("visao-credora"), fullPage: true })

    // O outro devedor também vê: a dívida dele não mudou, a da Carla sim.
    await trocarPara(page, BRUNO)
    await abrirAcerto(page, viagem.tripId)
    expect(await linhasDeSaldo(page)).toEqual([
      "Você Membro deve R$ 15,00",
      "Participante 2 Dono a receber R$ 32,66",
      "Participante 3 Membro deve R$ 17,66",
    ])

    expect(dialogos).toEqual([])
  })
})
