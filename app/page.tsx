import type React from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Plane, MapPin, Wallet, Calendar, Star, Globe } from "lucide-react"

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-viaja-green rounded-xl flex items-center justify-center relative">
              <Plane className="w-5 h-5 text-white absolute" style={{ transform: "rotate(-45deg)" }} />
            </div>
            <span className="text-2xl font-bold text-viaja-navy">Viaja+</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/auth/login">
              <Button variant="ghost" size="sm" className="text-viaja-navy">
                Entrar
              </Button>
            </Link>
            <Link href="/auth/sign-up">
              <Button size="sm" className="bg-viaja-orange hover:bg-viaja-orange/90 text-white">
                Começar Grátis
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="container mx-auto px-4 py-20 md:py-32">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-viaja-green/10 text-viaja-green rounded-full text-sm font-medium mb-6">
            <Star className="w-4 h-4 fill-current" />
            Planejamento Inteligente de Viagens
          </div>
          <h1 className="text-5xl md:text-7xl font-bold text-balance mb-6 leading-tight text-viaja-navy">
            Todas as suas viagens em <span className="text-viaja-orange">um só lugar</span>
          </h1>
          <p className="text-xl text-gray-600 text-balance mb-8 leading-relaxed max-w-2xl mx-auto">
            Centralize reservas, controle gastos, organize itinerários e descubra pontos turísticos. Tudo que você
            precisa para uma viagem perfeita.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/auth/sign-up">
              <Button size="lg" className="bg-viaja-orange hover:bg-viaja-orange/90 text-white text-lg px-8 h-14">
                Começar Agora
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-20 bg-gray-50">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4 text-viaja-navy">Recursos Completos</h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Tudo que você precisa para planejar e gerenciar suas viagens de forma eficiente
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <FeatureCard
            icon={<Calendar className="w-8 h-8" />}
            title="Itinerário Inteligente"
            description="Organize todos os detalhes da sua viagem em um cronograma visual e interativo"
            color="green"
          />
          <FeatureCard
            icon={<Wallet className="w-8 h-8" />}
            title="Controle Financeiro"
            description="Gerencie gastos, divida custos com amigos e converta moedas em tempo real"
            color="orange"
          />
          <FeatureCard
            icon={<MapPin className="w-8 h-8" />}
            title="Mapas Integrados"
            description="Encontre pontos turísticos, restaurantes e rotas otimizadas com Google Maps"
            color="green"
          />
          <FeatureCard
            icon={<Plane className="w-8 h-8" />}
            title="Reservas Centralizadas"
            description="Gerencie voos, hotéis e transporte em um único lugar"
            color="orange"
          />
          <FeatureCard
            icon={<Globe className="w-8 h-8" />}
            title="Recomendações Personalizadas"
            description="Descubra lugares incríveis baseados em avaliações de outros viajantes"
            color="green"
          />
          <FeatureCard
            icon={<Star className="w-8 h-8" />}
            title="Avaliações e Reviews"
            description="Compartilhe experiências e ajude outros viajantes"
            color="orange"
          />
        </div>
      </section>

      <section className="container mx-auto px-4 py-20">
        <div className="bg-viaja-navy rounded-3xl p-12 md:p-16 text-center text-white">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">Pronto para sua próxima aventura?</h2>
          <p className="text-xl mb-8 opacity-90 max-w-2xl mx-auto">
            Junte-se a milhares de viajantes que já simplificaram seu planejamento
          </p>
          <Link href="/auth/sign-up">
            <Button size="lg" className="bg-viaja-orange hover:bg-viaja-orange/90 text-white text-lg px-8 h-14">
              Criar Conta Gratuita
            </Button>
          </Link>
        </div>
      </section>

      <footer className="border-t bg-gray-50 py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-viaja-green rounded-lg flex items-center justify-center relative">
                <Plane className="w-4 h-4 text-white absolute" style={{ transform: "rotate(-45deg)" }} />
                <span
                  className="text-white text-sm font-bold absolute"
                  style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
                >
                  +
                </span>
              </div>
              <span className="text-xl font-bold text-viaja-navy">Viaja+</span>
            </div>
            <p className="text-sm text-gray-600">© 2025 Viaja+. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  description,
  color,
}: { icon: React.ReactNode; title: string; description: string; color: "green" | "orange" }) {
  const bgColor = color === "green" ? "bg-viaja-green/10" : "bg-viaja-orange/10"
  const textColor = color === "green" ? "text-viaja-green" : "text-viaja-orange"

  return (
    <div className="p-6 rounded-2xl border bg-white hover:shadow-lg transition-shadow">
      <div className={`w-14 h-14 ${bgColor} ${textColor} rounded-xl flex items-center justify-center mb-4`}>{icon}</div>
      <h3 className="text-xl font-semibold mb-2 text-viaja-navy">{title}</h3>
      <p className="text-gray-600 leading-relaxed">{description}</p>
    </div>
  )
}
