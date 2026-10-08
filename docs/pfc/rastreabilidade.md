# Matriz de Rastreabilidade

> Gerado por `npm run pfc:rastreabilidade`. Não edite à mão.
> Última geração: 2026-10-08

Requisitos são marcados no código e nos testes com uma tag em comentário
(`// @RF03.4 — permite editar viagem`). Este arquivo cruza essas tags com o
catálogo das seções 14 e 15.

| Requisito | Descrição | Status | Implementação | Teste | Último commit |
|---|---|---|---|---|---|
| RF-01.1 | O usuário deve poder registrar-se com e-mail e senha | Parcial | `app/auth/sign-up/page.tsx` | `tests/auth/sign-up.test.tsx` | 39f1705 |
| RF-01.2 | O sistema deve enviar e-mail de confirmação após o registro | Parcial | `app/auth/sign-up/page.tsx` | `tests/auth/sign-up.test.tsx` | 39f1705 |
| RF-01.3 | O usuário deve poder autenticar-se com e-mail e senha | Parcial | — | — | — |
| RF-01.4 | O usuário deve poder encerrar a sessão | Parcial | — | — | — |
| RF-01.5 | O sistema deve manter e renovar a sessão entre requisições | Existente | — | — | — |
| RF-01.6 | O sistema deve barrar o acesso não autenticado às rotas protegidas | Existente | — | — | — |
| RF-01.7 | O usuário deve poder redefinir por e-mail a senha esquecida | Existente | — | — | — |
| RF-01.8 | O usuário autenticado deve poder alterar a própria senha, confirmando a senha atual | Parcial | — | — | — |
| RF-02.1 | O usuário deve poder visualizar seu perfil | Parcial | `app/api/profile/[userId]/route.ts`<br>`app/api/social/perfil/route.ts`<br>`app/dashboard/perfil/page.tsx` | `tests/api/profile-userid-route.test.ts`<br>`tests/api/social-perfil-route.test.ts`<br>`e2e/editar-perfil.spec.ts` | 3e7ad89 |
| RF-02.2 | O usuário deve poder editar nome e avatar | Parcial | `app/api/social/perfil/route.ts`<br>`app/dashboard/perfil/page.tsx`<br>`lib/schemas/perfil-limites.ts`<br>`lib/schemas/perfil.ts` | `tests/api/social-perfil-route.test.ts`<br>`tests/lib/perfil-schema.test.ts`<br>`tests/rls/04-social.test.ts` | 3e7ad89 |
| RF-02.3 | O usuário deve poder alterar a senha | Parcial | — | — | — |
| RF-02.4 | O usuário deve poder excluir a conta | Não iniciado | — | — | — |
| RF-02.5 | O usuário deve poder definir um nome de usuário (username) único | Não iniciado | `app/api/social/perfil/route.ts`<br>`app/dashboard/perfil/page.tsx`<br>`lib/schemas/perfil-limites.ts`<br>`lib/schemas/perfil.ts` | `tests/api/social-perfil-route.test.ts`<br>`tests/lib/perfil-schema.test.ts`<br>`tests/rls/04-social.test.ts`<br>`e2e/editar-perfil.spec.ts` | 3e7ad89 |
| RF-02.6 | O usuário deve poder escrever uma biografia | Não iniciado | `app/api/social/perfil/route.ts`<br>`app/dashboard/perfil/page.tsx`<br>`lib/schemas/perfil-limites.ts`<br>`lib/schemas/perfil.ts` | `tests/api/social-perfil-route.test.ts`<br>`tests/lib/perfil-schema.test.ts`<br>`tests/rls/04-social.test.ts`<br>`e2e/editar-perfil.spec.ts` | 3e7ad89 |
| RF-02.7 | O usuário deve poder tornar o perfil público ou privado | Não iniciado | `app/api/social/perfil/route.ts`<br>`app/dashboard/perfil/page.tsx`<br>`lib/schemas/perfil.ts` | `tests/api/social-perfil-route.test.ts`<br>`tests/lib/perfil-schema.test.ts`<br>`tests/rls/04-social.test.ts`<br>`e2e/editar-perfil.spec.ts` | 3e7ad89 |
| RF-03.1 | O usuário deve poder criar nova viagem | Parcial | `app/api/trips/route.ts` | `tests/api/trips-post.test.ts` | 47dbca9 |
| RF-03.2 | O usuário deve poder editar viagem | Existente | `app/api/trips/[tripId]/route.ts` | `tests/api/trips-patch.test.ts`<br>`e2e/editar-viagem.spec.ts` | 6d9496d |
| RF-03.3 | O usuário deve poder excluir viagem | Parcial | `app/api/trips/[tripId]/route.ts` | — | 6d9496d |
| RF-03.4 | O usuário deve poder visualizar lista de viagens | Parcial | — | — | — |
| RF-03.5 | O usuário deve poder visualizar detalhes da viagem | Parcial | `app/api/trips/[tripId]/route.ts` | — | 6d9496d |
| RF-03.6 | O usuário deve poder definir orçamento | Parcial | — | — | — |
| RF-03.7 | O usuário deve poder adicionar imagem de capa | Parcial | — | — | — |
| RF-03.8 | O usuário deve poder alterar status da viagem | Parcial | — | — | — |
| RF-04.1 | O dono da viagem deve poder convidar pessoas por e-mail | Parcial | `app/api/invitations/route.ts` | `tests/api/invitations-post.test.ts` | 214970c |
| RF-04.2 | O convidado deve receber notificação do convite por e-mail | Não iniciado | `app/api/invitations/route.ts` | `tests/api/invitations-post.test.ts` | 214970c |
| RF-04.3 | O convidado deve poder aceitar ou recusar o convite | Parcial | — | — | — |
| RF-04.4 | Os membros devem poder visualizar a viagem e seus dados | Parcial | `lib/trips/escopo.ts` | `tests/lib/escopo-grupo.test.ts`<br>`tests/rls/03-escopo-grupo.test.ts` | 47dbca9 |
| RF-04.5 | Os membros devem poder editar o itinerário da viagem | Parcial | — | — | — |
| RF-04.6 | Os membros devem poder adicionar despesas à viagem | Parcial | `app/api/trips/[tripId]/expenses/route.ts` | — | 1ead84a |
| RF-04.7 | O dono deve poder remover membros da viagem | Existente | `app/api/trips/[tripId]/members/route.ts` | `tests/api/members-route.test.ts` | 5015b38 |
| RF-04.8 | O membro deve poder sair da viagem por vontade própria | Existente | `app/api/trips/[tripId]/members/route.ts` | `tests/api/members-route.test.ts` | 5015b38 |
| RF-04.9 | Toda operação sobre uma viagem deve verificar participação ou propriedade no servidor, antes de consultar o banco | Existente | — | — | — |
| RF-05.1 | O usuário deve poder adicionar atividade ao itinerário | Existente | `app/api/trips/[tripId]/itinerary/route.ts`<br>`lib/schemas/itinerario.ts` | `tests/api/itinerary-route.test.ts`<br>`e2e/adicionar-atividade.spec.ts` | 9fb0cfc |
| RF-05.2 | O usuário deve poder editar atividade | Existente | `app/api/trips/[tripId]/itinerary/[itemId]/route.ts`<br>`lib/schemas/itinerario.ts`<br>`components/itinerary-list.tsx` | `tests/api/itinerary-item-route.test.ts`<br>`e2e/itinerario-crud.spec.ts` | ad9d35b |
| RF-05.3 | O usuário deve poder excluir atividade | Existente | `app/api/trips/[tripId]/itinerary/[itemId]/route.ts`<br>`components/itinerary-list.tsx` | `tests/api/itinerary-item-route.test.ts`<br>`e2e/itinerario-crud.spec.ts` | ad9d35b |
| RF-05.4 | O usuário deve poder visualizar itinerário por data | Parcial | `app/api/trips/[tripId]/itinerary/route.ts` | `tests/api/itinerary-route.test.ts` | 9fb0cfc |
| RF-05.5 | O usuário deve poder categorizar atividades | Parcial | `lib/schemas/itinerario.ts` | — | ad9d35b |
| RF-05.6 | O usuário deve poder definir horários | Existente | `lib/schemas/itinerario.ts` | — | ad9d35b |
| RF-05.7 | O usuário deve poder adicionar localização | Existente | `lib/schemas/itinerario.ts` | — | ad9d35b |
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
| RF-07.1 | O usuário deve poder adicionar reserva de voo | Existente | `app/api/trips/[tripId]/bookings/route.ts`<br>`lib/schemas/reserva.ts` | `tests/api/bookings-route.test.ts`<br>`e2e/reservas.spec.ts` | 9b1e74e |
| RF-07.2 | O usuário deve poder adicionar reserva de hotel | Parcial | `app/api/trips/[tripId]/bookings/route.ts`<br>`lib/schemas/reserva.ts` | — | 9b1e74e |
| RF-07.3 | O usuário deve poder adicionar reserva de carro | Parcial | `app/api/trips/[tripId]/bookings/route.ts`<br>`lib/schemas/reserva.ts` | — | 9b1e74e |
| RF-07.4 | O usuário deve poder adicionar reserva de atividade | Parcial | `app/api/trips/[tripId]/bookings/route.ts`<br>`lib/schemas/reserva.ts` | — | 9b1e74e |
| RF-07.5 | O usuário deve poder editar reserva | Existente | `app/api/trips/[tripId]/bookings/[bookingId]/route.ts`<br>`lib/schemas/reserva.ts`<br>`components/booking-list.tsx` | `tests/api/booking-item-route.test.ts`<br>`e2e/reservas.spec.ts` | 9b1e74e |
| RF-07.6 | O usuário deve poder excluir reserva | Existente | `app/api/trips/[tripId]/bookings/[bookingId]/route.ts`<br>`components/booking-list.tsx` | `tests/api/booking-item-route.test.ts`<br>`e2e/reservas.spec.ts` | 9b1e74e |
| RF-07.7 | O usuário deve poder visualizar todas as reservas | Parcial | `app/api/trips/[tripId]/bookings/route.ts`<br>`components/booking-list.tsx` | `tests/api/bookings-route.test.ts`<br>`e2e/reservas.spec.ts` | 9b1e74e |
| RF-08.1 | O usuário deve poder buscar lugares | Parcial | — | — | — |
| RF-08.2 | O usuário deve poder salvar lugares favoritos | Parcial | — | — | — |
| RF-08.3 | O usuário deve poder adicionar notas aos lugares | Parcial | — | — | — |
| RF-08.4 | O usuário deve poder marcar lugares como visitados | Parcial | — | — | — |
| RF-08.5 | O usuário deve poder visualizar lugares no mapa | Parcial | — | — | — |
| RF-08.6 | O usuário deve poder excluir lugares salvos | Parcial | — | — | — |
| RF-09.1 | O usuário deve poder seguir um perfil público, com efeito imediato | Não iniciado | — | `tests/rls/04-social.test.ts` | — |
| RF-09.2 | O usuário deve poder solicitar seguir um perfil privado, gerando solicitação pendente | Não iniciado | — | `tests/rls/04-social.test.ts` | — |
| RF-09.3 | O dono de um perfil privado deve poder visualizar suas solicitações pendentes | Não iniciado | — | `tests/rls/04-social.test.ts` | — |
| RF-09.4 | O dono deve poder aprovar ou recusar uma solicitação | Não iniciado | — | `tests/rls/04-social.test.ts` | — |
| RF-09.5 | O usuário deve poder deixar de seguir, ou cancelar uma solicitação ainda pendente | Não iniciado | — | `tests/rls/04-social.test.ts` | — |
| RF-09.6 | O usuário deve poder visualizar a lista de quem segue e de quem o segue | Não iniciado | — | `tests/rls/04-social.test.ts` | — |
| RF-09.7 | O usuário deve poder publicar uma viagem no feed | Não iniciado | — | — | — |
| RF-09.8 | O usuário deve poder ver no feed as publicações de quem segue, com acesso concedido | Não iniciado | — | — | — |
| RF-09.9 | O usuário deve poder remover um seguidor do próprio perfil, público ou privado | Não iniciado | — | `tests/rls/04-social.test.ts` | — |
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
| RNF-01.1 | O carregamento inicial do painel deve completar em menos de 3 segundos no percentil 95 | Planejado | — | — | — |
| RNF-01.2 | Toda operação de escrita via rota de API deve responder em menos de 1 segundo no percentil 95 | Planejado | — | — | — |
| RNF-01.3 | O sistema deve sustentar 1.000 usuários simultâneos sem degradação superior a 20% no tempo de resposta | Planejado | — | — | — |
| RNF-01.4 | Toda listagem que possa crescer sem limite deve paginar, no máximo 20 registros por página | Planejado | — | — | — |
| RNF-01.5 | Toda coluna usada em filtro de consulta frequente deve ter índice, verificável no plano de execução | Planejado | — | — | — |
| RNF-02.1 | Toda comunicação entre cliente e servidor deve ocorrer sobre HTTPS | Atendido | — | — | — |
| RNF-02.2 | As senhas devem ser armazenadas com algoritmo de hash resistente, nunca em texto claro | Atendido | — | — | — |
| RNF-02.3 | A sessão deve ser mantida por token assinado, validado no servidor a cada requisição | Atendido | — | — | — |
| RNF-02.4 | Toda tabela do banco deve ter Row Level Security habilitada e política por operação utilizada | Atendido | — | `tests/rls/01-isolamento.test.ts`<br>`tests/rls/02-rateio.test.ts`<br>`tests/rls/04-social.test.ts` | — |
| RNF-02.5 | Todo corpo de requisição deve ser validado por esquema no servidor antes de qualquer escrita | Atendido | — | — | — |
| RNF-02.6 | Nenhuma escrita no banco deve partir do navegador: toda alteração passa por rota de API | Parcial | — | — | — |
| RNF-02.7 | Nenhuma rota deve repassar o corpo da requisição diretamente ao banco, evitando atribuição em massa | Atendido | — | — | — |
| RNF-02.8 | As rotas de API devem limitar requisições por usuário e por janela de tempo | Planejado | — | — | — |
| RNF-02.9 | Os dados de `expense_shares` e `settlements` de uma viagem só devem ser visíveis aos seus membros, via RLS | Planejado | — | — | — |
| RNF-02.10 | A chave de serviço do banco, que ignora a Row Level Security, não deve alcançar o navegador nem componentes de interface | Atendido | — | `tests/lib/supabase-admin.test.ts` | — |
| RNF-02.11 | Mensagem de erro devolvida ao cliente não deve revelar nome de coluna, restrição ou detalhe interno do banco | Atendido | `app/api/profile/[userId]/route.ts`<br>`app/api/social/perfil/route.ts` | `tests/api/profile-userid-route.test.ts`<br>`tests/api/social-perfil-route.test.ts` | 3e7ad89 |
| RNF-02.12 | A aplicação deve declarar política de segurança de conteúdo que restrinja as origens de script | Planejado | — | — | — |
| RNF-04.1 | A aplicação deve manter disponibilidade mensal de ao menos 99,5% | Planejado | — | — | — |
| RNF-04.2 | O banco de dados deve ter backup automático diário, com retenção mínima de 7 dias | Planejado | — | — | — |
| RNF-04.3 | O schema do banco deve ser integralmente reproduzível a partir do repositório, sem intervenção manual | Atendido | — | — | — |
| RNF-04.4 | Toda falha de operação deve resultar em mensagem compreensível ao usuário, nunca em tela em branco ou erro não tratado | Parcial | — | — | — |
| RNF-04.5 | A integração contínua deve aplicar as migrações do zero e executar os testes de isolamento a cada alteração do banco | Atendido | — | — | — |
| RNF-06.1 | A aplicação deve executar sem estado no servidor, permitindo múltiplas instâncias simultâneas | Atendido | — | — | — |
| RNF-06.2 | Os arquivos estáticos devem ser servidos por rede de distribuição de conteúdo | Atendido | — | — | — |
| RNF-06.3 | O acesso ao banco deve usar pool de conexões, sem abrir conexão por requisição | Atendido | — | — | — |
| RNF-06.4 | Toda consulta de listagem deve ter limite explícito de registros, sem depender do volume atual de dados | Planejado | — | — | — |
| RNF-07.1 | O feed deve carregar a primeira página (20 publicações) em menos de 2 segundos no percentil 95 | Não iniciado | — | — | — |
| RNF-07.2 | O feed deve paginar por cursor, sem carregar todas as publicações de uma vez | Não iniciado | — | — | — |
| RNF-07.3 | A geração de roteiro por IA deve responder em até 15 segundos, ou informar erro claro ao usuário | Não iniciado | — | — | — |
| RNF-07.4 | A geração de roteiro deve ser limitada a no máximo 10 requisições por usuário por hora | Não iniciado | — | — | — |
| RNF-07.5 | A central de notificações deve carregar as 20 mais recentes em menos de 2 segundos no percentil 95, e o contador de não-lidas deve ser calculado em menos de 500 milissegundos | Não iniciado | — | — | — |
| RNF-08.1 | O cálculo do roteio deve ser determinístico: a soma das partes de `expense_shares` deve sempre igualar o valor total da despesa | Planejado | — | `tests/rls/02-rateio.test.ts` | — |

## Resumo

- Requisitos no catálogo: **120**
- Com implementação marcada: **33**
- Com teste marcado: **34**

_Nenhuma inconsistência._
