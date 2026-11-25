"""Gera docs/pfc/_template/reference.docx, o molde de formatação do `pfc:build`.

Parte do template oficial da disciplina (docs/Documento de Especificação do
Projeto Integrador.docx), de onde vêm o cabeçalho com os logos, o rodapé e as
margens, e acrescenta os estilos que o pandoc procura pelo nome ("Body Text",
"Heading 1", "Table"...). O corpo do template é descartado: o conteúdo vem das
seções em Markdown.

Só precisa ser rodado de novo se a universidade trocar o template:

    python scripts/pfc/reference-docx.py

Requer python-docx. O resultado é versionado, então quem só monta o documento
não precisa de Python.
"""
import copy
import sys
from pathlib import Path

import docx
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls, qn
from docx.shared import Pt, RGBColor

RAIZ = Path(__file__).resolve().parents[2]
TEMPLATE = RAIZ / "docs" / "Documento de Especificação do Projeto Integrador.docx"
DESTINO = RAIZ / "docs" / "pfc" / "_template" / "reference.docx"

FONTE = "Calibri"
TINTA = RGBColor(0x1F, 0x2A, 0x37)

doc = docx.Document(str(TEMPLATE))

# Corpo vazio: fica só o sectPr, que carrega margens, cabeçalho e rodapé.
corpo = doc.element.body
for el in list(corpo):
    if el.tag != qn("w:sectPr"):
        corpo.remove(el)

# No cabeçalho do template, a caixa do endereço (no pé da página) pede que o
# texto a contorne, e a marca-d'água fica à frente do texto. No LibreOffice,
# que gera o PDF, isso faz toda tabela que atravessa uma página perder as
# linhas seguintes. Todas as imagens do cabeçalho passam a ficar atrás do
# texto e sem contorno.
WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
for secao in doc.sections:
    for ancora in secao.header._element.iter(f"{{{WP}}}anchor"):
        ancora.set("behindDoc", "1")
        for filho in list(ancora):
            nome = filho.tag.split("}")[1]
            if nome.startswith("wrap") and nome != "wrapNone":
                ancora.replace(filho, parse_xml(f'<wp:wrapNone xmlns:wp="{WP}"/>'))

# Número de página. A NBR 14724 o põe no canto superior direito, que no template
# é do logo do curso; ele fica logo abaixo do logo. A capa não é numerada: a
# seção ganha cabeçalho e rodapé de primeira página, cópias dos comuns, e o
# número entra só no cabeçalho comum.
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def copiar(origem, destino):
    """Copia o conteúdo de um cabeçalho ou rodapé, com as imagens que ele usa."""
    destino.is_linked_to_previous = False
    alvo = destino._element
    for filho in list(alvo):
        alvo.remove(filho)
    for filho in origem._element:
        alvo.append(copy.deepcopy(filho))
    # Id de desenho repetido no documento faz o Word acusar conteúdo ilegível.
    for desenho in alvo.iter(f"{{{WP}}}docPr"):
        desenho.set("id", str(int(desenho.get("id")) + 1000))
    # As imagens são referenciadas por id de relação, que é de cada parte.
    novos = {}
    for el in alvo.iter():
        for atributo, valor in list(el.attrib.items()):
            if not atributo.startswith(f"{{{R}}}"):
                continue
            if valor not in novos:
                rel = origem.part.rels[valor]
                alvo_rel = rel.target_ref if rel.is_external else rel.target_part
                novos[valor] = destino.part.relate_to(alvo_rel, rel.reltype, rel.is_external)
            el.set(atributo, novos[valor])


secao = doc.sections[0]
secao.different_first_page_header_footer = True
copiar(secao.header, secao.first_page_header)
copiar(secao.footer, secao.first_page_footer)

# O número vai numa caixa de texto ancorada, posicionada pela página como os
# logos, e não num parágrafo novo do cabeçalho: parágrafo (mesmo em quadro, com
# w:framePr) aumenta o cabeçalho no LibreOffice e empurra o texto de todas as
# páginas. A caixa fica alinhada à margem direita, com o topo a 2,8 cm da borda:
# entre o fim do logo (2,6 cm) e a primeira linha do texto (3,5 cm).
EMU_CM = 360000
WPS = "http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
proximo_id = 1 + max(int(d.get("id")) for parte in (secao.header, secao.footer, secao.first_page_header,
                                                     secao.first_page_footer)
                     for d in parte._element.iter(f"{{{WP}}}docPr"))
FONTE_NUMERO = '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="20"/></w:rPr>'
numero = parse_xml(f"""
<w:r {nsdecls('w', 'wp', 'a')} xmlns:wps="{WPS}">
  <w:drawing>
    <wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="251900000" behindDoc="0"
               locked="0" layoutInCell="1" allowOverlap="1">
      <wp:simplePos x="0" y="0"/>
      <wp:positionH relativeFrom="margin"><wp:align>right</wp:align></wp:positionH>
      <wp:positionV relativeFrom="page"><wp:posOffset>{int(2.8 * EMU_CM)}</wp:posOffset></wp:positionV>
      <wp:extent cx="{int(1.5 * EMU_CM)}" cy="{int(0.55 * EMU_CM)}"/>
      <wp:effectExtent l="0" t="0" r="0" b="0"/>
      <wp:wrapNone/>
      <wp:docPr id="{proximo_id}" name="Numero de pagina"/>
      <wp:cNvGraphicFramePr/>
      <a:graphic>
        <a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
          <wps:wsp>
            <wps:cNvSpPr txBox="1"/>
            <wps:spPr>
              <a:xfrm><a:off x="0" y="0"/><a:ext cx="{int(1.5 * EMU_CM)}" cy="{int(0.55 * EMU_CM)}"/></a:xfrm>
              <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
              <a:noFill/>
              <a:ln><a:noFill/></a:ln>
            </wps:spPr>
            <wps:txbx>
              <w:txbxContent>
                <w:p>
                  <w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="right"/></w:pPr>
                  <w:r>{FONTE_NUMERO}<w:fldChar w:fldCharType="begin"/></w:r>
                  <w:r>{FONTE_NUMERO}<w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>
                  <w:r>{FONTE_NUMERO}<w:fldChar w:fldCharType="separate"/></w:r>
                  <w:r>{FONTE_NUMERO}<w:t>2</w:t></w:r>
                  <w:r>{FONTE_NUMERO}<w:fldChar w:fldCharType="end"/></w:r>
                </w:p>
              </w:txbxContent>
            </wps:txbx>
            <wps:bodyPr rot="0" vert="horz" wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t" anchorCtr="0">
              <a:noAutofit/>
            </wps:bodyPr>
          </wps:wsp>
        </a:graphicData>
      </a:graphic>
    </wp:anchor>
  </w:drawing>
</w:r>""")
# No primeiro parágrafo do cabeçalho, onde já estão os logos.
secao.header._element.find(qn("w:p")).append(numero)

# O "Normal" do template vem preso a uma lista numerada; herdada pelos estilos
# novos, ela numeraria todo parágrafo do documento.
normal = doc.styles["Normal"]
ppr = normal.element.find(qn("w:pPr"))
if ppr is not None:
    for num in ppr.findall(qn("w:numPr")):
        ppr.remove(num)
normal.font.name = FONTE
normal.font.size = Pt(11)


def estilo(nome, base="Normal", tamanho=11, negrito=False, italico=False, alinhamento=None,
           antes=0, depois=6, entrelinha=1.15, cor=None, fonte=FONTE, com_proximo=False,
           maiusculas=False, quebra_antes=False):
    """Cria (ou redefine) um estilo de parágrafo com formatação explícita."""
    try:
        s = doc.styles[nome]
    except KeyError:
        s = doc.styles.add_style(nome, WD_STYLE_TYPE.PARAGRAPH)
    s.base_style = doc.styles[base] if base else None
    s.quick_style = True
    p = s.element.find(qn("w:pPr"))
    if p is not None:
        for num in p.findall(qn("w:numPr")):
            p.remove(num)
    s.font.name = fonte
    fontes = s.element.rPr.rFonts
    fontes.set(qn("w:eastAsia"), fonte)
    fontes.set(qn("w:cs"), fonte)
    # Atributo de tema vence o nome da fonte; sem removê-lo o título sai em Cambria.
    for tema in ("asciiTheme", "hAnsiTheme", "eastAsiaTheme", "cstheme"):
        fontes.attrib.pop(qn(f"w:{tema}"), None)
    s.font.size = Pt(tamanho)
    s.font.bold = negrito
    s.font.italic = italico
    s.font.all_caps = maiusculas
    s.font.color.rgb = cor or RGBColor(0, 0, 0)
    f = s.paragraph_format
    f.alignment = alinhamento
    f.space_before = Pt(antes)
    f.space_after = Pt(depois)
    f.line_spacing = entrelinha
    f.keep_with_next = com_proximo
    f.page_break_before = quebra_antes
    f.left_indent = Pt(0)
    f.right_indent = Pt(0)
    f.first_line_indent = Pt(0)
    return s


J = WD_ALIGN_PARAGRAPH.JUSTIFY
C = WD_ALIGN_PARAGRAPH.CENTER
E = WD_ALIGN_PARAGRAPH.LEFT

# Texto corrido. O pandoc usa "First Paragraph" logo depois de um título e
# "Body Text" nos demais; aqui os dois são iguais, de propósito.
estilo("Body Text", alinhamento=J)
estilo("First Paragraph", alinhamento=J)
# Lista de referências (NBR 6023): alinhada só à esquerda, espaço simples e uma
# linha em branco entre as entradas. Justificada, a URL longa abria buracos.
estilo("Referencia", alinhamento=E, depois=12, entrelinha=1.0)
# Usado pelo pandoc nas células de tabela e nas listas compactas.
estilo("Compact", tamanho=10, alinhamento=E, depois=2, entrelinha=1.1)
estilo("Block Text", alinhamento=J, italico=True)

# Títulos: "#" é a PARTE, "##" a seção numerada, "###" a subseção.
estilo("Heading 1", tamanho=13, negrito=True, alinhamento=E, antes=0, depois=14, cor=TINTA,
       com_proximo=True, maiusculas=True, quebra_antes=True)
estilo("Heading 2", tamanho=13, negrito=True, alinhamento=E, antes=18, depois=8, cor=TINTA,
       com_proximo=True, maiusculas=True)
estilo("Heading 3", tamanho=12, negrito=True, alinhamento=E, antes=14, depois=6, cor=TINTA, com_proximo=True)
estilo("Heading 4", tamanho=11, negrito=True, alinhamento=E, antes=10, depois=4, cor=TINTA, com_proximo=True)

# Figuras e código. A figura sai como legenda, imagem e fonte, nessa ordem (NBR
# 14724; quem reordena é scripts/pfc/figuras.lua), presas uma à outra para a
# legenda não ficar sozinha no pé da página.
estilo("Image Caption", tamanho=9, italico=True, alinhamento=C, antes=10, depois=4, com_proximo=True)
estilo("Captioned Figure", alinhamento=C, antes=0, depois=2, com_proximo=True)
estilo("Fonte", tamanho=9, alinhamento=C, depois=12)
estilo("Figure", alinhamento=C, antes=8, depois=2)
estilo("Table Caption", tamanho=9, italico=True, alinhamento=C, depois=4, com_proximo=True)
estilo("Source Code", tamanho=8.5, alinhamento=E, depois=0, entrelinha=1.0, fonte="Consolas")

# Capa.
estilo("Capa", tamanho=11, negrito=True, alinhamento=C, depois=10)
estilo("Capa Documento", tamanho=16, negrito=True, alinhamento=C, antes=48, depois=14)
estilo("Capa Projeto", tamanho=28, negrito=True, alinhamento=C, depois=36)
estilo("Capa Texto", tamanho=11, alinhamento=C, depois=8)

# Código em linha.
try:
    verbatim = doc.styles["Verbatim Char"]
except KeyError:
    verbatim = doc.styles.add_style("Verbatim Char", WD_STYLE_TYPE.CHARACTER)
verbatim.font.name = "Consolas"
verbatim.font.size = Pt(9.5)

# Tabela: cabeçalho sombreado em negrito e linhas finas. O pandoc aplica o estilo
# chamado "Table" a toda tabela. O fundo é claro porque o LibreOffice, usado para
# gerar o PDF, ignora a cor de texto do cabeçalho: texto escuro em fundo escuro
# ficava ilegível.
for s in list(doc.styles.element.findall(qn("w:style"))):
    if s.get(qn("w:styleId")) == "Table":
        doc.styles.element.remove(s)
CINZA = "BFC5CB"
doc.styles.element.append(parse_xml(f"""
<w:style {nsdecls('w')} w:type="table" w:styleId="Table">
  <w:name w:val="Table"/>
  <w:basedOn w:val="{doc.styles['Normal Table'].style_id}"/>
  <w:qFormat/>
  <w:pPr><w:spacing w:before="40" w:after="40" w:line="240" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr>
  <w:rPr><w:rFonts w:ascii="{FONTE}" w:hAnsi="{FONTE}"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>
  <w:tblPr>
    <w:tblInd w:w="0" w:type="dxa"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:space="0" w:color="{CINZA}"/>
      <w:left w:val="single" w:sz="4" w:space="0" w:color="{CINZA}"/>
      <w:bottom w:val="single" w:sz="4" w:space="0" w:color="{CINZA}"/>
      <w:right w:val="single" w:sz="4" w:space="0" w:color="{CINZA}"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="{CINZA}"/>
      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="{CINZA}"/>
    </w:tblBorders>
    <w:tblCellMar>
      <w:top w:w="40" w:type="dxa"/><w:left w:w="90" w:type="dxa"/>
      <w:bottom w:w="40" w:type="dxa"/><w:right w:w="90" w:type="dxa"/>
    </w:tblCellMar>
  </w:tblPr>
  <w:tblStylePr w:type="firstRow">
    <w:rPr><w:b/></w:rPr>
    <w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="DCE3EA"/></w:tcPr>
  </w:tblStylePr>
</w:style>"""))

DESTINO.parent.mkdir(parents=True, exist_ok=True)
doc.save(str(DESTINO))
print(f"Molde gravado em {DESTINO.relative_to(RAIZ)}")
