---
id: S14-F-ver-no-mapa
titulo: Link "Ver no mapa" nas atividades do roteiro da Avori
trilha: T1
responsavel: fernando
revisor: micael
semana: S14
requisitos: [RF12.2]
secoes_doc: [14, 26]
branch: feat/S14-F-ver-no-mapa
tipo: [tela, regra-de-negocio]
depende_de: [S11-M-tela-roteiro-ia]
status: em-revisao
---
# Link "Ver no mapa" nas atividades do roteiro da Avori

> **Fernando** · semana **S14** (25/11 a 01/12) · marco da semana: _Entrega em 01/12_

## 1. Contexto

Na revisão do roteiro gerado pela IA, cada atividade mostra só o título, o
lugar e uma dica em texto. Quem revisa não tem como ver onde o lugar fica,
fotos ou avaliações sem copiar o nome e procurar à mão. Esta atividade põe em
cada atividade um link que abre o próprio Google Maps já buscando aquele lugar,
em nova aba.

O link é um endereço público do Google Maps (`/maps/search/?api=1&query=`),
que não usa chave nem tem custo e não manda nada ao nosso servidor. A versão com
mapa e fotos dentro do app, pela API de lugares do Google, exige conta de
faturamento e fica para depois da entrega (seção 26).

A tela é do domínio do Micael (S11-M-tela-roteiro-ia); por isso ele revisa.

## 2. Arquivos afetados

- `lib/ai/mapa.ts` (novo) — função pura que monta o link a partir do lugar, do
  título e do destino
- `app/dashboard/trips/criar/ia/page.tsx` — o link em cada atividade da revisão
- `tests/lib/ai-mapa.test.ts` (novo) — casos de borda da função
- `e2e/roteiro-ia.spec.ts` — o link aparece, aponta para a busca certa e abre
  em nova aba, no computador e no celular
- `components/ia/ver-no-mapa.tsx` (novo) — o link, com ícone e nome acessível
- `docs/pfc/03-publico/14-requisitos-funcionais.md` — detalhamento do RF12.2
- `docs/pfc/06-qualidade/26-extensoes.md` — 26.3, a versão com mapa e fotos
  como próximo passo

Sem migration, sem rota nova.

## 3. Passos

1. `linkDoMapa({ local, titulo, destino })`: busca pelo lugar quando a IA o
   informou e, sem ele, pelo título da atividade; acrescenta o destino quando ele
   ainda não está no texto, para "Mercado da Ribeira" não cair em outra cidade.
   Texto vazio não gera link.
2. Na revisão, um link "Ver no mapa" com ícone de alfinete abaixo do título de
   cada atividade, com `target="_blank"` e `rel="noopener noreferrer"`, e nome
   acessível que diz qual atividade abre e que é em nova aba.
3. Testes de unidade e ponta a ponta; captura de tela em computador e celular.
4. Detalhamento do RF12.2 na seção 14 e o próximo passo na 26.3.

## 4. O que testar

Obrigatórios pelo tipo (`tela`, `regra-de-negocio`):

- [x] Unidade em `tests/lib/ai-mapa.test.ts`: com lugar; sem lugar (usa o
  título); destino já contido no lugar, sem diferença de maiúsculas e acentos
  (não repete); acentos e caracteres especiais codificados; espaços nas pontas;
  lugar e título vazios (sem link); cobertura de 100% do arquivo
- [x] E2E em `e2e/roteiro-ia.spec.ts`, nos perfis de computador e celular, com
  captura em `docs/pfc/evidencias/S14-F-ver-no-mapa-*.png`

**Roteiro de teste manual**

1. Entrar como `teste.a@viajamais.local`, abrir `/dashboard/trips/criar/ia` e
   responder Lisboa, 3 dias, em casal, equilibrado, moderado, comida e história
   → esperado: o roteiro aparece com "Ver no mapa" em cada atividade.
2. Clicar em "Ver no mapa" da primeira atividade → esperado: nova aba do Google
   Maps buscando "Check-in na hospedagem, Lisboa"; a aba do app continua na
   revisão, com o roteiro intacto.
3. Editar o título da atividade sem lugar → esperado: o link passa a buscar o
   título novo.
4. Repetir no celular (largura de 390 px) → esperado: o link não sobrepõe o
   horário nem o botão de remover.

## 5. O que validar

- [x] Toda atividade da revisão tem exatamente um link "Ver no mapa" com
  `href` começando por `https://www.google.com/maps/search/?api=1&query=`
- [x] O link abre em nova aba (`target="_blank"`) com `rel` contendo
  `noopener` e `noreferrer`; a aba do app não perde o roteiro em revisão
- [x] Com o lugar informado pela IA, a busca usa o lugar; sem ele, o título
  atual da atividade, inclusive depois de editado; o destino entra uma vez só
- [x] Nenhuma requisição nova ao nosso servidor nem ao Google ao exibir o link:
  sem chave, sem custo, sem mudança na CSP
- [x] O link tem nome acessível com o título da atividade e o aviso de nova aba
- [x] Nada muda na criação da viagem: o E2E que confere a viagem criada pela
  API continua verde

## 6. Evidência

- [x] Saída dos testes
- [x] Capturas da revisão com o link, no computador e no celular
- [x] Cobertura de `lib/ai/mapa.ts`

## Andamento

- Unidade: 8 casos, 100% de linhas, desvios e funções em `lib/ai/mapa.ts`.
- E2E `e2e/roteiro-ia.spec.ts` contra `npm run start` com o Supabase local e o
  gerador fake: 7 passaram e 1 foi pulado (o teste de rolagem é só de
  computador). Capturas em `docs/pfc/evidencias/S14-F-ver-no-mapa-chromium.png`
  e `-mobile.png`.
- O link não é clicado no teste, para a suíte não sair para o Google; o que se
  confere é o `href`, o `target` e o `rel`.
