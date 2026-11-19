"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MarcacoesDoPerfil } from "./marcacoes-do-perfil";
import { PublicacoesDoPerfil } from "./publicacoes-do-perfil";

/**
 * As abas de um perfil (S06-M-perfil-instagram), as mesmas no próprio perfil
 * (/dashboard/perfil) e no de outra pessoa (/u/<username>): Publicações, a grade
 * de posts, aberta por padrão (RF09.16), e Marcações (RF09.14).
 *
 * Quem a usa só a mostra a quem pode ver a rede do perfil; cada aba lê pela
 * própria rota, que decide de novo (403 vira "Esta conta é privada").
 *
 * @RF09.14 aba Marcações · @RF09.16 aba Publicações
 */
export function PerfilAbas({ username, proprio }: { username: string; proprio: boolean }) {
  return (
    <Tabs defaultValue="publicacoes" className="gap-4">
      <TabsList className="w-full sm:w-fit">
        <TabsTrigger value="publicacoes">Publicações</TabsTrigger>
        <TabsTrigger value="marcacoes">Marcações</TabsTrigger>
      </TabsList>
      <TabsContent value="publicacoes">
        <PublicacoesDoPerfil username={username} proprio={proprio} />
      </TabsContent>
      <TabsContent value="marcacoes">
        <MarcacoesDoPerfil username={username} />
      </TabsContent>
    </Tabs>
  );
}
