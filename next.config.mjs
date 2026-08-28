/** @type {import('next').NextConfig} */
const nextConfig = {
  // Só para a imagem Docker, que copia .next/standalone e roda server.js.
  //
  // Na Vercel isto NÃO pode estar ligado: a plataforma monta a saída por conta
  // própria, e o rastreamento de arquivos do modo standalone falha lá com
  // "ENOENT: .next/next-server.js.nft.json". O Dockerfile define
  // BUILD_STANDALONE=1 no estágio de build; nenhum outro ambiente define.
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,

  images: {
    // Sem otimização de imagem no servidor: as capas de viagem e as fotos de
    // lugares vêm de URLs externas e o runtime standalone não embarca o sharp.
    unoptimized: true,
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Impede que o navegador "adivinhe" o tipo de um arquivo servido.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Nada da aplicação deve ser embutido em iframe de terceiros.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // A aplicação não usa câmera, microfone nem geolocalização do navegador.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ]
  },
}

// Nota: a Content-Security-Policy entra na semana S06, junto com o rate limiting.
// Ela precisa liberar maps.googleapis.com e o projeto do Supabase, e uma CSP
// escrita às pressas quebra o carregamento do mapa em produção sem avisar.

export default nextConfig
