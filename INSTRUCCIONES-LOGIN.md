# Instrucciones de Configuración del Sistema de Login

## Problema Resuelto

El login no funcionaba porque:
1. Intentaba conectarse a un API backend inexistente (`https://checador-qr.ngrok.app/api`)
2. No había sistema de autenticación en la base de datos
3. La aplicación tablet no verificaba autenticación al cargar

## Solución Implementada

### 1. Login Centralizado con Supabase

**Archivo**: `frontend/login.html`

- Ahora usa Supabase directamente (sin necesidad de backend)
- Valida códigos contra la tabla `tablet_access_codes` en Supabase
- Guarda la autenticación en `localStorage`
- Redirige a `tablet-app/Index.html` después del login exitoso

### 2. Protección de la Aplicación Tablet

**Archivo**: `frontend/tablet-app/app.js`

- Verifica autenticación al cargar (`verificarAuth()`)
- Si no está autenticado, redirige a `../login.html`
- Removidas funciones de autenticación local duplicadas

### 3. Base de Datos

**Archivo**: `database-setup-tablet-codes.sql`

- Crea tabla `tablet_access_codes` en Supabase
- Almacena códigos de acceso para cada tablet
- Incluye 3 códigos de ejemplo

## Pasos para Activar el Sistema

### Paso 1: Ejecutar el Script SQL en Supabase

1. Ve a tu dashboard de Supabase: https://supabase.com/dashboard
2. Selecciona tu proyecto
3. En el menú lateral, ve a **"SQL Editor"**
4. Haz clic en **"New Query"**
5. Copia y pega el contenido completo de `database-setup-tablet-codes.sql`
6. Haz clic en **"Run"** para ejecutar

### Paso 2: Verificar Códigos de Acceso

Los códigos predeterminados son:

| Tablet ID  | Código | Nombre                 |
|------------|--------|------------------------|
| TABLET-01  | 1234   | Tablet Principal       |
| TABLET-02  | 5678   | Tablet Recepción       |
| TABLET-03  | ADMIN  | Tablet Administración  |

### Paso 3: Probar el Login

1. **Opción A - Servidor Local**:
   ```bash
   cd frontend
   # Usar cualquier servidor HTTP simple
   python -m http.server 8000
   # O con Node.js
   npx http-server
   ```

2. **Opción B - Abrir directamente**:
   - Abre `frontend/login.html` en tu navegador

3. **Probar**:
   - Ingresa uno de los códigos (ejemplo: `1234`)
   - Deberías ser redirigido a la aplicación de tablet
   - Si intentas acceder directamente a `tablet-app/Index.html` sin login, serás redirigido al login

## Flujo de Autenticación

```
1. Usuario abre login.html
   ↓
2. Ingresa código (ejemplo: "1234")
   ↓
3. Sistema busca en Supabase tabla tablet_access_codes
   ↓
4. Si código existe y está activo:
   - Guarda en localStorage: tablet_auth = 'true'
   - Guarda tablet_id del registro
   - Redirige a tablet-app/Index.html
   ↓
5. tablet-app/Index.html carga
   ↓
6. Verifica localStorage.tablet_auth
   ↓
7. Si NO está autenticado → Redirige a login.html
   Si SÍ está autenticado → Muestra aplicación
```

## Personalización

### Cambiar un Código Existente

```sql
UPDATE tablet_access_codes
SET codigo = 'NUEVO_CODIGO'
WHERE tablet_id = 'TABLET-01';
```

### Agregar una Nueva Tablet

```sql
INSERT INTO tablet_access_codes (tablet_id, codigo, nombre, descripcion, activo)
VALUES ('TABLET-04', 'MICOD', 'Tablet Almacén', 'Tablet en el área de almacén', true);
```

### Desactivar una Tablet

```sql
UPDATE tablet_access_codes
SET activo = false
WHERE tablet_id = 'TABLET-02';
```

### Ver Todos los Códigos

```sql
SELECT tablet_id, codigo, nombre, activo
FROM tablet_access_codes
ORDER BY tablet_id;
```

## Estructura de la Tabla

```sql
tablet_access_codes
├── id (BIGSERIAL PRIMARY KEY)
├── tablet_id (VARCHAR 50) - Identificador único de la tablet
├── codigo (VARCHAR 20) - Código de acceso para login
├── nombre (VARCHAR 100) - Nombre descriptivo
├── descripcion (TEXT) - Descripción opcional
├── activo (BOOLEAN) - Si el código está activo
├── created_at (TIMESTAMP) - Fecha de creación
└── updated_at (TIMESTAMP) - Última actualización
```

## Configuración en Producción

### Subir a un Dominio

Si subes el sistema a un dominio (ejemplo: `https://checador.miempresa.com`):

1. **Estructura de archivos**:
   ```
   public_html/
   ├── login.html          (página de inicio)
   ├── tablet-app/
   │   ├── Index.html
   │   ├── app.js
   │   ├── styles.css
   │   └── ...
   └── admin-panel/
       └── ...
   ```

2. **Configurar como página de inicio**:
   - El archivo `login.html` debe ser la página principal
   - O renómbralo a `index.html`

3. **Rutas relativas**:
   - Las rutas ya están configuradas como relativas
   - `login.html` redirige a `tablet-app/Index.html`
   - `tablet-app/Index.html` redirige a `../login.html`

### Cerrar Sesión

Para agregar un botón de cerrar sesión, ejecuta este código JavaScript:

```javascript
// Cerrar sesión
localStorage.removeItem('tablet_auth');
localStorage.removeItem('tablet_auth_time');
localStorage.removeItem('tablet_id');
window.location.href = '../login.html';
```

## Seguridad

### Notas Importantes

1. **Códigos Simples**: Los códigos actuales (1234, 5678) son para desarrollo. En producción, usa códigos más seguros.

2. **HTTPS**: Asegúrate de usar HTTPS en producción para proteger las credenciales.

3. **Row Level Security (RLS)**: Considera habilitar RLS en Supabase para mayor seguridad:

```sql
-- Habilitar RLS
ALTER TABLE tablet_access_codes ENABLE ROW LEVEL SECURITY;

-- Política para permitir lectura de códigos activos
CREATE POLICY "Allow read active codes" ON tablet_access_codes
FOR SELECT USING (activo = true);
```

## Troubleshooting

### El login no funciona

1. **Verifica la consola del navegador** (F12 → Console)
2. **Comprueba que ejecutaste el SQL** en Supabase
3. **Verifica la configuración de Supabase** en `login.html`:
   ```javascript
   url: 'https://uqncsqstpcynjxnjhrqu.supabase.co'
   anonKey: 'sb_publishable_bY6BY3wa5Xm2JCG2fy4F3g_fFgS5OsA'
   ```

### Me redirige al login continuamente

1. **Limpia localStorage**:
   ```javascript
   localStorage.clear();
   ```
2. **Vuelve a hacer login**

### El código es correcto pero dice "Código incorrecto"

1. **Verifica que el código esté activo**:
   ```sql
   SELECT * FROM tablet_access_codes WHERE codigo = '1234';
   ```
2. **Asegúrate que activo = true**

## Contacto

Si tienes problemas, verifica:
1. Consola del navegador (F12)
2. Network tab para ver las peticiones a Supabase
3. Que la tabla `tablet_access_codes` exista en Supabase
