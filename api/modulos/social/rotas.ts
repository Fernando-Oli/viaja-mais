import { Hono, type Context } from "hono"
import { ErroHttp, naoEncontrado, semPermissao } from "../../../lib/erros"
import { atualizarPerfilSchema, formatoUsernameSchema } from "../../../lib/schemas/perfil"
import { buscaPessoasSchema } from "../../../lib/schemas/busca"
import { consultaRedeSchema } from "../../../lib/schemas/rede"
import { consultaSolicitacoesSchema } from "../../../lib/schemas/solicitacoes"
import { registrarPesquisaSchema } from "../../../lib/schemas/pesquisa"
import { LIMITES } from "../../../lib/seguranca/limite"
import { juntarResultados } from "../../../lib/social/busca"
import { assinarAvatar, assinarAvatares } from "../../arquivos/avatares"
import { comoUsuario, type Tx } from "../../db/como-usuario"
import { respostaInvalida } from "../../http/erros"
import { exigirLimiteNaTx } from "../../http/limite"
import { lerCorpo } from "../../http/parametros"
import { exigirSessao, type VariaveisSessao } from "../../http/sessao"
import * as repo from "./repositorio"

/**
 * A rede social, em `/api/social`. Portada de `app/api/social/**`. A foto do
 * próprio perfil (`/perfil/foto`) está em `./foto.ts`.
 *
 * Nada aqui é recurso de viagem, então não há `exigirMembro`. A regra de cada
 * rota se garante pela origem do id: quem age é sempre a sessão, e a URL ou o
 * corpo só dizem **sobre quem** (um username, validado no formato da leitura —
 * fora dele, 400 sem consultar o banco). A RLS de `profiles`, `follows` e
 * `search_history` é a segunda linha. Onde há regra de visibilidade além da
 * sessão (a rede de um perfil), ela é explícita, pela função do banco.
 *
 * As respostas levam o que a tela mostra, campo a campo, sem o `id` de
 * ninguém, e não vão para cache compartilhado.
 *
 * Fotos: o banco guarda o caminho no bucket, e as respostas levam um link
 * assinado de validade curta (`api/arquivos/avatares.ts`).
 *
 * @RF02.1 @RF02.2 @RF02.5 @RF02.6 @RF02.7 @RF02.8 perfil
 * @RF09.1 @RF09.2 @RF09.3 @RF09.4 @RF09.5 @RF09.6 @RF09.9 @RF09.10 @RF09.12 rede social
 * @RF13.2 Zona 1 da central · @RNF02.11 erro do banco não vaza
 */

const SEM_CACHE = { "Cache-Control": "private, no-store" } as const

/** Violação de unicidade. Em `profiles`, a única unique editável é o username. */
const VIOLA_UNICIDADE = "23505"

type Pessoa = { id: string; username: string; full_name: string | null; avatar_url: string | null; is_public: boolean }

/**
 * As pessoas como as listas as mostram: sem o id, e com a foto como link
 * assinado (o banco guarda o caminho no bucket). Todas as fotos de uma vez.
 */
async function pessoas(lista: Pessoa[]) {
  const fotos = await assinarAvatares(lista)
  return lista.map((p, i) => ({ username: p.username, full_name: p.full_name, avatar_url: fotos[i], is_public: p.is_public }))
}

/** O username da URL, no formato da leitura; fora dele, 400 sem ir ao banco. */
function lerUsername(c: Context) {
  return formatoUsernameSchema.safeParse(c.req.param("username"))
}

/** 404 com código estável, para a tela saber o que fazer. */
const naoAchou = (c: Context, error: string, codigo: string) => c.json({ error, codigo }, 404)

/**
 * O perfil de outra pessoa como quem visita o vê: dados básicos, vínculo e
 * contadores. É a mesma resposta de ver, seguir e deixar de seguir, para a tela
 * receber o estado já atualizado. `sem_username` diz se quem vê ainda não
 * escolheu um nome de usuário (sem ele, não entra na rede de ninguém).
 *
 * @RF02.8 perfil de outro usuário · @RF09.9 sem username, fora da rede
 */
async function perfilVisto(tx: Tx, quemVe: string, perfil: repo.PerfilAlvo) {
  const contagem = await repo.contarRede(tx, perfil.id)
  const vinculo = await repo.vinculoCom(tx, quemVe, perfil.id)
  const comUsername = quemVe === perfil.id ? true : await repo.temUsername(tx, quemVe)
  return {
    username: perfil.username as string,
    full_name: perfil.full_name,
    avatar_url: await assinarAvatar(perfil),
    bio: perfil.bio,
    is_public: perfil.is_public,
    vinculo,
    seguidores: contagem.seguidores,
    seguindo: contagem.seguindo,
    sem_username: !comUsername,
  }
}

/** Monta o GET de uma das duas listas da rede. */
function listaDaRede(lado: repo.Lado) {
  return async (c: Context<{ Variables: VariaveisSessao }>) => {
    const nome = lerUsername(c)
    if (!nome.success) return respostaInvalida(c, nome.error)
    const consulta = consultaRedeSchema.safeParse(c.req.query())
    if (!consulta.success) return respostaInvalida(c, consulta.error)
    const eu = c.var.usuario.id

    const resultado = await comoUsuario(c.var.usuario, async (tx) => {
      const perfil = await repo.perfilPorUsername(tx, nome.data)
      if (!perfil) throw naoEncontrado("Perfil")
      // A RLS de `follows` sozinha não bastaria: ela mostra um vínculo a quem
      // pode ver a rede de qualquer um dos lados.
      if (!(await repo.podeVerRede(tx, perfil.id))) throw semPermissao("a rede deste perfil")
      const pagina = await repo.listarRede(tx, perfil.id, lado, consulta.data.cursor)
      return pagina && { ...pagina, proprio: perfil.id === eu }
    })
    if (!resultado) return c.json({ error: "A lista mudou; recarregue", codigo: "cursor_invalido" }, 400)
    return c.json(
      { pessoas: await pessoas(resultado.pagina), proximo: resultado.proximo, proprio: resultado.proprio },
      200,
      SEM_CACHE,
    )
  }
}

export const rotasSocial = new Hono<{ Variables: VariaveisSessao }>()
  .use(exigirSessao)

  // ── O próprio perfil ─────────────────────────────────────────────────────
  // Sem parâmetro por onde pedir o perfil de outra pessoa: o id vem da sessão.

  .get("/perfil", async (c) => {
    const perfil = await comoUsuario(c.var.usuario, (tx) => repo.proprioPerfil(tx, c.var.usuario.id))
    if (!perfil) throw naoEncontrado("Perfil")
    return c.json({ perfil: { ...perfil, avatar_url: await assinarAvatar(perfil) } }, 200, SEM_CACHE)
  })

  .patch("/perfil", async (c) => {
    const analise = atualizarPerfilSchema.safeParse(await lerCorpo(c))
    if (!analise.success) return respostaInvalida(c, analise.error)

    const perfil = await comoUsuario(c.var.usuario, async (tx) => {
      try {
        return await repo.atualizarPerfil(tx, c.var.usuario.id, analise.data)
      } catch (erro) {
        if ((erro as { code?: string }).code === VIOLA_UNICIDADE) {
          throw new ErroHttp(409, "Esse nome de usuário já está em uso")
        }
        throw erro
      }
    })
    if (!perfil) throw naoEncontrado("Perfil")
    return c.json({ perfil: { ...perfil, avatar_url: await assinarAvatar(perfil) } }, 200, SEM_CACHE)
  })

  // ── Busca e perfil de outra pessoa ───────────────────────────────────────

  .get("/perfis", async (c) => {
    const analise = buscaPessoasSchema.safeParse(c.req.query("busca") ?? "")
    if (!analise.success) return respostaInvalida(c, analise.error)
    const listas = await comoUsuario(c.var.usuario, (tx) => repo.buscarPessoas(tx, c.var.usuario.id, analise.data))
    return c.json({ pessoas: await pessoas(juntarResultados(listas, analise.data)) }, 200, SEM_CACHE)
  })

  .get("/perfis/:username", async (c) => {
    const nome = lerUsername(c)
    if (!nome.success) return respostaInvalida(c, nome.error)
    const perfil = await comoUsuario(c.var.usuario, async (tx) => {
      const alvo = await repo.perfilPorUsername(tx, nome.data)
      if (!alvo) throw naoEncontrado("Perfil")
      return perfilVisto(tx, c.var.usuario.id, alvo)
    })
    return c.json({ perfil }, 200, SEM_CACHE)
  })

  .get("/perfis/:username/seguidores", listaDaRede("seguidores"))
  .get("/perfis/:username/seguindo", listaDaRede("seguindo"))

  // ── Seguir e deixar de seguir ────────────────────────────────────────────
  // O follower é sempre a sessão; a URL só diz quem seguir.

  .post("/perfis/:username/seguir", async (c) => {
    const nome = lerUsername(c)
    if (!nome.success) return respostaInvalida(c, nome.error)
    const eu = c.var.usuario.id

    const resultado = await comoUsuario(c.var.usuario, async (tx) => {
      const alvo = await repo.perfilPorUsername(tx, nome.data)
      if (!alvo) throw naoEncontrado("Perfil")
      if (alvo.id === eu) throw new ErroHttp(400, "Você não pode seguir a si mesmo")
      // Seguir perfil privado gera solicitação para a outra pessoa (RNF02.8).
      await exigirLimiteNaTx(tx, LIMITES.seguir)
      // Sem username, o seguidor ficaria invisível na lista do dono e não
      // poderia ser removido. A policy `follows_insert` recusa o mesmo.
      if (!(await repo.temUsername(tx, eu))) return null
      await repo.seguir(tx, eu, alvo.id)
      return perfilVisto(tx, eu, alvo)
    })
    if (!resultado) {
      return c.json({ error: "Escolha um nome de usuário para seguir alguém", codigo: "sem_username" }, 403)
    }
    return c.json({ perfil: resultado }, 200, SEM_CACHE)
  })

  .delete("/perfis/:username/seguir", async (c) => {
    const nome = lerUsername(c)
    if (!nome.success) return respostaInvalida(c, nome.error)
    const eu = c.var.usuario.id

    const perfil = await comoUsuario(c.var.usuario, async (tx) => {
      const alvo = await repo.perfilPorUsername(tx, nome.data)
      if (!alvo) throw naoEncontrado("Perfil")
      if (alvo.id === eu) throw new ErroHttp(400, "Não existe vínculo com o próprio perfil")
      await repo.deixarDeSeguir(tx, eu, alvo.id)
      return perfilVisto(tx, eu, alvo)
    })
    return c.json({ perfil }, 200, SEM_CACHE)
  })

  // ── Os próprios seguidores e solicitações ────────────────────────────────
  // O dono é sempre a sessão. Não há 403: ninguém alcança os de outra pessoa.

  .delete("/seguidores/:username", async (c) => {
    const nome = lerUsername(c)
    if (!nome.success) return respostaInvalida(c, nome.error)
    const desfecho = await comoUsuario(c.var.usuario, async (tx) => {
      const alvo = await repo.perfilPorUsername(tx, nome.data)
      if (!alvo) return "perfil_nao_encontrado" as const
      return (await repo.removerSeguidor(tx, c.var.usuario.id, alvo.id)) ? ("ok" as const) : ("nao_e_seguidor" as const)
    })
    if (desfecho === "perfil_nao_encontrado") return naoAchou(c, "Perfil não encontrado", desfecho)
    if (desfecho === "nao_e_seguidor") return naoAchou(c, "Essa pessoa não segue você", desfecho)
    return c.json({ success: true })
  })

  .get("/solicitacoes", async (c) => {
    const analise = consultaSolicitacoesSchema.safeParse(c.req.query())
    if (!analise.success) return respostaInvalida(c, analise.error)
    const dono = c.var.usuario.id

    if (analise.data.contagem) {
      const total = await comoUsuario(c.var.usuario, (tx) => repo.contarSolicitacoes(tx, dono))
      return c.json({ total }, 200, SEM_CACHE)
    }
    const { perfis, total } = await comoUsuario(c.var.usuario, (tx) => repo.listarSolicitacoes(tx, dono))
    return c.json({ solicitacoes: await pessoas(perfis), total }, 200, SEM_CACHE)
  })

  .post("/solicitacoes/:username", (c) => resolverSolicitacao(c, "aprovar"))
  .delete("/solicitacoes/:username", (c) => resolverSolicitacao(c, "recusar"))

  // ── Histórico de pesquisa ────────────────────────────────────────────────
  // Só o próprio: o dono vem da sessão, e o corpo ou a URL dizem quem foi aberto.

  .get("/pesquisas", async (c) => {
    const recentes = await comoUsuario(c.var.usuario, (tx) => repo.listarRecentes(tx, c.var.usuario.id))
    return c.json({ recentes: await pessoas(recentes) }, 200, SEM_CACHE)
  })

  .post("/pesquisas", async (c) => {
    const analise = registrarPesquisaSchema.safeParse(await lerCorpo(c))
    if (!analise.success) return respostaInvalida(c, analise.error)
    const eu = c.var.usuario.id
    await comoUsuario(c.var.usuario, async (tx) => {
      const alvo = await repo.perfilPorUsername(tx, analise.data.username)
      if (!alvo) throw naoEncontrado("Perfil")
      if (alvo.id === eu) throw new ErroHttp(400, "O próprio perfil não entra no histórico")
      await repo.registrarPesquisa(tx, eu, alvo.id)
    })
    return c.json({ success: true })
  })

  .delete("/pesquisas", async (c) => {
    await comoUsuario(c.var.usuario, (tx) => repo.limparHistorico(tx, c.var.usuario.id))
    return c.json({ success: true })
  })

  .delete("/pesquisas/:username", async (c) => {
    const nome = lerUsername(c)
    if (!nome.success) return respostaInvalida(c, nome.error)
    await comoUsuario(c.var.usuario, async (tx) => {
      const alvo = await repo.perfilPorUsername(tx, nome.data)
      if (!alvo) throw naoEncontrado("Perfil")
      await repo.apagarDoHistorico(tx, c.var.usuario.id, alvo.id)
    })
    return c.json({ success: true })
  })

/** Aprovar ou recusar a solicitação que `username` mandou à sessão. @RF09.4 */
async function resolverSolicitacao(c: Context<{ Variables: VariaveisSessao }>, acao: "aprovar" | "recusar") {
  const nome = lerUsername(c)
  if (!nome.success) return respostaInvalida(c, nome.error)
  const desfecho = await comoUsuario(c.var.usuario, async (tx) => {
    const alvo = await repo.perfilPorUsername(tx, nome.data)
    if (!alvo) return "perfil_nao_encontrado" as const
    return (await repo.resolverSolicitacao(tx, c.var.usuario.id, alvo.id, acao)) ? ("ok" as const) : ("sem_pendente" as const)
  })
  if (desfecho === "perfil_nao_encontrado") return naoAchou(c, "Perfil não encontrado", desfecho)
  if (desfecho === "sem_pendente") return naoAchou(c, "Solicitação não encontrada", desfecho)
  return c.json({ success: true })
}
