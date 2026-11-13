---
id: S12-F-testes-sem-duplicacao
titulo: Helpers de teste num lugar só (RLS e E2E)
trilha: T5
responsavel: fernando
revisor: audrey
semana: S12
requisitos: [RNF05]
secoes_doc: [24]
branch: chore/S12-F-testes-sem-duplicacao
tipo: [infra]
depende_de: []
status: em-revisao
---
# Helpers de teste num lugar só (RLS e E2E)

> **Fernando** · S12 (13/11). Veio da troca de senha do seed (#62), que precisou mexer em 46 arquivos.

## 1. Contexto

Os testes copiavam o mesmo preparo de arquivo em arquivo:

- **RLS:** 17 arquivos com as próprias constantes `API`, `CHAVE` e `CONEXAO`, a própria função de cliente e o próprio `logar`.
- **E2E:** o login pela tela (`entrar`) em 6 lugares, mesmo já havendo um em `e2e/fixtures/contas.ts`; `idDe` e `convidar` em 3; o cadastro pela tela escrito à mão em 5.

Uma mudança de senha, de URL ou do fluxo de login precisava ser feita em todos eles.

## 2. Arquivos afetados

- `tests/rls/apoio.ts` (novo) — `API`, `CHAVE`, `CONEXAO` (com a guarda `exigirLocal`), `novoCliente()` e `logar(email, senha?)`, que devolve `{ cliente, usuario, id }`
- `tests/rls/*.test.ts` (19) — importam do apoio
- `e2e/fixtures/contas.ts` — ganha `idDe` e `convidar`, que passa a conferir também a lista de convites (vinda da cópia do `acerto-contas`)
- `e2e/fixtures/financeiro.ts` — reexporta `entrar` e `idDe` de `contas.ts` e usa `cadastrar`
- `e2e/acerto-contas`, `acerto-transferencias`, `listas`, `rateio-despesa`, `solicitacoes` — sem as cópias

## 3. Passos

1. Uma cópia só é removida quando o corpo é idêntico ao do helper compartilhado (comparação automática).
2. Imports que ficaram sem uso removidos a partir do relatório do ESLint.

## 4. O que testar

- [x] Typecheck limpo; lint de `tests/rls` e `e2e` sem nenhum aviso
- [x] RLS, `verify` e E2E completos com o mesmo número de testes de antes: 280, 928, 177, todos verdes

## 5. O que validar

- [x] Nenhum comportamento de teste mudou: só o lugar de onde vem o helper
- [x] `exigirLocal` continua protegendo os três endereços dos testes de RLS
- [x] RLS: 283 linhas a menos; E2E: 173 a menos

## 6. Evidência

- [x] Saída das três suítes: RLS 280/280 · verify 928 · E2E 177/177
