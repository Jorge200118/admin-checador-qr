// vacaciones-ui.js
// Render del bloque de vacaciones en el expediente y de la sección sidebar.
// Depende de vacaciones-lft.js y vacaciones-saldo.js.

function _vacFormatFechaCorta(yyyymmdd) {
    if (!yyyymmdd) return '—';
    const [y, m, d] = yyyymmdd.split('-');
    return `${d}/${m}/${y}`;
}

function _vacHoyYYYYMMDD() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function renderBloqueVacacionesExpediente(empleado, vacaciones) {
    if (!empleado || !empleado.fecha_ingreso) {
        return `<div style="color:#94a3b8;font-size:12px;padding:9px 0;">Sin fecha de ingreso registrada</div>`;
    }
    const hoy = _vacHoyYYYYMMDD();
    const s = calcularSaldo(empleado, vacaciones, hoy);
    const hist = historialPeriodos(empleado, vacaciones, hoy, 5);

    if (s.añoServicio < 1) {
        return `
        <div style="padding:9px 0;color:#94a3b8;font-size:13px;">
            Aún sin derecho. Cumple 1 año el <strong style="color:#e2e8f0;">${_vacFormatFechaCorta(s.proximoAniversario)}</strong>.
        </div>`;
    }

    const colorRestantes = s.restantes === 0 ? '#ef4444' : (s.restantes <= 3 ? '#f59e0b' : '#22c55e');
    const urgente = s.diasParaVencer <= 60 && s.restantes > 0;
    const avisoVence = urgente
        ? `<div style="margin-top:8px;padding:8px 12px;background:#f59e0b22;border-left:3px solid #f59e0b;border-radius:4px;color:#fbbf24;font-size:12px;">
             <i class="fas fa-exclamation-triangle"></i> Vence en ${s.diasParaVencer} días — usar antes del ${_vacFormatFechaCorta(s.fechaLimite)}
           </div>`
        : '';

    const filaBloque = (lbl, val, color) => `
        <div style="display:flex;padding:9px 0;border-bottom:1px solid #1e293b22;gap:12px;">
            <span style="color:#64748b;font-size:12px;min-width:160px;">${lbl}</span>
            <span style="color:${color || '#e2e8f0'};font-size:13px;">${val}</span>
        </div>`;

    const histFilas = hist.map(p => `
        <tr>
            <td style="padding:6px 8px;color:#94a3b8;font-size:12px;">Año ${p.añoServicio}</td>
            <td style="padding:6px 8px;color:#94a3b8;font-size:12px;">${_vacFormatFechaCorta(p.inicio)} → ${_vacFormatFechaCorta(p.fin)}</td>
            <td style="padding:6px 8px;text-align:right;color:#e2e8f0;font-size:12px;">${p.derecho}</td>
            <td style="padding:6px 8px;text-align:right;color:#3b82f6;font-size:12px;">${p.tomados}</td>
            <td style="padding:6px 8px;text-align:right;color:${p.esActual ? '#22c55e' : (p.perdidos > 0 ? '#ef4444' : '#94a3b8')};font-size:12px;">
                ${p.esActual ? `${p.derecho - p.tomados} actual` : (p.perdidos > 0 ? `−${p.perdidos}` : '0')}
            </td>
        </tr>`).join('');

    return `
        ${filaBloque('Año de servicio', `Año ${s.añoServicio}`)}
        ${filaBloque('Periodo actual', `${_vacFormatFechaCorta(s.periodoInicio)} → ${_vacFormatFechaCorta(s.fechaLimite)}`)}
        ${filaBloque('Derecho LFT', `${s.derecho} días`)}
        ${filaBloque('Tomados', `${s.tomados} días`, '#3b82f6')}
        ${filaBloque('Restantes', `<strong>${s.restantes} días</strong>`, colorRestantes)}
        ${avisoVence}
        <details style="margin-top:12px;">
            <summary style="cursor:pointer;color:#64748b;font-size:12px;padding:6px 0;">
                <i class="fas fa-history"></i> Ver historial (${hist.length} ${hist.length === 1 ? 'periodo' : 'periodos'})
            </summary>
            <table style="width:100%;margin-top:8px;border-collapse:collapse;">
                <thead>
                    <tr style="border-bottom:1px solid #1e293b;">
                        <th style="padding:6px 8px;text-align:left;color:#64748b;font-size:11px;font-weight:600;">Periodo</th>
                        <th style="padding:6px 8px;text-align:left;color:#64748b;font-size:11px;font-weight:600;">Fechas</th>
                        <th style="padding:6px 8px;text-align:right;color:#64748b;font-size:11px;font-weight:600;">Derecho</th>
                        <th style="padding:6px 8px;text-align:right;color:#64748b;font-size:11px;font-weight:600;">Tomados</th>
                        <th style="padding:6px 8px;text-align:right;color:#64748b;font-size:11px;font-weight:600;">Saldo</th>
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
        const empleados = empRes.success
            ? empRes.data.filter(e => e.activo && e.fecha_ingreso)
            : [];
        const hace3años = (() => {
            const d = new Date(); d.setFullYear(d.getFullYear() - 3);
            return `${d.getFullYear()}-01-01`;
        })();
        const vacRes = await SupabaseAPI.getTodasVacacionesDesde(hace3años);
        const porEmp = new Map();
        if (vacRes.success) {
            for (const v of vacRes.data) {
                if (!porEmp.has(v.empleado_id)) porEmp.set(v.empleado_id, []);
                porEmp.get(v.empleado_id).push(v);
            }
        }
        window._vacState = { empleados, vacacionesPorEmp: porEmp, cargado: true };
    } finally {
        if (typeof hideLoading === 'function') hideLoading();
    }
}

async function abrirSeccionVacaciones() {
    if (!window._vacState.cargado) await _cargarDatosVacaciones();
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

function _filasVacSaldos() {
    const { empleados, vacacionesPorEmp } = window._vacState;
    const filtSuc = document.getElementById('vacFiltSucursal')?.value || '';
    const soloConSaldo = document.getElementById('vacFiltConSaldo')?.checked;
    const soloPorVencer = document.getElementById('vacFiltPorVencer')?.checked;
    const hoy = _vacHoyYYYYMMDD();
    const rows = [];
    for (const e of empleados) {
        if (filtSuc && e.sucursal !== filtSuc) continue;
        const vacs = vacacionesPorEmp.get(e.id) || [];
        const s = calcularSaldo({ fecha_ingreso: e.fecha_ingreso?.substring(0,10) }, vacs, hoy);
        if (s.añoServicio < 1) continue;
        if (soloConSaldo && s.restantes <= 0) continue;
        if (soloPorVencer && s.diasParaVencer > 60) continue;
        rows.push({
            id: e.id,
            nombre: `${e.nombre} ${e.apellido || ''}`.trim(),
            sucursal: e.sucursal || '—',
            añoServicio: s.añoServicio,
            derecho: s.derecho,
            tomados: s.tomados,
            restantes: s.restantes,
            fechaLimite: s.fechaLimite,
            diasParaVencer: s.diasParaVencer
        });
    }
    rows.sort((a, b) => a.diasParaVencer - b.diasParaVencer);
    return rows;
}

function renderVacSaldos() {
    if (!window._vacState?.cargado) return;
    const rows = _filasVacSaldos();
    const cont = document.getElementById('vacSaldosTabla');
    if (!cont) return;
    if (rows.length === 0) {
        cont.innerHTML = `<div style="padding:40px;text-align:center;color:#94a3b8;">Sin resultados</div>`;
        return;
    }
    const filas = rows.map(r => {
        const urgente = r.diasParaVencer <= 60 && r.restantes > 0;
        const colorRest = r.restantes === 0 ? '#94a3b8' : (r.restantes <= 3 ? '#f59e0b' : '#22c55e');
        return `
        <tr>
            <td style="padding:8px;">${r.nombre}</td>
            <td style="padding:8px;">${r.sucursal}</td>
            <td style="padding:8px;text-align:center;">Año ${r.añoServicio}</td>
            <td style="padding:8px;text-align:right;">${r.derecho}</td>
            <td style="padding:8px;text-align:right;color:#3b82f6;">${r.tomados}</td>
            <td style="padding:8px;text-align:right;color:${colorRest};font-weight:600;">${r.restantes}</td>
            <td style="padding:8px;text-align:center;color:${urgente ? '#f59e0b' : '#94a3b8'};">
                ${_vacFormatFechaCorta(r.fechaLimite)}
                ${urgente ? `<br><small>${r.diasParaVencer} días</small>` : ''}
            </td>
        </tr>`;
    }).join('');
    cont.innerHTML = `
        <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);">
            <thead style="background:#f1f5f9;">
                <tr>
                    <th style="padding:10px;text-align:left;color:#475569;font-size:12px;">Empleado</th>
                    <th style="padding:10px;text-align:left;color:#475569;font-size:12px;">Sucursal</th>
                    <th style="padding:10px;text-align:center;color:#475569;font-size:12px;">Servicio</th>
                    <th style="padding:10px;text-align:right;color:#475569;font-size:12px;">Derecho</th>
                    <th style="padding:10px;text-align:right;color:#475569;font-size:12px;">Tomados</th>
                    <th style="padding:10px;text-align:right;color:#475569;font-size:12px;">Restantes</th>
                    <th style="padding:10px;text-align:center;color:#475569;font-size:12px;">Vence</th>
                </tr>
            </thead>
            <tbody>${filas}</tbody>
        </table>
        <div style="margin-top:8px;color:#94a3b8;font-size:12px;">${rows.length} empleados</div>`;
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
        'Fecha límite': r.fechaLimite,
        'Días para vencer': r.diasParaVencer
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Vacaciones');
    XLSX.writeFile(wb, `vacaciones-saldos-${_vacHoyYYYYMMDD()}.xlsx`);
}

function renderVacPorVencer() {
    if (!window._vacState?.cargado) return;
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
        if (s.diasParaVencer > 60) continue;
        rows.push({
            nombre: `${e.nombre} ${e.apellido || ''}`.trim(),
            sucursal: e.sucursal || '—',
            restantes: s.restantes,
            fechaLimite: s.fechaLimite,
            diasParaVencer: s.diasParaVencer
        });
    }
    rows.sort((a, b) => a.diasParaVencer - b.diasParaVencer);

    if (rows.length === 0) {
        cont.innerHTML = `
            <div style="padding:40px;text-align:center;color:#22c55e;">
                <i class="fas fa-check-circle" style="font-size:48px;"></i>
                <p style="margin-top:12px;font-size:14px;">Nadie con vacaciones por vencer en los próximos 60 días.</p>
            </div>`;
        return;
    }

    cont.style.color = '';
    cont.style.padding = '';
    cont.style.textAlign = '';
    cont.innerHTML = rows.map(r => {
        const color = r.diasParaVencer <= 15 ? '#dc2626' : (r.diasParaVencer <= 30 ? '#f59e0b' : '#3b82f6');
        return `
        <div style="background:#fff;border-left:4px solid ${color};border-radius:8px;padding:16px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 1px 3px rgba(0,0,0,.06);">
            <div>
                <div style="font-weight:600;font-size:15px;color:#1e293b;">${r.nombre}</div>
                <div style="color:#64748b;font-size:13px;margin-top:2px;">${r.sucursal}</div>
            </div>
            <div style="text-align:right;">
                <div style="font-size:14px;color:#1e293b;"><strong>${r.restantes}</strong> días pendientes</div>
                <div style="font-size:12px;color:${color};margin-top:2px;">
                    Vence ${_vacFormatFechaCorta(r.fechaLimite)} (${r.diasParaVencer} días)
                </div>
            </div>
        </div>`;
    }).join('');
}
}
