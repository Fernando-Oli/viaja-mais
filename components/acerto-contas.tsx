import Link from "next/link"
import { ArrowRight, CheckCircle2, Info } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { paraCentavos } from "@/lib/finance/balances"
import { formatarCentavos } from "@/lib/finance/rateio"
import type { Acerto, GrupoMoeda, PapelAcerto, SaldoAcerto } from "@/lib/finance/acerto"

/**
 * Apresentação do acerto de contas. Não calcula nada: saldos e transferências
 * chegam prontos de `GET /api/trips/[tripId]/acerto`, que usa `lib/finance/`.
 *
 * O estado de cada saldo é dito em texto ("a receber", "deve", "quite") além
 * da cor: cor sozinha não chega a quem não distingue verde de vermelho.
 *
 * @RF06.11 saldo por membro · @RF06.13 transferências sugeridas
 */

const ROTULO_PAPEL: Record<PapelAcerto, string> = {
  owner: "Dono",
  member: "Membro",
  ex: "Saiu da viagem",
}

function formatar(valor: number, moeda: string) {
  return formatarCentavos(Math.abs(paraCentavos(valor)), moeda)
}

function LinhaSaldo({ saldo, moeda }: { saldo: SaldoAcerto; moeda: string }) {
  const centavos = paraCentavos(saldo.valor)
  const estado =
    centavos > 0
      ? { texto: "a receber", cor: "text-emerald-700" }
      : centavos < 0
        ? { texto: "deve", cor: "text-red-700" }
        : { texto: "quite", cor: "text-slate-600" }

  return (
    <li
      data-testid="saldo-membro"
      className="flex flex-col gap-1 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {/* Os espaços não aparecem no flex, mas separam as palavras para leitor de tela. */}
        <span className="font-medium text-viaja-navy">{saldo.rotulo}</span>{" "}
        <Badge variant={saldo.papel === "owner" ? "default" : "secondary"}>{ROTULO_PAPEL[saldo.papel]}</Badge>
      </div>{" "}
      <p className={`text-sm font-semibold break-words ${estado.cor}`}>
        <span className="font-normal">{estado.texto}</span> {formatar(saldo.valor, moeda)}
      </p>
    </li>
  )
}

function GrupoAcerto({ grupo, mostrarMoeda }: { grupo: GrupoMoeda; mostrarMoeda: boolean }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2" data-testid="grupo-moeda">
      <Card>
        <CardHeader>
          <CardTitle>Saldo por membro{mostrarMoeda ? ` (${grupo.moeda})` : ""}</CardTitle>
          <CardDescription>Positivo tem a receber; negativo deve ao grupo.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2" aria-label="Saldo por membro">
            {grupo.saldos.map((saldo) => (
              <LinhaSaldo key={saldo.userId} saldo={saldo} moeda={grupo.moeda} />
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transferências sugeridas{mostrarMoeda ? ` (${grupo.moeda})` : ""}</CardTitle>
          <CardDescription>O menor caminho encontrado para zerar todos os saldos.</CardDescription>
        </CardHeader>
        <CardContent>
          {grupo.transferencias.length === 0 ? (
            <p className="text-sm text-slate-600">Nenhuma transferência necessária nesta moeda.</p>
          ) : (
            <ul className="space-y-2" aria-label="Transferências sugeridas">
              {grupo.transferencias.map((t) => (
                <li
                  key={`${t.de.userId}-${t.para.userId}`}
                  data-testid="transferencia"
                  className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm"
                >
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                  <p className="min-w-0 break-words">
                    <span className="font-medium text-viaja-navy">{t.de.rotulo}</span> paga{" "}
                    <span className="font-semibold">{formatar(t.valor, grupo.moeda)}</span> para{" "}
                    <span className="font-medium text-viaja-navy">{t.para.rotulo}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export function AcertoContas({ acerto, tripId }: { acerto: Acerto; tripId: string }) {
  if (acerto.totalDespesas === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 py-6">
          <p className="text-slate-700">Nenhuma despesa lançada nesta viagem ainda.</p>
          <Button asChild className="bg-viaja-orange hover:bg-viaja-orange/90">
            <Link href={`/dashboard/trips/${tripId}/expenses/new`}>Adicionar Despesa</Link>
          </Button>
          {acerto.grupos.map((grupo) => (
            <ul key={grupo.moeda} className="w-full space-y-2" aria-label="Saldo por membro">
              {grupo.saldos.map((saldo) => (
                <LinhaSaldo key={saldo.userId} saldo={saldo} moeda={grupo.moeda} />
              ))}
            </ul>
          ))}
        </CardContent>
      </Card>
    )
  }

  const mostrarMoeda = acerto.grupos.length > 1

  return (
    <div className="space-y-6">
      {acerto.tudoAcertado && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          Tudo acertado: ninguém deve nada a ninguém.
        </div>
      )}

      {acerto.despesasSemRateio > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {acerto.despesasSemRateio === 1
            ? "1 despesa sem divisão entre participantes não entra no acerto."
            : `${acerto.despesasSemRateio} despesas sem divisão entre participantes não entram no acerto.`}
        </div>
      )}

      {acerto.grupos.map((grupo) => (
        <GrupoAcerto key={grupo.moeda} grupo={grupo} mostrarMoeda={mostrarMoeda} />
      ))}
    </div>
  )
}
