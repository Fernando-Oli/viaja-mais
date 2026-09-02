# PARTE 00 — Histórico de Versão do Projeto

Registro da evolução do projeto ao longo dos períodos. Atualizado em toda entrega.

| Versão | Período | Fase | Data | Descrição |
|---|---|---|---|---|
| 1.0 | 5º | 01 | — | Prototipação no Figma, identidade visual e primeira modelagem do banco de dados. |
| 2.0 | 7º | 02 | 26/08/2026 | Reestruturação técnica do projeto: schema do banco versionado no repositório, políticas de RLS explícitas, camada de autorização no servidor, esteira de integração contínua, suíte de testes e padronização do acesso a dados. Correção da documentação herdada, que descrevia tecnologias e funcionalidades inexistentes. |
| 2.1 | 7º | 02 | 02/09/2026 | Catálogo de requisitos do domínio Social & Descoberta e IA de roteiros: gestão de perfil (RF02), rede social com perfis público/privado e aprovação de seguidores (RF09), interação social (RF10), avaliações de lugares (RF11), IA de roteiros (RF12), notificações (RF13) e requisitos não funcionais do domínio (RNF07). Documentado o fluxo de navegação (seção 16.1) das telas do domínio, com a visibilidade pública/privada explícita em cada tela. |

2.3   | 7º | 02 | 02/09/2026 |
Catálogo de requisitos do domínio Financeiro e modelo do rateio: detalhamento dos requisitos existentes de controle financeiro (RF06.1 a RF06.7) e inclusão dos requisitos de rateio de despesas, contemplando identificação de quem realizou o pagamento, tipos de rateio (igualitário, ponderado e por valor exato), cálculo das parcelas individuais, saldo por membro, quitação e minimização de transferências. Definida a regra de arredondamento para garantir a soma exata dos valores rateados e especificado o controle de acesso por RLS para os dados financeiros compartilhados.

> [!] PENDENTE: as datas e descrições dos períodos anteriores (1º ao 6º) precisam
> ser recuperadas das entregas já feitas no AVA. Só a equipe tem esse histórico.
