## 7 Cronograma do Semestre

A tabela mantém o planejamento original e registra a situação de cada semana em 22/11/2026, conferida nos planos de atividade, nas migrations e no código da branch `main`.

| Semana | Período | Atividades principais | Resultado esperado | Situação em 22/11 |
|---|---|---|---|---|
| S01 | 26/08 – 01/09 | Base técnica: migrations, políticas de acesso, rota de referência, testes e integração contínua. Catálogo de requisitos dos quatro domínios. | Base integrada e backlog no quadro de acompanhamento. | Concluída. O catálogo da plataforma foi concluído na S05. |
| S02 | 02/09 – 08/09 | Autorização nas rotas e fim do mass-assignment. Correção dos defeitos herdados mais graves. Despesas via rota de servidor. | Quadro alimentado pela própria esteira. | Concluída. Autorização nas rotas de convite integrada em 26/09. |
| S03 | 09/09 – 15/09 | Convite por e-mail. Edição de viagem e de itinerário. Migration da camada social. Edição e exclusão de despesa. | Convite chega ao destinatário. | Concluída com atraso, entre 26/09 e 14/10. |
| S04 | 16/09 – 22/09 | Testes de isolamento com dois usuários. Migration do rateio. Perfil público e edição de perfil. | Políticas de acesso provadas por teste. | Concluída entre 26/09 e 14/10. |
| S05 | 23/09 – 29/09 | Escopo de grupo nas telas. Reservas completas. Seguir e deixar de seguir. Funções de saldo. | Nenhuma escrita a partir do navegador. | Concluída com atraso. Seguir integrado até 13/11; resultado confirmado na revisão de 12/11. |
| S06 | 30/09 – 06/10 | Limite de requisições e cabeçalhos de segurança. Lugares visitados. Publicação de viagem. Interface de rateio. | Fluxo de grupo de ponta a ponta. | Concluída com atraso: lugares em 14/10, limite e CSP em 12/11, publicação em 19/11. |
| S07 | 07/10 – 13/10 | Estados de erro e carregamento. Ponta a ponta do convite. Feed com paginação. Tela de acerto de contas. | Primeiro teste ponta a ponta verde na esteira. | Parcial. Acerto e ponta a ponta do grupo em 21/10. Feed não implementado (em prévia). |
| S08 | 14/10 – 20/10 | Revisão das políticas sociais. Curtidas e comentários. Minimização de transferências. | Acerto de contas funcional. | Parcial. Minimização antecipada para a S05; políticas revistas em 12/11 e 22/11. Curtidas e comentários cortados. |
| S09 | 21/10 – 27/10 | Desempenho e observabilidade. Avaliações de lugares. Gráficos e relatório por categoria. | Rede social de ponta a ponta. | Concluída com atraso: avaliações em 11/11, índices e código de erro em 13/11. Rede social sem feed. |
| S10 | 28/10 – 03/11 | Revisão de segurança completa. Cobertura e acessibilidade. Provedor de IA. | Cobertura de testes na meta declarada. | Parcial. Revisão em 12/11, cobertura e acessibilidade em 11/11. Provedor de IA não implementado. |
| S11 | 04/11 – 10/11 | Correções de segurança. Ponta a ponta do fluxo completo. Tela de roteiro gerado. | Roteiro por IA de ponta a ponta. | Parcial. Correções em 12/11 e jornada completa em 19/11. Roteiro por IA só em prévia. |
| S12 | 11/11 – 17/11 | Seções de qualidade e de segurança, com evidências datadas dos testes. | Evidências arquivadas. | Concluída. Evidências arquivadas em 13/11 e 22/11. |
| S13 | 18/11 – 24/11 | Montagem do documento, revisão cruzada e conferência entre requisitos catalogados e implementados. | Congelamento de funcionalidades em 20/11. | Em andamento. Após 20/11 entrou só a correção de segurança da marcação de pessoas, em 22/11. |
| S14 | 25/11 – 01/12 | Correção de defeitos, ensaio da apresentação e fechamento do documento. | Entrega da Fase 02. | Prevista. |

O cronograma tem quatorze semanas e uma única dependência: a S01, cuja base técnica destrava as demais frentes enquanto os outros integrantes escrevem o catálogo de requisitos. Da S02 em diante as quatro frentes correm em paralelo, cada uma no seu domínio. As semanas S12 e S13 são reservadas à documentação, e o congelamento em 20/11 deixa o restante para correção e ensaio.

O atraso concentrou-se a partir da S05, e as pendências das semanas S05 a S08 foram replanejadas em 18/10 para até 27/10. O prazo não foi cumprido: a maior parte foi integrada entre 11 e 19/11. A linha de corte foi aplicada aos comentários, às curtidas, ao feed e à geração de roteiros por IA.
