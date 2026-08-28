---
id: S03-M-migration-social
titulo: Migration do social: perfil público e follows
trilha: T1
responsavel: micael
revisor: fernando
semana: S03
requisitos: []
secoes_doc: [18, 25]
branch: feat/S03-M-migration-social
tipo: [migration, rls]
status: backlog
---
# Migration do social: perfil público e follows

> **Micael** · semana **S03** (09 a 15/09) · marco da semana: _Convite chega no e-mail de verdade_

## 1. Contexto

profiles ganha username, bio e is_public; entra a tabela follows.

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

- [ ] username e único e validado
- [ ] Perfil privado não vaza nem o nome em listagem
- [ ] Toda tabela nova tem RLS habilitada e policy por operação usada
- [ ] Nome do arquivo segue `<timestamp>_<dominio>_<descrição>.sql`
- [ ] `npm run db:types` rodado e `types/database.ts` commitado junto
- [ ] SELECT vazio não e aceito como prova: INSERT tambem e testado
- [ ] Policy usa participação (trip_members), não propriedade (user_id)

## 6. Evidência

- [ ] Saida dos testes
- [ ] Screenshot ou gravação do fluxo (se houver tela)
- [ ] Delta de cobertura (se mexeu em `lib/`)
