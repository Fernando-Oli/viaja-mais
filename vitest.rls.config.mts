import { defineConfig } from "vitest/config"
import path from "node:path"
import { fileURLToPath } from "node:url"

const raiz = path.dirname(fileURLToPath(import.meta.url))

/**
 * Testes de RLS rodam contra um Postgres real com as migrations aplicadas.
 * Ficam fora da suíte principal porque exigem banco — mas são a evidência
 * central da seção 25 do documento, não um extra opcional.
 */
export default defineConfig({
  resolve: { alias: { "@": raiz } },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/rls/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
})
