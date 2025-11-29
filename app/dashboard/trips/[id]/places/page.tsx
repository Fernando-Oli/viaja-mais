"use client"

import { use, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { ArrowLeft, MapPin, Star, Loader2, Trash2 } from "lucide-react"
import Link from "next/link"
import { PlaceAutocomplete } from "@/components/place-autocomplete"

export default function TripPlacesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [places, setPlaces] = useState<any[]>([])
  const [selectedPlace, setSelectedPlace] = useState<any>(null)
  const [notes, setNotes] = useState("")
  const [trip, setTrip] = useState<any>(null)

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()
      const { data: tripData } = await supabase.from("trips").select("*").eq("id", id).single()
      const { data: placesData } = await supabase.from("places").select("*").eq("trip_id", id)

      setTrip(tripData)
      setPlaces(placesData || [])
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
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) throw new Error("Usuário não autenticado")

      const { data, error } = await supabase
        .from("places")
        .insert([
          {
            trip_id: id,
            user_id: user.id,
            name: selectedPlace.name,
            address: selectedPlace.address,
            latitude: selectedPlace.latitude,
            longitude: selectedPlace.longitude,
            place_id: selectedPlace.place_id,
            category: selectedPlace.category,
            rating: selectedPlace.rating,
            notes: notes || null,
          },
        ])
        .select()

      if (error) throw error

      setPlaces([...places, data[0]])
      setSelectedPlace(null)
      setNotes("")
    } catch (err: any) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeletePlace = async (placeId: string) => {
    if (!confirm("Tem certeza que deseja remover este lugar?")) return

    try {
      const supabase = createClient()
      const { error } = await supabase.from("places").delete().eq("id", placeId)

      if (error) throw error
      setPlaces(places.filter((p) => p.id !== placeId))
    } catch (err: any) {
      alert("Erro ao remover lugar: " + err.message)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" asChild className="mb-4">
          <Link href={`/dashboard/trips/${id}`}>
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
              <PlaceAutocomplete
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
            <CardDescription>Todos os lugares que você adicionou a esta viagem</CardDescription>
          </CardHeader>
          <CardContent>
            {places.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <MapPin className="mb-4 h-12 w-12 text-gray-300" />
                <p className="text-sm text-gray-600">Nenhum lugar salvo ainda</p>
                <p className="mt-1 text-xs text-gray-500">Use a busca ao lado para adicionar lugares</p>
              </div>
            ) : (
              <div className="space-y-3">
                {places.map((place) => (
                  <div
                    key={place.id}
                    className="rounded-lg border border-gray-200 p-4 hover:border-viaja-orange/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-viaja-navy">{place.name}</h4>
                        {place.address && <p className="mt-1 text-sm text-gray-600 line-clamp-2">{place.address}</p>}
                        {place.notes && <p className="mt-2 text-sm text-gray-700 italic">{place.notes}</p>}
                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                          {place.category && (
                            <Badge variant="secondary" className="text-xs">
                              {place.category}
                            </Badge>
                          )}
                          {place.rating && (
                            <div className="flex items-center gap-1 text-sm text-amber-600">
                              <Star className="h-3 w-3 fill-current" />
                              <span>{place.rating}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeletePlace(place.id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
