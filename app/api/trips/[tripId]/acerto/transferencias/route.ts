import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { exigirMembro } from "@/lib/authz/trip"
import { naoAutenticado, respostaDeErro, respostaInvalida, ErroHttp } from "@/lib/http"
import { registrarTransferenciaSchema } from "@/lib/schemas/transferencia"
import { centavosParaReais, reaisParaCentavos } from "@/lib/finance/rateio"
import { ErroTransferencia, validarTransferencia } from "@/lib/finance/transferencia"
import { carregarAcerto } from "../carregar-acerto"

/**
 * Registra um pagamento do acerto de contas: `de` já pagou `valor` para `para`.
 *
 * Mesmo molde do `GET` do acerto, com a escrita no fim:
 *
 *   1. `getUser()`      — sem sessão, 401, antes de olhar qualquer entrada.
 *   2. `tripId` e corpo validados com zod — 400.
 *   3. `exigirMembro`   — quem não participa da viagem recebe 403.
 *   4. o pagador tem de ser quem está na sessão — 403. Ninguém registra
 *      pagamento em nome de outra pessoa; a policy `settlements_insert` exige o
 *      mesmo no banco.
 *   5. o acerto atual é recalculado no servidor (`carregarAcerto`) e o pedido é
 *      conferido contra ele por `validarTransferencia()` — 422 se não cabe.
 *      O que o navegador mostrou não é aceito como verdade.
 *   6. `insert` campo a campo, com o cliente da sessão, sob RLS. Sem service role.
 *
 * Idempotência: `chave` é única por pagador. Reenviar a mesma chave (clique
 * duplo, nova tentativa depois de queda de rede) devolve 200 com o pagamento
 * que já existe, em vez de gravar outro.
 *
 * Limitação conhecida: dois pedidos com chaves diferentes ao mesmo tempo podem
 * passar os dois pela conferência de saldo antes de qualquer um gravar. Não há
 * transação entre a leitura e o `insert`; ver `docs/plans/S08-Ab-transferencias.md`.
 *
 * @RF06.13 registrar como paga uma transferência do acerto
 * @RNF02.9 settlements visíveis e graváveis só por membros da viagem
 */

const tripIdSchema = z.string().uuid()

const COLUNAS = "id, trip_id, from_user_id, to_user_id, amount, currency, created_at"

/** Violação de unique no Postgres: aqui, só pode ser a chave de idempotência repetida. */
const CHAVE_REPETIDA = "23505"

type Supabase = Awaited<ReturnType<typeof createClient>>

/** O pagamento desta pessoa nesta viagem gravado com `chave`, se houver. */
async function buscarPorChave(supabase: Supabase, tripId: string, pagadorId: string, chave: string) {
  const { data, error } = await supabase
    .from("settlements")
    .select(COLUNAS)
    .eq("trip_id", tripId)
    .eq("from_user_id", pagadorId)
    .eq("idempotency_key", chave)
    .maybeSingle()
  if (error) throw new ErroHttp(500, "Não foi possível conferir o pagamento")
  return data
}

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw naoAutenticado()

    if (!tripIdSchema.safeParse(tripId).success) {
      return respostaInvalida({ tripId: ["identificador de viagem inválido"] })
    }

    const analise = registrarTransferenciaSchema.safeParse(await request.json().catch(() => null))
    if (!analise.success) return respostaInvalida(analise.error.flatten())

    // Campo a campo: nada do corpo além destes chega ao banco.
    const { de, para, valor, moeda, chave } = analise.data
    const valorCentavos = reaisParaCentavos(valor) as number

    await exigirMembro(supabase, tripId, user.id)

    if (de !== user.id) {
      throw new ErroHttp(403, "Só quem pagou pode registrar o próprio pagamento")
    }

    // Reenvio de um pagamento já gravado: o saldo já o inclui, então conferir
    // de novo daria "acima da dívida". Responde com o que já existe.
    const anterior = await buscarPorChave(supabase, tripId, user.id, chave)
    if (anterior) return NextResponse.json({ transferencia: anterior }, { status: 200 })

    const acerto = await carregarAcerto(supabase, tripId, user.id)
    try {
      validarTransferencia(acerto, { de, para, valorCentavos, moeda })
    } catch (erro) {
      if (erro instanceof ErroTransferencia) throw new ErroHttp(422, erro.message)
      throw erro
    }

    const { data, error } = await supabase
      .from("settlements")
      .insert({
        trip_id: tripId,
        from_user_id: user.id,
        to_user_id: para,
        amount: centavosParaReais(valorCentavos),
        currency: moeda,
        idempotency_key: chave,
      })
      .select(COLUNAS)
      .single()

    // Os dois envios passaram juntos pela busca acima: o unique decidiu.
    if (error?.code === CHAVE_REPETIDA) {
      const existente = await buscarPorChave(supabase, tripId, user.id, chave)
      if (existente) return NextResponse.json({ transferencia: existente }, { status: 200 })
      throw new ErroHttp(409, "Este pagamento já foi enviado")
    }

    // Mensagem genérica: a do Postgres pode revelar coluna/constraint.
    if (error || !data) throw new ErroHttp(500, "Não foi possível registrar o pagamento")

    return NextResponse.json({ transferencia: data }, { status: 201 })
  } catch (erro) {
    if (erro instanceof ErroHttp && erro.status >= 500) {
      return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
    }
    return respostaDeErro(erro)
  }
}
