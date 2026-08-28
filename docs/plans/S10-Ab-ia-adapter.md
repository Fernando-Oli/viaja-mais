---
id: S10-Ab-ia-adapter
titulo: Adapter de IA e rota de geração de roteiro
trilha: T1
responsavel: abner
revisor: fernando
semana: S10
requisitos: []
secoes_doc: [26]
branch: feat/S10-Ab-ia-adapter
tipo: [route-handler, regra-de-negocio]
status: backlog
---
# Adapter de IA e rota de geração de roteiro

> **Abner** · semana **S10** (28/10 a 03/11) · marco da semana: _Cobertura de 70% em lib/_

## 1. Contexto

Interface com implementação fake determinística para dev e CI, e a real atrás dela. Chave nunca em NEXT_PUBLIC_; a saida do modelo e validada por zod antes de virar registro no banco.

## 2. Arquivos afetados

_A preencher antes de comecar: caminhos concretos, incluindo migration se houver dado novo._

## 3. Passos

_A preencher._

## 4. O que testar

Obrigatórios pelo tipo (`route-handler, regra-de-negocio`):

- [ ] Integração cobrindo os 4 caminhos: 200 feliz, 401 sem sessão, 403 não-membro, 400 payload invalido
- [ ] Unit com casos de borda
- [ ] Cobertura de ao menos 70% no arquivo

**Roteiro de teste manual** — passo a passo reproduzível, com o resultado esperado
de cada passo. Quem revisa precisa conseguir repetir sem perguntar nada.

1. _A preencher._

## 5. O que validar

Critérios objetivos e binarios. Escritos **antes** da implementação, de propósito:
critério combinado depois que já existe código para defender deixa de ser critério.

- [ ] Chave de IA nunca com prefixo NEXT_PUBLIC_
- [ ] Saida do modelo validada antes de persistir
- [ ] `await params` (nesta versão do Next, params e Promise)
- [ ] Corpo validado por zod, com campos extraidos um a um — nunca `...body`
- [ ] Autorização checada no servidor via `exigirMembro` / `exigirDono`
- [ ] Função pura, sem I/O
- [ ] Casos de arredondamento cobertos

## 6. Evidência

- [ ] Saida dos testes
- [ ] Screenshot ou gravação do fluxo (se houver tela)
- [ ] Delta de cobertura (se mexeu em `lib/`)
