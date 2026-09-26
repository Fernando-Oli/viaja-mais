/**
 * Trava de ambiente para os testes de RLS.
 *
 * Estes testes **escrevem** no banco: criam viagem, despesa, reserva e membro
 * para provar que um usuário não alcança o dado do outro. Rodar isso contra o
 * projeto hospedado encheria produção de lixo.
 *
 * A convenção do projeto é que `.env.local` aponte sempre para o stack local, e
 * é de lá que `preparar-ambiente.ts` lê as credenciais. A checagem abaixo é
 * defesa em profundidade, não desconfiança da convenção: um `supabase db pull`
 * mal parametrizado, uma variável exportada no shell ou um arquivo copiado de
 * outra máquina bastam para o alvo deixar de ser local, e o preço do engano é
 * escrita em produção.
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
        `Suba o stack local com \`npm run db:start\` e use as credenciais dele.`,
    )
  }

  return url
}

/**
 * Falha em vez de pular. Pular em silêncio é pior do que não ter o teste: a
 * saída diz "passou" e ninguém percebe que a RLS não foi verificada.
 */
export function variavelObrigatoria(nome: string): string {
  const valor = process.env[nome]

  if (!valor) {
    throw new Error(
      `${nome} não está definida — os testes de RLS precisam de um stack local de pé.\n\n` +
        `  npm run db:start\n` +
        `  npx supabase status -o env    # exporte API_URL, ANON_KEY e DB_URL\n`,
    )
  }

  return valor
}
