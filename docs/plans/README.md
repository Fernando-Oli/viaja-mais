# Planos

Um arquivo por atividade. **O repositório é a fonte da verdade**; o quadro do
Notion é espelho, atualizado pelo CI a partir daqui.

- `00-plano-norte.md` — o plano do semestre inteiro: domínios, cronograma
  paralelo, linha de corte e o que cada pessoa entrega em cada semana.
- `_template.md` — modelo de atividade. Não copie à mão: use `/atividade <ID>`,
  que já pré-preenche os blocos "O que testar" e "O que validar" a partir do
  `tipo` declarado.
- `<ID>-<slug>.md` — as atividades.

## Por que os blocos 4 e 5 vêm antes do código

O bloco 4 (**o que testar**) existe para que quem implementa saiba desde o início
o que vai precisar provar. O bloco 5 (**o que validar**) existe para que os
critérios de aceite sejam combinados antes de haver código — depois, viram
negociação.

Atividade sem esses dois blocos preenchidos não entra em desenvolvimento.
