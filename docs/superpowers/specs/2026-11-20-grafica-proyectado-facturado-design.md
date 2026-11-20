# Gráfica del mes: proyectado contra facturado

Diseño corto · 20 de noviembre de 2026 · pedido del analista

## Para qué

Ver, día a día, qué tan lejos va lo facturado de lo proyectado y entender por qué.
La gráfica de hoy tiene una sola curva (acumulado por día de cita, sólida hasta hoy
y punteada después) y no deja ver cuánto de la agenda del mes ya existía cada día.

## Qué se ve

Dos líneas sobre los días del mes:

- **Proyectado**: en el día *d*, la plata de las citas del mes que ya estaban
  agendadas ese día. Arranca por encima de cero el día 1, porque las citas se
  agendan desde antes.
- **Facturado**: en el día *d*, la plata de las citas con fecha hasta *d*. Es la
  misma curva sólida de hoy.
- **La distancia entre las dos en el día de hoy**, marcada y con su cifra
  ("faltan por pasar $ X M"). Es lo agendado que todavía no llega.

Las dos se dibujan sólidas hasta hoy. De hoy en adelante:

- facturado sigue punteada con las citas ya agendadas por venir (la parte punteada
  de hoy), así que termina el último día justo en el proyectado: las dos cifras se
  encuentran el último día del mes, como dice el modelo;
- proyectado sigue como una raya tenue horizontal ("si no se agenda nada más").

La línea de la meta se queda como referencia, con la regla que ya tiene.

## Cómo se arma (enfoque A, escogido)

**Enfoques considerados**

- **A · Fecha en que apareció cada venta (`visto_en` del Registro).** Escogido:
  el dato ya existe desde que arrancó el Registro y sirve para todo el mes en curso.
- **B · Proyectado como raya plana.** Descartado: no muestra cómo creció la agenda.
- **C · Foto diaria del proyectado en una pestaña nueva.** Descartado por ahora:
  arranca vacía. Queda como mejora si las anulaciones llegan a pesar.

**Servidor (`recolector.js`)**

- Cada venta del JSON trae un campo nuevo, `diaVisto`: el día del mes (zona
  `ZONA`, Bogotá) en que la venta apareció en el Registro. Si apareció antes del
  1 del mes, va `0`. Si la celda `visto_en` está vacía, también `0`.
- El televisor no parsea fechas, igual que con `dia`: el servidor manda el número.
- Sube `VERSION`, se pega, se guarda y **se publica versión nueva**.

**Página (`index.html`)**

- `pintarGrafico()` dibuja las dos líneas y la distancia de hoy. Es la misma
  función para el tablero y para el informe de cada cliente, así que cambian los
  dos a la vez.
- Proyectado en el día *d*: suma de `monto` de las ventas no anuladas con
  `min(diaVisto, dia) ≤ d`. Facturado: suma de `monto` con `dia ≤ d`.
  El `min` se agregó al escribir el plan: una cita del 3 digitada el 20, contada
  solo desde el 20, dejaría lo facturado por encima de lo agendado.
- El techo del eje lo manda el proyectado del mes (y la meta cuando está a la
  vista), como hoy.
- Leyenda: "facturado", "proyectado", "meta".
- El modo `?demo` inventa un `diaVisto` para cada venta de prueba.

## Colores

La paleta del proyecto no permite rojo fuera de los avisos, así que el dibujo
(verde y rojo) se traduce así: **facturado en azul sólido** (`--azul`), como hoy;
**proyectado en azul claro** (`#93B4FF`); el espacio entre las dos, sombreado tenue.

## Límites que quedan dichos

- `visto_en` es cuándo la vio el recolector, no cuándo se agendó. Un mes digitado
  tarde sube de golpe el día en que se digitó.
- Una venta anulada sale de toda la curva hacia atrás, no desde el día en que se
  anuló: el Registro no guarda ese día.
- Si el JSON no trae `diaVisto` (recolector viejo), la línea de proyectado no se
  inventa: la leyenda dice "falta actualizar el recolector" y queda solo la de
  facturado. Un cero silencioso se leería como agenda vacía.

## No va

- La barra de colores de la derecha del dibujo (reparto de la distancia).
- Cambiar a un framework.

## Documentación

El contrato del JSON y la decisión de la gráfica se actualizan en `CLAUDE.md` en el
mismo commit que el código.
