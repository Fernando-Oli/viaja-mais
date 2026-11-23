-- Filtro do pandoc usado pelo `pfc:build`.
--
-- Tabela em Markdown não carrega largura de coluna, e o pandoc então divide a
-- página em colunas iguais: "ID" ganha o mesmo espaço que "Descrição" e o texto
-- quebra a cada duas palavras.
--
-- A primeira versão deste filtro dava a cada coluna um peso proporcional ao
-- conteúdo. Não bastava: peso é relativo, e com a descrição pesando 55 a coluna
-- "Status" ficava com 2,4 cm, menos do que "Implementado" ocupa — o PDF saía com
-- "Implementad/o", "RNE-00/1" e datas partidas ao meio. Agora a conta é em
-- centímetros, em duas etapas:
--
--   1. cada coluna recebe a largura da maior palavra que contém, para que
--      nenhuma palavra quebre;
--   2. o que sobra da página vai para as colunas de texto longo, na proporção
--      do texto que ainda falta caber em uma linha.
--
-- Se nem as palavras cabem (tabelas de rotas, com identificadores longos de
-- código), encolhem só as colunas de palavra mais longa, e o build avisa.

local LARGURA = 15.75        -- cm úteis da página do template (11850 − 1218 − 1701 twips)
local RESPIRO = 0.32 + 0.15  -- margens da célula (90 twips de cada lado) e folga de arredondamento
local CM_CODIGO = 0.19       -- Consolas 9,5 pt, monoespaçada: 0,184 cm por caractere
local NEGRITO = 1.05         -- o cabeçalho sai em negrito, um pouco mais largo

-- Largura estimada de cada caractere em Calibri 10 pt, por classe, com folga.
local LARGOS = { m = 0.28, w = 0.25, M = 0.30, W = 0.32 }
local ESTREITOS = { i = 0.08, l = 0.08, j = 0.08, f = 0.11, t = 0.12, r = 0.13, I = 0.09, J = 0.12 }

local function cm_do_texto(texto)
  local total = 0
  for _, cp in utf8.codes(texto) do
    local c = utf8.char(cp)
    if LARGOS[c] then total = total + LARGOS[c]
    elseif ESTREITOS[c] then total = total + ESTREITOS[c]
    elseif c:match("^%l$") then total = total + 0.17
    elseif c:match("^%u$") then total = total + 0.21
    elseif c:match("^%d$") then total = total + 0.18
    elseif cp > 127 then total = total + 0.17   -- letra acentuada, quase sempre minúscula
    elseif c == " " then total = total + 0.08
    else total = total + 0.12 end               -- pontuação
  end
  return total
end

-- Pontos de quebra usados para medir a menor largura de cada coluna:
--   - depois de "-" seguido de letra ("change-|password"); seguido de algarismo
--     não quebra ("RNE-001"), e por isso esses casos precisam caber inteiros;
--   - depois de "/" seguido de letra: em código, porque o filtro põe ali um
--     ponto de quebra explícito (abaixo); em link, porque o LibreOffice quebra
--     URL na barra ("https://claude.ai/artifact/|5GGDo..."). Seguido de
--     algarismo não quebra: "26/08" fica inteiro.
local function segmentos(palavra)
  local partes, inicio = {}, 1
  for i = 1, #palavra - 1 do
    local c, prox = palavra:sub(i, i), palavra:sub(i + 1, i + 1)
    if (c == "-" or c == "/") and not prox:match("%d") then
      partes[#partes + 1] = palavra:sub(inicio, i)
      inicio = i + 1
    end
  end
  partes[#partes + 1] = palavra:sub(inicio)
  return partes
end

-- Texto dentro de célula ganha pontos de quebra explícitos, com espaço de
-- largura zero (invisível no PDF). Sem eles, o LibreOffice parte o identificador
-- onde a linha acaba ("formatoUsernameSch|ema", "/api/social/sol|icitacoes").
--   - depois de "/" seguido de letra: em toda célula, e entra na medida;
--   - entre minúscula e maiúscula e antes da extensão ("formatoUsername|Schema",
--     "acerto-contas|.spec.ts"): só nas tabelas que não cabem na página. Nas
--     outras, a quebra gulosa do LibreOffice usaria esses pontos sem precisar
--     ("--no|Emit"). Dentro de colchetes não entra, para não partir "[tripId]".
local ZWSP = utf8.char(0x200B)

local function pontos_de_quebra(texto, reserva)
  local saida, colchetes, ponto_usado, n = {}, 0, false, #texto
  for i = 1, n do
    local ant, c, prox = texto:sub(i - 1, i - 1), texto:sub(i, i), texto:sub(i + 1, i + 1)
    if c == "[" then colchetes = colchetes + 1 elseif c == "]" then colchetes = colchetes - 1 end
    if reserva and i > 1 and colchetes == 0 then
      local camelo = c:match("%u") and ant:match("%l")
      local extensao = c == "." and not ponto_usado and ant:match("%a") and prox:match("%a")
      if camelo or extensao then saida[#saida + 1] = ZWSP end
      if extensao then ponto_usado = true end
    end
    saida[#saida + 1] = c
    if c == "/" then
      ponto_usado = false
      if i < n and not prox:match("%d") then saida[#saida + 1] = ZWSP end
    end
  end
  return table.concat(saida)
end

local function largura(texto, cm_por_letra, fator)
  if cm_por_letra then return (utf8.len(texto) or #texto) * cm_por_letra end
  return cm_do_texto(texto) * fator
end

-- Mede uma célula: a maior palavra (que define a largura mínima) e o texto
-- inteiro numa linha (que define quanto a coluna ainda quer de espaço).
local function medir(celula, fator)
  local maior, linha = 0, 0
  local function trecho(texto, cm_por_letra)
    -- Espaço ASCII explícito: com locale do Windows, "%S" trata o byte 0xA0 como
    -- espaço e parte o "à" (C3 A0) ao meio. O espaço de largura zero também
    -- separa palavras, porque é ponto de quebra.
    for palavra in texto:gsub(ZWSP, " "):gmatch("[^ \t\n]+") do
      for _, seg in ipairs(segmentos(palavra)) do
        maior = math.max(maior, largura(seg, cm_por_letra, fator))
      end
    end
    linha = linha + largura(texto, cm_por_letra, fator) + 0.08
  end
  pandoc.walk_block(pandoc.Div(celula.contents), {
    Str = function(s) trecho(s.text) end,
    Code = function(c) trecho(c.text, CM_CODIGO) end,
  })
  return maior, linha
end

local function titulo_da_coluna(tabela, i)
  local primeira = tabela.head.rows[1]
  if primeira and primeira.cells[i] then return pandoc.utils.stringify(primeira.cells[i].contents) end
  return "coluna " .. i
end

function Table(tabela)
  local ncols = #tabela.colspecs
  local minimos, soma_linha, linhas = {}, {}, {}
  for i = 1, ncols do minimos[i], soma_linha[i], linhas[i] = 0, 0, 0 end

  local function percorrer(rows, fator, conta_media)
    for _, row in ipairs(rows) do
      for i, celula in ipairs(row.cells) do
        if i <= ncols then
          local maior, linha = medir(celula, fator)
          minimos[i] = math.max(minimos[i], maior + RESPIRO)
          if conta_media then
            soma_linha[i] = soma_linha[i] + linha
            linhas[i] = linhas[i] + 1
          end
        end
      end
    end
  end
  percorrer(tabela.head.rows, NEGRITO, false)
  for _, corpo in ipairs(tabela.bodies) do
    percorrer(corpo.head, 1, true)
    percorrer(corpo.body, 1, true)
  end

  local larguras, soma_min, transborda = {}, 0, false
  for i = 1, ncols do soma_min = soma_min + minimos[i] end

  if soma_min > LARGURA then
    transborda = true
    -- Teto comum para as colunas mais largas, até o total caber na página.
    local ordenados = {}
    for i = 1, ncols do ordenados[i] = minimos[i] end
    table.sort(ordenados)
    local restante, teto = LARGURA, LARGURA / ncols
    for k = 1, ncols do
      local t = restante / (ncols - k + 1)
      if ordenados[k] >= t then teto = t break end
      restante = restante - ordenados[k]
    end
    local afetadas = {}
    for i = 1, ncols do
      larguras[i] = math.min(minimos[i], teto)
      if minimos[i] > teto then afetadas[#afetadas + 1] = titulo_da_coluna(tabela, i) end
    end
    io.stderr:write("tabelas.lua: palavra longa demais para caber; pode quebrar na coluna "
      .. table.concat(afetadas, ", ") .. " da tabela que começa por \"" .. titulo_da_coluna(tabela, 1) .. "\"\n")
  else
    local sobra, desejos, falta, soma_falta, soma_desejo = LARGURA - soma_min, {}, {}, 0, 0
    for i = 1, ncols do
      local media = linhas[i] > 0 and soma_linha[i] / linhas[i] + RESPIRO or minimos[i]
      desejos[i] = math.max(minimos[i], media)
      falta[i] = desejos[i] - minimos[i]
      soma_falta = soma_falta + falta[i]
      soma_desejo = soma_desejo + desejos[i]
    end
    for i = 1, ncols do
      if soma_falta >= sobra then
        larguras[i] = minimos[i] + sobra * falta[i] / soma_falta
      else
        larguras[i] = desejos[i] + (sobra - soma_falta) * desejos[i] / soma_desejo
      end
    end
  end

  for i, especificacao in ipairs(tabela.colspecs) do
    especificacao[2] = larguras[i] / LARGURA
  end
  -- Os pontos de quebra entram depois da medida: a coluna é dimensionada para
  -- o identificador inteiro, e o ponto só é usado se ainda assim não couber.
  -- No texto comum entra só o ponto depois de "/": sem ele, o LibreOffice quebra
  -- URL na barra mas não "@supabase/supabase-js", e a medida acima conta com a
  -- quebra nos dois casos.
  return pandoc.walk_block(tabela, {
    Code = function(c)
      c.text = pontos_de_quebra(c.text, transborda)
      return c
    end,
    Str = function(s)
      s.text = pontos_de_quebra(s.text, false)
      return s
    end,
  })
end
