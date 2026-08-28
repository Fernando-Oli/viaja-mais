import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "node:path"
import { fileURLToPath } from "node:url"

const raiz = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": raiz },
  },
  test: {
    // Ambiente padrão é node: a maior parte da suíte testa regra de negócio e
    // route handler. Teste de componente pede jsdom com o docblock
    // `// @vitest-environment jsdom` no topo do arquivo — assim o jsdom (que
    // custa ~50s de setup) só carrega onde é necessário.
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx", "lib/**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", "e2e/**", "tests/rls/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["lib/**/*.ts", "app/api/**/*.ts"],
      exclude: ["**/*.test.ts", "lib/utils.ts", "types/**"],
      // Sem threshold ainda, de propósito: a meta declarada no documento é 70%
      // em lib/ (RNF05), mas a suíte está começando. Ligar o corte agora só
      // criaria um gate que precisamos contornar toda semana.
      // Ativar em S05, quando lib/finance/ entrar — é o primeiro módulo de
      // lógica pura com massa suficiente para sustentar o número.
    },
  },
})
