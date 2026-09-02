# 15 — Requisitos Não Funcionais

Esta seção cataloga os requisitos não funcionais do domínio Social & Descoberta e
IA de roteiros. Cada requisito traz um valor-alvo mensurável, condição necessária
para que possa ser verificado.

## RNF07 — Social, Descoberta e IA

| ID | Descrição | Status | Prioridade |
|---|---|---|---|
| RNF07.1 | O feed deve carregar a primeira página (20 publicações) em menos de 2 segundos no percentil 95 | Não iniciado | Alta |
| RNF07.2 | O feed deve paginar por cursor, sem carregar todas as publicações de uma vez | Não iniciado | Alta |
| RNF07.3 | A geração de roteiro por IA deve responder em até 15 segundos, ou informar erro claro ao usuário | Não iniciado | Média |
| RNF07.4 | A geração de roteiro deve ser limitada a no máximo 10 requisições por usuário por hora | Não iniciado | Alta |
| RNF07.5 | A central de notificações deve carregar as 20 mais recentes em menos de 2 segundos no percentil 95, e o contador de não-lidas deve ser calculado em menos de 500 milissegundos | Não iniciado | Média |

**Detalhamento:** todos os requisitos deste grupo têm valor-alvo mensurável,
como exige o template. O RNF07.4 protege a cota do provedor de IA gratuito e
evita abuso. Os requisitos RNF07.1 e RNF07.2 sustentam o feed em escala sem
sobrecarregar o banco. Os requisitos RNF01 a RNF06 — performance geral,
segurança, usabilidade, confiabilidade, manutenibilidade e escalabilidade —
pertencem a outros domínios.

> [!] PENDENTE: grupos de outros domínios — RF01 (autenticação), RF03 (viagens), RF04 (grupo), RF05 (itinerário), RF06 (financeiro), RF07 (reservas), RF08 (lugares); RNF01–RNF06 — a cargo de seus respectivos donos.
