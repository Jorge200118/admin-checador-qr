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
