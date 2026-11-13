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
| Auth | Cadastro sem confirmação de e-mail (**F3**); senha mínima de 6 caracteres, sem requisito (**F4**). |

## Achados

| # | Risco | Onde | Medida | Teste |
|---|---|---|---|---|
| F1 · média | `POST /api/trips` gravava os campos do corpo sem validar. O `criarViagemSchema` existia e não era usado: status fora da lista, orçamento negativo e data fora do formato chegavam ao banco | `app/api/trips/route.ts` | Valida com `criarViagemSchema`; campos extraídos do resultado do zod; `user_id` da sessão | `tests/api/trips-post.test.ts` (6 payloads inválidos sem insert; campo extra não chega ao banco) |
| F2 · baixa | Mensagem interna do Postgres ou do GoTrue devolvida ao cliente, com nome de constraint e coluna, embora o RNF02.11 estivesse marcado como Atendido | `trips/route.ts` (GET e POST), `trips/[tripId]/route.ts` (PATCH e DELETE, o arquivo-molde das rotas), `invitations/[id]/decline`, `auth/change-password` | Mensagem genérica em português; detalhe só no log do servidor | `tests/api/trips-post.test.ts` (constraint não aparece na resposta), `tests/api/change-password-route.test.ts` |
| F3 · alta | **Cadastro sem confirmação de e-mail.** Quem se cadastra primeiro com o e-mail de outra pessoa passa a receber os convites que eram para ela, e entra na viagem | Auth (`enable_confirmations = false`) | **Risco aceito**, ver abaixo | — |
| F4 · baixa | Senha mínima de 6 caracteres, sem requisito nenhum | Auth + três telas + rota de troca | 8 caracteres, com letra e número, no Auth e na tela (`lib/seguranca/senha.ts`) | `tests/rls/14-politica-senha.test.ts` (o Auth recusa direto pela API), `tests/lib/senha.test.ts`, `tests/api/change-password-route.test.ts` |

## Risco aceito: F3, cadastro sem confirmação de e-mail

**O cenário.** A dona convida `fulano@exemplo.com`. Se outra pessoa já tiver criado uma conta com esse endereço, sem ter acesso à caixa de entrada dele, essa conta vê o convite, aceita e passa a ver o itinerário, as despesas e os membros da viagem.

**Por que ficou aberto.** A correção é ligar a confirmação de e-mail, e isso exige um SMTP próprio: o SMTP padrão do Supabase só entrega para os membros da organização. A confirmação foi desligada na S05-F justamente porque nenhum e-mail de cadastro chegava. A 8 dias do congelamento, trocar o fluxo de cadastro arrisca deixar todo mundo sem acesso.

**O que limita o estrago.** O atacante precisa saber, antes da vítima, o e-mail exato que vai ser convidado, e se cadastrar com ele antes de a vítima criar a própria conta. Quem já tem conta não é afetado: o e-mail é único no Auth.

**Como fechar.** SMTP próprio (por exemplo, Resend com o domínio `viaja-mais.online`), depois ligar *Confirm email* no painel (Authentication → Providers → Email) e `enable_confirmations = true` no `config.toml`.

## Ação manual em produção

A política de senha do F4 também precisa ser aplicada no painel do projeto hospedado: **Authentication → Policies → Minimum password length = 8** e **Password requirements = Letters and digits**. O `config.toml` só vale para o ambiente local.
