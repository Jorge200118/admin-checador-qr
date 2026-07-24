# -*- coding: utf-8 -*-
"""
Construye plantilla-contrato.docx a partir del .docx de ejemplo,
insertando marcadores {token} de docxtemplater.

Uso:
    python scripts/construir_plantilla.py "D:/USUARIO/Downloads/CAP-ISIS EVARISTO RAMIREZ.docx"
La salida se escribe en ./plantilla-contrato.docx
"""
import sys, os, zipfile, shutil
import docx
from docx.oxml.ns import qn

# (literal, reemplazo). Orden: específicos primero.
REEMPLAZOS = [
    ("Isis Valeria Evaristo Ramírez", "{nombre_completo}"),
    ("35200633903", "{nss}"),
    ("EARI060706MBSVMSA9", "{curp}"),
    ("EARI060706PD4", "{rfc}"),
    ("19 años de edad", "{edad} años de edad"),
    ("estado Civil Soltera", "estado Civil {estado_civil}"),
    ("Nacionalidad Mexicana", "Nacionalidad {nacionalidad}"),
    ("calle isla guyana manazana 1 Locc. islas turcas.  CP 23477. Cabos San Lucas, BCS.", "{domicilio}"),
    ("26 de enero del 2026", "{fecha_ingreso}"),
    ("26 de enero de 2026", "{fecha_ingreso}"),
    ("26 de marzo del 2026", "{fecha_fin_prueba}"),
    ("26 marzo del 2026", "{fecha_fin_prueba}"),
    ("9,451.20", "{salario_monto}"),
    ("Nueve Mil Cuatrocientos Cincuenta y uno pesos 20/100 M.N.", "{salario_letra}"),
    ("C. PADRE NICOLAS TAMARAL, NUM. 3447, COL LAS PALMAS, CP 23477, CSL, BCS.", "{sitio_trabajo}"),
    ("Los Cabos San Lucas, BCS", "{ciudad_firma}"),
    ("Cajera", "{puesto}"),
    ("cajera", "{puesto}"),
    # Esmeralda solo aparece una vez, como testigo 2 -> reemplazo directo.
    ("Esmeralda Flores López", "{testigo_2}"),
    # OJO: "Guillermo Corrales Cruz" aparece 3 veces con roles DISTINTOS, por eso no
    # se puede reemplazar en bloque aquí; se resuelve en reemplazar_guillermo().
]

# Textos de las 7 actividades del Anexo "A" del ejemplo (para localizar los párrafos)
ACTIVIDADES_EJEMPLO_PREFIX = [
    "Atender el pago de facturas",
    "Elaborar los depósitos de contado",
    "Pasar al Departamento de Cartera",
    "Elaborar la póliza de ingresos",
    "Revisar la facturación en tránsito",
    "De ser necesario, serán capacitados",
    "Tener la disposición de realizar",
]

FOLIOS = ["24193582550", "2419355080"]  # se blanquean vía XML crudo (están en textboxes)

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"

def runs_de(p):
    """Lista de elementos <w:r> con <w:t> del párrafo, en orden."""
    return p.findall(qn('w:r'))

def texto_de_run(r):
    t = r.find(qn('w:t'))
    return t.text if t is not None and t.text else ""

def set_texto_run(r, txt):
    t = r.find(qn('w:t'))
    if t is None:
        t = r.makeelement(qn('w:t'), {})
        r.append(t)
    t.set(qn('xml:space'), 'preserve')
    t.text = txt

def reemplazar_en_parrafo(p, literal, token):
    """Reemplaza TODAS las apariciones de `literal` en el texto concatenado del
    párrafo, mapeando de vuelta a los runs. Preserva el formato del run inicial."""
    runs = [r for r in runs_de(p) if r.find(qn('w:t')) is not None]
    if not runs:
        return 0
    textos = [texto_de_run(r) for r in runs]
    full = "".join(textos)
    if literal not in full:
        return 0
    cambios = 0
    while literal in full:
        start = full.index(literal)
        end = start + len(literal)
        # localizar runs por offset acumulado
        acc = 0
        run_start = run_end = None
        off_start = off_end = 0
        for i, txt in enumerate(textos):
            ini, fin = acc, acc + len(txt)
            if run_start is None and ini <= start < fin:
                run_start, off_start = i, start - ini
            if ini < end <= fin:
                run_end, off_end = i, end - ini
                break
            acc = fin
        # construir texto nuevo: prefijo del run_start + token + sufijo del run_end
        prefijo = textos[run_start][:off_start]
        sufijo = textos[run_end][off_end:]
        set_texto_run(runs[run_start], prefijo + token + sufijo)
        # vaciar runs intermedios y el run_end (si distinto del start)
        for j in range(run_start + 1, run_end + 1):
            set_texto_run(runs[j], "")
        # recomputar
        textos = [texto_de_run(r) for r in runs]
        full = "".join(textos)
        cambios += 1
    return cambios

def iter_roots(doc):
    """Raíces XML a procesar: cuerpo + headers/footers (donde también hay datos)."""
    roots = [doc.element.body]
    for rel in doc.part.rels.values():
        if rel.is_external:
            continue
        rt = rel.reltype
        if rt.endswith('/header') or rt.endswith('/footer'):
            roots.append(rel.target_part.element)
    return roots

def iter_parrafos(doc):
    """Todos los <w:p> del documento: cuerpo, tablas, textboxes, headers y footers."""
    for root in iter_roots(doc):
        for p in root.iter(qn('w:p')):
            yield p

def convertir_actividades(doc):
    """Convierte los 7 párrafos de actividades en un bucle de párrafo docxtemplater:
    [A]={#actividades} (sin viñeta) · [B]={.} (con viñeta) · [C]={/actividades} (sin viñeta)."""
    from docx.text.paragraph import Paragraph
    paras = [Paragraph(p, None) for p in doc.element.body.iter(qn('w:p'))]
    # localizar los 7 por prefijo
    idxs = []
    for pref in ACTIVIDADES_EJEMPLO_PREFIX:
        for k, pr in enumerate(paras):
            if pr.text.strip().startswith(pref) and k not in idxs:
                idxs.append(k); break
    assert len(idxs) == 7, f"Se esperaban 7 actividades, encontradas {len(idxs)}"
    idxs.sort()
    p_open  = paras[idxs[0]]   # -> {#actividades}, sin numPr
    p_item  = paras[idxs[1]]   # -> {.}, conserva numPr (viñeta)
    p_close = paras[idxs[2]]   # -> {/actividades}, sin numPr
    def quitar_numpr(pr):
        ppr = pr._p.find(qn('w:pPr'))
        if ppr is not None:
            npr = ppr.find(qn('w:numPr'))
            if npr is not None:
                ppr.remove(npr)
    def set_texto(pr, txt):
        pr.clear()
        pr.add_run(txt)
    set_texto(p_open, "{#actividades}");  quitar_numpr(p_open)
    set_texto(p_item, "{.}")  # conserva viñeta
    set_texto(p_close, "{/actividades}"); quitar_numpr(p_close)
    # eliminar los 4 párrafos restantes
    for k in idxs[3:]:
        el = paras[k]._p
        el.getparent().remove(el)

def blanquear_folios(ruta_docx):
    """Reemplaza los folios (en textboxes) por vacío, a nivel de XML crudo en todas
    las partes word/*.xml (document, headers, footers)."""
    tmp = ruta_docx + ".tmp"
    with zipfile.ZipFile(ruta_docx, 'r') as zin:
        names = zin.namelist()
        data = {n: zin.read(n) for n in names}
    for n in names:
        if n.startswith('word/') and n.endswith('.xml'):
            xml = data[n].decode('utf-8')
            for f in FOLIOS:
                xml = xml.replace(f, "")
            data[n] = xml.encode('utf-8')
    with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as zout:
        for n in names:
            zout.writestr(n, data[n])
    os.replace(tmp, ruta_docx)

# "Guillermo Corrales Cruz" aparece 3 veces, cada una con un rol distinto:
#   1) firma de TESTIGO en el contrato               -> {testigo_1}
#   2) firma "Por los Trabajadores" (Comision Mixta) -> {encargado_sucursal}
#   3) destinatario del AVISO DE RESULTADO           -> {encargado_sucursal}
# Se distinguen por el texto que acompana a cada parrafo.
def reemplazar_guillermo(doc):
    NOMBRE = "Guillermo Corrales Cruz"
    hechos = {"testigo_1": 0, "encargado_sucursal": 0}
    paras = list(iter_parrafos(doc))

    def texto_parrafo(p):
        return "".join(texto_de_run(r) for r in runs_de(p)
                       if r.find(qn('w:t')) is not None)

    for i, p in enumerate(paras):
        full = texto_parrafo(p)
        if NOMBRE not in full:
            continue
        # Contexto = el propio parrafo + los 2 siguientes, porque en el aviso de
        # resultado el titulo "Encargado de Sucursal" va en el parrafo de ABAJO.
        contexto = full + " " + " ".join(texto_parrafo(q) for q in paras[i + 1:i + 3])
        es_encargado = ("Fernando Olais Godoy" in full) or ("Encargado de Sucursal" in contexto)
        rol = "encargado_sucursal" if es_encargado else "testigo_1"
        hechos[rol] += reemplazar_en_parrafo(p, NOMBRE, "{" + rol + "}")
    return hechos


def main():
    origen = sys.argv[1] if len(sys.argv) > 1 else r"D:\USUARIO\Downloads\CAP-ISIS EVARISTO RAMIREZ.docx"
    salida = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "plantilla-contrato.docx")
    doc = docx.Document(origen)
    # 1) actividades -> bucle (antes de tokenizar "Cajera" que aparece dentro)
    convertir_actividades(doc)
    # 2) reemplazos literales sobre todos los párrafos
    total = {}
    for literal, token in REEMPLAZOS:
        n = 0
        for p in iter_parrafos(doc):
            n += reemplazar_en_parrafo(p, literal, token)
        total[literal] = n
    # 2b) testigos/encargado: mismo nombre, roles distintos -> por contexto
    g = reemplazar_guillermo(doc)
    doc.save(salida)
    # 3) blanquear folios (textboxes) a nivel XML
    blanquear_folios(salida)
    print("Plantilla generada en:", salida)
    for lit, n in total.items():
        print(f"  {n:>3}x  {lit[:50]}")
    for rol, n in g.items():
        print(f"  {n:>3}x  Guillermo Corrales Cruz -> {{{rol}}}")

if __name__ == "__main__":
    main()
