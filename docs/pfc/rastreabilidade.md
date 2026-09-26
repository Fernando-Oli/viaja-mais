# Matriz de Rastreabilidade

> Gerado por `npm run pfc:rastreabilidade`. Não edite à mão.
> Última geração: 2026-09-11

Requisitos são marcados no código e nos testes com uma tag em comentário
(`// @RF03.4 — permite editar viagem`). Este arquivo cruza essas tags com o
catálogo das seções 14 e 15.

| Requisito | Descrição | Status | Implementação | Teste | Último commit |
|---|---|---|---|---|---|
| RF-02.1 | O usuário deve poder visualizar seu perfil | Parcial | — | — | — |
| RF-02.2 | O usuário deve poder editar nome e avatar | Parcial | — | — | — |
| RF-02.3 | O usuário deve poder alterar a senha | Parcial | — | — | — |
| RF-02.4 | O usuário deve poder excluir a conta | Não iniciado | — | — | — |
| RF-02.5 | O usuário deve poder definir um nome de usuário (username) único | Não iniciado | — | — | — |
| RF-02.6 | O usuário deve poder escrever uma biografia | Não iniciado | — | — | — |
| RF-02.7 | O usuário deve poder tornar o perfil público ou privado | Não iniciado | — | — | — |
| RF-03.1 | O usuário deve poder criar nova viagem | Parcial | `app/api/trips/route.ts` | `tests/api/trips-post.test.ts` | 55cdfc3 |
| RF-03.2 | O usuário deve poder editar viagem | Parcial | `app/api/trips/[tripId]/route.ts` | — | e747b44 |
| RF-03.3 | O usuário deve poder excluir viagem | Parcial | — | — | — |
| RF-03.4 | O usuário deve poder visualizar lista de viagens | Parcial | `app/api/trips/[tripId]/route.ts` | — | e747b44 |
| RF-03.5 | O usuário deve poder visualizar detalhes da viagem | Parcial | `app/api/trips/[tripId]/route.ts` | — | e747b44 |
| RF-03.6 | O usuário deve poder definir orçamento | Parcial | — | — | — |
| RF-03.7 | O usuário deve poder adicionar imagem de capa | Parcial | — | — | — |
| RF-03.8 | O usuário deve poder alterar status da viagem | Parcial | — | — | — |
| RF04.1 | _(fora do catálogo)_ | — | `app/api/invitations/route.ts` | `tests/api/invitations-post.test.ts` | 5d603af |
| RF04.6 | _(fora do catálogo)_ | — | `app/api/trips/[tripId]/expenses/route.ts` | — | 1ead84a |
| RF04.7 | _(fora do catálogo)_ | — | `app/api/trips/[tripId]/members/route.ts` | `tests/api/members-route.test.ts` | 5015b38 |
| RF04.8 | _(fora do catálogo)_ | — | `app/api/trips/[tripId]/members/route.ts` | `tests/api/members-route.test.ts` | 5015b38 |
| RF-05.1 | O usuário deve poder adicionar atividade ao itinerário | Parcial | — | — | — |
| RF-05.2 | O usuário deve poder editar atividade | Não iniciado | — | — | — |
| RF-05.3 | O usuário deve poder excluir atividade | Não iniciado | — | — | — |
| RF-05.4 | O usuário deve poder visualizar itinerário por data | Parcial | — | — | — |
| RF-05.5 | O usuário deve poder categorizar atividades | Parcial | — | — | — |
| RF-05.6 | O usuário deve poder definir horários | Parcial | — | — | — |
| RF-05.7 | O usuário deve poder adicionar localização | Parcial | — | — | — |
| RF-06.1 | Usuário deve poder adicionar despesa com título, valor, categoria e data | Existente | `app/api/trips/[tripId]/expenses/route.ts`<br>`lib/schemas/despesa.ts` | `tests/lib/despesa-schema.test.ts`<br>`tests/lib/expenses-route.test.ts` | 1ead84a |
| RF-06.2 | Usuário deve poder editar despesa | Planejado | — | — | — |
| RF-06.3 | Usuário deve poder excluir despesa | Planejado | — | — | — |
| RF-06.4 | Usuário deve poder visualizar total de gastos | Existente | — | — | — |
| RF-06.5 | Usuário deve poder visualizar gastos por categoria | Existente | — | — | — |
| RF-06.6 | Usuário deve poder comparar gastos com orçamento | A confirmar | — | — | — |
| RF-06.7 | Sistema deve alertar quando gastos ultrapassarem 80% do orçamento | A confirmar | — | — | — |
| RF-06.8 | Usuário deve poder indicar quem pagou a despesa (`paid_by`) | Planejado | — | — | — |
| RF-06.9 | Usuário deve poder escolher o tipo de rateio: igual, por peso ou por valor exato | Planejado | — | — | — |
| RF-06.10 | Sistema deve calcular o valor devido por membro (`expense_shares`), conforme o tipo de rateio | Planejado | — | — | — |
| RF-06.11 | Usuário deve poder visualizar o saldo por membro (quem deve a quem) | Planejado | — | — | — |
| RF-06.12 | Usuário deve poder marcar uma parcela do rateio como quitada | Planejado | — | — | — |
| RF-06.13 | Sistema deve sugerir transferências para acerto de contas (`minimizarTransferencias()`) | Planejado | — | — | — |
| RF-07.1 | O usuário deve poder adicionar reserva de voo | Parcial | — | — | — |
| RF-07.2 | O usuário deve poder adicionar reserva de hotel | Parcial | — | — | — |
| RF-07.3 | O usuário deve poder adicionar reserva de carro | Parcial | — | — | — |
| RF-07.4 | O usuário deve poder adicionar reserva de atividade | Parcial | — | — | — |
| RF-07.5 | O usuário deve poder editar reserva | Não iniciado | — | — | — |
| RF-07.6 | O usuário deve poder excluir reserva | Não iniciado | — | — | — |
| RF-07.7 | O usuário deve poder visualizar todas as reservas | Parcial | — | — | — |
| RF-08.1 | O usuário deve poder buscar lugares | Parcial | — | — | — |
| RF-08.2 | O usuário deve poder salvar lugares favoritos | Parcial | — | — | — |
| RF-08.3 | O usuário deve poder adicionar notas aos lugares | Parcial | — | — | — |
| RF-08.4 | O usuário deve poder marcar lugares como visitados | Parcial | — | — | — |
| RF-08.5 | O usuário deve poder visualizar lugares no mapa | Parcial | — | — | — |
| RF-08.6 | O usuário deve poder excluir lugares salvos | Parcial | — | — | — |
| RF-09.1 | O usuário deve poder seguir um perfil público, com efeito imediato | Não iniciado | — | — | — |
| RF-09.2 | O usuário deve poder solicitar seguir um perfil privado, gerando solicitação pendente | Não iniciado | — | — | — |
| RF-09.3 | O dono de um perfil privado deve poder visualizar suas solicitações pendentes | Não iniciado | — | — | — |
| RF-09.4 | O dono deve poder aprovar ou recusar uma solicitação | Não iniciado | — | — | — |
| RF-09.5 | O usuário deve poder deixar de seguir, ou cancelar uma solicitação ainda pendente | Não iniciado | — | — | — |
| RF-09.6 | O usuário deve poder visualizar a lista de quem segue e de quem o segue | Não iniciado | — | — | — |
| RF-09.7 | O usuário deve poder publicar uma viagem no feed | Não iniciado | — | — | — |
| RF-09.8 | O usuário deve poder ver no feed as publicações de quem segue, com acesso concedido | Não iniciado | — | — | — |
| RF-09.9 | O usuário deve poder remover um seguidor do próprio perfil, público ou privado | Não iniciado | — | — | — |
| RF-10.1 | O usuário deve poder curtir uma publicação | Não iniciado | — | — | — |
| RF-10.2 | O usuário deve poder remover a própria curtida | Não iniciado | — | — | — |
| RF-10.3 | O usuário deve poder comentar em uma publicação | Não iniciado | — | — | — |
| RF-10.4 | O usuário deve poder excluir o próprio comentário | Não iniciado | — | — | — |
| RF-11.1 | O usuário deve poder avaliar um lugar, com nota e comentário | Não iniciado | — | — | — |
| RF-11.2 | O usuário deve poder ver as avaliações de um lugar feitas por outros usuários | Não iniciado | — | — | — |
| RF-11.3 | O usuário deve poder editar ou excluir a própria avaliação | Não iniciado | — | — | — |
| RF-12.1 | O usuário deve poder gerar um roteiro por IA a partir de destino, datas e interesses | Não iniciado | — | — | — |
| RF-12.2 | O usuário deve poder revisar e editar o roteiro gerado antes de gravá-lo | Não iniciado | — | — | — |
| RF-12.3 | O usuário deve poder descartar o roteiro gerado sem salvar nada | Não iniciado | — | — | — |
| RF-13.1 | O usuário deve receber notificação informativa quando alguém começa a segui-lo (perfil público) | Não iniciado | — | — | — |
| RF-13.2 | O usuário deve receber notificação acionável de nova solicitação de seguidor (perfil privado), que permanece visível até ser aceita ou recusada | Não iniciado | — | — | — |
| RF-13.3 | O usuário deve receber notificação informativa quando sua solicitação de seguir é aceita | Não iniciado | — | — | — |
| RF-13.4 | O usuário deve poder ver a central de notificações, com contador de não-lidas e marcação de lidas | Não iniciado | — | — | — |
| RNF02 | _(fora do catálogo)_ | — | — | `tests/rls/01-isolamento.test.ts` | — |
| RNF-02.9 | Os dados de `expense_shares` e `settlements` de uma viagem só devem ser visíveis aos seus membros, via RLS | Planejado | — | — | — |
| RNF-07.1 | O feed deve carregar a primeira página (20 publicações) em menos de 2 segundos no percentil 95 | Não iniciado | — | — | — |
| RNF-07.2 | O feed deve paginar por cursor, sem carregar todas as publicações de uma vez | Não iniciado | — | — | — |
| RNF-07.3 | A geração de roteiro por IA deve responder em até 15 segundos, ou informar erro claro ao usuário | Não iniciado | — | — | — |
| RNF-07.4 | A geração de roteiro deve ser limitada a no máximo 10 requisições por usuário por hora | Não iniciado | — | — | — |
| RNF-07.5 | A central de notificações deve carregar as 20 mais recentes em menos de 2 segundos no percentil 95, e o contador de não-lidas deve ser calculado em menos de 500 milissegundos | Não iniciado | — | — | — |
| RNF-08.1 | O cálculo do roteio deve ser determinístico: a soma das partes de `expense_shares` deve sempre igualar o valor total da despesa | Planejado | — | — | — |

## Resumo

- Requisitos no catálogo: **78**
- Com implementação marcada: **9**
- Com teste marcado: **6**

## Inconsistências

- RF04.1 aparece no código mas não existe no catálogo de requisitos (tag órfã).
- RF04.6 aparece no código mas não existe no catálogo de requisitos (tag órfã).
- RF04.7 aparece no código mas não existe no catálogo de requisitos (tag órfã).
- RF04.8 aparece no código mas não existe no catálogo de requisitos (tag órfã).
- RNF02 aparece no código mas não existe no catálogo de requisitos (tag órfã).
