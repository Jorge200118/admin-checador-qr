# Bloqueo de Horario + Doble Checada (Fase 1-A) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rechazar la primera ENTRADA tardía de cada bloque de horario (tope = `hora_entrada + tolerancia_entrada_min`) en PWA y Tablet, y detectar "Turno tarde no cubierto" en el reporte de faltas del Admin.

**Architecture:** La regla vive en un archivo de lógica pura (`bloqueo-horario.js`) **copiado idéntico** en PWA y Tablet (decisión de spec: no hay build compartido entre repos). Cada cliente obtiene sus datos (bloques + entradas de hoy) y llama la función pura. El Admin tiene su propia función pura (`faltas-pm.js`) para la detección de media falta. Sin cambios de schema; la tolerancia se configura en la BD (queda en 20 min).

**Tech Stack:** JavaScript vanilla en browser (sin bundler), Supabase JS v2 (anon key), tests en páginas HTML siguiendo el patrón de `tests/vacaciones.test.html`.

**Spec:** `docs/superpowers/specs/2026-06-09-bloqueo-horario-doble-checada-design.md`

**Repos involucrados:**

| Repo | Ruta |
|---|---|
| PWA | `C:\Users\USUARIO\Desktop\V3 Checador-PWA` |
| Tablet | `C:\Users\USUARIO\Desktop\v2 Checador-Tablet` |
| Admin | `C:\Users\USUARIO\Desktop\V2 checador-system ADMIN` |

**Reglas de negocio clave (de la spec):**

- ENTRADA: solo tope máximo (`hora_entrada + tolerancia_entrada_min`), **sin mínimo** (checar a las 6:00 es válido).
- Una vez "abierto" un bloque (hay ENTRADA de hoy que pertenece a él), las re-entradas de ese bloque pasan **sin validar tope**.
- SALIDA: nunca se bloquea por hora.
- Sábado: solo aplica el bloque 1.
- `validarRegistro` (secuencia alternada ENTRADA→SALIDA) **NO se toca** en ningún repo.
- Hueco de comida (13:01–14:29): una ENTRADA ahí pertenece al bloque 2 (regresó temprano).
- Hora: se usa la hora **local del dispositivo** (los registros se guardan así; todas las sucursales son UTC-7). Esto además corrige el bug de la tablet que usaba UTC.

---

## Task 1: Lógica pura `bloqueo-horario.js` en la PWA (con tests)

**Files:**
- Create: `C:\Users\USUARIO\Desktop\V3 Checador-PWA\bloqueo-horario.js`
- Create: `C:\Users\USUARIO\Desktop\V3 Checador-PWA\tests\bloqueo-horario.test.html`

- [ ] **Step 1: Escribir la página de tests (fallarán primero)**

Crear `tests\bloqueo-horario.test.html` (la carpeta `tests\` no existe en la PWA; crearla):

```html
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Bloqueo horario tests</title>
<style>body{font-family:monospace;padding:20px}.ok{color:#16a34a}.fail{color:#dc2626}</style>
</head><body>
<h1>Bloqueo de horario — pruebas</h1>
<div id="out"></div>
<script src="../bloqueo-horario.js"></script>
<script>
const out = document.getElementById('out');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); out.innerHTML += `<div class="ok">✓ ${name}</div>`; pass++; }
  catch (e) { out.innerHTML += `<div class="fail">✗ ${name}: ${e.message}</div>`; fail++; }
}
function eq(a, b, msg='') {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(`${msg} expected ${B} got ${A}`);
}
window.addEventListener('load', () => {
  // Bloques del Horario Partido Oficina con tolerancia 20 (la config real de la BD)
  const BLOQUES = [
    { id: 1, orden_bloque: 1, hora_entrada: '08:00:00', hora_salida: '13:00:00', tolerancia_entrada_min: 20, tolerancia_salida_min: 15 },
    { id: 2, orden_bloque: 2, hora_entrada: '14:30:00', hora_salida: '18:00:00', tolerancia_entrada_min: 20, tolerancia_salida_min: 15 }
  ];
  const min = (h, m) => h * 60 + m;

  // === bhMinutosDe / bhMinutosDeFechaHora ===
  test('bhMinutosDe 08:00:00 = 480', () => eq(bhMinutosDe('08:00:00'), 480));
  test('bhMinutosDe 14:30 = 870', () => eq(bhMinutosDe('14:30'), 870));
  test('bhMinutosDeFechaHora con espacio', () => eq(bhMinutosDeFechaHora('2026-06-10 08:05:00.123'), 485));
  test('bhMinutosDeFechaHora con T', () => eq(bhMinutosDeFechaHora('2026-06-10T08:05:00'), 485));

  // === bhBloqueParaMinuto ===
  test('06:00 pertenece al bloque 1 (sin mínimo)', () => eq(bhBloqueParaMinuto(BLOQUES, min(6,0)).id, 1));
  test('12:59 pertenece al bloque 1', () => eq(bhBloqueParaMinuto(BLOQUES, min(12,59)).id, 1));
  test('13:30 (hueco comida) pertenece al bloque 2', () => eq(bhBloqueParaMinuto(BLOQUES, min(13,30)).id, 2));
  test('14:35 pertenece al bloque 2', () => eq(bhBloqueParaMinuto(BLOQUES, min(14,35)).id, 2));
  test('19:00 (después del fin) pertenece al bloque 2', () => eq(bhBloqueParaMinuto(BLOQUES, min(19,0)).id, 2));

  // === bhEvaluarEntrada: bloque 1, primera entrada ===
  test('primera entrada 07:50 → permitida', () => {
    eq(bhEvaluarEntrada(BLOQUES, [], min(7,50), false).permitido, true);
  });
  test('primera entrada 06:00 → permitida (sin mínimo)', () => {
    eq(bhEvaluarEntrada(BLOQUES, [], min(6,0), false).permitido, true);
  });
  test('primera entrada 08:20 exacto (tope) → permitida', () => {
    eq(bhEvaluarEntrada(BLOQUES, [], min(8,20), false).permitido, true);
  });
  test('primera entrada 08:21 → rechazada', () => {
    const r = bhEvaluarEntrada(BLOQUES, [], min(8,21), false);
    eq(r.permitido, false);
    if (!r.mensaje.includes('08:20')) throw new Error('mensaje debe decir 08:20: ' + r.mensaje);
  });
  test('primera entrada 10:00 → rechazada (ya no es ventana de 600 min)', () => {
    eq(bhEvaluarEntrada(BLOQUES, [], min(10,0), false).permitido, false);
  });

  // === bhEvaluarEntrada: re-entrada (bloque abierto) ===
  test('re-entrada 10:00 con entrada previa 08:05 → permitida', () => {
    eq(bhEvaluarEntrada(BLOQUES, [min(8,5)], min(10,0), false).permitido, true);
  });
  test('re-entrada 08:21 con entrada previa 06:30 → permitida (bloque 1 abierto)', () => {
    eq(bhEvaluarEntrada(BLOQUES, [min(6,30)], min(8,21), false).permitido, true);
  });

  // === bhEvaluarEntrada: bloque 2 ===
  test('entrada 13:30 (hueco, regresó temprano) → permitida, abre bloque 2', () => {
    const r = bhEvaluarEntrada(BLOQUES, [min(8,5)], min(13,30), false);
    eq(r.permitido, true);
    eq(r.bloque.id, 2);
  });
  test('entrada 14:50 exacto (tope PM) → permitida', () => {
    eq(bhEvaluarEntrada(BLOQUES, [min(8,5)], min(14,50), false).permitido, true);
  });
  test('entrada 14:51 sin bloque 2 abierto → rechazada', () => {
    const r = bhEvaluarEntrada(BLOQUES, [min(8,5)], min(14,51), false);
    eq(r.permitido, false);
    if (!r.mensaje.includes('14:50')) throw new Error('mensaje debe decir 14:50: ' + r.mensaje);
  });
  test('entrada 14:51 con bloque 2 ya abierto (entró 13:40) → permitida', () => {
    eq(bhEvaluarEntrada(BLOQUES, [min(8,5), min(13,40)], min(14,51), false).permitido, true);
  });
  test('entrada previa del bloque 1 NO abre el bloque 2', () => {
    eq(bhEvaluarEntrada(BLOQUES, [min(8,5), min(11,0)], min(15,0), false).permitido, false);
  });

  // === bhEvaluarEntrada: sábado (solo bloque 1) ===
  test('sábado entrada 08:15 → permitida', () => {
    eq(bhEvaluarEntrada(BLOQUES, [], min(8,15), true).permitido, true);
  });
  test('sábado entrada 14:35 sin entrada previa → rechazada (no hay bloque 2)', () => {
    const r = bhEvaluarEntrada(BLOQUES, [], min(14,35), true);
    eq(r.permitido, false);
    if (!r.mensaje.includes('08:20')) throw new Error('el tope del sábado es el del bloque 1: ' + r.mensaje);
  });
  test('sábado re-entrada 11:00 con entrada previa 08:00 → permitida', () => {
    eq(bhEvaluarEntrada(BLOQUES, [min(8,0)], min(11,0), true).permitido, true);
  });

  // === bhEvaluarEntrada: casos límite ===
  test('sin bloques → permitida (empleado sin horario)', () => {
    eq(bhEvaluarEntrada([], [], min(10,0), false).permitido, true);
    eq(bhEvaluarEntrada(null, [], min(10,0), false).permitido, true);
  });
  test('tolerancia null → default 15 (tope 08:15)', () => {
    const b = [{ id: 9, orden_bloque: 1, hora_entrada: '08:00:00', hora_salida: '13:00:00', tolerancia_entrada_min: null }];
    eq(bhEvaluarEntrada(b, [], min(8,15), false).permitido, true);
    eq(bhEvaluarEntrada(b, [], min(8,16), false).permitido, false);
  });
  test('PRACTICANTES (tolerancia 360, un bloque) → tope 14:00', () => {
    const b = [{ id: 8, orden_bloque: 1, hora_entrada: '08:00:00', hora_salida: '19:00:00', tolerancia_entrada_min: 360 }];
    eq(bhEvaluarEntrada(b, [], min(14,0), false).permitido, true);
    eq(bhEvaluarEntrada(b, [], min(14,1), false).permitido, false);
  });

  out.innerHTML += `<h2>${pass} pasaron, ${fail} fallaron</h2>`;
});
</script>
</body></html>
```

- [ ] **Step 2: Abrir la página y verificar que falla**

Abrir `C:\Users\USUARIO\Desktop\V3 Checador-PWA\tests\bloqueo-horario.test.html` en el navegador (doble clic; funciona con `file://`).
Esperado: todos los tests en rojo con "bhMinutosDe is not defined" (el archivo `../bloqueo-horario.js` aún no existe → 404 del script, los tests truenan).

- [ ] **Step 3: Crear `bloqueo-horario.js`**

Crear `C:\Users\USUARIO\Desktop\V3 Checador-PWA\bloqueo-horario.js` con este contenido exacto:

```js
// Lógica pura de bloqueo de horario (Fase 1-A).
// Sin dependencias de Supabase ni del DOM, para poder probarla en tests/.
// COPIA IDÉNTICA en V3 Checador-PWA y v2 Checador-Tablet — cualquier cambio
// aquí debe replicarse en el otro repo.

// '08:00:00' -> 480 (minutos desde medianoche)
function bhMinutosDe(horaStr) {
    const p = horaStr.split(':');
    return parseInt(p[0], 10) * 60 + parseInt(p[1] || '0', 10);
}

// 'YYYY-MM-DD HH:mm:ss' o 'YYYY-MM-DDTHH:mm:ss' -> minutos desde medianoche.
// Se parsea el string directo: registros.fecha_hora es timestamp SIN zona y la
// hora guardada ya es la hora local del dispositivo que checó.
function bhMinutosDeFechaHora(fechaHoraStr) {
    const horaPart = fechaHoraStr.includes('T')
        ? fechaHoraStr.split('T')[1]
        : fechaHoraStr.split(' ')[1];
    return bhMinutosDe(horaPart);
}

// ¿A qué bloque pertenece un instante? Al primero cuyo fin (hora_salida) no
// haya pasado. Antes de la entrada del bloque 1 → bloque 1 (no hay mínimo).
// El hueco de comida → bloque 2 (regresó temprano de comer). Después del fin
// del último bloque → el último bloque.
function bhBloqueParaMinuto(bloques, minutos) {
    for (const b of bloques) {
        if (minutos <= bhMinutosDe(b.hora_salida)) return b;
    }
    return bloques[bloques.length - 1];
}

// Regla central de la spec 2026-06-09: evalúa si una ENTRADA se permite.
//   bloques        filas de bloques_horario ordenadas por orden_bloque
//   entradasHoyMin minutos de las ENTRADAs ya registradas hoy
//   ahoraMin       minutos desde medianoche (hora local del dispositivo)
//   esSabado       true si hoy es sábado (solo aplica el bloque 1)
// Devuelve { permitido, bloque, mensaje }.
function bhEvaluarEntrada(bloques, entradasHoyMin, ahoraMin, esSabado) {
    // Sin horario/bloques no hay regla que aplicar (no rompemos a esos empleados).
    if (!bloques || bloques.length === 0) {
        return { permitido: true, bloque: null, mensaje: null };
    }

    const activos = esSabado ? [bloques[0]] : bloques;
    const bloque = bhBloqueParaMinuto(activos, ahoraMin);

    // Bloque ya abierto: alguna entrada de hoy pertenece a este mismo bloque.
    const yaAbierto = entradasHoyMin.some(
        m => bhBloqueParaMinuto(activos, m).id === bloque.id
    );
    if (yaAbierto) return { permitido: true, bloque, mensaje: null };

    const tolerancia = (bloque.tolerancia_entrada_min === null || bloque.tolerancia_entrada_min === undefined)
        ? 15 : bloque.tolerancia_entrada_min;
    const tope = bhMinutosDe(bloque.hora_entrada) + tolerancia;
    if (ahoraMin <= tope) return { permitido: true, bloque, mensaje: null };

    const hh = String(Math.floor(tope / 60)).padStart(2, '0');
    const mm = String(tope % 60).padStart(2, '0');
    return {
        permitido: false,
        bloque,
        mensaje: `Fuera de horario. La entrada al turno cerró a las ${hh}:${mm}. Repórtalo con tu jefe.`
    };
}
```

- [ ] **Step 4: Verificar que los tests pasan**

Recargar `tests\bloqueo-horario.test.html` en el navegador.
Esperado: "27 pasaron, 0 fallaron" (todos en verde).

- [ ] **Step 5: Commit (repo PWA)**

```bash
cd "C:\Users\USUARIO\Desktop\V3 Checador-PWA"
git add bloqueo-horario.js tests/bloqueo-horario.test.html
git commit -m "Bloqueo de horario: logica pura de tope de entrada + tests"
```

---

## Task 2: Integrar el bloqueo en la PWA

**Files:**
- Modify: `C:\Users\USUARIO\Desktop\V3 Checador-PWA\index.html` (línea ~43)
- Modify: `C:\Users\USUARIO\Desktop\V3 Checador-PWA\supabase-config.js` (RegistroAPI: nueva función `validarHorarioEntrada`; `getBloqueValido` queda solo para SALIDA)
- Modify: `C:\Users\USUARIO\Desktop\V3 Checador-PWA\views\captura.js` (función `enviar`, líneas ~140-176)

- [ ] **Step 1: Incluir el script en `index.html`**

En `index.html`, antes de la línea `<script defer src="supabase-config.js"></script>` (línea 43), agregar:

```html
    <script defer src="bloqueo-horario.js"></script>
```

- [ ] **Step 2: Agregar `validarHorarioEntrada` a `RegistroAPI` en `supabase-config.js`**

Insertar este método dentro de `RegistroAPI`, justo después de `validarRegistro` (que termina en la línea ~188; **`validarRegistro` no se modifica**):

```js
    // Valida el tope de hora de una ENTRADA (Fase 1-A, spec 2026-06-09).
    // La secuencia ENTRADA/SALIDA la sigue validando validarRegistro.
    async validarHorarioEntrada(empleado) {
        if (!empleado.horario_id) return { permitido: true, bloque: null, mensaje: null };

        const { data: bloques, error } = await supabaseClient
            .from('bloques_horario')
            .select('*')
            .eq('horario_id', empleado.horario_id)
            .order('orden_bloque');
        if (error) {
            console.error('Error leyendo bloques:', error);
            // Fail-closed, mismo criterio que la geocerca: sin la regla no se checa.
            return { permitido: false, bloque: null, mensaje: 'No se pudo verificar tu horario. Revisa tu internet e intenta de nuevo.' };
        }

        const regs = await this.getRegistrosHoy(empleado.id);
        const entradasMin = regs
            .filter(r => r.tipo_registro === 'ENTRADA')
            .map(r => bhMinutosDeFechaHora(r.fecha_hora));

        const ahora = new Date();
        const ahoraMin = ahora.getHours() * 60 + ahora.getMinutes();
        return bhEvaluarEntrada(bloques, entradasMin, ahoraMin, ahora.getDay() === 6);
    },
```

- [ ] **Step 3: Reducir `getBloqueValido` a solo SALIDA en `supabase-config.js`**

Reemplazar la función `getBloqueValido` completa (líneas ~190-220) por:

```js
    // Solo para SALIDA: encuentra el bloque cuya hora_salida cae dentro de la
    // tolerancia. Las ENTRADAs se validan con validarHorarioEntrada (Fase 1-A).
    async getBloqueValido(horarioId, tipoRegistro) {
        if (!horarioId || tipoRegistro !== 'SALIDA') return null;

        const { data: bloques } = await supabaseClient
            .from('bloques_horario')
            .select('*')
            .eq('horario_id', horarioId)
            .order('orden_bloque');
        if (!bloques || bloques.length === 0) return null;

        const ahora = new Date();
        const ahoraMin = ahora.getHours() * 60 + ahora.getMinutes();
        for (const b of bloques) {
            const tol = b.tolerancia_salida_min || 15;
            const salida = bhMinutosDe(b.hora_salida);
            if (ahoraMin >= salida - tol && ahoraMin <= salida + tol) return b;
        }
        return null;
    },
```

- [ ] **Step 4: Modificar `enviar` en `views\captura.js`**

Reemplazar estas líneas de `enviar` (las que obtienen el bloque, ~151):

```js
        const bloque = await RegistroAPI.getBloqueValido(emp.horario_id, tipo);
```

por:

```js
        let bloque = null;
        if (tipo === 'ENTRADA') {
            const horario = await RegistroAPI.validarHorarioEntrada(emp);
            if (!horario.permitido) {
                showLoading(false);
                showToast(horario.mensaje, 'error');
                return Router.go('check');
            }
            bloque = horario.bloque;
        } else {
            bloque = await RegistroAPI.getBloqueValido(emp.horario_id, tipo);
        }
```

(El resto de `enviar` queda igual: `crearRegistro` ya recibe `bloqueId: bloque ? bloque.id : null`.)

- [ ] **Step 5: Verificación manual (smoke test)**

Con un **empleado de prueba** (no uno real) vinculado en la PWA:
1. Abrir la PWA, intentar CHECK IN después del tope del bloque actual (o temporalmente poner `tolerancia_entrada_min = 1` al horario del empleado de prueba en la BD para forzar el caso).
2. Esperado: toast rojo "Fuera de horario. La entrada al turno cerró a las HH:MM. Repórtalo con tu jefe." y NO se crea fila en `registros`.
3. Restaurar la tolerancia del empleado de prueba.
4. Verificar que un CHECK IN dentro de la ventana sí registra (toast verde) y que el CHECK OUT sigue funcionando.

- [ ] **Step 6: Commit (repo PWA)**

```bash
cd "C:\Users\USUARIO\Desktop\V3 Checador-PWA"
git add index.html supabase-config.js views/captura.js
git commit -m "Bloqueo de horario: rechazar entrada tardia en PWA"
```

---

## Task 3: Integrar el bloqueo en la Tablet (+ fix de hora UTC)

**Files:**
- Create: `C:\Users\USUARIO\Desktop\v2 Checador-Tablet\bloqueo-horario.js` (copia idéntica del de la PWA)
- Modify: `C:\Users\USUARIO\Desktop\v2 Checador-Tablet\Index.html` (línea ~162)
- Modify: `C:\Users\USUARIO\Desktop\v2 Checador-Tablet\supabase-config.js` (`validateQR` líneas ~78-86; `getBloqueValido` líneas ~180-233; nueva `getEntradasHoy` y `validarHorarioEntrada`)

- [ ] **Step 1: Copiar `bloqueo-horario.js` y verificar que es idéntico**

```powershell
Copy-Item "C:\Users\USUARIO\Desktop\V3 Checador-PWA\bloqueo-horario.js" "C:\Users\USUARIO\Desktop\v2 Checador-Tablet\bloqueo-horario.js"
fc.exe /b "C:\Users\USUARIO\Desktop\V3 Checador-PWA\bloqueo-horario.js" "C:\Users\USUARIO\Desktop\v2 Checador-Tablet\bloqueo-horario.js"
```

Esperado: `FC: no se han encontrado diferencias` (o "no differences encountered").

- [ ] **Step 2: Incluir el script en `Index.html` de la tablet**

Antes de la línea `<script src="supabase-config.js"></script>` (línea 162), agregar:

```html
    <script src="bloqueo-horario.js"></script>
```

- [ ] **Step 3: Agregar `getEntradasHoy` y `validarHorarioEntrada` a `SupabaseAPI` de la tablet**

En `supabase-config.js` de la tablet, insertar después de `validarRegistro` (termina ~línea 178; **`validarRegistro` no se modifica**):

```js
    // Entradas de hoy del empleado (para la validación de horario, Fase 1-A)
    async getEntradasHoy(empleadoId) {
        const hoy = new Date();
        const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
        const finHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59);
        const { data, error } = await supabaseClient
            .from('registros')
            .select('tipo_registro, fecha_hora')
            .eq('empleado_id', empleadoId)
            .eq('tipo_registro', 'ENTRADA')
            .gte('fecha_hora', inicioHoy.toISOString())
            .lte('fecha_hora', finHoy.toISOString());
        if (error) { console.error('Error leyendo entradas de hoy:', error); return null; }
        return data || [];
    },

    // Valida el tope de hora de una ENTRADA (Fase 1-A, spec 2026-06-09).
    // La secuencia ENTRADA/SALIDA la sigue validando validarRegistro.
    async validarHorarioEntrada(empleado) {
        if (!empleado.horario_id) return { permitido: true, bloque: null, mensaje: null };

        const { data: bloques, error } = await supabaseClient
            .from('bloques_horario')
            .select('*')
            .eq('horario_id', empleado.horario_id)
            .order('orden_bloque');
        if (error) {
            console.error('Error leyendo bloques:', error);
            return { permitido: false, bloque: null, mensaje: 'No se pudo verificar tu horario. Intenta de nuevo.' };
        }

        const regs = await this.getEntradasHoy(empleado.id);
        if (regs === null) {
            return { permitido: false, bloque: null, mensaje: 'No se pudo verificar tus registros. Intenta de nuevo.' };
        }
        const entradasMin = regs.map(r => bhMinutosDeFechaHora(r.fecha_hora));

        const ahora = new Date();
        const ahoraMin = ahora.getHours() * 60 + ahora.getMinutes();
        return bhEvaluarEntrada(bloques, entradasMin, ahoraMin, ahora.getDay() === 6);
    },
```

- [ ] **Step 4: Modificar `validateQR` para rechazar entradas fuera de hora**

En `validateQR`, reemplazar el bloque de "Buscar bloque de horario válido" (líneas 78-86):

```js
            // Buscar bloque de horario válido
            let bloqueId = null;
            if (qrData.empleado.horario_id) {
                const bloque = await this.getBloqueValido(
                    qrData.empleado.horario_id,
                    tipoRegistro
                );
                bloqueId = bloque?.id || null;
            }
```

por:

```js
            // Validar tope de hora (ENTRADA) y buscar bloque de horario (Fase 1-A)
            let bloqueId = null;
            if (tipoRegistro === 'ENTRADA') {
                const horario = await this.validarHorarioEntrada(qrData.empleado);
                if (!horario.permitido) {
                    return {
                        success: false,
                        message: horario.mensaje
                    };
                }
                bloqueId = horario.bloque?.id || null;
            } else if (qrData.empleado.horario_id) {
                const bloque = await this.getBloqueValido(
                    qrData.empleado.horario_id,
                    tipoRegistro
                );
                bloqueId = bloque?.id || null;
            }
```

- [ ] **Step 5: Reemplazar `getBloqueValido` de la tablet (fix UTC + solo SALIDA)**

Reemplazar la función completa (líneas ~180-233). La versión vieja usaba `ahora.toISOString().substring(11, 19)` — eso es hora **UTC**, corrida 7 h respecto a la hora real de las sucursales. La nueva usa hora local (idéntica a la de la PWA):

```js
    // Solo para SALIDA: encuentra el bloque cuya hora_salida cae dentro de la
    // tolerancia. Las ENTRADAs se validan con validarHorarioEntrada (Fase 1-A).
    // Fix: antes usaba toISOString() (hora UTC, corrida 7h); ahora hora local.
    async getBloqueValido(horarioId, tipoRegistro) {
        if (!horarioId || tipoRegistro !== 'SALIDA') return null;

        const { data: bloques } = await supabaseClient
            .from('bloques_horario')
            .select('*')
            .eq('horario_id', horarioId)
            .order('orden_bloque');
        if (!bloques || bloques.length === 0) return null;

        const ahora = new Date();
        const ahoraMin = ahora.getHours() * 60 + ahora.getMinutes();
        for (const b of bloques) {
            const tol = b.tolerancia_salida_min || 15;
            const salida = bhMinutosDe(b.hora_salida);
            if (ahoraMin >= salida - tol && ahoraMin <= salida + tol) return b;
        }
        return null;
    },
```

- [ ] **Step 6: Verificación manual (smoke test)**

Con el QR de un **empleado de prueba** en una tablet (o abriendo `Index.html` de la tablet en el navegador de la PC):
1. Escanear/simular ENTRADA fuera del tope → esperado: mensaje "Fuera de horario…" y NO se crea registro.
2. ENTRADA dentro de la ventana → registra normal.
3. SALIDA → registra normal (sin bloqueo).

- [ ] **Step 7: Commit (repo Tablet)**

```bash
cd "C:\Users\USUARIO\Desktop\v2 Checador-Tablet"
git add bloqueo-horario.js Index.html supabase-config.js
git commit -m "Bloqueo de horario: rechazar entrada tardia en tablet + fix hora UTC"
```

---

## Task 4: Detección "Turno tarde no cubierto" en el Admin (con tests)

**Files:**
- Create: `C:\Users\USUARIO\Desktop\V2 checador-system ADMIN\faltas-pm.js`
- Create: `C:\Users\USUARIO\Desktop\V2 checador-system ADMIN\tests\faltas-pm.test.html`
- Modify: `C:\Users\USUARIO\Desktop\V2 checador-system ADMIN\Index.html` (línea ~1838)
- Modify: `C:\Users\USUARIO\Desktop\V2 checador-system ADMIN\supabase-config.js` (nueva `getBloquesHorario`)
- Modify: `C:\Users\USUARIO\Desktop\V2 checador-system ADMIN\Admin.js` (`obtenerEmpleadosSinEntradaRango` ~1198-1320, `descargarExcelFaltasRango` ~1352)

- [ ] **Step 1: Escribir la página de tests (fallará primero)**

Crear `tests\faltas-pm.test.html`:

```html
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Faltas PM tests</title>
<style>body{font-family:monospace;padding:20px}.ok{color:#16a34a}.fail{color:#dc2626}</style>
</head><body>
<h1>Turno tarde no cubierto — pruebas</h1>
<div id="out"></div>
<script src="../faltas-pm.js"></script>
<script>
const out = document.getElementById('out');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); out.innerHTML += `<div class="ok">✓ ${name}</div>`; pass++; }
  catch (e) { out.innerHTML += `<div class="fail">✗ ${name}: ${e.message}</div>`; fail++; }
}
function eq(a, b, msg='') {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(`${msg} expected ${B} got ${A}`);
}
window.addEventListener('load', () => {
  const BLOQUES = [
    { horario_id: 2, orden_bloque: 1, hora_entrada: '08:00:00', hora_salida: '13:00:00' },
    { horario_id: 2, orden_bloque: 2, hora_entrada: '14:30:00', hora_salida: '18:00:00' }
  ];
  const UN_BLOQUE = [
    { horario_id: 1016, orden_bloque: 1, hora_entrada: '08:00:00', hora_salida: '19:00:00' }
  ];
  const min = (h, m) => h * 60 + m;

  test('entró AM y PM → NO marcado', () =>
    eq(fpTurnoTardeNoCubierto(BLOQUES, [min(8,5), min(14,35)], false), false));
  test('entró AM, nunca PM → marcado', () =>
    eq(fpTurnoTardeNoCubierto(BLOQUES, [min(8,5)], false), true));
  test('entró AM y regresó temprano (13:40, hueco) → NO marcado (abrió bloque 2)', () =>
    eq(fpTurnoTardeNoCubierto(BLOQUES, [min(8,5), min(13,40)], false), false));
  test('varias entradas solo AM (8:05, 11:00) → marcado', () =>
    eq(fpTurnoTardeNoCubierto(BLOQUES, [min(8,5), min(11,0)], false), true));
  test('sin entradas → NO marcado (eso es falta completa, no media)', () =>
    eq(fpTurnoTardeNoCubierto(BLOQUES, [], false), false));
  test('sábado → NO aplica', () =>
    eq(fpTurnoTardeNoCubierto(BLOQUES, [min(8,5)], true), false));
  test('horario de un solo bloque (practicantes) → NO aplica', () =>
    eq(fpTurnoTardeNoCubierto(UN_BLOQUE, [min(9,0)], false), false));
  test('sin bloques → NO aplica', () => {
    eq(fpTurnoTardeNoCubierto(null, [min(8,5)], false), false);
    eq(fpTurnoTardeNoCubierto([], [min(8,5)], false), false);
  });
  test('solo entró PM (faltó AM, no checó mañana) → NO marcado por esta regla', () =>
    eq(fpTurnoTardeNoCubierto(BLOQUES, [min(14,35)], false), false));

  out.innerHTML += `<h2>${pass} pasaron, ${fail} fallaron</h2>`;
});
</script>
</body></html>
```

Nota sobre el último test: si alguien no checó la mañana, con el bloqueo nuevo no pudo entrar y fue **regresado** → ese día ya cuenta como falta completa por la regla existente de "sin entrada AM"… pero ojo: técnicamente sí tiene UNA entrada (la PM), así que no aparece en faltas de "sin registro de entrada". Ese caso queda **fuera de alcance** de esta fase (con el bloqueo activo, no debería poder ocurrir un día PM-sin-AM, salvo datos históricos).

- [ ] **Step 2: Abrir la página y verificar que falla**

Abrir `tests\faltas-pm.test.html` en el navegador.
Esperado: tests en rojo con "fpTurnoTardeNoCubierto is not defined".

- [ ] **Step 3: Crear `faltas-pm.js`**

```js
// Detección de "Turno tarde no cubierto" (Fase 1-A, spec 2026-06-09).
// Lógica pura, sin Supabase ni DOM; se prueba en tests/faltas-pm.test.html.
// Regla de valor para nómina (a futuro): día completo = 1.0, turno tarde
// no cubierto = 0.5. En esta fase solo se MARCA, no se calcula descuento.

function fpMinutosDe(horaStr) {
    const p = horaStr.split(':');
    return parseInt(p[0], 10) * 60 + parseInt(p[1] || '0', 10);
}

// 'YYYY-MM-DD HH:mm:ss' o ISO con T -> minutos desde medianoche (hora guardada).
function fpMinutosDeFechaHora(fechaHoraStr) {
    const horaPart = fechaHoraStr.includes('T')
        ? fechaHoraStr.split('T')[1]
        : fechaHoraStr.split(' ')[1];
    return fpMinutosDe(horaPart);
}

// ¿Abrió el bloque 1 pero nunca el bloque 2?
// Una entrada pertenece al bloque 1 si su hora <= hora_salida del bloque 1;
// después de eso (incluido el hueco de comida) pertenece al bloque 2.
// Solo aplica en días L-V para horarios con 2+ bloques.
function fpTurnoTardeNoCubierto(bloques, entradasMin, esSabado) {
    if (esSabado) return false;
    if (!bloques || bloques.length < 2) return false;
    if (!entradasMin || entradasMin.length === 0) return false; // sin entradas = falta completa

    const finBloque1 = fpMinutosDe(bloques[0].hora_salida);
    const abrioBloque1 = entradasMin.some(m => m <= finBloque1);
    const abrioBloque2 = entradasMin.some(m => m > finBloque1);
    return abrioBloque1 && !abrioBloque2;
}
```

- [ ] **Step 4: Verificar que los tests pasan**

Recargar `tests\faltas-pm.test.html`. Esperado: "9 pasaron, 0 fallaron".

- [ ] **Step 5: Incluir el script en el `Index.html` del admin**

Después de la línea 1838 (`<script src="vacaciones-lft.js"></script>`), agregar:

```html
    <script src="faltas-pm.js"></script>
```

- [ ] **Step 6: Agregar `getBloquesHorario` a `SupabaseAPI` del admin**

En `supabase-config.js` del admin, agregar dentro de `SupabaseAPI` (junto a las demás funciones de horarios, después de `getEmpleadosByHorario` ~línea 599):

```js
    async getBloquesHorario() {
        try {
            const { data, error } = await supabaseClient
                .from('bloques_horario')
                .select('horario_id, orden_bloque, hora_entrada, hora_salida')
                .order('horario_id')
                .order('orden_bloque');
            if (error) throw error;
            return { success: true, data: data || [] };
        } catch (error) {
            return { success: false, message: 'Error al obtener bloques de horario' };
        }
    },
```

- [ ] **Step 7: Integrar la detección en `obtenerEmpleadosSinEntradaRango` (Admin.js)**

**7a.** Después de obtener las justificaciones (línea ~1243, `const justificaciones = ...`), agregar:

```js
        // Bloques por horario, para detectar "Turno tarde no cubierto" (Fase 1-A)
        const bloquesResult = await SupabaseAPI.getBloquesHorario();
        const bloquesPorHorario = {};
        (bloquesResult.success ? bloquesResult.data : []).forEach(b => {
            if (!bloquesPorHorario[b.horario_id]) bloquesPorHorario[b.horario_id] = [];
            bloquesPorHorario[b.horario_id].push(b);
        });
```

**7b.** Dentro del loop de fechas, después del `faltasDia.forEach(...)` que hace push a `todasLasFaltas` (línea ~1298), agregar:

```js
            // Turno tarde no cubierto: checó en la mañana pero nunca abrió el
            // bloque 2 (solo L-V; sin entradas es falta completa, ya cubierta arriba)
            const esSabadoFecha = new Date(fecha + 'T00:00:00').getDay() === 6;
            const entradasPorEmpleado = {};
            registrosFecha.forEach(reg => {
                if (!entradasPorEmpleado[reg.empleado_id]) entradasPorEmpleado[reg.empleado_id] = [];
                entradasPorEmpleado[reg.empleado_id].push(fpMinutosDeFechaHora(reg.fecha_hora));
            });

            empleadosActivos.forEach(emp => {
                if (!empleadosConEntrada.has(emp.id)) return;
                const tieneJustificacion = justificaciones.some(j =>
                    j.tipo !== 'PERMISO_SIN_GOCE' &&
                    j.empleado_id === emp.id &&
                    j.fecha_inicio <= fecha &&
                    j.fecha_fin >= fecha
                );
                if (tieneJustificacion) return;
                const bloquesEmp = bloquesPorHorario[emp.horario_id];
                if (fpTurnoTardeNoCubierto(bloquesEmp, entradasPorEmpleado[emp.id] || [], esSabadoFecha)) {
                    todasLasFaltas.push({
                        fecha_falta: fecha,
                        codigo_empleado: emp.codigo_empleado,
                        nombre_completo: `${emp.nombre} ${emp.apellido}`,
                        sucursal: emp.sucursal,
                        puesto: emp.puesto,
                        horario_nombre: emp.horario_nombre || 'Sin horario',
                        observacion: 'Turno tarde no cubierto'
                    });
                }
            });
```

**7c.** En `descargarExcelFaltasRango` (línea ~1352), actualizar la línea de la nota del CSV:

```js
    csvContent += `Nota: Se excluyen domingos, días festivos LFT y días con justificaciones (vacaciones, incapacidad, permisos)\n\n`;
```

por:

```js
    csvContent += `Nota: Se excluyen domingos, días festivos LFT y días con justificaciones (vacaciones, incapacidad, permisos). "Turno tarde no cubierto" = checó en la mañana pero no en la tarde (media falta)\n\n`;
```

- [ ] **Step 8: Verificación manual**

1. Abrir el admin → sección de faltas → descargar rango que incluya un día donde algún empleado checó solo en la mañana (en datos reales actuales habrá varios).
2. Esperado: el CSV incluye filas con observación "Turno tarde no cubierto" además de las faltas normales, y el conteo total las suma.
3. Verificar que un sábado NO genera filas de turno tarde.

- [ ] **Step 9: Commit (repo Admin)**

```bash
cd "C:\Users\USUARIO\Desktop\V2 checador-system ADMIN"
git add faltas-pm.js tests/faltas-pm.test.html Index.html supabase-config.js Admin.js
git commit -m "Faltas: detectar turno tarde no cubierto en reporte de rango"
```

---

## Task 5: Migración — tolerancia de entrada a 20 min

**Files:**
- Create: `C:\Users\USUARIO\Desktop\V2 checador-system ADMIN\supabase\migrations\2026-06-10_tolerancia_entrada_20.sql`

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- Fase 1-A (spec 2026-06-09): el bloqueo de entrada usa
-- hora_entrada + tolerancia_entrada_min como tope. Valor inicial acordado: 20 min
-- (tope 8:20 bloque mañana, 14:50 bloque tarde). Ajustable sin tocar código.
-- Solo el Horario Partido Oficina; PRACTICANTES (1016) se queda en 360 a propósito.
UPDATE bloques_horario SET tolerancia_entrada_min = 20 WHERE horario_id = 2;
```

- [ ] **Step 2: Aplicar la migración en Supabase**

Aplicar vía MCP de Supabase (`apply_migration`) o ejecutar el UPDATE en el SQL editor.
Verificar con:

```sql
SELECT horario_id, orden_bloque, hora_entrada, tolerancia_entrada_min
FROM bloques_horario WHERE horario_id = 2 ORDER BY orden_bloque;
```

Esperado: ambos bloques con `tolerancia_entrada_min = 20`.

**⚠️ Orden de despliegue:** aplicar esta migración **junto con** (o después de) desplegar los cambios de PWA/Tablet. Aplicarla antes no rompe nada (el código viejo ignora la columna), pero el bloqueo solo arranca cuando el código nuevo esté en producción.

- [ ] **Step 3: Commit (repo Admin)**

```bash
cd "C:\Users\USUARIO\Desktop\V2 checador-system ADMIN"
git add supabase/migrations/2026-06-10_tolerancia_entrada_20.sql
git commit -m "Migracion: tolerancia de entrada a 20 min (horario partido)"
```

---

## Notas para el implementador

- **Tres repos, tres commits independientes.** Push solo cuando Jorge dé el OK (su workflow: main directo, sin PRs).
- **No tocar `validarRegistro`** en ningún repo: la secuencia alternada ENTRADA→SALIDA ya funciona y la spec la conserva.
- **`bloqueo-horario.js` debe quedar byte-idéntico** en PWA y Tablet (verificar con `fc.exe /b`). Si en el futuro cambia la regla, tocar ambos.
- **La PWA tiene un `styles.css` con cambios sin commitear que NO se deben incluir** en los `git add` (nunca usar `git add -A` en ese repo).
- Los empleados **sin `horario_id`** o con horario sin bloques no se bloquean nunca (la regla no aplica, igual que hoy).
- **PRACTICANTES** (horario 1016): un solo bloque con tolerancia 360 → tope 14:00, y al tener <2 bloques nunca se les marca "turno tarde no cubierto". Decisión explícita de la spec.
- El **recordatorio por WhatsApp** (Fase 1-B) NO está en este plan; se diseñará aparte usando el bot de BotSucursales.
