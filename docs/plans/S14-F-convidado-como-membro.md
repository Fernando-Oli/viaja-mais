---
id: S14-F-convidado-como-membro
titulo: Convidado entra na viagem só como membro
trilha: T1
responsavel: fernando
revisor: audrey
semana: S14
requisitos: [RF04.3, RNF02.4]
secoes_doc: [25]
branch: fix/S14-F-convidado-como-membro
tipo: [migration, rls, seguranca, bug]
depende_de: []
status: em-revisao
---

## 1. Contexto

A policy `trip_members_insert` exige que a pessoa insira a si mesma e tenha
convite pendente, mas não olhava a coluna `role`. Com um convite pendente, o
convidado gravava a própria linha com `role = 'owner'` direto pela API do banco.
`exigirDono()` lê `trip_members.role` e passava a tratá-lo como dono.

Achado na revisão de segurança feita para a seção 25 do documento (risco R23).
Era a quarta hipótese registrada na entrega de 18/10, a única que não entrou nas
correções de 12/11.

## 2. Arquivos afetados

- `supabase/migrations/20261122160000_plataforma_convidado_entra_como_membro.sql`
- `tests/rls/06-plataforma-convite.test.ts`

`types/database.ts` não muda: a migration só altera a expressão de uma policy.

## 3. Passos

1. Escrever o teste que reproduz a entrada como dono e vê-lo falhar.
2. `alter policy` acrescentando `role = 'member'` ao `with check`.
3. `npm run db:reset` e `npm run test:rls`.

## 4. O que testar

- [x] Aplicação limpa do zero: 22 migrations, sem erro
- [x] RLS com dois usuários: convidado com convite pendente não entra como `owner`
- [x] Regressão: o teste falha antes da migration e passa depois
- [x] O aceite legítimo continua funcionando (`role = 'member'`)

**Roteiro de teste manual**

1. `npm run db:reset` — termina sem erro, com 22 migrations.
2. `npm run test:rls` — 474 testes passando.
3. Para ver a falha: remover a migration, `npm run db:reset`, rodar
   `npx vitest run --config vitest.rls.config.mts tests/rls/06-plataforma-convite.test.ts`
   — "com convite pendente, o Bruno não entra como dono" falha.

## 5. O que validar

- [x] Convidado não consegue se inserir com papel de dono
- [x] A linha do dono, gravada pelo gatilho na criação da viagem, não é afetada
- [x] Nenhum outro teste de RLS mudou de resultado
- [ ] Consulta de conferência do fim da migration rodada em produção, voltando vazia
- [ ] Migration aplicada em produção (o merge não aplica)

## 6. Evidência

- Antes: `1 failed | 9 passed` em `06-plataforma-convite.test.ts`, com
  "o convidado entrou na viagem com papel de dono".
- Depois: `Test Files 21 passed (21) · Tests 474 passed (474)` em `npm run test:rls`.
