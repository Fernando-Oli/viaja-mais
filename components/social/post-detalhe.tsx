"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CalendarDays, Loader2, MapPin, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import ConfirmModal from "@/components/ui/confirm-modal"
import { CapaViagem } from "@/components/brand/capa-viagem"
import { useToast } from "@/hooks/use-toast"
import { AvatarDaPessoa } from "./marcar-pessoas"
import { PostCarrossel } from "./post-carrossel"
import { EditarPostDialogo } from "./post-detalhe-editar"
import {
  dataDaPublicacao,
  linhaDoItem,
  nomeDe,
  idsRecusados,
  periodoDaViagem,
  rotuloCategoria,
  roteiroPorDia,
  type PostVisto,
  type ViagemDoPost,
} from "./post-detalhe-modelo"

/**
 * O detalhe de um post (/feed/<id>), no visual do post da prévia do Fernando
 * (components/prototipo/feed-exemplo.tsx): autor com foto e link ao perfil,
 * carrossel das fotos (ou o grafismo da marca, `CapaViagem` com `semente = id`,
 * no post de viagem sem fotos), legenda, quem foi marcado e a data.
 *
 * O post de viagem mostra ainda a cópia da viagem: título, destino, datas, o
 * roteiro agrupado por dia e os lugares, com endereço quando o autor escolheu
 * publicá-lo.
 *
 * Para a autora (`proprio`): "Editar legenda e marcações" (PATCH, diálogo em
 * post-detalhe-editar.tsx) e "Excluir" (`ConfirmModal` e DELETE; volta ao
 * próprio perfil com `toast`). No post de viagem, excluir é o mesmo que
 * despublicar: a viagem em si não muda.
 *
 * Lê só por GET /api/social/posts/[postId] (`{ post, recusados }`; os
 * recusados, só para a autora, vão para o editar). O 404 da rota vale para "não
 * existe" e para "você não pode ver"; a tela diz só "Esta publicação não está
 * disponível", sem distinguir.
 *
 * @RF09.17 detalhe do post · @RF09.15 post com fotos — excluir e editar
 */

type Estado =
  | { tipo: "carregando" }
  | { tipo: "indisponivel" }
  | { tipo: "sessao" }
  | { tipo: "erro" }
  | { tipo: "pronto"; post: PostVisto; recusados: string[] }

export function PostDetalhe({ postId }: { postId: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" })
  const [tentativa, setTentativa] = useState(0)
  const [confirmarExclusao, setConfirmarExclusao] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const [editando, setEditando] = useState(false)

  useEffect(() => {
    const controle = new AbortController()
    void (async () => {
      try {
        const r = await fetch(`/api/social/posts/${encodeURIComponent(postId)}`, {
          cache: "no-store",
          signal: controle.signal,
        })
        if (controle.signal.aborted) return
        // 400 é id fora do formato: nenhum post o tem, então é o mesmo que não existir.
        if (r.status === 404 || r.status === 400) return setEstado({ tipo: "indisponivel" })
        if (r.status === 401) return setEstado({ tipo: "sessao" })
        if (!r.ok) return setEstado({ tipo: "erro" })
        const { post, recusados } = (await r.json()) as { post: PostVisto; recusados?: unknown }
        if (!controle.signal.aborted) setEstado({ tipo: "pronto", post, recusados: idsRecusados(recusados) })
      } catch {
        if (!controle.signal.aborted) setEstado({ tipo: "erro" })
      }
    })()
    return () => controle.abort()
  }, [postId, tentativa])

  async function excluir(post: PostVisto) {
    setExcluindo(true)
    try {
      const r = await fetch(`/api/social/posts/${encodeURIComponent(post.id)}`, { method: "DELETE" })
      if (r.ok || r.status === 404) {
        toast(
          r.ok
            ? { title: "Publicação excluída", description: "Ela saiu do seu perfil e do feed." }
            : { title: "A publicação já não existe", description: "Ela foi excluída em outra aba." },
        )
        router.push(`/u/${encodeURIComponent(post.autor.username)}`)
        router.refresh()
        return
      }
      if (r.status === 401) {
        toast({ variant: "destructive", title: "Sua sessão expirou", description: "Entre de novo para excluir." })
        return
      }
      if (r.status === 403) {
        toast({ variant: "destructive", title: "Sem permissão", description: "Só quem publicou pode excluir." })
        return
      }
      toast({ variant: "destructive", title: "Não foi possível excluir", description: "Tente de novo em instantes." })
    } catch {
      toast({ variant: "destructive", title: "Sem conexão com o servidor", description: "Verifique a conexão e tente de novo." })
    } finally {
      setExcluindo(false)
    }
  }

  if (estado.tipo === "carregando") {
    return (
      <p role="status" className="mx-auto flex max-w-[640px] items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Carregando a publicação…
      </p>
    )
  }
  if (estado.tipo === "indisponivel") {
    return (
      <EstadoVazio titulo="Esta publicação não está disponível">
        <p className="text-sm text-muted-foreground">O link pode estar errado, ou a publicação foi removida.</p>
        <Button asChild variant="outline" className="h-11 rounded-xl">
          <Link href="/feed">Ir para o feed</Link>
        </Button>
      </EstadoVazio>
    )
  }
  if (estado.tipo === "sessao") {
    return (
      <EstadoVazio titulo="Sua sessão expirou.">
        <Button asChild variant="outline" className="h-11 rounded-xl">
          <Link href="/auth/login">Entrar de novo</Link>
        </Button>
      </EstadoVazio>
    )
  }
  if (estado.tipo === "erro") {
    return (
      <EstadoVazio titulo="Não foi possível carregar a publicação.">
        <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => setTentativa((t) => t + 1)}>
          Tentar de novo
        </Button>
      </EstadoVazio>
    )
  }

  const { post, recusados } = estado
  const { autor, viagem } = post
  const nome = nomeDe(autor)
  const quando = dataDaPublicacao(post.created_at)
  const total = post.fotos.length
  const fotos = post.fotos.map((src, i) => ({
    src,
    alt: total > 1 ? `Foto ${i + 1} de ${total} da publicação de @${autor.username}` : `Foto da publicação de @${autor.username}`,
  }))

  return (
    <div className="mx-auto w-full max-w-[640px]">
      <h1 className="sr-only">{viagem ? viagem.title : `Publicação de @${autor.username}`}</h1>
      <article
        aria-label={`Publicação de @${autor.username}`}
        className="space-y-3.5 rounded-2xl border border-border bg-card p-4 md:p-5"
      >
        <header className="flex flex-wrap items-center gap-3">
          <Link
            href={`/u/${encodeURIComponent(autor.username)}`}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg hover:underline focus-visible:underline"
          >
            <AvatarDaPessoa pessoa={autor} className="h-11 w-11" />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-semibold text-foreground">{nome}</span>
              <span className="block truncate text-xs font-medium text-muted-foreground">@{autor.username}</span>
            </span>
          </Link>
          {post.proprio && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-xl"
                disabled={excluindo}
                onClick={() => setEditando(true)}
              >
                <Pencil className="h-4 w-4" aria-hidden />
                <span className="sr-only sm:not-sr-only">Editar legenda e marcações</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-xl border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={excluindo}
                onClick={() => setConfirmarExclusao(true)}
              >
                {excluindo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
                <span className="sr-only sm:not-sr-only">Excluir</span>
              </Button>
            </div>
          )}
        </header>

        {total > 0 ? (
          <PostCarrossel
            fotos={fotos}
            rotulo={`Fotos da publicação de @${autor.username}`}
            className="aspect-square w-full rounded-2xl md:aspect-[4/5]"
          />
        ) : viagem ? (
          <CapaViagem semente={post.id} className="h-72 rounded-2xl md:h-96">
            <div className="absolute inset-x-0 bottom-0 bg-primary px-5 py-4 text-primary-foreground">
              <p className="break-words text-3xl leading-tight font-semibold">{viagem.destination}</p>
              <p className="text-sm font-medium">{periodoDaViagem(viagem.start_date, viagem.end_date)}</p>
            </div>
          </CapaViagem>
        ) : null}

        {viagem && <CabecalhoDaViagem viagem={viagem} />}

        {post.caption && (
          <p className="text-sm break-words whitespace-pre-line">
            <strong className="font-semibold">{nome}</strong> {post.caption}
          </p>
        )}

        {post.marcados.length > 0 && (
          <div className="space-y-1.5">
            <h2 className="text-xs font-semibold text-muted-foreground">Com</h2>
            <ul aria-label="Pessoas marcadas" className="flex flex-wrap gap-2">
              {post.marcados.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/u/${encodeURIComponent(p.username)}`}
                    className="inline-flex h-11 max-w-full items-center gap-2 rounded-full border border-border py-1 pr-3 pl-1.5 text-sm font-medium hover:bg-muted"
                  >
                    <AvatarDaPessoa pessoa={p} className="h-8 w-8" />
                    <span className="truncate">@{p.username}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {quando && (
          <p className="text-xs font-medium text-muted-foreground">
            <time dateTime={post.created_at}>{quando}</time>
          </p>
        )}

        {viagem && <CopiaDaViagem viagem={viagem} />}
      </article>

      <ConfirmModal
        open={confirmarExclusao}
        onOpenChange={setConfirmarExclusao}
        title="Excluir esta publicação?"
        description={
          viagem
            ? "A publicação sai do feed e do seu perfil, com as fotos e as marcações. A viagem em si não muda."
            : "A publicação sai do feed e do seu perfil, com as fotos e as marcações. Não dá para desfazer."
        }
        confirmText="Excluir"
        variant="destructive"
        onConfirm={() => {
          setConfirmarExclusao(false)
          void excluir(post)
        }}
      />
      {editando && (
        <EditarPostDialogo
          post={post}
          recusados={recusados}
          aoRecusar={(novos) => setEstado({ tipo: "pronto", post, recusados: novos })}
          aoFechar={() => setEditando(false)}
          aoSalvar={(atualizado) => {
            setEstado({ tipo: "pronto", post: atualizado, recusados })
            setEditando(false)
            router.refresh()
          }}
          aoSumir={() => {
            setEditando(false)
            setEstado({ tipo: "indisponivel" })
          }}
        />
      )}
    </div>
  )
}

function EstadoVazio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="mx-auto max-w-[640px] space-y-3 rounded-2xl border border-border bg-card p-6 text-center">
      <h1 className="text-lg font-semibold">{titulo}</h1>
      <div className="flex flex-col items-center gap-3">{children}</div>
    </div>
  )
}

function CabecalhoDaViagem({ viagem }: { viagem: ViagemDoPost }) {
  return (
    <div className="space-y-1">
      <h2 className="text-xl leading-tight font-semibold break-words">{viagem.title}</h2>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-4 w-4" aria-hidden />
          {viagem.destination}
        </span>
        <span className="inline-flex items-center gap-1">
          <CalendarDays className="h-4 w-4" aria-hidden />
          {periodoDaViagem(viagem.start_date, viagem.end_date)}
        </span>
      </p>
    </div>
  )
}

function CopiaDaViagem({ viagem }: { viagem: ViagemDoPost }) {
  const dias = roteiroPorDia(viagem.items, viagem.start_date)
  if (dias.length === 0 && viagem.places.length === 0) return null
  return (
    <div className="space-y-5 border-t border-border pt-4">
      {dias.length > 0 && (
        <section aria-labelledby="post-roteiro" className="space-y-3">
          <h2 id="post-roteiro" className="text-base font-semibold">
            Roteiro
          </h2>
          {dias.map((dia) => (
            <div key={dia.chave} className="space-y-1.5">
              <h3 className="text-sm font-semibold text-primary">{dia.titulo}</h3>
              <ul className="space-y-2 border-l-2 border-border pl-3">
                {dia.itens.map((item, i) => {
                  const linha = linhaDoItem(item)
                  return (
                    <li key={i} className="text-sm break-words">
                      <span className="font-medium">{item.title}</span>
                      {linha && <span className="block text-xs text-muted-foreground">{linha}</span>}
                      {item.location && <span className="block text-xs text-muted-foreground">{item.location}</span>}
                      {item.description && (
                        <span className="block text-xs whitespace-pre-line text-muted-foreground">{item.description}</span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </section>
      )}
      {viagem.places.length > 0 && (
        <section aria-labelledby="post-lugares" className="space-y-2">
          <h2 id="post-lugares" className="text-base font-semibold">
            Lugares
          </h2>
          <ul className="space-y-2">
            {viagem.places.map((lugar, i) => {
              const categoria = rotuloCategoria(lugar.category)
              return (
                <li key={i} className="text-sm break-words">
                  <span className="font-medium">{lugar.name}</span>
                  {categoria && <span className="text-xs text-muted-foreground"> · {categoria}</span>}
                  {lugar.address && <span className="block text-xs text-muted-foreground">{lugar.address}</span>}
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
