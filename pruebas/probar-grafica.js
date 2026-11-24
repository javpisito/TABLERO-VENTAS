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

  // Así quedó el 24 de noviembre de 2026, a pedido del analista:
  // - proyectado (azul) cuenta cada venta en el día de su cita: va del día 1 al
  //   último, sube en el día de cada cita y termina en el total del mes;
  // - hasta hoy coincide con facturado (verde), porque lo que ya pasó es lo mismo;
  // - facturado se corta en hoy; de ahí en adelante solo sigue la azul, que muestra
  //   en qué días entra lo que falta.
  const firme = document.querySelector('#grafico .lineaFirme');
  const proy = document.querySelector('#grafico .lineaProyectado');
  const punto = document.querySelector('#grafico .puntoHoy');
  const color = el => getComputedStyle(el).stroke;
  const puntos = el => el.getAttribute('points').trim().split(/\s+/).map(p => p.split(',').map(Number));
  const d = estado.datos, xDia1 = 96 + 886 / d.diasDelMes;
  debe(!document.querySelector('#grafico .lineaPorVenir'), 'facturado termina en la línea de hoy');
  debe(!document.querySelector('#grafico .lineaProyectadoResto'), 'no hay recta punteada');
  if (firme && proy){
    debe(color(firme) === 'rgb(22, 163, 74)', 'facturado va en verde #16A34A');
    debe(color(proy) === 'rgb(37, 99, 235)', 'proyectado va en azul #2563EB');
    debe(getComputedStyle(proy).strokeDasharray === 'none', 'proyectado va continuo');
    const f = puntos(firme), pr = puntos(proy);
    debe(Math.abs(f[0][0] - xDia1) < 0.5 && Math.abs(pr[0][0] - xDia1) < 0.5, 'las dos arrancan el día 1');
    debe(pr.length === d.diasDelMes && Math.abs(pr[pr.length - 1][0] - 982) < 0.5, 'proyectado tiene un punto por día hasta el último');
    debe(punto && f.length === d.dia && Math.abs(f[f.length - 1][0] - parseFloat(punto.getAttribute('cx'))) < 0.5, 'facturado se corta en hoy');
    debe(f.every(([x, y], i) => Math.abs(x - pr[i][0]) < 0.01 && Math.abs(y - pr[i][1]) < 0.01), 'hasta hoy proyectado coincide con facturado');
    // proyectado nunca baja y termina en el total del mes, por día de cita
    debe(pr.every((p, i) => i === 0 || p[1] <= pr[i - 1][1] + 0.01), 'proyectado nunca baja');
    const total = (d.ventas || []).reduce((s, v) => s + (Number(v.monto) || 0), 0);
    const ejeY = [...document.querySelectorAll('#grafico .ejeY')];
    if (total > 0 && ejeY.length) debe(pr[pr.length - 1][1] < f[f.length - 1][1] - 0.01 || d.dia === d.diasDelMes || total === seriesDelMes(d.ventas, d.diasDelMes).facturado[d.dia],
      'de hoy en adelante proyectado sube con las citas que faltan');
  }

  // La cifra de lo que falta: a la derecha de hoy, debajo del punto verde (ahí no
  // hay ninguna línea); si no cabe, se acorta; si ni así, a la izquierda y encima.
  const rotulo = document.querySelector('#grafico .rotuloBrecha');
  if (rotulo && punto){
    const yVerde = parseFloat(punto.getAttribute('cy')), yTexto = parseFloat(rotulo.getAttribute('y'));
    if (rotulo.getAttribute('text-anchor') === 'start') debe(yTexto > yVerde + 15, 'la cifra va debajo del punto de hoy');
    else debe(yTexto < yVerde - 5, 'a la izquierda, la cifra va encima de la línea');
  }
  if (rotulo && d.dia <= d.diasDelMes * 0.6){
    debe(rotulo.getAttribute('text-anchor') === 'start', 'la cifra va a la derecha de hoy cuando cabe');
  }
  if (rotulo){
    const caja = rotulo.getBBox();
    debe(caja.x >= 0 && caja.x + caja.width <= 1000, 'la cifra entra completa en la gráfica');
    const xHoy = parseFloat(document.querySelector('#grafico .lineaHoy').getAttribute('x1'));
    debe(caja.x >= xHoy || caja.x + caja.width <= xHoy, 'la raya de hoy no cruza la cifra');
  }

  return fallas;
})()
