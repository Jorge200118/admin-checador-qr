# Exportar Word con fotos de registros desde el admin

Fecha: 2026-07-23
Estado: aprobado (pendiente de plan de implementación)

## Contexto

El 2026-07-23 se pidió un Word con la evidencia fotográfica de asistencia del
2026-03-07, empleado por empleado, replicando el modal "📸 Todas las fotos" del admin.
Se resolvió con un script local en Python (`generar_word_fotos.py`, 159 empleados /
298 fotos) que **no está integrado a la app**: depende de que alguien con Python y las
credenciales lo corra desde su máquina.

Este spec integra esa capacidad al admin para que cualquier usuario la genere desde el
navegador, sin script ni intervención técnica.

## Objetivo

Un botón en la sección Registros que genere y descargue un `.docx` con los registros
que tengan foto del filtro actual, una página por empleado y día, con el mismo formato
que el Word entregado hoy.

## Alcance

**Incluye**
- Botón en la barra de acciones de la tabla de Registros.
- Exportación que respeta los filtros ya aplicados en la pantalla.
- Generación del `.docx` 100% en el navegador (sin servidor, sin publicar nada).
- Fotos incrustadas, enderezadas (EXIF) y comprimidas.
- Aviso previo cuando el volumen es grande y barra de progreso durante el proceso.

**No incluye (YAGNI)**
- Botón dentro del modal de fotos por empleado (se evaluó y se descartó).
- Envío por correo, guardado en la nube o generación programada.
- Registros sin foto (se omiten, igual que hace el modal hoy).

## Decisiones tomadas

| Tema | Decisión | Razón |
|---|---|---|
| Alcance de la exportación | Los filtros actuales de la pantalla | Mismo modelo mental que el botón de Excel, que ya existe |
| Volumen grande | Avisar y permitir cancelar si supera 400 fotos | 1 día ≈ 298 fotos ≈ 40 MB; un mes tumbaría el navegador |
| Ubicación | Solo la barra de Registros | Lo pedido; evita superficie extra sin uso |
| Agrupación | Una página por empleado + día | El modal es por empleado y fecha; un rango de días debe leerse igual |
| Librería | PizZip (ya cargada) | Cero dependencias nuevas; el módulo de imágenes de docxtemplater es de pago |

## Diseño técnico

### Archivos

| Archivo | Cambio |
|---|---|
| `word-fotos.js` | **Nuevo.** Toda la lógica de exportación. Expone `exportarWordFotos()` |
| `Index.html` | Agregar `<script src="word-fotos.js">` y el botón en `.table-actions` |
| `Admin.js` | Sin cambios (ya tiene ~6,300 líneas; no se le agrega nada) |

### Flujo

1. **Leer filtros.** Los mismos que `exportarRegistros()` en `Admin.js:6244`:
   `fechaInicio`, `fechaFin`, `filterEmpleado`, `filterTipo`, `filterSucursal`,
   `filterPuesto`, más el candado `window.currentUserSucursal` / `window.isSuperAdmin`.
2. **Traer registros.** `SupabaseAPI.getRegistrosByFecha(fechaInicio, fechaFin, filtros)`.
   Descartar los que no tengan `foto_registro`.
3. **Guardia de volumen.** Si quedan más de 400 fotos, pedir confirmación mostrando
   cantidad y peso estimado (≈0.14 MB por foto). Si cancela, no se hace nada.
4. **Agrupar.** Por `empleado_id` + fecha (los primeros 10 caracteres de `fecha_hora`).
   Ordenar grupos por sucursal → nombre → fecha, y los registros de cada grupo por hora.
5. **Procesar fotos** (secuencial por lotes de ~6 en paralelo, con progreso).
6. **Armar el .docx** y descargarlo con nombre
   `Registros_fotos_<fechaInicio>[_a_<fechaFin>][_<SUCURSAL>].docx`.

### Procesamiento de fotos

Por cada URL única:

```
fetch(url)  →  blob
createImageBitmap(blob, { imageOrientation: 'from-image' })   // endereza EXIF
canvas (máx 1280 px por lado)  →  toBlob('image/jpeg', 0.82)  // comprime
→ ArrayBuffer + ancho/alto reales
```

Se cachean por URL para no bajar dos veces la misma foto.

**Por qué el canvas:** Word no respeta la orientación EXIF que el navegador sí aplica
en las etiquetas `<img>`. Sin este paso, las fotos tomadas con la tablet en vertical
salen acostadas en el documento. Además baja el peso del archivo.

**CORS:** verificado el 2026-07-23 — el bucket público `registros-fotos` responde
`Access-Control-Allow-Origin: *`, por lo que `fetch` + `canvas` pueden leer los bytes
sin problema.

Si una foto falla (red, borrada, formato raro), se registra el fallo y en su lugar va el
texto `[Foto no disponible]`. La exportación continúa.

### Estructura del .docx

Se arma a mano un OOXML mínimo y se comprime con PizZip:

```
[Content_Types].xml          Default jpeg/png + Override de document.xml
_rels/.rels                  apunta a word/document.xml
word/document.xml            el contenido
word/_rels/document.xml.rels un rId por imagen
word/media/imageN.jpeg       las fotos ya procesadas
```

Equivalencias de unidades a respetar:
- Tamaño de letra `w:sz` = medios puntos (15 pt → `30`).
- Tamaño de imagen en EMU: **1 cm = 360,000 EMU**.
- Imagen: ancho máx 11 cm, alto máx 9 cm, conservando proporción
  (`ancho_cm = min(11, 9 * ancho_px / alto_px)`).

Elementos usados: párrafo con relleno (`w:shd` en `w:pPr`), etiqueta con relleno
(`w:shd` en `w:rPr`), salto de página (`w:br w:type="page"`) e imagen
(`w:drawing` / `wp:inline` / `a:blip r:embed`).

**Escapado:** todo texto que venga de la base (nombres, sucursales, id de tablet) debe
pasar por escape de XML (`& < > " '`). Un nombre con `&` rompe el archivo entero.

### Formato de cada página

Idéntico al Word entregado hoy:

- **Encabezado turquesa (`17A2B8`)**, texto blanco: `📷 <Nombre> - <fecha>` y debajo
  `Código: <código> • <N> foto(s) • <SUCURSAL>`.
- **Por registro:** barra gris claro (`F1F3F5`) con `Registro #N`, etiqueta
  **ENTRADA** (verde `28A745`) o **SALIDA** (rojo `DC3545`) en blanco, y debajo
  `🕐 <hora> 🖥️ Tablet: <id>`. Luego la foto centrada.
- **Portada:** título, fecha o rango, totales y desglose por sucursal.

### Hora: sin conversión de zona horaria

`fecha_hora` se guarda como hora local de Mazatlán **sin zona** (ej. `2026-03-07T08:24:02`).
El Word toma la hora directo del texto (`fecha_hora.substring(11,19)`) y solo la pasa a
formato 12 h.

No se usa `new Date(...)` ni `toLocaleTimeString`, porque eso interpreta el texto en la
zona horaria de la PC y desplaza las horas si el equipo está configurado en otra zona.
El modal actual (`Admin.js:1577`) sí tiene esa dependencia; el Word no la hereda.

### Interfaz durante el proceso

- `showLoading('Descargando fotos 137 / 298...')` actualizado conforme avanza.
- Al terminar: `showAlert` con empleados, fotos incluidas y fotos fallidas si las hubo.
- Si no hay registros con foto en el filtro: aviso y no se genera archivo.

## Manejo de errores

| Caso | Comportamiento |
|---|---|
| Sin registros con foto | Aviso "No hay registros con foto en el período" y se cancela |
| Más de 400 fotos | Confirmación previa con cantidad y peso estimado |
| Una foto falla | `[Foto no disponible]` en su lugar; el resto continúa |
| PizZip no cargado | Error claro pidiendo recargar la página |
| Falla la consulta | Se muestra el mensaje de error y no se genera archivo |

## Pruebas

**Automáticas** (archivo de pruebas en `tests/`, siguiendo el patrón de
`tests/vacaciones.test.html` y `tests/faltas-pm.test.html`), sobre las funciones puras:

1. Agrupación: registros de 2 empleados en 2 días → 4 grupos, ordenados y con sus
   registros por hora.
2. Hora: `'2026-03-07T08:24:02'` → `'8:24:02 AM'`; `'2026-03-07T13:18:35'` → `'1:18:35 PM'`
   (los valores reales de Arturo Ureña / A002, ya verificados contra el modal).
3. Hora sin corrimiento: el resultado no cambia aunque la zona horaria del equipo cambie.
4. Escapado XML: un nombre con `&` y `<` sale escapado.
5. Tamaño de imagen: 1280×960 → 11 cm de ancho; 960×1280 (vertical) → 6.75 cm.
6. Registros sin foto: se descartan.

**Manual:** generar el 2026-03-07 filtrando MATRIZ y comparar contra
`Registros_fotos_2026-03-07_MATRIZ.docx` (70 empleados, 133 fotos): mismos empleados,
mismas horas, fotos derechas y que Word abra el archivo sin reparar.

## Criterio de aceptación

- El Word generado desde la app para 2026-03-07 + MATRIZ coincide con el generado hoy
  por el script: 70 empleados, 133 fotos, mismas horas y tablets.
- Las fotos verticales salen derechas.
- Word abre el archivo sin mostrar aviso de documento dañado.
- Un usuario de sucursal solo obtiene los empleados de su sucursal.

## Referencias

- `generar_word_fotos.py` — el equivalente en Python, que sirve de referencia de formato.
- `Admin.js:1487` `verTodasFotos()` / `Admin.js:1503` `mostrarModalFotosReales()` — el modal a replicar.
- `Admin.js:6244` `exportarRegistros()` — patrón de lectura de filtros.
- `supabase-config.js:876` `getFotosRegistro()` — campos disponibles.
- `contrato-generador.js:177` — precedente de generación de .docx en el navegador.
