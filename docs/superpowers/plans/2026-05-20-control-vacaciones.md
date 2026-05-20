# Control de Vacaciones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar control de vacaciones (saldo LFT, historial, reportes) sobre la tabla `justificaciones` existente, sin tablas nuevas ni edge functions.

**Architecture:** Todo cálculo es derivado en cliente. Dos módulos puros (`vacaciones-lft.js`, `vacaciones-saldo.js`), integración en ficha del empleado y modal de justificación, y una nueva sección sidebar con tres tabs (Saldos, Por vencer, Calendario).

**Tech Stack:** JS vanilla (igual al resto del repo), Supabase JS client existente, SheetJS (`XLSX`) ya cargado, FontAwesome ya cargado.

**Spec:** `docs/superpowers/specs/2026-05-20-control-vacaciones-design.md`

---

## File Structure

**Crear:**
- `vacaciones-lft.js` — tabla LFT + periodo por aniversario + festivos extendidos
- `vacaciones-saldo.js` — cálculo de saldo, historial, días por vencer
- `vacaciones-ui.js` — render de la sección sidebar (saldos, por vencer, calendario) y bloque en expediente
- `tests/vacaciones.test.html` — runner de pruebas en navegador (sin dependencias)

**Modificar:**
- `Index.html` — agregar item de sidebar "Vacaciones", section vacía con tres tabs, scripts nuevos
- `Admin.js` — integrar saldo en `abrirExpediente`, integrar warning en `guardarJustificacion`, registrar handler de la sección
- `Admin.css` — estilos del bloque vacaciones (mínimos, reusando tokens existentes)

---

## Task 1: Módulo LFT puro (sin DOM)

**Files:**
- Create: `vacaciones-lft.js`
- Test: `tests/vacaciones.test.html`

- [ ] **Step 1: Crear runner de pruebas vacío**

Crear `tests/vacaciones.test.html`:

```html
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Vacaciones tests</title>
<style>body{font-family:monospace;padding:20px}.ok{color:#16a34a}.fail{color:#dc2626}</style>
</head><body>
<h1>Vacaciones — pruebas</h1>
<div id="out"></div>
<script src="../vacaciones-lft.js"></script>
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
  // === diasLFT ===
  test('diasLFT año 0 = 0', () => eq(diasLFT(0), 0));
  test('diasLFT año 1 = 12', () => eq(diasLFT(1), 12));
  test('diasLFT año 2 = 14', () => eq(diasLFT(2), 14));
  test('diasLFT año 3 = 16', () => eq(diasLFT(3), 16));
  test('diasLFT año 4 = 18', () => eq(diasLFT(4), 18));
  test('diasLFT año 5 = 20', () => eq(diasLFT(5), 20));
  test('diasLFT año 6 = 22', () => eq(diasLFT(6), 22));
  test('diasLFT año 10 = 22', () => eq(diasLFT(10), 22));
  test('diasLFT año 11 = 24', () => eq(diasLFT(11), 24));
  test('diasLFT año 15 = 24', () => eq(diasLFT(15), 24));
  test('diasLFT año 16 = 26', () => eq(diasLFT(16), 26));
  test('diasLFT año 25 = 28', () => eq(diasLFT(25), 28));
  test('diasLFT año 30 = 30', () => eq(diasLFT(30), 30));

  // === periodoActual ===
  test('periodoActual antes de cumplir 1 año', () => {
    const r = periodoActual('2026-01-15', '2026-05-20');
    eq(r.añoServicio, 0);
    eq(r.proximoAniversario, '2027-01-15');
  });
  test('periodoActual recién cumplió aniversario', () => {
    const r = periodoActual('2022-03-15', '2026-05-20');
    eq(r.añoServicio, 4); // cumplió 4 el 2026-03-15
    eq(r.inicio, '2026-03-15');
    eq(r.fin, '2027-03-14');
  });
  test('periodoActual aniversario justo hoy', () => {
    const r = periodoActual('2022-05-20', '2026-05-20');
    eq(r.añoServicio, 4);
    eq(r.inicio, '2026-05-20');
  });
  test('periodoActual 29-feb en año no bisiesto', () => {
    const r = periodoActual('2020-02-29', '2026-05-20');
    eq(r.inicio, '2026-02-28'); // colapsa a 28-feb
    eq(r.añoServicio, 6);
  });

  // === esDomingoOFestivo ===
  test('domingo es no laborable', () => eq(esDomingoOFestivo('2026-05-17'), true)); // domingo
  test('lunes es laborable', () => eq(esDomingoOFestivo('2026-05-18'), false));
  test('sábado es laborable', () => eq(esDomingoOFestivo('2026-05-23'), false));
  test('1-ene 2027 es festivo', () => eq(esDomingoOFestivo('2027-01-01'), true));

  // === diasHabilesEntre ===
  test('diasHabilesEntre lun-vie = 5', () => eq(diasHabilesEntre('2026-05-18', '2026-05-22'), 5));
  test('diasHabilesEntre lun-sab = 6', () => eq(diasHabilesEntre('2026-05-18', '2026-05-23'), 6));
  test('diasHabilesEntre lun-dom = 6 (sin contar dom)', () => eq(diasHabilesEntre('2026-05-18', '2026-05-24'), 6));
  test('diasHabilesEntre 1-ene incluido descuenta festivo', () => eq(diasHabilesEntre('2027-01-01', '2027-01-02'), 1));

  out.innerHTML += `<h2>${pass} pasaron, ${fail} fallaron</h2>`;
});
</script></body></html>
```

- [ ] **Step 2: Abrir en navegador y ver que falla**

Abrir `tests/vacaciones.test.html`. Esperado: todos los tests fallan con "diasLFT is not defined".

- [ ] **Step 3: Crear `vacaciones-lft.js` con la implementación mínima**

```javascript
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
    // Detectar 29-feb en año no bisiesto
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

// Devuelve { añoServicio, inicio, fin, proximoAniversario }
// añoServicio = años cumplidos al inicio del periodo (1 = primer año de derecho).
// Si aún no cumple 1 año, añoServicio = 0 y inicio = fechaIngreso.
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

function _añosCompletosEntre(desdeYYYYMMDD, hastaYYYYMMDD) {
    const [y1, m1, d1] = desdeYYYYMMDD.split('-').map(Number);
    const [y2, m2, d2] = hastaYYYYMMDD.split('-').map(Number);
    let años = y2 - y1;
    if (m2 < m1 || (m2 === m1 && d2 < d1)) años -= 1;
    return Math.max(0, años);
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
```

- [ ] **Step 4: Recargar test runner, todos en verde**

Esperado: "21 pasaron, 0 fallaron". Si algo falla, corregir hasta verde.

- [ ] **Step 5: Commit**

```bash
git add vacaciones-lft.js tests/vacaciones.test.html
git commit -m "Vacaciones: modulo LFT puro (tabla, periodo, dias habiles)"
```

---

## Task 2: Módulo de saldo

**Files:**
- Create: `vacaciones-saldo.js`
- Modify: `tests/vacaciones.test.html` (agregar tests)

- [ ] **Step 1: Agregar tests al runner**

En `tests/vacaciones.test.html`, antes de `</script>` del bloque de tests, agregar (dentro del `addEventListener load`, después del último `test(...)` y antes del `out.innerHTML += '<h2>...'`):

```javascript
  // === calcularSaldo ===
  const empA = { fecha_ingreso: '2022-03-15' };
  test('saldo sin vacaciones tomadas', () => {
    const r = calcularSaldo(empA, [], '2026-05-20');
    eq(r.añoServicio, 4);
    eq(r.derecho, 18);
    eq(r.tomados, 0);
    eq(r.restantes, 18);
    eq(r.periodoInicio, '2026-03-15');
    eq(r.fechaLimite, '2027-03-14');
  });

  test('saldo descuenta solo dias dentro del periodo', () => {
    const vacs = [
      // 5 hábiles dentro del periodo actual (lun-vie)
      { tipo: 'VACACION', fecha_inicio: '2026-04-13', fecha_fin: '2026-04-17' }
    ];
    const r = calcularSaldo(empA, vacs, '2026-05-20');
    eq(r.tomados, 5);
    eq(r.restantes, 13);
  });

  test('saldo descuenta solo parte que cae en periodo actual', () => {
    const vacs = [
      // Cruza aniversario 2026-03-15: del 13-mar al 18-mar. Solo 16,17,18 cuentan al periodo nuevo.
      { tipo: 'VACACION', fecha_inicio: '2026-03-13', fecha_fin: '2026-03-18' }
    ];
    const r = calcularSaldo(empA, vacs, '2026-05-20');
    // 16-mar es festivo (3er lunes), 17-mar martes, 18-mar mié → 2 hábiles
    eq(r.tomados, 2);
  });

  test('saldo cero cuando aún no cumple 1 año', () => {
    const r = calcularSaldo({ fecha_ingreso: '2026-01-15' }, [], '2026-05-20');
    eq(r.añoServicio, 0);
    eq(r.derecho, 0);
    eq(r.restantes, 0);
  });

  // === historialPeriodos ===
  test('historial últimos 3 periodos de empleado con 4 años', () => {
    const vacs = [
      { tipo: 'VACACION', fecha_inicio: '2024-04-08', fecha_fin: '2024-04-12' }, // 5 días en periodo 2024-03-15 → 2025-03-14
      { tipo: 'VACACION', fecha_inicio: '2025-06-09', fecha_fin: '2025-06-13' }  // 5 días en periodo 2025-03-15 → 2026-03-14
    ];
    const h = historialPeriodos(empA, vacs, '2026-05-20', 3);
    eq(h.length, 3); // periodos años 2, 3, 4 (año 4 es el actual, los previos cerrados)
    eq(h[0].añoServicio, 2);
    eq(h[0].derecho, 14);
    eq(h[0].tomados, 5);
    eq(h[0].perdidos, 9);
    eq(h[1].añoServicio, 3);
    eq(h[1].derecho, 16);
    eq(h[1].tomados, 5);
    eq(h[1].perdidos, 11);
    eq(h[2].añoServicio, 4);
    eq(h[2].esActual, true);
    eq(h[2].perdidos, null); // periodo actual no tiene perdidos aún
  });

  // === diasParaVencer ===
  test('diasParaVencer cuenta hasta proximo aniversario', () => {
    // hoy 2026-05-20, próximo aniversario 2027-03-15 → 299 días
    const r = calcularSaldo(empA, [], '2026-05-20');
    eq(r.diasParaVencer >= 290 && r.diasParaVencer <= 310, true, `got ${r.diasParaVencer}`);
  });
```

Agregar también el `<script>` para cargar `vacaciones-saldo.js` antes del bloque inline:

```html
<script src="../vacaciones-lft.js"></script>
<script src="../vacaciones-saldo.js"></script>
```

- [ ] **Step 2: Recargar y confirmar que los nuevos fallan**

Esperado: los nuevos tests fallan con "calcularSaldo is not defined" / "historialPeriodos is not defined".

- [ ] **Step 3: Crear `vacaciones-saldo.js`**

```javascript
// vacaciones-saldo.js
// Cálculo de saldo, historial y proximidad de vencimiento.
// Depende de vacaciones-lft.js (diasLFT, periodoActual, diasHabilesEntre).

// Días entre dos fechas YYYY-MM-DD (calendarios, no hábiles).
function _diasCalendarioEntre(aYYYYMMDD, bYYYYMMDD) {
    const [y1, m1, d1] = aYYYYMMDD.split('-').map(Number);
    const [y2, m2, d2] = bYYYYMMDD.split('-').map(Number);
    const a = new Date(y1, m1 - 1, d1, 12, 0, 0).getTime();
    const b = new Date(y2, m2 - 1, d2, 12, 0, 0).getTime();
    return Math.round((b - a) / 86400000);
}

function _maxFecha(a, b) { return a > b ? a : b; }
function _minFecha(a, b) { return a < b ? a : b; }

// Cuenta días hábiles de una justificación que caen dentro de [periodoInicio, periodoFin].
function _diasJustEnPeriodo(just, periodoInicio, periodoFin) {
    const ini = _maxFecha(just.fecha_inicio, periodoInicio);
    const fin = _minFecha(just.fecha_fin, periodoFin);
    if (ini > fin) return 0;
    return diasHabilesEntre(ini, fin);
}

// Saldo del periodo actual.
// vacacionesEmpleado: arreglo de justificaciones con tipo === 'VACACION' del empleado.
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

// Devuelve los últimos N periodos (incluyendo el actual al final).
// Cada item: { añoServicio, inicio, fin, derecho, tomados, perdidos, esActual }
function historialPeriodos(empleado, vacacionesEmpleado, hoyYYYYMMDD, n = 5) {
    const actual = periodoActual(empleado.fecha_ingreso, hoyYYYYMMDD);
    if (actual.añoServicio < 1) return []; // aún sin derecho
    const vacs = (vacacionesEmpleado || []).filter(v => v.tipo === 'VACACION');
    const items = [];
    const cantidad = Math.min(n, actual.añoServicio);
    // años cubiertos: desde (actual.añoServicio - cantidad + 1) hasta actual.añoServicio
    const primerAño = actual.añoServicio - cantidad + 1;
    for (let año = primerAño; año <= actual.añoServicio; año++) {
        // calcular inicio/fin del periodo de ese año
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

// Helpers locales (duplicados de vacaciones-lft.js intencionalmente para no exponer privados).
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
```

- [ ] **Step 4: Recargar test runner, todos en verde**

Esperado: todos los tests pasan. Si alguno falla, corregir.

- [ ] **Step 5: Commit**

```bash
git add vacaciones-saldo.js tests/vacaciones.test.html
git commit -m "Vacaciones: modulo de saldo e historial"
```

---

## Task 3: Bloque "Vacaciones" en el expediente del empleado

**Files:**
- Create: `vacaciones-ui.js`
- Modify: `Index.html` (cargar scripts nuevos)
- Modify: `Admin.js:5803-5818` (insertar bloque después de Antigüedad)

- [ ] **Step 1: Crear `vacaciones-ui.js` con render del bloque**

```javascript
// vacaciones-ui.js
// Render del bloque de vacaciones en el expediente y de la sección sidebar.
// Depende de vacaciones-lft.js y vacaciones-saldo.js.

function _formatFechaCorta(yyyymmdd) {
    if (!yyyymmdd) return '—';
    const [y, m, d] = yyyymmdd.split('-');
    return `${d}/${m}/${y}`;
}

function _hoyYYYYMMDD() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Render del bloque para el expediente.
// empleado: { fecha_ingreso }   vacaciones: justificaciones VACACION del empleado.
function renderBloqueVacacionesExpediente(empleado, vacaciones) {
    if (!empleado || !empleado.fecha_ingreso) {
        return `<div style="color:#94a3b8;font-size:12px;">Sin fecha de ingreso</div>`;
    }
    const hoy = _hoyYYYYMMDD();
    const s = calcularSaldo(empleado, vacaciones, hoy);
    const hist = historialPeriodos(empleado, vacaciones, hoy, 5);

    if (s.añoServicio < 1) {
        return `
        <div style="padding:9px 0;color:#94a3b8;font-size:13px;">
            Aún sin derecho. Cumple 1 año el <strong style="color:#e2e8f0;">${_formatFechaCorta(s.proximoAniversario)}</strong>.
        </div>`;
    }

    const colorRestantes = s.restantes === 0 ? '#ef4444' : (s.restantes <= 3 ? '#f59e0b' : '#22c55e');
    const urgente = s.diasParaVencer <= 60 && s.restantes > 0;
    const avisoVence = urgente
        ? `<div style="margin-top:8px;padding:8px 12px;background:#f59e0b22;border-left:3px solid #f59e0b;border-radius:4px;color:#fbbf24;font-size:12px;">
             <i class="fas fa-exclamation-triangle"></i> Vence en ${s.diasParaVencer} días — usar antes del ${_formatFechaCorta(s.fechaLimite)}
           </div>`
        : '';

    const filaBloque = (lbl, val, color) => `
        <div style="display:flex;padding:9px 0;border-bottom:1px solid #1e293b22;gap:12px;">
            <span style="color:#64748b;font-size:12px;min-width:160px;">${lbl}</span>
            <span style="color:${color || '#e2e8f0'};font-size:13px;">${val}</span>
        </div>`;

    const histFilas = hist.map(p => `
        <tr>
            <td style="padding:6px 8px;color:#94a3b8;font-size:12px;">Año ${p.añoServicio}</td>
            <td style="padding:6px 8px;color:#94a3b8;font-size:12px;">${_formatFechaCorta(p.inicio)} → ${_formatFechaCorta(p.fin)}</td>
            <td style="padding:6px 8px;text-align:right;color:#e2e8f0;font-size:12px;">${p.derecho}</td>
            <td style="padding:6px 8px;text-align:right;color:#3b82f6;font-size:12px;">${p.tomados}</td>
            <td style="padding:6px 8px;text-align:right;color:${p.esActual ? '#22c55e' : (p.perdidos > 0 ? '#ef4444' : '#94a3b8')};font-size:12px;">
                ${p.esActual ? `${p.derecho - p.tomados} actual` : (p.perdidos > 0 ? `−${p.perdidos}` : '0')}
            </td>
        </tr>`).join('');

    return `
        ${filaBloque('Año de servicio', `Año ${s.añoServicio}`)}
        ${filaBloque('Periodo actual', `${_formatFechaCorta(s.periodoInicio)} → ${_formatFechaCorta(s.fechaLimite)}`)}
        ${filaBloque('Derecho LFT', `${s.derecho} días`)}
        ${filaBloque('Tomados', `${s.tomados} días`, '#3b82f6')}
        ${filaBloque('Restantes', `<strong>${s.restantes} días</strong>`, colorRestantes)}
        ${avisoVence}
        <details style="margin-top:12px;">
            <summary style="cursor:pointer;color:#64748b;font-size:12px;padding:6px 0;">
                <i class="fas fa-history"></i> Ver historial (${hist.length} ${hist.length === 1 ? 'periodo' : 'periodos'})
            </summary>
            <table style="width:100%;margin-top:8px;border-collapse:collapse;">
                <thead>
                    <tr style="border-bottom:1px solid #1e293b;">
                        <th style="padding:6px 8px;text-align:left;color:#64748b;font-size:11px;font-weight:600;">Periodo</th>
                        <th style="padding:6px 8px;text-align:left;color:#64748b;font-size:11px;font-weight:600;">Fechas</th>
                        <th style="padding:6px 8px;text-align:right;color:#64748b;font-size:11px;font-weight:600;">Derecho</th>
                        <th style="padding:6px 8px;text-align:right;color:#64748b;font-size:11px;font-weight:600;">Tomados</th>
                        <th style="padding:6px 8px;text-align:right;color:#64748b;font-size:11px;font-weight:600;">Saldo</th>
                    </tr>
                </thead>
                <tbody>${histFilas}</tbody>
            </table>
        </details>`;
}
```

- [ ] **Step 2: Cargar los tres scripts nuevos en `Index.html`**

Buscar la línea donde se carga `Admin.js` y agregar los tres antes:

```html
<script src="vacaciones-lft.js"></script>
<script src="vacaciones-saldo.js"></script>
<script src="vacaciones-ui.js"></script>
<script src="Admin.js"></script>
```

- [ ] **Step 3: Agregar API para traer las vacaciones de un empleado**

En `supabase-config.js`, antes del último `}` del objeto `SupabaseAPI` (al final del archivo), agregar:

```javascript
,
async getVacacionesEmpleado(empleadoId) {
    try {
        const { data, error } = await supabaseClient
            .from('justificaciones')
            .select('id, tipo, fecha_inicio, fecha_fin, motivo')
            .eq('empleado_id', empleadoId)
            .eq('tipo', 'VACACION')
            .is('eliminado_en', null)
            .order('fecha_inicio', { ascending: true });
        if (error) throw error;
        return { success: true, data: data || [] };
    } catch (error) {
        return { success: false, data: [], message: error.message };
    }
}
```

Verificar si el archivo termina con `};` — si sí, agregar la coma y el método ANTES del cierre. Si no estás seguro, abrir el archivo y revisar.

- [ ] **Step 4: Insertar la sección en `abrirExpediente`**

En `Admin.js`, dentro de `abrirExpediente`, después del bloque "Datos Laborales" (línea ~5818, después del closing `` `)} ``), agregar antes del backtick final del template:

```javascript
        // Cargar vacaciones del empleado (no bloquea el render del resto)
        let vacionesHtml = '<div style="color:#64748b;font-size:12px;">Cargando...</div>';
        try {
            const empId = d.IdEmpleado || d.id; // ajustar al nombre real del campo en expediente
            if (empId) {
                const vacRes = await SupabaseAPI.getVacacionesEmpleado(empId);
                if (vacRes.success) {
                    const empMin = { fecha_ingreso: d.FechaIngreso ? d.FechaIngreso.substring(0,10) : null };
                    vacionesHtml = renderBloqueVacacionesExpediente(empMin, vacRes.data);
                }
            }
        } catch (e) { vacionesHtml = '<div style="color:#ef4444;font-size:12px;">No se pudo cargar vacaciones</div>'; }
```

Y agregar la sección al template HTML (después de `${seccion('Datos Laborales', ...)}`):

```javascript
        ${seccion('Vacaciones', 'fa-umbrella-beach', '#3b82f6', vacionesHtml)}
```

NOTA: el await dentro de un template literal no funciona directamente. Solución: declarar `vacionesHtml` ANTES del `cont.innerHTML = ...` y referenciarlo como variable. Hacerlo así:
1. Antes del `cont.innerHTML = \`...`, agregar el bloque `let vacionesHtml = ...; try { ... } catch ...`
2. Dentro del template, usar `${vacionesHtml}`

- [ ] **Step 5: Verificar en navegador**

Abrir Admin, ir a Empleados, abrir expediente de un empleado con > 1 año de antigüedad. Verificar:
- Aparece sección "Vacaciones" con periodo, derecho LFT, tomados, restantes.
- Si tiene ≤ 3 días: restantes en naranja.
- Historial expandible muestra periodos pasados.

Abrir expediente de un empleado con < 1 año: debe decir "Aún sin derecho".

- [ ] **Step 6: Commit**

```bash
git add Index.html supabase-config.js Admin.js vacaciones-ui.js
git commit -m "Vacaciones: bloque de saldo e historial en expediente"
```

---

## Task 4: Saldo en vivo en el modal de Justificación

**Files:**
- Modify: `Admin.js` (funciones del modal de justificación)
- Modify: `Index.html` (markup para mostrar saldo)

- [ ] **Step 1: Agregar contenedor en el modal**

En `Index.html`, dentro del modal de justificación, debajo de `<div id="justDiasResumen" ...></div>` (línea 1399), agregar:

```html
<div id="justVacSaldoBox" style="display:none;margin-top:8px;padding:10px 12px;border-radius:6px;font-size:13px;"></div>
```

- [ ] **Step 2: Cargar vacaciones del empleado al seleccionarlo**

Buscar la función que selecciona empleado en el modal (probablemente `seleccionarEmpleadoJustificacion` o similar — buscar con grep). Al final de esa función, agregar:

```javascript
// Pre-cargar vacaciones para mostrar saldo si tipo === VACACION
window._justVacEmpleadoActual = null;
if (empleadoId) {
    const r = await SupabaseAPI.getVacacionesEmpleado(empleadoId);
    if (r.success) {
        window._justVacEmpleadoActual = {
            empleado: { fecha_ingreso: empleadoSeleccionado.fecha_ingreso?.substring(0,10) || null },
            vacaciones: r.data
        };
    }
}
actualizarSaldoVacacionesEnModal();
```

(El nombre exacto del objeto del empleado seleccionado depende del código actual. Si no tiene `fecha_ingreso`, traerla con una query separada o asegurarse de incluirla en `getEmpleados`.)

- [ ] **Step 3: Crear función `actualizarSaldoVacacionesEnModal`**

Agregar en `Admin.js` cerca del resto de helpers del modal:

```javascript
function actualizarSaldoVacacionesEnModal() {
    const box = document.getElementById('justVacSaldoBox');
    const tipo = document.getElementById('justTipo')?.value;
    const ini = document.getElementById('justFechaInicio')?.value;
    const fin = document.getElementById('justFechaFin')?.value;
    if (!box) return;
    if (tipo !== 'VACACION' || !window._justVacEmpleadoActual) {
        box.style.display = 'none';
        return;
    }
    const { empleado, vacaciones } = window._justVacEmpleadoActual;
    if (!empleado.fecha_ingreso) {
        box.style.display = 'block';
        box.style.background = '#1e293b';
        box.style.color = '#94a3b8';
        box.innerHTML = 'Empleado sin fecha de ingreso registrada';
        return;
    }
    const hoy = _hoyYYYYMMDD();
    const s = calcularSaldo(empleado, vacaciones, hoy);
    if (s.añoServicio < 1) {
        box.style.display = 'block';
        box.style.background = '#1e293b';
        box.style.color = '#fbbf24';
        box.innerHTML = `<i class="fas fa-info-circle"></i> Aún sin derecho. Cumple 1 año el ${_formatFechaCorta(s.proximoAniversario)}.`;
        return;
    }
    let solicitud = 0;
    if (ini && fin && ini <= fin) {
        // Solo cuentan los días dentro del periodo actual
        const iniP = ini < s.periodoInicio ? s.periodoInicio : ini;
        const finP = fin > s.periodoFin ? s.periodoFin : fin;
        if (iniP <= finP) solicitud = diasHabilesEntre(iniP, finP);
    }
    const resultante = s.restantes - solicitud;
    const excede = resultante < 0;
    box.style.display = 'block';
    box.style.background = excede ? '#dc262622' : '#22c55e22';
    box.style.color = excede ? '#fca5a5' : '#86efac';
    box.style.borderLeft = `3px solid ${excede ? '#dc2626' : '#22c55e'}`;
    box.innerHTML = `
        <div><strong>Saldo del periodo:</strong> ${s.restantes} días</div>
        ${solicitud > 0 ? `<div>Esta solicitud: ${solicitud} días → <strong>Quedan: ${resultante} días</strong></div>` : ''}
        ${excede ? '<div style="margin-top:4px;"><i class="fas fa-exclamation-triangle"></i> Excede el saldo; pediremos confirmación al guardar.</div>' : ''}
    `;
}
```

- [ ] **Step 4: Disparar la actualización en cambios de fecha y tipo**

Localizar el handler de `justTipo`, `justFechaInicio`, `justFechaFin` (probablemente `onchange` o un listener). Al final de cada handler relevante, llamar a `actualizarSaldoVacacionesEnModal()`. Si no existe handler aún para `justTipo`, agregar en `Index.html`:

```html
<select id="justTipo" class="form-select" required onchange="actualizarSaldoVacacionesEnModal()">
```

(Solo agregar el `onchange` si no tiene uno; si ya tiene, llamar también ahí.)

- [ ] **Step 5: Bloquear/confirmar al guardar si excede**

En `guardarJustificacion` (Admin.js:~6700), DESPUÉS de la validación de traslape y ANTES del bloque "Confirmación cuando son varios días", agregar:

```javascript
// Aviso si vacación excede saldo del periodo
if (tipo === 'VACACION' && window._justVacEmpleadoActual?.empleado?.fecha_ingreso) {
    const hoy = _hoyYYYYMMDD();
    const s = calcularSaldo(window._justVacEmpleadoActual.empleado, window._justVacEmpleadoActual.vacaciones, hoy);
    if (s.añoServicio >= 1) {
        const iniP = fechaInicio < s.periodoInicio ? s.periodoInicio : fechaInicio;
        const finP = fechaFin > s.periodoFin ? s.periodoFin : fechaFin;
        let solicitud = 0;
        if (iniP <= finP) solicitud = diasHabilesEntre(iniP, finP);
        const resultante = s.restantes - solicitud;
        if (resultante < 0) {
            const ok = confirm(`⚠ Esta solicitud excede el saldo. Le dejará en ${resultante} días. ¿Continuar?`);
            if (!ok) return;
        }
        if (fechaFin < s.periodoInicio) {
            const ok = confirm(`⚠ Estas fechas caen en un periodo ya prescrito (anterior al ${_formatFechaCorta(s.periodoInicio)}). ¿Continuar?`);
            if (!ok) return;
        }
    }
}
```

- [ ] **Step 6: Verificar en navegador**

Abrir Justificaciones → Nueva justificación. Seleccionar empleado con saldo conocido. Cambiar tipo a Vacaciones. Verificar:
- Aparece caja verde con "Saldo del periodo: X días"
- Al elegir fechas, muestra "Esta solicitud: N días → Quedan: M días"
- Si excede: caja roja con aviso
- Al guardar excediendo: pide confirmación

- [ ] **Step 7: Commit**

```bash
git add Index.html Admin.js
git commit -m "Vacaciones: saldo en vivo en modal de justificacion"
```

---

## Task 5: Sección sidebar "Vacaciones" — tab Saldos

**Files:**
- Modify: `Index.html` (sidebar + section)
- Modify: `Admin.js` (handler de sección)
- Modify: `vacaciones-ui.js` (render de tabla)
- Modify: `supabase-config.js` (API para todos los empleados activos + vacaciones del año)

- [ ] **Step 1: Agregar item de sidebar**

En `Index.html`, después del `<li>` de Justificaciones (línea 56-60), agregar:

```html
<li class="nav-item">
    <a href="#vacaciones" data-section="vacaciones">
        <i class="fas fa-umbrella-beach"></i>
        <span>Vacaciones</span>
    </a>
</li>
```

- [ ] **Step 2: Agregar la `<section>` con tabs**

En `Index.html`, después de la section de Justificaciones (después de `</section>` de `#justificaciones`), agregar:

```html
<section id="vacaciones" class="content-section">
    <div class="section-header">
        <h2>Vacaciones</h2>
    </div>

    <div class="filters" style="display:flex;gap:8px;margin-bottom:16px;">
        <button class="btn btn-sm vac-tab vac-tab-active" data-vactab="saldos">Saldos</button>
        <button class="btn btn-sm vac-tab" data-vactab="porvencer">Por vencer</button>
        <button class="btn btn-sm vac-tab" data-vactab="calendario">Calendario</button>
    </div>

    <div id="vacTabSaldos" class="vac-tabpane">
        <div class="filters" style="margin-bottom:12px;">
            <select id="vacFiltSucursal" class="form-select" onchange="renderVacSaldos()">
                <option value="">Todas las sucursales</option>
                <option value="MATRIZ">MATRIZ</option>
                <option value="TAMARAL">TAMARAL</option>
                <option value="CABOS">CABOS</option>
                <option value="LA PAZ">LA PAZ</option>
                <option value="SAN JOSE">SAN JOSE</option>
                <option value="CULIACAN">CULIACAN</option>
                <option value="JUAN JOSE RIOS">JUAN JOSE RIOS</option>
                <option value="EL FUERTE">EL FUERTE</option>
            </select>
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:#475569;">
                <input type="checkbox" id="vacFiltConSaldo" onchange="renderVacSaldos()"> Solo con saldo > 0
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:#475569;">
                <input type="checkbox" id="vacFiltPorVencer" onchange="renderVacSaldos()"> Solo por vencer (< 60 días)
            </label>
            <button class="btn btn-sm" onclick="exportarVacSaldosExcel()">
                <i class="fas fa-file-excel"></i> Excel
            </button>
        </div>
        <div id="vacSaldosTabla">Cargando...</div>
    </div>

    <div id="vacTabPorVencer" class="vac-tabpane" style="display:none;">
        <div id="vacPorVencerLista">Cargando...</div>
    </div>

    <div id="vacTabCalendario" class="vac-tabpane" style="display:none;">
        <div id="vacCalendario">Cargando...</div>
    </div>
</section>
```

- [ ] **Step 3: Agregar API para traer todas las vacaciones desde una fecha**

En `supabase-config.js`, agregar:

```javascript
,
async getTodasVacacionesDesde(fechaInicio) {
    try {
        const { data, error } = await supabaseClient
            .from('justificaciones')
            .select('id, empleado_id, tipo, fecha_inicio, fecha_fin')
            .eq('tipo', 'VACACION')
            .is('eliminado_en', null)
            .gte('fecha_fin', fechaInicio)
            .order('fecha_inicio', { ascending: true });
        if (error) throw error;
        return { success: true, data: data || [] };
    } catch (error) {
        return { success: false, data: [], message: error.message };
    }
}
```

- [ ] **Step 4: Estado y handler de sección**

En `Admin.js`, agregar bloque:

```javascript
// =====================================================
// SECCIÓN VACACIONES
// =====================================================
window._vacState = { empleados: [], vacacionesPorEmp: new Map(), cargado: false };

async function cargarDatosVacaciones() {
    showLoading('Cargando vacaciones...');
    try {
        const empRes = await SupabaseAPI.getEmpleados({ activo: true });
        const empleados = empRes.success ? empRes.data.filter(e => e.activo && e.fecha_ingreso) : [];
        // Traer vacaciones de los últimos 3 años hacia atrás (para historial corto)
        const hace3años = (() => {
            const d = new Date(); d.setFullYear(d.getFullYear() - 3);
            return `${d.getFullYear()}-01-01`;
        })();
        const vacRes = await SupabaseAPI.getTodasVacacionesDesde(hace3años);
        const porEmp = new Map();
        if (vacRes.success) {
            for (const v of vacRes.data) {
                if (!porEmp.has(v.empleado_id)) porEmp.set(v.empleado_id, []);
                porEmp.get(v.empleado_id).push(v);
            }
        }
        window._vacState = { empleados, vacacionesPorEmp: porEmp, cargado: true };
    } finally { hideLoading(); }
}

async function abrirSeccionVacaciones() {
    if (!window._vacState.cargado) await cargarDatosVacaciones();
    cambiarTabVacaciones('saldos');
}

function cambiarTabVacaciones(tab) {
    document.querySelectorAll('.vac-tab').forEach(b => b.classList.remove('vac-tab-active'));
    document.querySelector(`.vac-tab[data-vactab="${tab}"]`)?.classList.add('vac-tab-active');
    document.getElementById('vacTabSaldos').style.display = tab === 'saldos' ? 'block' : 'none';
    document.getElementById('vacTabPorVencer').style.display = tab === 'porvencer' ? 'block' : 'none';
    document.getElementById('vacTabCalendario').style.display = tab === 'calendario' ? 'block' : 'none';
    if (tab === 'saldos') renderVacSaldos();
    if (tab === 'porvencer') renderVacPorVencer();
    if (tab === 'calendario') renderVacCalendario();
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.vac-tab').forEach(b => {
        b.addEventListener('click', () => cambiarTabVacaciones(b.dataset.vactab));
    });
});
```

Localizar el `switch`/router que dispara la carga de cada sección al cambiar de `data-section` y agregar el caso:

```javascript
case 'vacaciones': abrirSeccionVacaciones(); break;
```

- [ ] **Step 5: Render de Saldos en `vacaciones-ui.js`**

Agregar al final de `vacaciones-ui.js`:

```javascript
function _filasVacSaldos() {
    const { empleados, vacacionesPorEmp } = window._vacState;
    const filtSuc = document.getElementById('vacFiltSucursal')?.value || '';
    const soloConSaldo = document.getElementById('vacFiltConSaldo')?.checked;
    const soloPorVencer = document.getElementById('vacFiltPorVencer')?.checked;
    const hoy = _hoyYYYYMMDD();
    const rows = [];
    for (const e of empleados) {
        if (filtSuc && e.sucursal !== filtSuc) continue;
        const vacs = vacacionesPorEmp.get(e.id) || [];
        const s = calcularSaldo({ fecha_ingreso: e.fecha_ingreso?.substring(0,10) }, vacs, hoy);
        if (s.añoServicio < 1) continue;
        if (soloConSaldo && s.restantes <= 0) continue;
        if (soloPorVencer && s.diasParaVencer > 60) continue;
        rows.push({
            id: e.id,
            nombre: `${e.nombre} ${e.apellido || ''}`.trim(),
            sucursal: e.sucursal || '—',
            añoServicio: s.añoServicio,
            derecho: s.derecho,
            tomados: s.tomados,
            restantes: s.restantes,
            fechaLimite: s.fechaLimite,
            diasParaVencer: s.diasParaVencer
        });
    }
    rows.sort((a, b) => a.diasParaVencer - b.diasParaVencer);
    return rows;
}

function renderVacSaldos() {
    if (!window._vacState?.cargado) return;
    const rows = _filasVacSaldos();
    const cont = document.getElementById('vacSaldosTabla');
    if (!cont) return;
    if (rows.length === 0) {
        cont.innerHTML = `<div style="padding:40px;text-align:center;color:#94a3b8;">Sin resultados</div>`;
        return;
    }
    const filas = rows.map(r => {
        const urgente = r.diasParaVencer <= 60 && r.restantes > 0;
        return `
        <tr>
            <td style="padding:8px;">${r.nombre}</td>
            <td style="padding:8px;">${r.sucursal}</td>
            <td style="padding:8px;text-align:center;">Año ${r.añoServicio}</td>
            <td style="padding:8px;text-align:right;">${r.derecho}</td>
            <td style="padding:8px;text-align:right;color:#3b82f6;">${r.tomados}</td>
            <td style="padding:8px;text-align:right;color:${r.restantes === 0 ? '#94a3b8' : (r.restantes <= 3 ? '#f59e0b' : '#22c55e')};font-weight:600;">${r.restantes}</td>
            <td style="padding:8px;text-align:center;color:${urgente ? '#f59e0b' : '#94a3b8'};">
                ${_formatFechaCorta(r.fechaLimite)}
                ${urgente ? `<br><small>${r.diasParaVencer} días</small>` : ''}
            </td>
        </tr>`;
    }).join('');
    cont.innerHTML = `
        <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;">
            <thead style="background:#f1f5f9;">
                <tr>
                    <th style="padding:10px;text-align:left;">Empleado</th>
                    <th style="padding:10px;text-align:left;">Sucursal</th>
                    <th style="padding:10px;text-align:center;">Servicio</th>
                    <th style="padding:10px;text-align:right;">Derecho</th>
                    <th style="padding:10px;text-align:right;">Tomados</th>
                    <th style="padding:10px;text-align:right;">Restantes</th>
                    <th style="padding:10px;text-align:center;">Vence</th>
                </tr>
            </thead>
            <tbody>${filas}</tbody>
        </table>
        <div style="margin-top:8px;color:#94a3b8;font-size:12px;">${rows.length} empleados</div>`;
}

function exportarVacSaldosExcel() {
    const rows = _filasVacSaldos();
    if (rows.length === 0) { alert('Sin datos para exportar'); return; }
    const data = rows.map(r => ({
        Empleado: r.nombre,
        Sucursal: r.sucursal,
        'Año de servicio': r.añoServicio,
        'Derecho LFT': r.derecho,
        Tomados: r.tomados,
        Restantes: r.restantes,
        'Fecha límite': r.fechaLimite,
        'Días para vencer': r.diasParaVencer
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Vacaciones');
    const fechaArchivo = _hoyYYYYMMDD();
    XLSX.writeFile(wb, `vacaciones-saldos-${fechaArchivo}.xlsx`);
}
```

- [ ] **Step 6: Estilos mínimos para los tabs**

En `Admin.css`, agregar:

```css
.vac-tab { background:#e2e8f0; color:#475569; border:none; cursor:pointer; padding:6px 14px; border-radius:6px; }
.vac-tab-active { background:#3b82f6; color:#fff; }
```

- [ ] **Step 7: Verificar en navegador**

Recargar Admin. Verificar:
- Aparece "Vacaciones" en sidebar.
- Click → carga, muestra tabla con saldos.
- Filtrar por sucursal → solo esa sucursal.
- "Solo con saldo > 0" → oculta los que tienen 0.
- "Solo por vencer" → solo los próximos 60 días.
- Botón Excel descarga `.xlsx` con los datos.

- [ ] **Step 8: Commit**

```bash
git add Index.html Admin.js Admin.css supabase-config.js vacaciones-ui.js
git commit -m "Vacaciones: seccion sidebar con tab Saldos y export Excel"
```

---

## Task 6: Tab "Por vencer"

**Files:**
- Modify: `vacaciones-ui.js`

- [ ] **Step 1: Implementar `renderVacPorVencer`**

Agregar en `vacaciones-ui.js`:

```javascript
function renderVacPorVencer() {
    if (!window._vacState?.cargado) return;
    const cont = document.getElementById('vacPorVencerLista');
    if (!cont) return;
    const { empleados, vacacionesPorEmp } = window._vacState;
    const hoy = _hoyYYYYMMDD();
    const rows = [];
    for (const e of empleados) {
        const s = calcularSaldo({ fecha_ingreso: e.fecha_ingreso?.substring(0,10) }, vacacionesPorEmp.get(e.id) || [], hoy);
        if (s.añoServicio < 1) continue;
        if (s.restantes <= 0) continue;
        if (s.diasParaVencer > 60) continue;
        rows.push({
            nombre: `${e.nombre} ${e.apellido || ''}`.trim(),
            sucursal: e.sucursal || '—',
            restantes: s.restantes,
            fechaLimite: s.fechaLimite,
            diasParaVencer: s.diasParaVencer
        });
    }
    rows.sort((a, b) => a.diasParaVencer - b.diasParaVencer);

    if (rows.length === 0) {
        cont.innerHTML = `<div style="padding:40px;text-align:center;color:#22c55e;">
            <i class="fas fa-check-circle" style="font-size:48px;"></i>
            <p style="margin-top:12px;">Nadie con vacaciones por vencer en los próximos 60 días.</p>
        </div>`;
        return;
    }

    const cards = rows.map(r => {
        const color = r.diasParaVencer <= 15 ? '#dc2626' : (r.diasParaVencer <= 30 ? '#f59e0b' : '#3b82f6');
        return `
        <div style="background:#fff;border-left:4px solid ${color};border-radius:8px;padding:16px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">
            <div>
                <div style="font-weight:600;font-size:15px;">${r.nombre}</div>
                <div style="color:#64748b;font-size:13px;margin-top:2px;">${r.sucursal}</div>
            </div>
            <div style="text-align:right;">
                <div style="font-size:14px;color:#1e293b;"><strong>${r.restantes}</strong> días pendientes</div>
                <div style="font-size:12px;color:${color};margin-top:2px;">
                    Vence ${_formatFechaCorta(r.fechaLimite)} (${r.diasParaVencer} días)
                </div>
            </div>
        </div>`;
    }).join('');
    cont.innerHTML = cards;
}
```

- [ ] **Step 2: Verificar en navegador**

Click en tab "Por vencer". Verificar que aparecen tarjetas ordenadas por urgencia.

- [ ] **Step 3: Commit**

```bash
git add vacaciones-ui.js
git commit -m "Vacaciones: tab Por vencer"
```

---

## Task 7: Tab "Calendario"

**Files:**
- Modify: `vacaciones-ui.js`

- [ ] **Step 1: Estado del calendario y render**

Agregar en `vacaciones-ui.js`:

```javascript
window._vacCalState = { mes: null, año: null, sucursal: '' };

function renderVacCalendario() {
    if (!window._vacState?.cargado) return;
    const cont = document.getElementById('vacCalendario');
    if (!cont) return;
    if (window._vacCalState.mes === null) {
        const h = new Date();
        window._vacCalState.mes = h.getMonth();
        window._vacCalState.año = h.getFullYear();
    }
    const { mes, año, sucursal } = window._vacCalState;
    const nombreMes = new Date(año, mes, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });

    // Construir mapa fecha → [nombres] de empleados de vacaciones ese día
    const { empleados, vacacionesPorEmp } = window._vacState;
    const empById = new Map(empleados.map(e => [e.id, e]));
    const diasMes = new Date(año, mes + 1, 0).getDate();
    const porDia = {};
    for (let d = 1; d <= diasMes; d++) porDia[d] = [];

    for (const [empId, vacs] of vacacionesPorEmp.entries()) {
        const emp = empById.get(empId);
        if (!emp || !emp.activo) continue;
        if (sucursal && emp.sucursal !== sucursal) continue;
        const nombre = `${emp.nombre} ${emp.apellido || ''}`.trim();
        for (const v of vacs) {
            const [y1, m1, d1] = v.fecha_inicio.split('-').map(Number);
            const [y2, m2, d2] = v.fecha_fin.split('-').map(Number);
            const ini = new Date(y1, m1 - 1, d1);
            const fin = new Date(y2, m2 - 1, d2);
            const cur = new Date(año, mes, 1);
            const finMes = new Date(año, mes, diasMes);
            const desde = ini > cur ? ini : cur;
            const hasta = fin < finMes ? fin : finMes;
            if (desde > hasta) continue;
            for (let dt = new Date(desde); dt <= hasta; dt.setDate(dt.getDate() + 1)) {
                if (dt.getMonth() === mes) porDia[dt.getDate()].push(nombre);
            }
        }
    }

    // Construir grid de calendario
    const primerDiaSemana = new Date(año, mes, 1).getDay();
    let html = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;">
            <button class="btn btn-sm" onclick="cambiarMesVacCalendario(-1)"><i class="fas fa-chevron-left"></i></button>
            <h3 style="margin:0;text-transform:capitalize;">${nombreMes}</h3>
            <button class="btn btn-sm" onclick="cambiarMesVacCalendario(1)"><i class="fas fa-chevron-right"></i></button>
            <select class="form-select" onchange="cambiarSucursalVacCalendario(this.value)" style="margin-left:12px;">
                <option value="">Todas las sucursales</option>
                ${['MATRIZ','TAMARAL','CABOS','LA PAZ','SAN JOSE','CULIACAN','JUAN JOSE RIOS','EL FUERTE']
                    .map(s => `<option value="${s}" ${s === sucursal ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;background:#e2e8f0;border-radius:8px;padding:4px;">
            ${['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map(d => `<div style="padding:6px;text-align:center;font-weight:600;color:#64748b;font-size:12px;">${d}</div>`).join('')}`;

    // Días en blanco antes del primero
    for (let i = 0; i < primerDiaSemana; i++) {
        html += `<div style="background:#f8fafc;border-radius:4px;min-height:80px;"></div>`;
    }
    for (let d = 1; d <= diasMes; d++) {
        const lista = porDia[d];
        const tieneGente = lista.length > 0;
        const chips = lista.slice(0, 3).map(n =>
            `<div style="background:#3b82f622;color:#1e40af;border-radius:3px;padding:1px 5px;font-size:10px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${n}">${n}</div>`
        ).join('');
        const masN = lista.length > 3 ? `<div style="font-size:10px;color:#64748b;margin-top:2px;">+${lista.length - 3} más</div>` : '';
        html += `
            <div style="background:#fff;border-radius:4px;min-height:80px;padding:4px;border:${tieneGente ? '1px solid #3b82f6' : '1px solid #f1f5f9'};">
                <div style="font-size:11px;color:#64748b;font-weight:600;">${d}</div>
                ${chips}${masN}
            </div>`;
    }
    html += `</div>`;
    cont.innerHTML = html;
}

function cambiarMesVacCalendario(delta) {
    let m = window._vacCalState.mes + delta;
    let y = window._vacCalState.año;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    window._vacCalState.mes = m;
    window._vacCalState.año = y;
    renderVacCalendario();
}

function cambiarSucursalVacCalendario(v) {
    window._vacCalState.sucursal = v;
    renderVacCalendario();
}
```

- [ ] **Step 2: Verificar en navegador**

Click en tab Calendario:
- Aparece grilla del mes actual con chips por empleado fuera.
- Flechas cambian de mes.
- Cambiar sucursal filtra los chips.
- Días sin vacaciones quedan vacíos.

- [ ] **Step 3: Commit**

```bash
git add vacaciones-ui.js
git commit -m "Vacaciones: tab Calendario"
```

---

## Task 8: Pruebas de humo y cierre

**Files:** ninguno (solo verificación manual)

- [ ] **Step 1: Smoke test del flujo completo**

Verificar en navegador:

1. **Expediente:** empleado con > 1 año → bloque de vacaciones con datos correctos.
2. **Expediente:** empleado < 1 año → "Aún sin derecho".
3. **Modal nueva justificación VACACION:**
   - Caja de saldo aparece al elegir VACACION
   - Cambia al elegir fechas
   - Excede saldo → caja roja
   - Guardar excediendo → pide confirmación
4. **Sección Vacaciones → Saldos:**
   - Carga tabla
   - Filtrar por sucursal funciona
   - "Con saldo > 0" funciona
   - "Por vencer" funciona
   - Excel descarga con datos correctos
5. **Sección Vacaciones → Por vencer:** muestra ordenado por urgencia.
6. **Sección Vacaciones → Calendario:**
   - Mes actual por default
   - Flechas cambian de mes
   - Sucursal filtra chips
7. **Empleado inactivo:** no aparece en Saldos / Por vencer / Calendario.

- [ ] **Step 2: Validar pruebas unitarias siguen verdes**

Abrir `tests/vacaciones.test.html` y confirmar que todos los tests siguen pasando.

- [ ] **Step 3: Commit final (si hubo ajustes)**

Si durante el smoke encontraste algo, corregir y commit. Si todo bien, no hay commit.

---

## Notas para el implementador

- **Nombres de campos:** los snippets asumen que `empleados` tiene `id`, `nombre`, `apellido`, `sucursal`, `fecha_ingreso`, `activo`. Si los nombres reales difieren, ajustar al insertar.
- **`d.IdEmpleado || d.id` en Task 3:** revisar cómo viene el ID en la respuesta del endpoint `/empleados/expediente/:codigo`. Si el campo es diferente, ajustar.
- **`d.FechaIngreso`:** puede venir como ISO completo o solo fecha; el código corta con `.substring(0,10)`.
- **Sucursales:** la lista hardcoded de 8 sucursales se repite en varios lugares del proyecto (Index.html:610-617). No es ideal, pero está fuera de scope refactorizarlo.
- **DRY:** Si decides extraer helpers comunes (`_formatFechaCorta`, `_hoyYYYYMMDD`) a un solo módulo, hazlo. Pero no es bloqueante.
