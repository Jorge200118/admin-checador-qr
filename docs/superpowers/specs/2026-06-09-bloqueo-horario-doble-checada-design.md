# Bloqueo de Horario + Doble Checada (Fase 1-A) — Diseño

**Fecha:** 2026-06-09
**Estado:** Aprobado para implementación
**Alcance:** PWA (`V3 Checador-PWA`) + Tablet (`v2 Checador-Tablet`) + Admin (`V2 checador-system ADMIN`)
**Sin cambios de schema.**

## Contexto y motivación

El sistema de checador permite hoy registrar una ENTRADA a **cualquier hora**: la
función `getBloqueValido` (duplicada en PWA y Tablet) acepta una entrada desde 15 min
antes hasta **600 min después** (10 horas) de la hora del bloque. En la práctica nunca
bloquea por llegar tarde. La "llegada tarde" es solo una marca visual roja en reportes,
sin consecuencia automática.

Operativamente, la empresa **regresa a casa** a quien llega tarde (no trabaja ese turno).
El sistema no refleja esa regla: el empleado tardío igual puede checar.

Este es el primer entregable de un plan más amplio (4 puntos autorizados):

1. **Bloquear al que llega tarde** — esta spec.
2. **Exigir las dos checadas del día** — esta spec (detección; el recordatorio WhatsApp es F1-B).
3. Checada segura para personal en ruta — Fase 2 (futura).
4. Empleados exentos del checador — Fase 3 (futura).

## Modelo de horario (cómo funciona la jornada)

La jornada se compone de **bloques de horario** (ya modelados en `bloques_horario`).
Cada bloque es una **ventana abierta**: el empleado puede entrar y salir las veces que
quiera dentro del bloque, siempre que su **primera entrada del bloque haya sido a tiempo**.

Horario real de la empresa (`horario_id = 2`, "Horario Partido Oficina", 188 empleados):

| Día        | Bloque 1 (mañana)      | Bloque 2 (tarde)        |
|------------|------------------------|-------------------------|
| Lun–Vie    | 8:00 – 13:00           | 14:30 – 18:00           |
| Sábado     | 8:00 – 13:30           | (no aplica)             |

Topes de entrada (configurables vía `bloques_horario.tolerancia_entrada_min`):

- Bloque 1: entrada válida hasta **hora_entrada + tolerancia**.
- Bloque 2: entrada válida hasta **hora_entrada + tolerancia**.

El valor de tolerancia se decide en la BD y es ajustable en cualquier momento sin tocar
código. **Para esta fase se deja en 20 min** → tope 8:20 (bloque 1) y 2:50 (bloque 2).
El operador puede bajarlo a 10 (tope 8:10) o lo que decida después.

## Objetivos

1. **Bloquear la primera entrada tardía de cada bloque.** Si la primera entrada de un
   bloque llega después del tope, el sistema la **rechaza** (no la registra).
2. **Sin límite inferior.** Checar temprano siempre se permite (puede checar a las 6:00).
3. **Re-entrada libre dentro del bloque.** Una vez abierto el bloque con una entrada a
   tiempo, las siguientes entradas/salidas de ese bloque pasan sin validar hora.
4. **Salidas sin bloqueo.** Nunca se castiga a quien se queda más tiempo.
5. **Detectar turno tarde no cubierto.** Si abrió el bloque 1 pero nunca el bloque 2
   (en día L-V), el reporte lo marca como media falta.
6. **Aplicar en PWA y Tablet por igual** (las dos vías de checado).

## No-objetivos (YAGNI)

- **No** recordatorio por WhatsApp. Es un job programado que depende del bot externo
  (BotSucursales); se diseña aparte como **Fase 1-B**.
- **No** bloqueo de salidas.
- **No** clasificación de empleados (ruta/exento). Eso es Fase 2 y 3.
- **No** trigger/RPC en la base de datos. La validación vive en el cliente, coherente
  con el modelo actual (anon key compartida, RLS sin user enforcement, validación en UI).
  Se endurecerá cuando se migre a Supabase Auth real.
- **No** lógica de bloque 2 en sábado (el sábado solo tiene bloque 1).
- **No** cambios de schema. `tolerancia_entrada_min` ya existe en `bloques_horario`.

## La regla central (validación de ENTRADA)

```
Al intentar ENTRADA:
  (la validación de secuencia existente NO cambia: validarRegistro sigue
   exigiendo alternar ENTRADA → SALIDA → ENTRADA; eso ya funciona bien)

  bloque = bloqueQueCorrespondeAhora()   // bloque 1 o bloque 2 según la hora actual
  yaAbierto = existeEntradaHoyDentroDeEseBloque(empleado, bloque)
              // = ya hay una ENTRADA registrada hoy cuya hora cae dentro
              //   de la ventana [hora_entrada, hora_salida] de ese bloque

  si yaAbierto:
      PERMITIR                            // re-entrada (regresó del baño/mandado);
                                          // ya checó a tiempo, no se valida tope
  si no:
      topeMax = bloque.hora_entrada + bloque.tolerancia_entrada_min
      si horaActual <= topeMax:
          PERMITIR                        // primera entrada a tiempo → abre el bloque
      si no:
          RECHAZAR "Fuera de horario. La entrada al turno cerró a las {topeMax}.
                    Repórtalo con tu jefe."

Al intentar SALIDA:
  PERMITIR siempre que la secuencia sea válida (hay entrada abierta)   // sin tope de hora
```

Notas:

- **"bloqueQueCorrespondeAhora":** un instante pertenece al bloque cuya ventana
  `[hora_entrada, hora_salida]` lo contiene. El **hueco de comida** (13:00–14:30) se
  trata como inicio anticipado del bloque 2 (alguien que regresó temprano de comer);
  como el bloque 2 no tiene límite inferior, se permite y abre el bloque 2.
- **Hora local de Mazatlán** (UTC-7, sin DST) en ambos clientes. Ver bug de la tablet abajo.

## Archivos que se tocan

### PWA — `V3 Checador-PWA`
- Nuevo archivo de lógica pura `bloqueo-horario.js` (regla de ENTRADA con tope, mapeo
  de bloque, "¿ya hay entrada de este bloque hoy?"), con tests en browser siguiendo el
  patrón de `tests/vacaciones.test.html`.
- `supabase-config.js`: nueva `validarHorarioEntrada` (usa la lógica pura);
  `getBloqueValido` queda **solo para SALIDA** (desaparece la ventana de 600 min).
- `views/captura.js`: una ENTRADA rechazada muestra el mensaje y no registra.
- **`validarRegistro` NO se toca**: la secuencia alternada ENTRADA→SALIDA→ENTRADA ya
  funciona correctamente y se conserva tal cual.

### Tablet — `v2 Checador-Tablet/supabase-config.js`
- **Misma corrección que la PWA, idéntica.** Mantener ambas copias iguales (se acordó
  no extraer a archivo compartido en esta fase; anotado aquí para no olvidar tocar
  ambos repos).
- **Bug adicional a corregir:** la tablet calcula la hora con
  `ahora.toISOString().substring(11,19)`, que da hora **UTC** (corrida 7 h respecto a
  Mazatlán). Cambiar a hora local de Mazatlán, igual que la PWA. Sin este fix, el tope
  se evaluaría con la hora equivocada.

### Admin — `V2 checador-system ADMIN`
- **Reporte de faltas por rango** (`Admin.js`, `obtenerEmpleadosSinEntradaRango`):
  detectar "abrió bloque 1 pero no bloque 2" en día L-V → agregar fila con observación
  **"Turno tarde no cubierto"**. Sábado no se exige bloque 2. Lógica pura en nuevo
  `faltas-pm.js` con tests. El dashboard NO cambia en esta fase.

## Detección de falta PM (objetivo 5)

Para un empleado en un día **L-V**:

- Tiene ≥1 ENTRADA en bloque 1 pero **ninguna** ENTRADA en bloque 2 →
  marcar **"Turno tarde no cubierto"**.
- **Sábado:** no aplica (no hay bloque 2).
- Es solo **detección/reporte** en esta fase. El recordatorio WhatsApp es Fase 1-B.

**Regla de valor para nómina (a futuro, fuera de esta fase):** un día completo vale
**1.0**; un día con turno tarde no cubierto vale **0.5** (media falta). En esta fase el
sistema solo *marca* el día; el cálculo del descuento se implementa después.

## Riesgos y notas

- **Validación en cliente:** un usuario técnico podría saltar el bloqueo pegándole
  directo a la API de Supabase. Aceptable en el contexto actual (todo el sistema confía
  en el cliente con anon key). Se endurece con la futura migración a Supabase Auth.
- **Mantener las dos copias sincronizadas:** PWA y Tablet deben quedar idénticas en la
  lógica de validación. Cualquier cambio futuro a la regla debe aplicarse en ambos repos.
- **PRACTICANTES** (`horario_id = 1016`, `tolerancia_entrada_min = 360`): con la nueva
  regla, su tope de entrada queda en 8:00 + 360 min = 14:00. Es coherente con su uso
  actual (tolerancia gigante = casi sin bloqueo). **No se tocan en esta fase** (decisión
  explícita del operador).
