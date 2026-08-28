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
| Primeira vez — criar as 4 databases | `npm run notion:seed` |
| Empurrar um plano | `npm run notion:sync -- --plan docs/plans/<ID>-<slug>.md` |
| Empurrar tudo | `npm run notion:sync -- --all` |
| Trazer o board para o repo | `npm run notion:pull` → `docs/plans/_board.json` |
| Preencher as datas das 14 semanas | `npm run notion:cronograma` |
| Definir prioridade dos requisitos | `npm run notion:requisitos` |

Os dois últimos aceitam `-- --dry`, que mostra o que mudaria sem escrever.

Os scripts leem o `.env.local` sozinhos (`node` não faz isso por conta própria — só o `next dev` faz).
Sem `NOTION_TOKEN`, avisam e saem sem erro — **nunca trave trabalho por causa do Notion.**

O `notion()` espaça as chamadas em 350 ms e respeita o `Retry-After`: o Notion limita a integração a
~3 req/s, e o `--all` faz duas chamadas por plano. Sem isso ele leva 429 no meio e o quadro fica
pela metade. Um `--all` completo leva cerca de um minuto — é esperado, não é travamento.

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

A API do Notion **não configura view** — filtro, agrupamento e tipo de view são clique, não script.
Duas armadilhas que já custaram tempo:

- **"Por pessoa" agrupa por `Responsável`, não por `Revisor`.** Agrupado por revisor o quadro parece ter
  só duas pessoas — Audrey com as 16 atividades do Fernando, Fernando com as 41 dos outros três — e dá a
  impressão de que os cards de Micael e Abner não foram criados. Antes de suspeitar do sync, confira o
  campo de agrupamento; `npm run notion:pull` mostra a distribuição real por responsável.
- **A view de calendário precisa da propriedade `Data`** (tipo date), preenchida por
  `npm run notion:cronograma`. A coluna de texto com "26/08 a 01/09" é legível para humano e invisível
  para o calendário.
