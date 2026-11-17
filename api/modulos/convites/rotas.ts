import { Hono } from "hono"
import { naoEncontrado } from "../../../lib/erros"
import { criarConviteSchema } from "../../../lib/schemas/convite"
import { LIMITES } from "../../../lib/seguranca/limite"
import { auth } from "../../auth/auth"
import { comoUsuario } from "../../db/como-usuario"
import { enviarEmail, escaparHtml } from "../../email/enviar"
import { envApi } from "../../env"
import { respostaInvalida } from "../../http/erros"
import { exigirLimiteNaTx } from "../../http/limite"
import { lerCorpo, lerUuid } from "../../http/parametros"
import { exigirSessao, type VariaveisSessao } from "../../http/sessao"
import { exigirDonoNaTx } from "../viagens/acesso"
import * as repo from "./repositorio"

/**
 * Convites para participar de uma viagem, em `/api/invitations`. Portados de
 * `app/api/invitations/**`.
 *
 * - **Convidar é ação de dono** (`exigirDono`), como a policy `trip_invitations_insert`.
 * - **`inviter_id` vem da sessão**, nunca do corpo.
 * - **O convidado só enxerga convite do próprio e-mail**: convite de outra
 *   pessoa responde 404, sem confirmar que existe.
 *
 * @RF04.1 o dono convida pessoas por e-mail
 * @RF04.2 o convidado recebe notificação do convite por e-mail
 * @RF04.3 aceitar convite
 * @RNF02.8 cada convite dispara um e-mail real: 10 por 10 minutos, por usuário
 */
export const rotasConvites = new Hono<{ Variables: VariaveisSessao }>()
  .use(exigirSessao)

  .get("/", async (c) => {
    const convites = await comoUsuario(c.var.usuario, (tx) => repo.pendentesDaSessao(tx))
    const invitations = convites.map((i) => ({
      id: i.id,
      trip_id: i.trip_id,
      status: "pending" as const,
      created_at: i.created_at,
      trip: { id: i.trip_id, title: i.title, destination: i.destination, start_date: i.start_date, end_date: i.end_date },
    }))
    return c.json({ invitations })
  })

  .post("/", async (c) => {
    // O `tripId` vem do corpo: não há o que autorizar antes de validar.
    const analise = criarConviteSchema.safeParse(await lerCorpo(c))
    if (!analise.success) return respostaInvalida(c, analise.error)
    const { email, tripId } = analise.data
    const eu = c.var.usuario.id

    // A linha vem antes do e-mail, de propósito: ela é a fonte da verdade (é
    // por ela que o convidado vê o convite) e é ela que a RLS protege. Na ordem
    // inversa, uma gravação que falhasse deixaria um e-mail enviado apontando
    // para um convite que não existe.
    const dados = await comoUsuario(c.var.usuario, async (tx) => {
      await exigirDonoNaTx(tx, tripId, eu)
      // Depois da autorização, para só contar convite que de fato sairia; antes
      // da gravação e do e-mail, para que o 11º não grave nem envie nada.
      await exigirLimiteNaTx(tx, LIMITES.convite)
      await repo.criar(tx, tripId, eu, email)
      return repo.dadosDoEmail(tx, tripId, eu)
    })

    const envio = await enviarConvite(email, dados)
    return c.json({ success: true, envio })
  })

  .post("/:invitationId/accept", async (c) => {
    const invitationId = lerUuid(c.req.param(), "invitationId", "convite")
    const { id, email } = c.var.usuario

    // Uma transação: entrar na viagem e marcar o convite aceito acontecem
    // juntos. A rota do Next fazia três chamadas e podia parar no meio.
    const tripId = await comoUsuario(c.var.usuario, async (tx) => {
      const convite = await repo.pendenteDoEmail(tx, invitationId, email)
      if (!convite) throw naoEncontrado("Convite")
      await repo.entrarNaViagem(tx, convite.trip_id, id)
      await repo.responder(tx, invitationId, email, "accepted")
      return convite.trip_id
    })
    return c.json({ success: true, trip_id: tripId })
  })

  .post("/:invitationId/decline", async (c) => {
    const invitationId = lerUuid(c.req.param(), "invitationId", "convite")
    const recusou = await comoUsuario(c.var.usuario, (tx) =>
      repo.responder(tx, invitationId, c.var.usuario.email, "declined"),
    )
    // A rota do Next respondia 200 mesmo sem convite nenhum; agora é 404, como no aceite.
    if (!recusou) throw naoEncontrado("Convite")
    return c.json({ success: true })
  })

/**
 * Desfecho do envio, que muda o que a tela diz a quem convidou. O convite já
 * está gravado nos três casos.
 */
type DesfechoEnvio = "enviado" | "ja-cadastrado" | "falhou"

/**
 * Avisa o convidado por e-mail. Quem já tem conta não recebe: vê o convite ao
 * entrar na Avori, como antes (o GoTrue recusava convidar e-mail cadastrado).
 *
 * Nunca lança: o convite já está gravado, e falha de e-mail não pode desfazê-lo
 * nem virar erro para quem convidou.
 *
 * @RF04.2 o convidado recebe notificação do convite por e-mail
 */
async function enviarConvite(email: string, dados: { titulo: string; quemConvida: string }): Promise<DesfechoEnvio> {
  try {
    const contexto = await auth.$context
    if (await contexto.internalAdapter.findUserByEmail(email)) return "ja-cadastrado"

    const link = `${envApi.APP_URL}/auth/sign-up?email=${encodeURIComponent(email)}`
    const { titulo, quemConvida } = dados
    await enviarEmail({
      para: email,
      assunto: `${quemConvida} convidou você para "${titulo}" na Avori`,
      texto: `${quemConvida} convidou você para a viagem "${titulo}" na Avori.\n\nCrie sua conta com este e-mail para aceitar: ${link}`,
      html: `<p>${escaparHtml(quemConvida)} convidou você para a viagem <strong>${escaparHtml(titulo)}</strong> na Avori.</p>
<p><a href="${escaparHtml(link)}">Crie sua conta com este e-mail</a> para aceitar o convite.</p>`,
    })
    return "enviado"
  } catch (erro) {
    console.warn("[convite] envio de e-mail falhou:", erro instanceof Error ? erro.message : erro)
    return "falhou"
  }
}
