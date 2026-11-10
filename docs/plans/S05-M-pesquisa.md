---
id: S05-M-pesquisa
titulo: Pesquisa na aba Rede social, com histórico dos perfis abertos
trilha: T3
responsavel: micael
revisor: fernando
semana: S05
requisitos: [RF09.10, RF09.12]
secoes_doc: [14, 22.1, 25]
branch: feat/S05-M-pesquisa
tipo: [migration, route-handler, tela, documentacao]
depende_de: [S05-M-seguir, S05-M-busca-pessoas]
status: em-desenvolvimento
---
# Pesquisa na aba Rede social, com histórico dos perfis abertos

> **Micael** · semana **S05** · mudança de desenho pedida pelo Micael em 21/10, depois do seguir

## 1. Contexto

Hoje a busca de pessoas mora numa coluna à esquerda do feed (no celular, numa gaveta). O Micael
mudou o desenho, no modelo do Instagram:

- **O painel lateral vira o menu da aba**, com "Início" (o feed, `/feed`) e "Pesquisar"
  (`/pesquisar`). Pesquisar troca o centro da aba, onde ficam os posts.
- **A tela de pesquisa** tem o campo no topo. Com o campo vazio, mostra o histórico ("Recentes"), se
  houver. Com um termo, mostra a lista de pessoas.
- **No celular**, as opções viram ícones numa barra inferior, como no Instagram.

**Decisões do Micael em 21/10:**

- O histórico guarda os **perfis abertos** pela pesquisa (não os termos). Reabrir alguém o leva ao
  topo. Cada entrada tem um X, que apaga na hora, e há "Limpar tudo", com confirmação.
- O histórico fica **na conta, no banco**: acompanha a pessoa em qualquer aparelho e some com a
  conta. Migration de **proposta**, no fluxo da S04: CI verde e espera o merge do Fernando.
- **No máximo 15 entradas, apagadas aos 30 dias.**
- A pesquisa tem endereço próprio (`/pesquisar`), com o termo no endereço (`?q=`): voltar de um
  perfil devolve a pesquisa como estava.

**Como o Instagram faz** (consultado em 21/10): o histórico é da conta e sincroniza entre
aparelhos; só o dono o vê, e a pessoa pesquisada não é avisada; o X remove na hora e "Limpar tudo"
apaga a lista; limpar não desliga o histórico, e as próximas pesquisas voltam a aparecer. Fontes
secundárias falam em retenção de até 90 dias. Diferente do Instagram, aqui não há uso escondido:
guardamos só a lista que a pessoa vê.

**O banco.** Tabela `search_history`:

- `user_id` (dono), `profile_id` (pessoa aberta) e `searched_at`. A chave é o par: cada pessoa
  aparece uma vez só no histórico de alguém. As duas colunas apontam para `profiles`, com apagar em
  cascata: a entrada some quando qualquer uma das duas contas é apagada.
- **RLS:** cada um lê, grava e apaga só o próprio histórico. Não existe UPDATE.
- **Grants:** SELECT e DELETE; INSERT só em `(user_id, profile_id)`. A data vem do banco e não pode
  ser forjada.
- Ninguém registra a si mesmo (constraint).
- **15 entradas e 30 dias, em três camadas:**
  - um trigger, a cada registro, deixa o mesmo dono só com as 15 mais recentes entre as que têm
    menos de 30 dias. Ele roda com os privilégios de quem registra (`SECURITY INVOKER`) e com um
    lock por dono, para dois registros ao mesmo tempo não estourarem o teto;
  - a leitura da rota só mostra o que tem menos de 30 dias;
  - um job diário do `pg_cron` apaga o que venceu de todo mundo, inclusive de quem não volta ao
    app. Habilitar o `pg_cron` é decisão da plataforma: se o Fernando não quiser, as duas primeiras
    camadas continuam valendo, e o vencido de quem não volta fica no banco até o próximo registro.
- **O vencido continua visível ao próprio dono** até sair (pela Data API, por até um dia). É de
  propósito: a primeira versão o escondia na policy de SELECT, e, como DELETE com WHERE também passa
  por ela, o dono não conseguia apagá-lo. Com isso, o "Limpar tudo" deixava o vencido no banco, e
  reabrir a mesma pessoa não registrava nada (achado I1 da revisão independente).
- "Reabrir" é apagar a entrada antiga e gravar de novo, pela rota.

**Autorização.** `exigirMembro` e `exigirDono` não se aplicam: o histórico não é recurso de viagem.
A regra é "só o próprio histórico": o `user_id` vem sempre de `getUser()`, nunca do corpo. A RLS é
a segunda linha.

## 2. Arquivos afetados

- `supabase/migrations/20261021191609_social_historico_pesquisa.sql` (criar, **proposta**):
  tabela, RLS, grants, trigger de poda e job do `pg_cron`. `types/database.ts` regenerado junto.
- `lib/social/pesquisas.ts` (criar): lista os recentes (com a foto assinada), registra e apaga.
- `lib/schemas/pesquisa.ts` (criar): o corpo do registro, `{ username }`.
- `app/api/social/pesquisas/route.ts` (criar): `GET` (recentes), `POST` (registra) e `DELETE`
  (limpa tudo).
- `app/api/social/pesquisas/[username]/route.ts` (criar): `DELETE` (remove uma entrada).
- `app/(rede-social)/layout.tsx` (editar): o menu da aba no lugar do painel de busca.
- `app/(rede-social)/navegacao.tsx` (criar): menu lateral no desktop e barra inferior no celular.
- `app/(rede-social)/pesquisar/page.tsx` (criar): a tela de pesquisa, com recentes e resultados.
- `app/(rede-social)/painel-pessoas.tsx` (apagar): a busca vai para a tela de pesquisa.
- `app/(rede-social)/feed/page.tsx` (editar): o texto que manda usar a busca.
- `docs/pfc/03-publico/14-requisitos-funcionais.md` (editar): RF09.12 e o detalhamento do RF09.10.
- Testes:
  - `tests/rls/08-historico-pesquisa.test.ts` (criar);
  - `tests/api/social-pesquisas-route.test.ts` e o dublê `tests/api/pesquisas-dubles.ts` (criar);
  - `tests/lib/pesquisa-schema.test.ts` (criar);
  - `e2e/pesquisa.spec.ts` (criar);
  - `e2e/rede-social.spec.ts` e `e2e/seguir.spec.ts` (editar: testavam a coluna e a gaveta).

## 3. Passos

1. Plano e RF09.12 no catálogo.
2. Migration de proposta, aplicada local, com o teste de RLS e os tipos.
3. `lib/social/pesquisas.ts`, o schema e as rotas, com a integração.
4. Menu da aba, tela de pesquisa e a saída do painel.
5. E2E com screenshots; specs antigos no desenho novo; mutação; advisors e EXPLAIN; duas rodadas
   de revisão independente; bateria; commit local. Push e PR só com o aval do Micael.

## 4. O que testar

*Preenchido antes da implementação.*

**Testes automatizados:**

- [ ] **RLS** (`tests/rls/08-historico-pesquisa.test.ts`), com usuários do seed logados de verdade:
  - cada um registra, lê e apaga o próprio histórico;
  - A não lê, não grava em nome de B (`user_id` forjado) e não apaga o histórico de B;
  - `searched_at` no corpo dá 42501, e UPDATE não existe;
  - registrar a si mesmo dá 23514;
  - o 16º registro apaga o mais antigo: ficam 15;
  - o que tem mais de 30 dias sai no próximo registro, e o próprio dono o apaga (reabrir a mesma
    pessoa a traz de volta, e o "Limpar tudo" não deixa nada);
  - dois registros ao mesmo tempo não estouram o teto de 15;
  - um DELETE sem WHERE só leva o próprio histórico;
  - o job do `pg_cron` existe, roda diariamente e apaga só o vencido, e um novo `CREATE EXTENSION
    pg_cron` continua passando;
  - apagar a conta leva as entradas dela e as entradas em que ela era a pessoa aberta;
  - visitante sem sessão não lê nem grava.
- [ ] **Integração** das rotas, nos 4 caminhos (sem 403: só existe o próprio histórico):
  - `GET`: 200 com os recentes (username, nome, foto assinada e selo de privado, sem `id`), em
    ordem, sem cache compartilhado; 401;
  - `POST`: 200, grava em nome da sessão (apaga a entrada antiga e grava de novo); o corpo só
    passa o `username`; 400 com corpo inválido ou o próprio perfil; 404 com username que ninguém
    usa; 401;
  - `DELETE /[username]`: 200, apaga só a entrada da sessão; 400 e 404; 401;
  - `DELETE`: 200, limpa só o histórico da sessão; 401;
  - erro do banco sem a mensagem crua.
- [ ] Unit do schema do corpo.
- [ ] **E2E (`chromium` e `mobile`, com screenshots)**, como o Davi:
  - o menu da aba no desktop e a barra inferior no celular levam ao feed e à pesquisa;
  - com o campo vazio e sem histórico, a tela diz que não há pesquisas recentes;
  - pesquisar "mari" mostra a Mariana; abrir o perfil e voltar devolve "mari" no campo;
  - a Mariana aparece nos recentes; abrir outra pessoa a põe no topo;
  - o X tira uma entrada; "Limpar tudo" pede confirmação e esvazia;
  - nenhuma requisição do navegador vai a `/rest/v1/search_history`;
  - *(da revisão)* depois do X e do "Limpar tudo", o foco no título e o anúncio; Pesquisar no menu
    começa uma pesquisa nova; o clique do meio também registra;
  - no fim, o teste limpa o histórico do Davi.
- [ ] **Specs existentes** no desenho novo: a busca (`rede-social`) e o seguir (`seguir`). O teste
  de recolher e expandir a coluna sai junto com ela; os demais (formato, curingas, resposta
  atrasada, sessão vencida, erro com tentar de novo) passam a rodar em `/pesquisar`.
- [ ] **Mutação** no código e na migration.

**Roteiro de teste manual.**

Pré-requisito: o banco populado (`.micael/populacao/popular.sql`) e o app no ar.

1. Entrar como `teste.d@viajamais.local` / `viajamais123` e abrir **Rede social**. → O menu da aba
   mostra Início e Pesquisar.
2. Clicar em **Pesquisar**. → O centro troca; o campo vazio diz que não há pesquisas recentes.
3. Digitar `mari` e abrir a **Mariana Lopes**. → Abre `/u/marilopes`.
4. Voltar. → `/pesquisar?q=mari`, com o resultado.
5. Apagar o termo. → "Recentes" com a Mariana.
6. Abrir o **Lucas** pela pesquisa e voltar. → O Lucas no topo, a Mariana embaixo.
7. Clicar no X da Mariana. → Ela sai.
8. **Limpar tudo** → confirmar. → A lista esvazia.
9. Entrar com o mesmo Davi em outro navegador. → O mesmo histórico.
10. No celular (DevTools), a barra inferior com os ícones.

## 5. O que validar

*Escrito antes da implementação.*

- [ ] O menu da aba leva ao feed e à pesquisa; no celular, ícones na barra inferior
- [ ] Com o campo vazio, os recentes; com termo, as pessoas
- [ ] Voltar de um perfil devolve a pesquisa como estava
- [ ] Abrir uma pessoa pela pesquisa (ou pelos recentes) a põe no topo do histórico
- [ ] O X apaga uma entrada; "Limpar tudo" pede confirmação e apaga todas
- [ ] No máximo 15 entradas, também com registros ao mesmo tempo; o que tem mais de 30 dias some
  da tela e é apagado, e o "Limpar tudo" não deixa nada no banco
- [ ] Depois do X e do "Limpar tudo", o foco continua na lista e a remoção é anunciada
- [ ] O histórico é só do dono: ninguém lê nem apaga o de outra pessoa
- [ ] O histórico acompanha a conta em qualquer aparelho e some com ela
- [ ] O `user_id` vem sempre da sessão; nada do corpo além do `username` vai ao banco
- [ ] A resposta não leva `id`; a foto sai por URL assinada, sem cache compartilhado
- [ ] Nenhuma escrita parte do navegador; nenhum `supabase.from` na tela
- [ ] Erro do banco não volta cru
- [ ] Funciona em mobile e desktop; feedback por `toast()`; carregando, vazio, erro e sessão
  vencida tratados
- [ ] RF09.12 no catálogo da seção 14
- [ ] ~~Autorização via `exigirMembro` / `exigirDono`~~ — não se aplica: o histórico não é recurso
  de viagem; ver bloco 1

## 6. Riscos e pendências (insumo da seção 25)

- **A migration é de proposta**, e o merge espera o Fernando, como na S04.
- **O `pg_cron` é extensão nova no banco**, decisão da plataforma. Sem ela, valem a poda no
  registro e o filtro na leitura.
- **O histórico é dado sensível**: revela quem a pessoa olhou. Por isso só o dono o lê, a pessoa
  pesquisada não é avisada, e não há uso além da lista.
- **O registro não espera resposta**: o clique abre o perfil na hora (também pelo clique do meio,
  em outra aba). Ele é feito em duas chamadas, apagar a entrada antiga e gravar a nova, e não numa
  transação: se a segunda falhar, a pessoa sai do histórico em vez de subir ao topo. É o histórico
  do próprio usuário, e a próxima abertura a registra de novo.
- **O vencido fica visível ao próprio dono pela Data API por até um dia**, até o job rodar. É a
  troca que permite ao dono apagá-lo (achado I1). A tela não o mostra.
- **Data API direta:** vale a pendência do limite de taxa registrada no `S05-M-seguir` (a tabela
  nova também é alcançável por `/rest/v1`, com a RLS e os grants).
- **O `pg_cron` sem grants manuais (achado da mutação, corrigido).** A documentação da Supabase
  manda `grant usage` e `grant all ... to postgres` no schema `cron`. Localmente, isso grava
  `postgres` concedendo a si mesmo. O event trigger da própria Supabase (`issue_pg_cron_access`) refaz
  os grants a cada `CREATE EXTENSION`, e o `REVOKE` dele passa a falhar com "dependent privileges
  exist" em qualquer migration futura que crie a extensão. A migration não repete os grants, e um
  teste de regressão prova que um novo `CREATE EXTENSION pg_cron` continua passando. Para o
  Fernando conferir no projeto hospedado, onde o papel `postgres` é diferente.
- **DELETE sem WHERE (achado da mutação, coberto).** Com WHERE, a policy de SELECT já esconde as
  linhas alheias; sem WHERE, só a policy de DELETE protege. Virou teste de RLS.
- **Achados da revisão independente, corrigidos com teste de regressão que falhou antes:**
  - I1: o dono não apagava o próprio vencido (ver bloco 1);
  - M1: o teto de 15 estourava com dois registros ao mesmo tempo, e agora há lock por dono;
  - M2: Pesquisar no menu deixava o termo antigo no campo, e agora o campo acompanha o `?q=`;
  - M3: depois do X e do "Limpar tudo", o foco caía no body, em silêncio. Agora vai para o título
    "Recentes", e a remoção é anunciada;
  - M4: abrir em outra aba pelo clique do meio não registrava;
  - M5: o teste do corpo forjado aceitava campo a mais (`toMatchObject`) e agora usa `toEqual`.
- **Segunda rodada da revisão independente:**
  - B1 (bloqueante, corrigido, com teste de regressão que falhou antes): a primeira correção do M2
    sincronizava o campo com o `?q=` a cada tecla. Como o Next atualiza o `useSearchParams` numa
    transição, o campo voltava ao valor anterior: o cursor no meio pulava para o fim, e a composição do
    teclado (Gboard, tecla morta do ABNT2) se embaralhava. Agora o `?q=` só é gravado ao abrir um
    perfil, e o campo só acompanha o endereço quando ele muda por fora. O E2E "tecla a tecla" digita
    com o cursor no meio e confere o `selectionStart`;
  - m1 (**achado, sem correção nesta atividade**): depois de "Cancelar" ou Esc no "Limpar tudo", o
    foco vai para o body. A causa está em `components/ui/confirm-modal.tsx`: o diálogo é controlado e
    não tem gatilho, e o Radix devolve o foco a um gatilho nulo. É o componente compartilhado, com 10
    usos, e não esta tela. A correção sugerida é uma prop `onCloseAutoFocus` no `ConfirmModal`, que
    também resolveria a ressalva abaixo;
  - m2 (corrigido): o teste "a poda de um registro não toca o histórico de outra pessoa" registrava
    como `authenticated`, e a RLS já escondia o histórico alheio, então não provava o filtro de dono
    do trigger, que só pesa para quem grava sem RLS (seed, chave de serviço). Agora ele registra com o
    papel do banco, e a mutação "poda sem o filtro do dono" cai nele de propósito;
  - ressalva (não reproduzida como falha): no "Limpar tudo", o anúncio sai enquanto o resto da página
    ainda está com `aria-hidden` da animação de saída do modal. O Chromium o expõe mesmo assim; WebKit
    com VoiceOver e Firefox com NVDA não foram conferidos.
- **Achado para o Fernando (CI):** o `db.yml` instala a CLI da Supabase com `version: latest`, e a
  v3.1.0, publicada em 09/11, recusa o `[inbucket]` do `supabase/config.toml` ("no longer supported. Use
  [local_smtp] instead"). O `supabase start` do job "Migrations e RLS" deve falhar em qualquer PR a
  partir de agora, sem relação com o código. Os dois arquivos são da plataforma: fixar a versão no CI ou
  migrar a seção para `[local_smtp]`. As evidências de 10/11 foram geradas com a CLI 2.120.0.
- **Achado para o Fernando:** `pesquisar` não é username reservado, e `feed` é. Não há colisão,
  porque o perfil mora em `/u/`, mas a regra da lista inclui os caminhos da aplicação. A lista do app
  espelha a constraint `profiles_username_reservado`, então a mudança vai nos dois lados juntos, numa
  migration.
- **Observação para os donos dos testes:** o banco local acumula contas de teste sem username
  (`rateio.*` e `nome-longo-*`), uma a cada rodada da suíte. A busca não as mostra.
- **Junto da pendência "o login não volta à URL de origem" (plataforma):** sem sessão, o proxy
  manda ao login levando a query da página (abrir `/pesquisar?q=carla` sem sessão vai para
  `/auth/login?q=carla`). Só acontece com link copiado, favorito ou sessão vencida com a aba aberta,
  e não mostra nada de ninguém. Quando o login voltar à origem, o proxy passa a levar o endereço
  de propósito (algo como `?next=/pesquisar?q=carla`), e a pessoa volta à mesma pesquisa.

## 7. Evidência

- [ ] Saída dos testes em `docs/pfc/evidencias/S05-M-pesquisa-*`, regravada em 10/11, depois das
  duas rodadas da revisão:
  - `S05-M-pesquisa-integracao.txt`: 35 de 35;
  - `S05-M-pesquisa-rls.txt`: 149 de 149, com o detalhe dos 21 testes do histórico;
  - `S05-M-pesquisa-mutacoes.txt`: 40 de 40 mortas (22 no código, 18 na migration), e o que as
    rodadas anteriores acharam, inclusive o m2;
  - `S05-M-pesquisa-regressao-antes.txt` (21/10): os achados da revisão (I1, M1, M2, M3, M4 e B1)
    que viraram teste e **falharam antes** da correção;
  - `S05-M-pesquisa-e2e.txt`: 41 passando (pesquisa, busca e seguir, com o "tecla a tecla" do B1), em
    `chromium` e `mobile`, com 1 pulado de propósito (o clique do meio não existe no celular);
  - `S05-M-pesquisa-advisors.txt`: o único advisor que cita o histórico é o `unused_index` (INFO) do
    índice de `profile_id`, recém-recriado pela mutação e usado pela cascata; nenhum cita a poda nem
    o `cron`. O `db lint` passou limpo, e o EXPLAIN mostra a leitura na PK e a cascata no índice de
    `profile_id`.
  - A suíte inteira deu 569 testes de unidade e integração, RLS 149 de 149 e E2E 85 passando, com
    1 pulado de propósito, contra o build de produção. No fim, o histórico ficou vazio.
  - A migration foi aplicada com `migration up` e reaplicada à mão nas correções, sem reset, porque
    outra sessão usa o mesmo banco local. A aplicação limpa do zero fica com o CI, como na S04.
  - Em 10/11, a mutação de 21/10 tinha ficado interrompida no caso "anon lê", e o banco local ainda
    tinha o `grant select` para `anon`: o RLS 08 deu 19 de 21. A rodada nova recriou a migration
    original e terminou em 21 de 21. O defeito era só do banco local, não da migration.
  - `types/database.ts` regenerado (`npx supabase gen types` + prettier, como no seguir): o diff é
    só a `search_history`.
- [ ] Screenshots do fluxo (chromium e mobile): `S05-M-pesquisa-resultados-*` (a pesquisa com
  resultados) e `S05-M-pesquisa-recentes-*` (os recentes)
- [ ] Delta de cobertura (`S05-M-pesquisa-cobertura.txt`): `lib/social/pesquisas.ts`,
  `lib/schemas/pesquisa.ts` e as duas rotas, novos, com 100% de linhas e ramos. A migration é
  coberta pelos testes de RLS e pela mutação do banco.
- [ ] Revisão adversarial independente (agente `seguranca`), em duas rodadas: os bloqueantes (I1 na
  primeira, B1 na segunda) foram corrigidos; cada achado foi reproduzido antes de ser aceito, e o m1
  ficou registrado para o dono do `ConfirmModal` (bloco 6).
