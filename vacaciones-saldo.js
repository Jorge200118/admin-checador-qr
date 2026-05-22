// vacaciones-saldo.js
// Cálculo de saldo, historial y proximidad de vencimiento.
// Depende de vacaciones-lft.js (diasLFT, periodoActual, diasHabilesEntre).

function _diasCalendarioEntre(aYYYYMMDD, bYYYYMMDD) {
    const [y1, m1, d1] = aYYYYMMDD.split('-').map(Number);
    const [y2, m2, d2] = bYYYYMMDD.split('-').map(Number);
    const a = new Date(y1, m1 - 1, d1, 12, 0, 0).getTime();
    const b = new Date(y2, m2 - 1, d2, 12, 0, 0).getTime();
    return Math.round((b - a) / 86400000);
}

function _maxFecha(a, b) { return a > b ? a : b; }
function _minFecha(a, b) { return a < b ? a : b; }

function _diasJustEnPeriodo(just, periodoInicio, periodoFin) {
    const ini = _maxFecha(just.fecha_inicio, periodoInicio);
    const fin = _minFecha(just.fecha_fin, periodoFin);
    if (ini > fin) return 0;
    return diasHabilesEntre(ini, fin);
}

// Suma meses a una fecha YYYY-MM-DD. Maneja overflow de días (ej. 31-mar +1m → 30-abr).
function _sumarMeses(fechaYYYYMMDD, n) {
    const [y, m, d] = fechaYYYYMMDD.split('-').map(Number);
    const dt = new Date(y, m - 1 + n, 1, 12, 0, 0);
    const ultimoDiaMes = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
    const dia = Math.min(d, ultimoDiaMes);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
}

// Devuelve el saldo de vacaciones del periodo actual.
// Estados LFT 2026 (Art. 78, 81):
//   - 'sin_saldo'           → restantes = 0
//   - 'vigente'             → restantes > 0, faltan >30d para el límite LFT (aniversario+6m)
//   - 'por_vencer'          → restantes > 0, faltan ≤30 días para aniversario+6m (Art. 81)
//   - 'vencidas_operativas' → ya pasaron 6m sin disfrutarlas; el patrón incumple Art. 81.
// Nota: el estado 'prescritas' (Art. 516, 18m post-aniversario) aplica a periodos
// pasados, no al actual; se ve reflejado en `historialPeriodos()` como días perdidos.
function calcularSaldo(empleado, vacacionesEmpleado, hoyYYYYMMDD) {
    const p = periodoActual(empleado.fecha_ingreso, hoyYYYYMMDD);
    const derecho = diasLFT(p.añoServicio);
    const vacs = (vacacionesEmpleado || []).filter(v => v.tipo === 'VACACION');
    let tomados = 0;
    for (const v of vacs) tomados += _diasJustEnPeriodo(v, p.inicio, p.fin);
    const restantes = Math.max(0, derecho - tomados);

    // Art. 81 LFT: el patrón debe otorgar las vacaciones dentro de los 6 meses
    // siguientes al cumplimiento del año de servicios → se computa desde el inicio
    // del periodo (aniversario actual), no desde hoy.
    const fechaLimiteLFT = _sumarMeses(p.inicio, 6);
    const diasParaLimiteLFT = _diasCalendarioEntre(hoyYYYYMMDD, fechaLimiteLFT);

    let estado;
    if (restantes <= 0) {
        estado = 'sin_saldo';
    } else if (diasParaLimiteLFT <= 0) {
        estado = 'vencidas_operativas';
    } else if (diasParaLimiteLFT <= 30) {
        estado = 'por_vencer';
    } else {
        estado = 'vigente';
    }

    return {
        añoServicio: p.añoServicio,
        derecho,
        tomados,
        restantes,
        excedido: tomados > derecho,
        periodoInicio: p.inicio,
        periodoFin: p.fin,
        proximoAniversario: p.proximoAniversario,
        // Campos LFT 2026
        fechaLimiteLFT,
        diasParaLimiteLFT,
        estado,
        // Alias legacy (apuntan al nuevo cálculo LFT)
        fechaLimite: fechaLimiteLFT,
        diasParaVencer: diasParaLimiteLFT
    };
}

// Devuelve resumen de los últimos n periodos (más antiguo primero).
// Cada item: { añoServicio, inicio, fin, derecho, tomados, perdidos, esActual }
// perdidos=null para el periodo actual (aún no cerrado).
function historialPeriodos(empleado, vacacionesEmpleado, hoyYYYYMMDD, n = 5) {
    const actual = periodoActual(empleado.fecha_ingreso, hoyYYYYMMDD);
    if (actual.añoServicio < 1) return [];
    const vacs = (vacacionesEmpleado || []).filter(v => v.tipo === 'VACACION');
    const items = [];
    const cantidad = Math.min(n, actual.añoServicio);
    const primerAño = actual.añoServicio - cantidad + 1;
    for (let año = primerAño; año <= actual.añoServicio; año++) {
        const ingreso = empleado.fecha_ingreso;
        const ini = _sumarAños(ingreso, año);
        const fin = _restarUnDia(_sumarAños(ingreso, año + 1));
        const derecho = diasLFT(año);
        let tomados = 0;
        for (const v of vacs) tomados += _diasJustEnPeriodo(v, ini, fin);
        const esActual = (año === actual.añoServicio);
        items.push({
            añoServicio: año,
            inicio: ini,
            fin,
            derecho,
            tomados,
            perdidos: esActual ? null : Math.max(0, derecho - tomados),
            esActual
        });
    }
    return items;
}
