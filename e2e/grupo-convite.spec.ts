import { test, expect } from "./fixtures/contas"

/**
 * Fluxo de grupo ponta a ponta, todo pela tela: cadastro → criar viagem →
 * convidar → aceitar. Duas pessoas em navegadores separados (ver
 * `e2e/fixtures/contas.ts`): a dona é o usuário A do seed; o convidado é uma
 * conta criada pelo cadastro neste mesmo teste.
 *
 * Nenhum passo usa `page.request` nem o cliente Supabase: o que se prova aqui
 * é que uma pessoa consegue montar o grupo sem sair da interface.
 *
 * @RF03.1 criar viagem · @RF04.1 convidar por e-mail · @RF04.3 aceitar convite
 */

/** "AAAA-MM-DD" daqui a `dias` dias — o formulário não aceita início no passado. */
function daquiA(dias: number) {
  const data = new Date()
  data.setDate(data.getDate() + dias)
  const ano = data.getFullYear()
  const mes = String(data.getMonth() + 1).padStart(2, "0")
  const dia = String(data.getDate()).padStart(2, "0")
  return `${ano}-${mes}-${dia}`
}

const paraTela = (iso: string) => iso.split("-").reverse().join("/")

test("dona cria a viagem pela tela, convida e o convidado aceita", async ({ dona, convidado }) => {
  const projeto = test.info().project.name
  const titulo = `Chapada com a turma ${Date.now()}`
  const inicio = daquiA(30)
  const fim = daquiA(34)

  // 1. A dona cria a viagem pelo formulário. O destino é digitado: com a chave
  //    placeholder do Maps não há sugestão, e o campo precisa aceitar texto livre.
  await dona.page.goto("/dashboard/trips/new")
  await dona.page.fill("#title", titulo)
  await dona.page.fill("#destination", "Chapada dos Veadeiros")
  await dona.page.fill("#start_date", inicio)
  await dona.page.fill("#end_date", fim)
  await dona.page.getByRole("button", { name: "Criar Viagem" }).click()

  await expect(dona.page.getByText("Viagem criada", { exact: true })).toBeVisible()
  await dona.page.waitForURL(/\/dashboard\/trips\/[0-9a-f-]{36}$/)
  await expect(dona.page.getByRole("heading", { name: titulo })).toBeVisible()

  // 2. Convite pelo cartão de membros. O convidado já tem conta, então o
  //    servidor não manda e-mail e a tela diz que ele verá o convite ao entrar.
  await dona.page.getByLabel("E-mail de quem convidar").fill(convidado.email)
  await dona.page.getByRole("button", { name: "Enviar Convite" }).click()
  await expect(dona.page.getByText("Convite enviado", { exact: true })).toBeVisible()
  await expect(
    dona.page.getByText("A pessoa já tem conta e vai ver o convite ao entrar no ViajaMais.", { exact: true }),
  ).toBeVisible()
  await expect(dona.page.getByLabel("E-mail de quem convidar")).toHaveValue("")

  // 3. O convidado vê o convite no dashboard. A conta é nova, então é o único.
  //    Título e datas não são conferidos aqui: antes do aceite a RLS de `trips`
  //    esconde a viagem de quem ainda não é membro, e o cartão mostra só o
  //    aviso genérico (ver "Observações" no plano S07-A-e2e-grupo).
  await convidado.page.goto("/dashboard")
  await expect(convidado.page.getByText("Convites Pendentes")).toBeVisible()
  const aceitar = convidado.page.getByRole("button", { name: "Aceitar" })
  await expect(aceitar).toHaveCount(1)
  await convidado.page.screenshot({
    path: `docs/pfc/evidencias/S07-A-e2e-grupo-convite-${projeto}.png`,
    fullPage: true,
  })

  // 4. Aceita: o cartão some e a viagem entra na lista dele, sem recarregar.
  await aceitar.click()
  await expect(convidado.page.getByText("Convite aceito", { exact: true })).toBeVisible()
  await expect(convidado.page.getByText("Convites Pendentes")).toBeHidden()
  await convidado.page.getByRole("link", { name: new RegExp(titulo) }).first().click()
  await convidado.page.waitForURL(/\/dashboard\/trips\/[0-9a-f-]{36}$/)

  // 5. Já membro, ele abre a viagem — agora com título e datas — e se vê ao lado da dona.
  await expect(convidado.page.getByRole("heading", { name: titulo })).toBeVisible()
  await expect(convidado.page.getByText(`${paraTela(inicio)} - ${paraTela(fim)}`)).toBeVisible()
  await expect(convidado.page.getByText("2 pessoas nesta viagem")).toBeVisible()
  await expect(convidado.page.getByRole("main").getByText(dona.nome)).toBeVisible()
  await expect(convidado.page.getByRole("main").getByText(convidado.nome)).toBeVisible()
  // Só a dona convida: o formulário não aparece para o membro.
  await expect(convidado.page.getByLabel("E-mail de quem convidar")).toHaveCount(0)
  await convidado.page.screenshot({
    path: `docs/pfc/evidencias/S07-A-e2e-grupo-membros-${projeto}.png`,
    fullPage: true,
  })

  // 6. Do lado da dona, o grupo também mudou.
  await dona.page.reload()
  await expect(dona.page.getByText("2 pessoas nesta viagem")).toBeVisible()
  await expect(dona.page.getByRole("main").getByText(convidado.nome)).toBeVisible()
})
