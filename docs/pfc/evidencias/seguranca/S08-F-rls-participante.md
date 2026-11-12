# S08-F — O que um participante fazia além do devido (issue #37)

Material de apoio da seção 25. Data: 12/11/2026. Requisitos: RNF02.4 e RF04.3.

## Como a falha foi achada

A suíte de RLS testava o isolamento de quem está **de fora** da viagem: Bruno não lê nem escreve na viagem só da Ana. Ela não testava o que quem está **dentro**, ou quem tem um convite qualquer, consegue fazer além da regra da aplicação. A revisão leu `pg_policies` e os grants por coluna do banco, comparou com o que cada rota de `app/api/**` faz, e escreveu um teste para cada desvio: `tests/rls/13-participante.test.ts`.

Rodado contra o banco antes da correção, o teste confirmou todas as hipóteses (17 falhas). Depois da migration `20261112010000_plataforma_rls_participante.sql`, passou inteiro (30/30).

## Causas

1. **Duas famílias de policy na mesma tabela.** As tabelas herdadas do dump do projeto original tinham as policies estritas, escritas pela equipe, e as do dump, frouxas, com nomes em inglês (26). O Postgres combina policies permissivas com OU, então a mais frouxa decide. As estritas existiam e não serviam para nada.
2. **Grant em todas as colunas.** O papel `authenticated` podia alterar qualquer coluna, inclusive as que definem dono e viagem (`user_id`, `trip_id`). Quando a policy é frouxa, o grant é a única barreira que sobra, e ela não existia.

## Falhas confirmadas e corrigidas

| # | O que era possível | Correção | Teste |
|---|---|---|---|
| H1 | Um membro alterava `trips.user_id` para si e virava dono da viagem: depois disso, apagava a viagem, convidava e removia pessoas | Policies do dump removidas; `trips.user_id` fora do grant de UPDATE | `H1 — viagem` |
| H2 | **Qualquer conta entrava em qualquer viagem cujo id conhecesse:** criava uma viagem própria, convidava o próprio e-mail, trocava o `trip_id` do convite e se inseria como membro | O convidado só altera `status` (grant por coluna) | `H2 — convite` |
| H3 | Um membro alterava e apagava a despesa de outro membro; trocava o autor ou a viagem de despesa, reserva e lugar | Despesa: autor ou dono da viagem. Reserva, lugar e itinerário: qualquer membro, sem `user_id` nem `trip_id` no grant | `H3 — despesa`, `H3 — reserva, lugar e itinerário` |
| H4 | A dona trocava o `user_id` de uma linha de membro (alguém entrava sem ter sido convidado) ou promovia um membro a dono | Sem UPDATE em `trip_members` para ninguém | `H4 — linha de membro` |
| H5 | Um participante marcava a própria parte do rateio como paga, e ela sumia do acerto de contas (`lib/finance/acerto.ts` ignora parte com `settled_at`); apagava partes de despesa alheia | Escrita nas partes só pelo autor da despesa ou pelo dono da viagem, e a pessoa da parte precisa ser membro | `H5 — partes do rateio` |
| — | Transferência registrada para quem não participa da viagem | Recebedor precisa ser membro | `transferência` |

## O que não mudou, de propósito

- **Ler continua aberto a todo membro:** despesas, partes, reservas e pagamentos da viagem. O acerto é do grupo, e o saldo de cada pessoa depende do que as outras lançaram.
- **Reserva, lugar e itinerário continuam editáveis por qualquer membro.** É a regra das rotas (`exigirMembro`), porque são coisas da viagem e não de uma pessoa.

## Riscos residuais

1. **`expense_shares` mantém UPDATE em `expense_id` e `user_id`.** O `upsert` do PostgREST (ON CONFLICT DO UPDATE SET de todas as colunas enviadas) precisa dessas colunas, e é assim que a rota regrava as partes. A proteção está na policy: só o autor ou o dono escreve, e a parte só pode ser de um membro. O autor ainda consegue mover uma parte entre despesas dele mesmo.
2. **O autor de uma despesa escolhe as partes.** É a regra do produto: quem lança a despesa diz quem participou. Um autor mal-intencionado põe dívida em outro membro, e a defesa é social: a despesa aparece para todos.
3. **A dona ainda remove qualquer membro.** É a regra da rota `DELETE /api/trips/[id]/members`.

## Por que os detalhes só aparecem agora

A issue #37 foi aberta sem os detalhes, porque o repositório é público e a aplicação está no ar. Este registro, a migration e o teste entram juntos com a correção aplicada em produção.
