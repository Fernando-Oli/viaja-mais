import { Hono } from "hono"
import { z } from "zod"
import { exigirDono, exigirMembro } from "../../../lib/authz/trip"
import { ErroHttp, naoEncontrado, semPermissao } from "../../../lib/erros"
import { atualizarViagemSchema, criarViagemSchema } from "../../../lib/schemas/viagem"
import { comoUsuario } from "../../db/como-usuario"
import { respostaInvalida } from "../../http/erros"
import { exigirSessao, type VariaveisSessao } from "../../http/sessao"
import * as repo from "./repositorio"

/**
 * ROTA DE REFERÊNCIA DA API — o molde de toda rota portada do Next.
 *
 * Os cinco passos do molde antigo (`app/api/trips/[tripId]/route.ts`) continuam,
 * cada um num lugar:
 *
 *   1. parâmetros  — validados com zod; id que não é UUID é 400, não 500.
 *   2. sessão      — `exigirSessao`, que consulta auth.sessions a cada requisição.
 *   3. autorização — `exigirMembro` / `exigirDono`, explícitos, antes de tocar o
 *                    dado. Estar autenticado não é estar autorizado.
 *   4. corpo       — zod, e os campos extraídos um a um no repositório.
 *   5. erros       — lançados; `app.onError` (api/http/erros.ts) responde.
 *
 * E um sexto, novo: tudo dentro de `comoUsuario()`, que roda a transação como
 * o usuário. A RLS é a segunda linha de defesa, não a única.
 *
 * Os quatro testes que toda rota precisa ter: 200 feliz, 401 sem sessão,
 * 403 para quem não participa, 400 para payload inválido
 * (tests/integracao/viagens.test.ts).
 *
 * @RF03.5 visualizar detalhes da viagem · @RF03.2 editar viagem · @RF03.3 excluir viagem
 * @RF03.1 criar viagem · @RF03.4 listar viagens
 * @RF04.4 membros visualizam a viagem · @RF04.7 o dono remove membros · @RF04.8 o membro sai da viagem
 */

const parametros = z.object({ tripId: z.string().uuid("id de viagem inválido") })

function lerTripId(param: Record<string, string>) {
  const analise = parametros.safeParse(param)
  if (!analise.success) throw new ErroHttp(400, "id de viagem inválido")
  return analise.data.tripId
}

export const rotasViagens = new Hono<{ Variables: VariaveisSessao }>()
  .use(exigirSessao)

  // Listagem e criação não têm viagem para autorizar: a lista é filtrada pela
  // participação do próprio usuário, e quem cria vira dono pelo gatilho.
  .get("/", async (c) => {
    const usuario = c.var.usuario
    const trips = await comoUsuario(usuario, (tx) => repo.listarViagens(tx, usuario.id))
    return c.json({ trips })
  })

  .post("/", async (c) => {
    const usuario = c.var.usuario
    const analise = criarViagemSchema.safeParse(await c.req.json().catch(() => null))
    if (!analise.success) return respostaInvalida(c, analise.error)

    const trip = await comoUsuario(usuario, (tx) => repo.criarViagem(tx, usuario.id, analise.data))
    // `{ data: [trip] }`, e não `{ trip }`: é o formato que `addTrip` do
    // context/auth-context.tsx já lia quando a rota estava no Next.
    return c.json({ data: [trip] })
  })

  .get("/:tripId", async (c) => {
    const tripId = lerTripId(c.req.param())
    const usuario = c.var.usuario

    const trip = await comoUsuario(usuario, async (tx) => {
      await exigirMembro((t, u) => repo.papelNaViagem(tx, t, u), tripId, usuario.id)
      return repo.buscarViagem(tx, tripId)
    })

    if (!trip) throw new ErroHttp(404, "Viagem não encontrada")
    return c.json({ trip })
  })

  .patch("/:tripId", async (c) => {
    const tripId = lerTripId(c.req.param())
    const usuario = c.var.usuario

    const corpo = await c.req.json().catch(() => null)
    const analise = atualizarViagemSchema.safeParse(corpo)

    const trip = await comoUsuario(usuario, async (tx) => {
      // Autorização antes da validação: quem não é dono recebe 403 sem saber
      // se o corpo que mandou estava certo.
      await exigirDono((t, u) => repo.papelNaViagem(tx, t, u), tripId, usuario.id)
      if (!analise.success) return null
      return repo.atualizarViagem(tx, tripId, analise.data)
    })

    if (!analise.success) return respostaInvalida(c, analise.error)
    // Mensagem genérica: a do Postgres revela coluna e constraint (RNF02.11).
    if (!trip) throw new ErroHttp(400, "Não foi possível salvar a viagem")
    return c.json({ trip })
  })

  .delete("/:tripId", async (c) => {
    const tripId = lerTripId(c.req.param())
    const usuario = c.var.usuario

    // Excluir é irreversível e apaga em cascata itinerário, despesas e reservas
    // de todos os membros — por isso é restrito ao dono, não a qualquer membro.
    const apagou = await comoUsuario(usuario, async (tx) => {
      await exigirDono((t, u) => repo.papelNaViagem(tx, t, u), tripId, usuario.id)
      return repo.excluirViagem(tx, tripId)
    })

    if (!apagou) throw new ErroHttp(400, "Não foi possível excluir a viagem")
    return c.json({ success: true })
  })

  // Participantes, com o nome de exibição. Qualquer membro vê quem está no grupo.
  .get("/:tripId/members", async (c) => {
    const tripId = lerTripId(c.req.param())
    const usuario = c.var.usuario

    const members = await comoUsuario(usuario, async (tx) => {
      await exigirMembro((t, u) => repo.papelNaViagem(tx, t, u), tripId, usuario.id)
      return repo.listarMembros(tx, tripId)
    })
    return c.json({ members })
  })

  // Remover participante espelha a policy `trip_members_delete`
  // (`is_trip_owner OR user_id = auth.uid()`): o dono remove quem quiser, e a
  // pessoa sai por conta própria. `?userId=` diz quem sai.
  .delete("/:tripId/members", async (c) => {
    const tripId = lerTripId(c.req.param())
    const usuario = c.var.usuario

    const alvo = c.req.query("userId")
    if (!alvo || !z.string().uuid().safeParse(alvo).success) {
      return c.json({ error: "Dados inválidos", detalhes: { fieldErrors: { userId: ["informe quem sai da viagem"] } } }, 400)
    }

    await comoUsuario(usuario, async (tx) => {
      // Participar é pré-requisito: quem está de fora recebe 403 sem descobrir
      // se a viagem existe.
      const papel = await exigirMembro((t, u) => repo.papelNaViagem(tx, t, u), tripId, usuario.id)
      const saindoSozinho = alvo === usuario.id

      if (papel !== "owner" && !saindoSozinho) throw semPermissao("remover outro participante")
      // O dono sair da própria viagem a faria sumir da lista dele sem deixar de
      // ser dele: GET /api/trips filtra por participação.
      if (papel === "owner" && saindoSozinho) throw new ErroHttp(400, "O dono não pode sair da própria viagem")

      if (!(await repo.removerMembro(tx, tripId, alvo))) throw naoEncontrado("Participante")
    })
    return c.json({ success: true })
  })
