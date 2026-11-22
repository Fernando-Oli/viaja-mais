## 3 Equipe do Projeto

| Matrícula | Nome Completo | Função no Projeto |
|---|---|---|
| 2321056 | Fernando Luis Rodrigues de Oliveira | Líder técnico. Responsável pela plataforma: schema do banco, políticas de acesso, camada de autorização, integração contínua e segurança. |
| 2320113 | Audrey Pereira Lacerda | Product Owner. Responsável pelo domínio de Viagem e Itinerário, incluindo reservas e lugares, e pela estrutura de testes automatizados. |
| 2320740 | Micael Cruz Batista Martins | Responsável pelo domínio Social e Descoberta: perfil, seguidores, pesquisa de pessoas e publicações. |
| 2320046 | Abner de Oliveira Cosmo | Responsável pelo domínio Financeiro: despesas, rateio, saldos e acerto de contas. |
| 1-12664 | Weder Mariano de Sousa | Orientador Principal |
| 13812 | Carlos Roberto Gomes Junior | Orientador Secundário |

A divisão é vertical: cada integrante responde pelo seu domínio de ponta a ponta, da migration à rota de servidor, à tela e ao teste, e não por uma camada isolada. A exceção é a plataforma: migrations e políticas de acesso são escritas sempre pelo mesmo responsável, em qualquer domínio, porque uma política incorreta não produz erro visível, apenas vaza ou oculta dados.
