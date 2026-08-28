---
id: S05-F-escopo-grupo
titulo: Escopo de grupo em todas as consultas
trilha: T1
responsavel: fernando
revisor: audrey
semana: S05
requisitos: []
secoes_doc: [22.3, 20, 21]
branch: feat/S05-F-escopo-grupo
tipo: [regra-de-negocio, route-handler]
status: backlog
---
# Escopo de grupo em todas as consultas

> **Fernando** · semana **S05** (23 a 29/09) · marco da semana: _Zero escrita no banco a partir do navegador_

## 1. Contexto

finances, places, bookings e itinerary filtram por user_id, o que esconde dados de viagens compartilhadas de quem foi convidado — contradizendo a premissa do produto.

## 2. Arquivos afetados

_A preencher antes de comecar: caminhos concretos, incluindo migration se houver dado novo._

## 3. Passos

_A preencher._

## 4. O que testar

Obrigatórios pelo tipo (`regra-de-negocio, route-handler`):

- [ ] Teste de que membro convidado enxerga as despesas da viagem
- [ ] Unit com casos de borda
- [ ] Cobertura de ao menos 70% no arquivo
- [ ] Integração cobrindo os 4 caminhos: 200 feliz, 401 sem sessão, 403 não-membro, 400 payload invalido

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. _A preencher._

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [ ] Nenhuma consulta filtra por user_id onde deveria filtrar por participação
- [ ] Função pura, sem I/O
- [ ] Casos de arredondamento cobertos
- [ ] `await params` (nesta versão do Next, params e Promise)
- [ ] Corpo validado por zod, com campos extraidos um a um — nunca `...body`
- [ ] Autorização checada no servidor via `exigirMembro` / `exigirDono`

## 6. Evidência

- [ ] Saida dos testes
- [ ] Screenshot ou gravação do fluxo (se houver tela)
- [ ] Delta de cobertura (se mexeu em `lib/`)
