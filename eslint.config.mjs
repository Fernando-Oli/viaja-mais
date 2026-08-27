import nextCoreWebVitals from "eslint-config-next/core-web-vitals"
import nextTypescript from "eslint-config-next/typescript"

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "docs/pfc/build/**",
      "next-env.d.ts",
      "types/database.ts",
    ],
  },

  ...nextCoreWebVitals,
  ...nextTypescript,

  {
    rules: {
      // Feedback ao usuário passa por toast()/ConfirmModal — ver CLAUDE.md.
      // TODO(T1): virar "error" quando os últimos call sites saírem de
      // components/trip-members.tsx e app/dashboard/trips/[id]/places/page.tsx.
      "no-restricted-globals": [
        "warn",
        { name: "alert", message: "Use toast() em vez de alert()." },
        { name: "confirm", message: "Use components/ui/confirm-modal.tsx em vez de confirm()." },
      ],
      "no-console": ["error", { allow: ["warn", "error"] }],

      // As três regras abaixo estão em "warn" de propósito, não por descuido.
      //
      // O projeto nasceu de scaffolding e herdou ~70 violações espalhadas por
      // todo o código. Transformá-las em erro travaria o CI no dia um; ignorá-las
      // esconderia dívida real. A saída é `npm run lint` com --max-warnings fixo
      // em BASELINE_AVISOS: o número existe, é visível, e só pode cair.
      //
      // Onde cada uma se resolve:
      //   no-explicit-any  -> S02, quando types/database.ts substituir os `any`
      //                       de linhas do Supabase, e nos componentes de mapa.
      //   no-unused-vars   -> S02–S06: quase tudo é `catch (error)` com o erro
      //                       engolido, que some ao padronizar os route handlers.
      //   react-hooks/*    -> S02: setState em efeito e Date.now() em render.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },

  {
    // Variáveis de ambiente entram por lib/env.ts, que valida com zod no boot.
    // Sem isso, `undefined` vaza silenciosamente para produção.
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "context/**/*.{ts,tsx}", "hooks/**/*.{ts,tsx}"],
    rules: {
      // Agora é erro, não aviso: em S01 zeramos os acessos diretos a process.env
      // fora de lib/env.ts, então qualquer novo é regressão.
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.object.name='process'][object.property.name='env']",
          message: "Leia variáveis de ambiente por lib/env.ts, não process.env direto.",
        },
      ],
    },
  },

  {
    files: ["scripts/**/*.mjs", "*.config.{js,mjs,ts}", "e2e/**/*.ts", "tests/**/*.ts"],
    rules: { "no-console": "off", "no-restricted-syntax": "off" },
  },
]

export default config
