"use client"

import { useState, useEffect, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { MapPin, Loader2 } from "lucide-react"

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

interface PlaceAutocompleteProps {
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
  placeholder?: string
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

export function PlaceAutocompleteMap({
  onPlaceSelect,
  defaultLocation,
  placeholder = "Buscar lugares, atrações, restaurantes...",
}: PlaceAutocompleteProps) {
  const [query, setQuery] = useState("")
  const [predictions, setPredictions] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isScriptLoaded, setIsScriptLoaded] = useState(false)
  const [autocompleteService, setAutocompleteService] = useState<any>(null)
  const [placesService, setPlacesService] = useState<any>(null)

  useEffect(() => {
    const loadGoogleMaps = () => {
      if (window.google && window.google.maps) {
        setAutocompleteService(new window.google.maps.places.AutocompleteService())
        const mapDiv = document.createElement("div")
        const map = new window.google.maps.Map(mapDiv)
        setPlacesService(new window.google.maps.places.PlacesService(map))
        setIsScriptLoaded(true)
        return
      }

      const script = document.createElement("script")
      script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`
      script.async = true
      script.defer = true
      script.onload = () => {
        setAutocompleteService(new window.google.maps.places.AutocompleteService())
        const mapDiv = document.createElement("div")
        const map = new window.google.maps.Map(mapDiv)
        setPlacesService(new window.google.maps.places.PlacesService(map))
        setIsScriptLoaded(true)
      }
      document.head.appendChild(script)
    }

    loadGoogleMaps()
  }, [])

  const handleInputChange = useCallback(
    (value: string) => {
      setQuery(value)

      if (!value.trim() || !autocompleteService || !isScriptLoaded) {
        setPredictions([])
        return
      }

      setIsLoading(true)

      const request: any = {
        input: value,
        types: ["establishment", "geocode"],
      }

      if (defaultLocation) {
        request.location = new window.google.maps.LatLng(defaultLocation.lat, defaultLocation.lng)
        request.radius = 50000
      }

      autocompleteService.getPlacePredictions(request, (results: any, status: any) => {
        setIsLoading(false)
        if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
          setPredictions(results)
        } else {
          setPredictions([])
        }
      })
    },
    [autocompleteService, isScriptLoaded, defaultLocation],
  )

  const handlePlaceSelect = (placeId: string) => {
    if (!placesService) return

    placesService.getDetails({ placeId }, (place: any, status: any) => {
      if (status === window.google.maps.places.PlacesServiceStatus.OK && place) {
        const category = place.types?.[0] || "other"
        onPlaceSelect({
          place_id: place.place_id,
          name: place.name,
          address: place.formatted_address,
          latitude: place.geometry.location.lat(),
          longitude: place.geometry.location.lng(),
          rating: place.rating,
          category,
        })
        setQuery("")
        setPredictions([])
      }
    })
  }

  return (
    <div className="relative space-y-2">
      <div className="relative">
        <Input
          placeholder={placeholder}
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          disabled={!isScriptLoaded}
          className="pr-10"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
        )}
      </div>

      {predictions.length > 0 && (
        <Card className="absolute z-50 w-full max-h-96 overflow-y-auto p-2 shadow-lg">
          <div className="space-y-1">
            {predictions.map((prediction: any) => (
              <button
                key={prediction.place_id}
                onClick={() => handlePlaceSelect(prediction.place_id)}
                className="w-full rounded-lg p-3 text-left transition-colors hover:bg-gray-100"
              >
                <div className="flex items-start gap-3">
                  <MapPin className="mt-1 h-5 w-5 shrink-0 text-viaja-orange" />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-viaja-navy truncate">
                      {prediction.structured_formatting.main_text}
                    </h4>
                    <p className="text-sm text-gray-600 truncate">{prediction.structured_formatting.secondary_text}</p>
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
