# 18. Dados e Modelagem da Informação

## 18.1 Modelo de Dados

A modelagem de dados do projeto é versionada por migrations no repositório. Na área financeira, as principais estruturas são `expenses`, `expense_shares` e `settlements`. A tabela `expenses` representa as despesas registradas em uma viagem e diferencia o usuário que realizou o cadastro (`user_id`) daquele que efetivamente realizou o pagamento (`paid_by`). O campo `split_type` registra a forma de divisão utilizada, podendo assumir os valores `equal`, `weight` ou `exact`.

A tabela `expense_shares` representa a parcela atribuída a cada participante de uma despesa. Cada registro referencia uma despesa e um usuário, armazena o valor da parcela em `amount`, permite registrar um peso em `weight` quando a divisão é ponderada e utiliza `settled_at` para indicar quando a parcela foi quitada. A combinação entre despesa e usuário é única, evitando que uma mesma pessoa possua duas parcelas para a mesma despesa.

A relação principal do domínio financeiro pode ser representada da seguinte forma:

```text
┌──────────────────────┐
│ expenses             │
│──────────────────────│
│ id                   │
│ trip_id              │
│ user_id              │
│ amount               │
│ paid_by              │
│ split_type           │
└──────────┬───────────┘
           │ 1
           │
           │ N
┌──────────▼───────────┐
│ expense_shares       │
│──────────────────────│
│ id                   │
│ expense_id           │
│ user_id              │
│ amount               │
│ weight               │
│ settled_at           │
│ created_at           │
│ updated_at           │
└──────────────────────┘
```

Nesse relacionamento, uma despesa pode possuir várias parcelas, mas cada participante possui no máximo uma parcela para a mesma despesa. Os valores monetários são armazenados com precisão decimal. Além disso, o banco possui uma validação executada ao final da transação para garantir que a soma das parcelas seja igual ao valor total da despesa quando ela já possui divisão cadastrada.

Os pagamentos realizados entre participantes para reduzir o saldo do grupo são armazenados separadamente em `settlements`. Essa estrutura não representa uma parcela de despesa específica, pois uma transferência de acerto pode resultar da compensação de várias despesas.

```text
┌──────────────────────┐
│ settlements          │
│──────────────────────│
│ id                   │
│ trip_id              │
│ from_user_id         │
│ to_user_id           │
│ amount               │
│ currency             │
│ idempotency_key      │
│ created_at           │
└──────────────────────┘
```

Cada registro informa a viagem, quem realizou o pagamento, quem recebeu, o valor e a moeda utilizada. A `idempotency_key` evita a duplicação de um pagamento quando uma mesma tentativa é enviada mais de uma vez. O banco também impede valores iguais ou menores que zero, pagamentos de uma pessoa para ela própria e códigos de moeda fora do formato de três letras maiúsculas. Os acertos permanecem separados por moeda, evitando que valores de moedas diferentes sejam somados diretamente.

A modelagem também inclui `place_reviews`, utilizada para avaliações de lugares. A avaliação é relacionada ao identificador do lugar fornecido pelo Google (`google_place_id`) em vez do identificador interno de uma linha de `places`. Essa decisão permite reconhecer o mesmo lugar mesmo quando ele aparece salvo em viagens diferentes.

```text
┌──────────────────────┐
│ places               │
│──────────────────────│
│ trip_id              │
│ place_id             │
└──────────┬───────────┘
           │
           │ place_id = google_place_id
           │
┌──────────▼───────────┐
│ place_reviews        │
│──────────────────────│
│ id                   │
│ google_place_id      │
│ place_name           │
│ user_id              │
│ rating               │
│ comment              │
│ created_at           │
│ updated_at           │
└──────────────────────┘
```

Cada usuário pode manter apenas uma avaliação para o mesmo lugar. A nota deve permanecer entre 1 e 5, o comentário possui limite de 1000 caracteres e a atualização do campo `updated_at` é realizada pelo próprio banco.

## 18.2 Estrutura e Manipulação dos Dados

As alterações na estrutura de dados são mantidas em migrations dentro de `supabase/migrations`, permitindo que a evolução do banco seja reproduzida e revisada junto com o restante do código.

No domínio financeiro, `expense_shares` utiliza Row Level Security para limitar o acesso às parcelas de acordo com a participação do usuário na viagem relacionada à despesa. A função `pode_acessar_despesa` verifica essa relação e é utilizada nas políticas de leitura, inserção, atualização e exclusão.

A tabela `settlements` também utiliza Row Level Security. Os participantes da viagem podem consultar os pagamentos registrados, mas apenas o próprio pagador pode inserir um pagamento em seu nome e somente em uma viagem à qual possui acesso. Não existem permissões de atualização ou exclusão para usuários da aplicação, fazendo com que o registro de pagamento seja tratado como imutável. Regras que dependem do saldo calculado, como impedir pagamentos superiores ao débito disponível, são verificadas na camada de aplicação antes da gravação.

Em `place_reviews`, usuários autenticados podem consultar avaliações. A inclusão exige que o autor corresponda ao usuário autenticado e que o lugar esteja salvo em uma viagem à qual ele possui acesso. A atualização e a exclusão ficam restritas ao autor da avaliação. Além disso, a permissão de atualização é limitada aos campos de nota e comentário, impedindo que o vínculo da avaliação com o lugar ou com o usuário seja alterado pela aplicação.

Com essas estruturas, mantemos no banco as relações, restrições de integridade e controles de acesso que podem ser comprovados pelas migrations versionadas no repositório, evitando depender de descrições antigas que não correspondem mais à implementação atual.