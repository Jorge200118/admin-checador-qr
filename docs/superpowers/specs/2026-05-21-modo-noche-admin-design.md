# Modo Noche para el Panel Admin

**Fecha:** 2026-05-21
**Estado:** Diseño aprobado, pendiente plan de implementación

## Contexto y motivación

El panel admin (`Index.html` + `Admin.css` + `Admin.js`) actualmente solo tiene tema claro. Sesiones largas de uso causan fatiga visual al usuario principal (Jorge). Se requiere un modo noche completo, bien hecho, no un override rápido.

El admin tiene 11 secciones: Dashboard, Empleados, Horarios, Registros, Justificaciones, Vacaciones, Absentismo, Estadísticas, Dispositivos PWA, Geocercas (con mapa Leaflet), Configuración. Incluye múltiples modales, formularios complejos, tablas grandes y al menos un mapa.

## Decisiones de alcance

**Alcance:** Modo noche completo y pulido (no override rápido, no parcial). El `Admin.css` actual (2679 líneas) tiene colores hardcodeados en todos lados sin variables CSS — se refactoriza a variables.

**Toggle:** Botón en el header (luna/sol) + persistencia en `localStorage`. Sin auto-switch por hora, sin `prefers-color-scheme`.

**Default:** Modo claro si no hay nada guardado en `localStorage` (no asustar a usuarios que no lo pidieron).

**Paleta:** Inspirada en BotSucursales (azul oscuro `#1e3a5f → #0d1b2a`), extendida a todo el panel.

**Edge cases:** Todo en modo noche — incluye mapas Leaflet (tiles oscuros), gráficas (colores adaptados), modales, formularios, scrollbars.

**Fuera de alcance:**
- `login-sucursal.html` y `guia-visual-alta-empleados.html` (páginas separadas, exposición breve).
- Auto-switch por hora del día.
- Sincronización con `prefers-color-scheme` del SO.
- Múltiples temas (high contrast, sepia, etc.).
- Animar la transición entre modos.

## Arquitectura técnica

**Estrategia: variables CSS + atributo `data-theme` en `<html>`.**

- `Admin.css` refactorizado para que todos los colores usen `var(--xxx)`.
- Dos sets de variables: uno en `:root` (claro, valores actuales) y otro en `html[data-theme="dark"]` (oscuro).
- Un solo archivo CSS — no hay `dark.css` separado.
- Script JS pequeño en `Admin.js` para inicializar y togglear.
- Script inline en `<head>` de `Index.html` (ANTES de cargar `Admin.css`) que lee `localStorage` y aplica `data-theme` inmediatamente, para evitar el flash blanco al recargar en modo noche.

**Razones:**
- Un solo punto de verdad para colores (las variables CSS).
- Sin flash blanco al cargar en modo oscuro.
- Cero impacto en performance — solo se cambia el atributo, el navegador hace el resto.
- Fácil mantener: cambiar el azul oscuro es 1 línea, no buscar/reemplazar en 2679 líneas.

## Variables CSS

Variables **semánticas** (por uso, no por color) para facilitar ajustes futuros:

### Superficies y texto
- `--bg-app` — fondo general del panel
- `--bg-surface` — cards, modales, tablas
- `--bg-elevated` — hover de cards, dropdowns, tooltips
- `--bg-input` — inputs, selects, textareas
- `--text-primary` — texto principal
- `--text-secondary` — labels, descripciones, metadata
- `--text-muted` — placeholders, texto deshabilitado
- `--border` — bordes de cards, inputs, separadores
- `--border-strong` — bordes más visibles (focus, hover)

### Sidebar
- `--sidebar-bg`
- `--sidebar-text`
- `--sidebar-text-active`
- `--sidebar-item-hover`
- `--sidebar-item-active`

### Acentos (mismos en ambos modos, ajustados para contraste)
- `--accent-primary` — azul
- `--accent-success` — verde
- `--accent-warning` — amarillo
- `--accent-danger` — rojo
- `--accent-info` — cyan

### Sombras
- `--shadow-sm`, `--shadow-md` — más sutiles en oscuro

## Paleta de valores

### Modo claro (valores actuales extraídos a variables)

| Variable | Valor |
|---|---|
| `--bg-app` | `#f1f5f9` |
| `--bg-surface` | `#ffffff` |
| `--bg-elevated` | `#f8fafc` |
| `--bg-input` | `#ffffff` |
| `--text-primary` | `#1e293b` |
| `--text-secondary` | `#475569` |
| `--text-muted` | `#94a3b8` |
| `--border` | `#e2e8f0` |
| `--border-strong` | `#cbd5e1` |
| `--sidebar-bg` | `#0f172a` (sólido actual) |
| `--accent-primary` | `#3b82f6` |
| `--accent-success` | `#22c55e` |
| `--accent-warning` | `#f59e0b` |
| `--accent-danger` | `#ef4444` |
| `--shadow-md` | `0 1px 3px rgba(0,0,0,0.1)` |

### Modo noche (paleta BotSucursales extendida)

| Variable | Valor |
|---|---|
| `--bg-app` | `#0d1b2a` |
| `--bg-surface` | `#13263d` |
| `--bg-elevated` | `#1e3a5f` |
| `--bg-input` | `#0a1622` |
| `--text-primary` | `#e8eef5` (no `#fff` puro) |
| `--text-secondary` | `#94a8c4` |
| `--text-muted` | `#6b829e` |
| `--border` | `#1e3a5f` |
| `--border-strong` | `#2a4a73` |
| `--sidebar-bg` | `linear-gradient(180deg, #1e3a5f 0%, #0d1b2a 100%)` |
| `--accent-primary` | `#60a5fa` (más claro para contraste) |
| `--accent-success` | `#34d399` |
| `--accent-warning` | `#fbbf24` |
| `--accent-danger` | `#f87171` |
| `--shadow-md` | `0 2px 8px rgba(0,0,0,0.4)` |

Todos los acentos en modo noche cumplen WCAG AA (contraste ≥4.5:1 sobre `--bg-surface`).

## Toggle UI y persistencia

**Botón:**
- Ubicación: dentro de `.user-info` en el header, **antes** del nombre del usuario.
- Forma: botón redondo ~36px con icono FontAwesome (`fa-moon` en claro, `fa-sun` en oscuro).
- Hover: leve highlight, tooltip "Modo noche" / "Modo claro".
- Atajo de teclado opcional: `Ctrl+Shift+D` para alternar.

**Persistencia:**
- Clave: `localStorage.setItem('admin-theme', 'dark' | 'light')`.
- Sin valor guardado → modo claro por defecto.

**Anti-flash:**
- Script inline en `<head>` de `Index.html`, ANTES del `<link rel="stylesheet" href="Admin.css">`:
  ```html
  <script>
    (function() {
      var t = localStorage.getItem('admin-theme');
      if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    })();
  </script>
  ```

## Casos especiales

### Mapas Leaflet (Geocercas)
- Modo claro: tiles actuales (OpenStreetMap estándar).
- Modo noche: **CartoDB Dark Matter** (`https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png`) — gratis, sin API key.
- Toggle dinámico: si el mapa ya está inicializado, remover el tile layer actual y agregar el nuevo. Si no existe todavía, solo guardar la preferencia para cuando se cree.

### Gráficas (Estadísticas)
- Identificar la librería en Fase 4 (probablemente Chart.js).
- Pasar colores del tema:
  - Texto de ejes/leyendas → `var(--text-secondary)`.
  - Líneas de grid → `var(--border)`.
  - Colores de datasets se mantienen (azul/verde/rojo siguen funcionando), ajustados ligeramente igual que los acentos.
- Si están renderizadas al togglear → re-render (`destroy()` + `new Chart()`).

### Modales y formularios
- Inputs: fondo `--bg-input` (más oscuro que la card que los contiene).
- Borde sutil `--border`, focus pasa a `--accent-primary`.
- Placeholders en `--text-muted`.
- `<select>` nativos: el dropdown que despliega lo controla el OS — queda con look del sistema. **Limitación aceptada.**

### Tablas
- Header con `--bg-elevated`.
- Filas alternadas: `--bg-surface` y mix con ~3% blanco.
- Hover visible pero no agresivo.

### Sidebar
- Modo claro: mantiene look actual (`#0f172a` sólido).
- Modo noche: gradient `#1e3a5f → #0d1b2a` (BotSucursales).

### Scrollbars (Webkit)
- Custom scrollbar oscuro en modo noche para evitar el gris claro de Windows.

### Tooltips / dropdowns / SweetAlert
- Si se usa SweetAlert, configurar tema dark cuando el modo está activo.
- Tooltips custom: adaptar en Fase 4 al revisar.

## Archivos afectados

| Archivo | Cambio | Magnitud |
|---|---|---|
| `Admin.css` | Refactor: extraer colores a variables + agregar bloque `html[data-theme="dark"]` | 2679 líneas revisadas (find-replace), +~200 líneas nuevas |
| `Index.html` | Script inline anti-flash en `<head>` + botón toggle en `.user-info` del header | ~15 líneas |
| `Admin.js` | `initTheme()`, listener del botón, lógica de re-render para mapas/gráficas | ~60 líneas nuevas |

**No se tocan:**
- Lógica de negocio (auth, supabase, vacaciones, etc.).
- Estructura del DOM (solo se agrega 1 botón).
- `vacaciones-*.js`, `login-sucursal.html`, `guia-visual-alta-empleados.html`, archivos de prueba/setup.

## Fases de implementación

### Fase 1: Infraestructura del toggle
- Script anti-flash en `<head>` de `Index.html`.
- Botón en `.user-info` del header con icono que cambia según estado.
- Función `initTheme()` en `Admin.js`: lee `localStorage`, aplica `data-theme`, conecta listener del botón.
- **Verificable:** el botón cambia el atributo `data-theme` en `<html>` y persiste al recargar (aunque visualmente nada cambie todavía).

### Fase 2: Variables CSS modo claro
- Refactor de `Admin.css` para que TODO use `var(--xxx)`.
- Mantiene los valores actuales (modo claro idéntico).
- **Verificable:** el panel se ve **idéntico** al actual. Cualquier diferencia visual = bug del refactor.

### Fase 3: Modo noche para chrome principal
- Agregar bloque `html[data-theme="dark"]` con paleta azul oscura.
- Cubre: body, sidebar, header, cards, tablas, formularios, modales, botones, badges, alerts.
- **Verificable:** togglear ya cambia todo el chrome a oscuro de forma consistente.

### Fase 4: Edge cases
- Mapas Leaflet: cambio de tiles dinámico.
- Gráficas: re-render con colores del tema.
- Scrollbars custom.
- Ajustes finales detectados al recorrer las secciones.
- **Verificable:** navegar las 11 secciones del sidebar en modo noche sin ver inconsistencias visuales.

## Plan de testing (manual)

- Recorrer las 11 secciones del sidebar en ambos modos.
- Abrir al menos 1 modal por sección que tenga modales.
- Probar formularios: inputs, selects, textareas, checkboxes, radios, date pickers.
- Toggle ida y vuelta sin recargar — no debe haber estado roto.
- Recargar página en modo noche → sin flash blanco.
- Revisar contraste de texto (WCAG AA mínimo) en cards de stats, badges de estado, alerts.
- Probar en pantalla normal y en modo de zoom 125%/150%.

## Riesgos conocidos

- **`<select>` nativos:** el dropdown desplegado lo controla el OS. Queda con look del sistema. Aceptado.
- **Librería de gráficas desconocida hasta Fase 4:** si no es Chart.js, ajustar approach. No bloquea el resto.
- **Colores inline en HTML** (`style="color: #fff"`): si los hay, detectar en Fase 2 y moverlos a CSS.
- **CDN Leaflet en modo offline:** si el panel se usa sin internet, los tiles oscuros no cargarán (igual que pasa con los actuales) — no es regresión.
