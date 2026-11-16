#!/usr/bin/env node
/**
 * Cria os usuários de teste e aplica db/seed.sql.
 *
 *   node scripts/db/semear.mjs
 *
 * Os usuários são gravados direto em auth.users e auth.accounts, com o hash de
 * senha calculado pela mesma função que o Better Auth usa no login. Não passam
 * pela API de cadastro porque os testes dependem de ids fixos (os de
 * tests/fixtures/usuarios.ts), e o cadastro gera um id novo a cada chamada.
 *
 * Idempotente: rodar de novo não duplica nada.
 */
import fs from "node:fs"
import pg from "pg"
import { hashPassword } from "better-auth/crypto"
import { USUARIOS } from "../../tests/fixtures/usuarios.ts"
import { URL_ADMIN } from "./migrar.mjs"

export async function semear() {
  const cliente = new pg.Client({ connectionString: URL_ADMIN })
  await cliente.connect()
  try {
    await cliente.query("begin")
    for (const u of Object.values(USUARIOS)) {
      // O gatilho on_auth_user_created cria o perfil em public.profiles a partir
      // de `name`.
      await cliente.query(
        `insert into auth.users (id, name, email, email_verified, created_at, updated_at)
         values ($1, $2, $3, true, now(), now())
         on conflict (id) do nothing`,
        [u.id, u.nome, u.email],
      )
      // Conta de e-mail e senha: no Better Auth, provider "credential" e
      // account_id igual ao id do usuário.
      await cliente.query(
        `insert into auth.accounts (account_id, provider_id, user_id, password, created_at, updated_at)
         select $1::text, 'credential', $1::uuid, $2, now(), now()
         where not exists (
           select 1 from auth.accounts where user_id = $1::uuid and provider_id = 'credential'
         )`,
        [u.id, await hashPassword(u.senha)],
      )
    }
    await cliente.query(fs.readFileSync("db/seed.sql", "utf8"))
    await cliente.query("commit")
    return Object.keys(USUARIOS).length
  } catch (erro) {
    await cliente.query("rollback").catch(() => {})
    throw erro
  } finally {
    await cliente.end()
  }
}

if (process.argv[1]?.endsWith("semear.mjs")) {
  try {
    const n = await semear()
    console.log(`${n} usuários e seed aplicados.`)
  } catch (erro) {
    console.error(`\nERRO: ${erro.message}`)
    process.exit(1)
  }
}
