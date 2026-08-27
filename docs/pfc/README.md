# Documento de Especificação do Projeto Integrador

Um arquivo por seção. O documento único é montado por `npm run pfc:build`, que
concatena na ordem do sumário e gera o DOCX; o PDF é exportado manualmente antes
de subir no AVA.

```
_regras.md          regras do template por seção — leia antes de escrever
_template/          modelos de tabela (problema, artefato, RNE, RF, RNF)
00-historico-versao.md
01-identificacao/   1 produto · 2 descrição · 3 equipe · 4 repositórios
02-planejamento/    5 situação · 6 objetivos · 7 cronograma
03-publico/         8 a 15 — público, negócio, regras e requisitos
04-design/          16 a 19 — design, modelagem, dados, tecnologia
05-arquitetura/     20 a 23 — arquitetura, tecnologias, implementação, código
06-qualidade/       24 a 27 — testes, segurança, extensões, avaliação
rastreabilidade.md  gerado — requisito ↔ código ↔ teste ↔ commit
evidencias/         gerado — cobertura, relatórios, screenshots datados
build/              gerado — não versionado
```

## Como escrever

Use `/pfc-secao <número>`. Ela carrega as regras da seção, coleta a evidência no
repositório e delega a redação ao agente `doc-pfc`.

Não escreva direto: a extensão em linhas, o formato das tabelas e o registro
acadêmico são parte da nota, e as regras estão todas em `_regras.md`.

## Antes de entregar

`npm run pfc:check` — acusa seção obrigatória vazia, texto orientador
remanescente, marcador `PENDENTE` esquecido e link de artefato quebrado.
