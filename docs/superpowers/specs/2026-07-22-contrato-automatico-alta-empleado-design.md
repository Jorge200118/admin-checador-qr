# Descarga automática de contrato al dar de alta un empleado

**Fecha:** 2026-07-22
**Estado:** Diseño aprobado — pendiente de plan de implementación

## Objetivo

Cuando se da de alta un **empleado nuevo** en el checador (Admin), generar y descargar
automáticamente su **Contrato Individual de Trabajo** (paquete legal completo) en formato
`.docx`, rellenando todas las variables a partir del expediente de nómina (BMS). El salario
es el mínimo por ley; el contenido varía por puesto (actividades del Anexo "A") y por
sucursal (dirección del sitio de trabajo).

Referencia de formato: `D:\USUARIO\Downloads\CAP-ISIS EVARISTO RAMIREZ.docx` (contrato real
de una Cajera). Se reproduce **el paquete completo** tal cual, solo cambiando los datos de la
persona y las actividades del puesto.

## Alcance

**Incluye:**
- Generación en el navegador (cliente), sin cambios de backend.
- Uso del `.docx` real como plantilla parametrizada (fidelidad 100% al formato).
- Disparo **automático** al guardar un alta nueva (no en edición).
- Catálogo extensible de actividades por puesto (hoy solo `CAJERA`).
- Catálogo de direcciones por sucursal (8 sucursales oficiales).
- Reglas de "no descargar y avisar" cuando faltan datos.

**No incluye (YAGNI / fuera de alcance):**
- Botón manual de "descargar contrato" para empleados ya registrados. (Descartado por el usuario.)
- Generación en backend / PDF. (Se eligió cliente + `.docx`.)
- Guardar el contrato en Supabase Storage o enviarlo por WhatsApp. (No solicitado.)
- Firma electrónica.

## Enfoque técnico (decidido)

**Opción A — Generación en el navegador usando el `.docx` real como plantilla.**

Se toma `CAP-ISIS EVARISTO RAMIREZ.docx`, se reemplazan los datos de la persona por
marcadores (`{nombre_completo}`, `{puesto}`, `{fecha_firma}`, `{actividades_anexo_a}`, ...) y
se guarda como `plantilla-contrato.docx` en el repo. En tiempo de ejecución, el navegador
descarga la plantilla, la rellena con `docxtemplater` + `PizZip` (cargadas por CDN, igual que
`xlsx`/`Chart.js`) y dispara la descarga del Word ya armado.

Ventajas: respeta tipografías, tablas, saltos de página y firmas del documento original; cero
infraestructura nueva; el resultado es un `.docx` editable que RH puede retocar antes de
imprimir/firmar.

## Arquitectura

### Archivos
- **`plantilla-contrato.docx`** (nuevo, raíz del repo): el `.docx` de ejemplo parametrizado
  con marcadores `{...}`. Se sirve estáticamente y se descarga con `fetch`.
- **`contrato-generador.js`** (nuevo): módulo aislado con
  - los catálogos y constantes (empresa, salario, actividades por puesto, direcciones por
    sucursal),
  - la función pública `generarContratoAlta(codigoEmpleado, { sucursal, puesto })`,
  - helpers de formato (fecha larga en español, cálculo de edad, ingreso + 2 meses,
    construcción del domicilio).
  Se carga en `Index.html` **después** de las librerías CDN y de `Admin.js`.
- **`Index.html`** (editar): añadir `<script>` de docxtemplater y PizZip (CDN) + el
  `<script src="contrato-generador.js">`.
- **`Admin.js`** (editar mínimo): en `guardarEmpleado()`, tras `result.success` y **solo en
  alta nueva** (`!isEditing`), invocar `window.generarContratoAlta(codigo, { sucursal, puesto })`.
  El gancho es "fire-and-forget con manejo de error propio": nunca revienta ni bloquea el alta.

### Por qué un archivo aparte
`Admin.js` ya supera las 9,000 líneas. Toda la lógica y los datos del contrato viven en
`contrato-generador.js` para mantener el alta limpia y el generador testeable de forma aislada.

## Flujo

1. El usuario guarda un **alta nueva**. El empleado se persiste en Supabase (comportamiento
   actual, sin cambios).
2. Se llama `generarContratoAlta(codigo, { sucursal, puesto })`.
3. Se consulta el expediente: `GET ${ADMIN_CONFIG.apiUrl}/empleados/expediente/{codigo}`.
4. **Validación de completitud** (ver "Reglas de bloqueo"). Si falta algo → aviso y **no** se
   descarga.
5. Si todo está completo → se construye el objeto de datos → se descarga
   `plantilla-contrato.docx` → `docxtemplater` la rellena → se dispara la descarga como
   **`Contrato - {NombreCompleto}.docx`**.

El alta **siempre** se completa, independientemente del resultado de la generación.

## Mapa de variables

### De la persona (expediente BMS, `json.data` = `d`)
| Marcador | Origen | Notas |
|---|---|---|
| `nombre_completo` | `d.NombreCompleto` (fallback `d.Nombre`+`d.ApellidoPaterno`+`d.ApellidoMaterno`) | Aparece en múltiples cláusulas y hojas |
| `edad` | calculada de `d.FechaNacimiento` | años cumplidos a la `fecha_firma` |
| `estado_civil` | `d.EstadoCivil` | tal cual (p. ej. "Soltera") |
| `nacionalidad` | constante `"Mexicana"` | el expediente no la expone |
| `nss` | `d.NumeroIMSS` | Número de Seguridad Social |
| `curp` | `d.CURP` | |
| `rfc` | `d.RFC` | |
| `domicilio` | `d.Calle` + `d.NumExterior` + `d.NumInterior` + `d.Colonia` + `d.CodigoPostal` + `d.Municipio` | construido con las partes no vacías |
| `puesto` | `d.Puesto` (fallback: puesto del alta) | forma tal cual (género incluido, p. ej. "Cajera") |

### Fechas
| Marcador | Cálculo |
|---|---|
| `fecha_firma` | `d.FechaIngreso`, formateada larga en español ("26 de enero del 2026") |
| `fecha_ingreso` | igual a `fecha_firma` |
| `fecha_fin_prueba` | `d.FechaIngreso` + 2 meses, mismo formato |
| `ciudad_firma` | `ciudad` de la sucursal en `SUCURSAL_CATALOGO` (ver abajo). Nunca un valor fijo del ejemplo |

### Salario (constante única, actualizable una vez al año)
```js
const SALARIO = {
  monto: "9,451.20",
  enLetra: "Nueve Mil Cuatrocientos Cincuenta y uno pesos 20/100 M.N."
};
```
Aplica a todas las sucursales (BCS y Sinaloa = "resto del país", fuera de la zona libre de la
frontera norte). Marcadores: `salario_monto`, `salario_letra` (usados en cláusula SEXTA y en
Anexo "B").

### Fijos de empresa (constantes)
- Razón social: `ACEROS CABOS, S.A DE C.V.`
- RFC empresa: `ACA0111059H0`
- Domicilio fiscal: `PROLONGACION INDEPENDENCIA NO. 1856 PTE, FRACCIONAMIENTO CUAUHTEMOC, C.P. 81248, Los Mochis, Sinaloa`
- Notario: `Sergio Armenta Sarmiento, Notario Público número 153`; Instrumento `101`, foja `101`,
  Volumen `XXVII`, sección `IV`, de fecha `30 de noviembre de 2001`.
- Patrón (representante): `C. Fernando Olais Godoy`
- Testigos: `C. Guillermo Corrales Cruz`, `C. Esmeralda Flores López`

Estos valores se dejan como constantes en `contrato-generador.js` (o directamente fijos en la
plantilla, cuando no cambian nunca).

## Catálogo: actividades por puesto (Anexo "A")

Clave = puesto **normalizado** (mayúsculas, sin acentos). Hoy solo existe `CAJERA`; el resto se
irá agregando conforme el usuario entregue un ejemplo por puesto.

```js
const ACTIVIDADES_POR_PUESTO = {
  "CAJERA": [
    "Atender el pago de facturas de contado, ya sea directamente del cliente o de los choferes,",
    "Elaborar los depósitos de contado y crédito, amparados con copia simple de los cheques recibidos en ambos tipos de venta,",
    "Pasar al Departamento de Cartera, copia de los cheques y depósitos por venta de crédito para que se haga la relación de abonos a clientes,",
    "Elaborar la póliza de ingresos diaria,",
    "Revisar la facturación en tránsito diariamente",
    "De ser necesario, serán capacitados para su puesto en la Ciudad de Los Mochis, Sinaloa. El tiempo requerido, así lo indique la Comisión Mixta de Productividad.",
    "Tener la disposición de realizar todas las actividades anteriormente descritas, dentro de su Anexo \"A\""
  ]
  // Pendientes: VENTAS, CHOFER, TRABAJADOR DE PATIO, AUXILIAR CONTABLE,
  //             ENCARGADO DE SUCURSAL, ALMACEN, ... (el usuario los entrega uno por uno)
};
```

El marcador `{actividades_anexo_a}` en la plantilla se llena como lista. La normalización debe
tolerar variantes (`CAJERA`/`CAJERO`/`Cajera`) — a definir en el plan.

## Catálogo: dirección del sitio de trabajo por sucursal

Clave = valor `sucursal` del checador. 8 sucursales oficiales (Pescadero y Ruiz Cortines
quedan fuera por no ser oficiales aún). Cada entrada tiene `direccion` (para el marcador
`{sitio_trabajo}`) y `ciudad` (para el marcador `{ciudad_firma}`).

```js
const SUCURSAL_CATALOGO = {
  "MATRIZ":         { direccion: "Prol. Independencia No. 1856 Pte., Fracc. Cuauhtémoc, Los Mochis, Sinaloa",                    ciudad: "Los Mochis, Sinaloa" },
  "LA PAZ":         { direccion: "Blvd. Agustín Olachea No. 4910, entre Tenochtitlán y Tuna, Col. Las Garzas, La Paz, B.C.S.",  ciudad: "La Paz, B.C.S." },
  "SAN JOSE":       { direccion: "Julio Pimentel Green, Manzana 7c Lote S/N, Col. Las Veredas, San José del Cabo, B.C.S.",      ciudad: "San José del Cabo, B.C.S." },
  "TAMARAL":        { direccion: "Padre Nicolás Tamaral, 23477 Cabo San Lucas, B.C.S.",                                        ciudad: "Cabo San Lucas, B.C.S." },
  "CABOS":          { direccion: "Flor de Pitahaya Local 25, Brisas del Pacífico, C.P. 23473, Cabo San Lucas, B.C.S.",         ciudad: "Cabo San Lucas, B.C.S." },
  "EL FUERTE":      { direccion: "Carretera El Fuerte - Choix Km 1 + 320, El Fuerte, Sinaloa",                                 ciudad: "El Fuerte, Sinaloa" },
  "JUAN JOSE RIOS": { direccion: "Jambiola entre Carretera Internacional y Calle 0, Juan José Ríos, Sinaloa",                  ciudad: "Juan José Ríos, Sinaloa" },
  "CULIACAN":       { direccion: "Fray Marcos de Niza No. 100, Col. San Rafael, Culiacán, Sinaloa",                            ciudad: "Culiacán, Sinaloa" }
};
```

Mapeo confirmado con el usuario: en el catálogo de origen, **MATRIZ = "Los Mochis"** y
**CABOS = "Brisas"**; el resto coincide por nombre. La regla de bloqueo por sucursal se evalúa
contra las claves de `SUCURSAL_CATALOGO`.

## Hojas de "fin de periodo"

El paquete incluye hojas que en la práctica se completan **al terminar** el periodo a prueba
(Opinión de la Comisión Mixta, Aviso de resultado, Renuncia, Registro de firmas). En estas
hojas solo se sustituyen **nombre / puesto / fecha**; el resultado (logró / no logró), folios y
firmas se dejan como en la plantilla para que RH los complete a mano. Así el paquete queda
"igual al ejemplo" sin inventar un resultado inexistente al momento del alta. Los folios
numéricos específicos del ejemplo (p. ej. en el Registro de firmas) se dejan en blanco.

## Reglas de bloqueo ("no descargar y avisar")

No se descarga —y se muestra un aviso claro indicando **qué** falta— si:
1. El puesto **no está** en `ACTIVIDADES_POR_PUESTO`, o
2. La sucursal **no está** en `SUCURSAL_CATALOGO`, o
3. No se pudo obtener el expediente (error de red / no encontrado), o
4. Faltan datos legales clave en el expediente: `FechaIngreso`, `RFC`, `CURP`, `NumeroIMSS` o
   domicilio mínimo (calle/colonia/CP/municipio).

En todos los casos el alta ya quedó guardada; el aviso es informativo, no un error de alta.

## Manejo de errores

- Fallo al traer expediente → `showAlert` informativo ("No se pudo generar el contrato: ...").
- Fallo al descargar la plantilla `.docx` → aviso.
- Falta de datos → aviso específico con la lista de faltantes.
- Excepción de `docxtemplater` → aviso, sin romper el flujo del alta.
- Todo el generador va envuelto en try/catch; jamás propaga excepción hacia `guardarEmpleado()`.

## Pruebas / criterios de aceptación

1. **Reproducción del ejemplo:** con los datos reales de Isis (código correspondiente), el
   `.docx` generado debe coincidir en contenido con `CAP-ISIS EVARISTO RAMIREZ.docx`
   (mismos nombre, puesto, fechas, salario, domicilio, actividades del Anexo "A" y dirección
   de sucursal). Verificación principal del diseño.
2. **Puesto sin Anexo:** alta de un puesto distinto de Cajera → no descarga y muestra aviso
   "falta configurar Anexo A para el puesto X".
3. **Sucursal sin dirección:** (no debería ocurrir con las 8) → aviso equivalente.
4. **Expediente incompleto / no encontrado:** aviso; el alta se guarda igual.
5. **Edición de empleado:** no dispara descarga.

## Dependencias externas nuevas (CDN)
- `pizzip` (lector/escritor de ZIP, base de `.docx`).
- `docxtemplater` (motor de plantillas `.docx`).

Ambas se cargan por `<script>` como el resto de librerías del proyecto.
