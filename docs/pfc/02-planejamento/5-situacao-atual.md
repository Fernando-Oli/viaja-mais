## 5 Situação Atual do Projeto

Em 25/11/2026, a seis dias da entrega, o Viaja Mais está integrado na branch `main` e publicado no endereço da seção 4. O sistema tem 41 rotas de servidor e 22 migrations com 18 tabelas. A cada alteração, a esteira roda análise estática, verificação de tipos, 1.675 testes de unidade e de rota (98,35% das linhas de `lib/` e `app/api/`; as telas ficam com os testes ponta a ponta), 475 testes de isolamento com banco real e 286 testes ponta a ponta em computador e celular.

Funcionam, com rota de servidor e teste: autenticação e troca de senha; viagens, itinerário, reservas e lugares com avaliações; convite por e-mail; despesas com rateio, saldo por participante, transferências sugeridas e registro de pagamentos; gráfico de gastos por categoria; a rede social com perfil público ou privado, seguir, solicitações, pesquisa de pessoas e publicações com fotos e marcação; e a geração de roteiro por IA, que a pessoa revisa antes de virar viagem.

Não foram implementados: a compra de voos e hotéis, que existe apenas como tela de prévia com dados de exemplo; o feed, também em prévia; curtidas e comentários; a exclusão de conta; e a conversão entre moedas na tela. A central de notificações mostra só solicitações de seguir. A pesquisa primária com usuários e a revisão do protótipo frente às telas não foram realizadas.

Dos 140 requisitos do catálogo, 84 estão marcados no código e 88 têm teste ligado. Fora desta entrega, está em andamento na branch `develop` a migração para um backend separado, tratada como evolução na seção 20.5.
