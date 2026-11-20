## 24. Qualidade do Software e Testes

Esta seção descreve como verificamos a qualidade da Avori: os tipos de teste adotados, a regra que define qual teste cada mudança exige, a integração contínua que aplica essa regra, a ligação entre testes, requisitos e funcionalidades, os resultados obtidos e os limites do que esses testes provam. Todos os números citados vêm de execuções arquivadas em `docs/pfc/evidencias/`.

### 24.1 Estratégia de testes

Adotamos cinco tipos de teste, cada um responsável por uma pergunta diferente. Nenhum deles substitui os outros: um teste de unidade não prova que a tela chama a rota certa, e um teste ponta a ponta não prova que o banco recusa um acesso indevido feito por fora da aplicação.

| Tipo | Ferramenta | Onde fica | O que prova |
|---|---|---|---|
| Unidade | Vitest | `tests/lib/`, `tests/components/`, `tests/auth/` | Regras de negócio isoladas, como o rateio de despesas, o saldo por membro, a política de senha e a projeção pública da viagem, incluindo casos de borda |
| Integração de rota | Vitest | `tests/api/` | Cada route handler em `app/api/**` responde corretamente nos quatro caminhos: sucesso, ausência de sessão (401), acesso por quem não participa da viagem (403) e dados inválidos (400) |
| Segurança do banco (RLS) | Vitest contra o Supabase local | `tests/rls/` | Cada política de RLS isola os dados: com dois usuários reais, o teste falha se o usuário B lê ou altera o que pertence ao usuário A |
| Ponta a ponta (E2E) | Playwright | `e2e/` | O fluxo completo pela interface, em dois perfis: `chromium` (computador) e `mobile` (Pixel 7) |
| Acessibilidade | Playwright com axe-core | `e2e/acessibilidade.spec.ts` | As telas principais não violam as regras WCAG 2.1 de níveis A e AA verificáveis por máquina (RNF03.5) |

Para as políticas de RLS mais sensíveis, aplicamos ainda o **teste de mutação**: sabotamos de propósito a política no banco local (por exemplo, retirando a exigência de participação na viagem) e conferimos que a suíte falha. Uma sabotagem que não derruba nenhum teste revela uma proteção que os testes não estão vigiando. Os registros estão em `docs/pfc/evidencias/*-mutacoes.txt`; no caso das avaliações de lugares (S09), as duas sabotagens aplicadas derrubaram, respectivamente, três e um teste da suíte `tests/rls/07-avaliacoes.test.ts`.

### 24.2 Qual teste cada mudança exige

O tipo de teste não fica a critério de quem implementa. Uma tabela de convenções do repositório (`CLAUDE.md`) define o teste obrigatório para cada tipo de mudança, e o plano de cada atividade em `docs/plans/` traz os blocos "O que testar" e "O que validar" preenchidos **antes** da implementação. Escrever o critério antes impede que ele seja ajustado depois ao que o código já faz.

| Tipo de mudança | Teste obrigatório |
|---|---|
| Migration ou política de RLS | Aplicação limpa do zero e teste de RLS com dois usuários provando o isolamento |
| Route handler | Integração cobrindo os caminhos 200, 401, 403 e 400 |
| Regra de negócio em `lib/` | Unidade com casos de borda e cobertura mínima de 70% no arquivo |
| Tela ou componente | E2E do fluxo, com captura de tela arquivada, escrito por quem construiu a funcionalidade |
| Correção de defeito | Teste de regressão que falha antes da correção e passa depois |

A regra do E2E escrito por quem construiu a tela é deliberada: quem implementou sabe onde a funcionalidade é frágil. A regra da regressão também é verificada, não apenas declarada. Na correção da projeção pública da viagem (S14, versão 2.15 da Parte 00), o arquivo `S14-A-congelamento-a-falha-antes.txt` registra o teste novo falhando em três de quatro casos com o código antigo, e `S14-A-congelamento-a-passa-depois.txt` registra os mesmos testes passando após a correção.

### 24.3 Integração contínua

Toda alteração entra na branch principal por pull request, e a integração contínua (GitHub Actions) bloqueia o merge quando alguma verificação falha. O fluxo `.github/workflows/ci.yml` executa, em sequência, o lint, a checagem de tipos do TypeScript, os testes de unidade e de integração, a conferência de rastreabilidade (seção 24.4) e a medição de cobertura; em paralelo, gera o build de produção e roda os E2E contra um Supabase local, divididos em quatro partes para reduzir o tempo de espera. O fluxo `db.yml` sobe o banco do zero, aplica todas as migrations e executa os testes de RLS, o que garante que nenhuma migration depende do estado de um banco antigo.

A cobertura tem corte obrigatório desde a S10 (versão 2.12 da Parte 00): `vitest.config.mts` faz o CI falhar se linhas, desvios, funções ou instruções caírem abaixo de 70%, tanto no total quanto em `lib/`, onde ficam as regras de negócio. Nenhum arquivo foi excluído da medição para o número fechar.

### 24.4 Relação entre testes, requisitos e funcionalidades

A ligação entre teste e requisito é feita por marcação no próprio código. Todo requisito implementado carrega uma tag no formato `@RF03.2` em comentário, tanto no código que o implementa quanto no teste que o verifica. O script `scripts/pfc/rastreabilidade.mjs` lê essas tags e as cruza com o catálogo da seção 14: o comando `npm run pfc:rastreabilidade:check`, executado em todo pull request, **falha se um requisito marcado como Existente não tem teste** ou se uma tag cita um requisito inexistente. Assim, o status "Existente" do catálogo não é uma declaração, mas uma condição verificada a cada alteração. A matriz completa de requisito, código, teste e commit é gerada em `docs/pfc/rastreabilidade.md`.

A tabela a seguir mostra essa ligação para os requisitos do domínio de viagem, itinerário, reservas e lugares.

| Requisito | Funcionalidade | Integração de rota | Ponta a ponta |
|---|---|---|---|
| RF03.1, RF03.4 | Criar e listar viagens | `tests/api/trips-post.test.ts`, `trips-get.test.ts` | `e2e/grupo-convite.spec.ts`, `jornada-completa.spec.ts` |
| RF03.2 | Editar viagem | `tests/api/trips-patch.test.ts` | `e2e/editar-viagem.spec.ts` |
| RF05.1 | Adicionar atividade | `tests/api/itinerary-route.test.ts` | `e2e/adicionar-atividade.spec.ts` |
| RF05.2, RF05.3 | Editar, concluir e excluir atividade | `tests/api/itinerary-item-route.test.ts` | `e2e/itinerario-crud.spec.ts` |
| RF07.1, RF07.5, RF07.6 | Criar, editar e excluir reserva | `tests/api/bookings-route.test.ts`, `booking-item-route.test.ts` | `e2e/reservas.spec.ts` |
| RF08.4, RF08.6 | Marcar lugar visitado e excluir | `tests/api/places-route.test.ts`, `place-item-route.test.ts` | `e2e/lugares.spec.ts` |
| RF11.1 a RF11.3 | Avaliar lugar | `tests/api/place-reviews-route.test.ts` e RLS em `tests/rls/07-avaliacoes.test.ts` | `e2e/avaliacoes.spec.ts` |
| RF09.7 (fronteira) | Recorte público da viagem para publicação | Unidade em `tests/lib/trips-publico.test.ts` e `trips-publico-limites.test.ts` | `e2e/jornada-completa.spec.ts` (abertura da publicação) |

Além dos testes por funcionalidade, o teste `e2e/jornada-completa.spec.ts` encadeia as telas na ordem em que uma pessoa nova as usa: cadastro, criação da viagem, inclusão de atividade, marcação de lugar como visitado, cadastro de reserva e abertura da publicação. Os testes isolados provam cada tela; a jornada prova que elas funcionam juntas para quem não tem nenhum dado prévio.

![Jornada completa, passo de publicação, perfil de computador](../evidencias/S11-A-e2e-completo-06-publicar-chromium.png)

*Figura 24.1 — Último passo do teste `e2e/jornada-completa.spec.ts` no perfil de computador.* Ao fundo está o detalhe da viagem criada pela conta recém-cadastrada, na aba Reservas, com o voo cadastrado no passo anterior. Em primeiro plano, o diálogo "Publicar viagem" mostra a capa com o título e as datas da mesma viagem, o campo de legenda e as opções do que aparece na publicação, além do aviso de que despesas, reservas e códigos de confirmação nunca são publicados. No canto inferior direito, as notificações "Lugar marcado como visitado" e "Reserva adicionada" confirmam os dois passos anteriores. O teste verifica que o diálogo exibe o título da viagem certa; a gravação da publicação é coberta pelos testes do domínio social.

### 24.5 Resultados

A coleta completa mais recente, de 13/11/2026, está em `docs/pfc/evidencias/2026-11-13/`, com o commit, a versão do Node e o ambiente registrados no `README.md` da pasta.

| Suíte | Resultado | Arquivo |
|---|---|---|
| Unidade e integração | 59 arquivos, 928 testes, todos passando | `testes-unit.txt` |
| RLS | 19 arquivos, 280 testes, todos passando | `rls.txt` |
| E2E (computador e celular) | 183 passando, 1 pulado, nenhuma falha | `e2e.txt` |
| Build de produção | Sem erro | `build.txt` |

A cobertura medida sobre `lib/**` e `app/api/**` foi de 96,55% das linhas e 90,72% dos desvios. O valor mais relevante é o de `lib/finance/`, com 100% das linhas e 99,37% dos desvios, porque ali estão o rateio e a minimização de transferências, regras em que um erro de arredondamento significa cobrar valor indevido de alguém. O teste pulado é declarado no próprio arquivo: abrir um perfil em nova aba com o clique do meio do mouse, ação que não existe no perfil de celular. Depois dessa coleta, em 19/11/2026, foram acrescentados o teste da jornada completa, aprovado nos dois perfis (`S11-A-e2e-completo-e2e.txt`), e os quatro testes de regressão da projeção pública.

### 24.6 Análise crítica

Os testes encontraram defeitos reais, e não apenas confirmaram o que já funcionava. O perfil de celular revelou que a antiga barra lateral cobria o botão de salvar (versão 2.6 da Parte 00). O teste ponta a ponta do fluxo de grupo revelou cinco defeitos, entre eles a lista de membros vazia e a data do convite exibida com um dia a menos (versão 2.10). A verificação de acessibilidade levou ao escurecimento das cores da identidade visual, que não atingiam o contraste mínimo (versão 2.12).

Reconhecemos, porém, limites no que essa bateria prova:

- **Testes provam função, não aparência.** Na coleta de 13/11, a revisão manual das capturas encontrou três defeitos de layout que nenhum teste acusou, porque os elementos continuavam presentes e clicáveis. A revisão visual das capturas segue necessária.
- **Nem todo defeito é achado por teste.** O defeito corrigido na S14, em que um título de atividade antigo com mais de 120 caracteres impedia a publicação da viagem, foi encontrado em revisão de código por outro integrante. O teste de regressão veio depois, para que o defeito não volte.
- **Serviços externos ficam fora.** A busca do Google Places depende de uma chave real; por isso os testes criam destinos e lugares diretamente pela rota de API, e o preenchimento automático do destino não é exercitado.
- **Telas em prévia.** Até esta versão, a publicação no feed, o feed e a criação de roteiro com IA funcionam como prévia visual, sem gravar dados. Os testes dessas telas provam a interface, não uma funcionalidade pronta.
- **Cobertura alta não é garantia.** Os invólucros do SDK em `lib/supabase/` têm cobertura baixa por unidade (9,7% das linhas) e só são exercitados pelos testes de RLS e pelos E2E; preferimos deixá-los contar contra a média a excluí-los. Em sentido inverso, um arquivo com 100% de cobertura pode ter asserções fracas, e é por isso que aplicamos o teste de mutação às políticas de RLS em vez de confiar apenas na porcentagem.
