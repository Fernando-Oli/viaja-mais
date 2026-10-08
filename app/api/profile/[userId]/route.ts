import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { ErroHttp, naoAutenticado, naoEncontrado, respostaDeErro } from "@/lib/http"
import { avatarPublico } from "@/lib/social/avatar"

/**
 * Dados básicos de um perfil, por id. Quem consome é `context/auth-context.tsx`,
 * para o nome e o avatar do cabeçalho — por isso a resposta continua `{ profile }`.
 *
 * No molde de app/api/trips/[tripId]/route.ts: `await params`, `getUser()`,
 * erro do banco pelo `respostaDeErro`, sem a mensagem crua do Postgres. Não há
 * `exigirMembro`/`exigirDono`: perfil não é recurso de viagem, e os dados
 * básicos são visíveis a qualquer autenticado (detalhamento do RF02).
 *
 * `avatar_url` guarda o caminho da foto no bucket; a resposta devolve a URL
 * pública, que é o que o cabeçalho põe no <img>.
 *
 * A edição do perfil mora em /api/social/perfil (S04-M). O PATCH que existia
 * aqui gravava o corpo inteiro no UPDATE (mass-assignment) e nenhuma tela o usava.
 *
 * @RF02.1 visualizar perfil · @RNF02.11 erro do banco não vaza
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw naoAutenticado()

    if (!UUID.test(userId)) throw new ErroHttp(400, "Identificador de usuário inválido")

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, created_at, updated_at")
      .eq("id", userId)
      .maybeSingle()

    if (error) throw error
    if (!profile) throw naoEncontrado("Perfil")
    return NextResponse.json({
      profile: { ...profile, avatar_url: avatarPublico(profile.avatar_url) },
    })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}
