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
 *     origem (a API está atrás dela, pelo rewrite do Next) e para o Google
 *     Maps, então um dado
 *     roubado não sai para o domínio de quem atacou;
 *   - nada de plugin (`object-src 'none'`), troca da base dos links relativos
 *     (`base-uri 'self'`), formulário enviado para fora (`form-action 'self'`)
 *     nem a aplicação embutida em iframe de terceiros (`frame-ancestors 'none'`).
 *
 * Imagens aceitam qualquer `https:`: as capas de viagem e as fotos de lugares
 * vêm de URLs externas informadas pelo usuário e pelo Google. Uma imagem não
 * executa código; o pior que ela faz é avisar ao servidor de origem que foi
 * vista. As fotos de perfil vêm por link assinado do armazenamento S3: em
 * produção, `https:` já as cobre; localmente o armazenamento é `http://`, e só
 * a origem dele entra.
 *
 * @RNF02.12 política de segurança de conteúdo que restringe as origens de script
 */

export type OpcoesCsp = {
  /** `NEXT_PUBLIC_APP_URL` do ambiente: decide se `http://` embutido sobe para `https://`. */
  appUrl: string
  /** Endereço público do armazenamento S3 das fotos de perfil, se houver um próprio. */
  armazenamentoUrl?: string
  /** `next dev`: libera `'unsafe-eval'`, que o React usa para montar a pilha de erro. */
  desenvolvimento: boolean
}

/** Origens que a API JavaScript do Google Maps e o Places usam. */
const GOOGLE_MAPS = ["https://maps.googleapis.com", "https://places.googleapis.com"]
const GOOGLE_ESTATICOS = ["https://maps.gstatic.com", "https://*.googleapis.com", "https://*.ggpht.com"]

export function montarCsp({ appUrl, armazenamentoUrl, desenvolvimento }: OpcoesCsp): string {
  const app = new URL(appUrl)
  const armazenamento = armazenamentoUrl ? new URL(armazenamentoUrl) : null

  const diretivas: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(desenvolvimento ? ["'unsafe-eval'"] : []), ...GOOGLE_MAPS],
    // O Maps e o Tailwind em tempo de execução injetam <style> inline.
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "img-src": [
      "'self'",
      "data:",
      "blob:",
      "https:",
      ...(armazenamento?.protocol === "http:" ? [armazenamento.origin] : []),
    ],
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    "connect-src": [
      "'self'",
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
  // Qualquer `http://` embutido sobe para `https://`. Só quando a própria
  // aplicação é https: o E2E roda o build de produção em http://localhost, com
  // as fotos no armazenamento local em http, e a promoção quebraria as duas.
  if (!desenvolvimento && app.protocol === "https:") politica.push("upgrade-insecure-requests")
  return politica.join("; ")
}
