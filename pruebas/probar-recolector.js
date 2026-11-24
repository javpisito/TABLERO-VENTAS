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

// ── La memoria del día en que apareció cada venta ──
// Sobrevive a que vacíen el Registro: vive en las Propiedades del script.
const { decidirVisto, partirVistos, leerVistos, aMinutos } = contexto;
const min = iso => Math.floor(new Date(iso).getTime() / 60000);
// Los objetos que vienen del contexto aislado tienen otro prototipo: se comparan por contenido.
const igual = (real, esperado) => assert.deepStrictEqual(JSON.parse(JSON.stringify(real)), esperado);

assert.strictEqual(aMinutos(new Date('2026-11-05T15:00:00Z')), min('2026-11-05T15:00:00Z'));
assert.strictEqual(aMinutos(''), 0);
assert.strictEqual(aMinutos('no es fecha'), 0);

// El Registro tiene una fecha más temprana que la memoria (o la memoria no la tiene): se aprende.
igual(decidirVisto(min('2026-11-05T15:00:00Z'), 0), { recordar: min('2026-11-05T15:00:00Z'), escribir: 0 });
igual(decidirVisto(min('2026-11-05T15:00:00Z'), min('2026-11-09T15:00:00Z')), { recordar: min('2026-11-05T15:00:00Z'), escribir: 0 });
// Vaciaron el Registro y la venta entró de nuevo con la fecha de hoy: se corrige con la recordada.
igual(decidirVisto(min('2026-11-24T15:00:00Z'), min('2026-11-05T15:00:00Z')), { recordar: 0, escribir: min('2026-11-05T15:00:00Z') });
// Celda vacía y memoria con dato: se escribe la recordada.
igual(decidirVisto(0, min('2026-11-05T15:00:00Z')), { recordar: 0, escribir: min('2026-11-05T15:00:00Z') });
// Iguales, o sin dato en ninguna parte: no se hace nada.
igual(decidirVisto(min('2026-11-05T15:00:00Z'), min('2026-11-05T15:00:00Z')), { recordar: 0, escribir: 0 });
igual(decidirVisto(0, 0), { recordar: 0, escribir: 0 });

// Se guarda por cliente y por mes, para no pasar el límite de 9 KB por propiedad,
// y se suelta lo de hace más de cuatro meses.
const partes = partirVistos({
  'DAY-000001': min('2026-11-05T15:00:00Z'),
  'DAY-000002': min('2026-10-29T15:00:00Z'),
  'DAN-000001': min('2026-11-20T15:00:00Z'),
  'CUC-000009': min('2026-06-01T15:00:00Z')        // de hace más de cuatro meses
}, new Date('2026-11-24T15:00:00Z'));
igual(Object.keys(partes).sort(), ['VISTOS_DAN_202611', 'VISTOS_DAY_202610', 'VISTOS_DAY_202611']);
assert.deepStrictEqual(JSON.parse(partes.VISTOS_DAY_202611), { 'DAY-000001': min('2026-11-05T15:00:00Z') });

// Leer junta todas las partes y deja de lado lo que no es memoria o no se puede leer.
const leido = leerVistos(Object.assign({}, partes, { META_TOKEN: 'x', VISTOS_ROTO_202611: '{no es json' }));
igual(leido, {
  'DAY-000001': min('2026-11-05T15:00:00Z'),
  'DAY-000002': min('2026-10-29T15:00:00Z'),
  'DAN-000001': min('2026-11-20T15:00:00Z')
});

// actualizarSiCambio con un Registro de mentira: una fila que volvió a entrar con la
// fecha de hoy (vaciaron el Registro) queda con la fecha recordada.
const { actualizarSiCambio } = contexto;
function registroFalso(filas){
  const escritos = [];
  return {
    escritos,
    getRange(fila, col, nf, nc){
      return {
        getValues: () => [filas[fila].slice(col - 1, col - 1 + (nc || 1))],
        setValue: v => escritos.push({ fila, col, v }),
        setValues: v => escritos.push({ fila, col, v })
      };
    }
  };
}
const hoy = new Date('2026-11-24T17:00:00Z'), antes = new Date('2026-11-05T15:00:00Z');
const filaReg = ['DAY-000001', 'Dra. Dayan', new Date('2026-11-10T17:00:00Z'), 'Laura', 100, 'Agendada', '', hoy];
let reg = registroFalso({ 3: filaReg });
let memoria = { mapa: { 'DAY-000001': min(antes.toISOString()) }, cambio: false };
actualizarSiCambio(reg, 3, filaReg.slice(), memoria);
assert.strictEqual(reg.escritos.length, 1, 'escribe una sola cosa: visto_en');
assert.strictEqual(reg.escritos[0].col, 8);
assert.strictEqual(reg.escritos[0].v.getTime(), antes.getTime());
assert.strictEqual(memoria.cambio, false);

// Sin memoria: aprende la fecha del Registro y no escribe nada.
reg = registroFalso({ 3: filaReg.slice(0, 7).concat([antes]) });
memoria = { mapa: {}, cambio: false };
actualizarSiCambio(reg, 3, filaReg.slice(0, 7).concat([antes]), memoria);
assert.strictEqual(reg.escritos.length, 0);
assert.strictEqual(memoria.mapa['DAY-000001'], min(antes.toISOString()));
assert.strictEqual(memoria.cambio, true);

console.log('ok');
