-- Tabla de tablets gestionables desde admin
CREATE TABLE IF NOT EXISTS tablets (
  id BIGSERIAL PRIMARY KEY,
  tablet_id VARCHAR(50) NOT NULL UNIQUE,
  codigo VARCHAR(20) NOT NULL UNIQUE,
  nombre VARCHAR(100) NOT NULL,
  sucursal_codigo VARCHAR(20),
  activo BOOLEAN DEFAULT true NOT NULL,
  bloqueado_en TIMESTAMP,
  bloqueado_motivo TEXT,
  ultimo_uso TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_tablets_codigo ON tablets(codigo);
CREATE INDEX idx_tablets_activo ON tablets(activo);
CREATE INDEX idx_tablets_tablet_id ON tablets(tablet_id);

-- NO se siembra ninguna tablet. La tabla queda vacía intencionalmente:
-- el código '1810' fue vulnerado y todas las tablets se dan de alta desde el admin
-- con códigos autogenerados de 6 dígitos.

-- RLS: permitir SELECT/INSERT/UPDATE con anon key (patrón del proyecto)
ALTER TABLE tablets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tablets_select_anon" ON tablets
  FOR SELECT TO anon USING (true);

CREATE POLICY "tablets_insert_anon" ON tablets
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "tablets_update_anon" ON tablets
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

COMMENT ON TABLE tablets IS 'Inventario de tablets gestionado desde el admin. activo=false equivale a bloqueada.';
COMMENT ON COLUMN tablets.tablet_id IS 'Identificador estable usado en registros.tablet_id. Inmutable.';
COMMENT ON COLUMN tablets.codigo IS 'PIN de acceso que la tablet ingresa para vincularse. Cambiarlo revoca la tablet.';
