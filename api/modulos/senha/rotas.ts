import type { Context } from "hono"
import { LIMITES } from "../../../lib/seguranca/limite"
import { problemaDeSenha } from "../../../lib/seguranca/senha"
import { auth } from "../../auth/auth"
import { comoUsuario } from "../../db/como-usuario"
import { exigirLimiteNaTx } from "../../http/limite"
import type { VariaveisSessao } from "../../http/sessao"

/**
 * Troca de senha, em `POST /api/auth/change-password`. Portada de
 * `app/api/auth/change-password/route.ts`, com o mesmo contrato (formulário com
 * `current_password`, `new_password` e `confirm_password`).
 *
 * O Better Auth já tem um endpoint neste mesmo caminho. Esta rota é registrada
 * **antes** do handler dele em `api/app.ts` e o encobre de propósito: conferir
 * a senha atual faz da troca um oráculo — quem tem uma sessão roubada testaria
 * senhas à vontade —, e o limite por usuário mora aqui. Ninguém chega ao
 * endpoint nativo sem passar por ele.
 *
 * A troca em si é do Better Auth (hash, conferência da senha atual), chamada
 * por dentro. Ela encerra as **outras** sessões da pessoa e renova a atual: quem
 * roubou uma sessão perde o acesso junto com a senha antiga. O GoTrue não fazia isso.
 *
 * @RF01.8 alterar a própria senha · @RNF02.8 5 conferências de senha por 15 minutos, por usuário
 * @RNF02.11 erro do Auth não vaza
 */
export async function trocarSenha(c: Context<{ Variables: VariaveisSessao }>) {
  const corpo = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>)
  const atual = texto(corpo.current_password)
  const nova = texto(corpo.new_password)
  const confirmacao = texto(corpo.confirm_password)

  // Erro de digitação não chega à conferência da senha e não gasta tentativa.
  if (!atual || !nova || !confirmacao) return c.json({ error: "Todos os campos são obrigatórios" }, 400)
  if (nova !== confirmacao) return c.json({ error: "As senhas não coincidem" }, 400)
  const problema = problemaDeSenha(nova)
  if (problema) return c.json({ error: problema }, 400)
  if (nova === atual) return c.json({ error: "A nova senha precisa ser diferente da atual" }, 400)

  // O limite numa transação própria, que se confirma antes da conferência:
  // tentativa com senha atual errada também conta.
  await comoUsuario(c.var.usuario, (tx) => exigirLimiteNaTx(tx, LIMITES.trocarSenha))

  const cabecalhos = new Headers(c.req.raw.headers)
  cabecalhos.set("content-type", "application/json")
  cabecalhos.delete("content-length")
  const resposta = await auth.handler(
    new Request(c.req.url, {
      method: "POST",
      headers: cabecalhos,
      body: JSON.stringify({ currentPassword: atual, newPassword: nova, revokeOtherSessions: true }),
    }),
  )

  if (!resposta.ok) {
    const { code } = (await resposta.json().catch(() => ({}))) as { code?: string }
    if (code === "INVALID_PASSWORD") return c.json({ error: "Senha atual incorreta" }, 400)
    console.error(`[senha] troca recusada pelo Better Auth: ${resposta.status} ${code ?? ""}`)
    return c.json({ error: "Não foi possível alterar a senha" }, resposta.status === 401 ? 401 : 400)
  }

  // A sessão atual foi renovada: o cookie novo precisa chegar ao navegador.
  for (const cookie of resposta.headers.getSetCookie()) c.header("set-cookie", cookie, { append: true })
  return c.json({ success: true, message: "Senha alterada com sucesso" })
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor : ""
}
