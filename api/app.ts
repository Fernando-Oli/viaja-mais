import { Hono } from "hono"
import { sql } from "kysely"
import { auth } from "./auth/auth"
import { banco } from "./db/conexao"
import { envApi } from "./env"
import { tratarErro } from "./http/erros"
import { rotasAcerto } from "./modulos/acerto/rotas"
import { rotasConvites } from "./modulos/convites/rotas"
import { rotasDespesas, rotasDespesasDoUsuario } from "./modulos/despesas/rotas"
import { rotasAgenda, rotasItinerario } from "./modulos/itinerario/rotas"
import { rotasLugares, rotasLugaresDoUsuario } from "./modulos/lugares/rotas"
import { rotasPerfis } from "./modulos/perfis/rotas"
import { rotasSocial } from "./modulos/social/rotas"
import { rotasReservas, rotasReservasDoUsuario } from "./modulos/reservas/rotas"
import { rotasViagens } from "./modulos/viagens/rotas"

/**
 * A API do Avori: um monólito modular, sem estado, organizado por domínio.
 *
 * Sem estado quer dizer: nada de sessão, cache ou contador em memória. Sessão e
 * limite de tentativas ficam no Postgres. Por isso qualquer réplica atende
 * qualquer requisição, e escalar é subir mais réplicas atrás do load balancer.
 *
 * Exportada separada do servidor (`servidor.ts`) para os testes chamarem
 * `app.request(...)` sem abrir porta.
 *
 * @RNF06.1 execução sem estado, permitindo múltiplas instâncias
 */
export const app = new Hono()
  // Toda resposta diz qual réplica atendeu. É o que torna o balanceamento
  // visível na demonstração e no teste de carga.
  .use(async (c, next) => {
    await next()
    c.header("X-Replica", envApi.REPLICA)
  })

  // Saúde para o load balancer: só responde 200 se o banco responder. Não
  // consulta tabela nenhuma (app_api não tem privilégio próprio).
  .get("/health", async (c) => {
    await sql`select 1`.execute(banco)
    return c.json({ status: "ok", replica: envApi.REPLICA })
  })

  .on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))

  .route("/api/trips/:tripId/itinerary", rotasItinerario)
  .route("/api/trips/:tripId/bookings", rotasReservas)
  .route("/api/trips/:tripId/places", rotasLugares)
  .route("/api/trips/:tripId/expenses", rotasDespesas)
  .route("/api/trips/:tripId/acerto", rotasAcerto)
  .route("/api/trips", rotasViagens)
  .route("/api/bookings", rotasReservasDoUsuario)
  .route("/api/places", rotasLugaresDoUsuario)
  .route("/api/expenses", rotasDespesasDoUsuario)
  .route("/api/itinerary", rotasAgenda)
  .route("/api/profile", rotasPerfis)
  .route("/api/invitations", rotasConvites)
  .route("/api/social", rotasSocial)

  .notFound((c) => c.json({ error: "Rota não encontrada" }, 404))
  .onError(tratarErro)

export type App = typeof app
