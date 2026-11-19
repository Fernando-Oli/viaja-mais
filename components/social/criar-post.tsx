"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, ImagePlus, Loader2, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import ConfirmModal from "@/components/ui/confirm-modal"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { TIPOS_FOTO } from "@/lib/social/foto"
import { cn } from "@/lib/utils"
import { acrescentarFotos, avisoDaEscolha } from "./criar-post-fotos"
import { MarcarPessoas, escFechaSoALista } from "./marcar-pessoas"
import { PostCarrossel } from "./post-carrossel"
import {
  LIMITE_LEGENDA_POST,
  MAXIMO_FOTOS,
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
 * "Criar" (redesenho do post de 18/11, modelo do Instagram): o botão e o
 * diálogo em dois passos.
 *
 * 1. **Fotos**: de 1 a 3, JPEG, PNG ou WebP, até 2 MB cada, na ordem em que
 *    foram escolhidas (criar-post-fotos.ts). Escolher de novo acrescenta; cada
 *    foto pode ser removida. Prévia no carrossel do post.
 * 2. **Legenda** (opcional, até 280) e **Marcar pessoas** (até 20).
 *
 * "Compartilhar" envia tudo de uma vez: POST /api/social/posts em multipart
 * (`fotos`, na ordem; `legenda`; `marcados` como JSON de ids). A rota reprocessa
 * cada foto no servidor (tira EXIF/GPS) e é quem decide; a conferência daqui só
 * avisa cedo. Publicado, `router.refresh()` e o detalhe do post (/feed/<id>).
 * Nenhum client do Supabase aqui (regra 1 do CLAUDE.md).
 *
 * Fechar com fotos escolhidas pede confirmação (`ConfirmModal`), como o
 * "Descartar publicação?" do Instagram. Durante o envio, nada fecha e os
 * controles ficam desabilitados.
 *
 * @RF09.15 post com fotos — criar com 1 a 3 fotos, legenda e marcações
 * @RF09.13 marcar pessoas
 */

const TIPOS_ACEITOS = TIPOS_FOTO.join(",")

type FotoEscolhida = { chave: string; arquivo: File; url: string }
type Bloqueio = "sessao" | "sem_username"

let contador = 0
function novaChave() {
  contador += 1
  return `foto-${contador}`
}

function urlDePrevia(arquivo: File) {
  return typeof URL.createObjectURL === "function" ? URL.createObjectURL(arquivo) : ""
}

function liberar(url: string) {
  if (url && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url)
}

export function BotaoCriarPost({ className }: { className?: string }) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <Button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setAberto(true)}
        className={cn("h-11 rounded-xl bg-citrico px-4 text-grafite hover:bg-citrico/90", className)}
      >
        <Plus className="h-4 w-4" aria-hidden />
        Criar
      </Button>
      {aberto && <CriarPostDialogo aoFechar={() => setAberto(false)} />}
    </>
  )
}

/** O diálogo do "Criar". Montado só enquanto aberto: fechar descarta tudo (e libera as prévias). */
export function CriarPostDialogo({ aoFechar }: { aoFechar: () => void }) {
  const router = useRouter()
  const { toast } = useToast()
  const [passo, setPasso] = useState<1 | 2>(1)
  const [fotos, setFotos] = useState<FotoEscolhida[]>([])
  const [legenda, setLegenda] = useState("")
  const [marcados, setMarcados] = useState<PessoaNoPost[]>([])
  const [recusados, setRecusados] = useState<string[]>([])
  const [enviando, setEnviando] = useState(false)
  const [bloqueio, setBloqueio] = useState<Bloqueio | null>(null)
  const [confirmarDescarte, setConfirmarDescarte] = useState(false)

  const arquivo = useRef<HTMLInputElement>(null)
  const urls = useRef<string[]>([])
  useEffect(() => {
    urls.current = fotos.map((f) => f.url)
  }, [fotos])

  // Ao desmontar (fechou ou publicou), as URLs blob: de prévia são liberadas.
  useEffect(() => () => urls.current.forEach(liberar), [])

  function escolher(lista: FileList | null) {
    const escolhidos = lista ? Array.from(lista) : []
    if (arquivo.current) arquivo.current.value = ""
    if (escolhidos.length === 0) return
    const resultado = acrescentarFotos(fotos, escolhidos, (a) => ({ chave: novaChave(), arquivo: a, url: urlDePrevia(a) }))
    setFotos(resultado.fotos)
    const aviso = avisoDaEscolha(resultado)
    if (aviso) {
      toast({
        variant: resultado.recusados.length > 0 ? "destructive" : undefined,
        title: resultado.recusados.length > 0 ? "Alguma foto não foi aceita" : "Limite de fotos",
        description: aviso,
      })
    }
  }

  function removerFoto(chave: string) {
    const saiu = fotos.find((f) => f.chave === chave)
    if (saiu) liberar(saiu.url)
    setFotos(fotos.filter((f) => f.chave !== chave))
  }

  function pedirFechar(abrir: boolean) {
    if (abrir || enviando) return
    if (fotos.length > 0) {
      setConfirmarDescarte(true)
      return
    }
    aoFechar()
  }

  async function tratarFalha(r: Response) {
    const corpo = (await r.json().catch(() => ({}))) as CorpoDeErro
    const mensagem = mensagemDoServidor(corpo)
    if (r.status === 401) {
      setBloqueio("sessao")
      toast({ variant: "destructive", title: "Sua sessão expirou", description: "Entre de novo para publicar." })
      return
    }
    if (r.status === 403 && corpo.codigo === "sem_username") {
      setBloqueio("sem_username")
      toast({ title: "Escolha um nome de usuário", description: "Publicar exige um nome de usuário." })
      return
    }
    if (r.status === 400 && corpo.codigo === "marcado_recusou") {
      // Quem recusou sai da seleção e fica desabilitado na busca; o diálogo continua aberto.
      const resultado = aplicarRecusa(marcados, recusados, idsRecusados(corpo.recusados))
      setMarcados(resultado.selecionados)
      setRecusados(resultado.recusados)
      toast({ variant: "destructive", title: "Alguém removeu a própria marcação", description: avisoDeRecusa(resultado.quem) })
      return
    }
    if (r.status === 400 && corpo.codigo === "marcado_invalido") {
      toast({
        variant: "destructive",
        title: "Alguém não pode ser marcado",
        description: mensagem ?? "Tire essa pessoa das marcações e tente de novo.",
      })
      return
    }
    if (r.status === 413) {
      toast({
        variant: "destructive",
        title: "Fotos grandes demais",
        description: mensagem ?? "Cada foto pode ter até 2 MB.",
      })
      return
    }
    if (r.status === 429) {
      toast({
        variant: "destructive",
        title: "Muitos envios seguidos",
        description: mensagem ?? "Aguarde um pouco e tente de novo.",
      })
      return
    }
    if (r.status === 400) {
      toast({
        variant: "destructive",
        title: "Confira a publicação",
        description: mensagem ?? "Algum campo não foi aceito. Revise e tente de novo.",
      })
      return
    }
    toast({ variant: "destructive", title: "Não foi possível publicar", description: "Tente de novo em instantes." })
  }

  async function compartilhar() {
    if (fotos.length === 0 || enviando) return
    const form = new FormData()
    for (const f of fotos) form.append("fotos", f.arquivo, f.arquivo.name)
    const texto = legenda.trim()
    if (texto !== "") form.append("legenda", texto)
    if (marcados.length > 0) form.append("marcados", JSON.stringify(marcados.map((p) => p.id.toLowerCase())))

    setEnviando(true)
    try {
      const r = await fetch("/api/social/posts", { method: "POST", body: form })
      if (!r.ok) {
        await tratarFalha(r)
        return
      }
      const { post } = (await r.json()) as { post: PostVisto }
      toast({ title: "Publicação compartilhada", description: "Já aparece no seu perfil e para quem segue você." })
      aoFechar()
      router.refresh()
      router.push(`/feed/${encodeURIComponent(post.id)}`)
    } catch {
      toast({
        variant: "destructive",
        title: "Sem conexão com o servidor",
        description: "Verifique a conexão e tente de novo. Nada foi publicado.",
      })
    } finally {
      setEnviando(false)
    }
  }

  const total = fotos.length
  const cabem = MAXIMO_FOTOS - total
  const previa = fotos.map((f, i) => ({ src: f.url, alt: `Foto ${i + 1} de ${total} escolhida` }))

  return (
    <>
      <Dialog open onOpenChange={pedirFechar}>
        <DialogContent
          aria-busy={enviando}
          onEscapeKeyDown={escFechaSoALista}
          className="max-h-[92dvh] max-w-[calc(100%-1rem)] overflow-y-auto rounded-3xl p-4 sm:max-w-lg sm:p-6"
        >
          <DialogHeader>
            <DialogTitle className="text-2xl">{passo === 1 ? "Criar publicação" : "Legenda e marcações"}</DialogTitle>
            <DialogDescription>
              {passo === 1
                ? `Escolha de 1 a ${MAXIMO_FOTOS} fotos. JPEG, PNG ou WebP, até 2 MB cada.`
                : "Opcional: conte algo e marque quem estava com você."}
            </DialogDescription>
          </DialogHeader>

          {bloqueio && <AvisoDeBloqueio bloqueio={bloqueio} />}

          <input
            ref={arquivo}
            type="file"
            multiple
            accept={TIPOS_ACEITOS}
            className="sr-only"
            tabIndex={-1}
            aria-label="Selecionar fotos"
            data-testid="criar-post-arquivo"
            onChange={(e) => escolher(e.target.files)}
          />

          {passo === 1 ? (
            <div className="space-y-4">
              {total === 0 ? (
                <button
                  type="button"
                  onClick={() => arquivo.current?.click()}
                  className="flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-muted/40 p-6 text-center hover:bg-muted"
                >
                  <ImagePlus className="h-10 w-10 text-muted-foreground" aria-hidden />
                  <span className="text-base font-semibold">Selecionar fotos do dispositivo</span>
                  <span className="text-xs text-muted-foreground">Até {MAXIMO_FOTOS}, na ordem em que você escolher.</span>
                </button>
              ) : (
                <>
                  <PostCarrossel fotos={previa} rotulo="Prévia das fotos" className="aspect-square w-full rounded-2xl" />
                  <ol aria-label="Fotos escolhidas, na ordem do carrossel" className="flex flex-wrap items-center gap-3">
                    {fotos.map((f, i) => (
                      <li key={f.chave} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:) */}
                        <img
                          src={f.url}
                          alt={`Foto ${i + 1}: ${f.arquivo.name}`}
                          className="h-20 w-20 rounded-xl border border-border object-cover"
                        />
                        <span
                          aria-hidden
                          className="absolute bottom-1 left-1 rounded-full bg-grafite/75 px-1.5 text-xs font-semibold text-white"
                        >
                          {i + 1}
                        </span>
                        <button
                          type="button"
                          aria-label={`Remover a foto ${i + 1}`}
                          onClick={() => removerFoto(f.chave)}
                          className="absolute -top-2 -right-2 inline-flex h-11 w-11 items-center justify-center rounded-full"
                        >
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-grafite text-white shadow">
                            <X className="h-4 w-4" aria-hidden />
                          </span>
                        </button>
                      </li>
                    ))}
                    {cabem > 0 && (
                      <li>
                        <button
                          type="button"
                          onClick={() => arquivo.current?.click()}
                          className="inline-flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border text-xs font-medium text-muted-foreground hover:bg-muted"
                        >
                          <Plus className="h-5 w-5" aria-hidden />
                          Adicionar
                        </button>
                      </li>
                    )}
                  </ol>
                  <p className="text-xs text-muted-foreground" role="status">
                    {total} de {MAXIMO_FOTOS} fotos{cabem === 0 ? " — limite atingido" : ""}.
                  </p>
                </>
              )}
            </div>
          ) : (
            <fieldset disabled={enviando} className="min-w-0 space-y-5">
              <legend className="sr-only">Legenda e marcações</legend>
              <div className="flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:) */}
                <img
                  src={fotos[0]?.url}
                  alt={total > 1 ? `Primeira de ${total} fotos` : "Foto escolhida"}
                  className="h-16 w-16 shrink-0 rounded-xl border border-border object-cover"
                />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex justify-between gap-2">
                    <Label htmlFor="criar-post-legenda">Legenda</Label>
                    <span id="criar-post-legenda-contador" className="text-xs font-medium text-muted-foreground">
                      {legenda.length} de {LIMITE_LEGENDA_POST}
                    </span>
                  </div>
                  <Textarea
                    id="criar-post-legenda"
                    maxLength={LIMITE_LEGENDA_POST}
                    value={legenda}
                    onChange={(e) => setLegenda(e.target.value)}
                    aria-describedby="criar-post-legenda-contador"
                    placeholder="Escreva uma legenda…"
                    className="min-h-24 rounded-xl"
                  />
                </div>
              </div>
              <MarcarPessoas
                selecionados={marcados}
                aoMudar={setMarcados}
                recusados={recusados}
                maximo={MAXIMO_MARCADOS}
                desabilitado={enviando}
              />
            </fieldset>
          )}

          <DialogFooter className="gap-3 sm:justify-between">
            {passo === 2 ? (
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-xl"
                disabled={enviando}
                onClick={() => setPasso(1)}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Voltar
              </Button>
            ) : (
              <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => pedirFechar(false)}>
                Cancelar
              </Button>
            )}
            {passo === 1 ? (
              <Button
                type="button"
                className="h-11 rounded-xl px-6"
                disabled={total === 0}
                onClick={() => setPasso(2)}
              >
                Avançar
              </Button>
            ) : (
              <Button
                type="button"
                className="h-11 rounded-xl bg-citrico px-6 text-grafite hover:bg-citrico/90"
                disabled={enviando || total === 0}
                onClick={() => void compartilhar()}
              >
                {enviando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {enviando ? "Compartilhando…" : "Compartilhar"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={confirmarDescarte}
        onOpenChange={setConfirmarDescarte}
        title="Descartar publicação?"
        description="As fotos escolhidas, a legenda e as marcações não serão salvas."
        confirmText="Descartar"
        cancelText="Continuar editando"
        variant="destructive"
        onConfirm={() => {
          setConfirmarDescarte(false)
          aoFechar()
        }}
      />
    </>
  )
}

function AvisoDeBloqueio({ bloqueio }: { bloqueio: Bloqueio }) {
  if (bloqueio === "sessao") {
    return (
      <div role="alert" className="space-y-2 rounded-2xl border border-destructive/40 p-3 text-sm text-destructive">
        <p>Sua sessão expirou. As fotos continuam aqui até você fechar.</p>
        <Button asChild variant="outline" size="sm" className="h-11 rounded-xl">
          <Link href="/auth/login">Entrar de novo</Link>
        </Button>
      </div>
    )
  }
  return (
    <div role="alert" className="space-y-2 rounded-2xl border border-border p-3 text-sm">
      <p>Para publicar, escolha antes um nome de usuário.</p>
      <Button asChild variant="outline" size="sm" className="h-11 rounded-xl">
        <Link href="/dashboard/perfil">Escolher nome de usuário</Link>
      </Button>
    </div>
  )
}
