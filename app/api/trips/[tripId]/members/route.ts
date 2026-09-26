import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { exigirMembro } from "@/lib/authz/trip"
import { naoAutenticado, respostaDeErro, respostaInvalida, semPermissao, ErroHttp } from "@/lib/http"

/**
 * Participação numa viagem.
 *
 * Só existe `DELETE` aqui, e isso é deliberado. O arquivo tinha antes:
 *
 *   - um `POST` que inseria em `trip_invitations` — ou seja, duplicava
 *     `POST /api/invitations`, que agora é a única porta de convite;
 *   - um `GET` que listava membros com um embed `profiles(...)` que o PostgREST
 *     não resolve (não há chave estrangeira direta entre `trip_members` e
 *     `profiles`, só o caminho indireto por `auth.users`). Nada no aplicativo
 *     chamava esse `GET`: a página da viagem é server component e consulta
 *     direto. Rota que ninguém usa e não funciona é superfície de ataque sem
 *     contrapartida.
 *
 * Remover participante espelha a policy `trip_members_delete`
 * (`is_trip_owner OR user_id = auth.uid()`), que traduz dois requisitos
 * distintos: o dono remove quem quiser e a pessoa sai por conta própria.
 *
 * @RF04.7 o dono remove membros · @RF04.8 o membro sai da viagem
 */

async function usuarioAtual(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw naoAutenticado()
  return user
}

export async function DELETE(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params
  try {
    const supabase = await createClient()
    const user = await usuarioAtual(supabase)

    const alvo = new URL(request.url).searchParams.get("userId")
    if (!alvo) return respostaInvalida({ userId: ["informe quem sai da viagem"] })

    // Participar da viagem é pré-requisito para qualquer coisa aqui: quem está
    // de fora recebe 403 sem descobrir se a viagem existe.
    const papel = await exigirMembro(supabase, tripId, user.id)
    const saindoSozinho = alvo === user.id

    if (papel !== "owner" && !saindoSozinho) {
      throw semPermissao("remover outro participante")
    }

    // O dono sair da própria viagem a faria sumir da lista dele sem deixar de
    // ser dele: `GET /api/trips` filtra por participação (`trip_members!inner`).
    // É o mesmo defeito da viagem que "sumia", corrigido na S02 — não vale
    // recriá-lo por outra porta.
    if (papel === "owner" && saindoSozinho) {
      throw new ErroHttp(400, "O dono não pode sair da própria viagem")
    }

    const { error } = await supabase
      .from("trip_members")
      .delete()
      .eq("trip_id", tripId)
      .eq("user_id", alvo)

    // Mensagem genérica: a do Postgres pode revelar coluna e constraint.
    if (error) throw new ErroHttp(400, "Não foi possível remover o participante")

    return NextResponse.json({ success: true })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}
