# Reconocimiento facial básico — diseño

**Fecha:** 2026-05-09
**Autor:** Jorge
**Estado:** Propuesto

## Contexto

Hoy las dos superficies de checado (la tablet compartida en `v2 Checador-Tablet` y la PWA personal en `V3 Checador-PWA`) capturan una foto en cada registro como evidencia, pero **nadie valida** que la cara de la foto sea la del empleado dueño del código. En la tablet esto abre la puerta clásica de *buddy punching* (un compañero le checa a otro escaneando su QR). En la PWA personal el riesgo es menor (PIN + `device_id` por empleado), pero un empleado puede prestar el celular ya vinculado a otro.

Las fotos sí se guardan (bucket `registros-fotos`) y se muestran en ADMIN al revisar registros, pero el control es **a posteriori, manual y nadie lo hace**. Sirve como evidencia legal, no como prevención.

## Objetivo

Comparar automáticamente la cara capturada en cada checada contra una cara de referencia previamente inscrita por el empleado. Si no coincide, la checada **se registra igual** pero queda marcada como `identidad_dudosa`. ADMIN tiene un panel para revisar y resolver las dudosas.

Modo *shadow* desde el día uno: el sistema observa, no bloquea. Esto permite recolectar datos reales (qué tantos falsos positivos hay, en qué sucursales, con qué luz) antes de decidir si subir a modo estricto.

## No-objetivos (YAGNI)

- **No bloqueo de checadas en v1** — todo registro sigue entrando, solo se marca. La opción de bloqueo queda fuera de alcance hasta tener métricas de falsos positivos.
- **No detección de liveness** — un atacante motivado puede mostrar una foto del empleado a la cámara y pasar. Versión 1 acepta este riesgo (el caso típico es buddy-punching casual, no fraude organizado).
- **No identificación 1:N** — el sistema solo verifica "¿esta cara es la del empleado X?", no "¿quién es esta cara?". Sigue requerido el QR/PIN como entrada.
- **No re-inscripción automática** — si la cara cambia (lentes nuevos, barba, peso), el admin re-inscribe manualmente.
- **No reuso de la foto de perfil existente** como referencia — la calidad y ángulo varían demasiado entre empleados. Se hace inscripción dedicada.
- **No procesamiento server-side** — el modelo corre en el navegador, los embeddings se comparan en cliente. Solo el resultado (`identidad_dudosa` boolean + `face_distance` float) llega a la BD.
- **No múltiples caras por empleado** — un solo embedding promedio. Si falla, se re-inscribe.
- **No alerta push / email al admin** cuando entra una checada dudosa. Solo aparece en el panel de revisión.
- **No detección de mascarillas / cubrebocas** específica — face-api maneja oclusión parcial; si falla mucho, se re-inscribe con la oclusión típica.

## Decisiones de diseño y por qué

- **Modelo en navegador** vs. API en la nube (Rekognition, Azure Face): tu stack es 100% browser sin backend, agregar una API externa significa key en cliente (riesgo) o levantar servicio nuevo (fricción). face-api.js es gratis, privado, ~95% de precisión con buena luz. Costo: ~6MB de modelos cargados una vez (cacheables en SW).
- **face-api.js** vs. MediaPipe / human: face-api tiene la API más directa para el caso 1:1 (`computeFaceDescriptor` → `euclideanDistance`), montones de ejemplos en español, y se integra a `<canvas>` o `<video>` sin build step. MediaPipe es mejor para detección en tiempo real pero su API de embeddings es menos directa.
- **Inscripción manual desde ADMIN, 3 fotos**: el usuario eligió esta opción. Da el mejor matching desde el día uno (3 ángulos → embedding promediado más robusto a variaciones de pose). Costo: paso operativo extra por empleado al onboarding.
- **Embedding como `float[128]` en BD**, no la foto: face-api genera un vector de 128 floats (`Float32Array`). Se guarda en una columna `jsonb` o `float4[]` en una tabla nueva `empleado_biometria`. La comparación se hace calculando distancia euclidiana en el cliente. Las 3 fotos originales también se guardan en Storage para poder re-procesar si cambia el modelo.
- **Modo shadow puro**: el usuario eligió "marcar pero no bloquear". El registro entra siempre; los campos `identidad_dudosa` (bool) y `face_distance` (float) se agregan a `registros`. ADMIN ve un panel con filtro `identidad_dudosa = true`.
- **Threshold inicial `distance >= 0.6`** = "dudoso": valor recomendado por face-api para LFW. Configurable global desde ADMIN (no por sucursal en v1) para poder ajustar sin redeploy.
- **Si no se detecta cara en la foto** (cabeza fuera de cuadro, foto borrosa, lente tapado): `identidad_dudosa = true`, `face_distance = null`. La checada entra. Es coherente con "marcar todo lo sospechoso para revisar".
- **Si el empleado no tiene biometría inscrita**: `identidad_dudosa = false`, `face_distance = null`. No se marca. Esto evita que el panel de revisión se llene de "falsos dudosos" durante el rollout. ADMIN puede ver "empleados sin inscripción" como métrica aparte.
- **Modelos servidos desde el mismo origen** (carpeta `/face-models/` en cada repo): no jalar de CDN para evitar cuellos de botella de red en sucursales con internet flaco. ~6MB se cachean en el Service Worker existente.
- **Patrón 1: usuario decide qué cuenta** vs. embedding cargado al hacer scan: en la tablet, el flujo es `escanear QR → empleado_id → leer biometría → tomar foto → comparar`. La biometría se lee **después** del scan para no precargar a todos. En la PWA, la biometría del empleado vinculado se cachea localmente al login (1 lectura, ~1KB).
- **Lectura de `empleado_biometria` por anon en RLS**: ambas superficies usan el `anon key`. El embedding no es PII de alto valor (no es la foto, es un vector que solo sirve para comparar contra otra cara). Mismo patrón que el resto del proyecto (auth casero, ver `feedback_workflow.md` y `project_auth_model.md`).
- **Cero cambios al flujo de captura**: foto + GPS siguen igual, la verificación facial es un **paso paralelo** que ocurre tras tomar la foto y antes de insertar el registro. Si tarda más de N segundos (timeout 3s), entra como `identidad_dudosa = true` para no bloquear al empleado.
- **No tocar la tabla `empleados`** existente — se agrega una tabla aparte `empleado_biometria` con FK 1:1. Mantiene clean la tabla principal y el embedding fuera de los selects normales.

## Arquitectura

```
┌──────────────────────────┐                ┌──────────────────────────┐
│ ADMIN (V2)               │                │  Supabase                │
│                          │                │                          │
│ Pestaña "Biometría"      │   INSERT/UPDATE│  Tabla empleado_biometria│
│  - Lista empleados       │───────────────▶│   empleado_id (FK 1:1)   │
│  - Modal: 3 capturas     │                │   embedding float4[128]  │
│  - Procesa con face-api  │                │   foto_ref_1/2/3 paths   │
│ Solo superadmin          │                │   inscrito_en, por       │
│                          │                │                          │
│ Panel "Identidad dudosa" │   SELECT/UPDATE│  Tabla registros (++)    │
│  - Filtro is_dudosa      │───────────────▶│   identidad_dudosa bool  │
│  - Marcar resuelto       │                │   face_distance float    │
│                          │                │   identidad_revisada bool│
│ Pestaña "Configuración"  │   UPDATE       │   identidad_resuelta_por │
│  - Threshold global      │───────────────▶│                          │
│                          │                │  Tabla configuracion     │
└──────────────────────────┘                │   face_threshold float   │
                                            │                          │
┌──────────────────────────┐                │  Storage:                │
│ Tablet (v2)              │   INSERT       │   biometria-fotos/       │
│                          │───────────────▶│   {empleado_id}/{1,2,3}  │
│ /face-models/ (~6MB)     │                │                          │
│ 1. scan QR               │   SELECT       │                          │
│ 2. lee biometría         │───────────────▶│                          │
│ 3. foto + GPS            │                │                          │
│ 4. compara embeddings    │                │                          │
│ 5. inserta registro      │                │                          │
│    con flags             │                │                          │
└──────────────────────────┘                │                          │
                                            │                          │
┌──────────────────────────┐                │                          │
│ PWA (V3)                 │   SELECT (login)                          │
│                          │───────────────▶│                          │
│ /face-models/ (~6MB)     │                │                          │
│ Mismo flujo que tablet,  │                │                          │
│ embedding cacheado en    │                │                          │
│ memoria tras login       │                │                          │
└──────────────────────────┘                └──────────────────────────┘
```

## Modelo de datos

### Tabla nueva `empleado_biometria`

```sql
create table public.empleado_biometria (
  empleado_id   uuid primary key references public.empleados(id) on delete cascade,
  embedding     float4[] not null,                -- 128 floats
  foto_ref_1    text,                             -- path en storage biometria-fotos
  foto_ref_2    text,
  foto_ref_3    text,
  modelo_version text not null default 'face-api-ssd-mobilenetv1-v0.22',
  inscrito_en   timestamptz not null default now(),
  inscrito_por  text,                              -- usuario admin
  actualizado_en timestamptz,
  actualizado_por text
);

-- RLS
alter table public.empleado_biometria enable row level security;

create policy "anon select"   on public.empleado_biometria
  for select using (true);
create policy "anon insert"   on public.empleado_biometria
  for insert with check (true);
create policy "anon update"   on public.empleado_biometria
  for update using (true) with check (true);
create policy "anon delete"   on public.empleado_biometria
  for delete using (true);
```

Mismo patrón "anon-todo" que el resto del proyecto. Protección por UI (solo superadmin ve la pestaña). Nota: `embedding` se valida que tenga longitud 128 a nivel de aplicación (Postgres no permite restricción de tamaño en `float4[]` simple sin `domain` o trigger; YAGNI).

### Cambios a `registros`

```sql
alter table public.registros
  add column identidad_dudosa     boolean      not null default false,
  add column face_distance        real,                              -- null si no se calculó
  add column identidad_revisada   boolean      not null default false,
  add column identidad_resuelta_por text,
  add column identidad_resuelta_en timestamptz;

create index registros_identidad_dudosa_idx
  on public.registros (identidad_dudosa)
  where identidad_dudosa = true and identidad_revisada = false;
```

El índice parcial es para que el panel de revisión filtre rápido sin escanear toda la tabla.

### Cambios a `configuracion`

Tabla `configuracion` ya existe (1 fila). Se agrega:

```sql
alter table public.configuracion
  add column face_threshold real not null default 0.6;
```

### Bucket nuevo `biometria-fotos`

Público con URL no-listable (mismo patrón que `empleados-fotos` y `registros-fotos`). Estructura: `biometria-fotos/{empleado_id}/{1|2|3}.jpg`. Se sobreescribe en re-inscripción.

## Flujos de usuario

### Flujo 1 — Inscripción (ADMIN)

1. Superadmin abre pestaña "Biometría" (visible solo si `window.isSuperAdmin === true`).
2. Ve lista de empleados con badge: 🟢 inscrito / ⚪ sin inscribir / 🟡 inscripción vieja (>6 meses).
3. Click en un empleado → modal "Inscribir cara".
4. Modal pide acceso a cámara. Si lo niega, muestra error y aborta.
5. Indica al empleado: "Mira de frente". Tras 2s muestra preview, captura **foto 1**. Detecta cara con face-api; si no detecta, repite. Genera embedding 1.
6. "Mira ligeramente a la izquierda". Foto 2, embedding 2.
7. "Mira ligeramente a la derecha". Foto 3, embedding 3.
8. Calcula embedding promedio (`(e1+e2+e3)/3`).
9. Sube las 3 fotos a `biometria-fotos/{empleado_id}/`.
10. Hace `upsert` en `empleado_biometria` con embedding promedio y paths de fotos.
11. Modal cierra, lista refresca con badge 🟢.

Si el empleado ya tenía inscripción, el upsert sobreescribe y `actualizado_en/por` se llenan.

### Flujo 2 — Verificación en tablet

1. Empleado escanea QR → tablet resuelve `empleado_id`.
2. Inmediatamente al tener `empleado_id`, en paralelo: (a) activa cámara y GPS como hoy, (b) dispara `SELECT embedding FROM empleado_biometria WHERE empleado_id = ?`.
3. Toma foto, captura GPS. Para cuando se tienen ambos, la lectura de embedding ya regresó (típicamente <200ms).
4. Si **hay** embedding inscrito: detecta cara en la foto, calcula embedding, calcula `distance = euclidean(embeddingFoto, embeddingInscrito)`.
   - Si `distance < threshold` (default 0.6) → `identidad_dudosa = false`, `face_distance = distance`.
   - Si `distance >= threshold` → `identidad_dudosa = true`, `face_distance = distance`.
   - Si no detecta cara en la foto → `identidad_dudosa = true`, `face_distance = null`.
   - Si el cómputo tarda >3s o tira excepción → `identidad_dudosa = true`, `face_distance = null`.
5. Si **no hay** embedding inscrito: `identidad_dudosa = false`, `face_distance = null`.
6. Inserta `registros` con todos los campos. UI no cambia: muestra confirmación normal al empleado.

### Flujo 3 — Verificación en PWA

1. En el login (vinculación o reapertura), tras leer `empleado` se hace en paralelo `SELECT embedding` y se guarda en memoria (no en `localStorage`; es ~1KB pero embedding es PII suave).
2. Al checar (entrada/salida): mismo cómputo que tablet, comparando contra el embedding cacheado.
3. Si la sesión ya está activa pero no hay embedding cacheado (recarga, etc.) se intenta una lectura rápida; si falla se procede como "sin inscripción" (no marca).

### Flujo 4 — Revisión de dudosas (ADMIN)

1. Pestaña nueva "Identidad dudosa" (o vista filtrada en pestaña existente "Registros") visible si `isSuperAdmin` o admin de sucursal.
2. Lista registros con `identidad_dudosa = true AND identidad_revisada = false`.
3. Para cada uno: foto del registro lado a lado con la foto de inscripción del empleado, distance numérica, hora, sucursal, GPS si aplica.
4. Botones por fila:
   - **"Confirmar identidad"** → `identidad_revisada = true`, `identidad_resuelta_por = admin`, `identidad_resuelta_en = now()`. Se entiende como falso positivo.
   - **"Marcar como suplantación"** → mismos campos pero deja `identidad_dudosa = true`. Queda como evidencia para acciones de RH.
   - **"Re-inscribir empleado"** → atajo a la pestaña Biometría con el empleado precargado (sirve cuando la cara cambió genuinamente).
5. Métricas en cabecera: dudosas hoy / esta semana / por sucursal.

### Flujo 5 — Configuración (ADMIN)

1. Superadmin abre pestaña "Configuración".
2. Slider o input para `face_threshold` (rango sugerido 0.4–0.8, default 0.6). Texto explicativo: "Más bajo = más estricto (más falsos positivos). Más alto = más permisivo".
3. Guarda en `configuracion`.
4. Tablet y PWA leen este valor en cada checada (1 fila, despreciable) o lo cachean por 5 min.

## Manejo de errores

| Caso | Comportamiento |
|---|---|
| Cámara denegada en inscripción | Modal cierra con error, badge sigue ⚪. |
| Cámara denegada en checada | Comportamiento existente sin cambio (ya pasa hoy). |
| Modelos face-api no cargan (error de red) | Tablet/PWA proceden sin verificación: `identidad_dudosa = false`, `face_distance = null`. Se loguea en `console.warn`. **Decisión fail-open** (no como geocerca) porque modelo offline-cacheable y preferible no romper checadas si SW falló. |
| Empleado no tiene embedding inscrito | `identidad_dudosa = false`. No marca. |
| Embedding inscrito de longitud distinta a 128 (corrupto) | `identidad_dudosa = true`, `face_distance = null`, log warning. |
| Cómputo excede 3s | `identidad_dudosa = true`, `face_distance = null`. La checada entra. |
| Threshold no leíble | Usar default 0.6 hardcoded. |
| Error de red al insertar registro | Comportamiento existente sin cambio (la lógica de retry/queue de la PWA y de la tablet sigue igual; los nuevos campos viajan en el mismo insert). |

## Testing

- **Inscripción**: 5 empleados reales, 3 fotos cada uno, validar que las 3 detectan cara y el embedding promediado tiene 128 floats.
- **Match positivo**: cada empleado se checa 5 veces el mismo día. Validar `identidad_dudosa = false` en todas.
- **Match negativo controlado**: pedir a empleado A escanear QR de empleado B (con permiso). Validar `identidad_dudosa = true`.
- **Sin cara en foto**: tapar lente, foto borrosa, validar `identidad_dudosa = true, face_distance = null`.
- **Sin inscripción**: empleado sin biometría inscrita checa, validar `identidad_dudosa = false`.
- **Threshold**: subir threshold a 0.9, repetir match negativo controlado, validar que pasa como `false` (modo permisivo); bajarlo a 0.3, validar que match positivo se vuelve `true`.
- **Modelos no disponibles**: simular bloqueando `/face-models/` en DevTools, validar que checada entra normal sin marca.
- **PWA cacheo**: vincular PWA, validar que el embedding queda en memoria, recargar (no relogin) y validar que segunda checada vuelve a leer biometría.
- **Panel de revisión**: insertar 10 registros dudosos en BD de prueba, validar filtros y acciones (confirmar / marcar / re-inscribir).
- **RLS anon**: con anon key intentar `select`, `insert`, `update`, `delete` sobre `empleado_biometria` y validar todo permitido (consistente con el resto del proyecto).

## Dependencias y tareas externas al spec

- Decidir hosting de los modelos `/face-models/` (mismo bundle del repo o subir a un bucket público). Spec asume mismo bundle.
- Service Worker actual (`sw.js`) en tablet y PWA: agregar a la lista de cacheo los archivos de `/face-models/` para que carguen offline después de la primera vez.
- Los planes existentes (`pwa-checador-personal`, `geocerca-sucursal`) no se tocan; solo se agregan los pasos de verificación al final del flujo de captura.

## Riesgos y mitigaciones

- **Falsos positivos masivos al rollout** (luz mala, fotos de inscripción pobres): por eso es modo shadow. Si más del 30% de checadas legítimas vienen como dudosas en la primera semana, se sube el threshold o se re-inscribe a quienes fallan más.
- **Empleados que cambian de aspecto** (corte de pelo drástico, cubrebocas nuevo, lentes): re-inscripción manual. Métrica en panel: empleados con >3 dudosas confirmadas como falso positivo en 30 días → sugerir re-inscribir.
- **Tamaño del bundle face-api en tablet con datos limitados**: ~6MB. Cachear con SW desde el primer acceso. Si la tablet se reinstala, requiere que el primer arranque tenga internet.
- **Privacidad / consentimiento**: el embedding facial es PII bajo LFPDPPP. Se documentará en aviso de privacidad interno. Empleado puede solicitar borrado (`delete from empleado_biometria`); el sistema vuelve a tratarlo como "sin inscripción" sin afectar checadas.
- **Foto de foto (ataque trivial)**: aceptado como riesgo en v1. Si se materializa, se evalúa agregar liveness check (parpadeo, head-turn) en v2.

## Métricas a observar tras el rollout

- % checadas con `identidad_dudosa = true` por día / sucursal.
- % de dudosas resueltas como "falso positivo" (sirve para calibrar threshold).
- % de dudosas resueltas como "suplantación" (justifica el feature).
- Empleados sin inscripción pendiente.
- Latencia añadida al flujo de checada (target: <500ms en tablet, <1s en PWA gama media).
