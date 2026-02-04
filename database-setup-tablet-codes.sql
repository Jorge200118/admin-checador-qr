-- ========================================
-- SCRIPT PARA CREAR TABLA DE CÓDIGOS DE ACCESO DE TABLETS
-- ========================================

-- Crear tabla para códigos de acceso de tablets
CREATE TABLE IF NOT EXISTS tablet_access_codes (
    id BIGSERIAL PRIMARY KEY,
    tablet_id VARCHAR(50) NOT NULL UNIQUE,
    codigo VARCHAR(20) NOT NULL UNIQUE,
    nombre VARCHAR(100),
    descripcion TEXT,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices para búsquedas rápidas
CREATE INDEX idx_tablet_codigo ON tablet_access_codes(codigo);
CREATE INDEX idx_tablet_activo ON tablet_access_codes(activo);

-- Insertar códigos de ejemplo (puedes modificar estos códigos)
INSERT INTO tablet_access_codes (tablet_id, codigo, nombre, descripcion, activo) VALUES
('TABLET-01', '1234', 'Tablet Principal', 'Tablet en la entrada principal', true),
('TABLET-02', '5678', 'Tablet Recepción', 'Tablet en recepción', true),
('TABLET-03', 'ADMIN', 'Tablet Administración', 'Tablet en oficina administrativa', true)
ON CONFLICT (tablet_id) DO NOTHING;

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para actualizar updated_at
CREATE TRIGGER update_tablet_access_codes_updated_at
    BEFORE UPDATE ON tablet_access_codes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comentarios en la tabla
COMMENT ON TABLE tablet_access_codes IS 'Códigos de acceso para autenticar tablets en el sistema de checador';
COMMENT ON COLUMN tablet_access_codes.tablet_id IS 'Identificador único de la tablet';
COMMENT ON COLUMN tablet_access_codes.codigo IS 'Código de acceso para login';
COMMENT ON COLUMN tablet_access_codes.nombre IS 'Nombre descriptivo de la tablet';
COMMENT ON COLUMN tablet_access_codes.activo IS 'Si el código está activo o no';

-- ========================================
-- INSTRUCCIONES:
-- ========================================
-- 1. Ve a tu proyecto de Supabase: https://supabase.com/dashboard
-- 2. Selecciona tu proyecto: checador-qr
-- 3. En el menú lateral, ve a "SQL Editor"
-- 4. Haz clic en "New Query"
-- 5. Copia y pega todo este script SQL
-- 6. Haz clic en "Run" para ejecutar
--
-- CÓDIGOS DE ACCESO PREDETERMINADOS:
-- - Tablet 01: código "1234"
-- - Tablet 02: código "5678"
-- - Tablet 03: código "ADMIN"
--
-- Para cambiar los códigos o agregar más tablets, ejecuta:
-- UPDATE tablet_access_codes SET codigo = 'NUEVO_CODIGO' WHERE tablet_id = 'TABLET-01';
--
-- Para agregar una nueva tablet:
-- INSERT INTO tablet_access_codes (tablet_id, codigo, nombre, descripcion)
-- VALUES ('TABLET-04', 'MICOD', 'Nueva Tablet', 'Descripción');
