# PWA Checador Personal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir una PWA instalable en celulares personales que permita a cada empleado checar entrada/salida con foto selfie y GPS, vinculada 1:1 a su dispositivo, como complemento a la tablet física existente.

**Architecture:** Aplicación estática (HTML/CSS/JS vanilla) en nueva carpeta hermana `V3 Checador-PWA/`, hablando directo a la misma instancia de Supabase que usan la tablet y el admin. Reusa patrones y lógica de validación de `v2 Checador-Tablet`. Se agrega una tabla nueva (`empleado_dispositivos`), tres columnas a `registros`, y una sección "Dispositivos PWA" al admin existente.

**Tech Stack:** HTML + JS vanilla (sin framework) + Supabase JS SDK v2 + Service Worker + Web APIs (getUserMedia, geolocation, SubtleCrypto). Hosting en Vercel (HTTPS obligatorio).

**Ubicaciones:**
- `C:\Users\USUARIO\Desktop\V2 checador-system ADMIN\` — proyecto Admin existente (este repo). Aquí viven el spec, este plan, los cambios al admin y las migraciones SQL.
- `C:\Users\USUARIO\Desktop\v2 Checador-Tablet\` — proyecto Tablet existente (no se modifica, solo se consulta para reusar lógica).
- `C:\Users\USUARIO\Desktop\V3 Checador-PWA\` — **nueva carpeta** a crear, donde vive el código de la PWA.

**Credenciales Supabase** (ya existentes en los otros proyectos, reusar):
- URL: `https://uqncsqstpcynjxnjhrqu.supabase.co`
- Anon key: `sb_publishable_bY6BY3wa5Xm2JCG2fy4F3g_fFgS5OsA`

---

## File Structure

**Nueva carpeta `V3 Checador-PWA/` (crear):**
```
V3 Checador-PWA/
├── index.html              — shell de la app, un solo contenedor de vistas
├── manifest.json           — PWA config (name, icons, display=standalone)
├── sw.js                   — Service Worker (cache del shell estático)
├── styles.css              — estilos mobile-first
├── supabase-config.js      — cliente + módulos AuthAPI, RegistroAPI, HistorialAPI
├── app.js                  — bootstrap, router simple, estado global
└── views/
    ├── vinculacion.js      — primer uso: código + PIN
    ├── principal.js        — botones ENTRADA/SALIDA + último check
    ├── captura.js          — cámara + GPS + envío
    └── historial.js        — últimos 15 días
```

**Archivos del repo Admin a modificar:**
- `Admin.js` — agregar navegación a "Dispositivos PWA" y render de la vista.
- `Admin.css` — estilos de la nueva vista (tabla).
- `Index.html` — punto de entrada del nav (si hay menú estático).
- `supabase-config.js` (del admin) — agregar helpers para listar/desvincular dispositivos.

**Archivos a crear en el repo Admin:**
- `supabase/migrations/2026-04-23_pwa_checador.sql` — migración SQL completa.

---

## Task 1: Migración SQL — tabla y columnas nuevas

**Files:**
- Create: `supabase/migrations/2026-04-23_pwa_checador.sql`

**Contexto:** El spec define la tabla `empleado_dispositivos` y 3 columnas nuevas en `registros`. Esta migración se corre manualmente en el SQL editor de Supabase.

- [ ] **Step 1: Crear el archivo de migración**

Crear `supabase/migrations/2026-04-23_pwa_checador.sql` con el siguiente contenido exacto:

```sql
-- Migración: PWA Checador Personal
-- Fecha: 2026-04-23
-- Descripción: Tabla de dispositivos vinculados + columnas de origen y GPS en registros

-- 1. Tabla de dispositivos vinculados al empleado
CREATE TABLE IF NOT EXISTS empleado_dispositivos (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empleado_id         uuid NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
    device_id           text UNIQUE NOT NULL,
    pin_hash            text NOT NULL,
    pin_salt            text NOT NULL,
    fecha_vinculacion   timestamp DEFAULT now(),
    ultimo_uso          timestamp,
    activo              boolean DEFAULT true,
    user_agent          text,
    desvinculado_por    text,
    desvinculado_en     timestamp
);

CREATE INDEX IF NOT EXISTS idx_emp_disp_empleado_activo
    ON empleado_dispositivos(empleado_id, activo);

CREATE INDEX IF NOT EXISTS idx_emp_disp_device
    ON empleado_dispositivos(device_id);

-- 2. Columnas nuevas en registros
ALTER TABLE registros ADD COLUMN IF NOT EXISTS latitud numeric(10,7);
ALTER TABLE registros ADD COLUMN IF NOT EXISTS longitud numeric(10,7);
ALTER TABLE registros ADD COLUMN IF NOT EXISTS origen text DEFAULT 'TABLET';

-- Backfill: registros existentes quedan como TABLET
UPDATE registros SET origen = 'TABLET' WHERE origen IS NULL;
```

- [ ] **Step 2: Ejecutar la migración en Supabase**

Abrir [Supabase Dashboard → SQL Editor](https://supabase.com/dashboard/project/uqncsqstpcynjxnjhrqu/sql) → pegar el contenido del archivo → Run.

Esperado: éxito sin errores. Si la tabla `empleados` o `registros` no existen con esos nombres, el script fallará — en ese caso detenerse y verificar nombres reales de tablas.

- [ ] **Step 3: Verificar migración**

En el SQL editor correr:
```sql
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'registros' AND column_name IN ('latitud', 'longitud', 'origen');
SELECT count(*) FROM empleado_dispositivos;
```

Esperado: 3 filas para la primera query; 0 para la segunda (tabla vacía).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-04-23_pwa_checador.sql
git commit -m "Add migration: empleado_dispositivos + registros GPS columns"
```

---

## Task 2: Scaffold de la PWA — index, manifest, service worker

**Files:**
- Create: `C:\Users\USUARIO\Desktop\V3 Checador-PWA\index.html`
- Create: `C:\Users\USUARIO\Desktop\V3 Checador-PWA\manifest.json`
- Create: `C:\Users\USUARIO\Desktop\V3 Checador-PWA\sw.js`
- Create: `C:\Users\USUARIO\Desktop\V3 Checador-PWA\styles.css`

**Contexto:** Crear el esqueleto mínimo instalable. Sin lógica aún — solo que la página cargue y se pueda agregar a pantalla de inicio en un celular.

- [ ] **Step 1: Crear carpeta del proyecto**

Desde la terminal:
```bash
mkdir -p "/c/Users/USUARIO/Desktop/V3 Checador-PWA/views"
```

- [ ] **Step 2: Crear `index.html`**

Crear `C:\Users\USUARIO\Desktop\V3 Checador-PWA\index.html` con:

```html
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <meta name="theme-color" content="#2563eb">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="default">
    <title>Checador Personal</title>
    <link rel="manifest" href="manifest.json">
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div id="app-root">
        <div id="view-container"></div>
        <div id="loading-overlay" hidden>
            <div class="spinner"></div>
        </div>
        <div id="toast" hidden></div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <script src="supabase-config.js"></script>
    <script src="views/vinculacion.js"></script>
    <script src="views/principal.js"></script>
    <script src="views/captura.js"></script>
    <script src="views/historial.js"></script>
    <script src="app.js"></script>
    <script>
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('sw.js').catch(console.warn);
            });
        }
    </script>
</body>
</html>
```

- [ ] **Step 3: Crear `manifest.json`**

Crear `C:\Users\USUARIO\Desktop\V3 Checador-PWA\manifest.json` con:

```json
{
    "name": "Checador Personal ADP",
    "short_name": "Checador",
    "start_url": "./",
    "display": "standalone",
    "orientation": "portrait",
    "theme_color": "#2563eb",
    "background_color": "#ffffff",
    "icons": [
        {
            "src": "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyIiBoZWlnaHQ9IjE5MiIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSIjMjU2M2ViIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik0xMiAyQzYuNDggMiAyIDYuNDggMiAxMnM0LjQ4IDEwIDEwIDEwIDEwLTQuNDggMTAtMTBTMTcuNTIgMiAxMiAyem0wIDE4Yy00LjQxIDAtOC0zLjU5LTgtOHMzLjU5LTggOC04IDggMy41OSA4IDgtMy41OSA4LTggOHptLjUtMTNIMTF2Nmw1LjI1IDMuMTUuNzUtMS4yMy00LjUtMi42N1Y3eiIvPjwvc3ZnPg==",
            "sizes": "192x192",
            "type": "image/svg+xml"
        },
        {
            "src": "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSIjMjU2M2ViIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik0xMiAyQzYuNDggMiAyIDYuNDggMiAxMnM0LjQ4IDEwIDEwIDEwIDEwLTQuNDggMTAtMTBTMTcuNTIgMiAxMiAyem0wIDE4Yy00LjQxIDAtOC0zLjU5LTgtOHMzLjU5LTggOC04IDggMy41OSA4IDgtMy41OSA4LTggOHptLjUtMTNIMTF2Nmw1LjI1IDMuMTUuNzUtMS4yMy00LjUtMi42N1Y3eiIvPjwvc3ZnPg==",
            "sizes": "512x512",
            "type": "image/svg+xml"
        }
    ]
}
```

- [ ] **Step 4: Crear `sw.js`**

Crear `C:\Users\USUARIO\Desktop\V3 Checador-PWA\sw.js` con:

```javascript
const CACHE_NAME = 'checador-pwa-v1';
const STATIC_ASSETS = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './supabase-config.js',
    './views/vinculacion.js',
    './views/principal.js',
    './views/captura.js',
    './views/historial.js',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    // Nunca cachear llamadas a Supabase
    if (url.hostname.includes('supabase.co')) return;

    event.respondWith(
        caches.match(event.request).then((cached) => {
            return cached || fetch(event.request).then((response) => {
                if (response.ok && response.type === 'basic') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return response;
            }).catch(() => cached);
        })
    );
});
```

- [ ] **Step 5: Crear `styles.css` base**

Crear `C:\Users\USUARIO\Desktop\V3 Checador-PWA\styles.css` con:

```css
* { margin: 0; padding: 0; box-sizing: border-box; }

html, body {
    height: 100%;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #f1f5f9;
    color: #0f172a;
    -webkit-font-smoothing: antialiased;
    -webkit-tap-highlight-color: transparent;
    overscroll-behavior: none;
}

#app-root {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
}

#view-container {
    flex: 1;
    display: flex;
    flex-direction: column;
}

/* Loading overlay */
#loading-overlay {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.spinner {
    width: 48px;
    height: 48px;
    border: 4px solid #e2e8f0;
    border-top-color: #2563eb;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* Toast */
#toast {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #0f172a;
    color: white;
    padding: 12px 20px;
    border-radius: 10px;
    font-size: 14px;
    z-index: 1001;
    max-width: 90%;
    text-align: center;
}
#toast.error { background: #dc2626; }
#toast.success { background: #16a34a; }

/* Vistas comunes */
.view {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 20px;
}

.view h1 {
    font-size: 24px;
    margin-bottom: 8px;
}

.view p {
    color: #475569;
    margin-bottom: 16px;
}

.btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    border: none;
    border-radius: 12px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.1s;
    -webkit-appearance: none;
}
.btn:active { transform: scale(0.97); }
.btn-primary { background: #2563eb; color: white; }
.btn-secondary { background: #e2e8f0; color: #0f172a; }

.input {
    width: 100%;
    padding: 14px 16px;
    border: 2px solid #e2e8f0;
    border-radius: 12px;
    font-size: 16px;
    margin-bottom: 12px;
    -webkit-appearance: none;
}
.input:focus {
    outline: none;
    border-color: #2563eb;
}
```

- [ ] **Step 6: Smoke test local**

Abrir una terminal en la carpeta del proyecto y correr un servidor local simple:
```bash
cd "/c/Users/USUARIO/Desktop/V3 Checador-PWA"
python -m http.server 8000
```
(Si Python no está, usar `npx serve` o cualquier servidor estático.)

Abrir `http://localhost:8000` en un navegador.

Esperado: página en blanco (las vistas aún no están creadas); sin errores JS en consola excepto los 4 scripts de `views/*.js` que todavía no existen (404). Si la consola muestra que `manifest.json` y `sw.js` cargaron OK, el scaffold está bien.

- [ ] **Step 7: Commit**

```bash
cd "/c/Users/USUARIO/Desktop/V2 checador-system ADMIN"
```
El código de la PWA vive en otra carpeta; no se commitea en este repo. Documentar la ubicación en un README opcional del repo admin:

```bash
# Opcional: agregar nota en docs/
# (ningún commit aquí, la PWA tiene su propio ciclo de vida)
```

Si se desea versionar la PWA, inicializar un repo aparte:
```bash
cd "/c/Users/USUARIO/Desktop/V3 Checador-PWA"
git init
git add .
git commit -m "Initial scaffold: PWA Checador Personal shell"
```

---

## Task 3: Módulo Supabase + helpers de crypto

**Files:**
- Create: `C:\Users\USUARIO\Desktop\V3 Checador-PWA\supabase-config.js`

**Contexto:** Este archivo contiene el cliente Supabase y los tres módulos API (`AuthAPI`, `RegistroAPI`, `HistorialAPI`). Reusa patrones de `v2 Checador-Tablet/supabase-config.js` — especialmente la lógica de `validarRegistro`, `getBloqueValido` y `uploadFoto`.

- [ ] **Step 1: Crear `supabase-config.js` con cliente y helpers de crypto**

Crear `C:\Users\USUARIO\Desktop\V3 Checador-PWA\supabase-config.js` con:

```javascript
// Configuración Supabase — misma instancia que tablet y admin
const SUPABASE_CONFIG = {
    url: 'https://uqncsqstpcynjxnjhrqu.supabase.co',
    anonKey: 'sb_publishable_bY6BY3wa5Xm2JCG2fy4F3g_fFgS5OsA'
};

let supabaseClient = null;

function initSupabase() {
    if (typeof supabase === 'undefined') {
        console.error('Supabase SDK no cargado');
        return false;
    }
    supabaseClient = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    return true;
}

// === CRYPTO HELPERS ===

async function sha256(text) {
    const buffer = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

function generateSalt() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateDeviceId() {
    // UUID v4 simple sin dependencias
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = crypto.getRandomValues(new Uint8Array(1))[0] % 16;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

async function hashPin(pin, salt) {
    return await sha256(`${salt}:${pin}`);
}

// === AUTH API ===

const AuthAPI = {
    async buscarEmpleado(codigoEmpleado) {
        const { data, error } = await supabaseClient
            .from('empleados')
            .select('id, codigo_empleado, nombre, apellido, foto_perfil, horario_id, activo')
            .eq('codigo_empleado', codigoEmpleado)
            .eq('activo', true)
            .maybeSingle();
        if (error) {
            console.error('Error buscando empleado:', error);
            return null;
        }
        return data;
    },

    async tieneDispositivoActivo(empleadoId) {
        const { data, error } = await supabaseClient
            .from('empleado_dispositivos')
            .select('id')
            .eq('empleado_id', empleadoId)
            .eq('activo', true)
            .limit(1);
        if (error) {
            console.error('Error verificando dispositivo activo:', error);
            return true; // fail-safe: asumir que sí tiene
        }
        return data && data.length > 0;
    },

    async vincular(empleadoId, pin, deviceId, userAgent) {
        const salt = generateSalt();
        const pinHash = await hashPin(pin, salt);
        const { data, error } = await supabaseClient
            .from('empleado_dispositivos')
            .insert({
                empleado_id: empleadoId,
                device_id: deviceId,
                pin_hash: pinHash,
                pin_salt: salt,
                activo: true,
                user_agent: userAgent
            })
            .select()
            .single();
        if (error) {
            console.error('Error vinculando:', error);
            return { success: false, message: 'Error al vincular dispositivo' };
        }
        return { success: true, data };
    },

    async validarSesion(deviceId) {
        const { data, error } = await supabaseClient
            .from('empleado_dispositivos')
            .select(`
                id,
                empleado_id,
                activo,
                empleado:empleados(
                    id,
                    codigo_empleado,
                    nombre,
                    apellido,
                    foto_perfil,
                    horario_id,
                    activo
                )
            `)
            .eq('device_id', deviceId)
            .eq('activo', true)
            .maybeSingle();
        if (error || !data) return null;
        if (!data.empleado || !data.empleado.activo) return null;
        return data.empleado;
    },

    async registrarUso(deviceId) {
        await supabaseClient
            .from('empleado_dispositivos')
            .update({ ultimo_uso: new Date().toISOString() })
            .eq('device_id', deviceId);
    }
};

// === REGISTRO API (reusa lógica de la tablet) ===

const RegistroAPI = {
    async validarRegistro(empleadoId, tipoRegistro) {
        const hoy = new Date();
        const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString();
        const finHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59).toISOString();

        if (tipoRegistro === 'ENTRADA') {
            const { data } = await supabaseClient
                .from('registros')
                .select('tipo_registro, fecha_hora')
                .eq('empleado_id', empleadoId)
                .gte('fecha_hora', inicioHoy)
                .lte('fecha_hora', finHoy)
                .order('fecha_hora', { ascending: false });
            if (data && data.length > 0 && data[0].tipo_registro === 'ENTRADA') {
                return { valido: false, mensaje: 'Ya checaste, vete a chambear' };
            }
        } else {
            const { data: ultima } = await supabaseClient
                .from('registros')
                .select('id, fecha_hora')
                .eq('empleado_id', empleadoId)
                .eq('tipo_registro', 'ENTRADA')
                .order('fecha_hora', { ascending: false })
                .limit(1);
            if (!ultima || ultima.length === 0) {
                return { valido: false, mensaje: 'No tienes una entrada registrada para poder salir' };
            }
            const { data: salida } = await supabaseClient
                .from('registros')
                .select('id')
                .eq('empleado_id', empleadoId)
                .eq('tipo_registro', 'SALIDA')
                .gt('fecha_hora', ultima[0].fecha_hora)
                .limit(1);
            if (salida && salida.length > 0) {
                return { valido: false, mensaje: 'Ya checaste salida, ve a casa' };
            }
        }
        return { valido: true };
    },

    async getBloqueValido(horarioId, tipoRegistro) {
        if (!horarioId) return null;
        const ahora = new Date();
        const hora = `${String(ahora.getHours()).padStart(2,'0')}:${String(ahora.getMinutes()).padStart(2,'0')}:${String(ahora.getSeconds()).padStart(2,'0')}`;

        const { data: bloques } = await supabaseClient
            .from('bloques_horario')
            .select('*')
            .eq('horario_id', horarioId)
            .order('orden_bloque');
        if (!bloques || bloques.length === 0) return null;

        const horaActual = new Date(`1970-01-01T${hora}`);
        for (const b of bloques) {
            if (tipoRegistro === 'ENTRADA') {
                const min = new Date(`1970-01-01T${b.hora_entrada}`);
                min.setMinutes(min.getMinutes() - 15);
                const max = new Date(`1970-01-01T${b.hora_entrada}`);
                max.setMinutes(max.getMinutes() + 600);
                if (horaActual >= min && horaActual <= max) return b;
            } else {
                const tol = b.tolerancia_salida_min || 15;
                const min = new Date(`1970-01-01T${b.hora_salida}`);
                min.setMinutes(min.getMinutes() - tol);
                const max = new Date(`1970-01-01T${b.hora_salida}`);
                max.setMinutes(max.getMinutes() + tol);
                if (horaActual >= min && horaActual <= max) return b;
            }
        }
        return null;
    },

    async uploadFoto(empleadoId, base64Data) {
        const base64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
        const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: 'image/jpeg' });
        const filename = `emp_${empleadoId}_${Date.now()}.jpg`;
        const { error } = await supabaseClient.storage
            .from('registros-fotos')
            .upload(filename, blob, { contentType: 'image/jpeg', upsert: false });
        if (error) {
            console.error('Error subiendo foto:', error);
            return null;
        }
        const { data } = supabaseClient.storage.from('registros-fotos').getPublicUrl(filename);
        return data.publicUrl;
    },

    async crearRegistro({ empleadoId, tipoRegistro, deviceId, bloqueId, fotoBase64, latitud, longitud }) {
        const fotoUrl = fotoBase64 ? await this.uploadFoto(empleadoId, fotoBase64) : null;

        const ahora = new Date();
        const y = ahora.getFullYear();
        const mo = String(ahora.getMonth() + 1).padStart(2, '0');
        const d = String(ahora.getDate()).padStart(2, '0');
        const h = String(ahora.getHours()).padStart(2, '0');
        const mi = String(ahora.getMinutes()).padStart(2, '0');
        const s = String(ahora.getSeconds()).padStart(2, '0');
        const ms = String(ahora.getMilliseconds()).padStart(3, '0');
        const fechaHoraLocal = `${y}-${mo}-${d} ${h}:${mi}:${s}.${ms}`;

        const tabletIdTag = `PWA_${deviceId.slice(0, 8)}`;
        const { data, error } = await supabaseClient
            .from('registros')
            .insert({
                empleado_id: empleadoId,
                tipo_registro: tipoRegistro,
                fecha_hora: fechaHoraLocal,
                tablet_id: tabletIdTag,
                bloque_horario_id: bloqueId,
                foto_registro: fotoUrl,
                observaciones: `Registro desde PWA`,
                latitud: latitud,
                longitud: longitud,
                origen: 'PWA'
            })
            .select()
            .single();
        if (error) {
            console.error('Error creando registro:', error);
            return { success: false, message: 'Error al guardar registro' };
        }
        return { success: true, data };
    }
};

// === HISTORIAL API ===

const HistorialAPI = {
    async getUltimosDias(empleadoId, dias = 15) {
        const desde = new Date();
        desde.setDate(desde.getDate() - dias);
        const desdeISO = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate()).toISOString();
        const { data, error } = await supabaseClient
            .from('registros')
            .select('id, tipo_registro, fecha_hora, origen')
            .eq('empleado_id', empleadoId)
            .gte('fecha_hora', desdeISO)
            .order('fecha_hora', { ascending: false });
        if (error) {
            console.error('Error obteniendo historial:', error);
            return [];
        }
        return data || [];
    }
};
```

- [ ] **Step 2: Smoke test — cargar en navegador y verificar sin errores**

Recargar `http://localhost:8000` y abrir consola. Verificar que no hay errores de sintaxis. Probar en la consola:
```javascript
initSupabase();
await AuthAPI.buscarEmpleado('CODIGO_QUE_EXISTE');
```
Esperado: devuelve objeto del empleado o `null`.

- [ ] **Step 3: Commit**

```bash
cd "/c/Users/USUARIO/Desktop/V3 Checador-PWA"
git add supabase-config.js
git commit -m "Add Supabase client + Auth/Registro/Historial APIs"
```

---

## Task 4: Router y bootstrap (`app.js`)

**Files:**
- Create: `C:\Users\USUARIO\Desktop\V3 Checador-PWA\app.js`

**Contexto:** Router mínimo que decide qué vista mostrar según el estado (tiene device_id en localStorage + sesión válida o no). No usa hash ni history API — es una SPA con swap de `innerHTML`.

- [ ] **Step 1: Crear `app.js`**

Crear `C:\Users\USUARIO\Desktop\V3 Checador-PWA\app.js` con:

```javascript
// Estado global
const AppState = {
    empleado: null,
    deviceId: null,
    container: null
};

const LS_KEY = 'pwa_device_id';

// === Utils UI ===
function showLoading(show = true) {
    document.getElementById('loading-overlay').hidden = !show;
}

function showToast(msg, kind = '') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = kind;
    el.hidden = false;
    setTimeout(() => { el.hidden = true; }, 3500);
}

// === Router ===
const Router = {
    go(viewName, params = {}) {
        AppState.container.innerHTML = '';
        switch (viewName) {
            case 'vinculacion': return Vinculacion.render(AppState.container);
            case 'principal':   return Principal.render(AppState.container);
            case 'captura':     return Captura.render(AppState.container, params);
            case 'historial':   return Historial.render(AppState.container);
            default: throw new Error(`Vista desconocida: ${viewName}`);
        }
    }
};

// === Bootstrap ===
async function bootstrap() {
    AppState.container = document.getElementById('view-container');

    if (!initSupabase()) {
        showToast('Error de configuración', 'error');
        return;
    }

    const savedDeviceId = localStorage.getItem(LS_KEY);

    if (!savedDeviceId) {
        Router.go('vinculacion');
        return;
    }

    AppState.deviceId = savedDeviceId;
    showLoading(true);
    const empleado = await AuthAPI.validarSesion(savedDeviceId);
    showLoading(false);

    if (!empleado) {
        localStorage.removeItem(LS_KEY);
        showToast('Sesión no válida, vincula de nuevo', 'error');
        Router.go('vinculacion');
        return;
    }

    AppState.empleado = empleado;
    AuthAPI.registrarUso(savedDeviceId);
    Router.go('principal');
}

// === Online check ===
function requireOnline() {
    if (!navigator.onLine) {
        showToast('Sin conexión. Conéctate a internet para checar.', 'error');
        return false;
    }
    return true;
}

document.addEventListener('DOMContentLoaded', bootstrap);
```

- [ ] **Step 2: Smoke test**

Recargar navegador. Sin errores en consola. La consola debe mostrar que intenta renderizar `Vinculacion` (aún no existe — se crea en Task 5), así que el error esperado es "Vinculacion is not defined". Normal.

- [ ] **Step 3: Commit**

```bash
cd "/c/Users/USUARIO/Desktop/V3 Checador-PWA"
git add app.js
git commit -m "Add router + bootstrap"
```

---

## Task 5: Vista de vinculación (primer uso)

**Files:**
- Create: `C:\Users\USUARIO\Desktop\V3 Checador-PWA\views\vinculacion.js`

**Contexto:** Flujo paso a paso: (1) pide código de empleado, (2) valida contra Supabase, (3) pide crear PIN, (4) confirma PIN, (5) pide permisos cámara + GPS, (6) vincula y redirige a principal.

- [ ] **Step 1: Crear la vista**

Crear `C:\Users\USUARIO\Desktop\V3 Checador-PWA\views\vinculacion.js` con:

```javascript
const Vinculacion = {
    state: {},

    render(container) {
        this.state = { paso: 1, empleado: null, pin: '', pinConfirm: '' };
        this.container = container;
        this.paintPaso1();
    },

    paintPaso1() {
        this.container.innerHTML = `
            <div class="view">
                <h1>Bienvenido</h1>
                <p>Ingresa tu código de empleado para vincular este dispositivo.</p>
                <input type="text" class="input" id="codEmp" placeholder="Código de empleado" autocomplete="off" autocapitalize="characters" />
                <button class="btn btn-primary" id="btnNext">Continuar</button>
            </div>
        `;
        document.getElementById('btnNext').addEventListener('click', () => this.validarCodigo());
        document.getElementById('codEmp').focus();
    },

    async validarCodigo() {
        const codigo = document.getElementById('codEmp').value.trim();
        if (!codigo) return showToast('Ingresa tu código', 'error');

        showLoading(true);
        const empleado = await AuthAPI.buscarEmpleado(codigo);
        if (!empleado) {
            showLoading(false);
            return showToast('Código no encontrado o inactivo', 'error');
        }
        const yaVinculado = await AuthAPI.tieneDispositivoActivo(empleado.id);
        showLoading(false);
        if (yaVinculado) {
            return showToast('Ya estás vinculado a otro dispositivo. Pide al administrador que lo desvincule.', 'error');
        }
        this.state.empleado = empleado;
        this.paintPaso2();
    },

    paintPaso2() {
        this.container.innerHTML = `
            <div class="view">
                <h1>Hola, ${this.state.empleado.nombre}</h1>
                <p>Crea un PIN de 4 dígitos. Lo necesitarás si cambias de celular.</p>
                <input type="tel" inputmode="numeric" class="input" id="pin" placeholder="PIN de 4 dígitos" maxlength="4" pattern="[0-9]{4}" />
                <button class="btn btn-primary" id="btnNext">Continuar</button>
            </div>
        `;
        document.getElementById('btnNext').addEventListener('click', () => this.capturarPin());
        document.getElementById('pin').focus();
    },

    capturarPin() {
        const pin = document.getElementById('pin').value.trim();
        if (!/^\d{4}$/.test(pin)) return showToast('El PIN debe tener 4 dígitos', 'error');
        this.state.pin = pin;
        this.paintPaso3();
    },

    paintPaso3() {
        this.container.innerHTML = `
            <div class="view">
                <h1>Confirma tu PIN</h1>
                <p>Escribe el PIN de nuevo para confirmar.</p>
                <input type="tel" inputmode="numeric" class="input" id="pin2" placeholder="Repite el PIN" maxlength="4" />
                <button class="btn btn-primary" id="btnNext">Continuar</button>
            </div>
        `;
        document.getElementById('btnNext').addEventListener('click', () => this.confirmarPin());
        document.getElementById('pin2').focus();
    },

    confirmarPin() {
        const pin2 = document.getElementById('pin2').value.trim();
        if (pin2 !== this.state.pin) {
            showToast('Los PIN no coinciden', 'error');
            return this.paintPaso2();
        }
        this.paintPaso4();
    },

    paintPaso4() {
        this.container.innerHTML = `
            <div class="view">
                <h1>Permisos necesarios</h1>
                <p>Para checar necesitamos acceso a tu cámara y tu ubicación. Ambos son obligatorios.</p>
                <button class="btn btn-primary" id="btnPerms">Otorgar permisos</button>
            </div>
        `;
        document.getElementById('btnPerms').addEventListener('click', () => this.solicitarPermisos());
    },

    async solicitarPermisos() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
            stream.getTracks().forEach(t => t.stop());
        } catch (e) {
            return showToast('Cámara denegada. No puedes continuar sin cámara.', 'error');
        }
        try {
            await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
            });
        } catch (e) {
            return showToast('Ubicación denegada. No puedes continuar sin GPS.', 'error');
        }
        await this.vincular();
    },

    async vincular() {
        showLoading(true);
        const deviceId = generateDeviceId();
        const result = await AuthAPI.vincular(
            this.state.empleado.id,
            this.state.pin,
            deviceId,
            navigator.userAgent
        );
        if (!result.success) {
            showLoading(false);
            return showToast(result.message, 'error');
        }
        localStorage.setItem(LS_KEY, deviceId);
        AppState.deviceId = deviceId;
        AppState.empleado = this.state.empleado;
        showLoading(false);
        showToast('¡Dispositivo vinculado!', 'success');
        Router.go('principal');
    }
};
```

- [ ] **Step 2: Probar flujo manual**

Abrir PWA en celular (o DevTools con emulación móvil). Probar:
1. Código inválido → toast "no encontrado".
2. Código válido de empleado activo → pasa a PIN.
3. PIN distinto en confirmación → regresa a paso 2.
4. Denegar cámara → toast de error, no avanza.
5. Denegar GPS → toast de error, no avanza.
6. Otorgar ambos → vincula, aparece toast verde, cae a vista Principal (aún no implementada, verá error en consola).

Verificar en Supabase que se insertó una fila en `empleado_dispositivos`.

- [ ] **Step 3: Commit**

```bash
git add views/vinculacion.js
git commit -m "Add vinculacion view (multi-step onboarding)"
```

---

## Task 6: Vista principal (botones ENTRADA/SALIDA)

**Files:**
- Create: `C:\Users\USUARIO\Desktop\V3 Checador-PWA\views\principal.js`

**Contexto:** Muestra nombre, foto, hora actual, último check, y los dos botones grandes. Al tocar un botón, navega a la vista de captura.

- [ ] **Step 1: Crear la vista**

Crear `C:\Users\USUARIO\Desktop\V3 Checador-PWA\views\principal.js` con:

```javascript
const Principal = {
    async render(container) {
        const emp = AppState.empleado;
        const foto = emp.foto_perfil || '';
        container.innerHTML = `
            <div class="view principal-view">
                <div class="principal-header">
                    <div class="avatar">
                        ${foto ? `<img src="${foto}" alt="">` : `<span>${(emp.nombre[0]||'').toUpperCase()}</span>`}
                    </div>
                    <div>
                        <div class="emp-nombre">${emp.nombre} ${emp.apellido || ''}</div>
                        <div class="emp-codigo">${emp.codigo_empleado}</div>
                    </div>
                </div>
                <div class="hora-actual" id="horaActual"></div>
                <div class="ultimo-check" id="ultimoCheck">Cargando...</div>
                <div class="botones-check">
                    <button class="btn-check btn-entrada" id="btnEntrada">ENTRADA</button>
                    <button class="btn-check btn-salida" id="btnSalida">SALIDA</button>
                </div>
                <button class="btn btn-secondary" id="btnHistorial">Ver mi historial</button>
            </div>
        `;

        document.getElementById('btnEntrada').addEventListener('click', () => {
            if (!requireOnline()) return;
            Router.go('captura', { tipo: 'ENTRADA' });
        });
        document.getElementById('btnSalida').addEventListener('click', () => {
            if (!requireOnline()) return;
            Router.go('captura', { tipo: 'SALIDA' });
        });
        document.getElementById('btnHistorial').addEventListener('click', () => Router.go('historial'));

        this.startClock();
        await this.loadUltimoCheck();
    },

    startClock() {
        const update = () => {
            const n = new Date();
            const h = String(n.getHours()).padStart(2, '0');
            const m = String(n.getMinutes()).padStart(2, '0');
            const el = document.getElementById('horaActual');
            if (el) el.textContent = `${h}:${m}`;
        };
        update();
        clearInterval(this._clockInt);
        this._clockInt = setInterval(update, 1000);
    },

    async loadUltimoCheck() {
        const registros = await HistorialAPI.getUltimosDias(AppState.empleado.id, 2);
        const el = document.getElementById('ultimoCheck');
        if (!el) return;
        if (!registros || registros.length === 0) {
            el.textContent = 'Sin registros recientes';
            return;
        }
        const r = registros[0];
        const d = new Date(r.fecha_hora);
        const hoy = new Date();
        const esHoy = d.toDateString() === hoy.toDateString();
        const cuando = esHoy ? `hoy ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` : d.toLocaleString();
        el.textContent = `Última ${r.tipo_registro.toLowerCase()}: ${cuando}`;
    }
};
```

- [ ] **Step 2: Agregar estilos de la principal**

Anexar a `styles.css`:

```css
/* Principal */
.principal-view { gap: 16px; }

.principal-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    background: white;
    border-radius: 16px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.avatar {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: #e2e8f0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 22px;
    color: #475569;
    overflow: hidden;
}
.avatar img { width: 100%; height: 100%; object-fit: cover; }
.emp-nombre { font-weight: 600; font-size: 16px; }
.emp-codigo { font-size: 13px; color: #64748b; }

.hora-actual {
    font-size: 64px;
    font-weight: 200;
    text-align: center;
    padding: 12px 0;
    color: #0f172a;
}

.ultimo-check {
    text-align: center;
    color: #475569;
    background: white;
    padding: 12px;
    border-radius: 12px;
    font-size: 14px;
}

.botones-check {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-top: 8px;
}

.btn-check {
    border: none;
    padding: 36px 16px;
    font-size: 20px;
    font-weight: 700;
    border-radius: 20px;
    color: white;
    cursor: pointer;
}
.btn-check:active { transform: scale(0.97); }
.btn-entrada { background: #16a34a; }
.btn-salida { background: #dc2626; }
```

- [ ] **Step 3: Smoke test**

Con un empleado ya vinculado (de Task 5), recargar la PWA. Esperado: ve su nombre, reloj corriendo, último check (o "sin registros"), y 2 botones. Al tocar un botón, cae a la vista "captura" (error en consola porque aún no existe — normal).

- [ ] **Step 4: Commit**

```bash
git add views/principal.js styles.css
git commit -m "Add principal view (clock + last check + action buttons)"
```

---

## Task 7: Vista de captura (cámara + GPS + envío)

**Files:**
- Create: `C:\Users\USUARIO\Desktop\V3 Checador-PWA\views\captura.js`

**Contexto:** Esta es la vista crítica. Pasos: (1) enciende cámara frontal, (2) muestra preview 2.5 segundos, (3) captura foto a JPEG base64, (4) obtiene GPS en paralelo, (5) valida reglas de negocio, (6) crea registro.

- [ ] **Step 1: Crear la vista**

Crear `C:\Users\USUARIO\Desktop\V3 Checador-PWA\views\captura.js` con:

```javascript
const Captura = {
    stream: null,

    async render(container, params) {
        const tipo = params.tipo; // 'ENTRADA' | 'SALIDA'
        const esEntrada = tipo === 'ENTRADA';
        container.innerHTML = `
            <div class="view captura-view">
                <h2>${esEntrada ? 'Registrar ENTRADA' : 'Registrar SALIDA'}</h2>
                <div class="camera-box">
                    <video id="video" autoplay playsinline muted></video>
                    <div class="countdown" id="countdown"></div>
                </div>
                <button class="btn btn-secondary" id="btnCancelar">Cancelar</button>
            </div>
        `;
        document.getElementById('btnCancelar').addEventListener('click', () => this.cancelar());
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
    },

    async startCamera() {
        this.stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
            audio: false
        });
        const video = document.getElementById('video');
        video.srcObject = this.stream;
        await new Promise(res => video.onloadedmetadata = res);
    },

    async countdownAndCapture() {
        const cd = document.getElementById('countdown');
        for (let s = 3; s > 0; s--) {
            if (cd) cd.textContent = s;
            await new Promise(r => setTimeout(r, 1000));
        }
        if (cd) cd.textContent = '';
        const video = document.getElementById('video');
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        const base64 = canvas.toDataURL('image/jpeg', 0.8);
        this.stopCamera();
        return base64;
    },

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

    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
    },

    cancelar() {
        this.stopCamera();
        Router.go('principal');
    },

    async enviar(tipo, fotoBase64, coords) {
        showLoading(true);

        const emp = AppState.empleado;
        const validacion = await RegistroAPI.validarRegistro(emp.id, tipo);
        if (!validacion.valido) {
            showLoading(false);
            showToast(validacion.mensaje, 'error');
            return Router.go('principal');
        }

        const bloque = await RegistroAPI.getBloqueValido(emp.horario_id, tipo);

        const result = await RegistroAPI.crearRegistro({
            empleadoId: emp.id,
            tipoRegistro: tipo,
            deviceId: AppState.deviceId,
            bloqueId: bloque ? bloque.id : null,
            fotoBase64,
            latitud: coords.lat,
            longitud: coords.lng
        });

        showLoading(false);

        if (!result.success) {
            showToast(result.message, 'error');
            return Router.go('principal');
        }

        AuthAPI.registrarUso(AppState.deviceId);
        const hora = new Date();
        const hh = String(hora.getHours()).padStart(2, '0');
        const mm = String(hora.getMinutes()).padStart(2, '0');
        showToast(`✓ ${tipo} registrada ${hh}:${mm}`, 'success');
        Router.go('principal');
    }
};
```

- [ ] **Step 2: Agregar estilos de captura**

Anexar a `styles.css`:

```css
/* Captura */
.captura-view { align-items: center; }
.camera-box {
    position: relative;
    width: 100%;
    max-width: 360px;
    aspect-ratio: 1;
    background: black;
    border-radius: 20px;
    overflow: hidden;
    margin: 16px 0;
}
.camera-box video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transform: scaleX(-1); /* espejo para selfie */
}
.countdown {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 96px;
    color: white;
    font-weight: 700;
    text-shadow: 0 4px 20px rgba(0,0,0,0.5);
    pointer-events: none;
}
```

- [ ] **Step 3: Prueba end-to-end en celular**

Con un empleado vinculado:
1. Tocar ENTRADA → ve preview cámara → cuenta regresiva 3,2,1 → foto tomada → GPS obtenido → toast verde "✓ ENTRADA registrada".
2. En Supabase verificar que el registro tiene `latitud`, `longitud`, `origen='PWA'`, `tablet_id='PWA_...'`, `foto_registro` con URL.
3. Tocar ENTRADA de nuevo → toast rojo "Ya checaste, vete a chambear".
4. Tocar SALIDA → registra.
5. Tocar SALIDA de nuevo → toast rojo "Ya checaste salida, ve a casa".

- [ ] **Step 4: Commit**

```bash
git add views/captura.js styles.css
git commit -m "Add captura view (camera + GPS + registro)"
```

---

## Task 8: Vista de historial

**Files:**
- Create: `C:\Users\USUARIO\Desktop\V3 Checador-PWA\views\historial.js`

**Contexto:** Lista simple de los últimos 15 días, agrupada por fecha.

- [ ] **Step 1: Crear la vista**

Crear `C:\Users\USUARIO\Desktop\V3 Checador-PWA\views\historial.js` con:

```javascript
const Historial = {
    async render(container) {
        container.innerHTML = `
            <div class="view">
                <div class="hist-header">
                    <button class="btn-back" id="btnBack">←</button>
                    <h1>Mi historial</h1>
                </div>
                <div id="histLista">Cargando...</div>
            </div>
        `;
        document.getElementById('btnBack').addEventListener('click', () => Router.go('principal'));

        const registros = await HistorialAPI.getUltimosDias(AppState.empleado.id, 15);
        const lista = document.getElementById('histLista');

        if (!registros || registros.length === 0) {
            lista.innerHTML = '<p>No tienes registros en los últimos 15 días.</p>';
            return;
        }

        const porDia = {};
        for (const r of registros) {
            const d = new Date(r.fecha_hora);
            const clave = d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
            if (!porDia[clave]) porDia[clave] = [];
            porDia[clave].push(r);
        }

        lista.innerHTML = Object.entries(porDia).map(([fecha, items]) => `
            <div class="hist-grupo">
                <div class="hist-fecha">${fecha}</div>
                ${items.map(r => {
                    const d = new Date(r.fecha_hora);
                    const hh = String(d.getHours()).padStart(2, '0');
                    const mm = String(d.getMinutes()).padStart(2, '0');
                    const cls = r.tipo_registro === 'ENTRADA' ? 'ent' : 'sal';
                    const tag = r.origen === 'PWA' ? '📱' : '🖥️';
                    return `<div class="hist-item"><span class="hist-tipo ${cls}">${r.tipo_registro}</span><span class="hist-hora">${hh}:${mm} ${tag}</span></div>`;
                }).join('')}
            </div>
        `).join('');
    }
};
```

- [ ] **Step 2: Agregar estilos de historial**

Anexar a `styles.css`:

```css
.hist-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
}
.btn-back {
    width: 40px;
    height: 40px;
    border: none;
    background: #e2e8f0;
    border-radius: 50%;
    font-size: 20px;
    cursor: pointer;
}
.hist-grupo { margin-bottom: 16px; }
.hist-fecha {
    font-weight: 600;
    text-transform: capitalize;
    color: #475569;
    margin-bottom: 6px;
}
.hist-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: white;
    padding: 12px 16px;
    border-radius: 10px;
    margin-bottom: 6px;
}
.hist-tipo {
    font-weight: 600;
    font-size: 13px;
    padding: 4px 10px;
    border-radius: 999px;
    color: white;
}
.hist-tipo.ent { background: #16a34a; }
.hist-tipo.sal { background: #dc2626; }
.hist-hora { color: #0f172a; font-variant-numeric: tabular-nums; }
```

- [ ] **Step 3: Probar en celular**

Tocar "Ver mi historial" desde principal. Esperado: lista agrupada por día, con emoji indicando origen (📱 PWA, 🖥️ Tablet).

- [ ] **Step 4: Commit**

```bash
git add views/historial.js styles.css
git commit -m "Add historial view (last 15 days grouped by date)"
```

---

## Task 9: Deploy a Vercel

**Files:**
- Create: `C:\Users\USUARIO\Desktop\V3 Checador-PWA\vercel.json` (opcional)

**Contexto:** La PWA necesita HTTPS para funcionar (cámara + GPS). Vercel lo da gratis.

- [ ] **Step 1: Crear `vercel.json`**

Crear `C:\Users\USUARIO\Desktop\V3 Checador-PWA\vercel.json` con:

```json
{
    "cleanUrls": true,
    "headers": [
        {
            "source": "/(.*)",
            "headers": [
                { "key": "Cache-Control", "value": "no-cache" }
            ]
        },
        {
            "source": "/sw.js",
            "headers": [
                { "key": "Service-Worker-Allowed", "value": "/" },
                { "key": "Cache-Control", "value": "no-store" }
            ]
        }
    ]
}
```

- [ ] **Step 2: Instalar Vercel CLI y hacer login**

```bash
npm install -g vercel
vercel login
```

Seguir el flujo de login (email o GitHub).

- [ ] **Step 3: Deploy**

```bash
cd "/c/Users/USUARIO/Desktop/V3 Checador-PWA"
vercel
```

Responder las preguntas:
- Set up and deploy? **Y**
- Which scope? (tu cuenta)
- Link to existing project? **N**
- Project name: `checador-pwa` (o el que prefieras)
- Directory: `./`
- Override settings? **N**

Esperado: URL tipo `https://checador-pwa-xxx.vercel.app`.

- [ ] **Step 4: Deploy a producción**

```bash
vercel --prod
```

Copiar la URL de producción.

- [ ] **Step 5: Probar en celular real**

Abrir la URL en Chrome (Android) o Safari (iOS). Verificar:
1. Carga correctamente.
2. "Agregar a pantalla de inicio" disponible en menú del navegador.
3. Al abrir desde icono de inicio, abre en modo standalone (sin barra de navegador).
4. Flujo completo de vinculación + check funciona.

- [ ] **Step 6: Commit**

```bash
git add vercel.json
git commit -m "Add Vercel config + deploy"
```

---

## Task 10: Admin — helpers de Supabase para dispositivos

**Files:**
- Modify: `C:\Users\USUARIO\Desktop\V2 checador-system ADMIN\supabase-config.js`

**Contexto:** Agregar funciones al admin para listar dispositivos vinculados y desvincularlos.

- [ ] **Step 1: Revisar la estructura actual del archivo**

Leer `C:\Users\USUARIO\Desktop\V2 checador-system ADMIN\supabase-config.js` y ubicar dónde están definidos los otros "APIs" (buscar patrones como `const XxxAPI = { ... }`).

- [ ] **Step 2: Agregar `DispositivosAPI` al final del archivo, antes del último cierre**

Agregar este bloque:

```javascript
const DispositivosAPI = {
    async listar({ soloActivos = true, busqueda = '' } = {}) {
        let query = supabaseClient
            .from('empleado_dispositivos')
            .select(`
                id,
                device_id,
                fecha_vinculacion,
                ultimo_uso,
                activo,
                user_agent,
                desvinculado_por,
                desvinculado_en,
                empleado:empleados(id, codigo_empleado, nombre, apellido)
            `)
            .order('ultimo_uso', { ascending: false, nullsFirst: false });

        if (soloActivos) query = query.eq('activo', true);

        const { data, error } = await query;
        if (error) {
            console.error('Error listando dispositivos:', error);
            return [];
        }

        let filtrados = data || [];
        if (busqueda) {
            const b = busqueda.toLowerCase();
            filtrados = filtrados.filter(d => {
                if (!d.empleado) return false;
                return (d.empleado.codigo_empleado || '').toLowerCase().includes(b) ||
                       (d.empleado.nombre || '').toLowerCase().includes(b) ||
                       (d.empleado.apellido || '').toLowerCase().includes(b);
            });
        }
        return filtrados;
    },

    async desvincular(id, desvinculadoPor = 'admin') {
        const { error } = await supabaseClient
            .from('empleado_dispositivos')
            .update({
                activo: false,
                desvinculado_por: desvinculadoPor,
                desvinculado_en: new Date().toISOString()
            })
            .eq('id', id);
        if (error) {
            console.error('Error desvinculando:', error);
            return { success: false };
        }
        return { success: true };
    }
};
```

- [ ] **Step 3: Commit**

```bash
cd "/c/Users/USUARIO/Desktop/V2 checador-system ADMIN"
git add supabase-config.js
git commit -m "Add DispositivosAPI helpers to admin Supabase client"
```

---

## Task 11: Admin — navegación y vista "Dispositivos PWA"

**Files:**
- Modify: `C:\Users\USUARIO\Desktop\V2 checador-system ADMIN\Index.html`
- Modify: `C:\Users\USUARIO\Desktop\V2 checador-system ADMIN\Admin.js`
- Modify: `C:\Users\USUARIO\Desktop\V2 checador-system ADMIN\Admin.css`

**Contexto:** Agregar una entrada al menú del admin y una vista con la tabla de dispositivos.

- [ ] **Step 1: Explorar el menú existente**

Abrir `Index.html`. Buscar la sección del menú/navbar (probablemente `<nav>`, `<ul class="sidebar">`, o similar). Identificar el patrón: cada opción probablemente tiene un `data-view`, un `onclick`, o un link que dispara un cambio de vista en `Admin.js`.

Buscar en `Admin.js` cómo se maneja el cambio de vista — buscar patrones como `function showView(name)`, `case 'empleados':`, o la función que responde al click del menú. Documentar mentalmente el patrón exacto.

- [ ] **Step 2: Agregar entrada de menú en `Index.html`**

Identificar la última entrada del menú y agregar justo después (ajustar el markup para que coincida con el patrón existente; el ejemplo asume un `<li>` con `data-view`):

```html
<li class="nav-item" data-view="dispositivos">
    <span class="nav-icon">📱</span>
    <span class="nav-label">Dispositivos PWA</span>
</li>
```

Si el patrón usa botones o anchors en vez de `<li>`, adaptar.

- [ ] **Step 3: Agregar caso en el router de `Admin.js`**

Ubicar la función que despacha vistas (ej. `switch(viewName)` o `if (viewName === 'empleados')`). Agregar un caso:

```javascript
case 'dispositivos':
    renderDispositivosView();
    break;
```

- [ ] **Step 4: Implementar `renderDispositivosView` en `Admin.js`**

Al final de `Admin.js` agregar:

```javascript
let dispositivosState = { soloActivos: true, busqueda: '' };

async function renderDispositivosView() {
    const main = document.getElementById('main-content') || document.querySelector('.main-content');
    if (!main) {
        console.error('No se encontró contenedor principal');
        return;
    }
    main.innerHTML = `
        <div class="dispositivos-view">
            <h2>Dispositivos PWA vinculados</h2>
            <div class="disp-toolbar">
                <input type="text" id="dispBusqueda" placeholder="Buscar empleado..." class="disp-search" />
                <label class="disp-toggle">
                    <input type="checkbox" id="dispSoloActivos" checked>
                    Solo activos
                </label>
            </div>
            <div class="disp-tabla-wrap">
                <table class="disp-tabla">
                    <thead>
                        <tr>
                            <th>Código</th>
                            <th>Empleado</th>
                            <th>Vinculado</th>
                            <th>Último uso</th>
                            <th>Dispositivo</th>
                            <th>Estado</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody id="dispTbody">
                        <tr><td colspan="7">Cargando...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;

    document.getElementById('dispBusqueda').addEventListener('input', (e) => {
        dispositivosState.busqueda = e.target.value;
        loadDispositivos();
    });
    document.getElementById('dispSoloActivos').addEventListener('change', (e) => {
        dispositivosState.soloActivos = e.target.checked;
        loadDispositivos();
    });
    loadDispositivos();
}

async function loadDispositivos() {
    const tbody = document.getElementById('dispTbody');
    if (!tbody) return;
    const lista = await DispositivosAPI.listar(dispositivosState);
    if (!lista.length) {
        tbody.innerHTML = '<tr><td colspan="7">Sin dispositivos</td></tr>';
        return;
    }
    tbody.innerHTML = lista.map(d => {
        const emp = d.empleado || {};
        const nombre = `${emp.nombre || ''} ${emp.apellido || ''}`.trim() || '—';
        const codigo = emp.codigo_empleado || '—';
        const venc = d.fecha_vinculacion ? new Date(d.fecha_vinculacion).toLocaleDateString() : '—';
        const uso = d.ultimo_uso ? new Date(d.ultimo_uso).toLocaleString() : 'Nunca';
        const ua = resumirUA(d.user_agent);
        const estado = d.activo
            ? '<span class="disp-badge activo">Activo</span>'
            : `<span class="disp-badge inactivo">Desvinculado ${d.desvinculado_en ? new Date(d.desvinculado_en).toLocaleDateString() : ''}</span>`;
        const accion = d.activo
            ? `<button class="btn-desvincular" data-id="${d.id}" data-nombre="${nombre}">Desvincular</button>`
            : '';
        return `<tr>
            <td>${codigo}</td>
            <td>${nombre}</td>
            <td>${venc}</td>
            <td>${uso}</td>
            <td>${ua}</td>
            <td>${estado}</td>
            <td>${accion}</td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('.btn-desvincular').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const nombre = btn.getAttribute('data-nombre');
            confirmarDesvinculacion(id, nombre);
        });
    });
}

function resumirUA(ua) {
    if (!ua) return '—';
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua)) return 'iPad';
    if (/Android/.test(ua)) {
        const m = ua.match(/Android\s([\d.]+)/);
        return m ? `Android ${m[1]}` : 'Android';
    }
    return ua.slice(0, 40);
}

async function confirmarDesvinculacion(id, nombre) {
    if (!confirm(`¿Desvincular el dispositivo de ${nombre}?\n\nEl empleado podrá vincular otro dispositivo después de esto.`)) return;
    const res = await DispositivosAPI.desvincular(id, 'admin');
    if (res.success) {
        alert('Dispositivo desvinculado');
        loadDispositivos();
    } else {
        alert('Error al desvincular');
    }
}
```

- [ ] **Step 5: Agregar estilos en `Admin.css`**

Anexar al final de `Admin.css`:

```css
/* Dispositivos PWA */
.dispositivos-view { padding: 20px; }
.dispositivos-view h2 { margin-bottom: 16px; }

.disp-toolbar {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 16px;
    flex-wrap: wrap;
}
.disp-search {
    flex: 1;
    min-width: 220px;
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
}
.disp-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    color: #475569;
}

.disp-tabla-wrap {
    overflow-x: auto;
    background: white;
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}
.disp-tabla {
    width: 100%;
    border-collapse: collapse;
}
.disp-tabla th,
.disp-tabla td {
    padding: 12px 16px;
    text-align: left;
    border-bottom: 1px solid #f1f5f9;
    font-size: 14px;
}
.disp-tabla th {
    background: #f8fafc;
    font-weight: 600;
    color: #475569;
}
.disp-tabla tr:last-child td { border-bottom: none; }

.disp-badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
}
.disp-badge.activo { background: #dcfce7; color: #166534; }
.disp-badge.inactivo { background: #fee2e2; color: #991b1b; }

.btn-desvincular {
    background: #dc2626;
    color: white;
    border: none;
    padding: 8px 14px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
}
.btn-desvincular:hover { background: #b91c1c; }
```

- [ ] **Step 6: Smoke test**

Abrir el admin. Click en "Dispositivos PWA". Esperado:
1. Ve tabla con los empleados que ya se vincularon en pruebas anteriores.
2. Buscador filtra correctamente por nombre/código.
3. Toggle "Solo activos" oculta/muestra los desvinculados.
4. Click en "Desvincular" → confirmación → registro cambia a estado "Desvinculado".
5. Ese empleado ahora puede re-vincular en la PWA.

- [ ] **Step 7: Commit**

```bash
git add Index.html Admin.js Admin.css
git commit -m "Add Dispositivos PWA view to admin"
```

---

## Task 12: Verificación end-to-end completa

**Contexto:** Recorrer todos los flujos una última vez para asegurar que no hay regresiones y todo engrana.

- [ ] **Step 1: Flujo completo nuevo empleado**

En un celular limpio:
1. Abrir URL de Vercel.
2. Verificar que pide vinculación.
3. Código válido + PIN + permisos → queda vinculado.
4. Agregar a pantalla de inicio → abrir desde icono → debe ir directo a vista principal.
5. Registrar ENTRADA con foto y GPS.
6. En Supabase: verificar `registros.origen = 'PWA'`, `latitud` y `longitud` poblados, `foto_registro` con URL funcional.
7. Intentar ENTRADA de nuevo → debe bloquear.
8. SALIDA → debe funcionar.
9. Ver historial → debe mostrar ambos registros.

- [ ] **Step 2: Flujo de conflicto de dispositivo**

1. En el mismo empleado, abrir la URL en OTRO celular (o borrar localStorage y reintentar).
2. Intentar vincular con mismo código + PIN → debe bloquear con mensaje "ya estás vinculado".
3. En el admin: "Dispositivos PWA" → Desvincular.
4. Volver al segundo celular, reintentar → debe funcionar.

- [ ] **Step 3: Flujo de tablet sigue funcionando**

1. Abrir la tablet (URL actual o dispositivo físico).
2. Registrar una ENTRADA con QR.
3. Verificar que se guardó con `origen = 'TABLET'` (o NULL/default), sin `latitud` ni `longitud`.
4. Admin → lista de registros → ambos tipos aparecen normales.

- [ ] **Step 4: Permisos denegados**

1. En el celular, abrir configuración del navegador y revocar permisos de cámara para la URL.
2. Abrir la PWA, tocar ENTRADA → debe fallar con toast claro y regresar a principal.
3. Restaurar permisos → debe volver a funcionar.

- [ ] **Step 5: Offline**

1. Modo avión.
2. Abrir la PWA → toast "sin conexión" al tocar ENTRADA.
3. Restaurar conexión → funciona.

- [ ] **Step 6: Documentar URL final en spec**

Actualizar el spec con la URL de producción:
```bash
cd "/c/Users/USUARIO/Desktop/V2 checador-system ADMIN"
```

Editar `docs/superpowers/specs/2026-04-23-pwa-checador-personal-design.md`, sección "Plan de despliegue", agregar:

```
**URL de producción:** https://checador-pwa-xxx.vercel.app
```

- [ ] **Step 7: Commit final**

```bash
git add docs/superpowers/specs/2026-04-23-pwa-checador-personal-design.md
git commit -m "Document production URL in spec"
```

---

## Notas para el implementador

- **No hay framework de tests**, por eso el plan usa pruebas manuales E2E en cada task. Si el usuario agrega más adelante Playwright o similar, convertir las pruebas manuales a automatizadas.
- **La PWA vive en una carpeta hermana**, no en este repo admin. El spec y el plan sí viven aquí (como documentación del proyecto). La PWA puede tener su propio repo si se desea versionar independientemente.
- **HTTPS es obligatorio** — `localhost` funciona para probar, pero el celular real necesita la URL de Vercel.
- **La migración SQL es manual** en el SQL editor de Supabase — no hay CLI de migraciones configurada en este proyecto.
- **Los nombres de tablas y columnas** asumidos son los que aparecen en `v2 Checador-Tablet/supabase-config.js`: `empleados`, `registros`, `bloques_horario`, `configuracion_qr`, `registros-fotos` (bucket). Si algún nombre difiere en la BD real, ajustar antes de correr la migración.
- **Reglas de negocio idénticas a la tablet** — si cambian en la tablet, hay que cambiarlas también en `RegistroAPI.validarRegistro` y `getBloqueValido` de la PWA. Consistencia manual por ahora.
