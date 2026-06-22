# Módulo de Finiquitos (BMS) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar una sección "Finiquitos" al Admin que muestra cuánto se ha gastado en finiquitos (neto pagado) consultando BMSCabos vía el backend Pagos_Backend.

**Architecture:** Endpoint nuevo `GET /api/empleados/finiquitos` en `Pagos_Backend/routes/empleados.js` (molde = `/creditos`), que une `BMSCabos.dbo.nominas` + `mnominas` + `empleados` + `grupos_nomina`. El Admin lo consume con `fetch(${ADMIN_CONFIG.apiUrl}/empleados/finiquitos?...)` desde una sección nueva en `Index.html` + funciones en `Admin.js`.

**Tech Stack:** Node/Express + mssql (backend); HTML + vanilla JS + XLSX (frontend). Sin framework de tests — verificación con `curl` contra datos reales y revisión en navegador (patrón del repo).

---

## Notas de contexto (verificadas)

- El router de empleados ya está montado: `server.js:64` → `app.use('/api/empleados', empleadosRoutes)`. **No hay que tocar server.js.**
- Endpoints existentes son **públicos sin JWT** (`/creditos`, `/rotacion`, `/lista-vacaciones`). El de finiquitos sigue esa convención.
- En `nominas`: `tipo_nomina='F'` (finiquito), `status='V'` (válida). Join `nominas`↔`mnominas` por `folio + transaccion`.
- Granularidad a nivel `mnominas` (empleado): hay folios con varios empleados finiquitados.
- Sucursal del empleado = `grupos_nomina.nombre` (JOIN por `grupo_nomina`).
- `money` de SQL llega como número JS; sumar en SQL (`SUM`), no en cliente.
- Datos reales 2026 (para verificar): ≈ $576,418 neto en 45 finiquitos; MATRIZ lidera (~$396K, 24).
- El front usa **XLSX** para exportar (no CSV). La variable global `window.currentUserSucursal` filtra por sucursal del usuario logueado.
- Convención BMS de activo: `fecha_baja = '2078-12-31'` (no relevante aquí, pero presente en empleados).

## File Structure

- **Modify** `Portal Pagos Proveedores/Pagos_Backend/routes/empleados.js` — agregar `router.get('/finiquitos', ...)`. Una responsabilidad: servir el reporte de finiquitos desde BMSCabos.
- **Modify** `V2 checador-system ADMIN/Index.html` — agregar `<li>` en sidebar + `<section id="finiquitos">`.
- **Modify** `V2 checador-system ADMIN/Admin.js` — agregar `case 'finiquitos'` en `loadSectionData`, funciones `cargarFiniquitos`, `_renderTablaFiniquitos`, `filtrarTablaFiniquitos`, `exportarFiniquitosExcel`, `_initFechasFiniquitos`, y exposición global.

---

## Task 1: Endpoint backend `/api/empleados/finiquitos`

**Files:**
- Modify: `C:/Users/USUARIO/Desktop/Portal Pagos Proveedores/Pagos_Backend/routes/empleados.js` (agregar antes de `module.exports = router;`)

- [ ] **Step 1: Agregar el endpoint**

Insertar este bloque después del endpoint `/lista-vacaciones` (aprox. línea 683) y antes de `module.exports`:

```javascript
// ──────────────────────────────────────────────────────────────────────────────
// FINIQUITOS (BMS) — gasto en finiquitos (neto pagado)
// Ruta pública — consumida desde el Admin Panel (sección Finiquitos)
// Finiquito: nominas.tipo_nomina='F' AND status='V'. Join con mnominas por folio+transaccion.
// Granularidad a nivel mnominas (un registro por empleado finiquitado).
// ──────────────────────────────────────────────────────────────────────────────
router.get('/finiquitos', async (req, res) => {
    try {
        const { fechaInicio, fechaFin, sucursal } = req.query;
        const reFecha = /^\d{4}-\d{2}-\d{2}$/;

        const pool = await getConnection();
        const request = pool.request();

        let filtroFecha = '';
        if (fechaInicio && reFecha.test(fechaInicio)) {
            request.input('fechaInicio', sql.NVarChar, fechaInicio);
            filtroFecha += ' AND n.fecha >= @fechaInicio';
        }
        if (fechaFin && reFecha.test(fechaFin)) {
            request.input('fechaFin', sql.NVarChar, fechaFin);
            // < fechaFin + 1 día para incluir todo el día final
            filtroFecha += ' AND n.fecha < DATEADD(DAY, 1, @fechaFin)';
        }

        let filtroSucursal = '';
        if (sucursal) {
            request.input('sucursal', sql.NVarChar, sucursal);
            filtroSucursal = `AND e.grupo_nomina IN (
                SELECT gn2.grupo_nomina FROM BMSCabos.dbo.grupos_nomina gn2
                WHERE LTRIM(RTRIM(UPPER(gn2.nombre))) = UPPER(@sucursal)
            )`;
        }

        const result = await request.query(`
            -- 1. Detalle de finiquitos
            SELECT
                LTRIM(RTRIM(n.folio))                                          AS folio,
                n.fecha                                                        AS fecha,
                n.fecha_pago                                                   AS fecha_pago,
                LTRIM(RTRIM(m.empleado))                                       AS codigo,
                LTRIM(RTRIM(e.nombre_completo))                                AS nombre,
                ISNULL(LTRIM(RTRIM(gn.nombre)), LTRIM(RTRIM(e.grupo_nomina)))  AS sucursal,
                m.dias_trabajados                                             AS dias_trabajados,
                m.neto                                                        AS neto
            FROM BMSCabos.dbo.nominas n
            INNER JOIN BMSCabos.dbo.mnominas m
                ON n.folio = m.folio AND n.transaccion = m.transaccion
            LEFT JOIN BMSCabos.dbo.empleados e
                ON LTRIM(RTRIM(m.empleado)) = LTRIM(RTRIM(e.empleado))
            LEFT JOIN BMSCabos.dbo.grupos_nomina gn
                ON LTRIM(RTRIM(e.grupo_nomina)) = LTRIM(RTRIM(gn.grupo_nomina))
            WHERE n.tipo_nomina = 'F' AND n.status = 'V'
            ${filtroFecha}
            ${filtroSucursal}
            ORDER BY n.fecha DESC;

            -- 2. Resumen
            SELECT
                COUNT(*)            AS num_finiquitos,
                ISNULL(SUM(m.neto), 0) AS total_neto
            FROM BMSCabos.dbo.nominas n
            INNER JOIN BMSCabos.dbo.mnominas m
                ON n.folio = m.folio AND n.transaccion = m.transaccion
            LEFT JOIN BMSCabos.dbo.empleados e
                ON LTRIM(RTRIM(m.empleado)) = LTRIM(RTRIM(e.empleado))
            WHERE n.tipo_nomina = 'F' AND n.status = 'V'
            ${filtroFecha}
            ${filtroSucursal};

            -- 3. Por sucursal
            SELECT
                ISNULL(LTRIM(RTRIM(gn.nombre)), LTRIM(RTRIM(e.grupo_nomina))) AS sucursal,
                COUNT(*)            AS num_finiquitos,
                ISNULL(SUM(m.neto), 0) AS total_neto
            FROM BMSCabos.dbo.nominas n
            INNER JOIN BMSCabos.dbo.mnominas m
                ON n.folio = m.folio AND n.transaccion = m.transaccion
            LEFT JOIN BMSCabos.dbo.empleados e
                ON LTRIM(RTRIM(m.empleado)) = LTRIM(RTRIM(e.empleado))
            LEFT JOIN BMSCabos.dbo.grupos_nomina gn
                ON LTRIM(RTRIM(e.grupo_nomina)) = LTRIM(RTRIM(gn.grupo_nomina))
            WHERE n.tipo_nomina = 'F' AND n.status = 'V'
            ${filtroFecha}
            ${filtroSucursal}
            GROUP BY ISNULL(LTRIM(RTRIM(gn.nombre)), LTRIM(RTRIM(e.grupo_nomina)))
            ORDER BY total_neto DESC;
        `);

        const [finiquitos, resumen, por_sucursal] = result.recordsets;

        res.json({
            success: true,
            data: { finiquitos, resumen: resumen[0], por_sucursal }
        });
    } catch (error) {
        console.error('Error en /finiquitos:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});
```

- [ ] **Step 2: Iniciar el backend (si no corre)**

Run (desde `C:/Users/USUARIO/Desktop/Portal Pagos Proveedores/Pagos_Backend`):
```bash
node server.js
```
Expected: log `✅ Conectado a SQL Server` y el servidor escuchando (puerto del .env, típicamente 3000).

- [ ] **Step 3: Verificar el endpoint con datos reales (todo 2026)**

Run:
```bash
curl -s "http://localhost:3000/api/empleados/finiquitos?fechaInicio=2026-01-01&fechaFin=2026-12-31" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('success:',j.success);console.log('num:',j.data.resumen.num_finiquitos,'total:',j.data.resumen.total_neto);console.log('sucursales:',j.data.por_sucursal.map(x=>x.sucursal+'='+x.total_neto).join(', '));})"
```
Expected: `success: true`, `num: 45` (aprox.), `total:` ≈ `576418`, y MATRIZ con el mayor total (~396337). Pequeñas variaciones si se capturaron finiquitos nuevos.

- [ ] **Step 4: Verificar filtro de sucursal**

Run:
```bash
curl -s "http://localhost:3000/api/empleados/finiquitos?fechaInicio=2026-01-01&fechaFin=2026-12-31&sucursal=SAN%20JOSE" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('num:',j.data.resumen.num_finiquitos,'total:',j.data.resumen.total_neto);})"
```
Expected: `num: 8` (aprox.), `total:` ≈ `80060`.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/USUARIO/Desktop/Portal Pagos Proveedores"
git add Pagos_Backend/routes/empleados.js
git commit -m "Finiquitos: endpoint /api/empleados/finiquitos (BMSCabos)"
```

---

## Task 2: Sidebar + sección HTML en el Admin

**Files:**
- Modify: `C:/Users/USUARIO/Desktop/V2 checador-system ADMIN/Index.html`

- [ ] **Step 1: Agregar item al sidebar**

Insertar después del `<li>` de Estadísticas (que termina antes del de Rotación, aprox. línea 112). El nuevo `<li>`:

```html
                <li class="nav-item">
                    <a href="#finiquitos" data-section="finiquitos">
                        <i class="fas fa-hand-holding-usd"></i>
                        <span>Finiquitos</span>
                    </a>
                </li>
```

- [ ] **Step 2: Agregar la sección de contenido**

Insertar después del cierre `</section>` de la sección `creditos` (aprox. línea 1223) y antes de `<!-- ==================== SECCIÓN SUCURSALES ==================== -->`:

```html
        <!-- ==================== SECCIÓN FINIQUITOS ==================== -->
        <section id="finiquitos" class="content-section">
            <div class="section-header">
                <h2>Gasto en Finiquitos</h2>
                <div class="header-actions-group">
                    <button class="btn btn-primary" onclick="exportarFiniquitosExcel()">
                        <i class="fas fa-file-excel"></i> Exportar Excel
                    </button>
                </div>
            </div>

            <!-- KPIs finiquitos -->
            <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px;">
                <div class="stat-card">
                    <div class="stat-icon" style="background:rgba(239,68,68,.15)"><i class="fas fa-money-bill-wave" style="color:#ef4444"></i></div>
                    <div class="stat-info"><h3 id="finiqTotal">–</h3><p>Total gastado (neto)</p></div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon" style="background:rgba(59,130,246,.15)"><i class="fas fa-file-invoice-dollar" style="color:#3b82f6"></i></div>
                    <div class="stat-info"><h3 id="finiqNum">–</h3><p># de finiquitos</p></div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon" style="background:rgba(245,158,11,.15)"><i class="fas fa-balance-scale" style="color:#f59e0b"></i></div>
                    <div class="stat-info"><h3 id="finiqPromedio">–</h3><p>Promedio por finiquito</p></div>
                </div>
            </div>

            <!-- Filtros -->
            <div class="filters" style="margin-bottom:16px;">
                <div class="filter-group" style="flex-wrap:wrap;gap:10px;align-items:center;">
                    <label style="font-size:13px;color:#94a3b8">Desde
                        <input type="date" id="finiqFechaInicio" class="form-input" onchange="cargarFiniquitos()">
                    </label>
                    <label style="font-size:13px;color:#94a3b8">Hasta
                        <input type="date" id="finiqFechaFin" class="form-input" onchange="cargarFiniquitos()">
                    </label>
                    <select id="finiqSucursal" class="form-select" onchange="cargarFiniquitos()">
                        <option value="">Todas las sucursales</option>
                    </select>
                    <input type="text" id="searchFiniquitos" placeholder="Buscar por nombre o ID..." class="form-input" oninput="filtrarTablaFiniquitos()" style="min-width:220px;">
                </div>
            </div>

            <!-- Tabla por sucursal -->
            <div class="card" style="margin-bottom:16px;">
                <div class="card-body">
                    <h3 style="margin:0 0 12px;font-size:15px;color:#e2e8f0">Por sucursal</h3>
                    <div class="table-container">
                        <table id="tablaFiniquitosSucursal">
                            <thead>
                                <tr><th>Sucursal</th><th># Finiquitos</th><th>Total Neto</th></tr>
                            </thead>
                            <tbody id="tbodyFiniquitosSucursal">
                                <tr><td colspan="3" style="text-align:center;color:#64748b">Cargando...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Tabla detalle -->
            <div class="card">
                <div class="card-body">
                    <h3 style="margin:0 0 12px;font-size:15px;color:#e2e8f0">Detalle</h3>
                    <div class="table-container">
                        <table id="tablaFiniquitosDetalle">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Nombre</th>
                                    <th>Sucursal</th>
                                    <th>Folio</th>
                                    <th>Fecha</th>
                                    <th>Días Trab.</th>
                                    <th>Neto</th>
                                </tr>
                            </thead>
                            <tbody id="tbodyFiniquitosDetalle">
                                <tr><td colspan="7" style="text-align:center;color:#64748b">Cargando...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </section>
```

- [ ] **Step 3: Verificar HTML bien formado**

Run:
```bash
cd "C:/Users/USUARIO/Desktop/V2 checador-system ADMIN"
node -e "const h=require('fs').readFileSync('Index.html','utf8'); const o=(h.match(/<section /g)||[]).length, c=(h.match(/<\/section>/g)||[]).length; console.log('section open:',o,'close:',c, o===c?'OK':'MISMATCH'); console.log('tiene finiquitos:', h.includes('id=\"finiquitos\"'));"
```
Expected: `section open` = `close` (OK) y `tiene finiquitos: true`.

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/USUARIO/Desktop/V2 checador-system ADMIN"
git add Index.html
git commit -m "Finiquitos: sidebar y seccion HTML en Admin"
```

---

## Task 3: Lógica JS en el Admin

**Files:**
- Modify: `C:/Users/USUARIO/Desktop/V2 checador-system ADMIN/Admin.js`

- [ ] **Step 1: Agregar el `case` en `loadSectionData`**

En el `switch(section)` de `loadSectionData` (aprox. línea 597, junto a `case 'creditos'`), agregar:

```javascript
        case 'finiquitos':
            _initFechasFiniquitos();
            cargarFiniquitos();
            break;
```

- [ ] **Step 2: Agregar las funciones de finiquitos**

Insertar antes del bloque `// Exponer al scope global` (aprox. línea 8589), junto a las funciones de créditos:

```javascript
// ================================
// SECCIÓN FINIQUITOS (BMS)
// ================================
let _finiquitosDatos = [];

// Default: 1-ene del año actual → hoy (solo la primera vez; respeta lo que el usuario ponga)
function _initFechasFiniquitos() {
    const ini = document.getElementById('finiqFechaInicio');
    const fin = document.getElementById('finiqFechaFin');
    if (!ini || !fin) return;
    if (ini.value && fin.value) return; // ya inicializado
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = String(hoy.getMonth() + 1).padStart(2, '0');
    const d = String(hoy.getDate()).padStart(2, '0');
    ini.value = `${y}-01-01`;
    fin.value = `${y}-${m}-${d}`;
}

function _fmtMoneda(n) {
    if (n == null) return '–';
    return Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

async function cargarFiniquitos() {
    try {
        document.getElementById('tbodyFiniquitosDetalle').innerHTML =
            '<tr><td colspan="7" style="text-align:center;color:#64748b">Cargando...</td></tr>';
        document.getElementById('tbodyFiniquitosSucursal').innerHTML =
            '<tr><td colspan="3" style="text-align:center;color:#64748b">Cargando...</td></tr>';

        const fInicio  = document.getElementById('finiqFechaInicio')?.value || '';
        const fFin     = document.getElementById('finiqFechaFin')?.value    || '';
        const sucursal = document.getElementById('finiqSucursal')?.value    || '';

        if (fInicio && fFin && fInicio > fFin) {
            document.getElementById('finiqFechaFin').value = fInicio;
        }

        const params = new URLSearchParams();
        if (fInicio)  params.set('fechaInicio', fInicio);
        if (fFin)     params.set('fechaFin',    document.getElementById('finiqFechaFin').value);
        if (sucursal) params.set('sucursal',    sucursal);

        const res  = await fetch(`${ADMIN_CONFIG.apiUrl}/empleados/finiquitos?${params}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.message);

        // KPIs
        const r = json.data.resumen;
        const total = Number(r.total_neto || 0);
        const num   = Number(r.num_finiquitos || 0);
        document.getElementById('finiqTotal').textContent    = _fmtMoneda(total);
        document.getElementById('finiqNum').textContent      = num;
        document.getElementById('finiqPromedio').textContent = num > 0 ? _fmtMoneda(total / num) : '–';

        // Tabla por sucursal
        const tbodySuc = document.getElementById('tbodyFiniquitosSucursal');
        const porSuc = json.data.por_sucursal || [];
        tbodySuc.innerHTML = porSuc.length
            ? porSuc.map(s => `
                <tr>
                    <td>${s.sucursal || '–'}</td>
                    <td>${s.num_finiquitos}</td>
                    <td>${_fmtMoneda(s.total_neto)}</td>
                </tr>`).join('')
            : '<tr><td colspan="3" style="text-align:center;color:#64748b">Sin resultados</td></tr>';

        // Poblar selector de sucursales (una vez, conservando selección)
        const selSuc = document.getElementById('finiqSucursal');
        if (selSuc && selSuc.options.length <= 1 && porSuc.length) {
            const actual = selSuc.value;
            porSuc.forEach(s => {
                if (!s.sucursal) return;
                const opt = document.createElement('option');
                opt.value = opt.textContent = s.sucursal;
                if (s.sucursal === actual) opt.selected = true;
                selSuc.appendChild(opt);
            });
        }

        // Detalle
        _finiquitosDatos = json.data.finiquitos || [];
        _renderTablaFiniquitos(_finiquitosDatos);

    } catch (err) {
        console.error('cargarFiniquitos:', err);
        document.getElementById('tbodyFiniquitosDetalle').innerHTML =
            '<tr><td colspan="7" style="text-align:center;color:#ef4444">Error al cargar datos</td></tr>';
        document.getElementById('tbodyFiniquitosSucursal').innerHTML =
            '<tr><td colspan="3" style="text-align:center;color:#ef4444">Error</td></tr>';
    }
}

function _fmtFechaFiniq(f) {
    if (!f) return '–';
    const d = new Date(f);
    const local = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
    return local.toLocaleDateString('es-MX');
}

function _renderTablaFiniquitos(filas) {
    const tbody = document.getElementById('tbodyFiniquitosDetalle');
    if (!tbody) return;
    if (!filas || !filas.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#64748b">Sin resultados</td></tr>';
        return;
    }
    tbody.innerHTML = filas.map(f => `
        <tr>
            <td style="font-family:monospace;font-size:12px">${f.codigo || '–'}</td>
            <td>${f.nombre || '–'}</td>
            <td style="font-size:12px;color:#94a3b8">${f.sucursal || '–'}</td>
            <td style="font-family:monospace;font-size:12px">${f.folio || '–'}</td>
            <td style="font-size:12px">${_fmtFechaFiniq(f.fecha)}</td>
            <td style="font-size:12px">${f.dias_trabajados != null ? Number(f.dias_trabajados).toLocaleString('es-MX') : '–'}</td>
            <td style="font-weight:600;color:#10b981">${_fmtMoneda(f.neto)}</td>
        </tr>`).join('');
}

function filtrarTablaFiniquitos() {
    const q = (document.getElementById('searchFiniquitos')?.value || '').toLowerCase().trim();
    if (!q) { _renderTablaFiniquitos(_finiquitosDatos); return; }
    const filtrados = _finiquitosDatos.filter(f =>
        (f.nombre || '').toLowerCase().includes(q) ||
        (f.codigo || '').toLowerCase().includes(q)
    );
    _renderTablaFiniquitos(filtrados);
}

function exportarFiniquitosExcel() {
    if (!_finiquitosDatos.length) return;
    const datos = _finiquitosDatos.map(f => ({
        'ID':          f.codigo,
        'Nombre':      f.nombre,
        'Sucursal':    f.sucursal,
        'Folio':       f.folio,
        'Fecha':       _fmtFechaFiniq(f.fecha),
        'Días Trab.':  f.dias_trabajados,
        'Neto':        f.neto
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(datos), 'Finiquitos');
    XLSX.writeFile(wb, `Finiquitos_${new Date().toLocaleDateString('es-MX').replace(/\//g,'-')}.xlsx`);
}
```

- [ ] **Step 3: Exponer funciones al scope global**

En el bloque `// Exponer al scope global` (junto a `window.cargarCreditos = ...`, aprox. línea 8603), agregar:

```javascript
window.cargarFiniquitos          = cargarFiniquitos;
window.filtrarTablaFiniquitos    = filtrarTablaFiniquitos;
window.exportarFiniquitosExcel   = exportarFiniquitosExcel;
```

- [ ] **Step 4: Verificar sintaxis JS**

Run:
```bash
cd "C:/Users/USUARIO/Desktop/V2 checador-system ADMIN"
node --check Admin.js && echo "SINTAXIS OK"
```
Expected: `SINTAXIS OK` (sin errores de parseo).

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/USUARIO/Desktop/V2 checador-system ADMIN"
git add Admin.js
git commit -m "Finiquitos: logica JS, carga y exportacion en Admin"
```

---

## Task 4: Verificación end-to-end en el navegador

**Files:** (ninguno — verificación manual)

- [ ] **Step 1: Asegurar backend corriendo**

El backend de Task 1 debe estar arriba (`node server.js` en Pagos_Backend) y accesible. `ADMIN_CONFIG.apiUrl` apunta a `https://aceros-cabos-proveedores.ngrok.app/api` (Admin.js:10). Para prueba local, si el ngrok no apunta al backend local, abrir el Admin servido por el mismo backend (`express.static` sirve `..` → `server.js:53`), o ajustar temporalmente `apiUrl` a `http://localhost:3000/api` y revertir antes de commit final.

- [ ] **Step 2: Abrir el Admin y entrar a Finiquitos**

Abrir el Admin en el navegador, hacer login, click en el menú **Finiquitos**.
Expected:
- KPIs muestran Total ≈ $576,418 (año en curso), # ≈ 45, Promedio calculado.
- Tabla "Por sucursal" lista MATRIZ, SAN JOSE, TAMARAL, etc. con montos.
- Tabla "Detalle" lista empleados con folio, fecha, días, neto.
- Sin errores en la consola del navegador.

- [ ] **Step 3: Probar filtros**

- Cambiar rango de fechas → KPIs y tablas se actualizan.
- Elegir una sucursal en el selector → se filtra.
- Escribir en el buscador → filtra el detalle por nombre/ID.
- Click "Exportar Excel" → descarga `Finiquitos_<fecha>.xlsx` con los datos.

Expected: todo responde sin errores.

- [ ] **Step 4: Revertir apiUrl si se cambió en Step 1**

Si se editó `Admin.js:10`, restaurar el valor original (`https://aceros-cabos-proveedores.ngrok.app/api`). Verificar con:
```bash
cd "C:/Users/USUARIO/Desktop/V2 checador-system ADMIN"
node -e "console.log(require('fs').readFileSync('Admin.js','utf8').match(/apiUrl: '([^']+)'/)[1])"
```
Expected: `https://aceros-cabos-proveedores.ngrok.app/api`. Si hubo cambios, `git add Admin.js && git commit -m "Finiquitos: restaurar apiUrl"` o `git checkout Admin.js` si el revert deja el archivo idéntico al último commit.

---

## Self-review notes

- **Spec coverage:** endpoint multi-recordset (finiquitos/resumen/por_sucursal) → Task 1; sidebar + sección + KPIs + 2 tablas + export → Tasks 2-3; filtro fecha (default año en curso) y sucursal → Tasks 1 y 3; monto = neto → Task 1 (SUM(m.neto)); solo BMSCabos → queries hardcoded a BMSCabos. ✓
- **Granularidad mnominas** (folios multi-empleado) → INNER JOIN por folio+transaccion en las 3 queries. ✓
- **SUM en SQL** (no en cliente) → resumen y por_sucursal usan SUM. ✓
- **Sin placeholders.** Todo el código está completo.
- **Consistencia de nombres:** IDs HTML (`finiqTotal`, `finiqNum`, `finiqPromedio`, `finiqFechaInicio`, `finiqFechaFin`, `finiqSucursal`, `searchFiniquitos`, `tbodyFiniquitosSucursal`, `tbodyFiniquitosDetalle`) coinciden entre Index.html (Task 2) y Admin.js (Task 3). Funciones `cargarFiniquitos`/`filtrarTablaFiniquitos`/`exportarFiniquitosExcel`/`_initFechasFiniquitos`/`_renderTablaFiniquitos` consistentes entre `onchange`/`onclick` del HTML y definiciones JS. ✓
- **Testing:** el repo no tiene framework de tests automatizados; se verifica con `curl` (datos reales) y navegador, consistente con el resto del proyecto.
