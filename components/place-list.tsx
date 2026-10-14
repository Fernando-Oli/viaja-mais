"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import ConfirmModal from "@/components/ui/confirm-modal"
import { useToast } from "@/hooks/use-toast"
import { CheckCircle2, Circle, Loader2, MapPin, Star, Trash2 } from "lucide-react"

export interface Place {
  id: string
  name: string
  address: string | null
  category: string | null
  rating: number | null
  notes: string | null
  visited: boolean | null
}

interface PlaceListProps {
  places: Place[]
  tripId: string
  /** Avisa a tela quando a lista muda, para contadores fora do componente. */
  onChange?: (places: Place[]) => void
}

async function lerErro(resposta: Response, padrao: string) {
  const dados: { error?: string } = await resposta.json().catch(() => ({}))
  return dados.error || padrao
}

/**
 * Lugares de uma viagem, com marcar visitado e excluir. Toda escrita passa pela
 * rota `/api/trips/[tripId]/places/[placeId]`, que confere a participação na viagem.
 *
 * @RF08.4 marcar visitado · @RF08.6 excluir lugar
 */
export function PlaceList({ places, tripId, onChange }: PlaceListProps) {
  const { toast } = useToast()
  const [itens, setItens] = useState(places)
  const [pendente, setPendente] = useState<string | null>(null)
  const [paraExcluir, setParaExcluir] = useState<Place | null>(null)

  // A tela de lugares acrescenta itens depois de salvar; a lista acompanha.
  // Ajuste durante a renderização, em vez de efeito: evita um render a mais.
  const [recebidos, setRecebidos] = useState(places)
  if (places !== recebidos) {
    setRecebidos(places)
    setItens(places)
  }

  function trocarItens(novos: Place[]) {
    setItens(novos)
    onChange?.(novos)
  }

  async function alternarVisitado(place: Place) {
    setPendente(place.id)
    try {
      const resposta = await fetch(`/api/trips/${tripId}/places/${place.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visited: !place.visited }),
      })
      if (!resposta.ok) throw new Error(await lerErro(resposta, "Erro ao atualizar lugar"))
      const { place: atualizado }: { place: Place } = await resposta.json()
      trocarItens(itens.map((p) => (p.id === atualizado.id ? atualizado : p)))
      toast({ title: atualizado.visited ? "Lugar marcado como visitado" : "Lugar marcado como não visitado" })
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : "Erro ao atualizar lugar"
      toast({ title: "Erro", description: mensagem, variant: "destructive" })
    } finally {
      setPendente(null)
    }
  }

  async function excluir(place: Place) {
    setParaExcluir(null)
    setPendente(place.id)
    try {
      const resposta = await fetch(`/api/trips/${tripId}/places/${place.id}`, { method: "DELETE" })
      if (!resposta.ok) throw new Error(await lerErro(resposta, "Erro ao remover lugar"))
      trocarItens(itens.filter((p) => p.id !== place.id))
      toast({ title: "Lugar removido" })
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : "Erro ao remover lugar"
      toast({ title: "Erro", description: mensagem, variant: "destructive" })
    } finally {
      setPendente(null)
    }
  }

  if (itens.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <MapPin className="mb-4 h-12 w-12 text-gray-300" />
        <h3 className="mb-2 text-lg font-semibold text-viaja-navy">Nenhum lugar salvo</h3>
        <p className="text-center text-gray-600">Adicione lugares que deseja visitar</p>
      </div>
    )
  }

  return (
    <>
      <ul className="space-y-3">
        {itens.map((place) => {
          const ocupado = pendente === place.id
          return (
            <li
              key={place.id}
              className="rounded-lg border border-gray-200 p-4 transition-colors hover:border-viaja-orange/30"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h4 className="font-medium text-viaja-navy">{place.name}</h4>
                  {place.address && <p className="mt-1 line-clamp-2 text-sm text-gray-600">{place.address}</p>}
                  {place.notes && <p className="mt-2 text-sm italic text-gray-700">{place.notes}</p>}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {place.category && (
                      <Badge variant="secondary" className="text-xs">
                        {place.category}
                      </Badge>
                    )}
                    {place.visited && <Badge className="bg-emerald-100 text-emerald-800">Visitado</Badge>}
                    {place.rating != null && (
                      <span className="flex items-center gap-1 text-sm text-amber-600">
                        <Star className="h-3 w-3 fill-current" />
                        {place.rating}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    aria-pressed={!!place.visited}
                    disabled={ocupado}
                    onClick={() => alternarVisitado(place)}
                  >
                    {ocupado ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : place.visited ? (
                      <CheckCircle2 className="mr-1 h-4 w-4 text-emerald-600" />
                    ) : (
                      <Circle className="mr-1 h-4 w-4" />
                    )}
                    {place.visited ? "Desmarcar visitado" : "Marcar visitado"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Excluir ${place.name}`}
                    disabled={ocupado}
                    onClick={() => setParaExcluir(place)}
                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      <ConfirmModal
        open={paraExcluir !== null}
        onOpenChange={(aberto) => !aberto && setParaExcluir(null)}
        title="Remover lugar"
        description={`"${paraExcluir?.name ?? ""}" será removido da viagem para todo o grupo.`}
        confirmText="Excluir"
        variant="destructive"
        onConfirm={() => paraExcluir && excluir(paraExcluir)}
      />
    </>
  )
}
