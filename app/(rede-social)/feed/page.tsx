import { FeedExemplo } from "@/components/prototipo/feed-exemplo"
import { SeloPrevia } from "@/components/prototipo/selo-previa"
import { BotaoCriarPost } from "@/components/social/criar-post"

/**
 * O Início da aba Rede social. As viagens publicadas chegam com a S06
 * (publicar viagem) e o feed com a S07, com as sugestões intercaladas (RF09.8
 * e RF09.11). Até lá, a tela mostra o visual final com dados de exemplo
 * (components/prototipo/feed-exemplo.tsx), marcado como prévia.
 *
 * O botão "Criar" do topo abre o fluxo de criar post (components/social/criar-post.tsx)
 * até o "Criar" do menu da rede social chegar em app/dashboard/layout.tsx.
 *
 * @RF09.10 buscar pessoas · @RF09.15 post com fotos
 */
export default function FeedPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Feed</h1>
        <div className="flex items-center gap-3">
          <SeloPrevia />
          <BotaoCriarPost />
        </div>
      </div>
      <FeedExemplo />
    </div>
  )
}
