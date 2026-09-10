import { z } from "zod"

/**
 * Contrato de entrada da rota de convite.
 *
 * `inviterId` **não** está aqui de propósito: quem convida é sempre a sessão,
 * nunca o corpo da requisição. Antes disso o campo vinha do cliente e era
 * gravado direto em `trip_invitations.inviter_id`, o que permitia forjar
 * convite em nome de outra pessoa.
 */
export const criarConviteSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("informe um e-mail válido")
    // O limite é o do envelope SMTP (RFC 5321), não um número escolhido a esmo.
    .max(320),
  tripId: z.string().uuid("identificador de viagem inválido"),
})

export type CriarConvite = z.infer<typeof criarConviteSchema>
