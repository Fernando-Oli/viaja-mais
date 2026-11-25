## 14 Requisitos Funcionais

Os requisitos estão agrupados por domínio, em tabelas de RF01 a RF13. Os identificadores são os do catálogo mantido no repositório, os mesmos das marcações de rastreabilidade no código e nos testes, de modo que cada requisito citado aqui pode ser localizado nos arquivos do projeto. A coluna "Regras" liga cada requisito às regras de negócio da seção 13, que por sua vez apontam de volta para cá.

### 14.1 Critério de status

O status registra o estado verificado no repositório em 25/11/2026, e não intenção. O critério vale para todos os grupos:

| Status | Critério |
|---|---|
| Implementado | Código integrado ao ramo principal e teste automatizado vinculado ao requisito na matriz de rastreabilidade (seção 24) |
| Parcial | O comportamento existe em parte: falta tela, operação ou teste vinculado ao requisito |
| Não iniciado | Não há código que atenda ao requisito; tela de prévia com dados de exemplo não conta |

A integração contínua confere o primeiro critério: o processo falha se um requisito marcado como implementado não tiver teste vinculado. Ela não confere se o teste exercita o comportamento descrito; isso foi feito na conferência de 22/11/2026, requisito a requisito.

Na conferência, quando o requisito é uma ação do usuário e a tela existe sem teste que a exercite, o status passou a parcial, critério que o catálogo já aplicava ao RF03.3 e ao RF03.4. Sete requisitos mudaram: RF01.2, RF01.7, RF01.8, RF02.3, RF04.7, RF04.8 e RF09.7. Em 25/11/2026, 57 dos 97 requisitos funcionais estão implementados, 30 parciais e 10 não iniciados.

### 14.2 Autenticação e Acesso (RF01)

| ID | Descrição | Status | Prioridade | Regras |
|---|---|---|---|---|
| RF01.1 | O usuário deve poder registrar-se com e-mail e senha | Implementado | Alta | RNE-001, RNE-003 |
| RF01.2 | O sistema deve enviar e-mail de confirmação após o registro | Parcial | Alta | RNE-002 |
| RF01.3 | O usuário deve poder autenticar-se com e-mail e senha | Implementado | Alta | RNE-002 |
| RF01.4 | O usuário deve poder encerrar a sessão | Implementado | Alta | — |
| RF01.5 | O sistema deve manter e renovar a sessão entre requisições | Implementado | Alta | RNE-004 |
| RF01.6 | O sistema deve barrar o acesso não autenticado às rotas protegidas | Implementado | Alta | RNE-004 |
| RF01.7 | O usuário deve poder redefinir por e-mail a senha esquecida | Parcial | Média | RNE-003 |
| RF01.8 | O usuário autenticado deve poder alterar a própria senha, confirmando a senha atual | Parcial | Média | RNE-003, RNE-044 |

**Detalhamento:**

- **RF01.1** — A tela de cadastro aplica a política de senha antes de enviar e decide o destino pela resposta do serviço de autenticação, de modo que funciona com a confirmação de e-mail ligada ou desligada. O teste de unidade da tela e o teste ponta a ponta da jornada completa, que cria a conta pela tela, o comprovam.
- **RF01.2** — Parcial desde a conferência. Implementação: sem sessão na resposta do cadastro, a tela leva à página de aguardo da confirmação (`app/auth/sign-up/page.tsx`). Teste: `tests/auth/sign-up.test.tsx` prova esse desvio com o serviço de autenticação simulado. Motivo: o envio cabe ao serviço de autenticação, com a confirmação desligada em `supabase/config.toml`, e nenhum teste comprova que o e-mail sai.
- **RF01.3 e RF01.4** — Entrar e sair têm tela e rota. O teste ponta a ponta de sessão entra com e-mail e senha, usa o menu Sair e confere que a área logada volta a exigir login.
- **RF01.5 e RF01.6** — A camada que intercepta as requisições renova a sessão e barra o acesso: rota de dados sem sessão recebe 401, e página é redirecionada ao login. O teste ponta a ponta de sessão navega e recarrega sem novo login, e os testes de proteção de rotas cobrem os dois bloqueios.
- **RF01.7** — Parcial desde a conferência. Implementação: `app/auth/reset-password/page.tsx` pede o e-mail de recuperação e, com a sessão de recuperação, grava a nova senha. Teste: `tests/auth/reset-password.test.tsx` cobre a tela sem token e o pedido do e-mail. Motivo: a gravação da nova senha não é exercitada por teste.
- **RF01.8** — Parcial desde a conferência. Implementação: rota `app/api/auth/change-password/route.ts`, que exige a senha atual para que uma sessão sequestrada não altere a credencial, e formulário em `app/dashboard/settings/page.tsx`. Teste: `tests/api/change-password-route.test.ts`, caminhos 200, 401, 400 e 429. Motivo: a tela não é exercitada por teste.

### 14.3 Gestão de Perfil (RF02)

| ID | Descrição | Status | Prioridade | Regras |
|---|---|---|---|---|
| RF02.1 | O usuário deve poder visualizar seu perfil | Implementado | Alta | — |
| RF02.2 | O usuário deve poder editar nome e avatar | Implementado | Alta | RNE-044 |
| RF02.3 | O usuário deve poder alterar a senha | Parcial | Média | RNE-003 |
| RF02.4 | O usuário deve poder excluir a conta | Não iniciado | Baixa | RNE-005 |
| RF02.5 | O usuário deve poder definir um nome de usuário (username) único | Implementado | Alta | RNE-027 |
| RF02.6 | O usuário deve poder escrever uma biografia | Implementado | Média | — |
| RF02.7 | O usuário deve poder tornar o perfil público ou privado | Implementado | Alta | RNE-022 |
| RF02.8 | O usuário deve poder visualizar o perfil de outro usuário | Implementado | Alta | RNE-022, RNE-031 |

**Detalhamento:**

- **RF02.1, RF02.2 e RF02.5 a RF02.7** — O perfil é lido e gravado por rota própria, que aceita só os campos previstos e toma o identificador da sessão; ninguém edita o perfil de outra pessoa.
- **RF02.2** — A foto é conferida pelo conteúdo do arquivo e guardada em área privada; chega ao navegador apenas por endereço temporário, emitido a quem está autenticado.
- **RF02.3** — Repete o RF01.8, com a mesma rota, a mesma tela e o mesmo teste de rota; por isso passou também a parcial na conferência.
- **RF02.4** — Não há rota nem tela de exclusão de conta. Quando existir, deverá seguir a RNE-005.
- **RF02.8** — O perfil de outra pessoa abre a partir da busca e mostra dados básicos, contadores e a situação do vínculo com quem visita.

### 14.4 Gestão de Viagens (RF03)

| ID | Descrição | Status | Prioridade | Regras |
|---|---|---|---|---|
| RF03.1 | O usuário deve poder criar nova viagem | Implementado | Alta | RNE-006, RNE-009 |
| RF03.2 | O usuário deve poder editar viagem | Implementado | Alta | RNE-006, RNE-007, RNE-009 |
| RF03.3 | O usuário deve poder excluir viagem | Parcial | Média | RNE-008 |
| RF03.4 | O usuário deve poder visualizar lista de viagens | Parcial | Alta | — |
| RF03.5 | O usuário deve poder visualizar detalhes da viagem | Implementado | Alta | — |
| RF03.6 | O usuário deve poder definir orçamento | Parcial | Média | RNE-007, RNE-018 |
| RF03.7 | O usuário deve poder adicionar imagem de capa | Não iniciado | Baixa | RNE-007 |
| RF03.8 | O usuário deve poder alterar status da viagem | Parcial | Média | RNE-007 |

**Detalhamento:**

- **RF03.1 e RF03.2** — Criar e editar passam por rotas que validam as datas e restringem a edição ao dono. Ambos têm teste de integração e teste ponta a ponta em navegador de computador e de celular.
- **RF03.5** — O teste da jornada completa cria uma viagem e abre o detalhe dela, o que o classifica como implementado.
- **RF03.3 e RF03.4** — Excluir e listar têm a rota testada, mas a tela não é exercitada por teste.
- **RF03.6 e RF03.8** — Orçamento e situação fazem parte do formulário e da rota de edição, sem teste que os verifique.
- **RF03.7** — A tela exibe a capa quando ela existe, mas nenhuma tela ou rota permite defini-la.

### 14.5 Viagens em Grupo (RF04)

| ID | Descrição | Status | Prioridade | Regras |
|---|---|---|---|---|
| RF04.1 | O dono da viagem deve poder convidar pessoas por e-mail | Implementado | Alta | RNE-010, RNE-044 |
| RF04.2 | O convidado deve receber notificação do convite por e-mail | Parcial | Alta | RNE-010 |
| RF04.3 | O convidado deve poder aceitar ou recusar o convite | Implementado | Alta | RNE-011, RNE-016, RNE-017 |
| RF04.4 | Os membros devem poder visualizar a viagem e seus dados | Implementado | Alta | RNE-011, RNE-015 |
| RF04.5 | Os membros devem poder editar o itinerário da viagem | Implementado | Alta | RNE-007, RNE-015 |
| RF04.6 | Os membros devem poder adicionar despesas à viagem | Implementado | Alta | RNE-007, RNE-015 |
| RF04.7 | O dono deve poder remover membros da viagem | Parcial | Média | RNE-012, RNE-017 |
| RF04.8 | O membro deve poder sair da viagem por vontade própria | Parcial | Média | RNE-012, RNE-042 |
| RF04.9 | Toda operação sobre uma viagem deve verificar participação ou propriedade no servidor, antes de consultar o banco | Implementado | Alta | RNE-015 |

**Detalhamento:**

- **RF04.1 e RF04.2** — O convite é gravado antes do envio do e-mail, para que uma falha de envio não desfaça um convite válido. O RF04.2 é parcial porque o e-mail só chega a quem ainda não tem conta; quem já tem encontra o convite na aplicação.
- **RF04.3** — Aceitar ou recusar é ato do próprio convidado. Os testes de rota, de isolamento e ponta a ponta provam também que ninguém entra numa viagem sem convite pendente.
- **RF04.4** — As telas consultam as viagens pela participação, e não pela autoria, por meio de um módulo único de escopo de grupo.
- **RF04.5 e RF04.6** — As rotas de itinerário e de despesas admitem qualquer participante. Os testes de RLS do participante provam que o membro convidado edita o itinerário e registra despesa que a dona vê.
- **RF04.7** — Parcial desde a conferência. Implementação: rota `app/api/trips/[tripId]/members/route.ts` e botão Remover, com confirmação, em `components/trip-members.tsx`. Teste: `tests/api/members-route.test.ts` cobre sucesso, ausência de sessão, falta de permissão e corpo inválido. Motivo: a remoção pela tela não é exercitada por teste.
- **RF04.8** — Parcial desde a conferência. A mesma rota e o mesmo teste cobrem a saída voluntária, mas nenhuma tela permite ao membro sair da viagem.
- **RF04.9** — Não consta do levantamento herdado; registramo-lo porque sustenta a distinção entre dono e membro em todo o grupo e é a medida discutida na seção 25. As funções `exigirMembro` e `exigirDono` têm teste de unidade com os caminhos 401, 403 e falha do banco.

### 14.6 Itinerário (RF05)

| ID | Descrição | Status | Prioridade | Regras |
|---|---|---|---|---|
| RF05.1 | O usuário deve poder adicionar atividade ao itinerário | Implementado | Alta | RNE-013 |
| RF05.2 | O usuário deve poder editar atividade | Implementado | Alta | — |
| RF05.3 | O usuário deve poder excluir atividade | Implementado | Média | — |
| RF05.4 | O usuário deve poder visualizar itinerário por data | Parcial | Alta | — |
| RF05.5 | O usuário deve poder categorizar atividades | Parcial | Média | RNE-014 |
| RF05.6 | O usuário deve poder definir horários | Parcial | Média | RNE-045 |
| RF05.7 | O usuário deve poder adicionar localização | Parcial | Média | — |

**Detalhamento:**

- **RF05.1 a RF05.3** — Incluir, editar, concluir e excluir atividade passam por rotas restritas aos participantes, com testes de integração e ponta a ponta. Concluir é tratado como edição da situação da atividade.
- **RF05.4 e RF05.5** — A lista agrupa por data e exibe a categoria, mas nenhum teste verifica o agrupamento nem a recusa de categoria inválida.
- **RF05.6 e RF05.7** — Os testes de rota recusam término anterior ao início, e o teste ponta a ponta altera o local, mas esses testes não estão vinculados aos dois requisitos; por isso ficam como parciais.

### 14.7 Controle Financeiro e Rateio (RF06)

| ID | Descrição | Status | Prioridade | Regras |
|---|---|---|---|---|
| RF06.1 | O usuário deve poder adicionar despesa com título, valor, categoria e data | Implementado | Alta | RNE-013 |
| RF06.2 | O usuário deve poder editar despesa | Implementado | Média | RNE-039 |
| RF06.3 | O usuário deve poder excluir despesa | Implementado | Média | RNE-039 |
| RF06.4 | O usuário deve poder visualizar total de gastos | Parcial | Alta | RNE-018 |
| RF06.5 | O usuário deve poder visualizar gastos por categoria | Implementado | Média | RNE-014 |
| RF06.6 | O usuário deve poder comparar gastos com orçamento | Parcial | Baixa | RNE-018 |
| RF06.7 | O sistema deve alertar quando gastos ultrapassarem 80% do orçamento | Parcial | Baixa | RNE-018 |
| RF06.8 | O usuário deve poder indicar quem pagou a despesa | Parcial | Alta | RNE-019 |
| RF06.9 | O usuário deve poder escolher o tipo de rateio: igual, por peso ou por valor exato | Implementado | Alta | RNE-020, RNE-038 |
| RF06.10 | O sistema deve calcular o valor devido por membro, conforme o tipo de rateio | Implementado | Alta | RNE-020, RNE-038 |
| RF06.11 | O usuário deve poder visualizar o saldo por membro (quem deve a quem) | Implementado | Alta | RNE-040, RNE-042 |
| RF06.12 | O usuário deve poder marcar uma parcela do rateio como quitada | Parcial | Média | RNE-021 |
| RF06.13 | O sistema deve sugerir transferências para acerto de contas | Implementado | Baixa | RNE-021, RNE-040, RNE-041 |

**Detalhamento:**

- **RF06.1 a RF06.3** — Registrar, editar e excluir despesa passam por rotas que gravam apenas os campos previstos. Editar e excluir ficam restritos a quem registrou a despesa ou ao dono da viagem.
- **RF06.4 a RF06.7** — A tela de finanças totaliza por moeda e por categoria e muda a cor da barra de orçamento a partir de 80% e de 100%. Só o relatório por categoria tem teste, e não há um alerta propriamente dito.
- **RF06.8** — O pagador é registrado automaticamente como quem lançou a despesa; ainda não há como indicar outra pessoa.
- **RF06.9 e RF06.10** — O rateio é calculado em centavos inteiros na tela, como prévia, e recalculado no servidor, que não aceita as partes calculadas pelo navegador. Ao editar o valor de uma despesa dividida, as partes são recalculadas.
- **RF06.11 e RF06.13** — O acerto mostra o saldo de cada participante, separado por moeda, e sugere as transferências que o zeram. Cada transferência pode ser registrada como paga, total ou parcialmente, por quem pagou.
- **RF06.12** — A parcela tem campo de quitação, que o acerto respeita, mas nenhuma operação o preenche. A quitação passou a ser feita pelo registro de pagamento do RF06.13, que não se prende a uma parcela.
- **Conversão entre moedas** — Existe função de conversão por cotação informada, com teste de unidade, ainda não usada por nenhuma tela; por isso os totais continuam separados por moeda.

### 14.8 Reservas (RF07)

| ID | Descrição | Status | Prioridade | Regras |
|---|---|---|---|---|
| RF07.1 | O usuário deve poder adicionar reserva de voo | Implementado | Alta | RNE-013, RNE-014 |
| RF07.2 | O usuário deve poder adicionar reserva de hotel | Parcial | Alta | RNE-013, RNE-014 |
| RF07.3 | O usuário deve poder adicionar reserva de carro | Parcial | Média | RNE-013, RNE-014 |
| RF07.4 | O usuário deve poder adicionar reserva de atividade | Parcial | Média | RNE-013, RNE-014 |
| RF07.5 | O usuário deve poder editar reserva | Implementado | Alta | — |
| RF07.6 | O usuário deve poder excluir reserva | Implementado | Média | — |
| RF07.7 | O usuário deve poder visualizar todas as reservas | Parcial | Alta | — |

**Detalhamento:**

- **RF07.1, RF07.5 e RF07.6** — Criar, editar e excluir passam por rotas restritas aos participantes. O teste ponta a ponta cria uma reserva de voo pela aba Reservas da viagem, a edita e a exclui.
- **RF07.2 a RF07.4** — Hotel, carro e atividade usam o mesmo formulário e a mesma rota, mas nenhum teste cria reserva desses tipos.
- **RF07.7** — A listagem por viagem é testada; a tela geral de reservas, não.
- **Busca e compra** — As telas de busca de reservas e de compra de passagens e de hospedagem são prévias com dados de exemplo e não atendem a nenhum requisito deste grupo.

### 14.9 Lugares e Mapas (RF08)

| ID | Descrição | Status | Prioridade | Regras |
|---|---|---|---|---|
| RF08.1 | O usuário deve poder buscar lugares | Parcial | Alta | — |
| RF08.2 | O usuário deve poder salvar lugares favoritos | Parcial | Alta | RNE-013 |
| RF08.3 | O usuário deve poder adicionar notas aos lugares | Parcial | Média | — |
| RF08.4 | O usuário deve poder marcar lugares como visitados | Implementado | Média | — |
| RF08.5 | O usuário deve poder visualizar lugares no mapa | Parcial | Média | — |
| RF08.6 | O usuário deve poder excluir lugares salvos | Implementado | Média | — |

**Detalhamento:**

- **RF08.4 e RF08.6** — O teste ponta a ponta marca um lugar como visitado, confirma que o estado persiste após recarregar a página, desmarca e exclui o lugar.
- **RF08.1, RF08.2, RF08.3 e RF08.5** — Dependem do componente de busca do Google Maps, que não carrega com a chave usada nos testes. Salvar e anotar têm a rota testada, mas não a tela.

### 14.10 Rede Social (RF09)

| ID | Descrição | Status | Prioridade | Regras |
|---|---|---|---|---|
| RF09.1 | O usuário deve poder seguir um perfil público, com efeito imediato | Implementado | Alta | RNE-022, RNE-028, RNE-029, RNE-044 |
| RF09.2 | O usuário deve poder solicitar seguir um perfil privado, gerando solicitação pendente | Implementado | Alta | RNE-022, RNE-028, RNE-029, RNE-044 |
| RF09.3 | O dono de um perfil privado deve poder visualizar suas solicitações pendentes | Implementado | Alta | RNE-029 |
| RF09.4 | O dono deve poder aprovar ou recusar uma solicitação | Implementado | Alta | RNE-029 |
| RF09.5 | O usuário deve poder deixar de seguir, ou cancelar uma solicitação ainda pendente | Implementado | Média | RNE-030 |
| RF09.6 | O usuário deve poder visualizar a lista de quem segue e de quem o segue | Implementado | Média | RNE-028, RNE-031 |
| RF09.7 | O usuário deve poder publicar uma viagem no feed | Parcial | Alta | RNE-023, RNE-028, RNE-032, RNE-044 |
| RF09.8 | O usuário deve poder ver no feed as publicações de quem segue, com acesso concedido | Não iniciado | Alta | RNE-033 |
| RF09.9 | O usuário deve poder remover um seguidor do próprio perfil, público ou privado | Implementado | Média | RNE-030 |
| RF09.10 | O usuário deve poder buscar outros usuários por nome ou username | Implementado | Alta | RNE-037 |
| RF09.11 | O usuário deve ver no feed sugestões de publicações públicas de perfis que ainda não segue | Não iniciado | Média | RNE-033 |
| RF09.12 | O usuário deve poder ver, reabrir e apagar o histórico dos perfis que abriu pela pesquisa | Implementado | Média | RNE-036 |
| RF09.13 | O autor de uma publicação deve poder marcar nela outros usuários que tenham nome de usuário | Implementado | Média | RNE-028, RNE-034, RNE-035 |
| RF09.14 | O usuário marcado deve poder ver, na aba Marcações do próprio perfil, as publicações em que foi marcado e remover a própria marcação | Implementado | Média | RNE-034, RNE-035 |
| RF09.15 | O usuário deve poder criar uma publicação com uma a três fotos, legenda opcional e pessoas marcadas | Implementado | Alta | RNE-028, RNE-032, RNE-044 |
| RF09.16 | O usuário deve ver, na aba Publicações de um perfil que pode ver, a grade das publicações desse perfil | Implementado | Alta | RNE-033 |
| RF09.17 | O usuário deve poder abrir uma publicação que pode ver e, se for o autor, excluí-la | Implementado | Alta | RNE-033 |

**Detalhamento:** 14 dos 17 requisitos do grupo têm rota, tela e testes de rota, de isolamento entre usuários e ponta a ponta; o RF09.7 tem rota e testes, sem a tela exercitada. As regras de visibilidade estão na seção 13.4; aqui ficam as decisões de comportamento.

- **RF09.1 a RF09.5** — Repetir o pedido de seguir não cria um segundo vínculo, e qualquer das duas partes desfaz o vínculo.
- **RF09.6 e RF09.9** — As listas abrem pelos contadores do perfil e mostram cada pessoa com os mesmos dados da busca, sem identificador interno nem data do vínculo.
- **RF09.7 e RF09.15** — Publicação é um conceito único: fotos, legenda e marcações. A publicação de viagem leva, além disso, uma cópia da viagem, que não muda quando a viagem é editada. As fotos são reprocessadas no servidor antes de publicadas.
- **RF09.7** — Parcial desde a conferência. Implementação: rotas `app/api/social/viagens/[tripId]/post` e `post/fotos` e diálogo `components/social/publicar-viagem.tsx`. Teste: `tests/api/social-post-route.test.ts` e `tests/rls/12-trip-posts.test.ts`; o ponta a ponta da jornada só abre o diálogo. Motivo: a publicação pela tela não é exercitada, e o feed ainda é prévia (RF09.8).
- **RF09.8 e RF09.11** — O feed ainda é tela de prévia com dados de exemplo: nem as publicações de quem se segue nem as sugestões foram implementadas.
- **RF09.10 e RF09.12** — A busca exige sessão e encontra também perfis privados. O histórico acompanha a conta em qualquer dispositivo e pode ser apagado entrada a entrada ou por inteiro.
- **RF09.13 e RF09.14** — Os participantes da viagem aparecem como sugestão de marcação. A marcação permanece se a pessoa sai da viagem e é apagada com a publicação; a restrição para perfis privados entrou após a revisão de segurança de 22/11/2026.
- **RF09.16 e RF09.17** — A grade não distingue publicações de viagem das demais, e o detalhe só abre a quem pode ver a publicação.

### 14.11 Interação Social (RF10)

| ID | Descrição | Status | Prioridade | Regras |
|---|---|---|---|---|
| RF10.1 | O usuário deve poder curtir uma publicação | Não iniciado | Média | — |
| RF10.2 | O usuário deve poder remover a própria curtida | Não iniciado | Baixa | RNE-024 |
| RF10.3 | O usuário deve poder comentar em uma publicação | Não iniciado | Baixa | — |
| RF10.4 | O usuário deve poder excluir o próprio comentário | Não iniciado | Baixa | RNE-024 |

**Detalhamento:**

- **RF10.1 a RF10.4** — Curtidas e comentários não têm tabela, rota nem tela; os botões existem apenas na prévia do feed. O grupo faz parte da linha de corte do semestre, o que explica a prioridade reduzida.

### 14.12 Avaliações de Lugares (RF11)

| ID | Descrição | Status | Prioridade | Regras |
|---|---|---|---|---|
| RF11.1 | O usuário deve poder avaliar um lugar, com nota e comentário | Implementado | Média | RNE-043 |
| RF11.2 | O usuário deve poder ver as avaliações de um lugar feitas por outros usuários | Implementado | Média | RNE-043 |
| RF11.3 | O usuário deve poder editar ou excluir a própria avaliação | Implementado | Baixa | RNE-024, RNE-043 |

**Detalhamento:**

- **RF11.1 a RF11.3** — A avaliação se prende ao lugar, e não à viagem: o mesmo lugar salvo em viagens diferentes mostra as mesmas avaliações. O teste ponta a ponta prova que uma segunda pessoa, com o lugar salvo em viagem própria, vê a avaliação sem poder alterá-la.

### 14.13 Roteiros por Inteligência Artificial (RF12)

| ID | Descrição | Status | Prioridade | Regras |
|---|---|---|---|---|
| RF12.1 | O usuário deve poder gerar um roteiro por IA a partir de destino, datas e interesses | Implementado | Alta | RNE-025 |
| RF12.2 | O usuário deve poder revisar e editar o roteiro gerado antes de gravá-lo | Implementado | Alta | RNE-025 |
| RF12.3 | O usuário deve poder descartar o roteiro gerado sem salvar nada | Implementado | Média | RNE-025 |

**Detalhamento:**

- **RF12.1** — A geração está em `POST /api/roteiros/gerar`, atrás da interface `GeradorDeRoteiro` (`lib/ai/provider.ts`): um gerador determinístico para desenvolvimento e integração contínua (`lib/ai/fake.ts`) e o Gemini, na camada gratuita, como provedor real (`lib/ai/gemini.ts`). A saída do modelo é normalizada e validada por esquema (`lib/ai/roteiro.ts`) antes de chegar à tela, e a rota não grava nada. A geração se limita a cinco dias por viagem, para caber no tempo do RNF07.3.
- **RF12.2** — A tela "Nova viagem com a Avori" (`app/dashboard/trips/criar/ia/page.tsx`) mostra o roteiro gerado para revisão: a pessoa edita o título da viagem e o título e o horário de cada atividade, remove o que não quiser e só então cria a viagem, pelas rotas de viagem e de itinerário, que validam tudo novamente. Descrição e local sugeridos pela IA não são editáveis na revisão, só removíveis junto com a atividade. Cada atividade tem o link Ver no mapa, que abre em nova aba a busca do lugar no Google Maps, sem chave nem custo.
- **RF12.3** — "Refazer" descarta o roteiro sem nenhuma escrita. O fluxo inteiro é coberto por `e2e/roteiro-ia.spec.ts`, que confere pela API que a viagem criada tem exatamente o roteiro editado, e por `tests/lib/ai-salvar.test.ts`.
- **Condições atendidas pela rota** — A chave do provedor fica só no servidor, no cabeçalho da chamada; a saída do modelo é validada antes de virar itinerário; e a rota consome o limite de 10 gerações por usuário por hora (RNF07.4).

### 14.14 Notificações (RF13)

| ID | Descrição | Status | Prioridade | Regras |
|---|---|---|---|---|
| RF13.1 | O usuário deve receber notificação informativa quando alguém começa a segui-lo (perfil público) | Não iniciado | Média | RNE-026 |
| RF13.2 | O usuário deve receber notificação acionável de nova solicitação de seguidor (perfil privado), que permanece visível até ser aceita ou recusada | Implementado | Alta | RNE-026, RNE-029 |
| RF13.3 | O usuário deve receber notificação informativa quando sua solicitação de seguir é aceita | Não iniciado | Média | RNE-026 |
| RF13.4 | O usuário deve poder ver a central de notificações, com contador de não-lidas e marcação de lidas | Parcial | Alta | RNE-026 |

**Detalhamento:**

- **RF13.2** — Cada solicitação é o próprio vínculo pendente de seguir, exibido na central e removido quando o dono aprova ou recusa; não depende de um registro de notificação separado.
- **RF13.4** — A central é aberta por um sino na aba Rede social, que mostra a quantidade de solicitações pendentes. Não há entrega em tempo real: a contagem é refeita ao abrir cada página e ao voltar à janela. Falta a marcação de lidas.
- **RF13.1 e RF13.3** — As notificações informativas exigem um registro persistido de notificações, que ainda não existe.
