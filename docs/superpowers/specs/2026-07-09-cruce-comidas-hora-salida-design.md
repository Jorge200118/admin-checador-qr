# Cruce de vales de comida × hora de salida — Diseño

**Fecha:** 2026-07-09
**Proyecto:** V2 checador-system ADMIN
**Autor:** Jorge (con Claude)

## Problema

La empresa paga la comida a los empleados que, en lugar de tomar su hora de comida
(horario partido: comida 13:00–14:30, salida 18:00), se quedan trabajando y salen a
las 6 de la tarde. El pago de esa comida se registra como un **vale de comida**
(reembolso). Se necesita **cruzar cada vale de comida con la hora de salida real** del
empleado en el checador, para verificar que efectivamente cumplió la condición
(salió tarde) y así respaldar el pago.

## Regla de negocio (confirmada con el usuario)

Un vale de comida **se considera válido para pago** cuando:

1. Existe un vale de comida para el empleado en esa fecha
   (`rnd_reembolsos` con `concepto` que contiene "COMIDA"), **y**
2. La **última checada de SALIDA** de ese empleado ese día fue **>= 17:30** (5:30 PM).

Notas de negocio:
- **Un empleado no puede tener más de un vale de comida por día.** Si en los datos
  aparecieran dos vales del mismo empleado el mismo día, es una anomalía → se reporta
  en Notas para revisión manual.
- Si el empleado tiene vale pero **no hay checada de salida** ese día (faltó / no checó
  salida) → **No cumple**, con nota "Sin checada de salida ese día".
- Alcance: **todos los empleados que tengan vale de comida** en el rango, sin filtrar
  por horario.

## Modelo de datos (verificado contra la base real)

Todo vive en el mismo Supabase del checador (`uqncsqstpcynjxnjhrqu`).

### Vales de comida → `rnd_reembolsos`
- `concepto` — texto libre SIN normalizar. Valores de comida observados:
  `COMIDAS` (actual, ~3725), `comida` (histórico ~1589), `Comida` (~78).
  Se filtra con `UPPER(concepto) LIKE '%COMIDA%'`.
- `nombre_beneficiario` — **texto libre**, el único identificador del empleado en el
  vale (mayúsc/minúsc mezcladas, acentos, orden variable, apodos, a veces externos).
- `empleado_id` — **SIEMPRE NULL en los vales de comida** → inservible para el cruce.
- `fecha` (date), `monto` (numeric), `estado`
  (entregado / solicitado_entrega / aprobado / pendiente).
- **Fechas corruptas:** algunas filas traen año `0026` en vez de `2026` (error de
  captura). Se normalizan antes de filtrar por rango.

### Catálogo intermedio → `rnd_empleados`
- 265 filas. `nombre` (texto), `codigo` (varchar). Códigos de otro origen
  (algunos raros: `01111111`, `10000`). 183/265 casan con el checador por código.
- Puente principal: el `nombre_beneficiario` del vale casa mejor contra
  `rnd_empleados.nombre` (~90% en muestra) que directo contra el checador (~85%).

### Checador → `empleados` + `registros`
- `empleados`: `id`, `codigo_empleado` (une con `rnd_empleados.codigo`),
  `nombre`, `apellido` (columnas separadas), `horario_id`, `activo`.
- `registros`: checadas. `empleado_id` (FK → empleados.id), `tipo_registro`
  (`'ENTRADA'` | `'SALIDA'`), `fecha_hora` (timestamp **hora local Mazatlán, sin TZ**).
  La hora de salida del día = **última fila con `tipo_registro='SALIDA'`** de ese
  `empleado_id` en esa fecha.

## Cadena de cruce (validada con datos reales)

Por cada vale de comida:

```
rnd_reembolsos.nombre_beneficiario
   └─(match por nombre normalizado)→ rnd_empleados.nombre  ⇒ codigo
        └─(match exacto por codigo)→ empleados.codigo_empleado  ⇒ empleados.id
             └─(registros de ese día, tipo SALIDA)→ última salida
```

### Identificación del empleado — cascada
1. Normalizar `nombre_beneficiario`: mayúsculas, quitar acentos, colapsar espacios.
2. Buscar en `rnd_empleados` por nombre normalizado → `codigo` → `empleados` por
   `codigo_empleado`. **(camino principal)**
3. Fallback: buscar directo en `empleados` por nombre completo normalizado, probando
   `nombre+' '+apellido` y `apellido+' '+nombre`.
4. Fallback: match aproximado por tokens compartidos. Se comparan los conjuntos de
   palabras (tokens) del nombre del vale y del empleado; se acepta como **dudoso** si
   comparten **al menos 2 tokens** (p. ej. nombre + un apellido) y no hay otro
   empleado que comparta el mismo número o más de tokens (para evitar ambigüedad).
5. Nada casa → **sin identificar**.

## Clasificación de cada fila del reporte

| Estado | Condición | Color |
|---|---|---|
| ✅ **Cumple** | identificado + última salida >= 17:30 | verde |
| ❌ **No cumple** | identificado + salió antes de 17:30, o sin checada de salida | rojo |
| ⚠️ **Revisar** | sin identificar, o match dudoso, o vale duplicado el mismo día | amarillo |

## Entregable

**Script Python** `cruce_comidas_salida.py`, en la raíz del proyecto, junto a los
`auditoria_*.py`. Reutiliza el patrón existente de esos scripts:
- Acceso a Supabase vía `urllib` + REST (misma `SUPABASE_URL` / `ANON_KEY`).
- Excel con `openpyxl`. Sin dependencias nuevas.
- Parámetros: fecha inicio y fecha fin del rango (por argumentos o constantes al inicio,
  como los scripts de auditoría existentes).

### Columnas del Excel
`Fecha | Nombre en vale | Código | Empleado (checador) | Monto | Última salida |
¿Salió ≥5:30? | Estado cruce | Notas`

Ordenado por fecha y luego por estado. Al final, fila(s) de totales:
- Nº de vales que **Cumplen** y suma de sus montos.
- Nº que **No cumplen** y suma.
- Nº a **Revisar**.

## Fuera de alcance (por ahora)

- Interfaz web / pestaña en el panel Admin (se decidió empezar solo con el script).
- Cálculo de nómina o escritura de vuelta a la base. El script **solo lee** y produce
  el Excel.
- Instalar extensiones de fuzzy matching en Postgres (`pg_trgm`/`unaccent`): la
  normalización y el match se hacen en Python.

## Riesgos / decisiones abiertas

- **Cobertura de identificación ~90–95%.** El % restante cae en "Revisar" — es
  intencional y visible, no se pierde nada en silencio.
- Los nombres externos (proveedores con concepto COMIDAS que no son empleados)
  aparecerán en "Revisar"; es correcto.
- La zona horaria de `fecha_hora` es local sin TZ; el filtrado por fecha usa la parte
  de fecha directa (sin conversión), consistente con el resto del sistema.
