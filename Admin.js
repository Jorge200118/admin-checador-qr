// ================================
// ADMIN.JS - PANEL ADMINISTRATIVO SISTEMA CHECADOR QR
// Versión 3.0 - Código limpio y organizado
// ================================

// ================================
// CONFIGURACIÓN GLOBAL
// ================================
const ADMIN_CONFIG = {
    apiUrl: 'https://aceros-cabos-proveedores.ngrok.app/api',
    refreshInterval: 30000,
    autoLogoutTime: 3600000,
    maxFileSize: 5 * 1024 * 1024,
    allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp']
};

// ================================
// HELPERS DE ZONA HORARIA - MAZATLÁN (UTC-7)
// ================================
/**
 * Convertir string de fecha a Date object en zona horaria de Mazatlán
 * Supabase guarda en UTC, aquí convertimos a hora local de Mazatlán
 */
function getMazatlanTime(dateString) {
    // Crear fecha desde string UTC
    const date = new Date(dateString);
    // Retornar el objeto Date que JavaScript manejará en la zona horaria local del navegador
    return date;
}

// ================================
// HELPER PARA URLs DE FOTOS DE SUPABASE
// ================================
/**
 * Construir URL completa de foto desde Supabase Storage
 * Si ya es una URL completa, la retorna tal cual
 * Si es solo un nombre de archivo, construye la URL pública completa
 */
function getSupabaseFotoUrl(fotoPath, bucket = 'empleados-fotos') {
    if (!fotoPath) return null;

    // Si ya es una URL completa, retornarla
    if (fotoPath.startsWith('http://') || fotoPath.startsWith('https://')) {
        return fotoPath;
    }

    const SUPABASE_URL = 'https://uqncsqstpcynjxnjhrqu.supabase.co';

    // Si la ruta empieza con /uploads/fotos/, extraer solo el nombre del archivo
    if (fotoPath.startsWith('/uploads/fotos/')) {
        const fileName = fotoPath.replace('/uploads/fotos/', '');
        return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${fileName}`;
    }

    // Si es solo el nombre del archivo, construir URL completa
    return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${fotoPath}`;
}
// ================================
// ESTADO DE LA APLICACIÓN
// ================================
let adminState = {
    currentSection: 'dashboard',
    selectedEmployee: null,
    selectedHorario: null,
    dashboardData: {},
    employeesData: [],
    horariosData: [],
    registrosData: [],
    filters: {},
    pagination: { page: 1, limit: 20 },
    lastActivity: new Date(),
    refreshTimer: null
};

// ================================
// ELEMENTOS DOM
// ================================
const elements = {
    navItems: document.querySelectorAll('.nav-item'),
    sections: document.querySelectorAll('.content-section'),
    pageTitle: document.getElementById('pageTitle'),
    
    // Dashboard
    empleadosPresentes: document.getElementById('empleadosPresentes'),
    registrosHoy: document.getElementById('registrosHoy'),
    llegadasTarde: document.getElementById('llegadasTarde'),
    tabletsActivas: document.getElementById('tabletsActivas'),
    
    // Tablas
    empleadosPresentesTable: document.getElementById('empleadosPresentesTable'),
    ultimosRegistrosTable: document.getElementById('ultimosRegistrosTable'),
    empleadosTable: document.getElementById('empleadosTable'),
    horariosTable: document.getElementById('horariosTable'),
    registrosTable: document.getElementById('registrosTable'),
    
    // Modals
    modalEmpleado: document.getElementById('modalEmpleado'),
    formEmpleado: document.getElementById('formEmpleado'),
    
    // Filters
    searchEmpleados: document.getElementById('searchEmpleados'),
    filterHorario: document.getElementById('filterHorario'),
    filterEstado: document.getElementById('filterEstado'),
    fechaInicio: document.getElementById('fechaInicio'),
    fechaFin: document.getElementById('fechaFin')
};

// ================================
// INICIALIZACIÓN
// ================================
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(initializeAdmin, 100);
});

async function initializeAdmin() {

    try {
        // Obtener sesión del usuario logueado
        const session = JSON.parse(localStorage.getItem('session_sucursal') || sessionStorage.getItem('session_sucursal'));
        if (!session || !session.sucursal) {
            window.location.href = 'login-sucursal.html';
            return;
        }

        // Guardar sucursal del usuario en variable global
        // Si es superadmin (username = superadmin), puede ver todas las sucursales
        if (session.username === 'superadmin') {
            window.currentUserSucursal = null; // null = ver todas las sucursales
            window.isSuperAdmin = true;
        } else {
            window.currentUserSucursal = session.sucursal;
            window.isSuperAdmin = false;
        }

        // Inicializar Supabase
        if (!initSupabase()) {
            showAlert('Error de configuración', 'No se pudo conectar con la base de datos', 'error');
            return;
        }

        setupNavigation();
        setupEventListeners();
        window.addEventListener('error', handleGlobalError);
        handleMissingImages();

        await loadInitialData();
        
        startAutoRefresh();
        setupAutoLogout();
        
        // Agregar estilos y configurar reportes
        addRequiredStyles();
        setupReportesSection();
        
        
    } catch (error) {
        showAlert('Error', 'No se pudo inicializar el panel administrativo', 'error');
    } finally {
        setTimeout(killAllSpinners, 500);
    }
}

// ================================
// NAVEGACIÓN
// ================================
function setupNavigation() {
    elements.navItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const section = this.querySelector('a').dataset.section;
            if (section) {
                navigateToSection(section);
            }
        });
    });
}

function navigateToSection(section) {
    // Actualizar navegación
    elements.navItems.forEach(item => {
        item.classList.remove('active');
        if (item.querySelector('a').dataset.section === section) {
            item.classList.add('active');
        }
    });
    
    // Mostrar sección
    elements.sections.forEach(sec => {
        sec.classList.remove('active');
        if (sec.id === section) {
            sec.classList.add('active');
        }
    });
    
    // Actualizar título
    const titles = {
        dashboard: 'Dashboard',
        empleados: 'Gestión de Empleados',
        horarios: 'Gestión de Horarios',
        registros: 'Registros de Asistencia',
        justificaciones: 'Gestión de Justificaciones',
        reportes: 'Reportes y Estadísticas',
        configuracion: 'Configuración del Sistema'
    };
    
    if (elements.pageTitle) {
        elements.pageTitle.textContent = titles[section] || section;
    }
    
    adminState.currentSection = section;
    loadSectionData(section);
}

// ================================
// EVENTOS
// ================================
function setupEventListeners() {
    // Botones principales
    document.getElementById('btnNuevoEmpleado')?.addEventListener('click', () => openEmployeeModal());
    document.getElementById('btnNuevoHorario')?.addEventListener('click', () => openHorarioModal());
    
    // Filtros
    elements.searchEmpleados?.addEventListener('input', debounce(filterEmployees, 300));
    elements.filterHorario?.addEventListener('change', filterEmployees);
    elements.filterEstado?.addEventListener('change', filterEmployees);
    
    // Fechas
    elements.fechaInicio?.addEventListener('change', updateDateFilters);
    elements.fechaFin?.addEventListener('change', updateDateFilters);
    
    // Modales
    document.querySelectorAll('.close').forEach(btn => {
        btn.addEventListener('click', function() {
            const modal = this.closest('.modal');
            if (modal) closeModal(modal.id);
        });
    });
    
    // Cerrar modal al hacer click fuera
    window.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal')) {
            closeModal(e.target.id);
        }
    });
    
    // Preview de foto
    document.getElementById('empFoto')?.addEventListener('change', handlePhotoPreview);
    
    // Activity tracking
    ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(event => {
        document.addEventListener(event, updateLastActivity);
    });
}

// ================================
// CARGA DE DATOS
// ================================
async function loadInitialData() {
    showLoading('Cargando datos iniciales...');
    
    try {
        const results = await Promise.allSettled([
            loadDashboardData(),
            loadEmployees(),
            loadHorarios(),
            loadRecentRegistros()
        ]);

        results.forEach((result, index) => {
            const names = ['Dashboard', 'Empleados', 'Horarios', 'Registros'];
            if (result.status === 'rejected') {
            } else {
            }
        });
        
        if (adminState.horariosData.length > 0) populateHorarioSelects();
        if (adminState.employeesData.length > 0) populateEmployeeSelects();
        
    } catch (error) {
        showAlert('Error', 'No se pudieron cargar algunos datos', 'warning');
    } finally {
        hideLoading();
        setTimeout(killAllSpinners, 500);
    }
}

async function loadDashboardData() {
    try {

        document.querySelectorAll('.stat-number').forEach(el => {
            if (el) el.innerHTML = '<i class="fas fa-spinner fa-spin" style="font-size: 14px;"></i>';
        });

        // NUEVO: Usar Supabase API con filtro de sucursal
        const result = await SupabaseAPI.getDashboardEstadisticas(window.currentUserSucursal);

        if (result.success && result.data) {
            updateDashboardStats(result.data);

            // Cargar tablas adicionales
            try {
                const empleadosData = await SupabaseAPI.getEmpleadosPresentes(window.currentUserSucursal);
                if (empleadosData.success) {
                    updateEmpleadosPresentesTable(empleadosData.data || []);
                }
            } catch (e) {
            }

            try {
                const registrosData = await SupabaseAPI.getRegistrosRecientes(10, window.currentUserSucursal);
                if (registrosData.success) {
                    updateUltimosRegistrosTable(registrosData.data || []);
                }
            } catch (e) {
            }

        } else {
            throw new Error(result.message || 'No se recibieron datos válidos');
        }


    } catch (error) {

        updateDashboardStats({
            empleados_presentes: 0,
            registros_hoy: 0,
            tardanzas: 0,
            tablets_activas: 0
        });

    } finally {
        setTimeout(killAllSpinners, 500);
    }
}

async function loadEmployees() {
    try {
        // NUEVO: Usar Supabase API con filtro de sucursal
        const data = await SupabaseAPI.getEmpleados(window.currentUserSucursal);

        if (data.success) {
            // Transformar datos para incluir horario_nombre
            adminState.employeesData = (data.data || []).map(emp => ({
                ...emp,
                horario_nombre: emp.horario?.nombre || null,
                horario_id: emp.horario?.id || emp.horario_id
            }));
            renderEmployeesTable();
        }
    } catch (error) {
        adminState.employeesData = [];
    }
}

async function loadHorarios() {
    try {
        // NUEVO: Usar Supabase API
        const data = await SupabaseAPI.getHorarios();

        if (data.success) {
            adminState.horariosData = data.data || [];
            renderHorariosTable();
        }
    } catch (error) {
        adminState.horariosData = [];
    }
}

async function loadRecentRegistros() {
    try {
        // NUEVO: Usar Supabase API con filtro de sucursal
        const data = await SupabaseAPI.getRegistrosToday(50, window.currentUserSucursal);

        if (data.success) {
            adminState.registrosData = data.data || data.registros || [];

            renderRegistrosTableAdvanced();
        }
    } catch (error) {
        adminState.registrosData = [];
    }
}

// ================================
// FUNCIONES DE SECCIONES
// ================================
async function loadSectionData(section) {
    
    switch(section) {
        case 'dashboard':
            loadDashboardData();
            break;
        case 'empleados':
            loadEmployees();
            break;
        case 'horarios':
            loadHorarios();
            break;
        case 'registros':
            await loadRegistrosData();
            setupRegistrosFilters();
            setupRegistrosPagination();
            break;
        case 'justificaciones':
            loadJustificaciones();
            break;
        case 'reportes':
            setTimeout(renderEstadisticasConDatosReales, 500);
            break;
        case 'configuracion':
            break;
        default:
    }
}

// ================================
// SECCIÓN DE REGISTROS AVANZADA
// ================================

// Cargar datos específicos para registros
async function loadRegistrosData() {
    try {

        // Cargar registros
        await loadRecentRegistros();

        // Cargar empleados para el filtro
        await loadEmpleadosForFilter();

        // Configurar filtro de sucursal según rol del usuario
        configurarFiltroSucursal();

        // Establecer fechas por defecto
        setDefaultDates();

        // Actualizar estadísticas
        updateRegistrosStats();

    } catch (error) {
    }
}

// Configurar el filtro de sucursal según el rol del usuario
function configurarFiltroSucursal() {
    const filterSucursal = document.getElementById('filterSucursal');
    if (!filterSucursal) return;

    if (!window.isSuperAdmin && window.currentUserSucursal) {
        // Usuario normal: ocultar el filtro completamente
        const filterGroup = filterSucursal.closest('.filter-group');
        if (filterGroup) {
            filterGroup.style.display = 'none';
        }
    } else {
        // Superadmin: mostrar el filtro con todas las opciones
        const filterGroup = filterSucursal.closest('.filter-group');
        if (filterGroup) {
            filterGroup.style.display = 'block';
        }
    }
}

// Cargar empleados para el filtro
async function loadEmpleadosForFilter() {
    try {
        // NUEVO: Usar Supabase API con filtro de sucursal
        const data = await SupabaseAPI.getEmpleados(window.currentUserSucursal);

        if (data.success && data.data) {
            const selectEmpleado = document.getElementById('filterEmpleado');
            if (selectEmpleado) {
                // Limpiar opciones existentes (excepto la primera)
                selectEmpleado.innerHTML = '<option value="">TODOS LOS EMPLEADOS</option>';
                
                // Agregar empleados activos
                data.data
                    .filter(emp => emp.activo)
                    .forEach(empleado => {
                        const option = document.createElement('option');
                        option.value = empleado.id;
                        option.textContent = `${empleado.nombre} ${empleado.apellido_paterno || ''} ${empleado.apellido_materno || ''}`.trim();
                        selectEmpleado.appendChild(option);
                    });
                
            }
        }
    } catch (error) {
    }
}

// Establecer fechas por defecto
function setDefaultDates() {
    const hoy = new Date();
    const fechaInicio = document.getElementById('fechaInicio');
    const fechaFin = document.getElementById('fechaFin');
    const periodoActual = document.getElementById('periodoActual');
    
    // Usar fecha local para evitar que UTC muestre el día siguiente en horario nocturno
    const year = hoy.getFullYear();
    const month = String(hoy.getMonth() + 1).padStart(2, '0');
    const day = String(hoy.getDate()).padStart(2, '0');
    const fechaLocal = `${year}-${month}-${day}`;

    if (fechaInicio) {
        fechaInicio.value = fechaLocal;
    }
    if (fechaFin) {
        fechaFin.value = fechaLocal;
    }
    if (periodoActual) {
        const fechaFormateada = hoy.toLocaleDateString('es-MX');
        periodoActual.textContent = `${fechaFormateada} - ${fechaFormateada}`;
    }
}

// Función mejorada para renderizar la tabla de registros
function renderRegistrosTableAdvanced() {
    const tbody = document.querySelector('#registrosTable tbody');
    if (!tbody) {
        return;
    }
    
    const registros = adminState.registrosData || [];
    
    if (registros.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="11" style="text-align: center; color: #6b7280; padding: 40px;">
                    <i class="fas fa-inbox" style="font-size: 48px; margin-bottom: 10px; opacity: 0.3;"></i><br>
                    No hay registros para mostrar<br>
                    <small>Intenta ajustar los filtros o el rango de fechas</small>
                </td>
            </tr>
        `;
        return;
    }
    
    // Agrupar registros por empleado y fecha
    const registrosAgrupados = agruparRegistrosPorEmpleadoYFecha(registros);
    
    tbody.innerHTML = registrosAgrupados.map(grupo => `
        <tr>
            <td>
                <input type="checkbox" name="registro-select" value="${grupo.empleado_id}">
            </td>
            <td>
                <div class="empleado-info">
                    <div class="empleado-avatar">
                        ${getInitials(grupo.empleado_nombre)}
                    </div>
                    <div class="empleado-details">
                        <div class="empleado-nombre">${grupo.empleado_nombre}</div>
                        <div class="empleado-codigo">${grupo.empleado_codigo || 'Sin código'}</div>
                    </div>
                </div>
            </td>
            <td>
                <span class="fecha-badge">${formatDateBadge(grupo.fecha)}</span>
            </td>
            <td>
                ${renderHoraBadge(grupo.entrada)}
            </td>
            <td>
                ${renderHoraBadge(grupo.salida)}
            </td>
            <td>
                <span class="horas-trabajadas">${calcularHorasTrabajadasGrupo(grupo)}</span>
            </td>
            <td>
                <div class="horas-objetivo">
                    <i class="fas fa-clock" style="color: #3b82f6; font-size: 12px;"></i>
                    <span>${grupo.horas_objetivo || '8:00'}</span>
                </div>
            </td>
            <td>
                <span class="estatus-badge ${getEstatusClassAdvanced(grupo.estatus)}">
                    ${grupo.estatus}
                </span>
            </td>
            <td>
                <span class="tablet-info">${grupo.tablet_id || 'N/A'}</span>
            </td>
            <td>
                ${grupo.foto_url ?
                    `<img src="${getSupabaseFotoUrl(grupo.foto_url, 'registros-fotos')}" class="foto-thumbnail" onclick="verFotoCompleta('${getSupabaseFotoUrl(grupo.foto_url, 'registros-fotos')}')" alt="Foto registro">` :
                    '<span style="color: #9ca3af; font-size: 12px;">Sin foto</span>'
                }
            </td>
            <td style="text-align: center;">
                <button onclick="verTodasFotos(${grupo.empleado_id}, '${grupo.fecha}', '${grupo.empleado_nombre}')" 
                        style="background: #17a2b8; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;">
                    📸 Ver todas
                </button>
            </td>

            <td>
                <div class="acciones-cell">
                    <button class="btn-accion eliminar" onclick="eliminarRegistro([${grupo.registros.map(r => r.id).join(',')}])" title="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
    
    // Actualizar información de paginación
    updatePaginationInfo(registrosAgrupados.length);
}

// Agrupar registros por empleado y fecha
function agruparRegistrosPorEmpleadoYFecha(registros) {
    const grupos = new Map();

    // Agrupar registros por empleado y fecha
    registros.forEach(registro => {
        const fechaMazatlan = getMazatlanTime(registro.fecha_hora);
        const year = fechaMazatlan.getFullYear();
        const month = String(fechaMazatlan.getMonth() + 1).padStart(2, '0');
        const day = String(fechaMazatlan.getDate()).padStart(2, '0');
        const fecha = `${year}-${month}-${day}`;
        const key = `${registro.empleado_id}-${fecha}`;

        if (!grupos.has(key)) {
            grupos.set(key, {
                empleado_id: registro.empleado_id,
                empleado_nombre: registro.empleado_nombre,
                empleado_codigo: registro.empleado_codigo,
                fecha: fecha,
                registros: [],  // Array de todos los registros del día
                tablet_id: registro.tablet_id,
                foto_url: registro.foto_registro,
                horas_objetivo: '8:00'
            });
        }

        const grupo = grupos.get(key);
        grupo.registros.push(registro);
    });

    // Procesar cada grupo para calcular horas correctamente
    return Array.from(grupos.values()).map(grupo => {
        const registrosOrdenados = grupo.registros.sort((a, b) =>
            getMazatlanTime(a.fecha_hora) - getMazatlanTime(b.fecha_hora)
        );

        // Emparejar entrada-salida consecutivos
        let entradaPendiente = null;
        let totalMinutos = 0;
        const pares = [];

        for (let i = 0; i < registrosOrdenados.length; i++) {
            const registro = registrosOrdenados[i];

            if (registro.tipo_registro === 'ENTRADA') {
                entradaPendiente = registro;
            } else if (registro.tipo_registro === 'SALIDA' && entradaPendiente) {
                // Calcular diferencia entre entrada y salida
                const entrada = new Date(entradaPendiente.fecha_hora);
                const salida = new Date(registro.fecha_hora);
                const minutos = Math.floor((salida - entrada) / (1000 * 60));

                totalMinutos += minutos;
                pares.push({
                    entrada: entradaPendiente,
                    salida: registro,
                    minutos: minutos
                });

                entradaPendiente = null;
            }
        }

        // Calcular descanso real y aplicar ajuste obligatorio de 60 minutos
        // Empleados exentos del descuento de descanso obligatorio
        const exentosDescanso = ['A01','PX005'];
        const esExento = exentosDescanso.includes(grupo.empleado_codigo);

        let descansoRealMinutos = 0;
        let descansoAjuste = 0;

        if (!esExento && pares.length > 1) {
            // Calcular tiempo de descanso entre pares consecutivos
            for (let p = 0; p < pares.length - 1; p++) {
                const salidaDescanso = new Date(pares[p].salida.fecha_hora);
                const entradaDescanso = new Date(pares[p + 1].entrada.fecha_hora);
                descansoRealMinutos += Math.floor((entradaDescanso - salidaDescanso) / (1000 * 60));
            }
            // Si el descanso real fue menor a 60 min, descontar la diferencia
            if (descansoRealMinutos < 60) {
                descansoAjuste = 60 - descansoRealMinutos;
            }
        } else if (!esExento && pares.length === 1) {
            // No tomó descanso: descontar 60 minutos obligatorios
            descansoAjuste = 60;
        }

        const minutosAjustados = Math.max(0, totalMinutos - descansoAjuste);

        // Convertir minutos ajustados a formato decimal
        const horasDecimal = (minutosAjustados / 60).toFixed(1);
        const horasFormato = horasDecimal;

        // Determinar estatus
        let estatus = 'SIN REGISTRO';
        if (pares.length > 0) {
            estatus = 'COMPLETO';    // Al menos un par entrada-salida
        } else if (registrosOrdenados.length > 0) {
            estatus = 'INCOMPLETO';  // Hay registros pero sin pares (solo entrada o solo salida)
        }

        const entradaRegistro = registrosOrdenados.find(r => r.tipo_registro === 'ENTRADA');
        const salidaRegistro = [...registrosOrdenados].reverse().find(r => r.tipo_registro === 'SALIDA');

        return {
            ...grupo,
            entrada: entradaRegistro,
            salida: salidaRegistro,
            horas_trabajadas: horasFormato,
            minutos_totales: minutosAjustados,
            minutos_brutos: totalMinutos,
            descanso_real_minutos: descansoRealMinutos,
            descanso_ajuste_minutos: descansoAjuste,
            pares_entrada_salida: pares,
            estatus: estatus
        };
    });
}

// Funciones auxiliares para registros avanzados
function getInitials(nombre) {
    if (!nombre) return '??';
    return nombre.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

function formatDateBadge(fecha) {
    const date = new Date(fecha + 'T00:00:00');
    return date.toLocaleDateString('es-MX', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function renderHoraBadgeAdvanced(registro) {
    if (!registro) {
        return '<span class="hora-badge sin-registro">--:--</span>';
    }

    const horaMazatlan = getMazatlanTime(registro.fecha_hora);
    const hora = horaMazatlan.toLocaleTimeString('en-US', { timeZone: 'America/Mazatlan',
        hour: '2-digit',
        minute: '2-digit'
    });

    const esTardanza = esTardanzaRegistro(registro, horaMazatlan);
    const claseExtra = esTardanza ? ' tardanza' : '';
    return `<span class="hora-badge${claseExtra}">${hora}</span>`;
}

function renderHoraBadge(registro) {
    if (!registro) {
        return '<span class="hora-badge sin-registro">--:--</span>';
    }

    const horaMazatlan = getMazatlanTime(registro.fecha_hora);
    const hora = horaMazatlan.toLocaleTimeString('en-US', { timeZone: 'America/Mazatlan',
        hour: '2-digit',
        minute: '2-digit'
    });

    const esTardanza = esTardanzaRegistro(registro, horaMazatlan);
    const claseExtra = esTardanza ? ' tardanza' : '';
    return `<span class="hora-badge${claseExtra}">${hora}</span>`;
}

function esTardanzaRegistro(registro, horaMazatlan) {
    if (registro.tipo_registro !== 'ENTRADA') return false;

    // Usar hora del bloque horario asignado si existe
    if (registro.bloque_horario && registro.bloque_horario.hora_entrada) {
        const partes = registro.bloque_horario.hora_entrada.split(':');
        const horaLimite = parseInt(partes[0]);
        const minLimite = parseInt(partes[1] || 0);
        const horaRegistro = horaMazatlan.getHours();
        const minRegistro = horaMazatlan.getMinutes();

        // Agregar 10 minutos de tolerancia (hasta 8:10 es puntual, 8:11 ya es tarde)
        const limiteConTolerancia = horaLimite * 60 + minLimite + 10;
        const registroMinutos = horaRegistro * 60 + minRegistro;

        return registroMinutos > limiteConTolerancia;
    }

    // Fallback: si no hay horario asignado, considerar tardanza después de 8:10 (8:11 en adelante)
    return horaMazatlan.getHours() > 8 || (horaMazatlan.getHours() === 8 && horaMazatlan.getMinutes() > 10);
}

function calcularHorasTrabajadasGrupo(grupo) {
    // Usar el nuevo campo que calcula correctamente los pares entrada-salida
    return grupo.horas_trabajadas || '0.0';
}

function getEstatusClassAdvanced(estatus) {
    const clases = {
        'COMPLETO': 'completo',
        'INCOMPLETO': 'incompleto',
        'SIN REGISTRO': 'sin-registro'
    };
    return clases[estatus] || 'sin-registro';
}

// Actualizar estadísticas de registros
function updateRegistrosStats() {
    const registros = adminState.registrosData || [];
    
    // Calcular estadísticas
    const registrosSinCheck = registros.filter(r => !r.tipo_registro || r.tipo_registro === '').length;
    const totalRegistros = registros.length;

    // Actualizar elementos
    const elSinCheck = document.getElementById('registrosSinCheck');
    const elTotal = document.getElementById('totalRegistros');

    if (elSinCheck) elSinCheck.textContent = registrosSinCheck;
    if (elTotal) elTotal.textContent = totalRegistros;
}

// Configurar filtros de registros
function setupRegistrosFilters() {
    // Event listeners para filtros automáticos
    const fechaInicio = document.getElementById('fechaInicio');
    const fechaFin = document.getElementById('fechaFin');
    
    if (fechaInicio && fechaFin) {
        fechaInicio.addEventListener('change', () => {
            if (fechaFin.value && fechaInicio.value > fechaFin.value) {
                fechaFin.value = fechaInicio.value;
            }
        });
        
        fechaFin.addEventListener('change', () => {
            if (fechaInicio.value && fechaFin.value < fechaInicio.value) {
                fechaInicio.value = fechaFin.value;
            }
        });
    }
}
// Función para descargar faltas por RANGO de fechas
async function obtenerEmpleadosSinEntradaRango(event) {
    const fechaInicio = document.getElementById('fecha-inicio-faltas').value;
    const fechaFin = document.getElementById('fecha-fin-faltas').value;

    if (!fechaInicio || !fechaFin) {
        alert('⚠️ Selecciona fecha de inicio y fin');
        return;
    }

    if (fechaInicio > fechaFin) {
        alert('⚠️ La fecha de inicio debe ser menor que la fecha fin');
        return;
    }

    try {
        const button = event?.target || document.querySelector('#btn-descargar-faltas');
        const originalText = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';


        // Obtener empleados activos filtrados por sucursal del usuario
        const empleadosResult = await SupabaseAPI.getEmpleados(window.currentUserSucursal);
        if (!empleadosResult.success) {
            throw new Error('Error obteniendo empleados');
        }

        const empleadosActivos = empleadosResult.data.filter(emp => emp.activo);

        // Obtener registros del rango filtrados por sucursal del usuario
        const filtros = {
            sucursalUsuario: window.currentUserSucursal
        };
        const registrosResult = await SupabaseAPI.getRegistrosByFecha(fechaInicio, fechaFin, filtros);
        if (!registrosResult.success) {
            throw new Error('Error obteniendo registros');
        }

        const registros = registrosResult.data;

        // Obtener justificaciones del rango para excluir días justificados
        const justResult = await SupabaseAPI.getJustificacionesPorRango(
            fechaInicio, fechaFin, window.currentUserSucursal
        );
        const justificaciones = justResult.success ? justResult.data : [];

        // Generar todas las fechas del rango
        const fechas = generarRangoFechas(fechaInicio, fechaFin);
        const todasLasFaltas = [];

        // Buscar faltas por cada fecha
        for (let i = 0; i < fechas.length; i++) {
            const fecha = fechas[i];
            button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Analizando ${fecha} (${i + 1}/${fechas.length})`;

            // Filtrar registros de esta fecha
            const registrosFecha = registros.filter(reg => {
                // Extraer solo la fecha en formato YYYY-MM-DD sin zona horaria
                let regFecha;
                if (reg.fecha_hora.includes('T')) {
                    regFecha = reg.fecha_hora.split('T')[0];
                } else {
                    // Si no tiene T, crear fecha local y formatear
                    const d = new Date(reg.fecha_hora + 'T00:00:00');
                    const year = d.getFullYear();
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    regFecha = `${year}-${month}-${day}`;
                }
                return regFecha === fecha && reg.tipo_registro === 'ENTRADA';
            });

            // IDs de empleados que SÍ registraron entrada
            const empleadosConEntrada = new Set(registrosFecha.map(reg => reg.empleado_id));

            // Empleados que NO registraron entrada y NO tienen justificación
            const faltasDia = empleadosActivos.filter(emp => {
                if (empleadosConEntrada.has(emp.id)) return false;
                const tieneJustificacion = justificaciones.some(j =>
                    j.empleado_id === emp.id &&
                    j.fecha_inicio <= fecha &&
                    j.fecha_fin >= fecha
                );
                return !tieneJustificacion;
            });

            // Agregar fecha a cada falta
            faltasDia.forEach(emp => {
                todasLasFaltas.push({
                    fecha_falta: fecha,
                    codigo_empleado: emp.codigo_empleado,
                    nombre_completo: `${emp.nombre} ${emp.apellido}`,
                    sucursal: emp.sucursal,
                    puesto: emp.puesto,
                    horario_nombre: emp.horario_nombre || 'Sin horario',
                    observacion: 'Sin registro de entrada'
                });
            });
        }


        if (todasLasFaltas.length === 0) {
            alert('✅ No se encontraron faltas en el rango de fechas seleccionado');
        } else {
            descargarExcelFaltasRango(todasLasFaltas, fechaInicio, fechaFin);
        }

        button.disabled = false;
        button.innerHTML = originalText;

    } catch (error) {
        alert('❌ Error al consultar faltas: ' + error.message);

        const btnFallback = event?.target || document.querySelector('#btn-descargar-faltas');
        if (btnFallback) {
            btnFallback.disabled = false;
            btnFallback.innerHTML = '📥 Descargar Rango';
        }
    }
}

function generarRangoFechas(fechaInicio, fechaFin) {
    const fechas = [];
    // Agregar 'T00:00:00' para forzar hora local y evitar problemas de zona horaria
    const inicio = new Date(fechaInicio + 'T00:00:00');
    const fin = new Date(fechaFin + 'T00:00:00');

    // Crear nueva instancia en cada iteración para evitar mutación
    for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
        // Usar toLocaleDateString con formato ISO
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        fechas.push(`${year}-${month}-${day}`);
    }

    return fechas;
}

function descargarExcelFaltasRango(empleados, fechaInicio, fechaFin) {
    
    // Crear contenido CSV
    let csvContent = '\ufeff'; // BOM para UTF-8
    
    // HEADERS
    csvContent += 'REPORTE DE FALTAS POR RANGO DE FECHAS\n';
    csvContent += `Período: ${fechaInicio} al ${fechaFin}\n`;
    csvContent += `Total faltas encontradas: ${empleados.length}\n`;
    csvContent += `Generado: ${new Date().toLocaleString()}\n`;
    csvContent += `Nota: Se excluyen días con justificaciones (vacaciones, incapacidad, permisos)\n\n`;
    
    // HEADERS DE TABLA
    csvContent += 'Fecha,Código,Empleado,Sucursal,Puesto,Horario,Observación\n';
    
    // AGRUPAR por fecha para mejor organización
    const faltasPorFecha = {};
    empleados.forEach(empleado => {
        if (!faltasPorFecha[empleado.fecha_falta]) {
            faltasPorFecha[empleado.fecha_falta] = [];
        }
        faltasPorFecha[empleado.fecha_falta].push(empleado);
    });
    
    // ORDENAR fechas
    const fechasOrdenadas = Object.keys(faltasPorFecha).sort();
    
    // DATOS ORGANIZADOS por fecha
    fechasOrdenadas.forEach(fecha => {
        faltasPorFecha[fecha].forEach(empleado => {
            csvContent += `"${empleado.fecha_falta}",`;
            csvContent += `"${empleado.codigo_empleado}",`;
            csvContent += `"${empleado.nombre_completo}",`;
            csvContent += `"${empleado.sucursal || ''}",`;
            csvContent += `"${empleado.puesto || ''}",`;
            csvContent += `"${empleado.horario_nombre}",`;
            csvContent += `"${empleado.observacion}"\n`;
        });
    });
    
    // RESUMEN por fecha al final
    csvContent += '\n\nRESUMEN POR FECHA:\n';
    csvContent += 'Fecha,Cantidad Faltas\n';
    fechasOrdenadas.forEach(fecha => {
        csvContent += `"${fecha}",${faltasPorFecha[fecha].length}\n`;
    });

    // CREAR y DESCARGAR archivo
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    const totalDias = fechasOrdenadas.length;
    const nombreArchivo = `Faltas_${fechaInicio}_al_${fechaFin}_${empleados.length}_faltas_${totalDias}_dias.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', nombreArchivo);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    alert(`📥 Excel descargado: ${empleados.length} faltas en ${totalDias} días`);
}
async function verTodasFotos(empleadoId, fecha, nombre) {
    try {

        // NUEVO: Usar Supabase API
        const result = await SupabaseAPI.getFotosRegistro(empleadoId, fecha);

        if (result.success && result.data.length > 0) {
            mostrarModalFotosReales(result.data, result.empleado, fecha);
        } else {
            alert(`📸 No hay fotos para ${nombre} el ${fecha}`);
        }
    } catch (error) {
        alert('❌ Error al consultar fotos');
    }
}

function mostrarModalFotosReales(fotos, empleado, fecha) {
    // Eliminar modal anterior si existe
    const modalAnterior = document.getElementById('modal-fotos-reales');
    if (modalAnterior) {
        modalAnterior.remove();
    }

    // Crear modal
    const modal = document.createElement('div');
    modal.id = 'modal-fotos-reales';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.9);
        z-index: 10000;
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 20px;
    `;

    modal.innerHTML = `
        <div style="
            background: white;
            border-radius: 10px;
            max-width: 90%;
            max-height: 90%;
            overflow-y: auto;
            position: relative;
        ">
            <!-- HEADER -->
            <div style="background: #17a2b8; color: white; padding: 20px; border-radius: 10px 10px 0 0; position: sticky; top: 0;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h2 style="margin: 0;">📸 ${empleado.nombre} - ${fecha}</h2>
                        <p style="margin: 5px 0 0 0; opacity: 0.9;">
                            Código: ${empleado.codigo} • ${fotos.length} foto(s)
                        </p>
                    </div>
                    <button class="btn-cerrar-modal" 
                            style="background: rgba(255,255,255,0.2); color: white; border: 1px solid white; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; font-size: 20px;">
                        ×
                    </button>
                </div>
            </div>

            <!-- GALERÍA -->
            <div style="padding: 20px;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
                    ${fotos.map((foto, index) => {
                        const rutaFoto = getSupabaseFotoUrl(foto.foto_url || foto.foto_registro, 'registros-fotos') || '';
                        return `
                        <div style="border: 1px solid #dee2e6; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                            <!-- Info del registro -->
                            <div style="background: #f8f9fa; padding: 12px; border-bottom: 1px solid #dee2e6;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                                    <span style="font-weight: bold; color: #495057; font-size: 14px;">Registro #${index + 1}</span>
                                    <span style="background: ${foto.tipo_registro === 'ENTRADA' ? '#28a745' : '#dc3545'}; color: white; padding: 2px 6px; border-radius: 10px; font-size: 11px; font-weight: bold;">
                                        ${foto.tipo_registro}
                                    </span>
                                </div>
                                <div style="font-size: 12px; color: #6c757d;">
                                   🕐 ${getMazatlanTime(foto.fecha_hora).toLocaleTimeString('en-US', { timeZone: 'America/Mazatlan' })}<br>
                                    🖥️ Tablet: ${foto.tablet_id || 'N/A'}
                                </div>
                            </div>
                            
                            <!-- FOTO REAL -->
                            <div style="text-align: center; padding: 15px; background: white;">
                                <img src="${rutaFoto}" 
                                     alt="Foto ${foto.tipo_registro}"
                                     style="max-width: 100%; height: 200px; object-fit: cover; border-radius: 5px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.1);"
                                     onclick="window.open('${rutaFoto}', '_blank')"
                                     title="Click para ver en tamaño completo"
                                     onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                                <div style="display: none; padding: 40px; background: #f8f9fa; color: #6c757d; font-style: italic;">
                                    Foto no disponible
                                </div>
                                <div style="margin-top: 10px;">
                                    <button onclick="window.open('${rutaFoto}', '_blank')"
                                            style="background: #007bff; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 11px; margin-right: 5px;">
                                        🔍 Ampliar
                                    </button>
                                    <button onclick="descargarFotoIndividual('${rutaFoto}', '${empleado.codigo}_${foto.tipo_registro}_${getMazatlanTime(foto.fecha_hora).getHours()}${getMazatlanTime(foto.fecha_hora).getMinutes().toString().padStart(2, '0')}')"
                                            style="background: #28a745; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 11px;">
                                        📥 Descargar
                                    </button>
                                </div>
                            </div>
                        </div>
                        `;
                    }).join('')}
                </div>
            </div>

            <!-- FOOTER -->
            <div style="background: #f8f9fa; padding: 15px; text-align: center; border-top: 1px solid #dee2e6; border-radius: 0 0 10px 10px;">
                <button class="btn-cerrar-modal-footer" 
                        style="background: #6c757d; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                    🔙 Cerrar
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // AGREGAR EVENT LISTENERS DESPUÉS DE CREAR EL DOM
    const btnCerrarHeader = modal.querySelector('.btn-cerrar-modal');
    const btnCerrarFooter = modal.querySelector('.btn-cerrar-modal-footer');
    
    if (btnCerrarHeader) {
        btnCerrarHeader.addEventListener('click', cerrarModalFotosReales);
    }
    
    if (btnCerrarFooter) {
        btnCerrarFooter.addEventListener('click', cerrarModalFotosReales);
    }

    // Cerrar con click fuera del modal
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            cerrarModalFotosReales();
        }
    });

    // Cerrar con ESC
    const handleEscape = function(e) {
        if (e.key === 'Escape') {
            cerrarModalFotosReales();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
}

function cerrarModalFotosReales() {
    const modal = document.getElementById('modal-fotos-reales');
    if (modal) {
        modal.remove();
    }
}
function descargarFotoIndividual(rutaFoto, nombreArchivo) {
    const link = document.createElement('a');
    link.href = rutaFoto;
    link.download = nombreArchivo + '.jpg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
// Configurar paginación
function setupRegistrosPagination() {
    // Por implementar paginación completa
}

// Funciones adicionales para registros
function updatePaginationInfo(totalItems) {
    const paginationInfo = document.getElementById('paginationInfo');
    if (paginationInfo) {
        paginationInfo.textContent = `Mostrando registros del 1 al ${Math.min(10, totalItems)} de un total de ${totalItems}`;
    }
}

function reloadRegistros() {
    loadRecentRegistros();
}

function verFotoCompleta(url) {
    // Implementar modal para ver foto completa
    window.open(url, '_blank', 'width=600,height=600');
}

function editarRegistro(id) {
    showAlert('Info', 'Función de edición en desarrollo', 'info');
}

async function eliminarRegistro(ids) {
    if (!ids || ids.length === 0) {
        showAlert('Error', 'No se encontró el registro a eliminar', 'error');
        return;
    }

    const msg = ids.length === 1
        ? '¿Estás seguro de eliminar este registro? Esta acción no se puede deshacer.'
        : `¿Estás seguro de eliminar estos ${ids.length} registros del día? Esta acción no se puede deshacer.`;

    if (!confirm(msg)) return;

    try {
        // Obtener los datos antes de borrar para auditoría
        const { data: registrosABorrar, error: fetchError } = await supabaseClient
            .from('registros')
            .select('*')
            .in('id', ids);

        if (fetchError) throw fetchError;

        // Obtener usuario actual
        const session = JSON.parse(localStorage.getItem('session_sucursal') || sessionStorage.getItem('session_sucursal'));
        const usuario = session?.username || 'desconocido';

        // Insertar auditoría para cada registro
        const auditorias = registrosABorrar.map(reg => ({
            tabla: 'registros',
            operacion: 'DELETE',
            registro_id: reg.id,
            datos_anteriores: JSON.stringify(reg),
            datos_nuevos: null,
            user_agent: usuario
        }));

        const { error: auditError } = await supabaseClient.from('auditoria').insert(auditorias);
        if (auditError) {
            console.error('Error al insertar auditoría:', auditError);
        }

        // Ahora sí borrar
        const { error } = await supabaseClient
            .from('registros')
            .delete()
            .in('id', ids);

        if (error) throw error;

        showAlert('Éxito', 'Registro(s) eliminado(s) correctamente', 'success');
        reloadRegistros();
    } catch (error) {
        console.error('Error al eliminar registro:', error);
        showAlert('Error', 'No se pudo eliminar el registro', 'error');
    }
}

function imprimirRegistros() {
    window.print();
}

function configurarColumnas() {
    showAlert('Info', 'Función de configuración de columnas en desarrollo', 'info');
}

function cambiarPagina(direccion) {
    showAlert('Info', 'Paginación en desarrollo', 'info');
}

function toggleSelectAll() {
    const selectAll = document.getElementById('selectAllRegistros');
    const checkboxes = document.querySelectorAll('input[name="registro-select"]');
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAll.checked;
    });
}

// ================================
// ACTUALIZACIÓN DE ESTADÍSTICAS
// ================================
function updateDashboardStats(stats) {
    
    if (!stats || typeof stats !== 'object') {
        stats = {};
    }
    
    const valores = {
        presentes: parseInt(stats.empleadosPresentes || stats.empleados_presentes || 0),
        registros: parseInt(stats.registrosHoy || stats.registros_hoy?.total_registros || stats.registros_hoy || 0) || 0,
        tardanzas: parseInt(stats.llegadasTarde || stats.tardanzas || stats.llegadas_tarde || 0),
        tablets: parseInt(stats.tabletsActivas || stats.tablets_activas || 0)
    };
    
    const elementos = {
        presentes: elements.empleadosPresentes,
        registros: elements.registrosHoy,
        tardanzas: elements.llegadasTarde,
        tablets: elements.tabletsActivas
    };
    
    Object.keys(elementos).forEach(key => {
        const elemento = elementos[key];
        if (elemento) {
            elemento.textContent = valores[key];
        }
    });
    
    // Backup con selectores alternativos
    if (!elementos.presentes) {
        const el = document.querySelector('[data-stat="presentes"] .stat-number, .stat-card:nth-child(1) .stat-number');
        if (el) el.textContent = valores.presentes;
    }
    if (!elementos.registros) {
        const el = document.querySelector('[data-stat="registros"] .stat-number, .stat-card:nth-child(2) .stat-number');
        if (el) el.textContent = valores.registros;
    }
    if (!elementos.tardanzas) {
        const el = document.querySelector('[data-stat="tardanzas"] .stat-number, .stat-card:nth-child(3) .stat-number');
        if (el) el.textContent = valores.tardanzas;
    }
    if (!elementos.tablets) {
        const el = document.querySelector('[data-stat="tablets"] .stat-number, .stat-card:nth-child(4) .stat-number');
        if (el) el.textContent = valores.tablets;
    }
    
    setTimeout(() => {
        document.querySelectorAll('.stat-number').forEach(el => {
            if (el.textContent.includes('[object') || el.textContent.includes('undefined') || el.textContent === '') {
                el.textContent = '0';
            }
        });
    }, 100);
}

function updateEmpleadosPresentesTable(empleados) {
    const tbody = elements.empleadosPresentesTable?.querySelector('tbody');
    if (!tbody) {
        return;
    }
    
    if (!empleados || empleados.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; color: #6b7280; padding: 20px;">
                    No hay empleados presentes hoy
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = empleados.map(emp => {
        const horaEntrada = emp.hora_entrada ?
            getMazatlanTime(emp.hora_entrada).toLocaleTimeString('en-US', { timeZone: 'America/Mazatlan',
                hour: '2-digit',
                minute: '2-digit'
            }) : 'N/A';
            
        const horaSalidaEsperada = emp.hora_salida_esperada || 'N/A';
        
        const estadoClass = {
            'PRESENTE': 'badge-success',
            'COMPLETO': 'badge-info',
            'AUSENTE': 'badge-warning'
        }[emp.estado] || 'badge-secondary';
        
        const fotoUrl = getSupabaseFotoUrl(emp.foto_perfil) || '/assets/default-avatar.png';

        return `
            <tr>
                <td>
                    <div class="employee-info">
                        <img src="${fotoUrl}"
                             alt="${emp.nombre_completo || 'Empleado'}"
                             class="employee-avatar"
                             onerror="this.src='data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="#666"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>')}'">
                        <div>
                            <strong>${emp.nombre_completo || 'Sin nombre'}</strong>
                            <small>${emp.codigo_empleado || 'Sin código'}</small>
                        </div>
                    </div>
                </td>
                <td>${horaEntrada}</td>
                <td>${horaSalidaEsperada}</td>
                <td><span class="badge ${estadoClass}">${emp.estado || 'AUSENTE'}</span></td>
            </tr>
        `;
    }).join('');
}

function updateUltimosRegistrosTable(registros) {
    const tbody = elements.ultimosRegistrosTable?.querySelector('tbody');
    if (!tbody) {
        return;
    }
    
    if (!registros || registros.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; color: #6b7280; padding: 20px;">
                    No hay registros recientes
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = registros.map(reg => {
        const hora = reg.fecha_hora ?
            getMazatlanTime(reg.fecha_hora).toLocaleTimeString('en-US', { timeZone: 'America/Mazatlan',
                hour: '2-digit',
                minute: '2-digit'
            }) : 'N/A';
        
        const tipoClass = reg.tipo_registro === 'ENTRADA' ? 'badge-success' : 'badge-info';
        
        return `
            <tr>
                <td>${hora}</td>
                <td>${reg.empleado_nombre || 'N/A'}</td>
                <td><span class="badge ${tipoClass}">${reg.tipo_registro || 'N/A'}</span></td>
                <td>${reg.tablet_id || 'N/A'}</td>
            </tr>
        `;
    }).join('');
}

// ================================
// RENDERIZADO DE TABLAS
// ================================
function renderEmployeesTable() {
    const tbody = elements.empleadosTable?.querySelector('tbody');
    if (!tbody) return;
    
    const filteredEmployees = applyEmployeeFilters();
    
    if (filteredEmployees.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; color: #6b7280; padding: 20px;">
                    No hay empleados para mostrar
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = filteredEmployees.map(emp => {
        const fotoUrl = getSupabaseFotoUrl(emp.foto_perfil) || '/assets/default-avatar.png';

        return `
        <tr data-id="${emp.id}">
            <td>
                <img src="${fotoUrl}"
                    alt="${emp.nombre || 'Empleado'}"
                    class="employee-photo"
                    style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;"
                    onerror="this.src='data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="#666"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>')}'">
            </td>
            <td>${emp.codigo_empleado || 'N/A'}</td>
            <td>${(emp.nombre || '') + ' ' + (emp.apellido || '')}</td>
            <td>
                <span class="badge-sucursal" style="background: #3b82f6; color: white; padding: 3px 8px; border-radius: 12px; font-size: 11px;">
                    ${emp.sucursal || 'Sin asignar'}
                </span>
            </td>
            <td>
                <span class="badge-puesto" style="background: #10b981; color: white; padding: 3px 8px; border-radius: 12px; font-size: 11px;">
                    ${emp.puesto || 'Sin asignar'}
                </span>
            </td>
            <td>${emp.horario_nombre || 'Sin asignar'}</td>
            <td>
                <span class="status-badge status-${emp.activo ? 'activo' : 'inactivo'}">
                    ${emp.activo ? 'Activo' : 'Inactivo'}
                </span>
            </td>
            <td>${formatDate(emp.fecha_alta)}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-sm btn-primary" onclick="editEmployee(${emp.id})" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="viewEmployeeQR(${emp.id})" title="Ver QR">
                        <i class="fas fa-qrcode"></i>
                    </button>
                    <button class="btn btn-sm btn-warning" onclick="toggleEmployeeStatus(${emp.id})" title="Cambiar estado">
                        <i class="fas fa-power-off"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteEmployee(${emp.id})" title="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
        `;
    }).join('');
}

// Función para formatear horas bonitas
function formatearHoraBonita(horaString) {
    if (!horaString) return 'N/A';

    try {
        // Si ya es una hora en formato HH:MM:SS o HH:MM, extraerla directamente
        if (typeof horaString === 'string' && horaString.includes(':')) {
            const partes = horaString.split(':');
            const hora = parseInt(partes[0]);
            const minuto = partes[1];

            // Convertir a formato 12 horas
            const periodo = hora >= 12 ? 'PM' : 'AM';
            const hora12 = hora === 0 ? 12 : (hora > 12 ? hora - 12 : hora);

            return `${hora12}:${minuto} ${periodo}`;
        }

        // Si es un timestamp completo
        const fecha = new Date(horaString);
        if (!isNaN(fecha.getTime())) {
            return fecha.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
            });
        }

        return 'N/A';
    } catch (error) {
        return 'N/A';
    }
}
// Función para obtener ícono por descripción de bloque
function obtenerIconoBloque(descripcion) {
    const desc = (descripcion || '').toLowerCase();
    
    if (desc.includes('mañana') || desc.includes('manana')) return '🌅';
    if (desc.includes('tarde')) return '🌇';
    if (desc.includes('noche')) return '🌙';
    if (desc.includes('completo') || desc.includes('corrido')) return '⏰';
    if (desc.includes('turno 1') || desc.includes('bloque 1')) return '🌅';
    if (desc.includes('turno 2') || desc.includes('bloque 2')) return '🌇';
    
    return '⏱️'; // Ícono por defecto
}

function renderHorariosTable() {
    const tbody = elements.horariosTable?.querySelector('tbody');
    if (!tbody) return;
    
    if (adminState.horariosData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: #6b7280; padding: 20px;">
                    No hay horarios para mostrar
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = adminState.horariosData.map(horario => `
        <tr data-id="${horario.id}">
            <td>${horario.nombre || 'Sin nombre'}</td>
            <td>${horario.descripcion || 'Sin descripción'}</td>
            <td>
                <div class="bloques-info">
                    ${horario.bloques?.map((bloque, index) => {
                        const horaEntrada = formatearHoraBonita(bloque.hora_entrada);
                        const horaSalida = formatearHoraBonita(bloque.hora_salida);
                        const icono = obtenerIconoBloque(bloque.descripcion);
                        
                        return `
                            <div class="bloque-item-display" style="margin-bottom: 4px;">
                                <span class="bloque-badge" style="
                                    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
                                    color: white;
                                    padding: 4px 8px;
                                    border-radius: 6px;
                                    font-size: 12px;
                                    font-weight: 500;
                                    display: inline-flex;
                                    align-items: center;
                                    gap: 4px;
                                ">
                                    ${icono} ${bloque.descripcion || `Bloque ${index + 1}`}: 
                                    <strong>${horaEntrada} - ${horaSalida}</strong>
                                </span>
                            </div>
                        `;
                    }).join('') || '<span style="color: #6b7280; font-style: italic;">Sin bloques</span>'}
                </div>
            </td>
            <td>
                <span class="empleados-count" style="
                    background: ${horario.empleados_count > 0 ? '#10b981' : '#6b7280'};
                    color: white;
                    padding: 4px 8px;
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: bold;
                ">
                    ${horario.empleados_count || 0}
                </span>
            </td>
            <td>
                <span class="status-badge status-${horario.activo ? 'activo' : 'inactivo'}">
                    ${horario.activo ? 'Activo' : 'Inactivo'}
                </span>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-sm btn-primary" onclick="editHorario(${horario.id})" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-warning" onclick="toggleHorarioStatus(${horario.id})" title="Cambiar estado">
                        <i class="fas fa-power-off"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteHorario(${horario.id})" title="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Tabla de registros básica (para dashboard)
function renderRegistrosTable() {
    const tbody = elements.registrosTable?.querySelector('tbody');
    if (!tbody) return;
    
    if (adminState.registrosData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: #6b7280; padding: 20px;">
                    No hay registros para mostrar
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = adminState.registrosData.map(reg => `
        <tr data-id="${reg.id}">
            <td>${formatDateTime(reg.fecha_hora)}</td>
            <td>${reg.empleado_nombre || 'N/A'}</td>
            <td>
                <span class="status-badge status-${(reg.tipo_registro || '').toLowerCase()}">
                    ${reg.tipo_registro || 'N/A'}
                </span>
            </td>
            <td>${reg.bloque_descripcion || 'N/A'}</td>
            <td>${reg.tablet_id || 'N/A'}</td>
            <td>
                ${reg.foto_registro ?
                    `<button class="btn btn-sm btn-secondary" onclick="viewPhoto('${getSupabaseFotoUrl(reg.foto_registro, 'registros-fotos')}')" title="Ver foto">
                        <i class="fas fa-image"></i>
                    </button>` :
                    'Sin foto'
                }
            </td>
        </tr>
    `).join('');
}

// ================================
// GESTIÓN DE EMPLEADOS
// ================================
function openEmployeeModal(employeeId = null) {
    adminState.selectedEmployee = employeeId;

    const modal = elements.modalEmpleado;
    const title = document.getElementById('modalEmpleadoTitle');
    const sucursalField = document.getElementById('empSucursal');
    const sucursalGroup = sucursalField?.closest('.form-group');

    if (employeeId) {
        if (title) title.textContent = 'Editar Empleado';
        _toggleBuscadorNomina(false);
        loadEmployeeData(employeeId);
    } else {
        if (title) title.textContent = 'Nuevo Empleado';
        if (elements.formEmpleado) elements.formEmpleado.reset();
        clearPhotoPreview();
        _toggleBuscadorNomina(true);
        _cargarCodigosExistentes(); // carga en background los que ya están en Supabase
        _cargarNomina();            // precarga la nómina para que la búsqueda sea instantánea

        // Si NO es superadmin, ocultar el select de sucursal y pre-llenarlo
        if (!window.isSuperAdmin && window.currentUserSucursal) {
            if (sucursalField) {
                sucursalField.value = window.currentUserSucursal;
            }
            if (sucursalGroup) {
                sucursalGroup.style.display = 'none';
            }
        } else {
            // Si es superadmin, mostrar el select
            if (sucursalGroup) {
                sucursalGroup.style.display = 'block';
            }
        }
    }

    openModal('modalEmpleado');
}

async function loadEmployeeData(employeeId) {
    try {
        showLoading('Cargando datos del empleado...');

        // Usar Supabase API
        const data = await SupabaseAPI.getEmpleadoById(employeeId);

        if (data.success) {
            const emp = data.data;

            const setFieldValue = (id, value) => {
                const field = document.getElementById(id);
                if (field) field.value = value || '';
            };

            setFieldValue('empCodigo', emp.codigo_empleado);
            setFieldValue('empNombre', emp.nombre);
            setFieldValue('empApellido', emp.apellido);
            setFieldValue('empHorario', emp.horario_id);
            setFieldValue('empSucursal', emp.sucursal);
            setFieldValue('empPuesto', emp.puesto);

            const checkbox = document.getElementById('empTrabajaDomingo');
            if (checkbox) checkbox.checked = emp.trabaja_domingo || false;

            if (emp.foto_perfil) {
                showPhotoPreview(getSupabaseFotoUrl(emp.foto_perfil));
            }

            // Controlar visibilidad del campo sucursal al editar
            const sucursalField = document.getElementById('empSucursal');
            const sucursalGroup = sucursalField?.closest('.form-group');

            if (!window.isSuperAdmin) {
                // Usuarios normales no pueden cambiar la sucursal al editar
                if (sucursalGroup) {
                    sucursalGroup.style.display = 'none';
                }
            } else {
                // Superadmin puede editar la sucursal
                if (sucursalGroup) {
                    sucursalGroup.style.display = 'block';
                }
            }

            adminState.selectedEmployee = emp;
        } else {
            showAlert('Error', data.message || 'No se pudo cargar el empleado', 'error');
        }
    } catch (error) {
        showAlert('Error', 'Error de conexión: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}


// ================================
// AUTOCOMPLETAR EMPLEADOS EN FILTROS
// ================================

// Variables globales para empleados
let empleadosData = [];
let selectedEmpleadoId = null;

// Función para cargar empleados para autocompletar
async function cargarEmpleadosAutocompletar() {
    try {
        // NUEVO: Usar Supabase API
        const result = await SupabaseAPI.getEmpleados();
        
        
        // USAR LA ESTRUCTURA CORRECTA
        const empleados = result.data || result || [];
        
        empleadosData = empleados.map(emp => ({
            id: emp.id,
            codigo: emp.codigo_empleado,
            nombre: `${emp.nombre} ${emp.apellido_paterno || emp.apellido} ${emp.apellido_materno || ''}`.trim(),
            sucursal: emp.sucursal || 'Sin asignar',
            puesto: emp.puesto || 'Sin asignar'
        }));
        
    } catch (error) {
    }
}
// Función para inicializar el autocompletar
function inicializarAutocompletarEmpleados() {
    const input = document.getElementById('filterEmpleadoBusqueda');
    const suggestions = document.getElementById('empleadosSuggestions');
    const hiddenInput = document.getElementById('filterEmpleado');
    
    if (!input || !suggestions || !hiddenInput) {
        return;
    }

    // Event listener para input
    input.addEventListener('input', function(e) {
        const query = e.target.value.trim().toLowerCase();
        
        if (query.length < 2) {
            suggestions.style.display = 'none';
            hiddenInput.value = '';
            selectedEmpleadoId = null;
            return;
        }

        // Filtrar empleados
        const filteredEmpleados = empleadosData.filter(emp => 
            emp.nombre.toLowerCase().includes(query) ||
            emp.codigo.toLowerCase().includes(query) ||
            emp.sucursal.toLowerCase().includes(query) ||
            emp.puesto.toLowerCase().includes(query)
        ).slice(0, 10); // Máximo 10 resultados

        mostrarSugerencias(filteredEmpleados, suggestions, input, hiddenInput);
    });

    // Cerrar sugerencias al hacer click fuera
    document.addEventListener('click', function(e) {
        if (!input.contains(e.target) && !suggestions.contains(e.target)) {
            suggestions.style.display = 'none';
        }
    });

    // Manejar teclas
    input.addEventListener('keydown', function(e) {
        const items = suggestions.querySelectorAll('.suggestion-item');
        let selectedIndex = -1;
        
        // Encontrar item seleccionado
        items.forEach((item, index) => {
            if (item.classList.contains('selected')) {
                selectedIndex = index;
            }
        });

        switch(e.key) {
            case 'ArrowDown':
                e.preventDefault();
                selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
                actualizarSeleccionSugerencia(items, selectedIndex);
                break;
            case 'ArrowUp':
                e.preventDefault();
                selectedIndex = Math.max(selectedIndex - 1, -1);
                actualizarSeleccionSugerencia(items, selectedIndex);
                break;
            case 'Enter':
                e.preventDefault();
                if (selectedIndex >= 0 && items[selectedIndex]) {
                    items[selectedIndex].click();
                }
                break;
            case 'Escape':
                suggestions.style.display = 'none';
                break;
        }
    });
}

// Función para mostrar sugerencias
function mostrarSugerencias(empleados, suggestions, input, hiddenInput) {
    if (empleados.length === 0) {
        suggestions.innerHTML = '<div class="suggestion-item no-results">No se encontraron empleados</div>';
        suggestions.style.display = 'block';
        return;
    }

    suggestions.innerHTML = empleados.map(emp => `
        <div class="suggestion-item" data-id="${emp.id}" data-codigo="${emp.codigo}">
            <div class="suggestion-main">
                <strong>${emp.codigo}</strong> - ${emp.nombre}
            </div>
            <div class="suggestion-details">
                <span class="badge badge-sucursal">${emp.sucursal}</span>
                <span class="badge badge-puesto">${emp.puesto}</span>
            </div>
        </div>
    `).join('');

    // Event listeners para cada sugerencia
    suggestions.querySelectorAll('.suggestion-item').forEach(item => {
        if (!item.classList.contains('no-results')) {
            item.addEventListener('click', function() {
                const id = this.dataset.id;
                const codigo = this.dataset.codigo;
                const nombre = this.querySelector('.suggestion-main').textContent;
                
                input.value = nombre;
                hiddenInput.value = id;
                selectedEmpleadoId = id;
                suggestions.style.display = 'none';
                
                // Trigger change event para que otros componentes sepan del cambio
                input.dispatchEvent(new Event('empleadoSelected', { bubbles: true }));
            });
        }
    });

    suggestions.style.display = 'block';
}

// Función para actualizar selección con teclado
function actualizarSeleccionSugerencia(items, selectedIndex) {
    items.forEach(item => item.classList.remove('selected'));
    if (selectedIndex >= 0 && items[selectedIndex]) {
        items[selectedIndex].classList.add('selected');
    }
}

// Función para limpiar filtros
function limpiarFiltros() {
    // Limpiar fechas
    document.getElementById('fechaInicio').value = '';
    document.getElementById('fechaFin').value = '';
    
    // Limpiar empleado
    document.getElementById('filterEmpleadoBusqueda').value = '';
    document.getElementById('filterEmpleado').value = '';
    selectedEmpleadoId = null;
    
    // Limpiar selects
    document.getElementById('filterTipo').value = '';
    document.getElementById('filterSucursal').value = '';
    document.getElementById('filterPuesto').value = '';
    
    // Ocultar sugerencias
    document.getElementById('empleadosSuggestions').style.display = 'none';
    
    // Recargar registros sin filtros
    filtrarRegistros();
}

// Función actualizada para filtrar registros
async function filtrarRegistros() {
    const fechaInicio = document.getElementById('fechaInicio').value;
    const fechaFin = document.getElementById('fechaFin').value;
    
    // VALIDAR FECHAS
    
    // Si las fechas están mal, usar valores por defecto
    let fechaInicioValid = fechaInicio;
    let fechaFinValid = fechaFin;
    
    if (!fechaInicio || fechaInicio.length < 10 || fechaInicio.startsWith('0002')) {
        const ahora = new Date();
        fechaInicioValid = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
    }

    if (!fechaFin || fechaFin.length < 10 || fechaFin.startsWith('0002')) {
        const ahora = new Date();
        fechaFinValid = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
    }
    
    
    const empleadoId = document.getElementById('filterEmpleado').value;
    const tipo = document.getElementById('filterTipo').value;
    const sucursal = document.getElementById('filterSucursal')?.value;
    const puesto = document.getElementById('filterPuesto').value;

    try {
        showLoading('Filtrando registros...');

        // NUEVO: Usar Supabase API con filtro de sucursal del usuario
        const filtros = {
            sucursalUsuario: window.currentUserSucursal, // SIEMPRE filtrar por sucursal del usuario (null si es superadmin)
            empleadoId: empleadoId || null,
            tipo: tipo || null,
            // Solo aplicar filtro de sucursal adicional si es superadmin
            sucursal: (window.isSuperAdmin && sucursal) ? sucursal : null,
            puesto: puesto || null
        };


        const data = await SupabaseAPI.getRegistrosByFecha(fechaInicioValid, fechaFinValid, filtros);

        if (data.success) {
            // Actualizar estado global
            adminState.registrosData = data.data || data.registros || [];
            adminState.currentPage = 1; // Reiniciar paginación

            // Actualizar período mostrado
            const periodoElement = document.getElementById('periodoActual');
            if (periodoElement) {
                if (fechaInicio && fechaFin) {
                    const fechaInicioFormatted = formatearFechaCorta(fechaInicio);
                    const fechaFinFormatted = formatearFechaCorta(fechaFin);
                    periodoElement.textContent = `${fechaInicioFormatted} - ${fechaFinFormatted}`;
                } else {
                    periodoElement.textContent = 'Todos los registros';
                }
            }

            // Actualizar estadísticas
            actualizarEstadisticasRegistros(adminState.registrosData);
            
            // Renderizar tabla
            renderRegistrosTableAdvanced();
            
            } else {
                showAlert('Error', 'Error al filtrar registros: ' + data.message, 'error'); // ✅ EXISTE
            }
        
    } catch (error) {
        showAlert('Error', 'Error al filtrar registros', 'error'); // ✅ EXISTE
    } finally {
        hideLoading();
    }
}
// Función para actualizar estadísticas
function actualizarEstadisticasRegistros(registros) {
    registros = registros || [];

    const totalElement = document.getElementById('totalRegistros');
    const sinCheckElement = document.getElementById('registrosSinCheck');

    if (totalElement) {
        totalElement.textContent = registros.length;
    }

    if (sinCheckElement) {
        const sinCheck = registros.filter(r =>
            r.tipo_registro === 'ENTRADA' &&
            !registros.some(s =>
                s.empleado_id === r.empleado_id &&
                s.tipo_registro === 'SALIDA' &&
                formatearFecha(s.fecha_hora) === formatearFecha(r.fecha_hora)
            )
        ).length;
        sinCheckElement.textContent = sinCheck;
    }
}

// Función para formatear fecha corta
function formatearFechaCorta(fechaStr) {
    if (!fechaStr) return '';
    try {
        const fecha = new Date(fechaStr + 'T00:00:00');
        return fecha.toLocaleDateString('es-MX', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    } catch (error) {
        return fechaStr;
    }
}
// Función para cargar puestos dinámicamente
// Función para cargar puestos dinámicamente (CORREGIDA)
async function cargarPuestosFiltro() {
    try {
        // NUEVO: Usar Supabase API
        const result = await SupabaseAPI.getEmpleados();
        
        
        // USAR LA ESTRUCTURA CORRECTA
        const empleados = result.data || result || [];
        
        // Extraer puestos únicos
        const puestos = [...new Set(empleados
            .map(emp => emp.puesto)
            .filter(puesto => puesto && puesto.trim() !== ''))
        ].sort();
        
        const select = document.getElementById('filterPuesto');
        if (select) {
            // Mantener opción "TODOS"
            const currentValue = select.value;
            select.innerHTML = '<option value="">TODOS LOS PUESTOS</option>';
            
            puestos.forEach(puesto => {
                const option = document.createElement('option');
                option.value = puesto;
                option.textContent = puesto;
                select.appendChild(option);
            });
            
            // Restaurar valor seleccionado
            if (currentValue) {
                select.value = currentValue;
            }
            
        }
    } catch (error) {
    }
}
// Inicializar cuando se carga la página
document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('filterEmpleadoBusqueda')) {
        cargarEmpleadosAutocompletar().then(() => {
            inicializarAutocompletarEmpleados();
        });
        cargarPuestosFiltro();
    }
});

// Llamar también cuando se cambia a la sección de registros
function initRegistrosSection() {
    cargarEmpleadosAutocompletar().then(() => {
        inicializarAutocompletarEmpleados();
    });
    cargarPuestosFiltro();
}

async function guardarEmpleado() {
    try {
        const form = elements.formEmpleado || document.querySelector('#modalEmpleado form');
        if (!form) {
            showAlert('Error', 'No se encontró el formulario', 'error');
            return;
        }

        const getFieldValue = (id) => {
            const field = document.getElementById(id);
            return field ? field.value.trim() : '';
        };

        const codigo = getFieldValue('empCodigo');
        const nombre = getFieldValue('empNombre');
        const apellido = getFieldValue('empApellido');
        const horario_id = getFieldValue('empHorario');
        const sucursal = getFieldValue('empSucursal');
        const puesto = getFieldValue('empPuesto');

        if (!codigo || !nombre || !apellido) {
            showAlert('Error', 'Código, nombre y apellido son obligatorios', 'error');
            return;
        }

        showLoading('Guardando empleado...');

        const trabajaDomingos = document.getElementById('empTrabajaDomingo')?.checked || false;

        // Procesar foto si hay
        let fotoBase64 = null;
        const fotoInput = document.getElementById('empFoto');
        if (fotoInput && fotoInput.files[0]) {
            fotoBase64 = await convertirImagenABase64(fotoInput.files[0]);
        }

        const empleadoData = {
            codigo_empleado: codigo,
            nombre: nombre,
            apellido: apellido,
            horario_id: horario_id || null,
            sucursal: sucursal || null,
            puesto: puesto || null,
            trabaja_domingo: trabajaDomingos,
            activo: true
        };

        const empleadoId = adminState.selectedEmployee?.id;
        const isEditing = !!empleadoId;

        let result;
        if (isEditing) {
            result = await SupabaseAPI.updateEmpleado(empleadoId, empleadoData, fotoBase64);
        } else {
            result = await SupabaseAPI.createEmpleado(empleadoData, fotoBase64);
        }

        if (result.success) {
            showAlert('Éxito',
                isEditing ? 'Empleado actualizado correctamente' : 'Empleado creado correctamente',
                'success'
            );

            closeModal('modalEmpleado');
            await loadEmployees();

            form.reset();
            clearPhotoPreview();
            adminState.selectedEmployee = null;

        } else {
            showAlert('Error', result.message || 'Error al guardar empleado', 'error');
        }

    } catch (error) {
        showAlert('Error', 'Error de conexión: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Helper para convertir imagen a Base64
function convertirImagenABase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function editEmployee(empleadoId) {
    openEmployeeModal(empleadoId);
}

async function viewEmployeeQR(empleadoId) {
    try {
        showLoading('Cargando códigos QR...');
        
        const empleado = adminState.employeesData.find(emp => emp.id === empleadoId);
        if (!empleado) {
            showAlert('Error', 'Empleado no encontrado', 'error');
            return;
        }
        
        mostrarQR(empleadoId, 'entrada');
        
    } catch (error) {
        showAlert('Error', 'Error obteniendo código QR', 'error');
    } finally {
        hideLoading();
    }
}

async function mostrarQR(empleadoId, tipo = 'entrada') {
    const empleado = adminState.employeesData.find(emp => emp.id === empleadoId);
    if (!empleado) {
        showAlert('Error', 'Empleado no encontrado', 'error');
        return;
    }

    try {
        // Obtener configuración QR del empleado
        const qrConfig = await SupabaseAPI.getQRConfigByEmpleado(empleadoId);
        if (!qrConfig.success) {
            showAlert('Error', 'No se encontró configuración QR para este empleado', 'error');
            return;
        }

        const existingModal = document.getElementById('modalQR');
        if (existingModal) {
            existingModal.remove();
        }

        const modalHTML = `
            <div id="modalQR" class="modal active" style="display: flex;">
                <div class="modal-content" style="max-width: 600px;">
                    <div class="modal-header">
                        <h3>Códigos QR - ${empleado.nombre || ''} ${empleado.apellido || ''}</h3>
                        <span class="close" onclick="closeModal('modalQR')">&times;</span>
                    </div>
                    <div class="modal-body" style="padding: 20px;">
                        <div style="display: flex; gap: 20px; justify-content: center;">
                            <div class="qr-container" style="text-align: center; padding: 15px; border: 2px solid #16a34a; border-radius: 8px;">
                                <h4 style="color: #16a34a; margin: 0 0 10px 0;">🟢 ENTRADA</h4>
                                <div id="qrEntrada" style="display: inline-block;"></div>
                                <div style="margin-top: 10px;">
                                    <button class="btn btn-sm btn-success" onclick="descargarQR('qrEntrada', '${empleado.codigo_empleado}_entrada')">
                                        📥 Descargar
                                    </button>
                                </div>
                            </div>

                            <div class="qr-container" style="text-align: center; padding: 15px; border: 2px solid #dc2626; border-radius: 8px;">
                                <h4 style="color: #dc2626; margin: 0 0 10px 0;">🔴 SALIDA</h4>
                                <div id="qrSalida" style="display: inline-block;"></div>
                                <div style="margin-top: 10px;">
                                    <button class="btn btn-sm btn-danger" onclick="descargarQR('qrSalida', '${empleado.codigo_empleado}_salida')">
                                        📤 Descargar
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div style="margin-top: 20px; text-align: center; border-top: 1px solid #eee; padding-top: 15px;">
                            <p><strong>Empleado:</strong> ${empleado.codigo_empleado || 'N/A'}</p>
                            <p><strong>Nombre:</strong> ${empleado.nombre || ''} ${empleado.apellido || ''}</p>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-primary" onclick="imprimirQRs('${empleado.codigo_empleado}', '${empleado.nombre || ''} ${empleado.apellido || ''}')">
                            🖨️ Imprimir Ambos
                        </button>
                        <button class="btn btn-secondary" onclick="closeModal('modalQR')">Cerrar</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Generar códigos QR
        new QRCode(document.getElementById('qrEntrada'), {
            text: qrConfig.data.qr_entrada,
            width: 200,
            height: 200
        });

        new QRCode(document.getElementById('qrSalida'), {
            text: qrConfig.data.qr_salida,
            width: 200,
            height: 200
        });

    } catch (error) {
        showAlert('Error', 'Error al generar códigos QR', 'error');
    }
}

// Función para descargar un código QR
function descargarQR(containerId, filename) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const canvas = container.querySelector('canvas');
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = `${filename}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

// Función para imprimir ambos códigos QR
function imprimirQRs(codigoEmpleado, nombreEmpleado) {
    const qrEntradaCanvas = document.getElementById('qrEntrada')?.querySelector('canvas');
    const qrSalidaCanvas = document.getElementById('qrSalida')?.querySelector('canvas');

    if (!qrEntradaCanvas || !qrSalidaCanvas) {
        showAlert('Error', 'No se encontraron los códigos QR', 'error');
        return;
    }

    const printWindow = window.open('', '_blank');
    if (printWindow) {
        printWindow.document.write(`
            <html>
                <head>
                    <title>Códigos QR - ${nombreEmpleado}</title>
                    <style>
                        body { text-align: center; font-family: Arial, sans-serif; padding: 20px; }
                        .qr-container { display: inline-block; margin: 20px; padding: 20px; border: 2px solid #ddd; border-radius: 8px; }
                        .qr-entrada { border-color: #16a34a; }
                        .qr-salida { border-color: #dc2626; }
                        img { max-width: 250px; }
                        h2 { margin: 0 0 10px 0; }
                        .entrada { color: #16a34a; }
                        .salida { color: #dc2626; }
                        @media print {
                            body { margin: 0; }
                            .no-print { display: none; }
                        }
                    </style>
                </head>
                <body>
                    <h1>Códigos QR - ${nombreEmpleado}</h1>
                    <p><strong>Código:</strong> ${codigoEmpleado}</p>

                    <div class="qr-container qr-entrada">
                        <h2 class="entrada">🟢 ENTRADA</h2>
                        <img src="${qrEntradaCanvas.toDataURL()}" alt="QR Entrada">
                    </div>

                    <div class="qr-container qr-salida">
                        <h2 class="salida">🔴 SALIDA</h2>
                        <img src="${qrSalidaCanvas.toDataURL()}" alt="QR Salida">
                    </div>

                    <p class="no-print">
                        <button onclick="window.print()">🖨️ Imprimir</button>
                        <button onclick="window.close()">❌ Cerrar</button>
                    </p>
                </body>
            </html>
        `);
        printWindow.document.close();
    }
}

async function toggleEmployeeStatus(empleadoId) {
    const empleado = adminState.employeesData.find(emp => emp.id === empleadoId);
    if (!empleado) {
        showAlert('Error', 'Empleado no encontrado', 'error');
        return;
    }
    
    const newStatus = !empleado.activo;
    const action = newStatus ? 'activar' : 'desactivar';
    
    if (!confirm(`¿Estás seguro de ${action} este empleado?`)) return;
    
    try {
        showLoading(`${action.charAt(0).toUpperCase() + action.slice(1)}ando empleado...`);

        const result = await SupabaseAPI.toggleEmpleadoActivo(empleadoId, newStatus);

        if (result.success) {
            showAlert('Éxito', `Empleado ${action}ado correctamente`, 'success');
            await loadEmployees();
        } else {
            showAlert('Error', result.message || `Error al ${action} empleado`, 'error');
        }

    } catch (error) {
        showAlert('Error', 'Error de conexión', 'error');
    } finally {
        hideLoading();
    }
}

async function deleteEmployee(empleadoId) {
    if (!confirm('¿Estás seguro de eliminar este empleado? Esta acción no se puede deshacer.')) return;

    try {
        showLoading('Eliminando empleado...');

        const result = await SupabaseAPI.deleteEmpleado(empleadoId);

        if (result.success) {
            showAlert('Éxito', 'Empleado eliminado correctamente', 'success');
            await loadEmployees();
        } else {
            showAlert('Error', result.message || 'Error eliminando empleado', 'error');
        }

    } catch (error) {
        showAlert('Error', 'Error de conexión', 'error');
    } finally {
        hideLoading();
    }
}

// ================================
// FILTROS Y BÚSQUEDA
// ================================
function applyEmployeeFilters() {
    let filtered = [...adminState.employeesData];
    
    const search = elements.searchEmpleados?.value?.toLowerCase();
    if (search) {
        filtered = filtered.filter(emp => 
            (emp.nombre || '').toLowerCase().includes(search) ||
            (emp.apellido || '').toLowerCase().includes(search) ||
            (emp.codigo_empleado || '').toLowerCase().includes(search)
        );
    }
    
    const horarioFilter = elements.filterHorario?.value;
    if (horarioFilter) {
        filtered = filtered.filter(emp => emp.horario_id == horarioFilter);
    }
    
    const estadoFilter = elements.filterEstado?.value;
    if (estadoFilter !== '' && estadoFilter !== undefined) {
        filtered = filtered.filter(emp => emp.activo == (estadoFilter === '1'));
    }
    
    return filtered;
}

function filterEmployees() {
    renderEmployeesTable();
}

// ================================
// GESTIÓN DE HORARIOS
// ================================
function openHorarioModal(horarioId = null) {
    
    const modal = document.getElementById('horarioModal');
    const modalTitle = document.getElementById('modalHorarioTitle');
    const horarioForm = document.getElementById('horarioForm');
    const bloquesContainer = document.getElementById('bloquesContainer');
    
    if (!modal || !modalTitle || !horarioForm || !bloquesContainer) {
        createHorarioModalIfNeeded();
    }
    
    // SIEMPRE MODO CREAR
    modalTitle.textContent = 'Crear Nuevo Horario';
    
    // Limpiar formulario
    horarioForm.reset();
    bloquesContainer.innerHTML = '';
    document.getElementById('horarioId').value = '';
    
    // Agregar un bloque por defecto
    agregarBloqueHorario();
    
    // Mostrar modal
    modal.style.display = 'block';
    document.body.classList.add('modal-open');
    
}
// Crear modal dinámicamente si no existe
function createHorarioModalIfNeeded() {
    if (document.getElementById('horarioModal')) return true;
    
    
    const modalHTML = `
        <div id="horarioModal" class="modal" style="display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5);">
            <div class="modal-content" style="background: white; margin: 5% auto; padding: 0; width: 80%; max-width: 800px; border-radius: 10px; overflow: hidden;">
                <div class="modal-header" style="background: #3b82f6; color: white; padding: 15px 20px; display: flex; justify-content: space-between; align-items: center;">
                    <h2 id="modalHorarioTitle" style="margin: 0;">Editar Horario</h2>
                    <span class="close" onclick="closeHorarioModal()" style="font-size: 28px; cursor: pointer;">&times;</span>
                </div>
                
                <div class="modal-body" style="padding: 20px;">
                    <form id="horarioForm" onsubmit="saveHorario(event)">
                        <input type="hidden" id="horarioId" name="horario_id">
                        
                        <div style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                            <h3 style="margin: 0 0 15px 0;">Información General</h3>
                            <div style="display: flex; gap: 15px;">
                                <div style="flex: 1;">
                                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Nombre del Horario *</label>
                                    <input type="text" id="horarioNombre" name="nombre" required 
                                           style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
                                           placeholder="Ej: Horario Oficina">
                                </div>
                                <div style="flex: 2;">
                                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Descripción</label>
                                    <input type="text" id="horarioDescripcion" name="descripcion" 
                                           style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
                                           placeholder="Descripción del horario">
                                </div>
                            </div>
                        </div>
                        
                        <div style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                                <h3 style="margin: 0;">Bloques de Horario</h3>
                                <button type="button" class="btn btn-secondary" onclick="agregarBloqueHorario()" 
                                        style="padding: 8px 15px; background: #6b7280; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                    + Agregar Bloque
                                </button>
                            </div>
                            <div id="bloquesContainer" style="max-height: 400px; overflow-y: auto;">
                                <!-- Los bloques se agregan aquí -->
                            </div>
                        </div>
                        
                        <div style="display: flex; gap: 10px; justify-content: flex-end; padding-top: 15px; border-top: 1px solid #ddd;">
                            <button type="button" onclick="closeHorarioModal()" 
                                    style="padding: 10px 20px; background: #6b7280; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                Cancelar
                            </button>
                            <button type="submit" 
                                    style="padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                Guardar Horario
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    return true;
}
async function editHorario(horarioId) {
    openHorarioModal(horarioId);
}
// Función para cerrar el modal
function closeHorarioModal() {
    const modal = document.getElementById('horarioModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.classList.remove('modal-open');
    }
}
async function saveHorario(event) {
    event.preventDefault();
    
    try {
        
        const formData = new FormData(event.target);
        const horarioId = formData.get('horario_id');
        
        // SIEMPRE CREAR NUEVO HORARIO
        const isEditing = false;
        
        // Recopilar datos básicos
        const horarioData = {
            nombre: formData.get('nombre'),
            descripcion: formData.get('descripcion') || ''
        };
        
        // Recopilar bloques
        const bloques = [];
        const bloquesContainer = document.getElementById('bloquesContainer');
        const bloqueItems = bloquesContainer.querySelectorAll('.bloque-item');
        
        bloqueItems.forEach((item, index) => {
            const descripcion = item.querySelector('[name="bloque_descripcion"]').value;
            const orden = item.querySelector('[name="bloque_orden"]').value;
            const entrada = item.querySelector('[name="bloque_entrada"]').value;
            const salida = item.querySelector('[name="bloque_salida"]').value;
            const tolEntrada = item.querySelector('[name="bloque_tol_entrada"]').value;
            const tolSalida = item.querySelector('[name="bloque_tol_salida"]').value;
            
            if (entrada && salida) {
                bloques.push({
                    orden_bloque: parseInt(orden) || (index + 1),
                    hora_entrada: entrada + ':00',
                    hora_salida: salida + ':00',
                    tolerancia_entrada_min: parseInt(tolEntrada) || 15,
                    tolerancia_salida_min: parseInt(tolSalida) || 15,
                    descripcion: descripcion || `Turno ${index + 1}`
                });
            }
        });
        
        if (bloques.length === 0) {
            showAlert('Error', 'Debe agregar al menos un bloque de horario', 'error');
            return;
        }
        
        horarioData.bloques = bloques;
        
        
        showLoading('Creando nuevo horario...');
        
        // SIEMPRE USAR POST PARA CREAR NUEVO
        const response = await fetch(`${ADMIN_CONFIG.apiUrl}/horarios`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(horarioData)
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            closeHorarioModal();
            await loadHorarios();
            
            showAlert('Éxito', 'Horario creado correctamente', 'success');
                
        } else {
            showAlert('Error', result.message || 'Error al guardar horario', 'error');
        }
        
    } catch (error) {
        showAlert('Error', 'Error de conexión', 'error');
    } finally {
        hideLoading();
    }
}
// Función para actualizar números de bloques
function actualizarNumerosBloques() {
    const container = document.getElementById('bloquesContainer');
    if (!container) return;
    
    const bloques = container.querySelectorAll('.bloque-item');
    bloques.forEach((bloque, index) => {
        const numero = bloque.querySelector('.bloque-number');
        if (numero) {
            numero.textContent = `Bloque ${index + 1}`;
        }
        bloque.setAttribute('data-bloque', index + 1);
    });
}

// Función para eliminar bloque
function eliminarBloqueHorario(button) {
    const bloqueItem = button.closest('.bloque-item');
    const container = document.getElementById('bloquesContainer');
    
    if (bloqueItem && container.children.length > 1) {
        bloqueItem.remove();
        actualizarNumerosBloques();
    } else {
        showAlert('Advertencia', 'Debe tener al menos un bloque de horario', 'warning');
    }
}

async function toggleHorarioStatus(horarioId) {
    try {
        
        const horario = adminState.horariosData.find(h => h.id === horarioId);
        if (!horario) {
            showAlert('Error', 'Horario no encontrado', 'error');
            return;
        }
        
        const nuevoEstado = !horario.activo;
        const accion = nuevoEstado ? 'activar' : 'desactivar';
        
        if (!confirm(`¿Estás seguro de ${accion} este horario?\n\nHorario: ${horario.nombre}`)) {
            return;
        }
        
        showLoading(`${accion === 'activar' ? 'Activando' : 'Desactivando'} horario...`);
        
        const response = await fetch(`${ADMIN_CONFIG.apiUrl}/horarios/${horarioId}/toggle`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            // Actualizar en adminState
            horario.activo = nuevoEstado;
            
            // Recargar la tabla
            await loadHorarios();
            
            showAlert('Éxito', `Horario ${accion === 'activar' ? 'activado' : 'desactivado'} correctamente`, 'success');
            
        } else {
            showAlert('Error', result.message || 'Error al cambiar estado del horario', 'error');
        }
        
    } catch (error) {
        showAlert('Error', 'Error de conexión', 'error');
    } finally {
        hideLoading();
    }
}
async function deleteHorario(horarioId) {
    try {
        
        const horario = adminState.horariosData.find(h => h.id === horarioId);
        if (!horario) {
            showAlert('Error', 'Horario no encontrado', 'error');
            return;
        }
        
        // Verificar si tiene empleados asignados
        const empleadosResponse = await fetch(`${ADMIN_CONFIG.apiUrl}/horarios/${horarioId}/empleados`);
        const empleadosData = await empleadosResponse.json();
        
        let confirmMessage = `¿Estás seguro de eliminar este horario?\n\nHorario: ${horario.nombre}`;
        
        if (empleadosData.success && empleadosData.count > 0) {
            confirmMessage += `\n\n⚠️ ATENCIÓN: Este horario tiene ${empleadosData.count} empleado(s) asignado(s).\nSi lo eliminas, esos empleados quedarán sin horario asignado.`;
        }
        
        if (!confirm(confirmMessage)) {
            return;
        }
        
        // Confirmación adicional si tiene empleados
        if (empleadosData.success && empleadosData.count > 0) {
            if (!confirm('⚠️ CONFIRMACIÓN FINAL:\n\n¿Realmente quieres eliminar este horario?\nEsta acción no se puede deshacer.')) {
                return;
            }
        }
        
        showLoading('Eliminando horario...');
        
        const response = await fetch(`${ADMIN_CONFIG.apiUrl}/horarios/${horarioId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            // Remover de adminState
            const index = adminState.horariosData.findIndex(h => h.id === horarioId);
            if (index !== -1) {
                adminState.horariosData.splice(index, 1);
            }
            
            // Recargar la tabla
            await loadHorarios();
            
            showAlert('Éxito', 'Horario eliminado correctamente', 'success');
            
        } else {
            showAlert('Error', result.message || 'Error al eliminar horario', 'error');
        }
        
    } catch (error) {
        showAlert('Error', 'Error de conexión', 'error');
    } finally {
        hideLoading();
    }
}
// ================================
// REPORTES Y ESTADÍSTICAS
// ================================
function setupReportesSection() {
    
    // Configurar función de reportes cuando se entre a la sección
    setTimeout(() => {
        if (adminState.currentSection === 'reportes') {
            renderEstadisticasConDatosReales();
        }
    }, 1000);
}

async function renderEstadisticasConDatosReales() {
    try {
        // Usar SupabaseAPI con filtro de sucursal
        const [registrosRes, empleadosRes] = await Promise.allSettled([
            SupabaseAPI.getRegistrosToday(100, window.currentUserSucursal),
            SupabaseAPI.getEmpleados(window.currentUserSucursal)
        ]);

        let registros = { data: [] };
        let empleados = { data: [] };

        if (registrosRes.status === 'fulfilled' && registrosRes.value.success) {
            registros = { data: registrosRes.value.data || [] };
        }

        if (empleadosRes.status === 'fulfilled' && empleadosRes.value.success) {
            empleados = { data: empleadosRes.value.data || [] };
        }
        
        
        const container = document.querySelector('#estadisticas-content') || 
                         crearContenedorEstadisticas();
        
        if (!container) {
            return;
        }
        
        const totalRegistros = registros.data?.length || 0;
        const totalEmpleados = empleados.data?.length || 0;
        
        // Calcular registros de hoy
        const hoy = getMazatlanTime(new Date()).toDateString();
        const registrosDeHoy = registros.data?.filter(r => {
            const fechaReg = getMazatlanTime(r.fecha_hora).toDateString();
            return fechaReg === hoy;
        }) || [];
        
        // Calcular empleados únicos que registraron hoy
        const empleadosPresentesHoy = new Set(
            registrosDeHoy
                .filter(r => r.tipo_registro === 'ENTRADA')
                .map(r => r.empleado_nombre)
        ).size;
        
        // Calcular tablets activas
        const tabletsActivas = new Set(
            registros.data?.map(r => r.tablet_id) || []
        ).size;
        
        // Top empleados por registros
        const empleadoStats = {};
        registros.data?.forEach(registro => {
            const nombre = registro.empleado_nombre;
            if (!empleadoStats[nombre]) {
                empleadoStats[nombre] = 0;
            }
            empleadoStats[nombre]++;
        });
        
        const topEmpleados = Object.entries(empleadoStats)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 3);
        
        const porcentajeAsistencia = totalEmpleados > 0 ? 
            Math.round((empleadosPresentesHoy / totalEmpleados) * 100) : 0;
        
        container.innerHTML = `
            <div class="stats-card">
                <h4>📊 Resumen Real</h4>
                <div class="stats-grid">
                    <div class="stat-item">
                        <div class="stat-number">${totalRegistros}</div>
                        <div class="stat-label">Total Registros</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-number">${totalEmpleados}</div>
                        <div class="stat-label">Empleados</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-number">${porcentajeAsistencia}%</div>
                        <div class="stat-label">Asistencia Hoy</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-number">${tabletsActivas}</div>
                        <div class="stat-label">Tablets Activas</div>
                    </div>
                </div>
            </div>
            
            <div class="stats-card">
                <h4>📅 Actividad de Hoy</h4>
                <div class="today-stats">
                    <p><strong>Total registros:</strong> ${registrosDeHoy.length}</p>
                    <p><strong>Entradas:</strong> ${registrosDeHoy.filter(r => r.tipo_registro === 'ENTRADA').length}</p>
                    <p><strong>Salidas:</strong> ${registrosDeHoy.filter(r => r.tipo_registro === 'SALIDA').length}</p>
                    <p><strong>Empleados presentes:</strong> ${empleadosPresentesHoy}</p>
                </div>
            </div>
            
            <div class="stats-card">
                <h4>🏆 Top Empleados (Total)</h4>
                <div class="top-employees">
                    ${topEmpleados.length > 0 ? topEmpleados.map(([nombre, total], index) => `
                        <div class="employee-rank">
                            <span class="rank">${index + 1}</span>
                            <span class="name">${nombre.split(' ').slice(0, 2).join(' ')}</span>
                            <span class="score">${total}</span>
                        </div>
                    `).join('') : '<p>No hay datos disponibles</p>'}
                </div>
            </div>
            
            ${registrosDeHoy.length > 0 ? `
                <div class="stats-card">
                    <h4>📝 Últimos Registros Hoy</h4>
                    <div class="recent-logs">
                        ${registrosDeHoy.slice(-3).reverse().map(r => `
                            <div style="padding: 5px 0; border-bottom: 1px solid #eee;">
                                <strong>${r.empleado_nombre}</strong><br>
                                <small>${r.tipo_registro} - ${getMazatlanTime(r.fecha_hora).toLocaleTimeString()}</small>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        `;
        
        
    } catch (error) {
    }
}

function crearContenedorEstadisticas() {
    const reportesSection = document.querySelector('#reportes');
    if (!reportesSection) return null;
    
    const existingContainer = reportesSection.querySelector('#estadisticas-content');
    if (existingContainer) return existingContainer;
    
    const estadisticasHTML = `
        <div class="estadisticas-section" style="margin-top: 30px;">
            <h3>📊 Estadísticas del Mes</h3>
            <div id="estadisticas-content"></div>
        </div>
    `;
    
    reportesSection.insertAdjacentHTML('beforeend', estadisticasHTML);
    return reportesSection.querySelector('#estadisticas-content');
}

async function generarReporteAsistencia() {
    try {
        const fechaInicioInput = document.querySelector('input[type="date"]:first-of-type');
        const fechaFinInput = document.querySelector('input[type="date"]:last-of-type');
        const empleadoSelect = document.querySelector('select');

        const fechaInicio = fechaInicioInput?.value;
        const fechaFin = fechaFinInput?.value;
        const empleadoId = empleadoSelect?.value;

        const hoy = new Date().toISOString().split('T')[0];
        const haceUnaSemana = new Date();
        haceUnaSemana.setDate(haceUnaSemana.getDate() - 7);
        const fechaHaceUnaSemana = haceUnaSemana.toISOString().split('T')[0];
        const fechaInicioFinal = fechaInicio || fechaHaceUnaSemana;
        const fechaFinFinal = fechaFin || hoy;

        // Usar SupabaseAPI con filtro de sucursal
        const filtros = {
            sucursalUsuario: window.currentUserSucursal, // Filtrar por sucursal del usuario
            empleadoId: (empleadoId && empleadoId !== 'todos' && empleadoId !== 'Todos') ? empleadoId : null
        };

        const data = await SupabaseAPI.getRegistrosByFecha(fechaInicioFinal, fechaFinFinal, filtros);

        if (data.success && data.data && data.data.length > 0) {
            mostrarReporteEnTabla(data.data);
        } else {
            alert(`No se encontraron registros para el período ${fechaInicioFinal} - ${fechaFinFinal}`);
        }

    } catch (error) {
        alert('Error generando reporte: ' + error.message);
    }
}

function mostrarReporteEnTabla(datos) {
    let html = `
        <div style="padding: 20px; font-family: Arial; background: white;">
            <h2>📊 Reporte de Asistencia</h2>
            <p><strong>Total de registros:</strong> ${datos.length}</p>
            <table style="width:100%; border-collapse: collapse; border: 1px solid #ccc;">
                <thead style="background: #f5f5f5;">
                    <tr>
                        <th style="border: 1px solid #ccc; padding: 8px;">Fecha/Hora</th>
                        <th style="border: 1px solid #ccc; padding: 8px;">Empleado</th>
                        <th style="border: 1px solid #ccc; padding: 8px;">Código</th>
                        <th style="border: 1px solid #ccc; padding: 8px;">Tipo</th>
                        <th style="border: 1px solid #ccc; padding: 8px;">Tablet</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    datos.forEach(reg => {
        const fecha = getMazatlanTime(reg.fecha_hora).toLocaleString('es-MX');
        const tipoColor = reg.tipo_registro === 'ENTRADA' ? '#22c55e' : '#ef4444';
        
        html += `
            <tr>
                <td style="border: 1px solid #ccc; padding: 8px;">${fecha}</td>
                <td style="border: 1px solid #ccc; padding: 8px;">${reg.empleado_nombre}</td>
                <td style="border: 1px solid #ccc; padding: 8px;">${reg.codigo_empleado}</td>
                <td style="border: 1px solid #ccc; padding: 8px; color: ${tipoColor}; font-weight: bold;">${reg.tipo_registro}</td>
                <td style="border: 1px solid #ccc; padding: 8px;">${reg.tablet_id}</td>
            </tr>
        `;
    });
    
    html += '</tbody></table></div>';
    
    const ventana = window.open('', '_blank', 'width=800,height=600');
    ventana.document.write(`
        <html>
            <head>
                <title>Reporte de Asistencia</title>
                <meta charset="utf-8">
            </head>
            <body>
                ${html}
                <div style="text-align: center; margin: 20px;">
                    <button onclick="window.print()" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px;">🖨️ Imprimir</button>
                </div>
            </body>
        </html>
    `);
}

function updateDateFilters() {
    const fechaInicio = elements.fechaInicio?.value;
    const fechaFin = elements.fechaFin?.value;
    
    
    adminState.filters.fechaInicio = fechaInicio;
    adminState.filters.fechaFin = fechaFin;
    
    // Si estamos en la sección de registros, usar la función avanzada
    if (adminState.currentSection === 'registros') {
        renderRegistrosTableAdvanced(); // ← YA ESTÁ BIEN
    } else {
        renderRegistrosTableAdvanced(); // ← Función simple para dashboard
    }
}

// ================================
// UTILIDADES
// ================================
function formatTime(timeString) {
    if (!timeString) return 'N/A';
    try {
        return new Date('1970-01-01T' + timeString + 'Z').toLocaleTimeString('en-US', { timeZone: 'America/Mazatlan',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return 'N/A';
    }
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    try {
        return new Date(dateString).toLocaleDateString('es-MX');
    } catch {
        return 'N/A';
    }
}

function formatDateTime(dateTimeString) {
    if (!dateTimeString) return 'N/A';
    try {
        return new Date(dateTimeString).toLocaleString('es-MX');
    } catch {
        return 'N/A';
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ================================
// MANEJO DE UI
// ================================
function showLoading(mensaje = 'Cargando...') {
    if (typeof mensaje === 'boolean') {
        if (!mensaje) {
            hideLoading();
            return;
        }
        mensaje = 'Cargando...';
    }
    
    hideLoading();
    
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'customLoading';
    loadingDiv.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10001;
    `;
    
    loadingDiv.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 8px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.2);">
            <div style="border: 4px solid #f3f3f3; border-top: 4px solid #2563eb; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 15px;"></div>
            <p style="margin: 0; color: #374151; font-weight: 500;">${mensaje}</p>
        </div>
    `;
    
    document.body.appendChild(loadingDiv);
}

function hideLoading() {
    const loading = document.getElementById('customLoading');
    if (loading) {
        loading.remove();
    }
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
        document.body.style.overflow = '';
        
        if (modalId === 'modalEmpleado') {
            adminState.selectedEmployee = null;
            clearPhotoPreview();
        } else if (modalId === 'modalQR') {
            modal.remove();
        }
    }
}

function showAlert(titulo, mensaje, tipo = 'info') {
    const alertasAnteriores = document.querySelectorAll('.custom-alert');
    alertasAnteriores.forEach(alert => alert.remove());
    
    const tiposClase = {
        'success': 'alert-success',
        'error': 'alert-danger',
        'warning': 'alert-warning',
        'info': 'alert-info'
    };
    
    const iconos = {
        'success': '✅',
        'error': '❌', 
        'warning': '⚠️',
        'info': 'ℹ️'
    };
    
    const colores = {
        'success': '#28a745',
        'error': '#dc3545',
        'warning': '#ffc107',
        'info': '#17a2b8'
    };
    
    const alertDiv = document.createElement('div');
    alertDiv.className = `custom-alert ${tiposClase[tipo] || 'alert-info'}`;
    alertDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        max-width: 400px;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        background: white;
        border-left: 4px solid ${colores[tipo] || colores.info};
        animation: slideIn 0.3s ease;
    `;
    
    alertDiv.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 10px;">
            <span style="font-size: 18px;">${iconos[tipo] || 'ℹ️'}</span>
            <div style="flex: 1;">
                <strong style="display: block; margin-bottom: 5px;">${titulo}</strong>
                <p style="margin: 0; color: #666;">${mensaje}</p>
            </div>
            <button onclick="this.parentElement.parentElement.remove()" 
                    style="background: none; border: none; font-size: 18px; cursor: pointer; color: #999; padding: 0; line-height: 1;">×</button>
        </div>
    `;
    
    document.body.appendChild(alertDiv);
    
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (alertDiv.parentNode) {
                    alertDiv.remove();
                }
            }, 300);
        }
    }, 5000);
}

// ================================
// MANEJO DE ARCHIVOS
// ================================
function handlePhotoPreview(event) {
    const file = event.target.files[0];
    
    if (!file) {
        clearPhotoPreview();
        return;
    }
    
    if (file.size > ADMIN_CONFIG.maxFileSize) {
        showAlert('Error', 'La imagen es demasiado grande. Máximo 5MB.', 'error');
        event.target.value = '';
        return;
    }
    
    if (!ADMIN_CONFIG.allowedImageTypes.includes(file.type)) {
        showAlert('Error', 'Tipo de archivo no válido. Use JPG, PNG o WebP.', 'error');
        event.target.value = '';
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        showPhotoPreview(e.target.result);
    };
    reader.readAsDataURL(file);
}

function showPhotoPreview(src) {
    const preview = document.getElementById('previewFoto');
    if (preview) {
        preview.innerHTML = `<img src="${src}" alt="Preview" style="max-width: 100px; max-height: 100px; border-radius: 8px;">`;
    }
}

function clearPhotoPreview() {
    const preview = document.getElementById('previewFoto');
    if (preview) {
        preview.innerHTML = '';
    }
}

// ================================
// POBLACIÓN DE SELECTORES
// ================================
function populateHorarioSelects() {
    const selects = document.querySelectorAll('select[name="horario_id"], #filterHorario, #empHorario');
    
    selects.forEach(select => {
        const firstOption = select.querySelector('option:first-child');
        const firstOptionText = firstOption ? firstOption.outerHTML : '<option value="">Seleccione un horario</option>';
        
        select.innerHTML = firstOptionText;
        
        adminState.horariosData.forEach(horario => {
            const option = document.createElement('option');
            option.value = horario.id;
            option.textContent = horario.nombre || `Horario ${horario.id}`;
            select.appendChild(option);
        });
    });
}

function populateEmployeeSelects() {
    const selects = document.querySelectorAll('select[data-populate="empleados"]');
    
    selects.forEach(select => {
        const firstOption = select.querySelector('option:first-child');
        const firstOptionText = firstOption ? firstOption.outerHTML : '<option value="">Seleccione un empleado</option>';
        
        select.innerHTML = firstOptionText;
        
        adminState.employeesData.forEach(empleado => {
            const option = document.createElement('option');
            option.value = empleado.id;
            option.textContent = `${empleado.codigo_empleado || ''} - ${empleado.nombre || ''} ${empleado.apellido || ''}`;
            select.appendChild(option);
        });
    });
}

// ================================
// AUTO-REFRESH Y AUTO-LOGOUT
// ================================
function startAutoRefresh() {
    if (adminState.refreshTimer) {
        clearInterval(adminState.refreshTimer);
    }
    
    adminState.refreshTimer = setInterval(() => {
        if (adminState.currentSection === 'dashboard') {
            loadDashboardData();
        }
    }, ADMIN_CONFIG.refreshInterval);
}

function setupAutoLogout() {
    setInterval(() => {
        const timeSinceActivity = Date.now() - adminState.lastActivity;
        
        if (timeSinceActivity > ADMIN_CONFIG.autoLogoutTime) {
            showAlert('Sesión expirada', 'Has sido desconectado por inactividad', 'warning');
        }
    }, 60000);
}

function updateLastActivity() {
    adminState.lastActivity = new Date();
}

// ================================
// REPORTE EJECUTIVO DE PRODUCTIVIDAD
// ================================
async function mostrarReporteEjecutivo() {
    try {
        // Obtener empleados seleccionados
        let empleadosFiltrados = [];
        let fechasSeleccionadas = [];
        const checkboxesMarcados = document.querySelectorAll('input[type="checkbox"]:checked');
        
        checkboxesMarcados.forEach(checkbox => {
            const fila = checkbox.closest('tr');
            const empleadoId = checkbox.value;
            
            if (empleadoId && empleadoId !== '' && empleadoId !== 'on') {
                empleadosFiltrados.push(empleadoId);
                
                // EXTRAER TODAS LAS FECHAS DE LAS FILAS SELECCIONADAS
                const fechaElement = fila.querySelector('.fecha-badge');
                if (fechaElement) {
                    const fechaTexto = fechaElement.textContent.trim();
                    // Convertir "20/11/2025" a "2025-11-20"
                    const partes = fechaTexto.split('/');
                    if (partes.length === 3) {
                        const fechaFormatted = `${partes[2]}-${partes[1]}-${partes[0]}`;
                        fechasSeleccionadas.push(fechaFormatted);
                    }
                }
            }
        });
        
        if (empleadosFiltrados.length === 0) {
            showAlert('Info', 'Selecciona al menos un empleado para generar el reporte', 'warning');
            return;
        }
        

        // OBTENER LOS GRUPOS YA CALCULADOS DE LA TABLA
        const gruposCalculados = agruparRegistrosPorEmpleadoYFecha(adminState.registrosData || []);

        // FILTRAR SOLO LOS GRUPOS SELECCIONADOS
        const gruposSeleccionados = gruposCalculados.filter(grupo => {
            const empleadoSeleccionado = empleadosFiltrados.includes(grupo.empleado_id?.toString());

            if (!empleadoSeleccionado) return false;

            // Si hay fechas específicas seleccionadas, filtrar por ellas
            if (fechasSeleccionadas.length > 0) {
                return fechasSeleccionadas.includes(grupo.fecha);
            }

            return true;
        });


        // SUMAR LAS HORAS YA CALCULADAS DE CADA GRUPO
        let totalMinutosTrabajados = 0;
        let checkIns = 0;
        let checkOuts = 0;

        gruposSeleccionados.forEach(grupo => {
            // Sumar los minutos totales ya calculados
            const minutosGrupo = grupo.minutos_totales || 0;
            totalMinutosTrabajados += minutosGrupo;

            // Contar entradas y salidas
            if (grupo.entrada) checkIns++;
            if (grupo.salida) checkOuts++;

        });

        
        const horasLaboradas = Math.floor(totalMinutosTrabajados / 60);
        const minutosLaboradas = totalMinutosTrabajados % 60;
        const formatoLaborado = `${horasLaboradas}:${minutosLaboradas.toString().padStart(2, '0')}`;
        
        const data = {
            registros_check_in: checkIns,
            registros_check_out: checkOuts,
            retardos_tiempo_formato: "00:00",
            retardos_minutos_total: 0,
            total_laborado_formato: formatoLaborado,
            total_laborado_horas: totalMinutosTrabajados / 60,
            fecha_generacion: new Date()
        };
        
        
        mostrarModalReporteEjecutivo(data);
        
    } catch (error) {
        showAlert('Error', 'Error generando reporte', 'error');
    }
}
function mostrarModalReporteEjecutivo(data) {
    // Eliminar modal anterior si existe
    const modalAnterior = document.getElementById('modalReporteEjecutivo');
    if (modalAnterior) {
        modalAnterior.remove();
    }

    const modalHTML = `
        <div id="modalReporteEjecutivo" class="modal" style="display: flex;">
            <div class="modal-content" style="max-width: 600px; width: 90%; margin: auto;">
                <div class="modal-header">
                    <h2>📊 Reporte ejecutivo de productividad</h2>
                    <span class="close" style="cursor: pointer; font-size: 28px; font-weight: bold; color: #999;">&times;</span>
                </div>
                <div class="modal-body">
                    <!-- Las 4 métricas principales -->
                    <div class="stats-grid-ejecutivo" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px;">
                        <!-- Check In -->
                        <div class="stat-card-ejecutivo" style="background: #eff6ff; border: 1px solid #dbeafe; border-radius: 12px; padding: 20px; text-align: center;">
                            <div style="color: #1e40af; font-size: 32px; font-weight: bold; margin-bottom: 8px;">
                                ${data.registros_check_in}
                            </div>
                            <div style="color: #374151; font-size: 14px; font-weight: 500;">
                                Registros Check In
                            </div>
                        </div>
                        
                        <!-- Check Out -->
                        <div class="stat-card-ejecutivo" style="background: #f0f9ff; border: 1px solid #e0f2fe; border-radius: 12px; padding: 20px; text-align: center;">
                            <div style="color: #0284c7; font-size: 32px; font-weight: bold; margin-bottom: 8px;">
                                ${data.registros_check_out}
                            </div>
                            <div style="color: #374151; font-size: 14px; font-weight: 500;">
                                Registros Check Out
                            </div>
                        </div>
                        
                        <!-- Retardos -->
                        <div class="stat-card-ejecutivo" style="background: #fef3c7; border: 1px solid #fde68a; border-radius: 12px; padding: 20px; text-align: center;">
                            <div style="color: #d97706; font-size: 32px; font-weight: bold; margin-bottom: 8px;">
                                ${data.retardos_tiempo_formato}
                            </div>
                            <div style="color: #374151; font-size: 14px; font-weight: 500;">
                                Retardos (SUM)
                            </div>
                        </div>
                        
                        <!-- Total Laborado -->
                        <div class="stat-card-ejecutivo" style="background: #dcfce7; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; text-align: center;">
                            <div style="color: #16a34a; font-size: 32px; font-weight: bold; margin-bottom: 8px;">
                                ${data.total_laborado_formato}
                            </div>
                            <div style="color: #374151; font-size: 14px; font-weight: 500;">
                                Total laborado
                            </div>
                        </div>
                    </div>
                    
                    <!-- Información adicional -->
                    <div style="padding: 15px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
                        <h4 style="margin: 0 0 10px 0; color: #374151;">📋 Detalles adicionales</h4>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; font-size: 14px;">
                            <div>
                                <strong>Total minutos de retardo:</strong> ${data.retardos_minutos_total} min
                            </div>
                            <div>
                                <strong>Total horas laboradas:</strong> ${data.total_laborado_horas.toFixed(2)} hrs
                            </div>
                        </div>
                        <div style="margin-top: 10px; font-size: 12px; color: #6b7280;">
                            <strong>Generado:</strong> ${new Date(data.fecha_generacion).toLocaleString('es-MX')}
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="btnCerrarReporte" class="btn btn-secondary" style="padding: 10px 20px; background: #6b7280; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;">
                        <i class="fas fa-times"></i> Cerrar
                    </button>
                    <button id="btnImprimirReporte" class="btn btn-primary" style="padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        <i class="fas fa-print"></i> Imprimir
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // AGREGAR EVENT LISTENERS DESPUÉS DE CREAR EL DOM
    const modal = document.getElementById('modalReporteEjecutivo');
    const btnCerrar = document.getElementById('btnCerrarReporte');
    const btnImprimir = document.getElementById('btnImprimirReporte');
    const btnX = modal.querySelector('.close');
    
    // Función para cerrar el modal
    function cerrarModal() {
        if (modal) {
            modal.remove();
        }
    }
    
    // Event listeners múltiples para cerrar
    if (btnCerrar) {
        btnCerrar.addEventListener('click', cerrarModal);
    }
    
    if (btnX) {
        btnX.addEventListener('click', cerrarModal);
    }
    
    if (btnImprimir) {
        btnImprimir.addEventListener('click', imprimirReporteEjecutivo);
    }
    
    // Cerrar con click fuera del modal
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            cerrarModal();
        }
    });
    
    // Cerrar con ESC
    const handleEscape = function(e) {
        if (e.key === 'Escape') {
            cerrarModal();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
}

function formatearFecha(fechaStr) {
    if (!fechaStr) return 'N/A';
    
    try {
        // Si la fecha viene como string de SQL Server, convertir correctamente
        let fecha;
        if (fechaStr.includes('T')) {
            fecha = new Date(fechaStr);
        } else {
            fecha = new Date(fechaStr + 'T00:00:00');
        }
        
        return fecha.toLocaleDateString('es-MX', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch (error) {
        return fechaStr; // Devolver la fecha original si hay error
    }
}
function imprimirReporteEjecutivo() {
    const modal = document.getElementById('modalReporteEjecutivo');
    const contenido = modal.querySelector('.modal-content').innerHTML;
    
    const ventanaImpresion = window.open('', '_blank');
    ventanaImpresion.document.write(`
        <html>
        <head>
            <title>Reporte Ejecutivo de Productividad</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .stats-grid-ejecutivo { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
                .modal-header h2 { text-align: center; margin-bottom: 20px; }
                .close { display: none; }
                .modal-footer { display: none; }
                @media print {
                    body { margin: 0; }
                    .modal-header { border: none; padding-bottom: 20px; }
                }
            </style>
        </head>
        <body>
            ${contenido}
        </body>
        </html>
    `);
    
    ventanaImpresion.document.close();
    setTimeout(() => {
        ventanaImpresion.print();
        ventanaImpresion.close();
    }, 250);
}

// Exportar función global
window.mostrarReporteEjecutivo = mostrarReporteEjecutivo;

// ================================
// RESUMEN GENERAL DE EMPLEADOS
// ================================

let datosResumenGeneral = [];
let justificacionesResumenGeneral = [];
let ordenResumenGeneral = { columna: 'empleado', direccion: 'asc' };

/**
 * Calcula los minutos de retardo de un día completo.
 * Busca la primera entrada matutina (antes de 12:00) → retardo a partir de 8:11 AM
 * Busca la primera entrada vespertina (12:00 o después) → retardo a partir de 2:40 PM
 * Solo se evalúan esas dos entradas, las demás checadas se ignoran para retardo.
 */
function calcularRetardoDia(entradasDelDia) {
    if (!entradasDelDia || entradasDelDia.length === 0) return 0;

    let retardoTotal = 0;
    let primeraMatutina = null;
    let primeraVespertina = null;

    // Ordenar entradas por hora
    const entradasOrdenadas = entradasDelDia.slice().sort((a, b) =>
        new Date(a.fecha_hora) - new Date(b.fecha_hora)
    );

    for (const entrada of entradasOrdenadas) {
        const horaMzt = getMazatlanTime(entrada.fecha_hora);
        const h = horaMzt.getHours();

        if (h < 12 && !primeraMatutina) {
            primeraMatutina = horaMzt;
        } else if (h >= 12 && !primeraVespertina) {
            primeraVespertina = horaMzt;
        }

        if (primeraMatutina && primeraVespertina) break;
    }

    // Retardo matutino: después de 8:11 AM
    if (primeraMatutina) {
        const minutosDia = primeraMatutina.getHours() * 60 + primeraMatutina.getMinutes();
        const limite = 8 * 60 + 11; // 8:11 AM
        if (minutosDia > limite) {
            retardoTotal += minutosDia - limite;
        }
    }

    // Retardo vespertino: después de 2:40 PM
    if (primeraVespertina) {
        const minutosDia = primeraVespertina.getHours() * 60 + primeraVespertina.getMinutes();
        const limite = 14 * 60 + 40; // 2:40 PM
        if (minutosDia > limite) {
            retardoTotal += minutosDia - limite;
        }
    }

    return retardoTotal;
}

/**
 * Genera datos estadísticos de todos los empleados del período actual
 */
function generarDatosResumenGeneral(justificaciones = []) {
    const registros = adminState.registrosData || [];

    if (registros.length === 0) {
        alert('No hay datos de registros. Por favor filtra primero un período de fechas.');
        return [];
    }

    // Obtener fechas del filtro actual
    const fechaInicioStr = document.getElementById('fechaInicio').value;
    const fechaFinStr = document.getElementById('fechaFin').value;

    if (!fechaInicioStr || !fechaFinStr) {
        alert('Por favor selecciona un rango de fechas en los filtros antes de generar el resumen.');
        return [];
    }

    // Agrupar por empleado
    const empleadosMap = new Map();

    registros.forEach(reg => {
        const empleadoId = reg.empleado_id;

        if (!empleadosMap.has(empleadoId)) {
            empleadosMap.set(empleadoId, {
                empleado_id: empleadoId,
                empleado_nombre: reg.empleado_nombre,
                empleado_codigo: reg.empleado_codigo,
                sucursal: reg.sucursal || 'N/A',
                puesto: reg.puesto || 'N/A',
                registros: []
            });
        }

        empleadosMap.get(empleadoId).registros.push(reg);
    });

    // Calcular estadísticas por empleado
    const estadisticas = [];

    // Generar lista de fechas laborables como strings YYYY-MM-DD (sin depender de zona horaria)
    const fechasLaborables = [];
    {
        const partsInicio = fechaInicioStr.split('-').map(Number);
        const partsFin = fechaFinStr.split('-').map(Number);
        const d = new Date(partsInicio[0], partsInicio[1] - 1, partsInicio[2], 12, 0, 0);
        const fin = new Date(partsFin[0], partsFin[1] - 1, partsFin[2], 12, 0, 0);
        while (d <= fin) {
            const diaSemana = d.getDay(); // 0=domingo, 6=sábado
            if (diaSemana !== 0 && diaSemana !== 6) {
                const yy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                fechasLaborables.push(`${yy}-${mm}-${dd}`);
            }
            d.setDate(d.getDate() + 1);
        }
    }
    const diasLaborables = fechasLaborables.length;

    empleadosMap.forEach((empleado, empleadoId) => {
        // Agrupar registros por fecha usando la misma función que el resto del sistema
        const registrosPorFecha = agruparRegistrosPorEmpleadoYFecha(empleado.registros);

        let totalHoras = 0;
        let totalEntradas = 0;
        let totalSalidas = 0;
        let totalRetardos = 0;
        let diasConRegistro = new Set();

        registrosPorFecha.forEach(dia => {
            // Sumar horas trabajadas - convertir a número porque viene como string de toFixed()
            totalHoras += Number(dia.horas_trabajadas) || 0;

            // Contar entradas y salidas desde los registros ya agrupados por fecha Mazatlán
            const entradasDia = dia.registros.filter(r => r.tipo_registro === 'ENTRADA');
            const salidasDia = dia.registros.filter(r => r.tipo_registro === 'SALIDA');

            totalEntradas += entradasDia.length;
            totalSalidas += salidasDia.length;

            // Calcular retardos: primera entrada matutina (>8:11) y primera vespertina (>14:40)
            const retardoDia = calcularRetardoDia(entradasDia);
            totalRetardos += retardoDia;

            // Guardar retardo calculado en el objeto día para el detalle
            dia._retardoMinutos = retardoDia;
            dia._entradasCount = entradasDia.length;
            dia._salidasCount = salidasDia.length;

            // Registrar día con actividad
            if (dia.entrada || dia.salida) {
                diasConRegistro.add(dia.fecha);
            }
        });

        // Calcular faltas: días laborables sin registro y sin justificación
        let faltasCount = 0;
        for (const fechaLab of fechasLaborables) {
            if (!diasConRegistro.has(fechaLab)) {
                // Verificar si tiene justificación para ese día
                const tieneJustificacion = justificaciones.some(j =>
                    j.empleado_id === empleadoId &&
                    j.fecha_inicio <= fechaLab &&
                    j.fecha_fin >= fechaLab
                );
                if (!tieneJustificacion) {
                    faltasCount++;
                }
            }
        }

        estadisticas.push({
            empleado_id: empleadoId,
            empleado_nombre: empleado.empleado_nombre,
            empleado_codigo: empleado.empleado_codigo,
            sucursal: empleado.sucursal,
            puesto: empleado.puesto,
            horas_trabajadas: totalHoras || 0,
            total_entradas: totalEntradas || 0,
            total_salidas: totalSalidas || 0,
            total_faltas: faltasCount,
            minutos_retardo: totalRetardos || 0,
            dias_laborables: diasLaborables,
            dias_trabajados: diasConRegistro.size,
            detalle_dias: registrosPorFecha,
            dias_con_registro: diasConRegistro
        });
    });

    console.log('📊 Resumen General - Fechas laborables:', fechasLaborables);
    console.log('📊 Resumen General - Estadísticas:', estadisticas.map(e => ({
        nombre: e.empleado_nombre,
        horas: e.horas_trabajadas,
        entradas: e.total_entradas,
        salidas: e.total_salidas,
        faltas: e.total_faltas,
        retardo: e.minutos_retardo,
        diasRegistro: [...e.dias_con_registro],
        diasDetalle: e.detalle_dias.map(d => d.fecha)
    })));
    return estadisticas;
}

/**
 * Muestra el modal con el resumen general
 */
async function mostrarResumenGeneral() {
    // Obtener justificaciones del rango para excluir de faltas
    const fechaInicioStr = document.getElementById('fechaInicio').value;
    const fechaFinStr = document.getElementById('fechaFin').value;
    let justificaciones = [];
    if (fechaInicioStr && fechaFinStr) {
        const justResult = await SupabaseAPI.getJustificacionesPorRango(
            fechaInicioStr, fechaFinStr, window.currentUserSucursal
        );
        justificaciones = justResult.success ? justResult.data : [];
    }
    justificacionesResumenGeneral = justificaciones;

    // Generar datos
    datosResumenGeneral = generarDatosResumenGeneral(justificaciones);

    if (datosResumenGeneral.length === 0) {
        alert('No hay datos de empleados en el período actual');
        return;
    }

    // Llenar filtro de sucursales
    const sucursales = [...new Set(datosResumenGeneral.map(e => e.sucursal))];
    const selectSucursal = document.getElementById('filtroSucursalResumen');
    selectSucursal.innerHTML = '<option value="">Todas las sucursales</option>';
    sucursales.forEach(suc => {
        selectSucursal.innerHTML += `<option value="${suc}">${suc}</option>`;
    });

    // Renderizar tabla
    renderizarTablaResumenGeneral(datosResumenGeneral);

    // Mostrar estadísticas generales
    mostrarEstadisticasGenerales(datosResumenGeneral);

    // Mostrar modal
    document.getElementById('modalResumenGeneral').classList.add('show');
}

/**
 * Renderiza la tabla con los datos
 */
function renderizarTablaResumenGeneral(datos) {
    const tbody = document.getElementById('bodyResumenGeneral');

    if (datos.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px; color: #94a3b8;">
                    <i class="fas fa-search" style="font-size: 2rem; margin-bottom: 10px;"></i>
                    <p>No se encontraron empleados con los filtros aplicados</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = datos.map(emp => {
        // Convertir a números para evitar errores con strings
        const horasTrabajadas = Number(emp.horas_trabajadas) || 0;
        const totalEntradas = Number(emp.total_entradas) || 0;
        const totalSalidas = Number(emp.total_salidas) || 0;
        const totalFaltas = Number(emp.total_faltas) || 0;
        const minutosRetardo = Number(emp.minutos_retardo) || 0;

        return `
        <tr onclick="mostrarDetalleEmpleadoResumen('${emp.empleado_id}')" style="cursor: pointer;" title="Click para ver detalle por día">
            <td>
                <div class="empleado-info">
                    <div class="empleado-avatar">
                        ${emp.empleado_nombre.substring(0, 2).toUpperCase()}
                    </div>
                    <div class="empleado-details">
                        <div class="empleado-nombre">${emp.empleado_nombre}</div>
                        <div class="empleado-codigo">${emp.empleado_codigo}</div>
                    </div>
                </div>
            </td>
            <td>
                <span class="badge badge-sucursal">${emp.sucursal || 'N/A'}</span>
            </td>
            <td>
                <span class="horas-trabajadas">${horasTrabajadas.toFixed(2)} hrs</span>
            </td>
            <td>
                <span class="badge badge-success">${totalEntradas}</span>
            </td>
            <td>
                <span class="badge badge-info">${totalSalidas}</span>
            </td>
            <td>
                <span class="badge ${totalFaltas > 0 ? 'badge-warning' : 'badge-success'}">
                    ${totalFaltas}
                </span>
            </td>
            <td>
                <span class="badge ${minutosRetardo > 0 ? 'badge-warning' : 'badge-secondary'}">
                    ${minutosRetardo} min
                </span>
            </td>
        </tr>
        `;
    }).join('');
}

/**
 * Muestra estadísticas generales del período
 */
function mostrarEstadisticasGenerales(datos) {
    const totalEmpleados = datos.length;
    const totalHoras = datos.reduce((sum, e) => sum + (Number(e.horas_trabajadas) || 0), 0);
    const totalFaltas = datos.reduce((sum, e) => sum + (Number(e.total_faltas) || 0), 0);
    const totalRetardos = datos.reduce((sum, e) => sum + (Number(e.minutos_retardo) || 0), 0);

    const statsDiv = document.getElementById('statsResumenGeneral');
    statsDiv.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 0.7rem; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px;">Total Empleados</div>
            <div style="font-size: 1.4rem; font-weight: 700; color: #3b82f6;">${totalEmpleados}</div>
        </div>
        <div style="text-align: center;">
            <div style="font-size: 0.7rem; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px;">Horas Totales</div>
            <div style="font-size: 1.4rem; font-weight: 700; color: #10b981;">${totalHoras.toFixed(2)} hrs</div>
        </div>
        <div style="text-align: center;">
            <div style="font-size: 0.7rem; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px;">Total Faltas</div>
            <div style="font-size: 1.4rem; font-weight: 700; color: #f59e0b;">${totalFaltas}</div>
        </div>
        <div style="text-align: center;">
            <div style="font-size: 0.7rem; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px;">Retardos (min)</div>
            <div style="font-size: 1.4rem; font-weight: 700; color: #ef4444;">${totalRetardos}</div>
        </div>
    `;
}

/**
 * Filtra la tabla según búsqueda y sucursal
 */
function filtrarResumenGeneral() {
    const textoBusqueda = document.getElementById('filtroResumenGeneral').value.toLowerCase();
    const sucursalFiltro = document.getElementById('filtroSucursalResumen').value;

    let datosFiltrados = datosResumenGeneral.filter(emp => {
        const coincideTexto = emp.empleado_nombre.toLowerCase().includes(textoBusqueda) ||
                             emp.empleado_codigo.toLowerCase().includes(textoBusqueda);
        const coincideSucursal = !sucursalFiltro || emp.sucursal === sucursalFiltro;

        return coincideTexto && coincideSucursal;
    });

    renderizarTablaResumenGeneral(datosFiltrados);
    mostrarEstadisticasGenerales(datosFiltrados);
}

/**
 * Ordena la tabla por columna
 */
function ordenarResumenGeneral(columna) {
    // Cambiar dirección si es la misma columna
    if (ordenResumenGeneral.columna === columna) {
        ordenResumenGeneral.direccion = ordenResumenGeneral.direccion === 'asc' ? 'desc' : 'asc';
    } else {
        ordenResumenGeneral.columna = columna;
        ordenResumenGeneral.direccion = 'asc';
    }

    // Ordenar datos
    datosResumenGeneral.sort((a, b) => {
        let valorA, valorB;

        switch(columna) {
            case 'empleado':
                valorA = a.empleado_nombre;
                valorB = b.empleado_nombre;
                break;
            case 'sucursal':
                valorA = a.sucursal;
                valorB = b.sucursal;
                break;
            case 'horas':
                valorA = Number(a.horas_trabajadas) || 0;
                valorB = Number(b.horas_trabajadas) || 0;
                break;
            case 'entradas':
                valorA = Number(a.total_entradas) || 0;
                valorB = Number(b.total_entradas) || 0;
                break;
            case 'salidas':
                valorA = Number(a.total_salidas) || 0;
                valorB = Number(b.total_salidas) || 0;
                break;
            case 'faltas':
                valorA = Number(a.total_faltas) || 0;
                valorB = Number(b.total_faltas) || 0;
                break;
            case 'retardos':
                valorA = Number(a.minutos_retardo) || 0;
                valorB = Number(b.minutos_retardo) || 0;
                break;
            default:
                return 0;
        }

        if (typeof valorA === 'string') {
            return ordenResumenGeneral.direccion === 'asc'
                ? valorA.localeCompare(valorB)
                : valorB.localeCompare(valorA);
        } else {
            return ordenResumenGeneral.direccion === 'asc'
                ? valorA - valorB
                : valorB - valorA;
        }
    });

    // Re-renderizar
    filtrarResumenGeneral();
}

/**
 * Exporta los datos a Excel
 */
function exportarResumenGeneral() {
    if (datosResumenGeneral.length === 0) {
        alert('No hay datos para exportar');
        return;
    }

    // Preparar datos para CSV
    const headers = [
        'Código',
        'Empleado',
        'Sucursal',
        'Puesto',
        'Horas Trabajadas',
        'Total Entradas',
        'Total Salidas',
        'Faltas',
        'Minutos Retardo',
        'Días Laborables',
        'Días Trabajados'
    ];

    const rows = datosResumenGeneral.map(emp => [
        emp.empleado_codigo,
        emp.empleado_nombre,
        emp.sucursal,
        emp.puesto,
        emp.horas_trabajadas.toFixed(2),
        emp.total_entradas,
        emp.total_salidas,
        emp.total_faltas,
        emp.minutos_retardo,
        emp.dias_laborables,
        emp.dias_trabajados
    ]);

    // Crear CSV
    let csvContent = '\ufeff'; // BOM para UTF-8
    csvContent += headers.join(',') + '\n';
    rows.forEach(row => {
        csvContent += row.map(cell => `"${cell}"`).join(',') + '\n';
    });

    // Descargar
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    const fechaHoy = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `Resumen_General_${fechaHoy}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Imprime el resumen general
 */
function imprimirResumenGeneral() {
    if (datosResumenGeneral.length === 0) {
        alert('No hay datos para imprimir');
        return;
    }

    // Obtener fechas del filtro
    const fechaInicioStr = document.getElementById('fechaInicio').value;
    const fechaFinStr = document.getElementById('fechaFin').value;

    let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Resumen General de Empleados</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    padding: 20px;
                }
                h1 {
                    text-align: center;
                    color: #0f172a;
                    margin-bottom: 10px;
                }
                .periodo {
                    text-align: center;
                    color: #64748b;
                    margin-bottom: 20px;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 20px;
                    font-size: 12px;
                }
                th {
                    background: #f1f5f9;
                    padding: 8px;
                    text-align: left;
                    border: 1px solid #e2e8f0;
                    font-weight: 600;
                }
                td {
                    padding: 8px;
                    border: 1px solid #e2e8f0;
                }
                tr:nth-child(even) {
                    background: #f8fafc;
                }
                .footer {
                    margin-top: 20px;
                    text-align: center;
                    color: #94a3b8;
                    font-size: 11px;
                }
            </style>
        </head>
        <body>
            <h1>Resumen General de Empleados</h1>
            <div class="periodo">
                Período: ${fechaInicioStr ? formatearFechaCorta(fechaInicioStr) : ''}
                - ${fechaFinStr ? formatearFechaCorta(fechaFinStr) : ''}
            </div>

            <table>
                <thead>
                    <tr>
                        <th>Código</th>
                        <th>Empleado</th>
                        <th>Sucursal</th>
                        <th>Horas Trabajadas</th>
                        <th>Entradas</th>
                        <th>Salidas</th>
                        <th>Faltas</th>
                        <th>Min. Retardo</th>
                    </tr>
                </thead>
                <tbody>
                    ${datosResumenGeneral.map(emp => `
                        <tr>
                            <td>${emp.empleado_codigo}</td>
                            <td>${emp.empleado_nombre}</td>
                            <td>${emp.sucursal}</td>
                            <td>${emp.horas_trabajadas.toFixed(2)} hrs</td>
                            <td>${emp.total_entradas}</td>
                            <td>${emp.total_salidas}</td>
                            <td>${emp.total_faltas}</td>
                            <td>${emp.minutos_retardo} min</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="footer">
                Generado el ${new Date().toLocaleString('es-MX')}
            </div>
        </body>
        </html>
    `;

    const ventanaImpresion = window.open('', '', 'width=800,height=600');
    ventanaImpresion.document.write(html);
    ventanaImpresion.document.close();

    setTimeout(() => {
        ventanaImpresion.print();
        ventanaImpresion.close();
    }, 250);
}

/**
 * Muestra el detalle por día de un empleado al hacer click en su fila
 */
function mostrarDetalleEmpleadoResumen(empleadoId) {
    const emp = datosResumenGeneral.find(e => String(e.empleado_id) === String(empleadoId));
    if (!emp) {
        console.warn('Empleado no encontrado:', empleadoId);
        return;
    }

    const panel = document.getElementById('panelDetalleEmpleado');
    const dias = (emp.detalle_dias || []).slice().sort((a, b) => a.fecha.localeCompare(b.fecha));

    // Obtener fechas del filtro para mostrar faltas
    const fechaInicioStr = document.getElementById('fechaInicio').value;
    const fechaFinStr = document.getElementById('fechaFin').value;

    // Construir lista completa de días laborables (lun-vie) sin depender de toISOString
    const diasCompletos = [];
    {
        const pi = fechaInicioStr.split('-').map(Number);
        const pf = fechaFinStr.split('-').map(Number);
        const iterDate = new Date(pi[0], pi[1] - 1, pi[2], 12, 0, 0);
        const finDate = new Date(pf[0], pf[1] - 1, pf[2], 12, 0, 0);
        while (iterDate <= finDate) {
            const diaSemana = iterDate.getDay();
            if (diaSemana !== 0 && diaSemana !== 6) {
                const yy = iterDate.getFullYear();
                const mm = String(iterDate.getMonth() + 1).padStart(2, '0');
                const dd = String(iterDate.getDate()).padStart(2, '0');
                const fechaStr = `${yy}-${mm}-${dd}`;
                const diaData = dias.find(d => d.fecha === fechaStr);
                diasCompletos.push({
                    fecha: fechaStr,
                    diaSemana: iterDate.toLocaleDateString('es-MX', { weekday: 'short' }),
                    data: diaData || null
                });
            }
            iterDate.setDate(iterDate.getDate() + 1);
        }
    }

    // Helper para formatear hora desde fecha_hora
    function formatHoraMzt(fechaHora) {
        if (!fechaHora) return '--:--';
        const d = getMazatlanTime(fechaHora);
        return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true });
    }

    // Generar filas
    const filasHTML = diasCompletos.map(dia => {
        if (!dia.data) {
            // Verificar si tiene justificación para ese día
            const justificacion = justificacionesResumenGeneral.find(j =>
                j.empleado_id === emp.empleado_id &&
                j.fecha_inicio <= dia.fecha &&
                j.fecha_fin >= dia.fecha
            );
            if (justificacion) {
                // Día justificado - no es falta
                const tipoJust = justificacion.tipo || 'Justificación';
                return `
                <tr style="background: #f0fdf4;">
                    <td><strong>${formatearFechaCorta(dia.fecha)}</strong> <span class="dia-semana">${dia.diaSemana}</span></td>
                    <td colspan="5" style="text-align: center; color: #16a34a; font-weight: 600;">
                        <i class="fas fa-check-circle"></i> ${tipoJust.toUpperCase()}
                    </td>
                </tr>`;
            }
            // Día sin registro y sin justificación = falta
            return `
                <tr class="detalle-falta">
                    <td><strong>${formatearFechaCorta(dia.fecha)}</strong> <span class="dia-semana">${dia.diaSemana}</span></td>
                    <td colspan="5" style="text-align: center; color: #ef4444; font-weight: 600;">
                        <i class="fas fa-times-circle"></i> FALTA
                    </td>
                </tr>`;
        }

        const d = dia.data;
        const horas = Number(d.horas_trabajadas) || 0;
        const retardo = d._retardoMinutos || 0;

        // Mostrar todas las entradas y salidas del día
        const entradas = d.registros.filter(r => r.tipo_registro === 'ENTRADA');
        const salidas = d.registros.filter(r => r.tipo_registro === 'SALIDA');
        const entradasStr = entradas.map(e => formatHoraMzt(e.fecha_hora)).join(', ') || '--:--';
        const salidasStr = salidas.map(s => formatHoraMzt(s.fecha_hora)).join(', ') || '--:--';

        const retardoClass = retardo > 0 ? 'badge-warning' : 'badge-secondary';
        const horasClass = horas >= 8 ? 'color: #10b981;' : (horas > 0 ? 'color: #f59e0b;' : 'color: #94a3b8;');

        return `
            <tr>
                <td><strong>${formatearFechaCorta(dia.fecha)}</strong> <span class="dia-semana">${dia.diaSemana}</span></td>
                <td>${entradasStr}</td>
                <td>${salidasStr}</td>
                <td style="font-weight: 600; ${horasClass}">${horas.toFixed(2)} hrs</td>
                <td><span class="badge ${retardoClass}">${retardo} min</span></td>
                <td><span class="badge ${d.estatus === 'COMPLETO' ? 'badge-success' : 'badge-warning'}">${d.estatus}</span></td>
            </tr>`;
    }).join('');

    panel.innerHTML = `
        <div class="detalle-header">
            <div style="display: flex; align-items: center; gap: 12px;">
                <button onclick="cerrarDetalleEmpleado()" class="btn-back" title="Volver">
                    <i class="fas fa-arrow-left"></i>
                </button>
                <div class="empleado-avatar" style="width: 40px; height: 40px; font-size: 0.9rem;">
                    ${emp.empleado_nombre.substring(0, 2).toUpperCase()}
                </div>
                <div>
                    <div style="font-weight: 700; font-size: 1.1rem;">${emp.empleado_nombre}</div>
                    <div style="color: #64748b; font-size: 0.8rem;">${emp.empleado_codigo} · ${emp.sucursal} · ${emp.puesto || ''}</div>
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 16px;">
                <div class="detalle-stats-mini">
                    <div><span class="stat-label">Horas</span><span class="stat-value" style="color:#10b981;">${(Number(emp.horas_trabajadas)||0).toFixed(2)}</span></div>
                    <div><span class="stat-label">Entradas</span><span class="stat-value" style="color:#3b82f6;">${emp.total_entradas}</span></div>
                    <div><span class="stat-label">Salidas</span><span class="stat-value" style="color:#6366f1;">${emp.total_salidas}</span></div>
                    <div><span class="stat-label">Faltas</span><span class="stat-value" style="color:#f59e0b;">${emp.total_faltas}</span></div>
                    <div><span class="stat-label">Retardo</span><span class="stat-value" style="color:#ef4444;">${emp.minutos_retardo} min</span></div>
                </div>
                <button onclick="imprimirDetalleEmpleado('${emp.empleado_id}')" class="btn btn-secondary" style="white-space: nowrap;">
                    <i class="fas fa-print"></i> Imprimir
                </button>
            </div>
        </div>
        <div class="detalle-tabla-container">
            <table class="detalle-tabla">
                <thead>
                    <tr>
                        <th>Fecha</th>
                        <th>Entradas</th>
                        <th>Salidas</th>
                        <th>Horas</th>
                        <th>Retardo</th>
                        <th>Estatus</th>
                    </tr>
                </thead>
                <tbody>
                    ${filasHTML}
                </tbody>
            </table>
        </div>
    `;

    panel.classList.add('show');
    // Bloquear scroll del modal-content mientras el detalle está abierto
    document.querySelector('#modalResumenGeneral .modal-content').classList.add('detalle-abierto');
}

/**
 * Imprime el detalle por día de un empleado
 */
function imprimirDetalleEmpleado(empleadoId) {
    const emp = datosResumenGeneral.find(e => String(e.empleado_id) === String(empleadoId));
    if (!emp) return;

    const dias = (emp.detalle_dias || []).slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
    const fechaInicioStr = document.getElementById('fechaInicio').value;
    const fechaFinStr = document.getElementById('fechaFin').value;

    // Construir días laborables
    const diasCompletos = [];
    const pi = fechaInicioStr.split('-').map(Number);
    const pf = fechaFinStr.split('-').map(Number);
    const iterDate = new Date(pi[0], pi[1] - 1, pi[2], 12, 0, 0);
    const finDate = new Date(pf[0], pf[1] - 1, pf[2], 12, 0, 0);
    while (iterDate <= finDate) {
        const diaSemana = iterDate.getDay();
        if (diaSemana !== 0 && diaSemana !== 6) {
            const yy = iterDate.getFullYear();
            const mm = String(iterDate.getMonth() + 1).padStart(2, '0');
            const dd = String(iterDate.getDate()).padStart(2, '0');
            const fechaStr = `${yy}-${mm}-${dd}`;
            const diaData = dias.find(d => d.fecha === fechaStr);
            diasCompletos.push({
                fecha: fechaStr,
                diaSemana: iterDate.toLocaleDateString('es-MX', { weekday: 'short' }),
                data: diaData || null
            });
        }
        iterDate.setDate(iterDate.getDate() + 1);
    }

    function formatHoraMzt(fechaHora) {
        if (!fechaHora) return '--:--';
        const d = getMazatlanTime(fechaHora);
        return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true });
    }

    const filasHTML = diasCompletos.map(dia => {
        if (!dia.data) {
            // Verificar si tiene justificación
            const justificacion = justificacionesResumenGeneral.find(j =>
                j.empleado_id === emp.empleado_id &&
                j.fecha_inicio <= dia.fecha &&
                j.fecha_fin >= dia.fecha
            );
            if (justificacion) {
                const tipoJust = justificacion.tipo || 'Justificación';
                return `<tr style="background: #f0fdf4;">
                <td>${formatearFechaCorta(dia.fecha)} <small>${dia.diaSemana}</small></td>
                <td colspan="5" style="text-align: center; color: #16a34a; font-weight: 600;">${tipoJust.toUpperCase()}</td>
            </tr>`;
            }
            return `<tr style="background: #fef2f2;">
                <td>${formatearFechaCorta(dia.fecha)} <small>${dia.diaSemana}</small></td>
                <td colspan="5" style="text-align: center; color: #ef4444; font-weight: 600;">FALTA</td>
            </tr>`;
        }
        const d = dia.data;
        const horas = Number(d.horas_trabajadas) || 0;
        const retardo = d._retardoMinutos || 0;
        const entradas = d.registros.filter(r => r.tipo_registro === 'ENTRADA');
        const salidas = d.registros.filter(r => r.tipo_registro === 'SALIDA');
        const entradasStr = entradas.map(e => formatHoraMzt(e.fecha_hora)).join(', ') || '--:--';
        const salidasStr = salidas.map(s => formatHoraMzt(s.fecha_hora)).join(', ') || '--:--';

        return `<tr>
            <td>${formatearFechaCorta(dia.fecha)} <small>${dia.diaSemana}</small></td>
            <td>${entradasStr}</td>
            <td>${salidasStr}</td>
            <td>${horas.toFixed(2)} hrs</td>
            <td>${retardo} min</td>
            <td>${d.estatus}</td>
        </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
        <html><head>
            <title>Detalle - ${emp.empleado_nombre}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                h1 { font-size: 18px; margin-bottom: 4px; }
                .sub { color: #64748b; font-size: 13px; margin-bottom: 6px; }
                .stats { display: flex; gap: 24px; margin: 12px 0 16px; padding: 10px; background: #f8fafc; border-radius: 6px; font-size: 13px; }
                .stats div { text-align: center; }
                .stats .label { color: #94a3b8; font-size: 10px; text-transform: uppercase; }
                .stats .val { font-weight: 700; font-size: 16px; }
                table { width: 100%; border-collapse: collapse; font-size: 12px; }
                th { background: #f1f5f9; padding: 7px 8px; text-align: left; border: 1px solid #e2e8f0; font-weight: 600; }
                td { padding: 6px 8px; border: 1px solid #e2e8f0; }
                tr:nth-child(even) { background: #f8fafc; }
                small { color: #94a3b8; text-transform: uppercase; }
                .footer { margin-top: 16px; text-align: center; color: #94a3b8; font-size: 10px; }
            </style>
        </head><body>
            <h1>${emp.empleado_nombre}</h1>
            <div class="sub">${emp.empleado_codigo} · ${emp.sucursal} · ${emp.puesto || ''}</div>
            <div class="sub">Período: ${fechaInicioStr ? formatearFechaCorta(fechaInicioStr) : ''} - ${fechaFinStr ? formatearFechaCorta(fechaFinStr) : ''}</div>
            <div class="stats">
                <div><div class="label">Horas</div><div class="val">${(Number(emp.horas_trabajadas)||0).toFixed(2)}</div></div>
                <div><div class="label">Entradas</div><div class="val">${emp.total_entradas}</div></div>
                <div><div class="label">Salidas</div><div class="val">${emp.total_salidas}</div></div>
                <div><div class="label">Faltas</div><div class="val">${emp.total_faltas}</div></div>
                <div><div class="label">Retardo</div><div class="val">${emp.minutos_retardo} min</div></div>
            </div>
            <table>
                <thead><tr>
                    <th>Fecha</th><th>Entradas</th><th>Salidas</th><th>Horas</th><th>Retardo</th><th>Estatus</th>
                </tr></thead>
                <tbody>${filasHTML}</tbody>
            </table>
            <div class="footer">Generado el ${new Date().toLocaleString('es-MX')}</div>
        </body></html>`;

    const ventana = window.open('', '', 'width=800,height=600');
    ventana.document.write(html);
    ventana.document.close();
    setTimeout(() => { ventana.print(); ventana.close(); }, 250);
}

/**
 * Cierra el panel de detalle del empleado
 */
function cerrarDetalleEmpleado() {
    document.getElementById('panelDetalleEmpleado').classList.remove('show');
    const mc = document.querySelector('#modalResumenGeneral .modal-content');
    if (mc) mc.classList.remove('detalle-abierto');
}

/**
 * Cierra el modal
 */
function cerrarResumenGeneral() {
    document.getElementById('modalResumenGeneral').classList.remove('show');
    cerrarDetalleEmpleado();
    datosResumenGeneral = [];
}

// Exportar funciones globales
window.mostrarResumenGeneral = mostrarResumenGeneral;
window.filtrarResumenGeneral = filtrarResumenGeneral;
window.ordenarResumenGeneral = ordenarResumenGeneral;
window.exportarResumenGeneral = exportarResumenGeneral;
window.imprimirResumenGeneral = imprimirResumenGeneral;
window.cerrarResumenGeneral = cerrarResumenGeneral;
window.mostrarDetalleEmpleadoResumen = mostrarDetalleEmpleadoResumen;
window.cerrarDetalleEmpleado = cerrarDetalleEmpleado;
window.imprimirDetalleEmpleado = imprimirDetalleEmpleado;

// ================================
// MANEJO DE ERRORES E IMÁGENES
// ================================
function handleGlobalError(event) {
    killAllSpinners();
}

function handleMissingImages() {
    document.addEventListener('error', function(e) {
        if (e.target.tagName === 'IMG') {
            if (e.target.src.includes('default-avatar.png') || e.target.src.includes('assets/')) {
                e.target.src = 'data:image/svg+xml,' + encodeURIComponent(`
                    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="#666">
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                `);
            }
        }
    }, true);
}

// ================================
// KILLER DE SPINNERS
// ================================
function killAllSpinners() {
    document.querySelectorAll('.fa-spinner, .spinner-border, [class*="spin"]').forEach(el => {
        el.remove();
    });
    
    document.querySelectorAll('.stat-number').forEach(el => {
        if (el.innerHTML.includes('fa-') || 
            el.innerHTML.includes('spinner') || 
            el.innerHTML === '' || 
            el.innerHTML.includes('[object') ||
            el.innerHTML.includes('undefined')) {
            el.innerHTML = '0';
        }
    });
    
    // MODIFICAR ESTA PARTE - No eliminar modales de fotos
    document.querySelectorAll('[style*="position: fixed"]').forEach(el => {
        // NO ELIMINAR si es modal de fotos o tiene ID específico
        if (el.id && (el.id.includes('modal-fotos') || el.id.includes('modalQR'))) {
            return; // No tocar
        }
        
        if (el.style.zIndex > 1000 && 
            (el.style.background || el.innerHTML.includes('loading')) &&
            !el.innerHTML.includes('📸') && // No eliminar si tiene emoji de cámara
            !el.innerHTML.includes('Registro #')) { // No eliminar si tiene texto de registro
            el.remove();
        }
    });
}

// ================================
// ESTILOS CSSmodal.id = 'modal-fotos-reales';

// ================================
function addRequiredStyles() {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .custom-alert { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
        }
        
        .modal.active { 
            display: flex !important; 
            align-items: center; 
            justify-content: center; 
        }
        
        /* Estilos para registros avanzados */
        .empleado-info {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .empleado-avatar {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: #3b82f6;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 12px;
        }
        
        .empleado-details {
            display: flex;
            flex-direction: column;
        }
        
        .empleado-nombre {
            font-weight: 500;
            color: #1f2937;
            font-size: 14px;
        }
        
        .empleado-codigo {
            font-size: 12px;
            color: #6b7280;
        }
        
        .fecha-badge {
            background: #3b82f6;
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
            display: inline-block;
        }
        
        .hora-badge {
            background: #10b981;
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
            display: inline-block;
        }
        
        .hora-badge.tardanza {
            background: #ef4444;
        }
        
        .hora-badge.sin-registro {
            background: #6b7280;
        }
        
        .horas-trabajadas {
            font-weight: 500;
            color: #1f2937;
        }
        
        .horas-objetivo {
            display: flex;
            align-items: center;
            gap: 5px;
            color: #6b7280;
        }
        
        .estatus-badge {
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .estatus-badge.completo {
            background: #d1fae5;
            color: #065f46;
        }
        
        .estatus-badge.incompleto {
            background: #fef3c7;
            color: #92400e;
        }
        
        .estatus-badge.sin-registro {
            background: #f3f4f6;
            color: #6b7280;
        }
        
        .tablet-info {
            font-family: monospace;
            font-size: 12px;
            color: #6b7280;
        }
        
        .foto-thumbnail {
            width: 32px;
            height: 32px;
            border-radius: 4px;
            object-fit: cover;
            cursor: pointer;
            border: 1px solid #e5e7eb;
        }
        
        .acciones-cell {
            display: flex;
            gap: 4px;
        }
        
        .btn-accion {
            width: 28px;
            height: 28px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
        }
        
        .btn-accion.editar {
            background: #10b981;
            color: white;
        }
        
        .btn-accion.eliminar {
            background: #ef4444;
            color: white;
        }
        
        .stats-card {
            background: white;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .stats-card h4 {
            margin: 0 0 15px 0;
            color: #333;
            font-size: 16px;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
        }
        
        .stat-item {
            text-align: center;
            padding: 10px;
            background: #f8f9fa;
            border-radius: 6px;
        }
        
        .stat-number {
            font-size: 24px;
            font-weight: bold;
            color: #007bff;
            margin-bottom: 5px;
        }
        
        .stat-label {
            font-size: 12px;
            color: #666;
        }
        
        .employee-rank {
            display: flex;
            align-items: center;
            padding: 8px 0;
            border-bottom: 1px solid #eee;
        }
        
        .employee-rank:last-child {
            border-bottom: none;
        }
        
        .rank {
            width: 25px;
            height: 25px;
            background: #007bff;
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: bold;
            margin-right: 10px;
        }
        
        .name {
            flex: 1;
            font-size: 14px;
        }
        
        .score {
            font-weight: bold;
            color: #28a745;
        }
        
        .today-stats p {
            margin: 8px 0;
            padding: 0;
        }
    `;
    document.head.appendChild(style);
}

// ================================
// AUTO-INICIALIZACIÓN
// ================================
setInterval(killAllSpinners, 3000);

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        setTimeout(killAllSpinners, 1000);
    }
});

window.addEventListener('beforeunload', killAllSpinners);

// ================================
// QR-CHECK: BUSCADOR DE NÓMINA
// ================================

let _nominaCache = null;        // todos los empleados de nómina (cargados una vez)
let _nominaDebounce = null;     // timer debounce para el input
let _codigosEnSupabase = new Set(); // códigos que ya están dados de alta

// Carga empleados de nómina desde el backend (una sola vez por sesión del modal)
async function _cargarNomina() {
    if (_nominaCache) return _nominaCache;
    try {
        const res = await fetch(`${ADMIN_CONFIG.apiUrl}/empleados/qr-check/para-alta?limit=1000`);
        if (!res.ok) throw new Error('Error al consultar nómina');
        const json = await res.json();
        _nominaCache = json.data || [];
        return _nominaCache;
    } catch (e) {
        console.error('Error cargando nómina:', e);
        return [];
    }
}

// Construye el Set de códigos que ya existen en Supabase
async function _cargarCodigosExistentes() {
    try {
        const result = await SupabaseAPI.getEmpleados();
        const lista = result.data || result || [];
        _codigosEnSupabase = new Set(lista.map(e => String(e.codigo_empleado).trim()));
    } catch (e) {
        console.error('Error cargando códigos existentes:', e);
        _codigosEnSupabase = new Set();
    }
}

// Muestra/oculta el buscador según si es nuevo o edición
function _toggleBuscadorNomina(esNuevo) {
    const buscador = document.getElementById('empBuscadorNomina');
    if (!buscador) return;

    if (esNuevo) {
        buscador.style.display = 'block';
        // Limpiar estado previo
        document.getElementById('empBuscarInput').value = '';
        document.getElementById('empBuscarResultados').style.display = 'none';
        document.getElementById('empSeleccionado').style.display = 'none';
        _setupBuscadorNomina();
    } else {
        buscador.style.display = 'none';
    }
}

function _setupBuscadorNomina() {
    const input = document.getElementById('empBuscarInput');
    const resultados = document.getElementById('empBuscarResultados');
    if (!input || input._nominaListenerAdded) return;
    input._nominaListenerAdded = true;

    input.addEventListener('input', () => {
        clearTimeout(_nominaDebounce);
        const q = input.value.trim();
        if (q.length < 2) {
            resultados.style.display = 'none';
            return;
        }
        _nominaDebounce = setTimeout(() => _buscarEnNomina(q), 300);
    });

    // Cerrar al hacer click fuera
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#empBuscadorNomina')) {
            resultados.style.display = 'none';
        }
    });
}

async function _buscarEnNomina(q) {
    const spinner = document.getElementById('empBuscarSpinner');
    const resultados = document.getElementById('empBuscarResultados');
    if (spinner) spinner.style.display = 'inline';

    const lista = await _cargarNomina();
    if (spinner) spinner.style.display = 'none';

    const qLower = q.toLowerCase();
    const filtrados = lista.filter(e =>
        e.nombre_completo?.toLowerCase().includes(qLower) ||
        String(e.codigo_empleado).includes(q)
    ).slice(0, 15);

    if (filtrados.length === 0) {
        resultados.innerHTML = '<div style="padding:12px; color:#888; font-size:13px;">Sin resultados</div>';
        resultados.style.display = 'block';
        return;
    }

    resultados.innerHTML = filtrados.map(e => {
        const yaExiste = _codigosEnSupabase.has(String(e.codigo_empleado).trim());
        return `
            <div
                data-codigo="${e.codigo_empleado}"
                data-nombre="${e.nombre}"
                data-paterno="${e.ap_paterno}"
                data-materno="${e.ap_materno}"
                data-puesto="${e.puesto}"
                data-sucursal="${e.sucursal}"
                data-yaexiste="${yaExiste}"
                onclick="_seleccionarEmpleadoNomina(this)"
                style="
                    padding:10px 14px;
                    cursor:${yaExiste ? 'default' : 'pointer'};
                    border-bottom:1px solid #f0f0f0;
                    background:${yaExiste ? '#f9f9f9' : '#fff'};
                    opacity:${yaExiste ? '0.6' : '1'};
                    font-size:13px;
                    display:flex; justify-content:space-between; align-items:center;
                "
                ${yaExiste ? '' : 'onmouseover="this.style.background=\'#f0f9ff\'" onmouseout="this.style.background=\'#fff\'"'}
            >
                <div>
                    <strong>${e.nombre_completo}</strong>
                    <span style="color:#888; margin-left:8px;">${e.codigo_empleado}</span>
                    <br>
                    <span style="color:#555; font-size:12px;">${e.puesto} · ${e.sucursal}</span>
                </div>
                ${yaExiste ? '<span style="font-size:11px; color:#888; background:#e5e7eb; padding:2px 8px; border-radius:10px;">Ya registrado</span>' : ''}
            </div>
        `;
    }).join('');

    resultados.style.display = 'block';
}

function _seleccionarEmpleadoNomina(el) {
    if (el.dataset.yaexiste === 'true') return; // bloquear si ya existe

    const nombre = el.dataset.nombre || '';
    const paterno = el.dataset.paterno || '';
    const materno = el.dataset.materno || '';
    const apellidoCompleto = [paterno, materno].filter(Boolean).join(' ');

    // Llenar el formulario
    const set = (id, val) => { const f = document.getElementById(id); if (f) f.value = val; };
    set('empCodigo',   el.dataset.codigo);
    set('empNombre',   nombre);
    set('empApellido', apellidoCompleto);
    set('empPuesto',   el.dataset.puesto);
    set('empSucursal', el.dataset.sucursal);

    // Autoseleccionar horario "partido de oficina" por defecto
    const horarios = adminState.horariosData || [];
    const horarioPartido = horarios.find(h =>
        h.nombre && h.nombre.toLowerCase().includes('partido') && h.nombre.toLowerCase().includes('oficina')
    ) || horarios.find(h =>
        h.nombre && h.nombre.toLowerCase().includes('partido')
    );
    if (horarioPartido) set('empHorario', horarioPartido.id);

    // Mostrar resumen del seleccionado
    const box = document.getElementById('empSeleccionado');
    if (box) {
        box.innerHTML = `✅ <strong>${nombre} ${apellidoCompleto}</strong> · ${el.dataset.codigo} · ${el.dataset.puesto} · ${el.dataset.sucursal}`;
        box.style.display = 'block';
    }

    // Ocultar dropdown
    document.getElementById('empBuscarResultados').style.display = 'none';
    document.getElementById('empBuscarInput').value = `${nombre} ${apellidoCompleto}`;
}

// ================================
// EXPORTAR FUNCIONES GLOBALES
// ================================
window.refreshDashboard = () => loadDashboardData();
window.openEmployeeModal = openEmployeeModal;
window.guardarEmpleado = guardarEmpleado;
window.editEmployee = editEmployee;
window.viewEmployeeQR = viewEmployeeQR;
window.mostrarQR = mostrarQR;
window.descargarQR = descargarQR;
window.imprimirQRs = imprimirQRs;
window.toggleEmployeeStatus = toggleEmployeeStatus;
window.deleteEmployee = deleteEmployee;
window.editHorario = editHorario;
window.toggleHorarioStatus = toggleHorarioStatus;
window.deleteHorario = deleteHorario;
window.closeModal = closeModal;
window.generarReporteAsistencia = generarReporteAsistencia;

// Funciones específicas para registros avanzados
window.filtrarRegistros = filtrarRegistros;
window.reloadRegistros = reloadRegistros;
window.verFotoCompleta = verFotoCompleta;
window.editarRegistro = editarRegistro;
window.eliminarRegistro = eliminarRegistro;
window.imprimirRegistros = imprimirRegistros;
window.configurarColumnas = configurarColumnas;
window.cambiarPagina = cambiarPagina;
window.toggleSelectAll = toggleSelectAll;

// Función para exportar registros a CSV/Excel
async function exportarRegistros(tipo) {
    if (tipo !== 'excel') {
        showAlert('Info', 'Solo disponible exportación a Excel/CSV', 'info');
        return;
    }


    try {
        showLoading('Generando archivo Excel...');

        // Obtener fechas del filtro actual
        const fechaInicio = document.getElementById('fechaInicio')?.value ||
                           new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const fechaFin = document.getElementById('fechaFin')?.value ||
                         new Date().toISOString().split('T')[0];

        // Obtener registros desde Supabase con filtro de sucursal
        const filtros = {
            sucursalUsuario: window.currentUserSucursal
        };
        const result = await SupabaseAPI.getRegistrosByFecha(fechaInicio, fechaFin, filtros);

        if (!result.success) {
            throw new Error(result.message || 'Error obteniendo registros');
        }

        const registros = result.data;

        if (registros.length === 0) {
            showAlert('Info', 'No hay registros en el período seleccionado', 'info');
            return;
        }

        // ✅ AGRUPAR REGISTROS POR EMPLEADO Y FECHA PARA CALCULAR HORAS
        const registrosPorEmpleadoFecha = {};

        registros.forEach(reg => {
            const fechaHora = new Date(reg.fecha_hora);

            // Obtener fecha en hora LOCAL, no UTC
            const year = fechaHora.getFullYear();
            const month = String(fechaHora.getMonth() + 1).padStart(2, '0');
            const day = String(fechaHora.getDate()).padStart(2, '0');
            const fecha = `${year}-${month}-${day}`;

            const empleadoId = reg.empleado_id;
            const key = `${empleadoId}_${fecha}`;

            if (!registrosPorEmpleadoFecha[key]) {
                registrosPorEmpleadoFecha[key] = {
                    empleado_codigo: reg.empleado_codigo,
                    empleado_nombre: reg.empleado_nombre,
                    sucursal: reg.sucursal,
                    puesto: reg.puesto,
                    fecha: fecha,
                    entradas: [],
                    salidas: []
                };
            }

            if (reg.tipo_registro === 'ENTRADA') {
                registrosPorEmpleadoFecha[key].entradas.push(fechaHora);
            } else if (reg.tipo_registro === 'SALIDA') {
                registrosPorEmpleadoFecha[key].salidas.push(fechaHora);
            }
        });

        // Generar CSV
        let csvContent = '\ufeff'; // BOM para UTF-8

        // Encabezado
        csvContent += 'REPORTE DE ASISTENCIAS CON HORAS TRABAJADAS\n';
        csvContent += `Período: ${fechaInicio} al ${fechaFin}\n`;
        csvContent += `Total empleados-días: ${Object.keys(registrosPorEmpleadoFecha).length}\n`;
        csvContent += `Generado: ${new Date().toLocaleString('es-MX')}\n\n`;

        // Columnas
        csvContent += 'Fecha,Código,Empleado,Sucursal,Puesto,Primera Entrada,Última Salida,Horas Trabajadas\n';

        // Datos agrupados
        Object.values(registrosPorEmpleadoFecha).forEach(grupo => {
            // Ordenar entradas y salidas
            grupo.entradas.sort((a, b) => a - b);
            grupo.salidas.sort((a, b) => a - b);

            const primeraEntrada = grupo.entradas.length > 0
                ? grupo.entradas[0].toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
                : 'N/A';

            const ultimaSalida = grupo.salidas.length > 0
                ? grupo.salidas[grupo.salidas.length - 1].toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
                : 'N/A';

            // Calcular horas trabajadas SOLO si hay entrada Y salida
            let horasTrabajadas = 'N/A';
            if (grupo.entradas.length > 0 && grupo.salidas.length > 0) {
                const entrada = grupo.entradas[0];
                const salida = grupo.salidas[grupo.salidas.length - 1];

                // Verificar que la salida sea posterior a la entrada
                if (salida > entrada) {
                    const diffMs = salida - entrada;
                    const diffMinutos = Math.floor(diffMs / (1000 * 60));
                    const horasDecimal = (diffMinutos / 60).toFixed(1);
                    horasTrabajadas = horasDecimal;
                } else {
                    // Si la salida es antes de la entrada, hay un error en los datos
                    horasTrabajadas = 'Error';
                }
            } else if (grupo.entradas.length > 0 && grupo.salidas.length === 0) {
                // Si solo hay entrada sin salida
                horasTrabajadas = 'En turno';
            }

            csvContent += `"${grupo.fecha}",`;
            csvContent += `"${grupo.empleado_codigo || 'N/A'}",`;
            csvContent += `"${grupo.empleado_nombre || 'N/A'}",`;
            csvContent += `"${grupo.sucursal || 'N/A'}",`;
            csvContent += `"${grupo.puesto || 'N/A'}",`;
            csvContent += `"${primeraEntrada}",`;
            csvContent += `"${ultimaSalida}",`;
            csvContent += `"${horasTrabajadas}"\n`;
        });

        // Crear archivo y descargar
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Reporte_Asistencias_${fechaInicio}_${fechaFin}.csv`;
        link.style.display = 'none';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        showAlert('Éxito', `Excel descargado: ${registros.length} registros`, 'success');

    } catch (error) {
        showAlert('Error', 'Error generando archivo Excel: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Exportar función a window
window.exportarRegistros = exportarRegistros;

window.agregarBloqueHorario = (bloqueExistente = null) => {
    try {
        const container = document.getElementById('bloquesContainer');
        if (!container) return;
        
        const bloqueIndex = container.children.length + 1;
        
        // ARREGLAR EL FORMATO DE HORA COMPLETAMENTE
        let horaEntrada = '';
        let horaSalida = '';
        
        if (bloqueExistente?.hora_entrada) {
            if (typeof bloqueExistente.hora_entrada === 'string') {
                // Si es string, tomar solo HH:MM
                horaEntrada = bloqueExistente.hora_entrada.substring(0, 5);
            } else if (bloqueExistente.hora_entrada instanceof Date) {
                // Si es Date, formatear correctamente
                horaEntrada = bloqueExistente.hora_entrada.toTimeString().substring(0, 5);
            }
        }
        
        if (bloqueExistente?.hora_salida) {
            if (typeof bloqueExistente.hora_salida === 'string') {
                horaSalida = bloqueExistente.hora_salida.substring(0, 5);
            } else if (bloqueExistente.hora_salida instanceof Date) {
                horaSalida = bloqueExistente.hora_salida.toTimeString().substring(0, 5);
            }
        }
        
        const bloqueHTML = `
            <div class="bloque-item" data-bloque="${bloqueIndex}">
                <div class="bloque-header">
                    <span class="bloque-number">Bloque ${bloqueIndex}</span>
                    <button type="button" class="btn-remove-bloque" onclick="eliminarBloqueHorario(this)">
                        <i class="fas fa-trash"></i> Eliminar
                    </button>
                </div>
                
                <div class="form-row">
                    <div class="form-group" style="flex: 1;">
                        <label>Descripción</label>
                        <input type="text" name="bloque_descripcion" 
                               value="${bloqueExistente?.descripcion || `Turno ${bloqueIndex}`}" 
                               placeholder="Ej: Turno Mañana">
                    </div>
                    <div class="form-group" style="flex: 0 0 120px;">
                        <label>Orden</label>
                        <input type="number" name="bloque_orden" 
                               value="${bloqueExistente?.orden_bloque || bloqueIndex}" 
                               min="1" required>
                    </div>
                </div>
                
                <div class="form-row">
                    <div class="form-group" style="flex: 1;">
                        <label>Hora Entrada *</label>
                        <input type="time" name="bloque_entrada" 
                               value="${horaEntrada}" 
                               required>
                    </div>
                    <div class="form-group" style="flex: 1;">
                        <label>Hora Salida *</label>
                        <input type="time" name="bloque_salida" 
                               value="${horaSalida}" 
                               required>
                    </div>
                </div>
                
                <div class="form-row">
                    <div class="form-group" style="flex: 1;">
                        <label>Tolerancia Entrada (min)</label>
                        <input type="number" name="bloque_tol_entrada" 
                            value="${bloqueExistente?.tolerancia_entrada_min || 15}" 
                            min="0" max="999">
                    </div>
                    <div class="form-group" style="flex: 1;">
                        <label>Tolerancia Salida (min)</label>
                        <input type="number" name="bloque_tol_salida" 
                               value="${bloqueExistente?.tolerancia_salida_min || 15}" 
                               min="0" max="999">
                    </div>
                </div>
            </div>
        `;
        
        container.insertAdjacentHTML('beforeend', bloqueHTML);
        actualizarNumerosBloques();
        
    } catch (error) {
        showAlert('Error', 'Error agregando bloque de horario', 'error');
    }
};

// Funciones placeholder
window.guardarConfiguracion = () => showAlert('Info', 'Función de configuración en desarrollo', 'info');
window.viewPhoto = (url) => window.open(url, '_blank');


// ============================================
// TUTORIAL INTERACTIVO DE NUEVO EMPLEADO
// ============================================

let tutorialCurrentStep = 1;
const tutorialTotalSteps = 5;

/**
 * Inicia el tutorial de alta de empleados
 */
window.iniciarTutorialEmpleado = function() {
    tutorialCurrentStep = 1;
    const modal = document.getElementById('modalTutorialEmpleado');
    if (modal) {
        modal.style.display = 'block';
        actualizarPasoTutorial();
    }
};

/**
 * Cierra el tutorial
 */
window.cerrarTutorialEmpleado = function() {
    const modal = document.getElementById('modalTutorialEmpleado');
    if (modal) {
        modal.style.display = 'none';
        tutorialCurrentStep = 1;
    }
};

/**
 * Avanza al siguiente paso del tutorial
 */
window.siguientePasoTutorial = function() {
    if (tutorialCurrentStep < tutorialTotalSteps) {
        tutorialCurrentStep++;
        actualizarPasoTutorial();
    }
};

/**
 * Retrocede al paso anterior del tutorial
 */
window.anteriorPasoTutorial = function() {
    if (tutorialCurrentStep > 1) {
        tutorialCurrentStep--;
        actualizarPasoTutorial();
    }
};

/**
 * Finaliza el tutorial y abre el modal de nuevo empleado
 */
window.finalizarTutorial = function() {
    cerrarTutorialEmpleado();

    // Abrir el modal de nuevo empleado después de cerrar el tutorial
    setTimeout(() => {
        const btnNuevoEmpleado = document.getElementById('btnNuevoEmpleado');
        if (btnNuevoEmpleado) {
            btnNuevoEmpleado.click();
        }
    }, 300);
};

/**
 * Actualiza la visualización del tutorial según el paso actual
 */
function actualizarPasoTutorial() {
    // Actualizar indicadores de paso
    document.querySelectorAll('.step-indicator').forEach((indicator, index) => {
        const stepNumber = index + 1;
        indicator.classList.remove('active', 'completed');

        if (stepNumber === tutorialCurrentStep) {
            indicator.classList.add('active');
        } else if (stepNumber < tutorialCurrentStep) {
            indicator.classList.add('completed');
        }
    });

    // Actualizar contenido de pasos
    document.querySelectorAll('.tutorial-step').forEach(step => {
        step.classList.remove('active');
    });

    const currentStepElement = document.querySelector(`.tutorial-step[data-step="${tutorialCurrentStep}"]`);
    if (currentStepElement) {
        currentStepElement.classList.add('active');
    }

    // Actualizar contador de pasos
    const stepCounter = document.getElementById('tutorialCurrentStep');
    if (stepCounter) {
        stepCounter.textContent = tutorialCurrentStep;
    }

    // Actualizar botones
    const btnPrev = document.getElementById('btnTutorialPrev');
    const btnNext = document.getElementById('btnTutorialNext');
    const btnFinish = document.getElementById('btnTutorialFinish');

    if (btnPrev) {
        btnPrev.style.display = tutorialCurrentStep === 1 ? 'none' : 'inline-flex';
    }

    if (btnNext && btnFinish) {
        if (tutorialCurrentStep === tutorialTotalSteps) {
            btnNext.style.display = 'none';
            btnFinish.style.display = 'inline-flex';
        } else {
            btnNext.style.display = 'inline-flex';
            btnFinish.style.display = 'none';
        }
    }

    // Scroll al inicio del contenido
    const modalBody = document.querySelector('#modalTutorialEmpleado .modal-body');
    if (modalBody) {
        modalBody.scrollTop = 0;
    }
}

/**
 * Cierra el tutorial al hacer clic fuera del modal
 */
window.addEventListener('click', function(event) {
    const modal = document.getElementById('modalTutorialEmpleado');
    if (event.target === modal) {
        cerrarTutorialEmpleado();
    }
});

/**
 * Manejo de teclas para navegación del tutorial
 */
document.addEventListener('keydown', function(event) {
    const modal = document.getElementById('modalTutorialEmpleado');
    if (modal && modal.style.display === 'block') {
        // Flecha derecha o Enter: siguiente paso
        if (event.key === 'ArrowRight' || event.key === 'Enter') {
            if (tutorialCurrentStep < tutorialTotalSteps) {
                siguientePasoTutorial();
            } else {
                finalizarTutorial();
            }
            event.preventDefault();
        }
        // Flecha izquierda: paso anterior
        else if (event.key === 'ArrowLeft') {
            anteriorPasoTutorial();
            event.preventDefault();
        }
        // Escape: cerrar tutorial
        else if (event.key === 'Escape') {
            cerrarTutorialEmpleado();
            event.preventDefault();
        }
    }
});

console.log('✅ Tutorial de empleados inicializado');

// ================================
// JUSTIFICACIONES
// ================================
let justificacionesData = [];

async function loadJustificaciones() {
    try {
        showLoading('Cargando justificaciones...');

        const filtros = {};
        if (window.currentUserSucursal) {
            filtros.sucursal = window.currentUserSucursal;
        }

        const result = await SupabaseAPI.getJustificaciones(filtros);
        hideLoading();

        if (result.success) {
            justificacionesData = result.data;
            renderJustificaciones(justificacionesData);
            configurarFiltroSucursalJustificaciones();
        } else {
            showAlert('Error', 'No se pudieron cargar las justificaciones', 'error');
        }
    } catch (error) {
        hideLoading();
        showAlert('Error', 'Error al cargar justificaciones', 'error');
    }
}

function renderJustificaciones(data) {
    const tbody = document.querySelector('#justificacionesTable tbody');
    if (!tbody) return;

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:20px;">No hay justificaciones registradas</td></tr>';
        return;
    }

    const tipoLabels = {
        'VACACION': '<span style="background:#3b82f6;color:white;padding:2px 8px;border-radius:4px;">Vacaciones</span>',
        'INCAPACIDAD': '<span style="background:#ef4444;color:white;padding:2px 8px;border-radius:4px;">Incapacidad</span>',
        'PERMISO': '<span style="background:#f59e0b;color:white;padding:2px 8px;border-radius:4px;">Permiso</span>'
    };

    tbody.innerHTML = data.map(j => {
        const dias = calcularDiasJustificacion(j.fecha_inicio, j.fecha_fin);
        return `
            <tr>
                <td>${j.empleado_nombre || ''} <br><small style="color:#888;">${j.empleado_codigo || ''}</small></td>
                <td>${j.empleado_sucursal || ''}</td>
                <td>${tipoLabels[j.tipo] || j.tipo}</td>
                <td>${formatearFechaCorta(j.fecha_inicio)}</td>
                <td>${formatearFechaCorta(j.fecha_fin)}</td>
                <td>${dias}</td>
                <td>${j.motivo || '-'}</td>
                <td>${j.created_by || '-'}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="editarJustificacion(${j.id})" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="eliminarJustificacion(${j.id})" title="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function calcularDiasJustificacion(fechaInicio, fechaFin) {
    const inicio = new Date(fechaInicio + 'T00:00:00');
    const fin = new Date(fechaFin + 'T00:00:00');
    return Math.ceil((fin - inicio) / (1000 * 60 * 60 * 24)) + 1;
}

function formatearFechaCorta(fecha) {
    if (!fecha) return '-';
    const parts = fecha.split('-');
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function filtrarJustificaciones() {
    const tipo = document.getElementById('filterJustTipo')?.value || '';
    const busqueda = (document.getElementById('searchJustEmpleado')?.value || '').toLowerCase();
    const fechaInicio = document.getElementById('filterJustFechaInicio')?.value || '';
    const fechaFin = document.getElementById('filterJustFechaFin')?.value || '';
    const sucursal = document.getElementById('filterJustSucursal')?.value || '';

    let filtered = justificacionesData;

    if (tipo) {
        filtered = filtered.filter(j => j.tipo === tipo);
    }
    if (busqueda) {
        filtered = filtered.filter(j =>
            (j.empleado_nombre || '').toLowerCase().includes(busqueda) ||
            (j.empleado_codigo || '').toLowerCase().includes(busqueda)
        );
    }
    if (fechaInicio) {
        filtered = filtered.filter(j => j.fecha_fin >= fechaInicio);
    }
    if (fechaFin) {
        filtered = filtered.filter(j => j.fecha_inicio <= fechaFin);
    }
    if (sucursal) {
        filtered = filtered.filter(j => j.empleado_sucursal === sucursal);
    }

    renderJustificaciones(filtered);
}

function configurarFiltroSucursalJustificaciones() {
    const filterSucursal = document.getElementById('filterJustSucursal');
    if (!filterSucursal) return;

    if (!window.isSuperAdmin && window.currentUserSucursal) {
        filterSucursal.style.display = 'none';
    }
}

// Cache de empleados para autocomplete
let justEmpleadosCache = [];

async function abrirModalJustificacion(justId = null) {
    // Cargar empleados para autocomplete
    const empResult = await SupabaseAPI.getEmpleados(window.currentUserSucursal);
    if (empResult.success) {
        justEmpleadosCache = empResult.data
            .filter(e => e.activo)
            .sort((a, b) => (a.nombre + a.apellido).localeCompare(b.nombre + b.apellido));
    }

    // Reset form
    document.getElementById('justId').value = '';
    document.getElementById('justEmpleadoId').value = '';
    document.getElementById('justEmpleadoBuscar').value = '';
    document.getElementById('justTipo').value = '';
    document.getElementById('justFechaInicio').value = '';
    document.getElementById('justFechaFin').value = '';
    document.getElementById('justMotivo').value = '';
    document.getElementById('justEmpleadoSeleccionado').style.display = 'none';
    document.getElementById('justEmpleadoBuscar').style.display = '';
    document.getElementById('justDiasResumen').style.display = 'none';
    document.getElementById('justEmpleadoResultados').classList.remove('active');

    // Limpiar errores previos
    limpiarErroresJustificacion();

    if (justId) {
        const just = justificacionesData.find(j => j.id === justId);
        if (just) {
            document.getElementById('justId').value = just.id;
            document.getElementById('justEmpleadoId').value = just.empleado_id;
            document.getElementById('justTipo').value = just.tipo;
            document.getElementById('justFechaInicio').value = just.fecha_inicio;
            document.getElementById('justFechaFin').value = just.fecha_fin;
            document.getElementById('justMotivo').value = just.motivo || '';
            document.getElementById('modalJustificacionTitle').textContent = 'Editar Justificación';

            // Mostrar badge del empleado seleccionado
            seleccionarEmpleadoJustificacion(just.empleado_id, just.empleado_nombre, just.empleado_codigo);
            actualizarResumenDias();
        }
    } else {
        document.getElementById('modalJustificacionTitle').textContent = 'Nueva Justificación';
    }

    // Setup event listeners
    setupJustificacionListeners();
    openModal('modalJustificacion');
}

function setupJustificacionListeners() {
    const inputBuscar = document.getElementById('justEmpleadoBuscar');
    const resultados = document.getElementById('justEmpleadoResultados');

    // Remover listeners previos clonando el input
    const nuevoInput = inputBuscar.cloneNode(true);
    inputBuscar.parentNode.replaceChild(nuevoInput, inputBuscar);

    nuevoInput.addEventListener('input', function() {
        const query = this.value.trim().toLowerCase();
        if (query.length < 1) {
            resultados.classList.remove('active');
            return;
        }

        const matches = justEmpleadosCache.filter(emp => {
            const nombre = `${emp.nombre} ${emp.apellido}`.toLowerCase();
            const codigo = (emp.codigo_empleado || '').toLowerCase();
            return nombre.includes(query) || codigo.includes(query);
        }).slice(0, 8);

        if (matches.length === 0) {
            resultados.innerHTML = '<div class="just-autocomplete-no-results">No se encontraron empleados</div>';
        } else {
            resultados.innerHTML = matches.map(emp => `
                <div class="just-autocomplete-item" data-id="${emp.id}" data-nombre="${emp.nombre} ${emp.apellido}" data-codigo="${emp.codigo_empleado}"
                    onclick="seleccionarEmpleadoJustificacion(${emp.id}, '${(emp.nombre + ' ' + emp.apellido).replace(/'/g, "\\'")}', '${emp.codigo_empleado}')">
                    <div>
                        <div class="emp-name">${emp.nombre} ${emp.apellido}</div>
                        <div class="emp-code">${emp.codigo_empleado} - ${emp.puesto || 'Sin puesto'}</div>
                    </div>
                    <span class="emp-sucursal">${emp.sucursal || ''}</span>
                </div>
            `).join('');
        }
        resultados.classList.add('active');
    });

    nuevoInput.addEventListener('focus', function() {
        if (this.value.trim().length >= 1) {
            nuevoInput.dispatchEvent(new Event('input'));
        }
    });

    // Cerrar resultados al hacer click fuera
    document.addEventListener('click', function cerrarAutocompletado(e) {
        if (!e.target.closest('.just-autocomplete-wrapper')) {
            resultados.classList.remove('active');
        }
    });

    // Listeners para calcular días
    const fechaInicio = document.getElementById('justFechaInicio');
    const fechaFin = document.getElementById('justFechaFin');
    fechaInicio.addEventListener('change', actualizarResumenDias);
    fechaFin.addEventListener('change', actualizarResumenDias);
}

function seleccionarEmpleadoJustificacion(id, nombre, codigo) {
    document.getElementById('justEmpleadoId').value = id;
    document.getElementById('justEmpleadoBuscar').style.display = 'none';
    document.getElementById('justEmpleadoResultados').classList.remove('active');

    const badge = document.getElementById('justEmpleadoSeleccionado');
    document.getElementById('justEmpleadoNombre').textContent = `${nombre} (${codigo})`;
    badge.style.display = 'inline-flex';

    // Quitar error si existía
    document.getElementById('justEmpleadoBuscar').classList.remove('field-error');
    const errorMsg = document.getElementById('justEmpleadoBuscar').parentNode.querySelector('.field-error-msg');
    if (errorMsg) errorMsg.remove();
}

function limpiarEmpleadoJustificacion() {
    document.getElementById('justEmpleadoId').value = '';
    document.getElementById('justEmpleadoBuscar').value = '';
    document.getElementById('justEmpleadoBuscar').style.display = '';
    document.getElementById('justEmpleadoSeleccionado').style.display = 'none';
    document.getElementById('justEmpleadoBuscar').focus();
}

function actualizarResumenDias() {
    const fechaInicio = document.getElementById('justFechaInicio').value;
    const fechaFin = document.getElementById('justFechaFin').value;
    const resumen = document.getElementById('justDiasResumen');

    if (fechaInicio && fechaFin && fechaFin >= fechaInicio) {
        const dias = calcularDiasJustificacion(fechaInicio, fechaFin);
        resumen.innerHTML = `<i class="fas fa-calendar-check"></i> ${dias} día${dias > 1 ? 's' : ''} — del ${formatearFechaCorta(fechaInicio)} al ${formatearFechaCorta(fechaFin)}`;
        resumen.style.display = 'block';
    } else {
        resumen.style.display = 'none';
    }
}

function limpiarErroresJustificacion() {
    document.querySelectorAll('#formJustificacion .field-error').forEach(el => el.classList.remove('field-error'));
    document.querySelectorAll('#formJustificacion .field-error-msg').forEach(el => el.remove());
}

function marcarErrorCampo(elementId, mensaje) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.classList.add('field-error');
    // No agregar mensaje duplicado
    const parent = el.closest('.form-group') || el.parentNode;
    if (!parent.querySelector('.field-error-msg')) {
        const msg = document.createElement('div');
        msg.className = 'field-error-msg';
        msg.textContent = mensaje;
        parent.appendChild(msg);
    }
}

function editarJustificacion(justId) {
    abrirModalJustificacion(justId);
}

async function guardarJustificacion() {
    limpiarErroresJustificacion();

    const id = document.getElementById('justId').value;
    const empleadoId = document.getElementById('justEmpleadoId').value;
    const tipo = document.getElementById('justTipo').value;
    const fechaInicio = document.getElementById('justFechaInicio').value;
    const fechaFin = document.getElementById('justFechaFin').value;
    const motivo = document.getElementById('justMotivo').value;

    // Validación campo por campo
    let hayErrores = false;

    if (!empleadoId) {
        marcarErrorCampo('justEmpleadoBuscar', 'Selecciona un empleado');
        hayErrores = true;
    }
    if (!tipo) {
        marcarErrorCampo('justTipo', 'Selecciona el tipo de justificación');
        hayErrores = true;
    }
    if (!fechaInicio) {
        marcarErrorCampo('justFechaInicio', 'Selecciona la fecha de inicio');
        hayErrores = true;
    }
    if (!fechaFin) {
        marcarErrorCampo('justFechaFin', 'Selecciona la fecha de fin');
        hayErrores = true;
    }
    if (fechaInicio && fechaFin && fechaInicio > fechaFin) {
        marcarErrorCampo('justFechaFin', 'Debe ser igual o posterior a fecha inicio');
        hayErrores = true;
    }

    if (hayErrores) {
        showAlert('Campos incompletos', 'Revisa los campos marcados en rojo', 'warning');
        return;
    }

    const justData = {
        empleado_id: parseInt(empleadoId),
        tipo: tipo,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        motivo: motivo,
        created_by: window.currentUser?.nombreCompleto || 'admin'
    };

    showLoading('Guardando justificación...');

    let result;
    if (id) {
        result = await SupabaseAPI.updateJustificacion(parseInt(id), justData);
    } else {
        result = await SupabaseAPI.createJustificacion(justData);
    }

    hideLoading();

    if (result.success) {
        closeModal('modalJustificacion');
        showAlert('Éxito', id ? 'Justificación actualizada' : 'Justificación creada', 'success');
        loadJustificaciones();
    } else {
        showAlert('Error', result.message || 'Error al guardar', 'error');
    }
}

async function eliminarJustificacion(justId) {
    if (!confirm('¿Estás seguro de eliminar esta justificación?')) return;

    showLoading('Eliminando...');
    const result = await SupabaseAPI.deleteJustificacion(justId);
    hideLoading();

    if (result.success) {
        showAlert('Eliminado', 'Justificación eliminada correctamente', 'success');
        loadJustificaciones();
    } else {
        showAlert('Error', 'No se pudo eliminar', 'error');
    }
}

window.abrirModalJustificacion = abrirModalJustificacion;
window.editarJustificacion = editarJustificacion;
window.guardarJustificacion = guardarJustificacion;
window.eliminarJustificacion = eliminarJustificacion;
window.filtrarJustificaciones = filtrarJustificaciones;
window.limpiarEmpleadoJustificacion = limpiarEmpleadoJustificacion;
window.seleccionarEmpleadoJustificacion = seleccionarEmpleadoJustificacion;

