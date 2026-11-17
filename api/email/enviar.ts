import nodemailer, { type Transporter } from "nodemailer"
import { envApi } from "../env"

/**
 * Envio de e-mail da API, por SMTP, no lugar do envio embutido no GoTrue.
 *
 * Em desenvolvimento, `SMTP_URL` aponta para o Mailpit do `docker-compose.yml`
 * (interface em http://localhost:58025): nada sai da máquina. Em produção,
 * `SMTP_URL` e `EMAIL_REMETENTE` são obrigatórios (`api/env.ts`).
 *
 * Um transporte só, criado na primeira chamada, para quem não envia e-mail
 * (os testes da maioria das rotas) não abrir conexão com o servidor SMTP.
 */
let transporte: Transporter | undefined

export type Email = { para: string; assunto: string; texto: string; html: string }

export async function enviarEmail({ para, assunto, texto, html }: Email): Promise<void> {
  transporte ??= nodemailer.createTransport(envApi.SMTP_URL)
  await transporte.sendMail({ from: envApi.EMAIL_REMETENTE, to: para, subject: assunto, text: texto, html })
}

/** Escapa texto que vem do usuário (título da viagem, nome) antes de entrar no HTML. */
export function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
}
