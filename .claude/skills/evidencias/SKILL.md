---
name: evidencias
description: Executa a suíte de testes e arquiva cobertura, relatórios e screenshots datados em docs/pfc/evidencias/. Use para gerar o material das seções 22, 24 e 25 do documento.
---

# Coletar evidências

Uso: `/evidencias` — ou `/evidencias e2e` / `/evidencias seguranca` para uma parte só.

O documento do PFC precisa mostrar resultado, não intenção. Estas evidências são o que sustenta as
seções 24 (Qualidade e Testes) e 25 (Segurança), e as screenshots servem também de figura para o manual.

## Passos

1. **Garanta o estado limpo.** Trabalho não commitado gera evidência que não corresponde a nenhum commit.
   Registre o SHA do HEAD no índice.

2. **Rode e arquive** em `docs/pfc/evidencias/<AAAA-MM-DD>/`:

   | Comando | Arquivo |
   |---|---|
   | `npm run test -- --coverage` | `cobertura/` + `testes-unit.txt` |
   | `npm run test:rls` | `rls.txt` |
   | `npm run e2e` | `e2e/` (relatório HTML) + `screenshots/` |
   | `npm run build` | `build.txt` |

3. **Escreva o índice** `README.md` da pasta com: data, SHA do commit, versões de Node e npm, o que cada
   arquivo contém, e — o mais importante — **um parágrafo interpretando os números**. Cobertura de 72%
   não diz nada sozinha; "72% em `lib/`, com `lib/finance/balances.ts` a 94%, porque é onde está a regra
   de rateio" diz.

4. **Registre as falhas também.** Teste vermelho ou fluxo que não completou entra na evidência com a
   explicação. Arquivar só o que passou é maquiar, e a seção 27 pede análise crítica — limitação
   reconhecida vale mais que resultado perfeito inventado.

5. Renomeie screenshots por fluxo e passo: `grupo-03-convite-aceito.png`. Nome gerado automaticamente pelo
   Playwright não serve como figura de documento.

## Quando rodar

Ao fechar cada marco semanal, e obrigatoriamente antes de `/pfc-entrega`. Evidência datada mostra
evolução ao longo do semestre — que é justamente o que o Projeto Integrador avalia.
