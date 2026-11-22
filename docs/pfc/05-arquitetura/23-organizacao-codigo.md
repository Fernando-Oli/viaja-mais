## 23 Organização do Código e Repositório

Mantemos um repositório único, que reúne a aplicação, o banco, os testes, a esteira de integração e a documentação, incluindo este documento. A escolha permite que uma mudança de schema, a rota que a usa, a tela e o teste correspondente cheguem juntos em um mesmo pull request, e que o avaliador confira cada afirmação no mesmo lugar.

### 23.1 Estrutura de pastas

```text
app/                 páginas, layouts e rotas de API, por endereço
  auth/              telas públicas de identidade
  dashboard/         área autenticada: painel, viagens, finanças, perfil
  (rede-social)/     feed, pesquisa, notificações e perfil de outras pessoas
  api/               route handlers: única porta de escrita
components/          componentes de domínio
  ui/                shadcn/ui de prateleira (exceto confirm-modal.tsx)
  social/            componentes da rede social
  prototipo/         telas de prévia com dados de exemplo
context/             sessão e viagens no cliente
hooks/               hooks compartilhados
lib/                 regra de negócio e infraestrutura compartilhada
  authz/ schemas/ finance/ social/ trips/ lugares/ seguranca/ supabase/
supabase/            config.toml, seed.sql e migrations/
types/               database.ts, gerado a partir do schema
tests/               unidade, rota (api/), componente e isolamento (rls/)
e2e/                 testes de ponta a ponta com Playwright
scripts/             ambiente local, montagem do documento, quadro Notion
docs/                plano do semestre, planos de atividade, evidências, este documento
.github/workflows/   ci.yml, db.yml, evidencias.yml, notion.yml, disponibilidade.yml
```

### 23.2 Responsabilidade de cada pasta

- `app/`: só orquestra. A página monta a tela e a rota recebe, autoriza, valida e grava; nenhuma delas contém cálculo de negócio.
- `lib/authz/`: a autorização de viagem, em um único arquivo, `trip.ts`.
- `lib/schemas/`: os esquemas zod de cada recurso, compartilhados entre formulário e rota.
- `lib/finance/`, `lib/lugares/` e `lib/trips/`: regras puras de cada domínio, testadas sem banco nem navegador.
- `lib/social/`: as regras e consultas da rede social, como perfil visto, marcações, posts e fotos.
- `lib/seguranca/`: política de senha, limite de requisições e política de segurança de conteúdo.
- `lib/supabase/`: os quatro clientes do banco; `admin.ts` é o único módulo que lê a chave de serviço.
- `lib/env.ts` e `lib/http.ts`: variáveis de ambiente validadas com zod na inicialização e o contrato de erro HTTP.
- `supabase/migrations/`: o schema versionado; o banco local e o de testes são recriados a partir dele.
- `types/database.ts`: tipos gerados por `npm run db:types`, nunca editados à mão.

### 23.3 Fronteiras entre domínios

Cada integrante é dono de uma fatia vertical: Plataforma, Viagem e Itinerário, Rede social e Financeiro. A fatia vai da tabela à rota, à tela e ao teste. A regra de fronteira é que nenhum domínio consulta tabela de outro diretamente; o dono expõe uma função em `lib/` e os demais a consomem.

Dois exemplos mostram a regra no código. A publicação de viagem, do domínio social, não lê `trips` nem `itinerary_items`: chama `projecaoPublicaDaViagem()` de `lib/trips/publico.ts`, mantida pelo domínio de Viagem. No sentido inverso, o detalhe da viagem e a rota de avaliações obtêm nomes de pessoas por `nomesDosPerfis()` de `lib/social/perfis.ts`.

Há uma exceção deliberada à posse vertical: migrations e políticas de RLS são sempre escritas pelo responsável pela Plataforma, em qualquer domínio. Uma política errada não produz erro visível; ela devolve dado a mais ou a menos, sem mensagem. Concentrar essa escrita em uma pessoa reduz o risco e dá a ela a visão do conjunto das políticas.

### 23.4 Convenções

| Convenção | Formato | Exemplo |
|---|---|---|
| Identificador de atividade | `S<semana>-<inicial>-<slug>` | `S06-M-publicar-viagem` |
| Plano da atividade | `docs/plans/<ID>.md` | `docs/plans/S08-Ab-transferencias.md` |
| Branch | `feat/`, `fix/`, `chore/` ou `docs/` mais o ID | `feat/S03-A-editar-viagem` |
| Commit | Conventional Commits, com o requisito no escopo | `feat(RF03): permite editar viagem` |
| Rastreabilidade | tag `@RFxx.y` em comentário, no código e no teste | `@RF05.1 adicionar atividade` |
| Migration | marca temporal e domínio no nome | `20261111100000_financeiro_settlements.sql` |

As migrations levam marca temporal, e não número sequencial, porque quatro pessoas criam migrations em paralelo e a numeração sequencial colidiria. As tags de requisito alimentam a matriz de rastreabilidade: `npm run pfc:rastreabilidade:check` roda na esteira e falha quando um requisito marcado como implementado não tem teste ou quando uma tag não existe no catálogo.

O uso da convenção de commits pode ser medido no histórico. Dos 171 commits da `main`, 157 usam um dos cinco tipos abaixo.

**Tabela 23.1 — Commits da `main` por tipo (até 22/11/2026)**

| Tipo | Commits | Uso |
|---|---|---|
| `feat` | 60 | funcionalidade nova |
| `fix` | 35 | correção de defeito |
| `docs` | 30 | documentação e este documento |
| `chore` | 21 | configuração, dependências, esteira |
| `test` | 11 | testes |

Por autor, os commits da `main` se dividem em Fernando 82, Micael 58, Audrey 15 e Abner 14. O número não mede esforço, porque um commit pode conter de uma linha a uma funcionalidade inteira, e, pela regra da seção 23.3, migrations e políticas de todos os domínios ficam com a Plataforma.

### 23.5 Fluxo de uma mudança

1. Plano: a atividade ganha um arquivo em `docs/plans/`, com os blocos "O que testar" e "O que validar" preenchidos antes da implementação. Há 81 planos no repositório.
2. Implementação em branch própria, com os testes exigidos pelo tipo de mudança.
3. Verificação local com `npm run verify`, que executa lint, checagem de tipos, testes e build.
4. Pull request com os critérios de validação do plano; a esteira roda sobre ele.
5. Integração na `main` com a esteira verde.

Os dados mostram até onde o fluxo foi seguido. Dos 84 pull requests abertos, 77 foram integrados e 7 fechados sem integração; a mediana entre abrir e integrar foi de 1 hora. Apenas 19 dos 84 têm revisão registrada no GitHub. A revisão por outra pessoa, prevista no processo, não ficou registrada na maior parte dos casos, e tratamos isso como lacuna de processo, não como prática cumprida.

O funcionamento da esteira, os tempos de cada etapa e os resultados dos testes estão na seção 24.
