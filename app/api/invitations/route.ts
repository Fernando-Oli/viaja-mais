import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { criarClienteAdmin } from "@/lib/supabase/admin"
import { exigirDono } from "@/lib/authz/trip"
import { naoAutenticado, respostaDeErro, respostaInvalida, ErroHttp } from "@/lib/http"
import { criarConviteSchema } from "@/lib/schemas/convite"
import { env } from "@/lib/env"

/**
 * Convites para participar de uma viagem.
 *
 * Segue o molde de `app/api/trips/[tripId]/route.ts`. Duas coisas são
 * específicas daqui:
 *
 *   - **Convidar é ação de dono**, não de qualquer membro. Espelha a policy
 *     `trip_invitations_insert` (`is_trip_owner`) do banco: a checagem no
 *     servidor repete a regra da RLS de propósito, porque a RLS é a segunda
 *     linha de defesa, nunca a única.
 *   - **`inviter_id` vem da sessão.** Antes vinha do corpo da requisição — e o
 *     handler não chamava `getUser()` em momento nenhum, então qualquer
 *     requisição podia criar convite para qualquer viagem, em nome de qualquer
 *     pessoa.
 *
 * @RF04.1 o dono convida pessoas por e-mail
 * @RF04.2 o convidado recebe notificação do convite por e-mail
 */

async function usuarioAtual(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw naoAutenticado()
  return user
}

export async function GET() {
  try {
    const supabase = await createClient()
    const user = await usuarioAtual(supabase)

    const { data: invitations, error } = await supabase
      .from("trip_invitations")
      .select("*")
      .eq("invitee_email", user.email)
      .eq("status", "pending")

    // Mensagem genérica: a do Postgres pode revelar coluna e constraint.
    if (error) throw new ErroHttp(400, "Não foi possível carregar os convites")

    const comViagem = await Promise.all(
      (invitations || []).map(async (invitation) => {
        const { data: trip } = await supabase
          .from("trips")
          .select("id, title, destination, start_date, end_date")
          .eq("id", invitation.trip_id)
          .single()

        return { ...invitation, trip }
      }),
    )

    return NextResponse.json({ invitations: comViagem })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}

/**
 * Desfecho do envio. Interessa ao cliente porque muda o que dizer ao usuário:
 * quem já tem conta não recebe e-mail, e ainda assim foi convidado.
 */
type DesfechoEnvio = "enviado" | "ja-cadastrado" | "falhou"

/**
 * Códigos em que o GoTrue recusa o convite porque o e-mail já pertence a uma
 * conta. Não é falha nossa: o convite continua válido e aparece na aplicação
 * assim que a pessoa entrar.
 */
const JA_CADASTRADO = new Set(["email_exists", "user_already_exists"])

/**
 * Envia o convite pela API administrativa do GoTrue, que **exige a chave de
 * serviço** — daí o cliente admin. Era exatamente isto que faltava: a chamada
 * era feita com o cliente anon e falhava em silêncio.
 *
 * Nunca lança. O convite já está gravado quando esta função roda, e falha de
 * e-mail não pode desfazer um convite válido nem virar erro para quem convidou.
 *
 * @RF04.2 o convidado recebe notificação do convite por e-mail
 */
async function enviarConvite(email: string): Promise<DesfechoEnvio> {
  try {
    const admin = criarClienteAdmin()

    // `options.data` não é usado de propósito: ele vai para
    // `auth.users.user_metadata`, que o próprio usuário pode editar. Nada que
    // se pareça com autorização pode morar ali — o vínculo com a viagem está em
    // `trip_invitations`, sob RLS.
    const { error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${env.NEXT_PUBLIC_APP_URL}/dashboard`,
    })

    if (!error) return "enviado"
    if (error.code && JA_CADASTRADO.has(error.code)) return "ja-cadastrado"

    console.warn("[convite] envio de e-mail falhou:", error.message)
    return "falhou"
  } catch (erro) {
    // Chave de serviço ausente cai aqui. O convite continua de pé.
    console.warn("[convite] cliente admin indisponível:", erro instanceof Error ? erro.message : erro)
    return "falhou"
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const user = await usuarioAtual(supabase)

    // O `tripId` vem do corpo, então a validação precisa acontecer antes da
    // autorização — não há o que autorizar enquanto não se sabe qual viagem é.
    const analise = criarConviteSchema.safeParse(await request.json())
    if (!analise.success) return respostaInvalida(analise.error.flatten())

    const { email, tripId } = analise.data

    await exigirDono(supabase, tripId, user.id)

    // A linha vem antes do e-mail, de propósito. Ela é a fonte da verdade: é por
    // ela que o convidado vê o convite na aplicação, e é ela que a RLS protege.
    // Na ordem inversa, um insert que falhasse deixaria um e-mail já enviado
    // apontando para um convite que não existe.
    //
    // Campo a campo. `inviter_id` sai da sessão e `status` é fixo aqui, então
    // nem um nem outro têm como chegar pelo corpo da requisição.
    const { error } = await supabase.from("trip_invitations").insert({
      trip_id: tripId,
      inviter_id: user.id,
      invitee_email: email,
      status: "pending",
    })

    if (error) throw new ErroHttp(400, "Não foi possível criar o convite")

    const envio = await enviarConvite(email)

    return NextResponse.json({ success: true, envio })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}
