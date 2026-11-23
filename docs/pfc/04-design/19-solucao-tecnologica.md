## 19 Solução Tecnológica e Experimentação

### 19.1 Escolhas Tecnológicas

As escolhas tecnológicas seguiram três critérios: adequação ao problema, proximidade com o que o curso ensina e custo de operação compatível com um projeto acadêmico. A tabela resume a escolha para cada necessidade, conferida no `package.json` da versão entregue; os parágrafos seguintes justificam as principais.

| Necessidade | Escolha |
|---|---|
| Aplicação web e API no mesmo projeto | Next.js 16 (App Router), React 19 e TypeScript |
| Banco, autenticação e arquivos | Supabase: PostgreSQL, Auth e Storage (`@supabase/ssr`, `@supabase/supabase-js`) |
| Validação de dados | zod 3, no servidor; react-hook-form nos formulários |
| Interface | Tailwind CSS 4 e shadcn/ui, sobre componentes Radix |
| Gráficos e imagens | recharts; sharp para reprocessar fotos em WebP |
| Mapas e lugares | API do Google Maps e Places, carregada no navegador (`@types/google.maps`) |
| Testes | Vitest 4 e Testing Library; Playwright e axe-core |
| Hospedagem | Vercel |

O Next.js renderiza páginas no servidor e expõe rotas de API (route handlers) no mesmo projeto. Isso elimina um servidor separado só para a API e mantém uma única linguagem no sistema. A tipagem estática cobre todo o código, e os tipos do banco são gerados a partir do schema, o que transforma divergência entre código e banco em erro de compilação.

A escolha de um banco relacional, e não de documentos, foi revista e confirmada. Os dados do Viaja Mais são relacionais: viagem, participação, despesa e rateio existem uns em função dos outros. E o requisito mais difícil é de acesso, não de volume: um usuário não pode alcançar dados de viagem alheia.

O PostgreSQL com RLS resolve esse requisito no próprio armazenamento, e não só na aplicação: uma falha na camada de código não resulta automaticamente em vazamento. O serviço gerenciado do Supabase acrescenta autenticação e armazenamento de arquivos prontos e reduz a infraestrutura que a equipe precisa operar.

Na interface, adotamos componentes Radix, via shadcn/ui, porque já tratam navegação por teclado e leitura por tecnologias assistivas, o que pesa no requisito de usabilidade (RNF03). O zod valida todo corpo de requisição no servidor antes de qualquer escrita, e o sharp reprocessa toda foto enviada, o que descarta metadados e garante o formato que o banco aceita.

A hospedagem na Vercel executa as rotas como funções sob demanda, sem servidor para a equipe administrar. Isso tem uma consequência de projeto: cada requisição pode cair em uma instância diferente, e por isso o limite de requisições por usuário é contado no PostgreSQL (`rate_limits`), e não em memória.

O custo dessas escolhas é a dependência do provedor. A autorização no banco usa funções do Supabase, como `auth.uid()`, e o Storage e o envio de e-mail também são dele. Essa dependência é o principal motivo da migração para um backend separado, tratada como evolução na seção 20.5.

### 19.2 Experimentação Técnica e Primeiros Testes

As experimentações foram de três tipos. A primeira, nos períodos anteriores, foi a construção do protótipo navegável e da primeira modelagem do banco, que validaram o entendimento do domínio antes de haver código.

A segunda, no início deste período, foi extrair o schema real do banco herdado para arquivos de migration e reaplicá-lo em base limpa. O experimento provou que o projeto não era reproduzível a partir do repositório e deu origem à migration base, `20260910000333_plataforma_schema_base.sql`, da qual partem as outras 20.

A terceira é o conjunto de provas construídas para sustentar decisões técnicas. A principal é o teste de isolamento entre contas: cria dois usuários reais, autentica ambos e tenta, com o segundo, ler e escrever os dados do primeiro, verificando que toda tentativa falha. Ele revelou três falhas de isolamento que a documentação herdada dava como inexistentes, e a suíte que cresceu a partir dele soma hoje 475 testes contra banco real.

O mesmo experimento foi estendido em duas direções neste semestre. A primeira olha para dentro do grupo: `tests/rls/13-participante.test.ts` verifica o que um membro consegue fazer além do devido. Ele confirmou cinco falhas, com 17 dos seus 30 casos falhando, entre elas um membro que se tornava dono da viagem trocando um campo, corrigidas na migration `20261112010000_plataforma_rls_participante.sql`.

A segunda direção são os testes de mutação das políticas: alteramos deliberadamente uma proteção de cada vez, como desligar um gatilho ou ampliar uma permissão, e confirmamos que algum teste falha. Há nove registros desse experimento em `docs/pfc/evidencias/`. No primeiro, desligar o gatilho que define a situação inicial em `follows` fez falhar 3 dos 40 testes da suíte social.

Também medimos o desempenho em produção, com o script `scripts/pfc/medir-desempenho.mjs`, em 13/11/2026. O painel carregou em 623 ms no percentil 95, contra a meta de 3 s (RNF01.1), e a escrita pela API respondeu em 865 ms, contra a meta de 1 s (RNF01.2). Com 50 requisições simultâneas de uma só máquina, a mediana de leitura subiu 135%.

Essa última medida não verifica o RNF01.3, que fala em 1.000 usuários simultâneos: é um indício, e a verificação exige um teste de carga distribuído, acima dos limites das camadas gratuitas da Vercel e do Supabase. No mesmo período, a consulta da aba de despesas, com 100 mil linhas sintéticas, caiu de 12,2 ms para 0,49 ms com o índice criado para ela.

A geração de roteiros por IA não passou da tela de prévia, com dados de exemplo: não há provedor integrado nem o gerador determinístico planejado para testes. Por fim, construímos fora da `main`, na branch `develop`, uma prova de conceito de backend separado, que não faz parte desta entrega e é discutida na seção 20.5.
