---
id: S12-F-rastreabilidade-sem-conflito
titulo: Matriz de rastreabilidade conferida no CI e regenerada só na main
trilha: T5
responsavel: fernando
revisor: audrey
semana: S12
requisitos: [RNF04.6, RNF05]
secoes_doc: [15, 23]
branch: chore/S12-F-rastreabilidade-sem-conflito
tipo: [infra, documentacao]
depende_de: []
status: em-revisao
---

## 1. Contexto

Dois problemas achados ao mergear as pilhas de PRs em 11/11:

1. **`docs/pfc/rastreabilidade.md` conflitou em todos os merges.** Cada PR que toca uma tag
   commitava a sua versão do arquivo gerado; cada merge na `main` deixava os outros PRs em
   conflito. Foram cinco resoluções manuais numa noite, e o problema se repetiria em todo PR até
   01/12.
2. **Tag órfã `@RNF04`** em `tests/lib/env.test.ts` (do `S06-F-env-opcional-vazia`): nenhum
   sub-item do RNF04 cobria a validação de ambiente no boot, e o script acusava inconsistência.

E um terceiro, de quebra: a regra "falha se RF Implementado não tem teste" estava escrita no
CLAUDE.md, mas não rodava em CI nenhum — só no workflow semanal de evidências, com
`continue-on-error`.

## 2. Arquivos afetados

- `scripts/pfc/rastreabilidade.mjs` — modo `--check`: valida sem escrever
- `package.json` — `pfc:rastreabilidade:check`
- `.github/workflows/ci.yml` — passo "Rastreabilidade" no job de testes
- `docs/pfc/03-publico/15-requisitos-nao-funcionais.md` — RNF04.6 no catálogo
- `lib/env.ts`, `tests/lib/env.test.ts` — tag `@RNF04.6`
- `CLAUDE.md`, `.claude/skills/rastreabilidade/SKILL.md`, `.claude/skills/revisao-pr/SKILL.md` — PR não commita a matriz
- `docs/pfc/rastreabilidade.md` — regenerada uma vez, aqui na base

## 3. Passos

1. `--check` no script; script npm; passo no CI.
2. RNF04.6 no catálogo e tags no código e no teste.
3. Instruções: matriz fora do diff de PR; regenerada na `main` por quem monta o documento.

## 4. O que testar

- [ ] `npm run pfc:rastreabilidade:check` sai 0 e não altera `docs/pfc/rastreabilidade.md`
- [ ] Com uma tag inventada (`@RF99.9`) num arquivo, o check sai 1 com "tag órfã"
- [ ] `tests/lib/env.test.ts` verde
- [ ] Job "Lint, tipos e testes" verde com o passo novo

## 5. O que validar

- [ ] O CI de PR falha quando há tag órfã ou RF Implementado sem teste
- [ ] O modo `--check` nunca escreve o arquivo
- [ ] Nenhuma inconsistência na matriz da `main` depois do merge
- [ ] CLAUDE.md e a skill `/rastreabilidade` dizem que a matriz não entra em PR de feature

## 6. Evidência

- [ ] Saída do `pfc:rastreabilidade:check` no log do CI
