import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const plantilla = path.join(__dirname, '..', 'plantilla-contrato.docx');

const datos = {
  nombre_completo: "Juan Pérez López", edad: "35", estado_civil: "Casado",
  nacionalidad: "Mexicana", nss: "11223344556", curp: "PELJ900510HSLRPN01",
  rfc: "PELJ900510AB1", domicilio: "Av. Siempre Viva, #742, Centro, C.P. 80000, Culiacán",
  fecha_ingreso: "1 de marzo del 2026", fecha_fin_prueba: "1 de mayo del 2026",
  salario_monto: "9,451.20", salario_letra: "Nueve Mil ... 20/100 M.N.",
  sitio_trabajo: "Fray Marcos de Niza No. 100, Col. San Rafael, Culiacán, Sinaloa",
  ciudad_firma: "Culiacán, Sinaloa", puesto: "Cajera",
  testigo_1: "Ana Ruiz Soto", testigo_2: "Luis Mena Diaz", encargado_sucursal: "Mario Cruz Vega",
  actividades: ["Actividad uno de prueba", "Actividad dos de prueba", "Actividad tres de prueba"]
};

const zip = new PizZip(fs.readFileSync(plantilla));
const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
doc.render(datos);                              // lanza si hay tags mal formados
const out = doc.getZip().generate({ type: 'nodebuffer' });
fs.writeFileSync(path.join(__dirname, 'salida-render.docx'), out);

const outZip = new PizZip(out);
const sinTags = (s) => s.replace(/<[^>]+>/g, '');
// TODAS las partes word/*.xml (document + headers + footers) — no ser ciego al header (C1)
const partes = Object.keys(outZip.files).filter(n => n.startsWith('word/') && n.endsWith('.xml'));
const docXml = outZip.file('word/document.xml').asText();
const planoTodo = sinTags(partes.map(n => outZip.file(n).asText()).join('\n'));

for (const val of ["Juan Pérez López", "PELJ900510HSLRPN01", "PELJ900510AB1",
                    "11223344556", "1 de marzo del 2026", "1 de mayo del 2026",
                    "Fray Marcos de Niza", "Actividad uno de prueba", "Actividad tres de prueba",
                    "Ana Ruiz Soto", "Luis Mena Diaz", "Mario Cruz Vega"]) {
  assert.ok(planoTodo.includes(val), `falta en la salida: ${val}`);
}
// Datos de Isis que NUNCA deben aparecer EN NINGUNA PARTE, incluido el encabezado
for (const bad of ["Evaristo", "Valeria", "Ramírez", "35200633903", "PADRE NICOLAS", "isla guyana",
                   "Guillermo Corrales", "Esmeralda Flores"]) {
  assert.ok(!planoTodo.includes(bad), `no debe aparecer en ninguna parte: ${bad}`);
}
// El nombre del empleado debe llegar al encabezado (donde estaba la fuga)
const headerParts = partes.filter(n => /header\d*\.xml$/.test(n));
assert.ok(headerParts.length > 0, "el documento debe tener encabezado");
const headerPlano = sinTags(headerParts.map(n => outZip.file(n).asText()).join('\n'));
assert.ok(headerPlano.includes("Juan Pérez López"), "el nombre del empleado debe estar en el encabezado");

// Estructura: las 3 actividades deben ser 3 párrafos con viñeta (numPr) separados
const segsP = docXml.split(/<w:p[ >]/);
const itemsBullet = segsP.filter(s => s.includes('Actividad ') && s.includes('<w:numPr'));
assert.strictEqual(itemsBullet.length, 3,
  `esperados 3 párrafos de actividad con viñeta, hay ${itemsBullet.length}`);

// Cada rol en su lugar: el encargado recibe el AVISO DE RESULTADO (no un testigo)
const planoDoc = sinTags(docXml);
const iAviso = planoDoc.indexOf("AVISO DE RESULTADO");
assert.ok(iAviso > -1, "debe existir el aviso de resultado");
assert.ok(planoDoc.slice(iAviso, iAviso + 120).includes("Mario Cruz Vega"),
  "el aviso de resultado debe ir dirigido al Encargado de Sucursal");

console.log("OK: render (salida-render.docx generado, revisar visualmente)");
