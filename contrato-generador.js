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
    // Fuente: perfiles oficiales de RH (carpeta "PERFILES DE PUESTOS"),
    // mas las dos clausulas de cierre del contrato. Clave = puesto de nomina normalizado.
    "TRABAJADOR DE PATIO": [
      "Descargar los camiones que llegan con mercancía de parte de los proveedores.",
      "Atender al cliente que viene por su material, y ayudarlo a encontrar lo que busca.",
      "Ayudar a los choferes a cargar y descargar material, en caso de ir a la entrega de este.",
      "Realizar corte de materiales como son placas, soleras, según sea el caso.",
      "Mantener los materiales bien acomodados en el lugar que le corresponda y en las mejores condiciones posibles.",
      "Atender a clientes.",
      "Cargar material en las camionetas, y/o camiones para su oportuna entrega al cliente.",
      "Realizar labores de limpieza.",
      "Obedecer a las instrucciones del jefe inmediato.",
      "De ser necesario, serán capacitados para su puesto en la Ciudad de Los Mochis, Sinaloa. El tiempo requerido, así lo indique la Comisión Mixta de Productividad.",
      "Tener la disposición de realizar todas las actividades anteriormente descritas, dentro de su Anexo \"A\""
    ],
    "CHOFER": [
      "Cargar material en las camionetas, y/o camiones para su oportuna entrega al cliente.",
      "Cobrar las facturas a los clientes de la mercancía y hacer la entrega del efectivo a la caja.",
      "Revisar los niveles de agua, aceite, gasolina, líquido de frenos, anticongelante, presión de aire en las llantas, aceite en la dirección hidráulica de los vehículos de la empresa.",
      "Mantener limpio y en buenas condiciones los vehículos de la empresa.",
      "Reportar inmediatamente al jefe inmediato cualquier anomalía y falla mecánica de los vehículos de la empresa.",
      "Descargar los camiones que llegan con mercancía de parte de los proveedores.",
      "Realizar corte de materiales como son placas, soleras, según sea el caso.",
      "Atender al cliente.",
      "Mantener los materiales bien acomodados en el lugar que le corresponda y en las mejores condiciones posibles.",
      "Mantener limpia y ordenada su área de trabajo.",
      "Mantener limpio y completo su equipo y herramientas de trabajo.",
      "Ordenar y acomodar todo tipo de materiales.",
      "Cargar y descargar todo tipo de materiales dentro de las instalaciones de la empresa, así como en el domicilio de los clientes.",
      "Apoyar a otras áreas de la empresa cuando se requiera.",
      "Dar seguimiento a las instrucciones de su jefe inmediato.",
      "Reportar cualquier anomalía que observe en su área de trabajo.",
      "Entregar los reportes que se le soliciten.",
      "Ayudar a los choferes a descargar el material, en caso de ir a la entrega de este.",
      "De ser necesario, serán capacitados para su puesto en la Ciudad de Los Mochis, Sinaloa. El tiempo requerido, así lo indique la Comisión Mixta de Productividad.",
      "Tener la disposición de realizar todas las actividades anteriormente descritas, dentro de su Anexo \"A\""
    ],
    "VENTAS": [

      "Atención a clientes en ventas de mostrador.",
      "Responder mensajes y llamadas para dar precios, realizar pedidos y cotizaciones.",
      "Seguimiento de facturación de empresas y clientes.",
      "Seguimiento a cotizaciones.",

      "Apoyo a gerencia cuando se requiera.",
      "De ser necesario, serán capacitados para su puesto en la Ciudad de Los Mochis, Sinaloa. El tiempo requerido, así lo indique la Comisión Mixta de Productividad.",
      "Tener la disposición de realizar todas las actividades anteriormente descritas, dentro de su Anexo \"A\""
    ],
    "AUXILIAR CONTABLE": [

      "ARQUEOS. - Realizar arques de cajas, fondos de caja y cuentas por cobrar de las diferentes sucursales.",
      "SUPERVISAR Y RECAUDAR CIERRE MENSUAL. – Coordinar con los titulares de cada departamento la entrega de sus informes mensuales.",
      "REVISION DE CONTABILIDAD. - Confirmar que los saldos contables al cierre de mes sean correctos.",
      "CUADRES DE MODULO VS CONTABILIAD. - Revisar que la información de los módulos este contabilizada correctamente. En caso de no coincidir se debe identificar la diferencia y corregir la información.",
      "CONTROL DE DEPRECIACIONES. - Llevar en cedula el control de las depreciaciones mensuales y registrarlo contablemente.",
      "CONTABILIDAD ELECTRONICA. - Recabar el soporte documental de la información, revisar en sistema la información, generar XML de balanza de comprobación y catalogo cuando aplique y así enviarlo al SAT.",
      "ASESORIA. - Apoyar al demás personal con dudas contables o en algunos procesos operativos relacionados al sistema, ya sea de matriz o del resto de las sucursales.",
      "Mantener el archivo administrativo contable organizado y clasificado (tanto físico como electrónico).",

      "Todas las demás funciones que sean consideradas necesarias por el jefe inmediato, para el buen desarrollo de las actividades del departamento administrativo contable.",

      "Manejo, actualización y control de los expedientes de vehículos de la empresa.",
      "De ser necesario, serán capacitados para su puesto en la Ciudad de Los Mochis, Sinaloa. El tiempo requerido, así lo indique la Comisión Mixta de Productividad.",
      "Tener la disposición de realizar todas las actividades anteriormente descritas, dentro de su Anexo \"A\""
    ],
    "CAJERA": [
      "Cobro a cliente y choferes.",
      "Depositar la venta del día al banco por medio del mensajero.",
      "Aplicar depositos bancarios.",
      "Hacer polizas contables.",
      "Corte de terminal punto de venta.",
      "Realizar cierre de la venta del día.",
      "Cierre mensual.",
      "Control de caja chica.",
      "Recibir facturas a revision.",
      "De ser necesario, serán capacitados para su puesto en la Ciudad de Los Mochis, Sinaloa. El tiempo requerido, así lo indique la Comisión Mixta de Productividad.",
      "Tener la disposición de realizar todas las actividades anteriormente descritas, dentro de su Anexo \"A\""
    ],
    "AUXILIAR DE INVENTARIO": [

      "Realizar el conteo de todos los productos en el almacén y su posterior análisis.",
      "Recepción mercancías de sucursales JJ Ríos y El fuerte.",
      "Realizar de Ordenes de Producción para corte de láminas de diferentes medidas y elaboración de Estribos.",
      "Traspasos entre almacenes.",
      "Transferencias a sucursales.",
      "Apoyo a inventarios en sucursales foráneas.",
      "Control y manejo de uso interno.",
      "De ser necesario, serán capacitados para su puesto en la Ciudad de Los Mochis, Sinaloa. El tiempo requerido, así lo indique la Comisión Mixta de Productividad.",
      "Tener la disposición de realizar todas las actividades anteriormente descritas, dentro de su Anexo \"A\""
    ],
    "AUXILIAR ADMINISTRATIVO": [

      "ARQUEOS. - Realizar arques de cajas, fondos de caja y cuentas por cobrar de las diferentes sucursales.",
      "SUPERVISAR Y RECAUDAR CIERRE MENSUAL. – Coordinar con los titulares de cada departamento la entrega de sus informes mensuales.",
      "REVISION DE CONTABILIDAD. - Confirmar que los saldos contables al cierre de mes sean correctos.",
      "CUADRES DE MODULO VS CONTABILIAD. - Revisar que la información de los módulos este contabilizada correctamente. En caso de no coincidir se debe identificar la diferencia y corregir la información.",
      "CONTROL DE DEPRECIACIONES. - Llevar en cedula el control de las depreciaciones mensuales y registrarlo contablemente.",
      "CONTABILIDAD ELECTRONICA. - Recabar el soporte documental de la información, revisar en sistema la información, generar XML de balanza de comprobación y catalogo cuando aplique y así enviarlo al SAT.",
      "ASESORIA. - Apoyar al demás personal con dudas contables o en algunos procesos operativos relacionados al sistema, ya sea de matriz o del resto de las sucursales.",
      "Mantener el archivo administrativo contable organizado y clasificado (tanto físico como electrónico).",

      "Todas las demás funciones que sean consideradas necesarias por el jefe inmediato, para el buen desarrollo de las actividades del departamento administrativo contable.",

      "Manejo, actualización y control de los expedientes de vehículos de la empresa.",
      "De ser necesario, serán capacitados para su puesto en la Ciudad de Los Mochis, Sinaloa. El tiempo requerido, así lo indique la Comisión Mixta de Productividad.",
      "Tener la disposición de realizar todas las actividades anteriormente descritas, dentro de su Anexo \"A\""
    ],
    "MENSAJERO": [
      "Realizar pagos de la empresa como agua, luz, teléfono.",
      "Realizar depósitos en bancos de dinero, cheques.",
      "Llevar a cabo indicaciones por parte de directivos ya sean asuntos personales o laborales.",
      "Apoyo en compras al personal administrativo.",
      "Limpiar ventanas de oficinas.",
      "De ser necesario, serán capacitados para su puesto en la Ciudad de Los Mochis, Sinaloa. El tiempo requerido, así lo indique la Comisión Mixta de Productividad.",
      "Tener la disposición de realizar todas las actividades anteriormente descritas, dentro de su Anexo \"A\""
    ],
    "INTENDENCIA": [
      "Realizar la limpieza general en la empresa (área administrativa, contable, ventas).",
      "Regar el jardín de la empresa.",
      "Inventario de productos de limpieza.",
      "Requisición de productos de limpieza, solicitar autorización y proceder personalmente a la compra.",
      "Atender las indicaciones de los directivos.",
      "Apoyo en convivios de la empresa.",
      "Abastecer botes con sanitizante, gel antibacterial y colocarlos en áreas destinadas como el sanitizante en tapetes.",
      "De ser necesario, serán capacitados para su puesto en la Ciudad de Los Mochis, Sinaloa. El tiempo requerido, así lo indique la Comisión Mixta de Productividad.",
      "Tener la disposición de realizar todas las actividades anteriormente descritas, dentro de su Anexo \"A\""
    ],
    "ALMACEN": [
      "Recibir y verificar el material: Separar el material por camión o por factura para después embarcarlo y enviarlo a Cabos San Lucas.",
      "Entregar pedidos a sucursales: El Encargado de inventario proporciona los pedidos, los viernes se hace entrega de material a El Fuerte y los miércoles a Juan José Ríos en caso de que se presente una entrega urgente se envía otra unidad con el material.",
      "Recibir material de proveedores: Recibir facturas y entregar al departamento de compras para revisar de quien es el material y el mismo departamento define que hacer con él para proceder a su descarga.",
      "Entregar pedidos de Cemex: Departamento de compras entrega pedidos para ordenar material.",
      "Cortar material con equipo de gas: Herramientas como: ´placas, ptr, vigas.",
      "De ser necesario, serán capacitados para su puesto en la Ciudad de Los Mochis, Sinaloa. El tiempo requerido, así lo indique la Comisión Mixta de Productividad.",
      "Tener la disposición de realizar todas las actividades anteriormente descritas, dentro de su Anexo \"A\""
    ],
    "CONTADOR": [
      "Revisión de contabilidad, estados financieros mensuales, contabilidad electrónica e impuestos a pagar.",
      "Supervisión de las funciones de los puestos que me reportan directamente; resolución de problemas, avances, revisión del rol de entrega oportuna de información y documentación.",
      "Revisión y autorización de los gastos generales de la empresa. Firma de cheques y autorización de transferencias.",
      "Revisión y autorización quincenal y mensual de los pagos por sueldos y honorarios, y revisión mensual del pago de IMSS.",
      "Autorización del pago de los impuestos federales y estatales.",
      "Supervisión de la operatividad de la Caja General y revisión del cobro oportuno de las ventas de contado por entregas a domicilio.",
      "Atención y seguimiento a solicitud de información que realicen entidades federales y gubernamentales.",
      "Coordinar la capacitación del personal en área contable y fiscal.",
      "Coordinar las revisiones internas en materia de arqueos y controles internos de contabilidad.",
      "Atender situaciones en general de Matriz y sucursales en materia administrativa y contable.",
      "De ser necesario, serán capacitados para su puesto en la Ciudad de Los Mochis, Sinaloa. El tiempo requerido, así lo indique la Comisión Mixta de Productividad.",
      "Tener la disposición de realizar todas las actividades anteriormente descritas, dentro de su Anexo \"A\""
    ],
    "MECANICO": [
      "Darles funcionamiento a todas las unidades de la empresa.",
      "Revisar niveles de agua, aceite, gasolina, liquido de frenos, anticongelante, presión de aire en las llantas, aceite en la dirección hidráulica de los vehículos de la empresa.",
      "De ser necesario, serán capacitados para su puesto en la Ciudad de Los Mochis, Sinaloa. El tiempo requerido, así lo indique la Comisión Mixta de Productividad.",
      "Tener la disposición de realizar todas las actividades anteriormente descritas, dentro de su Anexo \"A\""
    ],
    "INVENTARIO": [

      "Control y cuidado de entregas posteriores.",
      "Registro y control de pedidos, transferencia en sucursales.",
      "Elaborar ordenes de producción.",
      "Traspasos de ordenes de producción.",
      "Ligar códigos de productos de proveedor.",
      "Cancelaciones de recepciones, transferencias y entregas posteriores.",
      "Registro de devoluciones de proveedores.",
      "Dar soporte a sucursales e información de material.",
      "Realizar reporte de saldos de inventario.",
      "Solicitar facturas a proveedores.",
      "Cuadre de almacén, (matriz y sucursales).",
      "Muestreo de productos en matriz y sucursales.",
      "Registro de recepciones de mercancías.",
      "Cedula de inventarios, costos, devoluciones.",
      "Revisión de la plataforma Docuo.",
      "Inventario físico en Sinaloa.",
      "Revisión de conteo diario según el calendario de conteo a todas las sucursales.",

      "Solicitar y dar seguimiento a refacturación de proveedores.",

      "Acomodo de material.",
      "Realizar compras locales, en ausencia de encargado de compras.",
      "Logística de embarque a sucursales, en ausencia de encargado de compras.",
      "De ser necesario, serán capacitados para su puesto en la Ciudad de Los Mochis, Sinaloa. El tiempo requerido, así lo indique la Comisión Mixta de Productividad.",
      "Tener la disposición de realizar todas las actividades anteriormente descritas, dentro de su Anexo \"A\""
    ],
    "ENCARGADO DE CARTERA": [
      "Facturas a revisión por medios electrónicos.",
      "Control de facturas de crédito.",
      "Preparación facturas a revisión.",
      "Relación diaria de cobranza.",
      "revisión de relación de cobro.",
      "Comprobantes de pago.",
      "Aplicación pagos.",
      "Identificación de depósitos.",
      "Relación aplicaciones pago.",
      "Autorización de facturas de crédito.",
      "Facturas crédito al día.",
      "Control de cuentas por cobrar.",
      "Análisis y revisión de cartera.",
      "Expediente de crédito.",
      "Facturas revisión portal de clientes.",
      "Cuadre cuenta clientes (1103).",
      "Cuadre cuenta anticipo de clientes (2103).",
      "Actualización de saldos Buro de crédito.",
      "Base de datos buro de crédito.",
      "Cuadre buro de crédito.",
      "Portal buro de crédito.",
      "Cierre mensual sucursales.",
      "Mejoravit.",
      "Coordinar los pedidos con el área de embarques.",
      "Informar a vendedores y clientes el estatus del pedido.",
      "De ser necesario, serán capacitados para su puesto en la Ciudad de Los Mochis, Sinaloa. El tiempo requerido, así lo indique la Comisión Mixta de Productividad.",
      "Tener la disposición de realizar todas las actividades anteriormente descritas, dentro de su Anexo \"A\""
    ],
    "GERENTE DE COMPRAS": [
      "Solicitar cotización, existencias y tiempos de entrega de los productos a los proveedores principales.",
      "Elaborar una comparativa de precios cotizados por los proveedores.",
      "Realizar la orden de compra y hacerla llegar al proveedor seleccionado.",
      "Seguimiento al embarque del material.",
      "Supervisar la recepción de materiales en óptimas condiciones.",
      "Sondeo de precios de los principales proveedores agrupado por familias.",
      "Crear formatos de sugeridos de compra (Ventas vs Stock).",
      "Coordinación de envíos de material a Sucursales.",
      "Gestión y seguimiento de pagos a proveedores.",
      "Recepciones de solicitudes de material.",
      "Apoyar a Gerentes de sucursales con los costos actualizados de materiales.",
      "Solicitar a dirección la autorización de pagos a proveedores por compras especiales.",
      "Coordinar la recolección de polvos en bodega de Cemex.",
      "Coordinar las fabricaciones de láminas Steel Deck, Galvanizadas y Pintros.",
      "Coordinar las fabricaciones de los Castillos Armex.",
      "Supervisar las reparaciones mecánicas de los equipos de transporte de reparto.",
      "Supervisar las reparaciones mecánicas de las grúas y montacargas.",
      "Supervisar el reacomodo de materiales en casilleros de almacén.",
      "Monitoreo diario de existencias físicas de materiales.",
      "Fortalecimiento de relación con proveedores (Atención a Ejecutivos con visitas programadas).",
      "Soporte a los gerentes de ventas y encargados de inventario de las sucursales sobre mercancías en tránsito.",
      "Búsqueda de nuevos proveedores.",
      "Auxiliar en conteo de Productos para cuadraje de Inventarios de sucursales.",
      "Realizar actividades diversas que indiquen los directivos.",
      "De ser necesario, serán capacitados para su puesto en la Ciudad de Los Mochis, Sinaloa. El tiempo requerido, así lo indique la Comisión Mixta de Productividad.",
      "Tener la disposición de realizar todas las actividades anteriormente descritas, dentro de su Anexo \"A\""
    ],
    "RECURSOS HUMANOS": [
      "Reclutamiento y selección de personal administrativo y operativo.",
      "Solicitar autorización de alta de nuevo ingreso.",
      "Comunicar oficialmente a Dirección dudas y quejas directas o del buzón.",
      "Control y resguardo de expedientes laborales, ya sean activos o inactivos.",
      "Verificar que todo el personal cuente con uniforme y equipo de protección personal.",
      "Aplicar entrevista de salida y solicitar la autorización de baja del colaborador.",
      "Realizar inventario del botiquín de primeros auxilios, así como su resguardo.",
      "Supervisar vencimiento de contrato de personal en periodo a prueba.",
      "Elaborar actas administrativas.",
      "Cotizar y gestionar autorización de compra uniformes.",
      "Resolver dudas del personal.",
      "Elaborar y aplicar amonestaciones al personal cuando el jefe directo de dicho personal lo solicite.",
      "Entregar el equipo de protección personal al personal que lo requiera.",
      "Compra de boletos y tramite para viajes de personal a BCS.",
      "Contratar empresas reclutadoras y dar seguimiento hasta contratación.",
      "De ser necesario, serán capacitados para su puesto en la Ciudad de Los Mochis, Sinaloa. El tiempo requerido, así lo indique la Comisión Mixta de Productividad.",
      "Tener la disposición de realizar todas las actividades anteriormente descritas, dentro de su Anexo \"A\""
    ],
    "FERRETERIA": [
      "Solicitar material de ferretería al encargado de compra.",
      "Entregar material al cliente.",
      "Ordenar, limpiar y acomodar material en bodegas de ferretería.",
      "Barrer estacionamiento de aceros del pacifico.",
      "Abrir la tienda de ventas y limpiar vidrios.",
      "Regar el jardín del patio.",
      "Atender al cliente en ventas.",
      "Apoyar en la requisición del Equipo de Protección Persona a Recursos Humanos.",
      "De ser necesario, serán capacitados para su puesto en la Ciudad de Los Mochis, Sinaloa. El tiempo requerido, así lo indique la Comisión Mixta de Productividad.",
      "Tener la disposición de realizar todas las actividades anteriormente descritas, dentro de su Anexo \"A\""
    ],
    "AUXILIAR DE EMBARQUES": [
      "Facilitar el producto en patio para su entrega a cliente y carga a camiones grandes.",
      "Cargar Torton.",
      "Verificar salidas de choferes y clientes con material.",
      "Informar con encargados de sucursal para proceder a entregas.",
      "Controlar y coordinar salidas de entrega de material en diferentes puntos de la ciudad.",
      "Organizar las facturas que se realizan en el área de ventas para su entrega, ya sean locales o foráneas.",
      "Supervisar el funcionamiento y desempeño de los compañeros en el área de patio para el mejor desempeño y funcionamiento de sus labores.",
      "Recibir el material de los diferentes proveedores y distribuidores que nos surten.",
      "Verificar el peso en bascula de los materiales que se van a entregar a los clientes.",
      "Verificar el peso en bascula de los materiales que se van a recibir de los proveedores.",
      "Supervisar que cada área donde se encuentran los materiales esté debidamente acomodada y en el lugar que le corresponde.",
      "De ser necesario, serán capacitados para su puesto en la Ciudad de Los Mochis, Sinaloa. El tiempo requerido, así lo indique la Comisión Mixta de Productividad.",
      "Tener la disposición de realizar todas las actividades anteriormente descritas, dentro de su Anexo \"A\""
    ]
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
