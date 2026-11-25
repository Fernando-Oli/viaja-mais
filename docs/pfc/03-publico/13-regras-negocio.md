## 13 Regras de Negócio

As regras abaixo pertencem ao domínio do problema e independem da tecnologia adotada. As regras RNE-001 a RNE-026 vêm do levantamento das entregas anteriores, com os mesmos identificadores; quatro delas foram corrigidas porque o comportamento implementado as desmentia (RNE-003, RNE-017, RNE-020 e RNE-021). As regras RNE-027 a RNE-045 são novas e descrevem o que a rede social, o rateio, o acerto de contas e as avaliações passaram a exigir neste semestre.

As regras estão agrupadas por tema, e por isso a numeração não é contínua dentro de cada tabela. A coluna "Requisitos relacionados" aponta os requisitos funcionais da seção 14, e a coluna "Regras" daquela seção aponta de volta para cá. Uma regra cujo requisito ainda não foi implementado continua listada, porque descreve o comportamento acordado, e não o código.

### 13.1 Conta e acesso

| ID | Regra | Detalhamento | Requisitos relacionados |
|---|---|---|---|
| RNE-001 | E-mail único | Cada endereço de e-mail corresponde a uma única conta. | RF01.1 |
| RNE-002 | Confirmação de e-mail | Quando a confirmação está ativa no ambiente, a conta só obtém sessão depois de confirmar o endereço. | RF01.2, RF01.3 |
| RNE-003 | Política de senha | A senha tem no mínimo oito caracteres, com ao menos uma letra minúscula, uma maiúscula, um número e um símbolo. | RF01.1, RF01.7, RF01.8, RF02.3 |
| RNE-004 | Sessão autenticada | Só usuário autenticado acessa as áreas privadas; requisição de dados sem sessão recebe resposta de não autenticado. | RF01.5, RF01.6 |
| RNE-005 | Exclusão de conta | Excluir a conta remove perfil, vínculos de seguir, publicações e histórico de pesquisa, mas não apaga despesas pagas nem pagamentos registrados, que pertencem ao acerto do grupo. | RF02.4 |
| RNE-044 | Limite de tentativas | Ações que disparam e-mail, conferem senha, gravam fotos, avisam outra pessoa ou consomem a cota do provedor de IA têm teto por usuário: 10 convites ou 10 envios de foto a cada 10 minutos, 5 trocas de senha a cada 15 minutos, 30 pedidos de seguir por minuto e 10 roteiros por hora. | RF01.8, RF02.2, RF04.1, RF09.1, RF09.2, RF09.7, RF09.15, RF12.1 |

### 13.2 Viagem, grupo e itinerário

| ID | Regra | Detalhamento | Requisitos relacionados |
|---|---|---|---|
| RNE-006 | Dono da viagem | Toda viagem tem como responsável quem a criou, e esse vínculo não é transferível. | RF03.1, RF03.2 |
| RNE-007 | Permissão de edição | O dono edita os dados cadastrais da viagem; os participantes alimentam itinerário, despesas, reservas e lugares, mas não alteram título, datas, orçamento, capa ou situação da viagem. | RF03.2, RF03.6, RF03.7, RF03.8, RF04.5, RF04.6 |
| RNE-008 | Exclusão de viagem | Só o dono exclui a viagem, e a exclusão remove itinerário, despesas, reservas, lugares, participações e as publicações feitas a partir dela. | RF03.3 |
| RNE-009 | Datas válidas da viagem | A data de término não pode ser anterior à de início. | RF03.1, RF03.2 |
| RNE-010 | Convite restrito ao dono | Só o dono convida, e o convite é endereçado a um e-mail. Quem já tem conta não recebe e-mail e encontra o convite na aplicação. | RF04.1, RF04.2 |
| RNE-011 | Aceite do convite | O convidado só participa depois de aceitar; enquanto o convite está pendente, ele vê apenas título, destino e datas da viagem. | RF04.3, RF04.4 |
| RNE-012 | Saída e remoção de participante | O participante sai quando quiser e o dono remove quem quiser; o dono não pode sair da própria viagem. | RF04.7, RF04.8 |
| RNE-013 | Vínculo de itens à viagem | Itens de itinerário, despesas, reservas e lugares existem sempre vinculados a uma viagem e não mudam de viagem. | RF05.1, RF06.1, RF07.1, RF07.2, RF07.3, RF07.4, RF08.2 |
| RNE-014 | Categorias controladas | Atividades, despesas e reservas só aceitam categorias, tipos e situações de uma lista fechada. | RF05.5, RF06.5, RF07.1, RF07.2, RF07.3, RF07.4 |
| RNE-015 | Participação como critério de acesso | O acesso aos dados de uma viagem depende de participar dela, e não de tê-la criado; o convidado que aceitou vê o mesmo que o dono, salvo as ações reservadas a este. | RF04.4, RF04.5, RF04.6, RF04.9 |
| RNE-016 | Entrada apenas por convite | Ninguém se inclui numa viagem nem é incluído por terceiros sem um convite pendente para o próprio e-mail. | RF04.3 |
| RNE-017 | Papel fixo do participante | Quem cria a viagem é o dono e quem aceita convite é participante; o papel não muda depois, nem por ação do dono. | RF04.3, RF04.7 |
| RNE-045 | Horário das atividades | O horário de término de uma atividade não pode ser anterior ao de início. | RF05.6 |

### 13.3 Despesas, rateio e acerto de contas

| ID | Regra | Detalhamento | Requisitos relacionados |
|---|---|---|---|
| RNE-018 | Orçamento por viagem | O orçamento é definido por viagem, e a comparação com o gasto considera as despesas de todos os participantes. | RF03.6, RF06.4, RF06.6, RF06.7 |
| RNE-019 | Pagador identificado | Toda despesa registra quem pagou, base do cálculo de saldos; sem indicação, quem pagou é quem registrou. | RF06.8 |
| RNE-020 | Soma exata do rateio | A soma das partes é sempre igual ao valor da despesa. Na divisão igual, os centavos que sobram vão um a um aos participantes numa ordem fixa; na divisão por peso, a quem teve a maior fração descartada. | RF06.9, RF06.10 |
| RNE-038 | Participantes e tipos de divisão | A despesa é dividida em partes iguais, por peso ou por valor exato, só entre participantes da viagem, sem repetir pessoa; no valor exato, a soma informada tem de fechar com o total. | RF06.9, RF06.10 |
| RNE-039 | Alteração de despesa | Só quem registrou a despesa ou o dono da viagem a edita ou exclui. O valor não muda depois que alguma parte foi quitada, nem quando a divisão é por valor exato. | RF06.2, RF06.3 |
| RNE-040 | Saldos separados por moeda | Saldos e transferências sugeridas são calculados por moeda; valores em moedas diferentes não se compensam. | RF06.11, RF06.13 |
| RNE-021 | Quitação por pagamento registrado | A dívida do acerto só diminui quando o pagamento é registrado, e o registro não é editado nem excluído depois. | RF06.12, RF06.13 |
| RNE-041 | Limites do pagamento | Só quem pagou registra o próprio pagamento, a alguém diferente de si, com valor maior que zero e até o menor entre a sua dívida e o crédito de quem recebe; pagamento parcial é aceito, e reenviar o mesmo registro não o duplica. | RF06.13 |
| RNE-042 | Dívida sobrevive à saída | Quem sai da viagem com saldo em aberto continua no acerto de contas até quitá-lo. | RF04.8, RF06.11 |

### 13.4 Perfil e rede social

| ID | Regra | Detalhamento | Requisitos relacionados |
|---|---|---|---|
| RNE-027 | Nome de usuário único e reservado | O nome de usuário tem de 3 a 30 caracteres entre letras minúsculas, números e sublinhado, é único sem distinção de maiúsculas e não pode ser um nome reservado nem conter a marca. Depois de escolhido, pode ser trocado, mas não apagado. | RF02.5 |
| RNE-028 | Nome de usuário como condição para a rede | Só quem tem nome de usuário segue, é seguido, publica ou é marcado. | RF09.1, RF09.2, RF09.6, RF09.7, RF09.13, RF09.15 |
| RNE-022 | Visibilidade de perfil | O perfil é público ou privado. Nome, nome de usuário, foto e biografia são sempre visíveis a usuários autenticados; publicações e rede de um perfil privado, só ao dono e aos seguidores aprovados. | RF02.7, RF02.8, RF09.1, RF09.2 |
| RNE-029 | Seguir com aprovação | Seguir um perfil público tem efeito imediato; seguir um privado gera solicitação pendente até o dono aprovar ou recusar. Ninguém segue a si mesmo, e recusar descarta a solicitação. | RF09.1, RF09.2, RF09.3, RF09.4, RF13.2 |
| RNE-030 | Remoção silenciosa | Deixar de seguir, cancelar solicitação e remover seguidor não geram aviso, e o removido pode voltar a seguir ou a solicitar. | RF09.5, RF09.9 |
| RNE-031 | Visibilidade da rede | As listas de seguidores e de seguidos mostram só vínculos aprovados e seguem a visibilidade do perfil; os contadores são sempre visíveis. | RF02.8, RF09.6 |
| RNE-032 | Composição da publicação | Uma publicação tem de uma a três fotos, legenda opcional e até 20 pessoas marcadas. Só a publicação de viagem pode não ter foto. | RF09.7, RF09.15 |
| RNE-023 | Publicação de viagem sem dados financeiros | Só participante publica a viagem, e a publicação copia título, destino, datas, capa e os itens de roteiro escolhidos; nunca despesas, orçamento, moeda, preços ou os demais participantes. | RF09.7 |
| RNE-033 | Visibilidade e autoria da publicação | A publicação segue a visibilidade do perfil do autor, e só o autor a exclui. | RF09.8, RF09.11, RF09.16, RF09.17 |
| RNE-034 | Marcação de pessoas | O autor não marca a si mesmo; perfil privado só é marcado por quem ele segue ou por colega da mesma viagem. Ser marcado não dá acesso à publicação. | RF09.13, RF09.14 |
| RNE-035 | Recusa de marcação | Quem remove a própria marcação não pode mais ser marcado por aquele autor, em nenhuma publicação. Quando é o autor quem desmarca, não há recusa. | RF09.13, RF09.14 |
| RNE-036 | Histórico de pesquisa privado | O histórico guarda até 15 perfis abertos pela pesquisa, descarta os de mais de 30 dias, é visível só ao dono e não avisa a pessoa pesquisada. | RF09.12 |
| RNE-037 | Privacidade na busca | A busca devolve nome, nome de usuário, foto e a indicação de perfil público ou privado; nunca o e-mail, e nunca quem busca. | RF09.10 |
| RNE-024 | Autoria da interação | Cada usuário remove só a própria curtida, o próprio comentário e a própria avaliação; o autor da publicação também remove comentários feitos nela. | RF10.2, RF10.4, RF11.3 |

### 13.5 Lugares, roteiros e notificações

| ID | Regra | Detalhamento | Requisitos relacionados |
|---|---|---|---|
| RNE-043 | Avaliação de lugar | Só avalia quem tem o lugar salvo numa viagem de que participa. A nota vai de 1 a 5, com comentário opcional; cada pessoa tem uma avaliação por lugar, visível a quem tem o mesmo lugar salvo. | RF11.1, RF11.2, RF11.3 |
| RNE-025 | Revisão do roteiro gerado | O roteiro gerado por inteligência artificial nunca é gravado diretamente: o usuário revisa e aprova antes de ele virar itinerário. | RF12.1, RF12.2, RF12.3 |
| RNE-026 | Notificação por destinatário | Cada usuário vê só as próprias notificações; solicitações de seguidor permanecem visíveis até serem aprovadas ou recusadas. | RF13.1, RF13.2, RF13.3, RF13.4 |
