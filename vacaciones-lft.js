// vacaciones-lft.js
// Módulo puro: tabla LFT, periodo por aniversario, festivos, días hábiles.
// Sin DOM, sin Supabase. Funciones globales (igual patrón que Admin.js).

// Festivos LFT por año. Renovable cada enero.
const FESTIVOS_VAC = new Set([
    // 2026
    '2026-01-01','2026-02-02','2026-03-16','2026-05-01',
    '2026-09-16','2026-11-16','2026-12-25',
    // 2027
    '2027-01-01','2027-02-01','2027-03-15','2027-05-01',
    '2027-09-16','2027-11-15','2027-12-25'
]);

function esDomingoOFestivo(fechaYYYYMMDD) {
    const [y, m, d] = fechaYYYYMMDD.split('-').map(Number);
    const date = new Date(y, m - 1, d, 12, 0, 0);
    if (date.getDay() === 0) return true;
    return FESTIVOS_VAC.has(fechaYYYYMMDD);
}

function diasLFT(añosCumplidos) {
    if (añosCumplidos < 1) return 0;
    if (añosCumplidos === 1) return 12;
    if (añosCumplidos === 2) return 14;
    if (añosCumplidos === 3) return 16;
    if (añosCumplidos === 4) return 18;
    if (añosCumplidos === 5) return 20;
    // A partir del año 6: 22, y +2 cada 5 años (11-15: 24, 16-20: 26, ...)
    const bloque = Math.floor((añosCumplidos - 6) / 5);
    return 22 + bloque * 2;
}

// Suma años respetando 29-feb → 28-feb en años no bisiestos
function _sumarAños(fechaYYYYMMDD, n) {
    const [y, m, d] = fechaYYYYMMDD.split('-').map(Number);
    const nuevoAño = y + n;
    const esBisiesto = (nuevoAño % 4 === 0 && nuevoAño % 100 !== 0) || nuevoAño % 400 === 0;
    let dia = d;
    if (m === 2 && d === 29 && !esBisiesto) dia = 28;
    return `${nuevoAño}-${String(m).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
}

function _restarUnDia(fechaYYYYMMDD) {
    const [y, m, d] = fechaYYYYMMDD.split('-').map(Number);
    const dt = new Date(y, m - 1, d, 12, 0, 0);
    dt.setDate(dt.getDate() - 1);
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
}

function _añosCompletosEntre(desdeYYYYMMDD, hastaYYYYMMDD) {
    const [y1, m1, d1] = desdeYYYYMMDD.split('-').map(Number);
    const [y2, m2, d2] = hastaYYYYMMDD.split('-').map(Number);
    let años = y2 - y1;
    if (m2 < m1 || (m2 === m1 && d2 < d1)) años -= 1;
    return Math.max(0, años);
}

// Devuelve { añoServicio, inicio, fin, proximoAniversario }
function periodoActual(fechaIngresoYYYYMMDD, hoyYYYYMMDD) {
    const ingreso = fechaIngresoYYYYMMDD;
    const hoy = hoyYYYYMMDD;
    const añosBrutos = _añosCompletosEntre(ingreso, hoy);
    if (añosBrutos < 1) {
        return {
            añoServicio: 0,
            inicio: ingreso,
            fin: _restarUnDia(_sumarAños(ingreso, 1)),
            proximoAniversario: _sumarAños(ingreso, 1)
        };
    }
    const inicio = _sumarAños(ingreso, añosBrutos);
    const proximo = _sumarAños(ingreso, añosBrutos + 1);
    return {
        añoServicio: añosBrutos,
        inicio,
        fin: _restarUnDia(proximo),
        proximoAniversario: proximo
    };
}

// Cuenta días entre dos fechas YYYY-MM-DD (inclusivo) excluyendo domingos y festivos.
function diasHabilesEntre(inicioYYYYMMDD, finYYYYMMDD) {
    if (inicioYYYYMMDD > finYYYYMMDD) return 0;
    let count = 0;
    const [y, m, d] = inicioYYYYMMDD.split('-').map(Number);
    let cur = new Date(y, m - 1, d, 12, 0, 0);
    const [yf, mf, df] = finYYYYMMDD.split('-').map(Number);
    const fin = new Date(yf, mf - 1, df, 12, 0, 0);
    while (cur <= fin) {
        const yy = cur.getFullYear();
        const mm = String(cur.getMonth() + 1).padStart(2, '0');
        const dd = String(cur.getDate()).padStart(2, '0');
        const fechaStr = `${yy}-${mm}-${dd}`;
        if (!esDomingoOFestivo(fechaStr)) count++;
        cur.setDate(cur.getDate() + 1);
    }
    return count;
}
