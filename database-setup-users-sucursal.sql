-- ============================================
-- SISTEMA DE LOGIN POR SUCURSAL
-- Script de configuración de base de datos
-- ============================================

-- Tabla de usuarios para login por sucursal
CREATE TABLE IF NOT EXISTS usuarios_sucursal (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nombre_completo VARCHAR(200) NOT NULL,
    sucursal VARCHAR(100) NOT NULL,
    rol VARCHAR(50) DEFAULT 'usuario', -- 'admin', 'gerente', 'usuario'
    empleado_id INT REFERENCES empleados(id) ON DELETE SET NULL,
    activo BOOLEAN DEFAULT true,
    ultimo_acceso TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices para usuarios_sucursal
CREATE INDEX idx_usuarios_sucursal_username ON usuarios_sucursal(username);
CREATE INDEX idx_usuarios_sucursal_sucursal ON usuarios_sucursal(sucursal);
CREATE INDEX idx_usuarios_sucursal_activo ON usuarios_sucursal(activo);
CREATE INDEX idx_usuarios_sucursal_empleado ON usuarios_sucursal(empleado_id);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION actualizar_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger
CREATE TRIGGER trigger_usuarios_sucursal_updated_at
    BEFORE UPDATE ON usuarios_sucursal
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_updated_at();

-- ============================================
-- DATOS INICIALES
-- ============================================

-- Usuarios administradores por sucursal (password: admin123)
-- IMPORTANTE: Cambiar las contraseñas en producción
-- Hash generado con: bcrypt.hash('admin123', 10)
INSERT INTO usuarios_sucursal (username, password_hash, nombre_completo, sucursal, rol, activo) VALUES
('admin.matriz', '$2b$10$rQj5cKvZZLvX7h9YWqKr7eK8YxG6pVrN5JdQ3ZwKjM8L4FtJhKwZS', 'Admin MATRIZ', 'MATRIZ', 'admin', true),
('admin.lapaz', '$2b$10$rQj5cKvZZLvX7h9YWqKr7eK8YxG6pVrN5JdQ3ZwKjM8L4FtJhKwZS', 'Admin LA PAZ', 'LA PAZ', 'admin', true),
('admin.sanjose', '$2b$10$rQj5cKvZZLvX7h9YWqKr7eK8YxG6pVrN5JdQ3ZwKjM8L4FtJhKwZS', 'Admin SAN JOSE', 'SAN JOSE', 'admin', true),
('admin.tamaral', '$2b$10$rQj5cKvZZLvX7h9YWqKr7eK8YxG6pVrN5JdQ3ZwKjM8L4FtJhKwZS', 'Admin TAMARAL', 'TAMARAL', 'admin', true),
('admin.cabos', '$2b$10$rQj5cKvZZLvX7h9YWqKr7eK8YxG6pVrN5JdQ3ZwKjM8L4FtJhKwZS', 'Admin CABOS', 'CABOS', 'admin', true),
('admin.elfuerte', '$2b$10$rQj5cKvZZLvX7h9YWqKr7eK8YxG6pVrN5JdQ3ZwKjM8L4FtJhKwZS', 'Admin EL FUERTE', 'EL FUERTE', 'admin', true),
('admin.jjr', '$2b$10$rQj5cKvZZLvX7h9YWqKr7eK8YxG6pVrN5JdQ3ZwKjM8L4FtJhKwZS', 'Admin JUAN JOSE RIOS', 'JUAN JOSE RIOS', 'admin', true),
('admin.culiacan', '$2b$10$rQj5cKvZZLvX7h9YWqKr7eK8YxG6pVrN5JdQ3ZwKjM8L4FtJhKwZS', 'Admin CULIACAN', 'CULIACAN', 'admin', true)
ON CONFLICT (username) DO NOTHING;

-- Usuario super admin que puede acceder a todas las sucursales
INSERT INTO usuarios_sucursal (username, password_hash, nombre_completo, sucursal, rol, activo) VALUES
('superadmin', '$2b$10$rQj5cKvZZLvX7h9YWqKr7eK8YxG6pVrN5JdQ3ZwKjM8L4FtJhKwZS', 'Super Administrador', 'MATRIZ', 'admin', true)
ON CONFLICT (username) DO NOTHING;

-- ============================================
-- POLÍTICAS DE SEGURIDAD (RLS - Row Level Security)
-- ============================================

-- Habilitar RLS en la tabla
ALTER TABLE usuarios_sucursal ENABLE ROW LEVEL SECURITY;

-- Políticas para usuarios_sucursal
-- Los usuarios pueden ver su propia información y la de su sucursal
CREATE POLICY "Usuarios pueden ver su sucursal"
    ON usuarios_sucursal FOR SELECT
    USING (true); -- Por ahora permitir todo, ajustar según necesidades de seguridad

CREATE POLICY "Solo admins pueden insertar usuarios"
    ON usuarios_sucursal FOR INSERT
    WITH CHECK (true); -- Por ahora permitir todo, ajustar según necesidades

CREATE POLICY "Usuarios pueden actualizar su perfil"
    ON usuarios_sucursal FOR UPDATE
    USING (true); -- Por ahora permitir todo, ajustar según necesidades

CREATE POLICY "Solo admins pueden eliminar usuarios"
    ON usuarios_sucursal FOR DELETE
    USING (true); -- Por ahora permitir todo, ajustar según necesidades

-- ============================================
-- VISTAS ÚTILES
-- ============================================

-- Vista de usuarios con información del empleado vinculado
CREATE OR REPLACE VIEW vista_usuarios_completa AS
SELECT
    u.id,
    u.username,
    u.nombre_completo,
    u.sucursal,
    u.rol,
    u.activo,
    u.ultimo_acceso,
    u.created_at,
    e.id as empleado_id,
    e.codigo_empleado,
    e.nombre as empleado_nombre,
    e.apellido as empleado_apellido,
    e.puesto,
    CONCAT(e.nombre, ' ', e.apellido) as empleado_nombre_completo
FROM usuarios_sucursal u
LEFT JOIN empleados e ON u.empleado_id = e.id
ORDER BY u.created_at DESC;

-- Vista de estadísticas por sucursal
CREATE OR REPLACE VIEW vista_usuarios_por_sucursal AS
SELECT
    sucursal,
    COUNT(*) as total_usuarios,
    COUNT(CASE WHEN activo = true THEN 1 END) as usuarios_activos,
    COUNT(CASE WHEN activo = false THEN 1 END) as usuarios_inactivos,
    COUNT(CASE WHEN rol = 'admin' THEN 1 END) as admins,
    COUNT(CASE WHEN rol = 'gerente' THEN 1 END) as gerentes,
    COUNT(CASE WHEN rol = 'usuario' THEN 1 END) as usuarios_normales,
    MAX(ultimo_acceso) as ultimo_acceso_sucursal
FROM usuarios_sucursal
GROUP BY sucursal
ORDER BY sucursal;

-- ============================================
-- FUNCIONES ÚTILES
-- ============================================

-- Función para obtener usuarios activos de una sucursal
CREATE OR REPLACE FUNCTION obtener_usuarios_activos_sucursal(p_sucursal VARCHAR)
RETURNS TABLE (
    id INT,
    username VARCHAR,
    nombre_completo VARCHAR,
    rol VARCHAR,
    ultimo_acceso TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        u.id,
        u.username,
        u.nombre_completo,
        u.rol,
        u.ultimo_acceso
    FROM usuarios_sucursal u
    WHERE u.sucursal = p_sucursal
    AND u.activo = true
    ORDER BY u.nombre_completo;
END;
$$ LANGUAGE plpgsql;

-- Función para verificar si un usuario tiene permisos de admin
CREATE OR REPLACE FUNCTION es_admin(p_usuario_id INT)
RETURNS BOOLEAN AS $$
DECLARE
    v_rol VARCHAR;
BEGIN
    SELECT rol INTO v_rol
    FROM usuarios_sucursal
    WHERE id = p_usuario_id AND activo = true;

    RETURN v_rol = 'admin';
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- COMENTARIOS
-- ============================================

COMMENT ON TABLE usuarios_sucursal IS 'Usuarios del sistema con autenticación por sucursal';
COMMENT ON COLUMN usuarios_sucursal.username IS 'Nombre de usuario único para login';
COMMENT ON COLUMN usuarios_sucursal.password_hash IS 'Hash bcrypt de la contraseña (nunca guardar en texto plano)';
COMMENT ON COLUMN usuarios_sucursal.sucursal IS 'Sucursal a la que pertenece el usuario (MATRIZ, LA PAZ, etc)';
COMMENT ON COLUMN usuarios_sucursal.rol IS 'Rol del usuario: admin, gerente, usuario';
COMMENT ON COLUMN usuarios_sucursal.empleado_id IS 'Relación opcional con tabla empleados';

-- ============================================
-- INSTRUCCIONES DE USO
-- ============================================

/*
USUARIOS PREDEFINIDOS:
---------------------
Cada sucursal tiene un usuario admin con las siguientes credenciales:

Username: admin.matriz      Password: admin123    Sucursal: MATRIZ
Username: admin.lapaz       Password: admin123    Sucursal: LA PAZ
Username: admin.sanjose     Password: admin123    Sucursal: SAN JOSE
Username: admin.tamaral     Password: admin123    Sucursal: TAMARAL
Username: admin.cabos       Password: admin123    Sucursal: CABOS
Username: admin.elfuerte    Password: admin123    Sucursal: EL FUERTE
Username: admin.jjr         Password: admin123    Sucursal: JUAN JOSE RIOS
Username: admin.culiacan    Password: admin123    Sucursal: CULIACAN

Super Admin (acceso a todas las sucursales):
Username: superadmin        Password: admin123    Sucursal: MATRIZ

⚠️ IMPORTANTE: Cambiar todas las contraseñas en producción

PARA CREAR NUEVOS USUARIOS:
---------------------------
INSERT INTO usuarios_sucursal (username, password_hash, nombre_completo, sucursal, rol)
VALUES ('usuario.ejemplo', '$2b$10$hash_aqui', 'Nombre Completo', 'SUCURSAL', 'usuario');

PARA CAMBIAR CONTRASEÑA:
------------------------
-- Generar hash bcrypt con herramienta online o backend
-- Luego actualizar:
UPDATE usuarios_sucursal
SET password_hash = '$2b$10$nuevo_hash_aqui'
WHERE username = 'usuario.ejemplo';

PARA VINCULAR CON EMPLEADO:
---------------------------
UPDATE usuarios_sucursal
SET empleado_id = (SELECT id FROM empleados WHERE codigo_empleado = 'EMP001')
WHERE username = 'usuario.ejemplo';
*/

-- ============================================
-- FIN DEL SCRIPT
-- ============================================
