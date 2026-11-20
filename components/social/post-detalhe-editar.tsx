"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { MarcarPessoas, escFechaSoALista } from "./marcar-pessoas"
import {
  LIMITE_LEGENDA_POST,
  MAXIMO_MARCADOS,
  aplicarRecusa,
  avisoDeRecusa,
  idsRecusados,
  mensagemDoServidor,
  type CorpoDeErro,
  type PessoaNoPost,
  type PostVisto,
} from "./post-detalhe-modelo"

/**
 * "Editar legenda e marcações" de um post já publicado, como no Instagram: as
 * fotos não mudam (no post de viagem, elas se trocam pelo diálogo de
 * gerenciar da viagem). PATCH /api/social/posts/[postId] com JSON
 * `{ legenda, marcados }`, campo a campo; a resposta é o post atualizado.
 *
 * Quem removeu a própria marcação não pode ser marcado de novo: os
 * `recusados` vêm do GET do detalhe (só para a autora) e aparecem
 * desabilitados na busca. Se alguém recusar com o diálogo aberto, o 400
 * `marcado_recusou` traz os ids: a pessoa sai da seleção, entra nos recusados
 * (`aoRecusar`, para o detalhe guardar) e o `toast` diz quem.
 *
 * @RF09.15 post com fotos — editar legenda e marcações · @RF09.13 marcar pessoas
 */

export function EditarPostDialogo({
  post,
  recusados = [],
  aoRecusar,
  aoFechar,
  aoSalvar,
  aoSumir,
}: {
  post: PostVisto
  /** Ids de quem removeu a própria marcação neste post. */
  recusados?: string[]
  /** A lista de recusados mudou (depois de um 400 `marcado_recusou`). */
  aoRecusar?: (recusados: string[]) => void
  aoFechar: () => void
  aoSalvar: (post: PostVisto) => void
  /** O post não existe mais (404): o detalhe passa a "não disponível". */
  aoSumir: () => void
}) {
  const { toast } = useToast()
  const [legenda, setLegenda] = useState(post.caption ?? "")
  const [marcados, setMarcados] = useState<PessoaNoPost[]>(post.marcados)
  const [barrados, setBarrados] = useState<string[]>(recusados)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    const texto = legenda.trim()
    setSalvando(true)
    try {
      const r = await fetch(`/api/social/posts/${encodeURIComponent(post.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legenda: texto === "" ? null : texto, marcados: marcados.map((p) => p.id.toLowerCase()) }),
      })
      if (r.ok) {
        const { post: atualizado } = (await r.json()) as { post: PostVisto }
        toast({ title: "Publicação atualizada" })
        aoSalvar(atualizado)
        return
      }
      const corpo = (await r.json().catch(() => ({}))) as CorpoDeErro
      const mensagem = mensagemDoServidor(corpo)
      if (r.status === 401) {
        toast({ variant: "destructive", title: "Sua sessão expirou", description: "Entre de novo para salvar." })
      } else if (r.status === 404) {
        toast({ title: "A publicação não existe mais", description: "Ela foi excluída em outra aba." })
        aoSumir()
      } else if (r.status === 403) {
        toast({ variant: "destructive", title: "Sem permissão", description: "Só quem publicou pode editar." })
      } else if (r.status === 405) {
        toast({ title: "Editar ainda não está disponível", description: "Por enquanto, dá para excluir e publicar de novo." })
      } else if (r.status === 400 && corpo.codigo === "marcado_recusou") {
        const resultado = aplicarRecusa(marcados, barrados, idsRecusados(corpo.recusados))
        setMarcados(resultado.selecionados)
        setBarrados(resultado.recusados)
        aoRecusar?.(resultado.recusados)
        toast({ variant: "destructive", title: "Alguém removeu a própria marcação", description: avisoDeRecusa(resultado.quem) })
      } else if (r.status === 400) {
        toast({
          variant: "destructive",
          title: "Confira os dados",
          description: mensagem ?? "Algum campo não foi aceito. Revise e tente de novo.",
        })
      } else {
        toast({ variant: "destructive", title: "Não foi possível salvar", description: "Tente de novo em instantes." })
      }
    } catch {
      toast({ variant: "destructive", title: "Sem conexão com o servidor", description: "Verifique a conexão e tente de novo." })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(abrir) => !abrir && !salvando && aoFechar()}>
      <DialogContent
        aria-busy={salvando}
        onEscapeKeyDown={escFechaSoALista}
        className="max-h-[92dvh] max-w-[calc(100%-1rem)] overflow-y-auto rounded-3xl p-4 sm:max-w-lg sm:p-6"
      >
        <DialogHeader>
          <DialogTitle className="text-2xl">Editar publicação</DialogTitle>
          <DialogDescription>A legenda e as marcações mudam; as fotos ficam como estão.</DialogDescription>
        </DialogHeader>
        <fieldset disabled={salvando} className="min-w-0 space-y-5">
          <legend className="sr-only">Legenda e marcações</legend>
          <div className="space-y-1.5">
            <div className="flex justify-between gap-2">
              <Label htmlFor="editar-post-legenda">Legenda</Label>
              <span id="editar-post-legenda-contador" className="text-xs font-medium text-muted-foreground">
                {legenda.length} de {LIMITE_LEGENDA_POST}
              </span>
            </div>
            <Textarea
              id="editar-post-legenda"
              maxLength={LIMITE_LEGENDA_POST}
              value={legenda}
              onChange={(e) => setLegenda(e.target.value)}
              aria-describedby="editar-post-legenda-contador"
              className="min-h-24 rounded-xl"
            />
          </div>
          <MarcarPessoas
            selecionados={marcados}
            aoMudar={setMarcados}
            recusados={barrados}
            maximo={MAXIMO_MARCADOS}
            desabilitado={salvando}
          />
        </fieldset>
        <DialogFooter className="gap-3">
          <Button type="button" variant="outline" className="h-11 rounded-xl" disabled={salvando} onClick={aoFechar}>
            Cancelar
          </Button>
          <Button
            type="button"
            className="h-11 rounded-xl bg-citrico px-6 text-grafite hover:bg-citrico/90"
            disabled={salvando}
            onClick={() => void salvar()}
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
