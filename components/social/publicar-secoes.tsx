"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Switch } from "@/components/ui/switch"
import { MarcarPessoas } from "./marcar-pessoas"
import { MAXIMO_MARCADOS } from "./post-detalhe-modelo"
import {
  LIMITE_ENDERECO,
  rotuloCategoria,
  type EscolhaEndereco,
  type Formulario,
  type LugarPrevia,
  type PessoaMarcavel,
} from "./publicar-modelo"

/**
 * As duas chaves de "O que aparece na publicação" (roteiro e lugares), cada uma
 * com o que abre quando ligada, e o "Marcar pessoas". Visual de linha da
 * prévia do Fernando (components/prototipo/botao-publicar.tsx): rótulo à
 * esquerda, chave à direita.
 *
 * @RF09.7 publicar viagem — roteiro e lugares escolhidos pelo autor
 * @RF09.13 marcar pessoas: qualquer perfil com username, pela busca, com os
 *   membros da viagem como sugestão; quem removeu a própria marcação aparece
 *   desabilitado, com "Removeu a marcação", e não entra na seleção
 */

type Alterar = (mudanca: Partial<Formulario>) => void

function LinhaChave({
  id,
  rotulo,
  ligado,
  aoMudar,
  desabilitado,
  descricao,
  secundaria,
}: {
  id: string
  rotulo: string
  ligado: boolean
  aoMudar: (v: boolean) => void
  desabilitado: boolean
  descricao?: string
  secundaria?: boolean
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <Label htmlFor={id} className={secundaria ? "text-sm font-normal" : "font-medium"}>
          {rotulo}
        </Label>
        {descricao && (
          <p id={`${id}-desc`} className="mt-1 text-xs text-muted-foreground">
            {descricao}
          </p>
        )}
      </div>
      <Switch
        id={id}
        checked={ligado}
        onCheckedChange={aoMudar}
        disabled={desabilitado}
        aria-describedby={descricao ? `${id}-desc` : undefined}
      />
    </div>
  )
}

export function SecaoRoteiro({
  form,
  alterar,
  totalItens,
  desabilitado,
}: {
  form: Formulario
  alterar: Alterar
  totalItens: number
  desabilitado: boolean
}) {
  return (
    <div className="py-1">
      <LinhaChave
        id="pub-roteiro"
        rotulo="Roteiro dia a dia"
        ligado={form.roteiro}
        aoMudar={(v) => alterar({ roteiro: v })}
        desabilitado={desabilitado}
      />
      {form.roteiro && (
        <div className="mb-2 ml-1 border-l-2 border-border pl-3">
          {totalItens === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">A viagem ainda não tem itens no roteiro.</p>
          ) : (
            <p className="py-1 text-xs text-muted-foreground">
              {totalItens === 1 ? "1 item" : `${totalItens} itens`} com título, data, horário e categoria.
            </p>
          )}
          <LinhaChave
            id="pub-roteiro-local"
            rotulo="Mostrar local"
            ligado={form.mostrarLocal}
            aoMudar={(v) => alterar({ mostrarLocal: v })}
            desabilitado={desabilitado}
            secundaria
          />
          <LinhaChave
            id="pub-roteiro-descricao"
            rotulo="Mostrar descrição"
            ligado={form.mostrarDescricao}
            aoMudar={(v) => alterar({ mostrarDescricao: v })}
            desabilitado={desabilitado}
            secundaria
          />
        </div>
      )}
    </div>
  )
}

function EscolhaDoLugar({
  lugar,
  escolha,
  aoMudar,
  desabilitado,
  semTexto,
}: {
  lugar: LugarPrevia
  escolha: EscolhaEndereco
  aoMudar: (e: EscolhaEndereco) => void
  desabilitado: boolean
  semTexto: boolean
}) {
  const base = `pub-lugar-${lugar.id}`
  const temGoogle = !!lugar.address?.trim()
  const categoria = rotuloCategoria(lugar.category)
  return (
    <li className="py-2">
      <p id={`${base}-nome`} className="text-sm font-medium break-words">
        {lugar.name}
        {categoria && <span className="font-normal text-muted-foreground"> · {categoria}</span>}
      </p>
      <RadioGroup
        value={escolha.modo}
        onValueChange={(v) => aoMudar({ ...escolha, modo: v as EscolhaEndereco["modo"] })}
        disabled={desabilitado}
        aria-label={`Endereço de ${lugar.name}`}
        className="mt-1 gap-0"
      >
        <div className="flex min-h-11 items-center gap-2">
          <RadioGroupItem value="nenhum" id={`${base}-nenhum`} />
          <Label htmlFor={`${base}-nenhum`} className="min-h-11 flex-1 font-normal">
            Sem endereço
          </Label>
        </div>
        <div className="flex min-h-11 items-center gap-2">
          <RadioGroupItem value="google" id={`${base}-google`} disabled={!temGoogle} aria-describedby={`${base}-google-desc`} />
          <Label htmlFor={`${base}-google`} className="min-h-11 min-w-0 flex-1 flex-wrap gap-x-1 font-normal">
            Usar o endereço do Google
            <span id={`${base}-google-desc`} className="text-xs text-muted-foreground break-words">
              {temGoogle ? `(${lugar.address})` : "(este lugar não tem endereço salvo)"}
            </span>
          </Label>
        </div>
        <div className="flex min-h-11 items-center gap-2">
          <RadioGroupItem value="digitar" id={`${base}-digitar`} />
          <Label htmlFor={`${base}-digitar`} className="min-h-11 flex-1 font-normal">
            Digitar
          </Label>
        </div>
      </RadioGroup>
      {escolha.modo === "digitar" && (
        <div className="mt-1 space-y-1">
          <Label htmlFor={`${base}-texto`} className="sr-only">
            Endereço digitado de {lugar.name}
          </Label>
          <Input
            id={`${base}-texto`}
            value={escolha.texto}
            maxLength={LIMITE_ENDERECO}
            onChange={(e) => aoMudar({ ...escolha, texto: e.target.value })}
            disabled={desabilitado}
            placeholder="Ex.: Rua das Flores, centro"
            aria-invalid={semTexto || undefined}
            aria-describedby={`${base}-texto-cont`}
            className="h-11 rounded-xl"
          />
          <p id={`${base}-texto-cont`} className={`text-xs ${semTexto ? "text-destructive" : "text-muted-foreground"}`}>
            {semTexto ? "Digite o endereço ou escolha outra opção. " : ""}
            {escolha.texto.length} de {LIMITE_ENDERECO}
          </p>
        </div>
      )}
    </li>
  )
}

export function SecaoLugares({
  form,
  alterar,
  lugares,
  desabilitado,
  semTexto,
}: {
  form: Formulario
  alterar: Alterar
  lugares: LugarPrevia[]
  desabilitado: boolean
  /** Ids dos lugares com "Digitar" e texto vazio, marcados depois de tentar enviar. */
  semTexto: Set<string>
}) {
  return (
    <div className="py-1">
      <LinhaChave
        id="pub-lugares"
        rotulo="Lugares salvos"
        ligado={form.lugares}
        aoMudar={(v) => alterar({ lugares: v })}
        desabilitado={desabilitado}
      />
      {form.lugares && (
        <div className="mb-2 ml-1 border-l-2 border-border pl-3">
          {lugares.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">A viagem ainda não tem lugares salvos.</p>
          ) : (
            <ul className="divide-y divide-border" aria-label="Lugares salvos e o endereço de cada um">
              {lugares.map((l) => (
                <EscolhaDoLugar
                  key={l.id}
                  lugar={l}
                  escolha={form.enderecos[l.id] ?? { modo: "nenhum", texto: "" }}
                  aoMudar={(e) => alterar({ enderecos: { ...form.enderecos, [l.id]: e } })}
                  desabilitado={desabilitado}
                  semTexto={semTexto.has(l.id)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * "Marcar pessoas" no post de viagem (modelo Instagram): o `MarcarPessoas` com
 * os membros da viagem (`marcaveis` do GET) como sugestão e os `recusados` do
 * GET (membros ou não) desabilitados. Substitui a chave "Quem viajou com você": marcar não exige ser
 * membro, e não marcar ninguém é só deixar a lista vazia.
 */
export function SecaoMarcar({
  form,
  alterar,
  marcaveis,
  recusados,
  desabilitado,
}: {
  form: Formulario
  alterar: Alterar
  marcaveis: PessoaMarcavel[]
  /** Ids de quem removeu a própria marcação nesta viagem (`idsRecusados`). */
  recusados: string[]
  desabilitado: boolean
}) {
  return (
    <div className="space-y-1.5">
      <MarcarPessoas
        selecionados={form.marcados}
        aoMudar={(marcados) => alterar({ marcados })}
        sugestoes={marcaveis}
        recusados={recusados}
        maximo={MAXIMO_MARCADOS}
        desabilitado={desabilitado}
      />
      <p className="text-xs text-muted-foreground">
        {marcaveis.length > 0
          ? "Sugestões: quem está na viagem. Busque pelo nome de usuário para marcar outras pessoas."
          : "Busque pelo nome de usuário. Membros da viagem sem nome de usuário não aparecem."}
      </p>
    </div>
  )
}
