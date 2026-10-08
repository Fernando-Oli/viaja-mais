/**
 * Regras da foto de perfil, sem I/O — a rota de foto usa, e os testes provam.
 *
 * `profiles.avatar_url` guarda o caminho do arquivo dentro do bucket
 * (`<id do usuário>/<uuid>.webp`), não uma URL: sem host no valor, não há como
 * apontar o avatar para um servidor de terceiro que veria o IP de quem visita o
 * perfil (migration social_avatares). O formato é o mesmo que o trigger do
 * banco exige; o que não casar com ele não vira URL — nem URL antiga, nem
 * `javascript:`, nem `../`.
 *
 * @RF02.2 foto de perfil
 */

export const BUCKET_AVATARES = "avatars"

/** Espelha o `file_size_limit` do bucket. A tela manda 512×512 recortado (~100 KB). */
export const LIMITE_FOTO_BYTES = 2 * 1024 * 1024

export const TIPOS_FOTO = ["image/jpeg", "image/png", "image/webp"] as const
export type TipoFoto = (typeof TIPOS_FOTO)[number]

const EXTENSAO: Record<TipoFoto, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

const ASSINATURA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"

/** `<uuid do usuário>/<uuid>.(webp|jpg|png)` — o mesmo formato que o trigger do banco exige. */
export const FORMATO_CAMINHO = new RegExp(`^(${UUID})/${UUID}\\.(webp|jpg|png)$`)

function ascii(bytes: Uint8Array, inicio: number, fim: number) {
  return String.fromCharCode(...bytes.subarray(inicio, fim))
}

/**
 * Tipo da imagem pela assinatura (magic bytes) no começo do arquivo. O nome do
 * arquivo e o `content-type` vêm do cliente e mentem de graça: um PDF renomeado
 * para `.png` e enviado como `image/png` passaria pelo bucket, que só olha o
 * tipo declarado.
 *
 * Confere só a assinatura, não decodifica a imagem: um arquivo que comece com o
 * cabeçalho certo e traga qualquer coisa depois passa por aqui.
 */
export function tipoDaImagem(bytes: Uint8Array): TipoFoto | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
  if (bytes.length >= 8 && ASSINATURA_PNG.every((b, i) => bytes[i] === b)) return "image/png"
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp"
  return null
}

/** Caminho do arquivo novo: sempre na pasta de quem envia, com nome que não se repete. */
export function caminhoDaNovaFoto(userId: string, nome: string, tipo: TipoFoto): string {
  return `${userId}/${nome}.${EXTENSAO[tipo]}`
}

/**
 * Monta a URL pública a partir do que está em `avatar_url`. Só o caminho no
 * formato exato vira URL; qualquer outra coisa devolve nulo e a tela mostra as
 * iniciais.
 */
export function urlPublicaDoAvatar(valor: string | null, urlDoProjeto: string): string | null {
  if (!valor || !FORMATO_CAMINHO.test(valor)) return null
  return `${urlDoProjeto.replace(/\/+$/, "")}/storage/v1/object/public/${BUCKET_AVATARES}/${valor}`
}

/**
 * O que pode ser apagado ao trocar ou remover a foto: só um arquivo no formato
 * da rota, na pasta da própria pessoa. A rota apaga com a chave de serviço, que
 * ignora a RLS — por isso a checagem de pasta é dela, aqui.
 */
export function caminhoApagavel(valor: string | null, userId: string): string | null {
  if (!valor) return null
  const casou = FORMATO_CAMINHO.exec(valor)
  return casou && casou[1] === userId ? valor : null
}
