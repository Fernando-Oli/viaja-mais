"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { paraCentavos } from "@/lib/finance/balances"
import { formatarCentavos, reaisParaCentavos } from "@/lib/finance/rateio"
import type { TransferenciaAcerto } from "@/lib/finance/acerto"

/**
 * Confirmação do registro de um pagamento do acerto de contas.
 *
 * O valor chega preenchido com o da transferência sugerida; trocar por um
 * valor menor registra um pagamento parcial. O limite de verdade (a dívida do
 * pagador e o crédito do recebedor) é conferido no servidor — aqui só se
 * barra o que não é valor monetário, para não enviar à toa.
 *
 * Enquanto envia, nada fecha nem reenvia: os botões ficam desabilitados e o
 * diálogo ignora o Esc e o clique fora.
 *
 * @RF06.13 registrar como paga uma transferência do acerto
 */

export interface PagamentoEmEdicao {
  transferencia: TransferenciaAcerto
  moeda: string
}

/** Valor sugerido como o campo mostra: "15,00". */
function valorInicial(valor: number) {
  return (paraCentavos(valor) / 100).toFixed(2).replace(".", ",")
}

export function RegistrarPagamento({
  pagamento,
  enviando,
  onConfirmar,
  onCancelar,
}: {
  pagamento: PagamentoEmEdicao | null
  enviando: boolean
  onConfirmar: (valorTexto: string) => void
  onCancelar: () => void
}) {
  return (
    <Dialog open={pagamento !== null} onOpenChange={(aberto) => !aberto && !enviando && onCancelar()}>
      {/* O formulário só existe com o diálogo aberto: cada abertura começa do valor sugerido. */}
      {pagamento && (
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
          <FormularioPagamento
            pagamento={pagamento}
            enviando={enviando}
            onConfirmar={onConfirmar}
            onCancelar={onCancelar}
          />
        </DialogContent>
      )}
    </Dialog>
  )
}

function FormularioPagamento({
  pagamento,
  enviando,
  onConfirmar,
  onCancelar,
}: {
  pagamento: PagamentoEmEdicao
  enviando: boolean
  onConfirmar: (valorTexto: string) => void
  onCancelar: () => void
}) {
  const [valor, setValor] = useState(() => valorInicial(pagamento.transferencia.valor))
  const [tocado, setTocado] = useState(false)

  const centavos = reaisParaCentavos(valor)
  const valido = centavos !== null && centavos > 0
  const moeda = pagamento.moeda

  function confirmar(evento: React.FormEvent) {
    evento.preventDefault()
    setTocado(true)
    if (!valido || enviando) return
    onConfirmar(valor)
  }

  return (
    <form onSubmit={confirmar} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Registrar pagamento</DialogTitle>
        <DialogDescription>
          Confirme quanto você já pagou para {pagamento.transferencia.para.rotulo}. O valor sugerido é{" "}
          {formatarCentavos(paraCentavos(pagamento.transferencia.valor), moeda)}; um valor menor registra um pagamento
          parcial. O registro não pode ser desfeito.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <Label htmlFor="valor-pagamento">Valor pago ({moeda})</Label>
        <Input
          id="valor-pagamento"
          inputMode="decimal"
          autoComplete="off"
          value={valor}
          disabled={enviando}
          aria-invalid={tocado && !valido}
          aria-describedby={tocado && !valido ? "erro-valor-pagamento" : undefined}
          onChange={(e) => setValor(e.target.value)}
        />
        {tocado && !valido && (
          <p id="erro-valor-pagamento" className="text-sm text-destructive">
            Informe um valor maior que zero, com até duas casas.
          </p>
        )}
      </div>

      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </Button>
        <Button type="submit" disabled={enviando} className="bg-primary hover:bg-primary/90">
          {enviando ? "Registrando..." : "Confirmar pagamento"}
        </Button>
      </DialogFooter>
    </form>
  )
}
