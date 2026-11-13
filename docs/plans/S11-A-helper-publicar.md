---
id: S11-A-helper-publicar
titulo: Projeção pública da viagem para o post do feed
trilha: T1
responsavel: audrey
revisor: fernando
semana: S11
requisitos: [RF09.7]
secoes_doc: [25]
branch: feat/S11-A-helper-publicar
tipo: [regra-de-negocio]
depende_de: []
status: em-revisao
---
# Projeção pública da viagem para o post do feed

> **Audrey** · semana **S11** · pedido do Micael no PR #51 (`S06-M-publicar-viagem`).

## 1. Contexto

O Micael está implementando "publicar viagem no feed" (RF09.7). O post precisa de título, destino,
datas e itinerário, mas `trips` e `itinerary_items` são do domínio Viagem & Itinerário, e o Social
não pode ler essas tabelas direto. Esta atividade entrega o helper de fronteira
`projecaoPublicaDaViagem(supabase, tripId)`, que devolve só o recorte público. Ficam de fora: da
viagem, `budget`, `currency`, `description`, `status` e os membros; dos itens, `notes`, `latitude`,
`longitude` e `status`.

O botão "Publicar no feed" na tela da viagem e a página `trips/[id]/publicar` dependem de
`postDaViagem` e de `<PublicarViagem>`, que ainda não existem no PR do Micael. Ficam para uma
atividade seguinte, combinada com ele.

## 2. Arquivos afetados

- `lib/trips/publico.ts`: criar `projecaoPublicaDaViagem`, `ViagemPublica` e `ItemPublico`.
- `tests/lib/trips-publico.test.ts`: criar o unit test.

## 3. Passos

1. Plano com os blocos 4 e 5.
2. Helper com colunas nomeadas e cópia campo a campo.
3. Unit test que trava as chaves.
4. `npm run verify`, PR e aviso ao Micael no #51.

## 4. O que testar

**Testes automatizados** (`regra-de-negocio`):

- [x] Unit: as chaves do objeto da viagem e de cada item são exatamente as públicas, mesmo quando
      a linha do banco traz `budget`, `notes`, coordenadas, `status` e membros.
- [x] Unit: o `select` nomeia as colunas, nunca `*`.
- [x] Unit: filtra por `trip_id`, exclui `cancelled` mantendo itens com `status` nulo e ordena
      por `date` e depois `start_time`, com nulos por último.
- [x] Unit: viagem inexistente ou invisível devolve `null` sem consultar itens; erro na viagem
      devolve `null`; erro nos itens lança.
- [x] Unit: viagem sem itens devolve `itens: []`.
- [x] Cobertura de `lib/trips/publico.ts` ≥ 70%.

**Roteiro de teste manual:** não se aplica (sem tela). O consumo é exercitado pelas rotas do
Micael no #51.

## 5. O que validar

- [x] Nenhuma das colunas `budget`, `currency`, `description`, `status` (viagem) nem `notes`,
      `latitude`, `longitude`, `status` (item) aparece no objeto devolvido.
- [x] Acrescentar uma chave à saída quebra o teste de chaves.
- [x] Usa o cliente recebido (da sessão), sem `admin.ts`: a RLS da viagem continua valendo.
- [x] Tag `@RF09.7` no código e no teste.

## 6. Evidência

- [ ] Saída de `npm run verify`
- [ ] Cobertura de `lib/trips/publico.ts`
