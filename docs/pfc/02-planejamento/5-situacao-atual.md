## 5 Situação Atual do Projeto

Em 22/11/2026, a nove dias da entrega, o Viaja Mais está integrado na branch `main` e publicado no endereço da seção 4. O sistema tem 39 rotas de servidor e 22 migrations com 18 tabelas. A cada alteração, a esteira roda análise estática, verificação de tipos, 1.532 testes de unidade e de rota (98,21% das linhas cobertas), 475 testes de isolamento com banco real e 274 testes ponta a ponta em computador e celular.

Funcionam, com rota de servidor e teste: autenticação e troca de senha; viagens, itinerário, reservas e lugares com avaliações; convite por e-mail; despesas com rateio, saldo por participante, transferências sugeridas e registro de pagamentos; gráfico de gastos por categoria; e a rede social com perfil público ou privado, seguir, solicitações, pesquisa de pessoas e publicações com fotos e marcação.

Não foram implementados: a geração de roteiros por inteligência artificial e a compra de voos e hotéis, que existem apenas como telas de prévia com dados de exemplo; o feed, também em prévia; curtidas e comentários; a exclusão de conta; e a conversão entre moedas na tela. A central de notificações mostra só solicitações de seguir. A pesquisa primária com usuários e a revisão do protótipo frente às telas não foram realizadas.

Dos 140 requisitos do catálogo, 79 estão marcados no código e 83 têm teste ligado. Fora desta entrega, está em andamento na branch `develop` a migração para um backend separado, tratada como evolução na seção 20.5.
