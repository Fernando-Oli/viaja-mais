import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * Verificação de saúde, consultada a cada cinco minutos pelo monitor de
 * disponibilidade (`.github/workflows/disponibilidade.yml`).
 *
 * É a única rota de API sem sessão: o monitor não tem conta. Por isso ela não
 * devolve dado nenhum, só se a aplicação e o banco respondem. A consulta usa o
 * cliente anônimo sob a RLS: sem sessão, ela conta zero linhas, mas só chega a
 * esse resultado se o banco atendeu. Erro de conexão ou de autenticação com o
 * banco vira 503, sem a mensagem interna.
 *
 * `HEAD` com `count` não transfere linha nenhuma, e a resposta não pode ser
 * guardada em cache: um 200 antigo esconderia a queda.
 *
 * @RNF04.1 disponibilidade monitorada
 */

export const dynamic = "force-dynamic"

const SEM_CACHE = { "Cache-Control": "no-store" }

export async function GET() {
  const inicio = Date.now()
  try {
    const supabase = await createClient()
    const { error } = await supabase.from("trips").select("id", { count: "exact", head: true }).limit(1)
    if (error) throw error
    return NextResponse.json(
      { status: "ok", banco: "ok", ms: Date.now() - inicio },
      { status: 200, headers: SEM_CACHE },
    )
  } catch (erro) {
    console.error("[saude] banco indisponível:", erro instanceof Error ? erro.message : erro)
    return NextResponse.json(
      { status: "indisponivel", banco: "falha", ms: Date.now() - inicio },
      { status: 503, headers: SEM_CACHE },
    )
  }
}
