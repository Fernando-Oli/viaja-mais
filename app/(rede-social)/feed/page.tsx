import { Card, CardContent } from "@/components/ui/card";
import { Newspaper } from "lucide-react";

/**
 * O centro da aba Rede social. Por enquanto, o estado vazio: as viagens
 * publicadas chegam com a S06 (publicar viagem) e o feed com a S07, com as
 * sugestões intercaladas (RF09.8 e RF09.11).
 *
 * @RF09.10 buscar pessoas
 */
export default function FeedPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-viaja-navy">Rede social</h1>
        <p className="mt-2 text-gray-600">Viagens de quem você segue e sugestões para você</p>
      </div>
      <Card role="region" aria-label="Feed">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <Newspaper className="h-10 w-10 text-gray-400" aria-hidden />
          <p className="text-lg font-semibold text-viaja-navy">Seu feed ainda está vazio</p>
          <p className="max-w-md text-sm text-gray-600">
            Quando as pessoas que você segue publicarem viagens, elas aparecem aqui. Use a busca de pessoas para
            encontrar quem seguir.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
