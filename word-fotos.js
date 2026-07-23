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
