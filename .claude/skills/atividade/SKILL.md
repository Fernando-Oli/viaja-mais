---
name: atividade
description: Abre uma nova atividade do PFC — cria o plano em docs/plans/, a branch e o card no Notion, com os blocos "O que testar" e "O que validar" já preenchidos pelo tipo. Use ao começar qualquer trabalho novo no ViajaMais.
---

# Abrir uma atividade

Uso: `/atividade S03-A-editar-viagem` — ou sem argumento, e você pergunta o que é.

ID no formato `S<semana>-<inicial>-<slug>`. Iniciais: **F**ernando, **A**udrey,
**M**icael, **Ab**ner — Abner leva duas letras porque Audrey já ocupa o A.
O ID e o nome do arquivo precisam ser idênticos e sem acento: são chave de
casamento do card no Notion e nome de branch.

Nada de código começa sem passar por aqui. O motivo é o processo acordado pela equipe: quem implementa
precisa saber **o que vai ter que provar** antes de começar, e quem revisa precisa de critérios objetivos
escritos antes da implementação — não negociados depois, quando já há código para defender.

## Passos

### 1. Reúna o essencial

Pergunte só o que não der para inferir: título, requisito (RF/RNF), responsável, tipo(s).

O **tipo** define os testes obrigatórios, então não deixe vago. Combine quantos forem verdade:
`migration`, `rls`, `route-handler`, `regra-de-negocio`, `tela`, `componente`, `correcao-de-bug`,
`seguranca`, `documentacao`, `infra`.

O **responsável** sai do domínio (ver `CLAUDE.md`): Plataforma → Fernando · Viagem & Itinerário → Audrey ·
Financeiro → Micael · Social & IA → Abner. Se a atividade cruza domínios, ela provavelmente deveria ser
duas atividades — sugira dividir.

Revisor é sempre `fernando`, exceto quando ele for o responsável; aí escolha outro da equipe.

### 2. Escreva `docs/plans/<ID>-<slug>.md`

Use `docs/plans/_template.md`. Preencha o frontmatter e **pré-preencha os blocos 4 e 5** a partir da
tabela abaixo. Não deixe o bloco 5 genérico: transforme cada linha em um critério verificável desta
atividade. "Retorna 403 para não-membro" é fraco; "GET /api/trips/:id com sessão de usuário que não está
em trip_members retorna 403 e não vaza o título da viagem" é um critério.

| tipo | Testes obrigatórios (bloco 4) | Validação (bloco 5) |
|---|---|---|
| `migration` / `rls` | Aplicação limpa do zero + teste em `tests/rls/` com dois usuários provando isolamento de leitura **e** escrita | `supabase db reset` roda e a aplicação sobe; toda tabela nova tem RLS habilitada e policy por operação usada |
| `route-handler` | Integração cobrindo 200 feliz · 401 sem sessão · 403 não-membro/não-dono · 400 payload inválido | Corpo validado por zod com campos extraídos um a um (sem spread); autorização checada no servidor |
| `regra-de-negocio` | Unit com casos de borda; cobertura ≥70% no arquivo | Função pura, sem I/O; casos de arredondamento cobertos |
| `tela` / `componente` | E2E do fluxo com screenshot em `docs/pfc/evidencias/` | Funciona em mobile e desktop; feedback via `toast()`, sem `alert()`/`confirm()`; estado de erro e de carregamento tratados |
| `correcao-de-bug` | Teste de regressão que **falha antes** e passa depois | O bug original foi reproduzido antes do fix e não reproduz depois |
| `seguranca` | Teste que prova a **exploração bloqueada**, não o caminho feliz | A correção tem teste; risco residual documentado |

### 3. Crie a branch

`git checkout -b feat/<ID>` — prefixo `feat/`, `fix/`, `chore/` ou `docs/` conforme o caso.
Se houver trabalho não commitado na branch atual, avise antes de trocar.

### 4. Registre no Notion

`node scripts/notion/sync.mjs --plan docs/plans/<ID>-<slug>.md`

Sem `NOTION_TOKEN` no ambiente, o script avisa e segue — o plano no repositório é a fonte da verdade;
o Notion é espelho. Não trave a atividade por causa disso.

### 5. Imprima o combinado

Mostre em cinco linhas: o que vai ser feito, quais testes serão exigidos, quais critérios o revisor vai
cobrar, a branch criada e o próximo comando. Sem repetir o plano inteiro.

## Se a atividade for grande demais

PR acima de ~400 linhas trava a fila de revisão. Se o plano já nasce com mais de uns oito passos ou toca
mais de dois domínios, diga isso e proponha a divisão antes de criar a branch.
