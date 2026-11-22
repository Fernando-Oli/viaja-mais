## 26 Extensões e Tecnologias Complementares

Esta seção é prevista para o 8º período. Nesta entrega, registramos a situação da única extensão especificada e o roteiro de evolução da arquitetura pedido na avaliação da Fase 02.

### 26.1 Geração de roteiros por inteligência artificial

A geração de roteiro por IA está especificada nos requisitos RF12.1 a RF12.3 e não foi implementada. Não há rota nem módulo de geração no repositório. Existe apenas a tela de prévia, com dados de exemplo e identificação explícita de que não grava nada.

O que está preparado é periférico: a variável de ambiente que escolheria o provedor de IA, validada em `lib/env.ts`, e a regra de limite de 10 gerações por hora por usuário, já declarada em `lib/seguranca/limite.ts`. Por isso não descrevemos a IA como extensão entregue.

### 26.2 Roteiro de evolução da arquitetura

A avaliação da Fase 02 pediu três etapas para o futuro. A versão avaliada continua sendo a aplicação Next.js com Supabase descrita nas seções 20 a 22. A arquitetura-alvo, com o diagrama C4 correspondente, está na seção 20.5; aqui registramos apenas a ordem das etapas e o que cada uma exige.

| Etapa | O que entrega | Pré-requisito | Risco principal | Situação |
|---|---|---|---|---|
| 1. Backend separado | API própria, consumida pela aplicação web, com o banco acessado só por ela | Regras de autorização hoje divididas entre rota e RLS reunidas num só lugar | Perder a segunda camada de defesa da seção 25 ao tirar o acesso direto ao banco | Em andamento na branch `develop`, fora da versão avaliada |
| 2. Balanceador de carga e GraphQL | Várias instâncias da API atrás de um balanceador; consulta GraphQL para as telas que agregam dados | Etapa 1 concluída; API sem estado em memória | Estado guardado em memória por instância, como o reaproveitamento de links de foto | Não iniciada |
| 3. Dois aplicativos móveis | Aplicativos para celular sobre a mesma API | Etapas 1 e 2; autenticação por token utilizável fora do navegador | Duplicar regra de negócio no cliente | Não iniciada |

A ordem não é arbitrária. Os aplicativos móveis só fazem sentido depois que existe uma API que não dependa do navegador, e o balanceamento só tem o que distribuir depois que a API existe como serviço próprio. O limite de requisições já guarda o contador no banco, e não em memória, justamente para funcionar com mais de uma instância.

Não há data de conclusão registrada no repositório para nenhuma das três etapas.
