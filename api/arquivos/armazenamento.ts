import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { envApi } from "../env"

/**
 * Armazenamento de arquivos por S3, no lugar do Supabase Storage.
 *
 * Em produção, o S3 da AWS. Em desenvolvimento, o SeaweedFS do
 * `docker-compose.yml`, que fala o mesmo protocolo: o código é o mesmo, mudam
 * só endereço e chaves (`api/env.ts`). Com endereço próprio, o bucket vai no
 * caminho da URL (`forcePathStyle`), que é o que servidores locais aceitam.
 *
 * O bucket é privado. O navegador nunca recebe o caminho nem a chave: recebe um
 * link assinado, de validade curta (`assinar`).
 *
 * @RF02.2 foto de perfil · @RNF02.10 acesso privilegiado só no servidor
 */

function criarCliente(endpoint: string | undefined) {
  const { S3_REGIAO, S3_CHAVE_ACESSO, S3_CHAVE_SECRETA } = envApi
  return new S3Client({
    region: S3_REGIAO,
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    ...(S3_CHAVE_ACESSO && S3_CHAVE_SECRETA
      ? { credentials: { accessKeyId: S3_CHAVE_ACESSO, secretAccessKey: S3_CHAVE_SECRETA } }
      : {}),
  })
}

let cliente: S3Client | undefined
/** Assina com o endereço público: o link é aberto pelo navegador, não pela API. */
let assinador: S3Client | undefined

function s3() {
  cliente ??= criarCliente(envApi.S3_ENDPOINT)
  return cliente
}

function s3Publico() {
  assinador ??= envApi.S3_ENDPOINT_PUBLICO ? criarCliente(envApi.S3_ENDPOINT_PUBLICO) : s3()
  return assinador
}

let bucketPronto: Promise<void> | undefined

/**
 * Fora de produção, cria o bucket na primeira escrita: `docker compose up` não
 * tem um passo de criação. Em produção o bucket é provisionado na AWS, e a API
 * não tem (nem deve ter) permissão para criá-lo.
 */
function garantirBucket(bucket: string): Promise<void> {
  if (envApi.NODE_ENV === "production") return Promise.resolve()
  bucketPronto ??= (async () => {
    try {
      await s3().send(new HeadBucketCommand({ Bucket: bucket }))
    } catch {
      await s3().send(new CreateBucketCommand({ Bucket: bucket }))
    }
  })().catch((erro) => {
    bucketPronto = undefined
    throw erro
  })
  return bucketPronto
}

export async function enviarArquivo(bucket: string, caminho: string, bytes: Uint8Array, tipo: string) {
  await garantirBucket(bucket)
  await s3().send(new PutObjectCommand({ Bucket: bucket, Key: caminho, Body: bytes, ContentType: tipo }))
}

/** Apaga os arquivos; devolve os que não saíram. */
export async function apagarArquivos(bucket: string, caminhos: string[]): Promise<string[]> {
  if (caminhos.length === 0) return []
  const resposta = await s3().send(
    new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: caminhos.map((Key) => ({ Key })), Quiet: true } }),
  )
  return (resposta.Errors ?? []).map((e) => e.Key ?? "")
}

/** Até 1000 arquivos de uma pasta, com a data de gravação de cada um. */
export async function listarPasta(bucket: string, pasta: string) {
  const resposta = await s3().send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `${pasta}/` }))
  return (resposta.Contents ?? []).flatMap((o) => (o.Key && o.LastModified ? [{ caminho: o.Key, gravadoEm: o.LastModified }] : []))
}

/** Link de leitura que vale `validadeS` segundos. Assinar não consulta o servidor. */
export function assinarLeitura(bucket: string, caminho: string, validadeS: number): Promise<string> {
  return getSignedUrl(s3Publico(), new GetObjectCommand({ Bucket: bucket, Key: caminho }), { expiresIn: validadeS })
}
