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
        return false;
    }

    supabaseClient = supabase.createClient(
        SUPABASE_CONFIG.url,
        SUPABASE_CONFIG.anonKey
    );

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
    async getDashboardEstadisticas(sucursal = null) {
        try {
            const hoy = new Date();
            const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
            const finHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59);

            // Contar empleados presentes (con entrada hoy sin salida)
            let queryPresentes = supabaseClient
                .from('registros')
                .select('empleado_id, empleado:empleados!inner(sucursal)', { count: 'exact', head: true })
                .eq('tipo_registro', 'ENTRADA')
                .gte('fecha_hora', inicioHoy.toISOString())
                .lte('fecha_hora', finHoy.toISOString());

            if (sucursal) {
                queryPresentes = queryPresentes.eq('empleado.sucursal', sucursal);
            }

            const { count: presentes } = await queryPresentes;

            // Contar total de registros hoy
            let queryRegistros = supabaseClient
                .from('registros')
                .select('*, empleado:empleados!inner(sucursal)', { count: 'exact', head: true })
                .gte('fecha_hora', inicioHoy.toISOString())
                .lte('fecha_hora', finHoy.toISOString());

            if (sucursal) {
                queryRegistros = queryRegistros.eq('empleado.sucursal', sucursal);
            }

            const { count: registrosHoy } = await queryRegistros;

            // Contar llegadas tarde (usando bloques de horario)
            let queryTarde = supabaseClient
                .from('registros')
                .select(`
                    id,
                    fecha_hora,
                    empleado:empleados!inner(sucursal),
                    bloque_horario:bloques_horario(
                        hora_entrada,
                        tolerancia_entrada_min
                    )
                `)
                .eq('tipo_registro', 'ENTRADA')
                .gte('fecha_hora', inicioHoy.toISOString())
                .lte('fecha_hora', finHoy.toISOString())
                .not('bloque_horario_id', 'is', null);

            if (sucursal) {
                queryTarde = queryTarde.eq('empleado.sucursal', sucursal);
            }

            const { data: registrosConBloque } = await queryTarde;

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
            let queryTablets = supabaseClient
                .from('registros')
                .select('tablet_id, empleado:empleados!inner(sucursal)')
                .gte('fecha_hora', inicioHoy.toISOString())
                .lte('fecha_hora', finHoy.toISOString());

            if (sucursal) {
                queryTablets = queryTablets.eq('empleado.sucursal', sucursal);
            }

            const { data: tablets } = await queryTablets;

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
            return { success: false, message: 'Error al obtener estadísticas' };
        }
    },

    async getEmpleadosPresentes(sucursal = null) {
        try {
            const hoy = new Date();
            const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

            let query = supabaseClient
                .from('registros')
                .select(`
                    id,
                    fecha_hora,
                    empleado:empleados!inner(
                        id,
                        codigo_empleado,
                        nombre,
                        apellido,
                        sucursal
                    )
                `)
                .eq('tipo_registro', 'ENTRADA')
                .gte('fecha_hora', inicioHoy.toISOString());

            if (sucursal) {
                query = query.eq('empleado.sucursal', sucursal);
            }

            query = query.order('fecha_hora', { ascending: false });

            const { data, error } = await query;

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
            return { success: false, message: 'Error al obtener empleados presentes' };
        }
    },

    async getRegistrosRecientes(limit = 10, sucursal = null) {
        try {
            let query = supabaseClient
                .from('registros')
                .select(`
                    id,
                    fecha_hora,
                    tipo_registro,
                    tablet_id,
                    empleado:empleados!inner(
                        codigo_empleado,
                        nombre,
                        apellido,
                        sucursal
                    )
                `);

            if (sucursal) {
                query = query.eq('empleado.sucursal', sucursal);
            }

            query = query.order('fecha_hora', { ascending: false }).limit(limit);

            const { data, error } = await query;

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
            return { success: false, message: 'Error al obtener registros recientes' };
        }
    },

    // ==========================================
    // EMPLEADOS
    // ==========================================
    async getEmpleados(sucursal = null) {
        try {
            let query = supabaseClient
                .from('empleados')
                .select(`
                    *,
                    horario:horarios(
                        id,
                        nombre
                    )
                `);

            // Filtrar por sucursal si se proporciona
            if (sucursal) {
                query = query.eq('sucursal', sucursal);
            }

            query = query.order('codigo_empleado');

            const { data, error } = await query;

            if (error) throw error;

            return {
                success: true,
                data: data || []
            };

        } catch (error) {
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
            return { success: false, message: 'Error al obtener empleado' };
        }
    },

    async createEmpleado(empleadoData, fotoBase64 = null) {
        try {
            // Subir foto si existe
            let fotoUrl = null;
            if (fotoBase64) {
                fotoUrl = await this.uploadFotoEmpleado(empleadoData.codigo_empleado, fotoBase64);
            }

            const { data, error } = await supabaseClient
                .from('empleados')
                .insert({
                    codigo_empleado: empleadoData.codigo_empleado,
                    nombre: empleadoData.nombre,
                    apellido: empleadoData.apellido,
                    horario_id: empleadoData.horario_id || null,
                    sucursal: empleadoData.sucursal || null,
                    puesto: empleadoData.puesto || null,
                    foto_perfil: fotoUrl,
                    activo: empleadoData.activo !== undefined ? empleadoData.activo : true,
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
            return { success: false, message: error.message || 'Error al crear empleado' };
        }
    },

    async updateEmpleado(empleadoId, empleadoData, fotoBase64 = null) {
        try {
            // Subir foto si existe
            let fotoUrl = empleadoData.foto_perfil;
            if (fotoBase64) {
                fotoUrl = await this.uploadFotoEmpleado(empleadoData.codigo_empleado, fotoBase64);
            }

            const { data, error } = await supabaseClient
                .from('empleados')
                .update({
                    codigo_empleado: empleadoData.codigo_empleado,
                    nombre: empleadoData.nombre,
                    apellido: empleadoData.apellido,
                    horario_id: empleadoData.horario_id || null,
                    sucursal: empleadoData.sucursal || null,
                    puesto: empleadoData.puesto || null,
                    foto_perfil: fotoUrl,
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
            return { success: false, message: error.message || 'Error al actualizar empleado' };
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
            return { success: false, message: 'Error al cambiar estado' };
        }
    },

    async getQRConfigByEmpleado(empleadoId) {
        try {
            const { data, error } = await supabaseClient
                .from('configuracion_qr')
                .select('*')
                .eq('empleado_id', empleadoId)
                .single();

            if (error) throw error;

            return {
                success: true,
                data: data
            };

        } catch (error) {
            return { success: false, message: 'Error al obtener configuración QR' };
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
                        descripcion,
                        hora_entrada,
                        hora_salida,
                        tolerancia_entrada_min,
                        tolerancia_salida_min
                    )
                `)
                .order('nombre');

            if (error) throw error;

            // Obtener conteo de empleados por horario
            const horariosConConteo = await Promise.all((data || []).map(async (horario) => {
                const { count } = await supabaseClient
                    .from('empleados')
                    .select('*', { count: 'exact', head: true })
                    .eq('horario_id', horario.id)
                    .eq('activo', true);

                return {
                    ...horario,
                    empleados_count: count || 0
                };
            }));

            return {
                success: true,
                data: horariosConConteo
            };

        } catch (error) {
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
            return { success: false, message: 'Error al obtener empleados' };
        }
    },

    // ==========================================
    // REGISTROS
    // ==========================================
    async getRegistrosToday(limit = 50, sucursal = null) {
        try {
            const hoy = new Date();
            const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
            const finHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59);

            let query = supabaseClient
                .from('registros')
                .select(`
                    *,
                    empleado:empleados!inner(
                        codigo_empleado,
                        nombre,
                        apellido,
                        sucursal
                    ),
                    bloque_horario:bloques_horario(
                        hora_entrada,
                        hora_salida
                    )
                `)
                .gte('fecha_hora', inicioHoy.toISOString())
                .lte('fecha_hora', finHoy.toISOString());

            if (sucursal) {
                query = query.eq('empleado.sucursal', sucursal);
            }

            query = query.order('fecha_hora', { ascending: false }).limit(limit);

            const { data, error } = await query;

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
            return { success: false, message: 'Error al obtener registros' };
        }
    },

    async getRegistrosByFecha(fechaInicio, fechaFin, filtros = {}) {
        try {
            // Determinar si necesitamos usar !inner basado en si hay filtros de empleado/sucursal
            const needsInner = filtros.sucursalUsuario || filtros.empleadoId;

            // Paginación: traer todos los registros en lotes de 1000
            let allData = [];
            let from = 0;
            const pageSize = 1000;
            let hasMore = true;

            while (hasMore) {
                let query = supabaseClient
                    .from('registros')
                    .select(`
                        *,
                        empleado:empleados${needsInner ? '!inner' : ''}(
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

                // Aplicar filtro de sucursal del usuario (si viene en filtros)
                if (filtros.sucursalUsuario) {
                    query = query.eq('empleado.sucursal', filtros.sucursalUsuario);
                }

                // Aplicar filtro de empleado
                if (filtros.empleadoId) {
                    query = query.eq('empleado_id', filtros.empleadoId);
                }

                // Aplicar filtro de tipo
                if (filtros.tipo) {
                    query = query.eq('tipo_registro', filtros.tipo);
                }

                // Ordenar y paginar
                query = query.order('fecha_hora', { ascending: false })
                             .range(from, from + pageSize - 1);

                const { data, error } = await query;

                if (error) throw error;

                if (!data || data.length === 0) {
                    hasMore = false;
                } else {
                    allData = allData.concat(data);
                    if (data.length < pageSize) {
                        hasMore = false;
                    } else {
                        from += pageSize;
                    }
                }
            }

            // Transformar datos
            let transformedData = allData.map(registro => ({
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

            console.log(`📥 getRegistrosByFecha: ${transformedData.length} registros cargados en ${Math.ceil(allData.length / pageSize)} páginas`);

            return {
                success: true,
                data: transformedData,
                registros: transformedData
            };

        } catch (error) {
            console.error('Error en getRegistrosByFecha:', error);
            return { success: false, message: 'Error al obtener registros' };
        }
    },

    // ==========================================
    // STORAGE - FOTOS
    // ==========================================
    async uploadFotoEmpleado(codigoEmpleado, base64Data) {
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

            // Nombre del archivo usando código de empleado
            const filename = `emp_${codigoEmpleado}_${Date.now()}.jpg`;

            // Subir a Storage
            const { data, error } = await supabaseClient.storage
                .from('empleados-fotos')
                .upload(filename, blob, {
                    contentType: 'image/jpeg',
                    upsert: true
                });

            if (error) throw error;

            // Retornar solo el nombre del archivo (no la URL completa)
            return filename;

        } catch (error) {
            return null;
        }
    },

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
            return { success: false, message: 'Error al subir foto' };
        }
    },

    async getFotosRegistro(empleadoId, fecha) {
        try {
            // Convertir fecha a rango del día (append T00:00:00 to parse as local, not UTC)
            const fechaObj = new Date(fecha + 'T00:00:00');
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
                .order('fecha_hora', { ascending: true });

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
            return { success: false, message: 'Error al obtener fotos', data: [] };
        }
    },

    // ==========================================
    // USUARIOS Y LOGIN POR SUCURSAL
    // ==========================================

    /**
     * Login de usuario por sucursal
     * @param {string} username - Nombre de usuario
     * @param {string} password - Contraseña (se valida con bcrypt en servidor)
     * @param {string} sucursal - Sucursal del usuario
     * @returns {Object} - Resultado del login
     */
    async loginUsuarioSucursal(username, password, sucursal) {
        try {
            // Buscar usuario por username y sucursal
            const { data: usuario, error } = await supabaseClient
                .from('usuarios_sucursal')
                .select('*')
                .eq('username', username)
                .eq('sucursal', sucursal)
                .eq('activo', true)
                .single();

            if (error || !usuario) {
                return {
                    success: false,
                    message: 'Usuario no encontrado o inactivo'
                };
            }

            // NOTA: En producción, la validación de contraseña debe hacerse en el servidor
            // Por ahora, para desarrollo, verificamos directamente
            // En un entorno real, deberías usar Supabase Functions o un backend

            // Comparar contraseña (simulación - en producción usar bcrypt en servidor)
            // Por ahora aceptamos cualquier contraseña para desarrollo
            const passwordMatch = true; // TODO: Implementar validación real con bcrypt

            if (!passwordMatch) {
                return {
                    success: false,
                    message: 'Contraseña incorrecta'
                };
            }

            return {
                success: true,
                user: {
                    id: usuario.id,
                    username: usuario.username,
                    nombre_completo: usuario.nombre_completo,
                    sucursal: usuario.sucursal,
                    rol: usuario.rol,
                    empleado_id: usuario.empleado_id
                },
                message: 'Login exitoso'
            };

        } catch (error) {
            return {
                success: false,
                message: 'Error al procesar el login'
            };
        }
    },

    /**
     * Actualizar último acceso del usuario
     * @param {number} usuarioId - ID del usuario
     */
    async updateUltimoAcceso(usuarioId) {
        try {
            const { error } = await supabaseClient
                .from('usuarios_sucursal')
                .update({ ultimo_acceso: new Date().toISOString() })
                .eq('id', usuarioId);

            if (error) throw error;
            return { success: true };

        } catch (error) {
            return { success: false };
        }
    },

    /**
     * Obtener todos los usuarios
     * @param {string} sucursal - Filtrar por sucursal (opcional)
     * @returns {Array} - Lista de usuarios
     */
    async getUsuariosSucursal(sucursal = null) {
        try {
            let query = supabaseClient
                .from('usuarios_sucursal')
                .select(`
                    *,
                    empleado:empleados(
                        id,
                        codigo_empleado,
                        nombre,
                        apellido,
                        puesto
                    )
                `)
                .order('created_at', { ascending: false });

            if (sucursal) {
                query = query.eq('sucursal', sucursal);
            }

            const { data, error } = await query;

            if (error) throw error;
            return { success: true, data: data || [] };

        } catch (error) {
            return { success: false, data: [] };
        }
    },

    /**
     * Crear nuevo usuario
     * @param {Object} usuarioData - Datos del usuario
     * @returns {Object} - Usuario creado
     */
    async createUsuarioSucursal(usuarioData) {
        try {
            // NOTA: En producción, el hash de contraseña debe hacerse en el servidor
            // Por ahora guardamos un hash simulado
            const { data, error } = await supabaseClient
                .from('usuarios_sucursal')
                .insert([{
                    username: usuarioData.username,
                    password_hash: '$2b$10$simulated_hash', // TODO: Implementar hash real
                    nombre_completo: usuarioData.nombre_completo,
                    sucursal: usuarioData.sucursal,
                    rol: usuarioData.rol || 'usuario',
                    empleado_id: usuarioData.empleado_id || null,
                    activo: usuarioData.activo !== undefined ? usuarioData.activo : true
                }])
                .select()
                .single();

            if (error) throw error;
            return { success: true, data };

        } catch (error) {
            return {
                success: false,
                message: error.message || 'Error al crear usuario'
            };
        }
    },

    /**
     * Actualizar usuario
     * @param {number} usuarioId - ID del usuario
     * @param {Object} usuarioData - Datos a actualizar
     * @returns {Object} - Usuario actualizado
     */
    async updateUsuarioSucursal(usuarioId, usuarioData) {
        try {
            const updateData = {
                nombre_completo: usuarioData.nombre_completo,
                sucursal: usuarioData.sucursal,
                rol: usuarioData.rol,
                empleado_id: usuarioData.empleado_id,
                activo: usuarioData.activo
            };

            // Si se proporciona nueva contraseña, actualizarla
            if (usuarioData.password) {
                updateData.password_hash = '$2b$10$simulated_hash'; // TODO: Hash real
            }

            const { data, error } = await supabaseClient
                .from('usuarios_sucursal')
                .update(updateData)
                .eq('id', usuarioId)
                .select()
                .single();

            if (error) throw error;
            return { success: true, data };

        } catch (error) {
            return { success: false, message: 'Error al actualizar usuario' };
        }
    },

    /**
     * Eliminar usuario
     * @param {number} usuarioId - ID del usuario
     * @returns {Object} - Resultado de la operación
     */
    async deleteUsuarioSucursal(usuarioId) {
        try {
            const { error } = await supabaseClient
                .from('usuarios_sucursal')
                .delete()
                .eq('id', usuarioId);

            if (error) throw error;
            return { success: true };

        } catch (error) {
            return { success: false, message: 'Error al eliminar usuario' };
        }
    },

    /**
     * Cambiar estado activo/inactivo de usuario
     * @param {number} usuarioId - ID del usuario
     * @param {boolean} activo - Nuevo estado
     * @returns {Object} - Resultado de la operación
     */
    async toggleUsuarioActivo(usuarioId, activo) {
        try {
            const { error } = await supabaseClient
                .from('usuarios_sucursal')
                .update({ activo: activo })
                .eq('id', usuarioId);

            if (error) throw error;
            return { success: true };

        } catch (error) {
            return { success: false };
        }
    },

    // ==========================================
    // JUSTIFICACIONES
    // ==========================================

    async getJustificaciones(filtros = {}) {
        try {
            let query = supabaseClient
                .from('justificaciones')
                .select(`
                    *,
                    empleado:empleados!inner(
                        id,
                        codigo_empleado,
                        nombre,
                        apellido,
                        sucursal,
                        puesto
                    )
                `)
                .order('fecha_inicio', { ascending: false });

            if (filtros.sucursal) {
                query = query.eq('empleado.sucursal', filtros.sucursal);
            }
            if (filtros.tipo) {
                query = query.eq('tipo', filtros.tipo);
            }
            if (filtros.empleadoId) {
                query = query.eq('empleado_id', filtros.empleadoId);
            }
            if (filtros.fechaInicio) {
                query = query.gte('fecha_inicio', filtros.fechaInicio);
            }
            if (filtros.fechaFin) {
                query = query.lte('fecha_fin', filtros.fechaFin);
            }

            const { data, error } = await query;
            if (error) throw error;

            const transformedData = (data || []).map(j => ({
                ...j,
                empleado_nombre: `${j.empleado?.nombre || ''} ${j.empleado?.apellido || ''}`.trim(),
                empleado_codigo: j.empleado?.codigo_empleado,
                empleado_sucursal: j.empleado?.sucursal
            }));

            return { success: true, data: transformedData };
        } catch (error) {
            return { success: false, message: 'Error al obtener justificaciones' };
        }
    },

    async createJustificacion(justData) {
        try {
            const { data, error } = await supabaseClient
                .from('justificaciones')
                .insert({
                    empleado_id: justData.empleado_id,
                    tipo: justData.tipo,
                    fecha_inicio: justData.fecha_inicio,
                    fecha_fin: justData.fecha_fin,
                    motivo: justData.motivo || null,
                    created_by: justData.created_by || null
                })
                .select()
                .single();

            if (error) throw error;
            return { success: true, data: data };
        } catch (error) {
            return { success: false, message: error.message || 'Error al crear justificacion' };
        }
    },

    async updateJustificacion(justId, justData) {
        try {
            const { data, error } = await supabaseClient
                .from('justificaciones')
                .update({
                    empleado_id: justData.empleado_id,
                    tipo: justData.tipo,
                    fecha_inicio: justData.fecha_inicio,
                    fecha_fin: justData.fecha_fin,
                    motivo: justData.motivo || null
                })
                .eq('id', justId)
                .select()
                .single();

            if (error) throw error;
            return { success: true, data: data };
        } catch (error) {
            return { success: false, message: error.message || 'Error al actualizar justificacion' };
        }
    },

    async deleteJustificacion(justId) {
        try {
            const { error } = await supabaseClient
                .from('justificaciones')
                .delete()
                .eq('id', justId);

            if (error) throw error;
            return { success: true };
        } catch (error) {
            return { success: false, message: 'Error al eliminar justificacion' };
        }
    },

    async getJustificacionesPorRango(fechaInicio, fechaFin, sucursal = null) {
        try {
            let query = supabaseClient
                .from('justificaciones')
                .select(`
                    *,
                    empleado:empleados!inner(
                        id, nombre, apellido, sucursal
                    )
                `)
                .lte('fecha_inicio', fechaFin)
                .gte('fecha_fin', fechaInicio);

            if (sucursal) {
                query = query.eq('empleado.sucursal', sucursal);
            }

            const { data, error } = await query;
            if (error) throw error;
            return { success: true, data: data || [] };
        } catch (error) {
            return { success: false, data: [] };
        }
    },

    /**
     * Verificar si un username ya exist
     * @param {string} username - Username a verificar
     * @param {number} excludeId - ID a excluir (para edición)
     * @returns {boolean} - True si existe
     */
    async verificarUsernameExiste(username, excludeId = null) {
        try {
            let query = supabaseClient
                .from('usuarios_sucursal')
                .select('id', { count: 'exact', head: true })
                .eq('username', username);

            if (excludeId) {
                query = query.neq('id', excludeId);
            }

            const { count, error } = await query;

            if (error) throw error;
            return count > 0;

        } catch (error) {
            return false;
        }
    }
};
