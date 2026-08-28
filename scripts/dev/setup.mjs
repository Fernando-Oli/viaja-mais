#!/usr/bin/env node
/**
 * Sobe o ambiente local completo e escreve o .env.local.
 *
 * O objetivo é que o time clone o repositório e rode um comando só. Nenhuma
 * credencial precisa ser compartilhada por mensagem: o stack local gera as
 * próprias chaves, e elas valem apenas nesta máquina.
 *
 *   npm run setup            # sobe, aplica migrations, escreve .env.local
 *   npm run setup -- --force # sobrescreve um .env.local existente
 */
import { execFileSync, execSync } from "node:child_process"
import fs from "node:fs"

const forcar = process.argv.includes("--force")
const passo = (n, t) => console.log(`\n[${n}/5] ${t}`)
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
    "O stack local do Supabase (Postgres, Auth, Storage) roda em contêineres.",
    "",
    "  1. Instale o Docker Desktop: https://www.docker.com/products/docker-desktop",
    "  2. Abra o Docker Desktop e espere ficar 'Engine running'",
    "  3. Rode `npm run setup` de novo",
    "",
    "Sem Docker dá para desenvolver tela e regra de negócio, mas não dá para",
    "rodar migrations, testes de RLS nem E2E.",
  )
}

/* 2 ------------------------------------------------------------------------ */
passo(2, "Subindo o Supabase local")
ok("Na primeira vez isso baixa alguns GB de imagem e demora. Depois é rápido.")
try {
  execFileSync("npx", ["supabase", "start"], { stdio: "inherit", shell: true })
} catch {
  morrer(
    "`supabase start` falhou.",
    "Causas comuns: Docker sem memória, ou porta 54321-54324 ocupada.",
    "Rode `npx supabase stop --no-backup` e tente de novo.",
  )
}

/* 3 ------------------------------------------------------------------------ */
passo(3, "Lendo as credenciais locais")
let status
try {
  status = execFileSync("npx", ["supabase", "status", "-o", "env"], { encoding: "utf8", shell: true })
} catch {
  morrer("Não consegui ler `supabase status`.", "O stack subiu? Tente `npx supabase status`.")
}

const valor = (chave) => status.match(new RegExp(`^${chave}="?([^"\n]+)"?$`, "m"))?.[1]
const apiUrl = valor("API_URL")
const anonKey = valor("ANON_KEY")
const serviceKey = valor("SERVICE_ROLE_KEY")
const dbUrl = valor("DB_URL")

if (!apiUrl || !anonKey) morrer("`supabase status` não devolveu API_URL/ANON_KEY.")
ok(`API em ${apiUrl}`)

/* 4 ------------------------------------------------------------------------ */
passo(4, "Escrevendo .env.local")
if (fs.existsSync(".env.local") && !forcar) {
  ok(".env.local já existe — mantido. Use `npm run setup -- --force` para sobrescrever.")
} else {
  // A chave do Maps é a única que o stack local não gera: ela vem do Google
  // Cloud e é a mesma para o time (protegida por restrição de referrer e cota,
  // não por sigilo). Preservamos o valor se já existir.
  const anterior = fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8") : ""
  const mapsAnterior = anterior.match(/^NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=(.*)$/m)?.[1] ?? ""

  fs.writeFileSync(
    ".env.local",
    `# Gerado por \`npm run setup\` em ${new Date().toISOString()}
# Credenciais do stack LOCAL. Valem só nesta máquina, são recriadas a cada
# \`supabase start\` e não servem para nenhum ambiente compartilhado.
# Não commite este arquivo (já está no .gitignore).

NEXT_PUBLIC_SUPABASE_URL=${apiUrl}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${anonKey}
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Ignora toda a RLS. Local, descartável — mas não crie o hábito de copiar
# uma chave dessas de um ambiente compartilhado para cá.
SUPABASE_SERVICE_ROLE_KEY=${serviceKey ?? ""}

# Conexão direta: usada pelas migrations e pelos testes de RLS.
DATABASE_URL=${dbUrl ?? ""}

# Vem do Google Cloud, não do stack local. Peça ao Fernando.
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=${mapsAnterior}

# Gerador determinístico: sem rede e sem custo.
AI_PROVIDER=fake

# Usuários criados por supabase/seed.sql
E2E_USER_A_EMAIL=teste.a@viajamais.local
E2E_USER_A_PASSWORD=viajamais123
E2E_USER_B_EMAIL=teste.b@viajamais.local
E2E_USER_B_PASSWORD=viajamais123
`,
  )
  ok(".env.local escrito com as credenciais locais.")
  if (!mapsAnterior) ok("Falta NEXT_PUBLIC_GOOGLE_MAPS_API_KEY — a busca de lugares não vai funcionar sem ela.")
}

/* 5 ------------------------------------------------------------------------ */
passo(5, "Aplicando migrations e seed")
const migrations = fs.existsSync("supabase/migrations")
  ? fs.readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql"))
  : []

try {
  execFileSync("npx", ["supabase", "db", "reset"], { stdio: "inherit", shell: true })
  ok(`${migrations.length} migration(s) aplicada(s) + seed.`)
} catch {
  morrer("`supabase db reset` falhou.", "Veja o erro acima: costuma ser SQL inválido numa migration.")
}

if (migrations.length === 0) {
  console.log(`
      AVISO: supabase/migrations/ está vazio.

      O banco local subiu, mas sem nenhuma tabela da aplicação — o schema
      ainda não foi extraído do projeto do Supabase. Enquanto isso, o app
      sobe mas nenhuma tela com dado funciona.

      Quem destrava: Fernando, com \`npx supabase db pull\`. Ver supabase/README.md.`)
}

console.log(`
Pronto.

  npm run dev            aplicação em http://localhost:3000
  npx supabase status    URLs e chaves do stack local
  Studio                 http://localhost:54323
  E-mails de teste       http://localhost:54324   (Inbucket: confirmação, reset de senha)

  Login de teste: teste.a@viajamais.local / viajamais123

  npm run db:reset       recria o banco do zero (migrations + seed)
  npm run db:stop        derruba o stack
`)
