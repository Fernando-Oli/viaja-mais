"use client"

import { useEffect, useState, use } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { AcertoContas } from "@/components/acerto-contas"
import type { Acerto } from "@/lib/finance/acerto"

/**
 * Tela de acerto de contas da viagem. Busca o acerto pronto na API — que exige
 * participação no servidor e faz a conta com `lib/finance/` — e só exibe.
 * Feedback de erro por `toast()`, como a tela de nova despesa.
 *
 * @RF06.11 saldo por membro · @RF06.13 transferências sugeridas
 */

type Estado = { tipo: "carregando" } | { tipo: "erro" } | { tipo: "pronto"; acerto: Acerto }

async function buscarAcerto(tripId: string): Promise<Acerto> {
  const resposta = await fetch(`/api/trips/${tripId}/acerto`)
  const dados = (await resposta.json().catch(() => null)) as Acerto | null
  if (!resposta.ok || !dados?.grupos) throw new Error("Falha ao carregar o acerto de contas")
  return dados
}

export default function AcertoContasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { toast } = useToast()
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" })

  // `tentativa` existe para o botão "Tentar novamente" disparar a busca outra vez.
  const [tentativa, setTentativa] = useState(0)

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

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" asChild className="mb-4">
          <Link href={`/dashboard/trips/${id}?aba=despesas`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar para a viagem
          </Link>
        </Button>
        <h1 className="text-3xl font-bold text-slate-900">Acerto de contas</h1>
        <p className="mt-2 text-slate-600">Quanto cada um tem a receber ou deve, e quem paga quem</p>
      </div>

      {estado.tipo === "carregando" && (
        <div role="status" className="flex items-center gap-2 rounded-lg border p-4 text-sm text-slate-600">
          <Spinner />
          Carregando acerto de contas...
        </div>
      )}

      {estado.tipo === "erro" && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <span className="flex-1">Não foi possível carregar o acerto de contas.</span>
          <Button type="button" variant="outline" size="sm" onClick={tentarDeNovo}>
            Tentar novamente
          </Button>
        </div>
      )}

      {estado.tipo === "pronto" && <AcertoContas acerto={estado.acerto} tripId={id} />}
    </div>
  )
}
