# Módulo de Finiquitos (BMS) en el Admin — Diseño

**Fecha:** 2026-06-22
**Objetivo:** Mostrar en el Admin cuánto se ha gastado en finiquitos (neto pagado),
consultando los datos de BMS (SQL Server), siguiendo el mismo patrón de los módulos
BMS ya integrados (`/empleados/creditos`, `/empleados/rotacion`, `/empleados/estadisticas`).

---

## Contexto / Arquitectura existente

El Admin (`V2 checador-system ADMIN`) es un frontend estático que consume datos de dos
fuentes:

1. **Supabase** (`uqncsqstpcynjxnjhrqu`) — datos propios del checador (registros, empleados
   del checador, justificaciones). Vía `SupabaseAPI` en `supabase-config.js`.
2. **Backend `Pagos_Backend`** (Portal Pagos Proveedores), expuesto vía ngrok en
   `https://aceros-cabos-proveedores.ngrok.app/api` (`ADMIN_CONFIG.apiUrl`). Este backend
   conecta a **SQL Server** y consulta la base **`BMSCabos`** (sistema de nómina BMS).
   Es el que alimenta los reportes BMS actuales (créditos, rotación, estadísticas, expediente).

Los finiquitos viven en `BMSCabos.dbo.nominas` + `BMSCabos.dbo.mnominas`. **No** están en
Supabase. Por tanto el módulo de finiquitos se integra exactamente como los otros reportes
BMS: un endpoint nuevo en `Pagos_Backend/routes/empleados.js` + una sección nueva en el Admin.

No se introduce arquitectura nueva. No se toca BotSucursales.

---

## Modelo de datos (verificado contra SQL Server)

### `BMSCabos.dbo.nominas` (cabecera de la nómina/finiquito)
- `folio` char(10), `transaccion` char(5) — clave compuesta
- `tipo_nomina` char(1) — **'F' = Finiquito**
- `status` char(1) — **'V' = Válida** (no cancelada)
- `fecha` smalldatetime — fecha de captura/proceso
- `fecha_pago` smalldatetime
- `cod_estab` char(5)

### `BMSCabos.dbo.mnominas` (detalle por empleado)
- `folio`, `transaccion` — une con `nominas`
- `empleado` char(10) — código del empleado
- `dias_trabajados` decimal(9,4)
- `neto` money — **lo depositado al empleado (= "lo gastado")**
- (otras: percepcion_normal, otras_grabadas, otras_exentas, otras_deducciones, ispt, imss…)

### `BMSCabos.dbo.empleados` (catálogo BMS)
- `empleado` char(10), `nombre_completo` varchar(100)
- `grupo_nomina` char(5) → JOIN con `grupos_nomina.nombre` da la **sucursal**

### `BMSCabos.dbo.grupos_nomina`
- `grupo_nomina`, `nombre` (ej. MATRIZ, SAN JOSE, TAMARAL, EL FUERTE, LA PAZ, CABOS)

**Granularidad:** el join se hace a nivel `mnominas` (un registro por empleado finiquitado),
NO a nivel `nominas` (folio), porque existen folios con varios empleados finiquitados juntos
(4 folios multi-empleado verificados). Cada empleado finiquitado cuenta como uno.

**Dato verificado (2026):** ≈ $576,418 de neto en 45 finiquitos. MATRIZ $396K (24),
SAN JOSE $80K (8), TAMARAL $51K (6), EL FUERTE $29K (2), LA PAZ $11K (3), CABOS $9K (2).

---

## Backend — `Pagos_Backend/routes/empleados.js`

Nuevo endpoint (molde = `/creditos`):

```
GET /api/empleados/finiquitos?fechaInicio=YYYY-MM-DD&fechaFin=YYYY-MM-DD&sucursal=NOMBRE
```

Parámetros (todos opcionales):
- `fechaInicio`, `fechaFin` — filtran por `nominas.fecha`. Si no vienen, no se filtra por fecha.
- `sucursal` — filtra por `grupos_nomina.nombre` (mismo mecanismo que `/creditos`).

Query: une `nominas n` (WHERE `tipo_nomina='F' AND status='V'`) INNER JOIN `mnominas m`
ON `n.folio=m.folio AND n.transaccion=m.transaccion`, LEFT JOIN `empleados e` por código,
LEFT JOIN `grupos_nomina gn`. Multi-recordset:

1. **`finiquitos`** — lista detalle:
   `folio, fecha, fecha_pago, codigo, nombre, sucursal, dias_trabajados, neto`
   ordenado por `fecha DESC`.
2. **`resumen`** — `{ total_neto, num_finiquitos }`.
3. **`por_sucursal`** — `[{ sucursal, num_finiquitos, total_neto }]` ordenado por total DESC.

Respuesta: `{ success: true, data: { finiquitos, resumen, por_sucursal } }`.
Manejo de error igual que los otros endpoints (`try/catch`, `res.status(500)`).

Ruta pública (sin JWT), igual que `/creditos`, `/rotacion`, `/lista-vacaciones`
(el Admin las consume sin token).

---

## Frontend — `Index.html` + `Admin.js`

### Sidebar (`Index.html`)
Nuevo `<li class="nav-item">` con `<a href="#finiquitos" data-section="finiquitos">`
(ícono de dinero/recibo), ubicado junto a los otros reportes (después de Estadísticas/Rotación).

### Sección `#finiquitos` (`Index.html`)
- **Filtros:** date input inicio + date input fin (default: 1-ene-año-actual → hoy) +
  selector de sucursal (Todas / MATRIZ / SAN JOSE / …) + botón "Aplicar". Validación de
  rango (inicio ≤ fin) reutilizando el patrón existente del Admin.
- **3 tarjetas KPI:** Total gastado (neto, formato $), # de finiquitos, Promedio por finiquito.
- **Tabla "Por sucursal":** sucursal | # finiquitos | total neto.
- **Tabla "Detalle":** empleado (código + nombre) | folio | fecha | días trabajados | neto.
- **Botón "Exportar CSV"** del detalle (mismo helper de descarga CSV que usan otros reportes).

### Lógica (`Admin.js`)
- `cargarFiniquitos()` — lee filtros, hace
  `fetch(\`${ADMIN_CONFIG.apiUrl}/empleados/finiquitos?...\`)`, pinta KPIs + ambas tablas.
- Se dispara al entrar a la sección (en el switch de secciones) y al pulsar "Aplicar".
- Formato de moneda con `toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })`.
- Fechas mostradas en zona local (mismo manejo que el resto del Admin).

---

## Decisiones tomadas

- **Monto = `mnominas.neto`** (lo depositado). No se muestra bruto en esta versión.
- **Alcance = solo `BMSCabos`.** Otras bases BMS quedan para fase futura.
- **Periodo default = año en curso** (1-ene → hoy), editable.
- **Sucursal = grupo de nómina del empleado** (vía `grupos_nomina`).

## Fuera de alcance (YAGNI)

- Otras bases BMS (Culiacán, Balderrama, San Lucas…).
- Desglose de conceptos del finiquito (aguinaldo, prima de antigüedad, vacaciones…).
- Edición/captura de finiquitos (es solo lectura/reporte).

## Riesgos / Notas

- El endpoint es público (sin JWT) como los otros reportes BMS — consistente con lo existente,
  pero expone montos de finiquitos a quien tenga la URL del Admin. Aceptado por paridad con
  los reportes actuales (créditos, sueldos en /creditos ya exponen `sueldo_diario_promedio`).
- `money` de SQL Server llega como número en JS; cuidar redondeo al sumar (usar el SUM en SQL,
  no en cliente, como ya se hace en `/creditos` y `/estadisticas`).
