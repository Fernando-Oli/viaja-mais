---
id: S06-F-env-opcional-vazia
titulo: Variável de ambiente opcional vazia conta como ausente
trilha: T1
responsavel: fernando
revisor: audrey
semana: S06
requisitos: [RNF04]
secoes_doc: []
branch: fix/S06-F-env-opcional-vazia
tipo: [regra-de-negocio, correcao-de-bug]
depende_de: []
status: em-revisao
---

## 1. Contexto

O `.env.example` traz `GEMINI_API_KEY=` e `ANTHROPIC_API_KEY=` vazias. Quem o copia sem
preencher fica com string vazia, e `z.string().min(1).optional()` só aceita a variável
**ausente**: `envServidor()` lança, e toda rota que a chama responde 500 — envio de foto de
perfil e `POST /api/invitations` incluídos. Achado ao rodar o E2E da foto (#30) localmente.

## 2. Arquivos afetados

- `lib/env.ts` — string vazia vira `undefined` antes de validar as opcionais e `AI_PROVIDER`
- `tests/lib/env.test.ts` — novo

## 3. Passos

1. `z.preprocess` que troca `""` por `undefined` nas variáveis de servidor opcionais.
2. Teste com as variáveis vazias, ausentes e preenchidas.

## 4. O que testar

- [ ] Unit: com `GEMINI_API_KEY=""` e `ANTHROPIC_API_KEY=""`, `envServidor()` não lança e devolve `undefined` nelas (falha antes)
- [ ] Unit: `AI_PROVIDER=""` cai no padrão `fake`
- [ ] Unit: valor inválido continua lançando (`AI_PROVIDER=openai`)
- [ ] Unit: `chaveServiceRole()` com a chave vazia lança a mensagem que explica onde pegá-la
- [ ] E2E `foto-perfil` verde com o `.env.local` copiado do `.env.example`

## 5. O que validar

- [ ] Variável opcional vazia e variável opcional ausente se comportam igual
- [ ] Variável obrigatória (públicas) vazia continua falhando no boot
- [ ] Nenhuma variável ganha valor padrão que esconda configuração errada além do `AI_PROVIDER=fake`, que já existia

## 6. Evidência

- [ ] Saída do teste unitário e do E2E da foto
