/**
 * Content-Security-Policy da aplicação, aplicada em toda resposta pelo
 * `proxy.ts`.
 *
 * Variante "Without Nonces" do guia do Next 16
 * (`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`).
 * A CSP com nonce obriga todas as páginas a renderizar dinamicamente, e uma
 * página estática quebra em produção sem erro de build. Por isso `script-src`
 * mantém `'unsafe-inline'`, que é o risco residual registrado na seção 25. O que
 * esta política ainda garante, mesmo com XSS:
 *
 *   - script só carrega da própria origem e do Google Maps;
 *   - `connect-src` fecha a saída: fetch, XHR e WebSocket só vão para a própria
 *     origem, para o Supabase do ambiente e para o Google Maps, então um dado
 *     roubado não sai para o domínio de quem atacou;
 *   - nada de plugin (`object-src 'none'`), troca da base dos links relativos
 *     (`base-uri 'self'`), formulário enviado para fora (`form-action 'self'`)
 *     nem a aplicação embutida em iframe de terceiros (`frame-ancestors 'none'`).
 *
 * Imagens aceitam qualquer `https:`: as capas de viagem e as fotos de lugares
 * vêm de URLs externas informadas pelo usuário e pelo Google. Uma imagem não
 * executa código; o pior que ela faz é avisar ao servidor de origem que foi
 * vista.
 *
 * @RNF02.12 política de segurança de conteúdo que restringe as origens de script
 */

export type OpcoesCsp = {
  /** `NEXT_PUBLIC_SUPABASE_URL` do ambiente — local, preview ou produção. */
  supabaseUrl: string
  /** `next dev`: libera `'unsafe-eval'`, que o React usa para montar a pilha de erro. */
  desenvolvimento: boolean
}

/** Origens que a API JavaScript do Google Maps e o Places usam. */
const GOOGLE_MAPS = ["https://maps.googleapis.com", "https://places.googleapis.com"]
const GOOGLE_ESTATICOS = ["https://maps.gstatic.com", "https://*.googleapis.com", "https://*.ggpht.com"]

export function montarCsp({ supabaseUrl, desenvolvimento }: OpcoesCsp): string {
  const supabase = new URL(supabaseUrl)
  const supabaseHttp = supabase.origin
  // Realtime do Supabase: mesma origem, por WebSocket.
  const supabaseWs = `${supabase.protocol === "https:" ? "wss:" : "ws:"}//${supabase.host}`

  const diretivas: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(desenvolvimento ? ["'unsafe-eval'"] : []), ...GOOGLE_MAPS],
    // O Maps e o Tailwind em tempo de execução injetam <style> inline.
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "img-src": ["'self'", "data:", "blob:", "https:", ...(supabase.protocol === "http:" ? [supabaseHttp] : [])],
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    "connect-src": [
      "'self'",
      supabaseHttp,
      supabaseWs,
      ...GOOGLE_MAPS,
      ...GOOGLE_ESTATICOS,
      // HMR do `next dev`.
      ...(desenvolvimento ? ["ws:"] : []),
    ],
    "worker-src": ["'self'", "blob:"],
    "frame-src": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  }

  const politica = Object.entries(diretivas).map(([nome, valores]) => `${nome} ${valores.join(" ")}`)
  // Qualquer `http://` embutido sobe para `https://`. Só quando o Supabase é
  // https: o E2E do CI roda o build de produção contra o Supabase local em
  // http://127.0.0.1, e a promoção quebraria toda chamada a ele.
  if (!desenvolvimento && supabase.protocol === "https:") politica.push("upgrade-insecure-requests")
  return politica.join("; ")
}
