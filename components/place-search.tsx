"use client"

import { useState, useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Search, MapPin, Star } from "lucide-react"

interface PlaceResult {
  place_id: string
  name: string
  formatted_address: string
  geometry: {
    location: {
      lat: number
      lng: number
    }
  }
  rating?: number
  types?: string[]
}

interface PlaceSearchProps {
  onPlaceSelect: (place: {
    place_id: string
    name: string
    address: string
    latitude: number
    longitude: number
    rating?: number
    category?: string
  }) => void
  defaultLocation?: { lat: number; lng: number }
}

declare global {
  interface Window {
    google: any
  }
}

/**
 * SECURITY NOTE: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
 *
 * This environment variable is intentionally exposed to the client.
 * This is the CORRECT and RECOMMENDED implementation by Google for the Places API.
 *
 * The Google Places API MUST run in the browser (client-side), therefore
 * the API key must be accessible to the client code.
 *
 * SECURITY IS GUARANTEED BY:
 * 1. HTTP Referrer Restrictions in Google Cloud Console
 *    - Only your domains can use this key
 *    - Configure: console.cloud.google.com/apis/credentials
 * 2. API Restrictions
 *    - Limit to only Maps JavaScript API, Places API, Geocoding API
 * 3. Usage Quotas and Monitoring
 *    - Set daily quotas to prevent abuse
 *    - Monitor usage in Google Cloud Console
 *
 * This is NOT a security vulnerability when properly configured.
 * See: https://developers.google.com/maps/api-security-best-practices
 */

export function PlaceSearch({ onPlaceSelect, defaultLocation }: PlaceSearchProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<PlaceResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isScriptLoaded, setIsScriptLoaded] = useState(false)
  const serviceRef = useRef<any | null>(null)

  useEffect(() => {
    const loadGoogleMaps = () => {
      if (window.google && window.google.maps) {
        const mapDiv = document.createElement("div")
        const map = new window.google.maps.Map(mapDiv)
        serviceRef.current = new window.google.maps.places.PlacesService(map)
        setIsScriptLoaded(true)
        return
      }

      const script = document.createElement("script")
      script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`
      script.async = true
      script.defer = true
      script.onload = () => {
        const mapDiv = document.createElement("div")
        const map = new window.google.maps.Map(mapDiv)
        serviceRef.current = new window.google.maps.places.PlacesService(map)
        setIsScriptLoaded(true)
      }
      document.head.appendChild(script)
    }

    loadGoogleMaps()
  }, [])

  const handleSearch = () => {
    if (!query.trim() || !serviceRef.current || !isScriptLoaded) return

    setIsLoading(true)
    setResults([])

    const request: any = {
      query,
      location: defaultLocation ? new window.google.maps.LatLng(defaultLocation.lat, defaultLocation.lng) : undefined,
      radius: defaultLocation ? 50000 : undefined,
    }

    serviceRef.current.textSearch(request, (results: any, status: any) => {
      setIsLoading(false)
      if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
        setResults(results)
      }
    })
  }

  const handlePlaceSelect = (place: PlaceResult) => {
    const category = place.types?.[0] || "other"
    onPlaceSelect({
      place_id: place.place_id,
      name: place.name,
      address: place.formatted_address,
      latitude: place.geometry.location.lat,
      longitude: place.geometry.location.lng,
      rating: place.rating,
      category,
    })
    setQuery("")
    setResults([])
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Buscar lugares, atrações, restaurantes..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <Button onClick={handleSearch} disabled={isLoading || !isScriptLoaded}>
          <Search className="h-4 w-4" />
        </Button>
      </div>

      {results.length > 0 && (
        <Card className="max-h-96 overflow-y-auto p-2">
          <div className="space-y-2">
            {results.map((place: PlaceResult) => (
              <button
                key={place.place_id}
                onClick={() => handlePlaceSelect(place)}
                className="w-full rounded-lg p-3 text-left transition-colors hover:bg-slate-100"
              >
                <div className="flex items-start gap-3">
                  <MapPin className="mt-1 h-5 w-5 flex-shrink-0 text-orange-500" />
                  <div className="flex-1">
                    <h4 className="font-medium text-slate-900">{place.name}</h4>
                    <p className="text-sm text-slate-600">{place.formatted_address}</p>
                    {place.rating && (
                      <div className="mt-1 flex items-center gap-1 text-sm text-amber-600">
                        <Star className="h-4 w-4 fill-current" />
                        <span>{place.rating}</span>
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
