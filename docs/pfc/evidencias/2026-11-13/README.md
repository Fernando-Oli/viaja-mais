# Evidências de 13/11/2026 — rebranding Avori

| | |
|---|---|
| Data | 13/11/2026 |
| Commit | `c0f1090` (merge do PR #72 na `main`), mais a correção de layout deste mesmo PR, descrita abaixo |
| Node / npm | v22.19.0 / 11.7.0 |
| Ambiente | Supabase local em Docker (`npm run setup`), seed com os usuários de teste |

## O que há nesta pasta

| Arquivo | Conteúdo |
|---|---|
| `testes-unit.txt` | Saída de `vitest run --coverage`: 59 arquivos, **928 testes, todos passando**, e a tabela de cobertura por arquivo |
| `cobertura/coverage-summary.json` | Resumo da cobertura em JSON (o relatório HTML completo não foi versionado) |
| `rls.txt` | Saída de `npm run test:rls`: 19 arquivos, **280 testes, todos passando** |
| `build.txt` | Saída de `npm run build` (build de produção do Next.js), sem erro |
| `e2e.txt` | Saída de `playwright test`, perfis `chromium` e `mobile`: **183 passando, 1 pulado, nenhuma falha** |
| `screenshots/` | 36 capturas dos testes ponta a ponta, renomeadas por fluxo e passo, em computador e celular |

## Leitura dos números

A cobertura de testes unitários é de **96,55% das linhas** no conjunto medido (`lib/**` e
`app/api/**`), acima do corte de 70% que o CI aplica desde a S10. O número mais importante é o de
`lib/finance/`, com **100% das linhas e 99,37% dos desvios**: é ali que estão o rateio, o saldo por
membro e a minimização de transferências, as regras em que um erro de arredondamento vira dinheiro
cobrado a mais de alguém. `lib/seguranca/` (regra de senha e checagens) fica em 97,8%. O ponto baixo é
`lib/supabase/`, com 9,7% de linhas: `client.ts`, `server.ts` e `proxy.ts` são invólucros do SDK do
Supabase, sem regra própria, e só são exercitados pelos testes de RLS e pelos E2E; deixamos que contem
contra a média em vez de excluí-los, para o número não ser maquiado.

Os 280 testes de RLS são a segunda linha de defesa: cada política é provada com dois usuários, de modo
que o teste falha se o usuário B consegue ler ou escrever o que é do usuário A. Os 183 E2E percorrem
pela interface, em computador e em celular, todos os fluxos com tela: grupo e convite, viagem,
itinerário, reservas, lugares e avaliações, despesas, rateio e acerto, rede social, perfil, estados de
erro, acessibilidade (WCAG 2.1 A/AA com axe-core) e a prévia de compra.

## Falhas, limitações e o que estes testes não provam

- **O teste pulado** é `e2e/pesquisa.spec.ts` (abrir um perfil em nova aba com o clique do meio) no
  perfil `mobile`: celular não tem clique do meio. O pulo é declarado no próprio teste.
- **Problema visual achado nesta coleta e corrigido antes de arquivar.** Ao revisar as capturas,
  encontramos três defeitos de layout introduzidos pelo rebranding que nenhum teste automatizado
  acusou, porque os elementos continuavam presentes e clicáveis: o ícone dos campos de pesquisa e de
  convite sobrepunha o texto digitado; no celular, o resumo e os membros da viagem apareciam antes das
  abas, empurrando o itinerário para o fim da página; e a aba Reservas quebrava para uma segunda linha.
  A correção está no mesmo PR destas evidências, e as capturas desta pasta já são posteriores a ela. O
  episódio mostra o limite dos testes ponta a ponta: eles provam função, não aparência, e a revisão
  visual das capturas continua necessária.
- **Telas em prévia.** A criação de roteiro com IA, o feed, a publicação, os comentários e a compra de
  passagens e hospedagem têm teste de acessibilidade, e a compra tem um E2E de ponta a ponta, mas
  todas funcionam com dados de exemplo e não gravam nada. Os testes provam a interface, não uma
  funcionalidade que ainda não existe.
- **Busca do Google Places** continua fora dos testes automatizados: depende de uma chave real, e os
  testes criam lugares e destinos diretamente pela rota de API.
- **Nas capturas de página inteira do celular**, a barra de abas aparece no meio da imagem. É um
  efeito da captura de página inteira do Playwright sobre elementos fixos na tela, não um defeito: no
  aparelho, a barra fica presa ao rodapé.

## Capturas

Cada fluxo tem a versão `-computador` (Desktop Chrome) e `-celular` (Pixel 7).

| Fluxo | Arquivos |
|---|---|
| Grupo e convite | `grupo-01-convite-enviado`, `grupo-02-convite-aceito` |
| Viagem e itinerário | `viagem-01-editada`, `roteiro-01-atividade-adicionada`, `roteiro-02-atividade-concluida` |
| Reservas e lugares | `reservas-01-criada`, `lugares-01-visitado`, `lugares-02-avaliacao-salva` |
| Financeiro | `financeiro-01-despesas`, `financeiro-02-rateio-por-peso`, `financeiro-03-acerto-inicial`, `financeiro-04-tudo-acertado` |
| Rede social e conta | `social-01-pesquisa`, `social-02-solicitar-perfil-privado`, `social-03-solicitacao-no-sino`, `conta-01-perfil-editado` |
| Estados e prévias | `estados-01-nao-encontrado`, `compra-01-voo-previa` |

As capturas com o nome original de cada atividade (por exemplo `S03-A-editar-viagem-mobile.png`)
continuam na pasta `docs/pfc/evidencias/`, atualizadas por esta mesma execução, porque são as que as
seções do documento referenciam.
