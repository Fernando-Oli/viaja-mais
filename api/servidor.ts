import { serve } from "@hono/node-server"
import { app } from "./app"
import { fecharConexoes } from "./db/conexao"
import { envApi } from "./env"

/**
 * Sobe a API.
 *
 *   npm run api:dev     com recarga ao salvar
 *   npm run api:start   sem recarga
 *
 * Ao receber SIGTERM (o load balancer ou o Docker parando a réplica), para de
 * aceitar conexões, deixa as requisições em andamento terminarem e fecha os
 * pools. Sem isso, uma réplica derrubada cortaria transações no meio.
 */
const servidor = serve({ fetch: app.fetch, port: envApi.PORT }, ({ port }) => {
  console.warn(`API do Avori na porta ${port} (réplica ${envApi.REPLICA})`)
})

for (const sinal of ["SIGTERM", "SIGINT"] as const) {
  process.on(sinal, () => {
    servidor.close(async () => {
      await fecharConexoes()
      process.exit(0)
    })
  })
}
