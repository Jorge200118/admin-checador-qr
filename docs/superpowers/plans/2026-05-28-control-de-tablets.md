# Control de Tablets — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que el superadmin gestione tablets desde el admin (alta con código autogenerado, edición, listado con último uso, bloqueo y regeneración de código), y que las tablets validen su vigencia contra la BD en cada apertura y antes de cada checada.

**Architecture:** Tabla nueva `tablets` en Supabase (vacía al inicio — el admin las da de alta una por una). Sección "Tablets" en admin (solo superadmin) con tabla, modales y `TabletsAPI`. El código de 6 dígitos se **autogenera** en el servidor cuando el admin crea la tablet; el usuario no lo escribe ni lo edita. Cliente de tablet reescribe login para validar contra BD, guarda `tablet_id`/`codigo` en `localStorage`, y verifica vigencia antes de cada checada. Bloqueo es soft (`activo=false`). Regenerar código equivale a revocar la sesión activa de esa tablet.

**Contexto operativo importante:** el código `1810` que estaba hardcodeado **fue vulnerado**. La migración crea la tabla vacía. Esto significa que al desplegar el cliente nuevo, **todas las tablets actuales quedan tumbadas automáticamente** (no pueden hacer login porque no hay códigos en BD). El operador debe: (1) dar de alta cada tablet en el admin, (2) anotar/copiar el código de 6 dígitos generado, (3) ingresarlo físicamente en la tablet correspondiente. Una sola vez por dispositivo.

**Tech Stack:** Supabase (PostgreSQL + JS client), HTML/CSS/JS vanilla, sin framework de tests. La verificación se hace **manualmente** siguiendo pasos exactos en cada tarea (el proyecto no tiene Jest/Vitest configurado).

**Repos afectados:**
- Admin: `c:\Users\USUARIO\Desktop\V2 checador-system ADMIN`
- Tablet: `c:\Users\USUARIO\Desktop\v2 Checador-Tablet`

**Spec:** [docs/superpowers/specs/2026-05-28-control-de-tablets-design.md](../specs/2026-05-28-control-de-tablets-design.md)

---

## Resumen de archivos a tocar

**Admin (`V2 checador-system ADMIN`):**
- Crear: `supabase/migrations/2026-05-28_tablets.sql`
- Modificar: `Index.html` (sidebar + sección + modales)
- Modificar: `supabase-config.js` (agregar `TabletsAPI` después de `DispositivosAPI`)
- Modificar: `Admin.js` (funciones de UI de tablets, después de la sección de Dispositivos PWA)

**Tablet (`v2 Checador-Tablet`):**
- Modificar: `app.js` (reescribir auth, eliminar hardcoded, agregar verificación de vigencia)
- Modificar: `supabase-config.js` (agregar `TabletAuthAPI`, integrar verificación previa al insert)
- Modificar: `Index.html` (agregar botón "Cerrar sesión" en panel de configuración si no existe; ampliar `maxlength` del input de código de 4 a 6)

---

## Task 1: Migración SQL — crear tabla `tablets` con seed

**Files:**
- Create: `supabase/migrations/2026-05-28_tablets.sql`

- [ ] **Step 1: Crear archivo de migración**

```sql
-- Tabla de tablets gestionables desde admin
CREATE TABLE IF NOT EXISTS tablets (
  id BIGSERIAL PRIMARY KEY,
  tablet_id VARCHAR(50) NOT NULL UNIQUE,
  codigo VARCHAR(20) NOT NULL UNIQUE,
  nombre VARCHAR(100) NOT NULL,
  sucursal_codigo VARCHAR(20),
  activo BOOLEAN DEFAULT true NOT NULL,
  bloqueado_en TIMESTAMP,
  bloqueado_motivo TEXT,
  ultimo_uso TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_tablets_codigo ON tablets(codigo);
CREATE INDEX idx_tablets_activo ON tablets(activo);
CREATE INDEX idx_tablets_tablet_id ON tablets(tablet_id);

-- NO se siembra ninguna tablet. La tabla queda vacía intencionalmente:
-- el código '1810' fue vulnerado y todas las tablets se dan de alta desde el admin
-- con códigos autogenerados de 6 dígitos.

-- RLS: permitir SELECT/INSERT/UPDATE con anon key (patrón del proyecto)
ALTER TABLE tablets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tablets_select_anon" ON tablets
  FOR SELECT TO anon USING (true);

CREATE POLICY "tablets_insert_anon" ON tablets
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "tablets_update_anon" ON tablets
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

COMMENT ON TABLE tablets IS 'Inventario de tablets gestionado desde el admin. activo=false equivale a bloqueada.';
COMMENT ON COLUMN tablets.tablet_id IS 'Identificador estable usado en registros.tablet_id. Inmutable.';
COMMENT ON COLUMN tablets.codigo IS 'PIN de acceso que la tablet ingresa para vincularse. Cambiarlo revoca la tablet.';
```

- [ ] **Step 2: Aplicar la migración en Supabase**

Aplicar manualmente vía Supabase Dashboard → SQL Editor, o mediante MCP `mcp__supabase__apply_migration` con `name='2026-05-28_tablets'`.

- [ ] **Step 3: Verificar que la tabla existe y está vacía**

Ejecutar en SQL Editor de Supabase:

```sql
SELECT count(*) FROM tablets;
```

Expected: `0` (la tabla está vacía intencionalmente).

```sql
\d tablets
```

(o `SELECT column_name, data_type FROM information_schema.columns WHERE table_name='tablets';`)

Expected: ver todas las columnas definidas en la migración.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-05-28_tablets.sql
git commit -m "Tablets: migracion inicial + seed"
```

---

## Task 2: Admin — `TabletsAPI` en `supabase-config.js`

**Files:**
- Modify: `supabase-config.js` (después de `DispositivosAPI` que termina en línea ~1514)

- [ ] **Step 1: Agregar `TabletsAPI` al final del archivo**

Insertar después de la línea 1514 (cierre de `DispositivosAPI`):

```javascript
// ==========================================
// API DE TABLETS (solo superadmin)
// ==========================================
const TabletsAPI = {
    async listar({ soloActivos = true, busqueda = '' } = {}) {
        // Query 1: tablets
        let query = supabaseClient
            .from('tablets')
            .select('id, tablet_id, codigo, nombre, sucursal_codigo, activo, bloqueado_en, bloqueado_motivo, ultimo_uso, created_at')
            .order('ultimo_uso', { ascending: false, nullsFirst: false });

        if (soloActivos) query = query.eq('activo', true);

        const { data, error } = await query;
        if (error) {
            console.error('Error listando tablets:', error);
            return [];
        }

        let tablets = data || [];

        // Filtro de búsqueda en memoria
        if (busqueda) {
            const b = busqueda.toLowerCase();
            tablets = tablets.filter(t =>
                (t.nombre || '').toLowerCase().includes(b) ||
                (t.codigo || '').toLowerCase().includes(b) ||
                (t.tablet_id || '').toLowerCase().includes(b)
            );
        }

        // Query 2: checadas de hoy por tablet_id
        const inicioHoy = new Date();
        inicioHoy.setHours(0, 0, 0, 0);
        const inicioISO = inicioHoy.toISOString().slice(0, 19).replace('T', ' ');

        const { data: regs, error: regsErr } = await supabaseClient
            .from('registros')
            .select('tablet_id')
            .gte('fecha_hora', inicioISO);

        const conteo = {};
        if (!regsErr && Array.isArray(regs)) {
            for (const r of regs) {
                if (!r.tablet_id) continue;
                conteo[r.tablet_id] = (conteo[r.tablet_id] || 0) + 1;
            }
        }

        return tablets.map(t => ({ ...t, checadas_hoy: conteo[t.tablet_id] || 0 }));
    },

    /**
     * Genera un código numérico de 6 dígitos único.
     * Reintenta hasta 5 veces en caso de colisión con códigos existentes.
     */
    async _generarCodigoUnico() {
        for (let intento = 0; intento < 5; intento++) {
            // Código de 6 dígitos. Math.random() puede dar valores con < 6 dígitos: padStart.
            const codigo = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
            const { data, error } = await supabaseClient
                .from('tablets')
                .select('id')
                .eq('codigo', codigo)
                .maybeSingle();
            if (error) {
                console.error('Error verificando unicidad de código:', error);
                return null;
            }
            if (!data) return codigo;
        }
        return null;
    },

    /**
     * Crea una tablet con código autogenerado.
     * El llamador NO pasa código — lo recibe en la respuesta para mostrarlo al usuario.
     */
    async crear({ tablet_id, nombre, sucursal_codigo }) {
        const codigo = await this._generarCodigoUnico();
        if (!codigo) {
            return { success: false, message: 'No se pudo generar un código único, intenta de nuevo.' };
        }
        const { data, error } = await supabaseClient
            .from('tablets')
            .insert({ tablet_id, codigo, nombre, sucursal_codigo, activo: true })
            .select()
            .single();
        if (error) {
            console.error('Error creando tablet:', error);
            return { success: false, message: error.message };
        }
        return { success: true, data };
    },

    /**
     * Actualiza solo nombre y sucursal. El código NO se edita desde aquí — para cambiarlo usa regenerarCodigo().
     */
    async actualizar(id, { nombre, sucursal_codigo }) {
        const { error } = await supabaseClient
            .from('tablets')
            .update({ nombre, sucursal_codigo, updated_at: new Date().toISOString() })
            .eq('id', id);
        if (error) {
            console.error('Error actualizando tablet:', error);
            return { success: false, message: error.message };
        }
        return { success: true };
    },

    /**
     * Regenera el código de la tablet. Equivale a revocar la sesión actual.
     * Retorna el nuevo código en data.codigo para que el admin pueda anotarlo.
     */
    async regenerarCodigo(id) {
        const codigo = await this._generarCodigoUnico();
        if (!codigo) {
            return { success: false, message: 'No se pudo generar un código único, intenta de nuevo.' };
        }
        const { data, error } = await supabaseClient
            .from('tablets')
            .update({ codigo, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();
        if (error) {
            console.error('Error regenerando código:', error);
            return { success: false, message: error.message };
        }
        return { success: true, data };
    },

    async bloquear(id, motivo = null) {
        const { error } = await supabaseClient
            .from('tablets')
            .update({
                activo: false,
                bloqueado_en: new Date().toISOString(),
                bloqueado_motivo: motivo || null,
                updated_at: new Date().toISOString()
            })
            .eq('id', id);
        if (error) {
            console.error('Error bloqueando tablet:', error);
            return { success: false };
        }
        return { success: true };
    },

    async desbloquear(id) {
        const { error } = await supabaseClient
            .from('tablets')
            .update({
                activo: true,
                bloqueado_en: null,
                bloqueado_motivo: null,
                updated_at: new Date().toISOString()
            })
            .eq('id', id);
        if (error) {
            console.error('Error desbloqueando tablet:', error);
            return { success: false };
        }
        return { success: true };
    }
};
```

- [ ] **Step 2: Verificar manualmente desde la consola del navegador**

Abrir el admin (`Index.html`) en el navegador, abrir DevTools → Console y ejecutar:

```javascript
await TabletsAPI.listar({ soloActivos: false, busqueda: '' });
```

Expected: array vacío `[]` (la tabla está vacía hasta que se den de alta tablets desde la UI).

```javascript
await TabletsAPI._generarCodigoUnico();
```

Expected: string de 6 dígitos numéricos, ej. `"483921"`.

- [ ] **Step 3: Commit**

```bash
git add supabase-config.js
git commit -m "Tablets: TabletsAPI en admin"
```

---

## Task 3: Admin — link en sidebar y sección HTML vacía

**Files:**
- Modify: `Index.html` (sidebar ~línea 92 y nueva sección antes del cierre de `<main>` ~línea 1526)

- [ ] **Step 1: Agregar link en el sidebar**

Localizar el `<li>` de Geocercas (~línea 92):

```html
                <li class="nav-item" data-superadmin-only="true">
                    <a href="#geocercas" data-section="geocercas">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>Geocercas</span>
                    </a>
                </li>
```

Insertar **inmediatamente después**:

```html
                <li class="nav-item" data-superadmin-only="true">
                    <a href="#tablets" data-section="tablets">
                        <i class="fas fa-tablet-alt"></i>
                        <span>Tablets</span>
                    </a>
                </li>
```

- [ ] **Step 2: Agregar la sección HTML**

Localizar la sección de Geocercas que termina con `</section>` antes de `</main>` (~línea 1525). Insertar **antes** de `</main>` (después del cierre de la sección Geocercas):

```html
        <!-- Tablets Section (solo superadmin) -->
        <section id="tablets" class="content-section">
            <div class="card">
                <div class="card-header">
                    <h3>Tablets vinculadas</h3>
                    <div>
                        <button class="btn btn-sm btn-primary" onclick="abrirModalTablet()">
                            <i class="fas fa-plus"></i> Nueva tablet
                        </button>
                        <button class="btn btn-sm btn-secondary" onclick="cargarTablets()">
                            <i class="fas fa-refresh"></i> Actualizar
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <div class="disp-toolbar">
                        <input type="text" id="tabBusqueda" placeholder="Buscar por nombre, código o ID..." class="form-input disp-search" />
                        <label class="disp-toggle">
                            <input type="checkbox" id="tabSoloActivos" checked>
                            Solo activas
                        </label>
                    </div>
                    <div class="table-container">
                        <table id="tabTabla">
                            <thead>
                                <tr>
                                    <th>ID Tablet</th>
                                    <th>Nombre</th>
                                    <th>Sucursal</th>
                                    <th>Código</th>
                                    <th>Último uso</th>
                                    <th>Hoy</th>
                                    <th>Estado</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody id="tabTbody">
                                <tr><td colspan="8" style="text-align:center;padding:20px;color:#64748b">Cargando...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </section>
```

- [ ] **Step 3: Agregar modal de Nueva/Editar tablet al final del bloque de modales**

Buscar el último modal existente (cerca del final del `<body>`) e insertar después:

```html
    <!-- Modal Nueva/Editar Tablet -->
    <div id="modalTablet" class="modal">
        <div class="modal-content" style="max-width: 480px;">
            <div class="modal-header">
                <h3 id="modalTabletTitle">Nueva tablet</h3>
                <span class="close" onclick="cerrarModalTablet()">&times;</span>
            </div>
            <div class="modal-body">
                <form id="formTablet" onsubmit="guardarTablet(event)">
                    <input type="hidden" id="tabFormId" value="">
                    <div class="form-group">
                        <label>ID de Tablet:</label>
                        <input type="text" id="tabFormTabletId" class="form-input" required maxlength="50" placeholder="TABLET_02">
                        <small style="color:#64748b">Identificador estable, ej: TABLET_02. No se puede cambiar después.</small>
                    </div>
                    <div class="form-group">
                        <label>Nombre descriptivo:</label>
                        <input type="text" id="tabFormNombre" class="form-input" required maxlength="100" placeholder="Tablet Recepción">
                    </div>
                    <div class="form-group">
                        <label>Sucursal:</label>
                        <select id="tabFormSucursal" class="form-input">
                            <option value="">— Sin asignar —</option>
                        </select>
                    </div>
                    <p style="color:#64748b; font-size:13px; margin:8px 0 0 0;">
                        El código de acceso de 6 dígitos se generará automáticamente al guardar.
                    </p>
                    <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:8px; padding-top:12px;">
                        <button type="button" class="btn btn-secondary" onclick="cerrarModalTablet()">Cancelar</button>
                        <button type="submit" class="btn btn-primary">Guardar</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <!-- Modal: mostrar código recién generado/regenerado (alta o regenerar) -->
    <div id="modalCodigoTablet" class="modal">
        <div class="modal-content" style="max-width: 440px;">
            <div class="modal-header">
                <h3 id="modalCodigoTitulo">Código de acceso</h3>
                <span class="close" onclick="cerrarModalCodigoTablet()">&times;</span>
            </div>
            <div class="modal-body" style="text-align:center;">
                <p id="modalCodigoTexto" style="margin-bottom:12px;">
                    Anota el código y configúralo en la tablet correspondiente.
                </p>
                <div id="modalCodigoValor" style="font-size:42px; font-weight:bold; letter-spacing:8px; background:#f1f5f9; padding:16px; border-radius:8px; margin:12px 0; font-family:'Courier New', monospace;">
                    ——————
                </div>
                <button type="button" class="btn btn-secondary" onclick="copiarCodigoTablet()" style="margin-bottom:8px;">
                    📋 Copiar al portapapeles
                </button>
                <p style="color:#dc2626; font-size:12px; margin-top:8px;">
                    Por seguridad, este código no se mostrará completo otra vez.
                    Si lo pierdes, puedes regenerarlo (lo cual revocará el actual).
                </p>
                <div class="modal-footer" style="display:flex; justify-content:center; padding-top:12px;">
                    <button type="button" class="btn btn-primary" onclick="cerrarModalCodigoTablet()">Listo</button>
                </div>
            </div>
        </div>
    </div>

    <!-- Modal Confirmar Bloqueo -->
    <div id="modalBloqueoTablet" class="modal">
        <div class="modal-content" style="max-width: 440px;">
            <div class="modal-header">
                <h3>Bloquear tablet</h3>
                <span class="close" onclick="cerrarModalBloqueoTablet()">&times;</span>
            </div>
            <div class="modal-body">
                <p id="bloqueoTabletTexto" style="margin-bottom:12px;">¿Bloquear esta tablet?</p>
                <div class="form-group">
                    <label>Motivo (opcional):</label>
                    <textarea id="bloqueoTabletMotivo" class="form-input" rows="3" maxlength="500" placeholder="Ej: tablet dañada, sucursal cerrada..."></textarea>
                </div>
                <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:8px; padding-top:12px;">
                    <button type="button" class="btn btn-secondary" onclick="cerrarModalBloqueoTablet()">Cancelar</button>
                    <button type="button" class="btn btn-primary" style="background:#dc2626;border-color:#dc2626;" onclick="confirmarBloqueoTablet()">Bloquear</button>
                </div>
            </div>
        </div>
    </div>
```

- [ ] **Step 4: Verificar manualmente que la sección aparece**

1. Recargar `Index.html` en el navegador como superadmin.
2. Verificar que aparece "Tablets" en el sidebar bajo "Infraestructura".
3. Click → debe mostrar la card con el toolbar y tabla con "Cargando..." (todavía no hay JS).
4. Loguear como usuario no-superadmin → la opción "Tablets" debe estar oculta.

- [ ] **Step 5: Commit**

```bash
git add Index.html
git commit -m "Tablets: sidebar + seccion HTML + modales"
```

---

## Task 4: Admin — handler de sección + carga de tablets

**Files:**
- Modify: `Admin.js` (agregar después de la sección de Dispositivos PWA, ~línea 8627)

- [ ] **Step 1: Agregar al final del archivo (o después de DISPOSITIVOS PWA)**

```javascript
// ================================
// SECCIÓN DE TABLETS (solo superadmin)
// ================================
let tabletsState = { soloActivos: true, busqueda: '' };
let _tabletsCache = [];

function setupTabletsFilters() {
    const search = document.getElementById('tabBusqueda');
    const toggle = document.getElementById('tabSoloActivos');
    if (search && !search.dataset.wired) {
        search.addEventListener('input', (e) => {
            tabletsState.busqueda = e.target.value;
            cargarTablets();
        });
        search.dataset.wired = '1';
    }
    if (toggle && !toggle.dataset.wired) {
        toggle.addEventListener('change', (e) => {
            tabletsState.soloActivos = e.target.checked;
            cargarTablets();
        });
        toggle.dataset.wired = '1';
    }
}

async function cargarTablets() {
    const tbody = document.getElementById('tabTbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:#64748b"><i class="fas fa-spinner fa-spin"></i> Cargando...</td></tr>';

    setupTabletsFilters();

    const lista = await TabletsAPI.listar(tabletsState);
    _tabletsCache = lista;

    if (!lista.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:#64748b">Sin tablets</td></tr>';
        return;
    }

    const tz = { timeZone: 'America/Mazatlan' };
    const parseTs = (ts) => {
        if (!ts) return null;
        const s = String(ts);
        if (/Z$|[+-]\d{2}:\d{2}$/.test(s)) return new Date(s);
        return new Date(s.replace(' ', 'T') + 'Z');
    };
    const fmtUso = (ts) => {
        const d = parseTs(ts);
        if (!d) return 'Nunca';
        const fecha = d.toLocaleDateString('es-MX', tz);
        const hora = d.toLocaleTimeString('es-MX', { ...tz, hour: '2-digit', minute: '2-digit' });
        return `${fecha} ${hora}`;
    };

    tbody.innerHTML = lista.map(t => {
        // Por seguridad, mostrar solo los últimos 2 dígitos del código.
        const codigo = t.codigo || '';
        const codigoEnmascarado = codigo.length >= 2
            ? '••••' + codigo.slice(-2)
            : '••••••';
        const sucursal = t.sucursal_codigo || '—';
        const uso = fmtUso(t.ultimo_uso);
        const estado = t.activo
            ? '<span class="disp-badge activo">Activa</span>'
            : `<span class="disp-badge inactivo" title="${(t.bloqueado_motivo || '').replace(/"/g,'&quot;')}">Bloqueada</span>`;
        const nombreEsc = (t.nombre || '').replace(/"/g,'&quot;');
        const accionBloqueo = t.activo
            ? `<button class="btn-desvincular" data-action="bloquear" data-id="${t.id}" data-nombre="${nombreEsc}">Bloquear</button>`
            : `<button class="btn-desvincular" style="background:#16a34a;" data-action="desbloquear" data-id="${t.id}" data-nombre="${nombreEsc}">Desbloquear</button>`;
        const accionEditar = `<button class="btn-desvincular" style="background:#2563eb;margin-left:4px;" data-action="editar" data-id="${t.id}">Editar</button>`;
        const accionRegen = `<button class="btn-desvincular" style="background:#f59e0b;margin-left:4px;" data-action="regenerar" data-id="${t.id}" data-nombre="${nombreEsc}" title="Regenera el código; la tablet actual será revocada.">Regenerar código</button>`;

        return `<tr>
            <td><strong>${t.tablet_id}</strong></td>
            <td>${t.nombre || '—'}</td>
            <td>${sucursal}</td>
            <td><code>${codigoEnmascarado}</code></td>
            <td>${uso}</td>
            <td style="text-align:center;">${t.checadas_hoy}</td>
            <td>${estado}</td>
            <td>${accionBloqueo}${accionEditar}${accionRegen}</td>
        </tr>`;
    }).join('');

    // Wire up buttons
    tbody.querySelectorAll('.btn-desvincular').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = parseInt(btn.getAttribute('data-id'), 10);
            const action = btn.getAttribute('data-action');
            const nombre = btn.getAttribute('data-nombre') || '';
            if (action === 'bloquear') pedirBloqueoTablet(id, nombre);
            else if (action === 'desbloquear') confirmarDesbloqueoTablet(id, nombre);
            else if (action === 'editar') abrirModalTablet(id);
            else if (action === 'regenerar') confirmarRegenerarCodigo(id, nombre);
        });
    });
}

window.cargarTablets = cargarTablets;
```

- [ ] **Step 2: Conectar la navegación a la sección "tablets"**

En `Admin.js`, localizar la función `loadSectionData(section)` con el `switch` (~línea 560). Encontrar el caso de `'dispositivos'`:

```javascript
        case 'dispositivos':
            cargarDispositivos();
            setupDispositivosFilters();
            break;
```

Insertar **después** un nuevo caso para `'tablets'`:

```javascript
        case 'tablets':
            cargarTablets();
            break;
```

(`cargarTablets` ya invoca `setupTabletsFilters` internamente, no hace falta una llamada separada.)

- [ ] **Step 3: Verificar manualmente**

1. Recargar admin como superadmin.
2. Click en "Tablets" del sidebar.
3. Debe mostrar el estado vacío: "Sin tablets" (la tabla todavía no tiene registros).
4. El toolbar (buscador, checkbox "Solo activas") debe estar visible y funcional aunque la tabla esté vacía.
5. El botón "Nueva tablet" debe estar visible. (La verificación funcional de creación se hace en Task 5.)

- [ ] **Step 4: Commit**

```bash
git add Admin.js
git commit -m "Tablets: listado en admin con filtros"
```

---

## Task 5: Admin — modal de Nueva/Editar tablet

**Files:**
- Modify: `Admin.js` (continuación de la sección de Tablets)

- [ ] **Step 1: Agregar funciones de modal después de `cargarTablets`**

```javascript
// --- Modal Nueva/Editar Tablet ---

async function abrirModalTablet(id = null) {
    const modal = document.getElementById('modalTablet');
    const title = document.getElementById('modalTabletTitle');
    const formId = document.getElementById('tabFormId');
    const inputTabletId = document.getElementById('tabFormTabletId');
    const inputNombre = document.getElementById('tabFormNombre');
    const selectSucursal = document.getElementById('tabFormSucursal');

    // Poblar select de sucursales
    await poblarSucursalesEnTabletForm(selectSucursal);

    if (id) {
        const tablet = _tabletsCache.find(t => t.id === id);
        if (!tablet) {
            alert('Tablet no encontrada');
            return;
        }
        title.textContent = 'Editar tablet';
        formId.value = String(tablet.id);
        inputTabletId.value = tablet.tablet_id;
        inputTabletId.readOnly = true;
        inputNombre.value = tablet.nombre || '';
        selectSucursal.value = tablet.sucursal_codigo || '';
    } else {
        title.textContent = 'Nueva tablet';
        formId.value = '';
        inputTabletId.value = '';
        inputTabletId.readOnly = false;
        inputNombre.value = '';
        selectSucursal.value = '';
    }

    modal.style.display = 'block';
}

function cerrarModalTablet() {
    document.getElementById('modalTablet').style.display = 'none';
}

async function poblarSucursalesEnTabletForm(select) {
    select.innerHTML = '<option value="">— Sin asignar —</option>';
    try {
        const { data, error } = await supabaseClient
            .from('sucursales')
            .select('codigo, nombre')
            .order('codigo');
        if (error || !Array.isArray(data)) return;
        for (const s of data) {
            const opt = document.createElement('option');
            opt.value = s.codigo;
            opt.textContent = `${s.codigo} — ${s.nombre || ''}`;
            select.appendChild(opt);
        }
    } catch (err) {
        console.warn('No se pudieron cargar sucursales:', err);
    }
}

async function guardarTablet(e) {
    if (e) e.preventDefault();
    const id = document.getElementById('tabFormId').value;
    const tablet_id = document.getElementById('tabFormTabletId').value.trim();
    const nombre = document.getElementById('tabFormNombre').value.trim();
    const sucursal_codigo = document.getElementById('tabFormSucursal').value || null;

    if (!tablet_id || !nombre) {
        alert('Completa los campos requeridos: ID de tablet y nombre.');
        return;
    }

    let res;
    if (id) {
        res = await TabletsAPI.actualizar(parseInt(id, 10), { nombre, sucursal_codigo });
    } else {
        res = await TabletsAPI.crear({ tablet_id, nombre, sucursal_codigo });
    }

    if (res.success) {
        cerrarModalTablet();
        cargarTablets();
        // En alta, mostrar el código recién generado para que el operador lo anote
        if (!id && res.data && res.data.codigo) {
            mostrarModalCodigo(
                'Código de acceso generado',
                `Tablet "${res.data.nombre || res.data.tablet_id}" creada. Anota este código y configúralo en la tablet.`,
                res.data.codigo
            );
        }
    } else {
        alert('Error al guardar: ' + (res.message || 'desconocido'));
    }
}

// --- Modal de mostrar código (alta + regenerar) ---

function mostrarModalCodigo(titulo, texto, codigo) {
    document.getElementById('modalCodigoTitulo').textContent = titulo;
    document.getElementById('modalCodigoTexto').textContent = texto;
    document.getElementById('modalCodigoValor').textContent = codigo;
    document.getElementById('modalCodigoTablet').style.display = 'block';
}

function cerrarModalCodigoTablet() {
    document.getElementById('modalCodigoTablet').style.display = 'none';
    document.getElementById('modalCodigoValor').textContent = '——————';
}

async function copiarCodigoTablet() {
    const codigo = document.getElementById('modalCodigoValor').textContent;
    try {
        await navigator.clipboard.writeText(codigo);
        const btn = event.target;
        const orig = btn.textContent;
        btn.textContent = '✓ Copiado';
        setTimeout(() => { btn.textContent = orig; }, 1500);
    } catch (err) {
        alert('No se pudo copiar al portapapeles. Cópialo manualmente: ' + codigo);
    }
}

window.abrirModalTablet = abrirModalTablet;
window.cerrarModalTablet = cerrarModalTablet;
window.guardarTablet = guardarTablet;
window.mostrarModalCodigo = mostrarModalCodigo;
window.cerrarModalCodigoTablet = cerrarModalCodigoTablet;
window.copiarCodigoTablet = copiarCodigoTablet;
```

- [ ] **Step 2: Verificar manualmente — crear tablet nueva**

1. Click en "Nueva tablet".
2. Llenar: ID `TABLET_TEST`, Nombre `Tablet Prueba`, Sucursal cualquiera. No hay campo de código.
3. Click "Guardar".
4. Modal del formulario cierra y aparece el **modal de código** con un número de 6 dígitos en grande (ej. `483921`).
5. Click "Copiar al portapapeles" → debe cambiar el botón a "✓ Copiado".
6. Pegar (Ctrl+V) en cualquier campo de texto para confirmar que se copió el código.
7. Click "Listo".
8. La tabla se recarga. La fila de `TABLET_TEST` aparece con código enmascarado tipo `••••21` (solo últimos 2 dígitos visibles), estado "Activa".

- [ ] **Step 3: Verificar manualmente — editar tablet existente**

1. Click "Editar" en la fila de `TABLET_TEST`.
2. El modal NO debe tener campo de código (solo ID readonly, nombre, sucursal).
3. Cambiar nombre a `Tablet Prueba Editada`.
4. Click "Guardar". El modal cierra, la fila refleja el nuevo nombre. NO debe aparecer el modal de código (porque es edición, no alta).

- [ ] **Step 4: Verificar manualmente — error de unicidad**

1. Click "Nueva tablet".
2. Intentar crear otra con `tablet_id = TABLET_TEST` (ya existe).
3. Click "Guardar" → debe mostrar alert con error de constraint.

- [ ] **Step 5: Limpiar la tablet de prueba**

Desde el SQL Editor:
```sql
DELETE FROM tablets WHERE tablet_id = 'TABLET_TEST';
```

(Eliminación manual; el código de admin no expone delete.)

- [ ] **Step 6: Commit**

```bash
git add Admin.js
git commit -m "Tablets: modal de alta/edicion"
```

---

## Task 6: Admin — bloqueo, desbloqueo y regenerar código

**Files:**
- Modify: `Admin.js` (continuación)

- [ ] **Step 1: Agregar funciones de bloqueo + regenerar después de `copiarCodigoTablet`**

```javascript
// --- Bloqueo / Desbloqueo ---

let _tabletPendienteBloqueo = null;

function pedirBloqueoTablet(id, nombre) {
    _tabletPendienteBloqueo = id;
    document.getElementById('bloqueoTabletTexto').textContent =
        `¿Bloquear la tablet "${nombre}"? No podrá registrar checadas hasta que la desbloquees.`;
    document.getElementById('bloqueoTabletMotivo').value = '';
    document.getElementById('modalBloqueoTablet').style.display = 'block';
}

function cerrarModalBloqueoTablet() {
    _tabletPendienteBloqueo = null;
    document.getElementById('modalBloqueoTablet').style.display = 'none';
}

async function confirmarBloqueoTablet() {
    if (!_tabletPendienteBloqueo) return;
    const motivo = document.getElementById('bloqueoTabletMotivo').value.trim() || null;
    const res = await TabletsAPI.bloquear(_tabletPendienteBloqueo, motivo);
    cerrarModalBloqueoTablet();
    if (res.success) {
        cargarTablets();
    } else {
        alert('Error al bloquear la tablet.');
    }
}

async function confirmarDesbloqueoTablet(id, nombre) {
    if (!confirm(`¿Desbloquear la tablet "${nombre}"?`)) return;
    const res = await TabletsAPI.desbloquear(id);
    if (res.success) {
        cargarTablets();
    } else {
        alert('Error al desbloquear la tablet.');
    }
}

// --- Regenerar código ---

async function confirmarRegenerarCodigo(id, nombre) {
    const ok = confirm(
        `¿Regenerar el código de "${nombre}"?\n\n` +
        `Esto invalidará el código actual y la tablet vinculada quedará revocada inmediatamente. ` +
        `Tendrás que configurar el nuevo código en la tablet física.`
    );
    if (!ok) return;
    const res = await TabletsAPI.regenerarCodigo(id);
    if (res.success && res.data && res.data.codigo) {
        cargarTablets();
        mostrarModalCodigo(
            'Nuevo código generado',
            `Código regenerado para "${res.data.nombre || res.data.tablet_id}". Configúralo en la tablet física.`,
            res.data.codigo
        );
    } else {
        alert('Error al regenerar el código: ' + (res.message || 'desconocido'));
    }
}

window.pedirBloqueoTablet = pedirBloqueoTablet;
window.cerrarModalBloqueoTablet = cerrarModalBloqueoTablet;
window.confirmarBloqueoTablet = confirmarBloqueoTablet;
window.confirmarDesbloqueoTablet = confirmarDesbloqueoTablet;
window.confirmarRegenerarCodigo = confirmarRegenerarCodigo;
```

- [ ] **Step 2: Verificar manualmente — bloqueo**

Para esta verificación, primero crea una tablet de prueba: click "Nueva tablet", ID `TAB_TEST_BLOQ`, nombre `Prueba Bloqueo`, sucursal cualquiera. Anota el código generado.

1. Click "Bloquear" en la fila de `TAB_TEST_BLOQ`.
2. Modal aparece con texto correcto.
3. Escribir motivo "prueba de bloqueo" y click "Bloquear".
4. La fila debe cambiar a estado "Bloqueada" (badge rojo) y aparecer el botón "Desbloquear" en verde.
5. Hover sobre el badge "Bloqueada" debe mostrar el motivo como tooltip.

- [ ] **Step 3: Verificar manualmente — desbloqueo**

1. Click "Desbloquear" en la fila bloqueada.
2. Confirm aparece, click OK.
3. La fila vuelve a estado "Activa".

- [ ] **Step 4: Verificar manualmente — filtro "Solo activas"**

1. Bloquear `TAB_TEST_BLOQ` otra vez.
2. Marcar "Solo activas" → desaparece de la lista.
3. Desmarcar → vuelve a aparecer en estado bloqueada.
4. Desbloquear.

- [ ] **Step 5: Verificar manualmente — regenerar código**

1. Click "Regenerar código" en la fila de `TAB_TEST_BLOQ`.
2. Confirm aparece con texto explicativo. Click OK.
3. Aparece modal con el nuevo código de 6 dígitos.
4. Anota o verifica el código.
5. Click "Listo" → cierra el modal.
6. La fila debe mostrar el código enmascarado con los últimos 2 dígitos del nuevo código.
7. (Validación adicional, SQL Editor): `SELECT codigo FROM tablets WHERE tablet_id='TAB_TEST_BLOQ';` debe coincidir con el código mostrado.

- [ ] **Step 6: Limpiar la tablet de prueba**

```sql
DELETE FROM tablets WHERE tablet_id = 'TAB_TEST_BLOQ';
```

- [ ] **Step 7: Commit**

```bash
git add Admin.js
git commit -m "Tablets: bloqueo, desbloqueo y regenerar codigo desde admin"
```

---

## Task 7: Tablet — `TabletAuthAPI` en `supabase-config.js`

**Files:**
- Modify: `c:\Users\USUARIO\Desktop\v2 Checador-Tablet\supabase-config.js` (agregar API antes del cierre del archivo)

- [ ] **Step 1: Agregar `TabletAuthAPI` antes del cierre del archivo**

Localizar el final del archivo (después del cierre del objeto `SupabaseAPI`). Insertar:

```javascript
// ==========================================
// API DE AUTH/CONTROL DE LA TABLET
// ==========================================
const TabletAuthAPI = {
    /**
     * Valida un código contra la tabla `tablets`.
     * @returns {Promise<{ok:true, tablet_id, nombre, sucursal_codigo} | {ok:false, motivo:string}>}
     */
    async validarCodigo(codigo) {
        if (!supabaseClient) {
            return { ok: false, motivo: 'sin-cliente' };
        }
        try {
            const { data, error } = await supabaseClient
                .from('tablets')
                .select('tablet_id, nombre, sucursal_codigo, activo')
                .eq('codigo', codigo)
                .maybeSingle();
            if (error) {
                console.error('Error validando código:', error);
                return { ok: false, motivo: 'error-red' };
            }
            if (!data) {
                return { ok: false, motivo: 'codigo-invalido' };
            }
            if (!data.activo) {
                return { ok: false, motivo: 'bloqueada' };
            }
            return {
                ok: true,
                tablet_id: data.tablet_id,
                nombre: data.nombre,
                sucursal_codigo: data.sucursal_codigo
            };
        } catch (err) {
            console.error('Excepción validando código:', err);
            return { ok: false, motivo: 'error-red' };
        }
    },

    /**
     * Verifica que la tablet siga vigente: existe el par (tablet_id, codigo) y activo=true.
     * @returns {Promise<{activo:true} | {activo:false, motivo:'bloqueada'|'codigo-cambiado'|'error-red', bloqueado_motivo?:string}>}
     */
    async verificarVigencia(tabletId, codigo) {
        if (!supabaseClient) {
            return { activo: false, motivo: 'error-red' };
        }
        try {
            const { data, error } = await supabaseClient
                .from('tablets')
                .select('activo, bloqueado_motivo')
                .eq('tablet_id', tabletId)
                .eq('codigo', codigo)
                .maybeSingle();
            if (error) {
                console.error('Error verificando vigencia:', error);
                return { activo: false, motivo: 'error-red' };
            }
            if (!data) {
                return { activo: false, motivo: 'codigo-cambiado' };
            }
            if (!data.activo) {
                return { activo: false, motivo: 'bloqueada', bloqueado_motivo: data.bloqueado_motivo };
            }
            return { activo: true };
        } catch (err) {
            console.error('Excepción verificando vigencia:', err);
            return { activo: false, motivo: 'error-red' };
        }
    },

    /**
     * Actualiza tablets.ultimo_uso. Fire-and-forget: no espera respuesta.
     */
    registrarUso(tabletId) {
        if (!supabaseClient || !tabletId) return;
        supabaseClient
            .from('tablets')
            .update({ ultimo_uso: new Date().toISOString() })
            .eq('tablet_id', tabletId)
            .then(({ error }) => {
                if (error) console.warn('No se pudo actualizar ultimo_uso:', error);
            });
    }
};
```

- [ ] **Step 2: Verificar desde la consola del navegador**

Antes de probar, necesitas dar de alta una tablet desde el admin: en el admin, click "Nueva tablet", ID `TAB_QA_API`, nombre `QA API`, sucursal cualquiera. Anota el código generado (ej. `483921`).

Abrir la tablet en navegador (`Index.html` de `v2 Checador-Tablet`), DevTools → Console:

```javascript
await TabletAuthAPI.validarCodigo('483921'); // usa el código real que anotaste
```

Expected: `{ ok: true, tablet_id: 'TAB_QA_API', nombre: 'QA API', sucursal_codigo: '...' }`.

```javascript
await TabletAuthAPI.validarCodigo('000000');
```

Expected: `{ ok: false, motivo: 'codigo-invalido' }`.

```javascript
await TabletAuthAPI.verificarVigencia('TAB_QA_API', '483921');
```

Expected: `{ activo: true }`.

Limpiar después: en SQL Editor `DELETE FROM tablets WHERE tablet_id='TAB_QA_API';` (o bloquear desde admin para mantenerla).

- [ ] **Step 3: Commit**

```bash
git add supabase-config.js
git commit -m "Tablet: TabletAuthAPI"
```

(Commit en el repo de tablet, no en admin.)

---

## Task 8: Tablet — reescribir flujo de auth en `app.js`

**Files:**
- Modify: `c:\Users\USUARIO\Desktop\v2 Checador-Tablet\app.js`

- [ ] **Step 1: Eliminar configuración hardcodeada al inicio**

En `app.js` líneas 1-10, reemplazar:

```javascript
// CONFIGURACIÓN GLOBAL
const TABLET_CONFIG = {
    id: 'TABLET_01',
    location: 'PTRN01'
    // apiUrl ya no se usa - Supabase se configura en supabase-config.js
};

// CÓDIGOS VÁLIDOS PARA LOGIN
const CODIGOS_VALIDOS = ['1810'];
```

Por:

```javascript
// CONFIGURACIÓN GLOBAL — se carga desde Supabase al hacer login
const TABLET_CONFIG = {
    id: null,
    location: null,
    nombre: null
};
```

- [ ] **Step 2: Reescribir `verificarAuth()` (líneas 177-184)**

Reemplazar:

```javascript
function verificarAuth() {
    const auth = localStorage.getItem('tablet_auth');
    if (auth !== 'true') {
        return true; // Para pruebas, permitir acceso sin login
    }
    return true;
}
```

Por:

```javascript
function verificarAuth() {
    const tabletId = localStorage.getItem('tablet_id');
    const codigo = localStorage.getItem('tablet_codigo');
    return Boolean(tabletId && codigo);
}

function cargarConfigDesdeStorage() {
    TABLET_CONFIG.id = localStorage.getItem('tablet_id');
    TABLET_CONFIG.location = localStorage.getItem('tablet_sucursal');
    TABLET_CONFIG.nombre = localStorage.getItem('tablet_nombre');
}

function guardarConfigEnStorage({ tablet_id, nombre, sucursal_codigo, codigo }) {
    localStorage.setItem('tablet_id', tablet_id);
    localStorage.setItem('tablet_codigo', codigo);
    localStorage.setItem('tablet_nombre', nombre || '');
    localStorage.setItem('tablet_sucursal', sucursal_codigo || '');
    TABLET_CONFIG.id = tablet_id;
    TABLET_CONFIG.nombre = nombre;
    TABLET_CONFIG.location = sucursal_codigo || '';
}

function limpiarConfigEnStorage() {
    localStorage.removeItem('tablet_id');
    localStorage.removeItem('tablet_codigo');
    localStorage.removeItem('tablet_nombre');
    localStorage.removeItem('tablet_sucursal');
    TABLET_CONFIG.id = null;
    TABLET_CONFIG.location = null;
    TABLET_CONFIG.nombre = null;
}
```

- [ ] **Step 3: Reescribir `initializeApp()` (línea 65)**

Localizar:

```javascript
function initializeApp() {
    if (!verificarAuth()) return;

    console.log('🚀 Inicializando sistema checador...');
    ...
}
```

Reemplazar el cuerpo completo por:

```javascript
async function initializeApp() {
    console.log('🚀 Inicializando sistema checador...');

    // Inicializar Supabase ANTES de validar auth (auth depende de BD)
    if (!initSupabase()) {
        console.error('❌ Error: No se pudo inicializar Supabase');
        showError('Error de configuración', 'No se pudo conectar con la base de datos');
        return;
    }

    if (verificarAuth()) {
        cargarConfigDesdeStorage();
        // Verificar vigencia contra BD; si está bloqueada o el código cambió, vuelve a login
        const vig = await TabletAuthAPI.verificarVigencia(TABLET_CONFIG.id, localStorage.getItem('tablet_codigo'));
        if (!vig.activo && vig.motivo !== 'error-red') {
            limpiarConfigEnStorage();
            mostrarErrorVigencia(vig.motivo, vig.bloqueado_motivo);
            showAuthSection();
            return;
        }
        // Si error-red, se permite continuar (la verificación se reintenta antes de cada checada)
        setupTablet();
        setupEventListeners();
        showMainContent();
        initializeCamera();
        startHealthCheck();
        updateTime();
        setInterval(updateTime, 1000);
        preventSleep();
        setTimeout(() => initAutoScanning(), 500);
        console.log('✅ Sistema inicializado (sesión activa)');
    } else {
        // No hay sesión guardada → mostrar login
        setupEventListeners();
        showAuthSection();
        updateTime();
        setInterval(updateTime, 1000);
        preventSleep();
        console.log('✅ Sistema inicializado (esperando login)');
    }
}

function mostrarErrorVigencia(motivo, bloqueadoMotivo) {
    const auth = document.getElementById('authSection');
    if (!auth) return;
    let texto;
    if (motivo === 'bloqueada') {
        texto = bloqueadoMotivo
            ? `Esta tablet fue bloqueada por el administrador: ${bloqueadoMotivo}`
            : 'Esta tablet fue bloqueada por el administrador.';
    } else if (motivo === 'codigo-cambiado') {
        texto = 'El código de acceso fue actualizado. Ingresa el nuevo código.';
    } else {
        texto = 'No se pudo validar la tablet.';
    }
    showAuthError(texto);
}
```

- [ ] **Step 4: Reescribir `handleAuth()` (línea 194)**

Reemplazar:

```javascript
function handleAuth(e) {
    e.preventDefault();

    const code = elements.accessCode.value.trim();

    if (CODIGOS_VALIDOS.includes(code)) {
        localStorage.setItem('tablet_auth', 'true');
        appState.authenticated = true;
        showMainContent();
        elements.accessCode.value = '';
    } else {
        showAuthError('Código de acceso incorrecto');
        elements.accessCode.value = '';
        elements.accessCode.focus();
    }
}
```

Por:

```javascript
async function handleAuth(e) {
    e.preventDefault();

    const code = elements.accessCode.value.trim();
    if (!code) {
        showAuthError('Ingresa el código');
        return;
    }

    const submitBtn = e.target?.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Validando...'; }

    const res = await TabletAuthAPI.validarCodigo(code);

    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Acceder'; }

    if (!res.ok) {
        if (res.motivo === 'codigo-invalido') showAuthError('Código de acceso incorrecto');
        else if (res.motivo === 'bloqueada') showAuthError('Esta tablet está desactivada. Contacta al administrador.');
        else if (res.motivo === 'error-red') showAuthError('Sin conexión. Intenta de nuevo.');
        else showAuthError('No se pudo validar el código.');
        elements.accessCode.value = '';
        elements.accessCode.focus();
        return;
    }

    guardarConfigEnStorage({
        tablet_id: res.tablet_id,
        nombre: res.nombre,
        sucursal_codigo: res.sucursal_codigo,
        codigo: code
    });
    appState.authenticated = true;
    elements.accessCode.value = '';

    // Continuar inicialización como si fuera primer arranque autenticado
    setupTablet();
    showMainContent();
    initializeCamera();
    startHealthCheck();
    setTimeout(() => initAutoScanning(), 500);
}
```

- [ ] **Step 5: Crear una tablet de prueba desde el admin**

En el admin (otro tab/ventana, como superadmin):
1. Click "Nueva tablet": ID `TAB_QA`, nombre `QA`, sucursal cualquiera.
2. Anotar el código de 6 dígitos generado (lo llamaremos `CODIGO_QA` en los pasos siguientes).

- [ ] **Step 6: Verificar manualmente — primer login**

1. En la tablet, borrar `localStorage`: en DevTools Console: `localStorage.clear(); location.reload();`
2. Debe aparecer pantalla de login.
3. Ingresar `000000` → mensaje "Código de acceso incorrecto".
4. Ingresar `CODIGO_QA` → debe entrar a la app principal.
5. Verificar en DevTools → Application → Local Storage que están `tablet_id=TAB_QA`, `tablet_codigo=CODIGO_QA`, `tablet_nombre=QA`, `tablet_sucursal=<código>`.
6. Recargar la página → debe entrar directamente (sin pedir login).

- [ ] **Step 7: Verificar manualmente — bloqueo desde admin**

1. Con la tablet en pantalla principal, ir al admin y bloquear `TAB_QA`.
2. En la tablet, recargar la página.
3. Debe volver a la pantalla de login mostrando "Esta tablet fue bloqueada por el administrador..."
4. Intentar ingresar `CODIGO_QA` → mensaje "Esta tablet está desactivada".
5. Desde admin, desbloquear.
6. En la tablet, ingresar `CODIGO_QA` → debe entrar normalmente.

- [ ] **Step 8: Ampliar maxlength del input de código en `Index.html`**

En `Index.html` de la tablet (línea ~48), localizar:

```html
<input type="password" 
       id="accessCode" 
       placeholder="Código de acceso" 
       class="auth-input"
       maxlength="4">
```

Cambiar `maxlength="4"` por `maxlength="6"` y `placeholder` por `"Código de 6 dígitos"`:

```html
<input type="password" 
       id="accessCode" 
       placeholder="Código de 6 dígitos" 
       class="auth-input"
       inputmode="numeric"
       pattern="[0-9]*"
       maxlength="6">
```

(`inputmode="numeric"` y `pattern="[0-9]*"` hacen que en tablets/móviles se abra el teclado numérico.)

- [ ] **Step 9: Verificar manualmente — el campo acepta 6 dígitos**

1. Recargar la pantalla de login de la tablet.
2. El placeholder debe decir "Código de 6 dígitos".
3. Intentar teclear más de 6 caracteres → no debe permitirlo.
4. En dispositivo táctil (o emulador), debería abrirse el teclado numérico al hacer focus.

- [ ] **Step 10: Commit (en repo tablet)**

```bash
git add app.js Index.html
git commit -m "Tablet: auth contra BD + verificacion al arrancar + input 6 digitos"
```

---

## Task 9: Tablet — verificación de vigencia antes de cada checada + `ultimo_uso`

**Files:**
- Modify: `c:\Users\USUARIO\Desktop\v2 Checador-Tablet\supabase-config.js` (función `createRegistro`, ~línea 230 en adelante)

- [ ] **Step 1: Inyectar verificación previa en `createRegistro`**

Localizar la función `createRegistro` en `supabase-config.js` (alrededor de línea 230, donde se hace el `insert` en `registros` ~línea 262). Justo al inicio del bloque `try` (o de la función), antes de capturar `fotoBase64` o cualquier otro trabajo, agregar:

```javascript
        // Verificar vigencia de la tablet antes de registrar
        const codigoGuardado = localStorage.getItem('tablet_codigo');
        const vig = await TabletAuthAPI.verificarVigencia(tabletId, codigoGuardado);
        if (!vig.activo && vig.motivo !== 'error-red') {
            return {
                success: false,
                blocked: true,
                motivo: vig.motivo,
                bloqueado_motivo: vig.bloqueado_motivo,
                message: vig.motivo === 'bloqueada'
                    ? 'Tablet bloqueada por el administrador'
                    : 'Sesión inválida. Vuelve a iniciar.'
            };
        }
        // Si motivo === 'error-red', continuar (no bloquear por red intermitente)
```

- [ ] **Step 2: Después del `insert` exitoso, actualizar `ultimo_uso`**

Localizar el bloque después del insert exitoso en `registros` (donde se retorna `{ success: true, data, message: 'Registro creado exitosamente' }`). **Antes** del `return`, agregar:

```javascript
            // Fire-and-forget: actualizar último uso
            TabletAuthAPI.registrarUso(tabletId);
```

- [ ] **Step 3: Manejar el bloqueo en el flujo de UI (`app.js`)**

Localizar en `app.js` (~línea 847-871) el bloque que invoca `SupabaseAPI.createRegistro` y luego maneja `result.success`:

```javascript
        const result = await SupabaseAPI.createRegistro(...);

        hideLoading();

        if (result.success) {
            showSuccess(...);
        } else {
            showError('Error', result.message);
        }
```

Reemplazar el bloque `else` por:

```javascript
        } else if (result.blocked) {
            showError('Tablet bloqueada', result.message);
            // Volver a la pantalla de login después de mostrar el mensaje
            limpiarConfigEnStorage();
            setTimeout(() => {
                showAuthSection();
            }, 3000);
        } else {
            showError('Error', result.message);
        }
```

- [ ] **Step 4: Verificar manualmente — bloqueo durante uso**

(Requiere tener la tablet `TAB_QA` vinculada del Task 8 Step 6. Si la eliminaste, vuelve a crearla.)

1. Desbloquear la tablet `TAB_QA` desde el admin si está bloqueada. Recargar la tablet, verificar que entra a la pantalla principal.
2. Desde el admin, bloquear `TAB_QA`.
3. En la tablet, escanear un QR válido.
4. Debe mostrar el mensaje "Tablet bloqueada por el administrador" y, después de 3 segundos, volver a la pantalla de login.
5. Verificar en SQL: `SELECT ultimo_uso FROM tablets WHERE tablet_id='TAB_QA';` → no debe haberse actualizado en este último intento (el insert no llegó a ejecutarse).
6. Desbloquear desde admin, volver a la tablet, ingresar `CODIGO_QA`, escanear QR válido → registro normal.
7. Verificar `SELECT ultimo_uso FROM tablets WHERE tablet_id='TAB_QA';` → debe tener un timestamp reciente.

- [ ] **Step 5: Verificar manualmente — "Último uso" y "Hoy" en admin**

1. En el admin, recargar la sección Tablets.
2. La columna "Último uso" en la fila de `TAB_QA` debe mostrar la hora reciente.
3. La columna "Hoy" debe mostrar al menos 1 (la checada que acabas de hacer).

- [ ] **Step 6: Commit (en repo tablet)**

```bash
git add supabase-config.js app.js
git commit -m "Tablet: verificar vigencia antes de cada checada + ultimo_uso"
```

---

## Task 10: Tablet — botón "Cerrar sesión" en configuración

**Files:**
- Modify: `c:\Users\USUARIO\Desktop\v2 Checador-Tablet\Index.html`
- Modify: `c:\Users\USUARIO\Desktop\v2 Checador-Tablet\app.js`

- [ ] **Step 1: Localizar el panel de configuración existente**

En `Index.html` de la tablet, buscar el botón `<button class="config-btn" id="configBtn">` (~línea 95) y la sección a la que abre (probablemente un modal o panel oculto). Si no existe un panel de configuración visible aún:

Grep en `app.js`:
```
function.*configBtn|configBtn.*addEventListener
```

para entender cómo se maneja la apertura del panel.

- [ ] **Step 2: Si existe un panel/modal de configuración, agregar el botón "Cerrar sesión" dentro**

Insertar dentro del panel de configuración (HTML):

```html
<button class="action-btn" id="btnCerrarSesion" style="background:#dc2626; margin-top:12px;">
    Cerrar sesión / Cambiar tablet
</button>
```

Si no existe panel de configuración, crear uno básico antes del cierre del `app-container`:

```html
<!-- Panel de Configuración (oculto por defecto) -->
<div id="configPanel" style="display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.85); z-index:1000; align-items:center; justify-content:center;">
    <div style="background:#fff; padding:24px; border-radius:8px; min-width:320px; max-width:480px;">
        <h3 style="margin-bottom:16px;">Configuración</h3>
        <p style="color:#64748b; margin-bottom:12px;">
            Tablet: <strong id="cfgTabletId">—</strong><br>
            Sucursal: <strong id="cfgSucursal">—</strong>
        </p>
        <button class="action-btn" id="btnCerrarSesion" style="background:#dc2626; width:100%; margin-bottom:8px;">
            Cerrar sesión / Cambiar tablet
        </button>
        <button class="action-btn" id="btnCerrarConfig" style="background:#64748b; width:100%;">
            Cerrar
        </button>
    </div>
</div>
```

- [ ] **Step 3: Wire up del botón en `app.js`**

En `setupEventListeners()` (o donde se manejen los listeners), agregar al final:

```javascript
    const btnConfig = document.getElementById('configBtn');
    const configPanel = document.getElementById('configPanel');
    const btnCerrarSesion = document.getElementById('btnCerrarSesion');
    const btnCerrarConfig = document.getElementById('btnCerrarConfig');

    if (btnConfig && configPanel) {
        btnConfig.addEventListener('click', () => {
            document.getElementById('cfgTabletId').textContent = TABLET_CONFIG.id || '—';
            document.getElementById('cfgSucursal').textContent = TABLET_CONFIG.location || '—';
            configPanel.style.display = 'flex';
        });
    }

    if (btnCerrarConfig && configPanel) {
        btnCerrarConfig.addEventListener('click', () => {
            configPanel.style.display = 'none';
        });
    }

    if (btnCerrarSesion) {
        btnCerrarSesion.addEventListener('click', () => {
            if (!confirm('¿Cerrar sesión? La tablet pedirá el código nuevamente.')) return;
            limpiarConfigEnStorage();
            if (configPanel) configPanel.style.display = 'none';
            location.reload();
        });
    }
```

- [ ] **Step 4: Verificar manualmente**

1. En la tablet (con sesión activa de `TAB_QA`), click en "⚙ Configuración".
2. Debe abrir el panel mostrando `Tablet: TAB_QA`, `Sucursal: <código de la sucursal asignada>`.
3. Click "Cerrar sesión / Cambiar tablet" → confirm → debe volver a la pantalla de login.
4. En DevTools verificar que `localStorage` ya no tiene las llaves `tablet_*`.
5. Ingresar `CODIGO_QA` → entra normalmente.

- [ ] **Step 5: Commit (en repo tablet)**

```bash
git add Index.html app.js
git commit -m "Tablet: boton cerrar sesion en configuracion"
```

---

## Task 11: Smoke test end-to-end y limpieza

- [ ] **Step 1: Smoke test completo de alta + uso**

1. Limpiar `localStorage` de la tablet: `localStorage.clear(); location.reload();`
2. En admin (como superadmin), click "Nueva tablet": `tablet_id='SMOKE_TEST'`, nombre `Smoke Test`, sucursal cualquiera.
3. El modal de código muestra un valor de 6 dígitos. **Anótalo como `CODIGO_SMOKE`** y haz "Copiar".
4. En la tablet, ingresar `CODIGO_SMOKE`. Debe entrar como tablet "Smoke Test".
5. Verificar que el header/footer de la tablet muestra `SMOKE_TEST` y la sucursal correspondiente.
6. Desde admin, recargar Tablets → verificar `SMOKE_TEST` aparece, último uso "Nunca".
7. En tablet, escanear un QR (o simular un checado válido) → registro exitoso.
8. En admin recargar → `SMOKE_TEST` muestra último uso reciente y "Hoy ≥ 1".

- [ ] **Step 2: Smoke test de regenerar código**

1. En admin, click "Regenerar código" en la fila de `SMOKE_TEST`. Confirmar.
2. Anotar el nuevo código generado como `CODIGO_SMOKE_2`.
3. En la tablet (todavía con sesión activa), recargar la página.
4. Debe volver a login con mensaje "código actualizado".
5. Intentar ingresar `CODIGO_SMOKE` (el viejo) → "Código de acceso incorrecto".
6. Ingresar `CODIGO_SMOKE_2` → entra normalmente.

- [ ] **Step 3: Smoke test de bloqueo**

1. Desde admin, bloquear `SMOKE_TEST` con motivo "fin de QA".
2. En tablet, recargar → mensaje de bloqueo con el motivo.
3. Intentar ingresar `CODIGO_SMOKE_2` → "Esta tablet está desactivada".
4. Desde admin, desbloquear.
5. En tablet, ingresar `CODIGO_SMOKE_2` → entra normalmente.

- [ ] **Step 4: Smoke test de cerrar sesión**

1. En tablet, click "⚙ Configuración" → "Cerrar sesión / Cambiar tablet".
2. Confirmar → vuelve a pantalla de login.
3. Verificar que `localStorage` ya no tiene llaves `tablet_*`.

- [ ] **Step 5: Limpiar la tablet de smoke**

En SQL Editor:
```sql
DELETE FROM tablets WHERE tablet_id = 'SMOKE_TEST';
```

- [ ] **Step 6: Tag/release**

```bash
# En repo admin
git log --oneline -10
# En repo tablet
git log --oneline -10
```

Verificar que ambos repos tienen commits limpios y descriptivos de la feature completa.

- [ ] **Step 7: Push (solo si el usuario lo autoriza explícitamente)**

```bash
# Confirmar con usuario primero
git push origin main   # en admin
git push origin main   # en tablet
```

- [ ] **Step 8: Migración operativa — dar de alta las tablets reales en producción**

Una vez desplegado:

1. Por cada tablet física que esté actualmente en uso (TABLET_01, TABLET_02, etc.), crear su registro en el admin: `tablet_id` debe coincidir con el ID conocido, nombre descriptivo, sucursal correcta.
2. Anotar/copiar el código generado para cada una.
3. Ir físicamente a cada tablet, esperar a que muestre el login (después de actualizar el cliente), e ingresar el código nuevo.
4. Verificar que cada tablet entra correctamente y aparece en el admin con su ID y sucursal.

Notas para esta migración operativa:
- El código `1810` ya no funciona. Las tablets físicas no podrán checar hasta que se les configure el código nuevo.
- Es recomendable coordinar este proceso con las sucursales para minimizar tiempo sin servicio.
- Si una sucursal queda mucho tiempo sin tablet operativa, los empleados pueden checar desde la PWA mientras tanto.

---

## Resumen de commits esperados

**Admin (`V2 checador-system ADMIN`):**
1. `Tablets: migracion inicial (tabla vacia)`
2. `Tablets: TabletsAPI en admin (codigo autogenerado)`
3. `Tablets: sidebar + seccion HTML + modales`
4. `Tablets: listado en admin con filtros`
5. `Tablets: modal de alta/edicion + mostrar codigo generado`
6. `Tablets: bloqueo, desbloqueo y regenerar codigo desde admin`

**Tablet (`v2 Checador-Tablet`):**
1. `Tablet: TabletAuthAPI`
2. `Tablet: auth contra BD + verificacion al arrancar + input 6 digitos`
3. `Tablet: verificar vigencia antes de cada checada + ultimo_uso`
4. `Tablet: boton cerrar sesion en configuracion`

---

## Notas para el implementador

- **Sin framework de tests:** la verificación es manual y está descrita paso a paso en cada tarea. Es un proyecto vanilla HTML/JS sin Jest/Vitest. No agregues infraestructura de tests por tu cuenta.
- **Dos repos:** las tareas 1-6 son en el repo admin, las tareas 7-10 son en el repo tablet. Cada uno tiene su propio `git` y `origin`.
- **No tocar archivos no relacionados:** el repo tablet tiene archivos con cambios sin commitear que NO deben tocarse con `git add -A`. Hacer `git add` solo de los archivos modificados por la tarea (`git add app.js supabase-config.js Index.html`).
- **Permisos:** el control de acceso es por UI (atributo `data-superadmin-only="true"` en el `<li>` del sidebar). RLS de Supabase está abierto con anon key — esto es coherente con el resto del proyecto (auth casero, no Supabase Auth).
- **Push:** no pushear sin OK explícito del usuario (preferencia del proyecto).
