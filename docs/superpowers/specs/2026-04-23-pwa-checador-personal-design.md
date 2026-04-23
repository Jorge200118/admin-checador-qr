# PWA Checador Personal — Diseño

**Fecha:** 2026-04-23
**Autor:** Jorge
**Estado:** Propuesto

## Resumen

Crear una PWA (Progressive Web App) que cada empleado instala en su celular personal como **complemento** al sistema de checado en tablet física existente. El empleado usa la PWA para registrar entrada/salida desde su dispositivo, capturando foto selfie y ubicación GPS en cada check.

La tablet actual sigue operando sin cambios. La PWA añade una segunda vía de checado.

## Objetivos

- Proveer un método alternativo de checado que no dependa de la tablet compartida.
- Mantener las mismas reglas de validación de negocio que la tablet (consistencia).
- Capturar evidencia de identidad (foto) y contexto (GPS) en cada check.
- Control administrativo sobre qué dispositivo está vinculado a qué empleado.

## No-objetivos (YAGNI)

- **No** validación de geocerca (sucursal): el GPS se captura solo para auditoría, no se valida contra un radio.
- **No** modo offline: requiere internet obligatorio.
- **No** permitir múltiples dispositivos vinculados simultáneamente por empleado.
- **No** PIN en cada check: solo al vincular.
- **No** reemplazar la tablet; ambas coexisten.

## Contexto

El proyecto actual en `v2 Checador-Tablet` es una PWA que corre en una tablet fija con cámara, usa Supabase directo (sin backend), y valida QR impresos. El admin está en `V2 checador-system ADMIN`.

La nueva PWA se construirá como **proyecto hermano** (nueva carpeta, nuevos archivos), reusando la misma instancia de Supabase.

## Arquitectura

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  PWA Celular     │     │  Tablet (existe) │     │  Admin (existe)  │
│  (nuevo)         │     │                  │     │  + nueva vista   │
└────────┬─────────┘     └────────┬─────────┘     └────────┬─────────┘
         │                        │                        │
         └────────────────────────┴────────────────────────┘
                                  │
                           ┌──────▼──────┐
                           │  Supabase   │
                           │  (misma BD) │
                           └─────────────┘
```

**Stack PWA:** HTML + JS vanilla + Supabase JS SDK + Service Worker.
**Hosting:** Vercel (HTTPS gratis, requerido para cámara + GPS).
**Acceso inicial:** URL pública compartida por WhatsApp + QR físico pegado en instalaciones.

## Flujos de usuario

### Flujo 1 — Primer uso (vinculación)

1. Empleado abre URL de la PWA.
2. PWA detecta que no hay sesión en `localStorage` → muestra pantalla de vinculación.
3. Pide `codigo_empleado`.
4. Supabase valida que exista y esté activo (`empleados.activo = true`).
5. Supabase verifica que ese empleado **no tenga ya un dispositivo activo** vinculado. Si ya lo tiene, bloquea con mensaje: "Ya estás vinculado a otro dispositivo. Pide al administrador que lo desvincule."
6. Si pasa, PWA pide al empleado crear un PIN de 4 dígitos (y confirmarlo).
7. PWA genera un `device_id` (UUID v4) y lo guarda en `localStorage`.
8. PWA hashea el PIN (SHA-256 + salt) e inserta en `empleado_dispositivos`.
9. PWA pide permisos de cámara + GPS (obligatorios). Si el usuario los niega, muestra mensaje y no avanza.
10. PWA ofrece "Agregar a pantalla de inicio" (prompt nativo del navegador).
11. Redirige a pantalla principal.

### Flujo 2 — Check diario (entrada o salida)

1. Empleado abre la PWA. Tiene sesión → carga pantalla principal.
2. Pantalla principal muestra: nombre, foto de perfil, hora actual, último check ("Última entrada: hoy 8:02 ✓"), botones ENTRADA y SALIDA.
3. Empleado toca ENTRADA (o SALIDA).
4. PWA activa cámara frontal y GPS en paralelo.
5. Muestra preview de cámara por 2-3 segundos.
6. Toma foto automáticamente (sin botón de captura).
7. Valida reglas de negocio contra Supabase:
   - No 2 entradas seguidas.
   - No salida sin entrada previa.
   - No 2 salidas seguidas.
   - Bloque de horario válido (misma lógica que tablet).
8. Sube foto a Supabase Storage (`registros-fotos`).
9. Inserta registro en `registros` con: `empleado_id`, `tipo_registro`, `fecha_hora` (local sin TZ, como la tablet), `foto_registro` (URL), `latitud`, `longitud`, `origen = 'PWA'`, `tablet_id = 'PWA_<primeros-8-del-device_id>'` (para mantener el campo existente útil y trazar el origen cuando se ve el registro en el admin).
10. Muestra confirmación animada "✓ Entrada registrada 8:05".
11. Regresa a pantalla principal con "último check" actualizado.

### Flujo 3 — Consultar historial

1. Desde pantalla principal, empleado toca "Mi historial".
2. Query a Supabase: últimos 15 días de `registros` para ese `empleado_id`.
3. Lista agrupada por día, mostrando hora y tipo de cada check.

### Flujo 4 — Cambio de dispositivo (intento bloqueado)

1. Empleado instala PWA en celular nuevo (o limpia cache, o reinstala).
2. Flujo de vinculación (paso 3 del Flujo 1).
3. Supabase detecta que `empleado_dispositivos` ya tiene un registro con `activo = true` para ese empleado.
4. PWA rechaza con mensaje claro. Empleado contacta admin.

### Flujo 5 — Admin desvincula dispositivo

1. Admin abre sección nueva "Dispositivos PWA" en el panel admin.
2. Ve tabla con: empleado, fecha vinculación, último uso, user_agent resumido, botón "Desvincular".
3. Admin toca "Desvincular" → confirmación → update a `empleado_dispositivos` (`activo = false`, `desvinculado_por`, `desvinculado_en`).
4. Empleado ahora puede re-vincularse en su dispositivo (nuevo o reinstalación).

## Esquema de base de datos

### Tabla nueva: `empleado_dispositivos`

```sql
CREATE TABLE empleado_dispositivos (
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

CREATE INDEX idx_emp_disp_empleado_activo
    ON empleado_dispositivos(empleado_id, activo);
```

**Regla de unicidad:** solo un registro con `activo = true` por `empleado_id`. Se valida por query previa al insert (no por constraint, porque los desvinculados históricos deben conservarse).

### Cambios en `registros` (tabla existente)

Agregar columnas:
```sql
ALTER TABLE registros ADD COLUMN latitud numeric(10,7);
ALTER TABLE registros ADD COLUMN longitud numeric(10,7);
ALTER TABLE registros ADD COLUMN origen text DEFAULT 'TABLET';
-- valores esperados: 'TABLET' | 'PWA'
```

Los registros existentes quedan con `origen = 'TABLET'` por default.

## Estructura de archivos

```
V3 Checador-PWA/                      (nueva carpeta hermana)
├── index.html                        -- shell de la app, contenedor de vistas
├── manifest.json                     -- PWA config (name, icons, display)
├── sw.js                             -- Service Worker
├── styles.css                        -- estilos mobile-first
├── supabase-config.js                -- cliente Supabase + API helpers
├── app.js                            -- router simple, init, estado global
└── views/
    ├── vinculacion.js                -- pantalla de primer uso
    ├── principal.js                  -- pantalla con botones ENTRADA/SALIDA
    ├── captura.js                    -- cámara + GPS + envío de check
    └── historial.js                  -- últimos 15 días
```

**Módulos en `supabase-config.js`:**

- `AuthAPI`
  - `vincularDispositivo(codigoEmpleado, pin, deviceId, userAgent)`
  - `validarVinculacion(deviceId)` → devuelve empleado si el device_id está vinculado y activo
  - `existeDispositivoActivo(empleadoId)`

- `RegistroAPI` (reutiliza lógica existente de la tablet)
  - `validarRegistro(empleadoId, tipoRegistro)`
  - `getBloqueValido(horarioId, tipoRegistro)`
  - `crearRegistro(empleadoId, tipoRegistro, deviceId, bloqueId, fotoBase64, latitud, longitud)`
  - `uploadFoto(empleadoId, base64Data)`

- `HistorialAPI`
  - `getUltimosDias(empleadoId, dias = 15)`

## Cambios en Admin

Nueva vista en el menú: **"Dispositivos PWA"**.

### Tabla

| Empleado | Código | Fecha vinculación | Último uso | Dispositivo | Acción |
|----------|--------|-------------------|------------|-------------|--------|
| Juan Pérez | EMP001 | 2026-04-20 | hoy 8:02 | iPhone Safari | [Desvincular] |

### Filtros

- Buscador por nombre o código de empleado.
- Toggle "Mostrar desvinculados" (default: oculto).

### Acción "Desvincular"

Confirmación modal → marca `activo = false`, registra `desvinculado_por` (email del admin logueado) y `desvinculado_en`.

## Seguridad

- **PIN hasheado** client-side con SHA-256 + salt (salt único por registro, generado aleatoriamente en cliente).
- **HTTPS obligatorio** (requerido por cámara y GPS, Vercel lo provee automáticamente).
- **RLS en Supabase** para `empleado_dispositivos`:
  - Anon key puede insertar (con validación de empleado activo).
  - Anon key puede leer solo por `device_id` + PIN match.
  - Update de `activo = false` solo permitido si se respeta el esquema de auth actual del admin (a revisar: si el admin hoy opera con anon key como tablet/PWA, la restricción será a nivel de UI; si tiene auth de Supabase, se hace por RLS con role).
- **Permisos obligatorios**: si se revocan cámara o GPS, bloquea el check con mensaje claro.
- **device_id en localStorage**: si el usuario limpia el navegador, pierde la vinculación; tendrá que ser desvinculado por el admin para re-registrarse. Documentar en onboarding.

## Testing

- **Manual end-to-end** en celular real (Android Chrome + iOS Safari):
  - Vinculación con código válido / inválido / ya vinculado.
  - Check con permisos otorgados / denegados.
  - Check sin señal (debe fallar con mensaje claro).
  - Validaciones de negocio (2 entradas, salida sin entrada, etc.) — ya probadas en tablet, re-verificar.
  - Persistencia de sesión al cerrar y re-abrir la PWA.
  - Funcionamiento como PWA instalada (Add to Home Screen).
- **Admin**: desvincular y re-vincular en otro dispositivo.

## Plan de despliegue

1. Migración SQL: crear `empleado_dispositivos` y agregar columnas a `registros`.
2. Deploy de PWA a Vercel con dominio temporal.
3. Piloto con 2-3 empleados por 1 semana.
4. Ajustes basados en feedback.
5. Rollout gradual + generación de QR físico con la URL.
6. Comunicación por WhatsApp a los empleados.

## Decisiones tomadas (registro de opciones descartadas)

- **Login vs QR**: se eligió login (código + PIN) sobre escanear QR en el celular, por ser más rápido y natural.
- **Auto-registro sin contraseña asignada**: el empleado crea su propio PIN al vincular, el admin no gestiona credenciales.
- **PIN solo al vincular** (no en cada check): se confía en foto + GPS como evidencia; prioriza rapidez.
- **Sin validación de geocerca**: GPS solo para auditoría, evita falsos positivos y fricción.
- **Dispositivo único**: un empleado = un dispositivo activo. Más control, menos fraude.
- **Sin offline**: simplicidad > resiliencia para este caso de uso.
- **Mismas reglas de negocio que tablet**: consistencia para evitar disputas.
