// vacaciones-ui.js
// Render del bloque de vacaciones en el expediente y de la sección sidebar.
// Depende de vacaciones-lft.js y vacaciones-saldo.js.

// Paleta según el tema actual. Como los estilos son inline (ganan sobre var(--xxx)),
// leemos el tema con getCurrentTheme() al renderizar y elegimos colores aquí.
function _vacTema() {
    const dark = (typeof getCurrentTheme === 'function') && getCurrentTheme() === 'dark';
    return dark ? {
        surface: '#13263d',
        elevated: '#1e3a5f',
        appBg: '#0d1b2a',
        text: '#e8eef5',
        textSec: '#94a8c4',
        muted: '#7e94b0',
        border: '#2a4a73',
        borderSoft: '#1e3a5f'
    } : {
        surface: '#ffffff',
        elevated: '#f1f5f9',
        appBg: '#f8fafc',
        text: '#1e293b',
        textSec: '#475569',
        muted: '#94a3b8',
        border: '#e2e8f0',
        borderSoft: '#f1f5f9'
    };
}

function _vacFormatFechaCorta(yyyymmdd) {
    if (!yyyymmdd) return '—';
    const [y, m, d] = yyyymmdd.split('-');
    return `${d}/${m}/${y}`;
}

function _vacHoyYYYYMMDD() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Mapeo de estados LFT 2026 → etiqueta + colores para badges/tablas.
function _vacEstadoMeta(estado) {
    switch (estado) {
        case 'vigente':              return { label: 'Vigente',     bg: '#22c55e22', text: '#22c55e' };
        case 'por_vencer':           return { label: 'Por vencer',  bg: '#f59e0b22', text: '#f59e0b' };
        case 'vencidas_operativas':  return { label: 'Vencidas',    bg: '#ef444422', text: '#ef4444' };
        case 'prescritas':           return { label: 'Prescritas',  bg: '#6b728022', text: '#9ca3af' };
        case 'sin_saldo':            return { label: 'Sin saldo',   bg: '#64748b22', text: '#94a3b8' };
        default:                      return { label: '—',           bg: 'transparent', text: '#94a3b8' };
    }
}

function _vacEstadoBadge(estado) {
    const m = _vacEstadoMeta(estado);
    return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${m.bg};color:${m.text};font-size:11px;font-weight:600;letter-spacing:.02em;">${m.label}</span>`;
}

function renderBloqueVacacionesExpediente(empleado, vacaciones) {
    const _t = _vacTema();
    if (!empleado || !empleado.fecha_ingreso) {
        return `<div style="color:${_t.muted};font-size:12px;padding:9px 0;">Sin fecha de ingreso registrada</div>`;
    }
    const hoy = _vacHoyYYYYMMDD();
    const s = calcularSaldo(empleado, vacaciones, hoy);
    const hist = historialPeriodos(empleado, vacaciones, hoy, 5);

    if (s.añoServicio < 1) {
        return `
        <div style="padding:9px 0;color:${_t.muted};font-size:13px;">
            Aún sin derecho. Cumple 1 año el <strong style="color:${_t.text};">${_vacFormatFechaCorta(s.proximoAniversario)}</strong>.
        </div>`;
    }

    const colorRestantes = s.restantes === 0 ? '#ef4444' : (s.restantes <= 3 ? '#f59e0b' : '#22c55e');
    let avisoVence = '';
    if (s.estado === 'por_vencer') {
        avisoVence = `<div style="margin-top:8px;padding:8px 12px;background:#f59e0b22;border-left:3px solid #f59e0b;border-radius:4px;color:#fbbf24;font-size:12px;">
             <i class="fas fa-exclamation-triangle"></i> Vence en ${s.diasParaLimiteLFT} días — Art. 81 LFT: usar antes del ${_vacFormatFechaCorta(s.fechaLimiteLFT)}
           </div>`;
    } else if (s.estado === 'vencidas_operativas') {
        avisoVence = `<div style="margin-top:8px;padding:8px 12px;background:#ef444422;border-left:3px solid #ef4444;border-radius:4px;color:#fca5a5;font-size:12px;">
             <i class="fas fa-exclamation-circle"></i> Plazo Art. 81 LFT vencido hace ${Math.abs(s.diasParaLimiteLFT)} días. El patrón está incumpliendo el deber de otorgarlas.
           </div>`;
    }

    const filaBloque = (lbl, val, color) => `
        <div style="display:flex;padding:9px 0;border-bottom:1px solid ${_t.borderSoft};gap:12px;">
            <span style="color:${_t.textSec};font-size:12px;min-width:160px;">${lbl}</span>
            <span style="color:${color || _t.text};font-size:13px;">${val}</span>
        </div>`;

    const histFilas = hist.map(p => {
        const saldoActual = p.derecho - p.tomados;
        let colorSaldo;
        if (p.esActual) colorSaldo = saldoActual < 0 ? '#ef4444' : '#22c55e';
        else colorSaldo = p.perdidos > 0 ? '#ef4444' : _t.muted;
        const textoSaldo = p.esActual
            ? `${saldoActual} actual`
            : (p.perdidos > 0 ? `−${p.perdidos}` : '0');
        return `
        <tr>
            <td style="padding:6px 8px;color:${_t.textSec};font-size:12px;">Año ${p.añoServicio}</td>
            <td style="padding:6px 8px;color:${_t.textSec};font-size:12px;">${_vacFormatFechaCorta(p.inicio)} → ${_vacFormatFechaCorta(p.fin)}</td>
            <td style="padding:6px 8px;text-align:right;color:${_t.text};font-size:12px;">${p.derecho}</td>
            <td style="padding:6px 8px;text-align:right;color:#3b82f6;font-size:12px;">${p.tomados}</td>
            <td style="padding:6px 8px;text-align:right;color:${colorSaldo};font-size:12px;">${textoSaldo}</td>
        </tr>`;
    }).join('');

    return `
        ${filaBloque('Año de servicio', `Año ${s.añoServicio}`)}
        ${filaBloque('Periodo actual', `${_vacFormatFechaCorta(s.periodoInicio)} → ${_vacFormatFechaCorta(s.fechaLimite)}`)}
        ${filaBloque('Derecho LFT', `${s.derecho} días`)}
        ${filaBloque('Tomados', `${s.tomados} días`, '#3b82f6')}
        ${filaBloque('Restantes', `<strong>${s.restantes} días</strong>`, colorRestantes)}
        ${avisoVence}
        <details style="margin-top:12px;">
            <summary style="cursor:pointer;color:${_t.textSec};font-size:12px;padding:6px 0;">
                <i class="fas fa-history"></i> Ver historial (${hist.length} ${hist.length === 1 ? 'periodo' : 'periodos'})
            </summary>
            <table style="width:100%;margin-top:8px;border-collapse:collapse;">
                <thead>
                    <tr style="border-bottom:1px solid ${_t.border};">
                        <th style="padding:6px 8px;text-align:left;color:${_t.textSec};font-size:11px;font-weight:600;">Periodo</th>
                        <th style="padding:6px 8px;text-align:left;color:${_t.textSec};font-size:11px;font-weight:600;">Fechas</th>
                        <th style="padding:6px 8px;text-align:right;color:${_t.textSec};font-size:11px;font-weight:600;">Derecho</th>
                        <th style="padding:6px 8px;text-align:right;color:${_t.textSec};font-size:11px;font-weight:600;">Tomados</th>
                        <th style="padding:6px 8px;text-align:right;color:${_t.textSec};font-size:11px;font-weight:600;">Saldo</th>
                    </tr>
                </thead>
                <tbody>${histFilas}</tbody>
            </table>
        </details>`;
}

// =====================================================
// SECCIÓN VACACIONES (sidebar)
// =====================================================
window._vacState = { empleados: [], vacacionesPorEmp: new Map(), cargado: false };

async function _cargarDatosVacaciones() {
    if (typeof showLoading === 'function') showLoading('Cargando vacaciones...');
    try {
        const empRes = await SupabaseAPI.getEmpleados();
        if (!empRes.success) return { ok: false, error: empRes.message || 'No se pudo obtener empleados (Supabase)' };

        // Traer FechaIngreso + Sucursal desde la API externa (BMS) y cruzar por codigo
        const apiRes = await fetch(`${ADMIN_CONFIG.apiUrl}/empleados/lista-vacaciones`);
        if (!apiRes.ok) return { ok: false, error: 'No se pudo obtener empleados (API BMS)' };
        const apiJson = await apiRes.json();
        const datosPorCodigo = new Map();
        for (const e of (apiJson.data || [])) {
            const cod = String(e.Empleado || '').trim();
            if (cod && e.FechaIngreso) {
                datosPorCodigo.set(cod, {
                    fecha_ingreso: e.FechaIngreso.substring(0, 10),
                    sucursal: e.Sucursal || null
                });
            }
        }

        const empleados = empRes.data
            .filter(e => e.activo)
            .map(e => {
                const cod = String(e.codigo_empleado || '').trim();
                const datos = datosPorCodigo.get(cod);
                if (!datos) return null;
                return { ...e, fecha_ingreso: datos.fecha_ingreso, sucursal: datos.sucursal || e.sucursal };
            })
            .filter(Boolean);

        const hace3años = (() => {
            const d = new Date(); d.setFullYear(d.getFullYear() - 3);
            return `${d.getFullYear()}-01-01`;
        })();
        const vacRes = await SupabaseAPI.getTodasVacacionesDesde(hace3años);
        if (!vacRes.success) return { ok: false, error: vacRes.message || 'No se pudo obtener vacaciones' };
        const porEmp = new Map();
        for (const v of vacRes.data) {
            if (!porEmp.has(v.empleado_id)) porEmp.set(v.empleado_id, []);
            porEmp.get(v.empleado_id).push(v);
        }
        window._vacState = { empleados, vacacionesPorEmp: porEmp, cargado: true };
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e.message || 'Error inesperado' };
    } finally {
        if (typeof hideLoading === 'function') hideLoading();
    }
}

async function abrirSeccionVacaciones() {
    if (!window._vacState.cargado) {
        const r = await _cargarDatosVacaciones();
        if (!r.ok) {
            const cont = document.getElementById('vacSaldosTabla');
            if (cont) {
                cont.innerHTML = `
                    <div style="padding:40px;text-align:center;color:#ef4444;">
                        <i class="fas fa-exclamation-triangle" style="font-size:32px;"></i>
                        <p style="margin-top:12px;">No se pudo cargar la información de vacaciones.</p>
                        <p style="color:#94a3b8;font-size:12px;">${r.error}</p>
                        <button class="btn btn-sm btn-primary" style="margin-top:12px;" onclick="abrirSeccionVacaciones()">
                            <i class="fas fa-redo"></i> Reintentar
                        </button>
                    </div>`;
            }
            return;
        }
    }
    cambiarTabVacaciones('saldos');
}

function cambiarTabVacaciones(tab) {
    document.querySelectorAll('.vac-tab').forEach(b => b.classList.remove('vac-tab-active'));
    document.querySelector(`.vac-tab[data-vactab="${tab}"]`)?.classList.add('vac-tab-active');
    const map = { saldos: 'vacTabSaldos', porvencer: 'vacTabPorVencer', calendario: 'vacTabCalendario' };
    for (const [t, id] of Object.entries(map)) {
        const el = document.getElementById(id);
        if (el) el.style.display = (t === tab) ? 'block' : 'none';
    }
    if (tab === 'saldos') renderVacSaldos();
    if (tab === 'porvencer' && typeof renderVacPorVencer === 'function') renderVacPorVencer();
    if (tab === 'calendario' && typeof renderVacCalendario === 'function') renderVacCalendario();
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.vac-tab').forEach(b => {
        b.addEventListener('click', () => cambiarTabVacaciones(b.dataset.vactab));
    });
});

// key: nombre de columna a ordenar; dir: 'asc' | 'desc' | null (default por urgencia)
window._vacSaldosSort = { key: null, dir: null };

function _filasVacSaldos() {
    const { empleados, vacacionesPorEmp } = window._vacState;
    const filtSuc = document.getElementById('vacFiltSucursal')?.value || '';
    const soloConSaldo = document.getElementById('vacFiltConSaldo')?.checked;
    const soloPorVencer = document.getElementById('vacFiltPorVencer')?.checked;
    const buscar = (document.getElementById('vacFiltBuscar')?.value || '').trim().toLowerCase();
    const hoy = _vacHoyYYYYMMDD();
    const rows = [];
    for (const e of empleados) {
        if (filtSuc && e.sucursal !== filtSuc) continue;
        const nombre = `${e.nombre} ${e.apellido || ''}`.trim();
        if (buscar) {
            const codigo = String(e.codigo_empleado || '').toLowerCase();
            if (!nombre.toLowerCase().includes(buscar) && !codigo.includes(buscar)) continue;
        }
        const vacs = vacacionesPorEmp.get(e.id) || [];
        const s = calcularSaldo({ fecha_ingreso: e.fecha_ingreso?.substring(0,10) }, vacs, hoy);
        if (s.añoServicio < 1) continue;
        if (soloConSaldo && s.restantes <= 0) continue;
        if (soloPorVencer && !(s.estado === 'por_vencer' || s.estado === 'vencidas_operativas')) continue;
        rows.push({
            id: e.id,
            nombre,
            sucursal: e.sucursal || '—',
            añoServicio: s.añoServicio,
            derecho: s.derecho,
            tomados: s.tomados,
            restantes: s.restantes,
            aniversario: s.periodoInicio,
            fechaLimite: s.fechaLimite,
            diasParaVencer: s.diasParaVencer,
            estado: s.estado
        });
    }
    const { key, dir } = window._vacSaldosSort;
    if (!key || !dir) {
        rows.sort((a, b) => a.diasParaVencer - b.diasParaVencer);
    } else {
        const mult = dir === 'asc' ? 1 : -1;
        rows.sort((a, b) => {
            const va = a[key], vb = b[key];
            if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mult;
            return String(va).localeCompare(String(vb), 'es') * mult;
        });
    }
    return rows;
}

function ordenarVacSaldos(key) {
    const cur = window._vacSaldosSort;
    if (cur.key !== key) { cur.key = key; cur.dir = 'asc'; }
    else if (cur.dir === 'asc') cur.dir = 'desc';
    else { cur.key = null; cur.dir = null; }
    renderVacSaldos();
}

function _vacSortIcon(key) {
    const _t = _vacTema();
    const { key: k, dir } = window._vacSaldosSort;
    if (k !== key) return `<span style="color:${_t.muted};font-size:10px;margin-left:4px;">▲▼</span>`;
    return `<span style="color:#3b82f6;font-size:10px;margin-left:4px;">${dir === 'asc' ? '▲' : '▼'}</span>`;
}

function _vacTh(label, key, align) {
    const _t = _vacTema();
    return `<th onclick="ordenarVacSaldos('${key}')" style="padding:10px;text-align:${align};color:${_t.textSec};font-size:12px;cursor:pointer;user-select:none;">${label}${_vacSortIcon(key)}</th>`;
}

function renderVacSaldos() {
    if (!window._vacState?.cargado) return;
    const _t = _vacTema();
    const rows = _filasVacSaldos();
    const cont = document.getElementById('vacSaldosTabla');
    if (!cont) return;
    if (rows.length === 0) {
        cont.innerHTML = `<div style="padding:40px;text-align:center;color:${_t.muted};">Sin resultados</div>`;
        return;
    }
    const filas = rows.map(r => {
        const colorRest = r.restantes === 0 ? _t.muted : (r.restantes <= 3 ? '#f59e0b' : '#22c55e');
        let colorDias;
        if (r.estado === 'vencidas_operativas' || r.estado === 'prescritas') colorDias = '#ef4444';
        else if (r.estado === 'por_vencer') colorDias = '#f59e0b';
        else colorDias = _t.muted;
        // Para estados vencidos los días salen en negativo (informativo)
        const diasMostrados = r.diasParaVencer < 0 ? `${r.diasParaVencer}` : `${r.diasParaVencer}`;
        return `
        <tr>
            <td style="padding:8px;color:${_t.text};">${r.nombre}</td>
            <td style="padding:8px;color:${_t.text};">${r.sucursal}</td>
            <td style="padding:8px;text-align:center;color:${_t.text};">Año ${r.añoServicio}</td>
            <td style="padding:8px;text-align:right;color:${_t.text};">${r.derecho}</td>
            <td style="padding:8px;text-align:right;color:#3b82f6;">${r.tomados}</td>
            <td style="padding:8px;text-align:right;color:${colorRest};font-weight:600;">${r.restantes}</td>
            <td style="padding:8px;text-align:center;color:${_t.textSec};">${_vacFormatFechaCorta(r.aniversario)}</td>
            <td style="padding:8px;text-align:center;color:${r.estado === 'por_vencer' ? '#f59e0b' : _t.textSec};">${_vacFormatFechaCorta(r.fechaLimite)}</td>
            <td style="padding:8px;text-align:right;color:${colorDias};">${diasMostrados}</td>
            <td style="padding:8px;text-align:center;">${_vacEstadoBadge(r.estado)}</td>
        </tr>`;
    }).join('');
    cont.innerHTML = `
        <table style="width:100%;border-collapse:collapse;background:${_t.surface};border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);">
            <thead style="background:${_t.elevated};">
                <tr>
                    ${_vacTh('Empleado', 'nombre', 'left')}
                    ${_vacTh('Sucursal', 'sucursal', 'left')}
                    ${_vacTh('Servicio', 'añoServicio', 'center')}
                    ${_vacTh('Derecho', 'derecho', 'right')}
                    ${_vacTh('Tomados', 'tomados', 'right')}
                    ${_vacTh('Restantes', 'restantes', 'right')}
                    ${_vacTh('Aniversario', 'aniversario', 'center')}
                    ${_vacTh('Límite LFT (+6m)', 'fechaLimite', 'center')}
                    ${_vacTh('Días para vencer', 'diasParaVencer', 'right')}
                    ${_vacTh('Estado', 'estado', 'center')}
                </tr>
            </thead>
            <tbody>${filas}</tbody>
        </table>
        <div style="margin-top:8px;color:${_t.muted};font-size:12px;">${rows.length} empleados · <span style="color:${_t.textSec};">Fechas según Art. 81 LFT (6 meses post-aniversario)</span></div>`;
}

function exportarVacSaldosExcel() {
    const rows = _filasVacSaldos();
    if (rows.length === 0) {
        alert('Sin datos para exportar');
        return;
    }
    const data = rows.map(r => ({
        Empleado: r.nombre,
        Sucursal: r.sucursal,
        'Año de servicio': r.añoServicio,
        'Derecho LFT': r.derecho,
        Tomados: r.tomados,
        Restantes: r.restantes,
        Aniversario: r.aniversario,
        'Límite LFT (+6m)': r.fechaLimite,
        'Días para vencer': r.diasParaVencer,
        Estado: _vacEstadoMeta(r.estado).label
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Vacaciones');
    XLSX.writeFile(wb, `vacaciones-saldos-${_vacHoyYYYYMMDD()}.xlsx`);
}

function renderVacPorVencer() {
    if (!window._vacState?.cargado) return;
    const _t = _vacTema();
    const cont = document.getElementById('vacPorVencerLista');
    if (!cont) return;
    const { empleados, vacacionesPorEmp } = window._vacState;
    const hoy = _vacHoyYYYYMMDD();
    const rows = [];
    for (const e of empleados) {
        const s = calcularSaldo(
            { fecha_ingreso: e.fecha_ingreso?.substring(0,10) },
            vacacionesPorEmp.get(e.id) || [],
            hoy
        );
        if (s.añoServicio < 1) continue;
        if (s.restantes <= 0) continue;
        // Por vencer Art.81 (≤30d antes del límite +6m) o ya vencidas operativas (post-6m, pre-18m)
        if (s.estado !== 'por_vencer' && s.estado !== 'vencidas_operativas') continue;
        rows.push({
            nombre: `${e.nombre} ${e.apellido || ''}`.trim(),
            sucursal: e.sucursal || '—',
            restantes: s.restantes,
            fechaLimite: s.fechaLimiteLFT,
            diasParaVencer: s.diasParaLimiteLFT,
            estado: s.estado
        });
    }
    // Vencidas primero (más urgentes), luego por vencer ordenadas por proximidad
    rows.sort((a, b) => a.diasParaVencer - b.diasParaVencer);

    if (rows.length === 0) {
        cont.innerHTML = `
            <div style="padding:40px;text-align:center;color:#22c55e;">
                <i class="fas fa-check-circle" style="font-size:48px;"></i>
                <p style="margin-top:12px;font-size:14px;">Nadie con vacaciones por vencer ni vencidas operativamente.</p>
                <p style="margin-top:4px;font-size:12px;color:${_t.muted};">Plazo Art. 81 LFT: 6 meses post-aniversario.</p>
            </div>`;
        return;
    }

    cont.style.color = '';
    cont.style.padding = '';
    cont.style.textAlign = '';
    cont.innerHTML = rows.map(r => {
        const esVencida = r.estado === 'vencidas_operativas';
        const color = esVencida ? '#ef4444' : (r.diasParaVencer <= 15 ? '#dc2626' : '#f59e0b');
        const textoFecha = esVencida
            ? `Vencidas hace ${Math.abs(r.diasParaVencer)} días (${_vacFormatFechaCorta(r.fechaLimite)})`
            : `Vence ${_vacFormatFechaCorta(r.fechaLimite)} (${r.diasParaVencer} días)`;
        return `
        <div style="background:${_t.surface};border-left:4px solid ${color};border-radius:8px;padding:16px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 1px 3px rgba(0,0,0,.06);">
            <div>
                <div style="display:flex;align-items:center;gap:10px;">
                    <span style="font-weight:600;font-size:15px;color:${_t.text};">${r.nombre}</span>
                    ${_vacEstadoBadge(r.estado)}
                </div>
                <div style="color:${_t.textSec};font-size:13px;margin-top:2px;">${r.sucursal}</div>
            </div>
            <div style="text-align:right;">
                <div style="font-size:14px;color:${_t.text};"><strong>${r.restantes}</strong> días pendientes</div>
                <div style="font-size:12px;color:${color};margin-top:2px;">${textoFecha}</div>
            </div>
        </div>`;
    }).join('');
}

window._vacCalState = { mes: null, año: null, sucursal: '' };

function renderVacCalendario() {
    if (!window._vacState?.cargado) return;
    const _t = _vacTema();
    const cont = document.getElementById('vacCalendario');
    if (!cont) return;
    if (window._vacCalState.mes === null) {
        const h = new Date();
        window._vacCalState.mes = h.getMonth();
        window._vacCalState.año = h.getFullYear();
    }
    const { mes, año, sucursal } = window._vacCalState;
    const nombreMes = new Date(año, mes, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });

    const { empleados, vacacionesPorEmp } = window._vacState;
    const empById = new Map(empleados.map(e => [e.id, e]));
    const diasMes = new Date(año, mes + 1, 0).getDate();
    const porDia = {};
    for (let d = 1; d <= diasMes; d++) porDia[d] = [];

    for (const [empId, vacs] of vacacionesPorEmp.entries()) {
        const emp = empById.get(empId);
        if (!emp || !emp.activo) continue;
        if (sucursal && emp.sucursal !== sucursal) continue;
        const nombre = `${emp.nombre} ${emp.apellido || ''}`.trim();
        for (const v of vacs) {
            const [y1, m1, d1] = v.fecha_inicio.split('-').map(Number);
            const [y2, m2, d2] = v.fecha_fin.split('-').map(Number);
            const ini = new Date(y1, m1 - 1, d1);
            const fin = new Date(y2, m2 - 1, d2);
            const cur = new Date(año, mes, 1);
            const finMes = new Date(año, mes, diasMes);
            const desde = ini > cur ? ini : cur;
            const hasta = fin < finMes ? fin : finMes;
            if (desde > hasta) continue;
            for (let dt = new Date(desde); dt <= hasta; dt.setDate(dt.getDate() + 1)) {
                if (dt.getMonth() === mes && dt.getFullYear() === año) {
                    porDia[dt.getDate()].push(nombre);
                }
            }
        }
    }

    const primerDiaSemana = new Date(año, mes, 1).getDay();
    // Mantener sincronizada con la lista en Index.html (#vacFiltSucursal y filterJustSucursal)
    const sucursales = ['MATRIZ','TAMARAL','CABOS','LA PAZ','SAN JOSE','CULIACAN','JUAN JOSE RIOS','EL FUERTE'];

    cont.style.color = '';
    cont.style.padding = '';
    cont.style.textAlign = '';

    let html = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:8px;">
                <button class="btn btn-sm" type="button" onclick="cambiarMesVacCalendario(-1)"><i class="fas fa-chevron-left"></i></button>
                <h3 style="margin:0;text-transform:capitalize;min-width:180px;text-align:center;">${nombreMes}</h3>
                <button class="btn btn-sm" type="button" onclick="cambiarMesVacCalendario(1)"><i class="fas fa-chevron-right"></i></button>
            </div>
            <select class="form-select" onchange="cambiarSucursalVacCalendario(this.value)" style="max-width:240px;">
                <option value="">Todas las sucursales</option>
                ${sucursales.map(s => `<option value="${s}" ${s === sucursal ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;background:${_t.border};border-radius:8px;padding:4px;">
            ${['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map(d => `<div style="padding:6px;text-align:center;font-weight:600;color:${_t.textSec};font-size:12px;">${d}</div>`).join('')}`;

    for (let i = 0; i < primerDiaSemana; i++) {
        html += `<div style="background:${_t.elevated};border-radius:4px;min-height:80px;"></div>`;
    }
    for (let d = 1; d <= diasMes; d++) {
        const lista = porDia[d];
        const tieneGente = lista.length > 0;
        const chips = lista.slice(0, 3).map(n =>
            `<div style="background:${_t.elevated};color:${_t.text};border-radius:3px;padding:1px 5px;font-size:10px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${n.replace(/"/g, '&quot;')}">${n}</div>`
        ).join('');
        const masN = lista.length > 3 ? `<div style="font-size:10px;color:${_t.textSec};margin-top:2px;">+${lista.length - 3} más</div>` : '';
        html += `
            <div style="background:${_t.surface};border-radius:4px;min-height:80px;padding:4px;border:${tieneGente ? '1px solid #3b82f6' : '1px solid ' + _t.borderSoft};">
                <div style="font-size:11px;color:${_t.textSec};font-weight:600;">${d}</div>
                ${chips}${masN}
            </div>`;
    }
    html += `</div>`;
    cont.innerHTML = html;
}

function cambiarMesVacCalendario(delta) {
    let m = window._vacCalState.mes + delta;
    let y = window._vacCalState.año;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    window._vacCalState.mes = m;
    window._vacCalState.año = y;
    renderVacCalendario();
}

function cambiarSucursalVacCalendario(v) {
    window._vacCalState.sucursal = v;
    renderVacCalendario();
}
