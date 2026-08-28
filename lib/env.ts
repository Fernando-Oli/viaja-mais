import { z } from "zod"

/**
 * Ponto único de leitura de variáveis de ambiente.
 *
 * Motivo: antes disso o código lia `process.env.NEXT_PUBLIC_APP_URL` sem que a
 * variável existisse em lugar nenhum, e o link do convite era montado como
 * "undefined/dashboard" — em silêncio, em produção. Aqui a validação acontece no
 * boot e falha com mensagem que diz qual variável falta.
 *
 * Regra: nunca `process.env.X` fora deste arquivo. O ESLint avisa.
 */

function explodir(contexto: string, erro: z.ZodError): never {
  const faltando = erro.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n")
  throw new Error(
    `Variáveis de ambiente inválidas (${contexto}):\n${faltando}\n\n` +
      `Copie .env.example para .env.local e preencha os valores.`,
  )
}

/* -------------------------------------------------------------------------- */
/* Público — vai para o bundle do navegador                                    */
/* -------------------------------------------------------------------------- */

const esquemaPublico = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("precisa ser uma URL completa"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "obrigatória"),
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url("precisa ser uma URL completa")
    .refine((v) => !v.endsWith("/"), "não pode terminar com barra"),
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: z.string().min(1, "obrigatória"),
})

// As referências precisam ser literais: o Next substitui `process.env.NEXT_PUBLIC_X`
// no build por texto. Acesso dinâmico (process.env[nome]) resulta em undefined.
const brutoPublico = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
}

const analisePublica = esquemaPublico.safeParse(brutoPublico)
if (!analisePublica.success) explodir("público", analisePublica.error)

export const env = analisePublica.data

/* -------------------------------------------------------------------------- */
/* Servidor — nunca chega ao navegador                                         */
/* -------------------------------------------------------------------------- */

const esquemaServidor = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1).optional(),
  AI_PROVIDER: z.enum(["fake", "gemini", "anthropic"]).default("fake"),
  GEMINI_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
})

type EnvServidor = z.infer<typeof esquemaServidor>
let cacheServidor: EnvServidor | null = null

/**
 * Só pode ser chamada em route handler, server component ou script.
 * Chamar no navegador é erro de programação, não de configuração — por isso
 * lança em vez de devolver vazio.
 */
export function envServidor(): EnvServidor {
  if (typeof window !== "undefined") {
    throw new Error("envServidor() foi chamada no navegador. Use `env` para valores públicos.")
  }
  if (cacheServidor) return cacheServidor

  const analise = esquemaServidor.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
    AI_PROVIDER: process.env.AI_PROVIDER,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  })
  if (!analise.success) explodir("servidor", analise.error)

  cacheServidor = analise.data
  return cacheServidor
}

/**
 * A chave service role ignora toda a RLS. Use apenas em `lib/supabase/admin.ts`,
 * apenas em código de servidor, e nunca para operação que a RLS já resolveria.
 */
export function chaveServiceRole(): string {
  const chave = envServidor().SUPABASE_SERVICE_ROLE_KEY
  if (!chave) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY não configurada. É necessária para convites por e-mail. " +
        "Pegue em Supabase > Project Settings > API.",
    )
  }
  return chave
}
