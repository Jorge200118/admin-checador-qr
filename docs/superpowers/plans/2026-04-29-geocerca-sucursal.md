# Geocerca por sucursal — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir al superadmin definir una geocerca circular (centro + radio) por sucursal en el admin, y bloquear desde la PWA los registros que estén fuera del radio.

**Architecture:** Tabla nueva `sucursales` (catálogo + lat/lng/radio/activa) escrita desde una pantalla nueva en el admin (solo superadmin) usando Leaflet + OpenStreetMap. La PWA lee la geocerca antes de cada check y aborta si el empleado está fuera del radio (con margen por `accuracy` del GPS y fail-closed en error de red).

**Tech Stack:** SQL/Postgres (Supabase), JavaScript vanilla (no framework), Leaflet 1.9.4 vía CDN, OpenStreetMap tiles, Haversine inline (~10 líneas).

**Spec de referencia:** `docs/superpowers/specs/2026-04-29-geocerca-sucursal-design.md`

**Repos involucrados (dos directorios separados):**
- Admin: `c:\Users\USUARIO\Desktop\V2 checador-system ADMIN` (este repo)
- PWA: `C:\Users\USUARIO\Desktop\V3 Checador-PWA` (repo separado)

**Convenciones del proyecto que seguir:**
- Sin tests automatizados (no hay framework, ningún archivo de test). Verificación = pruebas manuales documentadas en cada tarea.
- JS vanilla, sin build step. Cada cambio se prueba abriendo el HTML en navegador.
- Mensajes de commit cortos en español, estilo: `Spec: ...`, `Fix: ...`, `Quitar pestaña ...`. Ver `git log --oneline`.
- Strings de UI en español.

---

## Estructura de archivos

### Admin (`V2 checador-system ADMIN`)
- **Crear** `supabase/migrations/2026-04-29_sucursales_geocerca.sql` — DDL + seed + RLS.
- **Modificar** `supabase-config.js` — agregar al objeto `SupabaseAPI` los métodos `getSucursalesGeocerca()` y `updateSucursalGeocerca(id, data)`. Inserción al final del bloque del objeto (antes del cierre `}`).
- **Modificar** `Index.html`:
  1. `<head>` → agregar `<link>` y `<script>` de Leaflet vía CDN (cargar siempre, ~54KB total — más simple que lazy y consistente con cómo cargan Supabase).
  2. Sidebar (línea ~80, después del item "dispositivos") → agregar item "Geocercas" con `data-section="geocercas"` y atributo `data-superadmin-only="true"` para ocultarlo a no-superadmin desde JS.
  3. `<main>` (después de `<section id="dispositivos">` y antes de `</main>` línea ~1204) → agregar `<section id="geocercas" class="content-section">` con la tabla.
  4. Modal nuevo `<div id="modalGeocerca">` después de los modales existentes.
- **Modificar** `Admin.js`:
  1. En `setupNavigation()` o al final de `initialize()` (después de setear `window.isSuperAdmin`) → ocultar items con `[data-superadmin-only]` si no es superadmin.
  2. En el objeto `titles` (línea ~224) → agregar `geocercas: 'Geocercas por Sucursal'`.
  3. En el `switch` de `loadSectionData` (línea ~454) → agregar `case 'geocercas': loadGeocercas(); break;`.
  4. Al final del archivo → agregar funciones `loadGeocercas()`, `openModalGeocerca(sucursalId)`, `initLeafletMap(...)`, `guardarGeocerca()`, `toggleGeocercaActiva(...)`.
- **Modificar** `Admin.css` — estilos para `#modalGeocerca` (ancho mínimo, contenedor del mapa con altura fija).

### PWA (`V3 Checador-PWA`)
- **Modificar** `supabase-config.js`:
  1. En `AuthAPI.buscarEmpleado()` y `AuthAPI.validarSesion()` → agregar `sucursal` al SELECT del empleado.
  2. Agregar método nuevo `RegistroAPI.getGeocercaSucursal(nombreSucursal)`.
- **Modificar** `views/captura.js`:
  1. Agregar función helper `haversineMetros(lat1, lng1, lat2, lng2)` arriba del objeto `Captura` o como propiedad.
  2. En `render()` → entre el `Promise.all([foto, gps])` y `enviar()`, llamar a una validación nueva `validarGeocerca(coords)` que aborta con error si está fuera.

---

## Tasks

### Task 1: Migración SQL (tabla `sucursales` + seed + RLS)

**Files:**
- Create: `supabase/migrations/2026-04-29_sucursales_geocerca.sql`

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- Migración: Geocerca por sucursal
-- Fecha: 2026-04-29
-- Descripción: Catálogo de sucursales con coordenadas y radio para validación de geocerca en PWA.

CREATE TABLE IF NOT EXISTS sucursales (
    id                  SERIAL PRIMARY KEY,
    nombre              TEXT UNIQUE NOT NULL,
    latitud             NUMERIC(10,7),
    longitud            NUMERIC(10,7),
    radio_metros        INTEGER DEFAULT 150,
    geocerca_activa     BOOLEAN DEFAULT false,
    actualizado_en      TIMESTAMPTZ DEFAULT now(),
    actualizado_por     TEXT
);

-- Seed con las 8 sucursales actuales del catálogo (ver Admin.js:467 SUCURSALES_LIST)
INSERT INTO sucursales (nombre) VALUES
    ('MATRIZ'),
    ('LA PAZ'),
    ('SAN JOSE'),
    ('TAMARAL'),
    ('CABOS'),
    ('EL FUERTE'),
    ('JUAN JOSE RIOS'),
    ('CULIACAN')
ON CONFLICT (nombre) DO NOTHING;

-- RLS: lectura pública (la PWA usa anon key y necesita leer la geocerca antes de cada check),
-- escrituras bloqueadas para anon (solo superadmin desde la UI del admin, validado en JS).
ALTER TABLE sucursales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon read sucursales" ON sucursales;
CREATE POLICY "anon read sucursales"
    ON sucursales FOR SELECT
    TO anon
    USING (true);

-- Sin políticas de INSERT/UPDATE/DELETE → con RLS habilitada y sin policy, anon no puede escribir.
-- IMPORTANTE: el admin actual usa la misma anon key y escribe usando que no hay policy de UPDATE.
-- Para permitir UPDATE desde la anon key (admin) sin abrir un hueco grande, agregamos UPDATE
-- también con TO anon. La protección efectiva está en UI: solo superadmin ve la pantalla.
-- Esto es coherente con el resto del proyecto (ver supabase-config.js:927-932).

DROP POLICY IF EXISTS "anon update sucursales" ON sucursales;
CREATE POLICY "anon update sucursales"
    ON sucursales FOR UPDATE
    TO anon
    USING (true)
    WITH CHECK (true);
```

- [ ] **Step 2: Aplicar la migración en Supabase**

Aplicar usando el MCP de Supabase con la herramienta `mcp__supabase__apply_migration`:

```
name: "sucursales_geocerca"
query: <contenido del archivo SQL anterior>
```

Esperado: éxito, sin errores. Si la tabla ya existiera por error previo, el `IF NOT EXISTS` evita el fallo; el seed usa `ON CONFLICT DO NOTHING`.

- [ ] **Step 3: Verificar que el seed cargó**

Ejecutar via `mcp__supabase__execute_sql`:

```sql
SELECT nombre, geocerca_activa, radio_metros FROM sucursales ORDER BY nombre;
```

Esperado: 8 filas, todas con `geocerca_activa = false` y `radio_metros = 150`.

- [ ] **Step 4: Commit**

```bash
git add "supabase/migrations/2026-04-29_sucursales_geocerca.sql"
git commit -m "Migración: tabla sucursales con geocerca (lat/lng/radio/activa)"
```

---

### Task 2: API en Admin para leer/escribir sucursales

**Files:**
- Modify: `supabase-config.js` (al final del objeto `SupabaseAPI`, antes del `}` que lo cierra en la línea 1350)

- [ ] **Step 1: Agregar métodos `getSucursalesGeocerca` y `updateSucursalGeocerca`**

Localizar el cierre del objeto `SupabaseAPI` (línea 1350 aprox., justo antes del `}` final del objeto). Insertar antes:

```javascript
    // ==========================================
    // SUCURSALES (GEOCERCAS)
    // ==========================================
    async getSucursalesGeocerca() {
        try {
            const { data, error } = await supabaseClient
                .from('sucursales')
                .select('*')
                .order('nombre');
            if (error) throw error;
            return { success: true, data: data || [] };
        } catch (error) {
            return { success: false, message: 'Error al obtener sucursales', data: [] };
        }
    },

    async updateSucursalGeocerca(sucursalId, datos) {
        try {
            const payload = {
                latitud: datos.latitud,
                longitud: datos.longitud,
                radio_metros: datos.radio_metros,
                geocerca_activa: datos.geocerca_activa,
                actualizado_en: new Date().toISOString(),
                actualizado_por: datos.actualizado_por || null
            };
            const { data, error } = await supabaseClient
                .from('sucursales')
                .update(payload)
                .eq('id', sucursalId)
                .select()
                .single();
            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            return { success: false, message: error.message || 'Error al guardar geocerca' };
        }
    },
```

(El bloque termina con `,` después de `},`. Dado que se inserta antes del `}` final del objeto `SupabaseAPI`, esa coma queda como trailing comma del último método — JS moderno lo tolera y deja el código preparado para agregar más métodos después sin tocar este bloque.)

- [ ] **Step 2: Verificar manualmente en consola del navegador**

Abrir `Index.html` en navegador. En la consola:

```javascript
await SupabaseAPI.getSucursalesGeocerca()
```

Esperado: `{success: true, data: Array(8)}` con las 8 sucursales sembradas.

- [ ] **Step 3: Commit**

```bash
git add supabase-config.js
git commit -m "API: métodos para leer y actualizar geocerca de sucursales"
```

---

### Task 3: Cargar Leaflet en el admin

**Files:**
- Modify: `Index.html` (línea 8, dentro del `<head>`)

- [ ] **Step 1: Agregar Leaflet CSS y JS al `<head>`**

Localizar línea 8 (`<link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">`). Insertar inmediatamente después:

```html
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossorigin="" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
            integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
            crossorigin="" defer></script>
```

- [ ] **Step 2: Verificar que carga**

Abrir Index.html en navegador, en consola ejecutar:

```javascript
typeof L
```

Esperado: `"object"` (el namespace global de Leaflet). Si dice `"undefined"`, revisar que el CDN cargó (Network tab).

- [ ] **Step 3: Commit**

```bash
git add Index.html
git commit -m "Cargar Leaflet 1.9.4 desde CDN para mapa de geocercas"
```

---

### Task 4: Sidebar y sección HTML "Geocercas"

**Files:**
- Modify: `Index.html` (sidebar línea ~80, sección antes de `</main>` línea ~1204)

- [ ] **Step 1: Agregar item al sidebar (solo visible para superadmin)**

Localizar el bloque del item "dispositivos" (líneas 74-79):

```html
                <li class="nav-item">
                    <a href="#dispositivos" data-section="dispositivos">
                        <i class="fas fa-mobile-alt"></i>
                        <span>Dispositivos PWA</span>
                    </a>
                </li>
```

Insertar inmediatamente después:

```html
                <li class="nav-item" data-superadmin-only="true">
                    <a href="#geocercas" data-section="geocercas">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>Geocercas</span>
                    </a>
                </li>
```

- [ ] **Step 2: Agregar la sección de contenido**

Localizar el cierre de la sección de dispositivos (línea ~1203, `</section>` después del `</div>` que cierra `card`). Insertar inmediatamente después (antes de `</main>`):

```html
        <!-- Geocercas Section (solo superadmin) -->
        <section id="geocercas" class="content-section">
            <div class="card">
                <div class="card-header">
                    <h3>Geocercas por sucursal</h3>
                    <button class="btn btn-sm btn-primary" onclick="loadGeocercas()">
                        <i class="fas fa-refresh"></i> Actualizar
                    </button>
                </div>
                <div class="card-body">
                    <p style="color:#64748b;font-size:13px;margin-bottom:12px">
                        Configura el centro y radio de cada sucursal. Cuando la geocerca está activa,
                        los empleados de esa sucursal no podrán checar desde la PWA si están fuera del radio.
                    </p>
                    <div class="table-container">
                        <table id="tablaGeocercas">
                            <thead>
                                <tr>
                                    <th>Sucursal</th>
                                    <th>Estado</th>
                                    <th>Coordenadas</th>
                                    <th>Radio</th>
                                    <th>Última actualización</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody id="geocercasTbody">
                                <tr><td colspan="6" style="text-align:center;padding:20px;color:#64748b">Cargando...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </section>
```

- [ ] **Step 3: Agregar el modal de edición (después de los demás modales)**

Localizar el final de los modales existentes (buscar `<!-- Overlay para cerrar sidebar en móvil -->` en línea ~1959). Insertar antes:

```html
    <!-- Modal Geocerca -->
    <div id="modalGeocerca" class="modal">
        <div class="modal-content" style="max-width:720px">
            <div class="modal-header">
                <h3 id="modalGeocercaTitle">Geocerca: SUCURSAL</h3>
                <span class="close" onclick="closeModal('modalGeocerca')">&times;</span>
            </div>
            <div class="modal-body">
                <div id="mapaGeocerca" style="height:380px;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:14px"></div>
                <div style="display:flex;gap:12px;align-items:center;margin-bottom:10px">
                    <button class="btn btn-sm btn-secondary" type="button" onclick="centrarEnMiUbicacion()">
                        <i class="fas fa-location-arrow"></i> Mi ubicación
                    </button>
                    <span style="font-size:12px;color:#64748b">Haz clic en el mapa para colocar/mover el pin.</span>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
                    <div>
                        <label style="font-size:12px;font-weight:600">Latitud</label>
                        <input type="number" id="geoLat" class="form-input" step="0.0000001" placeholder="—">
                    </div>
                    <div>
                        <label style="font-size:12px;font-weight:600">Longitud</label>
                        <input type="number" id="geoLng" class="form-input" step="0.0000001" placeholder="—">
                    </div>
                </div>
                <div style="margin-bottom:12px">
                    <label style="font-size:12px;font-weight:600">
                        Radio: <span id="geoRadioLabel">150</span> m
                    </label>
                    <input type="range" id="geoRadio" min="50" max="500" step="10" value="150" style="width:100%">
                </div>
                <label style="display:flex;align-items:center;gap:8px;font-size:13px">
                    <input type="checkbox" id="geoActiva">
                    <span>Geocerca activa (bloquea registros de PWA fuera del radio)</span>
                </label>
                <p id="geoActivaHint" style="font-size:12px;color:#64748b;margin-top:6px;display:none">
                    Pon primero el pin en el mapa para poder activar.
                </p>
            </div>
            <div class="modal-footer" style="display:flex;justify-content:flex-end;gap:10px;padding:14px">
                <button class="btn btn-secondary" onclick="closeModal('modalGeocerca')">Cancelar</button>
                <button class="btn btn-primary" onclick="guardarGeocerca()">Guardar</button>
            </div>
            <input type="hidden" id="geoSucursalId">
            <input type="hidden" id="geoSucursalNombre">
            <input type="hidden" id="geoActivaInicial">
        </div>
    </div>
```

- [ ] **Step 4: Verificar manualmente**

Abrir `Index.html`. Login como superadmin. Click en sidebar "Geocercas". Esperado: la sección aparece, la tabla muestra "Cargando..." (no hace nada todavía), el modal NO se abre (sin click en editar). El item "Geocercas" debe ser visible (todavía no hemos puesto la lógica para ocultarlo a no-superadmin).

- [ ] **Step 5: Commit**

```bash
git add Index.html
git commit -m "UI: agregar pestaña Geocercas y modal de edición con Leaflet"
```

---

### Task 5: Estilos del modal de geocerca

**Files:**
- Modify: `Admin.css` (al final del archivo)

- [ ] **Step 1: Agregar estilos**

Anexar al final de `Admin.css`:

```css
/* === Geocercas === */
#modalGeocerca .modal-content {
    width: 90%;
    max-width: 720px;
}

#mapaGeocerca {
    width: 100%;
    cursor: crosshair;
}

#mapaGeocerca .leaflet-container {
    border-radius: 8px;
}

#geoRadio {
    accent-color: #2563eb;
}

.geo-badge-activa {
    background: #d1fae5;
    color: #065f46;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
}

.geo-badge-inactiva {
    background: #f1f5f9;
    color: #64748b;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
}
```

- [ ] **Step 2: Commit**

```bash
git add Admin.css
git commit -m "Estilos: modal de geocerca y badges de estado"
```

---

### Task 6: Ocultar pestaña Geocercas a no-superadmin

**Files:**
- Modify: `Admin.js` (función `initialize`, después de la línea 138 donde se setea `window.isSuperAdmin`)

- [ ] **Step 1: Agregar lógica para ocultar items `[data-superadmin-only]`**

Localizar líneas 132-139 en `Admin.js`:

```javascript
        if (session.username === 'superadmin') {
            window.currentUserSucursal = null; // null = ver todas las sucursales
            window.isSuperAdmin = true;
        } else {
            window.currentUserSucursal = session.sucursal;
            window.isSuperAdmin = false;
        }
```

Insertar inmediatamente después de la llave de cierre del `else`:

```javascript

        // Ocultar items de sidebar marcados como solo-superadmin
        if (!window.isSuperAdmin) {
            document.querySelectorAll('[data-superadmin-only="true"]').forEach(el => {
                el.style.display = 'none';
            });
        }
```

- [ ] **Step 2: Verificar manualmente**

1. Login como superadmin → ver "Geocercas" en sidebar.
2. Logout, login como `admin.matriz` → NO debe verse "Geocercas" en sidebar.
3. Si un no-superadmin abre la URL `Index.html#geocercas` directo, la sección puede mostrarse pero todavía no la cargamos con datos. La verificación final de no-acceso por hot-link la hacemos en Task 7.

- [ ] **Step 3: Commit**

```bash
git add Admin.js
git commit -m "Ocultar pestaña Geocercas a usuarios no-superadmin"
```

---

### Task 7: Función `loadGeocercas` (lista de sucursales en tabla)

**Files:**
- Modify: `Admin.js` (al final del archivo + en `titles` y `loadSectionData`)

- [ ] **Step 1: Agregar entrada en `titles`**

Localizar el objeto `titles` (línea ~224):

```javascript
        dispositivos: 'Dispositivos PWA Vinculados',
        configuracion: 'Configuración del Sistema'
```

Cambiar a:

```javascript
        dispositivos: 'Dispositivos PWA Vinculados',
        geocercas: 'Geocercas por Sucursal',
        configuracion: 'Configuración del Sistema'
```

- [ ] **Step 2: Agregar `case` en `loadSectionData`**

Localizar el switch de `loadSectionData` (línea ~454, `case 'dispositivos':`). Insertar nuevo case justo después del case de `dispositivos`:

```javascript
        case 'geocercas':
            loadGeocercas();
            break;
```

- [ ] **Step 3: Agregar función `loadGeocercas` al final de `Admin.js`**

```javascript
// ================================
// GEOCERCAS POR SUCURSAL (solo superadmin)
// ================================
async function loadGeocercas() {
    if (!window.isSuperAdmin) {
        const tbody = document.getElementById('geocercasTbody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:#64748b">No tienes permisos para ver esta sección.</td></tr>';
        }
        return;
    }
    const tbody = document.getElementById('geocercasTbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:#64748b">Cargando...</td></tr>';

    const result = await SupabaseAPI.getSucursalesGeocerca();
    if (!result.success || result.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:#64748b">Sin sucursales configurables</td></tr>';
        return;
    }

    tbody.innerHTML = result.data.map(s => {
        const tieneCoords = s.latitud != null && s.longitud != null;
        const coordsTxt = tieneCoords
            ? `${Number(s.latitud).toFixed(5)}, ${Number(s.longitud).toFixed(5)}`
            : '—';
        const radioTxt = tieneCoords ? `${s.radio_metros} m` : '—';
        const badge = s.geocerca_activa
            ? '<span class="geo-badge-activa">Activa</span>'
            : '<span class="geo-badge-inactiva">Inactiva</span>';
        const fecha = s.actualizado_en
            ? new Date(s.actualizado_en).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
            : '—';
        const por = s.actualizado_por ? ` por ${s.actualizado_por}` : '';
        const toggleDisabled = !tieneCoords ? 'disabled' : '';
        const toggleLabel = s.geocerca_activa ? 'Desactivar' : 'Activar';

        return `
            <tr>
                <td><strong>${s.nombre}</strong></td>
                <td>${badge}</td>
                <td style="font-family:monospace;font-size:12px">${coordsTxt}</td>
                <td>${radioTxt}</td>
                <td style="font-size:12px;color:#64748b">${fecha}${por}</td>
                <td style="white-space:nowrap">
                    <button class="btn btn-sm btn-primary" onclick="openModalGeocerca(${s.id})">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    <button class="btn btn-sm btn-secondary" ${toggleDisabled}
                        onclick="toggleGeocercaActiva(${s.id}, ${!s.geocerca_activa})">
                        ${toggleLabel}
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Stubs — se implementan en tareas siguientes:
async function openModalGeocerca(_id) {
    showAlert('Info', 'Modal en desarrollo', 'info');
}
async function toggleGeocercaActiva(_id, _nuevoEstado) {
    showAlert('Info', 'Toggle en desarrollo', 'info');
}
async function guardarGeocerca() {
    showAlert('Info', 'Guardar en desarrollo', 'info');
}
async function centrarEnMiUbicacion() {
    showAlert('Info', 'Mi ubicación en desarrollo', 'info');
}
```

- [ ] **Step 4: Verificar manualmente**

1. Login como superadmin, click "Geocercas" en sidebar.
2. Esperado: tabla con 8 filas (MATRIZ, LA PAZ, etc.), todas "Inactiva", coordenadas "—", radio "—", botón "Editar" y "Activar" (este último deshabilitado).
3. Login como `admin.matriz`, navegar manualmente a `Index.html#geocercas`. Esperado: mensaje "No tienes permisos..." (porque `loadGeocercas` corta en no-superadmin).

- [ ] **Step 5: Commit**

```bash
git add Admin.js
git commit -m "Geocercas: pintar tabla de sucursales (lectura)"
```

---

### Task 8: Modal de geocerca con mapa Leaflet — abrir y cargar datos

**Files:**
- Modify: `Admin.js` (reemplazar el stub `openModalGeocerca`, agregar variable de estado del mapa)

- [ ] **Step 1: Reemplazar el stub `openModalGeocerca` y agregar estado del mapa**

Reemplazar la función stub `openModalGeocerca(_id)` (que pusiste en Task 7) por:

```javascript
// Estado del mapa de geocerca (se reinicia cada vez que se abre el modal)
let geocercaMapState = {
    map: null,
    marker: null,
    circle: null
};

async function openModalGeocerca(sucursalId) {
    if (!window.isSuperAdmin) {
        showAlert('Sin permisos', 'Solo el superadmin puede editar geocercas', 'error');
        return;
    }
    if (typeof L === 'undefined') {
        showAlert('Error', 'Leaflet no cargó. Revisa tu conexión.', 'error');
        return;
    }

    const result = await SupabaseAPI.getSucursalesGeocerca();
    if (!result.success) {
        showAlert('Error', result.message, 'error');
        return;
    }
    const sucursal = result.data.find(s => s.id === sucursalId);
    if (!sucursal) {
        showAlert('Error', 'Sucursal no encontrada', 'error');
        return;
    }

    // Llenar campos hidden e iniciales
    document.getElementById('geoSucursalId').value = sucursal.id;
    document.getElementById('geoSucursalNombre').value = sucursal.nombre;
    document.getElementById('geoActivaInicial').value = sucursal.geocerca_activa ? '1' : '0';
    document.getElementById('modalGeocercaTitle').textContent = `Geocerca: ${sucursal.nombre}`;
    document.getElementById('geoRadio').value = sucursal.radio_metros || 150;
    document.getElementById('geoRadioLabel').textContent = sucursal.radio_metros || 150;
    document.getElementById('geoActiva').checked = !!sucursal.geocerca_activa;

    const tieneCoords = sucursal.latitud != null && sucursal.longitud != null;
    if (tieneCoords) {
        document.getElementById('geoLat').value = sucursal.latitud;
        document.getElementById('geoLng').value = sucursal.longitud;
    } else {
        document.getElementById('geoLat').value = '';
        document.getElementById('geoLng').value = '';
    }

    actualizarHintActivar();

    // Mostrar modal
    openModal('modalGeocerca');

    // Inicializar mapa después de que el modal esté visible (para que tenga dimensiones)
    setTimeout(() => initLeafletGeocerca(sucursal), 100);
}

function actualizarHintActivar() {
    const lat = document.getElementById('geoLat').value;
    const lng = document.getElementById('geoLng').value;
    const checkbox = document.getElementById('geoActiva');
    const hint = document.getElementById('geoActivaHint');
    const tieneCoords = lat !== '' && lng !== '';
    checkbox.disabled = !tieneCoords;
    hint.style.display = tieneCoords ? 'none' : 'block';
    if (!tieneCoords) checkbox.checked = false;
}

function initLeafletGeocerca(sucursal) {
    const tieneCoords = sucursal.latitud != null && sucursal.longitud != null;
    // Centro inicial: coords guardadas, o Los Mochis para MATRIZ, o México genérico
    let centro;
    if (tieneCoords) {
        centro = [Number(sucursal.latitud), Number(sucursal.longitud)];
    } else if (sucursal.nombre === 'MATRIZ') {
        centro = [25.7833, -108.9833]; // Los Mochis aprox
    } else {
        centro = [23.6345, -102.5528]; // México genérico
    }

    // Si ya había mapa de una apertura previa, destruirlo
    if (geocercaMapState.map) {
        geocercaMapState.map.remove();
        geocercaMapState.map = null;
    }

    const map = L.map('mapaGeocerca').setView(centro, tieneCoords ? 17 : 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19
    }).addTo(map);

    geocercaMapState.map = map;

    if (tieneCoords) {
        ponerMarker(centro[0], centro[1]);
    }

    // Click en mapa → mover/colocar pin
    map.on('click', (e) => {
        ponerMarker(e.latlng.lat, e.latlng.lng);
    });

    // Cambios manuales en inputs lat/lng
    document.getElementById('geoLat').oninput = sincronizarDesdeInputs;
    document.getElementById('geoLng').oninput = sincronizarDesdeInputs;

    // Slider de radio
    const slider = document.getElementById('geoRadio');
    slider.oninput = () => {
        const r = Number(slider.value);
        document.getElementById('geoRadioLabel').textContent = r;
        if (geocercaMapState.circle) {
            geocercaMapState.circle.setRadius(r);
        }
    };
}

function ponerMarker(lat, lng) {
    const map = geocercaMapState.map;
    if (!map) return;
    const radio = Number(document.getElementById('geoRadio').value) || 150;

    if (geocercaMapState.marker) {
        geocercaMapState.marker.setLatLng([lat, lng]);
    } else {
        geocercaMapState.marker = L.marker([lat, lng], { draggable: true }).addTo(map);
        geocercaMapState.marker.on('dragend', (e) => {
            const ll = e.target.getLatLng();
            ponerMarker(ll.lat, ll.lng);
        });
    }

    if (geocercaMapState.circle) {
        geocercaMapState.circle.setLatLng([lat, lng]).setRadius(radio);
    } else {
        geocercaMapState.circle = L.circle([lat, lng], {
            radius: radio,
            color: '#2563eb',
            fillColor: '#2563eb',
            fillOpacity: 0.15
        }).addTo(map);
    }

    document.getElementById('geoLat').value = Number(lat).toFixed(7);
    document.getElementById('geoLng').value = Number(lng).toFixed(7);
    actualizarHintActivar();
}

function sincronizarDesdeInputs() {
    const lat = parseFloat(document.getElementById('geoLat').value);
    const lng = parseFloat(document.getElementById('geoLng').value);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
        ponerMarker(lat, lng);
        const map = geocercaMapState.map;
        if (map) map.setView([lat, lng], Math.max(map.getZoom(), 16));
    }
    actualizarHintActivar();
}
```

- [ ] **Step 2: Reemplazar el stub `centrarEnMiUbicacion`**

Reemplazar la función stub por:

```javascript
function centrarEnMiUbicacion() {
    if (!geocercaMapState.map) return;
    if (!navigator.geolocation) {
        showAlert('Sin GPS', 'Tu navegador no soporta geolocalización', 'error');
        return;
    }
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            geocercaMapState.map.setView([lat, lng], 18);
            // Si ya hay marker, no lo movemos automáticamente — solo centramos.
            // Si no hay marker, lo ponemos en la ubicación del usuario.
            if (!geocercaMapState.marker) {
                ponerMarker(lat, lng);
            }
        },
        () => showAlert('Sin permiso', 'No se pudo obtener tu ubicación', 'error'),
        { enableHighAccuracy: true, timeout: 10000 }
    );
}
```

- [ ] **Step 3: Verificar manualmente**

1. Click "Editar" en la fila de MATRIZ.
2. Esperado: modal abre, título "Geocerca: MATRIZ", mapa centrado en Los Mochis aprox, radio 150, slider funciona, checkbox "Geocerca activa" deshabilitado con hint visible.
3. Click en el mapa → aparece marcador y círculo azul.
4. Mover el slider → el círculo cambia de tamaño en vivo.
5. Editar inputs lat/lng manualmente con valores válidos → se mueve el pin.
6. Click "Mi ubicación" → pide permiso, centra el mapa.
7. Click "Cancelar" → se cierra el modal sin guardar nada.

- [ ] **Step 4: Commit**

```bash
git add Admin.js
git commit -m "Geocerca: modal con mapa Leaflet (centro, marker, círculo, inputs)"
```

---

### Task 9: Guardar geocerca + toggle activa/inactiva

**Files:**
- Modify: `Admin.js` (reemplazar stubs `guardarGeocerca` y `toggleGeocercaActiva`)

- [ ] **Step 1: Reemplazar el stub `guardarGeocerca`**

```javascript
async function guardarGeocerca() {
    if (!window.isSuperAdmin) return;

    const sucursalId = Number(document.getElementById('geoSucursalId').value);
    const sucursalNombre = document.getElementById('geoSucursalNombre').value;
    const lat = parseFloat(document.getElementById('geoLat').value);
    const lng = parseFloat(document.getElementById('geoLng').value);
    const radio = parseInt(document.getElementById('geoRadio').value, 10);
    const activa = document.getElementById('geoActiva').checked;
    const activaInicial = document.getElementById('geoActivaInicial').value === '1';

    if (activa && (!Number.isFinite(lat) || !Number.isFinite(lng))) {
        showAlert('Falta el pin', 'Coloca el pin en el mapa antes de activar la geocerca.', 'error');
        return;
    }

    // Confirm si está pasando de inactiva → activa
    if (activa && !activaInicial) {
        const confirmado = confirm(
            `Vas a bloquear los registros de la PWA fuera del radio para empleados de ${sucursalNombre}. ¿Continuar?`
        );
        if (!confirmado) return;
    }

    const username = JSON.parse(
        localStorage.getItem('session_sucursal') || sessionStorage.getItem('session_sucursal') || '{}'
    ).username || null;

    const datos = {
        latitud: Number.isFinite(lat) ? lat : null,
        longitud: Number.isFinite(lng) ? lng : null,
        radio_metros: radio,
        geocerca_activa: activa,
        actualizado_por: username
    };

    const res = await SupabaseAPI.updateSucursalGeocerca(sucursalId, datos);
    if (!res.success) {
        showAlert('Error', res.message, 'error');
        return;
    }
    closeModal('modalGeocerca');
    showAlert('Guardado', `Geocerca de ${sucursalNombre} actualizada`, 'success');
    loadGeocercas();
}
```

- [ ] **Step 2: Reemplazar el stub `toggleGeocercaActiva`**

```javascript
async function toggleGeocercaActiva(sucursalId, nuevoEstado) {
    if (!window.isSuperAdmin) return;

    // Necesitamos los datos actuales para no pisar lat/lng/radio
    const result = await SupabaseAPI.getSucursalesGeocerca();
    if (!result.success) {
        showAlert('Error', result.message, 'error');
        return;
    }
    const sucursal = result.data.find(s => s.id === sucursalId);
    if (!sucursal) return;

    if (nuevoEstado && (sucursal.latitud == null || sucursal.longitud == null)) {
        showAlert('Falta el pin', 'Configura primero la geocerca antes de activarla.', 'error');
        return;
    }
    if (nuevoEstado) {
        const ok = confirm(
            `Vas a bloquear los registros de la PWA fuera del radio para empleados de ${sucursal.nombre}. ¿Continuar?`
        );
        if (!ok) return;
    }

    const username = JSON.parse(
        localStorage.getItem('session_sucursal') || sessionStorage.getItem('session_sucursal') || '{}'
    ).username || null;

    const res = await SupabaseAPI.updateSucursalGeocerca(sucursalId, {
        latitud: sucursal.latitud,
        longitud: sucursal.longitud,
        radio_metros: sucursal.radio_metros,
        geocerca_activa: nuevoEstado,
        actualizado_por: username
    });
    if (!res.success) {
        showAlert('Error', res.message, 'error');
        return;
    }
    showAlert('Listo', `Geocerca ${nuevoEstado ? 'activada' : 'desactivada'} para ${sucursal.nombre}`, 'success');
    loadGeocercas();
}
```

- [ ] **Step 3: Verificar manualmente (flujo completo)**

1. Login superadmin → Geocercas → Editar MATRIZ.
2. Click en mapa cerca de Los Mochis → aparecen pin y círculo. Inputs lat/lng se llenan.
3. Slider a 200 → label dice "200 m", círculo crece.
4. Marcar "Geocerca activa". Esperado: aparece confirm "Vas a bloquear...". Aceptar.
5. Click "Guardar". Esperado: alert de éxito, modal cierra, tabla se refresca con MATRIZ "Activa", coords correctas, radio 200 m.
6. En la tabla, click "Desactivar" en MATRIZ. Esperado: alert "Geocerca desactivada para MATRIZ", refresca a "Inactiva".
7. Click "Activar" en MATRIZ (ya tiene coords). Esperado: confirm, aceptar, queda "Activa" otra vez.
8. Verificar en BD via `mcp__supabase__execute_sql`:

```sql
SELECT nombre, latitud, longitud, radio_metros, geocerca_activa, actualizado_por FROM sucursales WHERE nombre = 'MATRIZ';
```

Esperado: la fila refleja los últimos cambios.

- [ ] **Step 4: Commit**

```bash
git add Admin.js
git commit -m "Geocerca: guardar desde modal y toggle activa/inactiva con confirm"
```

---

### Task 10: PWA — agregar `sucursal` al SELECT del empleado

**Files:**
- Modify: `C:\Users\USUARIO\Desktop\V3 Checador-PWA\supabase-config.js`

> **Atención:** Esta tarea cambia de repo. Cambiar de directorio antes de los commits.

- [ ] **Step 1: Agregar `sucursal` al SELECT en `buscarEmpleado` y `validarSesion`**

En el archivo `supabase-config.js` (ojo: el de la PWA, no el del admin):

Localizar `buscarEmpleado` (línea 48). El SELECT actual es:

```javascript
.select('id, codigo_empleado, nombre, apellido, foto_perfil, horario_id, activo')
```

Cambiar a:

```javascript
.select('id, codigo_empleado, nombre, apellido, foto_perfil, horario_id, activo, sucursal')
```

Localizar `validarSesion` (línea 98). Dentro del SELECT anidado:

```javascript
empleado:empleados(
    id,
    codigo_empleado,
    nombre,
    apellido,
    foto_perfil,
    horario_id,
    activo
)
```

Cambiar a:

```javascript
empleado:empleados(
    id,
    codigo_empleado,
    nombre,
    apellido,
    foto_perfil,
    horario_id,
    activo,
    sucursal
)
```

- [ ] **Step 2: Verificar manualmente**

Abrir la PWA en navegador. En consola, después de bootstrap (estando ya vinculado):

```javascript
AppState.empleado.sucursal
```

Esperado: el string de la sucursal del empleado (ej. `"MATRIZ"`) o `null` si no tiene asignada. **NO** debe ser `undefined`.

- [ ] **Step 3: Commit (en el repo de la PWA)**

```bash
cd "C:/Users/USUARIO/Desktop/V3 Checador-PWA"
git add supabase-config.js
git commit -m "Incluir sucursal del empleado en SELECT (auth y validación de sesión)"
```

---

### Task 11: PWA — método `getGeocercaSucursal`

**Files:**
- Modify: `C:\Users\USUARIO\Desktop\V3 Checador-PWA\supabase-config.js` (al final del objeto `RegistroAPI`)

- [ ] **Step 1: Agregar el método dentro de `RegistroAPI`**

Localizar el cierre del objeto `RegistroAPI` (después del método `crearRegistro`, antes del `};` que cierra el objeto, línea ~259).

Insertar antes del `};` final del objeto:

```javascript
,

    async getGeocercaSucursal(nombreSucursal) {
        if (!nombreSucursal) return { success: true, data: null };
        const { data, error } = await supabaseClient
            .from('sucursales')
            .select('nombre, latitud, longitud, radio_metros, geocerca_activa')
            .eq('nombre', nombreSucursal)
            .maybeSingle();
        if (error) {
            console.error('Error leyendo geocerca:', error);
            return { success: false, message: 'No se pudo verificar tu ubicación' };
        }
        return { success: true, data };
    }
```

(El bloque arriba empieza con `,` porque el método previo `crearRegistro` ya cierra con `}` sin coma. La coma del nuevo bloque convierte ese `}` en separador de propiedades. Si al ir a editar el archivo ves que `crearRegistro` ya termina con `,`, entonces omite la coma del bloque y empieza directo con `async getGeocercaSucursal(...)`.)

- [ ] **Step 2: Verificar manualmente en consola**

```javascript
await RegistroAPI.getGeocercaSucursal('MATRIZ')
```

Esperado: `{success: true, data: {nombre: 'MATRIZ', latitud: ..., longitud: ..., radio_metros: 200, geocerca_activa: true}}` (los valores que dejaste en Task 9).

```javascript
await RegistroAPI.getGeocercaSucursal('NO_EXISTE')
```

Esperado: `{success: true, data: null}` (maybeSingle devuelve null si no hay match).

- [ ] **Step 3: Commit**

```bash
git add supabase-config.js
git commit -m "PWA: método getGeocercaSucursal (lee config de validación)"
```

---

### Task 12: PWA — validación de geocerca en `captura.js`

**Files:**
- Modify: `C:\Users\USUARIO\Desktop\V3 Checador-PWA\views\captura.js`

- [ ] **Step 1: Cambiar `getGPS` para devolver también `accuracy`**

Localizar `getGPS()` (líneas 59-68):

```javascript
    async getGPS() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) return reject(new Error('GPS no disponible'));
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                (err) => reject(new Error('No se pudo obtener ubicación: ' + err.message)),
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
            );
        });
    },
```

Cambiar a:

```javascript
    async getGPS() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) return reject(new Error('GPS no disponible'));
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve({
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    accuracy: pos.coords.accuracy || 0
                }),
                (err) => reject(new Error('No se pudo obtener ubicación: ' + err.message)),
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
            );
        });
    },
```

- [ ] **Step 2: Agregar helper Haversine y validación de geocerca**

Insertar nuevos métodos en el objeto `Captura` (justo después de `getGPS()` y antes de `stopCamera()`):

```javascript
    // Distancia entre dos coords en metros (fórmula de Haversine)
    haversineMetros(lat1, lng1, lat2, lng2) {
        const R = 6371000; // radio de la Tierra en metros
        const toRad = (deg) => deg * Math.PI / 180;
        const dLat = toRad(lat2 - lat1);
        const dLng = toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
                  Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(a));
    },

    async validarGeocerca(coords) {
        const sucursal = AppState.empleado && AppState.empleado.sucursal;
        // Sin sucursal asignada → no validamos (no rompemos a empleados sin sucursal).
        if (!sucursal) return { valido: true };

        const res = await RegistroAPI.getGeocercaSucursal(sucursal);
        if (!res.success) {
            // Fail-closed: si no podemos leer la geocerca, abortamos.
            return { valido: false, mensaje: 'No se pudo verificar tu ubicación. Revisa tu internet e intenta de nuevo.' };
        }
        // Sucursal sin fila en tabla, o geocerca apagada → deja pasar.
        if (!res.data || !res.data.geocerca_activa) return { valido: true };
        if (res.data.latitud == null || res.data.longitud == null) return { valido: true };

        const distancia = this.haversineMetros(
            coords.lat, coords.lng,
            Number(res.data.latitud), Number(res.data.longitud)
        );
        const margen = coords.accuracy || 0;
        if (distancia - margen > res.data.radio_metros) {
            return {
                valido: false,
                mensaje: `Estás a ${Math.round(distancia)} m de ${sucursal}. Acércate para poder checar.`
            };
        }
        return { valido: true };
    },
```

- [ ] **Step 3: Insertar la llamada a `validarGeocerca` en `render()`**

Localizar el bloque actual en `render()` (líneas 18-29):

```javascript
        try {
            await this.startCamera();
            const [fotoBase64, coords] = await Promise.all([
                this.countdownAndCapture(),
                this.getGPS()
            ]);
            await this.enviar(tipo, fotoBase64, coords);
        } catch (err) {
            this.stopCamera();
            showToast(err.message || 'Error al capturar', 'error');
            Router.go('principal');
        }
```

Cambiar a:

```javascript
        try {
            await this.startCamera();
            const [fotoBase64, coords] = await Promise.all([
                this.countdownAndCapture(),
                this.getGPS()
            ]);
            const geo = await this.validarGeocerca(coords);
            if (!geo.valido) {
                this.stopCamera();
                showToast(geo.mensaje, 'error');
                return Router.go('principal');
            }
            await this.enviar(tipo, fotoBase64, coords);
        } catch (err) {
            this.stopCamera();
            showToast(err.message || 'Error al capturar', 'error');
            Router.go('principal');
        }
```

- [ ] **Step 4: Verificar manualmente — fuera de zona**

Pre-requisitos (asume que ya configuraste MATRIZ en Task 9 con coords reales y geocerca activa):

1. Asegúrate que tu empleado de prueba tiene `sucursal = 'MATRIZ'` en BD. Si no, ajustarlo:

```sql
UPDATE empleados SET sucursal = 'MATRIZ' WHERE codigo_empleado = '<código de prueba>';
```

2. En el admin, configura la geocerca de MATRIZ con un pin **lejos** de donde estás (ej. en el centro de Los Mochis si estás en CDMX), radio 150m, activa.
3. Abrir PWA, intentar checar.
4. Esperado: countdown corre, foto se toma, GPS se obtiene, **se aborta** con toast "Estás a {N} m de MATRIZ. Acércate para poder checar." (donde N es la distancia real). Regresa a pantalla principal. **No** se inserta nada en `registros`.

Verificar en BD:

```sql
SELECT id, fecha_hora, tipo_registro FROM registros
WHERE empleado_id = (SELECT id FROM empleados WHERE codigo_empleado = '<tu código>')
ORDER BY fecha_hora DESC LIMIT 3;
```

Esperado: el último registro NO es de hace 30 segundos (no se insertó nada nuevo).

- [ ] **Step 5: Verificar manualmente — dentro de zona**

1. En el admin, mover la geocerca de MATRIZ con "Mi ubicación" para que estés dentro del radio (o inflar el radio a 500m si estás cerca del original).
2. Intentar checar desde la PWA.
3. Esperado: flujo normal de check, registro se inserta. Toast verde "✓ ENTRADA registrada HH:MM".

- [ ] **Step 6: Verificar manualmente — geocerca desactivada**

1. En el admin, desactivar la geocerca de MATRIZ.
2. Intentar checar desde la PWA fuera del radio anterior.
3. Esperado: registra normal sin bloquear.

- [ ] **Step 7: Verificar manualmente — empleado de otra sucursal**

1. Cambiar el empleado a `sucursal = 'CULIACAN'` (o cualquier otra que NO tenga geocerca activa).
2. Reactivar geocerca de MATRIZ desde el admin.
3. Limpiar localStorage y volver a vincular el empleado para que `AppState.empleado.sucursal` se actualice.
4. Intentar checar desde la PWA estando lejos.
5. Esperado: registra normal (la geocerca de MATRIZ no aplica a empleados de CULIACAN).

- [ ] **Step 8: Verificar manualmente — error de red al leer sucursales**

1. Activar geocerca de MATRIZ.
2. Empleado con `sucursal = 'MATRIZ'`.
3. En DevTools, Network → throttle a "Offline". Intentar checar.
4. Esperado: toast "No se pudo verificar tu ubicación. Revisa tu internet e intenta de nuevo." Regresa a principal sin insertar nada.
   (Nota: el primer error puede ser del propio GPS o la consulta de validación previa de `validarRegistro`; lo importante es que NO se cuele un INSERT a `registros`.)

- [ ] **Step 9: Commit**

```bash
git add views/captura.js
git commit -m "PWA: validar geocerca antes de enviar (fail-closed, margen por accuracy)"
```

---

### Task 13: Verificación end-to-end y limpieza

**Files:** N/A (solo verificación)

- [ ] **Step 1: Smoke test del admin**

1. Login como `admin.matriz` (no superadmin) → sidebar **NO** muestra "Geocercas".
2. Login como `superadmin` → sidebar **SÍ** muestra "Geocercas".
3. Pestaña Geocercas → tabla con 8 sucursales, todas las acciones funcionan.
4. Editar SAN JOSE (sin coords previas) → modal abre con mapa centrado en México genérico, click coloca pin, guardar funciona.
5. Activar SAN JOSE con confirm.
6. Desactivar SAN JOSE.

- [ ] **Step 2: Smoke test de la PWA**

Repetir Tasks 12.4–12.7 si aún no se hizo, pero esta vez en orden:
1. MATRIZ activa, empleado MATRIZ fuera → bloquea.
2. MATRIZ activa, empleado MATRIZ dentro → registra.
3. MATRIZ desactiva, empleado MATRIZ fuera → registra.
4. MATRIZ activa, empleado CULIACAN fuera de MATRIZ → registra (no aplica).

- [ ] **Step 3: Verificar que no hay "registros bloqueados" en BD**

```sql
-- No debe haber registros con coordenadas obviamente fuera de la planta
-- pero esto es informativo, no destructivo: solo confirma que cuando se bloqueó, no se insertó.
SELECT id, fecha_hora, latitud, longitud, origen
FROM registros
WHERE origen = 'PWA' AND fecha_hora > now() - interval '1 hour'
ORDER BY fecha_hora DESC;
```

Esperado: solo aparecen los registros de los smoke tests "exitosos" (los bloqueados nunca se insertaron).

- [ ] **Step 4: Dejar la geocerca de MATRIZ en el estado real definitivo**

Editar la geocerca de MATRIZ en el admin con las coordenadas reales de la planta (Aceros del Pacífico Los Mochis) y un radio adecuado (sugerido: 200m). Activar.

(Si el desarrollador no sabe las coordenadas exactas, dejar la tarea pendiente para el usuario y NO activar.)

- [ ] **Step 5: Commit final (si quedó alguna limpieza)**

Si no hay cambios de código pendientes, no hace falta commit. Si quedó algo (ej. console.logs olvidados), limpiar y commitear:

```bash
git add -A
git commit -m "Limpieza final post-verificación de geocercas"
```

---

## Checklist de cierre

Antes de cerrar el plan, confirmar:

- [ ] Migración aplicada en Supabase (8 sucursales sembradas).
- [ ] Pestaña Geocercas visible solo para superadmin.
- [ ] Mapa Leaflet funciona (clic, drag de marker, slider, mi ubicación, inputs lat/lng).
- [ ] Guardar persiste correctamente (verificable en `SELECT * FROM sucursales`).
- [ ] Toggle activar/desactivar funciona desde la lista.
- [ ] Confirm aparece al pasar de inactiva → activa.
- [ ] PWA bloquea con mensaje correcto cuando empleado está fuera del radio.
- [ ] PWA permite check cuando geocerca está desactivada.
- [ ] PWA permite check para empleados cuya sucursal no tiene geocerca activa.
- [ ] Fail-closed: error de red al leer `sucursales` aborta el check.
- [ ] Margen por `accuracy` aplicado en la comparación.
- [ ] Sin "TBD"/"TODO" sin resolver en código nuevo.

---

## Notas para el implementador

- **Dos repos**: las Tasks 1–9 son en `V2 checador-system ADMIN`. Las Tasks 10–12 son en `V3 Checador-PWA`. Usa `cd` en los commits para que vayan al repo correcto.
- **Sin tests automatizados**: este proyecto no tiene framework de testing. La verificación es manual y está documentada paso a paso.
- **No es un browser session único**: para probar el flujo "un empleado de MATRIZ checa desde la PWA", necesitas (a) estar vinculado en la PWA, (b) que ese empleado tenga `sucursal = 'MATRIZ'` en BD, (c) la geocerca de MATRIZ activa en el admin. Si vas a probar ambos roles (admin y PWA), usa dos navegadores o ventanas privadas.
- **Las coordenadas reales de la planta**: el desarrollador no las sabe; el superadmin (usuario) las pondrá. Para pruebas de implementación, usar cualquier coord razonable y mover el pin a tu propia ubicación con "Mi ubicación".
- **Si Leaflet falla en cargar** (red, CDN caído): el botón "Editar" muestra "Leaflet no cargó". El admin sigue funcionando sin la pantalla.
