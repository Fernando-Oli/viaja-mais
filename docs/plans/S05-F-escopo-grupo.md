---
id: S05-F-escopo-grupo
titulo: Escopo de grupo em todas as consultas
trilha: T1
responsavel: fernando
revisor: audrey
semana: S05
requisitos: [RF04.4]
secoes_doc: [22.3, 20, 21]
branch: feat/S05-F-escopo-grupo
tipo: [regra-de-negocio, route-handler]
depende_de: [S02-Ab-despesas-via-api, S02-A-bugs-p0]
status: em-revisao
---
# Escopo de grupo em todas as consultas

> **Fernando** · semana **S05** (23 a 29/09) · marco da semana: _Zero escrita no banco a partir do navegador_

## 1. Contexto

`finances`, `places` e `bookings` filtram por `user_id`, o que esconde dados de
viagens compartilhadas de quem foi convidado — contradizendo a premissa do
produto.

Efeito observável: o convidado aceita o convite, entra na viagem, e a tela de
finanças mostra "nenhuma despesa" mesmo com o grupo tendo lançado dez. O mesmo
em reservas e lugares. Ele só enxerga o que ele mesmo criou.

O `itinerary` já foi corrigido em `S02-A-bugs-p0`, e `app/api/trips/route.ts`
já lista por participação. Ou seja: o padrão certo existe no repositório em dois
lugares e está copiado à mão nos dois, com a string do embed repetida. Esta
atividade conserta as três telas restantes **e** tira o padrão da cópia — é a
repetição que garante que a quarta cópia vai esquecer o `!inner`.

Por que `!inner` importa: sem ele o PostgREST trata o embed como LEFT JOIN e
**ignora o filtro da relação aninhada**. A consulta não dá erro — devolve tudo
o que a RLS permitir. Some silenciosamente, que é o pior modo de falha possível
para uma regra de visibilidade.

## 2. Arquivos afetados

Nenhuma migration: a RLS já resolve quem **pode** ler. O que está errado é a
consulta, que estreita demais o resultado.

- `lib/trips/escopo.ts` — **novo**: o embed de participação, num lugar só
- `app/dashboard/finances/page.tsx` — viagens e despesas por participação
- `app/dashboard/bookings/page.tsx` — idem
- `app/dashboard/places/page.tsx` — idem
- `app/dashboard/itinerary/page.tsx` — passa a usar o helper, em vez da cópia
- `app/api/trips/route.ts` — idem
- `tests/lib/escopo-grupo.test.ts` — **novo**: unit do construtor
- `tests/rls/03-escopo-grupo.test.ts` — **novo**: membro convidado enxerga

## 3. Passos

1. Extrair para `lib/trips/escopo.ts` as duas formas do padrão: consulta sobre
   `trips` e consulta sobre tabela filha (`expenses`, `bookings`, `places`,
   `itinerary_items`).
2. Fazer o construtor **recusar** as formas que silenciosamente não filtram —
   embed sem `!inner`, chamador embutindo `trips(...)` por conta própria. O erro
   precisa aparecer no teste, não em produção com dado a menos.
3. Trocar o `.eq("user_id", user.id)` das três telas pelo filtro de
   participação.
4. Passar `itinerary` e `app/api/trips/route.ts` a usar o helper, para o padrão
   existir uma vez só.
5. Unit com os casos de borda; teste de RLS com o Bruno convidado enxergando
   despesa, reserva e lugar que a Ana criou.

## 4. O que testar

Obrigatórios pelo tipo (`regra-de-negocio, route-handler`):

- [x] Teste de que membro convidado enxerga as despesas da viagem —
      `tests/rls/03-escopo-grupo.test.ts`, com despesa, reserva e lugar
- [x] Unit com casos de borda — `tests/lib/escopo-grupo.test.ts`
- [x] Cobertura de ao menos 70% no arquivo — `lib/trips/escopo.ts` em **100%**
      de linhas, ramos e funções
- [x] Integração cobrindo os 4 caminhos: 200 feliz, 401 sem sessão, 403
      não-membro, 400 payload invalido — **não se aplica**: esta atividade não
      cria nem altera rota de escrita. O único route handler tocado
      (`app/api/trips/route.ts`, GET) passa a usar o helper sem mudar contrato;
      o 401 dele continua coberto pelo proxy

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

**Antes e depois, medido contra o banco local** com o Bruno convidado numa
viagem da Ana que tem despesas lançadas por ela:

```
consulta ANTIGA (.eq user_id):   0 despesas
consulta NOVA  (participação):  11 despesas
```

1. Entrar como `teste.a@viajamais.local`, criar viagem e lançar uma despesa,
   uma reserva e um lugar.
2. Convidar `teste.b@viajamais.local` e aceitar o convite como ele.
3. Como Bruno, abrir **Finanças** → esperado: a despesa da Ana aparece, e o
   total da viagem inclui o valor dela.
4. Abrir **Reservas** → esperado: a reserva da Ana aparece.
5. Abrir **Lugares** → esperado: o lugar da Ana aparece.
6. Ainda como Bruno, conferir que nada de uma viagem da Ana em que ele **não**
   entrou aparece em nenhuma das três telas.

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [x] Nenhuma consulta filtra por user_id onde deveria filtrar por participação.
      Sobram duas ocorrências de `.eq("user_id", …)` e as duas estão certas:
      `invitations/[invitationId]/accept/route.ts:46` pergunta se a própria
      pessoa já é membro, e `trips/[tripId]/members/route.ts:65` remove um
      membro específico. Ambas são sobre **uma pessoa**, não sobre visibilidade.
- [x] Função pura, sem I/O — `lib/trips/escopo.ts` só monta string; não conhece
      cliente do Supabase nem sessão
- [x] Casos de arredondamento cobertos — **não se aplica**: não há aritmética
      aqui. O critério veio do gabarito de `regra-de-negocio`
- [x] `await params` — **não se aplica**: nenhuma rota com segmento dinâmico
      foi tocada
- [x] Corpo validado por zod — **não se aplica**: nenhuma escrita nova
- [x] Autorização checada no servidor via `exigirMembro` / `exigirDono` —
      **não se aplica na forma literal**, e vale explicar: `exigirMembro` responde
      "esta pessoa pode ver *esta* viagem?", e estas telas listam **várias**. O
      equivalente é o filtro de participação, que é checagem no servidor pelos
      mesmos `trip_members`. A RLS segue como segunda linha, e há teste provando
      que ela segura sozinha se o filtro sumir
- [x] O padrão existe uma vez só: `itinerary` e `app/api/trips/route.ts`
      deixaram de repetir a string e passaram a usar o helper

## 6. Evidência

- [x] Saída dos testes: 81 unitários e 38 de RLS, todos verdes
- [x] Medição antes/depois contra o banco local: `0` → `11` despesas visíveis
      para o convidado
- [x] Delta de cobertura: `lib/trips/escopo.ts` em 100% de linhas, ramos e
      funções (arquivo novo)
- [ ] Screenshot das três telas — **não obrigatório pelo tipo**
      (`regra-de-negocio, route-handler`), e o E2E do fluxo de grupo já está
      planejado em `S07-A-e2e-grupo`, que é onde ele rende mais
