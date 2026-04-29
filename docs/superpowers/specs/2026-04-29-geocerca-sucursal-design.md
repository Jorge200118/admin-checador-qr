# Geocerca por sucursal — diseño

## Contexto

Hoy la PWA del checador personal (`V3 Checador-PWA`) captura GPS (`latitud`, `longitud`) en cada registro de entrada/salida y lo guarda en `registros`, pero **no valida** que el empleado esté físicamente cerca de su sucursal. La decisión original (ver `2026-04-23-pwa-checador-personal-design.md`) fue dejar el GPS solo como auditoría para evitar fricción.

Se quiere ahora **bloquear** los registros desde la PWA cuando el empleado está fuera del radio de su sucursal, empezando por **MATRIZ** (Aceros del Pacífico Los Mochis). El sistema debe ser configurable por sucursal y solo aplica a empleados cuya sucursal tenga la geocerca activa.

## Objetivo

Permitir al superadmin definir una geocerca circular (centro + radio) por sucursal en el admin, y que la PWA bloquee el registro cuando el empleado intenta checar fuera del radio de su sucursal asignada.

## No-objetivos (YAGNI)

- **No bloqueo en la tablet** — la tablet está físicamente en la sucursal, no aplica.
- **No alertas push al admin** cuando alguien intenta checar fuera.
- **No historial de cambios de geocerca** (solo `actualizado_en` / `actualizado_por` de la última edición).
- **No múltiples geocercas por sucursal** (no zonas separadas estacionamiento/planta/bodega).
- **No polígonos** — solo círculo.
- **No buscador de direcciones / geocoding inverso** en el mapa.
- **No tabla de auditoría** de intentos rechazados.
- **No migración del catálogo `SUCURSALES_LIST`** a leerse desde BD — sigue hardcoded en `Admin.js:467` como hoy.
- **No edición de geocerca para admins de sucursal** — solo superadmin, aunque el admin de MATRIZ podría editar la suya, queda fuera de alcance.
- **No cache de la geocerca en la PWA** — cada check hace una lectura (1 fila, despreciable).

## Decisiones de diseño y por qué

- **Bloquear vs. marcar**: el usuario eligió bloquear. La PWA aborta el registro si está fuera del radio.
- **Solo aplica si `geocerca_activa = true`**: empleados de sucursales sin geocerca configurada o con la geocerca apagada no se ven afectados — comportamiento actual sin cambios.
- **Tabla nueva `sucursales`** (vs. tabla `configuracion` con una sola fila): el mismo trabajo y deja la puerta abierta a expandir a otras sucursales sin migración.
- **Círculo (centro + radio)** vs. polígono: la planta de MATRIZ es un terreno cuadrado/rectangular, un radio holgado de 150-200m cubre toda la propiedad. Polígono es overkill y más doloroso de mantener.
- **Mapa Leaflet** vs. inputs de lat/lng a mano: configuras una vez pero ajustas varias (cuando un empleado reporte "no me deja", quieres mover el pin/radio rápido sin sacar coords manualmente). Leaflet pesa ~40KB, sin API key, OpenStreetMap como tiles.
- **Solo superadmin** puede ver y editar la pantalla de Geocercas. Patrón existente: `window.isSuperAdmin === true` (`Admin.js:135`).
- **Lectura de `sucursales` por anon en RLS**: la PWA usa el `anon key` y necesita leer la geocerca para validar antes de checar. Datos no sensibles (equivalentes a una dirección pública).
- **Escritura protegida en UI, no en RLS**: el proyecto no usa Supabase Auth real (login casero contra `usuarios_sucursal`, ver `supabase-config.js:927-932`). La protección queda a nivel de UI (solo superadmin ve el botón) — coherente con el resto del admin. Cuando migren a Supabase Auth, se endurece.
- **Margen de tolerancia con `accuracy` del GPS**: si el GPS reporta ±N metros de imprecisión, la validación usa `distancia - accuracy <= radio_metros` para evitar rechazos injustos en lugares con techo de lámina o mala señal.
- **Fail-closed en error de red**: si la PWA no puede leer `sucursales`, **aborta el check** con error. NO fail-open (que dejaría pasar todo si alguien tira la red para evadir).
- **Validación después de tomar la foto** (no antes): hoy foto + GPS van en paralelo. Cambiar el orden agrega latencia/UX. Si el empleado está fuera, pierde unos segundos tomando la foto pero no se inserta nada — costo aceptable para no rediseñar el flujo.
- **Default `radio_metros = 150`**: cubre planta industrial promedio incluyendo estacionamiento.

## Arquitectura

```
┌─────────────────────────┐         ┌──────────────────────────┐
│  Admin (V2)             │         │  Supabase                │
│                         │         │                          │
│  Pantalla "Geocercas"   │ UPDATE  │  Tabla sucursales        │
│  - Lista sucursales     │────────▶│   nombre, lat, lng,      │
│  - Modal con mapa       │         │   radio_metros,          │
│    Leaflet              │         │   geocerca_activa        │
│  Solo superadmin        │         │                          │
└─────────────────────────┘         └──────────────────────────┘
                                              ▲
                                              │ SELECT (anon)
┌─────────────────────────┐                   │
│  PWA (V3)               │                   │
│                         │                   │
│  views/captura.js       │                   │
│  1. foto + GPS paralelo │───────────────────┘
│  2. valida geocerca     │
│  3. inserta registro    │
└─────────────────────────┘
```

## Esquema de BD

Migración nueva: `supabase/migrations/2026-04-29_sucursales_geocerca.sql`

```sql
CREATE TABLE sucursales (
    id SERIAL PRIMARY KEY,
    nombre TEXT UNIQUE NOT NULL,        -- 'MATRIZ', 'LA PAZ', etc. — debe coincidir con empleados.sucursal
    latitud NUMERIC(10,7),              -- null hasta que superadmin la configure
    longitud NUMERIC(10,7),
    radio_metros INTEGER DEFAULT 150,
    geocerca_activa BOOLEAN DEFAULT false,
    actualizado_en TIMESTAMPTZ DEFAULT now(),
    actualizado_por TEXT                -- username del superadmin que guardó
);

INSERT INTO sucursales (nombre) VALUES
    ('MATRIZ'), ('LA PAZ'), ('SAN JOSE'), ('TAMARAL'),
    ('CABOS'), ('EL FUERTE'), ('JUAN JOSE RIOS'), ('CULIACAN');

ALTER TABLE sucursales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon read sucursales"
    ON sucursales FOR SELECT
    TO anon
    USING (true);

-- Sin política de INSERT/UPDATE/DELETE para anon → escrituras desde el admin solamente
-- (con la auth actual basada en username, la protección efectiva está en UI; el RLS bloquea
-- escrituras con la anon key directamente).
```

**Notas:**
- `nombre` une con `empleados.sucursal` por string. **No FK** — para no romper filas viejas si el catálogo cambia. Es el patrón actual.
- `radio_metros` entero — no hace falta precisión sub-metro.
- Validación lat/lng presente cuando `geocerca_activa = true` se hace en UI (botón "Activar" deshabilitado sin pin), no como CHECK constraint, para evitar errores de orden de UPDATE.

## UI del admin — pantalla "Geocercas"

### Visibilidad

- Item nuevo "Geocercas" en el sidebar, mostrado solo si `window.isSuperAdmin === true`.
- Si un usuario no-superadmin abre la pantalla por hot-link, muestra "No tienes permisos" y no carga el mapa.

### Lista de sucursales

Tabla con columnas:
- **Sucursal** (nombre)
- **Estado** — badge verde "Activa" / gris "Inactiva"
- **Coordenadas** — `19.4326, -99.1332` o `—` si null
- **Radio** — `150 m` o `—`
- **Última actualización** — fecha + username
- **Acciones** — botón "Editar" + toggle activar/desactivar (deshabilitado si no hay coordenadas)

### Modal de edición

Al darle "Editar" se abre un modal con:

- **Mapa Leaflet** centrado:
  - Si la sucursal ya tiene coords → centrado ahí, con marker y círculo dibujado.
  - Si no tiene coords → centrado en Los Mochis para MATRIZ, en México genérico para las demás.
- **Interacción**:
  - Clic en mapa → coloca/mueve el marker, redibuja el círculo con el radio actual.
  - Slider de radio: rango **50-500m**, paso **10m**, label en vivo "Radio: 150 m". Mover el slider redimensiona el círculo en tiempo real.
  - Botón pequeño "Mi ubicación" (esquina del mapa): usa `navigator.geolocation.getCurrentPosition()` para centrar el mapa donde está parado el superadmin (útil cuando configura desde la planta).
  - Inputs lat/lng debajo del mapa (read/write, sincronizados con el marker): permiten pegar coords desde Google Maps si se prefiere a clic en mapa. Editar el input mueve el marker y viceversa.
- **Toggle "Geocerca activa"** dentro del modal. Deshabilitado con tooltip "Pon primero el pin en el mapa" si no hay coords.
- **Footer**:
  - Cancelar → cierra sin guardar.
  - Guardar → valida que haya pin si `activa=true`, hace UPDATE, escribe `actualizado_por = window.currentUsername`, cierra modal y refresca lista.
- **Confirm al activar**: si al guardar `geocerca_activa` cambió de `false` a `true`, mostrar:
  > *"Vas a bloquear los registros de la PWA fuera del radio para empleados de {SUCURSAL}. ¿Continuar?"*

### Dependencias nuevas (admin)

- Leaflet 1.9.4 vía CDN: JS (~40KB) + CSS (~14KB).
- Tiles: OpenStreetMap (gratis, sin API key, atribución la pone Leaflet por default).
- Cargar lazy solo cuando se entra a la pantalla de Geocercas (para no inflar el bundle inicial del admin).

## Validación en la PWA

### Cambios en `V3 Checador-PWA/supabase-config.js`

Método nuevo:

```js
async getGeocercaSucursal(nombreSucursal) {
    const { data, error } = await supabaseClient
        .from('sucursales')
        .select('latitud, longitud, radio_metros, geocerca_activa')
        .eq('nombre', nombreSucursal)
        .single();
    if (error) return { success: false };
    return { success: true, data };
}
```

### Cambios en `V3 Checador-PWA/views/captura.js`

Insertar validación entre el `Promise.all([countdownAndCapture, getGPS])` y `enviar()`:

```
1. const [fotoBase64, coords] = await Promise.all([foto, GPS])  // igual que hoy
2. const empleado = getEmpleadoFromLocalStorage()  // ya existe
3. if (!empleado.sucursal) → continúa al paso 7 (sin validar)
4. const geo = await getGeocercaSucursal(empleado.sucursal)
   - si falla la consulta → ABORTA con "No se pudo verificar tu ubicación..."
5. if (geo.data.geocerca_activa === false) → continúa al paso 7
6. Calcula distancia Haversine entre coords y (geo.data.latitud, geo.data.longitud)
   - if (distancia - coords.accuracy > geo.data.radio_metros) → ABORTA con
     "Estás a {Math.round(distancia)} m de {SUCURSAL}. Acércate para poder checar."
7. enviar()  // igual que hoy
```

### Casos borde

| Situación | Comportamiento |
|---|---|
| Empleado sin sucursal asignada (`null`) | Salta validación, deja pasar |
| Sucursal del empleado no existe en tabla `sucursales` | Salta validación, deja pasar (se asume mal-config admin) |
| Geocerca de la sucursal apagada | Salta validación, deja pasar |
| Error de red al leer `sucursales` | Aborta con "No se pudo verificar tu ubicación, intenta de nuevo" (fail-closed) |
| GPS impreciso (`accuracy` grande) | Margen de tolerancia: pasa si `distancia - accuracy <= radio` |
| Sin GPS / permiso GPS denegado | Comportamiento actual (error genérico de GPS), sin cambio |
| Superadmin desactiva geocerca | Próximo check ya no valida (sin cache, inmediato) |
| Superadmin mueve el pin con gente en planta | Próximo check usa la nueva geocerca; algunos pueden quedar fuera (responsabilidad del superadmin) |

### Mensajes en la PWA (texto exacto)

- Fuera de zona: `"Estás a {N} m de {SUCURSAL}. Acércate para poder checar."`
- Error al leer sucursales: `"No se pudo verificar tu ubicación. Revisa tu internet e intenta de nuevo."`
- Sin GPS / permiso denegado: el mensaje actual de la PWA (no se cambia).

## Permisos

| Rol | Ver pantalla Geocercas | Editar geocerca | Ver registros bloqueados |
|---|---|---|---|
| superadmin | ✅ | ✅ | N/A (no hay registros bloqueados; se abortan en cliente) |
| admin (cualquier sucursal) | ❌ | ❌ | N/A |
| usuario | ❌ | ❌ | N/A |

## Archivos afectados

**Admin (V2 checador-system ADMIN):**
- `supabase/migrations/2026-04-29_sucursales_geocerca.sql` — nuevo
- `Index.html` — agregar item de sidebar "Geocercas" (oculto si no superadmin) + sección de la pantalla + modal del mapa
- `Admin.css` — estilos del modal/mapa (mínimo)
- `Admin.js` — lógica de la pantalla: cargar lista, abrir modal, inicializar Leaflet, guardar
- `supabase-config.js` — métodos `getSucursales()`, `updateSucursalGeocerca(id, data)` en `SupabaseAPI`

**PWA (V3 Checador-PWA):**
- `supabase-config.js` — método `getGeocercaSucursal(nombre)` en `SupabaseAPI`
- `views/captura.js` — insertar validación de geocerca entre captura y `enviar()` + función `haversine(lat1,lng1,lat2,lng2)` (~10 líneas)

## Riesgos

- **Empleados con techo de lámina / GPS malo**: el margen `accuracy` ayuda, pero en casos extremos (`accuracy > 200m`) puede dar pasada cualquier ubicación. Aceptable: el caso peor es como hoy (sin geocerca).
- **Superadmin pone radio muy chico**: empleados que ya están en la planta no pueden checar. Mitigación: confirm al activar + radio default holgado de 150m.
- **Cambio de catálogo de sucursales**: si alguien edita `SUCURSALES_LIST` en `Admin.js:467` sin agregar fila a la tabla `sucursales`, los empleados de esa sucursal nueva caen al caso "sucursal no existe → deja pasar". Mitigación: documentar que ambos lugares deben actualizarse en paralelo (no es alcance arreglarlo de raíz).

## Plan de rollout

1. Aplicar migración → tabla creada con todas las sucursales en `geocerca_activa = false`.
2. Desplegar admin con la pantalla de Geocercas.
3. Superadmin configura la geocerca de MATRIZ (pin + radio) **con `geocerca_activa = false` primero** y verifica visualmente.
4. Desplegar PWA con la validación.
5. Superadmin activa la geocerca de MATRIZ. A partir de ese momento, empleados de MATRIZ que checan desde la PWA fuera del radio son bloqueados.
6. Otras sucursales: configurar después según se necesite, una por una.
