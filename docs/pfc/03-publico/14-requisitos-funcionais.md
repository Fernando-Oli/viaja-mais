# 14 — Requisitos Funcionais

Esta seção cataloga os requisitos funcionais do produto, organizados por grupo de
domínio. Cada grupo é apresentado em tabela própria, um requisito por linha,
seguida do respectivo bloco de detalhamento. Onde um requisito envolve dados de
pessoas ou publicações, distinguimos explicitamente o que é público e o que é
privado, pois é essa distinção que fundamenta as políticas de acesso definidas
posteriormente. O status de cada requisito reflete evidência verificável no
repositório, e não intenção: o critério adotado está enunciado no detalhamento do
grupo RF01.

## RF02 — Gestão de Perfil

| ID | Descrição | Status | Prioridade |
|---|---|---|---|
| RF02.1 | O usuário deve poder visualizar seu perfil | Parcial | Alta |
| RF02.2 | O usuário deve poder editar nome e avatar | Parcial | Alta |
| RF02.3 | O usuário deve poder alterar a senha | Parcial | Média |
| RF02.4 | O usuário deve poder excluir a conta | Não iniciado | Baixa |
| RF02.5 | O usuário deve poder definir um nome de usuário (username) único | Não iniciado | Alta |
| RF02.6 | O usuário deve poder escrever uma biografia | Não iniciado | Média |
| RF02.7 | O usuário deve poder tornar o perfil público ou privado | Não iniciado | Alta |

**Detalhamento:** os requisitos RF02.1 a RF02.3 possuem rota implementada
(`app/api/profile/[userId]`, `app/api/profile/update` e
`app/api/auth/change-password`), porém ainda sem teste automatizado; por isso
estão marcados como Parcial. Em um perfil público, o nome, o username, a
biografia e as viagens publicadas são visíveis a qualquer usuário autenticado, e
o ato de seguir tem efeito imediato. Em um perfil privado, os dados básicos —
nome, username, avatar e biografia — permanecem visíveis, mas as publicações só
são acessíveis ao próprio dono e aos seguidores aprovados, e seguir exige
solicitação e aprovação (conforme RF09). A exclusão de conta (RF02.4) remove em
cascata o perfil, os vínculos de seguir, as publicações e as curtidas. Como
decisão de dado a cargo da plataforma, a tabela `profiles` recebe as colunas
`username` (única), `bio` e `is_public`.

## 14.1 Existentes (reaproveitados de `docs/ARCHITECTURE.md` §6, status corrigido)

| ID | Descrição | Status | Prioridade |
|---|---|---|---|
| RF06.1 | Usuário deve poder adicionar despesa com título, valor, categoria e data | Existente | Alta |
| RF06.2 | Usuário deve poder editar despesa | Planejado | Média |
| RF06.3 | Usuário deve poder excluir despesa | Planejado | Média |
| RF06.4 | Usuário deve poder visualizar total de gastos | Existente | Alta |
| RF06.5 | Usuário deve poder visualizar gastos por categoria | Existente | Média |
| RF06.6 | Usuário deve poder comparar gastos com orçamento | A confirmar | Baixa |
| RF06.7 | Sistema deve alertar quando gastos ultrapassarem 80% do orçamento | A confirmar | Baixa |

**Detalhamento:** RF06.1, RF06.4 e RF06.5 têm evidência direta em `app/dashboard/finances/page.tsx`. RF06.2 e RF06.3 estão listados em `docs/plans/00-plano-norte.md` §T1 como CRUD faltando ("editar/excluir despesa") — a documentação anterior os apresentava como prontos, o que o `_regras.md` já identificou como erro a não repetir. RF06.6 e RF06.7 não têm menção nem a favor nem contra no material disponível; ficam "A confirmar" até alguém checar o código, em vez de herdar um status não verificado.

## 14.2 Novos — Roteio de Despesas

| ID | Descrição | Status | Prioridade |
|---|---|---|---|
| RF-06.8 | Usuário deve poder indicar quem pagou a despesa (`paid_by`) | Planejado | Alta |
| RF-06.9 | Usuário deve poder escolher o tipo de rateio: igual, por peso ou por valor exato | Planejado | Alta |
| RF-06.10 | Sistema deve calcular o valor devido por membro (`expense_shares`), conforme o tipo de rateio | Planejado | Alta |
| RF-06.11 | Usuário deve poder visualizar o saldo por membro (quem deve a quem) | Planejado | Alta |
| RF-06.12 | Usuário deve poder marcar uma parcela do rateio como quitada | Planejado | Média |
| RF-06.13 | Sistema deve sugerir transferências para acerto de contas (`minimizarTransferencias()`) | Planejado | Baixa |

**Detalhamento:** estes requisitos ainda não têm nenhuma evidência no código — são o escopo da trilha T2, que corre da S02 à S10. Os nomes de tabela e função (`expense_shares`, `settlements`, `paid_by`, `calcularSaldos()`, `minimizarTransferencias()`) já foram decididos em `plano-norte.md` §T2 e devem ser usados como estão, para não haver dois nomes diferentes para a mesma coisa entre a documentação e o código quando o Micael implementar. Os IDs `RF-NOVO` precisam ser substituídos pelo próximo número livre da sequência global antes do merge.



## RF09 — Rede Social

| ID | Descrição | Status | Prioridade |
|---|---|---|---|
| RF09.1 | O usuário deve poder seguir um perfil público, com efeito imediato | Não iniciado | Alta |
| RF09.2 | O usuário deve poder solicitar seguir um perfil privado, gerando solicitação pendente | Não iniciado | Alta |
| RF09.3 | O dono de um perfil privado deve poder visualizar suas solicitações pendentes | Não iniciado | Alta |
| RF09.4 | O dono deve poder aprovar ou recusar uma solicitação | Não iniciado | Alta |
| RF09.5 | O usuário deve poder deixar de seguir, ou cancelar uma solicitação ainda pendente | Não iniciado | Média |
| RF09.6 | O usuário deve poder visualizar a lista de quem segue e de quem o segue | Não iniciado | Média |
| RF09.7 | O usuário deve poder publicar uma viagem no feed | Não iniciado | Alta |
| RF09.8 | O usuário deve poder ver no feed as publicações de quem segue, com acesso concedido | Não iniciado | Alta |
| RF09.9 | O usuário deve poder remover um seguidor do próprio perfil, público ou privado | Não iniciado | Média |

**Detalhamento:** seguir um perfil público cria o vínculo já no estado aceito;
seguir um perfil privado cria um vínculo pendente, que só se torna aceito após a
aprovação do dono (RF09.4). Recusar descarta a solicitação. Não é permitido
seguir a si mesmo, e solicitar duas vezes é idempotente. Quanto à visibilidade,
que fundamenta as políticas de acesso, um seguidor só vê as publicações de um
perfil privado quando o vínculo está aceito. Publicar uma viagem (RF09.7) expõe
apenas título, destino, datas, imagem de capa e itinerário; nunca despesas,
orçamento ou os demais membros da viagem. O feed (RF09.8) traz somente
publicações a que o usuário tem acesso. Remover seguidor (RF09.9) é silencioso —
o sistema não notifica o removido — e não impõe barreira: o removido pode voltar
a seguir, se o perfil for público, ou solicitar novamente, se for privado, e é
essa ausência de barreira que mantém a remoção indetectável; remover apenas
desfaz o vínculo aceito, e em um perfil privado o removido perde o acesso às
publicações. Bloquear usuário está fora do escopo deste período. Como decisão de
dado a cargo da plataforma, criam-se a tabela `follows`, com estado pendente ou
aceito, e a tabela `trip_posts`.

## RF10 — Interação Social

| ID | Descrição | Status | Prioridade |
|---|---|---|---|
| RF10.1 | O usuário deve poder curtir uma publicação | Não iniciado | Média |
| RF10.2 | O usuário deve poder remover a própria curtida | Não iniciado | Baixa |
| RF10.3 | O usuário deve poder comentar em uma publicação | Não iniciado | Baixa |
| RF10.4 | O usuário deve poder excluir o próprio comentário | Não iniciado | Baixa |

**Detalhamento:** curtidas e comentários só existem sobre publicações que o
usuário pode ver — perfis públicos que ele segue ou perfis privados que o
aprovaram. Cada usuário remove apenas a própria curtida ou o próprio comentário;
o dono da publicação também pode remover comentários feitos na sua publicação.
Como decisão de dado a cargo da plataforma, criam-se as tabelas `post_likes` e
`post_comments`. A prioridade é reduzida por este grupo integrar a linha de corte
do projeto.

## RF11 — Avaliações de Lugares

| ID | Descrição | Status | Prioridade |
|---|---|---|---|
| RF11.1 | O usuário deve poder avaliar um lugar, com nota e comentário | Não iniciado | Média |
| RF11.2 | O usuário deve poder ver as avaliações de um lugar feitas por outros usuários | Não iniciado | Média |
| RF11.3 | O usuário deve poder editar ou excluir a própria avaliação | Não iniciado | Baixa |

**Detalhamento:** este grupo atende à promessa da página inicial "Avaliações e
Reviews — compartilhe experiências e ajude outros viajantes". Quanto à
visibilidade, as avaliações são públicas a qualquer usuário autenticado, pois
alimentam a descoberta; cada usuário edita ou exclui apenas a própria. A nota é
numérica, de 1 a 5, com texto opcional. A tela de lugar pertence ao domínio de
Viagem & Itinerário; a ação de avaliar pertence a este domínio. Como decisão de
dado a cargo da plataforma, cria-se a tabela `place_reviews`.

## RF12 — IA de Roteiros

| ID | Descrição | Status | Prioridade |
|---|---|---|---|
| RF12.1 | O usuário deve poder gerar um roteiro por IA a partir de destino, datas e interesses | Não iniciado | Alta |
| RF12.2 | O usuário deve poder revisar e editar o roteiro gerado antes de gravá-lo | Não iniciado | Alta |
| RF12.3 | O usuário deve poder descartar o roteiro gerado sem salvar nada | Não iniciado | Média |

**Detalhamento:** este grupo atende à promessa "Recomendações Personalizadas" da
página inicial e ao roadmap de recomendações com IA descrito no modelo de
negócio. Como regra de segurança, a saída do modelo nunca é gravada diretamente
no banco — o usuário revisa e aprova primeiro (RF12.2), e a saída é validada
antes de tornar-se itens de itinerário. A chave da IA permanece apenas no
servidor, nunca exposta ao navegador. Em desenvolvimento e em integração
contínua utiliza-se um gerador determinístico. Quanto à visibilidade, o roteiro
gerado é privado ao usuário até que ele decida salvá-lo na viagem.

## RF13 — Notificações

| ID | Descrição | Status | Prioridade |
|---|---|---|---|
| RF13.1 | O usuário deve receber notificação informativa quando alguém começa a segui-lo (perfil público) | Não iniciado | Média |
| RF13.2 | O usuário deve receber notificação acionável de nova solicitação de seguidor (perfil privado), que permanece visível até ser aceita ou recusada | Não iniciado | Alta |
| RF13.3 | O usuário deve receber notificação informativa quando sua solicitação de seguir é aceita | Não iniciado | Média |
| RF13.4 | O usuário deve poder ver a central de notificações, com contador de não-lidas e marcação de lidas | Não iniciado | Alta |

**Detalhamento:** há dois comportamentos distintos. As notificações acionáveis
(RF13.2, solicitações) ficam em uma seção própria e só saem quando resolvidas por
RF09.4, ao aprovar ou recusar; marcá-las como lidas não as remove. As
informativas (RF13.1 e RF13.3) entram em uma lista cronológica e são marcadas
como lidas ao serem visualizadas. Quanto à visibilidade, cada usuário vê apenas
as próprias notificações. Não há entrega em tempo real — o projeto não utiliza
Realtime; as notificações são registros persistidos, exibidos ao abrir a central
ou por atualização periódica. Ficam fora do escopo deste período as notificações
de curtida, comentário e nova publicação, deliberadamente omitidas pelo alto
volume que gerariam. Como decisão de dado a cargo da plataforma, cria-se a tabela
`notifications`, com usuário destino, tipo, ator, referência, marcação de lida e
data de criação.

## RF03 — Gestão de Viagens

ID | Descrição | Status | Prioridade
--- | --- | --- | ---
| RF03.1 | O usuário deve poder criar nova viagem | Parcial | Alta
| RF03.2 | O usuário deve poder editar viagem | Existente | Alta
| RF03.3 | O usuário deve poder excluir viagem | Parcial | Média
| RF03.4 | O usuário deve poder visualizar lista de viagens | Parcial | Alta
| RF03.5 | O usuário deve poder visualizar detalhes da viagem | Parcial | Alta
| RF03.6 | O usuário deve poder definir orçamento | Parcial | Média
| RF03.7 | O usuário deve poder adicionar imagem de capa | Parcial | Baixa
| RF03.8 | O usuário deve poder alterar status da viagem | Parcial | Média

Detalhamento: aplicamos a este grupo o mesmo critério de status descrito em RF01 e RF04 — **Existente** exige implementação e teste automatizado que a exercite. O RF03.2 passou a atendê-lo com a tela `app/dashboard/trips/[id]/edit`, que usa a rota de atualização restrita ao dono da viagem e é coberta por teste de integração (`tests/api/trips-patch.test.ts`) e por teste ponta a ponta em navegador de computador e de celular (`e2e/editar-viagem.spec.ts`). Os demais requisitos têm implementação, mas ainda não têm teste que os exercite por completo — o RF03.1, por exemplo, tem a rota testada, mas não a tela —, e por isso permanecem como parciais. O defeito de vínculo do proprietário com os membros da viagem, antes citado aqui, foi corrigido na correção dos defeitos P0 (versão 2.4 da Parte 00).

## RF05 — Itinerário

ID | Descrição | Status | Prioridade
--- | --- | --- | ---
| RF05.1 | O usuário deve poder adicionar atividade ao itinerário | Existente | Alta
| RF05.2 | O usuário deve poder editar atividade | Existente | Alta
| RF05.3 | O usuário deve poder excluir atividade | Existente | Média
| RF05.4 | O usuário deve poder visualizar itinerário por data | Parcial | Alta
| RF05.5 | O usuário deve poder categorizar atividades | Parcial | Média
| RF05.6 | O usuário deve poder definir horários | Existente | Média
| RF05.7 | O usuário deve poder adicionar localização | Existente | Média

Detalhamento: aplicamos o mesmo critério de status de RF01 e RF04. Incluir, editar, concluir e excluir atividade passam por rotas de API restritas aos participantes da viagem (`app/api/trips/[tripId]/itinerary/` e `.../[itemId]/`), que validam os dados e gravam apenas os campos previstos; estão cobertas por testes de integração (`tests/api/itinerary-route.test.ts` e `tests/api/itinerary-item-route.test.ts`) e por testes ponta a ponta (`e2e/adicionar-atividade.spec.ts` e `e2e/itinerario-crud.spec.ts`), o que classifica RF05.1, RF05.2 e RF05.3 como existentes. A conclusão de uma atividade é tratada como edição do seu status (RF05.2). O RF05.6 é existente porque os testes exercitam a regra de horário — término anterior ao início é recusado —, e o RF05.7 porque o teste ponta a ponta altera o local e confere o novo valor na tela. O RF05.4 e o RF05.5 permanecem parciais: a lista agrupa por data e exibe a categoria, mas nenhum teste verifica o agrupamento nem a recusa de categoria inválida. O defeito no filtro que exibia itens de viagens alheias, antes citado aqui, foi corrigido na versão 2.4 da Parte 00.

## RF07 — Reservas

ID | Descrição | Status | Prioridade
--- | --- | --- | ---
| RF07.1 | O usuário deve poder adicionar reserva de voo | Parcial | Alta
| RF07.2 | O usuário deve poder adicionar reserva de hotel | Parcial | Alta
| RF07.3 | O usuário deve poder adicionar reserva de carro | Parcial | Média
| RF07.4 | O usuário deve poder adicionar reserva de atividade | Parcial | Média
| RF07.5 | O usuário deve poder editar reserva | Não iniciado | Alta
| RF07.6 | O usuário deve poder excluir reserva | Não iniciado | Média
| RF07.7 | O usuário deve poder visualizar todas as reservas | Parcial | Alta

Detalhamento: existe uma tela de criação de reservas, mas ela ainda não possui um ponto de entrada no fluxo normal da aplicação. As operações de edição e exclusão também permanecem previstas para uma atividade posterior. Por isso, a criação e visualização são classificadas como parciais, enquanto edição e exclusão permanecem não iniciadas.

## RF08 — Lugares e Mapas

ID | Descrição | Status | Prioridade
--- | --- | --- | ---
| RF08.1 | O usuário deve poder buscar lugares | Parcial | Alta
| RF08.2 | O usuário deve poder salvar lugares favoritos | Parcial | Alta
| RF08.3 | O usuário deve poder adicionar notas aos lugares | Parcial | Média
| RF08.4 | O usuário deve poder marcar lugares como visitados | Parcial | Média
| RF08.5 | O usuário deve poder visualizar lugares no mapa | Parcial | Média
| RF08.6 | O usuário deve poder excluir lugares salvos | Parcial | Média

Detalhamento: o domínio de lugares possui implementação existente, porém ainda há funcionalidades incompletas. O estado de lugar visitado já é exibido, mas atualmente não existe uma interface que permita alterá-lo e persistir essa mudança. Por isso, os requisitos permanecem classificados de forma conservadora como parciais.

## RF01 — Autenticação e Acesso

| ID | Descrição | Status | Prioridade |
|---|---|---|---|
| RF01.1 | O usuário deve poder registrar-se com e-mail e senha | Parcial | Alta |
| RF01.2 | O sistema deve enviar e-mail de confirmação após o registro | Parcial | Alta |
| RF01.3 | O usuário deve poder autenticar-se com e-mail e senha | Parcial | Alta |
| RF01.4 | O usuário deve poder encerrar a sessão | Parcial | Alta |
| RF01.5 | O sistema deve manter e renovar a sessão entre requisições | Existente | Alta |
| RF01.6 | O sistema deve barrar o acesso não autenticado às rotas protegidas | Existente | Alta |
| RF01.7 | O usuário deve poder redefinir por e-mail a senha esquecida | Existente | Média |
| RF01.8 | O usuário autenticado deve poder alterar a própria senha, confirmando a senha atual | Parcial | Média |

**Detalhamento:** adotamos nestes dois grupos um critério explícito de status,
para não repetir o erro que o arquivo `_regras.md` identifica na documentação
anterior. Classificamos como **Existente** apenas o requisito que possui
implementação no repositório **e** teste automatizado que a exercita; como
**Parcial**, aquele cuja implementação existe mas ainda não é coberta por teste;
e como **Não iniciado**, o que não tem código correspondente. O status, portanto,
mede evidência verificável, e não intenção.

Os requisitos RF01.1 a RF01.4 têm tela ou rota implementada — respectivamente
`app/auth/sign-up/page.tsx`, o fluxo de confirmação do Supabase com retorno em
`app/auth/sign-up-success`, `app/auth/login/page.tsx` e `app/auth/signout/route.ts`
—, mas nenhum deles é hoje coberto por teste. O RF01.5 e o RF01.6 são atendidos
por `proxy.ts` e `lib/supabase/proxy.ts`, que renovam a sessão e aplicam uma
lista de rotas públicas: requisição não autenticada a uma rota de `/api` recebe
401 em JSON, e a requisição de página é redirecionada para `/auth/login`. A
validação usa `getUser()`, que confere o token no servidor de autenticação, e não
`getSession()`, que apenas decodifica o cookie e por isso não serve para decidir
acesso. O RF01.7 conta com teste de regressão em `tests/auth/reset-password.test.tsx`.
O RF01.8 é implementado por `app/api/auth/change-password/route.ts`, que exige a
senha atual antes de aceitar a nova, impedindo que uma sessão sequestrada altere
a credencial sem conhecê-la.

## RF04 — Viagens em Grupo

| ID | Descrição | Status | Prioridade |
|---|---|---|---|
| RF04.1 | O dono da viagem deve poder convidar pessoas por e-mail | Parcial | Alta |
| RF04.2 | O convidado deve receber notificação do convite por e-mail | Não iniciado | Alta |
| RF04.3 | O convidado deve poder aceitar ou recusar o convite | Parcial | Alta |
| RF04.4 | Os membros devem poder visualizar a viagem e seus dados | Parcial | Alta |
| RF04.5 | Os membros devem poder editar o itinerário da viagem | Parcial | Alta |
| RF04.6 | Os membros devem poder adicionar despesas à viagem | Parcial | Alta |
| RF04.7 | O dono deve poder remover membros da viagem | Existente | Média |
| RF04.8 | O membro deve poder sair da viagem por vontade própria | Existente | Média |
| RF04.9 | Toda operação sobre uma viagem deve verificar participação ou propriedade no servidor, antes de consultar o banco | Existente | Alta |

**Detalhamento:** o RF04.1 permanece Parcial por um motivo preciso, e não por
cautela genérica: a rota `app/api/invitations/route.ts` já exige sessão, valida o
corpo com `zod` e chama `exigirDono()` antes de gravar, mas o envio do e-mail
ainda falha. A chamada `auth.admin.inviteUserByEmail` exige a chave de serviço, e
o cliente utilizado é o anônimo; o convite é registrado na tabela
`trip_invitations` e o erro de envio é apenas registrado em log. Enquanto isso
não for corrigido pela atividade `S03-F-convite-email`, o RF04.2 não tem como ser
atendido e permanece Não iniciado — o convidado só descobre o convite se abrir a
aplicação por conta própria, o que `app/api/invitations` (GET) já permite.

Os requisitos RF04.7 e RF04.8 são atendidos por
`app/api/trips/[tripId]/members/route.ts` e cobertos por
`tests/api/members-route.test.ts`, que exercita os quatro caminhos exigidos pelo
`CLAUDE.md`: resposta bem-sucedida, ausência de sessão, requisitante sem
permissão e corpo inválido. O RF04.9 não consta do levantamento herdado de
`docs/ARCHITECTURE.md`, mas descreve comportamento já implementado e testado, em
`lib/authz/trip.ts` (`exigirMembro()` e `exigirDono()`) com teste em
`tests/lib/authz-trip.test.ts`; registramo-lo como requisito porque é ele que
sustenta a distinção entre dono e membro em todos os demais itens deste grupo, e
porque sem enunciá-lo a seção 25 discutiria uma medida de segurança que nenhum
requisito pede. Os requisitos RF04.4 a RF04.6 dependem do escopo de grupo nas
consultas, hoje ainda filtradas por proprietário em parte das telas, o que é
objeto da atividade `S05-F-escopo-grupo`.

> [!] PENDENTE: grupos de outros domínios — RF06 (financeiro, parcial); RNF03 (usabilidade) e RNF05 (manutenibilidade) — a cargo de seus respectivos donos.
