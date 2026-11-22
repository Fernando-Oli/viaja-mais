# Documento de Especificação do Projeto Integrador

Um arquivo por seção. `npm run pfc:build` monta o documento único, na ordem do
template, e gera DOCX e PDF em `build/`. O PDF é para conferência: abra e revise
página a página antes de subir no AVA, onde não há reenvio.

```
_regras.md          regras do template por seção — leia antes de escrever
_template/          modelos de tabela e reference.docx (formatação do DOCX)
00-historico-versao.md
01-identificacao/   1 produto · 2 descrição · 3 equipe · 4 repositórios
02-planejamento/    5 situação · 6 objetivos · 7 cronograma
03-publico/         8 a 15 — público, negócio, regras e requisitos
04-design/          16 a 19 — design, modelagem, dados, tecnologia
05-arquitetura/     20 a 23 — arquitetura, tecnologias, implementação, código
06-qualidade/       24 a 27 — testes, segurança, extensões, avaliação
diagramas/          fonte PlantUML (.puml) de toda figura, com o PNG gerado
rastreabilidade.md  gerado — requisito ↔ código ↔ teste ↔ commit
evidencias/         gerado — cobertura, métricas, relatórios, screenshots datados
build/              gerado — não versionado
```

## Como escrever

Use `/pfc-secao <número>`. Ela carrega as regras da seção, coleta a evidência no
repositório e delega a redação ao agente `doc-pfc`.

Não escreva direto: a extensão em linhas, o formato das tabelas e o registro
acadêmico são parte da nota, e as regras estão todas em `_regras.md`.

Cada arquivo começa com `## <número> <Título>`. Os títulos de PARTE e a capa são
inseridos pelo `pfc:build`.

## Figuras

Toda figura é um `.puml` em `diagramas/`, que começa com `@startuml <nome do
arquivo>` e `!include _tema.puml`. No texto: `![Figura 20.1 — Legenda](../diagramas/<nome>.png)`,
seguida da explicação.

`npm run pfc:diagramas` renderiza os PNG pela imagem Docker do PlantUML — precisa
do Docker rodando, e nada mais. Versione o `.puml` e o PNG juntos.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run pfc:check` | Acusa seção obrigatória vazia, texto orientador remanescente, `PENDENTE`, link não público e parágrafo acima de 600 caracteres |
| `npm run pfc:diagramas` | Renderiza os `.puml` |
| `npm run pfc:metricas` | Coleta do git e do GitHub os dados de CI/CD e de processo, em `evidencias/<data>/metricas.md` |
| `npm run pfc:rastreabilidade` | Regenera a matriz (só na `main` ou na atividade de montagem do documento) |
| `npm run pfc:build` | Gera o Markdown único, o DOCX e o PDF |

O `pfc:build` usa o pandoc (`winget install JohnMacFarlane.Pandoc`) e, para o PDF,
o LibreOffice. Sem eles, gera o que der e avisa.

`_template/reference.docx` carrega o cabeçalho, o rodapé e os estilos do template
da disciplina. Só é regenerado, por `python scripts/pfc/reference-docx.py`, se a
universidade trocar o template.
