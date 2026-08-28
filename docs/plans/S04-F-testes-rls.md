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
status: backlog
---
# Testes de RLS com dois usuários

> **Fernando** · semana **S04** (16 a 22/09) · marco da semana: _RLS provada por teste_

## 1. Contexto

Evidência central da seção 25. Hoje a RLS e a única fronteira real de autorização e não e verificada por nenhum teste.

## 2. Arquivos afetados

_A preencher antes de comecar: caminhos concretos, incluindo migration se houver dado novo._

## 3. Passos

_A preencher._

## 4. O que testar

Obrigatórios pelo tipo (`rls, segurança`):

- [ ] db.yml aplica todas as migrations num Postgres vazio
- [ ] Usuário A não le E não escreve dados de B
- [ ] `npm run test:rls` verde
- [ ] Teste que prova a **exploração bloqueada**, não o caminho feliz

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. _A preencher._

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [ ] Cada tabela tem RLS habilitada e ao menos uma policy
- [ ] SELECT vazio não e aceito como prova: INSERT tambem e testado
- [ ] Policy usa participação (trip_members), não propriedade (user_id)
- [ ] A correção tem teste
- [ ] Risco residual registrado em `docs/pfc/evidências/segurança/`

## 6. Evidência

- [ ] Saida dos testes
- [ ] Screenshot ou gravação do fluxo (se houver tela)
- [ ] Delta de cobertura (se mexeu em `lib/`)
