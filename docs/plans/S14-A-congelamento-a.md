---
id: S14-A-congelamento-a
titulo: Correção de bugs e ensaio da apresentação
trilha: T1
responsavel: audrey
revisor: fernando
semana: S14
requisitos: [RF09.7]
secoes_doc: []
branch: fix/S14-A-congelamento-a
tipo: [correcao-de-bug]
depende_de: [S11-A-e2e-completo]
status: em-revisao
---
# Correção de bugs e ensaio da apresentação

> **Audrey** · semana **S14** (25/11 a 01/12) · marco da semana: _Entrega em 01/12_

## 1. Contexto

Adiantada para 19/11, antes do congelamento de 20/11. Duas frentes:

**Bug: publicar viagem com texto longo devolve 500.** Achado do Micael no PR #51 (18/11): a
projeção pública (`lib/trips/publico.ts`, S11-A-helper-publicar) copia o título do item sem
limite. O CHECK de `items` do post (`social_itens_do_post_validos`) aceita título de até 120
caracteres, como `lib/schemas/itinerario.ts`, mas um item gravado antes do zod (quando a tela
gravava direto do navegador) pode ter mais. O insert do post é recusado e a rota responde 500.
O mesmo vale para o título (120) e o destino (160) da viagem e para local (200) e descrição
(2000) do item. Ele perguntou se cortava do lado dele (`montarPost`) ou se a projeção entregava no
limite. Decisão: **a projeção entrega no limite**, porque é a fronteira do domínio e todo consumidor
herda a garantia.

**Ensaio:** roteiro da demonstração da parte de Viagem & Itinerário, no bloco 3.

## 2. Arquivos afetados

- `lib/trips/publico.ts`: `LIMITES_DO_POST` e corte por caractere em título, destino, título do
  item, local e descrição. As linhas mexidas não são as do commit de proposta do Micael
  (`ea01278`, lugares), para o merge do #51 não conflitar.
- `tests/lib/trips-publico-limites.test.ts`: regressão, em arquivo separado pelo mesmo motivo.
- `docs/pfc/evidencias/S14-A-congelamento-a-falha-antes.txt` e `-passa-depois.txt`.

## 3. Passos

1. Teste de regressão; confirmar que falha sem a correção (3 de 4 falham).
2. Correção com corte por caractere (`Array.from`), igual ao `char_length` do Postgres, para não
   partir emoji ao meio.
3. Testes verdes, evidências arquivadas, resposta ao Micael no #51.

**Roteiro do ensaio (parte da Audrey, ~4 min)**, com o usuário A do seed ou conta nova:

1. Painel → "Nova viagem": mostrar os dois caminhos e criar a viagem (RF03.1).
2. Detalhe da viagem: "Editar" (RF03.2, só a dona vê o botão).
3. Aba Itinerário: adicionar, concluir e excluir atividade com o modal de confirmação (RF05).
4. Aba Lugares: marcar visitado e avaliar o lugar (RF08.4, RF11).
5. Aba Reservas: criar voo e mostrar que o código de confirmação não vai para a publicação (RF07).
6. "Publicar": o diálogo e o aviso "Despesas, reservas e códigos de confirmação nunca são
   publicados" (fronteira `projecaoPublicaDaViagem`).
7. Qualidade: mostrar `docs/pfc/evidencias/S11-A-e2e-completo-*` e o corte de cobertura no CI.

## 4. O que testar

Obrigatórios pelo tipo (`correção-de-bug`):

- [x] Teste de regressão que **falha antes** e passa depois do fix

**Roteiro de teste manual**

1. `git stash push lib/trips/publico.ts` e `npx vitest run tests/lib/trips-publico-limites.test.ts`.
   Esperado: `3 failed | 1 passed`.
2. `git stash pop` e rodar de novo, junto com `tests/lib/trips-publico.test.ts`.
   Esperado: `11 passed`.

## 5. O que validar

- [x] O bug original foi reproduzido antes do fix e não reproduz depois
- [x] Texto dentro do limite e campos nulos saem inalterados
- [x] O contrato `ViagemPublica` não muda (mesmas chaves; `tests/lib/trips-publico.test.ts` verde)

## 6. Evidência

- [x] Saída dos testes: `docs/pfc/evidencias/S14-A-congelamento-a-falha-antes.txt` e
      `S14-A-congelamento-a-passa-depois.txt`
- [ ] Screenshot: não se aplica (sem tela)
- [x] Delta de cobertura: `lib/trips/publico.ts` ganha só código coberto pelos 4 testes novos
