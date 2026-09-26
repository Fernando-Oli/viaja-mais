---
id: S04-F-testes-rls
titulo: Testes de RLS com dois usuários
trilha: T5
responsavel: fernando
revisor: audrey
semana: S04
requisitos: []
secoes_doc: [25]
branch: feat/S04-F-testes-rls
tipo: [rls, seguranca]
status: em-revisao
---
# Testes de RLS com dois usuários

> **Fernando** · semana **S04** (16 a 22/09) · marco da semana: _RLS provada por teste_

## 1. Contexto

Evidência central da seção 25. O contexto original desta atividade — "a RLS não
é verificada por nenhum teste" — **ficou obsoleto**: `S03-F-integridade-rls`
entregou `tests/rls/01-isolamento.test.ts`, com dois usuários reais provando
leitura e escrita, e `db.yml` já aplica as migrations do zero antes de rodá-lo.

O que restava é mais estreito, e é um buraco de verdade: os testes estruturais
de `00-estrutura.test.ts` — "toda tabela tem RLS habilitada", "toda tabela com
RLS tem ao menos uma policy" — estavam sob `describe.skipIf(!DATABASE_URL)`.
No CI a variável existe e eles rodam; **na máquina de quem abre o PR, não**. A
suíte dizia "passou" sem ter verificado nada disso.

É o modo de falha que o próprio `guarda-ambiente.ts` declara inaceitável:
"pular em silêncio é pior do que não ter o teste — a saída diz 'passou' e
ninguém percebe que a RLS não foi verificada". A trava valia para as variáveis
da API e não valia para a conexão direta.

## 2. Arquivos afetados

- `tests/rls/preparar-ambiente.ts` — **novo**: lê as credenciais do `.env.local`
- `vitest.rls.config.mts` — registra o setup acima
- `tests/rls/00-estrutura.test.ts` — deixa de pular; passa a exigir e a validar
  que `DATABASE_URL` é local
- `tests/rls/guarda-ambiente.ts` — mensagem de erro e justificativa atualizadas
- `tests/rls/README.md` — como rodar, em dois comandos

## 3. Passos

1. Ler `API_URL`, `ANON_KEY` e `DATABASE_URL` do `.env.local`, que neste projeto
   aponta sempre para o stack local. O que já estiver no ambiente tem
   precedência — é assim que o CI e um override pontual seguem funcionando.
2. Trocar `describe.skipIf(!CONEXAO)` por exigência: sem a variável, erro com
   instrução, nunca "passou".
3. Passar `DATABASE_URL` por `exigirLocal`. A trava já valia para a API; a
   conexão direta ficava de fora, e é ela que abre transação no banco.
4. Fechar a conexão em `afterAll` — estava aberta até o fim do processo.

## 4. O que testar

Obrigatórios pelo tipo (`rls, segurança`):

- [x] db.yml aplica todas as migrations num Postgres vazio — já vinha de
      `S03-F-integridade-rls`
- [x] Usuário A não le E não escreve dados de B — `01-isolamento.test.ts`
- [x] `npm run test:rls` verde — 23 testes, **zero pulados** (eram 2)
- [x] Teste que prova a **exploração bloqueada**, não o caminho feliz

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. Com o stack de pé e **sem exportar variável nenhuma**, rodar
   `npm run test:rls` → esperado: 23 testes passando, nenhum pulado.
2. Conferir a saída: nenhuma linha `skipped`. Antes desta atividade eram duas.
3. Derrubar o stack (`npm run db:stop`), apagar temporariamente o `.env.local` e
   rodar de novo → esperado: erro dizendo qual variável falta e como consertar,
   **não** uma suíte verde.
4. Apontar `DATABASE_URL` para qualquer host que não seja local e rodar →
   esperado: recusa de `exigirLocal`, antes de abrir conexão.

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [x] Cada tabela tem RLS habilitada e ao menos uma policy — e agora o teste que
      verifica isso **roda de verdade** na máquina de quem abre o PR
- [x] SELECT vazio não e aceito como prova: INSERT tambem e testado
- [x] Policy usa participação (trip_members), não propriedade (user_id)
- [x] A correção tem teste — o próprio `00-estrutura.test.ts`, que antes pulava
- [x] Nenhum teste da suíte de RLS pula em silêncio
- [x] A trava de alvo local vale também para a conexão direta, não só para a API
- [ ] Risco residual registrado em `docs/pfc/evidências/segurança/` — a pasta
      ainda não existe; entra pela `S12-F-doc-25`

## 6. Evidência

- [x] Saida dos testes: 23 passando, zero pulados
- [x] Não aplicável: screenshot e cobertura — sem tela e sem mudança em `lib/`
