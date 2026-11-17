---
id: S13-F-foto-s3
titulo: Foto de perfil por S3 (AWS em produção, SeaweedFS local)
trilha: T6
responsavel: fernando
revisor: micael
semana: S13
requisitos: [RF02.2, RNF02.8, RNF02.10, RNF02.11, RNF02.12]
secoes_doc: [5, 20, 22.2, 22.3, 25]
branch: feat/S13-F-sem-supabase
tipo: [route-handler, infra]
depende_de: [S13-F-porte-social]
status: em-desenvolvimento
---
# Foto de perfil por S3

> **Fernando** · semana **S13** · Etapa 2 de 4 do plano "Avori sem Supabase", última leva

## 1. Contexto

A foto de perfil morava no Supabase Storage, que saiu junto com ele. O plano
de evolução previa o MinIO, mas a edição comunitária foi descontinuada (sem
imagem Docker desde outubro de 2025, repositório arquivado em abril de 2026).

**Decisão (17/11/2026, com o Fernando):** produção no **S3 da AWS**; em
desenvolvimento, o **SeaweedFS** no `docker-compose.yml`, que fala o mesmo
protocolo. A API usa o SDK oficial (`@aws-sdk/client-s3`) e o código é o mesmo
nos dois; mudam só endereço, chaves e o endereçamento do bucket (`api/env.ts`).

Descartados:

- **AWS Emulator** (oficial, lançado em 11/11/2026): só HTTPS com certificado
  próprio em `127.0.0.1`, e o navegador precisa abrir o link assinado da foto;
  links assinados não estão documentados; sem imagem publicada. Reavaliar
  quando amadurecer — trocar é mudar o container e as variáveis.
- **LocalStack**: desde março de 2026 a imagem exige conta e token.

## 2. O que mudou

- `docker-compose.yml`: serviço `armazenamento` (`chrislusf/seaweedfs:4.52`),
  gateway S3 em `localhost:58333`, chaves em `armazenamento/s3.json`. O bucket
  é criado pela API na primeira foto, só fora de produção; em produção ele é
  provisionado na AWS e a API não tem permissão para criá-lo.
- `api/arquivos/armazenamento.ts`: enviar, apagar, listar a pasta e assinar
  leitura. `api/arquivos/avatares.ts`: o reaproveitamento de links de
  `lib/social/avatar.ts`, com a assinatura injetada.
- `api/modulos/social/foto.ts`: `POST`/`DELETE /api/social/perfil/foto`, a
  mesma regra da rota do Next — assinatura do arquivo pelos bytes, troca
  condicional (duas abas → 409, sem arquivo órfão), varredura das sobras da
  pasta. O tamanho agora é barrado na leitura do corpo (`bodyLimit`), não só
  pelo cabeçalho.
- Toda resposta social e `GET /api/profile/:id` voltam a levar a foto, como
  link assinado de 10 minutos.
- CSP: `img-src` aceita a origem do armazenamento quando ele é `http://`
  (local). Em produção, `https:` já cobre. `ARMAZENAMENTO_URL_PUBLICA` em `lib/env.ts`.
- `app/api` do Next ficou vazio: nenhuma rota de API mora mais nele.
- Ficam por ora `lib/social/{avatar,rede,solicitacoes}.ts` e o teste do
  primeiro: só `tests/rls/09` e `10`, que ainda rodam contra a stack antiga,
  os usam. Saem quando esses testes migrarem.

## 3. O que testar

- [x] Envio: grava na pasta da pessoa, o link assinado abre a mesma imagem e
  chega também por `/api/profile/:id` (`tests/integracao/foto.test.ts`).
- [x] Troca: a foto anterior e sobras antigas da pasta saem; o tipo vem dos
  bytes, não do nome.
- [x] 400 para arquivo que não é imagem e campo ausente; 413 acima de 2 MB sem
  gravar; 401; 429 sem gravar.
- [x] 409 quando outra aba troca a foto no meio do envio, e o arquivo do envio
  recusado não fica no bucket (o teste segura a linha do perfil até o envio
  esperar no banco).
- [x] Remoção: perfil sem foto e arquivo apagado.
- [x] Links: reaproveitamento, teto de 1000, pasta de outra pessoa e caminho
  fora do formato não assinados, falha vira nulo (`tests/api/avatares.test.ts`).
- [x] CSP: a origem local entra no `img-src`; a da AWS não precisa (`tests/lib/csp.test.ts`).
- [x] Navegador (Chromium): foto enviada aparece no menu e no perfil, sem
  violação de CSP.

## 4. O que validar

- [x] Bucket privado: o navegador só recebe link assinado, nunca caminho ou chave.
- [x] Só a pasta da própria pessoa é apagada (`caminhoApagavel`).
- [x] Variáveis só por `api/env.ts` e `lib/env.ts`; produção sem padrão local.
- [x] Tags de requisito nas rotas novas e nos testes novos.

## Pendente para produção

- Criar o bucket privado na AWS e um papel IAM para a máquina com
  `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` e `s3:ListBucket` nele, e
  só nele.
- Apagar a conta não apaga os arquivos dela no bucket (já era assim com o
  Supabase). Cabe uma regra de ciclo de vida ou um job, junto da exclusão de conta.

## Andamento (17/11/2026)

- Integração: 168 de 168. Unitária: 468 de 468. Rastreabilidade sem inconsistências.
