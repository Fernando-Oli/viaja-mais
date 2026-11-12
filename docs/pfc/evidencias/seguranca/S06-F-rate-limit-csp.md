# S06-F — Rate limiting e CSP: o que foi feito e o que fica de risco

Material de apoio da seção 25. Data: 11/11/2026. Requisitos: RNF02.8 e RNF02.12.

## Ameaças tratadas

| Ameaça | Antes | Depois | Prova |
|---|---|---|---|
| Disparo de e-mail em massa pelo convite, com o nosso domínio | Sem limite | 10 convites por 10 min, por usuário. O 11º recebe 429, sem gravar e sem enviar | `tests/api/invitations-post.test.ts` (429) · `tests/rls/12-rate-limit.test.ts` |
| Adivinhar a senha atual com uma sessão roubada (a troca de senha confere a senha atual) | Sem limite | 5 conferências por 15 min. A 6ª nem chega ao `signInWithPassword` | `tests/api/change-password-route.test.ts` (429) |
| Encher o Storage pelo upload de foto | Só o limite de 2 MB por arquivo | 10 envios por 10 min | `tests/api/social-perfil-foto-route.test.ts` (429) |
| Spam de solicitação para seguir | Sem limite | 30 por minuto | `tests/api/social-seguir-route.test.ts` (429) |
| Usuário zera o próprio contador | — | `rate_limits` sem grant e com policy `using (false)`: SELECT, INSERT, UPDATE e DELETE pela API dão 42501. Chamar a função com outro máximo só faz o contador subir | `tests/rls/12-rate-limit.test.ts`, bloco "exploração bloqueada" |
| XSS carrega script de domínio do atacante | Sem CSP | `script-src` só da própria origem e do Google Maps | `tests/lib/csp.test.ts` |
| XSS manda dado roubado para fora | Sem CSP | `connect-src` só para a própria origem, o Supabase do ambiente e o Google Maps | `tests/lib/csp.test.ts` |
| Clickjacking (a aplicação dentro de iframe de terceiros) | `X-Frame-Options: DENY` | Mantido, mais `frame-ancestors 'none'` | `tests/lib/csp.test.ts` |
| Plugin, troca de `<base>`, formulário enviado para fora | Sem CSP | `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` | `tests/lib/csp.test.ts` |

## Riscos residuais (aceitos, com motivo)

1. **`script-src` admite `'unsafe-inline'`.** Um XSS que injete `<script>` inline na página ainda executa. A alternativa é a CSP com nonce, que obriga todas as páginas a renderizar dinamicamente: as páginas estáticas quebram em produção, sem erro de build, e o custo de servidor sobe. A 20 dias da entrega, o risco de quebrar telas foi maior que o ganho. O que limita o estrago: o script injetado não carrega nada de fora e não consegue mandar dado para fora (`connect-src`), e o React escapa todo texto renderizado, o que torna difícil injetar script inline. **Como fechar:** CSP com nonce no `proxy.ts`, seguindo `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`.
2. **`img-src https:`.** Qualquer imagem `https` carrega, porque as capas de viagem e as fotos de lugares vêm de URLs externas. Uma imagem não executa código; o pior caso é um "pixel" que avisa o servidor de origem que a página foi aberta.
3. **Fail-open.** Se `consumir_limite` falhar (banco fora, função ausente), a requisição passa e o erro vai para o log. A escolha é deliberada: o limitador não pode ser o motivo de um convite legítimo falhar. Enquanto a contagem estiver fora, o limite não vale.
4. **Janela fixa.** Quem chama no fim de uma janela e no começo da seguinte consegue até 2× o máximo em pouco tempo (ex.: 20 convites em 1 segundo, na virada). Para estes limites a margem é aceitável; uma janela deslizante resolveria.
5. **Rotas sem sessão não passam pelo limitador.** Login, cadastro e recuperação de senha são do Supabase Auth, que tem limite próprio por IP (configurável em Authentication → Rate Limits). O limitador desta atividade é por usuário e só vale com sessão.
6. **Ferramenta de comentários da Vercel nos previews.** A CSP não libera `vercel.live`, então a barra de comentários da Vercel pode não carregar nos deploys de preview. Produção não é afetada.

## Como verificar à mão

Roteiro na seção 4 do plano `docs/plans/S06-F-rate-limit-csp.md`: autocomplete do Maps no preview, console sem violação de CSP e o 11º convite recusado.
