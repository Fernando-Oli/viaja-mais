# S10-F — Revisão de segurança da aplicação inteira

Material de apoio da seção 25. Data: 12/11/2026. Requisitos: RNF02.2, RNF02.5, RNF02.6 e RNF02.11.

## Escopo e método

Revisão de toda a aplicação, depois da revisão do banco (S08-F, issue #37) e do limite de requisições com CSP (S06-F). Para cada uma das 31 rotas de `app/api/**`, quatro perguntas, nesta ordem:

1. **Autentica?** `getUser()` antes de qualquer acesso a dado.
2. **Autoriza?** Checagem de que *este* usuário pode tocar *este* recurso (`exigirMembro`/`exigirDono`, filtro pela sessão), e não só de que está logado.
3. **Valida?** Corpo validado por zod, campos extraídos um a um, nunca `...body`.
4. **Vaza?** A resposta de erro entrega mensagem interna do Postgres, existência de recurso alheio ou e-mail de terceiro.

Além das rotas: escrita no banco a partir do navegador, `dangerouslySetInnerHTML`, redirect montado a partir de parâmetro da URL, uso da chave de serviço e configuração do Auth.

## Resultado por área

| Área | Resultado |
|---|---|
| Autenticação nas rotas | Todas as 31 autenticam. As listas de seguidores e de seguindo fazem isso no helper compartilhado `lista-da-rede.ts`. |
| Autorização | Rotas de viagem com `exigirMembro`/`exigirDono`; rotas pessoais filtram pela sessão; aceitar convite filtra pelo e-mail da sessão (convite alheio responde 404, sem confirmar que ele existe). |
| Validação | Todas com zod, exceto `POST /api/trips` (**F1**). |
| Vazamento de mensagem | Quatro rotas devolviam a mensagem do Postgres ou do GoTrue (**F2**). |
| Escrita a partir do navegador | Nenhuma: o RNF02.6 passa de Parcial para Atendido. |
| `dangerouslySetInnerHTML` | Nenhum uso fora do componente de gráfico do shadcn. |
| Redirect aberto | Nenhum redirect montado a partir de parâmetro da URL. |
| Chave de serviço | Só em route handlers e em `lib/` de servidor (`lib/supabase/admin.ts`, `lib/social/avatar.ts`). |
| Auth | Cadastro sem confirmação de e-mail no ambiente local (**F3**); senha mínima de 6 caracteres, sem requisito (**F4**). |

## Achados

| # | Risco | Onde | Medida | Teste |
|---|---|---|---|---|
| F1 · média | `POST /api/trips` gravava os campos do corpo sem validar. O `criarViagemSchema` existia e não era usado: status fora da lista, orçamento negativo e data fora do formato chegavam ao banco | `app/api/trips/route.ts` | Valida com `criarViagemSchema`; campos extraídos do resultado do zod; `user_id` da sessão | `tests/api/trips-post.test.ts` (6 payloads inválidos sem insert; campo extra não chega ao banco) |
| F2 · baixa | Mensagem interna do Postgres ou do GoTrue devolvida ao cliente, com nome de constraint e coluna, embora o RNF02.11 estivesse marcado como Atendido | `trips/route.ts` (GET e POST), `trips/[tripId]/route.ts` (PATCH e DELETE, o arquivo-molde das rotas), `invitations/[id]/decline`, `auth/change-password` | Mensagem genérica em português; detalhe só no log do servidor | `tests/api/trips-post.test.ts` (constraint não aparece na resposta), `tests/api/change-password-route.test.ts` |
| F3 · baixa | **Cadastro sem confirmação de e-mail no ambiente local.** Lá, quem se cadastra primeiro com o e-mail de outra pessoa passaria a receber os convites dela. **Em produção a confirmação está ligada** (verificado no painel em 13/11/2026), e o cenário não se aplica | `supabase/config.toml` (`enable_confirmations = false`, de propósito, para desenvolver sem e-mail) | Nenhuma em produção; ver abaixo | — |
| F4 · baixa | Senha mínima de 6 caracteres, sem requisito nenhum | Auth + três telas + rota de troca | 8 caracteres, com minúscula, maiúscula, número e símbolo — a regra de produção — no Auth local e na tela (`lib/seguranca/senha.ts`) | `tests/rls/14-politica-senha.test.ts` (o Auth recusa direto pela API), `tests/lib/senha.test.ts`, `tests/api/change-password-route.test.ts` |

## F3: por que não é risco em produção

**O cenário.** A dona convida `fulano@exemplo.com`. Se outra pessoa já tivesse criado uma conta com esse endereço, sem acesso à caixa de entrada dele, essa conta veria o convite e entraria na viagem.

**Em produção ele não acontece.** A confirmação de e-mail está ligada no projeto hospedado (Authentication → Sign In / Providers → Email → *Confirm email*). Ninguém usa uma conta antes de confirmar o endereço. O desligamento existe só no `supabase/config.toml`, para desenvolver sem depender de e-mail; a tela de cadastro trata os dois modos (`app/auth/sign-up/page.tsx`, S05-F).

**O que fica de risco.** O envio usa o SMTP padrão do Supabase, que tem cota baixa de mensagens por hora. Um pico de cadastros esbarra nela (aconteceu num teste em 13/11, com "email rate limit exceeded"). A saída é um SMTP próprio, por exemplo com o domínio `viaja-mais.online`.

## Configuração do Auth em produção (13/11/2026)

Conferida no painel: *Confirm email* ligado; *Minimum password length* = 8; *Password requirements* = minúscula, maiúscula, número e símbolo. A aplicação e o ambiente local foram alinhados à mesma regra de senha; a senha dos usuários do seed passou a ser `Viaja+mais123` (`tests/fixtures/usuarios.ts`).
