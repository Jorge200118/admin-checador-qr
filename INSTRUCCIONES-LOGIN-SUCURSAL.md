# Sistema de Login por Sucursal - Instrucciones de Instalación

## 📋 Resumen

Se ha implementado un sistema de autenticación por sucursal que permite que usuarios de diferentes sucursales inicien sesión en el panel administrativo.

---

## 🗂️ Archivos Creados/Modificados

### 1. **Base de Datos**
- `database-setup-users-sucursal.sql` - Script SQL para crear tabla de usuarios

### 2. **Frontend**
- `frontend/login-sucursal.html` - Nueva página de login por sucursal
- `frontend/admin-panel/supabase-config.js` - Actualizado con APIs de autenticación
- `frontend/admin-panel/Index.html` - Actualizada lista de sucursales (líneas 599-608)

---

## 🚀 Pasos de Instalación

### Paso 1: Ejecutar Script SQL en Supabase

1. Accede a tu proyecto de Supabase: https://uqncsqstpcynjxnjhrqu.supabase.co
2. Ve a **SQL Editor**
3. Copia y pega el contenido de `database-setup-users-sucursal.sql`
4. Ejecuta el script
5. Verifica que se haya creado la tabla `usuarios_sucursal`

### Paso 2: Verificar Usuarios Predefinidos

El script crea automáticamente los siguientes usuarios:

| Username | Password | Sucursal | Rol |
|----------|----------|----------|-----|
| `admin.matriz` | `admin123` | MATRIZ | admin |
| `admin.lapaz` | `admin123` | LA PAZ | admin |
| `admin.sanjose` | `admin123` | SAN JOSE | admin |
| `admin.tamaral` | `admin123` | TAMARAL | admin |
| `admin.cabos` | `admin123` | CABOS | admin |
| `admin.elfuerte` | `admin123` | EL FUERTE | admin |
| `admin.jjr` | `admin123` | JUAN JOSE RIOS | admin |
| `admin.culiacan` | `admin123` | CULIACAN | admin |
| `superadmin` | `admin123` | MATRIZ | admin |

⚠️ **IMPORTANTE:** Cambiar estas contraseñas en producción

### Paso 3: Probar el Sistema

1. Abre el navegador y ve a: `frontend/login-sucursal.html`
2. Selecciona una sucursal del dropdown
3. Ingresa usuario y contraseña
4. Haz clic en "Iniciar Sesión"
5. Deberías ser redirigido al panel administrativo

---

## 📊 Estructura de la Tabla `usuarios_sucursal`

```sql
CREATE TABLE usuarios_sucursal (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nombre_completo VARCHAR(200) NOT NULL,
    sucursal VARCHAR(100) NOT NULL,
    rol VARCHAR(50) DEFAULT 'usuario',
    empleado_id INT REFERENCES empleados(id),
    activo BOOLEAN DEFAULT true,
    ultimo_acceso TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Roles Disponibles:
- **admin** - Acceso completo al sistema
- **gerente** - Acceso a gestión de su sucursal
- **usuario** - Acceso básico de consulta

---

## 🔧 APIs Disponibles

Las siguientes funciones están disponibles en `SupabaseAPI`:

### Autenticación
```javascript
// Login
await SupabaseAPI.loginUsuarioSucursal(username, password, sucursal);

// Actualizar último acceso
await SupabaseAPI.updateUltimoAcceso(usuarioId);
```

### CRUD de Usuarios
```javascript
// Obtener usuarios
await SupabaseAPI.getUsuariosSucursal(sucursal); // sucursal opcional

// Crear usuario
await SupabaseAPI.createUsuarioSucursal({
    username: 'juan.perez',
    nombre_completo: 'Juan Pérez',
    sucursal: 'LA PAZ',
    rol: 'usuario',
    empleado_id: 123
});

// Actualizar usuario
await SupabaseAPI.updateUsuarioSucursal(usuarioId, {
    nombre_completo: 'Juan Pérez López',
    sucursal: 'CABOS'
});

// Eliminar usuario
await SupabaseAPI.deleteUsuarioSucursal(usuarioId);

// Activar/Desactivar usuario
await SupabaseAPI.toggleUsuarioActivo(usuarioId, true);

// Verificar si username existe
await SupabaseAPI.verificarUsernameExiste('juan.perez');
```

---

## 🔐 Gestión de Sesiones

El sistema guarda la sesión en `localStorage` o `sessionStorage`:

```javascript
// Obtener sesión actual
const session = JSON.parse(localStorage.getItem('session_sucursal'));

// Estructura de la sesión:
{
    userId: 1,
    username: 'admin.matriz',
    nombreCompleto: 'Admin MATRIZ',
    sucursal: 'MATRIZ',
    rol: 'admin',
    loginTime: '2025-01-20T10:30:00.000Z'
}

// Cerrar sesión
localStorage.removeItem('session_sucursal');
sessionStorage.removeItem('session_sucursal');
```

---

## 📝 Crear Nuevos Usuarios

### Opción 1: Directamente en SQL
```sql
INSERT INTO usuarios_sucursal (username, password_hash, nombre_completo, sucursal, rol)
VALUES (
    'usuario.ejemplo',
    '$2b$10$rQj5cKvZZLvX7h9YWqKr7eK8YxG6pVrN5JdQ3ZwKjM8L4FtJhKwZS', -- Hash de 'admin123'
    'Nombre Completo',
    'LA PAZ',
    'usuario'
);
```

### Opción 2: Usando la API
```javascript
const result = await SupabaseAPI.createUsuarioSucursal({
    username: 'usuario.ejemplo',
    nombre_completo: 'Nombre Completo',
    sucursal: 'LA PAZ',
    rol: 'usuario',
    empleado_id: null, // Opcional
    activo: true
});
```

---

## 🔑 Cambiar Contraseñas

### ⚠️ NOTA IMPORTANTE SOBRE CONTRASEÑAS

El sistema actual tiene una implementación **TEMPORAL** de validación de contraseñas que acepta cualquier contraseña por simplicidad de desarrollo.

**Para producción, necesitas implementar:**

1. **Backend con Supabase Functions** para hashear contraseñas con bcrypt
2. **O usar Supabase Auth** nativo (recomendado)

### Solución Temporal (Desarrollo)
Por ahora, cualquier contraseña funciona para testing.

### Solución Producción Recomendada

#### Opción A: Usar Supabase Auth (Recomendado)
```javascript
// Registrar usuario
const { data, error } = await supabaseClient.auth.signUp({
    email: 'usuario@ejemplo.com',
    password: 'contraseña_segura',
    options: {
        data: {
            sucursal: 'LA PAZ',
            nombre_completo: 'Juan Pérez'
        }
    }
});

// Login
const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: 'usuario@ejemplo.com',
    password: 'contraseña_segura'
});
```

#### Opción B: Supabase Edge Function con bcrypt
Crear una función Edge para hashear contraseñas:

```typescript
// supabase/functions/hash-password/index.ts
import * as bcrypt from 'bcrypt';

Deno.serve(async (req) => {
    const { password } = await req.json();
    const hash = await bcrypt.hash(password, 10);
    return new Response(JSON.stringify({ hash }));
});
```

---

## 🔍 Vistas y Funciones SQL Útiles

### Ver todos los usuarios con información completa
```sql
SELECT * FROM vista_usuarios_completa;
```

### Ver estadísticas por sucursal
```sql
SELECT * FROM vista_usuarios_por_sucursal;
```

### Obtener usuarios activos de una sucursal
```sql
SELECT * FROM obtener_usuarios_activos_sucursal('LA PAZ');
```

### Verificar si un usuario es admin
```sql
SELECT es_admin(1); -- Pasa el ID del usuario
```

---

## 🎨 Personalización

### Cambiar Sucursales Disponibles

Edita en dos lugares:

**1. HTML del formulario** (`Index.html` línea 599-608):
```html
<select id="empSucursal" name="sucursal" class="form-select">
    <option value="">Seleccionar sucursal</option>
    <option value="TU_SUCURSAL">TU SUCURSAL</option>
    <!-- Agregar más opciones aquí -->
</select>
```

**2. HTML del login** (`login-sucursal.html` línea ~145-155):
```html
<select id="sucursal" name="sucursal" class="form-select" required>
    <option value="">Selecciona tu sucursal</option>
    <option value="TU_SUCURSAL">TU SUCURSAL</option>
    <!-- Agregar más opciones aquí -->
</select>
```

### Cambiar Colores del Login

Edita el gradiente en `login-sucursal.html`:
```css
background: linear-gradient(135deg, #TU_COLOR_1 0%, #TU_COLOR_2 100%);
```

---

## 🧪 Testing

### Test 1: Login Básico
```javascript
const result = await SupabaseAPI.loginUsuarioSucursal('admin.matriz', 'admin123', 'MATRIZ');
console.log(result); // Debe retornar success: true
```

### Test 2: Crear Usuario
```javascript
const result = await SupabaseAPI.createUsuarioSucursal({
    username: 'test.user',
    nombre_completo: 'Usuario de Prueba',
    sucursal: 'LA PAZ',
    rol: 'usuario'
});
console.log(result);
```

### Test 3: Verificar Sesión
```javascript
const session = JSON.parse(localStorage.getItem('session_sucursal'));
console.log('Usuario logueado:', session.nombreCompleto);
console.log('Sucursal:', session.sucursal);
```

---

## ❓ Preguntas Frecuentes

### ¿Puedo vincular un usuario con un empleado existente?
Sí, usa el campo `empleado_id`:
```javascript
await SupabaseAPI.updateUsuarioSucursal(usuarioId, {
    empleado_id: 123 // ID del empleado en tabla empleados
});
```

### ¿Cómo cierro la sesión?
```javascript
localStorage.removeItem('session_sucursal');
sessionStorage.removeItem('session_sucursal');
window.location.href = 'login-sucursal.html';
```

### ¿Las contraseñas son seguras?
**NO en la versión actual.** Es solo para desarrollo. Para producción debes implementar hashing real con bcrypt o usar Supabase Auth.

### ¿Puedo tener usuarios que accedan a múltiples sucursales?
Sí, puedes crear un usuario con rol 'admin' y modificar la lógica para que tenga acceso a todas las sucursales.

---

## 📞 Soporte

Para problemas o preguntas:
1. Revisa los logs del navegador (F12 → Console)
2. Verifica que el script SQL se ejecutó correctamente
3. Confirma que las credenciales de Supabase son correctas

---

## ✅ Checklist de Implementación

- [ ] Ejecutar `database-setup-users-sucursal.sql` en Supabase
- [ ] Verificar que tabla `usuarios_sucursal` existe
- [ ] Probar login con usuario predefinido
- [ ] Cambiar contraseñas por defecto
- [ ] Crear usuarios para cada sucursal
- [ ] Configurar sistema de hashing de contraseñas (producción)
- [ ] Personalizar colores y logos según marca
- [ ] Implementar página de gestión de usuarios en admin panel (opcional)

---

**Última actualización:** 2025-01-20
**Versión:** 1.0
