import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { criarClienteAdmin } from "@/lib/supabase/admin"
import { naoAutenticado, respostaDeErro, respostaInvalida } from "@/lib/http"
import { buscaPessoasSchema } from "@/lib/schemas/busca"
import { SEM_CACHE_COMPARTILHADO, assinarAvatares } from "@/lib/social/avatar"
import { BUSCA_LIMITE, juntarResultados, padraoContem } from "@/lib/social/busca"

/**
 * Busca de pessoas por nome ou username: o painel da aba Rede social.
 *
 * Segue o molde de app/api/trips/[tripId]/route.ts, com duas diferenças
 * deliberadas:
 *
 *   - Sem `params`: a rota não tem segmento dinâmico; o termo vem em `?busca=`.
 *   - Sem `exigirMembro` / `exigirDono`: buscar não é recurso de viagem. Pelo
 *     catálogo (RF09.10), qualquer autenticado busca, e nome, username e foto
 *     são visíveis também em perfil privado. A regra é "só autenticado", e o
 *     `getUser()` a garante; a RLS de `profiles` é a segunda linha (anon não lê).
 *
 * O termo vai como valor de `.ilike()` e de `.eq()`, uma consulta por critério, e
 * não montado num `.or(...)`: dentro do `.or()`, vírgula e parêntese digitados
 * virariam parte do filtro do PostgREST. Os curingas são tratados em
 * lib/social/busca.ts.
 *
 * São três consultas: o username exato (para a @ana aparecer mesmo entre muitas
 * Anas), os que contêm o termo no nome e os que o contêm no username. As duas
 * últimas vêm ordenadas por nome no banco antes do limite, para os 20 escolhidos
 * serem os primeiros em ordem de nome, e não 20 quaisquer.
 *
 * Ficam de fora quem busca e as contas sem username (anteriores ao social, que
 * ainda não têm página). A resposta leva só o que o painel mostra, campo a
 * campo: o `id` é lido só para o helper da foto conferir que ela está na pasta
 * do dono, e não sai. As fotos vão como URL assinada (bucket privado,
 * S04-M-foto-privada), todas numa chamada ao Storage, e a resposta não vai para
 * cache compartilhado.
 *
 * @RF09.10 buscar pessoas · @RNF02.11 erro do banco não vaza
 */

const COLUNAS = "id, username, full_name, avatar_url, is_public"

async function usuarioAtual(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw naoAutenticado()
  return user
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const user = await usuarioAtual(supabase)

    const analise = buscaPessoasSchema.safeParse(new URL(request.url).searchParams.get("busca") ?? "")
    if (!analise.success) return respostaInvalida(analise.error.flatten())
    const termo = analise.data
    const padrao = padraoContem(termo)

    // Quem busca e as contas sem username ficam de fora das três.
    const outrasPessoas = () =>
      supabase.from("profiles").select(COLUNAS).neq("id", user.id).not("username", "is", null)
    const emOrdemDeNome = { ascending: true, nullsFirst: true }

    const consultas = await Promise.all([
      outrasPessoas().eq("username", termo).limit(1),
      outrasPessoas().ilike("full_name", padrao).order("full_name", emOrdemDeNome).limit(BUSCA_LIMITE),
      outrasPessoas().ilike("username", padrao).order("full_name", emOrdemDeNome).limit(BUSCA_LIMITE),
    ])
    for (const { error } of consultas) if (error) throw error

    // Sem erro, o PostgREST sempre devolve a lista (vazia, se nada casou).
    const encontradas = juntarResultados(
      consultas.map(({ data }) => data!),
      termo,
    )
    // O banco guarda o caminho no bucket; o painel recebe a URL assinada.
    const fotos = await assinarAvatares(criarClienteAdmin, encontradas)
    const pessoas = encontradas.map((pessoa, i) => ({
      username: pessoa.username,
      full_name: pessoa.full_name,
      avatar_url: fotos[i],
      is_public: pessoa.is_public,
    }))
    return NextResponse.json({ pessoas }, { headers: SEM_CACHE_COMPARTILHADO })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}
