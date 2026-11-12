---
id: S06-F-rate-limit-csp
titulo: Rate limiting e Content-Security-Policy
trilha: T5
responsavel: fernando
revisor: audrey
semana: S06
requisitos: [RNF02.8, RNF02.12]
secoes_doc: [15, 25]
branch: feat/S06-F-rate-limit-csp
tipo: [seguranca, migration, rls, route-handler]
depende_de: []
status: em-revisao
---
# Rate limiting e Content-Security-Policy

> **Fernando** · planejada para a S06, feita na S12 (11/11). Estava atrasada, e é item de "nunca cortar".

## 1. Contexto

Quatro rotas podem ser abusadas, e nenhuma tem limite:

- `POST /api/invitations` dispara e-mail real pelo GoTrue. Um dono de viagem pode mandar e-mails sem limite para qualquer endereço, usando o nosso domínio.
- `POST /api/auth/change-password` confere a senha atual com `signInWithPassword`. Quem tem uma sessão roubada pode testar senhas atuais sem limite.
- `POST /api/social/perfil/foto` grava no Storage com a chave de serviço.
- `POST /api/social/perfis/[username]/seguir` gera notificação de solicitação para a outra pessoa.

A aplicação também não manda Content-Security-Policy, e um XSS hoje carrega script de qualquer domínio e manda dado para qualquer lugar.

### Decisões

- **Contador no Postgres, por usuário**: uma tabela `rate_limits` e uma função `consumir_limite()`. Na Vercel cada requisição pode cair numa instância diferente, então um contador em memória não vale nada. Redis seria um serviço novo, com credencial nova, a 9 dias do congelamento. Contar por usuário, e não por IP, evita que o limite caia para quem troca de rede e que uma NAT inteira seja bloqueada.
- **Janela fixa**, uma linha por (usuário, regra), com atualização atômica (`INSERT … ON CONFLICT DO UPDATE`). A tabela tem no máximo usuários × regras linhas, então não precisa de limpeza.
- **Se o limitador falhar, a rota segue** (fail-open, com log). Uma falha no contador não pode derrubar convite nem troca de senha. Isso vai registrado como risco residual.
- **CSP sem nonce**, a variante "Without Nonces" do guia do Next 16 (`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`). A CSP com nonce obriga todas as páginas a renderizar dinamicamente, e o risco de quebrar uma página estática em produção agora é maior que o ganho. Fica `'unsafe-inline'` em `script-src`, registrado como risco residual. A CSP ainda bloqueia `object-src`, troca de `base-uri`, iframe de terceiros (`frame-ancestors`), saída para domínio não listado (`connect-src`) e envio de formulário para fora (`form-action`).
- **A CSP é aplicada no `proxy.ts`**, e não em `next.config.mjs`, porque precisa da URL do Supabase, e variável de ambiente só se lê por `lib/env.ts` (regra 5).

### Limites

| Regra | Rota | Máximo | Janela |
|---|---|---|---|
| `convite` | `POST /api/invitations` | 10 | 10 min |
| `trocar-senha` | `POST /api/auth/change-password` | 5 | 15 min |
| `foto-perfil` | `POST /api/social/perfil/foto` | 10 | 10 min |
| `seguir` | `POST /api/social/perfis/[username]/seguir` | 30 | 1 min |

O convite permite 10, e não 5: uma viagem em grupo de 8 pessoas precisa caber numa rodada só.

## 2. Arquivos afetados

- `supabase/migrations/20261111230000_plataforma_rate_limit.sql` — tabela `rate_limits` + `consumir_limite()`
- `lib/seguranca/limite.ts` — `exigirLimite()` e as regras
- `lib/seguranca/csp.ts` — `montarCsp()`, função pura
- `lib/http.ts` — `ErroHttp` ganha cabeçalhos; 429 sai com `Retry-After`
- `lib/env.ts` — `emDesenvolvimento`
- `proxy.ts` — aplica a CSP em toda resposta
- `next.config.mjs` — tira a nota "a CSP entra na S06"
- as 4 rotas acima — chamam `exigirLimite()` logo depois de identificar o usuário
- `types/database.ts` — regenerado
- `docs/pfc/03-publico/15-requisitos-nao-funcionais.md` — RNF02.8 (Atendido) e RNF02.12 (Parcial: sem nonce)
- `docs/pfc/evidencias/seguranca/S06-F-rate-limit-csp.md` — risco residual

## 3. Passos

1. Migration + teste de RLS (`tests/rls/12-rate-limit.test.ts`).
2. `lib/seguranca/limite.ts` + unit; aplicar nas 4 rotas; um teste 429 por rota.
3. `lib/seguranca/csp.ts` + unit; `proxy.ts`.
4. Catálogo, evidência, `db:types`.

## 4. O que testar

**RLS / migration** (`tests/rls/12-rate-limit.test.ts`, Postgres real, usuários do seed):
- [x] A 11ª chamada de `consumir_limite('convite', 10, 600)` da Ana volta `permitido = false` com `retry_after > 0`
- [x] O contador da Ana não afeta o do Bruno: depois de a Ana estourar, a primeira chamada do Bruno é permitida
- [x] Visitante sem sessão recebe 42501
- [x] A Ana não lê, não altera e não apaga `rate_limits` pela API (nem a própria linha). Exploração: zerar o próprio contador com `update`/`delete` → recusado
- [x] Parâmetro fora da faixa (`maximo = 0`, `janela = 0`, chave vazia ou com mais de 64 caracteres) → erro, sem gravar
- [x] No catálogo: `SECURITY DEFINER`, `search_path` vazio e EXECUTE só para `authenticated`

**Unit** (`tests/lib/limite.test.ts`, `tests/lib/csp.test.ts`):
- [x] `exigirLimite` lança `ErroHttp(429)` com `Retry-After` quando `permitido = false`
- [x] `exigirLimite` não lança quando a RPC falha (fail-open) e registra o erro
- [x] `montarCsp` libera `maps.googleapis.com` em `script-src`, a origem do Supabase em `connect-src` (https e wss), e traz `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'` e `form-action 'self'`
- [x] `montarCsp` só inclui `'unsafe-eval'` em desenvolvimento
- [x] `respostaDeErro` repassa os cabeçalhos do `ErroHttp`

**Integração** (um caso novo em cada teste de rota existente):
- [x] Convite, troca de senha, foto e seguir: com o limite estourado, a resposta é **429** com `Retry-After`, e **nada é gravado nem enviado** (nenhum `inviteUserByEmail`, nenhum `signInWithPassword`, nenhum upload, nenhum insert em `follows`)

**E2E**:
- [x] A suíte Playwright inteira roda com a CSP ativa, no build de produção: 163 passaram. As 3 falhas não têm relação com esta atividade: `acessibilidade` (contraste do card de viagem passada; depende da data) e `rateio-despesa` (instável: espera o centavo extra na linha "Você", mas desde o #41 ele vai para o menor `user_id`).
- [x] `e2e/csp.spec.ts`: o cabeçalho chega, e login, dashboard, abas da viagem e feed carregam sem nenhuma violação de CSP no console
- [x] `e2e/fixtures/limite.ts`: os fluxos que convidam zeram o contador antes, porque a suíte convida mais de 10 vezes com a mesma conta

**Roteiro manual** (preview da Vercel, onde existe a chave real do Maps):
1. Abrir uma viagem → Lugares → digitar no campo de busca → esperado: o autocomplete do Google aparece.
2. DevTools → Console → esperado: nenhuma linha "Refused to … because it violates the following Content Security Policy directive".
3. DevTools → Network → documento → esperado: cabeçalho `content-security-policy` presente.
4. Convidar 11 e-mails seguidos na mesma viagem → esperado: o 11º mostra erro de limite.

## 5. O que validar

- [x] CSP libera `maps.googleapis.com` e a origem do projeto do Supabase
- [x] Limite por usuário, não só por IP
- [x] A 11ª chamada seguida ao convite é recusada com 429, e nenhum e-mail sai
- [x] Ninguém zera o próprio contador pela API
- [ ] O autocomplete do Maps funciona no preview, com a CSP ativa
- [x] A correção tem teste, inclusive o teste que prova a exploração bloqueada
- [x] Risco residual registrado em `docs/pfc/evidencias/seguranca/`

## 6. Evidência

- [x] Saída dos testes: unit 25 · integração 4 rotas (429) + troca de senha 6 · RLS 15 arquivos / 234 · `verify` 882 · E2E 163/166
- [ ] Screenshot do autocomplete no preview + console sem violação de CSP
- [x] Delta de cobertura de `lib/seguranca/`
