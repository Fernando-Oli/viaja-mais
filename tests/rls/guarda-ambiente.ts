/**
 * Trava de ambiente para os testes de RLS.
 *
 * Estes testes **escrevem** no banco: criam viagem, despesa, reserva e membro
 * para provar que um usuário não alcança o dado do outro. Rodar isso contra o
 * projeto hospedado encheria produção de lixo.
 *
 * O padrão é o banco do `docker-compose.yml`. A checagem abaixo é defesa em
 * profundidade: uma `DATABASE_ADMIN_URL` esquecida no shell ou copiada de outra
 * máquina basta para o alvo deixar de ser local, e o preço do engano é escrita
 * em produção.
 */

const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1", "::1"])

function hostDe(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^\[|\]$/g, "")
  } catch {
    return null
  }
}

export function exigirLocal(url: string, origem: string): string {
  const host = hostDe(url)
  if (!host) throw new Error(`${origem} não é uma URL válida: ${url}`)

  if (!HOSTS_LOCAIS.has(host)) {
    throw new Error(
      `${origem} aponta para "${host}", que não é um ambiente local.\n` +
        `Os testes de RLS escrevem no banco e nunca devem rodar contra o projeto hospedado.\n` +
        `Suba o banco local com \`docker compose up -d --wait\` e \`npm run db:reset\`.`,
    )
  }

  return url
}
