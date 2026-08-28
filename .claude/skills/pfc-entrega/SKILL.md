---
name: pfc-entrega
description: Valida e monta a versão entregável do Documento de Especificação — checa o checklist do template, junta as seções e gera o DOCX para export manual do PDF. Use ao preparar a entrega no AVA.
---

# Preparar a entrega

Uso: `/pfc-entrega` — ou `/pfc-entrega --check` para só validar, sem gerar arquivo.

A entrega é **um PDF, pelo AVA, e não há reenvio depois do prazo**. Um integrante envia pelo grupo todo.
Por isso esta skill valida antes de montar: erro descoberto depois do upload não tem conserto.

## 1. Checklist bloqueante

Rode `npm run pfc:check` e resolva tudo antes de seguir. Ele verifica:

- **Nenhum texto orientador remanescente.** O template traz instruções em vermelho ("Inserir aqui",
  "Orientações:", "Extensão sugerida:"). A versão final não pode ter nenhuma — é a primeira coisa que o
  avaliador nota.
- **Seções obrigatórias até o 7º período preenchidas** — 1 a 25. As seções 26 e 27 são do 8º; marque
  explicitamente a situação delas em vez de deixar em branco.
- **Nenhum marcador `PENDENTE`** sobrando.
- **Parte 00 e Parte 02 atualizadas** nesta versão.
- **Links da seção 4 acessíveis** — repositório público, protótipo, aplicação em execução.
- Requisitos e regras em tabela com ID, Descrição, Status, Prioridade e bloco `Detalhamento:`.

## 2. Coerência entre documento e repositório

Além do script, confira à mão o que ele não alcança:

- Todo RF com Status "Implementado" tem teste — `npm run pfc:rastreabilidade` falha se não tiver.
- A seção 21 lista só tecnologias que estão no `package.json`.
- Os diagramas estão **explicados no texto**, não só inseridos.
- O que a seção 24 afirma sobre testes bate com a saída real da suíte.

## 3. Monte

`npm run pfc:build` concatena as seções na ordem do sumário e gera
`docs/pfc/build/Documento-Especificacao-ViajaMais-v<versão>.docx` usando o `reference.docx` com a
formatação do template.

O PDF é exportado **manualmente** a partir do DOCX — decisão da equipe, para conferir a paginação e a
capa antes de subir.

## 4. Relate

Diga em poucas linhas: versão gerada, seções alteradas desde a última, o que continua pendente e o que
precisa de revisão humana antes do upload. Se algo do checklist não passou, diga isso primeiro — nunca
entregue um "pronto" com item vermelho.
