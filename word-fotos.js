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
