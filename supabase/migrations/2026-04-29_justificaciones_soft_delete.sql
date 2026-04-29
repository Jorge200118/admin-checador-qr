-- Migración: Soft-delete con motivo en justificaciones
-- Fecha: 2026-04-29
-- Descripción: Permite marcar justificaciones como eliminadas sin borrarlas,
--              guardando quién las eliminó, cuándo y por qué.

-- 1. Columnas nuevas (idempotente)
ALTER TABLE justificaciones ADD COLUMN IF NOT EXISTS eliminado_en       timestamptz;
ALTER TABLE justificaciones ADD COLUMN IF NOT EXISTS eliminado_por      text;
ALTER TABLE justificaciones ADD COLUMN IF NOT EXISTS eliminado_motivo   text;

-- 2. Índice parcial para acelerar consultas "no eliminadas"
CREATE INDEX IF NOT EXISTS idx_justificaciones_no_eliminadas
    ON justificaciones (empleado_id, fecha_inicio, fecha_fin)
    WHERE eliminado_en IS NULL;
