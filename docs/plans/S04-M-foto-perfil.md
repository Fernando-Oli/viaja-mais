---
id: S04-M-foto-perfil
titulo: Foto de perfil por upload
trilha: T1
responsavel: micael
revisor: fernando
semana: S04
requisitos: [RF02.2]
secoes_doc: [18, 20, 21, 22.1, 25]
branch: feat/S04-M-foto-perfil
tipo: [migration, rls, route-handler, regra-de-negocio, tela]
depende_de: [S03-M-migration-social, S04-M-perfil-publico]
status: em-desenvolvimento
---
# Foto de perfil por upload

> **Micael** · semana **S04** · continuação de `S04-M-perfil-publico`, pedida pelo Micael
> ao ver a página Perfil no navegador

## 1. Contexto

Hoje a foto de perfil é uma URL digitada à mão (RF02.2). O Micael pediu upload de
verdade, com o lápis de alteração na bolinha do avatar ao lado do nome, como no
Instagram.

Além da experiência, fecha um risco registrado na S03: com URL livre, a imagem é
carregada pelo navegador de quem vê o perfil direto do host escolhido pelo dono, que
recebe o IP e o horário de cada visita. Com upload, a foto passa a vir do Storage do
próprio projeto — e as URLs antigas são zeradas (ver bloco 3).

**Decisões do Micael:** PR próprio, empilhado sobre a parte 1 da S04 (#29), para o que
já está pronto não esperar o Storage; o navegador recorta em quadrado e reduz para
512×512 antes de enviar; e, depois de testar a primeira versão (que recortava sempre o
centro), **um modal de enquadramento como o do Instagram**: escolhida a foto, a pessoa
arrasta para posicionar e ajusta o zoom antes de aplicar. Feito sem biblioteca nova,
para não mexer no `package.json` (arquivo compartilhado).

**Dependência da plataforma (Fernando).** O projeto não usa Storage até hoje (o plano
norte registra isso). O bucket e as regras de acesso são migration e RLS, então seguem
o formato da S03: proposta em
[`S04-M-foto-perfil.proposta.sql`](S04-M-foto-perfil.proposta.sql), exercitada
localmente pelo teste de RLS, e a migration final é dele. **Ordem de merge: este PR
entra junto com a migration de avatares, nem antes nem depois** — antes, a rota não
teria bucket e o campo de URL já teria sumido; depois, o trigger recusaria a URL que o
formulário da parte 1 ainda envia. As seções 20 e 21 do documento (dele) também mudam.

**Autorização e quem escreve no Storage.** Como na parte 1, não há
`exigirMembro`/`exigirDono`: a foto é do próprio perfil. O bucket **não tem policy
nenhuma para usuário** — a RLS de `storage.objects` nega tudo a `authenticated` e
`anon` — e quem grava e apaga é a rota, com a chave de serviço
(`lib/supabase/admin.ts`), depois de conferir os bytes do arquivo e montar o caminho
com o `id` de `getUser()`. O perfil é atualizado com a sessão do usuário, então a RLS de
`profiles` e o trigger continuam valendo. **Uso novo do helper de serviço, a validar
com o Fernando:** o comentário dele em `admin.ts` diz para usá-lo no que a RLS não
resolve, e conferir os bytes de uma imagem é exatamente isso (o bucket só confere o
tipo declarado).

> **Como chegamos aqui.** A primeira versão dava ao usuário policies de INSERT, UPDATE,
> SELECT e DELETE na própria pasta. A revisão independente mostrou que, com o JWT que
> está no navegador, dava para enviar direto ao Storage qualquer coisa declarada como
> `image/png` e apontar o avatar para ela — os bytes nunca seriam conferidos — e que
> isso fere a regra 1 do `CLAUDE.md` (`storage.objects` é tabela do banco). As mutações
> também mostraram três proteções que nenhum teste pegava (DELETE amplo, UPDATE amplo e
> a regex sem âncora no fim). O desenho final remove as policies de usuário.

## 2. Arquivos afetados

- `docs/plans/S04-M-foto-perfil.proposta.sql` (criar, proposta para o Fernando) —
  bucket `avatars` público para leitura, 2 MB, só JPEG/PNG/WebP; **nenhuma** policy de
  usuário em `storage.objects`; trigger em `profiles` (INSERT e UPDATE) que só aceita
  `avatar_url` nula ou `<id do perfil>/<uuid>.(webp|jpg|png)`, ancorado nas duas pontas;
  e zera as URLs gravadas antes.
- `lib/social/foto.ts` (criar) — regras puras: tipo real pelos primeiros bytes, limite,
  caminho da nova foto, o formato exato do caminho, a URL pública (só para caminho no
  formato; URL antiga, `javascript:`, `//host` e `../` viram nulo) e o que pode ser apagado.
- `lib/social/avatar.ts` (criar) — `avatarPublico(valor)`: o helper que quem mostra foto
  de perfil usa (esta página, a página pública, o feed, telas de outros domínios), para
  ninguém entregar o caminho cru ao navegador.
- `app/api/social/perfil/foto/route.ts` (criar) — `POST` (multipart): recusa pelo
  `content-length` antes de ler o corpo (413), confere os bytes, envia para
  `avatars/<id>/<uuid>.<ext>` com a chave de serviço e troca `avatar_url` **condicionado à
  foto lida no começo** — duas abas ao mesmo tempo não deixam arquivo órfão: a segunda
  recebe 409 e seu arquivo é apagado. `DELETE` remove a foto do mesmo jeito.
- `app/api/social/perfil/route.ts` e `app/api/profile/[userId]/route.ts` (editar) — as
  respostas usam `avatarPublico()`; o `auth-context` (cabeçalho) recebe a URL pronta.
- `lib/schemas/perfil.ts` e `lib/schemas/perfil-limites.ts` (editar) — o PATCH do perfil
  deixa de aceitar `avatar_url`.
- `app/dashboard/perfil/page.tsx` (editar) — lápis na bolinha do avatar com menu
  "Enviar nova foto" / "Remover foto"; sai o campo "URL do avatar"; o avatar é recriado
  quando a foto muda (o Avatar do Radix guarda "imagem carregada" e, sem isso, ao remover
  a foto as iniciais não voltavam — achado pelo E2E); "Salvar perfil" travado durante o
  envio; mensagem própria para falha de rede.
- `lib/social/enquadramento.ts` (criar) — a geometria do enquadramento, em funções
  puras: escala que cobre a janela, limites (a imagem sempre cobre o círculo), zoom em
  torno do centro e o quadrado da imagem original que vira a foto.
- `app/dashboard/perfil/enquadrar-foto.tsx` (criar) — o modal "Ajustar foto": janela
  quadrada com a máscara circular do avatar; arrastar com mouse ou dedo; zoom pelo
  controle, pela roda do mouse e pela pinça; setas e +/− pelo teclado; Cancelar e
  Aplicar. Usa o `Dialog` do projeto e um `<input type="range">` nativo (o `Slider` do
  projeto não repassa o rótulo de acessibilidade, e `components/ui` não se edita).
- `app/dashboard/perfil/recortar-foto.ts` (criar) — gera o 512×512 no canvas a partir do
  recorte escolhido no modal, com fundo branco (PNG transparente não vira preto no JPEG).
- Testes: `tests/lib/foto.test.ts`, `tests/lib/enquadramento.test.ts`,
  `tests/api/social-perfil-foto-route.test.ts` (criar);
  `tests/lib/perfil-schema.test.ts`, `tests/api/social-perfil-route.test.ts`,
  `tests/api/profile-userid-route.test.ts` (editar — as URLs esperadas saem de `lib/env`:
  no CI a URL do Supabase é outra); `tests/rls/05-avatares.test.ts` (criar);
  `e2e/foto-perfil.spec.ts` e `e2e/fixtures/foto-perfil.png` (900×600) (criar).

## 3. Riscos e pendências (insumo da seção 25)

- **As URLs de avatar gravadas antes são zeradas pela migration.** Deixá-las não fecharia
  o risco do IP: quem pôs um pixel rastreador nunca vai trocar a foto. O custo é quem
  tinha avatar por URL enviar a foto de novo. Decisão final do Fernando.
- **Bucket público é a internet inteira**, não "qualquer autenticado": quem tem a URL vê
  a foto sem sessão, e o caminho leva o id do usuário. A escolha evita URL assinada que
  expira. Pesa enquanto o pré-requisito da plataforma da S03 (RPCs respondendo a anon)
  não estiver corrigido.
- **Remover a foto não é instantâneo para quem já a viu**: o Storage serve com cache de
  1 hora, e navegador/CDN podem continuar mostrando até lá.
- **Metadados (EXIF, GPS)** saem quando a tela recorta a foto no canvas. Quem chamar a
  rota direto com um JPEG mantém os metadados no arquivo.
- **Arquivo órfão se a rota cair entre o envio e a troca do perfil** (timeout). Raro, sem
  efeito para quem usa; uma limpeza periódica da pasta resolveria.
- **Apagar a conta não apaga a pasta no Storage**: fica para quando a exclusão de conta
  (RF02.4) existir.
- A Content Security Policy (`S06-F-rate-limit-csp`) vai precisar liberar `img-src` para o
  host do Storage.
- O recorte em JPEG (navegador sem WebP) não é exercitado pelo E2E: os dois projetos do
  Playwright são Chromium.
- `app/dashboard/layout.tsx` (compartilhado) mostra o avatar com `<img>` sem fallback; com
  `avatarPublico()` devolvendo nulo para tudo fora do formato, não há mais URL morta, mas
  vale trocar por `AvatarImage` + `AvatarFallback` numa mudança da plataforma.
- `docs/pfc/05-arquitetura/22-implementacao.md` ainda atribui o RF02.2 a Configurações:
  atualizar via `/pfc-secao 22` depois do merge.

## 4. Passos

1. Proposta de SQL + cópia local; teste de RLS do bucket e do trigger.
2. `lib/social/foto.ts` e `lib/social/avatar.ts` + unit.
3. Rota `POST/DELETE /api/social/perfil/foto` + integração.
4. PATCH sem `avatar_url`; respostas com `avatarPublico()`.
5. Tela: lápis, menu, recorte no navegador; sai o campo de URL.
6. E2E com upload de verdade; mutações; revisão independente; `npm run verify`; PR.

## 5. O que testar

Obrigatórios pelo tipo (`migration, rls, route-handler, regra-de-negocio, tela`):

- [ ] Aplicação limpa do zero com a proposta aplicada localmente
- [ ] RLS do bucket com dois usuários e visitante: ninguém envia, sobrescreve, move,
  copia, lista nem apaga pela API do Storage — nem na própria pasta; configuração do
  bucket (público, 2 MB, tipos) conferida
- [ ] Trigger: `avatar_url` só aceita nulo ou `<id>/<uuid>.(webp|jpg|png)` — recusa URL,
  pasta alheia, subpasta, `../`, extensão disfarçada, quebra de linha, maiúsculas, nome
  fora do formato —, também pelo PostgREST direto e no INSERT
- [ ] Unit de `lib/social/foto.ts` e `lib/social/avatar.ts` com casos de borda; ≥70%
- [ ] Integração das rotas: 200 · 401 · 400 sem arquivo · 400 tipo que não é imagem
  (mesmo declarado como imagem) · 413 acima do limite (e pelo `content-length`, sem ler
  o corpo) · exatamente 2 MB passa · tipo e extensão vêm dos bytes · 409 quando outra aba
  trocou a foto · erro do banco apaga o arquivo recém-enviado e não vaza · só a foto da
  própria pasta é apagada · URL esperada montada a partir de `lib/env` (passa com a URL
  do CI)
- [ ] Unit de `lib/social/enquadramento.ts`: cobre a janela, limites de arrasto, zoom em
  torno do centro, faixa de zoom, recorte sempre dentro da imagem
- [ ] E2E: lápis → escolher foto → abre o modal → arrastar e dar zoom → Aplicar → a foto
  aparece 512×512 no cartão e no menu lateral **e é o pedaço enquadrado** (o degradê de
  teste fica menos vermelho no centro quando se arrasta para a direita) → remover;
  Cancelar não envia nada; PDF e PDF renomeado para `.png` recusados; screenshots do
  modal e do perfil em chromium e mobile
- [ ] Mutação: cada policy que não pode existir, o bucket e o trigger — sabotados, derrubam
  ao menos um teste

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

Pré-requisito: as propostas da S03 e desta atividade aplicadas localmente, `npm run dev`.

1. Entrar como `teste.d@viajamais.local` / `viajamais123`, abrir **Meu perfil** pelo menu
   do usuário. → A bolinha do avatar mostra as iniciais e um lápis.
2. Clicar no lápis → **Enviar nova foto** e escolher uma foto grande (ex.: de celular).
   → Abre o modal **Ajustar foto**, com a foto escurecida fora do círculo.
3. Arrastar a foto, aumentar o zoom (controle, roda do mouse ou pinça no celular) e
   clicar em **Aplicar**. → Indicador de envio; a foto aparece no círculo do cartão e do
   menu lateral exatamente como foi enquadrada.
4. Escolher outra foto e clicar em **Cancelar**. → O modal fecha e nada muda.
5. No Studio (Storage → avatars), conferir o arquivo em `4444…/` com nome uuid, ~100 KB,
   512×512.
6. Enviar outra foto. → A anterior some do bucket.
7. Clicar no lápis → **Remover foto**. → Volta às iniciais; o arquivo some do bucket.
8. Tentar enviar um PDF renomeado para `.png`. → Recusado com mensagem de formato.
9. No console do navegador, logado, tentar `upload` direto no bucket com o cliente
   Supabase. → Recusado pela RLS, mesmo na própria pasta.
10. No DevTools, aba Network, enviar a foto. → `POST /api/social/perfil/foto`, e nenhuma
   chamada direta a `/storage/v1/object`.
11. Repetir 1 a 4 e 7 em modo celular. → Lápis, menu e modal utilizáveis, com pinça.

## 6. O que validar

Critérios objetivos e binários. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

> Critérios ajustados depois da revisão independente, com o motivo no bloco 1: "ninguém
> grava, apaga nem lista na pasta de outro" virou "ninguém grava, apaga nem lista pela
> API do Storage", porque o desenho final tira do usuário qualquer acesso direto ao
> bucket; e entraram a ordem de merge e as URLs antigas zeradas.

- [ ] O lápis fica na bolinha do avatar do cartão do perfil e abre "Enviar nova foto" e,
  quando há foto, "Remover foto"
- [ ] Escolhida a foto, abre um modal de enquadramento: arrastar posiciona, o zoom vem
  do controle, da roda do mouse ou da pinça, e o círculo mostra o que vira o avatar;
  Cancelar não envia nada
- [ ] A foto enviada é exatamente o que estava no círculo, recortada e reduzida para
  512×512 antes do envio
- [ ] Só JPEG, PNG e WebP de até 2 MB; o tipo é conferido pelo conteúdo do arquivo
- [ ] Ninguém grava, sobrescreve, move, copia, lista nem apaga no bucket pela API do
  Storage — só a rota escreve, depois de conferir os bytes
- [ ] O arquivo fica em `avatars/<id do usuário>/<uuid>.<ext>`
- [ ] `avatar_url` só aceita nulo ou um arquivo no formato da rota na pasta do próprio
  usuário, também pelo PostgREST direto; as URLs antigas são zeradas
- [ ] A foto anterior é apagada ao trocar ou remover; nada fora da pasta do usuário é
  apagado; envios simultâneos não deixam arquivo órfão
- [ ] O campo "URL do avatar" sai e o PATCH do perfil não aceita mais `avatar_url`
- [ ] Erro do Storage ou do banco não volta cru ao cliente
- [ ] Nenhuma chamada ao Storage parte do navegador
- [ ] Merge junto com a migration de avatares
- [ ] Funciona em mobile e desktop; feedback por `toast()`; estado de envio e de erro tratados
- [ ] ~~Autorização via `exigirMembro` / `exigirDono`~~ — não se aplica: a foto é do
  próprio perfil

## 7. Evidência

- [ ] Saída dos testes (unit, integração, RLS e E2E) em `docs/pfc/evidencias/S04-M-foto-*`
- [ ] Screenshots do fluxo (chromium e mobile): o modal de enquadramento e o perfil com a foto
- [ ] Mutações das policies, do bucket e do trigger
- [ ] Delta de cobertura de `lib/social/` e da rota
