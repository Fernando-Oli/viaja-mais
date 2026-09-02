# 16 — Design da Solução e Experiência do Usuário

Esta seção descreve o design da experiência do usuário no domínio Social &
Descoberta e IA de roteiros. A subseção 16.1 apresenta o fluxo de navegação entre
as telas do domínio, com a visibilidade de cada tela explicitada; a subseção 16.2
trata do protótipo navegável.

## 16.1 — Fluxo de Navegação

Consideramos apenas as telas deste domínio; a autenticação e o casco do painel
pertencem a outros domínios e aparecem aqui como fronteira. A legenda de
visibilidade é a seguinte: **[Público]**, visível a qualquer usuário autenticado;
**[Dono]**, visível apenas ao próprio usuário; **[Seguidores]**, visível apenas a
seguidores aprovados, no caso de perfil privado.

### Telas

1. **Meu perfil / editar** — `/dashboard/perfil` — nome, username, biografia,
   avatar e alternância entre público e privado — [Dono].
2. **Perfil de outro usuário** — `/u/[username]` — dados básicos e viagens
   publicadas — dados básicos [Público]; publicações [Público] se o perfil for
   público, [Seguidores] se for privado.
3. **Feed** — `/feed` — publicações de quem o usuário segue, com acesso concedido
   — [Dono].
4. **Detalhe da publicação** — `/feed/[postId]` — viagem publicada, curtidas e
   comentários — [Público] ou [Seguidores], conforme o dono.
5. **Seguidores / Seguindo** — `/u/[username]/seguidores` e `/seguindo` — listas
   de vínculos — [Público].
6. **Central de Notificações** — `/notificacoes` — [Dono] — organizada em duas
   zonas: a Zona 1, Solicitações, é acionável e persistente, com aprovar e
   recusar via RF09.4, e só sai ao ser resolvida; a Zona 2, Atividades, é
   informativa e cronológica ("começou a seguir você", "aceitou sua
   solicitação"), marcada como lida ao ser visualizada.
7. **Publicar viagem** — `/dashboard/trips/[id]/publicar` — [Dono] — parte da
   tela de viagem, em fronteira com o domínio de Viagem & Itinerário.
8. **Roteiro por IA** — `/dashboard/trips/[id]/roteiro-ia` — [Dono] — gerar,
   revisar e editar, salvar, quando vira itinerário, ou descartar; em fronteira
   com o domínio de Viagem & Itinerário.

### Representação do fluxo

```
                     [ Painel autenticado ]  (fronteira: autenticação)
                              |
          +-------------------+-------------------+
          |                   |                   |
       (Feed)          (Meu perfil)        (Sininho / Notificações)
          |                   |                   |
          v                   v                   v
   /feed  [Dono]     /dashboard/perfil    /notificacoes  [Dono]
      |   |             [Dono]              |            |
      |   |                                 |            |
   autor publicação                    Zona 1        Zona 2
      |     |                        Solicitações    Atividades
      v     v                        (aprovar/       (lidas ao
 /u/[username]  /feed/[postId]        recusar =        visualizar)
   [Pub/Seg]     curtir/comentar      RF09.4)
      |            [Pub/Seg]
      +--> perfil publico:  [Seguir] (imediato) --> passa a aparecer no meu Feed
      +--> perfil privado:  [Solicitar] --> pendente --> dono aprova na Central
      +--> ja sigo:         [Deixar de seguir]
      |
 /u/[username]/seguidores  e  /seguindo  [Publico]
      +--> [Remover seguidor] (silencioso)

   Fronteira (tela da viagem, dominio Viagem & Itinerario):
   /dashboard/trips/[id]/publicar   --> viagem aparece no feed de quem me segue
   /dashboard/trips/[id]/roteiro-ia --> gerar -> revisar/editar -> salvar | descartar
```

### Explicação do fluxo

O usuário chega autenticado ao painel, que é a fronteira com o domínio de
autenticação. A partir da barra de navegação, alcança três portas deste domínio:
o Feed, o Meu perfil e as Notificações, estas representadas por um sininho com
contador de não-lidas.

A partir do Feed, tocar em um autor leva ao perfil dele, e tocar em uma
publicação abre o detalhe, onde é possível curtir e comentar. No perfil de outro
usuário, o comportamento depende da visibilidade: se o perfil for público, o
botão Seguir tem efeito imediato, e a partir daí as publicações desse usuário
passam a aparecer no meu feed; se for privado, o botão Solicitar cria uma
solicitação pendente, que fica assim até o dono aprovar na Central de
Notificações; se eu já sigo o usuário, o botão exibido é Deixar de seguir. Nas
minhas listas de Seguidores posso Remover seguidor, ação que é silenciosa e não
impõe barreira ao removido.

A tela de Publicar viagem parte da tela da viagem, em fronteira com o domínio de
Viagem & Itinerário, e faz a viagem aparecer no feed de quem me segue. O Roteiro
por IA também parte da tela da viagem: o usuário gera o roteiro, revisa e edita,
e então salva, quando o roteiro se torna itinerário, ou descarta sem gravar nada.

A Central de Notificações concentra dois comportamentos que a representação
destaca em zonas separadas: a Zona 1, com solicitações acionáveis e persistentes,
que só saem quando o dono aprova ou recusa; e a Zona 2, com atividades
informativas e cronológicas, marcadas como lidas quando visualizadas. Optamos por
essa representação em blocos e setas, com a legenda de visibilidade em cada
tela, porque ela deixa explícito, além do caminho do usuário, quem pode ver cada
tela — informação que sustenta as políticas de acesso definidas adiante.

## 16.2 — Protótipos

> [!] PENDENTE: protótipo navegável no Figma. O link herdado está corrompido e
> precisa ser recuperado pela equipe. Uma vez disponível, o protótipo deve ser
> alinhado aos requisitos funcionais deste domínio (RF02, RF09–RF13).
