/**
 * Pruebas del recolector sin Apps Script: se corre con `node pruebas/probar-recolector.js`.
 *
 * Carga recolector.js tal cual, en un contexto aparte, con un Utilities.formatDate
 * falso hecho con Intl. No instala nada: el proyecto no tiene dependencias y estas
 * pruebas tampoco.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

/** Lo mínimo de Utilities.formatDate que usa el recolector: yyyy, MM, dd, M. */
function formatDate(fecha, zona, patron){
  const partes = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(fecha).forEach(p => { partes[p.type] = p.value; });
  return patron
    .replace('yyyy', partes.year)
    .replace('MM', partes.month)
    .replace('dd', partes.day)
    .replace(/\bM\b/, String(Number(partes.month)));
}

const contexto = vm.createContext({ Utilities: { formatDate } });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'recolector.js'), 'utf8'), contexto);
const { diaVistoDe } = contexto;

// diaVisto: el día del mes en que la venta apareció en el Registro, en hora de Bogotá.
assert.strictEqual(diaVistoDe(new Date('2026-11-05T15:00:00Z'), '2026-11'), 5);
assert.strictEqual(diaVistoDe(new Date('2026-11-01T04:30:00Z'), '2026-11'), 0); // 23:30 del 31 de octubre en Bogotá
assert.strictEqual(diaVistoDe(new Date('2026-10-20T15:00:00Z'), '2026-11'), 0); // agendada el mes pasado
assert.strictEqual(diaVistoDe('', '2026-11'), 0);                               // visto_en vacío
assert.strictEqual(diaVistoDe('no es fecha', '2026-11'), 0);
assert.strictEqual(diaVistoDe(new Date('2026-11-30T23:00:00Z'), '2026-11'), 30); // 18:00 del 30 en Bogotá

console.log('ok');
