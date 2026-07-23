# Exportar Word con fotos de registros — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un botón en la sección Registros del admin que genere y descargue un `.docx` con los registros que tengan foto del filtro actual, una página por empleado y día.

**Architecture:** Un archivo nuevo `word-fotos.js` con funciones globales prefijadas `wf` (mismo patrón que `faltas-pm.js`). La lógica pura (fechas, horas, agrupación, XML) se prueba en `tests/word-fotos.test.html`. El `.docx` se arma a mano como OOXML y se comprime con PizZip, que ya está cargado en `Index.html`. Las fotos se bajan con `fetch`, se enderezan y comprimen con `canvas`, y se incrustan como `word/media/imageN.jpeg`.

**Tech Stack:** JavaScript de navegador (sin build), PizZip 3.1.8 (ya cargado por CDN), `SupabaseAPI.getRegistrosByFecha()`, Canvas API, `createImageBitmap`.

**Spec:** `docs/superpowers/specs/2026-07-23-word-fotos-registros-design.md`

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `word-fotos.js` (nuevo) | Todo: helpers puros, agrupación, armado del XML, fotos y orquestación |
| `tests/word-fotos.test.html` (nuevo) | Pruebas de la lógica pura (sin red ni DOM) |
| `Index.html` (modificar) | Cargar el script y agregar el botón |

`Admin.js` NO se toca (ya tiene ~6,300 líneas).

**Referencia de datos** — `SupabaseAPI.getRegistrosByFecha()` (`supabase-config.js:767-775`) devuelve por registro:
`empleado_id`, `empleado_nombre`, `empleado_codigo`, `sucursal`, `puesto`, `foto_registro`,
más los campos crudos de la tabla: `fecha_hora`, `tipo_registro`, `tablet_id`.

**Ojo con `fecha_hora`:** viene como `'2026-03-07T08:24:02.123'` o `'2026-03-07 08:24:02.123'`
(los dos separadores existen en datos reales — ver `fpSoloFecha` en `faltas-pm.js:30`).
Es hora local de Mazatlán **sin zona**: nunca meterla a `new Date()`.

---

### Task 1: Helpers puros (fecha, hora, XML, tamaño de imagen)

**Files:**
- Create: `word-fotos.js`
- Create: `tests/word-fotos.test.html`

- [ ] **Step 1: Crear el archivo de pruebas con los casos que deben fallar**

Crear `tests/word-fotos.test.html`:

```html
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Word fotos tests</title>
<style>body{font-family:monospace;padding:20px}.ok{color:#16a34a}.fail{color:#dc2626}h2{margin-top:24px}</style>
</head><body>
<h1>Exportar Word con fotos — pruebas</h1>
<div id="out"></div>
<script src="../word-fotos.js"></script>
<script>
const out = document.getElementById('out');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); out.innerHTML += `<div class="ok">✓ ${name}</div>`; pass++; }
  catch (e) { out.innerHTML += `<div class="fail">✗ ${name}: ${e.message}</div>`; fail++; }
}
function eq(a, b, msg='') {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(`${msg} expected ${B} got ${A}`);
}
window.addEventListener('load', () => {

  // === wfSoloFecha ===
  test('wfSoloFecha con T', () => eq(wfSoloFecha('2026-03-07T08:24:02.123'), '2026-03-07'));
  test('wfSoloFecha con espacio', () => eq(wfSoloFecha('2026-03-07 08:24:02.123'), '2026-03-07'));
  test('wfSoloFecha vacío → null', () => { eq(wfSoloFecha(null), null); eq(wfSoloFecha(''), null); });

  // === wfHora12 (valores reales de Arturo Ureña / A002, verificados contra el modal) ===
  test('wfHora12 entrada 8:24', () => eq(wfHora12('2026-03-07T08:24:02.123'), '8:24:02 AM'));
  test('wfHora12 salida 13:18', () => eq(wfHora12('2026-03-07T13:18:35'), '1:18:35 PM'));
  test('wfHora12 con espacio', () => eq(wfHora12('2026-03-07 13:18:35'), '1:18:35 PM'));
  // Este es el caso que delata el corrimiento de zona horaria: si la función
  // usara new Date(), en una PC en otra zona esta hora se iría a otro día.
  test('wfHora12 medianoche → 12 AM (sin corrimiento de zona)', () =>
    eq(wfHora12('2026-03-07T00:03:58'), '12:03:58 AM'));
  test('wfHora12 mediodía → 12 PM', () => eq(wfHora12('2026-03-07T12:00:00'), '12:00:00 PM'));
  test('wfHora12 vacío → cadena vacía', () => eq(wfHora12(null), ''));

  // === wfEscapeXml ===
  test('wfEscapeXml ampersand', () => eq(wfEscapeXml('Juan & Pedro'), 'Juan &amp; Pedro'));
  test('wfEscapeXml menor/mayor', () => eq(wfEscapeXml('<b>'), '&lt;b&gt;'));
  test('wfEscapeXml comillas', () => eq(wfEscapeXml('a"b\'c'), 'a&quot;b&apos;c'));
  test('wfEscapeXml null → vacío', () => eq(wfEscapeXml(null), ''));

  // === wfAnchoImagenCm (máx 11 cm de ancho, 9 cm de alto) ===
  test('horizontal 1280x960 → tope de ancho', () => eq(wfAnchoImagenCm(1280, 960), 11));
  test('vertical 960x1280 → limitado por alto', () => eq(wfAnchoImagenCm(960, 1280), 6.75));
  test('cuadrada 1000x1000 → limitada por alto', () => eq(wfAnchoImagenCm(1000, 1000), 9));

  // === wfCmAEmu (1 cm = 360000 EMU) ===
  test('wfCmAEmu 1 cm', () => eq(wfCmAEmu(1), 360000));
  test('wfCmAEmu 6.75 cm', () => eq(wfCmAEmu(6.75), 2430000));

  out.innerHTML += `<h2>${fail === 0 ? '✅' : '❌'} ${pass} pasaron, ${fail} fallaron</h2>`;
});
</script>
</body></html>
```

- [ ] **Step 2: Abrir el archivo de pruebas y verificar que TODO falla**

Abrir `tests/word-fotos.test.html` en el navegador.
Esperado: todas las pruebas en rojo con "wfSoloFecha is not defined" (el archivo `word-fotos.js` aún no existe).

- [ ] **Step 3: Crear `word-fotos.js` con los helpers**

```js
// Exportación a Word de los registros con foto, empleado por empleado.
// Spec: docs/superpowers/specs/2026-07-23-word-fotos-registros-design.md
// La lógica pura se prueba en tests/word-fotos.test.html.
//
// IMPORTANTE: 'fecha_hora' se guarda como hora local de Mazatlán SIN zona
// ('2026-03-07T08:24:02'). Se lee siempre del texto; nunca con new Date(),
// porque eso la interpreta en la zona horaria de la PC y corre las horas.

// --- Constantes de formato (mismos colores que el modal de fotos) ---
const WF_TEAL      = '17A2B8';  // encabezado del empleado
const WF_VERDE     = '28A745';  // ENTRADA
const WF_ROJO      = 'DC3545';  // SALIDA
const WF_GRIS_INFO = 'F1F3F5';  // barra de datos del registro
const WF_GRIS_TXT  = '495057';
const WF_GRIS_SEC  = '6C757D';
const WF_MAX_FOTO_ANCHO_CM = 11;
const WF_MAX_FOTO_ALTO_CM  = 9;

// Normaliza a 'YYYY-MM-DD'. Acepta 'T' o espacio como separador. Vacío -> null.
function wfSoloFecha(valor) {
    if (!valor) return null;
    const s = String(valor);
    return (s.includes('T') ? s.split('T')[0] : s.split(' ')[0]) || null;
}

// 'YYYY-MM-DDTHH:mm:ss[.mmm]' -> 'H:mm:ss AM/PM' leyendo el texto tal cual.
function wfHora12(fechaHora) {
    if (!fechaHora) return '';
    const s = String(fechaHora);
    const parte = s.includes('T') ? s.split('T')[1] : s.split(' ')[1];
    if (!parte) return '';
    const p = parte.split(':');
    let h = parseInt(p[0], 10);
    if (isNaN(h)) return '';
    const min = (p[1] || '00').substring(0, 2);
    const seg = (p[2] || '00').substring(0, 2);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}:${min}:${seg} ${ampm}`;
}

// Escapa texto que va dentro del XML del .docx. Un '&' sin escapar
// rompe el archivo completo (Word lo reporta como dañado).
function wfEscapeXml(valor) {
    return String(valor == null ? '' : valor)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// Ancho en cm que hace caber la foto en el recuadro conservando proporción.
// Word calcula el alto solo si se le da el ancho correcto.
function wfAnchoImagenCm(anchoPx, altoPx, maxAncho, maxAlto) {
    const mA = maxAncho || WF_MAX_FOTO_ANCHO_CM;
    const mH = maxAlto || WF_MAX_FOTO_ALTO_CM;
    if (!anchoPx || !altoPx) return mA;
    return Math.min(mA, mH * (anchoPx / altoPx));
}

// Word mide las imágenes en EMU: 1 cm = 360,000 EMU.
function wfCmAEmu(cm) {
    return Math.round(cm * 360000);
}
```

- [ ] **Step 4: Recargar las pruebas y verificar que pasan**

Recargar `tests/word-fotos.test.html`.
Esperado: `✅ 18 pasaron, 0 fallaron`.

- [ ] **Step 5: Commit**

```bash
git add word-fotos.js tests/word-fotos.test.html
git commit -m "feat(word-fotos): helpers de fecha, hora, XML y tamaño de imagen"
```

---

### Task 2: Agrupar registros por empleado y día

**Files:**
- Modify: `word-fotos.js` (agregar al final)
- Modify: `tests/word-fotos.test.html` (agregar pruebas antes de la línea del resumen)

- [ ] **Step 1: Agregar las pruebas que fallan**

En `tests/word-fotos.test.html`, insertar ANTES de la línea que empieza con `out.innerHTML += \`<h2>`:

```js
  // === wfAgruparRegistros ===
  const REGS = [
    { empleado_id: 2, empleado_nombre: 'Beto Ruiz', empleado_codigo: 'B001', sucursal: 'MATRIZ',
      fecha_hora: '2026-03-07T09:00:00', tipo_registro: 'ENTRADA', tablet_id: 'TABLET_02', foto_registro: 'b1.jpg' },
    { empleado_id: 1, empleado_nombre: 'Ana Lopez', empleado_codigo: 'A002', sucursal: 'MATRIZ',
      fecha_hora: '2026-03-07T13:18:35', tipo_registro: 'SALIDA', tablet_id: 'TABLET_01', foto_registro: 'a2.jpg' },
    { empleado_id: 1, empleado_nombre: 'Ana Lopez', empleado_codigo: 'A002', sucursal: 'MATRIZ',
      fecha_hora: '2026-03-07T08:24:02', tipo_registro: 'ENTRADA', tablet_id: 'TABLET_01', foto_registro: 'a1.jpg' },
    { empleado_id: 1, empleado_nombre: 'Ana Lopez', empleado_codigo: 'A002', sucursal: 'MATRIZ',
      fecha_hora: '2026-03-08T08:10:00', tipo_registro: 'ENTRADA', tablet_id: 'TABLET_01', foto_registro: 'a3.jpg' },
    { empleado_id: 3, empleado_nombre: 'Carla Diaz', empleado_codigo: 'C001', sucursal: 'CABOS',
      fecha_hora: '2026-03-07T08:00:00', tipo_registro: 'ENTRADA', tablet_id: 'TABLET_09', foto_registro: 'c1.jpg' },
    { empleado_id: 4, empleado_nombre: 'Sin Foto', empleado_codigo: 'D001', sucursal: 'MATRIZ',
      fecha_hora: '2026-03-07T08:00:00', tipo_registro: 'ENTRADA', tablet_id: 'TABLET_01', foto_registro: null }
  ];
  const G = wfAgruparRegistros(REGS);

  test('descarta registros sin foto', () =>
    eq(G.every(g => g.codigo !== 'D001'), true));
  test('un grupo por empleado + día (Ana tiene 2 días)', () => eq(G.length, 4));
  test('orden: sucursal, luego nombre, luego fecha', () =>
    eq(G.map(g => `${g.sucursal}|${g.codigo}|${g.fecha}`),
       ['CABOS|C001|2026-03-07', 'MATRIZ|A002|2026-03-07', 'MATRIZ|A002|2026-03-08', 'MATRIZ|B001|2026-03-07']));
  test('los registros del grupo van ordenados por hora', () => {
    const ana = G.find(g => g.codigo === 'A002' && g.fecha === '2026-03-07');
    eq(ana.registros.map(r => r.tipo_registro), ['ENTRADA', 'SALIDA']);
  });
  test('el grupo trae nombre y conteo', () => {
    const ana = G.find(g => g.codigo === 'A002' && g.fecha === '2026-03-07');
    eq(ana.nombre, 'Ana Lopez');
    eq(ana.registros.length, 2);
  });
  test('lista vacía → sin grupos', () => eq(wfAgruparRegistros([]), []));
  test('null → sin grupos', () => eq(wfAgruparRegistros(null), []));
```

- [ ] **Step 2: Recargar y verificar que fallan**

Recargar `tests/word-fotos.test.html`.
Esperado: las 7 pruebas nuevas en rojo con "wfAgruparRegistros is not defined".

- [ ] **Step 3: Implementar `wfAgruparRegistros`**

Agregar al final de `word-fotos.js`:

```js
// Agrupa por empleado + día (una página del Word por grupo), igual que el
// modal, que siempre es de una persona en una fecha.
// Descarta los registros sin foto. Devuelve [] si no hay nada.
function wfAgruparRegistros(registros) {
    if (!registros || !registros.length) return [];
    const mapa = new Map();

    registros.forEach(r => {
        if (!r || !r.foto_registro) return;
        const fecha = wfSoloFecha(r.fecha_hora);
        if (!fecha) return;
        const clave = `${r.empleado_id}|${fecha}`;
        if (!mapa.has(clave)) {
            mapa.set(clave, {
                empleadoId: r.empleado_id,
                nombre: r.empleado_nombre || 'Sin nombre',
                codigo: r.empleado_codigo || 's/código',
                sucursal: r.sucursal || 'SIN SUCURSAL',
                fecha: fecha,
                registros: []
            });
        }
        mapa.get(clave).registros.push(r);
    });

    const grupos = Array.from(mapa.values());
    grupos.forEach(g => g.registros.sort((a, b) =>
        String(a.fecha_hora).localeCompare(String(b.fecha_hora))));

    grupos.sort((a, b) =>
        a.sucursal.localeCompare(b.sucursal) ||
        a.nombre.localeCompare(b.nombre) ||
        a.fecha.localeCompare(b.fecha));

    return grupos;
}
```

- [ ] **Step 4: Recargar y verificar que pasan**

Recargar `tests/word-fotos.test.html`.
Esperado: `✅ 25 pasaron, 0 fallaron`.

- [ ] **Step 5: Commit**

```bash
git add word-fotos.js tests/word-fotos.test.html
git commit -m "feat(word-fotos): agrupar registros por empleado y día"
```

---

### Task 3: Construir el XML del documento

**Files:**
- Modify: `word-fotos.js`
- Modify: `tests/word-fotos.test.html`

- [ ] **Step 1: Agregar las pruebas que fallan**

Insertar en `tests/word-fotos.test.html` antes de la línea del resumen:

```js
  // === Piezas de XML ===
  test('wfXmlRun escapa el texto', () =>
    eq(wfXmlRun('A & B', {}).includes('A &amp; B'), true));
  test('wfXmlRun tamaño en medios puntos (15pt → 30)', () =>
    eq(wfXmlRun('x', { sz: 15 }).includes('<w:sz w:val="30"/>'), true));
  test('wfXmlRun relleno de etiqueta', () =>
    eq(wfXmlRun('ENTRADA', { fill: WF_VERDE }).includes('w:fill="28A745"'), true));
  test('wfXmlParrafo con relleno', () =>
    eq(wfXmlParrafo('<w:r/>', { fill: WF_TEAL }).includes('w:fill="17A2B8"'), true));
  test('wfXmlImagen usa EMU y el rId', () => {
    const xml = wfXmlImagen('rId5', 11, 8.25, 3);
    eq(xml.includes('r:embed="rId5"'), true);
    eq(xml.includes('cx="3960000"'), true);   // 11 cm
    eq(xml.includes('cy="2970000"'), true);   // 8.25 cm
  });

  // === Documento completo ===
  const DOC = wfConstruirDocumentXml(
    wfAgruparRegistros(REGS),
    { 'a1.jpg': { ancho: 1280, alto: 960 }, 'a2.jpg': { ancho: 960, alto: 1280 } },
    { titulo: 'Registros de Asistencia con Foto', periodo: '07/03/2026' }
  );
  test('el documento declara los espacios de nombres', () =>
    eq(DOC.xml.includes('xmlns:pic='), true));
  test('una imagen por foto disponible', () => eq(DOC.imagenes.length, 2));
  test('las fotos sin datos salen como no disponibles', () =>
    eq(DOC.xml.includes('Foto no disponible'), true));
  test('incluye el nombre y el código del empleado', () => {
    eq(DOC.xml.includes('Ana Lopez'), true);
    eq(DOC.xml.includes('A002'), true);
  });
  test('incluye la hora sin convertir', () => eq(DOC.xml.includes('8:24:02 AM'), true));
  test('incluye la etiqueta de ENTRADA y de SALIDA', () => {
    eq(DOC.xml.includes('ENTRADA'), true);
    eq(DOC.xml.includes('SALIDA'), true);
  });
  test('un salto de página por grupo', () =>
    eq((DOC.xml.match(/w:type="page"/g) || []).length, 4));
  test('cierra el documento con sectPr', () =>
    eq(DOC.xml.trim().endsWith('</w:document>'), true));
```

- [ ] **Step 2: Recargar y verificar que fallan**

Esperado: las pruebas nuevas en rojo con "wfXmlRun is not defined".

- [ ] **Step 3: Implementar los constructores de XML**

Agregar al final de `word-fotos.js`:

```js
// --- Piezas de XML de Word (OOXML) ---

// Un fragmento de texto con formato. 'sz' va en puntos y Word lo quiere
// en medios puntos. 'fill' pinta el fondo (así se simula la etiqueta de color).
function wfXmlRun(texto, o) {
    o = o || {};
    let rPr = '';
    if (o.bold) rPr += '<w:b/>';
    if (o.sz) rPr += `<w:sz w:val="${Math.round(o.sz * 2)}"/>`;
    if (o.color) rPr += `<w:color w:val="${o.color}"/>`;
    if (o.fill) rPr += `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>`;
    const props = rPr ? `<w:rPr>${rPr}</w:rPr>` : '';
    return `<w:r>${props}<w:t xml:space="preserve">${wfEscapeXml(texto)}</w:t></w:r>`;
}

// Salto de línea dentro del mismo párrafo (para que el relleno sea continuo).
function wfXmlSaltoLinea() {
    return '<w:r><w:br/></w:r>';
}

function wfXmlSaltoPagina() {
    return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
}

// Párrafo. 'espacioAntes'/'espacioDespues' van en puntos (Word usa veinteavos).
function wfXmlParrafo(runsXml, o) {
    o = o || {};
    let pPr = '';
    if (o.fill) pPr += `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>`;
    if (o.align) pPr += `<w:jc w:val="${o.align}"/>`;
    if (o.espacioAntes != null || o.espacioDespues != null) {
        pPr += `<w:spacing w:before="${Math.round((o.espacioAntes || 0) * 20)}"`
             + ` w:after="${Math.round((o.espacioDespues || 0) * 20)}"/>`;
    }
    const props = pPr ? `<w:pPr>${pPr}</w:pPr>` : '';
    return `<w:p>${props}${runsXml}</w:p>`;
}

// Imagen centrada. 'id' debe ser único dentro del documento.
function wfXmlImagen(rId, anchoCm, altoCm, id) {
    const cx = wfCmAEmu(anchoCm);
    const cy = wfCmAEmu(altoCm);
    return '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing>'
        + '<wp:inline distT="0" distB="0" distL="0" distR="0">'
        + `<wp:extent cx="${cx}" cy="${cy}"/>`
        + `<wp:docPr id="${id}" name="Foto ${id}"/>`
        + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
        + `<pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="foto${id}.jpeg"/><pic:cNvPicPr/></pic:nvPicPr>`
        + `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
        + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`
        + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
        + '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
}

// Construye word/document.xml completo.
// 'fotos' es un objeto { url: { ancho, alto } } con las fotos ya procesadas;
// una url ausente o con valor nulo se dibuja como "[ Foto no disponible ]".
// Devuelve { xml, imagenes: [{ url, rId, archivo }] } en el orden en que se usaron.
function wfConstruirDocumentXml(grupos, fotos, meta) {
    meta = meta || {};
    fotos = fotos || {};
    const imagenes = [];
    const partes = [];

    // Portada
    partes.push(wfXmlParrafo(
        wfXmlRun(meta.titulo || 'Registros de Asistencia con Foto', { bold: true, sz: 20 }),
        { align: 'center' }));
    if (meta.periodo) {
        partes.push(wfXmlParrafo(
            wfXmlRun(meta.periodo, { sz: 14, color: WF_GRIS_SEC }), { align: 'center' }));
    }
    if (meta.resumen) {
        partes.push(wfXmlParrafo(
            wfXmlRun(meta.resumen, { sz: 11, color: WF_GRIS_SEC }), { align: 'center' }));
    }

    grupos.forEach(g => {
        partes.push(wfXmlSaltoPagina());

        // Encabezado del empleado (turquesa, texto blanco, dos renglones)
        partes.push(wfXmlParrafo(
            wfXmlRun(`📷  ${g.nombre}  -  ${g.fecha}`, { bold: true, sz: 15, color: 'FFFFFF' })
            + wfXmlSaltoLinea()
            + wfXmlRun(`Código: ${g.codigo}   •   ${g.registros.length} foto(s)   •   ${g.sucursal}`,
                       { sz: 10, color: 'FFFFFF' }),
            { fill: WF_TEAL, espacioAntes: 8, espacioDespues: 8 }));

        g.registros.forEach((r, i) => {
            const tipo = String(r.tipo_registro || '').toUpperCase();
            const colorTipo = tipo === 'ENTRADA' ? WF_VERDE : WF_ROJO;

            // Barra de datos del registro
            partes.push(wfXmlParrafo(
                wfXmlRun(`Registro #${i + 1}`, { bold: true, sz: 12, color: WF_GRIS_TXT })
                + wfXmlRun('    ', {})
                + wfXmlRun(`  ${tipo || 'N/A'}  `, { bold: true, sz: 9, color: 'FFFFFF', fill: colorTipo })
                + wfXmlSaltoLinea()
                + wfXmlRun(`🕐 ${wfHora12(r.fecha_hora)}     `
                         + `🖥 Tablet: ${r.tablet_id || 'N/A'}`,
                           { sz: 10, color: WF_GRIS_SEC }),
                { fill: WF_GRIS_INFO, espacioAntes: 10, espacioDespues: 2 }));

            // Foto
            const datos = fotos[r.foto_registro];
            if (datos) {
                const rId = `rId${imagenes.length + 1}`;
                const idUnico = imagenes.length + 1;
                imagenes.push({ url: r.foto_registro, rId: rId, archivo: `image${idUnico}.jpeg` });
                const anchoCm = wfAnchoImagenCm(datos.ancho, datos.alto);
                const altoCm = anchoCm * (datos.alto / datos.ancho);
                partes.push(wfXmlImagen(rId, anchoCm, altoCm, idUnico));
            } else {
                partes.push(wfXmlParrafo(
                    wfXmlRun('[ Foto no disponible ]', { sz: 10, color: WF_GRIS_SEC }),
                    { align: 'center' }));
            }
        });
    });

    // Hoja A4 con márgenes (twips: 1 cm = 567)
    const sectPr = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
        + '<w:pgMar w:top="907" w:right="1021" w:bottom="907" w:left="1021"'
        + ' w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>';

    const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<w:document '
        + 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
        + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        + 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
        + 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        + 'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
        + `<w:body>${partes.join('')}${sectPr}</w:body></w:document>`;

    return { xml: xml, imagenes: imagenes };
}
```

- [ ] **Step 4: Recargar y verificar que pasan**

Recargar `tests/word-fotos.test.html`.
Esperado: `✅ 38 pasaron, 0 fallaron`.

- [ ] **Step 5: Commit**

```bash
git add word-fotos.js tests/word-fotos.test.html
git commit -m "feat(word-fotos): construir el XML del documento"
```

---

### Task 4: Empaquetar el .docx con PizZip

**Files:**
- Modify: `word-fotos.js`

Esta parte no se prueba en el archivo de pruebas porque necesita PizZip cargado; se verifica en la Task 8 abriendo el archivo en Word.

- [ ] **Step 1: Implementar el empaquetado y la descarga**

Agregar al final de `word-fotos.js`:

```js
// --- Empaquetado del .docx ---

// Arma el .docx completo y lo devuelve como Blob.
// 'imagenes' viene de wfConstruirDocumentXml; 'buffers' es { url: ArrayBuffer }.
function wfArmarDocxBlob(documentXml, imagenes, buffers) {
    const PizZipCtor = (typeof window !== 'undefined') && window.PizZip;
    if (!PizZipCtor) throw new Error('Falta la librería PizZip. Recarga la página e intenta de nuevo.');

    const zip = new PizZipCtor();

    zip.file('[Content_Types].xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Default Extension="jpeg" ContentType="image/jpeg"/>'
        + '<Override PartName="/word/document.xml"'
        + ' ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        + '</Types>');

    zip.folder('_rels').file('.rels',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1"'
        + ' Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"'
        + ' Target="word/document.xml"/></Relationships>');

    const word = zip.folder('word');
    word.file('document.xml', documentXml);

    const rels = imagenes.map(img =>
        `<Relationship Id="${img.rId}"`
        + ' Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"'
        + ` Target="media/${img.archivo}"/>`).join('');
    word.folder('_rels').file('document.xml.rels',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + rels + '</Relationships>');

    const media = word.folder('media');
    imagenes.forEach(img => {
        media.file(img.archivo, buffers[img.url], { binary: true });
    });

    return zip.generate({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        compression: 'DEFLATE'
    });
}

// Dispara la descarga en el navegador (mismo patrón que contrato-generador.js:162).
function wfDescargarBlob(blob, nombreArchivo) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}
```

- [ ] **Step 2: Commit**

```bash
git add word-fotos.js
git commit -m "feat(word-fotos): empaquetar el .docx con PizZip"
```

---

### Task 5: Bajar y preparar las fotos

**Files:**
- Modify: `word-fotos.js`

- [ ] **Step 1: Implementar la descarga y el procesamiento**

Agregar al final de `word-fotos.js`:

```js
// --- Fotos ---

// Construye la URL pública de la foto (mismo criterio que getSupabaseFotoUrl
// en Admin.js:177, pero sin depender de Admin.js).
function wfUrlFoto(fotoPath) {
    if (!fotoPath) return null;
    if (fotoPath.startsWith('http://') || fotoPath.startsWith('https://')) return fotoPath;
    const base = (typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL)
        || 'https://uqncsqstpcynjxnjhrqu.supabase.co';
    const limpio = fotoPath.startsWith('/uploads/fotos/')
        ? fotoPath.replace('/uploads/fotos/', '') : fotoPath;
    return `${base}/storage/v1/object/public/registros-fotos/${limpio}`;
}

// Baja una foto, la endereza y la comprime.
// El canvas es necesario porque Word NO respeta la orientación EXIF que el
// navegador sí aplica en las etiquetas <img>: sin esto, las fotos tomadas en
// vertical salen acostadas. De paso baja el peso del archivo final.
// Devuelve { buffer, ancho, alto } o null si falla.
async function wfProcesarFoto(url) {
    try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const blob = await resp.blob();

        const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
        const MAX = 1280;
        const escala = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
        const ancho = Math.max(1, Math.round(bitmap.width * escala));
        const alto = Math.max(1, Math.round(bitmap.height * escala));

        const canvas = document.createElement('canvas');
        canvas.width = ancho;
        canvas.height = alto;
        canvas.getContext('2d').drawImage(bitmap, 0, 0, ancho, alto);
        bitmap.close();

        const jpeg = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.82));
        if (!jpeg) throw new Error('no se pudo comprimir');

        return { buffer: await jpeg.arrayBuffer(), ancho: ancho, alto: alto };
    } catch (e) {
        console.warn('[word-fotos] foto no disponible:', url, e.message);
        return null;
    }
}

// Baja todas las fotos en lotes, informando el avance.
// Devuelve { fotos: { fotoPath: {ancho,alto} }, buffers: { fotoPath: ArrayBuffer }, fallidas }.
async function wfDescargarFotos(rutas, alAvanzar) {
    const fotos = {};
    const buffers = {};
    let fallidas = 0;
    let hechas = 0;
    const LOTE = 6;

    for (let i = 0; i < rutas.length; i += LOTE) {
        const lote = rutas.slice(i, i + LOTE);
        const resultados = await Promise.all(lote.map(ruta => wfProcesarFoto(wfUrlFoto(ruta))));
        resultados.forEach((res, j) => {
            const ruta = lote[j];
            if (res) {
                fotos[ruta] = { ancho: res.ancho, alto: res.alto };
                buffers[ruta] = res.buffer;
            } else {
                fallidas++;
            }
            hechas++;
        });
        if (typeof alAvanzar === 'function') alAvanzar(hechas, rutas.length);
    }

    return { fotos: fotos, buffers: buffers, fallidas: fallidas };
}
```

- [ ] **Step 2: Commit**

```bash
git add word-fotos.js
git commit -m "feat(word-fotos): bajar, enderezar y comprimir las fotos"
```

---

### Task 6: Orquestador `exportarWordFotos()`

**Files:**
- Modify: `word-fotos.js`

- [ ] **Step 1: Implementar el orquestador**

Agregar al final de `word-fotos.js`:

```js
// --- Orquestador (punto de entrada desde el botón) ---

const WF_LIMITE_AVISO = 400;   // arriba de esto se pide confirmación
const WF_MB_POR_FOTO  = 0.14;  // medido: 133 fotos ≈ 17 MB

function wfFechaBonita(fecha) {
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio',
                   'agosto','septiembre','octubre','noviembre','diciembre'];
    const p = String(fecha).split('-');
    if (p.length !== 3) return fecha;
    return `${parseInt(p[2], 10)} de ${meses[parseInt(p[1], 10) - 1]} de ${p[0]}`;
}

async function exportarWordFotos() {
    try {
        // 1. Mismos filtros que exportarRegistros() (Admin.js:6244)
        const fechaInicio = document.getElementById('fechaInicio')?.value;
        const fechaFin = document.getElementById('fechaFin')?.value;
        if (!fechaInicio || !fechaFin) {
            showAlert('Falta el período', 'Selecciona un período antes de exportar.', 'warning');
            return;
        }
        const empleadoId = document.getElementById('filterEmpleado')?.value;
        const tipo = document.getElementById('filterTipo')?.value;
        const sucursal = document.getElementById('filterSucursal')?.value;
        const puesto = document.getElementById('filterPuesto')?.value;

        const filtros = {
            sucursalUsuario: window.currentUserSucursal,
            empleadoId: empleadoId || null,
            tipo: tipo || null,
            sucursal: (window.isSuperAdmin && sucursal) ? sucursal : null,
            puesto: puesto || null
        };

        showLoading('Consultando registros...');
        const result = await SupabaseAPI.getRegistrosByFecha(fechaInicio, fechaFin, filtros);
        if (!result.success) throw new Error(result.message || 'Error obteniendo registros');

        // 2. Agrupar (descarta los que no tienen foto)
        const grupos = wfAgruparRegistros(result.data || []);
        const totalFotos = grupos.reduce((n, g) => n + g.registros.length, 0);

        if (!totalFotos) {
            hideLoading();
            showAlert('Sin fotos', 'No hay registros con foto en el período seleccionado.', 'info');
            return;
        }

        // 3. Guardia de volumen
        if (totalFotos > WF_LIMITE_AVISO) {
            hideLoading();
            const mb = Math.round(totalFotos * WF_MB_POR_FOTO);
            const seguir = confirm(
                `Vas a generar un Word con ${totalFotos} fotos de ${grupos.length} páginas `
                + `(aprox. ${mb} MB).\n\nPuede tardar varios minutos y dejar el navegador `
                + `ocupado.\n\n¿Continuar?`);
            if (!seguir) return;
            showLoading('Preparando...');
        }

        // 4. Bajar las fotos con progreso
        const rutas = Array.from(new Set(
            grupos.flatMap(g => g.registros.map(r => r.foto_registro))));
        const { fotos, buffers, fallidas } = await wfDescargarFotos(rutas, (hechas, total) => {
            showLoading(`Descargando fotos ${hechas} / ${total}...`);
        });

        // 5. Armar el documento
        showLoading('Armando el documento...');
        const periodo = fechaInicio === fechaFin
            ? wfFechaBonita(fechaInicio)
            : `${wfFechaBonita(fechaInicio)} al ${wfFechaBonita(fechaFin)}`;
        const porSucursal = {};
        grupos.forEach(g => { porSucursal[g.sucursal] = (porSucursal[g.sucursal] || 0) + 1; });
        const resumen = Object.keys(porSucursal).sort()
            .map(s => `${s}: ${porSucursal[s]}`).join('  •  ');

        // Todo en un renglón: un '\n' dentro de <w:t> NO produce salto en Word,
        // se ignora y el texto sale pegado.
        const doc = wfConstruirDocumentXml(grupos, fotos, {
            titulo: 'Registros de Asistencia con Foto',
            periodo: periodo,
            resumen: `${grupos.length} páginas  ·  ${totalFotos} registros  —  ${resumen}`
        });

        const blob = wfArmarDocxBlob(doc.xml, doc.imagenes, buffers);

        // 6. Descargar
        const suf = (window.isSuperAdmin && sucursal) ? `_${String(sucursal).replace(/\s+/g, '-')}` : '';
        const rango = fechaInicio === fechaFin ? fechaInicio : `${fechaInicio}_a_${fechaFin}`;
        wfDescargarBlob(blob, `Registros_fotos_${rango}${suf}.docx`);

        hideLoading();
        showAlert('Word generado',
            `${grupos.length} páginas con ${totalFotos - fallidas} fotos.`
            + (fallidas ? ` ${fallidas} foto(s) no se pudieron descargar.` : ''),
            'success');

    } catch (e) {
        hideLoading();
        console.error('[word-fotos]', e);
        showAlert('Error', 'No se pudo generar el Word: ' + e.message, 'error');
    }
}

window.exportarWordFotos = exportarWordFotos;
```

- [ ] **Step 2: Commit**

```bash
git add word-fotos.js
git commit -m "feat(word-fotos): orquestador con filtros, aviso de volumen y progreso"
```

---

### Task 7: Botón en Index.html

**Files:**
- Modify: `Index.html:1930` (cargar el script) y `Index.html:497-499` (botón)

- [ ] **Step 1: Cargar el script**

En `Index.html`, después de la línea `<script src="contrato-generador.js"></script>`, agregar:

```html
    <script src="word-fotos.js"></script>
```

- [ ] **Step 2: Agregar el botón**

En `Index.html`, dentro de `<div class="table-actions">` de la sección Registros,
después del botón de PDF (el que tiene `onclick="exportarRegistros('pdf')"`), agregar:

```html
                    <button class="btn-icon" title="Exportar Word con fotos" onclick="exportarWordFotos()">
                        <i class="fas fa-file-word"></i>
                    </button>
```

- [ ] **Step 3: Verificar que la página carga sin errores**

Abrir `Index.html`, entrar a la sección Registros y abrir la consola del navegador.
Esperado: sin errores en rojo; el icono de Word aparece junto al de PDF;
escribir `typeof exportarWordFotos` en la consola devuelve `"function"`.

- [ ] **Step 4: Commit**

```bash
git add Index.html
git commit -m "feat(word-fotos): botón de exportar Word en la barra de Registros"
```

---

### Task 8: Verificación contra el Word conocido

El archivo `Registros_fotos_2026-03-07_MATRIZ.docx` (generado el 2026-07-23 con
`generar_word_fotos.py`) es la referencia: **70 páginas, 133 fotos**.

- [ ] **Step 1: Generar el mismo caso desde la app**

En la sección Registros: período `2026-03-07` a `2026-03-07`, sucursal `MATRIZ`,
tipo y puesto en "todos". Dar clic en el icono de Word.
Esperado: barra de progreso "Descargando fotos N / 133" y al final se descarga
`Registros_fotos_2026-03-07_MATRIZ.docx`.

- [ ] **Step 2: Abrir el archivo en Word y comparar**

Verificar:
- Word lo abre **sin** el aviso de "documento dañado" o de reparación.
- 70 páginas de empleados (más la portada).
- Buscar "Arturo" — no debe estar (es de MATRIZ, pero validar contra el archivo
  de referencia que los empleados coincidan).
- Tomar 3 empleados al azar y comparar nombre, código, horas y tablet contra el
  archivo de referencia: deben ser idénticos.
- Las fotos tomadas en vertical se ven **derechas**, no acostadas.
- Las etiquetas ENTRADA salen en verde y SALIDA en rojo.

- [ ] **Step 3: Verificar el candado de sucursal**

Entrar con un usuario de sucursal (no superadmin) y exportar.
Esperado: el Word solo trae empleados de su sucursal.

- [ ] **Step 4: Verificar el aviso de volumen**

Poner un período de un mes completo (ej. `2026-03-01` a `2026-03-31`).
Esperado: aparece la confirmación con el número de fotos y los MB estimados;
al cancelar, no se descarga nada y no se queda la pantalla de carga pegada.

- [ ] **Step 5: Commit final**

```bash
git add -A
git commit -m "test(word-fotos): verificación manual contra el Word de referencia"
```

---

## Notas de cierre

- **No hacer push.** En este proyecto publicar equivale a desplegar; el push se
  hace solo con visto bueno explícito de Jorge.
- El script `generar_word_fotos.py` se queda como está: sirve de referencia y de
  respaldo para generar reportes masivos sin cargar el navegador.
