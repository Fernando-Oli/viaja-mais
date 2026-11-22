---
id: S10-Ab-multi-moeda
titulo: Multi-moeda e conversão
trilha: T1
responsavel: abner
revisor: fernando
semana: S10
requisitos: [RF06]
secoes_doc: []
branch: feat/S10-Ab-multi-moeda
tipo: [regra-de-negocio]
depende_de: []
status: em-desenvolvimento
---
# Multi-moeda e conversão

> **Abner** · semana **S10** (28/10 a 03/11) · marco da semana: _Cobertura de 70% em lib/_

## 1. Contexto

O projeto já permite registrar despesas em diferentes moedas e o acerto de contas
mantém cada moeda em um grupo separado. Porém, não existe atualmente uma regra de
negócio reutilizável para converter valores entre moedas.

A antiga landing mencionava conversão de moedas em tempo real, mas essa promessa
foi removida no rebranding Avori. Também não existe fornecedor de cotação definido
nem requisito funcional catalogado específico para conversão.

Por isso, esta atividade implementa somente a regra pura de conversão. A cotação é
recebida explicitamente como entrada, sem consulta HTTP, banco de dados ou fonte
externa.

Não será adicionada tag `@RF06.x` nova, pois não há requisito catalogado específico
para conversão e criar uma tag órfã faria a checagem de rastreabilidade falhar.

## 2. Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `lib/finance/cambio.ts` | Nova regra pura para conversão e totalização em moeda-base |
| `tests/lib/finance-cambio.test.ts` | Testes unitários e casos de borda |
| `docs/plans/S10-Ab-multi-moeda.md` | Plano, critérios e evidências da atividade |
| `docs/pfc/evidencias/S10-Ab-multi-moeda-cobertura.txt` | Cobertura do módulo novo |
| `docs/pfc/evidencias/S10-Ab-multi-moeda-testes.txt` | Resultado dos testes |

Sem migration, alteração de schema, RLS ou `types/database.ts`.

## 3. Passos

1. Criar `lib/finance/cambio.ts`.
2. Trabalhar com valores monetários em centavos inteiros.
3. Definir a cotação como: 1 unidade da moeda de origem equivale a X unidades da moeda de destino.
4. Fazer o cálculo da taxa como razão inteira usando `BigInt`, evitando erro de ponto flutuante.
5. Arredondar o resultado para o centavo mais próximo; empate de meio centavo arredonda para cima.
6. Retornar o mesmo valor quando origem e destino forem a mesma moeda.
7. Criar totalização de valores em uma moeda-base somente depois da conversão individual.
8. Recusar taxa ausente ou inválida.
9. Criar testes unitários e medir cobertura.
10. Rodar as verificações gerais do projeto.

## 4. O que testar

Obrigatórios pelo tipo (`regra-de-negocio`):

- [x] Unit com casos de borda
- [x] Cobertura de ao menos 70% no arquivo

Casos previstos:

- [x] conversão exata
- [x] arredondamento para baixo
- [x] arredondamento para cima
- [x] meio centavo arredonda para cima
- [x] valor de 1 centavo
- [x] valor zero
- [x] taxa 1
- [x] taxa decimal
- [x] mesma moeda
- [x] taxa ausente
- [x] taxa zero
- [x] taxa negativa
- [x] `NaN` e `Infinity`
- [x] valor negativo
- [x] valor não inteiro em centavos
- [x] moedas inválidas
- [x] totalização de várias moedas em uma moeda-base
- [x] moedas diferentes nunca são somadas antes da conversão
- [x] resultado acima de `Number.MAX_SAFE_INTEGER`

**Roteiro de teste manual**

1. Executar `npx vitest run tests/lib/finance-cambio.test.ts`.
   Esperado: todos os testes passam.
2. Executar a cobertura somente de `lib/finance/cambio.ts`.
   Esperado: cobertura maior ou igual a 70%.
3. Executar `npm run verify`.
   Esperado: projeto continua válido sem regressões.
4. Conferir `git diff --check`.
   Esperado: nenhuma saída.

Não existe alteração de tela nesta atividade, portanto screenshot não se aplica.

## 5. O que validar

- [x] Função pura, sem I/O
- [x] Casos de arredondamento cobertos
- [x] Nenhum `fetch`, Supabase, banco ou variável de ambiente no módulo
- [x] Valores monetários recebidos e devolvidos em centavos inteiros
- [x] Cotação possui convenção matemática documentada
- [x] Moedas diferentes não são somadas antes da conversão
- [x] Mesma moeda não exige cotação
- [x] Taxa ausente ou inválida gera erro explícito
- [x] Resultado final é um inteiro seguro
- [x] Nenhuma integração de cotação externa foi inventada
- [x] Nenhuma migration, RLS ou schema alterado

## 6. Evidência

- [x] Saída dos testes
- [x] Screenshot ou gravação do fluxo — não se aplica: atividade sem alteração de tela
- [x] Delta de cobertura