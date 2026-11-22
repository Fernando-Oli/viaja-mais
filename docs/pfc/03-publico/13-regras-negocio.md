# 13 — Regras de Negócio

Esta seção reúne as regras de negócio que o produto aplica hoje, isto é, as
restrições do domínio de viagens em grupo que valem independentemente da tela
pela qual a operação é feita. Registramos apenas regras implementadas e
verificáveis no repositório: cada uma indica onde é aplicada (rota de API,
biblioteca em `lib/` ou banco de dados) e os requisitos das seções 14 e 15 a que
se relaciona. Decisões puramente técnicas, como o tipo de uma coluna ou a forma
de autenticação, foram deixadas de fora, pois pertencem às seções 18, 22 e 25.

## Viagens e participação

| ID | Descrição | Requisitos Relacionados |
|---|---|---|
| RNE-001 | Quem cria uma viagem torna-se automaticamente seu dono e seu primeiro participante; apenas o dono pode editar ou excluir a viagem | RF03.1, RF03.2, RF03.3, RF04.9 |

**Detalhamento:** ao gravar a viagem, o gatilho `on_trip_created` insere o
criador em `trip_members` com o papel de dono, na mesma transação; a rota
`app/api/trips/route.ts` deixa de fazê-lo por conta própria para não duplicar o
vínculo. A edição e a exclusão (`app/api/trips/[tripId]/route.ts`) chamam
`exigirDono()`; um participante que não é dono recebe 403, comportamento coberto
por `tests/api/trips-patch.test.ts`.

| ID | Descrição | Requisitos Relacionados |
|---|---|---|
| RNE-002 | A data de término de uma viagem não pode ser anterior à data de início | RF03.1, RF03.2 |

**Detalhamento:** a regra é aplicada pelo esquema `zod` de `lib/schemas/viagem.ts`
tanto na criação quanto na edição; na edição parcial, só é conferida quando as
duas datas são enviadas. A violação resulta em 400 com a mensagem "a data de fim
não pode ser anterior à de início", exibida na tela.

| ID | Descrição | Requisitos Relacionados |
|---|---|---|
| RNE-003 | Somente participantes de uma viagem podem consultar ou alterar os dados dela — itinerário, reservas, lugares, despesas e acerto de contas | RF04.4, RF04.9, RNF02.4 |

**Detalhamento:** o critério é participação, e não propriedade do registro: um
membro convidado vê as despesas e reservas lançadas pelos demais. Toda rota sob
`app/api/trips/[tripId]/` chama `exigirMembro()` (`lib/authz/trip.ts`) antes de
consultar o banco, e quem não participa recebe 403 sem descobrir se a viagem
existe. As políticas de RLS repetem a regra no banco
(`tests/rls/01-isolamento.test.ts` e `tests/rls/13-participante.test.ts`).

| ID | Descrição | Requisitos Relacionados |
|---|---|---|
| RNE-004 | Somente o dono convida pessoas para a viagem, e só se entra em uma viagem aceitando um convite pendente endereçado ao próprio e-mail | RF04.1, RF04.3 |

**Detalhamento:** a rota de convite (`app/api/invitations/route.ts`) chama
`exigirDono()`. O aceite (`app/api/invitations/[invitationId]/accept/route.ts`)
procura o convite pelo identificador, pelo e-mail da sessão e pelo estado
pendente; convite de outra pessoa responde 404, sem confirmar que existe. No
banco, a política de inserção em `trip_members` só admite a própria pessoa e só
com convite pendente para o seu e-mail (`tests/rls/06-plataforma-convite.test.ts`).

| ID | Descrição | Requisitos Relacionados |
|---|---|---|
| RNE-005 | O dono pode remover qualquer participante; o participante pode sair por vontade própria; o dono não pode sair da própria viagem | RF04.7, RF04.8 |

**Detalhamento:** aplicada em `app/api/trips/[tripId]/members/route.ts`. Um
membro que tenta remover outra pessoa recebe 403, e o dono que tenta sair recebe
400, pois a viagem continuaria sendo dele mas deixaria de aparecer na sua lista.
Os caminhos são cobertos por `tests/api/members-route.test.ts`.

## Itinerário, reservas e lugares

| ID | Descrição | Requisitos Relacionados |
|---|---|---|
| RNE-006 | Qualquer participante pode incluir, editar, concluir e excluir atividades do itinerário, desde que a atividade pertença à viagem informada; o horário de término não pode ser anterior ao de início | RF05.1, RF05.2, RF05.3, RF05.6 |

**Detalhamento:** o itinerário é do grupo, e por isso a rota exige apenas
participação. As consultas filtram pela viagem e pelo item ao mesmo tempo, de
modo que trocar o identificador da atividade na URL não alcança atividade de
outra viagem (404). A regra de horário está em `lib/schemas/itinerario.ts` e é
exercitada por `tests/api/itinerary-route.test.ts` e
`tests/api/itinerary-item-route.test.ts`.

| ID | Descrição | Requisitos Relacionados |
|---|---|---|
| RNE-007 | Qualquer participante pode cadastrar, editar e excluir reservas da viagem; o término da reserva não pode ser anterior ao início, e o preço não pode ser negativo | RF07.1, RF07.5, RF07.6 |

**Detalhamento:** o autor da reserva é sempre o usuário da sessão, e nenhuma
edição troca o autor ou a viagem; as colunas `user_id` e `trip_id` ficam fora da
permissão de atualização no banco
(`supabase/migrations/20261112010000_plataforma_rls_participante.sql`). As regras
de datas e de preço estão em `lib/schemas/reserva.ts`.

| ID | Descrição | Requisitos Relacionados |
|---|---|---|
| RNE-008 | Os lugares salvos pertencem ao grupo da viagem: qualquer participante pode salvá-los, marcá-los como visitados e excluí-los, e o estado de visitado é o mesmo para todos | RF08.2, RF08.4, RF08.6 |

**Detalhamento:** o estado de visitado é gravado no banco pela rota
`app/api/trips/[tripId]/places/[placeId]/route.ts`, e não mantido no navegador,
de modo que todos os membros veem a mesma marcação. O teste ponta a ponta
`e2e/lugares.spec.ts` confere que a marcação persiste após recarregar a página.

## Avaliações de lugares

| ID | Descrição | Requisitos Relacionados |
|---|---|---|
| RNE-009 | Só avalia um lugar quem o tem salvo em uma viagem da qual participa; cada pessoa tem no máximo uma avaliação por lugar, com nota inteira de 1 a 5 e comentário opcional; apenas o autor edita ou exclui a própria avaliação | RF11.1, RF11.2, RF11.3 |

**Detalhamento:** a avaliação é vinculada ao identificador do lugar no Google, e
não à linha da viagem, para que viajantes de grupos diferentes vejam as
avaliações uns dos outros. A leitura é aberta a qualquer usuário autenticado. A
unicidade por pessoa e lugar, a faixa da nota e o limite do comentário são
restrições da tabela `place_reviews`
(`supabase/migrations/20261111120000_viagem_place_reviews.sql`), provadas por
`tests/rls/07-avaliacoes.test.ts`.

## Despesas e rateio

| ID | Descrição | Requisitos Relacionados |
|---|---|---|
| RNE-010 | O autor de uma despesa é quem a registra, e quem a registra é considerado quem a pagou; nenhuma rota permite alterar o pagador depois do lançamento | RF06.1, RF06.8 |

**Detalhamento:** a coluna `expenses.paid_by` separa, no modelo de dados, quem
registrou de quem pagou. Na implementação atual, porém, nenhuma rota recebe o
pagador: o gatilho `preencher_paid_by` o preenche com o autor
(`supabase/migrations/20260926102023_financeiro_rateio.sql`), e a permissão de
atualização de `expenses` não inclui `paid_by` nem `split_type`, porque trocar o
pagador alteraria o saldo de todo o grupo. Lançar despesa paga por outro membro
ainda não é possível, razão pela qual o RF06.8 permanece parcial.

| ID | Descrição | Requisitos Relacionados |
|---|---|---|
| RNE-011 | Uma despesa só pode ser editada ou excluída por quem a registrou ou pelo dono da viagem | RF06.2, RF06.3 |

**Detalhamento:** diferentemente de reservas e lugares, a despesa representa o
dinheiro de uma pessoa específica. A rota `app/api/trips/[tripId]/expenses/[expenseId]/route.ts`
exige participação e, em seguida, autoria ou propriedade da viagem; um membro que
não registrou a despesa recebe 403. A política `expenses_update` repete a regra
no banco. Os caminhos são cobertos por `tests/api/expense-item-route.test.ts` e
por `tests/rls/13-participante.test.ts`.

| ID | Descrição | Requisitos Relacionados |
|---|---|---|
| RNE-012 | O rateio de uma despesa envolve somente participantes da viagem, sem repetição, por um de três critérios — igual, por peso ou por valor exato —, e a soma das partes deve ser exatamente igual ao valor da despesa, no centavo | RF06.9, RF06.10, RNF08.1 |

**Detalhamento:** o navegador envia apenas a intenção (participantes e, conforme
o critério, peso ou valor de cada um); o servidor confere que todos são membros e
recalcula as partes com `lib/finance/rateio.ts`, sem aceitar valores calculados
pelo cliente. Rateio por valor exato que não fecha é recusado com a diferença
informada ("faltam" ou "excede em"). Nenhuma parte pode ser negativa e cada
pessoa tem no máximo uma parte por despesa. No banco, o gatilho de restrição
`expense_shares_soma_fecha`, verificado no fim da transação, recusa qualquer
conjunto de partes cuja soma não coincida com o valor da despesa
(`tests/rls/02-rateio.test.ts`).

| ID | Descrição | Requisitos Relacionados |
|---|---|---|
| RNE-013 | O centavo que sobra da divisão é atribuído de forma determinística: na divisão igual, um centavo por vez aos participantes em ordem crescente de identificador; na divisão por peso, a quem teve a maior fração descartada, com o mesmo desempate | RF06.10, RNF08.1 |

**Detalhamento:** R$ 10,00 divididos entre três pessoas resultam em 3,34, 3,33 e
3,33, e nenhum participante paga mais de um centavo acima de outro. A ordem de
entrada não altera o valor de ninguém: antes da correção da Issue #36, a criação
e a edição atribuíam o centavo a pessoas diferentes. Os casos de borda e as
regressões estão em `tests/lib/finance-rateio.test.ts`.

| ID | Descrição | Requisitos Relacionados |
|---|---|---|
| RNE-014 | Alterar o valor de uma despesa já rateada refaz as partes com os mesmos participantes e pesos; o valor não pode mudar quando o rateio é por valor exato ou quando alguma parte já foi quitada | RF06.2 |

**Detalhamento:** nos critérios igual e por peso, a rota recalcula as partes para
o novo total antes de gravar e, se a gravação das partes falhar, devolve o valor
anterior à despesa. No critério por valor exato não há como deduzir quanto cabe a
cada um no novo total, e a rota responde 409 orientando a excluir e lançar de
novo; o mesmo código é devolvido quando existe parte com quitação registrada.
Mudar apenas o título, ou reenviar o mesmo valor, não toca nas partes
(`tests/api/expense-item-route.test.ts`).

## Saldo e acerto de contas

| ID | Descrição | Requisitos Relacionados |
|---|---|---|
| RNE-015 | O saldo de cada participante é calculado separadamente por moeda, sem somar valores de moedas diferentes; entram as partes em aberto e os pagamentos já registrados, e quem saiu da viagem com valor pendente continua no acerto | RF06.5, RF06.11 |

**Detalhamento:** para cada parte que não pertence ao próprio pagador, o pagador
fica credor e o participante, devedor; a soma dos saldos de uma moeda é sempre
zero (`lib/finance/balances.ts` e `lib/finance/acerto.ts`). Despesa sem moeda
informada é tratada como real. O sistema não converte moedas no acerto nem no
relatório por categoria: a função pura de conversão existente
(`lib/finance/cambio.ts`) não está ligada a nenhuma tela. Os casos de borda estão
em `tests/lib/finance-balances.test.ts` e `tests/lib/finance-acerto.test.ts`.

| ID | Descrição | Requisitos Relacionados |
|---|---|---|
| RNE-016 | As transferências sugeridas para o acerto casam, a cada passo, o maior credor com o maior devedor, transferindo o quanto couber aos dois | RF06.13 |

**Detalhamento:** o procedimento guloso de `minimizarTransferencias()` colapsa
cadeias de dívida — se A deve a B e B deve a C, a sugestão é A pagar C
diretamente —, mas não garante o número mínimo absoluto de transferências, que é
um problema de alto custo computacional. Uma entrada cujos saldos não fecham em
zero não gera transferência para a diferença.

| ID | Descrição | Requisitos Relacionados |
|---|---|---|
| RNE-017 | Somente o próprio pagador registra um pagamento do acerto, e o pagamento deve caber no saldo atual: pagador e recebedor distintos, valor maior que zero, moeda de um grupo existente do acerto, pagador com dívida e recebedor com crédito, sem ultrapassar nenhum dos dois | RF06.13, RNF02.9 |

**Detalhamento:** a rota `app/api/trips/[tripId]/acerto/transferencias/route.ts`
recalcula o acerto no servidor e o confere com `validarTransferencia()`
(`lib/finance/transferencia.ts`), respondendo 403 quando o pagador não é o
usuário da sessão e 422 quando o pedido não cabe no saldo. Um pagamento
registrado não pode ser alterado nem excluído: a tabela `settlements` não tem
permissão nem política de atualização ou exclusão para usuários da aplicação. O
reenvio com a mesma chave de registro devolve o pagamento já existente em vez de
gravar outro. Permanece como limitação conhecida que dois pedidos simultâneos,
com chaves diferentes, podem passar juntos pela conferência de saldo, pois não há
transação entre a leitura e a gravação.

## Rede social

| ID | Descrição | Requisitos Relacionados |
|---|---|---|
| RNE-018 | Seguir um perfil público tem efeito imediato; seguir um perfil privado gera solicitação pendente, que só passa a valer após a aprovação do dono; ninguém segue a si mesmo, e só segue ou é seguido quem tem nome de usuário | RF09.1, RF09.2, RF09.4 |

**Detalhamento:** o estado inicial do vínculo é decidido no banco pelo gatilho
`follows_definir_estado_inicial`, a partir da visibilidade do perfil seguido, e
não pelo cliente. Seguir de novo não duplica o vínculo. Somente o dono do perfil
aprova a solicitação, pela política `follows_update`. A rota de seguir recusa
seguir a si mesmo (400) e a sessão sem nome de usuário (403), comportamentos
cobertos por `tests/api/social-seguir-route.test.ts` e
`tests/rls/04-social.test.ts`.

| ID | Descrição | Requisitos Relacionados |
|---|---|---|
| RNE-019 | As publicações de um perfil privado só são visíveis ao próprio dono e aos seguidores com vínculo aprovado; as de perfil público, a qualquer usuário autenticado | RF09.8, RF09.16, RF09.17 |

**Detalhamento:** a regra é implementada pela função `pode_ver_rede` do banco,
usada pelas políticas de leitura da rede social, e provada por
`tests/rls/12-trip-posts.test.ts`. Ser marcado em uma publicação não concede
acesso a ela.

| ID | Descrição | Requisitos Relacionados |
|---|---|---|
| RNE-020 | Publicar uma viagem expõe apenas o recorte público dela — título, destino, datas, as atividades escolhidas do itinerário e os lugares, com nome, categoria e endereço —, nunca orçamento, moeda, despesas, anotações, coordenadas ou os demais membros | RF09.7 |

**Detalhamento:** o recorte é montado por lista branca em `lib/trips/publico.ts`:
cada campo é nomeado e copiado individualmente, de modo que uma coluna nova da
viagem só chega à publicação se for acrescentada ali. Os testes
`tests/lib/trips-publico.test.ts` conferem que são devolvidas exatamente as chaves públicas, e
`e2e/posts.spec.ts` verifica que campos como orçamento e anotações não aparecem
na resposta.
