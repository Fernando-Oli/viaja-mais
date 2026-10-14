"use client"

import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { cn } from "@/lib/utils"
import {
  ROTULO_TIPO_RATEIO,
  TIPOS_RATEIO,
  formatarCentavos,
  reaisParaCentavos,
  type AvaliacaoRateio,
  type ParticipanteFormulario,
  type TipoRateio,
} from "@/lib/finance/rateio"

/**
 * Escolha da forma de divisão de uma despesa e prévia da parte de cada um.
 *
 * Componente controlado: o estado vive na página, que também precisa da
 * avaliação para habilitar o envio. O cálculo vem de `lib/finance/rateio.ts`,
 * o mesmo que o servidor refaz ao gravar.
 *
 * @RF06.9 tipo de rateio: igual, por peso ou por valor exato
 * @RF06.10 valor devido por membro
 */

export interface MembroRateio {
  userId: string
  rotulo: string
  papel: "owner" | "member"
}

const DESCRICAO_TIPO: Record<TipoRateio, string> = {
  equal: "O total é dividido em partes iguais entre os selecionados.",
  weight: "Cada um paga proporcionalmente ao peso informado.",
  exact: "Informe quanto cada um paga. A soma precisa fechar com o total.",
}

interface Props {
  membros: MembroRateio[]
  moeda: string
  totalTexto: string
  tipo: TipoRateio
  participantes: ParticipanteFormulario[]
  avaliacao: AvaliacaoRateio
  desabilitado?: boolean
  onTipoChange: (tipo: TipoRateio) => void
  onParticipantesChange: (participantes: ParticipanteFormulario[]) => void
}

export function ExpenseSplit({
  membros,
  moeda,
  totalTexto,
  tipo,
  participantes,
  avaliacao,
  desabilitado = false,
  onTipoChange,
  onParticipantesChange,
}: Props) {
  const parteDe = new Map(avaliacao.partes.map((p) => [p.userId, p.centavos]))
  const invalidos = new Set(avaliacao.invalidos)
  const total = reaisParaCentavos(totalTexto)

  function alterar(userId: string, mudanca: Partial<ParticipanteFormulario>) {
    onParticipantesChange(participantes.map((p) => (p.userId === userId ? { ...p, ...mudanca } : p)))
  }

  return (
    <fieldset className="space-y-4" disabled={desabilitado} aria-describedby="rateio-status">
      <legend className="text-sm font-medium leading-none">Divisão da despesa</legend>

      <RadioGroup
        value={tipo}
        onValueChange={(v) => onTipoChange(v as TipoRateio)}
        className="grid gap-2 sm:grid-cols-3"
        aria-label="Forma de divisão"
      >
        {TIPOS_RATEIO.map((t) => (
          <Label
            key={t}
            htmlFor={`rateio-tipo-${t}`}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-lg border p-3 font-normal",
              tipo === t && "border-viaja-orange bg-orange-50",
            )}
          >
            <RadioGroupItem id={`rateio-tipo-${t}`} value={t} />
            {ROTULO_TIPO_RATEIO[t]}
          </Label>
        ))}
      </RadioGroup>
      <p className="text-sm text-slate-600">{DESCRICAO_TIPO[tipo]}</p>

      <ul className="space-y-2" aria-label="Participantes do rateio">
        {membros.map((membro) => {
          const estado = participantes.find((p) => p.userId === membro.userId)
          if (!estado) return null
          const parte = parteDe.get(membro.userId)
          const campoInvalido = invalidos.has(membro.userId)
          const idCheckbox = `rateio-participa-${membro.userId}`

          return (
            <li
              key={membro.userId}
              data-testid="participante-rateio"
              className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
            >
              {/* No mobile, nome e papel ocupam a linha inteira e o campo desce:
                  dividindo a linha com o campo, o nome sumia e o selo ficava
                  por baixo do input. */}
              <div className="flex min-w-0 basis-full items-center gap-3 sm:flex-1 sm:basis-auto">
                <Checkbox
                  id={idCheckbox}
                  checked={estado.selecionado}
                  onCheckedChange={(v) => alterar(membro.userId, { selecionado: v === true })}
                  aria-label={`Incluir ${membro.rotulo} no rateio`}
                />
                <Label htmlFor={idCheckbox} className="min-w-0 truncate font-medium text-viaja-navy">
                  {membro.rotulo}
                </Label>
                <Badge className="shrink-0" variant={membro.papel === "owner" ? "default" : "secondary"}>
                  {membro.papel === "owner" ? "Dono" : "Membro"}
                </Badge>
              </div>

              {tipo === "weight" && estado.selecionado && (
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  className="min-w-0 flex-1 sm:w-24 sm:flex-none"
                  aria-label={`Peso de ${membro.rotulo}`}
                  aria-invalid={campoInvalido}
                  value={estado.peso}
                  onChange={(e) => alterar(membro.userId, { peso: e.target.value })}
                />
              )}

              {tipo === "exact" && estado.selecionado && (
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  className="min-w-0 flex-1 sm:w-32 sm:flex-none"
                  aria-label={`Valor de ${membro.rotulo}`}
                  aria-invalid={campoInvalido}
                  value={estado.valor}
                  onChange={(e) => alterar(membro.userId, { valor: e.target.value })}
                />
              )}

              <span
                className="ml-auto w-28 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-900"
                data-testid="parte-rateio"
              >
                {estado.selecionado ? (parte !== undefined ? formatarCentavos(parte, moeda) : "—") : "Fora"}
              </span>
            </li>
          )
        })}
      </ul>

      <dl className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-slate-600">Total da despesa</dt>
          <dd className="font-semibold tabular-nums" data-testid="rateio-total">
            {total !== null ? formatarCentavos(total, moeda) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-600">Soma das partes</dt>
          <dd className="font-semibold tabular-nums" data-testid="rateio-soma">
            {formatarCentavos(avaliacao.somaCentavos, moeda)}
          </dd>
        </div>
        {tipo === "exact" && total !== null && (
          <div>
            <dt className="text-slate-600">{avaliacao.diferencaCentavos < 0 ? "Excedeu" : "Falta"}</dt>
            <dd
              className={cn(
                "font-semibold tabular-nums",
                avaliacao.diferencaCentavos === 0 ? "text-green-700" : "text-red-600",
              )}
              data-testid="rateio-diferenca"
            >
              {formatarCentavos(Math.abs(avaliacao.diferencaCentavos), moeda)}
            </dd>
          </div>
        )}
      </dl>

      <p
        id="rateio-status"
        role="status"
        aria-live="polite"
        className={cn("text-sm", avaliacao.valido ? "text-green-700" : "text-red-600")}
      >
        {avaliacao.valido ? "A soma das partes fecha com o total." : avaliacao.erro}
      </p>
    </fieldset>
  )
}
