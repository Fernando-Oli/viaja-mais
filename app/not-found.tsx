import { EstadoNaoEncontrado } from "@/components/estado-nao-encontrado"

/**
 * Endereço que não corresponde a nenhuma rota. Antes caía na página padrão do
 * Next, em inglês.
 *
 * @RNF04.4
 */
export default function NaoEncontrado() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <EstadoNaoEncontrado voltarPara="/" rotuloVoltar="Ir para o início" />
    </main>
  )
}
