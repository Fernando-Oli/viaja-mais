---
id: S09-A-avaliacoes
titulo: Avaliações de lugares
trilha: T1
responsavel: audrey
revisor: fernando
semana: S09
requisitos: [RF11]
secoes_doc: [18]
branch: feat/S09-A-avaliacoes
tipo: [migration, rls, route-handler, tela]
depende_de: [S07-A-e2e-grupo]
status: em-revisao
---
# Avaliações de lugares

> **Audrey** · semana **S09** (21 a 27/10) · marco da semana: _Rede social ponta a ponta_

## 1. Contexto

A tabela Avaliação já estava prevista no documento do PI V. O catálogo (seção 14, grupo RF11)
define a regra: nota inteira de 1 a 5 com comentário opcional; as avaliações são **públicas a
qualquer usuário autenticado**, porque alimentam a descoberta; cada usuário edita ou exclui
só a própria.

**Chave da avaliação.** `places` é uma cópia por viagem: o mesmo Marco Zero salvo em duas
viagens vira duas linhas. Para que a avaliação de um viajante apareça para outro, ela se
prende ao identificador do Google (`places.place_id`, texto), e não ao `places.id`. Lugar sem
identificador do Google (cadastro antigo) não pode ser avaliado; a tela esconde o botão.

**Quem pode avaliar.** Ler é público entre autenticados, mas escrever exige ter o lugar
salvo em uma viagem da qual se participa. Sem isso, qualquer conta recém-criada inundaria um
lugar de notas pelo PostgREST, direto do navegador. Essa checagem é por participação
(`can_access_trip`), no banco **e** na rota (`exigirMembro`).

**Uma avaliação por pessoa por lugar.** `unique (google_place_id, user_id)`: avaliar de novo
edita a nota anterior (RF11.3), em vez de empilhar notas da mesma pessoa e distorcer a média.

**Migration.** Pela regra do CLAUDE.md, migration e RLS são do Fernando; ele autorizou a
Audrey a escrever esta ("Pode fazer, não precisa ser rascunho"). Ele revisa a migration e
a policy no PR.

**Domínio.** O catálogo põe RF11 no grupo do Micael ("a ação de avaliar pertence a este
domínio"), mas o plano-norte (S09) e a tabela de domínios do CLAUDE.md dão `place_reviews` à
Audrey. A implementação fica com a Audrey; o nome do Micael continua no catálogo como autor
do requisito.

Esta branch é empilhada sobre a `feat/S07-A-e2e-grupo` (que traz a S06): a avaliação aparece no
cartão de lugar criado na S06. O PR depende do PR da S07.

## 2. Arquivos afetados

- `supabase/migrations/<timestamp>_viagem_place_reviews.sql` (criar): tabela, constraints,
  índice, trigger de `updated_at`, grants por coluna e as quatro policies
- `types/database.ts` (regenerar com `npm run db:types`)
- `lib/schemas/avaliacao.ts` (criar): `avaliacaoSchema` (nota inteira de 1 a 5,
  comentário de até 1000 caracteres, opcional)
- `lib/lugares/avaliacoes.ts` (criar): `resumirAvaliacoes`, que calcula a média com uma casa
  decimal e o total, ignorando nota fora da faixa
- `app/api/trips/[tripId]/places/[placeId]/reviews/route.ts` (criar):
  - `GET`: avaliações do lugar, com nome do autor via `nomesDosPerfis` e o resumo
  - `PUT`: cria ou edita a própria avaliação (upsert por `google_place_id, user_id`)
  - `DELETE`: exclui a própria avaliação
- `components/place-reviews.tsx` (criar): diálogo com a média, a lista e o formulário da
  própria avaliação (estrelas de 1 a 5 e comentário), com editar e excluir (`ConfirmModal`)
- `components/place-list.tsx` (editar): botão **Avaliações** no cartão, só quando o lugar
  tem `place_id`
- `tests/rls/07-avaliacoes.test.ts` (criar)
- `tests/api/place-reviews-route.test.ts` (criar)
- `tests/lib/avaliacoes.test.ts` (criar)
- `e2e/avaliacoes.spec.ts` (criar)
- `docs/pfc/03-publico/14-requisitos-funcionais.md` (editar): status de RF11.1–RF11.3
- `docs/pfc/04-design/18-Modelo-de-dados.md` (editar, via `/pfc-secao 18`): tabela
  `place_reviews`
- `docs/pfc/00-historico-versao.md` (editar)

## 3. Passos

1. Migration + `npm run db:reset` + `npm run db:types`.
2. Teste de RLS com os dois usuários do seed (`npm run test:rls`).
3. Schema zod, `resumirAvaliacoes` com teste unitário.
4. Rota `reviews` no molde de `app/api/trips/[tripId]/places/[placeId]/route.ts`, com o
   teste de integração.
5. `components/place-reviews.tsx` e o botão no `PlaceList`.
6. E2E com screenshots (`chromium` e `mobile`); `npm run verify`.
7. Catálogo, seção 18, histórico de versão.

## 4. O que testar

Obrigatórios pelo tipo (`migration, rls, route-handler, tela`):

- [x] Aplicação limpa do zero: `npm run db:reset` sobe sem erro
- [x] Teste em `tests/rls/` com os dois usuários do seed (`07-avaliacoes.test.ts`):
  - A avalia um lugar salvo na viagem dela (INSERT aceito)
  - B, sem esse lugar em viagem nenhuma, **não** consegue inserir avaliação para ele
  - B **não** insere avaliação em nome de A (`user_id` de A)
  - B **lê** a avaliação de A (comportamento intencional: avaliação é pública)
  - B **não** edita nem exclui a avaliação de A (0 linhas afetadas, e a nota de A continua igual)
  - A não troca o `google_place_id` nem o `user_id` da própria avaliação (grant por coluna)
  - Segunda avaliação de A para o mesmo lugar é recusada (unique)
  - Nota 0 ou 6 é recusada pelo check
  - Anônimo não lê nada
- [x] Usuário A não lê E não escreve dados de B. Aqui a leitura é pública por regra do
  catálogo, então o isolamento provado é o de **escrita**, mais a leitura negada a anônimo
- [x] `npm run test:rls` verde
- [x] Integração cobrindo os 4 caminhos (`tests/api/place-reviews-route.test.ts`): 200 feliz,
  401 sem sessão, 403 não-membro, 400 payload inválido (nota 0, 6, 3.5, comentário com mais de
  1000 caracteres), mais:
  - 404 para lugar de outra viagem
  - 400 para lugar sem `place_id`
  - `user_id`, `google_place_id` e `id` vindos do corpo são descartados
- [x] Unit de `resumirAvaliacoes`: lista vazia, uma nota, arredondamento, nota fora da faixa
  ignorada; cobertura ≥ 70% no arquivo
- [x] E2E do fluxo com screenshot arquivado em `docs/pfc/evidencias/`:
  - `e2e/avaliacoes.spec.ts`: avaliar, recarregar, editar, cancelar a exclusão, excluir
  - roda nos projetos `chromium` e `mobile`

**Roteiro de teste manual**: passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

Pré-requisito: `npm run setup` (ou `npm run db:reset` para aplicar a migration nova),
`npm run dev` em http://localhost:3000. O lugar é criado pela API, porque a busca do Google
não funciona com a chave de teste. No console do navegador, logado como A, dentro da viagem:
`fetch(location.pathname.replace('/dashboard/trips/','/api/trips/').split('?')[0] + '/places', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name:'Marco Zero', latitude:-8.063, longitude:-34.871, place_id:'teste-marco-zero'})})`

1. Entrar como `teste.a@viajamais.local` / `viajamais123`, criar o lugar acima, abrir a aba
   **Lugares** e recarregar.
   → O cartão "Marco Zero" mostra o botão **Avaliações**.
2. Clicar em **Avaliações**.
   → Abre o diálogo com "Nenhuma avaliação ainda" e o formulário "Sua avaliação".
3. Clicar em **Salvar** sem escolher nota.
   → O botão fica desabilitado (ou aparece "Escolha uma nota de 1 a 5"); nada é gravado.
4. Escolher 4 estrelas, escrever "Vista linda" e clicar em **Salvar**.
   → Toast "Avaliação salva"; a lista mostra "4/5 · Vista linda" com o nome de A e a média
   "4,0 (1 avaliação)".
5. Fechar o diálogo, recarregar (F5) e abrir de novo.
   → A avaliação continua lá, com o formulário preenchido com 4 estrelas.
6. Trocar para 5 estrelas e salvar.
   → Toast "Avaliação salva"; continua **uma** avaliação, agora 5/5, média "5,0".
7. Clicar em **Excluir minha avaliação** e, no modal, em **Cancelar**.
   → O modal fecha e a avaliação continua.
8. Clicar em **Excluir minha avaliação** e confirmar.
   → Toast "Avaliação excluída"; volta "Nenhuma avaliação ainda".
9. Avaliar de novo com 3 estrelas. Sair e entrar como `teste.b@viajamais.local`. Criar uma
   viagem de B, criar nela um lugar com o mesmo `place_id: 'teste-marco-zero'` (comando do
   pré-requisito) e abrir **Avaliações**.
   → B vê a avaliação de A (3/5, com o nome de A) e **não** vê botão de editar ou excluir nela.
10. Como B, abrir `/dashboard/trips/<id da viagem de A>/places`.
    → "Sem permissão para acessar esta viagem".
11. No DevTools, aba Network, salvar e excluir uma avaliação.
    → Só aparecem `PUT`/`DELETE` em `/api/trips/<id>/places/<id>/reviews`; nenhuma chamada
    direta a `/rest/v1/place_reviews`.
12. Repetir os passos 2, 4 e 8 em modo celular (ex.: Pixel 7).
    → As estrelas e os botões cabem no diálogo, sem rolagem horizontal.

## 5. O que validar

Critérios objetivos e binários. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [x] Toda tabela nova tem RLS habilitada e policy por operação usada (SELECT, INSERT,
  UPDATE, DELETE)
- [x] Nome do arquivo segue `<timestamp>_<dominio>_<descrição>.sql`
- [x] `npm run db:types` rodado e `types/database.ts` commitado junto
- [x] SELECT vazio não é aceito como prova: INSERT, UPDATE e DELETE também são testados
- [x] Policy de escrita usa participação (`can_access_trip` sobre uma viagem que tem o
  lugar), não só propriedade. A leitura é aberta a autenticados **por decisão do catálogo**
  (RF11), e o teste registra isso explicitamente
- [x] `auth.uid()` envolvido em `(select ...)` nas policies; `user_id` indexado
- [x] Anônimo sem nenhum privilégio na tabela (`revoke all ... from anon`)
- [x] Nenhuma escrita em `place_reviews` a partir do browser: a tela só chama a rota
- [x] Rota chama `exigirMembro()` e passa o resultado do `zod` campo a campo
- [x] Uma avaliação por pessoa por lugar; salvar de novo edita
- [x] Funciona em mobile e desktop
- [x] Feedback por `toast()`; sem `alert()` nem `confirm()`
- [x] Estado de erro e de carregamento tratados
- [x] Tags `@RF11.1`, `@RF11.2`, `@RF11.3` no código e nos testes

## 6. Evidência

- [x] Saída dos testes: `docs/pfc/evidencias/S09-A-avaliacoes-testes.txt` (integração + unit, 30),
  `S09-A-avaliacoes-rls.txt` (RLS, 14) e `S09-A-avaliacoes-e2e.txt` (chromium e mobile)
- [x] Prova de mutação da RLS: `docs/pfc/evidencias/S09-A-avaliacoes-mutacoes.txt`. Sem a
  exigência de participação na policy de INSERT, 3 testes caem; com UPDATE liberado em todas
  as colunas, cai "A não move a própria avaliação para outro lugar"
- [x] Screenshot do fluxo: `docs/pfc/evidencias/S09-A-avaliacoes-{salva,outra-pessoa,excluida}-{chromium,mobile}.png`
- [x] Delta de cobertura: `lib/lugares/avaliacoes.ts` e `lib/schemas/avaliacao.ts` com 100% de
  linhas, ramos e funções (`tests/lib/avaliacoes.test.ts`)

> Observação de ambiente: o `npx supabase` sem versão baixa o CLI 3.x, que recusa a seção
> `[inbucket]` do `supabase/config.toml`. Nesta atividade foi usado `npx supabase@2`. A
> migração do `config.toml` para `[local_smtp]` é da plataforma.
