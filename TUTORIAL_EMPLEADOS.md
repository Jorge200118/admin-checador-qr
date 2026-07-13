# 📚 Tutorial Interactivo - Alta de Empleados

## 🎯 Descripción General

Se ha implementado un tutorial interactivo paso a paso en el portal administrativo del sistema de checador QR para guiar a los usuarios en el proceso de dar de alta nuevos empleados.

## ✨ Características

### 🔹 Acceso al Tutorial
- Ubicado en la sección **"Empleados"**
- Botón azul con icono **"Tutorial"** junto al botón "Nuevo Empleado"
- Fácil acceso desde el panel principal

### 🔹 Navegación Intuitiva
- **5 pasos guiados** con indicadores visuales de progreso
- Barra de progreso superior que muestra el paso actual
- Navegación con botones "Anterior" y "Siguiente"
- Soporte para navegación con teclado:
  - ← Flecha izquierda: Paso anterior
  - → Flecha derecha o Enter: Siguiente paso
  - Escape: Cerrar tutorial

## 📋 Pasos del Tutorial

### Paso 1: Introducción
- **Título:** Bienvenido al asistente de alta de empleados
- **Contenido:**
  - Descripción general del proceso
  - Lista de información necesaria:
    - ✅ Código único del empleado
    - ✅ Nombre completo
    - ✅ Sucursal donde trabajará
    - ✅ Puesto o cargo
    - ✅ Horario asignado
    - ✅ Foto de perfil (opcional)
  - Tiempo estimado: 2-3 minutos

### Paso 2: Datos Básicos
- **Título:** Datos básicos del empleado
- **Campos explicados:**
  - **Código de Empleado** (obligatorio)
    - Identificador único
    - Consejos de formato (EMP001, EMP002, etc.)
    - No puede repetirse
  - **Nombre** (obligatorio)
    - Nombre(s) del empleado
  - **Apellido** (obligatorio)
    - Apellido(s) del empleado

### Paso 3: Ubicación y Puesto
- **Título:** Sucursal y puesto de trabajo
- **Campos explicados:**
  - **Sucursal** (obligatorio)
    - Selección de sucursal asignada
    - Importancia para filtros y reportes
    - Opciones disponibles:
      - MATRIZ
      - LA PAZ
      - SAN JOSE
      - TAMARAL
      - CABOS
      - EL FUERTE
      - JUAN JOSE RIOS
      - CULIACAN
  - **Puesto**
    - Ejemplos comunes:
      - VENTAS
      - CHOFER
      - TRABAJADOR DE PATIO
      - AUXILIAR CONTABLE
      - ENCARGADO DE SUCURSAL
      - CAJERA
      - ALMACEN

### Paso 4: Horario
- **Título:** Asignar horario de trabajo
- **Contenido:**
  - Explicación de la importancia del horario
  - Nota sobre crear horarios previamente si no existen
  - Componentes de un horario:
    - Hora de entrada y salida
    - Bloques de trabajo
    - Tolerancia de retardo
    - Horas objetivo diarias

### Paso 5: Foto y Extras
- **Título:** Foto y configuración adicional
- **Campos explicados:**
  - **Foto de Perfil** (opcional)
    - Recomendaciones:
      - Foto reciente y clara
      - Formato: JPG o PNG
      - Tamaño máximo: 5 MB
      - Aparece en la tablet al hacer check-in
  - **Trabaja domingos** (checkbox)
    - Afecta cálculos de asistencias semanales
  - **Pasos siguientes:**
    1. El empleado aparecerá en la lista
    2. Se puede imprimir su código QR
    3. Empezará a registrar asistencias
    4. Registros visibles en la sección "Registros"

## 🎨 Elementos Visuales

### Indicadores de Estado
- **Campos obligatorios:** Badge rojo con texto "Obligatorio"
- **Campos opcionales:** Badge verde con texto "Opcional"

### Cajas Informativas
- **Azul (Info):** Información general y consejos
- **Naranja (Warning):** Advertencias importantes
- **Verde (Success):** Confirmaciones y pasos completados

### Íconos Representativos
- 👤 Usuario (Introducción)
- 🆔 ID Card (Datos básicos)
- 🏢 Building (Sucursal)
- ⏰ Clock (Horario)
- 📷 Camera (Foto)

## 🔧 Implementación Técnica

### Archivos Modificados

1. **Index.html**
   - Añadido botón "Tutorial" en sección empleados
   - Agregado modal completo del tutorial con 5 pasos
   - Estructura de navegación paso a paso

2. **Admin.css**
   - 400+ líneas de estilos dedicados al tutorial
   - Diseño responsive
   - Animaciones suaves entre pasos
   - Indicadores de progreso visuales

3. **Admin.js**
   - Funciones de navegación del tutorial
   - Control de estado del paso actual
   - Manejo de eventos de teclado
   - Integración con modal de nuevo empleado

### Funciones JavaScript Principales

```javascript
iniciarTutorialEmpleado()     // Abre el tutorial
cerrarTutorialEmpleado()      // Cierra el tutorial
siguientePasoTutorial()       // Avanza al siguiente paso
anteriorPasoTutorial()        // Retrocede al paso anterior
finalizarTutorial()           // Completa tutorial y abre formulario
actualizarPasoTutorial()      // Actualiza la UI del paso actual
```

## 📱 Responsive Design

El tutorial está optimizado para diferentes tamaños de pantalla:
- **Desktop:** Modal amplio (900px) con todos los detalles
- **Tablet:** Modal adaptado con scroll
- **Mobile:** Versión compacta con elementos apilados

## 🚀 Cómo Usar

1. Accede al panel administrativo
2. Ve a la sección **"Empleados"**
3. Haz clic en el botón **"Tutorial"** (azul, con icono de interrogación)
4. Sigue los 5 pasos interactivos
5. Al finalizar, el sistema abrirá automáticamente el formulario de nuevo empleado

## 💡 Ventajas

- ✅ Reduce errores en el proceso de alta
- ✅ Capacitación integrada en el sistema
- ✅ No requiere manuales externos
- ✅ Siempre disponible cuando se necesite
- ✅ Mejora la experiencia del usuario
- ✅ Acelera la curva de aprendizaje

## 🎯 Próximas Mejoras Sugeridas

- [ ] Tutorial para edición de empleados
- [ ] Tutorial para creación de horarios
- [ ] Tutorial para generación de reportes
- [ ] Indicador de "tutorial visto" por usuario
- [ ] Opción de "No volver a mostrar"
- [ ] Tooltips contextuales en el formulario real

---

**Desarrollado para:** RHACHub
**Fecha:** Febrero 2026
**Estado:** ✅ Implementado y Funcional
