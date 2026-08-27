import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach, vi } from "vitest"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// Valores fixos para que lib/env.ts valide durante os testes sem exigir
// um .env.local — os testes de integração usam credenciais reais via CI.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://localhost:54321"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "chave-anon-de-teste"
process.env.NEXT_PUBLIC_APP_URL ||= "http://localhost:3000"
process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||= "chave-maps-de-teste"
