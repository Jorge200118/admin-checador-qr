# Control de Vacaciones — Diseño

**Fecha:** 2026-05-20
**Estado:** Aprobado para implementación

## Objetivo

Dar saldo, historial y reportes de vacaciones por empleado, calculados desde la LFT y desde las justificaciones ya capturadas. Sin tablas nuevas, sin flujo de aprobación, sin prima vacacional.

## Fuente de verdad

`justificaciones` con `tipo='VACACION'`. Todo lo demás es cálculo derivado en cliente.

## Reglas

- **Derecho:** tabla LFT 2023 (art. 76 reformado): 12, 14, 16, 18, 20, +2 por cada bloque de 5 años (6-10 = 22, 11-15 = 24, etc.).
- **Periodo:** del último aniversario al siguiente menos 1 día. Si no cumple 1 año, derecho = 0.
- **Día de vacación:** todo día del rango excepto domingo y festivos LFT. Sábado cuenta. (Mismo helper que `esDiaNoLaborable` en Admin.js:38.)
- **Prescripción:** al cumplir el siguiente aniversario, el saldo del periodo anterior se muestra como 0. No se borra nada de `justificaciones`.
- **Festivos:** extender `FESTIVOS_LFT` para cubrir año actual y siguiente (renovable cada año).
- **Cruce de aniversario:** la justificación se parte; al periodo actual solo cuentan los días dentro de él.
- **29-feb:** en años no bisiestos se trata como 28-feb.
- **Inactivos:** excluidos de reportes; conservan historial en su ficha.

## Módulos nuevos (JS)

- `vacaciones-lft.js` — `diasLFT(añosAntiguedad)`, `periodoActual(fechaIngreso, hoy)`.
- `vacaciones-saldo.js` — `calcularSaldo(empleado, vacacionesDelEmpleado, hoy) → { derecho, tomados, restantes, periodoInicio, periodoFin, fechaLimite }`.

## UI

**Ficha empleado:** bloque "Vacaciones" con periodo, derecho, tomados, restantes, fecha límite, e historial expandible (últimos 5 periodos).

**Modal Nueva Justificación (tipo VACACION):** debajo de `justDiasResumen` mostrar saldo y resultante. Si excede, warning rojo + confirmación al guardar (mismo patrón que traslape en Admin.js:6710). Mismo trato si la fecha cae en periodo ya prescrito.

**Nueva sección sidebar "Vacaciones"** con 3 tabs:
1. **Saldos** — tabla por sucursal con filtros (sucursal, saldo > 0, por vencer < 60 días). Export Excel.
2. **Por vencer** — empleados con aniversario en próximos 60 días y saldo > 0, ordenados por urgencia.
3. **Calendario** — vista mensual por sucursal con chips de quién está fuera cada día.

Listado de Justificaciones existente no se toca.

## Casos borde

- Empleado < 1 año → derecho 0, mostrar fecha en que cumple.
- Justificación que cruza aniversario → solo días dentro del periodo actual descuentan saldo actual.
- Fecha_ingreso 29-feb → aniversario = 28-feb en años no bisiestos.
- Query falla → "No se pudo cargar" + reintentar.

## Validaciones al guardar VACACION

- Excede saldo → confirmación, no bloquea.
- Cae en periodo prescrito → confirmación, no bloquea.
- Comprobante sigue obligatorio.

## Fuera de scope

Prima vacacional, aprobaciones, self-service, cierre automático, saldo manual inicial, reportes a nivel empresa.

## Checklist de pruebas

1. Empleado 0 años → derecho 0.
2. Empleado pasa de 4a11m a 5a → derecho 18 → 20.
3. Saldo 14, capturar 5 días sin domingo/festivo → restan 9.
4. Saldo 14, rango con 1 domingo y 1 festivo → descuenta solo hábiles.
5. Vacación en periodo viejo → no afecta saldo actual; aparece en historial.
6. Excel de Saldos cuadra con tabla.
7. Calendario filtra por sucursal correctamente.
8. Inactivo no aparece en reportes pero sí en su ficha.
