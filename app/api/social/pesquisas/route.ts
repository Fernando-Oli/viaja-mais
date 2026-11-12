import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { criarClienteAdmin } from "@/lib/supabase/admin"
import { ErroHttp, naoAutenticado, naoEncontrado, respostaDeErro, respostaInvalida } from "@/lib/http"
import { registrarPesquisaSchema } from "@/lib/schemas/pesquisa"
import { SEM_CACHE_COMPARTILHADO } from "@/lib/social/avatar"
import { buscarPerfilPorUsername } from "@/lib/social/perfil-visto"
import { limparHistorico, listarRecentes, registrarPesquisa } from "@/lib/social/pesquisas"

/**
 * O histórico de pesquisa de quem está na sessão: os "Recentes" da tela de
 * pesquisa da aba Rede social.
 *
 * - GET: os recentes, do mais novo para o mais antigo (no máximo 15, com menos
 *   de 30 dias: quem garante é o banco).
 * - POST `{ username }`: registra quem foi aberto pela pesquisa, no topo.
 * - DELETE: o "Limpar tudo".
 *
 * Segue o molde de app/api/trips/[tripId]/route.ts, sem `exigirMembro` /
 * `exigirDono`: o histórico não é recurso de viagem. A regra é "só o próprio
 * histórico": o dono vem sempre de `getUser()`, nunca do corpo, que só diz QUEM
 * foi aberto (validado pelo schema, campo a campo). A RLS de `search_history` é
 * a segunda linha. Não há 403: ninguém tem acesso ao histórico de outra pessoa
 * nem para ser recusado.
 *
 * @RF09.12 histórico de pesquisa · @RNF02.11 erro do banco não vaza
 */

type Supabase = Awaited<ReturnType<typeof createClient>>

async function usuarioAtual(supabase: Supabase) {
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

    const recentes = await listarRecentes(supabase, criarClienteAdmin, user.id)
    // Leva links assinados de foto: nada de cache compartilhado.
    return NextResponse.json({ recentes }, { headers: SEM_CACHE_COMPARTILHADO })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const user = await usuarioAtual(supabase)

    // JSON malformado é payload inválido (400), não erro do servidor.
    const corpo = await request.json().catch(() => null)
    const analise = registrarPesquisaSchema.safeParse(corpo)
    if (!analise.success) return respostaInvalida(analise.error.flatten())

    const perfil = await buscarPerfilPorUsername(supabase, analise.data.username)
    if (!perfil) throw naoEncontrado("Perfil")
    if (perfil.id === user.id) throw new ErroHttp(400, "O próprio perfil não entra no histórico")

    await registrarPesquisa(supabase, user.id, perfil.id)
    return NextResponse.json({ success: true })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}

export async function DELETE() {
  try {
    const supabase = await createClient()
    const user = await usuarioAtual(supabase)

    await limparHistorico(supabase, user.id)
    return NextResponse.json({ success: true })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}
