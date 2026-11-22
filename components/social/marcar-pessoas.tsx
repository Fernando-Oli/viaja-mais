"use client"

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react"
import { Check, Loader2, Search, UserRound, X } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { BUSCA_MAX, BUSCA_MIN, TERMO_PERMITIDO, normalizarTermo } from "@/lib/social/busca"
import { cn } from "@/lib/utils"
import { MAXIMO_MARCADOS, nomeDe, type PessoaNoPost } from "./post-detalhe-modelo"

/**
 * "Marcar pessoas" (modelo do Instagram): busca por username ou nome em
 * GET /api/social/pessoas?q=, mostra os escolhidos como fichas removíveis e,
 * com o campo vazio, as sugestões (no post de viagem, os membros).
 *
 * - Espera a pessoa parar de digitar (300 ms) e descarta resposta atrasada; usa
 *   as mesmas regras de termo da busca de pessoas (lib/social/busca.ts) para não
 *   pedir o que a rota recusaria.
 * - Quem removeu a própria marcação (`recusados`) aparece desabilitado, com
 *   "Removeu a marcação": a rota e o banco recusariam de qualquer forma.
 * - No limite (`maximo`, 20 por padrão), quem não está marcado fica
 *   desabilitado até alguém sair.
 * - Combobox da APG com lista sempre em linha (no celular, dentro de um
 *   diálogo, um popover cobriria o resto): setas sobem e descem, Enter marca ou
 *   desmarca, Esc fecha a lista e Backspace no campo vazio tira o último.
 *
 * Só apresenta e chama a rota de busca: nenhum client do Supabase.
 *
 * @RF09.13 marcar pessoas · @RF09.15 post com fotos
 */

const ESPERA_MS = 300

type Busca =
  | { tipo: "ocioso" }
  | { tipo: "buscando"; termo: string }
  | { tipo: "pronto"; termo: string; pessoas: PessoaNoPost[] }
  | { tipo: "sessao"; termo: string }
  | { tipo: "erro"; termo: string }

/**
 * Para o `onEscapeKeyDown` do diálogo em volta: com a lista de pessoas aberta,
 * Esc fecha só a lista. O Radix escuta o Esc no `document` em captura, antes do
 * campo, então o campo sozinho não consegue impedir o diálogo de fechar.
 */
export function escFechaSoALista(evento: Event) {
  const alvo = evento.target
  if (alvo instanceof HTMLElement && alvo.getAttribute("role") === "combobox" && alvo.getAttribute("aria-expanded") === "true") {
    evento.preventDefault()
  }
}

export function AvatarDaPessoa({
  pessoa,
  className,
}: {
  pessoa: { username: string; full_name: string | null; avatar_url: string | null }
  className?: string
}) {
  return (
    <Avatar className={cn("h-9 w-9 shrink-0", className)}>
      {pessoa.avatar_url ? <AvatarImage src={pessoa.avatar_url} alt="" /> : null}
      <AvatarFallback aria-hidden className="bg-primary text-primary-foreground">
        <UserRound className="h-4 w-4" aria-hidden />
      </AvatarFallback>
    </Avatar>
  )
}

export function MarcarPessoas({
  selecionados,
  aoMudar,
  sugestoes = [],
  recusados = [],
  maximo = MAXIMO_MARCADOS,
  desabilitado = false,
  rotulo = "Marcar pessoas",
}: {
  selecionados: PessoaNoPost[]
  aoMudar: (pessoas: PessoaNoPost[]) => void
  sugestoes?: PessoaNoPost[]
  /** Ids de quem removeu a própria marcação e não pode ser marcado de novo. */
  recusados?: string[]
  maximo?: number
  desabilitado?: boolean
  rotulo?: string
}) {
  const id = useId()
  const idCampo = `${id}-campo`
  const idLista = `${id}-lista`
  const idAjuda = `${id}-ajuda`
  const campo = useRef<HTMLInputElement>(null)

  const [texto, setTexto] = useState("")
  const [busca, setBusca] = useState<Busca>({ tipo: "ocioso" })
  const [ativo, setAtivo] = useState(-1)
  const [fechada, setFechada] = useState(false)
  const [tentativa, setTentativa] = useState(0)

  const termo = normalizarTermo(texto)
  const deveBuscar = termo.length >= BUSCA_MIN && termo.length <= BUSCA_MAX && TERMO_PERMITIDO.test(termo)

  useEffect(() => {
    if (!deveBuscar) return
    const controle = new AbortController()
    const espera = setTimeout(async () => {
      setBusca({ tipo: "buscando", termo })
      try {
        const r = await fetch(`/api/social/pessoas?q=${encodeURIComponent(termo)}`, { signal: controle.signal })
        if (controle.signal.aborted) return
        if (r.status === 401) return setBusca({ tipo: "sessao", termo })
        if (!r.ok) return setBusca({ tipo: "erro", termo })
        const { pessoas } = (await r.json()) as { pessoas: PessoaNoPost[] }
        if (!controle.signal.aborted) setBusca({ tipo: "pronto", termo, pessoas: Array.isArray(pessoas) ? pessoas : [] })
      } catch {
        if (!controle.signal.aborted) setBusca({ tipo: "erro", termo })
      }
    }, ESPERA_MS)
    return () => {
      controle.abort()
      clearTimeout(espera)
    }
  }, [deveBuscar, termo, tentativa])

  const idsSelecionados = new Set(selecionados.map((p) => p.id))
  const idsRecusados = new Set(recusados)
  const noLimite = selecionados.length >= maximo

  // Com o campo vazio, as sugestões; com termo, o resultado da busca do termo atual.
  const comTermo = texto.trim() !== ""
  const resultadoAtual = busca.tipo === "pronto" && busca.termo === termo ? busca.pessoas : null
  const opcoes: PessoaNoPost[] = comTermo ? (deveBuscar ? (resultadoAtual ?? []) : []) : sugestoes
  const listaAberta = !fechada && !desabilitado && opcoes.length > 0

  const indisponivel = (p: PessoaNoPost) => idsRecusados.has(p.id) || (noLimite && !idsSelecionados.has(p.id))
  const ativoValido = ativo >= 0 && ativo < opcoes.length && listaAberta ? ativo : -1

  function alternar(pessoa: PessoaNoPost) {
    if (desabilitado || indisponivel(pessoa)) return
    if (idsSelecionados.has(pessoa.id)) aoMudar(selecionados.filter((p) => p.id !== pessoa.id))
    else aoMudar([...selecionados, pessoa])
    campo.current?.focus()
  }

  function remover(pessoa: PessoaNoPost) {
    aoMudar(selecionados.filter((p) => p.id !== pessoa.id))
    campo.current?.focus()
  }

  /** Próximo índice habilitado a partir de `de`, andando `passo` (1 ou -1); -1 se não houver. */
  function proximoHabilitado(de: number, passo: 1 | -1) {
    for (let i = 1; i <= opcoes.length; i++) {
      const j = (de + passo * i + opcoes.length * 2) % opcoes.length
      if (!indisponivel(opcoes[j])) return j
    }
    return -1
  }

  function teclado(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      setFechada(false)
      if (opcoes.length === 0) return
      const passo = e.key === "ArrowDown" ? 1 : -1
      const de = ativoValido === -1 ? (passo === 1 ? -1 : opcoes.length) : ativoValido
      setAtivo(proximoHabilitado(de, passo))
    } else if (e.key === "Enter") {
      // Enter num campo dentro de formulário não envia o formulário.
      e.preventDefault()
      if (ativoValido >= 0) alternar(opcoes[ativoValido])
    } else if (e.key === "Escape") {
      if (listaAberta) {
        // Fecha a lista sem fechar o diálogo em volta.
        e.preventDefault()
        e.stopPropagation()
        setFechada(true)
        setAtivo(-1)
      }
    } else if (e.key === "Backspace" && texto === "" && selecionados.length > 0) {
      remover(selecionados[selecionados.length - 1])
    }
  }

  const status = (() => {
    if (noLimite) return `Limite de ${maximo} ${maximo === 1 ? "pessoa marcada" : "pessoas marcadas"}.`
    if (!comTermo) return ""
    if (!deveBuscar) {
      if (termo.length < BUSCA_MIN) return `Digite pelo menos ${BUSCA_MIN} letras.`
      return "Use só letras, números, espaço e . _ -"
    }
    if (busca.tipo === "sessao" && busca.termo === termo) return "Sua sessão expirou. Entre de novo para buscar."
    if (busca.tipo === "erro" && busca.termo === termo) return "Não foi possível buscar agora."
    if (resultadoAtual === null) return "Buscando…"
    if (resultadoAtual.length === 0) return "Ninguém encontrado com esse nome ou usuário."
    return resultadoAtual.length === 1 ? "1 pessoa encontrada." : `${resultadoAtual.length} pessoas encontradas.`
  })()
  const buscando = comTermo && deveBuscar && resultadoAtual === null && busca.tipo !== "erro" && busca.tipo !== "sessao"
  const falhouAgora = comTermo && busca.tipo === "erro" && busca.termo === termo

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={idCampo} className="text-sm font-medium">
          {rotulo}
        </label>
        <span className="text-xs font-medium text-muted-foreground">
          {selecionados.length} de {maximo}
        </span>
      </div>

      {selecionados.length > 0 && (
        <ul aria-label="Pessoas marcadas" className="flex flex-wrap gap-2">
          {selecionados.map((p) => (
            <li
              key={p.id}
              className="inline-flex h-11 max-w-full items-center gap-2 rounded-full border border-border bg-muted/60 py-1 pr-1 pl-1.5 text-sm"
            >
              <AvatarDaPessoa pessoa={p} className="h-8 w-8" />
              <span className="min-w-0 truncate font-medium">@{p.username}</span>
              <button
                type="button"
                disabled={desabilitado}
                aria-label={`Remover a marcação de @${p.username}`}
                onClick={() => remover(p)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-background disabled:opacity-50"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          ref={campo}
          id={idCampo}
          type="text"
          role="combobox"
          aria-expanded={listaAberta}
          aria-controls={idLista}
          aria-autocomplete="list"
          aria-activedescendant={ativoValido >= 0 ? `${idLista}-${ativoValido}` : undefined}
          aria-describedby={idAjuda}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value)
            setFechada(false)
            setAtivo(-1)
          }}
          onKeyDown={teclado}
          disabled={desabilitado}
          maxLength={BUSCA_MAX}
          placeholder="Buscar por nome ou @usuário"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="h-11 rounded-xl pl-9"
        />
        {buscando && (
          <Loader2
            className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
            aria-hidden
          />
        )}
      </div>

      <p id={idAjuda} role="status" className="min-h-4 text-xs text-muted-foreground">
        {status}
        {falhouAgora && (
          <button
            type="button"
            className="ml-2 inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4"
            onClick={() => setTentativa((t) => t + 1)}
          >
            Tentar de novo
          </button>
        )}
      </p>

      {!comTermo && listaAberta && (
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase" aria-hidden>
          Sugestões
        </p>
      )}
      <ul
        id={idLista}
        role="listbox"
        aria-label={comTermo ? "Pessoas encontradas" : "Sugestões"}
        aria-multiselectable="true"
        hidden={!listaAberta}
        className="max-h-64 space-y-0.5 overflow-y-auto rounded-xl border border-border p-1"
      >
        {listaAberta &&
          opcoes.map((p, i) => {
            const marcado = idsSelecionados.has(p.id)
            const recusou = idsRecusados.has(p.id)
            const fora = indisponivel(p)
            return (
              <li
                key={p.id}
                id={`${idLista}-${i}`}
                role="option"
                aria-selected={marcado}
                aria-disabled={fora || undefined}
                // Sem roubar o foco do campo: a lista é operada pelo teclado dele.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => alternar(p)}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5",
                  i === ativoValido && "bg-muted",
                  fora ? "cursor-not-allowed opacity-60" : "hover:bg-muted",
                )}
              >
                <AvatarDaPessoa pessoa={p} />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-sm font-semibold">{nomeDe(p)}</span>
                  <span className="block truncate text-xs font-medium text-muted-foreground">
                    @{p.username}
                    {recusou ? " · Removeu a marcação" : ""}
                  </span>
                </span>
                {marcado && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
              </li>
            )
          })}
      </ul>
    </div>
  )
}
