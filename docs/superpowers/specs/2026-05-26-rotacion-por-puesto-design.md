# Reporte de Rotación por Puesto — Diseño (Fase 1)

Fecha: 2026-05-26
Estado: aprobado, listo para plan de implementación

## Objetivo

Replicar en el panel admin el análisis de rotación que hoy se hace a mano en Excel
(`250826 Analisis Rotación por puesto.xlsx` y `250822 Analisis Rotación 2025 RevxFjpa.xlsx`),
agregando el desglose **por puesto × sucursal** que la pantalla actual de Estadísticas no tiene.

Hoy el admin ya muestra una **tabla de rotación mensual global** (`_renderTablaRotacion`,
sección Estadísticas) que consume `GET /api/empleados/estadisticas`. Lo que falta es el
corte por puesto y un periodo configurable. Eso es lo que cubre esta fase.

## Contexto verificado (estado actual del código)

- **Fuente de datos:** ERP de Aceros Cabos (BMS = SQL Server `BMSCabos.dbo.empleados`),
  expuesto vía API REST. El admin ya lo consume con
  `ADMIN_CONFIG.apiUrl = 'https://aceros-cabos-proveedores.ngrok.app/api'` (`Admin.js:10`).
- **Backend ERP:** `Portal Pagos Proveedores/Pagos_Backend/routes/empleados.js`.
  Ya existen rutas públicas (sin JWT) consumidas por el admin: `/alertas`, `/estadisticas`,
  `/lista-vacaciones`, `/expediente/:emp`, `/qr-check/para-alta`, `/creditos`.
- **Convención clave BMS:** `fecha_baja = '2078-12-31'` significa **empleado activo**
  (no dado de baja). Las bajas reales tienen una fecha distinta.
- **Fórmula de rotación** (ya usada en el bloque 7 de `/estadisticas`, idéntica a los Excel):
  `%Rotación = Bajas / ((Plantilla_Inicial + Plantilla_Final) / 2) × 100`

## Decisiones de diseño

- **Formato:** una **tabla única filtrable y ordenable** (Puesto + Sucursal + métricas),
  no una hoja por puesto. Usa el patrón de ordenación asc/desc ya implementado en la
  tabla de empleados.
- **Periodo:** **rango de fechas configurable** (`desde` / `hasta`), no solo año.
- **Filas vacías:** se omiten — solo puestos/sucursales con al menos un movimiento
  (contratación, baja) o plantilla > 0 en el rango.
- **Default de fechas:** 1-ene del año actual → hoy.
- **Umbrales de color del %Rotación** (acordes a tasas anuales): verde ≤20%,
  amarillo ≤40%, rojo >40%.
- **Sucursales:** se muestran con **código corto** (no el nombre largo de BMS). El
  endpoint devuelve el nombre largo; el admin lo mapea a código en cliente. Tabla de
  equivalencias confirmada:

  | Código | Sucursal BMS |
  |--------|--------------|
  | LMM | MATRIZ (Los Mochis) |
  | CSL | CABOS |
  | SJC | SAN JOSE |
  | LPZ | LA PAZ |
  | TML | TAMARAL |
  | FTE | EL FUERTE |
  | CLN | CULIACAN |
  | JJR | JUAN JOSE RIOS |

  Si BMS devuelve una sucursal fuera de la tabla, se muestra el nombre tal cual.

## Arquitectura

Dos piezas en dos repos, igual que el resto de la integración ERP existente.

### 1. Backend ERP — `Pagos_Backend/routes/empleados.js`

Nuevo endpoint **público** (declarado antes de `router.use(authMiddleware)`):

```
GET /api/empleados/rotacion?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&sucursal=<opcional>
```

**Query params:**
- `desde` (YYYY-MM-DD, requerido)
- `hasta` (YYYY-MM-DD, requerido)
- `sucursal` (opcional — filtra por nombre vía JOIN a `grupos_nomina`, mismo patrón que `/estadisticas`)

**Validación:** si falta `desde` o `hasta`, responder 400 con mensaje claro.

**SQL** — una sola query con `GROUP BY` puesto + sucursal sobre `BMSCabos.dbo.empleados`,
con JOINs a `puestos` y `grupos_nomina` para nombres legibles (patrón existente):

- `plantilla_inicial` = `fecha_ingreso < @desde` AND (`fecha_baja = '2078-12-31'` OR `fecha_baja >= @desde`)
- `contrataciones`    = `fecha_ingreso` BETWEEN @desde AND @hasta
- `bajas`             = `fecha_baja != '2078-12-31'` AND `fecha_baja` BETWEEN @desde AND @hasta
- `plantilla_final`   = `fecha_ingreso <= @hasta` AND (`fecha_baja = '2078-12-31'` OR `fecha_baja > @hasta`)

Filtrar a filas con actividad: `HAVING` plantilla_inicial > 0 OR contrataciones > 0 OR bajas > 0 OR plantilla_final > 0.

**Respuesta:**
```json
{
  "success": true,
  "data": [
    { "puesto": "CHOFER", "sucursal": "LMM", "plantilla_inicial": 11,
      "contrataciones": 12, "bajas": 7, "plantilla_final": 16, "tasa": "51.9" }
  ],
  "periodo": { "desde": "2025-01-01", "hasta": "2025-12-31" }
}
```

`tasa` se calcula en JS tras el query (como ya hace `/estadisticas`):
`promedio = (plantilla_inicial + plantilla_final) / 2; tasa = promedio > 0 ? (bajas/promedio*100).toFixed(1) : '0.0'`.

Errores → 500 con `{ success:false, message }`, igual que las rutas vecinas.

### 2. Admin — `Admin.js` + `Index.html`

Nueva sub-sección **"Rotación por Puesto"** dentro de la sección `#estadisticas`,
debajo de la tabla de rotación mensual actual.

**Controles (barra superior):**
- Fecha **Desde** + fecha **Hasta** (default: 1-ene del año actual → hoy)
- Filtro **Sucursal** (dropdown; "Todas" por defecto)
- Filtro **Puesto** (dropdown; se llena con los puestos del resultado)
- Botón **Generar** + botón **Exportar Excel**

**Tabla única filtrable y ordenable** (patrón asc/desc ya implementado en empleados):

| Puesto | Sucursal | Plantilla Ini | Contrataciones | Bajas | Plantilla Fin | %Rotación |
|--------|----------|---------------|----------------|-------|---------------|-----------|

- Encabezados clicables con ícono `fa-sort` → `fa-sort-up` / `fa-sort-down`.
- %Rotación con badge de color (verde ≤20, amarillo ≤40, rojo >40) y barra, reusando el
  estilo de `_renderTablaRotacion` (umbrales ajustados a tasas anuales).
- Sucursal mostrada como **código corto** vía mapa de equivalencias (ver sección Decisiones).
- **Fila de totales** al pie (suma de columnas; %Rotación global recalculada con la fórmula).
- Filtros de puesto/sucursal aplican **en cliente** sobre los datos ya traídos (sin re-fetch).
  Cambiar fechas **sí** re-consulta el endpoint.

**Export Excel:** una hoja con todas las filas + fila de totales (formato plano,
reusando el patrón de `XLSX.utils.json_to_sheet`).

**Funciones nuevas en `Admin.js`:**
- `cargarRotacionPuesto()` — fetch a `/empleados/rotacion` con las fechas + sucursal
- `_renderTablaRotacionPuesto(data)` — render de filas + totales
- `ordenarRotacionPuesto(col)` — orden asc/desc (estado `ordenRotacionPuesto`)
- `filtrarRotacionPuesto()` — aplica filtros puesto/sucursal en cliente
- `exportarRotacionPuestoExcel()`
- Estado en memoria: `_rotacionPuestoDatos` (cache del último fetch para filtrar/ordenar/exportar sin re-consultar)

**HTML nuevo en `Index.html`:** bloque de controles + `<table>` con `<thead>` ordenable
y `<tbody id="tbodyRotacionPuesto">`, dentro de `#estadisticas`.

## Fuera de alcance (Fase 2, futura)

- Resumen anual comparativo por sucursal en formato pivote/matriz.
- Tablas dinámicas tipo "Inc VS Fin" y "%R" del Excel `250822`.
- Selector de año dedicado (esta fase usa rango de fechas libre, que ya lo cubre).

## Plan de entrega

Dos commits separados (workflow: main directo, push con OK del usuario):
1. Backend ERP: nuevo endpoint `/rotacion`.
2. Admin: UI + funciones de render/filtro/orden/export.
