---
id: S14-F-monitor-disponibilidade
titulo: Monitor de disponibilidade em produção e backup confirmado
trilha: T1
responsavel: fernando
revisor: audrey
semana: S14
requisitos: [RNF04.1, RNF04.2]
secoes_doc: ["00", 15, 20, 21, 23, 24]
branch: feat/S14-F-monitor-disponibilidade
tipo: [route-handler, ci, documentacao]
depende_de: [S14-F-entrega]
status: concluido
---
# Monitor de disponibilidade em produção e backup confirmado

## 1. Contexto

O RNF04.1 pede disponibilidade mensal de 99,5%, e nada media isso. O RNF04.2
pede backup diário; ele está configurado no Supabase de produção, conferido pela
equipe no painel em 22/11/2026, mas o documento o dava como não verificado.

O monitor é um workflow agendado do GitHub Actions, gratuito por o repositório
ser público. Não exige conta em serviço externo nem grava arquivo no repositório:
cada execução é uma amostra.

## 2. Arquivos afetados

- `app/api/saude/route.ts` — verificação de saúde, sem sessão e sem dado
- `lib/supabase/proxy.ts` — `/api/saude` pública, por comparação exata
- `scripts/monitor/verificar.mjs` — a verificação, com segunda tentativa
- `.github/workflows/disponibilidade.yml` — agendamento a cada 5 min
- `scripts/pfc/metricas.mjs` — disponibilidade dos últimos 30 dias
- Testes: `tests/api/saude-route.test.ts`, `tests/lib/monitor-verificar.test.ts`,
  `tests/lib/supabase-proxy.test.ts`, `e2e/00-fumaca.spec.ts`
- Documento: seções 15, 20.4, 21, 23, 24.2 e Parte 00

Sem migration: a rota lê `trips` como anônimo, sob a RLS existente.

## 3. Passos

1. Rota `/api/saude` e exceção exata no proxy.
2. Script de verificação com tempo limite e segunda tentativa.
3. Workflow agendado; seção de disponibilidade no `pfc:metricas`.
4. Testes; documento.

## 4. O que testar

Rota sem sessão por natureza: os caminhos 401/403/400 não se aplicam. Em troca:

- [x] 200 com banco ok; 503 quando o banco devolve erro ou nem conecta
- [x] 503 não repassa a mensagem interna do banco
- [x] `Cache-Control: no-store` nas duas respostas
- [x] Proxy: só `/api/saude` exato é público; `/api/saude/x`, `/api/saudex` e
      `/api/trips` continuam 401 sem sessão
- [x] Monitor: queda isolada recuperada na segunda tentativa conta como no ar;
      falha nas duas, como fora do ar; tempo esgotado vira resultado
- [x] E2E: `/api/saude` responde 200 sem sessão contra o stack local

**Roteiro de teste manual**

1. `npm run build` e `npx next start -p 3100`.
2. `node scripts/monitor/verificar.mjs http://localhost:3100` — "No ar", saída 0.
3. `docker stop supabase_db_viaja-mais` e repetir — "FORA DO AR", `/api/saude`
   503, saída 1.
4. `docker start supabase_db_viaja-mais` — volta a "No ar".
5. Depois do merge: Actions › Disponibilidade › Run workflow — execução verde.

## 5. O que validar

- [x] A rota não devolve dado de usuário nem detalhe de erro
- [x] Nenhuma outra rota ficou pública
- [x] Primeira execução verde em produção, depois do deploy (disparada à mão em 22/11, 20:30 UTC)
- [x] `npm run pfc:metricas` calcula a seção de disponibilidade; as amostras agendadas começam a contar a partir da primeira execução automática

## 6. Evidência

Execução local de 22/11/2026 contra o build de produção e o Supabase local:
banco no ar → "No ar" (página 231 ms, saúde 175 ms); banco parado → "FORA DO AR",
`/api/saude` 503 nas duas tentativas; banco de volta → 200.

Produção, 22/11/2026, depois do merge do #84:

- `https://viaja-mais.online/api/saude` → 200, `{"status":"ok","banco":"ok"}`, `Cache-Control: no-store`.
- `node scripts/monitor/verificar.mjs https://viaja-mais.online` → "No ar" (página 833 ms, saúde 682 ms).
- `/api/saude/x`, `/api/saudex` e `/api/trips` sem sessão → 401: nenhuma outra rota abriu.
- Workflow Disponibilidade disparado na `main`: https://github.com/Fernando-Oli/viaja-mais/actions/runs/45066849079 — sucesso.
