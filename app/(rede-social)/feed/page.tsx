import { FeedExemplo } from "@/components/prototipo/feed-exemplo"
import { SeloPrevia } from "@/components/prototipo/selo-previa"

/**
 * O Início da aba Rede social. As viagens publicadas chegam com a S06
 * (publicar viagem) e o feed com a S07, com as sugestões intercaladas (RF09.8
 * e RF09.11). Até lá, a tela mostra o visual final com dados de exemplo
 * (components/prototipo/feed-exemplo.tsx), marcado como prévia.
 *
 * @RF09.10 buscar pessoas
 */
export default function FeedPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Feed</h1>
        <SeloPrevia />
      </div>
      <FeedExemplo />
    </div>
  )
}
