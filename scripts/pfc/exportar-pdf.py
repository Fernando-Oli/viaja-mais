"""Exporta o PDF do `pfc:build` pelo LibreOffice, com o sumário preenchido.

O pandoc grava o sumário como campo vazio, que o Word preenche ao abrir. O
`soffice --convert-to pdf` não atualiza o campo, e a página do sumário saía em
branco. Aqui o LibreOffice abre o DOCX por UNO, atualiza os índices e só então
exporta. A atualização roda duas vezes: na primeira o sumário passa de vazio a
algumas páginas e empurra o resto do documento; a segunda acerta os números.

Roda com o Python que acompanha o LibreOffice, o único que tem o módulo `uno`
no Windows. O `build.mjs` chama assim:

    <LibreOffice>/program/python.exe scripts/pfc/exportar-pdf.py <soffice> <docx> <pdf>

Usa um perfil temporário do LibreOffice, para não disputar o perfil com uma
janela do LibreOffice que esteja aberta.
"""
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path

import uno
from com.sun.star.beans import PropertyValue


def propriedade(nome, valor):
    p = PropertyValue()
    p.Name = nome
    p.Value = valor
    return p


soffice, docx, pdf = sys.argv[1], Path(sys.argv[2]).resolve(), Path(sys.argv[3]).resolve()
perfil = tempfile.mkdtemp(prefix="pfc-libreoffice-")
canal = f"pipe,name=pfc{uuid.uuid4().hex[:12]};urp;StarOffice.ComponentContext"

processo = subprocess.Popen(
    [soffice, "--headless", "--invisible", "--nologo", "--norestore", "--nodefault",
     f"-env:UserInstallation={uno.systemPathToFileUrl(perfil)}", f"--accept={canal}"],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
)
local = uno.getComponentContext()
resolvedor = local.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", local)
contexto = None
# A primeira abertura com perfil novo leva alguns segundos.
for _ in range(240):
    try:
        contexto = resolvedor.resolve(f"uno:{canal}")
        break
    except Exception:
        if processo.poll() is not None:
            sys.exit("exportar-pdf: o LibreOffice encerrou antes de aceitar a conexão")
        time.sleep(0.5)
if contexto is None:
    processo.kill()
    sys.exit("exportar-pdf: o LibreOffice não respondeu em 2 minutos")

desktop = contexto.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", contexto)
try:
    doc = desktop.loadComponentFromURL(uno.systemPathToFileUrl(str(docx)), "_blank", 0,
                                       (propriedade("Hidden", True),))
    # Linha de tabela não se parte entre páginas: sem isso, o fim de uma rota
    # longa ("…/post/" e "fotos") ficava sozinho no alto da página seguinte. O
    # pandoc não grava essa opção no DOCX, por isso ela é aplicada aqui.
    tabelas = doc.getTextTables()
    for t in range(tabelas.getCount()):
        linhas = tabelas.getByIndex(t).getRows()
        for i in range(linhas.getCount()):
            linhas.getByIndex(i).IsSplitAllowed = False
    indices = doc.getDocumentIndexes()
    total = indices.getCount()
    for _ in range(2):
        for i in range(total):
            indices.getByIndex(i).update()
    doc.storeToURL(uno.systemPathToFileUrl(str(pdf)), (propriedade("FilterName", "writer_pdf_Export"),))
    doc.close(True)
    if total == 0:
        print("exportar-pdf: aviso: o documento não tem sumário para atualizar")
finally:
    try:
        desktop.terminate()
    except Exception:
        pass  # a conexão cai junto com o LibreOffice, e a chamada acusa isso
    try:
        processo.wait(timeout=60)
    except subprocess.TimeoutExpired:
        processo.kill()
    shutil.rmtree(perfil, ignore_errors=True)
