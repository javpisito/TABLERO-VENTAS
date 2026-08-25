/**
 * Proxy entre el televisor y Apps Script.
 *
 * El problema que resuelve: el tablero es HTML estatico, asi que cualquier llave
 * que necesite para pedir los datos le llega al navegador en texto plano. Un .env
 * no lo arregla — un build la incrusta en el bundle igual. La unica salida es que
 * la llave viva en un servidor, y este Worker es ese servidor.
 *
 * El televisor pide aqui SIN llave. El Worker le agrega la llave y llama a
 * Apps Script. La llave nunca sale al cliente.
 *
 * Secretos y variables (se ponen en el panel de Cloudflare, no aqui):
 *
 *   LLAVE_TABLERO    secreto   la misma que esta en Propiedades del script
 *   URL_APPS_SCRIPT  variable  la URL que termina en /exec
 *   ORIGENES         variable  opcional, origenes permitidos separados por coma
 *                              Si esta vacia se permite cualquiera.
 */

// Apps Script se toma unos 4 segundos. Si pasa de esto es que algo se colgo.
var ESPERA_MS = 20000;

export default {
  async fetch(peticion, entorno) {
    var origen = peticion.headers.get('Origin') || '';
    var cors = cabecerasCors(origen, entorno.ORIGENES);

    // El navegador manda OPTIONS antes de algunas peticiones. Se contesta seco.
    if (peticion.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // Solo lectura. Nada de este proxy deberia poder escribir.
    if (peticion.method !== 'GET' && peticion.method !== 'HEAD') {
      return responder({ error: 'metodo', detalle: 'solo GET' }, 405, cors);
    }

    if (!origenPermitido(origen, entorno.ORIGENES)) {
      return responder({ error: 'origen', detalle: 'origen no permitido' }, 403, cors);
    }

    // Los errores de config dicen que variables SI esta viendo el Worker: solo los
    // nombres, nunca los valores. Sin esto, "falta X" no distingue entre un nombre
    // mal escrito y un cambio que quedo sin desplegar, y se va la tarde adivinando.
    var visibles = Object.keys(entorno).sort().join(', ') || '(ninguna)';

    if (!entorno.URL_APPS_SCRIPT) {
      return responder({ error: 'config', detalle: 'falta URL_APPS_SCRIPT', visibles: visibles }, 500, cors);
    }
    if (!entorno.LLAVE_TABLERO) {
      return responder({ error: 'config', detalle: 'falta el secreto LLAVE_TABLERO', visibles: visibles }, 500, cors);
    }

    // Se copian los parametros que manda el tablero (t para saltar cache,
    // callback si cae al fallback JSONP) y se descarta cualquier k que venga
    // de afuera: la llave la pone el Worker, no quien llama.
    var entra = new URL(peticion.url).searchParams;
    var arriba = new URL(entorno.URL_APPS_SCRIPT);
    entra.forEach(function (valor, nombre) {
      if (nombre !== 'k') arriba.searchParams.set(nombre, valor);
    });
    arriba.searchParams.set('k', entorno.LLAVE_TABLERO);

    try {
      // Apps Script /exec responde 302 hacia googleusercontent: hay que seguirlo.
      var r = await fetch(arriba.toString(), {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(ESPERA_MS)
      });

      if (!r.ok) {
        return responder({ error: 'arriba', detalle: 'Apps Script HTTP ' + r.status }, 502, cors);
      }

      // Se devuelve el cuerpo tal cual. Si el tablero pidio JSONP esto es
      // JavaScript y no JSON, asi que el content-type se copia de arriba.
      var salida = new Headers(cors);
      salida.set('Content-Type', r.headers.get('Content-Type') || 'application/json; charset=utf-8');
      // Las cifras del mes cambian cada minuto: nunca servir de cache.
      salida.set('Cache-Control', 'no-store');
      return new Response(r.body, { status: 200, headers: salida });

    } catch (e) {
      var esTiempo = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
      return responder({
        error: 'arriba',
        detalle: esTiempo ? 'Apps Script no contesto en ' + (ESPERA_MS / 1000) + 's' : String(e)
      }, 504, cors);
    }
  }
};

/**
 * Lista blanca de origenes. Vacia = cualquiera.
 *
 * Si ORIGENES esta puesta se exige que el origen calce, incluidas las peticiones
 * que llegan sin cabecera Origin. Dejarlas pasar volvia la lista decorativa:
 * cualquiera con la URL la esquivaba mandando la peticion sin navegador.
 *
 * Para el tablero abierto como archivo local hay que incluir el valor literal
 * 'null', que es el Origin que manda el navegador desde file://.
 */
function origenPermitido(origen, lista) {
  if (!lista) return true;
  var permitidos = lista.split(',').map(function (o) { return o.trim(); });
  return permitidos.indexOf(origen || 'sin-origen') !== -1;
}

function cabecerasCors(origen, lista) {
  var h = new Headers();
  // Se refleja el origen en vez de usar * para que sirva tambien si algun dia
  // el tablero manda credenciales.
  h.set('Access-Control-Allow-Origin', (lista && origen) ? origen : '*');
  h.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  h.set('Access-Control-Max-Age', '86400');
  h.set('Vary', 'Origin');
  return h;
}

/**
 * Los errores salen como JSON y no como pagina de error: el tablero los
 * pinta en la franja roja y un cero silencioso hace que alguien concluya
 * que no hubo ventas.
 */
function responder(cuerpo, estado, cors) {
  var h = new Headers(cors);
  h.set('Content-Type', 'application/json; charset=utf-8');
  h.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: h });
}
