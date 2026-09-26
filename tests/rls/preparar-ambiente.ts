import fs from "node:fs"

/**
 * Preenche as credenciais do stack local antes da suíte de RLS, lendo
 * `.env.local` — que neste projeto aponta sempre para o Supabase em Docker.
 *
 * Existe por causa de um modo de falha concreto: os testes estruturais de
 * `00-estrutura.test.ts` — "toda tabela tem RLS", "toda tabela com RLS tem
 * policy" — dependem de `DATABASE_URL` e eram **pulados em silêncio** na
 * máquina de quem não tivesse exportado a variável à mão. A saída dizia
 * "passou" sem que a verificação tivesse acontecido, que é exatamente o que
 * `guarda-ambiente.ts` diz que não pode acontecer.
 *
 * No CI nada muda: `db.yml` coloca as variáveis no ambiente antes de chamar a
 * suíte, não existe `.env.local` lá, e o que já está definido não é
 * sobrescrito aqui.
 *
 * Ler o arquivo não dispensa a trava de alvo: `exigirLocal` continua valendo
 * sobre o que for lido, tanto para a API quanto para a conexão direta. Estes
 * testes escrevem no banco, e defesa em profundidade custa uma linha.
 */

/** Nome no `.env.local` → nome que a suíte usa. */
const EQUIVALENCIAS: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: "API_URL",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "ANON_KEY",
  DATABASE_URL: "DATABASE_URL",
}

if (fs.existsSync(".env.local")) {
  for (const linha of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const par = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*?)"?\s*$/)
    if (!par) continue

    const destino = EQUIVALENCIAS[par[1]]
    const valor = par[2].trim()

    // Quem veio do ambiente manda: é assim que o CI e um override pontual
    // continuam funcionando.
    if (destino && valor && !process.env[destino]) process.env[destino] = valor
  }
}
