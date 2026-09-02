# 14 — Requisitos Funcionais

Esta seção cataloga os requisitos funcionais do domínio Social & Descoberta e IA
de roteiros. Cada grupo é apresentado em tabela própria, um requisito por linha,
seguida do respectivo bloco de detalhamento. Onde um requisito envolve dados de
pessoas ou publicações, distinguimos explicitamente o que é público e o que é
privado, pois é essa distinção que fundamenta as políticas de acesso definidas
posteriormente.

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

> [!] PENDENTE: grupos de outros domínios — RF01 (autenticação), RF03 (viagens), RF04 (grupo), RF05 (itinerário), RF06 (financeiro), RF07 (reservas), RF08 (lugares); RNF01–RNF06 — a cargo de seus respectivos donos.
