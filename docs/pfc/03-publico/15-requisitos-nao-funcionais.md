# 15 — Requisitos Não Funcionais

Esta seção cataloga os requisitos não funcionais do produto, organizados por grupo
de domínio. Cada requisito traz um valor-alvo mensurável, condição necessária para
que possa ser verificado: metas expressas em tempo de resposta declaram o
percentil em que são medidas, e metas de disponibilidade declaram a janela de
apuração.

## RNF07 — Social, Descoberta e IA

| ID | Descrição | Status | Prioridade |
|---|---|---|---|
| RNF07.1 | O feed deve carregar a primeira página (20 publicações) em menos de 2 segundos no percentil 95 | Não iniciado | Alta |
| RNF07.2 | O feed deve paginar por cursor, sem carregar todas as publicações de uma vez | Não iniciado | Alta |
| RNF07.3 | A geração de roteiro por IA deve responder em até 15 segundos, ou informar erro claro ao usuário | Não iniciado | Média |
| RNF07.4 | A geração de roteiro deve ser limitada a no máximo 10 requisições por usuário por hora | Não iniciado | Alta |
| RNF07.5 | A central de notificações deve carregar as 20 mais recentes em menos de 2 segundos no percentil 95, e o contador de não-lidas deve ser calculado em menos de 500 milissegundos | Não iniciado | Média |

**Detalhamento:** todos os requisitos deste grupo têm valor-alvo mensurável,
como exige o template. O RNF07.4 protege a cota do provedor de IA gratuito e
evita abuso. Os requisitos RNF07.1 e RNF07.2 sustentam o feed em escala sem
sobrecarregar o banco. Os requisitos RNF01 a RNF06 — performance geral,
segurança, usabilidade, confiabilidade, manutenibilidade e escalabilidade —
pertencem a outros domínios.

## 15. Requisitos Não Funcionais — Financeiro e Roteio

| ID | Descrição | Status | Prioridade |
|---|---|---|---|
| RNF-08.1 | O cálculo do roteio deve ser determinístico: a soma das partes de `expense_shares` deve sempre igualar o valor total da despesa | Planejado | Alta |
| RNF-02.9 | Os dados de `expense_shares` e `settlements` de uma viagem só devem ser visíveis aos seus membros, via RLS | Planejado | Alta |

**Detalhamento:** o primeiro item é testável de forma unitária, sem I/O — é exatamente o papel de `lib/finance/balances.ts` descrito no plano, o que o torna um bom candidato a caso de teste na seção 24. O segundo depende de RLS que ainda não existe no repositório (T0 não rodou nesta semana); fica "Planejado" e não "Atendido", para não repetir o erro que o `_regras.md` aponta na documentação antiga ("declara RLS habilitada sem policy versionada").



## RNF01 — Performance

| ID | Descrição | Status | Prioridade |
|---|---|---|---|
| RNF01.1 | O carregamento inicial do painel deve completar em menos de 3 segundos no percentil 95 | Planejado | Alta |
| RNF01.2 | Toda operação de escrita via rota de API deve responder em menos de 1 segundo no percentil 95 | Planejado | Alta |
| RNF01.3 | O sistema deve sustentar 1.000 usuários simultâneos sem degradação superior a 20% no tempo de resposta | Planejado | Média |
| RNF01.4 | Toda listagem que possa crescer sem limite deve paginar, no máximo 20 registros por página | Planejado | Alta |
| RNF01.5 | Toda coluna usada em filtro de consulta frequente deve ter índice, verificável no plano de execução | Planejado | Média |

**Detalhamento:** os três primeiros itens reproduzem as metas herdadas de
`docs/ARCHITECTURE.md` §7, agora com percentil declarado — sem ele a medição não
é reprodutível e o requisito não é verificável. Nenhum deles foi medido até o
momento, razão pela qual constam como Planejado e não como Atendido; a medição é
objeto da atividade `S09-F-performance`. O RNF01.4 e o RNF01.5 foram acrescentados
por decorrerem diretamente do modelo de dados: a ausência de paginação e de
índice é a causa mais provável de o RNF01.2 deixar de ser cumprido à medida que
as viagens acumulam itens.

## RNF02 — Segurança

| ID | Descrição | Status | Prioridade |
|---|---|---|---|
| RNF02.1 | Toda comunicação entre cliente e servidor deve ocorrer sobre HTTPS | Atendido | Alta |
| RNF02.2 | As senhas devem ser armazenadas com algoritmo de hash resistente, nunca em texto claro | Atendido | Alta |
| RNF02.3 | A sessão deve ser mantida por token assinado, validado no servidor a cada requisição | Atendido | Alta |
| RNF02.4 | Toda tabela do banco deve ter Row Level Security habilitada e política por operação utilizada | Atendido | Alta |
| RNF02.5 | Todo corpo de requisição deve ser validado por esquema no servidor antes de qualquer escrita | Atendido | Alta |
| RNF02.6 | Nenhuma escrita no banco deve partir do navegador: toda alteração passa por rota de API | Parcial | Alta |
| RNF02.7 | Nenhuma rota deve repassar o corpo da requisição diretamente ao banco, evitando atribuição em massa | Atendido | Alta |
| RNF02.8 | As rotas de API devem limitar requisições por usuário e por janela de tempo | Planejado | Alta |
| RNF02.12 | A aplicação deve declarar política de segurança de conteúdo que restrinja as origens de script | Planejado | Média |
| RNF02.10 | A chave de serviço do banco, que ignora a Row Level Security, não deve alcançar o navegador nem componentes de interface | Atendido | Alta |
| RNF02.11 | Mensagem de erro devolvida ao cliente não deve revelar nome de coluna, restrição ou detalhe interno do banco | Atendido | Média |

**Detalhamento:** os requisitos RNF02.1 a RNF02.3 são atendidos pela
infraestrutura adotada — HTTPS pela hospedagem, hash de senha e emissão de token
pelo serviço de autenticação do Supabase — e a validação do token no servidor é
feita por `getUser()` em `lib/supabase/proxy.ts`. O RNF02.4 deixou de ser
declaração para tornar-se fato verificável: as políticas estão versionadas em
`supabase/migrations/20260910012723_plataforma_rls_isolamento.sql` e o isolamento
é provado por `tests/rls/01-isolamento.test.ts`, que exercita dois usuários reais
e verifica tanto leitura quanto escrita — um resultado vazio de consulta não é
aceito como prova, pois também ocorreria se o dado simplesmente não existisse.
Esse teste é a origem da marcação `@RNF02` no repositório.

O RNF02.5 e o RNF02.7 decorrem das regras do `CLAUDE.md` e são exercitados pelos
testes de rota em `tests/api/`, que cobrem obrigatoriamente o caminho de corpo
inválido. O RNF02.6 permanece Parcial porque parte das telas ainda escreve
diretamente do navegador, situação que as atividades `S02-Ab-despesas-via-api` e
`S05-F-escopo-grupo` encerram. O RNF02.8 e o RNF02.12 não têm implementação e são
objeto de `S06-F-rate-limit-csp`. O RNF02.10 é a razão de a chave de serviço ser
restrita a um único módulo de acesso administrativo e nunca receber o prefixo que
a exporia ao pacote do navegador. O identificador RNF02.9 já é utilizado na
subseção do domínio financeiro, adiante, para a visibilidade dos dados de
rateio; preservamo-lo e numeramos a política de segurança de conteúdo como
RNF02.12, a fim de não invalidar referência já existente.

## RNF04 — Confiabilidade

| ID | Descrição | Status | Prioridade |
|---|---|---|---|
| RNF04.1 | A aplicação deve manter disponibilidade mensal de ao menos 99,5% | Planejado | Média |
| RNF04.2 | O banco de dados deve ter backup automático diário, com retenção mínima de 7 dias | Planejado | Alta |
| RNF04.3 | O schema do banco deve ser integralmente reproduzível a partir do repositório, sem intervenção manual | Atendido | Alta |
| RNF04.4 | Toda falha de operação deve resultar em mensagem compreensível ao usuário, nunca em tela em branco ou erro não tratado | Parcial | Alta |
| RNF04.5 | A integração contínua deve aplicar as migrações do zero e executar os testes de isolamento a cada alteração do banco | Atendido | Alta |

**Detalhamento:** revisamos a meta de disponibilidade herdada, de 99,9% para
99,5%, por honestidade técnica: o projeto utiliza camada gratuita de hospedagem e
de banco, cujos próprios acordos de serviço não sustentam o valor anterior;
declarar 99,9% seria enunciar um requisito que não temos como verificar nem
cumprir. O RNF04.3 e o RNF04.5 são atendidos e verificáveis: as migrações estão
em `supabase/migrations/` e o fluxo de integração contínua definido em
`.github/workflows/db.yml` aplica o schema em base limpa e executa os testes de
isolamento a cada alteração. O RNF04.4 permanece Parcial enquanto os estados de
erro e de carregamento não forem uniformizados, tarefa da atividade
`S07-F-estados-erro`.

## RNF06 — Escalabilidade

| ID | Descrição | Status | Prioridade |
|---|---|---|---|
| RNF06.1 | A aplicação deve executar sem estado no servidor, permitindo múltiplas instâncias simultâneas | Atendido | Alta |
| RNF06.2 | Os arquivos estáticos devem ser servidos por rede de distribuição de conteúdo | Atendido | Média |
| RNF06.3 | O acesso ao banco deve usar pool de conexões, sem abrir conexão por requisição | Atendido | Alta |
| RNF06.4 | Toda consulta de listagem deve ter limite explícito de registros, sem depender do volume atual de dados | Planejado | Alta |

**Detalhamento:** os três primeiros requisitos são atendidos por consequência das
escolhas tecnológicas descritas na seção 19: a aplicação executa em funções sem
estado, com distribuição de conteúdo estático pela própria hospedagem, e o acesso
ao banco ocorre pelo pool gerenciado do Supabase. Registramo-los ainda assim
porque a seção 21 exige justificar as escolhas, e é este grupo que explica por
que elas foram feitas. O RNF06.4 é o único item deste grupo que depende de
trabalho nosso, e é o mesmo risco enunciado no RNF01.4, observado aqui sob a
perspectiva do crescimento dos dados.

> [!] PENDENTE: RNF03 (usabilidade) e RNF05 (manutenibilidade) — a cargo da Audrey.
