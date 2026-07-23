// contrato-generador.js
// Generación automática del Contrato Individual de Trabajo al dar de alta un empleado.
// Se rellena en el navegador con docxtemplater + PizZip a partir de plantilla-contrato.docx.
(function () {
  'use strict';

  // ---- Constantes ----
  const SALARIO = {
    monto: "9,451.20",
    letra: "Nueve Mil Cuatrocientos Cincuenta y uno pesos 20/100 M.N."
  };
  const NACIONALIDAD = "Mexicana";
  const ADMIN_API_FALLBACK = 'https://aceros-cabos-proveedores.ngrok.app/api';

  // Reutiliza la misma URL que Admin.js (ADMIN_CONFIG.apiUrl); cae al fallback si aún no cargó.
  function apiBase() {
    return (typeof ADMIN_CONFIG !== 'undefined' && ADMIN_CONFIG && ADMIN_CONFIG.apiUrl)
      ? ADMIN_CONFIG.apiUrl : ADMIN_API_FALLBACK;
  }

  const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio",
                 "agosto","septiembre","octubre","noviembre","diciembre"];

  // ---- Catálogo de sucursales (dirección + ciudad de firma) ----
  const SUCURSAL_CATALOGO = {
    "MATRIZ":         { direccion: "Prol. Independencia No. 1856 Pte., Fracc. Cuauhtémoc, Los Mochis, Sinaloa",                   ciudad: "Los Mochis, Sinaloa" },
    "LA PAZ":         { direccion: "Blvd. Agustín Olachea No. 4910, entre Tenochtitlán y Tuna, Col. Las Garzas, La Paz, B.C.S.", ciudad: "La Paz, B.C.S." },
    "SAN JOSE":       { direccion: "Julio Pimentel Green, Manzana 7c Lote S/N, Col. Las Veredas, San José del Cabo, B.C.S.",     ciudad: "San José del Cabo, B.C.S." },
    "TAMARAL":        { direccion: "Padre Nicolás Tamaral, 23477 Cabo San Lucas, B.C.S.",                                       ciudad: "Cabo San Lucas, B.C.S." },
    "CABOS":          { direccion: "Flor de Pitahaya Local 25, Brisas del Pacífico, C.P. 23473, Cabo San Lucas, B.C.S.",        ciudad: "Cabo San Lucas, B.C.S." },
    "EL FUERTE":      { direccion: "Carretera El Fuerte - Choix Km 1 + 320, El Fuerte, Sinaloa",                                ciudad: "El Fuerte, Sinaloa" },
    "JUAN JOSE RIOS": { direccion: "Jambiola entre Carretera Internacional y Calle 0, Juan José Ríos, Sinaloa",                 ciudad: "Juan José Ríos, Sinaloa" },
    "CULIACAN":       { direccion: "Fray Marcos de Niza No. 100, Col. San Rafael, Culiacán, Sinaloa",                           ciudad: "Culiacán, Sinaloa" }
  };

  // ---- Catálogo de actividades por puesto (Anexo "A"). Clave normalizada. ----
  const ACTIVIDADES_POR_PUESTO = {
    "CAJERA": [
      "Atender el pago de facturas de contado, ya sea directamente del cliente o de los choferes,",
      "Elaborar los depósitos de contado y crédito, amparados con copia simple de los cheques recibidos en ambos tipos de venta,",
      "Pasar al Departamento de Cartera, copia de los cheques y depósitos por venta de crédito para que se haga la relación de abonos a clientes,",
      "Elaborar la póliza de ingresos diaria,",
      "Revisar la facturación en tránsito diariamente",
      "De ser necesario, serán capacitados para su puesto en la Ciudad de Los Mochis, Sinaloa. El tiempo requerido, así lo indique la Comisión Mixta de Productividad.",
      "Tener la disposición de realizar todas las actividades anteriormente descritas, dentro de su Anexo \"A\""
    ]
    // Pendientes: se agregan conforme el usuario entregue un ejemplo por puesto.
  };

  // ---- Helpers ----
  function normalizarPuesto(s) {
    return (s || "").toString().trim().toUpperCase()
      .normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "");
  }

  function parseFecha(f) {
    // Corrige desfase de zona horaria (fechas vienen ISO desde BMS)
    if (!f) return null;
    const dt = new Date(f);
    if (isNaN(dt)) return null;
    return new Date(dt.getTime() + dt.getTimezoneOffset() * 60000);
  }

  function fechaLarga(d) {
    if (!d) return "";
    return `${d.getDate()} de ${MESES[d.getMonth()]} del ${d.getFullYear()}`;
  }

  function calcularEdad(fechaNac, ref) {
    const n = parseFecha(fechaNac), r = ref || new Date();
    if (!n) return "";
    let e = r.getFullYear() - n.getFullYear();
    const m = r.getMonth() - n.getMonth();
    if (m < 0 || (m === 0 && r.getDate() < n.getDate())) e--;
    return String(e);
  }

  function sumarMeses(d, meses) {
    // Suma meses fijando el día al final para evitar el desbordamiento de mes
    // (p. ej. 31 dic + 2 meses no debe caer en marzo).
    const r = new Date(d.getTime());
    const dia = r.getDate();
    r.setDate(1);
    r.setMonth(r.getMonth() + meses);
    const ultimoDia = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
    r.setDate(Math.min(dia, ultimoDia));
    return r;
  }

  // Valor presente y no vacío (acepta el número 0, rechaza "" / null / undefined).
  function tiene(v) {
    return v !== undefined && v !== null && String(v).trim() !== '';
  }

  function construirDomicilio(d) {
    const partes = [
      d.Calle, tiene(d.NumExterior) ? `#${d.NumExterior}` : null,
      tiene(d.NumInterior) ? `Int. ${d.NumInterior}` : null,
      d.Colonia, tiene(d.CodigoPostal) ? `C.P. ${d.CodigoPostal}` : null, d.Municipio
    ].filter(Boolean);
    return partes.join(", ");
  }

  // ---- Núcleo: arma datos o faltantes ----
  // exp = json.data del expediente BMS; sucursal/puesto = valores del alta (form).
  function construirDatosContrato(exp, sucursal, puesto) {
    const faltantes = [];
    if (!exp) return { datos: null, faltantes: ["No se encontró el expediente del empleado"] };

    const keyPuesto = normalizarPuesto(puesto || exp.Puesto);
    const keySuc = normalizarPuesto(sucursal);   // mayúsculas + sin acentos, conserva espacios
    const nombre_completo = (exp.NombreCompleto ||
      [exp.Nombre, exp.ApellidoPaterno, exp.ApellidoMaterno].filter(Boolean).join(" ")).trim();

    if (!nombre_completo) faltantes.push("Falta el nombre del empleado en el expediente");
    if (!ACTIVIDADES_POR_PUESTO[keyPuesto])
      faltantes.push(`Falta configurar el Anexo "A" para el puesto: ${puesto || exp.Puesto || "(sin puesto)"}`);
    if (!SUCURSAL_CATALOGO[keySuc])
      faltantes.push(`Sucursal sin dirección configurada: ${sucursal || "(sin sucursal)"}`);
    if (!exp.FechaIngreso)    faltantes.push("Falta la fecha de ingreso en el expediente");
    if (!exp.FechaNacimiento) faltantes.push("Falta la fecha de nacimiento en el expediente");
    if (!exp.RFC)             faltantes.push("Falta el RFC en el expediente");
    if (!exp.CURP)            faltantes.push("Falta la CURP en el expediente");
    if (!exp.NumeroIMSS)      faltantes.push("Falta el NSS (registro IMSS) en el expediente");
    if (!tiene(exp.Calle))        faltantes.push("Falta la calle del domicilio en el expediente");
    if (!tiene(exp.Colonia))      faltantes.push("Falta la colonia del domicilio en el expediente");
    if (!tiene(exp.CodigoPostal)) faltantes.push("Falta el código postal del domicilio en el expediente");
    if (!tiene(exp.Municipio))    faltantes.push("Falta el municipio del domicilio en el expediente");

    if (faltantes.length) return { datos: null, faltantes };

    const ingreso = parseFecha(exp.FechaIngreso);
    const finPrueba = sumarMeses(ingreso, 2);
    const suc = SUCURSAL_CATALOGO[keySuc];

    const datos = {
      nombre_completo: nombre_completo,
      edad: calcularEdad(exp.FechaNacimiento, ingreso),
      estado_civil: exp.EstadoCivil || "",
      nacionalidad: NACIONALIDAD,
      nss: String(exp.NumeroIMSS),
      curp: exp.CURP,
      rfc: exp.RFC,
      domicilio: construirDomicilio(exp),
      fecha_ingreso: fechaLarga(ingreso),
      fecha_fin_prueba: fechaLarga(finPrueba),
      salario_monto: SALARIO.monto,
      salario_letra: SALARIO.letra,
      sitio_trabajo: suc.direccion,
      ciudad_firma: suc.ciudad,
      puesto: (puesto || exp.Puesto || "").toString().trim(),
      actividades: ACTIVIDADES_POR_PUESTO[keyPuesto].slice()
    };
    return { datos, faltantes: [] };
  }

  // ---- Render + descarga (navegador) ----
  function sanitizarNombreArchivo(s) {
    return (s || "contrato").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function descargarBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function avisar(titulo, msg, tipo) {
    if (typeof window !== 'undefined' && typeof window.showAlert === 'function')
      window.showAlert(titulo, msg, tipo || 'info');
    else console.warn(`[contrato] ${titulo}: ${msg}`);
  }

  // Renderiza el .docx a partir de la plantilla + datos. Devuelve Blob.
  async function renderizarContrato(datos) {
    const PizZipCtor = (typeof window !== 'undefined') && window.PizZip;
    const DocxtemplaterCtor = (typeof window !== 'undefined') && window.docxtemplater
      && (window.docxtemplater.default || window.docxtemplater);
    if (!PizZipCtor || !DocxtemplaterCtor)
      throw new Error('Faltan librerías (PizZip/docxtemplater) para generar el contrato');
    const resp = await fetch('plantilla-contrato.docx');
    if (!resp.ok) throw new Error('No se pudo descargar la plantilla');
    const buf = await resp.arrayBuffer();
    const zip = new PizZipCtor(buf);
    const doc = new DocxtemplaterCtor(zip, {
      paragraphLoop: true, linebreaks: true,
      delimiters: { start: '{', end: '}' }
    });
    doc.render(datos);
    return doc.getZip().generate({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });
  }

  // Punto de entrada desde el alta. NUNCA lanza (maneja su propio error).
  async function generarContratoAlta(codigoEmpleado, opts) {
    opts = opts || {};
    try {
      const res = await fetch(`${apiBase()}/empleados/expediente/${encodeURIComponent(codigoEmpleado)}`);
      const json = await res.json().catch(() => ({}));
      const exp = json && json.success ? json.data : null;

      const { datos, faltantes } = construirDatosContrato(exp, opts.sucursal, opts.puesto);
      if (!datos) {
        avisar('Contrato no generado',
          'No se descargó el contrato porque falta:\n• ' + faltantes.join('\n• '),
          'warning');
        return { ok: false, faltantes };
      }
      const blob = await renderizarContrato(datos);
      descargarBlob(blob, `Contrato - ${sanitizarNombreArchivo(datos.nombre_completo)}.docx`);
      return { ok: true };
    } catch (e) {
      avisar('Contrato no generado', 'Error al generar el contrato: ' + e.message, 'error');
      return { ok: false, error: e.message };
    }
  }

  // ---- Exponer ----
  const API = { construirDatosContrato, generarContratoAlta, renderizarContrato,
                normalizarPuesto, fechaLarga, calcularEdad, sumarMeses, construirDomicilio,
                SUCURSAL_CATALOGO, ACTIVIDADES_POR_PUESTO, SALARIO };
  if (typeof window !== 'undefined') Object.assign(window, { CONTRATO: API, generarContratoAlta });
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
