#!/usr/bin/env node
/**
 * Sobe o ambiente local completo e escreve o .env.local.
 *
 * O objetivo é que o time clone o repositório e rode um comando só. Nenhuma
 * credencial precisa ser compartilhada por mensagem: o banco, o e-mail e o
 * armazenamento locais vêm do `docker-compose.yml`, com senhas que só valem
 * nesta máquina, e a API já tem esses endereços como padrão fora de produção
 * (`api/env.ts`).
 *
 *   npm run setup            # sobe, recria o banco, escreve .env.local
 *   npm run setup -- --force # sobrescreve um .env.local existente
 */
import { execSync } from "node:child_process"
import fs from "node:fs"

const forcar = process.argv.includes("--force")
const passo = (n, t) => console.log(`\n[${n}/3] ${t}`)
const ok = (t) => console.log(`      ${t}`)

function morrer(titulo, ...detalhes) {
  console.error(`\nERRO: ${titulo}`)
  for (const d of detalhes) console.error(`  ${d}`)
  process.exit(1)
}

/* 1 ------------------------------------------------------------------------ */
passo(1, "Verificando o Docker")
try {
  execSync("docker info", { stdio: "ignore" })
  ok("Docker respondendo.")
} catch {
  morrer(
    "Docker não está disponível.",
    "",
    "O banco (Postgres), o e-mail (Mailpit) e o armazenamento (SeaweedFS) rodam em contêineres.",
    "",
    "  1. Instale o Docker Desktop: https://www.docker.com/products/docker-desktop",
    "  2. Abra o Docker Desktop e espere ficar 'Engine running'",
    "  3. Rode `npm run setup` de novo",
  )
}

/* 2 ------------------------------------------------------------------------ */
passo(2, "Subindo os serviços e recriando o banco (migrations + seed)")
try {
  execSync("npm run db:reset", { stdio: "inherit" })
} catch {
  morrer("`npm run db:reset` falhou.", "Veja o erro acima: costuma ser SQL inválido numa migration.")
}

/* 3 ------------------------------------------------------------------------ */
passo(3, "Escrevendo .env.local")
if (fs.existsSync(".env.local") && !forcar) {
  ok(".env.local já existe — mantido. Use `npm run setup -- --force` para sobrescrever.")
} else {
  // A chave do Maps é a única que o ambiente local não tem: ela vem do Google
  // Cloud e é a mesma para o time (protegida por restrição de referrer e cota,
  // não por sigilo). Preservamos o valor se já existir.
  const anterior = fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8") : ""
  const mapsAnterior = anterior.match(/^NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=(.*)$/m)?.[1] ?? ""

  fs.writeFileSync(
    ".env.local",
    `# Gerado por \`npm run setup\` em ${new Date().toISOString()}
# Ambiente LOCAL. Banco, e-mail e armazenamento vêm do docker-compose.yml, e a
# API já usa os endereços deles como padrão fora de produção (api/env.ts).
# Não commite este arquivo (já está no .gitignore).

NEXT_PUBLIC_APP_URL=http://localhost:3000

# Vem do Google Cloud, não do ambiente local. Peça ao Fernando.
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=${mapsAnterior}

# Gerador determinístico: sem rede e sem custo.
AI_PROVIDER=fake

# Usuários criados por db/seed.sql
E2E_USER_A_EMAIL=teste.a@viajamais.local
E2E_USER_A_PASSWORD=Viaja+mais123
E2E_USER_B_EMAIL=teste.b@viajamais.local
E2E_USER_B_PASSWORD=Viaja+mais123
`,
  )
  ok(".env.local escrito.")
  if (!mapsAnterior) ok("Falta NEXT_PUBLIC_GOOGLE_MAPS_API_KEY — a busca de lugares não vai funcionar sem ela.")
}

console.log(`
Pronto.

  npm run api:dev        API em http://localhost:3001
  npm run dev            aplicação em http://localhost:3000
  E-mails de teste       http://localhost:58025   (Mailpit: convite, recuperação de senha)

  Login de teste: teste.a@viajamais.local / Viaja+mais123

  npm run db:reset       recria o banco do zero (migrations + seed)
  npm run db:down        derruba os serviços
`)
