import { z } from "zod"
import { reaisParaCentavos } from "@/lib/finance/rateio"

/**
 * Contrato de entrada do registro de um pagamento do acerto de contas.
 *
 * A lista de campos é fechada: `trip_id` sai da URL e o pagador é conferido
 * contra a sessão — nada além disto chega ao `insert`. O valor vai em reais,
 * como o resto da API, e é convertido para centavos sem passar por float
 * (`reaisParaCentavos`).
 *
 * `chave` é a chave de idempotência: o navegador gera uma por tentativa de
 * registro, e reenviar a mesma chave não duplica o pagamento.
 *
 * @RF06.13 registrar como paga uma transferência do acerto
 */
export const registrarTransferenciaSchema = z
  .object({
    de: z.string().uuid("pagador inválido"),
    para: z.string().uuid("recebedor inválido"),
    valor: z
      .union([z.string(), z.number()])
      .refine((v) => (reaisParaCentavos(v) ?? 0) > 0, "informe um valor maior que zero, com até duas casas"),
    moeda: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, "moeda inválida"),
    chave: z.string().uuid("chave de registro inválida"),
  })
  .refine((t) => t.de !== t.para, { message: "pagador e recebedor precisam ser diferentes", path: ["para"] })

export type RegistrarTransferencia = z.infer<typeof registrarTransferenciaSchema>
