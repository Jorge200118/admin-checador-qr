/**
 * Configuración de Supabase para Admin Panel
 * Cliente directo sin backend intermedio
 */

const SUPABASE_CONFIG = {
    url: 'https://uqncsqstpcynjxnjhrqu.supabase.co',
    anonKey: 'sb_publishable_bY6BY3wa5Xm2JCG2fy4F3g_fFgS5OsA'
};

// Cliente de Supabase (se inicializa cuando se carga la librería)
let supabaseClient = null;

// Inicializar cliente de Supabase
function initSupabase() {
    if (typeof supabase === 'undefined') {
        console.error('❌ Librería de Supabase no cargada');
        return false;
    }

    supabaseClient = supabase.createClient(
        SUPABASE_CONFIG.url,
        SUPABASE_CONFIG.anonKey
    );

    console.log('✅ Cliente de Supabase inicializado');
    return true;
}

// Auto-inicializar cuando se carga el script
if (typeof supabase !== 'undefined') {
    initSupabase();
}

// API Helper para Admin Panel
const SupabaseAPI = {
    // ==========================================
    // DASHBOARD
    // ==========================================
    async getDashboardEstadisticas() {
        try {
            const hoy = new Date();
            const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
            const finHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59);

            // Contar empleados presentes (con entrada hoy sin salida)
            const { count: presentes } = await supabaseClient
                .from('registros')
                .select('empleado_id', { count: 'exact', head: true })
                .eq('tipo_registro', 'ENTRADA')
                .gte('fecha_hora', inicioHoy.toISOString())
                .lte('fecha_hora', finHoy.toISOString());

            // Contar total de registros hoy
            const { count: registrosHoy } = await supabaseClient
                .from('registros')
                .select('*', { count: 'exact', head: true })
                .gte('fecha_hora', inicioHoy.toISOString())
                .lte('fecha_hora', finHoy.toISOString());

            // Contar llegadas tarde (usando bloques de horario)
            const { data: registrosConBloque } = await supabaseClient
                .from('registros')
                .select(`
                    id,
                    fecha_hora,
                    bloque_horario:bloques_horario(
                        hora_entrada,
                        tolerancia_entrada_min
                    )
                `)
                .eq('tipo_registro', 'ENTRADA')
                .gte('fecha_hora', inicioHoy.toISOString())
                .lte('fecha_hora', finHoy.toISOString())
                .not('bloque_horario_id', 'is', null);

            let llegadasTarde = 0;
            if (registrosConBloque) {
                llegadasTarde = registrosConBloque.filter(reg => {
                    if (!reg.bloque_horario) return false;
                    const horaEntrada = new Date(`1970-01-01T${reg.bloque_horario.hora_entrada}`);
                    const tolerancia = reg.bloque_horario.tolerancia_entrada_min || 15;
                    horaEntrada.setMinutes(horaEntrada.getMinutes() + tolerancia);
                    const horaRegistro = new Date(`1970-01-01T${new Date(reg.fecha_hora).toISOString().substring(11, 19)}`);
                    return horaRegistro > horaEntrada;
                }).length;
            }

            // Tablets activas (contar tablets únicas en registros de hoy)
            const { data: tablets } = await supabaseClient
                .from('registros')
                .select('tablet_id')
                .gte('fecha_hora', inicioHoy.toISOString())
                .lte('fecha_hora', finHoy.toISOString());

            const tabletsActivas = tablets ? new Set(tablets.map(t => t.tablet_id)).size : 0;

            return {
                success: true,
                data: {
                    empleadosPresentes: presentes || 0,
                    registrosHoy: registrosHoy || 0,
                    llegadasTarde: llegadasTarde,
                    tabletsActivas: tabletsActivas
                }
            };

        } catch (error) {
            console.error('Error obteniendo estadísticas:', error);
            return { success: false, message: 'Error al obtener estadísticas' };
        }
    },

    async getEmpleadosPresentes() {
        try {
            const hoy = new Date();
            const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

            const { data, error } = await supabaseClient
                .from('registros')
                .select(`
                    id,
                    fecha_hora,
                    empleado:empleados(
                        id,
                        codigo_empleado,
                        nombre,
                        apellido
                    )
                `)
                .eq('tipo_registro', 'ENTRADA')
                .gte('fecha_hora', inicioHoy.toISOString())
                .order('fecha_hora', { ascending: false });

            if (error) throw error;

            // Transformar datos para que coincidan con el formato esperado
            const transformedData = (data || []).map(registro => ({
                id: registro.empleado?.id,
                codigo_empleado: registro.empleado?.codigo_empleado,
                nombre_completo: `${registro.empleado?.nombre || ''} ${registro.empleado?.apellido || ''}`.trim(),
                foto_perfil: registro.empleado?.foto_perfil || null,
                hora_entrada: registro.fecha_hora,
                estado: 'PRESENTE'
            }));

            return {
                success: true,
                data: transformedData
            };

        } catch (error) {
            console.error('Error obteniendo empleados presentes:', error);
            return { success: false, message: 'Error al obtener empleados presentes' };
        }
    },

    async getRegistrosRecientes(limit = 10) {
        try {
            const { data, error } = await supabaseClient
                .from('registros')
                .select(`
                    id,
                    fecha_hora,
                    tipo_registro,
                    tablet_id,
                    empleado:empleados(
                        codigo_empleado,
                        nombre,
                        apellido
                    )
                `)
                .order('fecha_hora', { ascending: false })
                .limit(limit);

            if (error) throw error;

            // Transformar datos para que coincidan con el formato esperado
            const transformedData = (data || []).map(registro => ({
                id: registro.id,
                fecha_hora: registro.fecha_hora,
                tipo_registro: registro.tipo_registro,
                tablet_id: registro.tablet_id,
                codigo_empleado: registro.empleado?.codigo_empleado,
                nombre_completo: `${registro.empleado?.nombre || ''} ${registro.empleado?.apellido || ''}`.trim(),
                empleado_nombre: `${registro.empleado?.nombre || ''} ${registro.empleado?.apellido || ''}`.trim()
            }));

            return {
                success: true,
                data: transformedData
            };

        } catch (error) {
            console.error('Error obteniendo registros recientes:', error);
            return { success: false, message: 'Error al obtener registros recientes' };
        }
    },

    // ==========================================
    // EMPLEADOS
    // ==========================================
    async getEmpleados() {
        try {
            const { data, error } = await supabaseClient
                .from('empleados')
                .select(`
                    *,
                    horario:horarios(
                        id,
                        nombre
                    )
                `)
                .order('codigo_empleado');

            if (error) throw error;

            return {
                success: true,
                data: data || []
            };

        } catch (error) {
            console.error('Error obteniendo empleados:', error);
            return { success: false, message: 'Error al obtener empleados' };
        }
    },

    async getEmpleadoById(empleadoId) {
        try {
            const { data, error } = await supabaseClient
                .from('empleados')
                .select(`
                    *,
                    horario:horarios(
                        id,
                        nombre
                    ),
                    configuracion_qr(
                        qr_entrada,
                        qr_salida,
                        activo
                    )
                `)
                .eq('id', empleadoId)
                .single();

            if (error) throw error;

            return {
                success: true,
                data: data
            };

        } catch (error) {
            console.error('Error obteniendo empleado:', error);
            return { success: false, message: 'Error al obtener empleado' };
        }
    },

    async createEmpleado(empleadoData) {
        try {
            const { data, error } = await supabaseClient
                .from('empleados')
                .insert({
                    codigo_empleado: empleadoData.codigo_empleado,
                    nombre: empleadoData.nombre,
                    apellido: empleadoData.apellido,
                    email: empleadoData.email || null,
                    telefono: empleadoData.telefono || null,
                    horario_id: empleadoData.horario_id || null,
                    foto_perfil: empleadoData.foto_perfil || null,
                    activo: true,
                    trabaja_domingo: empleadoData.trabaja_domingo || false
                })
                .select()
                .single();

            if (error) throw error;

            // Crear configuración QR automáticamente
            await supabaseClient
                .from('configuracion_qr')
                .insert({
                    empleado_id: data.id,
                    qr_entrada: `QR_${empleadoData.codigo_empleado}_ENTRADA_2025`,
                    qr_salida: `QR_${empleadoData.codigo_empleado}_SALIDA_2025`,
                    activo: true
                });

            return {
                success: true,
                data: data
            };

        } catch (error) {
            console.error('Error creando empleado:', error);
            return { success: false, message: error.message || 'Error al crear empleado' };
        }
    },

    async updateEmpleado(empleadoId, empleadoData) {
        try {
            const { data, error } = await supabaseClient
                .from('empleados')
                .update({
                    codigo_empleado: empleadoData.codigo_empleado,
                    nombre: empleadoData.nombre,
                    apellido: empleadoData.apellido,
                    email: empleadoData.email || null,
                    telefono: empleadoData.telefono || null,
                    horario_id: empleadoData.horario_id || null,
                    foto_perfil: empleadoData.foto_perfil || null,
                    activo: empleadoData.activo !== undefined ? empleadoData.activo : true,
                    trabaja_domingo: empleadoData.trabaja_domingo || false
                })
                .eq('id', empleadoId)
                .select()
                .single();

            if (error) throw error;

            return {
                success: true,
                data: data
            };

        } catch (error) {
            console.error('Error actualizando empleado:', error);
            return { success: false, message: 'Error al actualizar empleado' };
        }
    },

    async deleteEmpleado(empleadoId) {
        try {
            const { error } = await supabaseClient
                .from('empleados')
                .delete()
                .eq('id', empleadoId);

            if (error) throw error;

            return { success: true };

        } catch (error) {
            console.error('Error eliminando empleado:', error);
            return { success: false, message: 'Error al eliminar empleado' };
        }
    },

    async toggleEmpleadoActivo(empleadoId, activo) {
        try {
            const { data, error } = await supabaseClient
                .from('empleados')
                .update({ activo: activo })
                .eq('id', empleadoId)
                .select()
                .single();

            if (error) throw error;

            return {
                success: true,
                data: data
            };

        } catch (error) {
            console.error('Error cambiando estado de empleado:', error);
            return { success: false, message: 'Error al cambiar estado' };
        }
    },

    // ==========================================
    // HORARIOS
    // ==========================================
    async getHorarios() {
        try {
            const { data, error } = await supabaseClient
                .from('horarios')
                .select(`
                    *,
                    bloques:bloques_horario(
                        id,
                        orden_bloque,
                        hora_entrada,
                        hora_salida,
                        tolerancia_entrada_min,
                        tolerancia_salida_min
                    )
                `)
                .order('nombre');

            if (error) throw error;

            return {
                success: true,
                data: data || []
            };

        } catch (error) {
            console.error('Error obteniendo horarios:', error);
            return { success: false, message: 'Error al obtener horarios' };
        }
    },

    async createHorario(horarioData) {
        try {
            const { data, error } = await supabaseClient
                .from('horarios')
                .insert({
                    nombre: horarioData.nombre,
                    descripcion: horarioData.descripcion || null,
                    activo: true
                })
                .select()
                .single();

            if (error) throw error;

            // Crear bloques si vienen
            if (horarioData.bloques && horarioData.bloques.length > 0) {
                const bloquesInsert = horarioData.bloques.map((bloque, index) => ({
                    horario_id: data.id,
                    orden_bloque: index + 1,
                    hora_entrada: bloque.hora_entrada,
                    hora_salida: bloque.hora_salida,
                    tolerancia_entrada_min: bloque.tolerancia_entrada_min || 15,
                    tolerancia_salida_min: bloque.tolerancia_salida_min || 15
                }));

                await supabaseClient
                    .from('bloques_horario')
                    .insert(bloquesInsert);
            }

            return {
                success: true,
                data: data
            };

        } catch (error) {
            console.error('Error creando horario:', error);
            return { success: false, message: 'Error al crear horario' };
        }
    },

    async toggleHorarioActivo(horarioId, activo) {
        try {
            const { data, error } = await supabaseClient
                .from('horarios')
                .update({ activo: activo })
                .eq('id', horarioId)
                .select()
                .single();

            if (error) throw error;

            return {
                success: true,
                data: data
            };

        } catch (error) {
            console.error('Error cambiando estado de horario:', error);
            return { success: false, message: 'Error al cambiar estado' };
        }
    },

    async deleteHorario(horarioId) {
        try {
            // Primero eliminar bloques
            await supabaseClient
                .from('bloques_horario')
                .delete()
                .eq('horario_id', horarioId);

            // Luego eliminar horario
            const { error } = await supabaseClient
                .from('horarios')
                .delete()
                .eq('id', horarioId);

            if (error) throw error;

            return { success: true };

        } catch (error) {
            console.error('Error eliminando horario:', error);
            return { success: false, message: 'Error al eliminar horario' };
        }
    },

    async getEmpleadosByHorario(horarioId) {
        try {
            const { data, error } = await supabaseClient
                .from('empleados')
                .select('*')
                .eq('horario_id', horarioId)
                .order('codigo_empleado');

            if (error) throw error;

            return {
                success: true,
                data: data || []
            };

        } catch (error) {
            console.error('Error obteniendo empleados del horario:', error);
            return { success: false, message: 'Error al obtener empleados' };
        }
    },

    // ==========================================
    // REGISTROS
    // ==========================================
    async getRegistrosToday(limit = 50) {
        try {
            const hoy = new Date();
            const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
            const finHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59);

            const { data, error } = await supabaseClient
                .from('registros')
                .select(`
                    *,
                    empleado:empleados(
                        codigo_empleado,
                        nombre,
                        apellido
                    ),
                    bloque_horario:bloques_horario(
                        hora_entrada,
                        hora_salida
                    )
                `)
                .gte('fecha_hora', inicioHoy.toISOString())
                .lte('fecha_hora', finHoy.toISOString())
                .order('fecha_hora', { ascending: false })
                .limit(limit);

            if (error) throw error;

            // Transformar datos para que coincidan con el formato esperado
            const transformedData = (data || []).map(registro => ({
                ...registro,
                empleado_id: registro.empleado_id,
                empleado_nombre: `${registro.empleado?.nombre || ''} ${registro.empleado?.apellido || ''}`.trim(),
                empleado_codigo: registro.empleado?.codigo_empleado,
                foto_registro: registro.foto_registro
            }));

            return {
                success: true,
                data: transformedData
            };

        } catch (error) {
            console.error('Error obteniendo registros de hoy:', error);
            return { success: false, message: 'Error al obtener registros' };
        }
    },

    async getRegistrosByFecha(fechaInicio, fechaFin, filtros = {}) {
        try {
            let query = supabaseClient
                .from('registros')
                .select(`
                    *,
                    empleado:empleados(
                        codigo_empleado,
                        nombre,
                        apellido,
                        sucursal,
                        puesto
                    ),
                    bloque_horario:bloques_horario(
                        hora_entrada,
                        hora_salida
                    )
                `);

            // Aplicar filtro de fechas (sin convertir a UTC para evitar problemas de timezone)
            if (fechaInicio) {
                const inicioStr = `${fechaInicio} 00:00:00`;
                query = query.gte('fecha_hora', inicioStr);
            }

            if (fechaFin) {
                const finStr = `${fechaFin} 23:59:59`;
                query = query.lte('fecha_hora', finStr);
            }

            // Aplicar filtro de empleado
            if (filtros.empleadoId) {
                query = query.eq('empleado_id', filtros.empleadoId);
            }

            // Aplicar filtro de tipo
            if (filtros.tipo) {
                query = query.eq('tipo_registro', filtros.tipo);
            }

            query = query.order('fecha_hora', { ascending: false });

            const { data, error } = await query;

            if (error) throw error;

            // Transformar datos
            let transformedData = (data || []).map(registro => ({
                ...registro,
                empleado_id: registro.empleado_id,
                empleado_nombre: `${registro.empleado?.nombre || ''} ${registro.empleado?.apellido || ''}`.trim(),
                empleado_codigo: registro.empleado?.codigo_empleado,
                sucursal: registro.empleado?.sucursal,
                puesto: registro.empleado?.puesto,
                foto_registro: registro.foto_registro
            }));

            // Aplicar filtros adicionales en el cliente (sucursal, puesto)
            if (filtros.sucursal) {
                transformedData = transformedData.filter(r => r.sucursal === filtros.sucursal);
            }

            if (filtros.puesto) {
                transformedData = transformedData.filter(r => r.puesto === filtros.puesto);
            }

            return {
                success: true,
                data: transformedData,
                registros: transformedData
            };

        } catch (error) {
            console.error('Error obteniendo registros por fecha:', error);
            return { success: false, message: 'Error al obtener registros' };
        }
    },

    // ==========================================
    // STORAGE - FOTOS
    // ==========================================
    async uploadFotoPerfil(empleadoId, base64Data) {
        try {
            // Convertir base64 a blob
            const base64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
            const byteCharacters = atob(base64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'image/jpeg' });

            // Nombre del archivo
            const filename = `perfil_${empleadoId}.jpg`;

            // Subir a Storage
            const { data, error } = await supabaseClient.storage
                .from('empleados-fotos')
                .upload(filename, blob, {
                    contentType: 'image/jpeg',
                    upsert: true
                });

            if (error) throw error;

            // Obtener URL pública
            const { data: urlData } = supabaseClient.storage
                .from('empleados-fotos')
                .getPublicUrl(filename);

            return {
                success: true,
                url: urlData.publicUrl
            };

        } catch (error) {
            console.error('Error subiendo foto de perfil:', error);
            return { success: false, message: 'Error al subir foto' };
        }
    },

    async getFotosRegistro(empleadoId, fecha) {
        try {
            // Convertir fecha a rango del día
            const fechaObj = new Date(fecha);
            const inicioHoy = new Date(fechaObj.getFullYear(), fechaObj.getMonth(), fechaObj.getDate());
            const finHoy = new Date(fechaObj.getFullYear(), fechaObj.getMonth(), fechaObj.getDate(), 23, 59, 59);

            const { data, error } = await supabaseClient
                .from('registros')
                .select(`
                    id,
                    fecha_hora,
                    tipo_registro,
                    foto_registro,
                    empleado:empleados(
                        codigo_empleado,
                        nombre,
                        apellido
                    )
                `)
                .eq('empleado_id', empleadoId)
                .gte('fecha_hora', inicioHoy.toISOString())
                .lte('fecha_hora', finHoy.toISOString())
                .not('foto_registro', 'is', null)
                .order('fecha_hora', { ascending: false });

            if (error) throw error;

            // Transformar datos
            const transformedData = (data || []).map(registro => ({
                id: registro.id,
                fecha_hora: registro.fecha_hora,
                tipo_registro: registro.tipo_registro,
                foto_url: registro.foto_registro,
                empleado: {
                    codigo_empleado: registro.empleado?.codigo_empleado,
                    nombre_completo: `${registro.empleado?.nombre || ''} ${registro.empleado?.apellido || ''}`.trim()
                }
            }));

            return {
                success: true,
                data: transformedData,
                empleado: transformedData.length > 0 ? transformedData[0].empleado : null
            };

        } catch (error) {
            console.error('Error obteniendo fotos de registro:', error);
            return { success: false, message: 'Error al obtener fotos', data: [] };
        }
    }
};
