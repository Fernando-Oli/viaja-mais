# Regras do documento, por seção

Extraído do *Documento de Especificação do Projeto Integrador* (template v1.7) e
do *Orientações Gerais — Entregas*. É a referência que a skill `/pfc-secao` carrega
antes de escrever qualquer seção, e o que o `npm run pfc:check` valida.

## O que vale para o documento inteiro

- **Entrega única em 01/12/2026, em PDF, pelo AVA.** Um integrante envia pelo
  grupo. **Não há reenvio depois do prazo** e a ausência de envio zera a nota da
  entrega.
- **Os textos orientadores devem ser removidos.** O template traz instruções em
  vermelho ("Inserir aqui…", "Orientações:", "Extensão sugerida:"). Nenhuma pode
  sobrar na versão final — é a primeira coisa que o avaliador percebe.
- **Respeite a extensão pedida.** O template especifica em linhas. Texto acima do
  limite perde ponto tanto quanto texto abaixo.
- **Todo diagrama é explicado no texto.** O template é explícito: "não basta
  inserir a imagem". Diga o que cada parte representa e por que a estrutura é essa.
- Registro: português formal, primeira pessoa do plural. Sem emoji, sem marketing.

## Nosso período: 7º, Fase 02

Criadas pela primeira vez nesta entrega:

| Seção | O que o avaliador observa |
|---|---|
| **24 — Qualidade do Software e Testes** | Existência e coerência das estratégias de teste; **relação entre testes, requisitos e funcionalidades**; maturidade da análise crítica |
| **25 — Segurança da Informação** | Riscos identificados, vulnerabilidades potenciais e medidas de mitigação, coerentes com o tipo de sistema |

Obrigatoriamente atualizadas: **22** (Implementação), **20** (Arquitetura),
**Parte 02** (Planejamento) e **Parte 00** (Histórico de Versão).

As seções **26** (Extensões) e **27** (Avaliação Geral) são do 8º período. Como o
projeto terá IA de roteiros e rede social, a 26 pode ser antecipada; a 27 fica
marcada como não aplicável a este período.

## Seção a seção

| # | Seção | Extensão | Formato |
|---|---|---|---|
| 00 | Histórico de Versão | tabela | Versão · Período · Fase · Data · Descrição. Atualizada em **toda** entrega |
| 1 | Identificação do Produto | 5–10 linhas, **parágrafo único** | Responder "o que é?", "para quem é?", "para que serve?". Evitar "sistema"/"plataforma" sem explicar |
| 2.1 | Resumo do Negócio | 5–8 linhas | Contexto do domínio, para quem não o conhece |
| 2.2 | Problemas Identificados | ~10–15 linhas no total | Uma tabela por problema: *O problema de* · *Afeta* · *Cujo impacto é* · *Benefícios de uma solução seriam* |
| 3 | Equipe | tabela | Matrícula · Nome completo conforme Lyceum · Função. Inclui orientadores |
| 4 | Repositórios e Artefatos | tabela | Tipo · Link **público** · Descrição |
| 5 | Situação Atual | 10–15 linhas | O que existe e o que ainda não. **Não é para "vender" o projeto** |
| 6 | Objetivos do Semestre | 10–15 linhas | Com justificativa da escolha e viabilidade |
| 7 | Cronograma | tabela + 5–8 linhas | Etapas, ordem e o que se espera de cada fase |
| 8 | Público-alvo | 10–15 linhas | Perfis, contextos de uso, diferenças entre tipos de usuário |
| 9 | Contexto de Negócio | 12–18 linhas | Processos, dificuldades, oportunidades |
| 10 | Soluções Existentes | 8–12 linhas | Comparação crítica, com limitações |
| 11 | Pesquisa com Usuários | — | Como o usuário foi ouvido, de forma estruturada |
| 12 | Resultados da Pesquisa | — | Tabelas simples; ligação com os requisitos |
| 13 | Regras de Negócio | tabela por regra | `RNE-001` · Descrição · Requisitos relacionados + `Detalhamento:` |
| 14 | Requisitos Funcionais | tabela por requisito | `RF-001` · Descrição · Status · Prioridade + `Detalhamento:` |
| 15 | Requisitos Não Funcionais | tabela por requisito | `RNF-001` · idem |
| 16.1 | Fluxo de Navegação | — | Caminho principal do usuário, da entrada às funcionalidades |
| 16.2 | Protótipos | — | Protótipo navegável, alinhado aos requisitos funcionais |
| 17.1 | Organização do Projeto | — | Como o grupo divide tarefas e acompanha progresso |
| 17.2 | Modelagem e Diagramas | — | Casos de uso, fluxos, classes — **explicados no texto** |
| 18.1 | Modelo de Dados | — | Diagrama + decisões tomadas |
| 18.2 | Estrutura e Manipulação | — | Como os dados são armazenados e usados |
| 19.1 | Escolhas Tecnológicas | — | Justificadas pelo contexto, **não por preferência pessoal** |
| 19.2 | Experimentação Técnica | — | Provas de conceito e aprendizado prático |
| 20 | Arquitetura Geral | — | Divisão em camadas/módulos + diagramas explicados |
| 21 | Tecnologias e Ferramentas | — | Justificadas. No 7º período, escolhas consolidadas e integradas |
| 22.1 | Frontend | — | Organização das telas, estrutura do código, relação com os RFs |
| 22.2 | Backend | — | Serviços, regras de negócio, acesso a dados |
| 22.3 | Integração | — | **Peso maior no 7º período**: fluxo do usuário até o dado |
| 23 | Organização do Código | — | Estrutura de pastas, separação de responsabilidades, padrões |
| 24 | Qualidade e Testes | — | Tipos de teste, resultados, ligação com as funcionalidades |
| 25 | Segurança da Informação | — | Autenticação, controle de acesso, proteção de dados, riscos |
| 26 | Extensões Tecnológicas | — | Se não houver: declarar "não aplicável" com justificativa |
| 27 | Avaliação Geral | — | 8º período. Aprendizados, dificuldades, limitações |

## A regra que mais importa aqui

**Só escreva o que dá para provar no repositório.**

A documentação herdada (`docs/ARCHITECTURE.md`, `README.md`, `SECURITY.md`) afirma
coisas falsas: cita SWR, Supabase Storage, Realtime, Jest e Bun, nenhum deles
presente; declara RLS habilitada sem policy versionada; lista funcionalidades de
editar e excluir que não têm tela. Reproduzir isso é o pior erro possível, porque
o avaliador vai ao repositório.

Divergência entre documentação antiga e código: **o código vence**, e a correção
entra na Parte 00.
