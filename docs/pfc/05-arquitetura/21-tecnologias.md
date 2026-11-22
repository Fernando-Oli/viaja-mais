## 21 Tecnologias e Ferramentas do Projeto

Organizamos as tecnologias pelos contêineres do diagrama C4 da Figura 20.2, de modo que cada escolha apareça junto da parte do sistema em que atua. As versões são as declaradas no `package.json` da `main`; o acento circunflexo (`^`) indica que o gerenciador aceita atualizações menores daquela versão. Registramos apenas o que está instalado e em uso no código.

| Contêiner | Tecnologia e versão | Papel | Por que foi escolhida |
|---|---|---|---|
| Interface no navegador | React 19.2.0 | Componentes de cliente | É a base exigida pelo Next.js 16 e permite separar o que roda no navegador do que roda no servidor |
| Interface no navegador | Tailwind CSS ^4.1.9 | Estilo | Estilo junto do componente, sem folhas globais que se sobrepõem e causam efeito colateral em outras telas |
| Interface no navegador | shadcn/ui sobre Radix UI (pacotes 1.x e 2.x) | Diálogos, menus, campos e notificações | Componentes acessíveis por teclado e leitor de tela, copiados para `components/ui` e adaptáveis sem esperar a biblioteca |
| Interface no navegador | recharts 2.15.4 e lucide-react ^0.454.0 | Gráfico de despesas por categoria e ícones | Gráfico declarativo em React, sem código de desenho próprio |
| Aplicação web | Next.js ^16.3.3 (App Router) | `proxy.ts`, Server Components e route handlers | Páginas e rotas de dados no mesmo projeto, com uma linguagem e uma publicação para uma equipe de quatro |
| Aplicação web | TypeScript ^5, modo estrito | Linguagem de todo o código | Os tipos das tabelas são gerados do banco (`types/database.ts`); divergência com o schema vira erro de compilação |
| Aplicação web | zod 3.25.76 | Validação do corpo das rotas e das variáveis de ambiente | O resultado validado é tipado, o que torna natural gravar campo a campo e impede a atribuição em massa |
| Aplicação web | @supabase/ssr (latest) e @supabase/supabase-js ^2.47.10 | Clientes de sessão e administrativo | Leem a sessão do cookie no servidor, de modo que a RLS vale também nas rotas |
| Aplicação web | sharp 0.35.4 | Regera as fotos enviadas | Decodifica e regrava a imagem em WebP, sem metadados de localização, antes de ela chegar ao Storage |
| Autenticação | GoTrue, operado pelo Supabase | Cadastro, sessão, recuperação de senha, convite por e-mail | Autenticação por serviço maduro; hash de senha e token escritos por nós seriam vulnerabilidade |
| Banco de dados | PostgreSQL 17 com RLS, no Supabase | 18 tabelas, políticas, funções e gatilhos | Modelo relacional forte e segurança por linha: o requisito central é de acesso, e resolvê-lo no banco evita que uma falha de código vire vazamento |
| Armazenamento de arquivos | Supabase Storage, buckets privados `avatars` e `capas-posts` | Fotos de perfil e de publicação | Mesmo provedor do banco e da autenticação; a foto de perfil é entregue por URL assinada que expira em 10 minutos |
| Serviço de mapas | Google Maps Platform: Maps JavaScript API e Places | Busca de lugares e exibição no mapa | Base de lugares que a equipe não teria como manter; consumida só no navegador, em dois componentes |
| Hospedagem da aplicação | Vercel | Rede de borda e funções sem estado | Publicação a cada merge na `main`, HTTPS e distribuição de conteúdo estático sem servidor para administrar |

Agrupamos os três serviços do Supabase porque foram escolhidos juntos: um único projeto fornece banco, autenticação e arquivos, com ambiente local idêntico em Docker. Isso permitiu concentrar o semestre nas regras de acesso e nas funcionalidades, e não na operação de servidores.

A tabela seguinte reúne as ferramentas de desenvolvimento e de qualidade. Os resultados que elas produzem estão na seção 24.

| Ferramenta e versão | Uso no projeto | Por que foi escolhida |
|---|---|---|
| Vitest ^4.1.11, com @vitest/coverage-v8 | Testes unitários, de rota e de RLS; cobertura com corte de 70% | Executa TypeScript sem etapa de compilação separada; o job de lint, tipos e os 1.511 testes leva cerca de dois minutos no CI |
| Testing Library (@testing-library/react ^16.3.2) e jsdom ^29.1.1 | Testes de componentes | Testa o componente pelo que o usuário vê, e não pela estrutura interna |
| pg ^8.23.0 | Conexão direta ao banco nos testes de RLS | Permite preparar dados e conferir o banco sem passar pela RLS que está sob teste |
| Playwright ^1.62.1 | Testes ponta a ponta em navegador real | Executa cada fluxo nos perfis de computador e de celular, com dois usuários, e arquiva captura de tela como evidência |
| @axe-core/playwright 4.14.0 | Verificação automática de acessibilidade | Aplica as regras WCAG 2.1 A e AA dentro dos próprios testes ponta a ponta |
| ESLint ^9.39.5, com eslint-config-next | Análise estática | Teto de avisos que só pode cair; uma regra proíbe ler variável de ambiente fora de `lib/env.ts` |
| TypeScript (`tsc --noEmit`) | Verificação de tipos no CI | Erro de tipo reprova o pull request |
| GitHub Actions | Cinco workflows: `ci.yml`, `db.yml`, `evidencias.yml`, `notion.yml` e `disponibilidade.yml` | Integrado ao repositório; executa a esteira a cada pull request sem servidor próprio |
| Supabase CLI 2.104.0 e Docker | Supabase local na máquina de cada integrante e no CI | Banco descartável e idêntico ao de produção; a versão é fixa porque uma atualização automática do CLI já derrubou a esteira |
| PlantUML, pela imagem Docker oficial | Diagramas deste documento, em `docs/pfc/diagramas` | Diagrama como texto versionado, revisado no mesmo pull request que a mudança que ele descreve |

As escolhas têm limitações que reconhecemos. A principal é a dependência de um único fornecedor para banco, autenticação e arquivos, que a subseção 20.5 trata. O pacote `@supabase/ssr` está declarado como `latest`, sem versão fixa, o que permite que uma instalação nova traga mudança não testada. E o `package.json` ainda declara dependências sem uso no código, como `react-hook-form` e `@vercel/analytics`, herdadas do modelo inicial do projeto.
