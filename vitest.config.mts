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
    // 15s em vez dos 5s padrão: teste de tela que digita com `userEvent`
    // (ex.: os 130 caracteres do cadastro) passa sozinho em ~1s, mas estoura
    // os 5s quando a suíte inteira disputa CPU com vários jsdom ao mesmo tempo.
    testTimeout: 15_000,
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
      // Corte ligado em S10 (RNF05). A meta do documento é 70% em lib/; o
      // `test:cov` do CI falha se qualquer uma das quatro métricas cair abaixo.
      // Medido ao ligar: lib/ com 91,5% de linhas e o total com 88,45% — a
      // folga é proposital, para um PR com regra nova e teste fraco não passar
      // sem ninguém ver.
      //
      // Nenhum arquivo foi excluído para o número fechar. `lib/supabase/client`,
      // `server` e `proxy` estão com 0% (são invólucros do SDK, exercitados só
      // pelo E2E) e continuam contando contra a média de lib/.
      thresholds: {
        lines: 70,
        branches: 70,
        functions: 70,
        statements: 70,
        "lib/**": { lines: 70, branches: 70, functions: 70, statements: 70 },
      },
    },
  },
})
