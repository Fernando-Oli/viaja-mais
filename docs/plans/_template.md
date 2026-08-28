---
id: S00-F-slug-da-atividade   # S<semana>-<inicial>-<slug>; Abner = Ab (Audrey já usa A)
titulo: Título curto e verbal
trilha: T1
responsavel: fernando        # fernando | audrey | micael | abner
revisor: fernando            # sempre fernando, salvo nos PRs dele
semana: S00
requisitos: [RF00.0]
secoes_doc: []               # seções do documento afetadas, ex.: [22.1, 14]
branch: feat/S00-F-slug-da-atividade
tipo: [route-handler]        # migration | rls | route-handler | regra-de-negocio
                             # tela | componente | correcao-de-bug | seguranca
                             # documentacao | infra
status: backlog              # backlog | em-desenvolvimento | em-revisao
                             # ajustes | validacao | concluido
---

## 1. Contexto

Por que esta atividade existe e qual necessidade do usuário ela atende. Uma ou
duas frases. Se ela corrige um problema, diga qual é o efeito observável hoje —
não "o código está ruim", mas "a viagem criada não aparece na lista".

## 2. Arquivos afetados

- `caminho/do/arquivo.ts` — o que muda
- `supabase/migrations/<timestamp>_<dominio>_<nome>.sql` — se houver dado novo

## 3. Passos

1.
2.
3.

## 4. O que testar

*Preenchido por quem implementa, antes de abrir o PR.*

**Testes automatizados** (obrigatórios pelo `tipo` — ver `CLAUDE.md`):

- [ ]
- [ ]

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado
esperado de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada:

1. Entrar como `teste.a@viajamais.local` → …
2. → esperado: …

## 5. O que validar

*Escrito **antes** da implementação, de propósito: critério combinado depois que
já existe código para defender deixa de ser critério.*

Cada item é objetivo e binário. "Funciona bem" não é critério; "usuário que não
está em `trip_members` recebe 403 ao chamar `PATCH /api/trips/:id`" é.

- [ ]
- [ ]

## 6. Evidência

O que vai anexado no PR:

- [ ] Saída dos testes
- [ ] Screenshot / gravação do fluxo (se houver tela)
- [ ] Delta de cobertura (se mexeu em `lib/`)
