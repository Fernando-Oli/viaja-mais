import { PostDetalhe } from "@/components/social/post-detalhe"

/**
 * /feed/<id>: o detalhe de um post (redesenho de 18/11, modelo do Instagram).
 *
 * Server Component só para ler o `params` (Promise no Next 16,
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md);
 * o post é lido pela tela em GET /api/social/posts/[postId], que decide quem
 * pode ver e responde 404 tanto para o que não existe quanto para o que a
 * sessão não pode ver.
 *
 * @RF09.17 detalhe do post
 */

export default async function PostPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params
  return <PostDetalhe postId={postId} />
}
