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
próprio projeto.

**Decisões do Micael:** PR próprio, empilhado sobre a parte 1 da S04 (#29), para o que
já está pronto não esperar o Storage; e o navegador recorta o centro em quadrado e
reduz para 512×512 antes de enviar — foto de celular de vários MB vira ~100 KB, e o
círculo fica sempre bem preenchido.

**Dependência da plataforma (Fernando).** O projeto não usa Storage até hoje (o plano
norte registra isso). Criar o bucket e as policies de `storage.objects` é migration e
RLS, então segue o formato da S03: proposta em
[`S04-M-foto-perfil.proposta.sql`](S04-M-foto-perfil.proposta.sql), exercitada
localmente pelo teste de RLS, e a migration final é dele. Como o Storage passa a fazer
parte da arquitetura, as seções 20 e 21 do documento (dele) também mudam.

**Autorização.** Como na parte 1, não há `exigirMembro`/`exigirDono`: a foto é do
próprio perfil, o caminho no Storage é montado com o `id` de `getUser()` e as policies
do bucket só deixam cada um gravar e apagar na própria pasta.

## 2. Arquivos afetados

- `docs/plans/S04-M-foto-perfil.proposta.sql` (criar, proposta para o Fernando) —
  bucket `avatars` público, 2 MB, só JPEG/PNG/WebP; policies de INSERT, UPDATE e DELETE
  em `storage.objects` restritas à pasta `<id do usuário>/`; nenhuma policy de SELECT
  (bucket público serve a imagem pela URL, e sem SELECT ninguém lista a pasta dos
  outros); trigger em `profiles` que só aceita `avatar_url` nula ou apontando para a
  pasta do próprio usuário no bucket — sem isso, o PATCH direto pelo PostgREST
  continuaria aceitando qualquer URL.
- `lib/social/foto.ts` (criar) — regras puras: tipo real da imagem pelos primeiros bytes
  (não pela extensão nem pelo `content-type` que o cliente manda), limite de tamanho,
  extensão e o caminho no Storage a partir da URL pública.
- `app/api/social/perfil/foto/route.ts` (criar) — `POST` (multipart) envia a foto para
  `avatars/<id>/<aleatório>.<ext>`, grava a URL em `avatar_url` e apaga a anterior;
  `DELETE` remove a foto. Erro do Storage ou do banco não volta cru.
- `app/dashboard/perfil/page.tsx` (editar) — lápis na bolinha do avatar com menu
  "Enviar nova foto" / "Remover foto"; sai o campo "URL do avatar".
- `app/dashboard/perfil/recortar-foto.ts` (criar) — recorte quadrado e redução para
  512×512 no navegador (canvas), ao lado da página porque só ela usa e não roda fora
  do navegador.
- `lib/schemas/perfil.ts` e `lib/schemas/perfil-limites.ts` (editar) — o PATCH do perfil
  deixa de aceitar `avatar_url`: a foto só muda pelas rotas de foto.
- `tests/lib/foto.test.ts`, `tests/api/social-perfil-foto-route.test.ts` (criar);
  `tests/lib/perfil-schema.test.ts` (editar).
- `tests/rls/05-avatares.test.ts` (criar) — isolamento do bucket e o trigger de `avatar_url`.
- `e2e/foto-perfil.spec.ts` e `e2e/fixtures/foto-perfil.png` (criar).

## 3. Passos

1. Proposta de SQL + cópia local; teste de RLS do bucket e do trigger.
2. `lib/social/foto.ts` + unit.
3. Rota `POST/DELETE /api/social/perfil/foto` + integração.
4. PATCH sem `avatar_url` (schema e testes).
5. Tela: lápis, menu, recorte no navegador; sai o campo de URL.
6. E2E com upload de verdade; mutações das policies; `npm run verify`; PR.

## 4. O que testar

Obrigatórios pelo tipo (`migration, rls, route-handler, regra-de-negocio, tela`):

- [ ] Aplicação limpa do zero com a proposta aplicada localmente
- [ ] RLS do bucket com dois usuários: cada um envia e apaga na própria pasta; ninguém
  envia, sobrescreve, apaga nem lista na pasta de outro; visitante sem sessão não envia
- [ ] Trigger: `avatar_url` só aceita nulo ou a pasta do próprio usuário no bucket, também
  pelo PostgREST direto
- [ ] Unit de `lib/social/foto.ts` com casos de borda; cobertura ≥70%
- [ ] Integração das rotas: 200 · 401 · 400 sem arquivo · 400 tipo que não é imagem (mesmo
  com `content-type` de imagem) · 400 acima do limite · erro do banco apaga o arquivo
  recém-enviado e não vaza a mensagem · a foto anterior só é apagada se estiver na pasta
  do usuário
- [ ] E2E: lápis → enviar foto → aparece no cartão e no menu lateral → remover; arquivo que
  não é imagem é recusado na tela; screenshot em chromium e mobile
- [ ] Mutação: cada policy e o trigger, removidos, derrubam ao menos um teste

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

Pré-requisito: as propostas da S03 e desta atividade aplicadas localmente, `npm run dev`.

1. Entrar como `teste.d@viajamais.local` / `viajamais123`, abrir **Meu perfil** pelo menu
   do usuário. → A bolinha do avatar mostra as iniciais e um lápis.
2. Clicar no lápis → **Enviar nova foto** e escolher uma foto grande (ex.: de celular).
   → Indicador de envio; a foto aparece recortada no círculo, no cartão e no menu lateral.
3. No Studio (Storage → avatars), conferir o arquivo em `4444…/` com ~100 KB, 512×512.
4. Enviar outra foto. → A anterior some do bucket.
5. Clicar no lápis → **Remover foto**. → Volta às iniciais; o arquivo some do bucket.
6. Tentar enviar um PDF renomeado para `.png`. → Recusado com mensagem de formato.
7. No DevTools, aba Network, enviar a foto. → `POST /api/social/perfil/foto`, e nenhuma
   chamada direta a `/storage/v1/object`.
8. Repetir 1, 2 e 5 em modo celular. → Lápis e menu utilizáveis.

## 5. O que validar

Critérios objetivos e binários. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [ ] O lápis fica na bolinha do avatar do cartão do perfil e abre "Enviar nova foto" e,
  quando há foto, "Remover foto"
- [ ] A foto enviada é recortada em quadrado e reduzida para 512×512 antes do envio
- [ ] Só JPEG, PNG e WebP de até 2 MB; o tipo é conferido pelo conteúdo do arquivo
- [ ] O arquivo fica em `avatars/<id do usuário>/`; ninguém grava, apaga nem lista na
  pasta de outro, nem pela API do Storage direto
- [ ] `avatar_url` só aceita nulo ou a pasta do próprio usuário no bucket, também pelo
  PostgREST direto
- [ ] A foto anterior é apagada ao trocar ou remover; nada fora da pasta do usuário é apagado
- [ ] O campo "URL do avatar" sai do formulário e o PATCH do perfil não aceita mais `avatar_url`
- [ ] Erro do Storage ou do banco não volta cru ao cliente
- [ ] Nenhuma chamada ao Storage parte do navegador: o envio passa pela rota
- [ ] Funciona em mobile e desktop; feedback por `toast()`; estado de envio e de erro tratados
- [ ] ~~Autorização via `exigirMembro` / `exigirDono`~~ — não se aplica: a foto é do
  próprio perfil

## 6. Evidência

- [ ] Saída dos testes (unit, integração, RLS e E2E) em `docs/pfc/evidencias/S04-M-foto-*`
- [ ] Screenshots do fluxo (chromium e mobile)
- [ ] Mutações das policies e do trigger
- [ ] Delta de cobertura de `lib/social/foto.ts` e da rota
