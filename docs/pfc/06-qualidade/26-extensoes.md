## 26 Extensões e Tecnologias Complementares

Esta seção é prevista para o 8º período. Nesta entrega, registramos a situação da única extensão especificada e o roteiro de evolução da arquitetura pedido na avaliação da Fase 02.

### 26.1 Geração de roteiros por inteligência artificial

A geração de roteiro por IA (RF12.1 a RF12.3) foi integrada em 25/11/2026 e está descrita nas seções 14, 19 e 22. A rota `POST /api/roteiros/gerar` chama o provedor atrás da interface de `lib/ai/provider.ts`, e a tela mostra o roteiro para revisão antes de criar a viagem; nada gerado pela IA é gravado sem essa revisão.

Trocar de provedor é escrever um arquivo em `lib/ai/` e um caso em `provider.ts`; a variável `AI_PROVIDER` já prevê um terceiro provedor, ainda sem implementação. Os limites da extensão são o prazo de 15 segundos, que restringe o roteiro a cinco dias, e a cota da camada gratuita, protegida pelo limite de 10 gerações por hora por usuário.

### 26.2 Roteiro de evolução da arquitetura

A avaliação da Fase 02 pediu três etapas para o futuro. A versão avaliada continua sendo a aplicação Next.js com Supabase descrita nas seções 20 a 22. A arquitetura-alvo, com o diagrama C4 correspondente, está na seção 20.5; aqui registramos apenas a ordem das etapas e o que cada uma exige.

| Etapa | O que entrega | Pré-requisito | Risco principal | Situação |
|---|---|---|---|---|
| 1. Backend separado | API própria, consumida pela aplicação web, com o banco acessado só por ela | Regras de autorização hoje divididas entre rota e RLS reunidas num só lugar | Perder a segunda camada de defesa da seção 25 ao tirar o acesso direto ao banco | Em andamento na branch `develop`, fora da versão avaliada |
| 2. Balanceador de carga e GraphQL | Várias instâncias da API atrás de um balanceador; consulta GraphQL para as telas que agregam dados | Etapa 1 concluída; API sem estado em memória | Estado guardado em memória por instância, como o reaproveitamento de links de foto | Não iniciada |
| 3. Dois aplicativos móveis | Aplicativos para celular sobre a mesma API | Etapas 1 e 2; autenticação por token utilizável fora do navegador | Duplicar regra de negócio no cliente | Não iniciada |

A ordem não é arbitrária. Os aplicativos móveis só fazem sentido depois que existe uma API que não dependa do navegador, e o balanceamento só tem o que distribuir depois que a API existe como serviço próprio. O limite de requisições já guarda o contador no banco, e não em memória, justamente para funcionar com mais de uma instância.

Não há data de conclusão registrada no repositório para nenhuma das três etapas.
