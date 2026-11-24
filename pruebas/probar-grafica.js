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
  // - las dos líneas arrancan el día 1 con su valor, no desde cero;
  // - facturado (verde) sube hasta hoy, se corta ahí y va siempre por debajo;
  // - proyectado (azul) es continuo hasta el último día: lo agendado cada día hasta
  //   hoy y, de ahí al final, plano con el total agendado. Sin recta ni punteada.
  const firme = document.querySelector('#grafico .lineaFirme');
  const proy = document.querySelector('#grafico .lineaProyectado');
  const punto = document.querySelector('#grafico .puntoHoy');
  const color = el => getComputedStyle(el).stroke;
  const puntos = el => el.getAttribute('points').trim().split(/\s+/).map(p => p.split(',').map(Number));
  const xDia1 = 96 + 886 / estado.datos.diasDelMes;
  debe(!document.querySelector('#grafico .lineaPorVenir'), 'facturado termina en la línea de hoy');
  debe(!document.querySelector('#grafico .lineaProyectadoResto'), 'ya no hay recta punteada');
  if (firme && proy){
    debe(color(firme) === 'rgb(22, 163, 74)', 'facturado va en verde #16A34A');
    debe(color(proy) === 'rgb(37, 99, 235)', 'proyectado va en azul #2563EB');
    debe(getComputedStyle(proy).strokeDasharray === 'none', 'proyectado va continuo');
    const f = puntos(firme), pr = puntos(proy);
    debe(Math.abs(f[0][0] - xDia1) < 0.5, 'facturado arranca el día 1');
    debe(Math.abs(pr[0][0] - xDia1) < 0.5, 'proyectado arranca el día 1');
    debe(Math.abs(pr[pr.length - 1][0] - 982) < 0.5, 'proyectado llega al último día del mes');
    debe(punto && Math.abs(f[f.length - 1][0] - parseFloat(punto.getAttribute('cx'))) < 0.5, 'facturado se corta en hoy');
    // por debajo: en el mismo día, la verde nunca queda más arriba (y más chica) que la azul
    const yAzul = {}; pr.forEach(([x, y]) => { yAzul[x.toFixed(1)] = y; });
    debe(f.every(([x, y]) => yAzul[x.toFixed(1)] == null || y >= yAzul[x.toFixed(1)] - 0.01), 'facturado va siempre por debajo de proyectado');
  }

  // La cifra de lo que falta va a la derecha de hoy, debajo de la azul plana, si cabe
  // completa; si no, a la izquierda, entre las dos curvas.
  const rotulo = document.querySelector('#grafico .rotuloBrecha');
  if (rotulo && proy){
    const pr = puntos(proy);
    debe(parseFloat(rotulo.getAttribute('y')) > pr[pr.length - 1][1] + 15, 'la cifra va debajo de la azul, sin tocarla');
  }
  if (rotulo && estado.datos.dia <= estado.datos.diasDelMes * 0.6){
    debe(rotulo.getAttribute('text-anchor') === 'start', 'la cifra va a la derecha de hoy cuando cabe');
  }

  // El rótulo entra completo en la gráfica: a fin de mes, a la derecha no cabe.
  if (rotulo){
    const caja = rotulo.getBBox();
    debe(caja.x >= 0 && caja.x + caja.width <= 1000, 'el rótulo de la distancia entra completo en la gráfica');
  }

  return fallas;
})()
