# Apartado "Rotación" + Histograma de Permanencia — Diseño

Fecha: 2026-05-26
Estado: aprobado, listo para plan de implementación

## Objetivo

1. Sacar el análisis de rotación de la sección "Estadísticas" y darle su **propio apartado** "Rotación"
   en el menú lateral, con sub-pestañas.
2. Agregar un **histograma de permanencia por puesto** (cuánto dura/lleva la gente).

## Contexto verificado

- Ya existe (commit `a0ed428` en `main`):
  - Endpoint ERP `GET /api/empleados/rotacion?desde&hasta&sucursal` (rotación por puesto×sucursal).
  - En el admin: sección Estadísticas con tabla de rotación **mensual** (`_renderTablaRotacion`,
    consume `/estadisticas`) y tabla de rotación **por puesto** (`_renderTablaRotacionPuesto`,
    consume `/rotacion`).
- Fuente de datos: ERP Aceros Cabos (`BMSCabos.dbo.empleados`), vía
  `ADMIN_CONFIG.apiUrl = 'https://aceros-cabos-proveedores.ngrok.app/api'`.
- Convención BMS: `fecha_baja = '2078-12-31'` ⇒ empleado activo.
- Gráficas: el admin usa **Chart.js** (global, ya cargado) — ver helpers `_renderChartBarrasV`,
  `_renderChartBarrasRangos`, `getChartThemeColors`.
- Mapa de códigos de sucursal ya existe en `Admin.js`: `SUCURSAL_CODIGO` y `_codigoSucursal()`.

## Decisiones de diseño

- **Layout del apartado:** sección nueva "Rotación" con **3 sub-pestañas** (formato B aprobado):
  - **Resumen:** KPIs de rotación + tabla de rotación **mensual** (movida desde Estadísticas).
  - **Por Puesto:** tabla de rotación por puesto×sucursal (movida desde Estadísticas).
  - **Permanencia:** histograma nuevo.
- **Migración:** las dos tablas de rotación SE MUEVEN al apartado nuevo. Estadísticas conserva
  KPIs, edad, antigüedad, top puestos, top áreas, ingresos por mes. NADA duplicado.
- **Histograma (formato A aprobado — simple):** barras de un solo color, **un puesto a la vez**
  (o "Todos los puestos"), seleccionable. Mide permanencia de **todos** los empleados
  (activos + bajas): activos cuentan días desde `fecha_ingreso` hasta hoy; bajas cuentan
  `fecha_baja − fecha_ingreso`.
- **Rangos del histograma:** `<1 mes`, `1-3 meses`, `3-6 meses`, `6-12 meses`, `1-2 años`,
  `2-5 años`, `5+ años`.
- **Filtros del histograma:** puesto (dropdown, con opción "Todos los puestos"), sucursal
  (dropdown), y rango de fechas de **ingreso** (desde/hasta opcionales; vacío = histórico completo).
- **Cálculo de permanencia:** **endpoint nuevo en el ERP** (devuelve conteos por rango ya
  calculados en SQL). El front solo dibuja.

## Arquitectura

Dos repos (mismo patrón que la Fase 1 de rotación).

### 1. Backend ERP — `Pagos_Backend/routes/empleados.js`

Nuevo endpoint **público** (antes de `router.use(authMiddleware)`):

```
GET /api/empleados/permanencia?puesto=<opcional>&sucursal=<opcional>&desde=<opcional>&hasta=<opcional>
```

**Query params (todos opcionales):**
- `puesto` — filtra por nombre de puesto exacto (el que muestra la UI). Omitido = todos.
- `sucursal` — filtra por nombre de sucursal vía JOIN a `grupos_nomina` (patrón de `/rotacion`).
- `desde` / `hasta` (YYYY-MM-DD) — acotan por `fecha_ingreso`. Si solo se valida cuando vienen;
  formato inválido → 400.

**Lógica SQL:** calcular días de permanencia por empleado:
`dias = DATEDIFF(DAY, fecha_ingreso, CASE WHEN fecha_baja='2078-12-31' THEN GETDATE() ELSE fecha_baja END)`
y clasificar en los 7 rangos con un CASE. Devolver conteo por rango, incluyendo rangos en 0.
Filtra empleados con `nombre_completo IS NOT NULL`, `fecha_ingreso IS NOT NULL`, puesto no vacío.

**Respuesta:**
```json
{
  "success": true,
  "data": [
    { "rango": "<1 mes",   "orden": 1, "total": 12 },
    { "rango": "1-3 meses", "orden": 2, "total": 30 },
    { "rango": "3-6 meses", "orden": 3, "total": 18 },
    { "rango": "6-12 meses","orden": 4, "total": 22 },
    { "rango": "1-2 años",  "orden": 5, "total": 15 },
    { "rango": "2-5 años",  "orden": 6, "total": 9 },
    { "rango": "5+ años",   "orden": 7, "total": 4 }
  ],
  "total_empleados": 110,
  "filtros": { "puesto": null, "sucursal": null, "desde": null, "hasta": null }
}
```

`orden` permite ordenar las barras correctamente. Catch → 500 con `{success:false, message}`.

Además, para poblar el dropdown de puestos del histograma se reutiliza el listado de puestos
que ya provee `/estadisticas` (campo `puestos`) o, si hace falta, los puestos presentes en
`/rotacion`. No se crea endpoint extra para el catálogo de puestos.

### 2. Admin — `Index.html` + `Admin.js`

**Menú lateral:** agregar item "Rotación" (icono apropiado) que abre `<section id="rotacion">`.

**Sección `#rotacion`** con barra de 3 sub-pestañas (Resumen / Por Puesto / Permanencia).
Las sub-pestañas son botones que muestran/ocultan 3 sub-divs (patrón simple show/hide en JS).

- **Tab Resumen:** mover aquí el bloque de KPIs de rotación + la tabla de rotación mensual
  (`tbodyRotacion` y su `_renderTablaRotacion`). Quitarlos de `#estadisticas`.
- **Tab Por Puesto:** mover aquí el bloque "Rotación por Puesto" completo (controles +
  `rotacionPuestoTable`). Quitarlo de `#estadisticas`.
- **Tab Permanencia (nuevo):**
  - Controles: dropdown puesto (con "Todos los puestos"), dropdown sucursal, fecha desde,
    fecha hasta, botón Generar.
  - Un `<canvas id="chartPermanencia">` para Chart.js (barras verticales, un color).
  - Texto con `total_empleados` y la permanencia media (si se decide mostrar; ver abajo).

**Funciones nuevas en `Admin.js`:**
- `mostrarTabRotacion(tab)` — show/hide de las 3 sub-pestañas.
- `cargarHistogramaPermanencia()` — fetch a `/empleados/permanencia` con los filtros.
- `_renderChartPermanencia(data)` — dibuja el bar chart con Chart.js (destruye instancia previa,
  usa `getChartThemeColors` para tema claro/oscuro).
- `_poblarFiltrosPermanencia()` — llena dropdown de puestos (desde datos ya disponibles) y sucursales.
- Exponer en `window` las funciones llamadas por onclick/onchange.

**Disparo de carga:** al abrir la sección Rotación (en el switch de secciones ~`Admin.js:589`),
cargar el tab por defecto (Resumen) y al cambiar a Permanencia hacer el fetch la primera vez.

**Theming:** todo el render nuevo respeta tema claro/oscuro (patrón `getCurrentTheme()` /
`getChartThemeColors()`), consistente con el resto.

## Fuera de alcance

- Barras apiladas activos/bajas, mapa de calor (descartados; se eligió histograma simple).
- Permanencia mediana/percentiles (solo conteos por rango; opcionalmente promedio).
- Cambios al endpoint `/rotacion` o `/estadisticas` existentes (se reutilizan tal cual).

## Plan de entrega

Commits separados:
1. Backend ERP: endpoint `/permanencia`.
2. Admin: nueva sección Rotación + sub-pestañas + migración de las tablas existentes.
3. Admin: tab Permanencia + histograma Chart.js.
