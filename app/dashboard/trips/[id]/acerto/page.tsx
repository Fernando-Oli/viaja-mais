"use client"

import { useEffect, useState, use } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { AcertoContas } from "@/components/acerto-contas"
import { RegistrarPagamento, type PagamentoEmEdicao } from "@/components/registrar-pagamento"
import type { Acerto, TransferenciaAcerto } from "@/lib/finance/acerto"

/**
 * Tela de acerto de contas da viagem. Busca o acerto pronto na API — que exige
 * participação no servidor e faz a conta com `lib/finance/` — e só exibe.
 * Feedback de erro por `toast()`, como a tela de nova despesa.
 *
 * Registrar pagamento (S08): o pagador confirma o valor, a tela envia para
 * `POST /api/trips/[tripId]/acerto/transferencias` e, com sucesso, busca o
 * acerto de novo — o saldo novo vem do servidor, a tela não desconta nada.
 *
 * @RF06.11 saldo por membro · @RF06.13 transferências sugeridas e registro de pagamento
 */

type Estado = { tipo: "carregando" } | { tipo: "erro" } | { tipo: "pronto"; acerto: Acerto }

async function buscarAcerto(tripId: string): Promise<Acerto> {
  const resposta = await fetch(`/api/trips/${tripId}/acerto`)
  const dados = (await resposta.json().catch(() => null)) as Acerto | null
  if (!resposta.ok || !dados?.grupos) throw new Error("Falha ao carregar o acerto de contas")
  return dados
}

/** Pagamento aberto no diálogo, com a chave de idempotência desta tentativa. */
type PagamentoAberto = PagamentoEmEdicao & { chave: string }

export default function AcertoContasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { toast } = useToast()
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" })

  // `tentativa` existe para o botão "Tentar novamente" — e o registro de um
  // pagamento — dispararem a busca outra vez.
  const [tentativa, setTentativa] = useState(0)

  const [pagamento, setPagamento] = useState<PagamentoAberto | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let ativo = true
    buscarAcerto(id).then(
      (acerto) => {
        if (ativo) setEstado({ tipo: "pronto", acerto })
      },
      () => {
        if (!ativo) return
        setEstado({ tipo: "erro" })
        toast({
          title: "Erro",
          description: "Não foi possível carregar o acerto de contas",
          variant: "destructive",
        })
      },
    )
    return () => {
      ativo = false
    }
  }, [id, tentativa, toast])

  function tentarDeNovo() {
    setEstado({ tipo: "carregando" })
    setTentativa((n) => n + 1)
  }

  function abrirPagamento(transferencia: TransferenciaAcerto, moeda: string) {
    // Uma chave por abertura: reenviar depois de um erro usa a mesma, e o
    // servidor não grava o mesmo pagamento duas vezes.
    setPagamento({ transferencia, moeda, chave: crypto.randomUUID() })
  }

  async function confirmarPagamento(valorTexto: string) {
    if (!pagamento || enviando) return
    setEnviando(true)
    try {
      const resposta = await fetch(`/api/trips/${id}/acerto/transferencias`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          de: pagamento.transferencia.de.userId,
          para: pagamento.transferencia.para.userId,
          valor: valorTexto,
          moeda: pagamento.moeda,
          chave: pagamento.chave,
        }),
      })
      const corpo = (await resposta.json().catch(() => null)) as { error?: string } | null

      if (!resposta.ok) {
        // A mensagem da rota é segura para exibir: erro interno já chega genérico.
        toast({
          title: "Erro",
          description: corpo?.error ?? "Não foi possível registrar o pagamento",
          variant: "destructive",
        })
        return
      }

      toast({ title: "Pagamento registrado", description: "O acerto de contas foi atualizado." })
      setPagamento(null)
      setTentativa((n) => n + 1)
    } catch {
      toast({ title: "Erro", description: "Não foi possível registrar o pagamento", variant: "destructive" })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Button variant="link" asChild className="mb-2 h-auto px-0">
          <Link href={`/dashboard/trips/${id}?aba=despesas`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar para a viagem
          </Link>
        </Button>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Acerto de contas</h1>
        <p className="mt-2 text-muted-foreground">Quanto cada um tem a receber ou deve, e quem paga quem</p>
      </div>

      {estado.tipo === "carregando" && (
        <div role="status" className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
          <Spinner />
          Carregando acerto de contas...
        </div>
      )}

      {estado.tipo === "erro" && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          <span className="flex-1">Não foi possível carregar o acerto de contas.</span>
          <Button type="button" variant="outline" size="sm" onClick={tentarDeNovo}>
            Tentar novamente
          </Button>
        </div>
      )}

      {estado.tipo === "pronto" && (
        <AcertoContas acerto={estado.acerto} tripId={id} onRegistrarPagamento={abrirPagamento} />
      )}

      <RegistrarPagamento
        pagamento={pagamento}
        enviando={enviando}
        onConfirmar={confirmarPagamento}
        onCancelar={() => setPagamento(null)}
      />
    </div>
  )
}
