# Imagem de produção do ViajaMais.
#
# Três coisas que estavam quebradas na versão anterior e que este arquivo resolve:
#   1. copiava `bun.lockb`, que não existe no repositório — o lockfile é o do npm;
#   2. esperava `.next/standalone` sem que `next.config.mjs` tivesse
#      `output: "standalone"`;
#   3. não recebia as variáveis NEXT_PUBLIC_*, que o Next embute no bundle
#      **durante o build**. Passá-las só como `environment` no runtime resultava
#      em um cliente compilado com credenciais `undefined`.

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
ENV NEXT_TELEMETRY_DISABLED=1

# ---------------------------------------------------------------- dependências
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------- build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Precisam existir no build: o Next as substitui por texto no bundle do
# navegador. Chegam por --build-arg (ver docker-compose.yml).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

# Liga o modo standalone só aqui: o runner abaixo depende de .next/standalone.
ENV BUILD_STANDALONE=1
RUN npm run build

# --------------------------------------------------------------------- runtime
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# O build standalone já traz apenas as dependências efetivamente usadas.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# A chave service role e as demais variáveis de servidor entram só aqui, no
# runtime: não devem ficar gravadas em nenhuma camada da imagem.
CMD ["node", "server.js"]
