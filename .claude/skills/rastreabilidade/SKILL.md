---
name: rastreabilidade
description: Regenera a matriz que liga requisito, código, teste e commit, e falha quando um requisito marcado como implementado não tem teste. Use antes de abrir PR e ao atualizar as seções 14, 22 e 24.
---

# Matriz de rastreabilidade

Uso: `/rastreabilidade` — ou `/rastreabilidade RF03` para um requisito só.

Esta matriz é o que amarra as seções 14, 22 e 24 do documento: ela prova que cada requisito declarado
virou código e que cada código tem teste. Sem ela, a seção 24 vira afirmação sem lastro — que é
exatamente o erro da documentação herdada, onde o RNF de testes automatizados foi declarado num projeto
com zero testes.

## Como funciona

Requisitos implementados carregam uma tag em comentário, **no código e no teste**:

```ts
// @RF03.4 — permite editar viagem existente
```

O script `npm run pfc:rastreabilidade` varre `app/`, `lib/`, `components/`, `tests/` e `e2e/`, cruza com
o catálogo de requisitos em `docs/pfc/03-publico/` e escreve `docs/pfc/rastreabilidade.md`:

| Requisito | Status | Implementação | Teste | Commit |
|---|---|---|---|---|

## Passos

1. Rode `npm run pfc:rastreabilidade`.
2. **Trate as três falhas possíveis, não silencie nenhuma:**
   - *Requisito "Implementado" sem teste* → ou escreve o teste, ou muda o Status para "Parcial".
     Nunca deixe passar: é a inconsistência que o avaliador mais facilmente encontra.
   - *Tag órfã* (`@RF07.2` que não existe no catálogo) → tag errada, ou requisito que ficou de fora do
     catálogo. Resolva na origem.
   - *Requisito sem nenhuma tag* → está no backlog e o Status precisa refletir isso.
3. Se mudou algum Status, atualize a tabela do requisito nas seções 14/15 — a matriz e as seções
   precisam concordar.

## Honestidade de status

`Implementado` só quando existe código **e** teste **e** o fluxo funciona ponta a ponta.
Meio-caminho é `Parcial`, com o que falta escrito no Detalhamento. `Não iniciado` é uma resposta
perfeitamente aceitável num projeto em evolução — o template avalia coerência, não completude.
