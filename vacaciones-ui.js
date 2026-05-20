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
