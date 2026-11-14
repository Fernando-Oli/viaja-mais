import Link from "next/link"
import { Check, ChevronLeft, PenLine, Sparkles } from "lucide-react"

/**
 * Nova viagem: a escolha entre montar com a Avori (perguntas guiadas e
 * roteiro sugerido) e criar do meu jeito (formulário em /dashboard/trips/new).
 *
 * É o destino do botão "Nova viagem" da barra e do "+" da barra de abas.
 */

function Itens({ itens, claro }: { itens: string[]; claro?: boolean }) {
  return (
    <ul className="space-y-2">
      {itens.map((t) => (
        <li key={t} className="flex gap-2.5 text-sm">
          <Check className={claro ? "mt-0.5 h-[18px] w-[18px] shrink-0 text-citrico" : "mt-0.5 h-[18px] w-[18px] shrink-0 text-primary"} aria-hidden />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  )
}

export default function CriarViagemPage() {
  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/trips"
        className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Viagens
      </Link>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Como você quer criar a viagem?</h1>
        <p className="mt-1 text-muted-foreground">Nos dois caminhos dá para editar tudo depois.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <article className="flex flex-col overflow-hidden rounded-3xl bg-primary text-primary-foreground">
          {/* eslint-disable-next-line @next/next/no-img-element -- arte estática da marca */}
          <img src="/brand/avori-grafismo-floresta.svg" alt="" className="h-44 w-full object-cover md:h-56" />
          <div className="flex flex-1 flex-col gap-4 p-6 md:p-8">
            <span className="self-start rounded-full bg-citrico px-3 py-1 text-xs font-medium text-grafite">Uns 2 minutos</span>
            <h2 className="text-3xl font-semibold leading-tight">Montar com a Avori</h2>
            <p className="max-w-md">
              Responda seis perguntas e receba um roteiro dia a dia, pensado para o ritmo e o orçamento do seu grupo.
            </p>
            <Itens
              claro
              itens={[
                "Destino, datas, quem vai, ritmo, orçamento e interesses",
                "Você vê a prévia e ajusta antes de salvar",
                "Nada é criado sem a sua confirmação",
              ]}
            />
            <Link
              href="/dashboard/trips/criar/ia"
              className="mt-auto inline-flex h-13 items-center justify-center gap-2 self-start rounded-xl bg-citrico px-7 py-3.5 text-base font-medium text-grafite transition-colors hover:bg-citrico/90"
            >
              <Sparkles className="h-5 w-5" aria-hidden />
              Começar com a Avori
            </Link>
          </div>
        </article>

        <article className="flex flex-col overflow-hidden rounded-3xl border border-border bg-card">
          <div className="flex h-44 items-center justify-center bg-muted px-6 md:h-56" aria-hidden>
            <div className="w-full max-w-sm space-y-2.5 rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="text-xs font-medium text-muted-foreground">Título da viagem</div>
              <div className="flex h-10 items-center rounded-lg border border-input px-3 text-sm">Lisboa com a turma</div>
              <div className="flex gap-2">
                <div className="flex h-10 flex-1 items-center rounded-lg border border-input px-3 text-sm">12/06</div>
                <div className="flex h-10 flex-1 items-center rounded-lg border border-input px-3 text-sm">18/06</div>
              </div>
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-4 p-6 md:p-8">
            <span className="self-start rounded-full bg-muted px-3 py-1 text-xs font-medium">Controle total</span>
            <h2 className="text-3xl font-semibold leading-tight">Criar do meu jeito</h2>
            <p className="max-w-md">
              Preencha título, destino, datas e orçamento. O roteiro você monta quando quiser, atividade por atividade.
            </p>
            <Itens
              itens={[
                "Comece só com o essencial",
                "Convide o grupo logo depois de criar",
                "Adicione atividades, reservas e despesas depois",
              ]}
            />
            <Link
              href="/dashboard/trips/new"
              className="mt-auto inline-flex items-center justify-center gap-2 self-start rounded-xl bg-primary px-7 py-3.5 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <PenLine className="h-5 w-5" aria-hidden />
              Preencher manualmente
            </Link>
          </div>
        </article>
      </div>
    </div>
  )
}
