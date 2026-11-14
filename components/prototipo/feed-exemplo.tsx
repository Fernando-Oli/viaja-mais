"use client"

import { useState } from "react"
import Link from "next/link"
import { Bookmark, ChevronRight, Heart, MessageCircle, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { CapaViagem } from "@/components/brand/capa-viagem"
import { SeloPrevia } from "@/components/prototipo/selo-previa"
import { cn } from "@/lib/utils"

/**
 * PRÉVIA VISUAL do feed (S07-M-feed, do Micael). As publicações abaixo são
 * dados de exemplo fixos: curtir, salvar e comentar funcionam só nesta tela,
 * sem gravar. Quando trip_posts e as rotas de /api/social existirem, POSTS
 * vira a resposta do feed e as ações viram chamadas às rotas.
 */

type Comentario = { autor: string; texto: string; quando: string }
type Post = {
  id: string
  autor: string
  iniciais: string
  quando: string
  destino: string
  datas: string
  dias: string
  texto: string
  curtidas: number
  comentarios: Comentario[]
}

const POSTS: Post[] = [
  {
    id: "lisboa",
    autor: "Marina Costa",
    iniciais: "MC",
    quando: "há 2 horas · Lisboa, Portugal",
    destino: "Lisboa",
    datas: "12–18 junho · Portugal",
    dias: "7 dias",
    texto: "Sete dias entre Alfama, Belém e um bate-volta a Sintra. Roteiro aberto para quem quiser copiar.",
    curtidas: 128,
    comentarios: [
      { autor: "Rafael Lima", texto: "Sintra em um dia só deu certo?", quando: "há 1 hora" },
      { autor: "Marina Costa", texto: "Deu! Saímos às 8h no trem do Rossio e voltamos às 19h.", quando: "há 50 min" },
    ],
  },
  {
    id: "chapada",
    autor: "Rafael Lima",
    iniciais: "RL",
    quando: "ontem · Alto Paraíso, Goiás",
    destino: "Chapada dos Veadeiros",
    datas: "3–6 setembro · Brasil",
    dias: "4 dias",
    texto: "Quatro dias de trilha e cachoeira.",
    curtidas: 86,
    comentarios: [{ autor: "Júlia Andrade", texto: "Qual trilha vocês fizeram primeiro?", quando: "ontem" }],
  },
]

const SUGESTOES = [
  ["Felipe Ortiz", "FO", "9 viagens publicadas"],
  ["Ana Beatriz", "AB", "4 viagens publicadas"],
  ["Júlia Andrade", "JA", "Segue você"],
] as const

function Avatar({ iniciais, className }: { iniciais: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground",
        className,
      )}
    >
      {iniciais}
    </span>
  )
}

function Publicacao({ post, onComentar }: { post: Post; onComentar: () => void }) {
  const [curtiu, setCurtiu] = useState(false)
  const [salvou, setSalvou] = useState(false)
  return (
    <article className="space-y-3.5 rounded-2xl border border-border bg-card p-4 md:p-5">
      <header className="flex items-center gap-3">
        <Avatar iniciais={post.iniciais} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-sm font-semibold">{post.autor}</div>
          <div className="text-xs font-medium text-muted-foreground">{post.quando}</div>
        </div>
        <Button variant="outline" className="h-9 rounded-xl">
          Seguindo
        </Button>
      </header>
      <CapaViagem semente={post.id} className="h-72 rounded-2xl md:h-96">
        <span className="absolute left-4 top-4 rounded-full bg-citrico px-2.5 py-0.5 text-xs font-medium text-grafite">
          {post.dias}
        </span>
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 bg-primary px-5 py-4 text-primary-foreground">
          <div>
            <div className="text-3xl font-semibold leading-tight">{post.destino}</div>
            <div className="text-sm font-medium">{post.datas}</div>
          </div>
          <span className="hidden items-center gap-1 rounded-full bg-primary-foreground px-3.5 py-2 text-sm font-medium text-foreground sm:inline-flex">
            Ver roteiro
            <ChevronRight className="h-4 w-4" aria-hidden />
          </span>
        </div>
      </CapaViagem>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-pressed={curtiu}
          onClick={() => setCurtiu((v) => !v)}
          className="inline-flex h-11 items-center gap-1.5 rounded-xl px-2.5 text-sm font-medium hover:bg-muted"
        >
          <Heart className={cn("h-[22px] w-[22px]", curtiu && "fill-primary text-primary")} aria-hidden />
          <span className="sr-only">Curtir, </span>
          {post.curtidas + (curtiu ? 1 : 0)}
          <span className="sr-only"> curtidas</span>
        </button>
        <button
          type="button"
          onClick={onComentar}
          className="inline-flex h-11 items-center gap-1.5 rounded-xl px-2.5 text-sm font-medium hover:bg-muted"
        >
          <MessageCircle className="h-[22px] w-[22px]" aria-hidden />
          <span className="sr-only">Comentar, </span>
          {post.comentarios.length}
          <span className="sr-only"> comentários</span>
        </button>
        <span className="flex-1" />
        <button
          type="button"
          aria-pressed={salvou}
          aria-label={salvou ? "Remover dos salvos" : "Salvar"}
          onClick={() => setSalvou((v) => !v)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl hover:bg-muted"
        >
          <Bookmark className={cn("h-[22px] w-[22px]", salvou && "fill-primary text-primary")} aria-hidden />
        </button>
      </div>
      <p className="text-sm">
        <strong className="font-semibold">{post.autor}</strong> {post.texto}
      </p>
    </article>
  )
}

export function FeedExemplo() {
  const [aberto, setAberto] = useState<Post | null>(null)
  const [extras, setExtras] = useState<Record<string, Comentario[]>>({})
  const [novo, setNovo] = useState("")
  const comentarios = aberto ? [...aberto.comentarios, ...(extras[aberto.id] ?? [])] : []

  return (
    <div className="flex justify-center gap-8">
      <div className="w-full max-w-[640px] space-y-5">
        {POSTS.map((p) => (
          <Publicacao key={p.id} post={p} onComentar={() => setAberto(p)} />
        ))}
      </div>

      <aside aria-label="Atalhos do feed" className="hidden w-[340px] shrink-0 space-y-5 xl:block">
        <section className="rounded-2xl border border-border bg-card px-4 pb-2 pt-4">
          <h2 className="mb-1 text-sm font-semibold text-muted-foreground">Sugestões para seguir</h2>
          <ul className="divide-y divide-border">
            {SUGESTOES.map(([nome, ini, sub]) => (
              <li key={nome} className="flex items-center gap-3 py-2.5">
                <Avatar iniciais={ini} className="h-10 w-10" />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="text-sm font-semibold">{nome}</div>
                  <div className="text-xs font-medium text-muted-foreground">{sub}</div>
                </div>
                <Button className="h-9 rounded-xl">Seguir</Button>
              </li>
            ))}
          </ul>
        </section>
        <Button asChild variant="outline" className="h-11 w-full rounded-xl">
          <Link href="/pesquisar">
            <Search className="h-4 w-4" aria-hidden />
            Pesquisar pessoas
          </Link>
        </Button>
      </aside>

      <Dialog open={aberto !== null} onOpenChange={(v) => !v && setAberto(null)}>
        <DialogContent className="max-w-lg rounded-3xl">
          <DialogHeader>
            <DialogTitle>Comentários</DialogTitle>
            <DialogDescription>{aberto ? `Na viagem ${aberto.destino}, de ${aberto.autor}` : ""}</DialogDescription>
          </DialogHeader>
          <ul className="max-h-80 space-y-4 overflow-y-auto">
            {comentarios.map((c, i) => (
              <li key={i} className="flex gap-3">
                <Avatar iniciais={c.autor.split(" ").map((n) => n[0]).join("").slice(0, 2)} className="h-9 w-9 text-xs" />
                <div className="text-sm">
                  <strong className="font-semibold">{c.autor}</strong> {c.texto}
                  <div className="text-xs font-medium text-muted-foreground">{c.quando}</div>
                </div>
              </li>
            ))}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (!aberto || !novo.trim()) return
              setExtras((x) => ({
                ...x,
                [aberto.id]: [...(x[aberto.id] ?? []), { autor: "Você", texto: novo.trim(), quando: "agora" }],
              }))
              setNovo("")
            }}
          >
            <label htmlFor="novo-comentario" className="sr-only">
              Escreva um comentário
            </label>
            <Input
              id="novo-comentario"
              value={novo}
              onChange={(e) => setNovo(e.target.value)}
              placeholder="Escreva um comentário"
              className="h-12 rounded-xl"
            />
            <Button type="submit" className="h-12 rounded-xl px-5">
              Enviar
            </Button>
          </form>
          <SeloPrevia className="self-start">Comentários de exemplo, não são salvos</SeloPrevia>
        </DialogContent>
      </Dialog>
    </div>
  )
}
