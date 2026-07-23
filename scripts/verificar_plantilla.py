# -*- coding: utf-8 -*-
"""Valida plantilla-contrato.docx: tokens presentes y literales de Isis ausentes."""
import sys, os, zipfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLANTILLA = os.path.join(RAIZ, "plantilla-contrato.docx")

TOKENS_REQUERIDOS = [
    "{nombre_completo}", "{nss}", "{curp}", "{rfc}", "{edad}", "{estado_civil}",
    "{nacionalidad}", "{domicilio}", "{fecha_ingreso}", "{fecha_fin_prueba}",
    "{salario_monto}", "{salario_letra}", "{sitio_trabajo}", "{ciudad_firma}",
    "{puesto}", "{#actividades}", "{/actividades}", "{.}",
]

# literales que NO deben quedar (datos de Isis)
LITERALES_PROHIBIDOS = [
    "Evaristo", "35200633903", "EARI060706MBSVMSA9", "EARI060706PD4",
    "9,451.20", "Nueve Mil Cuatrocientos", "isla guyana", "PADRE NICOLAS",
    "24193582550", "2419355080", "Los Cabos San Lucas", "19 años de edad",
    "Soltera", "Nacionalidad Mexicana", "Cajera", "cajera",
]

def texto_documento():
    with zipfile.ZipFile(PLANTILLA) as z:
        return z.read("word/document.xml").decode("utf-8")

def main():
    if not os.path.exists(PLANTILLA):
        print("FAIL: no existe", PLANTILLA); sys.exit(1)
    xml = texto_documento()
    errores = []
    for tok in TOKENS_REQUERIDOS:
        if tok not in xml:
            errores.append(f"Falta token: {tok}")
    for lit in LITERALES_PROHIBIDOS:
        if lit in xml:
            errores.append(f"Literal de Isis no reemplazado: {lit!r}")
    if errores:
        print("FAIL:")
        for e in errores: print("  -", e)
        sys.exit(1)
    print("OK: plantilla válida (tokens presentes, sin literales de Isis)")

if __name__ == "__main__":
    main()
