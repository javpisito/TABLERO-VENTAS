/**
 * ============================================================================
 * RECOLECTOR · Tablero de ventas SC Ads
 * ============================================================================
 * Va en Extensiones → Apps Script de la hoja CONSOLIDADO.
 *
 * Hace tres cosas:
 *   1. Lee la pestaña SCADS_Ventas de cada cliente y le pone id a lo nuevo
 *   2. Copia todo al Registro, actualizando lo que cambió
 *   3. Sirve el JSON del mes en curso que lee el televisor
 *
 * Montaje: ver la pestaña Instrucciones de la hoja.
 *
 * OJO: al cambiar este archivo hay que publicar una NUEVA VERSIÓN desde
 * Implementar → Gestionar implementaciones. La URL /exec sigue sirviendo la
 * versión anterior hasta que lo hagas.
 * ============================================================================
 */

/**
 * Sube este número cada vez que cambie el archivo. El televisor lo compara contra
 * el que dejó el disparador en la última corrida: si no coinciden es que el código
 * está guardado pero no publicado, que es la forma más común de perder una tarde.
 */
var VERSION = '2026-08-21.6';

var ZONA = 'America/Bogota';

/**
 * El disparador corre cada minuto, pero fuera de este horario la recolección se
 * salta. Abrir cinco hojas 1.440 veces al día se come la cuota diaria de tiempo
 * de ejecución de Apps Script, y de madrugada nadie registra ventas.
 */
var HORARIO = { desde: 6, hasta: 21, domingo: false };

// Utilities.formatDate devuelve los meses en inglés. Aquí no.
var MESES = ['enero','febrero','marzo','abril','mayo','junio',
             'julio','agosto','septiembre','octubre','noviembre','diciembre'];

// Columnas de SCADS_Ventas en la hoja del cliente
var ORIGEN = { id:1, fecha:2, vendedora:3, monto:4, estado:5, producto:6 };
var ENCABEZADOS_ORIGEN = ['id','fecha','vendedora','monto','estado','producto'];

// Columnas del Registro en esta hoja
var REG = { id:1, cliente:2, fecha:3, vendedora:4, monto:5, estado:6, producto:7, visto:8 };
var ANCHO_REG = 8;
var ENCABEZADOS_REG = ['id','cliente','fecha','vendedora','monto','estado','producto','visto_en'];

/* ══════════════════════════════════════════════════════════════
   1. RECOLECCIÓN
   ══════════════════════════════════════════════════════════════ */

/** Esto es lo que llama el disparador cada minuto. */
function recolectar(){
  // El latido se marca siempre, incluso fuera de horario. Es la única forma que
  // tiene el televisor de distinguir "el disparador se murió" de "es de noche y
  // por eso no hay nada nuevo".
  var props = PropertiesService.getScriptProperties();
  props.setProperty('LATIDO', new Date().toISOString());
  props.setProperty('VERSION_RECOLECTOR', VERSION);   // la que corre el disparador
  if (!enHorario()) return { agregadas: 0, avisos: [], dormido: true };

  // Si la pasada anterior todavía está corriendo, esta se salta. Sin el candado,
  // dos pasadas simultáneas leen el mismo getLastRow(), asignan el mismo id y la
  // venta entra dos veces al Registro (y la campana suena dos veces).
  var candado = LockService.getScriptLock();
  if (!candado.tryLock(1000)) return { agregadas: 0, avisos: [], ocupado: true };
  try{
    return recolectarAhora();
  } finally {
    candado.releaseLock();
  }
}

/** La recolección de verdad. Sin horario ni candado: la usa probarMontaje(). */
function recolectarAhora(){
  var libro = SpreadsheetApp.getActive();
  var registro = libro.getSheetByName('Registro');

  // Esto se revisa antes de tocar nada. Escribir con las columnas corridas mete el
  // monto donde va el estado y daña el histórico sin que nadie se dé cuenta, así que
  // se prefiere no recoger nada.
  var malRegistro = revisarRegistro(registro);
  if (malRegistro){
    PropertiesService.getScriptProperties()
      .setProperty('AVISOS_RECOLECTOR', JSON.stringify([malRegistro]));
    return { agregadas: 0, avisos: [malRegistro] };
  }

  var fuentes = leerTabla(libro.getSheetByName('Fuentes'))
    .filter(function(f){ return String(f.activo).toLowerCase() === 'si' && f.id_hoja; });

  var yaEstan = indiceDelRegistro(registro);
  var porAgregar = [];
  var avisos = [];
  var vistos = {};   // cliente -> { id: true }. Solo de las hojas que sí abrieron.

  fuentes.forEach(function(f){
    try{
      var libroCliente = SpreadsheetApp.openById(String(f.id_hoja).trim());
      var hoja = libroCliente.getSheetByName(String(f.pestana || 'SCADS_Ventas').trim());
      if (!hoja){ avisos.push('No encontré la pestaña de ' + f.cliente); return; }
      // Cada hoja puede estar en su propia zona horaria; la fecha se lee en la suya.
      var zonaCliente = libroCliente.getSpreadsheetTimeZone() || ZONA;

      // Las columnas se leen por posición, así que una hoja con otro orden daría
      // cifras equivocadas en silencio. Mejor no recogerla y decirlo.
      var problema = revisarEncabezados(hoja);
      if (problema){ avisos.push('La hoja de ' + f.cliente + ': ' + problema); return; }

      // Se marca aquí, antes de mirar si hay filas: una hoja que abrió y quedó
      // vacía es información válida (borraron todo), no una hoja ilegible.
      vistos[f.cliente] = {};
      if (hoja.getLastRow() < 2) return;

      var n = hoja.getLastRow() - 1;
      var datos = hoja.getRange(2, 1, n, ENCABEZADOS_ORIGEN.length).getValues();
      var ids = hoja.getRange(2, ORIGEN.id, n, 1).getValues();
      var consecutivo = mayorConsecutivo(ids, f.prefijo);
      var hayIdsNuevos = false;

      datos.forEach(function(fila, i){
        var fecha = fila[ORIGEN.fecha - 1];
        var vendedora = String(fila[ORIGEN.vendedora - 1] || '').trim();
        var monto = Number(fila[ORIGEN.monto - 1]) || 0;

        // Una fila a medio llenar se ignora, y el monto cuenta como parte de estar
        // llena: la pasada corre cada minuto y alcanza a tomar la fila mientras la
        // están escribiendo. Le ponía id y la campana sonaba con "$ 0", y como la
        // venta ya quedaba "vista", nunca volvía a sonar con el valor real.
        if (!fecha || !vendedora || monto <= 0) return;

        // Se guarda al mediodía para que ninguna diferencia de zona entre la hoja
        // del cliente y la consolidada la corra al día anterior.
        var dia = fechaDelDia(fecha, zonaCliente);
        if (!dia) return;

        var id = String(fila[ORIGEN.id - 1] || '').trim();
        if (!id){
          consecutivo++;
          id = f.prefijo + '-' + ('000000' + consecutivo).slice(-6);
          ids[i][0] = id;
          hayIdsNuevos = true;
        }
        vistos[f.cliente][id] = true;

        var registroFila = [
          id, f.cliente, dia, vendedora, monto,
          normalizarEstado(fila[ORIGEN.estado - 1]),
          String(fila[ORIGEN.producto - 1] || ''), new Date()
        ];

        if (!yaEstan[id]) porAgregar.push(registroFila);
        else actualizarSiCambio(registro, yaEstan[id], registroFila);
      });

      if (hayIdsNuevos){
        try{
          hoja.getRange(2, ORIGEN.id, n, 1).setValues(ids);
        } catch (err){
          avisos.push('Sin permiso de edición en la hoja de ' + f.cliente);
        }
      }
    } catch (err){
      delete vistos[f.cliente];   // no se concluye nada de una hoja que no se pudo leer
      avisos.push('No pude leer la hoja de ' + f.cliente);
      Logger.log(f.cliente + ': ' + err);
    }
  });

  if (porAgregar.length){
    registro.getRange(registro.getLastRow() + 1, 1, porAgregar.length, ANCHO_REG)
            .setValues(porAgregar);
  }

  avisarDesaparecidas(registro, vistos).forEach(function(a){ avisos.push(a); });

  var props = PropertiesService.getScriptProperties();
  props.setProperty('AVISOS_RECOLECTOR', JSON.stringify(unicos(avisos)));
  props.setProperty('ULTIMA_RECOLECCION', new Date().toISOString());
  return { agregadas: porAgregar.length, avisos: unicos(avisos) };
}

/** 'CUC-000001' → 'CUC'. Es lo que amarra una venta con su cliente para siempre. */
function prefijoDe(id){
  var t = String(id || '');
  var i = t.indexOf('-');
  return i > 0 ? t.slice(0, i) : t;
}

/** El Registro de esta hoja. Devuelve el problema como texto, o null si está bien. */
function revisarRegistro(registro){
  if (!registro) return 'No existe la pestaña Registro en la hoja consolidada';
  var fila = registro.getRange(1, 1, 1, ANCHO_REG).getValues()[0]
    .map(function(x){ return String(x || '').trim().toLowerCase(); });
  for (var i = 0; i < ENCABEZADOS_REG.length; i++){
    if (fila[i] !== ENCABEZADOS_REG[i]){
      return 'El Registro tiene "' + (fila[i] || '(vacío)') + '" en la columna ' + (i + 1)
           + ' y debería tener "' + ENCABEZADOS_REG[i] + '"'
           + (fila[i] === 'abono' ? ': el abono ya no se usa, borra esa columna' : '')
           + '. No estoy recogiendo nada hasta que cuadre, para no dañar el histórico';
    }
  }
  return null;
}

/**
 * Las seis columnas en el mismo orden. Se leen por posición, así que una hoja con
 * otro orden daría cifras equivocadas en silencio: mejor no recogerla y decirlo.
 */
function revisarEncabezados(hoja){
  if (hoja.getLastColumn() < ENCABEZADOS_ORIGEN.length){
    return 'le faltan columnas, esperaba ' + ENCABEZADOS_ORIGEN.join(' | ');
  }
  var fila = hoja.getRange(1, 1, 1, ENCABEZADOS_ORIGEN.length).getValues()[0];
  for (var i = 0; i < ENCABEZADOS_ORIGEN.length; i++){
    if (String(fila[i] || '').trim().toLowerCase() !== ENCABEZADOS_ORIGEN[i]){
      return 'la columna ' + (i + 1) + ' dice "' + fila[i]
           + '" y debería decir "' + ENCABEZADOS_ORIGEN[i] + '"';
    }
  }
  return null;
}

function indiceDelRegistro(registro){
  var indice = {};
  if (registro.getLastRow() < 2) return indice;
  var ids = registro.getRange(2, REG.id, registro.getLastRow() - 1, 1).getValues();
  ids.forEach(function(f, i){
    if (f[0]) indice[String(f[0])] = i + 2;
  });
  return indice;
}

/** Solo escribe si algo cambió: evita reescribir 500 filas cada minuto. */
function actualizarSiCambio(registro, fila, nueva){
  var actual = registro.getRange(fila, 1, 1, ANCHO_REG).getValues()[0];
  var cambio = String(actual[REG.estado - 1]) !== String(nueva[REG.estado - 1])
            || Number(actual[REG.monto - 1]) !== Number(nueva[REG.monto - 1])
            || String(actual[REG.fecha - 1]) !== String(nueva[REG.fecha - 1])
            || String(actual[REG.cliente - 1]) !== String(nueva[REG.cliente - 1])
            || String(actual[REG.producto - 1]) !== String(nueva[REG.producto - 1]);
  if (!cambio) return;
  // Incluye el cliente: si lo renombraron en Fuentes, el Registro se pone al día solo
  // y deja de mostrar el nombre viejo a quien vaya a revisar la hoja.
  registro.getRange(fila, REG.cliente, 1, 6)
          .setValues([[nueva[1], nueva[2], nueva[3], nueva[4], nueva[5], nueva[6]]]);
}

/**
 * Una venta que alguien borró de la hoja del cliente se queda para siempre en el
 * Registro y sigue sumando en el televisor. No se borra sola: sale como aviso y
 * el analista decide. Se revisan solo las del mes en curso, y solo de las hojas
 * que sí se pudieron leer en esta pasada.
 */
function avisarDesaparecidas(registro, vistos){
  var avisos = [];
  if (registro.getLastRow() < 2) return avisos;
  var filas = registro.getRange(2, 1, registro.getLastRow() - 1, ANCHO_REG).getValues();
  var zonaHoja = zonaDeLaHoja();
  var mesActual = mesClave(new Date(), ZONA);
  var faltan = {};

  filas.forEach(function(r){
    var cliente = String(r[REG.cliente - 1]);
    var id = String(r[REG.id - 1]);
    if (!id || !vistos[cliente]) return;
    if (normalizarEstado(r[REG.estado - 1]) === 'Anulada') return;
    if (mesClave(r[REG.fecha - 1], zonaHoja) !== mesActual) return;
    if (!vistos[cliente][id]) faltan[cliente] = (faltan[cliente] || 0) + 1;
  });

  Object.keys(faltan).forEach(function(c){
    avisos.push('El Registro tiene ' + faltan[c] + ' venta(s) de ' + c
              + ' que ya no están en su hoja: alguien borró la fila');
  });
  return avisos;
}

function mayorConsecutivo(ids, prefijo){
  var max = 0;
  var patron = new RegExp('^' + escaparRegex(String(prefijo)) + '-(\\d+)$');
  ids.forEach(function(f){
    var m = patron.exec(String(f[0]).trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return max;
}

/* ══════════════════════════════════════════════════════════════
   2. INVERSIÓN DESDE META  ·  fase 2
   ══════════════════════════════════════════════════════════════ */

var API = 'v21.0';
var TIPOS_INTERACCION = ['post_engagement',
                         'onsite_conversion.messaging_conversation_started_7d'];

function actualizarTrafico(){
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('META_TOKEN');
  if (!token){ props.setProperty('AVISO_META', ''); return; }

  var libro = SpreadsheetApp.getActive();
  var fuentes = leerTabla(libro.getSheetByName('Fuentes'))
    .filter(function(f){ return String(f.activo).toLowerCase() === 'si' && f.cuenta_meta; });

  var filas = [], avisos = [];
  var desde = Utilities.formatDate(inicioDelMes(), ZONA, 'yyyy-MM-dd');
  var hasta = Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd');

  fuentes.forEach(function(f){
    var cuenta = String(f.cuenta_meta).trim();
    if (cuenta.indexOf('act_') !== 0) cuenta = 'act_' + cuenta;
    var url = 'https://graph.facebook.com/' + API + '/' + cuenta + '/insights'
            + '?fields=spend,reach,actions&level=account'
            + '&time_range=' + encodeURIComponent(JSON.stringify({ since: desde, until: hasta }))
            + '&access_token=' + encodeURIComponent(token);
    try{
      var cuerpo = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions:true }).getContentText());
      if (cuerpo.error){
        // 190 = token vencido o revocado. Es el aviso que sale en el televisor.
        if (cuerpo.error.code === 190) avisos.push('El token de Meta se venció: la inversión está desactualizada');
        else avisos.push('Meta rechazó la consulta de ' + f.cliente);
        Logger.log(cuerpo.error.message);
        return;
      }
      var d = (cuerpo.data && cuerpo.data[0]) || {};
      filas.push([f.cliente, Number(d.spend) || 0, Number(d.reach) || 0,
                  contarInteracciones(d.actions), new Date()]);
    } catch (err){
      avisos.push('No pude consultar la inversión de ' + f.cliente);
    }
  });

  var hoja = libro.getSheetByName('Trafico');
  if (hoja.getLastRow() > 1) hoja.getRange(2, 1, hoja.getLastRow() - 1, 5).clearContent();
  if (filas.length) hoja.getRange(2, 1, filas.length, 5).setValues(filas);
  // Un token vencido falla en las cinco cuentas: el mismo aviso no se repite.
  props.setProperty('AVISO_META', unicos(avisos).join(' · '));
}

function contarInteracciones(acciones){
  if (!acciones) return 0;
  return acciones.reduce(function(s, a){
    return s + (TIPOS_INTERACCION.indexOf(a.action_type) !== -1 ? Number(a.value) || 0 : 0);
  }, 0);
}

/** Diagnóstico: imprime los action_type reales de la primera cuenta configurada. */
function verTiposDeAccion(){
  var token = PropertiesService.getScriptProperties().getProperty('META_TOKEN');
  var f = leerTabla(SpreadsheetApp.getActive().getSheetByName('Fuentes'))
    .filter(function(x){ return x.cuenta_meta; })[0];
  if (!f){ Logger.log('Todavía no hay cuentas en Fuentes'); return; }
  var cuenta = String(f.cuenta_meta).trim();
  if (cuenta.indexOf('act_') !== 0) cuenta = 'act_' + cuenta;
  var url = 'https://graph.facebook.com/' + API + '/' + cuenta + '/insights'
          + '?fields=actions&date_preset=last_30d&level=account&access_token=' + encodeURIComponent(token);
  var cuerpo = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions:true }).getContentText());
  if (cuerpo.error){ Logger.log('Error: ' + cuerpo.error.message); return; }
  ((cuerpo.data && cuerpo.data[0] && cuerpo.data[0].actions) || [])
    .forEach(function(a){ Logger.log(a.action_type + '  =  ' + a.value); });
}

/* ══════════════════════════════════════════════════════════════
   3. PLATA: CÓMO SE REPARTE UNA VENTA
   ══════════════════════════════════════════════════════════════ */

/**
 * Lo único que se tiene en cuenta es lo que vale el procedimiento, y lo único que
 * decide es la fecha de la cita.
 *
 *   proyectado  =  el monto, siempre. Es todo lo del mes
 *   facturado   =  el monto, pero solo si la cita ya pasó
 *   Anulada     =  no cuenta en ninguna de las dos
 *
 *   hoy 21 · cita del 18, monto 1M  →  facturado 1M   proyectado 1M
 *   hoy 21 · cita del 22, monto 1M  →  facturado  0   proyectado 1M
 *
 * Lo facturado va siempre por dentro de lo proyectado, y por eso las dos cifras se
 * encuentran el último día del mes: cuando ya no quedan citas por delante.
 *
 * El estado no mueve plata. Solo 'Anulada' saca la venta de las dos cifras;
 * 'Agendada' y 'Facturada' quedan como información para el equipo, porque el día
 * de la cita ya dice todo lo que el tablero necesita saber.
 */
function repartir(r, hoy, zona){
  var monto = Number(r.monto) || 0;
  if (normalizarEstado(r.estado) === 'Anulada') return { facturado: 0, proyectado: 0 };
  var dia = diaClave(r.fecha, zona);    // 'yyyy-MM-dd', se comparan como texto
  return { facturado: (dia !== '' && dia <= hoy) ? monto : 0, proyectado: monto };
}

/* ══════════════════════════════════════════════════════════════
   4. ENDPOINT DEL TELEVISOR
   ══════════════════════════════════════════════════════════════ */

function doGet(e){
  var props = PropertiesService.getScriptProperties();
  var llave = props.getProperty('LLAVE_TABLERO');
  var enviada = (e && e.parameter && e.parameter.k) || '';
  if (llave && enviada !== llave) return responder({ error: 'llave' }, e);

  var libro = SpreadsheetApp.getActive();
  var ahora = new Date();
  // El mes y el "hoy" son los de la oficina; las fechas del Registro se leen en la
  // zona de esta hoja, que es donde quedaron guardadas.
  var zonaHoja = zonaDeLaHoja();
  var mesActual = mesClave(ahora, ZONA);
  var hoy = diaClave(ahora, ZONA);

  // Todo el mes, del 1 al 31. Una venta del 3 de agosto registrada el 20 cuenta
  // igual: lo que manda es la fecha de la venta, no cuándo la escribieron.
  var delMes = leerTabla(libro.getSheetByName('Registro'))
    .map(function(r){ r.estado = normalizarEstado(r.estado); return r; })
    .filter(function(r){
      if (!r.id || !r.fecha) return false;
      if (r.estado === 'Anulada') return false;
      return mesClave(r.fecha, zonaHoja) === mesActual;
    });

  var fuentes = leerTabla(libro.getSheetByName('Fuentes'))
    .filter(function(f){ return String(f.activo).toLowerCase() === 'si'; });
  var trafico = leerTabla(libro.getSheetByName('Trafico'));

  // Se agrupa por el PREFIJO del id (CUC-000001 → CUC), no por el nombre. El nombre
  // se cambia en Fuentes cuando se les da la gana — "Dr Jacobo" pasó a "Dr. Jacobo
  // Cucalón" — y las filas viejas del Registro quedaban huérfanas: el cliente
  // mostraba cero y la plata seguía contando en la vendedora. El prefijo no cambia.
  var clientes = fuentes.map(function(f){
    var pref = String(f.prefijo || '').trim();
    var mias = delMes.filter(function(r){ return prefijoDe(r.id) === pref; });
    var t = trafico.filter(function(x){ return x.cliente === f.cliente; })[0];
    var plata = sumarReparto(mias, hoy, zonaHoja);
    return {
      cliente: f.cliente,
      facturado: plata.facturado,
      proyectado: plata.proyectado,
      ventas: mias.length,
      inversion: t ? Number(t.inversion) || 0 : 0,
      metaMes: Number(f.meta_mes) || 0
    };
  });

  var porVendedora = {};
  delMes.forEach(function(r){
    var v = porVendedora[r.vendedora] || { vendedora: r.vendedora, facturado:0, proyectado:0, ventas:0 };
    var plata = repartir(r, hoy, zonaHoja);
    v.facturado += plata.facturado;
    v.proyectado += plata.proyectado;
    v.ventas++;
    porVendedora[r.vendedora] = v;
  });
  // Se ordena por el total del mes. Sumar facturado + proyectado contaría dos
  // veces la misma plata, porque lo facturado ya está adentro de lo proyectado.
  var vendedoras = Object.keys(porVendedora).map(function(k){ return porVendedora[k]; })
    .sort(function(a, b){ return (b.proyectado - a.proyectado) || (b.facturado - a.facturado); });

  var avisos = [];
  try{ avisos = JSON.parse(props.getProperty('AVISOS_RECOLECTOR') || '[]'); } catch (err){}
  var avisoMeta = props.getProperty('AVISO_META');
  if (avisoMeta) avisos.push(avisoMeta);
  if (!llave) avisos.push('Falta guardar LLAVE_TABLERO: el endpoint está abierto a cualquiera');

  // Si una venta del mes no cae en ningún cliente, los totales no cuadran y nadie se
  // entera. Pasa si alguien cambió un prefijo en Fuentes o desactivó un cliente.
  var conocidos = {};
  fuentes.forEach(function(f){ conocidos[String(f.prefijo || '').trim()] = true; });
  var sueltas = {};
  delMes.forEach(function(r){
    var pref = prefijoDe(r.id);
    if (!conocidos[pref]) sueltas[pref] = (sueltas[pref] || 0) + 1;
  });
  Object.keys(sueltas).forEach(function(pref){
    avisos.push(sueltas[pref] + ' venta(s) con prefijo "' + pref
              + '" no le pertenecen a ningún cliente activo de Fuentes: no están sumando');
  });

  // El disparador corre el código guardado; /exec sirve el código publicado. Si no
  // son el mismo, alguien guardó y se le olvidó publicar la versión nueva.
  var versionDisparador = props.getProperty('VERSION_RECOLECTOR') || '';
  if (versionDisparador && versionDisparador !== VERSION){
    avisos.push('El script guardado (' + versionDisparador + ') no es el publicado ('
              + VERSION + '): falta publicar una versión nueva');
  }

  return responder({
    version: VERSION,                                  // la publicada, la que sirve esto
    versionRecolector: versionDisparador,              // la que corre el disparador
    actualizado: ahora.toISOString(),
    recolectado: props.getProperty('ULTIMA_RECOLECCION') || '',
    // La edad la calcula el servidor: el reloj del televisor puede estar corrido
    // y un desfase de minutos daría un aviso rojo falso todo el día.
    latidoHaceMin: minutosDesde(props.getProperty('LATIDO')),
    dormido: !enHorario(),
    // Para que el televisor sepa distinguir "Meta sin conectar" de "invirtió cero".
    metaConectada: !!props.getProperty('META_TOKEN'),
    mes: MESES[Number(Utilities.formatDate(ahora, ZONA, 'M')) - 1]
       + ' ' + Utilities.formatDate(ahora, ZONA, 'yyyy'),
    // El día lo calcula el servidor. El televisor no vuelve a parsear fechas:
    // ahí fue donde se coló el corrimiento de zona la vez pasada.
    dia: Number(hoy.slice(-2)),
    diasDelMes: diasDelMes(ahora, ZONA),
    totales: {
      facturado: clientes.reduce(function(s, c){ return s + c.facturado; }, 0),
      proyectado: clientes.reduce(function(s, c){ return s + c.proyectado; }, 0),
      inversion: clientes.reduce(function(s, c){ return s + c.inversion; }, 0)
    },
    clientes: clientes,
    vendedoras: vendedoras,
    ventas: delMes.map(function(r){
      return {
        id: String(r.id), cliente: String(r.cliente), vendedora: String(r.vendedora),
        monto: Number(r.monto) || 0,
        estado: String(r.estado), producto: String(r.producto || ''),
        ts: aISO(r.fecha),
        dia: Number(diaClave(r.fecha, zonaHoja).slice(-2)) || 0
      };
    }),
    avisos: unicos(avisos)
  }, e);
}

function responder(objeto, e){
  var carga = JSON.stringify(objeto);
  var cb = e && e.parameter && e.parameter.callback;
  if (cb){
    return ContentService.createTextOutput(cb + '(' + carga + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(carga).setMimeType(ContentService.MimeType.JSON);
}

function sumarReparto(filas, hoy, zona){
  return filas.reduce(function(s, r){
    var p = repartir(r, hoy, zona);
    s.facturado += p.facturado;
    s.proyectado += p.proyectado;
    return s;
  }, { facturado: 0, proyectado: 0 });
}

/* ══════════════════════════════════════════════════════════════
   AUXILIARES
   ══════════════════════════════════════════════════════════════ */

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

/**
 * Un 'facturada' en minúscula escrito a mano rompía las cuentas: sumaba en la
 * vendedora pero no en el cliente, y los totales dejaban de cuadrar. Todo lo que
 * no sea Facturada o Anulada se trata como Agendada.
 */
function normalizarEstado(v){
  var s = String(v || '').trim().toLowerCase();
  if (s === 'facturada') return 'Facturada';
  if (s === 'anulada') return 'Anulada';
  return 'Agendada';
}

/** ¿Toca recolectar ahora? Ver HORARIO arriba. */
function enHorario(){
  var ahora = new Date();
  var hora = Number(Utilities.formatDate(ahora, ZONA, 'H'));
  var dia = Number(Utilities.formatDate(ahora, ZONA, 'u'));   // 1 lunes … 7 domingo
  if (!HORARIO.domingo && dia === 7) return false;
  return hora >= HORARIO.desde && hora < HORARIO.hasta;
}

/**
 * La fecha de una celda es un DÍA DEL CALENDARIO que alguien escribió, no un
 * instante. Google la guarda como medianoche en la zona de esa hoja, y las hojas
 * de Apps Script no siempre quedan en Bogotá: una hoja en UTC-4 guarda el 22 como
 * las 04:00 UTC, que releído en Bogotá son las 23:00 del 21. La cita del 22
 * aparecía como ya pasada y sumaba a facturado un día antes.
 *
 * Guardada al mediodía aguanta ±11 horas de diferencia sin cambiarse de día.
 */
function fechaDelDia(v, zona){
  var d = (v instanceof Date) ? v : new Date(v);
  if (isNaN(d.getTime())) return null;
  var p = Utilities.formatDate(d, zona || ZONA, 'yyyy-MM-dd').split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0);
}

/** Cuántos días tiene el mes de esa fecha. */
function diasDelMes(fecha, zona){
  var y = Number(Utilities.formatDate(fecha, zona || ZONA, 'yyyy'));
  var m = Number(Utilities.formatDate(fecha, zona || ZONA, 'M'));
  return new Date(y, m, 0).getDate();
}

/** La zona de esta hoja de cálculo, que no siempre es la de la oficina. */
function zonaDeLaHoja(){
  try{ return SpreadsheetApp.getActive().getSpreadsheetTimeZone() || ZONA; }
  catch (err){ return ZONA; }
}

/** 'yyyy-MM' del día que representa esa celda. */
function mesClave(v, zona){
  var d = (v instanceof Date) ? v : new Date(v);
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, zona || ZONA, 'yyyy-MM');
}

/** 'yyyy-MM-dd' del día que representa esa celda. */
function diaClave(v, zona){
  var d = (v instanceof Date) ? v : new Date(v);
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, zona || ZONA, 'yyyy-MM-dd');
}

function inicioDelMes(){
  var h = new Date();
  return new Date(h.getFullYear(), h.getMonth(), 1);
}

function aISO(v){
  if (v instanceof Date) return v.toISOString();
  var d = new Date(v);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/** Minutos desde una marca ISO. -1 si nunca se marcó (recién montado). */
function minutosDesde(iso){
  if (!iso) return -1;
  var t = new Date(iso).getTime();
  if (isNaN(t)) return -1;
  return Math.round((new Date().getTime() - t) / 60000);
}

function unicos(lista){
  var vistos = {}, salida = [];
  lista.forEach(function(x){ if (x && !vistos[x]){ vistos[x] = true; salida.push(x); } });
  return salida;
}

function escaparRegex(s){
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function instalarDisparadores(){
  ScriptApp.getProjectTriggers().forEach(function(t){ ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('recolectar').timeBased().everyMinutes(1).create();
  ScriptApp.newTrigger('actualizarTrafico').timeBased().everyMinutes(30).create();
  Logger.log('Listo: recolectar cada minuto (solo de '
    + HORARIO.desde + ':00 a ' + HORARIO.hasta + ':00, '
    + (HORARIO.domingo ? 'todos los días' : 'lunes a sábado') + '), '
    + 'actualizarTrafico cada 30 minutos');
}

/* ══════════════════════════════════════════════════════════════
   RADIOGRAFÍA · sirve para ver las hojas reales de los clientes
   ══════════════════════════════════════════════════════════════
   Solo lee. No escribe absolutamente nada en ninguna hoja.
   Imprime, por cada cliente, todas sus pestañas con las primeras
   filas y el tipo real de cada celda.
   ══════════════════════════════════════════════════════════════ */

var RADIOGRAFIA = { filas: 4, columnas: 12, largoTexto: 24 };

function radiografiarHojas(){
  var fuentes = leerTabla(SpreadsheetApp.getActive().getSheetByName('Fuentes'))
    .filter(function(f){ return f.id_hoja; });

  if (!fuentes.length){
    Logger.log('La pestaña Fuentes no tiene ningún id_hoja. Llénala primero.');
    return;
  }

  fuentes.forEach(function(f){
    Logger.log('');
    Logger.log('════════════════  ' + f.cliente + '  ════════════════');
    try{
      var libro = SpreadsheetApp.openById(String(f.id_hoja).trim());
      libro.getSheets().forEach(function(hoja){
        var filas = hoja.getLastRow(), cols = hoja.getLastColumn();
        Logger.log('  ── pestaña "' + hoja.getName() + '"   ('
                   + filas + ' filas × ' + cols + ' columnas)');
        if (filas < 1 || cols < 1){ Logger.log('     vacía'); return; }
        var n = Math.min(RADIOGRAFIA.filas, filas);
        var m = Math.min(RADIOGRAFIA.columnas, cols);
        hoja.getRange(1, 1, n, m).getValues().forEach(function(fila, i){
          Logger.log('     fila ' + (i + 1) + ':  '
                     + fila.map(describir).join('  |  '));
        });
        if (cols > m) Logger.log('     (hay ' + (cols - m) + ' columnas más a la derecha)');
      });
    } catch (err){
      Logger.log('  No pude abrir esta hoja: ' + err);
    }
  });

  Logger.log('');
  Logger.log('Listo. Copia todo este registro y mándalo para armar el mapeo.');
}

/** Marca el tipo real de la celda: es lo que decide si el mapeo es posible. */
function describir(v){
  if (v === '' || v === null || v === undefined) return '(vacío)';
  if (v instanceof Date) return 'FECHA(' + Utilities.formatDate(v, ZONA, 'yyyy-MM-dd') + ')';
  if (typeof v === 'number') return 'NUM(' + v + ')';
  if (typeof v === 'boolean') return 'BOOL(' + v + ')';
  var t = String(v).replace(/\s+/g, ' ').trim();
  if (t.length > RADIOGRAFIA.largoTexto) t = t.slice(0, RADIOGRAFIA.largoTexto) + '…';
  return '"' + t + '"';
}

/* ══════════════════════════════════════════════════════════════
   RADIOGRAFÍA DEL MES EN CURSO
   ══════════════════════════════════════════════════════════════
   Requiere que la columna 'pestana' de Fuentes tenga el nombre EXACTO
   de la pestaña del mes actual en cada cliente. Ejemplo: "Agosto 26".

   Imprime TODAS las columnas con el tipo real de los datos y los
   valores distintos de las columnas de texto. Solo lee.
   ══════════════════════════════════════════════════════════════ */

function radiografiarMesActual(){
  var fuentes = leerTabla(SpreadsheetApp.getActive().getSheetByName('Fuentes'))
    .filter(function(f){ return f.id_hoja; });

  fuentes.forEach(function(f){
    Logger.log('');
    Logger.log('════════════════  ' + f.cliente + '  ════════════════');
    var libro, hoja;
    try{
      libro = SpreadsheetApp.openById(String(f.id_hoja).trim());
      hoja = libro.getSheetByName(String(f.pestana || '').trim());
    } catch (err){
      Logger.log('  No pude abrir la hoja: ' + err);
      return;
    }
    if (!hoja){
      Logger.log('  No existe la pestaña "' + f.pestana + '". Las que hay son:');
      libro.getSheets().forEach(function(h){ Logger.log('     · ' + h.getName()); });
      return;
    }

    var filas = hoja.getLastRow(), cols = hoja.getLastColumn();
    var n = Math.min(filas - 1, 60);
    Logger.log('  pestaña "' + hoja.getName() + '"  ·  ' + filas + ' filas × ' + cols + ' columnas');
    Logger.log('  (analizando las primeras ' + n + ' filas de datos)');
    if (n < 1){ Logger.log('  Sin datos'); return; }

    var datos = hoja.getRange(1, 1, n + 1, cols).getValues();
    var encabezados = datos.shift();

    for (var c = 0; c < cols; c++){
      var conteo = { FECHA:0, NUM:0, TEXTO:0, BOOL:0, vacio:0 };
      var valores = {}, distintos = 0;
      for (var r = 0; r < datos.length; r++){
        var v = datos[r][c];
        var tipo = tipoDe(v);
        conteo[tipo]++;
        if (tipo === 'TEXTO' && distintos < 40){
          var t = String(v).trim();
          if (t.length <= 30){
            if (valores[t] === undefined){ valores[t] = 0; distintos++; }
            valores[t]++;
          }
        }
      }
      var partes = [];
      ['FECHA','NUM','TEXTO','BOOL','vacio'].forEach(function(k){
        if (conteo[k]) partes.push(k + ' ' + conteo[k]);
      });
      var mezcla = (conteo.FECHA ? 1:0) + (conteo.NUM ? 1:0) + (conteo.TEXTO ? 1:0) > 1;
      var titulo = String(encabezados[c] || '').trim() || '(sin encabezado)';
      Logger.log('  [' + ('0' + (c + 1)).slice(-2) + '] "' + titulo + '"   '
                 + partes.join(' · ') + (mezcla ? '   <<< TIPOS MEZCLADOS' : ''));

      if (distintos > 0 && distintos <= 15){
        var lista = Object.keys(valores)
          .sort(function(a, b){ return valores[b] - valores[a]; })
          .slice(0, 10)
          .map(function(k){ return k + '(' + valores[k] + ')'; });
        Logger.log('        valores: ' + lista.join('  ·  '));
      }
    }
  });

  Logger.log('');
  Logger.log('Listo. Copia todo el registro y mándalo.');
}

function tipoDe(v){
  if (v === '' || v === null || v === undefined) return 'vacio';
  if (v instanceof Date) return 'FECHA';
  if (typeof v === 'number') return 'NUM';
  if (typeof v === 'boolean') return 'BOOL';
  return 'TEXTO';
}

/* ══════════════════════════════════════════════════════════════
   PRUEBA DE MONTAJE
   ══════════════════════════════════════════════════════════════ */

/**
 * Corre esta función antes de conectar el televisor. Revisa lo que casi siempre
 * está mal en esta fase: pestañas con otro nombre, columnas que no coinciden,
 * ids de hoja mal pegados y permisos de edición.
 */
function probarMontaje(){
  var libro = SpreadsheetApp.getActive();
  var faltan = ['Fuentes','Registro','Trafico'].filter(function(n){
    return !libro.getSheetByName(n);
  });
  if (faltan.length){
    Logger.log('FALTA la pestaña: ' + faltan.join(', ') + '. Revisa la hoja consolidada.');
    return;
  }

  var malRegistro = revisarRegistro(libro.getSheetByName('Registro'));
  if (malRegistro) Logger.log('PROBLEMA: ' + malRegistro);

  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('LLAVE_TABLERO')){
    Logger.log('AVISO: no hay LLAVE_TABLERO en Propiedades del script. El endpoint queda abierto.');
  }

  var fuentes = leerTabla(libro.getSheetByName('Fuentes'))
    .filter(function(f){ return String(f.activo).toLowerCase() === 'si'; });
  if (!fuentes.length){
    Logger.log('Fuentes no tiene ninguna fila con activo = Si.');
    return;
  }
  fuentes.forEach(function(f){
    if (!f.id_hoja){ Logger.log('Sin id_hoja: ' + f.cliente); return; }
    if (!f.prefijo) Logger.log('Sin prefijo: ' + f.cliente + ' (los ids saldrían como "undefined-000001")');
    try{
      var libroCliente = SpreadsheetApp.openById(String(f.id_hoja).trim());
      var hoja = libroCliente.getSheetByName(String(f.pestana || 'SCADS_Ventas').trim());
      if (!hoja){ Logger.log(f.cliente + ': no existe la pestaña "' + f.pestana + '"'); return; }
      var mal = revisarEncabezados(hoja);
      var zc = libroCliente.getSpreadsheetTimeZone();
      Logger.log(f.cliente + ': ' + (mal ? 'PROBLEMA · ' + mal : 'columnas bien')
               + '  ·  zona ' + zc + (zc === ZONA ? '' : '  <<< NO ES ' + ZONA));
    } catch (err){
      Logger.log(f.cliente + ': no pude abrir la hoja · ' + err);
    }
  });

  var zh = zonaDeLaHoja();
  Logger.log('Zona de la hoja consolidada: ' + zh
    + (zh === ZONA ? '  (bien)' : '  <<< debería ser ' + ZONA
       + '. Las fechas se leen bien igual, pero el Registro las muestra corridas)'));
  Logger.log('Zona del proyecto de Apps Script: ' + Session.getScriptTimeZone());

  Logger.log('Horario de recolección: ' + HORARIO.desde + ':00 a ' + HORARIO.hasta
    + ':00, ' + (HORARIO.domingo ? 'todos los días' : 'lunes a sábado')
    + '. Ahora mismo ' + (enHorario() ? 'está dentro.' : 'está FUERA (esta prueba corre igual).'));

  var r = recolectarAhora();
  Logger.log('Ventas nuevas encontradas: ' + r.agregadas);
  if (r.avisos.length) r.avisos.forEach(function(a){ Logger.log('AVISO: ' + a); });
  else Logger.log('Las cinco hojas respondieron bien');
}
