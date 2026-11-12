import { responderListaDaRede } from "../lista-da-rede"

/**
 * GET: quem segue `username`, 20 por vez (ver ../lista-da-rede.ts).
 *
 * @RF09.6 listas de seguidores e de seguindo
 */
export async function GET(request: Request, contexto: { params: Promise<{ username: string }> }) {
  return responderListaDaRede(request, contexto, "seguidores")
}
