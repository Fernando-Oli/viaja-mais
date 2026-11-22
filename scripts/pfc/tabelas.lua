-- Filtro do pandoc usado pelo `pfc:build`.
--
-- Tabela em Markdown não carrega largura de coluna, e o pandoc então divide a
-- página em colunas iguais: "ID" ganha o mesmo espaço que "Descrição" e o texto
-- quebra a cada duas palavras. Aqui a largura de cada coluna passa a ser
-- proporcional ao seu conteúdo, e a tabela ocupa a largura inteira da página.

local stringify = pandoc.utils.stringify

local MINIMO = 12  -- coluna curta ("ID", "Fase") não encolhe abaixo disto
local MAXIMO = 55  -- coluna de texto longo não espreme as demais

local function medir(celula, pesos, i)
  local texto = stringify(celula.contents)
  local comprimento = utf8.len(texto) or #texto
  -- Uma palavra não quebra: a coluna precisa caber a maior delas.
  local palavra = 0
  for p in texto:gmatch("[^%s/]+") do
    palavra = math.max(palavra, utf8.len(p) or #p)
  end
  local peso = math.max(math.min(comprimento, MAXIMO), math.min(palavra + 6, 36), MINIMO)
  pesos[i] = math.max(pesos[i] or 0, peso)
end

local function percorrer(linhas, pesos)
  for _, linha in ipairs(linhas) do
    for i, celula in ipairs(linha.cells) do
      medir(celula, pesos, i)
    end
  end
end

function Table(tabela)
  local pesos = {}
  percorrer(tabela.head.rows, pesos)
  for _, corpo in ipairs(tabela.bodies) do
    percorrer(corpo.head, pesos)
    percorrer(corpo.body, pesos)
  end

  local total = 0
  for _, p in ipairs(pesos) do
    total = total + p
  end
  if total == 0 then
    return nil
  end

  for i, especificacao in ipairs(tabela.colspecs) do
    especificacao[2] = (pesos[i] or MINIMO) / total
  end
  return tabela
end
