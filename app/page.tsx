import Link from "next/link"
import { BedDouble, CalendarDays, MapPin, Plane, Wallet } from "lucide-react"
import { Logo } from "@/components/brand/logo"

/**
 * Página inicial pública da Avori. O grafismo Percursos só aparece no hero e
 * no bloco final (regra do manual: arte em capas e aberturas, nunca atrás de
 * texto longo ou formulário).
 */

function Recurso({
  Icone,
  titulo,
  texto,
  children,
}: {
  Icone: typeof Plane
  titulo: string
  texto: string
  children: React.ReactNode
}) {
  return (
    <article className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 md:p-8">
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-muted text-primary">
        <Icone className="h-5 w-5" aria-hidden />
      </span>
      <h3 className="text-2xl font-semibold">{titulo}</h3>
      <p className="text-muted-foreground">{texto}</p>
      <div className="mt-auto">{children}</div>
    </article>
  )
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-primary-foreground">
        <div className="mx-auto flex h-[72px] max-w-[1360px] items-center gap-6 px-4 md:px-10">
          <Link href="/" className="shrink-0 rounded-md">
            <Logo variante="marfim" />
          </Link>
          <nav aria-label="Página inicial" className="hidden flex-1 gap-6 text-sm font-medium md:flex">
            <a href="#recursos" className="hover:underline">
              Recursos
            </a>
            <a href="#assistente" className="hover:underline">
              Assistente
            </a>
            <a href="#viajantes" className="hover:underline">
              Viajantes
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/auth/login"
              className="inline-flex h-11 items-center rounded-xl px-4 text-sm font-medium hover:bg-primary-foreground/10"
            >
              Entrar
            </Link>
            <Link
              href="/auth/sign-up"
              className="inline-flex h-11 items-center rounded-xl bg-citrico px-5 text-sm font-medium text-grafite hover:bg-citrico/90"
            >
              Criar conta
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="bg-primary text-primary-foreground">
          <div className="mx-auto grid max-w-[1360px] items-center gap-10 px-4 pb-0 pt-12 md:px-10 lg:grid-cols-2 lg:pt-20">
            <div className="space-y-6 pb-4 lg:pb-20">
              <span className="inline-flex rounded-full bg-citrico px-3 py-1 text-xs font-medium text-grafite">
                Planejamento de viagens
              </span>
              <h1 className="text-5xl font-semibold leading-[1.02] tracking-tight md:text-6xl">
                Uma viagem inteira. Um lugar só.
              </h1>
              <p className="max-w-xl text-lg">
                Roteiro, reservas, lugares e despesas do grupo, organizados juntos. Você planeja com leveza e viaja com
                tudo sob controle.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/auth/sign-up"
                  className="inline-flex h-13 items-center rounded-xl bg-citrico px-7 text-base font-medium text-grafite hover:bg-citrico/90"
                >
                  Começar agora
                </Link>
                <a
                  href="#recursos"
                  className="inline-flex h-13 items-center rounded-xl border border-primary-foreground px-7 text-base font-medium hover:bg-primary-foreground/10"
                >
                  Ver como funciona
                </a>
              </div>
              <p className="text-sm">Grátis para você e para quem vai junto.</p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- arte estática da marca */}
            <img
              src="/brand/avori-grafismo-floresta.svg"
              alt=""
              className="w-full self-end rounded-t-3xl object-cover lg:max-h-[520px]"
            />
          </div>
        </section>

        {/* Recursos */}
        <section id="recursos" className="mx-auto max-w-[1360px] scroll-mt-6 px-4 py-16 md:px-10 md:py-24">
          <div className="mb-10 max-w-2xl space-y-3">
            <h2 className="text-4xl font-semibold tracking-tight">Organizar para aproveitar.</h2>
            <p className="text-lg text-muted-foreground">
              Cada parte da viagem tem o seu lugar, e o grupo inteiro vê a mesma coisa.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <Recurso
              Icone={CalendarDays}
              titulo="Roteiro dia a dia"
              texto="Monte os dias com horários e lugares. Quem viaja junto acompanha cada mudança."
            >
              <ul className="divide-y divide-border rounded-2xl border border-border">
                {[
                  ["12", "Chegada e Belém", "3 atividades · 14h às 20h"],
                  ["13", "Alfama e Castelo de São Jorge", "4 atividades · 9h às 19h"],
                  ["14", "Time Out Market e Cais do Sodré", "2 atividades · 11h às 16h"],
                ].map(([d, t, s]) => (
                  <li key={d} className="flex items-center gap-4 px-4 py-3">
                    <span className="flex w-10 flex-col items-center leading-none">
                      <span className="text-xl font-semibold">{d}</span>
                      <span className="text-xs text-muted-foreground">jun</span>
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">{t}</span>
                      <span className="text-xs text-muted-foreground">{s}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Recurso>
            <Recurso
              Icone={Wallet}
              titulo="Despesas divididas"
              texto="Registre quem pagou. A Avori calcula quanto cada pessoa deve e fecha o acerto."
            >
              <div className="grid grid-cols-3 gap-3">
                {[
                  ["Gasto", "€ 1.296"],
                  ["Restante", "€ 504"],
                  ["Por pessoa", "€ 432"],
                ].map(([r, v]) => (
                  <div key={r} className="rounded-2xl bg-muted p-3">
                    <div className="text-xs font-medium text-muted-foreground">{r}</div>
                    <div className="text-lg font-semibold tabular-nums">{v}</div>
                  </div>
                ))}
              </div>
            </Recurso>
            <Recurso
              Icone={BedDouble}
              titulo="Reservas à mão"
              texto="Voos, hospedagem e transporte no mesmo lugar, com código e horário."
            >
              <ul className="space-y-2">
                {[
                  [Plane, "Voo GRU → LIS", "12 jun · 22h40"],
                  [BedDouble, "Casa em Alfama", "6 noites"],
                ].map(([I, t, s]) => {
                  const Icone = I as typeof Plane
                  return (
                    <li key={t as string} className="flex items-center gap-3 rounded-2xl bg-muted px-4 py-3">
                      <Icone className="h-5 w-5 text-primary" aria-hidden />
                      <span className="flex-1 text-sm font-semibold">{t as string}</span>
                      <span className="text-xs text-muted-foreground">{s as string}</span>
                    </li>
                  )
                })}
              </ul>
            </Recurso>
            <Recurso
              Icone={MapPin}
              titulo="Lugares para não esquecer"
              texto="Guarde restaurantes, mirantes e museus, com as avaliações de quem já foi."
            >
              <div className="flex flex-wrap gap-2">
                {["Miradouro da Graça", "Pastéis de Belém", "LX Factory", "Museu do Azulejo", "Sintra"].map((l) => (
                  <span key={l} className="rounded-full border border-input px-3 py-1.5 text-sm font-medium">
                    {l}
                  </span>
                ))}
              </div>
            </Recurso>
          </div>
        </section>

        {/* Assistente */}
        <section id="assistente" className="scroll-mt-6 bg-card">
          <div className="mx-auto grid max-w-[1360px] gap-10 px-4 py-16 md:px-10 md:py-24 lg:grid-cols-2">
            <div className="space-y-5">
              <span className="inline-flex rounded-full bg-citrico px-3 py-1 text-xs font-medium text-grafite">Roteiro com IA</span>
              <h2 className="text-4xl font-semibold tracking-tight">Conte como vocês viajam. Receba o roteiro pronto.</h2>
              <p className="text-lg text-muted-foreground">
                Ao criar uma viagem, você escolhe: montar com a Avori, que faz algumas perguntas e sugere um roteiro, ou
                preencher do seu jeito. Nada é salvo sem você revisar.
              </p>
              <ol className="space-y-3">
                {[
                  ["Responda", "seis perguntas: destino, datas, quem vai, ritmo, orçamento e interesses."],
                  ["Revise", "a prévia dia a dia e troque o que quiser."],
                  ["Aceite", "o roteiro e convide quem vai com você."],
                ].map(([v, t], i) => (
                  <li key={v} className="flex gap-3">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                      {i + 1}
                    </span>
                    <span className="pt-1">
                      <strong className="font-semibold">{v}</strong> {t}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="flex flex-col justify-center gap-3 rounded-3xl bg-background p-6" aria-hidden>
              <div className="max-w-[80%] self-start rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-3">
                Qual é o ritmo que combina com vocês?
              </div>
              <div className="max-w-[80%] self-end rounded-2xl rounded-br-sm bg-primary px-4 py-3 text-primary-foreground">
                Equilibrado
              </div>
              <div className="max-w-[80%] self-start rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-3">
                Anotado. O que não pode faltar?
              </div>
              <div className="flex flex-wrap gap-2">
                {["Gastronomia", "Praia", "Museus", "Trilhas"].map((c, i) => (
                  <span
                    key={c}
                    className={
                      i === 0
                        ? "rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                        : "rounded-full border border-input px-4 py-2 text-sm font-medium"
                    }
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Viajantes */}
        <section id="viajantes" className="mx-auto max-w-[1360px] scroll-mt-6 px-4 py-16 md:px-10 md:py-24">
          <div className="mb-10 max-w-2xl space-y-3">
            <h2 className="text-4xl font-semibold tracking-tight">Viagens de quem você segue.</h2>
            <p className="text-lg text-muted-foreground">
              Publique o roteiro quando voltar. Salve o de outra pessoa para começar o seu.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              ["7 dias", "Lisboa", "Marina Costa · 12–18 junho"],
              ["4 dias", "Chapada dos Veadeiros", "Rafael Lima · 3–6 setembro"],
              ["10 dias", "Patagônia", "Júlia Andrade · 8–17 janeiro"],
            ].map(([d, t, s], i) => (
              <article key={t} className="overflow-hidden rounded-3xl bg-primary text-primary-foreground">
                {/* eslint-disable-next-line @next/next/no-img-element -- arte estática da marca */}
                <img
                  src="/brand/avori-grafismo-floresta.svg"
                  alt=""
                  className="h-48 w-full object-cover"
                  style={{ objectPosition: `${20 + i * 30}% 50%` }}
                />
                <div className="space-y-1 p-5">
                  <span className="inline-flex rounded-full bg-citrico px-2.5 py-0.5 text-xs font-medium text-grafite">{d}</span>
                  <h3 className="text-2xl font-semibold">{t}</h3>
                  <p className="text-sm">{s}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Final */}
        <section className="px-4 pb-16 md:px-10">
          <div className="mx-auto grid max-w-[1360px] overflow-hidden rounded-3xl bg-primary text-primary-foreground lg:grid-cols-2">
            <div className="space-y-5 p-8 md:p-12">
              <h2 className="text-4xl font-semibold tracking-tight">Sua próxima viagem começa aqui.</h2>
              <p className="text-lg">Crie a viagem, convide quem vai com você e deixe tudo no mesmo lugar.</p>
              <Link
                href="/auth/sign-up"
                className="inline-flex h-13 items-center rounded-xl bg-citrico px-7 text-base font-medium text-grafite hover:bg-citrico/90"
              >
                Criar conta grátis
              </Link>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- arte estática da marca */}
            <img src="/brand/avori-grafismo-floresta.svg" alt="" className="h-full min-h-56 w-full object-cover" />
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-4 px-4 py-8 md:px-10">
          <Logo />
          <p className="text-sm text-muted-foreground">
            © 2026 Avori. Projeto Integrador de Engenharia de Software, UniEVANGÉLICA.
          </p>
        </div>
      </footer>
    </div>
  )
}
