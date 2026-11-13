import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { selecaoDeViagens, FILTRO_EM_VIAGENS } from "@/lib/trips/escopo"
import { ErroHttp, naoAutenticado, respostaDeErro, respostaInvalida } from "@/lib/http"
import { criarViagemSchema } from "@/lib/schemas/viagem"
import { LIMITE_LISTAGEM } from "@/lib/listagem"

/**
 * Lista e cria viagens. Segue o molde de `app/api/trips/[tripId]/route.ts`.
 *
 * Até a revisão de segurança (S10-F) o POST gravava os campos do corpo sem
 * validar nada — o `criarViagemSchema` existia e não era usado — e as duas
 * rotas devolviam a mensagem do Postgres ao cliente, que pode revelar nome de
 * coluna e constraint (RNF02.11).
 *
 * @RF03.1 criar viagem · @RF03.4 listar viagens · @RNF02.5 validação por esquema
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

    const { data: trips, error } = await supabase
      .from("trips")
      .select(selecaoDeViagens("*", "user_id, role"))
      .eq(FILTRO_EM_VIAGENS, user.id)
      .order("start_date", { ascending: false })
      .limit(LIMITE_LISTAGEM)

    if (error) throw new ErroHttp(400, "Não foi possível carregar as viagens")

    return NextResponse.json({ trips })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const user = await usuarioAtual(supabase)

    const analise = criarViagemSchema.safeParse(await request.json().catch(() => null))
    if (!analise.success) return respostaInvalida(analise.error.flatten())

    // Campo a campo, do resultado do zod. `user_id` vem da sessão.
    const { title, destination, start_date, end_date, description, budget, currency, status } = analise.data

    const { data, error } = await supabase
      .from("trips")
      .insert([
        {
          user_id: user.id,
          title,
          destination,
          start_date,
          end_date,
          description: description || null,
          budget: budget ?? null,
          currency,
          status,
        },
      ])
      .select()

    if (error) throw new ErroHttp(400, "Não foi possível criar a viagem")
    if (!data || data.length === 0) throw new ErroHttp(500, "A viagem não pôde ser criada")

    // O trigger `on_trip_created` (supabase/migrations/) já insere o criador em
    // trip_members como owner, na mesma transação do insert acima — inserir de
    // novo aqui colide com a constraint única trip_members_trip_id_user_id_key.
    return NextResponse.json({ data })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}
