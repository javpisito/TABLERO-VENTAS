/**
 * ============================================================================
 * CONECTOR DEL TABLERO DE VENTAS · SC Ads
 * ============================================================================
 * Va pegado en Extensiones → Apps Script del Google Sheet.
 * Hace tres cosas:
 *   1. Pone id y fechas solo, para que nadie tenga que acordarse
 *   2. Baja inversión, alcance e interacciones de Meta cada 30 minutos
 *   3. Sirve el JSON que lee el televisor
 *
 * PRIMERA VEZ (en orden):
 *   a) Configuración del proyecto → Propiedades del script:
 *        META_TOKEN = tu token de usuario del sistema (el que no expira)
 *   b) Ejecutar la función  instalarDisparadores  una sola vez
 *   c) Ejecutar  verTiposDeAccion  y mirar el registro para elegir
 *      qué cuenta como "interacción" en TIPOS_INTERACCION
 *   d) Implementar → Nueva implementación → Aplicación web
 *        Ejecutar como: Yo · Acceso: Cualquier usuario
 *      Copiar la URL /exec y pegarla en el CONFIG del televisor
 * ============================================================================
 */

var API = 'v21.0';

// Qué acciones de Meta cuentan como "interacción".
// Corre verTiposDeAccion() antes de tocar esta lista: los nombres cambian
// según el objetivo de campaña y un nombre mal escrito devuelve cero callado.
var TIPOS_INTERACCION = [
  'post_engagement',
  'onsite_conversion.messaging_conversation_started_7d'
];

var COL = { id:1, creacion:2, cliente:3, vendedor:4, contacto:5,
            producto:6, monto:7, estado:8, cierre:9, notas:10 };

/* ══════════════════════════════════════════════════════════════
   1. AUTOMATISMOS DE LA HOJA
   ══════════════════════════════════════════════════════════════ */

/**
 * Se dispara al editar. Pone el id cuando eliges cliente,
 * y la hora de cierre cuando marcas Ganada.
 */
function alEditar(e){
  var hoja = e.range.getSheet();
  if (hoja.getName() !== 'Oportunidades') return;
  var fila = e.range.getRow();
  var col  = e.range.getColumn();
  if (fila < 2) return;

  if (col === COL.cliente && !hoja.getRange(fila, COL.id).getValue()){
    hoja.getRange(fila, COL.id).setValue(nuevoId(hoja));
    hoja.getRange(fila, COL.creacion).setValue(new Date());
  }

  if (col === COL.estado){
    var estado = String(e.range.getValue());
    var celdaCierre = hoja.getRange(fila, COL.cierre);
    if (estado === 'Ganada' && !celdaCierre.getValue()) celdaCierre.setValue(new Date());
    if (estado === 'Abierta') celdaCierre.clearContent();
  }
}

function nuevoId(hoja){
  var ids = hoja.getRange(2, COL.id, Math.max(1, hoja.getLastRow() - 1), 1).getValues();
  var max = 0;
  ids.forEach(function(f){
    var m = /^OP-(\d+)$/.exec(String(f[0]));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return 'OP-' + ('0000' + (max + 1)).slice(-4);
}

/* ══════════════════════════════════════════════════════════════
   2. TRÁFICO DESDE META
   ══════════════════════════════════════════════════════════════ */

function actualizarTrafico(){
  var libro = SpreadsheetApp.getActive();
  var token = PropertiesService.getScriptProperties().getProperty('META_TOKEN');
  if (!token) throw new Error('Falta META_TOKEN en las propiedades del script');

  var clientes = leerTabla(libro.getSheetByName('Clientes'))
    .filter(function(c){ return String(c.activo).toLowerCase() === 'si' && c.cuenta_meta; });

  var filas = [];
  var ahora = new Date();

  clientes.forEach(function(c){
    var cuenta = String(c.cuenta_meta).trim();
    if (cuenta.indexOf('act_') !== 0) cuenta = 'act_' + cuenta;
    var url = 'https://graph.facebook.com/' + API + '/' + cuenta + '/insights'
            + '?fields=spend,reach,actions'
            + '&date_preset=today&level=account'
            + '&access_token=' + encodeURIComponent(token);
    try{
      var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      var cuerpo = JSON.parse(res.getContentText());
      if (cuerpo.error){
        Logger.log('Meta respondió error para ' + c.cliente + ': ' + cuerpo.error.message);
        return;
      }
      var d = (cuerpo.data && cuerpo.data[0]) || {};
      filas.push([
        new Date(),
        c.cliente,
        cuenta,
        Number(d.spend) || 0,
        Number(d.reach) || 0,
        contarInteracciones(d.actions),
        ahora
      ]);
    } catch (err){
      Logger.log('Falló la consulta de ' + c.cliente + ': ' + err);
    }
  });

  var hoja = libro.getSheetByName('Trafico');
  if (hoja.getLastRow() > 1){
    hoja.getRange(2, 1, hoja.getLastRow() - 1, 7).clearContent();
  }
  if (filas.length) hoja.getRange(2, 1, filas.length, 7).setValues(filas);
}

function contarInteracciones(acciones){
  if (!acciones) return 0;
  var suma = 0;
  acciones.forEach(function(a){
    if (TIPOS_INTERACCION.indexOf(a.action_type) !== -1) suma += Number(a.value) || 0;
  });
  return suma;
}

/**
 * Diagnóstico. Imprime todos los action_type que devuelve la primera cuenta
 * activa, con su valor. Úsalo para llenar TIPOS_INTERACCION sin adivinar.
 */
function verTiposDeAccion(){
  var token = PropertiesService.getScriptProperties().getProperty('META_TOKEN');
  var clientes = leerTabla(SpreadsheetApp.getActive().getSheetByName('Clientes'))
    .filter(function(c){ return c.cuenta_meta; });
  if (!clientes.length) { Logger.log('No hay cuentas configuradas'); return; }
  var cuenta = String(clientes[0].cuenta_meta).trim();
  if (cuenta.indexOf('act_') !== 0) cuenta = 'act_' + cuenta;
  var url = 'https://graph.facebook.com/' + API + '/' + cuenta + '/insights'
          + '?fields=actions&date_preset=last_30d&level=account'
          + '&access_token=' + encodeURIComponent(token);
  var cuerpo = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());
  if (cuerpo.error){ Logger.log('Error: ' + cuerpo.error.message); return; }
  var acciones = (cuerpo.data && cuerpo.data[0] && cuerpo.data[0].actions) || [];
  Logger.log('Cuenta ' + cuenta + ' · ' + acciones.length + ' tipos disponibles:');
  acciones.forEach(function(a){ Logger.log('  ' + a.action_type + '  =  ' + a.value); });
}

/* ══════════════════════════════════════════════════════════════
   3. ENDPOINT PARA EL TELEVISOR
   ══════════════════════════════════════════════════════════════ */

function doGet(e){
  var libro = SpreadsheetApp.getActive();
  var oportunidades = leerTabla(libro.getSheetByName('Oportunidades'))
    .filter(function(o){ return o.id && o.cliente; });
  var clientes = leerTabla(libro.getSheetByName('Clientes'));
  var trafico  = leerTabla(libro.getSheetByName('Trafico'));

  // Ventas cerradas: lo que hace sonar la campana
  var ventas = oportunidades
    .filter(function(o){ return String(o.estado) === 'Ganada'; })
    .map(function(o){
      return {
        id: String(o.id),
        vendedora: String(o.vendedor || 'Sin asignar'),
        cliente: String(o.cliente),
        monto: Number(o.monto) || 0,
        producto: String(o.producto || ''),
        ts: aISO(o.fecha_cierre || o.fecha_creacion)
      };
    });

  // Panel por cliente
  var porCliente = clientes
    .filter(function(c){ return String(c.activo).toLowerCase() === 'si'; })
    .map(function(c){
      var mias = oportunidades.filter(function(o){ return o.cliente === c.cliente; });
      var t = trafico.filter(function(x){ return x.cliente === c.cliente; });
      return {
        cliente: c.cliente,
        facturado:  suma(mias.filter(esGanada), 'monto'),
        proyectado: suma(mias.filter(esAbierta), 'monto'),
        ganados: mias.filter(esGanada).length,
        abiertos: mias.filter(esAbierta).length,
        inversion: suma(t, 'inversion'),
        alcance: t.length ? Math.max.apply(null, t.map(function(x){ return Number(x.alcance) || 0; })) : 0,
        interacciones: suma(t, 'interacciones'),
        metaMes: Number(c.meta_mes) || 0
      };
    });

  var carga = JSON.stringify({
    actualizado: new Date().toISOString(),
    meta: porCliente.reduce(function(s, c){ return s + c.metaMes; }, 0),
    clientes: porCliente,
    ventas: ventas
  });

  var cb = e && e.parameter && e.parameter.callback;
  if (cb){
    return ContentService.createTextOutput(cb + '(' + carga + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(carga)
    .setMimeType(ContentService.MimeType.JSON);
}

function esGanada(o){ return String(o.estado) === 'Ganada'; }
function esAbierta(o){ return String(o.estado) === 'Abierta'; }
function suma(arr, campo){
  return arr.reduce(function(s, x){ return s + (Number(x[campo]) || 0); }, 0);
}

/* ══════════════════════════════════════════════════════════════
   4. ENTRADA DESDE GO HIGH LEVEL (opcional)
   ══════════════════════════════════════════════════════════════
   Workflow en GHL: Opportunity Status Changed → Won → Webhook a esta URL.
   Escribe la fila en Oportunidades y el televisor la celebra en el
   siguiente sondeo, sin que nadie toque la hoja.
   ══════════════════════════════════════════════════════════════ */

function doPost(e){
  try{
    var d = JSON.parse(e.postData.contents);
    var hoja = SpreadsheetApp.getActive().getSheetByName('Oportunidades');
    hoja.appendRow([
      d.id || nuevoId(hoja),
      new Date(),
      d.cliente || '',
      d.vendedor || d.assigned_to || 'Sin asignar',
      d.contacto || d.full_name || '',
      d.producto || d.pipeline_stage || '',
      Number(d.monto || d.opportunity_value) || 0,
      'Ganada',
      new Date(),
      'Entró por GHL'
    ]);
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err){
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/* ══════════════════════════════════════════════════════════════
   AUXILIARES
   ══════════════════════════════════════════════════════════════ */

/** Lee una pestaña como lista de objetos usando la fila 1 como llaves. */
function leerTabla(hoja){
  if (!hoja || hoja.getLastRow() < 2) return [];
  var datos = hoja.getDataRange().getValues();
  var llaves = datos.shift().map(function(k){ return String(k).trim(); });
  return datos.map(function(f){
    var o = {};
    llaves.forEach(function(k, i){ if (k) o[k] = f[i]; });
    return o;
  });
}

function aISO(v){
  if (v instanceof Date) return v.toISOString();
  if (!v) return new Date().toISOString();
  var d = new Date(v);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function instalarDisparadores(){
  var libro = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach(function(t){ ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('alEditar').forSpreadsheet(libro).onEdit().create();
  ScriptApp.newTrigger('actualizarTrafico').timeBased().everyMinutes(30).create();
  Logger.log('Disparadores instalados: alEditar y actualizarTrafico cada 30 min');
}
