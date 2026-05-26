# Reporte de Rotación por Puesto — Plan de Implementación (Fase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar al panel admin un reporte de rotación por puesto × sucursal con rango de fechas configurable, leyendo de BMS vía un nuevo endpoint del ERP.

**Architecture:** Un endpoint público nuevo en el backend ERP (`Pagos_Backend/routes/empleados.js`) calcula rotación agrupada por puesto+sucursal con SQL sobre `BMSCabos.dbo.empleados`. El admin (`Admin.js` + `Index.html`) lo consume en una sub-sección nueva de Estadísticas, con tabla filtrable/ordenable y export a Excel.

**Tech Stack:** Node/Express + mssql (backend ERP); JS vanilla + Chart.js/XLSX + Supabase JS (admin frontend). Sin framework de test en ningún repo → verificación con `node --check`, `curl` y navegador.

**Spec:** `docs/superpowers/specs/2026-05-26-rotacion-por-puesto-design.md`

---

## File Structure

- **`Portal Pagos Proveedores/Pagos_Backend/routes/empleados.js`** (modificar) — agregar ruta `GET /rotacion` entre las rutas públicas existentes (antes de `router.use(authMiddleware)` en la línea ~685).
- **`V2 checador-system ADMIN/Index.html`** (modificar) — agregar bloque HTML de "Rotación por Puesto" dentro de `<section id="estadisticas">`.
- **`V2 checador-system ADMIN/Admin.js`** (modificar) — agregar funciones de carga/render/filtro/orden/export + mapa de sucursales + exponer en `window`.

Dos repos = dos commits independientes. El backend ERP es local (no git con remoto); el admin se commitea a `main` (push solo con OK del usuario).

---

## Task 1: Endpoint `/rotacion` en el backend ERP

**Files:**
- Modify: `Portal Pagos Proveedores/Pagos_Backend/routes/empleados.js` (insertar antes de `router.use(authMiddleware);`, ~línea 685)

- [ ] **Step 1: Insertar la ruta `/rotacion`**

Insertar este bloque justo ANTES de la línea `router.use(authMiddleware);`:

```javascript
// ──────────────────────────────────────────────────────────────────────────────
// ROTACIÓN POR PUESTO × SUCURSAL (rango de fechas configurable)
// Ruta pública — consumida desde el Admin Panel (sección Estadísticas)
// %Rotación = Bajas / ((Plantilla_Inicial + Plantilla_Final) / 2) × 100
// Convención BMS: fecha_baja = '2078-12-31' ⇒ empleado activo.
// ──────────────────────────────────────────────────────────────────────────────
router.get('/rotacion', async (req, res) => {
    try {
        const { desde, hasta, sucursal } = req.query;

        const reFecha = /^\d{4}-\d{2}-\d{2}$/;
        if (!reFecha.test(desde || '') || !reFecha.test(hasta || '')) {
            return res.status(400).json({
                success: false,
                message: 'Parámetros desde/hasta requeridos en formato YYYY-MM-DD'
            });
        }

        const pool = await getConnection();
        const request = pool.request()
            .input('desde', sql.Date, desde)
            .input('hasta', sql.Date, hasta);

        let filtroSucursal = '';
        if (sucursal) {
            request.input('sucursal', sql.NVarChar, sucursal);
            filtroSucursal = `AND e.grupo_nomina IN (
                SELECT gn.grupo_nomina FROM BMSCabos.dbo.grupos_nomina gn
                WHERE LTRIM(RTRIM(UPPER(gn.nombre))) = UPPER(@sucursal)
            )`;
        }

        const result = await request.query(`
            SELECT
                ISNULL(LTRIM(RTRIM(p.nombre)), LTRIM(RTRIM(e.puesto)))         AS puesto,
                ISNULL(LTRIM(RTRIM(gn.nombre)), LTRIM(RTRIM(e.grupo_nomina)))  AS sucursal,
                SUM(CASE WHEN CAST(e.fecha_ingreso AS DATE) < @desde
                          AND (CAST(e.fecha_baja AS DATE) = '2078-12-31'
                               OR CAST(e.fecha_baja AS DATE) >= @desde)
                         THEN 1 ELSE 0 END) AS plantilla_inicial,
                SUM(CASE WHEN CAST(e.fecha_ingreso AS DATE) >= @desde
                          AND CAST(e.fecha_ingreso AS DATE) <= @hasta
                         THEN 1 ELSE 0 END) AS contrataciones,
                SUM(CASE WHEN CAST(e.fecha_baja AS DATE) != '2078-12-31'
                          AND CAST(e.fecha_baja AS DATE) >= @desde
                          AND CAST(e.fecha_baja AS DATE) <= @hasta
                         THEN 1 ELSE 0 END) AS bajas,
                SUM(CASE WHEN CAST(e.fecha_ingreso AS DATE) <= @hasta
                          AND (CAST(e.fecha_baja AS DATE) = '2078-12-31'
                               OR CAST(e.fecha_baja AS DATE) > @hasta)
                         THEN 1 ELSE 0 END) AS plantilla_final
            FROM BMSCabos.dbo.empleados e
            LEFT JOIN BMSCabos.dbo.puestos p
                ON LTRIM(RTRIM(e.puesto)) = LTRIM(RTRIM(p.puesto))
            LEFT JOIN BMSCabos.dbo.grupos_nomina gn
                ON LTRIM(RTRIM(e.grupo_nomina)) = LTRIM(RTRIM(gn.grupo_nomina))
            WHERE e.nombre_completo IS NOT NULL
              AND e.puesto IS NOT NULL AND LTRIM(RTRIM(e.puesto)) != ''
            ${filtroSucursal}
            GROUP BY
                ISNULL(LTRIM(RTRIM(p.nombre)), LTRIM(RTRIM(e.puesto))),
                ISNULL(LTRIM(RTRIM(gn.nombre)), LTRIM(RTRIM(e.grupo_nomina)))
            HAVING
                SUM(CASE WHEN CAST(e.fecha_ingreso AS DATE) < @desde
                          AND (CAST(e.fecha_baja AS DATE) = '2078-12-31'
                               OR CAST(e.fecha_baja AS DATE) >= @desde)
                         THEN 1 ELSE 0 END)
              + SUM(CASE WHEN CAST(e.fecha_ingreso AS DATE) >= @desde
                          AND CAST(e.fecha_ingreso AS DATE) <= @hasta
                         THEN 1 ELSE 0 END)
              + SUM(CASE WHEN CAST(e.fecha_baja AS DATE) != '2078-12-31'
                          AND CAST(e.fecha_baja AS DATE) >= @desde
                          AND CAST(e.fecha_baja AS DATE) <= @hasta
                         THEN 1 ELSE 0 END)
              + SUM(CASE WHEN CAST(e.fecha_ingreso AS DATE) <= @hasta
                          AND (CAST(e.fecha_baja AS DATE) = '2078-12-31'
                               OR CAST(e.fecha_baja AS DATE) > @hasta)
                         THEN 1 ELSE 0 END) > 0
            ORDER BY puesto, sucursal
        `);

        const data = result.recordset.map(r => {
            const promedio = (r.plantilla_inicial + r.plantilla_final) / 2;
            const tasa = promedio > 0 ? ((r.bajas / promedio) * 100).toFixed(1) : '0.0';
            return { ...r, tasa };
        });

        res.json({ success: true, data, periodo: { desde, hasta } });
    } catch (error) {
        console.error('Error en /rotacion:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

```

- [ ] **Step 2: Verificar sintaxis**

Run: `node --check "C:/Users/USUARIO/Desktop/Portal Pagos Proveedores/Pagos_Backend/routes/empleados.js"`
Expected: sin salida (exit 0)

- [ ] **Step 3: Levantar el backend y probar el endpoint en vivo**

Levantar el server (en su carpeta): `npm start` (corre `node server.js`).
Luego, en otra terminal, probar con un rango conocido:

Run: `curl "http://localhost:PUERTO/api/empleados/rotacion?desde=2025-01-01&hasta=2025-12-31"`
(PUERTO = el que use `server.js`; revisar el `console.log` de arranque o `.env`.)

Expected: JSON `{ "success": true, "data": [ {puesto, sucursal, plantilla_inicial, contrataciones, bajas, plantilla_final, tasa}, ... ], "periodo": {...} }`.
Verificar contra el Excel `250826 Analisis Rotación por puesto.xlsx`: ej. CHOFER en LMM (MATRIZ) debería rondar plantilla_inicial≈11, contrataciones≈12, bajas≈7, plantilla_final≈16.

- [ ] **Step 4: Probar validación de parámetros**

Run: `curl "http://localhost:PUERTO/api/empleados/rotacion?desde=mal"`
Expected: HTTP 400, `{ "success": false, "message": "Parámetros desde/hasta requeridos en formato YYYY-MM-DD" }`

- [ ] **Step 5: Commit (backend ERP)**

```bash
cd "C:/Users/USUARIO/Desktop/Portal Pagos Proveedores/Pagos_Backend"
git add routes/empleados.js
git commit -m "Empleados: endpoint /rotacion por puesto y sucursal"
```
(Si el repo no está bajo git, omitir el commit; el cambio queda en el archivo. El backend se despliega como ya esté configurado en el servidor del ERP/ngrok.)

---

## Task 2: HTML de la sub-sección "Rotación por Puesto"

**Files:**
- Modify: `V2 checador-system ADMIN/Index.html` (dentro de `<section id="estadisticas">`, después del bloque de la tabla de rotación mensual existente)

- [ ] **Step 1: Localizar el punto de inserción**

Run: `grep -n "tbodyRotacion\b\|id=\"estadisticas\"\|</section>" "C:/Users/USUARIO/Desktop/V2 checador-system ADMIN/Index.html"`
Expected: ubica `id="estadisticas"` (~806) y el `<tbody id="tbodyRotacion">` de la tabla mensual. Insertar el bloque nuevo justo DESPUÉS del contenedor (card) que cierra esa tabla mensual y ANTES de cerrar `</section>` de estadísticas.

- [ ] **Step 2: Insertar el bloque HTML**

Insertar este HTML en el punto localizado:

```html
<!-- Rotación por Puesto -->
<div class="card" style="margin-top:24px">
    <div class="card-body">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px">
            <h3 style="margin:0;font-size:16px;font-weight:600">Rotación por Puesto</h3>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <label style="font-size:12px;color:#94a3b8">Desde
                    <input type="date" id="rotPuestoDesde" style="margin-left:4px;padding:4px 8px;border-radius:6px;border:1px solid #334155;background:#1e293b;color:#e2e8f0">
                </label>
                <label style="font-size:12px;color:#94a3b8">Hasta
                    <input type="date" id="rotPuestoHasta" style="margin-left:4px;padding:4px 8px;border-radius:6px;border:1px solid #334155;background:#1e293b;color:#e2e8f0">
                </label>
                <select id="rotPuestoFiltroSucursal" onchange="filtrarRotacionPuesto()" style="padding:4px 8px;border-radius:6px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;font-size:12px">
                    <option value="">Todas las sucursales</option>
                </select>
                <select id="rotPuestoFiltroPuesto" onchange="filtrarRotacionPuesto()" style="padding:4px 8px;border-radius:6px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;font-size:12px">
                    <option value="">Todos los puestos</option>
                </select>
                <button class="btn btn-primary" onclick="cargarRotacionPuesto()"><i class="fas fa-sync-alt"></i> Generar</button>
                <button class="btn btn-success" onclick="exportarRotacionPuestoExcel()"><i class="fas fa-file-excel"></i> Excel</button>
            </div>
        </div>
        <div class="table-container">
            <table id="rotacionPuestoTable">
                <thead>
                    <tr>
                        <th onclick="ordenarRotacionPuesto('puesto')" style="cursor:pointer">Puesto <i class="fas fa-sort"></i></th>
                        <th onclick="ordenarRotacionPuesto('sucursal')" style="cursor:pointer">Sucursal <i class="fas fa-sort"></i></th>
                        <th onclick="ordenarRotacionPuesto('plantilla_inicial')" style="cursor:pointer;text-align:right">Plantilla Ini <i class="fas fa-sort"></i></th>
                        <th onclick="ordenarRotacionPuesto('contrataciones')" style="cursor:pointer;text-align:right">Contrataciones <i class="fas fa-sort"></i></th>
                        <th onclick="ordenarRotacionPuesto('bajas')" style="cursor:pointer;text-align:right">Bajas <i class="fas fa-sort"></i></th>
                        <th onclick="ordenarRotacionPuesto('plantilla_final')" style="cursor:pointer;text-align:right">Plantilla Fin <i class="fas fa-sort"></i></th>
                        <th onclick="ordenarRotacionPuesto('tasa')" style="cursor:pointer;text-align:right">%Rotación <i class="fas fa-sort"></i></th>
                    </tr>
                </thead>
                <tbody id="tbodyRotacionPuesto">
                    <tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:24px">Elige un rango y pulsa Generar</td></tr>
                </tbody>
            </table>
        </div>
    </div>
</div>
```

- [ ] **Step 3: Verificar inserción**

Run: `grep -n "tbodyRotacionPuesto\|rotPuestoDesde\|cargarRotacionPuesto" "C:/Users/USUARIO/Desktop/V2 checador-system ADMIN/Index.html"`
Expected: aparecen las 3 referencias dentro de la sección estadísticas.

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/USUARIO/Desktop/V2 checador-system ADMIN"
git add Index.html
git commit -m "Rotacion por puesto: HTML de la sub-seccion en Estadisticas"
```

---

## Task 3: Lógica JS — carga, render, filtros, orden, export

**Files:**
- Modify: `V2 checador-system ADMIN/Admin.js` (agregar bloque de funciones; insertar tras `exportarEstadisticasExcel()` ~línea 7712)
- Modify: `V2 checador-system ADMIN/Admin.js` (exponer funciones en `window`, junto a `window.exportarEstadisticasExcel` o al final del archivo)

- [ ] **Step 1: Agregar el mapa de sucursales, estado y funciones**

Insertar DESPUÉS de la función `exportarEstadisticasExcel()`:

```javascript
// ================================
// ROTACIÓN POR PUESTO
// ================================

// Mapa nombre BMS → código corto (los Excel de RH usan códigos)
const SUCURSAL_CODIGO = {
    'MATRIZ': 'LMM',
    'CABOS': 'CSL',
    'SAN JOSE': 'SJC',
    'LA PAZ': 'LPZ',
    'TAMARAL': 'TML',
    'EL FUERTE': 'FTE',
    'CULIACAN': 'CLN',
    'JUAN JOSE RIOS': 'JJR'
};

function _codigoSucursal(nombre) {
    if (!nombre) return '—';
    const key = String(nombre).trim().toUpperCase();
    return SUCURSAL_CODIGO[key] || nombre;
}

let _rotPuestoDatos = [];   // cache del último fetch (sin filtrar)
let _ordenRotPuesto = { columna: null, direccion: 'asc' };

// default de fechas: 1-ene del año actual → hoy
function _initFechasRotPuesto() {
    const hoy = new Date();
    const inputDesde = document.getElementById('rotPuestoDesde');
    const inputHasta = document.getElementById('rotPuestoHasta');
    if (inputDesde && !inputDesde.value) {
        inputDesde.value = `${hoy.getFullYear()}-01-01`;
    }
    if (inputHasta && !inputHasta.value) {
        const m = String(hoy.getMonth() + 1).padStart(2, '0');
        const d = String(hoy.getDate()).padStart(2, '0');
        inputHasta.value = `${hoy.getFullYear()}-${m}-${d}`;
    }
}

async function cargarRotacionPuesto() {
    _initFechasRotPuesto();
    const desde = document.getElementById('rotPuestoDesde')?.value;
    const hasta = document.getElementById('rotPuestoHasta')?.value;
    const tbody = document.getElementById('tbodyRotacionPuesto');
    if (!desde || !hasta) return;
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:24px">Cargando…</td></tr>';

    try {
        const params = new URLSearchParams({ desde, hasta });
        if (window.currentUserSucursal) params.set('sucursal', window.currentUserSucursal);
        const res = await fetch(`${ADMIN_CONFIG.apiUrl}/empleados/rotacion?${params}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.message);

        _rotPuestoDatos = json.data || [];
        _poblarFiltrosRotPuesto();
        filtrarRotacionPuesto();
    } catch (err) {
        console.error('cargarRotacionPuesto:', err);
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#ef4444;padding:24px">Error: ${err.message}</td></tr>`;
    }
}

// Llena los dropdowns de puesto y sucursal con los valores presentes en los datos
function _poblarFiltrosRotPuesto() {
    const selSuc = document.getElementById('rotPuestoFiltroSucursal');
    const selPue = document.getElementById('rotPuestoFiltroPuesto');
    if (selSuc) {
        const cods = [...new Set(_rotPuestoDatos.map(r => _codigoSucursal(r.sucursal)))].sort();
        selSuc.innerHTML = '<option value="">Todas las sucursales</option>' +
            cods.map(c => `<option value="${c}">${c}</option>`).join('');
    }
    if (selPue) {
        const pues = [...new Set(_rotPuestoDatos.map(r => r.puesto))].sort();
        selPue.innerHTML = '<option value="">Todos los puestos</option>' +
            pues.map(p => `<option value="${p}">${p}</option>`).join('');
    }
}

// Devuelve los datos tras aplicar filtros de puesto/sucursal y el orden actual
function _datosRotPuestoVisibles() {
    const fSuc = document.getElementById('rotPuestoFiltroSucursal')?.value || '';
    const fPue = document.getElementById('rotPuestoFiltroPuesto')?.value || '';
    let rows = _rotPuestoDatos.filter(r =>
        (!fSuc || _codigoSucursal(r.sucursal) === fSuc) &&
        (!fPue || r.puesto === fPue)
    );

    if (_ordenRotPuesto.columna) {
        const col = _ordenRotPuesto.columna;
        const dir = _ordenRotPuesto.direccion;
        rows = [...rows].sort((a, b) => {
            let va, vb;
            if (col === 'puesto') { va = a.puesto || ''; vb = b.puesto || ''; }
            else if (col === 'sucursal') { va = _codigoSucursal(a.sucursal); vb = _codigoSucursal(b.sucursal); }
            else if (col === 'tasa') { va = parseFloat(a.tasa) || 0; vb = parseFloat(b.tasa) || 0; }
            else { va = Number(a[col]) || 0; vb = Number(b[col]) || 0; }
            if (typeof va === 'string') return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
            return dir === 'asc' ? va - vb : vb - va;
        });
    }
    return rows;
}

function filtrarRotacionPuesto() {
    _renderTablaRotacionPuesto(_datosRotPuestoVisibles());
    _actualizarIconosOrdenRotPuesto();
}

function ordenarRotacionPuesto(columna) {
    if (_ordenRotPuesto.columna === columna) {
        _ordenRotPuesto.direccion = _ordenRotPuesto.direccion === 'asc' ? 'desc' : 'asc';
    } else {
        _ordenRotPuesto.columna = columna;
        _ordenRotPuesto.direccion = 'asc';
    }
    filtrarRotacionPuesto();
}

function _actualizarIconosOrdenRotPuesto() {
    const headers = document.querySelectorAll('#rotacionPuestoTable thead th[onclick]');
    headers.forEach(th => {
        const icono = th.querySelector('i');
        if (!icono) return;
        const m = th.getAttribute('onclick').match(/ordenarRotacionPuesto\('([^']+)'\)/);
        const c = m ? m[1] : null;
        icono.className = (c === _ordenRotPuesto.columna)
            ? (_ordenRotPuesto.direccion === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down')
            : 'fas fa-sort';
    });
}

function _colorTasaRot(tasa) {
    return tasa > 40 ? '#ef4444' : tasa > 20 ? '#f59e0b' : '#10b981';
}

function _renderTablaRotacionPuesto(rows) {
    const tbody = document.getElementById('tbodyRotacionPuesto');
    if (!tbody) return;
    if (!rows || !rows.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:24px">Sin datos de rotación</td></tr>';
        return;
    }

    const tot = rows.reduce((a, r) => ({
        pi: a.pi + r.plantilla_inicial,
        c:  a.c  + r.contrataciones,
        b:  a.b  + r.bajas,
        pf: a.pf + r.plantilla_final
    }), { pi: 0, c: 0, b: 0, pf: 0 });
    const promTot = (tot.pi + tot.pf) / 2;
    const tasaTot = promTot > 0 ? ((tot.b / promTot) * 100).toFixed(1) : '0.0';

    const filas = rows.map(r => {
        const tasa = parseFloat(r.tasa) || 0;
        const color = _colorTasaRot(tasa);
        const bg = tasa > 40 ? 'rgba(239,68,68,.12)' : tasa > 20 ? 'rgba(245,158,11,.12)' : 'rgba(16,185,129,.12)';
        const barW = Math.min(100, tasa).toFixed(1);
        return `
        <tr>
            <td style="padding:10px 16px;font-size:13px;font-weight:600">${r.puesto}</td>
            <td style="padding:10px 16px;font-size:13px">${_codigoSucursal(r.sucursal)}</td>
            <td style="padding:10px 16px;text-align:right;font-size:13px">${r.plantilla_inicial}</td>
            <td style="padding:10px 16px;text-align:right;font-size:13px;color:#10b981;font-weight:600">+${r.contrataciones}</td>
            <td style="padding:10px 16px;text-align:right;font-size:13px;color:#ef4444;font-weight:600">−${r.bajas}</td>
            <td style="padding:10px 16px;text-align:right;font-size:13px">${r.plantilla_final}</td>
            <td style="padding:10px 16px">
                <div style="display:flex;align-items:center;gap:10px;justify-content:flex-end">
                    <div style="flex:1;max-width:70px;height:5px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden">
                        <div style="width:${barW}%;height:100%;background:${color};border-radius:3px"></div>
                    </div>
                    <span style="background:${bg};color:${color};padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;min-width:52px;text-align:center">${r.tasa}%</span>
                </div>
            </td>
        </tr>`;
    }).join('');

    const filaTotal = `
        <tr style="border-top:2px solid #334155;font-weight:700">
            <td style="padding:10px 16px;font-size:13px">TOTAL</td>
            <td></td>
            <td style="padding:10px 16px;text-align:right;font-size:13px">${tot.pi}</td>
            <td style="padding:10px 16px;text-align:right;font-size:13px;color:#10b981">+${tot.c}</td>
            <td style="padding:10px 16px;text-align:right;font-size:13px;color:#ef4444">−${tot.b}</td>
            <td style="padding:10px 16px;text-align:right;font-size:13px">${tot.pf}</td>
            <td style="padding:10px 16px;text-align:right;font-size:13px">${tasaTot}%</td>
        </tr>`;

    tbody.innerHTML = filas + filaTotal;
}

function exportarRotacionPuestoExcel() {
    const rows = _datosRotPuestoVisibles();
    if (!rows.length) return;
    const wb = XLSX.utils.book_new();
    const plano = rows.map(r => ({
        'Puesto': r.puesto,
        'Sucursal': _codigoSucursal(r.sucursal),
        'Plantilla Inicial': r.plantilla_inicial,
        'Contrataciones': r.contrataciones,
        'Bajas': r.bajas,
        'Plantilla Final': r.plantilla_final,
        '%Rotación': r.tasa
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(plano), 'Rotación por Puesto');
    XLSX.writeFile(wb, `Rotacion_por_Puesto_${new Date().toLocaleDateString('es-MX').replace(/\//g,'-')}.xlsx`);
}
```

- [ ] **Step 2: Exponer funciones en `window`**

Buscar `window.exportarEstadisticasExcel` (o el final del archivo) y agregar:

```javascript
window.cargarRotacionPuesto = cargarRotacionPuesto;
window.ordenarRotacionPuesto = ordenarRotacionPuesto;
window.filtrarRotacionPuesto = filtrarRotacionPuesto;
window.exportarRotacionPuestoExcel = exportarRotacionPuestoExcel;
```

- [ ] **Step 3: Inicializar fechas al entrar a la sección estadísticas**

Localizar dónde se dispara la carga de estadísticas (buscar `cargarEstadisticas` en el switch de secciones, ~línea 589). Agregar la llamada a `_initFechasRotPuesto()` justo después de que se llame `cargarEstadisticas()` al abrir la sección, para que los inputs de fecha tengan su default visible aunque el usuario no haya pulsado Generar.

Run: `grep -n "cargarEstadisticas\|case 'estadisticas'" "C:/Users/USUARIO/Desktop/V2 checador-system ADMIN/Admin.js"`
Expected: ubica el punto; agregar `_initFechasRotPuesto();` tras la llamada existente.

- [ ] **Step 4: Verificar sintaxis**

Run: `node --check "C:/Users/USUARIO/Desktop/V2 checador-system ADMIN/Admin.js"`
Expected: sin salida (exit 0)

- [ ] **Step 5: Verificación manual en navegador**

Abrir el panel admin, ir a sección **Estadísticas** → bloque "Rotación por Puesto":
- Las fechas default deben mostrar 1-ene-2026 y hoy.
- Pulsar **Generar** → la tabla se llena con filas puesto/sucursal y fila TOTAL.
- Sucursales se ven como códigos (LMM, CSL, …).
- Clic en encabezados ordena asc/desc con flecha ▲/▼.
- Filtros de puesto/sucursal acotan sin recargar.
- **Excel** descarga el archivo con las columnas correctas.
- Comparar TOTAL contra el Excel de RH para un rango anual conocido.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/USUARIO/Desktop/V2 checador-system ADMIN"
git add Admin.js
git commit -m "Rotacion por puesto: carga, render, filtros, orden y export"
```

---

## Notas de cierre

- **Push:** no hacer push automático. El workflow del usuario es push a `main` solo con su OK explícito.
- **Backend ERP:** el cambio en `Pagos_Backend` debe desplegarse donde corre el ERP (el que sirve ngrok) para que el admin en producción lo consuma. En local se prueba con `npm start`.
- **Dependencia entre tareas:** la Task 3 (JS) no funcionará en vivo hasta que la Task 1 (endpoint) esté desplegada, pero la verificación de sintaxis y el render con datos mock sí se pueden validar antes.
