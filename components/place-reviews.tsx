"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import ConfirmModal from "@/components/ui/confirm-modal"
import { useToast } from "@/hooks/use-toast"
import { Loader2, MessageSquare, Star } from "lucide-react"

interface Review {
  id: string
  user_id: string
  rating: number
  comment: string | null
  updated_at: string
  autor: string | null
  minha: boolean
}

interface Resumo {
  media: number | null
  total: number
}

interface PlaceReviewsProps {
  tripId: string
  placeId: string
  placeName: string
}

async function lerErro(resposta: Response, padrao: string) {
  const dados: { error?: string } = await resposta.json().catch(() => ({}))
  return dados.error || padrao
}

function Estrelas({ nota }: { nota: number }) {
  return (
    <span className="flex items-center gap-0.5 text-amber-500" aria-label={`${nota} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`h-3.5 w-3.5 ${n <= nota ? "fill-current" : "text-gray-300"}`} />
      ))}
    </span>
  )
}

/**
 * Avaliações de um lugar: média, lista e a avaliação de quem está vendo, com
 * editar e excluir. Toda leitura e escrita passa pela rota
 * `/api/trips/[tripId]/places/[placeId]/reviews`.
 *
 * As avaliações são do lugar do Google, não da viagem: quem salvou o mesmo
 * lugar em outra viagem também aparece aqui.
 *
 * @RF11.1 avaliar · @RF11.2 ver avaliações de outros · @RF11.3 editar/excluir a própria
 */
export function PlaceReviews({ tripId, placeId, placeName }: PlaceReviewsProps) {
  const { toast } = useToast()
  const url = `/api/trips/${tripId}/places/${placeId}/reviews`

  const [aberto, setAberto] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [resumo, setResumo] = useState<Resumo>({ media: null, total: 0 })
  const [nota, setNota] = useState(0)
  const [comentario, setComentario] = useState("")
  const [salvando, setSalvando] = useState(false)
  const [confirmarExclusao, setConfirmarExclusao] = useState(false)

  const minha = reviews.find((r) => r.minha)

  async function carregar() {
    setCarregando(true)
    setErro(null)
    try {
      const resposta = await fetch(url)
      if (!resposta.ok) throw new Error(await lerErro(resposta, "Erro ao carregar avaliações"))
      const dados: { reviews: Review[]; resumo: Resumo } = await resposta.json()
      setReviews(dados.reviews)
      setResumo(dados.resumo)
      const propria = dados.reviews.find((r) => r.minha)
      setNota(propria?.rating ?? 0)
      setComentario(propria?.comment ?? "")
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar avaliações")
    } finally {
      setCarregando(false)
    }
  }

  function alternar(novo: boolean) {
    setAberto(novo)
    if (novo) carregar()
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (nota < 1) return
    setSalvando(true)
    try {
      const resposta = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: nota, comment: comentario }),
      })
      if (!resposta.ok) throw new Error(await lerErro(resposta, "Erro ao salvar avaliação"))
      toast({ title: "Avaliação salva" })
      await carregar()
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : "Erro ao salvar avaliação"
      toast({ title: "Erro", description: mensagem, variant: "destructive" })
    } finally {
      setSalvando(false)
    }
  }

  async function excluir() {
    setConfirmarExclusao(false)
    setSalvando(true)
    try {
      const resposta = await fetch(url, { method: "DELETE" })
      if (!resposta.ok) throw new Error(await lerErro(resposta, "Erro ao excluir avaliação"))
      toast({ title: "Avaliação excluída" })
      await carregar()
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : "Erro ao excluir avaliação"
      toast({ title: "Erro", description: mensagem, variant: "destructive" })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <Dialog open={aberto} onOpenChange={alternar}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <MessageSquare className="mr-1 h-4 w-4" />
            Avaliações
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Avaliações · {placeName}</DialogTitle>
            <DialogDescription>
              {resumo.media === null
                ? "Nenhuma avaliação ainda"
                : `${resumo.media.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} (${resumo.total} ${
                    resumo.total === 1 ? "avaliação" : "avaliações"
                  })`}
            </DialogDescription>
          </DialogHeader>

          {carregando && reviews.length === 0 ? (
            <p className="flex items-center gap-2 py-6 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando avaliações...
            </p>
          ) : erro ? (
            <p role="alert" className="py-6 text-sm text-red-600">
              {erro}
            </p>
          ) : (
            <div className="space-y-5">
              <form onSubmit={salvar} className="space-y-3 rounded-lg border border-gray-200 p-3">
                <p className="text-sm font-medium text-viaja-navy">Sua avaliação</p>
                <div className="flex gap-1" role="group" aria-label="Nota">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-label={`${n} ${n === 1 ? "estrela" : "estrelas"}`}
                      aria-pressed={nota === n}
                      onClick={() => setNota(n)}
                      className="rounded p-1 text-amber-500 hover:bg-amber-50"
                    >
                      <Star className={`h-6 w-6 ${n <= nota ? "fill-current" : "text-gray-300"}`} />
                    </button>
                  ))}
                </div>
                <Textarea
                  aria-label="Comentário"
                  placeholder="Conte como foi (opcional)"
                  maxLength={1000}
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                />
                {nota < 1 && <p className="text-xs text-gray-500">Escolha uma nota de 1 a 5</p>}
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" size="sm" disabled={nota < 1 || salvando}>
                    {salvando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                    Salvar
                  </Button>
                  {minha && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={salvando}
                      onClick={() => setConfirmarExclusao(true)}
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      Excluir minha avaliação
                    </Button>
                  )}
                </div>
              </form>

              {reviews.length > 0 && (
                <ul className="space-y-3" aria-label="Avaliações do lugar">
                  {reviews.map((r) => (
                    <li key={r.id} className="border-b border-gray-100 pb-3 last:border-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-viaja-navy">
                          {r.autor || "Usuário"}
                          {r.minha && " (você)"}
                        </span>
                        <Estrelas nota={r.rating} />
                      </div>
                      {r.comment && <p className="mt-1 break-words text-sm text-gray-700">{r.comment}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={confirmarExclusao}
        onOpenChange={setConfirmarExclusao}
        title="Excluir avaliação"
        description={`Sua avaliação de "${placeName}" será excluída.`}
        confirmText="Excluir"
        variant="destructive"
        onConfirm={excluir}
      />
    </>
  )
}
