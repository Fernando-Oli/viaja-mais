"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Check, Loader2, Lock, Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import ConfirmModal from "@/components/ui/confirm-modal"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { acrescentarFotos, avisoDaEscolha } from "./criar-post-fotos"
import { escFechaSoALista } from "./marcar-pessoas"
import {
  LIMITE_LEGENDA,
  LIMITE_TITULO,
  ajustarFormulario,
  aplicarRecusas,
  enviaFotos,
  formularioInicial,
  idsRecusados,
  listarArrobas,
  lugaresSemTexto,
  montarCorpo,
  type FotoEscolhida,
  type Formulario,
  type Post,
  type RespostaPost,
} from "./publicar-modelo"
import { SecaoFotos } from "./publicar-fotos"
import { PreviaPublica } from "./publicar-previa"
import { SecaoLugares, SecaoMarcar, SecaoRoteiro } from "./publicar-secoes"

/**
 * "Publicar viagem" (S06-M-publicar-viagem), sobre o visual da prévia do
 * Fernando (components/prototipo/botao-publicar.tsx), com as mesmas props do
 * `BotaoPublicar`: a página da viagem troca o import e nada mais. Desde o
 * redesenho de 18/11, publicar a viagem cria um **post** (modelo Instagram):
 * de 0 a 3 fotos, legenda, pessoas marcadas e, além disso, a cópia da viagem.
 *
 * Tudo passa pelas rotas — nenhum client do Supabase aqui (regra 1 do
 * CLAUDE.md): GET/POST/PATCH/DELETE em /api/social/viagens/[tripId]/post e
 * PUT em .../post/fotos (multipart, campo `fotos`, de 0 a 3, substitui todas).
 *
 * **Quando o estado é lido.** Ao montar, e não só ao abrir: o rótulo do botão
 * ("Publicar" ou "Publicada") depende de já existir post, e ler só ao abrir
 * mostraria "Publicar" a quem já publicou. Ao abrir, o estado guardado é
 * reaproveitado se tiver menos de 4 minutos; mais velho, é lido de novo, porque
 * as URLs assinadas (avatar e fotos) valem 10 minutos e são reaproveitadas pelo
 * servidor por 5. O roteiro e os lugares mudam em outras telas: voltar para a
 * viagem remonta o componente e lê de novo.
 *
 * **As fotos: escolhidas antes, enviadas logo depois.** O autor escolhe as
 * fotos (até 3, na ordem do carrossel) já no "Publicar", como no Instagram;
 * elas ficam só no navegador (prévia `blob:`) até o POST dar certo, e então a
 * tela as envia por PUT .../post/fotos. Duas razões para não mandar tudo
 * numa requisição só: o corpo de POST/PATCH é JSON validado pelo schema
 * `.strict()` (lib/schemas/post.ts), e a rota das fotos age sobre o post da
 * sessão, que só existe depois do POST (sem ele, 404). Se o envio das fotos
 * falha, o post já está publicado com o grafismo (o post de viagem pode ter 0
 * fotos): o diálogo fica aberto, já em modo gerenciar, com as fotos ainda
 * escolhidas, e "Atualizar publicação" tenta de novo. Ao gerenciar, as fotos
 * novas (ou tirar todas) também só vão no "Atualizar publicação", depois do
 * PATCH: uma ação, um botão. A rota troca o conjunto inteiro, então trocar é
 * escolher de novo as 1 a 3 (não dá para tirar só uma das fotos já publicadas).
 *
 * **Marcar pessoas** (modelo Instagram): qualquer perfil com username, pela
 * busca do `MarcarPessoas`, com os membros da viagem (`marcaveis`) como
 * sugestão e quem removeu a própria marcação desabilitado.
 *
 * **O título** vem preenchido com o da viagem (ou com o do post, ao gerenciar)
 * e é editável: vazio, a publicação usa o da viagem.
 *
 * @RF09.7 publicar viagem — título, legenda, roteiro, lugares, fotos, atualizar e despublicar
 * @RF09.13 marcar pessoas, com os membros como sugestão, menos quem removeu a própria marcação
 */

const VALIDADE_ESTADO_MS = 4 * 60 * 1000

type Acao = "publicar" | "atualizar" | "fotos" | "despublicar"
type Bloqueio = "sessao" | "sem_username"

type Resultado =
  | { tipo: "ok"; dados: RespostaPost }
  | { tipo: "falha"; status: number; codigo?: string }
  | { tipo: "rede" }

type CorpoDeErro = { error?: unknown; codigo?: string; detalhes?: unknown; recusados?: unknown }

async function lerEstado(url: string, sinal?: AbortSignal): Promise<Resultado> {
  try {
    const r = await fetch(url, { cache: "no-store", signal: sinal })
    if (r.ok) return { tipo: "ok", dados: (await r.json()) as RespostaPost }
    const corpo = (await r.json().catch(() => ({}))) as { codigo?: string }
    return { tipo: "falha", status: r.status, codigo: corpo.codigo }
  } catch {
    return { tipo: "rede" }
  }
}

/**
 * A primeira mensagem do `detalhes` de um 400 do zod (`error.flatten()`): a de
 * um campo, ou a do formulário. `null` se não houver nenhuma.
 */
function primeiroDetalhe(detalhes: unknown): string | null {
  if (!detalhes || typeof detalhes !== "object") return null
  const { fieldErrors, formErrors } = detalhes as { fieldErrors?: unknown; formErrors?: unknown }
  const listas = [...(fieldErrors && typeof fieldErrors === "object" ? Object.values(fieldErrors) : []), formErrors]
  for (const lista of listas) {
    const primeira = Array.isArray(lista) ? lista.find((m): m is string => typeof m === "string") : undefined
    if (primeira) return primeira.charAt(0).toUpperCase() + primeira.slice(1)
  }
  return null
}

/** A mensagem do servidor para mostrar: a do `error`, ou, no "Dados inválidos" do zod, a do primeiro campo. */
function mensagemDoServidor(corpo: CorpoDeErro): string | null {
  return typeof corpo.error === "string" && corpo.error !== "Dados inválidos" ? corpo.error : primeiroDetalhe(corpo.detalhes)
}

function bloqueioDe(status: number, codigo?: string): Bloqueio | null {
  if (status === 401) return "sessao"
  if (status === 403 && codigo === "sem_username") return "sem_username"
  return null
}

export function PublicarViagem({ viagemId, titulo, datas }: { viagemId: string; titulo: string; datas: string }) {
  const url = `/api/social/viagens/${encodeURIComponent(viagemId)}/post`
  const { toast } = useToast()

  const [dados, setDados] = useState<RespostaPost | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [falhou, setFalhou] = useState(false)
  const [bloqueio, setBloqueio] = useState<Bloqueio | null>(null)
  const [aberto, setAberto] = useState(false)
  const [form, setForm] = useState<Formulario | null>(null)
  const [acao, setAcao] = useState<Acao | null>(null)
  const [confirmaDespublicar, setConfirmaDespublicar] = useState(false)
  const [tentouEnviar, setTentouEnviar] = useState(false)

  const lidoEm = useRef(0)
  const botaoFotos = useRef<HTMLButtonElement>(null)
  const focarFotos = useRef(false)
  const urlsVivas = useRef<Set<string>>(new Set())

  // Leitura ao montar: decide o rótulo do botão. Falha aqui é silenciosa; o
  // diálogo mostra o problema quando a pessoa abrir.
  useEffect(() => {
    const controle = new AbortController()
    void (async () => {
      const r = await lerEstado(url, controle.signal)
      if (controle.signal.aborted) return
      if (r.tipo === "ok") {
        lidoEm.current = Date.now()
        setDados(r.dados)
      } else if (r.tipo === "falha") {
        setBloqueio(bloqueioDe(r.status, r.codigo))
        setFalhou(true)
      } else {
        setFalhou(true)
      }
      setCarregando(false)
    })()
    return () => controle.abort()
  }, [url])

  // As prévias `blob:` seguram o arquivo na memória: a que sai do formulário
  // (removida, trocada, enviada ou descartada ao reabrir) é liberada.
  const fotosDoForm = form?.fotos ?? null
  useEffect(() => {
    const atuais = new Set((fotosDoForm ?? []).map((f) => f.url))
    for (const u of urlsVivas.current) {
      if (!atuais.has(u)) URL.revokeObjectURL(u)
    }
    urlsVivas.current = atuais
  }, [fotosDoForm])
  useEffect(() => {
    const vivas = urlsVivas.current
    return () => {
      for (const u of vivas) URL.revokeObjectURL(u)
    }
  }, [])

  // As fotos não subiram depois de salvar: o foco vai para o botão das fotos,
  // já habilitado (fim da ação), para não cair no <body>.
  useEffect(() => {
    if (focarFotos.current && acao === null) {
      focarFotos.current = false
      botaoFotos.current?.focus()
    }
  }, [dados, acao])

  const post = dados?.post ?? null
  const ocupado = acao !== null
  const publicado = post !== null

  /** Lê o estado de novo. `reiniciar` descarta o que a pessoa mudou; sem ele, encaixa as escolhas no estado novo. */
  async function recarregar(reiniciar: boolean) {
    setCarregando(true)
    const r = await lerEstado(url)
    setCarregando(false)
    if (r.tipo === "ok") {
      lidoEm.current = Date.now()
      setDados(r.dados)
      setBloqueio(null)
      setFalhou(false)
      setForm((atual) => (reiniciar || !atual ? formularioInicial(r.dados) : ajustarFormulario(atual, r.dados)))
      return
    }
    if (r.tipo === "falha") setBloqueio(bloqueioDe(r.status, r.codigo))
    setFalhou(true)
  }

  function abrir() {
    setAberto(true)
    setTentouEnviar(false)
    if (dados && !bloqueio && Date.now() - lidoEm.current < VALIDADE_ESTADO_MS) {
      setForm(formularioInicial(dados))
      return
    }
    setForm(null)
    void recarregar(true)
  }

  /** Resposta de erro de qualquer escrita: cada status leva a uma saída. */
  async function tratarFalha(r: Response) {
    const corpo = (await r.json().catch(() => ({}))) as CorpoDeErro
    const bloqueioNovo = bloqueioDe(r.status, corpo.codigo)
    if (bloqueioNovo === "sessao") {
      setBloqueio("sessao")
      toast({ variant: "destructive", title: "Sua sessão expirou", description: "Entre de novo para continuar." })
      return
    }
    if (bloqueioNovo === "sem_username") {
      setBloqueio("sem_username")
      toast({ title: "Escolha um nome de usuário", description: "Publicar uma viagem exige um nome de usuário." })
      return
    }
    if (r.status === 403) {
      toast({ variant: "destructive", title: "Sem permissão", description: "Você não participa mais desta viagem." })
      return
    }
    if (r.status === 409) {
      // Sem post na tela: outra aba publicou. Com post: as fotos ou as marcações mudaram em outra aba.
      toast({
        title: dados?.post ? "A publicação mudou em outra aba" : "Você já publicou esta viagem",
        description: "Carregamos o estado atual: confira e tente de novo.",
      })
      await recarregar(true)
      return
    }
    if (r.status === 404) {
      toast({ title: "A publicação não existe mais", description: "Ela foi removida em outra aba. Carregamos o estado atual." })
      await recarregar(true)
      return
    }
    if (r.status === 400 && corpo.codigo === "marcado_recusou") {
      // A rota diz quem recusou: sai da seleção e fica desabilitado no "Marcar
      // pessoas". O diálogo continua aberto, com o resto como estava.
      const novos = Array.isArray(corpo.recusados)
        ? corpo.recusados.filter((id): id is string => typeof id === "string")
        : []
      if (!dados || !form || novos.length === 0) {
        toast({
          title: "Alguém removeu a própria marcação",
          description: "Quem remove a marcação não pode ser marcado de novo por você nesta viagem. Atualizamos a lista: confira e tente de novo.",
        })
        await recarregar(false)
        return
      }
      const ajustado = aplicarRecusas(form, dados, novos)
      setDados(ajustado.dados)
      setForm(ajustado.form)
      const quem = listarArrobas(ajustado.removidos)
      toast({
        title: ajustado.removidos.length > 1 ? "Algumas pessoas removeram a própria marcação" : "Alguém removeu a própria marcação",
        description: `${quem ? `Tiramos ${quem} dos marcados: quem` : "Quem"} remove a própria marcação não pode ser marcado de novo por você nesta viagem. Confira e tente de novo.`,
      })
      return
    }
    if (r.status === 400 && (corpo.codigo === "marcado_invalido" || corpo.error === "marcado_invalido")) {
      toast({
        title: "Alguém não pode ser marcado",
        description: "Só dá para marcar quem tem nome de usuário. Confira os marcados e tente de novo.",
      })
      await recarregar(false)
      return
    }
    if (r.status === 400 || r.status === 413) {
      // A mensagem do servidor (ex.: "O título da viagem passa de 120
      // caracteres...", ou a foto que não é imagem); no "Dados inválidos" do
      // zod, a do primeiro campo recusado.
      toast({
        variant: "destructive",
        title: "Confira os dados",
        description: mensagemDoServidor(corpo) ?? "Algum campo não foi aceito. Revise e tente de novo.",
      })
      return
    }
    if (r.status === 429) {
      // As fotos contam no mesmo limite de envios da foto de perfil.
      toast({
        variant: "destructive",
        title: "Muitos envios seguidos",
        description: typeof corpo.error === "string" ? corpo.error : "Aguarde um pouco e tente de novo.",
      })
      return
    }
    toast({ variant: "destructive", title: "Não foi possível concluir", description: "Tente de novo em instantes." })
  }

  /** Uma escrita por vez: os botões ficam desabilitados enquanto `acao` não é nula. */
  async function executar(qual: Acao, corpo: () => Promise<void>) {
    setAcao(qual)
    try {
      await corpo()
    } catch {
      toast({
        variant: "destructive",
        title: "Sem conexão com o servidor",
        description: "Verifique a conexão e tente de novo.",
      })
    } finally {
      setAcao(null)
    }
  }

  /**
   * PUT .../post/fotos com as fotos escolhidas, na ordem (0 a 3; zero tira
   * todas). Chamada só depois do POST/PATCH dar certo. Devolve o post novo, ou
   * `null` se não subiram — o post fica salvo, e as fotos, escolhidas.
   */
  async function enviarFotos(fotos: FotoEscolhida[]): Promise<Post | null> {
    const multipart = new FormData()
    for (const f of fotos) multipart.append("fotos", f.arquivo)
    let r: Response
    try {
      r = await fetch(`${url}/fotos`, { method: "PUT", body: multipart })
    } catch {
      toast({
        variant: "destructive",
        title: "As fotos não foram enviadas",
        description: "A publicação foi salva sem elas. Verifique a conexão e clique em Atualizar publicação.",
      })
      return null
    }
    if (r.ok) return ((await r.json()) as { post: Post }).post
    if (r.status === 409) {
      // Outra aba trocou as fotos antes: vale o que está no servidor agora.
      toast({
        title: "As fotos mudaram em outra aba",
        description: "O resto da publicação foi salvo. Carregamos as fotos atuais: confira e, se quiser, troque de novo.",
      })
      await recarregar(true)
      return null
    }
    if (r.status === 400 || r.status === 413 || r.status === 429 || r.status >= 500) {
      const corpo = (await r.json().catch(() => ({}))) as CorpoDeErro
      toast({
        variant: "destructive",
        title: "As fotos não foram enviadas",
        description: `${mensagemDoServidor(corpo) ?? "Tente de novo em instantes."} A publicação foi salva; confira as fotos e clique em Atualizar publicação.`,
      })
      return null
    }
    await tratarFalha(r)
    return null
  }

  async function salvar() {
    if (!dados || !form) return
    const faltando = lugaresSemTexto(form, dados.previa.lugares)
    if (faltando.length > 0) {
      setTentouEnviar(true)
      toast({
        variant: "destructive",
        title: "Falta o endereço digitado",
        description: `Digite o endereço de ${faltando[0].name} ou escolha outra opção.`,
      })
      document.getElementById(`pub-lugar-${faltando[0].id}-texto`)?.focus()
      return
    }
    const novo = !dados.post
    const comFotos = enviaFotos(form, !novo)
    const fotos = form.fotos ?? []
    await executar(novo ? "publicar" : "atualizar", async () => {
      const r = await fetch(url, {
        method: novo ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(montarCorpo(form, dados)),
      })
      if (!r.ok) return tratarFalha(r)
      const { post: gravado } = (await r.json()) as { post: Post }
      let atualizado: RespostaPost = { ...dados, post: gravado }
      lidoEm.current = Date.now()
      setDados(atualizado)
      setTentouEnviar(false)

      if (comFotos) {
        // Salvo o post, as fotos continuam escolhidas até subirem.
        setForm({ ...formularioInicial(atualizado), fotos })
        setAcao("fotos")
        const comAsFotos = await enviarFotos(fotos)
        if (!comAsFotos) {
          focarFotos.current = true
          return
        }
        atualizado = { ...atualizado, post: comAsFotos }
        setDados(atualizado)
      }

      setForm(formularioInicial(atualizado))
      setAberto(false)
      toast(
        novo
          ? { title: "Viagem publicada", description: "Já aparece no seu perfil e para quem segue você." }
          : { title: "Publicação atualizada" },
      )
    })
  }

  async function despublicar() {
    await executar("despublicar", async () => {
      const r = await fetch(url, { method: "DELETE" })
      if (!r.ok) return tratarFalha(r)
      setDados((d) => (d ? { ...d, post: null } : d))
      setAberto(false)
      toast({ title: "Publicação removida", description: "A viagem saiu do feed e do seu perfil." })
    })
  }

  const alterar = (mudanca: Partial<Formulario>) => setForm((f) => (f ? { ...f, ...mudanca } : f))

  function escolherFotos(arquivos: File[]) {
    if (!form) return
    // Ao gerenciar, "Trocar fotos" começa um conjunto novo; antes de publicar, acrescenta.
    const resultado = acrescentarFotos(form.fotos ?? [], arquivos, (arquivo) => ({
      arquivo,
      url: URL.createObjectURL(arquivo),
    }))
    alterar({ fotos: resultado.fotos })
    const aviso = avisoDaEscolha(resultado)
    if (aviso) toast({ variant: "destructive", title: "Nem todas as fotos entraram", description: aviso })
  }

  function removerFoto(indice: number) {
    alterar({ fotos: (form?.fotos ?? []).filter((_, i) => i !== indice) })
    // O botão "Remover" some com a miniatura: o foco vai ao de escolher.
    botaoFotos.current?.focus()
  }

  const semTexto =
    tentouEnviar && form && dados ? new Set(lugaresSemTexto(form, dados.previa.lugares).map((l) => l.id)) : new Set<string>()
  const pronto = dados !== null && form !== null && !carregando
  const fotosNaPrevia = form?.fotos ? form.fotos.map((f) => f.url) : (post?.fotos ?? [])

  return (
    <>
      <Button
        type="button"
        onClick={abrir}
        aria-haspopup="dialog"
        className="h-10 rounded-xl bg-citrico px-4 text-grafite hover:bg-citrico/90"
      >
        {publicado ? <Check className="h-4 w-4" aria-hidden /> : <Share2 className="h-4 w-4" aria-hidden />}
        {publicado ? "Publicada" : "Publicar"}
      </Button>

      <Dialog open={aberto} onOpenChange={(v) => (ocupado ? undefined : setAberto(v))}>
        <DialogContent
          // Esc com a lista do "Marcar pessoas" aberta fecha só a lista, não o diálogo.
          onEscapeKeyDown={escFechaSoALista}
          aria-busy={ocupado || carregando}
          className="max-h-[92dvh] max-w-[calc(100%-1rem)] overflow-y-auto rounded-3xl p-4 sm:max-w-2xl sm:p-6"
        >
          <DialogHeader>
            <DialogTitle className="text-2xl">{publicado ? "Sua publicação" : "Publicar viagem"}</DialogTitle>
            <DialogDescription>
              {post
                ? `Publicada em ${new Date(post.created_at).toLocaleDateString("pt-BR")}. As mudanças aparecem para quem segue você.`
                : `${titulo} · ${datas}. Aparece no seu perfil e no feed de quem segue você.`}
            </DialogDescription>
          </DialogHeader>

          {bloqueio && <AvisoDeBloqueio bloqueio={bloqueio} />}

          {!pronto ? (
            <EstadoDaCarga carregando={carregando} falhou={falhou && !bloqueio} aoTentar={() => void recarregar(true)} />
          ) : (
            <>
              <div className="flex flex-col gap-5 sm:flex-row">
                <div className="shrink-0 sm:sticky sm:top-0 sm:w-56 sm:self-start">
                  <SecaoFotos
                    fotos={form.fotos}
                    atuais={post?.fotos ?? []}
                    publicado={publicado}
                    desabilitado={ocupado}
                    enviando={acao === "fotos"}
                    refBotao={botaoFotos}
                    aoEscolher={escolherFotos}
                    aoRemover={removerFoto}
                    aoRemoverTodas={() => alterar({ fotos: [] })}
                    aoManter={() => alterar({ fotos: null })}
                  />
                </div>

                <div className="min-w-0 flex-1 space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <Label htmlFor="pub-titulo">Título da publicação</Label>
                      <span id="pub-titulo-contador" className="text-xs font-medium text-muted-foreground">
                        {form.titulo.length} de {LIMITE_TITULO}
                      </span>
                    </div>
                    <Input
                      id="pub-titulo"
                      maxLength={LIMITE_TITULO}
                      value={form.titulo}
                      onChange={(e) => alterar({ titulo: e.target.value })}
                      disabled={ocupado}
                      aria-describedby="pub-titulo-contador pub-titulo-ajuda"
                      placeholder={dados.previa.title}
                      className="h-11 rounded-xl"
                    />
                    <p id="pub-titulo-ajuda" className="text-xs text-muted-foreground">
                      Outras pessoas que publicarem esta viagem não aparecem no seu post; evite nomes no título.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <Label htmlFor="legenda">Legenda</Label>
                      <span id="legenda-contador" className="text-xs font-medium text-muted-foreground">
                        {form.legenda.length} de {LIMITE_LEGENDA}
                      </span>
                    </div>
                    <Textarea
                      id="legenda"
                      maxLength={LIMITE_LEGENDA}
                      value={form.legenda}
                      onChange={(e) => alterar({ legenda: e.target.value })}
                      disabled={ocupado}
                      aria-describedby="legenda-contador"
                      placeholder="Conte em uma frase como foi."
                      className="min-h-24 rounded-xl"
                    />
                  </div>
                  <SecaoMarcar
                    form={form}
                    alterar={alterar}
                    marcaveis={dados.marcaveis}
                    recusados={[...idsRecusados(dados)]}
                    desabilitado={ocupado}
                  />
                  <fieldset className="divide-y divide-border">
                    <legend className="mb-1 text-sm font-semibold">O que aparece na publicação</legend>
                    <SecaoRoteiro form={form} alterar={alterar} totalItens={dados.previa.itens.length} desabilitado={ocupado} />
                    <SecaoLugares
                      form={form}
                      alterar={alterar}
                      lugares={dados.previa.lugares}
                      desabilitado={ocupado}
                      semTexto={semTexto}
                    />
                  </fieldset>
                  <p className="flex gap-2 text-xs font-medium text-muted-foreground">
                    <Lock className="h-4 w-4 shrink-0" aria-hidden />
                    Despesas, reservas e códigos de confirmação nunca são publicados.
                  </p>
                </div>
              </div>

              <PreviaPublica form={form} dados={dados} fotos={fotosNaPrevia} semente={viagemId} />
            </>
          )}

          <DialogFooter className="gap-3 sm:items-center sm:justify-between">
            {publicado && pronto ? (
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-xl border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={ocupado}
                onClick={() => setConfirmaDespublicar(true)}
              >
                {acao === "despublicar" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Despublicar
              </Button>
            ) : (
              <span className="hidden sm:block" />
            )}
            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-xl"
                disabled={ocupado}
                onClick={() => setAberto(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="h-11 rounded-xl bg-citrico px-6 text-grafite hover:bg-citrico/90"
                disabled={!pronto || ocupado || bloqueio === "sessao"}
                onClick={() => void salvar()}
              >
                {(acao === "publicar" || acao === "atualizar" || acao === "fotos") && (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                )}
                {acao === "fotos" ? "Enviando as fotos…" : publicado ? "Atualizar publicação" : "Publicar"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={confirmaDespublicar}
        onOpenChange={setConfirmaDespublicar}
        title="Despublicar esta viagem?"
        description="A publicação sai do feed e do seu perfil, com as fotos e as marcações. A viagem em si não muda."
        confirmText="Despublicar"
        variant="destructive"
        onConfirm={() => {
          setConfirmaDespublicar(false)
          void despublicar()
        }}
      />
    </>
  )
}

function AvisoDeBloqueio({ bloqueio }: { bloqueio: Bloqueio }) {
  if (bloqueio === "sessao") {
    return (
      <div role="alert" className="space-y-2 rounded-2xl border border-destructive/40 p-3 text-sm text-destructive">
        <p>Sua sessão expirou.</p>
        <Button asChild variant="outline" size="sm" className="h-11 rounded-xl">
          <Link href="/auth/login">Entrar de novo</Link>
        </Button>
      </div>
    )
  }
  return (
    <div role="alert" className="space-y-2 rounded-2xl border border-border p-3 text-sm">
      <p>Para publicar uma viagem, escolha antes um nome de usuário.</p>
      <Button asChild variant="outline" size="sm" className="h-11 rounded-xl">
        <Link href="/dashboard/perfil">Escolher nome de usuário</Link>
      </Button>
    </div>
  )
}

function EstadoDaCarga({ carregando, falhou, aoTentar }: { carregando: boolean; falhou: boolean; aoTentar: () => void }) {
  if (carregando) {
    return (
      <p role="status" className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Carregando a publicação…
      </p>
    )
  }
  if (!falhou) return null
  return (
    <div role="alert" className="space-y-2 py-6 text-sm">
      <p>Não foi possível carregar a publicação.</p>
      <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={aoTentar}>
        Tentar de novo
      </Button>
    </div>
  )
}
