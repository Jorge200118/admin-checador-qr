-- Migración: PWA Checador Personal
-- Fecha: 2026-04-23
-- Descripción: Tabla de dispositivos vinculados + columnas de origen y GPS en registros

-- 1. Tabla de dispositivos vinculados al empleado
CREATE TABLE IF NOT EXISTS empleado_dispositivos (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empleado_id         integer NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
    device_id           text UNIQUE NOT NULL,
    pin_hash            text NOT NULL,
    pin_salt            text NOT NULL,
    fecha_vinculacion   timestamp DEFAULT now(),
    ultimo_uso          timestamp,
    activo              boolean DEFAULT true,
    user_agent          text,
    desvinculado_por    text,
    desvinculado_en     timestamp
);

CREATE INDEX IF NOT EXISTS idx_emp_disp_empleado_activo
    ON empleado_dispositivos(empleado_id, activo);

CREATE INDEX IF NOT EXISTS idx_emp_disp_device
    ON empleado_dispositivos(device_id);

-- 2. Columnas nuevas en registros
ALTER TABLE registros ADD COLUMN IF NOT EXISTS latitud numeric(10,7);
ALTER TABLE registros ADD COLUMN IF NOT EXISTS longitud numeric(10,7);
ALTER TABLE registros ADD COLUMN IF NOT EXISTS origen text DEFAULT 'TABLET';

-- Backfill: registros existentes quedan como TABLET
UPDATE registros SET origen = 'TABLET' WHERE origen IS NULL;
