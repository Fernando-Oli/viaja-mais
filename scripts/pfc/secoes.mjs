/**
 * Mapa das seções do Documento de Especificação — fonte única.
 *
 * A ordem aqui é a ordem do sumário do template e a ordem em que `pfc:build`
 * concatena os arquivos. `obrigatoria` marca o que precisa estar preenchido na
 * entrega do 7º período, Fase 02 (as seções 26 e 27 são do 8º).
 */
export const SECOES = [
  { n: "00",   titulo: "Histórico de Versão do Projeto",              arquivo: "00-historico-versao.md",                             obrigatoria: true },

  { n: "1",    titulo: "Identificação do Produto",                    arquivo: "01-identificacao/1-produto.md",                      obrigatoria: true },
  { n: "2",    titulo: "Descrição Geral do Produto",                  arquivo: "01-identificacao/2-descricao.md",                    obrigatoria: true },
  { n: "3",    titulo: "Equipe do Projeto",                           arquivo: "01-identificacao/3-equipe.md",                       obrigatoria: true },
  { n: "4",    titulo: "Repositórios e Artefatos",                    arquivo: "01-identificacao/4-repositorios.md",                 obrigatoria: true },

  { n: "5",    titulo: "Situação Atual do Projeto",                   arquivo: "02-planejamento/5-situacao-atual.md",                obrigatoria: true },
  { n: "6",    titulo: "Objetivos do Semestre",                       arquivo: "02-planejamento/6-objetivos.md",                     obrigatoria: true },
  { n: "7",    titulo: "Cronograma do Semestre",                      arquivo: "02-planejamento/7-cronograma.md",                    obrigatoria: true },

  { n: "8",    titulo: "Público-Alvo do Produto",                     arquivo: "03-publico/8-publico-alvo.md",                       obrigatoria: true },
  { n: "9",    titulo: "Contexto de Negócio",                         arquivo: "03-publico/9-contexto-negocio.md",                   obrigatoria: true },
  { n: "10",   titulo: "Soluções Existentes",                         arquivo: "03-publico/10-solucoes-existentes.md",               obrigatoria: true },
  { n: "11",   titulo: "Pesquisa com Usuários",                       arquivo: "03-publico/11-pesquisa-usuarios.md",                 obrigatoria: true },
  { n: "12",   titulo: "Resultados de Pesquisa com Usuário",          arquivo: "03-publico/12-resultados-pesquisa.md",               obrigatoria: true },
  { n: "13",   titulo: "Regras de Negócio",                           arquivo: "03-publico/13-regras-negocio.md",                    obrigatoria: true },
  { n: "14",   titulo: "Requisitos Funcionais",                       arquivo: "03-publico/14-requisitos-funcionais.md",             obrigatoria: true },
  { n: "15",   titulo: "Requisitos Não Funcionais",                   arquivo: "03-publico/15-requisitos-nao-funcionais.md",         obrigatoria: true },

  { n: "16",   titulo: "Design da Solução e Experiência do Usuário",  arquivo: "04-design/16-design-solucao.md",                     obrigatoria: true },
  { n: "17",   titulo: "Gestão do Projeto e Modelagem do Sistema",    arquivo: "04-design/17-gestao-modelagem.md",                   obrigatoria: true },
  { n: "18",   titulo: "Dados e Modelagem da Informação",             arquivo: "04-design/18-dados-modelagem.md",                    obrigatoria: true },
  { n: "19",   titulo: "Solução Tecnológica e Experimentação",        arquivo: "04-design/19-solucao-tecnologica.md",                obrigatoria: true },

  { n: "20",   titulo: "Arquitetura Geral do Sistema",                arquivo: "05-arquitetura/20-arquitetura-geral.md",             obrigatoria: true },
  { n: "21",   titulo: "Tecnologias e Ferramentas do Projeto",        arquivo: "05-arquitetura/21-tecnologias.md",                   obrigatoria: true },
  { n: "22",   titulo: "Implementação por Camadas do Sistema",        arquivo: "05-arquitetura/22-implementacao.md",                 obrigatoria: true },
  { n: "23",   titulo: "Organização do Código e Repositório",         arquivo: "05-arquitetura/23-organizacao-codigo.md",            obrigatoria: true },

  { n: "24",   titulo: "Qualidade do Software e Testes",              arquivo: "06-qualidade/24-qualidade-testes.md",                obrigatoria: true },
  { n: "25",   titulo: "Segurança da Informação",                     arquivo: "06-qualidade/25-seguranca.md",                       obrigatoria: true },
  { n: "26",   titulo: "Extensões e Tecnologias Complementares",      arquivo: "06-qualidade/26-extensoes.md",                       obrigatoria: false },
  { n: "27",   titulo: "Avaliação Geral do Projeto Integrador",       arquivo: "06-qualidade/27-avaliacao-geral.md",                 obrigatoria: false },
]

/**
 * Fragmentos que denunciam texto orientador do template esquecido no documento.
 * O template manda removê-los na versão final e é a primeira coisa que o
 * avaliador nota.
 */
export const TEXTO_ORIENTADOR = [
  "Inserir aqui",
  "Informe o tipo do artefato",
  "Nome completo Aluno",
  "Informe Matrícula",
  "Orientações:",
  "Extensão sugerida",
  "Criação obrigatória:",
  "inserir identificação padronizada",
  "Apresentar aqui todo o detalhamento",
  "Nome do Seu Projeto",
]

export const RAIZ_PFC = "docs/pfc"
