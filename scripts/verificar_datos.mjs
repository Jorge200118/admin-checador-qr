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

// Caso feliz
let r = C.construirDatosContrato(expB, "CULIACAN", "Cajera");
assert.deepStrictEqual(r.faltantes, [], "no debe haber faltantes");
assert.strictEqual(r.datos.nombre_completo, "Juan Pérez López");
assert.strictEqual(r.datos.edad, "35");                        // nació 1990-05, ingreso 2026-03 => 35
assert.strictEqual(r.datos.fecha_ingreso, "1 de marzo del 2026");
assert.strictEqual(r.datos.fecha_fin_prueba, "1 de mayo del 2026");
assert.strictEqual(r.datos.sitio_trabajo, C.SUCURSAL_CATALOGO["CULIACAN"].direccion);
assert.strictEqual(r.datos.ciudad_firma, "Culiacán, Sinaloa");
assert.strictEqual(r.datos.salario_monto, "9,451.20");
assert.strictEqual(r.datos.actividades.length, 7);
assert.match(r.datos.domicilio, /Av\. Siempre Viva, #742, Centro, C\.P\. 80000, Culiacán/);

// Puesto sin Anexo -> faltante, sin datos
let r2 = C.construirDatosContrato(expB, "CULIACAN", "CHOFER");
assert.strictEqual(r2.datos, null);
assert.ok(r2.faltantes.some(f => f.includes("Anexo")), "debe faltar Anexo del puesto");

// Sin expediente
let r3 = C.construirDatosContrato(null, "CULIACAN", "Cajera");
assert.strictEqual(r3.datos, null);

console.log("OK: construirDatosContrato");
