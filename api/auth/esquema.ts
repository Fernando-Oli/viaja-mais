/**
 * Como o Better Auth guarda os dados no banco: nomes de tabela, de coluna e o
 * formato do id. Só isso — sem segredo, sem URL, sem e-mail.
 *
 * Fica separado da configuração completa (etapa 1) porque dois lugares precisam
 * concordar sobre o schema: a API, em tempo de execução, e
 * `scripts/db/gerar-esquema-auth.mjs`, que gera `db/init/03-auth.sql`. Se cada um
 * declarasse os nomes, uma divergência só apareceria como "relation does not
 * exist" no primeiro login.
 *
 * Decisões:
 * - **Schema `auth`**, não `public`. As tabelas guardam hash de senha e token de
 *   sessão; a conexão da API (`app_api`) não tem privilégio nenhum ali.
 * - **`auth.users` com id `uuid`.** As migrations herdadas do Supabase têm
 *   `references auth.users (id)` em várias tabelas e o gatilho
 *   `on_auth_user_created`. Mantendo o nome e o tipo, nenhuma delas muda.
 * - **Colunas em snake_case**, como o resto do banco.
 *
 * @RNF02.2 senha guardada com hash resistente (scrypt, do Better Auth)
 */

const snake = <T extends string>(...campos: T[]) =>
  Object.fromEntries(campos.map((c) => [c, c.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`)])) as Record<T, string>

export const esquemaAuth = {
  advanced: {
    database: { generateId: "uuid" as const },
  },
  user: {
    modelName: "users",
    fields: snake("name", "email", "emailVerified", "image", "createdAt", "updatedAt"),
  },
  session: {
    modelName: "sessions",
    fields: snake("expiresAt", "token", "createdAt", "updatedAt", "ipAddress", "userAgent", "userId"),
  },
  account: {
    modelName: "accounts",
    fields: snake(
      "accountId",
      "providerId",
      "userId",
      "accessToken",
      "refreshToken",
      "idToken",
      "accessTokenExpiresAt",
      "refreshTokenExpiresAt",
      "scope",
      "password",
      "createdAt",
      "updatedAt",
    ),
  },
  verification: {
    modelName: "verifications",
    fields: snake("identifier", "value", "expiresAt", "createdAt", "updatedAt"),
  },
  // Limite de tentativas no banco, não em memória: com várias réplicas atrás do
  // load balancer, cada uma teria o próprio contador e o limite se multiplicaria.
  rateLimit: {
    storage: "database" as const,
    modelName: "rate_limits",
    fields: snake("key", "count", "lastRequest"),
  },
}
