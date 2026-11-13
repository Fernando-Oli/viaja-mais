---
id: S07-F-estados-erro
titulo: Estados de erro, não encontrado e carregamento
trilha: T1
responsavel: fernando
revisor: audrey
semana: S07
requisitos: [RNF04.4, RNF02.11]
secoes_doc: [15]
branch: feat/S07-F-estados-erro
tipo: [tela, componente]
depende_de: []
status: em-revisao
---
# Estados de erro, não encontrado e carregamento

> **Fernando** · planejada para a S07, feita na S12 (13/11).

## 1. Contexto

Nenhum segmento tinha `error.tsx`, `not-found.tsx` nem `loading.tsx`:

- erro inesperado numa página mostrava a tela padrão do Next ou a página em branco;
- endereço inexistente caía no 404 padrão do Next, em inglês;
- viagem inexistente, ou de que a pessoa não participa, mandava de volta para a lista sem explicar nada. Um erro de banco tinha o mesmo efeito, porque os dois casos caíam no mesmo `if (error || !trip)`.

No Next 16 a função de tentar de novo é `retry` (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`); `reset` não refaz a busca.

## 2. Arquivos afetados

- `components/estado-erro.tsx` — tela de erro: explicação, "Tentar de novo" (`retry`), "Voltar ao início" e o código do erro (`digest`); nunca `error.message`
- `components/estado-nao-encontrado.tsx` — a mesma frase para "não existe" e "sem acesso"
- `app/global-error.tsx`, `app/error.tsx`, `app/dashboard/error.tsx`, `app/(rede-social)/error.tsx`
- `app/not-found.tsx`, `app/dashboard/not-found.tsx`
- `app/dashboard/loading.tsx`, `app/(rede-social)/loading.tsx`
- `app/dashboard/trips/[id]/page.tsx` — `notFound()` para viagem ausente ou alheia; erro real lança para o `error.tsx`
- `docs/pfc/03-publico/15-requisitos-nao-funcionais.md` — RNF04.4 Atendido

## 3. Passos

1. Componentes compartilhados; arquivos de convenção por segmento, cada um dentro do layout do seu segmento.
2. Página da viagem: separar "não encontrado" (PGRST116 do `.single()`) de erro de verdade.
3. Teste de componente e E2E.

## 4. O que testar

- [x] Componente (`tests/components/estado-erro.test.tsx`, 7): não mostra a mensagem interna do erro; mostra o `digest` só quando há; "Tentar de novo" chama `retry`; o link de volta respeita o segmento; registra no console
- [x] E2E (`e2e/estados-erro.spec.ts`, 8 nos dois projetos):
  - sem sessão, endereço inexistente vai para o login (lista branca do `proxy.ts`)
  - com sessão, endereço inexistente responde 404 em português, com caminho de volta
  - viagem inexistente mostra o 404 dentro do dashboard, com a barra lateral
  - viagem de outra pessoa mostra o **mesmo** 404, e o título dela não aparece
- [ ] Suíte E2E completa no CI

## 5. O que validar

- [x] Nenhuma tela de erro mostra `error.message`
- [x] O 404 de viagem alheia é idêntico ao de viagem inexistente
- [x] Erro e 404 dentro do dashboard mantêm a navegação
- [x] Screenshot arquivado: `docs/pfc/evidencias/S07-F-nao-encontrado-*.png`

## 6. Evidência

- [x] `docs/pfc/evidencias/S07-F-nao-encontrado-chromium.png` e `-mobile.png`
