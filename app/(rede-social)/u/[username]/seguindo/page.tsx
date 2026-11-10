import { ListaDaRede } from "../lista-da-rede";

/**
 * /u/<username>/seguindo: quem o perfil segue (S05-M-listas), aberta pelo
 * contador de seguindo.
 *
 * @RF09.6 listas de seguidores e de seguindo
 */
export default async function SeguindoPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return <ListaDaRede username={username} lado="seguindo" />;
}
