import { z } from "zod"

/**
 * Variáveis de ambiente da API, validadas no boot.
 *
 * Mesmo princípio de `lib/env.ts` (@RNF04.6): falhar na partida, nomeando a
 * variável, em vez de deixar `undefined` chegar a uma conexão ou a um link de
 * e-mail. Fica separado porque a API não precisa — e não deve receber — as
 * variáveis do navegador (`NEXT_PUBLIC_*`).
 *
 * Regra: nunca `process.env.X` fora deste arquivo dentro de `api/`.
 *
 * Os padrões são os do `docker-compose.yml` local, e só valem fora de produção.
 * Em produção, toda credencial precisa vir do ambiente.
 */

const emProducao = process.env.NODE_ENV === "production"

/** Valor padrão só em desenvolvimento e teste. Em produção, obrigatório. */
const local = (padrao: string) => (emProducao ? z.string().min(1) : z.string().min(1).default(padrao))

/** Opcional, com vazio valendo como ausente (`CHAVE=` copiada de um exemplo). */
const opcionalApi = z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).optional())

const esquema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),

  // Conexão da aplicação: sem privilégio próprio, assume o papel do usuário em
  // cada transação (api/db/como-usuario.ts).
  DB_APP_API_URL: local("postgresql://app_api:app_api_local@localhost:55432/avori"),
  // Conexão do Better Auth: só o schema auth.
  DB_APP_AUTH_URL: local("postgresql://app_auth:app_auth_local@localhost:55432/avori"),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),

  // Assina os cookies de sessão. 32+ caracteres; trocar invalida todas as sessões.
  BETTER_AUTH_SECRET: local("desenvolvimento-local-nao-use-em-producao-0123456789").pipe(
    z.string().min(32, "precisa ter pelo menos 32 caracteres"),
  ),
  // Endereço público da aplicação: base dos links de e-mail e origem confiável
  // para o Better Auth recusar requisição de outro site.
  APP_URL: local("http://localhost:3000").pipe(
    z
      .string()
      .url("precisa ser uma URL completa")
      .refine((v) => !v.endsWith("/"), "não pode terminar com barra"),
  ),

  SMTP_URL: local("smtp://localhost:51025"),
  EMAIL_REMETENTE: local("Avori <nao-responda@avori.local>"),

  // Armazenamento de arquivos (fotos de perfil), por S3. Em produção, o S3 da
  // AWS: sem `S3_ENDPOINT`, o SDK vai à AWS, e sem chaves usa as credenciais do
  // ambiente (papel IAM da máquina). Em desenvolvimento, o SeaweedFS do compose.
  S3_ENDPOINT: emProducao ? opcionalApi : z.string().url().default("http://localhost:58333"),
  // O endereço que vai nos links assinados que o navegador abre. Só difere do
  // anterior quando a API fala com o armazenamento por um nome interno (rede do compose).
  S3_ENDPOINT_PUBLICO: opcionalApi,
  S3_REGIAO: z.string().min(1).default("us-east-1"),
  S3_CHAVE_ACESSO: emProducao ? opcionalApi : z.string().min(1).default("avori_local"),
  S3_CHAVE_SECRETA: emProducao ? opcionalApi : z.string().min(1).default("avori_local_segredo"),
  S3_BUCKET_AVATARES: local("avatars"),

  // Nome da réplica no cabeçalho X-Replica. No compose, o hostname do container.
  REPLICA: z.string().min(1).default(process.env.HOSTNAME ?? "local"),
})

const analise = esquema.safeParse(process.env)
if (!analise.success) {
  const faltando = analise.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n")
  throw new Error(`Variáveis de ambiente da API inválidas:\n${faltando}`)
}

export const envApi = analise.data
