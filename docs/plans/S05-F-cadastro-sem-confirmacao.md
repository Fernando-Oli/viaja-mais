---
id: S05-F-cadastro-sem-confirmacao
titulo: Cadastro não manda esperar e-mail que não vai chegar
trilha: T1
responsavel: fernando
revisor: audrey
semana: S05
requisitos: [RF01.1, RF01.2]
secoes_doc: [22.1]
branch: fix/S05-F-cadastro-sem-confirmacao
tipo: [correcao-de-bug, tela]
depende_de: []
status: concluido
---
# Cadastro não manda esperar e-mail que não vai chegar

> **Fernando** · semana **S05** (23 a 29/09) · achado ao diagnosticar o relato
> "o e-mail de criar conta nem envia"

## 1. Contexto

`app/auth/sign-up/page.tsx:61` sempre redireciona para `/auth/sign-up-success`,
que diz para a pessoa confirmar o e-mail. Mas `supabase/config.toml:228` tem
`enable_confirmations = false`: no ambiente local o GoTrue **cria a conta já
confirmada e já devolve sessão**, e nenhum e-mail é enviado.

Efeito observável: quem se cadastra fica olhando para uma tela pedindo que
confirme um e-mail que nunca vai chegar — e na verdade já está logado. Foi
exatamente o sintoma relatado ("o de criar conta nem envia").

Comprovado contra o stack local:

```
signUp -> ok
sessao criada na hora? SIM (ja logado, sem confirmar)
email_confirmed_at: 2026-09-26T13:09:17Z
mensagem de confirmacao para ele? NAO
```

A correção não é ligar a confirmação — é a tela **perguntar** ao resultado do
`signUp` o que aconteceu, em vez de supor. O mesmo código passa a funcionar nos
dois modos, que é o que precisamos: local sem confirmação para desenvolver
rápido, e confirmação ligada onde ela estiver ligada.

## 2. Arquivos afetados

- `app/auth/sign-up/page.tsx` — decide o destino pelo `data.session`
- `tests/auth/sign-up.test.tsx` — **novo**: regressão dos dois modos

## 3. Passos

1. Ler `data` do `signUp`, não só `error`.
2. Com sessão, ir para `/dashboard`: a conta está criada e confirmada.
3. Sem sessão, manter `/auth/sign-up-success`: aí a confirmação está ligada e o
   e-mail é real.
4. Escrever o teste de regressão cobrindo os dois desfechos.

## 4. O que testar

Obrigatórios pelo tipo (`correcao-de-bug, tela`):

- [x] Teste de regressão que **falha antes** e passa depois — `tests/auth/sign-up.test.tsx`;
      com o código antigo: `expected "vi.fn()" to be called with arguments: [ '/dashboard' ]`
- [ ] E2E do fluxo com screenshot arquivado — **pendente**: `e2e/` ainda não tem
      cenário de cadastro, e criá-lo é maior que esta correção. Entra em
      `S07-A-e2e-grupo`, que monta a base de E2E.

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado
esperado de cada passo.

1. Com `enable_confirmations = false` (padrão local), criar conta em
   `/auth/sign-up` → esperado: cai no `/dashboard` logado, **sem** passar pela
   tela de "confirme seu e-mail".
2. Ligar `enable_confirmations = true` em `supabase/config.toml`, reiniciar o
   stack e repetir → esperado: cai em `/auth/sign-up-success`, e a mensagem de
   confirmação aparece em http://localhost:54324.

## 5. O que validar

- [x] O destino sai do `data.session` devolvido pelo `signUp`, não de suposição
- [x] Os dois modos de confirmação funcionam sem mudar código
- [x] O teste de regressão falha com o código antigo
- [x] Nenhuma outra tela de autenticação muda de comportamento

## 6. Evidência

- [x] Saída dos testes, com o teste novo falhando antes da correção (acima)
