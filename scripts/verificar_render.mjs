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
  ciudad_firma: "Culiacán, Sinaloa", puesto: "Cajera", folio: "",
  actividades: ["Actividad uno de prueba", "Actividad dos de prueba", "Actividad tres de prueba"]
};

const zip = new PizZip(fs.readFileSync(plantilla));
const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
doc.render(datos);                              // lanza si hay tags mal formados
const out = doc.getZip().generate({ type: 'nodebuffer' });
fs.writeFileSync(path.join(__dirname, 'salida-render.docx'), out);

// extraer texto del document.xml de salida
const xml = new PizZip(out).file('word/document.xml').asText();
const plano = xml.replace(/<[^>]+>/g, '');
for (const val of ["Juan Pérez López", "PELJ900510HSLRPN01", "PELJ900510AB1",
                    "11223344556", "1 de marzo del 2026", "1 de mayo del 2026",
                    "Fray Marcos de Niza", "Actividad uno de prueba", "Actividad tres de prueba"]) {
  assert.ok(plano.includes(val), `falta en la salida: ${val}`);
}
// Datos de Isis que NUNCA deben aparecer (nota: "Cajera" SÍ puede, es el puesto de prueba)
for (const bad of ["Evaristo", "35200633903", "PADRE NICOLAS", "isla guyana"]) {
  assert.ok(!plano.includes(bad), `no debe aparecer: ${bad}`);
}
console.log("OK: render (salida-render.docx generado, revisar visualmente)");
