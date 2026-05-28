# Control de Tablets — Diseño

**Fecha:** 2026-05-28
**Estado:** Aprobado para implementación
**Alcance:** Admin (`V2 checador-system ADMIN`) + Tablet (`v2 Checador-Tablet`) + migración Supabase

## Contexto y motivación

Hoy existe control granular sobre los dispositivos PWA de empleados (sección "Dispositivos PWA" en el admin: listar, filtrar, ver último uso, desvincular). No existe nada equivalente para las tablets físicas que viven en cada sucursal.

Las tablets hoy tienen:

- `TABLET_CONFIG.id` y `TABLET_CONFIG.location` **hardcodeados** en `app.js`.
- Códigos de acceso **hardcodeados** en un array `CODIGOS_VALIDOS = ['1810']`.
- `verificarAuth()` **siempre devuelve true** (modo prueba), de hecho saltándose el login.
- Existe una tabla `tablet_access_codes` creada por un script suelto (`database-setup-tablet-codes.sql`), pero **ningún código del cliente la consulta**.

Esto significa que no hay forma de:

1. Saber desde el admin qué tablets están vinculadas, dónde, y cuándo se usaron por última vez.
2. Impedir que una tablet específica registre checadas sin tocar archivos en el dispositivo.

## Objetivos

1. **Inventario visible** — ver desde el admin todas las tablets, su sucursal, último uso y conteo de checadas del día.
2. **Bloqueo remoto** — el superadmin puede bloquear/desbloquear una tablet desde el admin y eso impide que registre checadas inmediatamente (verificado en cada intento).
3. **Migración sin downtime** — las tablets en producción siguen funcionando tras desplegar, con un único re-login manual.

No-objetivos:

- No se introduce un modelo de auth nuevo. Sigue el patrón existente (anon key compartida, RLS sin user enforcement, validación en cliente).
- No se elimina nada físicamente. "Bloquear" es soft-delete.

## Modelo de datos

Nueva tabla `tablets` en Supabase. Reemplaza conceptualmente a `tablet_access_codes` (que queda huérfana, se elimina en migración posterior).

```sql
CREATE TABLE tablets (
  id BIGSERIAL PRIMARY KEY,
  tablet_id VARCHAR(50) NOT NULL UNIQUE,
  codigo VARCHAR(20) NOT NULL UNIQUE,
  nombre VARCHAR(100) NOT NULL,
  sucursal_codigo VARCHAR(20),
  activo BOOLEAN DEFAULT true,
  bloqueado_en TIMESTAMP,
  bloqueado_motivo TEXT,
  ultimo_uso TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_tablets_codigo ON tablets(codigo);
CREATE INDEX idx_tablets_activo ON tablets(activo);
```

Reglas:

- `tablet_id` es el identificador estable usado en `registros.tablet_id` (ej. `TABLET_01`). Inmutable después de crear.
- `codigo` es el PIN de acceso. Sirve a la vez como contraseña y como mecanismo de identificación: una tablet "es" su código. Cambiar el código en el admin equivale a revocar esa tablet.
- `activo = false` ⇒ tablet bloqueada. No se eliminan registros nunca.
- `ultimo_uso` se actualiza desde la tablet con cada checada exitosa.
- "Checadas hoy" NO se almacena; se calcula on-the-fly desde `registros` agrupando por `tablet_id`.

RLS (siguiendo patrón del proyecto):

- `SELECT`: público con anon key (la tablet valida su código sin estar logueada).
- `INSERT / UPDATE`: público con anon key. El control de quién puede invocarlo se hace en el cliente del admin (chequeo `isSuperadmin()` antes de mostrar UI y antes de cada llamada).

## Flujo en la tablet

### Primera apertura (sin vinculación previa)

1. Pantalla de login actual (ya existe en `Index.html`), pero el código se valida contra `tablets.codigo` en Supabase en lugar del array hardcodeado.
2. Si el código existe y `activo=true`:
   - Guarda en `localStorage`: `tablet_id`, `tablet_codigo`, `tablet_nombre`, `tablet_sucursal`.
   - Actualiza `TABLET_CONFIG.id` y `TABLET_CONFIG.location` en memoria desde estos valores.
   - Muestra `mainContent`.
3. Si el código no existe → mensaje "Código inválido".
4. Si existe pero `activo=false` → mensaje "Esta tablet está desactivada. Contacta al administrador".

### Aperturas siguientes

1. Lee `tablet_id` y `tablet_codigo` de `localStorage`.
2. Llama a `TabletAuthAPI.verificarVigencia(tablet_id, codigo)` antes de mostrar `mainContent`.
3. Si la verificación falla (tablet bloqueada o código cambiado) → borra `localStorage` y vuelve a login con mensaje correspondiente.
4. Si la verificación falla por **error de red** (no por respuesta negativa de Supabase): se permite continuar con la sesión guardada y mostrar `mainContent`. La verificación se reintenta en cada checada — si para entonces ya hay red y la tablet está bloqueada, se bloquea ahí. Esto evita que un corte de red momentáneo deje la tablet inutilizable durante el día.

### Cada checada

1. Antes del `INSERT` en `registros` (en `supabase-config.js`, ~línea 262), llama a `TabletAuthAPI.verificarVigencia(tablet_id, codigo)` con el código guardado en `localStorage`.
2. Si `activo=false` → retorna `{ success: false, message: 'Tablet bloqueada por el administrador', blocked: true }`. El handler de UI muestra el mensaje y vuelve a la pantalla de login.
3. Si `activo=true` → procede con el insert y luego actualiza `tablets.ultimo_uso = NOW()` con un update separado (fire-and-forget, no bloqueante).

### Configuración / cerrar sesión

- Botón "Cerrar sesión / Cambiar tablet" en la pantalla de Configuración existente.
- Borra `localStorage` y vuelve a login. Útil para reasignar físicamente una tablet a otra ubicación.

### Código a eliminar

- `TABLET_CONFIG.id` hardcodeado (sustituido por valor cargado de `localStorage`).
- `TABLET_CONFIG.location` hardcodeado (sustituido por `sucursal_codigo` de BD).
- Array `CODIGOS_VALIDOS = ['1810']` (sustituido por validación contra BD).
- El bypass de `verificarAuth()` que siempre devuelve `true` (se reemplaza por validación real).

## Sección de administración

Nueva sección `id="tablets"` en `Index.html` del admin, visible **solo para superadmin** (mismo patrón que Geocercas). Aparece en el sidebar como nuevo `<a data-section="tablets">` con ícono.

### Tabla principal

Columnas:

| Columna | Origen | Notas |
|---|---|---|
| ID Tablet | `tablets.tablet_id` | |
| Nombre | `tablets.nombre` | |
| Sucursal | `tablets.sucursal_codigo` | |
| Código | `tablets.codigo` | Mostrado como `••••` con botón "ojo" para revelar |
| Último uso | `tablets.ultimo_uso` | Formato relativo (Hoy 14:32, Ayer 18:00, ...) |
| Hoy | `count(registros) WHERE fecha_hora >= hoy GROUP BY tablet_id` | Calculado al cargar |
| Estado | derivado de `activo` | Badge "Activa" (verde) / "Bloqueada" (rojo) con tooltip mostrando `bloqueado_motivo` |
| Acciones | — | `[Bloquear]` o `[Desbloquear]` según estado, más `[Editar]` |

### Toolbar

- Botón `[+ Nueva tablet]` (arriba a la derecha del card).
- Botón `[↻ Actualizar]`.
- Input de búsqueda por nombre o código.
- Checkbox "Solo activas" (marcado por defecto).

Reusa los estilos `.disp-toolbar`, `.disp-search`, `.disp-toggle`, `.disp-badge.activo`, `.disp-badge.inactivo` ya existentes para la sección de Dispositivos PWA, para mantener consistencia visual.

### Modales

**Nueva tablet / Editar tablet** (un solo modal, modo según contexto):

- Campos:
  - `tablet_id` (texto, solo lectura al editar)
  - `nombre` (texto)
  - `sucursal_codigo` (dropdown poblado desde tabla `sucursales`)
  - `codigo` (texto, validación de unicidad)
- Botón "Generar código" que sugiere un código aleatorio de 4-6 dígitos/letras.

**Confirmar bloqueo:**

- Texto: "¿Bloquear la tablet `TABLET_01`? No podrá registrar checadas hasta que la desbloquees."
- Campo opcional: "Motivo del bloqueo" (textarea, se guarda en `bloqueado_motivo`).

**Confirmar desbloqueo:**

- Texto simple: "¿Desbloquear `TABLET_01`?".
- Al confirmar: `activo=true`, `bloqueado_en=null`, `bloqueado_motivo=null`.

No hay modal de eliminación. El bloqueo es el equivalente a dar de baja.

## API

### Admin — `TabletsAPI` en `Admin.js`

Paralelo a `DispositivosAPI` existente.

```js
TabletsAPI = {
  listar({ soloActivos, busqueda })   // → tablets[] con campo "checadas_hoy"
  crear({ tablet_id, codigo, nombre, sucursal_codigo })
  actualizar(id, { codigo, nombre, sucursal_codigo })
  bloquear(id, motivo)
  desbloquear(id)
}
```

`listar()` ejecuta dos queries en paralelo:

1. `SELECT * FROM tablets [WHERE activo=true] [con filtro de búsqueda en nombre/codigo]`
2. `SELECT tablet_id, count(*) FROM registros WHERE fecha_hora >= start_of_today GROUP BY tablet_id`

Las une en memoria para llenar `checadas_hoy`.

`bloquear()` hace `UPDATE tablets SET activo=false, bloqueado_en=NOW(), bloqueado_motivo=$1, updated_at=NOW() WHERE id=$2`.

`desbloquear()` hace `UPDATE tablets SET activo=true, bloqueado_en=null, bloqueado_motivo=null, updated_at=NOW() WHERE id=$1`.

### Tablet — `TabletAuthAPI` en `supabase-config.js`

```js
TabletAuthAPI = {
  validarCodigo(codigo)                       // → { ok, tablet_id, nombre, sucursal_codigo } | { ok:false, motivo }
  verificarVigencia(tablet_id, codigo)        // → { activo: boolean, motivo?: string }
  registrarUso(tablet_id)                     // → fire-and-forget update de ultimo_uso
}
```

`validarCodigo()`: `SELECT id, tablet_id, nombre, sucursal_codigo, activo FROM tablets WHERE codigo=$1`. Si no existe o `activo=false`, retorna error con el motivo apropiado.

`verificarVigencia()`: `SELECT activo, bloqueado_motivo FROM tablets WHERE tablet_id=$1 AND codigo=$2`. Recibe el código guardado en `localStorage` además del `tablet_id` para que cambiar el código en el admin equivalga a revocar la tablet. Casos de retorno:
- Fila encontrada y `activo=true` → `{activo:true}`.
- Fila encontrada y `activo=false` → `{activo:false, motivo:'bloqueada'}` con `bloqueado_motivo` si existe.
- Sin fila (código cambiado o registro inexistente) → `{activo:false, motivo:'codigo-cambiado'}`.

`registrarUso()`: update no bloqueante; si falla por red no interrumpe el flujo de checada.

## Permisos

Solo superadmin puede ver y operar la sección "Tablets" en el admin. Esto se implementa de dos formas (mismo patrón que Geocercas):

1. El link del sidebar y la sección se ocultan si no es superadmin.
2. Las funciones de `TabletsAPI` chequean `isSuperadmin()` antes de ejecutar (defensa en profundidad).

## Plan de migración

Sin downtime. Despliegue en este orden:

1. **Migración SQL** (`supabase/migrations/2026-05-28_tablets.sql`):
   - Crea tabla `tablets`.
   - Seed inicial con las tablets actuales: `(tablet_id='TABLET_01', codigo='1810', nombre='Tablet Principal', sucursal_codigo='PTRN01', activo=true)` y cualquier otra que esté en uso.
   - No toca `tablet_access_codes` (queda huérfana, se elimina manualmente más tarde).

2. **Despliegue del admin:**
   - Nueva sección "Tablets" visible para superadmin.
   - El superadmin ve las tablets sembradas y puede empezar a ajustarles nombres y configurarlas.

3. **Despliegue del cliente tablet:**
   - Las tablets actuales no tienen `tablet_id` en `localStorage` (nunca lo guardaron antes).
   - Al abrir la nueva versión, muestran login pidiendo código.
   - El operador ingresa el código actual (`1810`) → la tablet valida contra BD → encuentra el registro sembrado → guarda en `localStorage` → funciona normalmente.
   - **Sin reconfiguración de archivos en el dispositivo**, solo un login manual una vez.

## Edge cases

- **Tablet sin conexión al arrancar (primer login):** sin red no puede validar el código contra BD. Muestra mensaje "Sin conexión, intenta de nuevo" y se queda en pantalla de login. No hay forma de vincular una tablet nueva sin red.
- **Tablet sin conexión al arrancar (sesión guardada):** si `localStorage` ya tiene `tablet_id` y `tablet_codigo`, y la verificación de vigencia falla por red (no por respuesta negativa de Supabase), se asume válida y se muestra `mainContent`. Las checadas se siguen registrando localmente y se sincronizarán cuando vuelva la red (mismo comportamiento que hoy). En cada checada se reintenta la verificación; si para entonces hay red y la tablet está bloqueada, se aplica el bloqueo en ese momento.
- **Cambio de código mientras la tablet está activa:** en su siguiente `verificarVigencia()` (próxima checada o reload), la query con el código viejo no encuentra fila → retorna `{activo:false, motivo:'codigo-cambiado'}` → se borra `localStorage` y vuelve a login con mensaje "El código fue actualizado por el administrador".
- **Tablet bloqueada mid-uso:** en la siguiente checada, `verificarVigencia()` retorna `activo=false`, el handler de UI muestra mensaje y fuerza vuelta a login.
- **Dos tablets con mismo `tablet_id` o `codigo`:** la BD lo rechaza por las constraints UNIQUE.
- **Sucursal eliminada:** `sucursal_codigo` queda apuntando a un código inexistente. Mostrar "(sucursal no encontrada)" en la tabla. No bloquea operación de la tablet.

## Resumen de cambios por archivo

**Repo admin (`V2 checador-system ADMIN`):**

- `supabase/migrations/2026-05-28_tablets.sql` — nueva migración (crear tabla + seed).
- `Index.html` — nueva sección `#tablets` + link en sidebar (condicional a superadmin) + modales.
- `Admin.js` — `TabletsAPI` + funciones de UI (`cargarTablets`, modales, handlers de bloqueo/edición).
- `Admin.css` — estilos específicos si los hay (preferir reusar `.disp-*` existentes).

**Repo tablet (`v2 Checador-Tablet`):**

- `app.js` — eliminar `TABLET_CONFIG.id/location` y `CODIGOS_VALIDOS` hardcodeados; reescribir `verificarAuth()`, `handleAuth()`, `setupTablet()` para usar valores de `localStorage` cargados desde BD; agregar verificación de vigencia al arrancar y antes de cada checada; agregar botón "Cerrar sesión" en Configuración.
- `supabase-config.js` — `TabletAuthAPI` + integración con el flujo de `INSERT` en `registros` (verificación previa + update de `ultimo_uso`).
