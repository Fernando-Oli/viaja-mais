## 15 Requisitos Não Funcionais

Cada requisito não funcional traz um valor-alvo verificável, condição para que possa ser avaliado: metas de tempo de resposta declaram o percentil em que são medidas, e metas de disponibilidade, a janela de apuração. Os identificadores seguem o catálogo do repositório, como na seção 14.

### 15.1 Critério de status

Valem os status definidos na seção 14.1, com um acréscimo próprio dos requisitos não funcionais:

| Status | Critério |
|---|---|
| Implementado | Código integrado e teste automatizado vinculado ao requisito na matriz de rastreabilidade |
| Atendido | Satisfeito e verificável por inspeção da configuração, por medição registrada ou por revisão, sem teste vinculado ao requisito |
| Parcial | Satisfeito em parte do sistema, ou verificado só em parte |
| Não iniciado | Sem implementação nem medição |

Na conferência de 22/11/2026, cada requisito implementado foi confrontado com o teste vinculado, e cada atendido, com a configuração, as migrações, a esteira ou o registro de medição correspondente. Quando a evidência cobre só parte do enunciado, o status passou a parcial: RNF02.5, RNF04.2, RNF05.3 e RNF06.4. Em 25/11/2026, 9 dos 43 requisitos não funcionais estão implementados, 16 atendidos, 13 parciais e 5 não iniciados.

### 15.2 Desempenho (RNF01)

| ID | Descrição | Status | Prioridade |
|---|---|---|---|
| RNF01.1 | O carregamento inicial do painel deve completar em menos de 3 segundos no percentil 95 | Atendido | Alta |
| RNF01.2 | Toda operação de escrita via rota de API deve responder em menos de 1 segundo no percentil 95 | Atendido | Alta |
| RNF01.3 | O sistema deve sustentar 1.000 usuários simultâneos sem degradação superior a 20% no tempo de resposta | Não iniciado | Média |
| RNF01.4 | Toda listagem que possa crescer sem limite deve paginar, no máximo 20 registros por página | Parcial | Alta |
| RNF01.5 | Toda coluna usada em filtro de consulta frequente deve ter índice, verificável no plano de execução | Implementado | Alta |

**Detalhamento:** medimos o ambiente publicado em 13/11/2026, com 30 amostras por meta.

- **RNF01.1** — O carregamento do painel teve percentil 95 de 623 ms, contra a meta de 3 s.
- **RNF01.2** — A escrita pela API teve percentil 95 de 865 ms, contra a meta de 1 s. A margem é estreita porque cada escrita faz três idas ao banco, hospedado nos Estados Unidos: validar a sessão, conferir a participação e gravar.
- **RNF01.3** — Não foi verificado: mil usuários simultâneos exigem teste de carga distribuído, acima dos limites das camadas gratuitas adotadas. Como indício, 50 leituras em paralelo de uma única máquina elevaram a mediana em 135%, muito acima dos 20% pretendidos.
- **RNF01.4** — A rede social pagina de 20 em 20. As listas de uma viagem são lidas inteiras, por decisão de produto, sob o teto do RNF06.4.
- **RNF01.5** — Toda chave estrangeira tem índice, e um teste confere o plano de execução das consultas da tela de viagem. Com cem mil despesas no banco, a consulta da aba de despesas caiu de 12,2 ms para 0,49 ms.

### 15.3 Segurança (RNF02)

| ID | Descrição | Status | Prioridade |
|---|---|---|---|
| RNF02.1 | Toda comunicação entre cliente e servidor deve ocorrer sobre HTTPS | Atendido | Alta |
| RNF02.2 | As senhas devem ser armazenadas com algoritmo de hash resistente, nunca em texto claro | Atendido | Alta |
| RNF02.3 | A sessão deve ser mantida por token assinado, validado no servidor a cada requisição | Atendido | Alta |
| RNF02.4 | Toda tabela do banco deve ter Row Level Security habilitada e política por operação utilizada | Implementado | Alta |
| RNF02.5 | Todo corpo de requisição deve ser validado por esquema no servidor antes de qualquer escrita | Parcial | Alta |
| RNF02.6 | Nenhuma escrita no banco deve partir do navegador: toda alteração passa por rota de API | Atendido | Alta |
| RNF02.7 | Nenhuma rota deve repassar o corpo da requisição diretamente ao banco, evitando atribuição em massa | Atendido | Alta |
| RNF02.8 | As rotas de API devem limitar requisições por usuário e por janela de tempo | Parcial | Alta |
| RNF02.9 | Os dados de rateio e de acerto de contas de uma viagem só devem ser visíveis aos seus membros | Implementado | Alta |
| RNF02.10 | A chave de serviço do banco, que ignora a Row Level Security, não deve alcançar o navegador nem componentes de interface | Implementado | Alta |
| RNF02.11 | Mensagem de erro devolvida ao cliente não deve revelar nome de coluna, restrição ou detalhe interno do banco | Implementado | Média |
| RNF02.12 | A aplicação deve declarar política de segurança de conteúdo que restrinja as origens de script | Parcial | Média |

**Detalhamento:** a análise de riscos e das medidas está na seção 25; aqui registramos como cada requisito é verificado.

- **RNF02.1 a RNF02.3** — São atendidos pela infraestrutura: HTTPS pela hospedagem, hash de senha e emissão de token pelo serviço de autenticação. O token é conferido no servidor de autenticação a cada requisição, e não apenas decodificado do cookie.
- **RNF02.4** — Row Level Security (segurança em nível de linha do PostgreSQL) está habilitada nas 18 tabelas, com políticas versionadas nas migrações. Os testes de isolamento usam dois usuários reais e verificam leitura e escrita; resultado vazio não é aceito como prova, pois também ocorreria se o dado não existisse.
- **RNF02.5** — Parcial desde a conferência. Implementação: as rotas de escrita validam o corpo com os esquemas de `lib/schemas/`, e os testes de rota cobrem o caminho de corpo inválido. Motivo: a troca de senha (`app/api/auth/change-password/route.ts`) confere os campos manualmente, sem esquema, como registra a seção 22.
- **RNF02.7** — Toda rota grava campo a campo; a conferência não encontrou rota que repasse o corpo da requisição ao banco.
- **RNF02.6** — A revisão de segurança de 12/11/2026 não encontrou escrita no banco a partir de componente ou página.
- **RNF02.8** — O limite vale para as ações de maior custo ou risco de abuso: convite, troca de senha, envio de fotos e pedido de seguir, com os valores da RNE-044. As demais rotas não têm limite, e uma falha na contagem libera a requisição em vez de bloqueá-la; por isso o requisito é parcial.
- **RNF02.9** — Partes do rateio e pagamentos do acerto só são lidos por participantes da viagem, e um pagamento só é gravado pelo próprio pagador, o que os testes de isolamento comprovam.
- **RNF02.10** — A chave de serviço fica restrita a um único módulo de acesso administrativo, usado só em rota de servidor, e nunca recebe o prefixo que a exporia ao navegador.
- **RNF02.11** — Erro de banco chega ao cliente como mensagem genérica, verificada pelos testes de rota.
- **RNF02.12** — A política restringe as origens de script, de conexão e de formulário e impede a incorporação da aplicação em página de terceiros, mas admite script embutido na própria página. Removê-lo exigiria renderização dinâmica de todas as páginas.

### 15.4 Usabilidade (RNF03)

| ID | Descrição | Status | Prioridade |
|---|---|---|---|
| RNF03.1 | Toda tela deve ser utilizável em largura de celular (412 pixels) e de computador, sem perda de função | Implementado | Alta |
| RNF03.2 | A aplicação deve funcionar nas duas versões mais recentes de Chrome, Firefox, Safari e Edge | Parcial | Média |
| RNF03.3 | Toda ação de escrita deve dar retorno visual de sucesso ou de falha, e ação destrutiva deve exigir confirmação | Parcial | Alta |
| RNF03.4 | Erro de validação devolvido pelo servidor deve ser exibido ao usuário com o motivo, e não como mensagem genérica | Parcial | Alta |
| RNF03.5 | Toda tela deve apresentar zero violações das regras WCAG 2.1 níveis A e AA verificáveis por ferramenta automática | Parcial | Alta |

**Detalhamento:**

- **RNF03.1** — Toda a suíte ponta a ponta roda em dois perfis de navegador, computador e celular (Pixel 7, 412 pixels); uma tela que perca função numa das larguras faz o teste falhar.
- **RNF03.2** — Os testes executam apenas no motor do Chrome; os demais navegadores não foram verificados.
- **RNF03.3 e RNF03.4** — As telas de viagem, itinerário, reservas, lugares e avaliações mostram notificação de sucesso ou de falha, exibem o motivo devolvido pela rota e pedem confirmação antes de excluir. As demais telas ainda não foram uniformizadas.
- **RNF03.5** — Um teste ponta a ponta submete 13 telas e um diálogo à ferramenta axe-core, nos dois perfis de navegador, sem nenhuma regra desligada. As correções que ele exigiu incluíram contraste de cores, nomes acessíveis de botões e campos e textos de links na largura de celular.
- **Limite do RNF03.5** — Telas fora da lista não são verificadas; a criação de despesa, por exemplo, tem campos de seleção sem nome acessível. Foco visível e navegação por teclado não são verificáveis pela ferramenta.
- **Identidade visual** — A troca de identidade para Avori, em novembro de 2026, adotou uma paleta escolhida com razão de contraste mínima de 4,5:1 para texto; a cor mais clara é usada só como fundo.

### 15.5 Confiabilidade (RNF04)

| ID | Descrição | Status | Prioridade |
|---|---|---|---|
| RNF04.1 | A aplicação deve manter disponibilidade mensal de ao menos 99,5% | Parcial | Média |
| RNF04.2 | O banco de dados deve ter backup automático diário, com retenção mínima de 7 dias | Parcial | Alta |
| RNF04.3 | O schema do banco deve ser integralmente reproduzível a partir do repositório, sem intervenção manual | Atendido | Alta |
| RNF04.4 | Toda falha de operação deve resultar em mensagem compreensível ao usuário, nunca em tela em branco ou erro não tratado | Implementado | Alta |
| RNF04.5 | A integração contínua deve aplicar as migrações do zero e executar os testes de isolamento a cada alteração do banco | Atendido | Alta |
| RNF04.6 | A configuração de ambiente deve ser validada na inicialização, e a falha deve nomear a variável ausente ou inválida, sem que valor indefinido chegue à execução | Implementado | Alta |

**Detalhamento:**

- **RNF04.1** — Revisamos a meta herdada de 99,9% para 99,5%, porque as camadas gratuitas de hospedagem e de banco não sustentam o valor anterior. Desde 22/11/2026, um monitor no GitHub Actions consulta a página inicial e a rota `/api/saude`, que exige resposta do banco, a cada cinco minutos; `npm run pfc:metricas` calcula a disponibilidade a partir dessas verificações. O requisito é parcial porque a série ainda não cobre um mês inteiro.
- **RNF04.2** — Parcial desde a conferência. A equipe conferiu no painel do provedor, em 22/11/2026, que o backup diário do projeto de produção está ativo (atividade S14-F-monitor-disponibilidade). Motivo: a configuração fica fora do repositório, sem captura arquivada; a retenção mínima de 7 dias não foi registrada, e nenhum teste de restauração foi feito.
- **RNF04.3 e RNF04.5** — As 22 migrações estão versionadas, e o fluxo de banco da integração contínua as aplica numa base limpa e roda os testes de isolamento. Na última execução, 475 testes passaram, em 2,3 minutos.
- **RNF04.4** — Cada área da aplicação tem estados de erro, de não encontrado e de carregamento. A falha inesperada mostra uma explicação e a opção de tentar de novo; o endereço inexistente e a viagem de que a pessoa não participa mostram a mesma página, sem revelar se o recurso existe.
- **RNF04.6** — Um único módulo lê as variáveis de ambiente, valida a configuração e falha com mensagem que identifica a variável; o teste cobre variável ausente, vazia e inválida.

### 15.6 Manutenibilidade (RNF05)

| ID | Descrição | Status | Prioridade |
|---|---|---|---|
| RNF05.1 | O código deve ser escrito em TypeScript no modo estrito e compilar sem erro de tipo, verificado pela integração contínua | Atendido | Alta |
| RNF05.2 | Diálogos, confirmações e campos de formulário devem vir da biblioteca de componentes compartilhada, sem reimplementação por tela | Atendido | Média |
| RNF05.3 | Todo requisito implementado deve estar marcado no código e no teste, com rastreabilidade gerada automaticamente | Parcial | Alta |
| RNF05.4 | A cobertura de testes deve ser de no mínimo 70% em linhas, ramos, funções e instruções, no total e em `lib/`, com bloqueio pela integração contínua | Atendido | Alta |
| RNF05.5 | Os erros do servidor devem ser registrados em formato estruturado, com rota, usuário e causa | Não iniciado | Baixa |

**Detalhamento:**

- **RNF05.1** — O modo estrito está ligado na configuração do TypeScript, e a integração contínua verifica os tipos em todo pull request.
- **RNF05.2** — Diálogos e campos vêm da biblioteca de componentes, e um único modal de confirmação substituiu as caixas nativas do navegador.
- **RNF05.3** — Parcial desde a conferência. A matriz de rastreabilidade é gerada a partir das marcações e conferida em todo pull request; hoje, 140 requisitos estão no catálogo, 84 marcados no código e 88 com teste. Motivo: o verificador exige só a marcação no teste, e RF01.3 a RF01.6, RF04.5, RF04.9, RNF01.5, RNF02.10 e RNF03.1, implementados, não têm marcação no código.
- **RNF05.4** — O corte de 70% nas quatro métricas, configurado na atividade S10-A-cobertura, reprova o pull request quando não é atingido; a seção 20.4 registra como esse bloqueio foi verificado. Na execução de 22/11/2026, a cobertura foi de 98,21% das linhas, 95,88% das instruções, 91,03% dos desvios e 96,94% das funções, medida sobre `lib/` e `app/api/`; as telas são verificadas pelos testes ponta a ponta, que não entram nessa conta.
- **RNF05.5** — Os erros são registrados no console, sem estrutura.

### 15.7 Escalabilidade (RNF06)

| ID | Descrição | Status | Prioridade |
|---|---|---|---|
| RNF06.1 | A aplicação deve executar sem estado no servidor, permitindo múltiplas instâncias simultâneas | Atendido | Alta |
| RNF06.2 | Os arquivos estáticos devem ser servidos por rede de distribuição de conteúdo | Atendido | Média |
| RNF06.3 | O acesso ao banco deve usar pool de conexões, sem abrir conexão por requisição | Atendido | Alta |
| RNF06.4 | Toda consulta de listagem deve ter limite explícito de registros, sem depender do volume atual de dados | Parcial | Alta |

**Detalhamento:**

- **RNF06.1 a RNF06.3** — Decorrem das escolhas da seção 19: a aplicação roda em funções sem estado, a hospedagem distribui o conteúdo estático, e o banco é acessado pelo pool de conexões do provedor. Registramo-los porque explicam por que essas escolhas foram feitas.
- **RNF06.4** — Parcial desde a conferência. As listagens usam o limite explícito de 500 registros de `lib/listagem.ts`. Motivo: o acerto de contas e os totais de finanças leem as despesas sem limite, por decisão deliberada, pois cortar a lista em silêncio produziria saldo errado; o requisito, portanto, não vale para toda consulta.

### 15.8 Social, Descoberta e IA (RNF07)

| ID | Descrição | Status | Prioridade |
|---|---|---|---|
| RNF07.1 | O feed deve carregar a primeira página (20 publicações) em menos de 2 segundos no percentil 95 | Não iniciado | Alta |
| RNF07.2 | O feed deve paginar por cursor, sem carregar todas as publicações de uma vez | Não iniciado | Alta |
| RNF07.3 | A geração de roteiro por IA deve responder em até 15 segundos, ou informar erro claro ao usuário | Atendido | Média |
| RNF07.4 | A geração de roteiro deve ser limitada a no máximo 10 requisições por usuário por hora | Parcial | Alta |
| RNF07.5 | A central de notificações deve carregar as 20 mais recentes em menos de 2 segundos no percentil 95, e o contador de não-lidas deve ser calculado em menos de 500 milissegundos | Não iniciado | Média |

**Detalhamento:**

- **RNF07.1 e RNF07.2** — Acompanham o feed (RF09.8), que ainda é prévia. A grade de publicações de um perfil já pagina por cursor, e é o modelo previsto para o feed.
- **RNF07.3** — A rota corta a espera pelo provedor em 15 segundos contados desde a chegada do pedido, com até quatro tentativas de no máximo 7 segundos cada; ao estourar o prazo, responde 504 com mensagem em português. A prova está em `tests/api/roteiros-gerar-route.test.ts` e `tests/lib/ai-gemini.test.ts`. Para caber no prazo, a geração se limita a cinco dias por viagem.
- **RNF07.4** — A rota consome o limite `roteiro-ia` (10 por usuário por hora) depois da validação do pedido e antes de chamar o provedor, provado por `tests/api/roteiros-gerar-route.test.ts`. Fica parcial porque a função do banco que conta as requisições aceita a janela de tempo informada por quem chama: trocando a janela, um usuário autenticado zera o próprio contador. A correção cabe à plataforma, na migration `plataforma_rate_limit`.
- **RNF07.5** — A central existe só para solicitações de seguidor (RF13.2), sem contador de não lidas, e não foi medida.

### 15.9 Financeiro (RNF08)

| ID | Descrição | Status | Prioridade |
|---|---|---|---|
| RNF08.1 | O cálculo do rateio deve ser determinístico: a soma das partes deve sempre igualar o valor total da despesa | Implementado | Alta |

**Detalhamento:**

- **RNF08.1** — A garantia é dupla. A aplicação calcula em centavos inteiros, com desempate por uma ordem fixa dos participantes, de modo que tela e servidor chegam ao mesmo resultado (RNE-020). O banco recusa, ao fim da transação, partes que não somem o valor da despesa, comportamento coberto por teste de isolamento.
