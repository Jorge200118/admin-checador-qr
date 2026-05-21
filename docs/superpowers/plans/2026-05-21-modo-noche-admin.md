# Modo Noche Panel Admin — Plan de implementación

> **Para agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan checkbox (`- [ ]`) para tracking.

**Goal:** Agregar modo noche completo al panel admin (`Index.html`, `Admin.css`, `Admin.js`) con toggle persistente, paleta azul oscura estilo BotSucursales y cobertura total (chrome, mapas, gráficas, modales).

**Architecture:** Refactor de `Admin.css` para usar variables CSS (`var(--xxx)`), con dos sets de valores: `:root` (claro, valores actuales) y `html[data-theme="dark"]` (oscuro). Script anti-flash inline en `<head>` lee `localStorage` y aplica `data-theme` antes de pintar. Botón toggle en header. Mapas Leaflet cambian tile dinámicamente; Chart.js se re-renderiza al togglear.

**Tech Stack:** HTML/CSS/JS vanilla, Chart.js 3.9.1, Leaflet 1.9.4, FontAwesome 6.4. Sin framework, sin build step.

**Spec:** [docs/superpowers/specs/2026-05-21-modo-noche-admin-design.md](../specs/2026-05-21-modo-noche-admin-design.md)

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `Index.html` | Modificar `<head>` y `.user-info` del header | Script anti-flash + botón toggle |
| `Admin.css` | Refactor completo + agregar bloque dark | Variables CSS + valores claro + valores oscuro + estilos del botón + scrollbar oscura |
| `Admin.js` | Agregar bloque al inicio + adaptar mapa Leaflet + adaptar Chart.js | `initTheme()`, listener del toggle, helpers `getCurrentTheme()` / `getMapTileUrl()` / `getChartColors()`, re-render de charts y mapa al togglear |

No se tocan: `vacaciones-*.js`, `supabase-config.js`, `login-sucursal.html`, `guia-visual-alta-empleados.html`.

---

## Fase 1: Infraestructura del toggle (sin cambios visuales)

Objetivo: el botón está visible, cambia el atributo `data-theme` en `<html>`, persiste en `localStorage`, no rompe nada. Visualmente el panel se ve igual porque todavía no agregamos el CSS oscuro.

### Tarea 1.1: Script anti-flash en `<head>` de Index.html

**Files:**
- Modify: `Index.html:1-15` (sección `<head>`)

- [ ] **Paso 1: Leer la sección `<head>` actual**

Run: revisa líneas 1-15 de `Index.html`. Verifica que el `<link rel="stylesheet" href="Admin.css">` esté ahí.

- [ ] **Paso 2: Insertar el script anti-flash ANTES del link al CSS**

En `Index.html`, justo antes de la línea `<link rel="stylesheet" href="Admin.css">`, insertar:

```html
    <script>
        // Anti-flash: aplicar tema guardado antes de cargar CSS
        (function() {
            try {
                var t = localStorage.getItem('admin-theme');
                if (t === 'dark') {
                    document.documentElement.setAttribute('data-theme', 'dark');
                }
            } catch (e) { /* localStorage no disponible */ }
        })();
    </script>
```

- [ ] **Paso 3: Verificar visualmente en navegador**

Abrir `Index.html` en navegador. En DevTools → Console correr:
```js
localStorage.setItem('admin-theme', 'dark');
location.reload();
```
Expected: en DevTools → Elements, el `<html>` debe tener `data-theme="dark"`. Visualmente todo se ve igual (todavía no hay CSS oscuro).

Limpiar:
```js
localStorage.removeItem('admin-theme');
location.reload();
```

- [ ] **Paso 4: Commit**

```bash
git add Index.html
git commit -m "Modo noche: script anti-flash en head"
```

---

### Tarea 1.2: Botón toggle en el header

**Files:**
- Modify: `Index.html:130-134` (sección `.user-info` del header)

- [ ] **Paso 1: Localizar la sección del header**

Leer `Index.html:116-136`. La estructura actual es:
```html
<div class="header-actions">
    <div class="status-indicator">...</div>
    <button class="btn btn-alertas" id="btnAlertas" ...>...</button>
    <button class="btn btn-logout" onclick="cerrarSesion()">...</button>
    <div class="user-info" style="margin-right: 15px; color: #666;">...</div>
</div>
```

- [ ] **Paso 2: Insertar el botón toggle ANTES del `.user-info`**

Reemplazar el bloque actual de `.user-info` para que quede así (insertar el botón antes):

```html
                <button class="btn btn-theme-toggle" id="btnThemeToggle" onclick="toggleTheme()" title="Cambiar tema" aria-label="Cambiar tema">
                    <i class="fas fa-moon" id="themeToggleIcon"></i>
                </button>
                <div class="user-info" style="margin-right: 15px; color: #666;">
                    <i class="fas fa-user"></i>
                    <span id="userNameDisplay"></span>
                    <span style="font-size: 12px;">(<span id="userSucursalDisplay"></span>)</span>
                </div>
```

- [ ] **Paso 3: Verificar en navegador**

Abrir `Index.html`. Expected: el botón aparece a la izquierda del nombre de usuario. Hover muestra cursor pointer (aún sin estilo). Click muestra error en consola: `toggleTheme is not defined` (correcto — la función va en la siguiente tarea).

- [ ] **Paso 4: Commit**

```bash
git add Index.html
git commit -m "Modo noche: boton toggle en header"
```

---

### Tarea 1.3: Funciones `initTheme()` y `toggleTheme()` en Admin.js

**Files:**
- Modify: `Admin.js` — agregar al final del bloque de configuración (después de línea ~44, después de `FESTIVOS_LFT`)

- [ ] **Paso 1: Localizar el lugar de inserción**

Leer `Admin.js:38-50`. Después del cierre de la función `esDiaNoLaborable` y antes del comentario `// HELPERS DE ZONA HORARIA - MAZATLÁN (UTC-7)`.

- [ ] **Paso 2: Insertar el bloque de tema**

Insertar inmediatamente después de la función `esDiaNoLaborable`:

```javascript

// ================================
// SISTEMA DE TEMA (CLARO / NOCHE)
// ================================
const THEME_STORAGE_KEY = 'admin-theme';

function getCurrentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme) {
    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
    _updateThemeToggleIcon(theme);
    _updateMapTilesForTheme(theme);
    _updateChartsForTheme(theme);
}

function _updateThemeToggleIcon(theme) {
    const icon = document.getElementById('themeToggleIcon');
    if (!icon) return;
    icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

function toggleTheme() {
    const next = getCurrentTheme() === 'dark' ? 'light' : 'dark';
    try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch (e) { /* localStorage no disponible */ }
    applyTheme(next);
}

function initTheme() {
    // El atributo data-theme ya fue aplicado por el script anti-flash en <head>.
    // Aqui solo sincronizamos el icono y los listeners.
    const current = getCurrentTheme();
    _updateThemeToggleIcon(current);
}

// Stubs que se implementan en Fase 4 (mapas y charts)
function _updateMapTilesForTheme(theme) { /* implementado en Fase 4 */ }
function _updateChartsForTheme(theme) { /* implementado en Fase 4 */ }

// Atajo de teclado Ctrl+Shift+D
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        toggleTheme();
    }
});

// Inicializar al cargar DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTheme);
} else {
    initTheme();
}
```

- [ ] **Paso 3: Verificar en navegador**

Recargar `Index.html`. Click en el botón con icono luna. Expected:
- El icono cambia a sol.
- En DevTools → Elements, `<html>` ahora tiene `data-theme="dark"`.
- En DevTools → Application → Local Storage, `admin-theme` = `dark`.
- Visualmente nada cambia (todavía no hay CSS oscuro).
- Click otra vez: vuelve a luna, atributo removido, localStorage = `light`.
- Recargar página con tema oscuro activo: el icono inicia ya como sol (no parpadea).
- Probar Ctrl+Shift+D: también alterna.

- [ ] **Paso 4: Commit**

```bash
git add Admin.js
git commit -m "Modo noche: funciones initTheme y toggleTheme"
```

---

## Fase 2: Variables CSS modo claro (refactor sin cambio visual)

Objetivo: reemplazar todos los colores hardcodeados de `Admin.css` por `var(--xxx)`. Los valores en `:root` mantienen los colores actuales — el panel debe verse **idéntico** al actual. Cualquier diferencia = bug.

### Tarea 2.1: Definir bloque `:root` con todas las variables

**Files:**
- Modify: `Admin.css:1-22` (al inicio, antes de cualquier regla)

- [ ] **Paso 1: Leer el inicio de Admin.css**

Leer `Admin.css:1-22`. Debe haber un header comentado y luego `* { margin:0; ... }` y `body { ... }`.

- [ ] **Paso 2: Insertar bloque `:root` después del header y antes del `*`**

Reemplazar las primeras líneas (header comentado + reset `*`) para que queden así:

```css
/* ========================================
   ADMIN.CSS - PANEL CHECADOR QR
   Versión 2.0 - Limpio y organizado
   ======================================== */

/* ========================================
   0. VARIABLES DE TEMA
   ======================================== */
:root {
    /* Superficies */
    --bg-app: #f1f5f9;
    --bg-surface: #ffffff;
    --bg-elevated: #f8fafc;
    --bg-input: #ffffff;
    --bg-overlay: rgba(0, 0, 0, 0.5);

    /* Texto */
    --text-primary: #1e293b;
    --text-secondary: #475569;
    --text-muted: #94a3b8;
    --text-inverse: #ffffff;

    /* Bordes */
    --border: #e2e8f0;
    --border-strong: #cbd5e1;

    /* Sidebar */
    --sidebar-bg: #0f172a;
    --sidebar-text: rgba(255, 255, 255, 0.55);
    --sidebar-text-active: #ffffff;
    --sidebar-item-hover-bg: rgba(255, 255, 255, 0.06);
    --sidebar-item-active-bg: rgba(59, 130, 246, 0.12);
    --sidebar-border: rgba(255, 255, 255, 0.06);

    /* Acentos */
    --accent-primary: #3b82f6;
    --accent-primary-hover: #2563eb;
    --accent-success: #22c55e;
    --accent-success-hover: #16a34a;
    --accent-warning: #f59e0b;
    --accent-warning-hover: #d97706;
    --accent-danger: #ef4444;
    --accent-danger-hover: #dc2626;
    --accent-info: #06b6d4;

    /* Estados (background suaves) */
    --bg-success-soft: rgba(34, 197, 94, 0.1);
    --bg-warning-soft: rgba(245, 158, 11, 0.1);
    --bg-danger-soft: rgba(239, 68, 68, 0.1);
    --bg-info-soft: rgba(59, 130, 246, 0.1);

    /* Sombras */
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
    --shadow-md: 0 1px 3px rgba(0, 0, 0, 0.1);
    --shadow-lg: 0 10px 25px rgba(0, 0, 0, 0.1);

    /* Scrollbar */
    --scrollbar-track: #f1f5f9;
    --scrollbar-thumb: #cbd5e1;
    --scrollbar-thumb-hover: #94a3b8;
}

/* ========================================
   1. RESET & BASE
   ======================================== */
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}
```

- [ ] **Paso 3: Verificar que el panel se sigue viendo igual**

Recargar `Index.html` en navegador. Expected: cero cambios visuales (las variables existen pero todavía no se usan).

- [ ] **Paso 4: Commit**

```bash
git add Admin.css
git commit -m "Modo noche: bloque root con variables CSS"
```

---

### Tarea 2.2: Reemplazar colores en bloque BASE y SIDEBAR (líneas ~15-180)

**Files:**
- Modify: `Admin.css:15-180` (aprox)

- [ ] **Paso 1: Leer el rango**

Leer `Admin.css:15-180`. Identifica reglas en `body`, `.sidebar`, `.logo`, `.nav-menu`, `.nav-item`, `.main-content`, `.header`.

- [ ] **Paso 2: Reemplazar colores hardcodeados por variables**

Hacer estos reemplazos exactos en el rango leído (usa Edit con `replace_all: false` para cada uno único en el rango):

| Buscar | Reemplazar por |
|---|---|
| `background: #f1f5f9;` (en `body`) | `background: var(--bg-app);` |
| `color: #1e293b;` (en `body`) | `color: var(--text-primary);` |
| `background: #0f172a;` (en `.sidebar`) | `background: var(--sidebar-bg);` |
| `color: white;` (en `.sidebar`) | `color: var(--sidebar-text-active);` |
| `border-right: 1px solid rgba(255, 255, 255, 0.06);` (en `.sidebar`) | `border-right: 1px solid var(--sidebar-border);` |
| `color: #60a5fa;` (en `.logo i`) | `color: var(--accent-primary);` |
| `color: rgba(255, 255, 255, 0.55);` (en `.nav-item a`) | `color: var(--sidebar-text);` |
| `background: rgba(255, 255, 255, 0.06);` (en hover) | `background: var(--sidebar-item-hover-bg);` |
| `color: rgba(255, 255, 255, 0.9);` (en hover) | `color: var(--sidebar-text-active);` |
| `background: rgba(59, 130, 246, 0.12);` (en active) | `background: var(--sidebar-item-active-bg);` |
| `color: white;` (en active, después del anterior) | `color: var(--sidebar-text-active);` |
| `border-left-color: #3b82f6;` | `border-left-color: var(--accent-primary);` |
| `background: #f1f5f9;` (en `.main-content`) | `background: var(--bg-app);` |
| `background: white;` (en `.header`) | `background: var(--bg-surface);` |
| `color: #0f172a;` (en `.header h1`) | `color: var(--text-primary);` |

Nota: cuando un valor aparece varias veces en el archivo, usa contexto adicional en `old_string` para que sea único.

- [ ] **Paso 3: Verificar visualmente**

Recargar. Expected: panel se ve idéntico. Si algo cambió → revisar qué color se mapeó mal.

- [ ] **Paso 4: Commit**

```bash
git add Admin.css
git commit -m "Modo noche: variables en bloque base y sidebar"
```

---

### Tarea 2.3: Reemplazar colores en BOTONES y CARDS (líneas ~180-400)

**Files:**
- Modify: `Admin.css:180-400` (aprox)

- [ ] **Paso 1: Leer el rango**

Leer `Admin.css:180-400`. Identifica reglas en `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-success`, `.btn-danger`, `.btn-warning`, `.stat-card`, `.dashboard-grid`.

- [ ] **Paso 2: Reemplazos**

| Buscar | Reemplazar por |
|---|---|
| `background: #3b82f6;` | `background: var(--accent-primary);` |
| `background: #2563eb;` | `background: var(--accent-primary-hover);` |
| `background: #e2e8f0;` | `background: var(--border);` |
| `color: #475569;` | `color: var(--text-secondary);` |
| `background: #cbd5e1;` | `background: var(--border-strong);` |
| `background: #10b981;` o `background: #22c55e;` | `background: var(--accent-success);` |
| `background: #059669;` o `background: #16a34a;` | `background: var(--accent-success-hover);` |
| `background: #ef4444;` | `background: var(--accent-danger);` |
| `background: #dc2626;` | `background: var(--accent-danger-hover);` |
| `background: #f59e0b;` o `background: #eab308;` | `background: var(--accent-warning);` |
| `background: #d97706;` o `background: #ca8a04;` | `background: var(--accent-warning-hover);` |
| `color: white;` (en botones) | `color: var(--text-inverse);` |
| `background: white;` (en `.stat-card`) | `background: var(--bg-surface);` |
| `color: #64748b;` | `color: var(--text-secondary);` |
| `box-shadow: 0 1px 3px rgba(0,0,0,0.1);` | `box-shadow: var(--shadow-md);` |

Para colores que aparecen muchas veces, hacer reemplazos contextuales (incluir la regla completa en `old_string`).

- [ ] **Paso 3: Verificar visualmente**

Recargar. Navegar a Dashboard, ver botones y stat-cards. Expected: idéntico.

- [ ] **Paso 4: Commit**

```bash
git add Admin.css
git commit -m "Modo noche: variables en botones y cards"
```

---

### Tarea 2.4: Reemplazar colores en TABLAS y FORMULARIOS (líneas ~400-900)

**Files:**
- Modify: `Admin.css:400-900` (aprox)

- [ ] **Paso 1: Leer el rango**

Leer `Admin.css:400-900`. Identifica reglas en `.table`, `.table th`, `.table td`, `.form-group`, `.form-control`, `input`, `select`, `textarea`, `.badge-*`.

- [ ] **Paso 2: Reemplazos**

| Buscar | Reemplazar por |
|---|---|
| `background: white;` (en tablas/forms) | `background: var(--bg-surface);` |
| `background: #f8fafc;` (en headers de tabla) | `background: var(--bg-elevated);` |
| `border: 1px solid #e2e8f0;` | `border: 1px solid var(--border);` |
| `border-bottom: 1px solid #e2e8f0;` | `border-bottom: 1px solid var(--border);` |
| `color: #1e293b;` (en celdas/labels) | `color: var(--text-primary);` |
| `color: #475569;` (en headers) | `color: var(--text-secondary);` |
| `background: #ffffff;` (en inputs) | `background: var(--bg-input);` |
| `color: #94a3b8;` (placeholders/muted) | `color: var(--text-muted);` |
| Badges suaves `rgba(34, 197, 94, 0.1)` etc | `var(--bg-success-soft)` / warning / danger / info |

- [ ] **Paso 3: Verificar**

Recargar. Navegar a Empleados, Horarios, Registros. Probar abrir el modal de "Nuevo Empleado". Expected: idéntico al original.

- [ ] **Paso 4: Commit**

```bash
git add Admin.css
git commit -m "Modo noche: variables en tablas y formularios"
```

---

### Tarea 2.5: Reemplazar colores en MODALES y resto (líneas ~900-2679)

**Files:**
- Modify: `Admin.css:900-2679`

- [ ] **Paso 1: Buscar colores hardcodeados restantes**

Grep en el archivo:
```
Grep pattern "#[0-9a-fA-F]{3,6}" path Admin.css output_mode content -n true head_limit 250
```

- [ ] **Paso 2: Hacer pasada final reemplazando los que queden**

Para cada color hardcodeado restante, decidir la variable correcta según contexto (background → bg-*, color → text-*, border → border, etc.). Aplicar reemplazos.

Casos especiales a mantener hardcodeados (NO reemplazar):
- Gradientes decorativos específicos (ej. iconos de stat-card que ya tienen identidad propia).
- Colores de un solo uso que son parte de assets gráficos (ej. SVGs inline).

Si dudas, déjalo como está — siempre puedes hacer otra pasada.

- [ ] **Paso 3: Buscar también colores `rgb(...)` y `rgba(...)` no cubiertos**

```
Grep pattern "rgba?\([0-9]" path Admin.css output_mode content -n true head_limit 100
```
Reemplazar los que claramente son colores semánticos (text, bg, border) — dejar los que son sombras o overlays muy específicos.

- [ ] **Paso 4: Verificar exhaustivamente**

Recargar. Navegar las 11 secciones del sidebar (Dashboard, Empleados, Horarios, Registros, Justificaciones, Vacaciones, Absentismo, Estadísticas, Dispositivos, Geocercas, Configuración). Abrir al menos un modal por sección. Expected: idéntico al original en TODAS las pantallas.

- [ ] **Paso 5: Commit**

```bash
git add Admin.css
git commit -m "Modo noche: variables en modales y resto del CSS"
```

---

### Tarea 2.6: Agregar estilos del botón theme-toggle

**Files:**
- Modify: `Admin.css` — agregar al final del archivo

- [ ] **Paso 1: Agregar estilos del botón**

Agregar al final de `Admin.css`:

```css
/* ========================================
   N. THEME TOGGLE BUTTON
   ======================================== */
.btn-theme-toggle {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: var(--bg-surface);
    color: var(--text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    transition: background 0.15s, color 0.15s, transform 0.15s;
    margin-right: 10px;
}

.btn-theme-toggle:hover {
    background: var(--bg-elevated);
    color: var(--accent-primary);
    transform: scale(1.05);
}

.btn-theme-toggle:active {
    transform: scale(0.95);
}
```

- [ ] **Paso 2: Verificar**

Recargar. Hover sobre el botón: debe aparecer highlight sutil. Click: feedback de escala.

- [ ] **Paso 3: Commit**

```bash
git add Admin.css
git commit -m "Modo noche: estilos del boton toggle"
```

---

## Fase 3: Modo noche para chrome principal

Objetivo: agregar el bloque `html[data-theme="dark"]` con la paleta azul oscura. Togglear cambia todo el chrome (body, sidebar, header, cards, tablas, modales, formularios, botones).

### Tarea 3.1: Bloque `[data-theme="dark"]` con paleta oscura

**Files:**
- Modify: `Admin.css` — agregar después del bloque `:root` (antes de la sección `1. RESET & BASE`)

- [ ] **Paso 1: Insertar bloque dark después del `:root`**

Agregar inmediatamente después del cierre de `:root { ... }`:

```css
/* ========================================
   0.1 VARIABLES MODO NOCHE
   ======================================== */
html[data-theme="dark"] {
    /* Superficies */
    --bg-app: #0d1b2a;
    --bg-surface: #13263d;
    --bg-elevated: #1e3a5f;
    --bg-input: #0a1622;
    --bg-overlay: rgba(0, 0, 0, 0.7);

    /* Texto */
    --text-primary: #e8eef5;
    --text-secondary: #94a8c4;
    --text-muted: #6b829e;
    --text-inverse: #0d1b2a;

    /* Bordes */
    --border: #1e3a5f;
    --border-strong: #2a4a73;

    /* Sidebar (gradient estilo BotSucursales) */
    --sidebar-bg: linear-gradient(180deg, #1e3a5f 0%, #0d1b2a 100%);
    --sidebar-text: rgba(232, 238, 245, 0.65);
    --sidebar-text-active: #ffffff;
    --sidebar-item-hover-bg: rgba(96, 165, 250, 0.1);
    --sidebar-item-active-bg: rgba(96, 165, 250, 0.18);
    --sidebar-border: rgba(255, 255, 255, 0.05);

    /* Acentos (mas claros para mejor contraste) */
    --accent-primary: #60a5fa;
    --accent-primary-hover: #93c5fd;
    --accent-success: #34d399;
    --accent-success-hover: #6ee7b7;
    --accent-warning: #fbbf24;
    --accent-warning-hover: #fcd34d;
    --accent-danger: #f87171;
    --accent-danger-hover: #fca5a5;
    --accent-info: #22d3ee;

    /* Estados suaves (mas opacos sobre fondo oscuro) */
    --bg-success-soft: rgba(52, 211, 153, 0.15);
    --bg-warning-soft: rgba(251, 191, 36, 0.15);
    --bg-danger-soft: rgba(248, 113, 113, 0.15);
    --bg-info-soft: rgba(96, 165, 250, 0.15);

    /* Sombras (mas profundas) */
    --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.4);
    --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.4);
    --shadow-lg: 0 10px 25px rgba(0, 0, 0, 0.6);

    /* Scrollbar */
    --scrollbar-track: #0a1622;
    --scrollbar-thumb: #2a4a73;
    --scrollbar-thumb-hover: #3a5a83;
}
```

- [ ] **Paso 2: Verificar primer cambio visible**

Recargar. Click en el botón toggle (luna). Expected:
- Body, header, sidebar y cards se vuelven azul oscuro.
- Texto principal cambia a claro.
- Mapas y gráficas siguen claras (se arreglan en Fase 4).
- Algunos detalles pueden verse raros — se ajustan en próximas tareas de esta fase.

- [ ] **Paso 3: Commit**

```bash
git add Admin.css
git commit -m "Modo noche: paleta oscura azul completa"
```

---

### Tarea 3.2: Ajustar inputs y selects en modo noche

**Files:**
- Modify: `Admin.css` — agregar reglas específicas dentro del bloque dark

- [ ] **Paso 1: Detectar problemas visuales**

Recargar en modo oscuro. Abrir modal de "Nuevo Empleado". Identifica:
- Inputs con texto invisible (texto oscuro sobre fondo oscuro).
- Bordes que no se ven.
- Placeholders ilegibles.
- Iconos de calendario o flechas de select que son oscuros.

- [ ] **Paso 2: Agregar overrides específicos para modo noche**

Agregar al final de `Admin.css`:

```css
/* ========================================
   N.1 OVERRIDES MODO NOCHE
   ======================================== */
html[data-theme="dark"] input,
html[data-theme="dark"] select,
html[data-theme="dark"] textarea {
    background: var(--bg-input);
    color: var(--text-primary);
    border-color: var(--border);
}

html[data-theme="dark"] input::placeholder,
html[data-theme="dark"] textarea::placeholder {
    color: var(--text-muted);
}

html[data-theme="dark"] input:focus,
html[data-theme="dark"] select:focus,
html[data-theme="dark"] textarea:focus {
    border-color: var(--accent-primary);
    outline: none;
    box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.15);
}

/* Iconos calendar/time nativos en modo noche */
html[data-theme="dark"] input[type="date"]::-webkit-calendar-picker-indicator,
html[data-theme="dark"] input[type="time"]::-webkit-calendar-picker-indicator,
html[data-theme="dark"] input[type="datetime-local"]::-webkit-calendar-picker-indicator {
    filter: invert(0.8);
}

/* Autofill: Chrome lo pinta amarillo, lo arreglamos */
html[data-theme="dark"] input:-webkit-autofill,
html[data-theme="dark"] input:-webkit-autofill:hover,
html[data-theme="dark"] input:-webkit-autofill:focus {
    -webkit-text-fill-color: var(--text-primary);
    -webkit-box-shadow: 0 0 0px 1000px var(--bg-input) inset;
    transition: background-color 5000s ease-in-out 0s;
}
```

- [ ] **Paso 3: Verificar**

Modo oscuro → abrir modal de Nuevo Empleado. Expected:
- Inputs con fondo oscuro, texto claro, placeholder gris.
- Focus muestra borde azul claro con halo.
- Click en date picker: icono visible.

- [ ] **Paso 4: Commit**

```bash
git add Admin.css
git commit -m "Modo noche: overrides para inputs y autofill"
```

---

### Tarea 3.3: Ajustar tablas en modo noche

**Files:**
- Modify: `Admin.css` — agregar overrides al final

- [ ] **Paso 1: Detectar problemas**

Modo oscuro → ir a "Empleados" o "Registros". Identifica:
- Filas alternadas (zebra) que no se diferencian.
- Hover de fila imperceptible.
- Badges de estado con poco contraste.

- [ ] **Paso 2: Agregar overrides**

Agregar al final de `Admin.css`:

```css
html[data-theme="dark"] table tr:nth-child(even),
html[data-theme="dark"] .table tr:nth-child(even) {
    background: rgba(255, 255, 255, 0.02);
}

html[data-theme="dark"] table tr:hover,
html[data-theme="dark"] .table tr:hover {
    background: var(--bg-elevated);
}

html[data-theme="dark"] table thead th,
html[data-theme="dark"] .table thead th {
    background: var(--bg-elevated);
    color: var(--text-primary);
    border-bottom-color: var(--border-strong);
}

/* Filas seleccionadas / activas */
html[data-theme="dark"] table tr.selected,
html[data-theme="dark"] .table tr.selected {
    background: var(--sidebar-item-active-bg);
}
```

- [ ] **Paso 3: Verificar**

Modo oscuro → Empleados. Expected: zebra visible, hover claro, headers diferenciados.

- [ ] **Paso 4: Commit**

```bash
git add Admin.css
git commit -m "Modo noche: ajustes de tablas"
```

---

### Tarea 3.4: Ajustar modales y overlay

**Files:**
- Modify: `Admin.css` — overrides al final

- [ ] **Paso 1: Detectar problemas**

Modo oscuro → abrir varios modales (Nuevo Empleado, Editar Horario, modal de Justificaciones). Identifica:
- Overlay con opacidad insuficiente.
- Close button (`&times;`) invisible.
- Headers de modal con poco contraste.

- [ ] **Paso 2: Agregar overrides**

Agregar al final de `Admin.css`:

```css
html[data-theme="dark"] .modal {
    background: var(--bg-overlay);
}

html[data-theme="dark"] .modal-content {
    background: var(--bg-surface);
    color: var(--text-primary);
    box-shadow: var(--shadow-lg);
}

html[data-theme="dark"] .modal-header {
    background: var(--bg-elevated);
    border-bottom-color: var(--border);
}

html[data-theme="dark"] .modal-header h3 {
    color: var(--text-primary);
}

html[data-theme="dark"] .close {
    color: var(--text-secondary);
}

html[data-theme="dark"] .close:hover {
    color: var(--text-primary);
}
```

- [ ] **Paso 3: Verificar**

Modo oscuro → abrir 3-4 modales distintos. Expected: todos legibles, close button visible.

- [ ] **Paso 4: Commit**

```bash
git add Admin.css
git commit -m "Modo noche: ajustes de modales"
```

---

### Tarea 3.5: Scrollbar oscura (Webkit)

**Files:**
- Modify: `Admin.css` — agregar al final

- [ ] **Paso 1: Agregar estilos de scrollbar**

Agregar al final de `Admin.css`:

```css
/* ========================================
   N.2 CUSTOM SCROLLBAR (Webkit)
   ======================================== */
::-webkit-scrollbar {
    width: 10px;
    height: 10px;
}

::-webkit-scrollbar-track {
    background: var(--scrollbar-track);
}

::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 5px;
}

::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover);
}
```

- [ ] **Paso 2: Verificar**

Modo claro: scrollbar gris claro estándar. Modo oscuro: scrollbar oscuro armonizado.

- [ ] **Paso 3: Commit**

```bash
git add Admin.css
git commit -m "Modo noche: scrollbar custom"
```

---

### Tarea 3.6: Revisión visual completa de Fase 3

**Files:** ninguno (solo testing manual).

- [ ] **Paso 1: Recorrido completo en modo oscuro**

Recargar. Activar modo oscuro. Navegar TODAS las secciones del sidebar y anotar inconsistencias:

- [ ] Dashboard — stat-cards, alertas, status indicator
- [ ] Empleados — tabla, filtros, modal de alta
- [ ] Horarios — tabla, modal de edición
- [ ] Registros — tabla, filtros de fecha
- [ ] Justificaciones — tabla, modal de detalle
- [ ] Vacaciones — tabs, tablas de saldos, calendario
- [ ] Absentismo — tabla, gráficas (si las hay)
- [ ] Estadísticas — todas las gráficas Chart.js (quedan claras, se arreglan en Fase 4)
- [ ] Dispositivos PWA — tabla
- [ ] Geocercas — mapa Leaflet (queda claro, se arregla en Fase 4)
- [ ] Configuración — formularios

- [ ] **Paso 2: Aplicar ajustes que detectaste**

Para cualquier elemento que se vea mal y no esté cubierto por las tareas anteriores, agregar override específico al final de `Admin.css` dentro de un bloque `html[data-theme="dark"] <selector> { ... }`.

Casos comunes esperados que pueden requerir ajuste:
- Colores hardcodeados que se escaparon en Fase 2.5 (resolver con find del color exacto).
- Tooltips o popovers con fondo claro.
- Badges de colores específicos (estado del empleado, etc.).

- [ ] **Paso 3: Verificar de nuevo**

Repetir el recorrido. Expected: solo mapa y gráficas se ven raros (eso es Fase 4). Todo lo demás coherente.

- [ ] **Paso 4: Commit**

```bash
git add Admin.css
git commit -m "Modo noche: ajustes finales de chrome (Fase 3)"
```

---

## Fase 4: Edge cases (mapas y gráficas)

### Tarea 4.1: Cambio dinámico de tiles del mapa Leaflet

**Files:**
- Modify: `Admin.js:8100-8125` (función que inicializa el mapa de geocercas)
- Modify: `Admin.js` (bloque del sistema de tema, reemplazar el stub `_updateMapTilesForTheme`)

- [ ] **Paso 1: Leer la inicialización actual del mapa**

Leer `Admin.js:8100-8150`. La función que crea el mapa hace:
```js
const map = L.map('mapaGeocerca').setView(centro, ...);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { ... }).addTo(map);
geocercaMapState.map = map;
```

- [ ] **Paso 2: Refactorizar para guardar referencia al tile layer**

Cambiar la inicialización del tile a:

```javascript
const tileUrl = getMapTileUrl(getCurrentTheme());
const tileAttribution = getMapTileAttribution(getCurrentTheme());
const tileLayer = L.tileLayer(tileUrl, {
    attribution: tileAttribution,
    maxZoom: 19
}).addTo(map);

geocercaMapState.map = map;
geocercaMapState.tileLayer = tileLayer;
```

Y al inicio del archivo donde se declara `geocercaMapState` (busca con grep `geocercaMapState`), agregar `tileLayer: null` al objeto.

- [ ] **Paso 3: Agregar helpers `getMapTileUrl` y `getMapTileAttribution`**

En el bloque del sistema de tema (después de `getCurrentTheme()`), agregar:

```javascript
function getMapTileUrl(theme) {
    return theme === 'dark'
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
}

function getMapTileAttribution(theme) {
    return theme === 'dark'
        ? '&copy; OpenStreetMap &copy; CARTO'
        : '&copy; OpenStreetMap';
}
```

- [ ] **Paso 4: Reemplazar el stub `_updateMapTilesForTheme`**

Reemplazar:
```javascript
function _updateMapTilesForTheme(theme) { /* implementado en Fase 4 */ }
```

Por:
```javascript
function _updateMapTilesForTheme(theme) {
    if (typeof geocercaMapState === 'undefined' || !geocercaMapState.map) return;
    if (geocercaMapState.tileLayer) {
        geocercaMapState.map.removeLayer(geocercaMapState.tileLayer);
    }
    const newLayer = L.tileLayer(getMapTileUrl(theme), {
        attribution: getMapTileAttribution(theme),
        maxZoom: 19
    }).addTo(geocercaMapState.map);
    geocercaMapState.tileLayer = newLayer;
}
```

- [ ] **Paso 5: Verificar**

Ir a Geocercas en modo claro: mapa OSM normal. Click toggle: tile cambia a CartoDB Dark Matter (oscuro y elegante). Click toggle de nuevo: vuelve a OSM. Sin recargar.

Si el mapa no está abierto, togglear no debe romper nada (función retorna temprano).

- [ ] **Paso 6: Commit**

```bash
git add Admin.js
git commit -m "Modo noche: tiles oscuros para mapa Leaflet"
```

---

### Tarea 4.2: Re-render de gráficas Chart.js al cambiar tema

**Files:**
- Modify: `Admin.js` — bloque del sistema de tema, reemplazar stub `_updateChartsForTheme`
- Modify: `Admin.js:7040-7050` (zona donde se renderizan los charts de Estadísticas)

- [ ] **Paso 1: Leer cómo se renderizan los charts actualmente**

Leer `Admin.js:7000-7150`. Identifica:
- La variable `_estCharts = {}` que guarda instancias.
- La función que las crea (probablemente `cargarEstadisticas()` o similar).
- Los helpers `_renderChartBarrasRangos`, `_renderChartBarrasV`, `_renderChartBarrasH`.

- [ ] **Paso 2: Agregar helper `getChartThemeColors`**

En el bloque del sistema de tema (después de `getMapTileAttribution`), agregar:

```javascript
function getChartThemeColors() {
    const styles = getComputedStyle(document.documentElement);
    return {
        text: styles.getPropertyValue('--text-secondary').trim(),
        grid: styles.getPropertyValue('--border').trim(),
        background: styles.getPropertyValue('--bg-surface').trim()
    };
}

function applyChartDefaults() {
    if (typeof Chart === 'undefined') return;
    const colors = getChartThemeColors();
    Chart.defaults.color = colors.text;
    Chart.defaults.borderColor = colors.grid;
    if (Chart.defaults.scale && Chart.defaults.scale.grid) {
        Chart.defaults.scale.grid.color = colors.grid;
    }
}
```

- [ ] **Paso 3: Llamar `applyChartDefaults()` antes del primer render de Chart.js**

Encontrar la función que renderiza Estadísticas (la que usa `_estCharts` y llama a los helpers `_renderChartBarras*`). Justo antes de la línea donde destruye charts anteriores (`Object.values(_estCharts).forEach(c => c.destroy())`), agregar:

```javascript
        applyChartDefaults();
```

Si los helpers individuales (`_renderChartBarrasRangos`, etc.) configuran sus propios `scales: { ... }`, ajustarlos para usar la variable también:

Buscar en cada helper:
```javascript
scales: {
    x: { ticks: { color: '#???' }, grid: { color: '#???' } },
    y: { ticks: { color: '#???' }, grid: { color: '#???' } }
}
```

Y reemplazar los colores hardcodeados por:
```javascript
const colors = getChartThemeColors();
// ...
scales: {
    x: { ticks: { color: colors.text }, grid: { color: colors.grid } },
    y: { ticks: { color: colors.text }, grid: { color: colors.grid } }
}
```

Si los helpers no especifican `scales.ticks.color`, los defaults globales (`Chart.defaults.color`) bastan — saltar este sub-paso.

- [ ] **Paso 4: Reemplazar el stub `_updateChartsForTheme`**

Reemplazar:
```javascript
function _updateChartsForTheme(theme) { /* implementado en Fase 4 */ }
```

Por:
```javascript
function _updateChartsForTheme(theme) {
    if (typeof Chart === 'undefined') return;
    applyChartDefaults();
    // Re-render de charts de Estadisticas si estan vivos
    if (typeof _estCharts !== 'undefined' && Object.keys(_estCharts).length > 0) {
        // Forzar re-render: destruir y volver a cargar la seccion
        const seccionEst = document.getElementById('estadisticas');
        if (seccionEst && seccionEst.classList.contains('active') && typeof cargarEstadisticas === 'function') {
            cargarEstadisticas();
        } else {
            // Si no esta visible, solo actualiza estilos cuando el usuario vuelva a entrar
            Object.values(_estCharts).forEach(c => {
                if (c && typeof c.update === 'function') c.update();
            });
        }
    }
    // Otros charts (ej. chartAsistencia del Dashboard)
    if (window._dashboardChart && typeof window._dashboardChart.update === 'function') {
        window._dashboardChart.update();
    }
}
```

Nota: si `cargarEstadisticas` se llama distinto, usar el nombre correcto. Buscar con `Grep pattern "function cargar.*stadistic" path Admin.js`.

- [ ] **Paso 5: Verificar**

1. Ir a Estadísticas en modo claro. Cargar gráficas.
2. Click toggle. Expected: las gráficas se re-renderizan con texto claro y grid sutil sobre fondo oscuro.
3. Click toggle de nuevo. Vuelven al modo claro.
4. Ir a Geocercas → modo oscuro → mapa cambia → ir a Estadísticas → gráficas oscuras → ir a Dashboard → todo coherente.

- [ ] **Paso 6: Commit**

```bash
git add Admin.js
git commit -m "Modo noche: Chart.js con colores del tema"
```

---

### Tarea 4.3: Revisión final completa

**Files:** ninguno (testing manual + ajustes puntuales).

- [ ] **Paso 1: Recorrido final exhaustivo**

Recargar en modo oscuro. Ir a cada sección:

- [ ] Dashboard → stat-cards, alertas, chartAsistencia (si tiene)
- [ ] Empleados → tabla, filtros, alta de empleado completa (probar tutorial)
- [ ] Horarios → tabla, edición
- [ ] Registros → tabla, filtros, exportar
- [ ] Justificaciones → tabla, modal de detalle
- [ ] Vacaciones → 3 tabs, calendario, modal de solicitud
- [ ] Absentismo → tabla
- [ ] Estadísticas → las 5 gráficas (chartEdad, chartAntiguedad, chartIngresosMes, chartDepartamentos, chartAreas)
- [ ] Dispositivos PWA → tabla
- [ ] Geocercas → mapa con tile oscuro, marker visible, círculo de radio visible
- [ ] Configuración → formularios

- [ ] **Paso 2: Testing de toggle**

- [ ] Toggle desde Dashboard → todos los elementos cambian.
- [ ] Recargar página con tema oscuro → sin flash blanco.
- [ ] Recargar con tema claro → sin parpadeo.
- [ ] Atajo `Ctrl+Shift+D` funciona.
- [ ] Toggle estando en una sección con gráficas activas → re-render correcto.
- [ ] Toggle estando en Geocercas con mapa abierto → tile cambia sin recargar.
- [ ] `localStorage.removeItem('admin-theme')` y recargar → arranca en claro (default).

- [ ] **Paso 3: Contraste**

Verificar manualmente que se lee bien:
- Texto de stat-cards.
- Badges de estado en tablas.
- Labels de formularios.
- Texto en modales.
- Tooltips si los hay.

Si algo se ve bajo en contraste, ajustar la variable correspondiente en el bloque `html[data-theme="dark"]` o agregar override puntual.

- [ ] **Paso 4: Verificar que el modo claro NO se rompió**

Toggle de regreso a modo claro. Recorrer las mismas secciones. Expected: idéntico al original (pre-refactor).

- [ ] **Paso 5: Aplicar ajustes finales detectados**

Para cada inconsistencia, agregar override puntual al final de `Admin.css`. Documentar brevemente con comentario qué pantalla afecta.

- [ ] **Paso 6: Commit final**

```bash
git add Admin.css Admin.js
git commit -m "Modo noche: ajustes finales tras revision completa"
```

---

## Verificación de cierre

- [ ] El botón toggle está visible en el header en TODAS las secciones.
- [ ] `localStorage.admin-theme` persiste entre recargas.
- [ ] Sin flash blanco al recargar en modo noche.
- [ ] Las 11 secciones del sidebar se ven coherentes en ambos modos.
- [ ] Modales legibles en ambos modos.
- [ ] Inputs con texto y placeholder legibles en ambos modos.
- [ ] Mapa Leaflet con tile apropiado en cada modo.
- [ ] Gráficas Chart.js con texto y grid del tema actual.
- [ ] Atajo `Ctrl+Shift+D` funciona.
- [ ] El modo claro luce exactamente como antes del refactor.
- [ ] Sin errores en consola del navegador.
