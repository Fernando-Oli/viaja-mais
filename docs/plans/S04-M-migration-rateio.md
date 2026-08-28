---
id: S04-M-migration-rateio
titulo: Migration do rateio: expense_shares e paid_by
trilha: T1
responsavel: micael
revisor: fernando
semana: S04
requisitos: []
secoes_doc: [18]
branch: feat/S04-M-migration-rateio
tipo: [migration, rls]
status: backlog
---
# Migration do rateio: expense_shares e paid_by

> **Micael** · semana **S04** (16 a 22/09) · marco da semana: _RLS provada por teste_

## 1. Contexto

Base da divisão de custos: quem pagou e quanto cada um deve.

## 2. Arquivos afetados

_A preencher antes de comecar: caminhos concretos, incluindo migration se houver dado novo._

## 3. Passos

_A preencher._

## 4. O que testar

Obrigatórios pelo tipo (`migration, rls`):

- [ ] Aplicação limpa do zero: `npm run db:reset` sobe sem erro
- [ ] Teste em `tests/rls/` com os dois usuários do seed
- [ ] Usuário A não le E não escreve dados de B
- [ ] `npm run test:rls` verde

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. _A preencher._

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [ ] Dinheiro em NUMERIC, nunca float
- [ ] Soma das partes bate com o valor da despesa
- [ ] Toda tabela nova tem RLS habilitada e policy por operação usada
- [ ] Nome do arquivo segue `<timestamp>_<dominio>_<descrição>.sql`
- [ ] `npm run db:types` rodado e `types/database.ts` commitado junto
- [ ] SELECT vazio não e aceito como prova: INSERT tambem e testado
- [ ] Policy usa participação (trip_members), não propriedade (user_id)

## 6. Evidência

- [ ] Saida dos testes
- [ ] Screenshot ou gravação do fluxo (se houver tela)
- [ ] Delta de cobertura (se mexeu em `lib/`)
