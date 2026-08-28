---
id: S06-Ab-publicar-viagem
titulo: Publicar viagem sem vazar despesas
trilha: T1
responsavel: abner
revisor: fernando
semana: S06
requisitos: []
secoes_doc: [25]
branch: feat/S06-Ab-publicar-viagem
tipo: [migration, rls, tela]
status: backlog
---
# Publicar viagem sem vazar despesas

> **Abner** · semana **S06** (30/09 a 06/10) · marco da semana: _Fluxo de grupo ponta a ponta_

## 1. Contexto

trip_posts. O ponto técnico e publicar o roteiro sem expor o financeiro nem dados dos outros membros.

## 2. Arquivos afetados

_A preencher antes de comecar: caminhos concretos, incluindo migration se houver dado novo._

## 3. Passos

_A preencher._

## 4. O que testar

Obrigatórios pelo tipo (`migration, rls, tela`):

- [ ] RLS: post público não expoe expenses nem e-mail de membro
- [ ] Aplicação limpa do zero: `npm run db:reset` sobe sem erro
- [ ] Teste em `tests/rls/` com os dois usuários do seed
- [ ] Usuário A não le E não escreve dados de B
- [ ] `npm run test:rls` verde
- [ ] E2E do fluxo com screenshot arquivado em `docs/pfc/evidências/`

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. _A preencher._

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [ ] Nenhum campo financeiro na resposta pública
- [ ] Membros da viagem consentem ou são anonimizados — decidir e registrar em Decisões
- [ ] Toda tabela nova tem RLS habilitada e policy por operação usada
- [ ] Nome do arquivo segue `<timestamp>_<dominio>_<descrição>.sql`
- [ ] `npm run db:types` rodado e `types/database.ts` commitado junto
- [ ] SELECT vazio não e aceito como prova: INSERT tambem e testado
- [ ] Policy usa participação (trip_members), não propriedade (user_id)
- [ ] Funciona em mobile e desktop
- [ ] Feedback por `toast()`; sem `alert()` nem `confirm()`
- [ ] Estado de erro e de carregamento tratados

## 6. Evidência

- [ ] Saida dos testes
- [ ] Screenshot ou gravação do fluxo (se houver tela)
- [ ] Delta de cobertura (se mexeu em `lib/`)
