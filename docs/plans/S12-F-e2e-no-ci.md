---
id: S12-F-e2e-no-ci
titulo: E2E roda de verdade no CI, contra Supabase local efêmero
trilha: T5
responsavel: fernando
revisor: audrey
semana: S12
requisitos: [RNF05, RNF03.5]
secoes_doc: [24]
branch: chore/S12-F-e2e-no-ci
tipo: [infra, correcao-de-bug]
depende_de: []
status: em-revisao
---

## 1. Contexto

O job "Playwright" do CI dependia dos secrets `E2E_USER_*`, que nunca foram configurados. Sem eles, o job caía num `echo "E2E pulado"` e ficava verde em uns 50 s sem executar nenhum teste. Todo "Playwright pass" de setembro a 11/11 foi vazio, e cerca de 160 testes E2E só rodavam na máquina de quem lembrasse.

Ao rodar a suíte inteira localmente (S06-F), três testes falharam sem relação com aquela mudança. Ligar o CI sem corrigi-los deixaria todo PR vermelho:

- **`acessibilidade.spec.ts` / dashboard:** os cards de viagem passada usavam `opacity-75`, e a opacidade derrubava o contraste do texto secundário para 2,96 (o mínimo é 4,5). Só aparecia quando havia viagem passada no banco; as viagens que os specs criam com datas de 01 a 10/11 viraram passadas em 11/11. O mesmo padrão existia nas reservas passadas.
- **`acessibilidade.spec.ts` / diálogo de avaliações:** o axe media durante o fade-in, com o fundo a meio caminho, e o contraste dava 4,47. Teste instável por tempo de animação.
- **`rateio-despesa.spec.ts` / divisão igual:** o teste esperava os R$ 3,34 na linha "Você", mas desde o #41 (RNE-020) o centavo extra vai para o menor `user_id`. Os convidados têm UUID aleatório, então falhava em cerca de 2 a cada 3 rodadas.

## 2. Arquivos afetados

- `.github/workflows/ci.yml` — o job `e2e` sobe o Supabase local (CLI 2.104.0), exporta as credenciais do stack, faz o build contra ele e roda a suíte. Ele é dividido em 4 partes paralelas (`--shard`), cada uma com o seu banco, porque em série a suíte levava 15 min (12 só de testes, um de cada vez). Não espera mais o job de build, que ele não usa. E é pulado em PR que só mexe em `docs/` ou em `.md` (job `mudancas`)
- `app/dashboard/page.tsx`, `app/dashboard/bookings/page.tsx` — `opacity-75` → `border-dashed` nos itens passados
- `e2e/acessibilidade.spec.ts` — espera as animações do diálogo antes do axe
- `e2e/rateio-despesa.spec.ts` — divisão igual sem ordem fixa, conferindo que o 3,34 foi para o menor `user_id`

## 3. Passos

1. Corrigir as três falhas e rodar cada spec repetidas vezes.
2. Reescrever o job, com as variáveis do stack passadas no `env:` dos passos (o `env:` do topo do workflow tem precedência sobre o `$GITHUB_ENV`).
3. Abrir o PR e conferir que o job roda os ~166 testes, e não 50 s de nada.

## 4. O que testar

- [x] `acessibilidade.spec.ts` com `--repeat-each=5`: 20/20
- [x] `rateio-despesa.spec.ts` com `--repeat-each=3`: todos verdes nos dois projetos
- [x] Em série, no primeiro run do PR: 169 passaram em 12,2 min de testes (15 min de job)
- [ ] Em 4 partes: as quatro passam, e a espera cai para ~6 min

## 5. O que validar

- [ ] O job não depende de nenhum secret
- [ ] O log mostra os testes rodando, não "E2E pulado"
- [ ] O relatório e os `test-results/` ficam arquivados como artefato
- [ ] A regra da RNE-020 continua conferida no E2E (o 3,34 vai para o menor `user_id`)

## 6. Evidência

- [ ] Link do run do job "Playwright" com a contagem de testes
