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

  // Lo facturado por venir es facturado: va del color de facturado, no del de
  // proyectado. Si no, de hoy en adelante quedan dos rayas iguales y a tres metros
  // no se sabe cuál es cuál.
  const porVenir = document.querySelector('#grafico .lineaPorVenir');
  const firme = document.querySelector('#grafico .lineaFirme');
  const proy = document.querySelector('#grafico .lineaProyectado');
  if (porVenir && firme && proy){
    const color = el => getComputedStyle(el).stroke;
    debe(color(porVenir) === color(firme), 'facturado por venir va del color de facturado');
    debe(color(porVenir) !== color(proy), 'facturado por venir no va del color de proyectado');
  }

  return fallas;
})()
