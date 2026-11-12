"use client"

import { use, useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { ArrowLeft, Star, Loader2 } from "lucide-react"
import Link from "next/link"
import { PlaceAutocompleteMap } from "@/components/place-autcomplete-map"
import { PlaceList, type Place } from "@/components/place-list"
import { useToast } from "@/hooks/use-toast"

/**
 * Busca e salva lugares da viagem. Leitura e escrita passam pelas rotas
 * `/api/trips/[tripId]/places`, que conferem a participação na viagem.
 *
 * @RF08.1 buscar lugares · @RF08.2 salvar lugar · @RF08.3 notas no lugar
 */
export default function TripPlacesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erroAoCarregar, setErroAoCarregar] = useState<string | null>(null)
  const [places, setPlaces] = useState<Place[]>([])
  const [selectedPlace, setSelectedPlace] = useState<any>(null)
  const [notes, setNotes] = useState("")
  const [trip, setTrip] = useState<{ destination?: string | null } | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [respostaViagem, respostaLugares] = await Promise.all([
          fetch(`/api/trips/${id}`),
          fetch(`/api/trips/${id}/places`),
        ])
        if (!respostaLugares.ok) {
          const dados: { error?: string } = await respostaLugares.json().catch(() => ({}))
          throw new Error(dados.error || "Não foi possível carregar os lugares")
        }
        if (respostaViagem.ok) setTrip((await respostaViagem.json()).trip)
        setPlaces((await respostaLugares.json()).places || [])
      } catch (erro) {
        setErroAoCarregar(erro instanceof Error ? erro.message : "Não foi possível carregar os lugares")
      } finally {
        setCarregando(false)
      }
    }

    fetchData()
  }, [id])

  const handlePlaceSelect = (place: any) => {
    setSelectedPlace(place)
  }

  const handleSavePlace = async () => {
    if (!selectedPlace) return

    setIsLoading(true)
    try {
      const resposta = await fetch(`/api/trips/${id}/places`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: selectedPlace.name,
          address: selectedPlace.address,
          latitude: selectedPlace.latitude,
          longitude: selectedPlace.longitude,
          place_id: selectedPlace.place_id,
          category: selectedPlace.category,
          rating: selectedPlace.rating,
          notes: notes || null,
        }),
      })
      if (!resposta.ok) {
        const dados: { error?: string } = await resposta.json().catch(() => ({}))
        throw new Error(dados.error || "Erro ao salvar lugar")
      }
      const { place }: { place: Place } = await resposta.json()

      setPlaces((atual) => [place, ...atual])
      setSelectedPlace(null)
      setNotes("")
      toast({ title: "Lugar salvo", description: "O lugar foi incluído na viagem." })
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : "Erro ao salvar lugar"
      toast({ title: "Erro", description: mensagem, variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" asChild className="mb-4">
          <Link href={`/dashboard/trips/${id}?aba=lugares`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Link>
        </Button>
        <h1 className="text-3xl font-bold text-viaja-navy">Lugares da Viagem</h1>
        <p className="mt-2 text-gray-600">Busque e salve lugares para visitar</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Search and Add */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Buscar Lugares</CardTitle>
              <CardDescription>Encontre atrações, restaurantes e pontos turísticos</CardDescription>
            </CardHeader>
            <CardContent>
              <PlaceAutocompleteMap
                onPlaceSelect={handlePlaceSelect}
                defaultLocation={
                  trip?.destination
                    ? undefined
                    : {
                        lat: -23.5505,
                        lng: -46.6333,
                      }
                }
              />
            </CardContent>
          </Card>

          {selectedPlace && (
            <Card className="border-viaja-orange/30">
              <CardHeader>
                <CardTitle>Lugar Selecionado</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold text-viaja-navy">{selectedPlace.name}</h3>
                  <p className="mt-1 text-sm text-gray-600">{selectedPlace.address}</p>
                  {selectedPlace.rating && (
                    <div className="mt-2 flex items-center gap-1 text-sm text-amber-600">
                      <Star className="h-4 w-4 fill-current" />
                      <span>{selectedPlace.rating}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Observações</Label>
                  <Textarea
                    id="notes"
                    placeholder="Adicione observações sobre este lugar..."
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleSavePlace}
                    disabled={isLoading}
                    className="bg-viaja-orange hover:bg-viaja-orange/90"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      "Salvar Lugar"
                    )}
                  </Button>
                  <Button variant="outline" onClick={() => setSelectedPlace(null)}>
                    Cancelar
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Saved Places List */}
        <Card>
          <CardHeader>
            <CardTitle>Lugares Salvos ({places.length})</CardTitle>
            <CardDescription>Todos os lugares que o grupo adicionou a esta viagem</CardDescription>
          </CardHeader>
          <CardContent>
            {carregando ? (
              <div className="flex items-center justify-center py-12 text-gray-600">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Carregando lugares...
              </div>
            ) : erroAoCarregar ? (
              <p role="alert" className="py-12 text-center text-sm text-red-600">
                {erroAoCarregar}
              </p>
            ) : (
              <PlaceList places={places} tripId={id} onChange={setPlaces} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
