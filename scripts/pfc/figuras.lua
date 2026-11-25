-- Filtro do pandoc usado pelo `pfc:build`: figura no padrão da NBR 14724.
--
-- O pandoc escreve a legenda embaixo da imagem. A norma pede a identificação
-- ("Figura 16.1 — ...") acima da ilustração e, abaixo dela, a fonte, que é
-- obrigatória mesmo quando a figura é produção dos próprios autores, como todas
-- as deste documento. Os estilos dos três parágrafos vêm do molde
-- (scripts/pfc/reference-docx.py): a legenda e a imagem ficam presas ao
-- parágrafo seguinte, para não se separarem na quebra de página.

local FONTE = "Fonte: elaborado pelos autores (2026)."

local function estilo(nome, blocos)
  return pandoc.Div(blocos, { ["custom-style"] = nome })
end

function Figure(figura)
  return {
    estilo("Image Caption", { pandoc.Para(pandoc.utils.blocks_to_inlines(figura.caption.long)) }),
    estilo("Captioned Figure", figura.content),
    estilo("Fonte", { pandoc.Para(FONTE) }),
  }
end
