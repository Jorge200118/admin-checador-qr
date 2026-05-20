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

// Devuelve el saldo de vacaciones del periodo actual.
// { añoServicio, derecho, tomados, restantes, excedido,
//   periodoInicio, periodoFin, fechaLimite, proximoAniversario, diasParaVencer }
function calcularSaldo(empleado, vacacionesEmpleado, hoyYYYYMMDD) {
    const p = periodoActual(empleado.fecha_ingreso, hoyYYYYMMDD);
    const derecho = diasLFT(p.añoServicio);
    const vacs = (vacacionesEmpleado || []).filter(v => v.tipo === 'VACACION');
    let tomados = 0;
    for (const v of vacs) tomados += _diasJustEnPeriodo(v, p.inicio, p.fin);
    const restantes = Math.max(0, derecho - tomados);
    const diasParaVencer = _diasCalendarioEntre(hoyYYYYMMDD, p.proximoAniversario);
    return {
        añoServicio: p.añoServicio,
        derecho,
        tomados,
        restantes,
        excedido: tomados > derecho,
        periodoInicio: p.inicio,
        periodoFin: p.fin,
        fechaLimite: p.fin,
        proximoAniversario: p.proximoAniversario,
        diasParaVencer
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
        const ini = _sumarAñosLocal(ingreso, año);
        const fin = _restarUnDiaLocal(_sumarAñosLocal(ingreso, año + 1));
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

// Helpers locales (duplicados intencionalmente — vacaciones-lft.js no exporta)
function _sumarAñosLocal(fechaYYYYMMDD, n) {
    const [y, m, d] = fechaYYYYMMDD.split('-').map(Number);
    const nuevoAño = y + n;
    const esBisiesto = (nuevoAño % 4 === 0 && nuevoAño % 100 !== 0) || nuevoAño % 400 === 0;
    let dia = d;
    if (m === 2 && d === 29 && !esBisiesto) dia = 28;
    return `${nuevoAño}-${String(m).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
}
function _restarUnDiaLocal(fechaYYYYMMDD) {
    const [y, m, d] = fechaYYYYMMDD.split('-').map(Number);
    const dt = new Date(y, m - 1, d, 12, 0, 0);
    dt.setDate(dt.getDate() - 1);
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}
