import { Client } from "pg"
import { exigirLocal } from "../../tests/rls/guarda-ambiente"

/**
 * Apaga as recusas de marcação (`public.post_tag_recusas`) entre as contas do
 * seed com estes e-mails.
 *
 * Desde S14-F-marcacao-privada, a recusa vale por (autora, pessoa) em qualquer
 * post e não some com o post nem com a viagem — de propósito, para a autora
 * não a contornar apagando o post. Não há tela para desfazê-la. Os specs que
 * removem uma marca deixariam a pessoa sem poder ser marcada de novo pela
 * mesma autora no resto da suíte; esta função devolve o estado do seed. A
 * recusa em si é provada por tests/rls/17-post-tags.test.ts.
 *
 * Só age com DATABASE_URL de banco local (a mesma guarda de zerarLimites).
 */
export async function zerarRecusas(emails: readonly string[]): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) return

  const db = new Client({ connectionString: exigirLocal(url, "DATABASE_URL") })
  await db.connect()
  try {
    await db.query(
      `delete from public.post_tag_recusas r
        using auth.users autora, auth.users pessoa
        where autora.id = r.author_id
          and pessoa.id = r.tagged_id
          and autora.email = any($1::text[])
          and pessoa.email = any($1::text[])`,
      [emails],
    )
  } finally {
    await db.end()
  }
}
