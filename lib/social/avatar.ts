import { env } from "@/lib/env"
import { urlPublicaDoAvatar } from "./foto"

/**
 * URL pública do avatar a partir do valor de `profiles.avatar_url`.
 *
 * É o helper que quem mostra foto de perfil deve usar — esta página, a página
 * pública, o feed e telas de outros domínios: o banco guarda o caminho no
 * bucket, nunca uma URL, e entregar o caminho cru ao navegador quebra a imagem.
 *
 * @RF02.2 foto de perfil
 */
export function avatarPublico(valor: string | null): string | null {
  return urlPublicaDoAvatar(valor, env.NEXT_PUBLIC_SUPABASE_URL)
}
