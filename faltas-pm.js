// Detección de "Turno tarde no cubierto" (Fase 1-A, spec 2026-06-09).
// Lógica pura, sin Supabase ni DOM; se prueba en tests/faltas-pm.test.html.
// Regla de valor para nómina (a futuro): día completo = 1.0, turno tarde
// no cubierto = 0.5. En esta fase solo se MARCA, no se calcula descuento.

function fpMinutosDe(horaStr) {
    const p = horaStr.split(':');
    return parseInt(p[0], 10) * 60 + parseInt(p[1] || '0', 10);
}

// 'YYYY-MM-DD HH:mm:ss' o ISO con T -> minutos desde medianoche (hora guardada).
function fpMinutosDeFechaHora(fechaHoraStr) {
    const horaPart = fechaHoraStr.includes('T')
        ? fechaHoraStr.split('T')[1]
        : fechaHoraStr.split(' ')[1];
    return fpMinutosDe(horaPart);
}

// Fecha de hoy en zona horaria de Mazatlán como 'YYYY-MM-DD'.
// Se usa como tope para no contar faltas en días que aún no llegan.
// 'now' es inyectable para tests (default: ahora).
function fpHoyMazatlan(now) {
    const d = now || new Date();
    // en-CA da formato YYYY-MM-DD; timeZone fija la fecha-calendario de Mazatlán.
    return d.toLocaleDateString('en-CA', { timeZone: 'America/Mazatlan' });
}

// Normaliza una fecha a 'YYYY-MM-DD'. Acepta timestamp 'YYYY-MM-DD HH:mm:ss',
// ISO con 'T', o ya recortado. Vacío/falsy -> null.
function fpSoloFecha(valor) {
    if (!valor) return null;
    const s = String(valor);
    return (s.includes('T') ? s.split('T')[0] : s.split(' ')[0]) || null;
}

// ¿La 'fecha' (YYYY-MM-DD) es evaluable como posible falta para este empleado?
// Reglas: no después de hoy (jornada futura), no antes del ingreso (no existía).
// 'fechaIngreso' es la fecha de ingreso real (BMS) ya resuelta; null -> sin tope inferior.
// El día de hoy y el día de ingreso SÍ se evalúan (límites inclusivos).
function fpFechaEvaluableParaFalta(fecha, fechaIngreso, hoy) {
    if (hoy && fecha > hoy) return false;
    const ingreso = fpSoloFecha(fechaIngreso);
    if (ingreso && fecha < ingreso) return false;
    return true;
}

// ¿Abrió el bloque 1 pero nunca el bloque 2?
// Una entrada pertenece al bloque 1 si su hora <= hora_salida del bloque 1;
// después de eso (incluido el hueco de comida) pertenece al bloque 2.
// Solo aplica en días L-V para horarios con 2+ bloques.
function fpTurnoTardeNoCubierto(bloques, entradasMin, esSabado) {
    if (esSabado) return false;
    if (!bloques || bloques.length < 2) return false;
    if (!entradasMin || entradasMin.length === 0) return false; // sin entradas = falta completa

    const finBloque1 = fpMinutosDe(bloques[0].hora_salida);
    const abrioBloque1 = entradasMin.some(m => m <= finBloque1);
    const abrioBloque2 = entradasMin.some(m => m > finBloque1);
    return abrioBloque1 && !abrioBloque2;
}
