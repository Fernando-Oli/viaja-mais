---
name: notion
description: Sincroniza os planos em docs/plans/ com o quadro do Notion — cria as databases, empurra atividades e traz o estado do board. Use quando o CI não rodou ou ao montar o quadro pela primeira vez.
---

# Sincronizar com o Notion

O **repositório é a fonte da verdade**; o Notion é espelho, para dar visibilidade à equipe e aos
orientadores. Card e plano divergindo, o plano vence.

Normalmente quem sincroniza é o CI (`.github/workflows/notion.yml`, no abrir e fechar de PR). Use esta
skill quando o CI não rodou, ao montar o quadro pela primeira vez, ou para conferir o estado.

## Comandos

| Situação | Comando |
|---|---|
| Primeira vez — criar as 4 databases | `node scripts/notion/seed.mjs` |
| Empurrar um plano | `node scripts/notion/sync.mjs --plan docs/plans/<ID>-<slug>.md` |
| Empurrar tudo | `node scripts/notion/sync.mjs --all` |
| Trazer o board para o repo | `node scripts/notion/pull.mjs` → `docs/plans/_board.json` |

Precisa de `NOTION_TOKEN` e `NOTION_PARENT_PAGE_ID` no ambiente. Sem eles, os scripts avisam e saem sem
erro — **nunca trave trabalho por causa do Notion.**

Depois do `seed.mjs`, guarde os IDs impressos em `.env.local` e nos secrets do GitHub
(`NOTION_DB_ATIVIDADES`, `NOTION_DB_REQUISITOS`, `NOTION_DB_CRONOGRAMA`, `NOTION_DB_DECISOES`).

## Estados

`sync.mjs` deriva o status do git e do PR, não de opinião:

```
branch criada → Em desenvolvimento
PR aberto → Em revisão
changes requested → Ajustes solicitados
review aprovada → Validação
merge → Concluído
```

Ninguém arrasta card à mão. Se um card está no lugar errado, o conserto é o estado do git ou o
frontmatter do plano — não o Notion.

## Views que o quadro precisa ter

**Por pessoa** (o que cada um tem em mãos agora) · **por semana** (o cronograma) ·
**fila de revisão do Fernando** (tudo em "Em revisão", mais antigo primeiro) · **bloqueados**.

A fila de revisão é a que mais importa: PR parado há mais de 24h é o gargalo mais provável deste projeto,
e ele só aparece se estiver visível.
