---
id: S12-F-supabase-cli-pin
titulo: Fixa a versão do Supabase CLI no CI de banco
trilha: T5
responsavel: fernando
revisor: audrey
semana: S12
requisitos: [RNF04]
secoes_doc: []
branch: fix/S12-F-supabase-cli-pin
tipo: [infra, correcao-de-bug]
depende_de: []
status: em-revisao
---

## 1. Contexto

O job "Migrations e RLS" (`.github/workflows/db.yml`) falha em todo PR desde 10/11 no passo
`supabase start`, antes de aplicar qualquer migration:

```
[inbucket] in supabase/config.toml is no longer supported. Use [local_smtp] instead.
```

O workflow instalava o CLI com `version: latest`. Uma release nova deixou de aceitar a seção
`[inbucket]`, que a versão usada pela equipe (2.104.0) ainda aceita. Resultado: nenhum dos PRs
com migration (#38, #43, #44, #46, #47, #48, #51) tem prova de que o banco sobe do zero, e a
`main` também quebraria.

## 2. Arquivos afetados

- `.github/workflows/db.yml` — `version: latest` → `version: 2.104.0`, com comentário do motivo

## 3. Passos

1. Fixar a versão do `supabase/setup-cli` na mesma que roda localmente.
2. Abrir o PR e conferir o job verde.
3. Depois do merge, rodar o CI de novo nos PRs abertos (topo de cada pilha: #46, #49, #50).

Migrar `[inbucket]` → `[local_smtp]` fica para quando a equipe atualizar o CLI local; trocar
só no CI faria o config divergir do que roda nas máquinas.

## 4. O que testar

- [ ] Job "Migrations e RLS" verde neste PR (sobe o stack, aplica migrations, roda testes de RLS)
- [ ] Nenhum outro job muda de resultado

**Roteiro manual:**

1. Abrir a aba Actions do PR → job "Migrations e RLS" → passo "Subir o Supabase local"
2. → esperado: termina sem a mensagem de `[inbucket]`, e os testes de isolamento rodam

## 5. O que validar

- [ ] `db.yml` não usa mais `latest` em nenhuma ferramenta
- [ ] A versão fixada é a mesma do `npx supabase --version` local (2.104.0)
- [ ] O job passa sem nenhuma mudança em `supabase/config.toml` nem nas migrations

## 6. Evidência

- [ ] Link do run verde do job "Migrations e RLS"
