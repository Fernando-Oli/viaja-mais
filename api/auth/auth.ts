import { betterAuth } from "better-auth"
import { APIError, createAuthMiddleware } from "better-auth/api"
import { problemaDeSenha } from "../../lib/seguranca/senha"
import { envApi } from "../env"
import { poolAuth } from "../db/conexao"
import { enviarEmail, escaparHtml } from "../email/enviar"
import { esquemaAuth } from "./esquema"

/**
 * Autenticação do Avori, no lugar do GoTrue do Supabase.
 *
 * Por que uma biblioteca e não código nosso: hash de senha, token de sessão,
 * expiração, recuperação de senha e limite de tentativas são exatamente onde
 * implementação caseira abre brecha. O Better Auth resolve isso e roda dentro
 * da nossa API, com as tabelas no nosso banco (schema `auth`).
 *
 * Sessão com estado no banco (`auth.sessions`), não JWT autocontido: qualquer
 * réplica valida qualquer cookie consultando o banco, e encerrar a sessão vale
 * na hora — um JWT continuaria válido até expirar.
 *
 * @RF01.1 cadastro com e-mail e senha · @RF01.3 autenticação com e-mail e senha
 * @RF01.4 encerrar a sessão · @RNF02.2 hash de senha resistente (scrypt)
 * @RNF02.3 sessão por token assinado, validada no servidor a cada requisição
 * @RF01.7 redefinir por e-mail a senha esquecida
 */

/** Rotas do Better Auth que recebem uma senha nova. */
const ROTAS_COM_SENHA_NOVA: Record<string, "password" | "newPassword"> = {
  "/sign-up/email": "password",
  "/change-password": "newPassword",
  "/reset-password": "newPassword",
}

export const auth = betterAuth({
  ...esquemaAuth,
  database: poolAuth,
  secret: envApi.BETTER_AUTH_SECRET,
  baseURL: envApi.APP_URL,
  basePath: "/api/auth",
  // Requisição de outro site com o cookie do usuário é recusada (CSRF).
  trustedOrigins: [envApi.APP_URL],

  emailAndPassword: {
    enabled: true,
    // O teto de verdade é a política abaixo; estes limites são a última barreira.
    minPasswordLength: 8,
    maxPasswordLength: 128,
    // Mesmo comportamento de `enable_confirmations = false` do Supabase local:
    // a conta nasce com sessão. A confirmação por e-mail entra com o SMTP.
    autoSignIn: true,
    requireEmailVerification: false,
    // Trocar a senha por recuperação derruba as sessões abertas: quem roubou a
    // sessão perde o acesso junto com a senha antiga.
    revokeSessionsOnPasswordReset: true,
    // Link de uso único, válido por 1 hora. Ele aponta para a API
    // (/api/auth/reset-password/:token), que confere o token e devolve para a
    // tela com `?token=`. O Better Auth responde igual para e-mail sem conta e
    // só chama esta função quando a conta existe; por isso o envio não é
    // esperado: o tempo da resposta denunciaria quais e-mails têm conta.
    resetPasswordTokenExpiresIn: 60 * 60,
    sendResetPassword: async ({ user, url }) => {
      void enviarEmail({
        para: user.email,
        assunto: "Redefinir sua senha na Avori",
        texto: `Recebemos um pedido para redefinir a senha da sua conta na Avori.

Para escolher uma senha nova, abra este link em até 1 hora: ${url}

Se não foi você, ignore este e-mail: sua senha continua a mesma.`,
        html: `<p>Recebemos um pedido para redefinir a senha da sua conta na Avori.</p>
<p><a href="${escaparHtml(url)}">Escolher uma senha nova</a> (o link vale por 1 hora).</p>
<p>Se não foi você, ignore este e-mail: sua senha continua a mesma.</p>`,
      }).catch((erro) => console.warn("[senha] e-mail de recuperação falhou:", erro instanceof Error ? erro.message : erro))
    },
  },

  session: {
    // Espalhar o esquema primeiro: sem isto, esta chave substitui a de
    // esquemaAuth e o Better Auth procura a tabela "session", que não existe.
    ...esquemaAuth.session,
    expiresIn: 60 * 60 * 24 * 7, // 7 dias
    updateAge: 60 * 60 * 24, // renova uma vez por dia de uso
  },

  advanced: {
    ...esquemaAuth.advanced,
    cookiePrefix: "avori",
    // Atrás do Next (rewrite) e do load balancer, o IP do cliente chega no
    // X-Forwarded-For. É a chave do limite de tentativas.
    ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
    // Explícito de propósito: sem isto, o Better Auth desliga sozinho a
    // checagem de origem (CSRF e endereços de volta, como o do link de
    // recuperação) quando NODE_ENV=test, e os testes não provariam o que vale
    // em produção.
    disableOriginCheck: false,
  },

  rateLimit: {
    ...esquemaAuth.rateLimit,
    enabled: true,
    window: 60,
    max: 100,
    // Tentativas de login e cadastro: o alvo de força bruta.
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 60, max: 3 },
    },
  },

  hooks: {
    // A política de senha do projeto (lib/seguranca/senha.ts) vale em todo
    // lugar onde uma senha nova entra — a mesma regra que a tela mostra.
    before: createAuthMiddleware(async (ctx) => {
      const campo = ROTAS_COM_SENHA_NOVA[ctx.path]
      if (!campo) return
      const senha = (ctx.body as Record<string, unknown> | undefined)?.[campo]
      const problema = typeof senha === "string" ? problemaDeSenha(senha) : "Informe a senha"
      if (problema) throw new APIError("BAD_REQUEST", { message: problema, code: "SENHA_FRACA" })
    }),
  },

  telemetry: { enabled: false },
})

export type Sessao = typeof auth.$Infer.Session
