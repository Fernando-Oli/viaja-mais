import { describe, it, expect } from "vitest"
import {
  aplicarRecusas,
  enviaFotos,
  formularioInicial,
  idsRecusados,
  listarArrobas,
  montarCorpo,
  type RespostaPost,
} from "@/components/social/publicar-modelo"

/**
 * @RF09.7 @RF09.13 — as regras sem I/O do diálogo de publicar viagem: quem
 * recusou (membro ou não) não vai no corpo nem fica selecionado, o 400
 * `marcado_recusou` tira da seleção quem a rota apontou, o estado ao gerenciar
 * sai do `PostVisto`, e as fotos só sobem quando há o que mandar.
 */

const ANA = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", username: "ana", full_name: "Ana", avatar_url: null }
const BIA = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", username: "bia", full_name: null, avatar_url: null }
const CAIO = { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", username: "caio", full_name: "Caio", avatar_url: null }

function dados(mudanca: Partial<RespostaPost> = {}): RespostaPost {
  return {
    previa: { title: "Lisboa", destination: "Lisboa, Portugal", start_date: "2026-06-12", end_date: "2026-06-18", itens: [], lugares: [] },
    marcaveis: [{ ...ANA, recusou: false }],
    recusados: [],
    post: null,
    ...mudanca,
  }
}

describe("idsRecusados", () => {
  it("junta os recusados do GET (membros ou não) e as sugestões com recusou, em minúsculas", () => {
    const ids = idsRecusados(dados({ marcaveis: [{ ...ANA, recusou: true }], recusados: [BIA.id.toUpperCase()] }))
    expect([...ids].sort()).toEqual([ANA.id, BIA.id])
  })
})

describe("montarCorpo", () => {
  it("não manda quem recusou, mesmo não sendo membro, nem repetidos", () => {
    const d = dados({ recusados: [BIA.id] })
    const form = { ...formularioInicial(d), marcados: [ANA, BIA, CAIO, ANA] }
    expect(montarCorpo(form, d).marcados).toEqual([ANA.id, CAIO.id])
  })
})

describe("aplicarRecusas", () => {
  it("tira da seleção quem a rota apontou, junta aos recusados e diz quem saiu", () => {
    const d = dados()
    const form = { ...formularioInicial(d), marcados: [ANA, BIA, CAIO] }
    const r = aplicarRecusas(form, d, [BIA.id, CAIO.id.toUpperCase()])
    expect(r.form.marcados).toEqual([ANA])
    expect(r.removidos.map((p) => p.username)).toEqual(["bia", "caio"])
    expect(new Set(r.dados.recusados)).toEqual(new Set([BIA.id, CAIO.id]))
    expect(listarArrobas(r.removidos)).toBe("@bia e @caio")
  })
})

describe("listarArrobas", () => {
  it("lista com vírgula e 'e'", () => {
    expect(listarArrobas([])).toBe("")
    expect(listarArrobas([ANA])).toBe("@ana")
    expect(listarArrobas([ANA, BIA, CAIO])).toBe("@ana, @bia e @caio")
  })
})

describe("formularioInicial ao gerenciar", () => {
  it("reconstrói da cópia (post.viagem), tira quem recusou e mantém as fotos atuais", () => {
    const d = dados({
      recusados: [BIA.id],
      post: {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        autor: { username: "davi", full_name: null, avatar_url: null },
        caption: "Foi ótimo",
        fotos: ["https://storage.local/1.webp"],
        marcados: [BIA, CAIO],
        created_at: "2026-11-19T10:00:00Z",
        updated_at: "2026-11-19T10:00:00Z",
        proprio: true,
        viagem: {
          title: "Lisboa com a turma",
          destination: "Lisboa, Portugal",
          start_date: "2026-06-12",
          end_date: "2026-06-18",
          items: [{ title: "Alfama", location: "Alfama" }],
          places: [],
        },
      },
    })
    const form = formularioInicial(d)
    expect(form.titulo).toBe("Lisboa com a turma")
    expect(form.legenda).toBe("Foi ótimo")
    expect(form.roteiro).toBe(true)
    expect(form.mostrarLocal).toBe(true)
    expect(form.lugares).toBe(false)
    expect(form.marcados).toEqual([CAIO])
    expect(form.fotos).toBeNull()
  })
})

describe("enviaFotos", () => {
  const base = formularioInicial(dados())
  it("antes de publicar, só com foto escolhida; ao gerenciar, sempre que há troca (inclusive tirar todas)", () => {
    const foto = { arquivo: new File(["x"], "a.jpg", { type: "image/jpeg" }), url: "blob:1" }
    expect(enviaFotos({ ...base, fotos: [] }, false)).toBe(false)
    expect(enviaFotos({ ...base, fotos: [foto] }, false)).toBe(true)
    expect(enviaFotos({ ...base, fotos: null }, true)).toBe(false)
    expect(enviaFotos({ ...base, fotos: [] }, true)).toBe(true)
  })
})
