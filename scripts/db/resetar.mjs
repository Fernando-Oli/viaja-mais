#!/usr/bin/env node
/**
 * Recria o banco local do zero: apaga o volume, sobe o Postgres (que roda
 * db/init/), aplica as migrations e o seed.
 *
 *   npm run db:reset
 *
 * Apagar o volume, e não só as tabelas, é o que garante que db/init/ também é
 * testado a cada reset. Um banco que só funciona porque sobrou algo de uma
 * execução anterior não é reproduzível.
 *
 * Só toca o serviço `db` do docker-compose.yml. É local por construção: não lê
 * nenhuma URL de banco do ambiente.
 */
import { execFileSync } from "node:child_process"
import { migrar } from "./migrar.mjs"
import { semear } from "./semear.mjs"

const compose = (...args) => execFileSync("docker", ["compose", ...args], { stdio: ["ignore", "ignore", "inherit"] })

try {
  console.log("[1/4] Apagando o banco local")
  compose("rm", "--stop", "--force", "--volumes", "db")
  execFileSync("docker", ["volume", "rm", "--force", "avori_dados-db"], { stdio: "ignore" })

  console.log("[2/4] Subindo o Postgres (db/init/)")
  compose("up", "--detach", "--build", "--wait", "db")

  console.log("[3/4] Aplicando migrations")
  const { total } = await migrar({ silencioso: true })
  console.log(`      ${total} migrations`)

  console.log("[4/4] Seed")
  const n = await semear()
  console.log(`      ${n} usuários e seed aplicados.\n\nBanco pronto em postgresql://localhost:55432/avori`)
} catch (erro) {
  console.error(`\nERRO: ${erro.message}`)
  // execFileSync falha com `status`: aí o problema é o Docker, não o SQL.
  if (erro.status !== undefined) console.error("O Docker Desktop está aberto? Rode `docker compose ps` para ver o estado.")
  process.exit(1)
}
