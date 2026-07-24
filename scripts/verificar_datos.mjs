import assert from 'node:assert';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../contrato-generador.js');

// Empleado ficticio (NO Isis)
const expB = {
  NombreCompleto: "Juan Pérez López", FechaNacimiento: "1990-05-10T00:00:00",
  EstadoCivil: "Casado", NumeroIMSS: "11223344556", CURP: "PELJ900510HSLRPN01",
  RFC: "PELJ900510AB1", Calle: "Av. Siempre Viva", NumExterior: "742",
  Colonia: "Centro", CodigoPostal: "80000", Municipio: "Culiacán",
  FechaIngreso: "2026-03-01T00:00:00", Puesto: "Cajera", Sucursal: "CULIACAN"
};

// Testigos elegidos en el checklist (obligatorios)
const TT = { testigo_1: "Ana Ruiz Soto", testigo_2: "Luis Mena Diaz", encargado_sucursal: "Mario Cruz Vega" };

// Caso feliz
let r = C.construirDatosContrato(expB, "CULIACAN", "Cajera", TT);
assert.deepStrictEqual(r.faltantes, [], "no debe haber faltantes");
assert.strictEqual(r.datos.nombre_completo, "Juan Pérez López");
assert.strictEqual(r.datos.edad, "35");                        // nació 1990-05, ingreso 2026-03 => 35
assert.strictEqual(r.datos.fecha_ingreso, "1 de marzo del 2026");
assert.strictEqual(r.datos.fecha_fin_prueba, "1 de mayo del 2026");
assert.strictEqual(r.datos.sitio_trabajo, C.SUCURSAL_CATALOGO["CULIACAN"].direccion);
assert.strictEqual(r.datos.ciudad_firma, "Culiacán, Sinaloa");
assert.strictEqual(r.datos.salario_monto, "9,451.20");
assert.strictEqual(r.datos.actividades.length, 11);   // 9 del perfil de RH + 2 cláusulas de cierre
assert.match(r.datos.domicilio, /Av\. Siempre Viva, #742, Centro, C\.P\. 80000, Culiacán/);

// Puesto sin perfil de RH -> faltante, sin datos
let r2 = C.construirDatosContrato(expB, "CULIACAN", "OPERADOR DE GRUA", TT);
assert.strictEqual(r2.datos, null);
assert.ok(r2.faltantes.some(f => f.includes("Anexo")), "debe faltar Anexo del puesto");

// Chofer configurado desde el perfil oficial (incluye lo del vehículo)
let rc = C.construirDatosContrato(expB, "CULIACAN", "Chofer", TT);
assert.deepStrictEqual(rc.faltantes, [], "Chofer debe estar configurado");
assert.strictEqual(rc.datos.actividades.length, 20);  // 18 del perfil + 2 de cierre
assert.ok(rc.datos.actividades.some(a => /niveles de agua, aceite, gasolina/.test(a)),
  "Chofer debe incluir la revisión del vehículo (venía del perfil oficial, no del contrato)");
assert.strictEqual(rc.datos.puesto, "Chofer");

// --- Integridad del catálogo completo (18 puestos desde perfiles de RH) ---
const CIERRE_1 = /De ser necesario, serán capacitados/;
const CIERRE_2 = /Tener la disposición de realizar todas las actividades/;
for (const [puesto, acts] of Object.entries(C.ACTIVIDADES_POR_PUESTO)) {
  assert.ok(acts.length >= 3, `${puesto}: debe tener actividades`);
  // ningún encabezado de sección del perfil se coló como actividad
  for (const a of acts) {
    assert.ok(!/^(rutinarias|no rutinarias|auxiliares|otras)\s*:?\.?$/i.test(a.trim()),
      `${puesto}: encabezado de sección colado como actividad -> ${JSON.stringify(a)}`);
    assert.ok(a.trim().length > 0, `${puesto}: actividad vacía`);
  }
  // las dos cláusulas de cierre del contrato van al final, en ese orden
  assert.ok(CIERRE_1.test(acts[acts.length - 2]), `${puesto}: falta cláusula de capacitación`);
  assert.ok(CIERRE_2.test(acts[acts.length - 1]), `${puesto}: falta cláusula de disposición`);
}
assert.strictEqual(Object.keys(C.ACTIVIDADES_POR_PUESTO).length, 20);

// Sin expediente
let r3 = C.construirDatosContrato(null, "CULIACAN", "Cajera", TT);
assert.strictEqual(r3.datos, null);
assert.ok(r3.faltantes[0].includes("expediente"));

// --- Casos adversariales (revisión de código) ---

// Domicilio incompleto: falta la colonia -> bloquea, con faltante específico
let r4 = C.construirDatosContrato({ ...expB, Colonia: "" }, "CULIACAN", "Cajera", TT);
assert.strictEqual(r4.datos, null);
assert.ok(r4.faltantes.some(f => f.toLowerCase().includes("colonia")), "debe faltar la colonia");

// Falta fecha de nacimiento -> bloquea (la edad va en el contrato)
let r5 = C.construirDatosContrato({ ...expB, FechaNacimiento: "" }, "CULIACAN", "Cajera", TT);
assert.strictEqual(r5.datos, null);
assert.ok(r5.faltantes.some(f => f.toLowerCase().includes("nacimiento")), "debe faltar la fecha de nacimiento");

// NumeroIMSS como número (no string) -> válido, nss como string
let r6 = C.construirDatosContrato({ ...expB, NumeroIMSS: 11223344556 }, "CULIACAN", "Cajera", TT);
assert.deepStrictEqual(r6.faltantes, []);
assert.strictEqual(r6.datos.nss, "11223344556");

// Sucursal con acento/minúsculas -> se normaliza y resuelve la dirección correcta
let r7 = C.construirDatosContrato(expB, "Culiacán", "Cajera", TT);
assert.deepStrictEqual(r7.faltantes, [], "sucursal con acento debe resolver");
assert.strictEqual(r7.datos.sitio_trabajo, C.SUCURSAL_CATALOGO["CULIACAN"].direccion);

// Fin de mes: ingreso 31-dic + 2 meses no debe desbordar a marzo (cae en febrero)
let r8 = C.construirDatosContrato({ ...expB, FechaIngreso: "2025-12-31T00:00:00" }, "CULIACAN", "Cajera", TT);
assert.ok(/de febrero del 2026$/.test(r8.datos.fecha_fin_prueba),
  `fin de prueba debe caer en febrero, fue: ${r8.datos.fecha_fin_prueba}`);

// --- Testigos (elegidos en el checklist) ---
assert.strictEqual(r.datos.testigo_1, "Ana Ruiz Soto");
assert.strictEqual(r.datos.testigo_2, "Luis Mena Diaz");
assert.strictEqual(r.datos.encargado_sucursal, "Mario Cruz Vega");

// Sin testigos -> bloquea
let s1 = C.construirDatosContrato(expB, "CULIACAN", "Cajera", null);
assert.strictEqual(s1.datos, null);
assert.ok(s1.faltantes.some(f => f.includes("testigos")), "debe exigir los 2 testigos");

// Solo un testigo -> bloquea
let s2 = C.construirDatosContrato(expB, "CULIACAN", "Cajera", { testigo_1: "Ana Ruiz Soto", encargado_sucursal: "Mario Cruz Vega" });
assert.strictEqual(s2.datos, null);
assert.ok(s2.faltantes.some(f => f.includes("testigos")));

// Sin encargado -> bloquea (firma la comision y recibe el aviso)
let s3 = C.construirDatosContrato(expB, "CULIACAN", "Cajera", { testigo_1: "Ana Ruiz Soto", testigo_2: "Luis Mena Diaz" });
assert.strictEqual(s3.datos, null);
assert.ok(s3.faltantes.some(f => f.includes("Encargado")));

console.log("OK: construirDatosContrato");
