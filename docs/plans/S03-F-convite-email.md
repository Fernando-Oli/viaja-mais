---
id: S03-F-convite-email
titulo: Convite por e-mail funcionando
trilha: T1
responsavel: fernando
revisor: audrey
semana: S03
requisitos: [RF04]
secoes_doc: [22.2, 25]
branch: feat/S03-F-convite-email
tipo: [route-handler, seguranca]
depende_de: []
status: concluido
---
# Convite por e-mail funcionando

> **Fernando** · semana **S03** (09 a 15/09) · marco da semana: _Convite chega no e-mail de verdade_

## 1. Contexto

O cliente chamado `supabaseAdmin` era na verdade o cliente anon:
`auth.admin.inviteUserByEmail` exige a chave de serviço e sempre falhava, com o
erro engolido. Nenhum convite jamais saiu por e-mail.

A atividade `S02-F-authz-rotas` consertou a autorização da rota e deixou o envio
explicitamente para esta, com o motivo no comentário de
`app/api/invitations/route.ts:82-88`. O efeito observável hoje: o dono convida,
a tela diz que deu certo, a linha entra em `trip_invitations` — e o convidado
só descobre se abrir a aplicação por conta própria. É o que mantém RF04.1 como
Parcial e RF04.2 como Não iniciado no catálogo.

## 2. Arquivos afetados

Nenhuma migration: a tabela `trip_invitations` e suas policies já existem.

- `lib/supabase/admin.ts` — **novo**: único lugar do repositório autorizado a
  usar `SUPABASE_SERVICE_ROLE_KEY`, conforme a regra 4 do `CLAUDE.md`
- `app/api/invitations/route.ts` — passa a enviar o convite pelo cliente admin,
  depois de gravar a linha
- `tests/api/invitations-post.test.ts` — cobre a nova ordem e os dois desfechos
  do envio
- `tests/lib/supabase-admin.test.ts` — **novo**: prova que o cliente admin
  recusa ser construído fora do servidor

## 3. Passos

1. Criar `lib/supabase/admin.ts` com um cliente de service role que:
   - lança se for instanciado no navegador (`typeof window !== "undefined"`);
   - desliga persistência de sessão e auto-refresh — é cliente de uma chamada,
     não de um usuário;
   - obtém a chave por `chaveServiceRole()`, que já existe em `lib/env.ts` e
     falha com mensagem clara quando a variável não está configurada.
2. Inverter a ordem na rota: **gravar a linha primeiro, enviar o e-mail depois**.
   Hoje o envio vem antes do `insert`; se o insert falhasse, já teria saído
   e-mail de um convite que não existe. A linha em `trip_invitations` é a fonte
   da verdade — é por ela que o convidado vê o convite na aplicação.
3. Enviar com o cliente admin, tratando **e-mail já cadastrado como desfecho
   esperado, não como falha**. `inviteUserByEmail` cria o usuário; se a pessoa
   já tem conta, o GoTrue recusa. Nesse caso o convite continua válido e
   aparece na aplicação — a requisição não pode virar erro por isso.
4. Parar de mandar `tripId` e `inviter` em `options.data`. Esse objeto vai para
   `auth.users.user_metadata`, que **o próprio usuário pode editar**; guardar ali
   qualquer coisa parecida com autorização é convite a confusão futura. A fonte
   da verdade já é a linha em `trip_invitations`, protegida por RLS.
5. Escrever os testes e rodar a suíte.
6. Provar no Inbucket (http://localhost:54324) que a mensagem chega.

## 4. O que testar

Obrigatórios pelo tipo (`route-handler, segurança`):

- [x] Convite chega no servidor de e-mail local (localhost:54324)
- [x] Integração cobrindo os 4 caminhos: 200 feliz, 401 sem sessão, 403 não-membro, 400 payload invalido
- [x] Teste que prova a **exploração bloqueada**, não o caminho feliz

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

> **Atenção antes de começar:** o serviço de e-mail local hoje é o **Mailpit**,
> não o Inbucket — o CLI trocou, a porta continua 54324. A API mudou junto:
> `GET /api/v1/messages`, e não `/api/v1/mailbox/<caixa>`.
>
> Confira também que o `.env.local` aponta para o stack local
> (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`) e que
> `SUPABASE_SERVICE_ROLE_KEY` está preenchida. Com a URL de um projeto hospedado
> e a chave do stack local, o GoTrue responde `Invalid API key` — que foi
> exatamente o que aconteceu aqui na primeira tentativa.

1. `npm run setup` (ou `npx supabase start`) → esperado: stack no ar, Mailpit
   respondendo em http://localhost:54324.
2. Entrar como `teste.a@viajamais.local` e criar uma viagem.
3. Convidar um endereço **que ainda não tem conta**, por exemplo
   `convidado@viajamais.local` → esperado: a rota devolve
   `{ success: true, envio: "enviado" }`.
4. Abrir http://localhost:54324 → esperado: uma mensagem para esse endereço,
   com o assunto **"Você foi convidado para uma viagem no ViajaMais"**, em
   português, com o botão "Aceitar convite".
5. Convidar agora `teste.b@viajamais.local`, que **já tem conta** → esperado:
   a rota devolve `{ success: true, envio: "ja-cadastrado" }`, **não** um erro,
   e nenhuma mensagem nova aparece no Mailpit.
6. Entrar como `teste.b@viajamais.local` → esperado: o convite do passo 5
   aparece na aplicação. É esse o caminho de quem já é usuário.
7. Convidar de uma viagem da qual você não é dono → esperado: 403 e
   **nenhuma** mensagem no Mailpit (o envio nunca acontece antes da
   autorização).

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [x] Chave service role só em `lib/supabase/admin.ts`, nunca em componente
- [x] Falha de envio não e silenciosa — vira `envio: "falhou"` na resposta e
      `console.warn` no servidor, em vez de sumir
- [x] `await params` (nesta versão do Next, params e Promise) — não se aplica:
      esta rota não tem segmento dinâmico
- [x] Corpo validado por zod, com campos extraidos um a um — nunca `...body`
- [x] Autorização checada no servidor via `exigirMembro` / `exigirDono`
- [x] A correção tem teste
- [ ] Risco residual registrado em `docs/pfc/evidências/segurança/` — a pasta
      ainda não existe; os riscos estão no bloco 7 abaixo e entram na seção 25
      pela atividade `S12-F-doc-25`

## 7. Risco residual

1. **Quem já tem conta não recebe e-mail nenhum.** `inviteUserByEmail` cria
   usuário; para quem já existe, o GoTrue devolve `email_exists` e não manda
   mensagem. A pessoa só vê o convite ao abrir a aplicação. Resolver de verdade
   pede um remetente próprio (SMTP configurado), que hoje o projeto não tem.
   Registrado aqui em vez de escondido atrás de um `success: true` mudo: a
   resposta diz `envio: "ja-cadastrado"`, e a tela pode avisar quem convidou.
2. **Convite não expira.** `trip_invitations` não tem prazo; um convite de seis
   meses atrás continua aceitável. Não é exploração remota, mas é superfície.
3. **Sem limite de envio por usuário.** Um dono pode disparar convites em
   volume, usando o remetente da plataforma. É o que `RNF02.8` prevê e a
   atividade `S06-F-rate-limit-csp` implementa.
4. **`get_current_user_email()` continua no schema**, com fallback para
   `user_metadata->>'email'`, que o próprio usuário edita. Hoje é código morto —
   nenhuma policy a usa, todas comparam com `auth.jwt()->>'email'` — mas é uma
   arapuca para quem for escrever policy de convite no futuro.

## 6. Evidência

- [ ] Saida dos testes
- [ ] Screenshot ou gravação do fluxo (se houver tela)
- [ ] Delta de cobertura (se mexeu em `lib/`)
