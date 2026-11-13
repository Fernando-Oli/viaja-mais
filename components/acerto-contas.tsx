import Link from "next/link"
import { ArrowRight, CheckCircle2, Info } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { paraCentavos } from "@/lib/finance/balances"
import { formatarCentavos } from "@/lib/finance/rateio"
import type { Acerto, GrupoMoeda, PapelAcerto, SaldoAcerto, TransferenciaAcerto } from "@/lib/finance/acerto"

/**
 * Apresentação do acerto de contas. Não calcula nada: saldos e transferências
 * chegam prontos de `GET /api/trips/[tripId]/acerto`, que usa `lib/finance/`.
 *
 * O estado de cada saldo é dito em texto ("a receber", "deve", "quite") além
 * da cor: cor sozinha não chega a quem não distingue verde de vermelho.
 *
 * "Registrar pagamento" só aparece nas transferências que saem de quem
 * consulta: só o próprio pagador registra (a rota e a RLS exigem o mesmo).
 *
 * @RF06.11 saldo por membro · @RF06.13 transferências sugeridas e registro de pagamento
 */

type AoRegistrar = (transferencia: TransferenciaAcerto, moeda: string) => void

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
      ? { texto: "a receber", cor: "text-primary" }
      : centavos < 0
        ? { texto: "deve", cor: "text-destructive" }
        : { texto: "quite", cor: "text-muted-foreground" }

  return (
    <li
      data-testid="saldo-membro"
      className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {/* Os espaços não aparecem no flex, mas separam as palavras para leitor de tela. */}
        <span className="font-medium text-foreground">{saldo.rotulo}</span>{" "}
        <Badge variant={saldo.papel === "owner" ? "default" : "secondary"}>{ROTULO_PAPEL[saldo.papel]}</Badge>
      </div>{" "}
      <p className={`text-sm font-semibold break-words ${estado.cor}`}>
        <span className="font-normal">{estado.texto}</span> {formatar(saldo.valor, moeda)}
      </p>
    </li>
  )
}

function GrupoAcerto({
  grupo,
  mostrarMoeda,
  usuarioAtualId,
  onRegistrarPagamento,
}: {
  grupo: GrupoMoeda
  mostrarMoeda: boolean
  usuarioAtualId?: string
  onRegistrarPagamento?: AoRegistrar
}) {
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
            <p className="text-sm text-muted-foreground">Nenhuma transferência necessária nesta moeda.</p>
          ) : (
            <ul className="space-y-2" aria-label="Transferências sugeridas">
              {grupo.transferencias.map((t) => (
                <li
                  key={`${t.de.userId}-${t.para.userId}`}
                  data-testid="linha-transferencia"
                  className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-2">
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <p data-testid="transferencia" className="min-w-0 break-words">
                      <span className="font-medium text-foreground">{t.de.rotulo}</span> paga{" "}
                      <span className="font-semibold">{formatar(t.valor, grupo.moeda)}</span> para{" "}
                      <span className="font-medium text-foreground">{t.para.rotulo}</span>
                    </p>
                  </div>
                  {onRegistrarPagamento && usuarioAtualId && t.de.userId === usuarioAtualId && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full shrink-0 sm:w-auto"
                      onClick={() => onRegistrarPagamento(t, grupo.moeda)}
                    >
                      Registrar pagamento
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export function AcertoContas({
  acerto,
  tripId,
  onRegistrarPagamento,
}: {
  acerto: Acerto
  tripId: string
  onRegistrarPagamento?: AoRegistrar
}) {
  if (acerto.totalDespesas === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 py-6">
          <p className="text-foreground">Nenhuma despesa lançada nesta viagem ainda.</p>
          <Button asChild className="bg-primary hover:bg-primary/90">
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
          className="flex items-center gap-2 rounded-2xl bg-citrico p-4 text-sm text-grafite"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          Tudo acertado: ninguém deve nada a ninguém.
        </div>
      )}

      {acerto.despesasSemRateio > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted p-4 text-sm text-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {acerto.despesasSemRateio === 1
            ? "1 despesa sem divisão entre participantes não entra no acerto."
            : `${acerto.despesasSemRateio} despesas sem divisão entre participantes não entram no acerto.`}
        </div>
      )}

      {acerto.grupos.map((grupo) => (
        <GrupoAcerto
          key={grupo.moeda}
          grupo={grupo}
          mostrarMoeda={mostrarMoeda}
          usuarioAtualId={acerto.usuarioAtualId}
          onRegistrarPagamento={onRegistrarPagamento}
        />
      ))}
    </div>
  )
}
