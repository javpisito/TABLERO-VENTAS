/**
 * Pruebas de las series de la gráfica. Corren dentro de la página del tablero,
 * que es donde vive seriesDelMes(): con el tablero abierto, en la consola,
 *
 *   eval(await (await fetch('pruebas/probar-grafica.js')).text())
 *
 * Devuelve la lista de fallas; vacía es que todo pasó.
 */
(() => {
  const fallas = [];
  const debe = (cond, que) => { if (!cond) fallas.push(que); };

  const s = seriesDelMes([
    { monto: 100, dia: 3,  diaVisto: 0 },   // agendada antes del mes
    { monto: 50,  dia: 10, diaVisto: 5 },   // agendada el 5 para el 10
    { monto: 30,  dia: 3,  diaVisto: 20 }   // cita del 3 digitada el 20
  ], 30);
  debe(s.conVisto === true, 'con diaVisto, conVisto es true');
  debe(s.proyectado[1] === 100, 'día 1: solo la agendada antes del mes');
  debe(s.proyectado[3] === 130, 'la digitada tarde cuenta desde su cita');
  debe(s.proyectado[5] === 180, 'día 5: entra la agendada ese día');
  debe(s.facturado[3] === 130 && s.facturado[9] === 130 && s.facturado[10] === 180, 'facturado por día de cita');
  debe(s.proyectado.length === 31 && s.facturado.length === 31, 'arreglos del 0 al 30');
  debe(s.proyectado.every((p, i) => p >= s.facturado[i]), 'facturado nunca supera a proyectado');

  const v = seriesDelMes([{ monto: 10, dia: 2 }], 30);
  debe(v.conVisto === false, 'sin diaVisto, conVisto es false');
  debe(v.proyectado[30] === 0 && v.facturado[30] === 10, 'sin diaVisto no se inventa proyectado');

  const n = seriesDelMes([], 30);
  debe(n.conVisto === true && n.proyectado[30] === 0 && n.facturado[30] === 0, 'mes sin ventas en cero');

  // Pedido del analista el 20 de noviembre de 2026: facturado verde y termina en
  // la línea de hoy; proyectado azul, y es el único que sigue, punteado y plano,
  // con lo que ya está agendado para el resto del mes.
  const firme = document.querySelector('#grafico .lineaFirme');
  const proy = document.querySelector('#grafico .lineaProyectado');
  const resto = document.querySelector('#grafico .lineaProyectadoResto');
  const color = el => getComputedStyle(el).stroke;
  debe(!document.querySelector('#grafico .lineaPorVenir'), 'facturado termina en la línea de hoy');
  if (firme && proy){
    debe(color(firme) === 'rgb(22, 163, 74)', 'facturado va en verde #16A34A');
    debe(color(proy) === 'rgb(37, 99, 235)', 'proyectado va en azul #2563EB');
  }
  if (resto && proy){
    debe(color(resto) === color(proy), 'la punteada de hoy en adelante es la de proyectado');
    debe(getComputedStyle(resto).strokeDasharray !== 'none', 'la de hoy en adelante va punteada');
    debe(parseFloat(getComputedStyle(resto).strokeWidth) >= 3, 'la punteada se alcanza a ver a tres metros');
    debe(getComputedStyle(resto).opacity === '1', 'la punteada no va tenue');
  }

  // El rótulo de la distancia va a la derecha de hoy, debajo de la punteada azul:
  // como facturado termina en hoy, ese lado está libre. A la izquierda, con una
  // distancia chica, quedaba montado sobre la línea de proyectado. Solo al final
  // del mes, donde a la derecha no cabe, va a la izquierda.
  const rotulo = document.querySelector('#grafico .rotuloBrecha');
  if (rotulo && estado.datos && estado.datos.dia <= estado.datos.diasDelMes * 0.8){
    debe(rotulo.getAttribute('text-anchor') === 'start', 'el rótulo de la distancia va a la derecha de hoy');
    const yTexto = parseFloat(rotulo.getAttribute('y'));
    const yPunteada = parseFloat(document.querySelector('#grafico .lineaProyectadoResto').getAttribute('y1'));
    debe(yTexto > yPunteada + 15, 'el rótulo va debajo de la punteada, sin tocarla');
  }

  return fallas;
})()
