---
id: S06-F-rate-limit-csp
titulo: Rate limiting e Content-Security-Policy
trilha: T5
responsavel: fernando
revisor: audrey
semana: S06
requisitos: [RNF02]
secoes_doc: [25]
branch: feat/S06-F-rate-limit-csp
tipo: [seguranca]
status: backlog
---
# Rate limiting e Content-Security-Policy

> **Fernando** · semana **S06** (30/09 a 06/10) · marco da semana: _Fluxo de grupo ponta a ponta_

## 1. Contexto

Convite e geração por IA são endpoints abusaveis. A CSP ficou para esta semana porque, escrita as pressas, quebra o carregamento do mapa em produção sem avisar.

## 2. Arquivos afetados

_A preencher antes de comecar: caminhos concretos, incluindo migration se houver dado novo._

## 3. Passos

_A preencher._

## 4. O que testar

Obrigatórios pelo tipo (`segurança`):

- [ ] A sexta chamada seguida ao convite e recusada
- [ ] Mapa carrega com a CSP ativa
- [ ] Teste que prova a **exploração bloqueada**, não o caminho feliz

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. _A preencher._

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [ ] CSP libera maps.googleapis.com e o projeto do Supabase
- [ ] Limite por usuário, não só por IP
- [ ] A correção tem teste
- [ ] Risco residual registrado em `docs/pfc/evidências/segurança/`

## 6. Evidência

- [ ] Saida dos testes
- [ ] Screenshot ou gravação do fluxo (se houver tela)
- [ ] Delta de cobertura (se mexeu em `lib/`)
