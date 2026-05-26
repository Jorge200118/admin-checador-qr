# Apartado "Rotación" + Histograma de Permanencia — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development o superpowers:executing-plans. Pasos con checkbox `- [ ]`.

**Goal:** Crear un apartado "Rotación" en el menú con 3 sub-pestañas (Resumen / Por Puesto / Permanencia), mover ahí las tablas de rotación que hoy están en Estadísticas, y agregar un histograma de permanencia por puesto alimentado por un endpoint ERP nuevo.

**Architecture:** Endpoint nuevo `/permanencia` en el backend ERP devuelve conteos por rango (formato `{rango,orden,total}`). El admin agrega `<section id="rotacion">` con sub-pestañas (show/hide), mueve dos bloques HTML desde `#estadisticas`, y dibuja el histograma reutilizando el helper existente `_renderChartBarrasRangos`.

**Tech Stack:** Node/Express + mssql (ERP); JS vanilla + Chart.js (admin). Sin test runner → `node --check`, `curl`, navegador.

**Spec:** `docs/superpowers/specs/2026-05-26-apartado-rotacion-permanencia-design.md`

---

## Anclajes verificados (estado actual)

- `Index.html`: menú con `<a data-section="...">` (líneas 39-120); `#estadisticas` es la sección 806-1015. Item de menú "estadisticas" en línea 101.
- Bloques a MOVER desde `#estadisticas`:
  - **KPIs de rotación**: NO mover (los 4 KPIs activos/bajas/ingresos/antigüedad son de plantilla, se quedan en Estadísticas). Solo se mueven las tablas.
  - **Tabla rotación mensual**: bloque "Índice de Rotación" (líneas 945-969, contiene `id="tablaRotacion"` y `tbodyRotacion`).
  - **Tabla rotación por puesto**: bloque "Rotación por Puesto" (líneas 971-1012, contiene `rotacionPuestoTable`/`tbodyRotacionPuesto`).
- `Admin.js`: switch de secciones con `case 'estadisticas':` (589-592, llama `cargarEstadisticas()` + `_initFechasRotPuesto()`). `_renderTablaRotacion` se invoca dentro de `_redibujarEstadisticas` (línea 7302) — ESA llamada se debe conservar porque la tabla mensual sigue dependiendo de los datos de `/estadisticas`.
- Helper reutilizable: `_renderChartBarrasRangos(canvasId, datos, colorBase)` (línea 7589) dibuja barras por `{rango,orden,total}` con tema. El endpoint `/permanencia` devuelve exactamente ese formato.
- `getChartThemeColors()` (línea 67), `_estCharts` (objeto de instancias Chart).

**Nota de diseño sobre la tabla mensual:** depende de `_estDatos.rotacion` que viene de `/estadisticas`. Al moverla de sección, su render sigue disparándose desde `_redibujarEstadisticas`. Como el contenedor se mueve a `#rotacion` pero el `id="tbodyRotacion"` se mantiene, `_renderTablaRotacion` lo seguirá encontrando por id sin importar en qué sección esté el DOM. Por eso basta mover el HTML; el JS de esa tabla NO cambia.

---

## Task 1: Endpoint `/permanencia` en el backend ERP

**Files:**
- Modify: `Portal Pagos Proveedores/Pagos_Backend/routes/empleados.js` (insertar antes de `router.use(authMiddleware);`)

- [ ] **Step 1: Insertar la ruta**

Insertar JUSTO ANTES de `router.use(authMiddleware);`:

```javascript
// ──────────────────────────────────────────────────────────────────────────────
// PERMANENCIA (histograma): cuánto dura/lleva la gente, por rangos
// Ruta pública — consumida desde el Admin Panel (Rotación → Permanencia)
// Permanencia: activos = hoy − fecha_ingreso; bajas = fecha_baja − fecha_ingreso
// ──────────────────────────────────────────────────────────────────────────────
router.get('/permanencia', async (req, res) => {
    try {
        const { puesto, sucursal, desde, hasta } = req.query;
        const reFecha = /^\d{4}-\d{2}-\d{2}$/;
        if ((desde && !reFecha.test(desde)) || (hasta && !reFecha.test(hasta))) {
            return res.status(400).json({ success: false, message: 'desde/hasta deben ser YYYY-MM-DD' });
        }

        const pool = await getConnection();
        const request = pool.request();

        let filtros = '';
        if (puesto) {
            request.input('puesto', sql.NVarChar, puesto);
            filtros += ` AND ISNULL(LTRIM(RTRIM(p.nombre)), LTRIM(RTRIM(e.puesto))) = @puesto`;
        }
        if (sucursal) {
            request.input('sucursal', sql.NVarChar, sucursal);
            filtros += ` AND e.grupo_nomina IN (
                SELECT gn.grupo_nomina FROM BMSCabos.dbo.grupos_nomina gn
                WHERE LTRIM(RTRIM(UPPER(gn.nombre))) = UPPER(@sucursal)
            )`;
        }
        if (desde) { request.input('desde', sql.Date, desde); filtros += ` AND CAST(e.fecha_ingreso AS DATE) >= @desde`; }
        if (hasta) { request.input('hasta', sql.Date, hasta); filtros += ` AND CAST(e.fecha_ingreso AS DATE) <= @hasta`; }

        const result = await request.query(`
            ;WITH perm AS (
                SELECT DATEDIFF(DAY, e.fecha_ingreso,
                    CASE WHEN CAST(e.fecha_baja AS DATE) = '2078-12-31' THEN CAST(GETDATE() AS DATE)
                         ELSE CAST(e.fecha_baja AS DATE) END) AS dias
                FROM BMSCabos.dbo.empleados e
                LEFT JOIN BMSCabos.dbo.puestos p
                    ON LTRIM(RTRIM(e.puesto)) = LTRIM(RTRIM(p.puesto))
                WHERE e.nombre_completo IS NOT NULL
                  AND e.fecha_ingreso IS NOT NULL
                  AND e.puesto IS NOT NULL AND LTRIM(RTRIM(e.puesto)) != ''
                  ${filtros}
            ),
            clasificado AS (
                SELECT CASE
                    WHEN dias < 30   THEN 1
                    WHEN dias < 90   THEN 2
                    WHEN dias < 180  THEN 3
                    WHEN dias < 365  THEN 4
                    WHEN dias < 730  THEN 5
                    WHEN dias < 1825 THEN 6
                    ELSE 7 END AS orden
                FROM perm
                WHERE dias >= 0
            ),
            rangos AS (
                SELECT * FROM (VALUES
                    (1,'<1 mes'),(2,'1-3 meses'),(3,'3-6 meses'),(4,'6-12 meses'),
                    (5,'1-2 años'),(6,'2-5 años'),(7,'5+ años')
                ) r(orden, rango)
            )
            SELECT r.rango, r.orden, COUNT(c.orden) AS total
            FROM rangos r
            LEFT JOIN clasificado c ON c.orden = r.orden
            GROUP BY r.orden, r.rango
            ORDER BY r.orden;
        `);

        const data = result.recordset;
        const total_empleados = data.reduce((a, r) => a + r.total, 0);

        res.json({
            success: true,
            data,
            total_empleados,
            filtros: { puesto: puesto || null, sucursal: sucursal || null, desde: desde || null, hasta: hasta || null }
        });
    } catch (error) {
        console.error('Error en /permanencia:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

```

- [ ] **Step 2: Verificar sintaxis**

Run: `node --check "C:/Users/USUARIO/Desktop/Portal Pagos Proveedores/Pagos_Backend/routes/empleados.js"`
Expected: exit 0.

- [ ] **Step 3: Probar en vivo (si el backend corre)**

Run: `curl "http://localhost:PUERTO/api/empleados/permanencia"`
Expected: JSON con 7 rangos (orden 1-7), `total` por rango, y `total_empleados`. Probar también con `?puesto=CHOFER` y `?sucursal=MATRIZ`.

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/USUARIO/Desktop/Portal Pagos Proveedores/Pagos_Backend"
git add routes/empleados.js
git commit -m "Empleados: endpoint /permanencia (histograma por rangos)"
```

---

## Task 2: Sección Rotación + sub-pestañas + migración de tablas (HTML)

**Files:**
- Modify: `V2 checador-system ADMIN/Index.html`

- [ ] **Step 1: Agregar item de menú "Rotación"**

Tras el `<a ... data-section="estadisticas">...</a>` (línea ~101-106), insertar un nuevo item de menú. Leer el bloque del item de estadisticas para copiar su estructura exacta (clase, icono `<i>`, texto). Crear:

```html
                    <a href="#rotacion" data-section="rotacion">
                        <i class="fas fa-people-arrows"></i>
                        <span>Rotación</span>
                    </a>
```
(Ajustar las clases/estructura para que coincidan EXACTAMENTE con las del item vecino "estadisticas" — leer primero ese item y replicar su markup.)

- [ ] **Step 2: Crear la sección `#rotacion` con sub-pestañas**

Insertar una nueva `<section id="rotacion" class="content-section">` (después de que cierra `</section>` de estadisticas, ~línea 1015). Estructura:

```html
        <section id="rotacion" class="content-section">
            <div class="section-header">
                <div><h2 style="margin:0 0 2px">Rotación</h2></div>
            </div>

            <!-- Sub-pestañas -->
            <div style="display:flex;gap:8px;margin-bottom:20px;border-bottom:1px solid #334155">
                <button class="rot-tab rot-tab-active" data-rottab="resumen" onclick="mostrarTabRotacion('resumen')"
                    style="background:none;border:none;border-bottom:2px solid #3b82f6;color:#3b82f6;padding:10px 16px;cursor:pointer;font-size:14px;font-weight:600">Resumen</button>
                <button class="rot-tab" data-rottab="porpuesto" onclick="mostrarTabRotacion('porpuesto')"
                    style="background:none;border:none;border-bottom:2px solid transparent;color:#94a3b8;padding:10px 16px;cursor:pointer;font-size:14px;font-weight:600">Por Puesto</button>
                <button class="rot-tab" data-rottab="permanencia" onclick="mostrarTabRotacion('permanencia')"
                    style="background:none;border:none;border-bottom:2px solid transparent;color:#94a3b8;padding:10px 16px;cursor:pointer;font-size:14px;font-weight:600">Permanencia</button>
            </div>

            <div id="rotTabResumen" class="rot-tab-content">
                <!-- AQUÍ se mueve el bloque "Índice de Rotación" (tabla mensual) -->
            </div>
            <div id="rotTabPorPuesto" class="rot-tab-content" style="display:none">
                <!-- AQUÍ se mueve el bloque "Rotación por Puesto" -->
            </div>
            <div id="rotTabPermanencia" class="rot-tab-content" style="display:none">
                <!-- Permanencia: se llena en Task 3 -->
            </div>
        </section>
```

- [ ] **Step 3: MOVER el bloque "Índice de Rotación" (tabla mensual)**

Cortar el bloque HTML de líneas ~945-969 de `#estadisticas` (el `<div>` que contiene el comentario `<!-- Tabla de rotación — tarjeta full-width -->` y `id="tablaRotacion"` con `tbodyRotacion`) y pegarlo DENTRO de `<div id="rotTabResumen">`. Usar Edit para borrarlo de su lugar original y otro Edit para insertarlo en el destino. Verificar que `id="tbodyRotacion"` aparece UNA sola vez en el archivo después.

- [ ] **Step 4: MOVER el bloque "Rotación por Puesto"**

Cortar el bloque de líneas ~971-1012 (comentario `<!-- Rotación por Puesto -->`, contiene `rotacionPuestoTable`/`tbodyRotacionPuesto`) y pegarlo DENTRO de `<div id="rotTabPorPuesto">`. Verificar que `id="tbodyRotacionPuesto"` aparece UNA sola vez después.

- [ ] **Step 5: Verificar integridad**

Run: `grep -n "id=\"tbodyRotacion\"\|id=\"tbodyRotacionPuesto\"\|id=\"rotacion\"\|data-section=\"rotacion\"\|rotTabResumen\|rotTabPorPuesto\|rotTabPermanencia" "C:/Users/USUARIO/Desktop/V2 checador-system ADMIN/Index.html"`
Expected: cada id aparece 1 vez; los tbody quedan DENTRO de la sección #rotacion (líneas mayores a la apertura de #rotacion). Confirmar que ya NO están dentro de #estadisticas.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/USUARIO/Desktop/V2 checador-system ADMIN"
git add Index.html
git commit -m "Rotacion: nueva seccion con sub-pestanas y migracion de tablas"
```

---

## Task 3: JS de sub-pestañas + tab Permanencia (histograma)

**Files:**
- Modify: `V2 checador-system ADMIN/Admin.js`

- [ ] **Step 1: Agregar el HTML de los controles + canvas de Permanencia**

En `Index.html`, dentro de `<div id="rotTabPermanencia">` (creado en Task 2), agregar (vía Edit en Index.html — nota: esta sub-tarea toca Index.html aunque el resto sea Admin.js):

```html
                <div class="card">
                    <div class="card-body">
                        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px">
                            <h3 style="margin:0;font-size:16px;font-weight:600">Permanencia por Puesto</h3>
                            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                                <select id="permFiltroPuesto" style="padding:4px 8px;border-radius:6px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;font-size:12px">
                                    <option value="">Todos los puestos</option>
                                </select>
                                <select id="permFiltroSucursal" style="padding:4px 8px;border-radius:6px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;font-size:12px">
                                    <option value="">Todas las sucursales</option>
                                </select>
                                <label style="font-size:12px;color:#94a3b8">Desde
                                    <input type="date" id="permDesde" style="margin-left:4px;padding:4px 8px;border-radius:6px;border:1px solid #334155;background:#1e293b;color:#e2e8f0">
                                </label>
                                <label style="font-size:12px;color:#94a3b8">Hasta
                                    <input type="date" id="permHasta" style="margin-left:4px;padding:4px 8px;border-radius:6px;border:1px solid #334155;background:#1e293b;color:#e2e8f0">
                                </label>
                                <button class="btn btn-primary" onclick="cargarHistogramaPermanencia()"><i class="fas fa-sync-alt"></i> Generar</button>
                            </div>
                        </div>
                        <div id="permResumen" style="font-size:13px;color:#94a3b8;margin-bottom:8px"></div>
                        <div style="padding:8px 4px 4px"><canvas id="chartPermanencia" style="min-height:340px"></canvas></div>
                    </div>
                </div>
```

Commit este HTML junto con el JS al final (un solo commit de Task 3) o como paso previo; recomendado: editar Index.html y Admin.js y commitear ambos juntos en Step 6.

- [ ] **Step 2: Agregar funciones JS**

En `Admin.js`, tras el bloque de Rotación por Puesto (después de `exportarRotacionPuestoExcel`), insertar:

```javascript

// ================================
// ROTACIÓN: SUB-PESTAÑAS + PERMANENCIA
// ================================

function mostrarTabRotacion(tab) {
    const mapa = { resumen: 'rotTabResumen', porpuesto: 'rotTabPorPuesto', permanencia: 'rotTabPermanencia' };
    Object.values(mapa).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    const activo = document.getElementById(mapa[tab]);
    if (activo) activo.style.display = '';

    document.querySelectorAll('.rot-tab').forEach(btn => {
        const esActivo = btn.getAttribute('data-rottab') === tab;
        btn.style.borderBottomColor = esActivo ? '#3b82f6' : 'transparent';
        btn.style.color = esActivo ? '#3b82f6' : '#94a3b8';
    });

    // Cargar permanencia la primera vez que se abre su tab
    if (tab === 'permanencia' && !_permCargado) {
        _permCargado = true;
        _poblarFiltrosPermanencia();
        cargarHistogramaPermanencia();
    }
}

let _permCargado = false;

// Llena el dropdown de puestos (reutiliza _estDatos.puestos de /estadisticas si existe)
// y el de sucursales (claves del mapa SUCURSAL_CODIGO).
function _poblarFiltrosPermanencia() {
    const selPue = document.getElementById('permFiltroPuesto');
    if (selPue && typeof _estDatos !== 'undefined' && _estDatos && Array.isArray(_estDatos.puestos)) {
        const pues = _estDatos.puestos.map(p => p.puesto).filter(Boolean).sort();
        selPue.innerHTML = '<option value="">Todos los puestos</option>' +
            pues.map(p => `<option value="${p}">${p}</option>`).join('');
    }
    const selSuc = document.getElementById('permFiltroSucursal');
    if (selSuc) {
        // Opciones por nombre BMS (el endpoint filtra por nombre), mostrando el código corto
        const nombres = Object.keys(SUCURSAL_CODIGO);
        selSuc.innerHTML = '<option value="">Todas las sucursales</option>' +
            nombres.map(n => `<option value="${n}">${SUCURSAL_CODIGO[n]}</option>`).join('');
    }
}

async function cargarHistogramaPermanencia() {
    const puesto = document.getElementById('permFiltroPuesto')?.value || '';
    const sucursal = document.getElementById('permFiltroSucursal')?.value || '';
    const desde = document.getElementById('permDesde')?.value || '';
    const hasta = document.getElementById('permHasta')?.value || '';
    const resumen = document.getElementById('permResumen');
    if (resumen) resumen.textContent = 'Cargando…';

    try {
        const params = new URLSearchParams();
        if (puesto) params.set('puesto', puesto);
        if (sucursal) params.set('sucursal', sucursal);
        if (desde) params.set('desde', desde);
        if (hasta) params.set('hasta', hasta);
        const res = await fetch(`${ADMIN_CONFIG.apiUrl}/empleados/permanencia?${params}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.message);

        if (resumen) {
            const etq = puesto || 'todos los puestos';
            resumen.textContent = `${json.total_empleados} empleados · ${etq}`;
        }
        // Reutiliza el helper de barras por rangos (mismo formato {rango,orden,total})
        if (_estCharts['chartPermanencia']) { _estCharts['chartPermanencia'].destroy(); }
        _renderChartBarrasRangos('chartPermanencia', json.data, '#3b82f6');
    } catch (err) {
        console.error('cargarHistogramaPermanencia:', err);
        if (resumen) resumen.textContent = `Error: ${err.message}`;
    }
}
```

- [ ] **Step 3: Exponer funciones en window**

Tras las exposiciones de rotación por puesto (`window.exportarRotacionPuestoExcel = ...`), agregar:

```javascript
window.mostrarTabRotacion = mostrarTabRotacion;
window.cargarHistogramaPermanencia = cargarHistogramaPermanencia;
```

- [ ] **Step 4: Disparar carga al abrir la sección Rotación**

En el switch de secciones (~línea 589), agregar un nuevo case ANTES o DESPUÉS de `case 'estadisticas':`:

```javascript
        case 'rotacion':
            cargarEstadisticas();      // alimenta la tabla mensual (tbodyRotacion) y _estDatos.puestos
            _initFechasRotPuesto();    // default de fechas de la tabla por puesto
            mostrarTabRotacion('resumen');
            break;
```

IMPORTANTE: `case 'estadisticas':` ya NO necesita `_initFechasRotPuesto()` (la tabla por puesto se movió). Quitar esa llamada del case estadisticas dejando solo `cargarEstadisticas();`. La tabla mensual sigue renderizándose vía `_redibujarEstadisticas` que llama `_renderTablaRotacion` — eso encuentra `tbodyRotacion` por id aunque esté en otra sección, así que funciona. (Si `cargarEstadisticas` se llama tanto en estadisticas como en rotacion, no hay problema: es idempotente y rellena ambos por id.)

- [ ] **Step 5: Verificar sintaxis**

Run: `node --check "C:/Users/USUARIO/Desktop/V2 checador-system ADMIN/Admin.js"`
Expected: exit 0.

- [ ] **Step 6: Commit (Index.html + Admin.js)**

```bash
cd "C:/Users/USUARIO/Desktop/V2 checador-system ADMIN"
git add Index.html Admin.js
git commit -m "Rotacion: sub-pestanas y tab Permanencia con histograma"
```

- [ ] **Step 7: Verificación manual en navegador**

- Menú muestra "Rotación"; al entrar abre tab Resumen con la tabla mensual.
- Tab "Por Puesto": la tabla por puesto funciona igual que antes (Generar, filtros, orden, Excel).
- Tab "Permanencia": dropdown de puestos poblado, sucursales con código corto; Generar dibuja el histograma de 7 barras; filtros re-consultan.
- Estadísticas ya NO muestra las dos tablas de rotación (se movieron), pero sí KPIs/gráficas.
- Tema claro/oscuro: histograma y tablas se ven bien en ambos.

---

## Notas de cierre

- **Push:** solo con OK del usuario.
- **Backend ERP:** desplegar/reiniciar para que `/permanencia` responda en vivo.
- **Dependencia:** el tab Resumen y el dropdown de puestos de Permanencia dependen de `cargarEstadisticas()` (datos de `/estadisticas`); por eso el case 'rotacion' lo invoca.
