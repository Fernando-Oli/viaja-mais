import { ListaDaRede } from "../lista-da-rede";

/**
 * /u/<username>/seguidores: quem segue o perfil (S05-M-listas), aberta pelo
 * contador de seguidores. Na própria lista, cada pessoa tem Remover.
 *
 * @RF09.6 listas de seguidores e de seguindo · @RF09.9 remover seguidor
 */
export default async function SeguidoresPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return <ListaDaRede username={username} lado="seguidores" />;
}
