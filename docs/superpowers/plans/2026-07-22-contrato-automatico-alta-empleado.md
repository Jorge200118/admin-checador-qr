# Contrato automático al alta de empleado — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Al dar de alta un empleado nuevo en el checador, generar y descargar automáticamente su Contrato Individual de Trabajo (paquete completo) en `.docx`, con todas las variables rellenadas desde el expediente BMS.

**Architecture:** El `.docx` real de ejemplo se convierte, mediante un script de build en Python, en `plantilla-contrato.docx` con marcadores `{token}` de docxtemplater (reemplazo a nivel de párrafo para tolerar runs partidos y contenido en tablas/textboxes). En tiempo de ejecución, el navegador descarga la plantilla y la rellena con `docxtemplater` + `PizZip` (CDN), disparado desde `guardarEmpleado()` solo en altas nuevas. Datos de la persona vienen del endpoint `/empleados/expediente/{codigo}`; salario, actividades por puesto y direcciones por sucursal son catálogos en el módulo.

**Tech Stack:** JS de navegador (sin build step), docxtemplater 3.x + PizZip (CDN) para runtime; Python 3 + python-docx 1.2 para construir la plantilla; Node 24 + docxtemplater/pizzip para pruebas de render. Todo confirmado disponible en la máquina.

**Spec de referencia:** `docs/superpowers/specs/2026-07-22-contrato-automatico-alta-empleado-design.md`

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `plantilla-contrato.docx` (nuevo, raíz) | Plantilla parametrizada. Se sirve estático y se descarga con `fetch`. Generada por el build, **se commitea**. |
| `scripts/construir_plantilla.py` (nuevo) | Build one-off: toma el `.docx` origen y produce `plantilla-contrato.docx` insertando los `{token}`. |
| `scripts/verificar_plantilla.py` (nuevo) | Test sin dependencias: valida que la plantilla tenga todos los tokens y ningún literal de Isis. |
| `scripts/verificar_render.mjs` (nuevo) | Test Node: renderiza la plantilla con datos ficticios (docxtemplater) y valida salida + sintaxis de tags. |
| `scripts/package.json` + `scripts/.gitignore` (nuevo) | Deps de las pruebas Node (`docxtemplater`, `pizzip`). `node_modules` ignorado. |
| `contrato-generador.js` (nuevo, raíz) | Catálogos, constantes, helpers puros, `construirDatosContrato()` y `generarContratoAlta()`. Se carga en `Index.html`. |
| `Index.html` (editar) | Añadir `<script>` CDN de PizZip/docxtemplater + `<script src="contrato-generador.js">`. |
| `Admin.js` (editar) | En `guardarEmpleado()`, tras alta nueva exitosa, invocar `window.generarContratoAlta(...)`. |

### Contrato de datos (tokens de la plantilla)

Objeto que consume docxtemplater al renderizar:

```js
{
  nombre_completo:   String,  // "Isis Valeria Evaristo Ramírez"
  edad:              String,  // "19"
  estado_civil:      String,  // "Soltera"
  nacionalidad:      String,  // "Mexicana" (constante)
  nss:               String,  // NumeroIMSS
  curp:              String,
  rfc:               String,
  domicilio:         String,  // armado de Calle/NumExt/NumInt/Colonia/CP/Municipio
  fecha_ingreso:     String,  // "26 de enero del 2026" (firma == ingreso)
  fecha_fin_prueba:  String,  // ingreso + 2 meses, mismo formato
  salario_monto:     String,  // "9,451.20" (constante)
  salario_letra:     String,  // "Nueve Mil ... 20/100 M.N." (constante)
  sitio_trabajo:     String,  // dirección de la sucursal (catálogo)
  ciudad_firma:      String,  // ciudad de la sucursal (catálogo)
  puesto:            String,  // "Cajera"
  folio:             String,  // "" (siempre vacío al alta)
  actividades:       [String] // items del Anexo "A" según puesto
}
```

### Tabla de reemplazos del build (literal exacto → token)

Se aplican sobre el **texto concatenado de cada párrafo** (párrafos de cuerpo, celdas de tabla y textboxes). Orden: los más específicos primero.

| # | Literal exacto en el documento origen | Reemplazo |
|---|---|---|
| 1 | `Isis Valeria Evaristo Ramírez` | `{nombre_completo}` |
| 2 | `35200633903` | `{nss}` |
| 3 | `EARI060706MBSVMSA9` | `{curp}` |
| 4 | `EARI060706PD4` | `{rfc}` |
| 5 | `19 años de edad` | `{edad} años de edad` |
| 6 | `estado Civil Soltera` | `estado Civil {estado_civil}` |
| 7 | `Nacionalidad Mexicana` | `Nacionalidad {nacionalidad}` |
| 8 | `calle isla guyana manazana 1 Locc. islas turcas.  CP 23477. Cabos San Lucas, BCS.` | `{domicilio}` |
| 9 | `26 de enero del 2026` | `{fecha_ingreso}` |
| 10 | `26 de enero de 2026` | `{fecha_ingreso}` |
| 11 | `26 de marzo del 2026` | `{fecha_fin_prueba}` |
| 12 | `26 marzo del 2026` | `{fecha_fin_prueba}` |
| 13 | `9,451.20` | `{salario_monto}` |
| 14 | `Nueve Mil Cuatrocientos Cincuenta y uno pesos 20/100 M.N.` | `{salario_letra}` |
| 15 | `C. PADRE NICOLAS TAMARAL, NUM. 3447, COL LAS PALMAS, CP 23477, CSL, BCS.` | `{sitio_trabajo}` |
| 16 | `Los Cabos San Lucas, BCS` | `{ciudad_firma}` |
| 17 | `Cajera` (palabra completa) | `{puesto}` |
| 18 | `cajera` (palabra completa) | `{puesto}` |
| 19 | `24193582550` | `{folio}` |
| 20 | `2419355080` | `{folio}` |

> **Nota (#8, #15):** el domicilio tiene doble espacio antes de `CP` (`turcas.  CP`); copiar el literal EXACTO. El domicilio origen ya está capturado en el build (ver Task 2).

**Anexo "A" (actividades):** los 7 párrafos con viñeta se convierten en un bucle de párrafo (ver Task 2, paso de actividades).

**NO se tokeniza** (queda fijo, igual al ejemplo): razón social, RFC empresa `ACA0111059H0`, domicilio fiscal, datos del notario, patrón `Fernando Olais Godoy`, testigos `Guillermo Corrales Cruz` / `Esmeralda Flores López`.

---

## Task 1: Dependencias CDN y esqueleto de archivos

**Files:**
- Modify: `Index.html` (bloque de `<script>` al final, ~línea 1918-1927)
- Create: `contrato-generador.js`

- [ ] **Step 1: Añadir librerías CDN y el módulo en `Index.html`**

En `Index.html`, localizar el bloque de scripts (después de `xlsx.full.min.js`, antes de `Admin.js`) y dejarlo así:

```html
    <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
    <!-- Generación de contratos .docx -->
    <script src="https://cdn.jsdelivr.net/npm/pizzip@3.1.8/dist/pizzip.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/docxtemplater@3.50.0/build/docxtemplater.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <script src="supabase-config.js"></script>
    <script src="vacaciones-lft.js"></script>
    <script src="vacaciones-saldo.js"></script>
    <script src="vacaciones-ui.js"></script>
    <script src="faltas-pm.js"></script>
    <script src="contrato-generador.js"></script>
    <script src="Admin.js"></script>
```

- [ ] **Step 2: Crear `contrato-generador.js` con el marcador de carga**

```js
// contrato-generador.js
// Generación automática del Contrato Individual de Trabajo al dar de alta un empleado.
// Se rellena en el navegador con docxtemplater + PizZip a partir de plantilla-contrato.docx.
(function () {
  'use strict';
  console.log('[contrato-generador] cargado');
})();
```

- [ ] **Step 3: Commit**

```bash
git add Index.html contrato-generador.js
git commit -m "feat(contrato): CDN docxtemplater + esqueleto de generador"
```

---

## Task 2: Script de build de la plantilla

Convierte el `.docx` origen en `plantilla-contrato.docx`. Reemplazo a nivel de párrafo (tolera runs partidos), recorriendo cuerpo + tablas + textboxes.

**Files:**
- Create: `scripts/construir_plantilla.py`
- Create (salida): `plantilla-contrato.docx`

- [ ] **Step 1: Escribir `scripts/construir_plantilla.py`**

```python
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

def iter_parrafos(doc):
    """Todos los <w:p> del documento (cuerpo, tablas y textboxes)."""
    return doc.element.body.iter(qn('w:p'))

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
    """Reemplaza los folios (en textboxes) por vacío, a nivel de document.xml crudo."""
    tmp = ruta_docx + ".tmp"
    with zipfile.ZipFile(ruta_docx, 'r') as zin:
        names = zin.namelist()
        data = {n: zin.read(n) for n in names}
    xml = data['word/document.xml'].decode('utf-8')
    for f in FOLIOS:
        xml = xml.replace(f, "")
    data['word/document.xml'] = xml.encode('utf-8')
    with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as zout:
        for n in names:
            zout.writestr(n, data[n])
    os.replace(tmp, ruta_docx)

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
    doc.save(salida)
    # 3) blanquear folios (textboxes) a nivel XML
    blanquear_folios(salida)
    print("Plantilla generada en:", salida)
    for lit, n in total.items():
        print(f"  {n:>3}x  {lit[:50]}")

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Ejecutar el build**

```bash
cd "c:/Users/USUARIO/Desktop/V2 checador-system ADMIN"
python scripts/construir_plantilla.py "D:/USUARIO/Downloads/CAP-ISIS EVARISTO RAMIREZ.docx"
```
Esperado: imprime `Plantilla generada en: ...plantilla-contrato.docx` y conteos > 0 para cada literal (nombre debe ser ~23+, dates varias, etc.). Si algún conteo es 0, revisar el literal.

- [ ] **Step 3: Commit (se valida en Task 3 antes de confiar)**

```bash
git add scripts/construir_plantilla.py plantilla-contrato.docx
git commit -m "feat(contrato): script de build + plantilla parametrizada"
```

---

## Task 3: Verificación de la plantilla (test sin dependencias)

TDD: este test define "plantilla correcta". Escribirlo primero, correrlo (debe fallar si la plantilla no existe o está incompleta), luego ajustar Task 2 hasta que pase.

**Files:**
- Create: `scripts/verificar_plantilla.py`

- [ ] **Step 1: Escribir el test**

```python
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
```

- [ ] **Step 2: Correr el test**

```bash
python scripts/verificar_plantilla.py
```
Esperado: `OK: plantilla válida ...`. Si falla por un literal (p. ej. `Cajera` reaparece), ajustar `REEMPLAZOS`/orden en Task 2, re-ejecutar el build y re-verificar.

> **Nota sobre `{.}`:** el token `{.}` también aparece con las llaves; el XML puede partir `{`, `.`, `}` en runs distintos dentro del párrafo de item. Si el assert de `{.}` falla pero el render (Task 5) funciona, relajar ese assert concreto (docxtemplater re-stitcha runs). Priorizar el resultado del render.

- [ ] **Step 3: Commit**

```bash
git add scripts/verificar_plantilla.py
git commit -m "test(contrato): verificación de tokens y literales en la plantilla"
```

---

## Task 4: Catálogos, constantes y `construirDatosContrato`

Lógica pura y testeable: dado un expediente + sucursal + puesto, arma el objeto de datos o la lista de faltantes.

**Files:**
- Modify: `contrato-generador.js`
- Create: `scripts/package.json`, `scripts/.gitignore`, `scripts/verificar_datos.mjs`

- [ ] **Step 1: Escribir catálogos, helpers y `construirDatosContrato` en `contrato-generador.js`**

Reemplazar el contenido del IIFE por:

```js
// contrato-generador.js
(function () {
  'use strict';

  // ---- Constantes ----
  const SALARIO = {
    monto: "9,451.20",
    letra: "Nueve Mil Cuatrocientos Cincuenta y uno pesos 20/100 M.N."
  };
  const NACIONALIDAD = "Mexicana";

  const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio",
                 "agosto","septiembre","octubre","noviembre","diciembre"];

  // ---- Catálogo de sucursales (dirección + ciudad de firma) ----
  const SUCURSAL_CATALOGO = {
    "MATRIZ":         { direccion: "Prol. Independencia No. 1856 Pte., Fracc. Cuauhtémoc, Los Mochis, Sinaloa",                   ciudad: "Los Mochis, Sinaloa" },
    "LA PAZ":         { direccion: "Blvd. Agustín Olachea No. 4910, entre Tenochtitlán y Tuna, Col. Las Garzas, La Paz, B.C.S.", ciudad: "La Paz, B.C.S." },
    "SAN JOSE":       { direccion: "Julio Pimentel Green, Manzana 7c Lote S/N, Col. Las Veredas, San José del Cabo, B.C.S.",     ciudad: "San José del Cabo, B.C.S." },
    "TAMARAL":        { direccion: "Padre Nicolás Tamaral, 23477 Cabo San Lucas, B.C.S.",                                       ciudad: "Cabo San Lucas, B.C.S." },
    "CABOS":          { direccion: "Flor de Pitahaya Local 25, Brisas del Pacífico, C.P. 23473, Cabo San Lucas, B.C.S.",        ciudad: "Cabo San Lucas, B.C.S." },
    "EL FUERTE":      { direccion: "Carretera El Fuerte - Choix Km 1 + 320, El Fuerte, Sinaloa",                                ciudad: "El Fuerte, Sinaloa" },
    "JUAN JOSE RIOS": { direccion: "Jambiola entre Carretera Internacional y Calle 0, Juan José Ríos, Sinaloa",                 ciudad: "Juan José Ríos, Sinaloa" },
    "CULIACAN":       { direccion: "Fray Marcos de Niza No. 100, Col. San Rafael, Culiacán, Sinaloa",                           ciudad: "Culiacán, Sinaloa" }
  };

  // ---- Catálogo de actividades por puesto (Anexo "A"). Clave normalizada. ----
  const ACTIVIDADES_POR_PUESTO = {
    "CAJERA": [
      "Atender el pago de facturas de contado, ya sea directamente del cliente o de los choferes,",
      "Elaborar los depósitos de contado y crédito, amparados con copia simple de los cheques recibidos en ambos tipos de venta,",
      "Pasar al Departamento de Cartera, copia de los cheques y depósitos por venta de crédito para que se haga la relación de abonos a clientes,",
      "Elaborar la póliza de ingresos diaria,",
      "Revisar la facturación en tránsito diariamente",
      "De ser necesario, serán capacitados para su puesto en la Ciudad de Los Mochis, Sinaloa. El tiempo requerido, así lo indique la Comisión Mixta de Productividad.",
      "Tener la disposición de realizar todas las actividades anteriormente descritas, dentro de su Anexo \"A\""
    ]
    // Pendientes: se agregan conforme el usuario entregue un ejemplo por puesto.
  };

  // ---- Helpers ----
  function normalizarPuesto(s) {
    return (s || "").toString().trim().toUpperCase()
      .normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "");
  }

  function parseFecha(f) {
    // Corrige desfase de zona horaria (fechas vienen ISO desde BMS)
    if (!f) return null;
    const dt = new Date(f);
    if (isNaN(dt)) return null;
    return new Date(dt.getTime() + dt.getTimezoneOffset() * 60000);
  }

  function fechaLarga(d) {
    if (!d) return "";
    return `${d.getDate()} de ${MESES[d.getMonth()]} del ${d.getFullYear()}`;
  }

  function calcularEdad(fechaNac, ref) {
    const n = parseFecha(fechaNac), r = ref || new Date();
    if (!n) return "";
    let e = r.getFullYear() - n.getFullYear();
    const m = r.getMonth() - n.getMonth();
    if (m < 0 || (m === 0 && r.getDate() < n.getDate())) e--;
    return String(e);
  }

  function sumarMeses(d, meses) {
    const r = new Date(d.getTime());
    r.setMonth(r.getMonth() + meses);
    return r;
  }

  function construirDomicilio(d) {
    const partes = [
      d.Calle, d.NumExterior ? `#${d.NumExterior}` : null,
      d.NumInterior ? `Int. ${d.NumInterior}` : null,
      d.Colonia, d.CodigoPostal ? `C.P. ${d.CodigoPostal}` : null, d.Municipio
    ].filter(Boolean);
    return partes.join(", ");
  }

  // ---- Núcleo: arma datos o faltantes ----
  // exp = json.data del expediente BMS; sucursal/puesto = valores del alta (form).
  function construirDatosContrato(exp, sucursal, puesto) {
    const faltantes = [];
    if (!exp) return { datos: null, faltantes: ["No se encontró el expediente del empleado"] };

    const keyPuesto = normalizarPuesto(puesto || exp.Puesto);
    const keySuc = (sucursal || "").toString().trim().toUpperCase();

    if (!ACTIVIDADES_POR_PUESTO[keyPuesto])
      faltantes.push(`Falta configurar el Anexo "A" para el puesto: ${puesto || exp.Puesto || "(sin puesto)"}`);
    if (!SUCURSAL_CATALOGO[keySuc])
      faltantes.push(`Sucursal sin dirección configurada: ${sucursal || "(sin sucursal)"}`);
    if (!exp.FechaIngreso) faltantes.push("Falta la fecha de ingreso en el expediente");
    if (!exp.RFC)          faltantes.push("Falta el RFC en el expediente");
    if (!exp.CURP)         faltantes.push("Falta la CURP en el expediente");
    if (!exp.NumeroIMSS)   faltantes.push("Falta el NSS (registro IMSS) en el expediente");
    const domicilio = construirDomicilio(exp);
    if (!domicilio)        faltantes.push("Falta el domicilio en el expediente");

    if (faltantes.length) return { datos: null, faltantes };

    const ingreso = parseFecha(exp.FechaIngreso);
    const finPrueba = sumarMeses(ingreso, 2);
    const suc = SUCURSAL_CATALOGO[keySuc];

    const datos = {
      nombre_completo: exp.NombreCompleto ||
        [exp.Nombre, exp.ApellidoPaterno, exp.ApellidoMaterno].filter(Boolean).join(" "),
      edad: calcularEdad(exp.FechaNacimiento, ingreso),
      estado_civil: exp.EstadoCivil || "",
      nacionalidad: NACIONALIDAD,
      nss: String(exp.NumeroIMSS),
      curp: exp.CURP,
      rfc: exp.RFC,
      domicilio: domicilio,
      fecha_ingreso: fechaLarga(ingreso),
      fecha_fin_prueba: fechaLarga(finPrueba),
      salario_monto: SALARIO.monto,
      salario_letra: SALARIO.letra,
      sitio_trabajo: suc.direccion,
      ciudad_firma: suc.ciudad,
      puesto: (puesto || exp.Puesto || "").toString().trim(),
      folio: "",
      actividades: ACTIVIDADES_POR_PUESTO[keyPuesto].slice()
    };
    return { datos, faltantes: [] };
  }

  // ---- Exponer ----
  const API = { construirDatosContrato, normalizarPuesto, fechaLarga,
                calcularEdad, sumarMeses, construirDomicilio,
                SUCURSAL_CATALOGO, ACTIVIDADES_POR_PUESTO, SALARIO };
  if (typeof window !== 'undefined') Object.assign(window, { CONTRATO: API });
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
```

- [ ] **Step 2: Crear deps de prueba Node**

`scripts/package.json`:
```json
{
  "name": "contrato-scripts",
  "private": true,
  "type": "module",
  "devDependencies": {
    "docxtemplater": "^3.50.0",
    "pizzip": "^3.1.8"
  }
}
```
`scripts/.gitignore`:
```
node_modules/
package-lock.json
salida-*.docx
```

- [ ] **Step 3: Escribir el test unitario de datos** `scripts/verificar_datos.mjs`

```js
import assert from 'node:assert';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../contrato-generador.js');

// Empleado ficticio (NO Isis)
const expB = {
  NombreCompleto: "Juan Pérez López", FechaNacimiento: "1990-05-10T00:00:00",
  EstadoCivil: "Casado", NumeroIMSS: "11223344556", CURP: "PELJ900510HSLRPN01",
  RFC: "PELJ900510AB1", Calle: "Av. Siempre Viva", NumExterior: "742",
  Colonia: "Centro", CodigoPostal: "80000", Municipio: "Culiacán",
  FechaIngreso: "2026-03-01T00:00:00", Puesto: "Cajera", Sucursal: "CULIACAN"
};

// Caso feliz
let r = C.construirDatosContrato(expB, "CULIACAN", "Cajera");
assert.deepStrictEqual(r.faltantes, [], "no debe haber faltantes");
assert.strictEqual(r.datos.nombre_completo, "Juan Pérez López");
assert.strictEqual(r.datos.edad, "35");                        // nació 1990-05, ingreso 2026-03 => 35
assert.strictEqual(r.datos.fecha_ingreso, "1 de marzo del 2026");
assert.strictEqual(r.datos.fecha_fin_prueba, "1 de mayo del 2026");
assert.strictEqual(r.datos.sitio_trabajo, C.SUCURSAL_CATALOGO["CULIACAN"].direccion);
assert.strictEqual(r.datos.ciudad_firma, "Culiacán, Sinaloa");
assert.strictEqual(r.datos.salario_monto, "9,451.20");
assert.strictEqual(r.datos.actividades.length, 7);
assert.match(r.datos.domicilio, /Av\. Siempre Viva, #742, Centro, C\.P\. 80000, Culiacán/);

// Puesto sin Anexo -> faltante, sin datos
let r2 = C.construirDatosContrato(expB, "CULIACAN", "CHOFER");
assert.strictEqual(r2.datos, null);
assert.ok(r2.faltantes.some(f => f.includes("Anexo")), "debe faltar Anexo del puesto");

// Sin expediente
let r3 = C.construirDatosContrato(null, "CULIACAN", "Cajera");
assert.strictEqual(r3.datos, null);

console.log("OK: construirDatosContrato");
```

- [ ] **Step 4: Instalar deps y correr el test**

```bash
cd "c:/Users/USUARIO/Desktop/V2 checador-system ADMIN/scripts" && npm install --silent && node verificar_datos.mjs
```
Esperado: `OK: construirDatosContrato`. (Ajustar edad esperada si el cálculo difiere; verificar formato de fecha.)

- [ ] **Step 5: Commit**

```bash
cd "c:/Users/USUARIO/Desktop/V2 checador-system ADMIN"
git add contrato-generador.js scripts/package.json scripts/.gitignore scripts/verificar_datos.mjs
git commit -m "feat(contrato): catálogos, helpers y construirDatosContrato + test"
```

---

## Task 5: Render y descarga (`generarContratoAlta`) + test de render

**Files:**
- Modify: `contrato-generador.js`
- Create: `scripts/verificar_render.mjs`

- [ ] **Step 1: Añadir render + descarga en `contrato-generador.js`**

Dentro del IIFE, antes del bloque `// ---- Exponer ----`, agregar:

```js
  const ADMIN_API = 'https://aceros-cabos-proveedores.ngrok.app/api';

  function sanitizarNombreArchivo(s) {
    return (s || "contrato").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function descargarBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function avisar(titulo, msg, tipo) {
    if (typeof window !== 'undefined' && typeof window.showAlert === 'function')
      window.showAlert(titulo, msg, tipo || 'info');
    else console.warn(`[contrato] ${titulo}: ${msg}`);
  }

  // Renderiza el .docx a partir de la plantilla + datos. Devuelve Blob.
  async function renderizarContrato(datos) {
    const resp = await fetch('plantilla-contrato.docx');
    if (!resp.ok) throw new Error('No se pudo descargar la plantilla');
    const buf = await resp.arrayBuffer();
    const zip = new PizZip(buf);
    const doc = new window.docxtemplater(zip, {
      paragraphLoop: true, linebreaks: true,
      delimiters: { start: '{', end: '}' }
    });
    doc.render(datos);
    return doc.getZip().generate({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });
  }

  // Punto de entrada desde el alta. NUNCA lanza (maneja su propio error).
  async function generarContratoAlta(codigoEmpleado, opts) {
    opts = opts || {};
    try {
      const res = await fetch(`${ADMIN_API}/empleados/expediente/${encodeURIComponent(codigoEmpleado)}`);
      const json = await res.json().catch(() => ({}));
      const exp = json && json.success ? json.data : null;

      const { datos, faltantes } = construirDatosContrato(exp, opts.sucursal, opts.puesto);
      if (!datos) {
        avisar('Contrato no generado',
          'No se descargó el contrato porque falta:\n• ' + faltantes.join('\n• '),
          'warning');
        return { ok: false, faltantes };
      }
      const blob = await renderizarContrato(datos);
      descargarBlob(blob, `Contrato - ${sanitizarNombreArchivo(datos.nombre_completo)}.docx`);
      return { ok: true };
    } catch (e) {
      avisar('Contrato no generado', 'Error al generar el contrato: ' + e.message, 'error');
      return { ok: false, error: e.message };
    }
  }
```

Y añadir `generarContratoAlta` y `renderizarContrato` al objeto `API`:
```js
  const API = { construirDatosContrato, generarContratoAlta, renderizarContrato,
                normalizarPuesto, fechaLarga, calcularEdad, sumarMeses, construirDomicilio,
                SUCURSAL_CATALOGO, ACTIVIDADES_POR_PUESTO, SALARIO };
  if (typeof window !== 'undefined') Object.assign(window, { CONTRATO: API, generarContratoAlta });
```

- [ ] **Step 2: Escribir el test de render Node** `scripts/verificar_render.mjs`

```js
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const plantilla = path.join(__dirname, '..', 'plantilla-contrato.docx');

const datos = {
  nombre_completo: "Juan Pérez López", edad: "35", estado_civil: "Casado",
  nacionalidad: "Mexicana", nss: "11223344556", curp: "PELJ900510HSLRPN01",
  rfc: "PELJ900510AB1", domicilio: "Av. Siempre Viva, #742, Centro, C.P. 80000, Culiacán",
  fecha_ingreso: "1 de marzo del 2026", fecha_fin_prueba: "1 de mayo del 2026",
  salario_monto: "9,451.20", salario_letra: "Nueve Mil ... 20/100 M.N.",
  sitio_trabajo: "Fray Marcos de Niza No. 100, Col. San Rafael, Culiacán, Sinaloa",
  ciudad_firma: "Culiacán, Sinaloa", puesto: "Cajera", folio: "",
  actividades: ["Actividad uno de prueba", "Actividad dos de prueba", "Actividad tres de prueba"]
};

const zip = new PizZip(fs.readFileSync(plantilla));
const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
doc.render(datos);                              // lanza si hay tags mal formados
const out = doc.getZip().generate({ type: 'nodebuffer' });
fs.writeFileSync(path.join(__dirname, 'salida-render.docx'), out);

// extraer texto del document.xml de salida
const xml = new PizZip(out).file('word/document.xml').asText();
const plano = xml.replace(/<[^>]+>/g, '');
for (const val of ["Juan Pérez López", "PELJ900510HSLRPN01", "PELJ900510AB1",
                    "11223344556", "1 de marzo del 2026", "1 de mayo del 2026",
                    "Fray Marcos de Niza", "Actividad uno de prueba", "Actividad tres de prueba"]) {
  assert.ok(plano.includes(val), `falta en la salida: ${val}`);
}
// Datos de Isis que NUNCA deben aparecer (nota: "Cajera" SÍ puede, es el puesto de prueba)
for (const bad of ["Evaristo", "35200633903", "PADRE NICOLAS", "isla guyana"]) {
  assert.ok(!plano.includes(bad), `no debe aparecer: ${bad}`);
}
console.log("OK: render (salida-render.docx generado, revisar visualmente)");
```

- [ ] **Step 3: Correr el test de render**

```bash
cd "c:/Users/USUARIO/Desktop/V2 checador-system ADMIN/scripts" && node verificar_render.mjs
```
Esperado: `OK: render ...`. Abrir `scripts/salida-render.docx` en Word y confirmar visualmente: nombre, fechas, salario, domicilio, sitio de trabajo y **las 3 actividades como viñetas separadas**. Si docxtemplater lanza por tags (p. ej. bucle de actividades mal formado), corregir el patrón de párrafos en Task 2 y re-buildear.

- [ ] **Step 4: Commit**

```bash
cd "c:/Users/USUARIO/Desktop/V2 checador-system ADMIN"
git add contrato-generador.js scripts/verificar_render.mjs
git commit -m "feat(contrato): render y descarga del .docx + test de render"
```

---

## Task 6: Enganche en el alta (`guardarEmpleado`)

**Files:**
- Modify: `Admin.js` (función `guardarEmpleado`, ~línea 2731-2743)

- [ ] **Step 1: Invocar el generador tras alta nueva exitosa**

En `Admin.js`, dentro de `guardarEmpleado()`, en el bloque `if (result.success)`, tras `await loadEmployees();` y **solo cuando `!isEditing`**, agregar la llamada (fire-and-forget, no bloquea el alta):

```js
        if (result.success) {
            showAlert('Éxito',
                isEditing ? 'Empleado actualizado correctamente' : 'Empleado creado correctamente',
                'success'
            );

            closeModal('modalEmpleado');
            await loadEmployees();

            // Generar y descargar el contrato SOLO en altas nuevas (no bloquea el alta)
            if (!isEditing && typeof window.generarContratoAlta === 'function') {
                window.generarContratoAlta(codigo, { sucursal, puesto });
            }

            form.reset();
            clearPhotoPreview();
            adminState.selectedEmployee = null;

        } else {
```

> `codigo`, `sucursal`, `puesto` ya existen como variables locales en `guardarEmpleado` (líneas 2680-2685).

- [ ] **Step 2: Verificar que no hay error de sintaxis**

```bash
node --check "c:/Users/USUARIO/Desktop/V2 checador-system ADMIN/Admin.js"
```
Esperado: sin salida (OK).

- [ ] **Step 3: Commit**

```bash
git add Admin.js
git commit -m "feat(contrato): descargar contrato automáticamente al alta nueva"
```

---

## Task 7: Verificación end-to-end (manual, en el navegador)

**Files:** ninguno (validación).

- [ ] **Step 1: Reproducir el contrato de Isis**

Servir el admin localmente (o usar el entorno desplegado). Abrir el panel, dar de alta un empleado usando el **código real de Isis Valeria Evaristo Ramírez** (buscador de nómina), puesto Cajera, sucursal TAMARAL. Al guardar, debe descargarse `Contrato - Isis Valeria Evaristo Ramírez.docx`.

Esperado: el documento coincide en contenido con `CAP-ISIS EVARISTO RAMIREZ.docx` (nombre, edad, estado civil, NSS/CURP/RFC, domicilio, fechas 26 ene / 26 mar, salario, actividades de Cajera). Diferencias aceptables: `{sitio_trabajo}` ahora usa la dirección de catálogo de TAMARAL; folios en blanco.

- [ ] **Step 2: Puesto sin Anexo → no descarga**

Dar de alta un empleado con puesto distinto de Cajera (p. ej. CHOFER). Esperado: el empleado se guarda, aparece un aviso "Contrato no generado ... Falta configurar el Anexo A para el puesto CHOFER", y **no** se descarga nada.

- [ ] **Step 3: Edición no dispara descarga**

Editar un empleado existente y guardar. Esperado: no se descarga contrato.

- [ ] **Step 4: Commit de cierre (si hubo ajustes) y push cuando el usuario dé OK**

```bash
git status
# (push solo con autorización explícita del usuario)
```

---

## Notas de implementación

- **Push = deploy.** No hacer `git push` sin OK explícito de Jorge (los commits locales no despliegan).
- **Ampliar puestos:** agregar una entrada a `ACTIVIDADES_POR_PUESTO` con la clave normalizada (mayúsculas, sin acentos) y la lista de actividades que entregue el usuario. Nada más.
- **Salario anual:** actualizar `SALARIO.monto` y `SALARIO.letra` una vez al año.
- **Testigos/encargado:** hoy fijos en la plantilla (igual al ejemplo). Si en el futuro varían por sucursal, se tokenizan y se añaden al catálogo.
- **Riesgo principal:** el bucle de actividades de docxtemplater (patrón de 3 párrafos). El test de render (Task 5) es la red de seguridad; validar visualmente que las viñetas se repiten.
```
