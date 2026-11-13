import { EstadoNaoEncontrado } from "@/components/estado-nao-encontrado"

/**
 * `notFound()` chamado numa página do dashboard — viagem que não existe ou de
 * que a pessoa não participa. Fica dentro do layout do dashboard.
 *
 * @RNF04.4
 */
export default function NaoEncontradoDashboard() {
  return <EstadoNaoEncontrado voltarPara="/dashboard/trips" rotuloVoltar="Ver minhas viagens" />
}
