import { CapaViagem } from "@/components/brand/capa-viagem"
import { PostCarrossel } from "./post-carrossel"
import {
  dataCurta,
  enderecoPublico,
  horaCurta,
  idsRecusados,
  rotuloCategoria,
  tituloPublico,
  type Formulario,
  type ItemPrevia,
  type RespostaPost,
} from "./publicar-modelo"

/**
 * Prévia compacta do que a cópia vai mostrar, montada da `previa` da rota e das
 * chaves do formulário — nada vem do servidor de novo. Serve para o autor
 * conferir as fotos (no carrossel do post, na ordem escolhida; sem foto, o
 * grafismo da marca com título e datas) e o texto livre (título, legenda e
 * endereços digitados) antes de publicar.
 * A lista do roteiro corta em `MAX_ITENS` para o diálogo não crescer sem fim;
 * os textos livres aparecem inteiros.
 *
 * @RF09.7 publicar viagem — o que fica público
 * @RF09.13 marcar quem viajou junto
 */

const MAX_ITENS = 5

function linhaDoItem(item: ItemPrevia) {
  const quando = [dataCurta(item.date), [horaCurta(item.start_time), horaCurta(item.end_time)].filter(Boolean).join("–")]
    .filter(Boolean)
    .join(" ")
  return [quando, rotuloCategoria(item.category)].filter(Boolean).join(" · ")
}

export function PreviaPublica({
  form,
  dados,
  fotos,
  semente,
}: {
  form: Formulario
  dados: RespostaPost
  /** As URLs que o post vai mostrar, na ordem: as escolhidas (`blob:`) ou as atuais (assinadas). */
  fotos: string[]
  /** A semente do grafismo (o id da viagem), quando não há foto. */
  semente: string
}) {
  const { previa } = dados
  const legenda = form.legenda.trim()
  const itens = previa.itens.slice(0, MAX_ITENS)
  const restantes = previa.itens.length - itens.length
  const recusados = idsRecusados(dados)
  const marcados = form.marcados.filter((p) => !recusados.has(p.id.toLowerCase()))
  const titulo = tituloPublico(form, dados)

  return (
    <section aria-labelledby="pub-previa-titulo" className="rounded-2xl border border-border bg-muted/40 p-4 text-sm">
      <h3 id="pub-previa-titulo" className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Como fica público
      </h3>
      <div className="mb-3 w-full max-w-xs">
        {fotos.length > 0 ? (
          <PostCarrossel
            fotos={fotos.map((src, i) => ({ src, alt: `Foto ${i + 1} da publicação` }))}
            rotulo="Prévia das fotos da publicação"
            className="aspect-square rounded-xl"
          />
        ) : (
          <CapaViagem semente={semente} className="aspect-square rounded-xl text-primary-foreground">
            <div className="absolute inset-x-0 bottom-0 bg-primary px-3 py-2.5">
              <p className="text-base leading-tight font-semibold break-words">{titulo}</p>
              <p className="text-xs font-medium">
                {dataCurta(previa.start_date)} – {dataCurta(previa.end_date)}
              </p>
            </div>
          </CapaViagem>
        )}
      </div>
      <p className="font-semibold break-words">{titulo}</p>
      <p className="text-xs text-muted-foreground break-words">
        {previa.destination} · {dataCurta(previa.start_date)} – {dataCurta(previa.end_date)}
      </p>
      {legenda ? (
        <p className="mt-2 whitespace-pre-line break-words">{legenda}</p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground italic">Sem legenda.</p>
      )}

      {form.roteiro && previa.itens.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold">Roteiro</p>
          <ul className="mt-1 space-y-1.5">
            {itens.map((item, i) => {
              const linha = linhaDoItem(item)
              return (
                <li key={i} className="break-words">
                  <span className="font-medium">{item.title}</span>
                  {linha && <span className="text-xs text-muted-foreground"> · {linha}</span>}
                  {form.mostrarLocal && item.location && (
                    <span className="block text-xs text-muted-foreground">{item.location}</span>
                  )}
                  {form.mostrarDescricao && item.description && (
                    <span className="block text-xs text-muted-foreground">{item.description}</span>
                  )}
                </li>
              )
            })}
          </ul>
          {restantes > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              e mais {restantes === 1 ? "1 item" : `${restantes} itens`}
            </p>
          )}
        </div>
      )}

      {form.lugares && previa.lugares.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold">Lugares</p>
          <ul className="mt-1 space-y-1.5">
            {previa.lugares.map((l) => {
              const endereco = enderecoPublico(form.enderecos[l.id], l)
              const categoria = rotuloCategoria(l.category)
              return (
                <li key={l.id} className="break-words">
                  <span className="font-medium">{l.name}</span>
                  {categoria && <span className="text-xs text-muted-foreground"> · {categoria}</span>}
                  {endereco && <span className="block text-xs text-muted-foreground">{endereco}</span>}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {marcados.length > 0 && (
        <p className="mt-3 text-xs break-words">
          <span className="font-semibold">Com </span>
          {marcados.map((p) => `@${p.username}`).join(", ")}
        </p>
      )}
    </section>
  )
}
