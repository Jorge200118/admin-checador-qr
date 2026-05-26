# Reemplazo del tab Resumen por Análisis Año×Sucursal — Diseño

Fecha: 2026-05-26
Estado: aprobado, listo para plan

## Objetivo

Reemplazar el contenido del tab **Resumen** (sección Rotación) — hoy una tabla de rotación
mensual de los últimos 6 meses — por un análisis de rotación **por Año × Sucursal**, replicando
el Excel de RH `Analisis Rotación`: tabla principal, resumen anual, gráfica de evolución y
segmentador de sucursales.

## Contexto verificado

- Sección Rotación (`#rotacion`) con 3 tabs: Resumen / Por Puesto / Permanencia.
- Tab Resumen actual: card "Índice de Rotación" con `<table id="tablaRotacion">`/`tbodyRotacion`,
  renderizada por `_renderTablaRotacion(_estDatos.rotacion)` (llamada desde `_redibujarEstadisticas`,
  Admin.js:7307). Los datos vienen de `/estadisticas` (bloque rotación mensual, 6 meses).
- `_renderTablaRotacion` tiene `if (!tbody) return;` → si se elimina el tbody del HTML, no truena.
- El export de estadísticas (`exportarEstadisticasExcel`) usa `_estDatos.rotacion` para una hoja
  "Rotación"; eso seguirá funcionando aunque la tabla ya no se muestre (no se toca).
- Endpoints ERP existentes reutilizables: `/rotacion` (por puesto×sucursal en rango),
  `/permanencia`. Fórmula estándar de rotación ya usada: `%Rot = bajas/((PI+PF)/2)*100`.
- Convención BMS: `fecha_baja='2078-12-31'` ⇒ activo.
- `SUCURSAL_CODIGO` / `_codigoSucursal()` ya existen en Admin.js.
- Helpers Chart.js: `_renderChartBarrasV`, `getChartThemeColors`, `_estCharts`.
- Theming: todo debe usar variables `var(--...)` (la pestaña ya quedó tematizada).

## Decisiones de diseño

- **Reemplazo total** del contenido del tab Resumen. La tabla mensual `tablaRotacion`/`tbodyRotacion`
  se ELIMINA del HTML. `_renderTablaRotacion` se queda en el código (no estorba; su `if(!tbody)return`
  la hace inerte) — NO se borra para no afectar el export ni `_redibujarEstadisticas`.
- **Años:** selector de años **Desde / Hasta** (inputs numéricos de año, ej. 2023–2026). Default:
  (año actual − 3) a año actual.
- **Cálculo anual por sucursal** (corte 1-ene a 31-dic):
  - Plantilla Inicial = activos al 1-ene del año (ingreso < 1-ene Y (activo O baja ≥ 1-ene)).
  - Plantilla Final = activos al 31-dic del año (o a hoy si es el año en curso): ingreso ≤ fin Y
    (activo O baja > fin).
  - Contrataciones = ingresos dentro del año. DLTC (bajas) = bajas reales dentro del año.
  - %Rotación = DLTC / ((PI + PF) / 2) × 100.
- **Segmentador de sucursales: múltiple** (chips marcables, estilo segmentador del Excel).
  Por defecto todas seleccionadas. Filtra **tabla, resumen anual y gráfica** (todo respeta el filtro).
  Se aplica en cliente sobre los datos del fetch (sin re-consultar).
- **Tabla Año×Sucursal:** columnas Año, Sucursal (código), Plantilla Inicial, Contrataciones,
  DLTC, Plantilla Final, %Rotación. Ordenable por columna (clic encabezado, asc/desc), default
  %Rotación desc (como el Excel). %Rotación con badge de color (umbrales anuales 20/40).
- **Resumen anual:** tabla pequeña, una fila por Año (de los seleccionados), con Plantilla Inicial
  (suma de PI de las sucursales filtradas ese año), Plantilla Final, Diferencia (PF−PI) y
  %crecimiento ((PF−PI)/PI×100). Fila Total general.
- **Gráfica:** barras agrupadas Plantilla Inicial vs Plantilla Final por año (eje X = años),
  Chart.js, respeta el filtro de sucursales. Tematizada.

## Arquitectura

### 1. Backend ERP — `Pagos_Backend/routes/empleados.js`

Nuevo endpoint público `GET /api/empleados/rotacion-anual?desde=YYYY&hasta=YYYY`:
- Valida desde/hasta como años de 4 dígitos; si faltan/ inválidos → 400.
- SQL: para cada año del rango × cada sucursal (grupo_nomina), calcular PI/contrataciones/dltc/PF
  con cortes `'<anio>-01-01'` y `'<anio>-12-31'` (o GETDATE() si es año en curso). Generar la lista
  de años con una tabla de números/VALUES. Agrupar por año + sucursal.
- Respuesta: `{ success:true, data:[{anio, sucursal, plantilla_inicial, contrataciones, dltc, plantilla_final, tasa}], periodo:{desde,hasta} }`.
- `tasa` calculada en JS tras el query (como `/rotacion`).
- El filtro de sucursal NO va en el endpoint (se hace en cliente para soportar multi-selección).

### 2. Admin — `Index.html` + `Admin.js`

**HTML (dentro de `#rotTabResumen`, reemplazando el card actual):**
- Barra de controles: input año Desde, input año Hasta, botón Generar.
- Segmentador de sucursales: contenedor de chips `<button>` (uno por código), marcables. Se
  generan dinámicamente con los códigos presentes en los datos. Un chip "Todas".
- Tabla `id="rotacionAnualTable"` con thead ordenable (7 columnas) y `tbody id="tbodyRotacionAnual"`.
- Tabla resumen `id="resumenAnualTable"` con `tbody id="tbodyResumenAnual"`.
- `<canvas id="chartRotacionAnual">`.

**JS (Admin.js), funciones nuevas:**
- `cargarRotacionAnual()` — fetch a `/rotacion-anual` con años; cachea en `_rotAnualDatos`;
  inicializa el segmentador (todas las sucursales activas) y dibuja todo.
- `_sucursalesSeleccionadas` (Set) — estado del segmentador.
- `_toggleSucursalAnual(cod)` — marca/desmarca un chip y redibuja.
- `_datosRotAnualVisibles()` — filtra `_rotAnualDatos` por sucursales seleccionadas + aplica orden.
- `_renderTablaRotacionAnual(rows)` — tabla principal + fila total.
- `ordenarRotacionAnual(col)` — orden asc/desc (default tasa desc).
- `_renderResumenAnual(rows)` — agrega por año (PI, PF, dif, %) y pinta la tabla chica.
- `_renderChartRotacionAnual(rows)` — barras PI vs PF por año (destruye instancia previa, tema).
- `_redibujarRotAnual()` — llama tabla + resumen + gráfica desde el cache (para el toggle).
- Exponer en `window` las funciones de onclick.

**Disparo:** en el switch, `case 'rotacion':` ya llama `mostrarTabRotacion('resumen')`. Agregar la
carga de rotación anual la primera vez que se entra (guard `_rotAnualCargado`), inicializando los
años default. Quitar la dependencia del tab Resumen respecto a la tabla mensual.

**Eliminar del HTML** el card "Índice de Rotación" (tabla mensual) que está dentro de `#rotTabResumen`.

## Fuera de alcance

- No se toca tab Por Puesto ni Permanencia.
- No se borra `_renderTablaRotacion` ni el export de estadísticas (quedan inertes/intactos).
- Segmentador no persiste selección entre sesiones.

## Plan de entrega

1. Backend ERP: endpoint `/rotacion-anual`.
2. Admin: reemplazo del HTML del tab Resumen (controles + segmentador + tabla + resumen + canvas).
3. Admin: JS (carga, segmentador, render tabla/resumen/gráfica, orden).
