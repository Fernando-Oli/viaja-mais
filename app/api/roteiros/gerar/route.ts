import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { naoAutenticado, respostaDeErro, respostaInvalida } from "@/lib/http"
import { exigirLimite, LIMITES } from "@/lib/seguranca/limite"
import { gerarRoteiroSchema } from "@/lib/schemas/roteiro"
import { escolherGerador } from "@/lib/ai/provider"
import { TEMPO_MAXIMO_MS } from "@/lib/ai/erros"

/**
 * Gera um roteiro dia a dia por IA. Segue o molde de `app/api/trips/[tripId]/route.ts`.
 *
 * Gera e devolve; **não grava nada**. A pessoa revisa e edita o roteiro na tela
 * (RF12.2), e só então a tela cria a viagem e os itens pelas rotas de viagem e
 * de itinerário, que validam tudo de novo. A saída do modelo nunca vira linha
 * no banco sem passar por uma pessoa.
 *
 * Sem `params` e sem `exigirMembro`: o roteiro nasce antes de a viagem existir,
 * então não há viagem para autorizar. O controle é sessão + limite por usuário,
 * porque cada chamada gasta cota do provedor.
 *
 * Ordem: sessão → zod (payload inválido não gasta tentativa) → limite → gerar.
 *
 * @RF12.1 gerar roteiro por IA · @RNF07.3 resposta em até 15 s ou erro claro ·
 * @RNF07.4 no máximo 10 gerações por usuário por hora
 */

// A espera pelo provedor é cortada em 15 s; a função precisa viver um pouco mais
// que isso para responder o 504 em vez de ser morta pela plataforma.
export const maxDuration = 30

async function usuarioAtual(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw naoAutenticado()
  return user
}

export async function POST(request: Request) {
  // O prazo do RNF07.3 conta desde a chegada do pedido: sessão e limite estão
  // dentro dos 15 s, não somados a eles (achado da revisão de 20/11).
  const prazo = AbortSignal.timeout(TEMPO_MAXIMO_MS)
  try {
    const supabase = await createClient()
    await usuarioAtual(supabase)

    const analise = gerarRoteiroSchema.safeParse(await request.json().catch(() => null))
    if (!analise.success) return respostaInvalida(analise.error.flatten())

    await exigirLimite(supabase, LIMITES.roteiroIa)

    // Campo a campo, do resultado do zod: nada do corpo chega ao modelo sem passar pelo schema.
    const { destino, dias, quem, ritmo, orcamento, interesses } = analise.data
    const gerador = escolherGerador()
    const roteiro = await gerador.gerar(
      { destino, dias, quem, ritmo, orcamento, interesses },
      { sinal: prazo },
    )

    return NextResponse.json({ roteiro }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}
