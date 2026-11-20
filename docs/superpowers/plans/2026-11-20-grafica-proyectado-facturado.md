# Gráfica proyectado contra facturado · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cambiar la gráfica del mes por dos líneas (proyectado: lo agendado a cada día; facturado: lo hecho efectivo a cada día) con la distancia de hoy marcada.

**Architecture:** El recolector agrega a cada venta del JSON `diaVisto`, el día del mes en que apareció en el Registro (sale de la columna `visto_en`). La página arma las dos series con una función pura, `seriesDelMes()`, y `pintarGrafico()` las dibuja en el mismo SVG a mano de siempre, para el tablero y para el informe de cliente.

**Tech Stack:** Apps Script (V8, estilo ES5 con `function` y `var`), HTML/CSS/JS sin dependencias ni build, SVG a mano. Pruebas del recolector con `node` (sin paquetes); pruebas de la página en el navegador con `?demo`.

**Spec:** `docs/superpowers/specs/2026-11-20-grafica-proyectado-facturado-design.md`

## Global Constraints

- Sin dependencias: nada de `npm install`, ni en la página ni en las pruebas.
- Código, comentarios y nombres en español.
- `recolector.js` en estilo ES5 (`function`, `var`).
- Paleta: facturado `--azul` `#2563EB`; proyectado `#93B4FF`; rojo (`--senal`) prohibido fuera de avisos.
- El televisor no parsea fechas: el día llega calculado del servidor (`dia`, `diaVisto`).
- Cifras del eje y del rótulo de la distancia en millones con `enMillones()`.
- Si cambia el contrato del JSON, `CLAUDE.md` cambia en el mismo commit.
- `VERSION` de `recolector.js` pasa de `'2026-09-30.1'` a `'2026-11-20.1'`.

## Review Focus

1. **Venta registrada después de su cita** (cita del 3 digitada el 20): si el proyectado contara solo desde `diaVisto`, la línea roja quedaría por encima de la verde entre el 3 y el 20. Regla (decisión del plan, se agrega al spec): una venta cuenta en proyectado desde `min(diaVisto, dia)`. Así facturado nunca supera a proyectado.
2. **JSON sin `diaVisto`** (recolector publicado viejo): no se dibuja la línea de proyectado y la leyenda dice "falta actualizar el recolector"; la de facturado sigue igual.
3. **Mes sin ventas**: las dos series en cero, sin rótulo de distancia y sin errores en consola.
4. **Hoy es el último día del mes**: no hay tramo "de hoy en adelante"; la distancia de hoy es cero y no se rotula.
5. **`visto_en` vacío o de un mes anterior**: `diaVisto` es `0` y la venta cuenta desde el día 1.

---

### Task 1: `diaVisto` en el JSON del recolector

**Files:**
- Modify: `recolector.js` (VERSION; `doGet`, el `map` de `ventas` alrededor de la línea 552; función nueva junto a `diaClave`, alrededor de la línea 657)
- Create: `pruebas/probar-recolector.js`
- Modify: `CLAUDE.md` (sección "Contrato de datos": ejemplo del JSON y tabla de campos)

**Interfaces:**
- Produces: `function diaVistoDe(visto, mesActual)` → número entero de 0 a 31. `visto` es lo que trae la celda (`Date`, texto o vacío); `mesActual` es `'yyyy-MM'` en `ZONA`.
- Produces: cada elemento de `ventas[]` del JSON trae `diaVisto` (número).

- [ ] **Step 1: Escribir la prueba que falla**

`pruebas/probar-recolector.js` carga `recolector.js` con el módulo `vm` de node, con un `Utilities.formatDate(fecha, zona, patron)` falso hecho con `Intl.DateTimeFormat` (soporta `'yyyy-MM'` y `'yyyy-MM-dd'`), y usa `assert` de node:

```js
assert.strictEqual(diaVistoDe(new Date('2026-11-05T15:00:00Z'), '2026-11'), 5);
assert.strictEqual(diaVistoDe(new Date('2026-11-01T04:30:00Z'), '2026-11'), 0); // 23:30 del 31 de octubre en Bogotá
assert.strictEqual(diaVistoDe(new Date('2026-10-20T15:00:00Z'), '2026-11'), 0);
assert.strictEqual(diaVistoDe('', '2026-11'), 0);
assert.strictEqual(diaVistoDe('no es fecha', '2026-11'), 0);
assert.strictEqual(diaVistoDe(new Date('2026-11-30T23:00:00Z'), '2026-11'), 30); // 18:00 del 30 en Bogotá
console.log('ok');
```

- [ ] **Step 2: Correr la prueba y ver que falla**

Run: `node pruebas/probar-recolector.js`
Expected: falla con `diaVistoDe is not defined`.

- [ ] **Step 3: Implementar `diaVistoDe(visto, mesActual)` en `recolector.js`**

Convierte a `Date`; si no es válida devuelve `0`; si `mesClave(d, ZONA) === mesActual` devuelve `Number(diaClave(d, ZONA).slice(-2))`; en cualquier otro caso `0`. Comentario: por qué es `0` (apareció antes de que arrancara el mes, cuenta desde el día 1).

- [ ] **Step 4: Correr la prueba y ver que pasa**

Run: `node pruebas/probar-recolector.js`
Expected: `ok`

- [ ] **Step 5: Mandar `diaVisto` en el JSON y subir la versión**

En el `map` de `ventas` de `doGet`, agregar `diaVisto: diaVistoDe(r.visto_en, mesActual)` (la columna se llama `visto_en` en el Registro y `leerTabla` usa el encabezado tal cual). `VERSION = '2026-11-20.1'`.

- [ ] **Step 6: Actualizar el contrato en `CLAUDE.md`**

En el ejemplo del JSON, cada venta lleva `"diaVisto": 2`. En la tabla de campos de diagnóstico o justo debajo del ejemplo: `diaVisto` es el día del mes en que la venta apareció en el Registro (`visto_en`), `0` si fue antes del 1 o si está vacío; lo usa la línea de proyectado de la gráfica.

- [ ] **Step 7: Correr la prueba de nuevo y hacer commit**

Run: `node pruebas/probar-recolector.js` → `ok`

```bash
git add recolector.js pruebas/probar-recolector.js CLAUDE.md
git commit -m "El recolector manda el día en que apareció cada venta"
```

---

### Task 2: La gráfica con proyectado y facturado

**Files:**
- Modify: `index.html` — CSS de la gráfica (líneas ~494-505, clases `.lineaFirme`…`.puntoHoy`) y de la leyenda (~143-148); las dos `.leyenda` (~622 y ~700); `pintarGrafico()` (~1903); `ventaDemo()` (~2165)
- Modify: `CLAUDE.md` (decisión "La gráfica se dibuja a mano en SVG")
- Modify: `docs/superpowers/specs/2026-11-20-grafica-proyectado-facturado-design.md` (regla de `min(diaVisto, dia)`)

**Interfaces:**
- Consumes: `ventas[i].diaVisto` (Task 1), `ventas[i].dia`, `ventas[i].monto`, `d.dia`, `d.diasDelMes`.
- Produces: `function seriesDelMes(ventas, dias)` → `{ proyectado: number[], facturado: number[], conVisto: boolean }`. Los arreglos van del índice `0` al `dias`; el `0` vale 0. `proyectado[d]` = suma de `monto` de las ventas con `Math.min(diaVisto, dia) <= d`; `facturado[d]` = suma de `monto` con `dia <= d`. `conVisto` es `false` si hay ventas y ninguna trae `diaVisto` (recolector viejo); con `conVisto` en `false`, `proyectado` sale en ceros.
- `pintarGrafico(d, opc)` conserva su firma: `opc.caja`, `opc.ventas`, `opc.meta`, `opc.leyenda` siguen funcionando igual.

- [ ] **Step 1: Escribir las pruebas de `seriesDelMes` (fallan)**

Con el tablero abierto en `http://localhost:8765/?demo&auto`, por la consola (herramienta de JavaScript del navegador):

```js
const s = seriesDelMes([
  { monto: 100, dia: 3,  diaVisto: 0 },   // agendada antes del mes
  { monto: 50,  dia: 10, diaVisto: 5 },   // agendada el 5 para el 10
  { monto: 30,  dia: 3,  diaVisto: 20 }   // cita del 3 digitada el 20
], 30);
console.assert(s.conVisto === true);
console.assert(s.proyectado[1] === 100, 'día 1: solo la agendada antes');
console.assert(s.proyectado[3] === 130, 'la digitada tarde cuenta desde su cita');
console.assert(s.proyectado[5] === 180);
console.assert(s.facturado[3] === 130 && s.facturado[9] === 130 && s.facturado[10] === 180);
console.assert(s.proyectado.every((p, i) => p >= s.facturado[i]), 'facturado nunca supera a proyectado');
const v = seriesDelMes([{ monto: 10, dia: 2 }], 30);
console.assert(v.conVisto === false && v.proyectado[30] === 0 && v.facturado[30] === 10);
const n = seriesDelMes([], 30);
console.assert(n.conVisto === true && n.proyectado[30] === 0 && n.facturado[30] === 0);
```

Expected ahora: `seriesDelMes is not defined`.

- [ ] **Step 2: Implementar `seriesDelMes(ventas, dias)` en `index.html`, junto a `pintarGrafico()`**

Comentario con la regla de `min(diaVisto, dia)` y por qué (una cita digitada tarde no puede dejar lo facturado por encima de lo agendado).

- [ ] **Step 3: Correr las aserciones del Step 1**

Expected: ninguna aserción falla en consola.

- [ ] **Step 4: Reescribir el dibujo en `pintarGrafico(d, opc)`**

Con `G`, `pasoRedondo()`, `enMillones()`, la rejilla, los ejes y la meta de siempre:
- Techo: `Math.max(proyectado[dias], metaVisible, 1) * 1.1`, con `metaVisible` según la regla de hoy (`meta <= total * 1.6`, donde total es `facturado[dias]`).
- Hasta `diaHoy`: área tenue entre las dos curvas (clase `areaBrecha`), línea de proyectado (`lineaProyectado`) y línea de facturado (`lineaFirme`).
- De `diaHoy` a `dias`: facturado punteada con `facturado[i]` (`lineaPorVenir`, la de hoy) y proyectado como raya horizontal tenue en `proyectado[diaHoy]` (`lineaProyectadoResto`). Si `diaHoy === dias`, no hay tramo.
- La distancia de hoy: si `proyectado[diaHoy] - facturado[diaHoy] > 0`, una raya vertical entre las dos curvas en `x(diaHoy)` (`brechaHoy`) y el texto `'faltan por pasar ' + enMillones(distancia)` (`rotuloBrecha`), a la derecha de la raya, o a la izquierda (`text-anchor:end`) si `diaHoy > dias * 0.7`.
- Con `conVisto` en `false`: no se dibujan ni el área ni la línea de proyectado, y la leyenda muestra el aviso (Step 5).
- El punto de hoy (`puntoHoy`) va sobre la curva de facturado, como hoy.

CSS nuevo, junto a las clases de la gráfica: `.lineaProyectado{fill:none;stroke:#93B4FF;stroke-width:4;stroke-linejoin:round;stroke-linecap:round}`, `.lineaProyectadoResto{stroke:#93B4FF;stroke-width:2;stroke-dasharray:3 7;opacity:.8}`, `.areaBrecha{fill:rgba(147,180,255,.18)}`, `.brechaHoy{stroke:#33425C;stroke-width:2}`, `.rotuloBrecha{fill:#33425C;font-family:'Martian Mono',monospace;font-size:15px}`. Se quitan `.areaFirme` y `.areaPorVenir` si quedan sin uso (buscarlas antes en el CSS y en el JS).

- [ ] **Step 5: Leyendas**

En las dos `.leyenda` (tablero e informe): `<span><i></i>facturado</span>`, `<span class="proyectado"><i></i>proyectado</span>`, la de meta igual que hoy, y `<span class="sinVisto">falta actualizar el recolector</span>`, oculta por defecto. CSS: `.leyenda .proyectado i{background:#93B4FF}`; `.leyenda .sinVisto{display:none;color:var(--tinta-2)}`. `pintarGrafico` encuentra la leyenda de su gráfica con `caja.parentElement.querySelector('.leyenda')`, oculta `.proyectado` y muestra `.sinVisto` cuando `conVisto` es `false`. La clase `.porvenir` de la leyenda se quita si queda sin uso.

- [ ] **Step 6: `diaVisto` en el modo demo**

`ventaDemo(nueva)`: si `nueva`, `diaVisto` es el día de hoy; si no, un entero al azar de `0` a `min(dia, hoy)`.

- [ ] **Step 7: Verificar en el navegador**

Con `preview_start` (`tablero`) en `http://localhost:8765/?demo&auto`:
- Consola sin errores (fuera de los 404 de `audio/` y `propaganda/fotos/`).
- Volver a correr las aserciones del Step 1.
- Tablero: hay dos `polyline`/`path` de líneas (`.lineaProyectado` y `.lineaFirme`), `.areaBrecha`, `.brechaHoy` y `.rotuloBrecha` con texto que empieza por `faltan por pasar`; la leyenda dice facturado, proyectado y meta.
- Informe de un cliente (tecla `1`): la gráfica del cliente también tiene `.lineaProyectado`.
- Sin `diaVisto`: borrar el campo de `demoVentas` desde la consola, llamar `recibir(armarDemo())` y comprobar que no hay `.lineaProyectado` y que `.leyenda .sinVisto` está visible.
- Mes sin ventas: `demoVentas.length = 0; recibir(armarDemo())` → sin errores y sin `.rotuloBrecha`.
- Tamaño del televisor (`resize_window` 1476×597): la gráfica cabe sin desbordar su panel. Captura de pantalla como prueba.

- [ ] **Step 8: Documentación**

`CLAUDE.md`, decisión "La gráfica se dibuja a mano en SVG": dos curvas desde el 20 de noviembre de 2026 (proyectado por `diaVisto`, facturado por `dia`), la regla de `min(diaVisto, dia)`, la distancia de hoy rotulada, los dos límites (digitado tarde, anuladas hacia atrás) y el aviso si falta `diaVisto`. En el spec, agregar la regla de `min(diaVisto, dia)` en "Cómo se arma".

- [ ] **Step 9: Commit**

```bash
git add index.html CLAUDE.md docs/superpowers/specs/2026-11-20-grafica-proyectado-facturado-design.md docs/superpowers/plans/2026-11-20-grafica-proyectado-facturado.md
git commit -m "La gráfica del mes compara proyectado contra facturado"
```

---

### Después del código (lo hace el analista)

1. Pegar `recolector.js` en Apps Script, guardar y **publicar versión nueva** editando la implementación que ya existe.
2. Comprobar en el JSON del Worker que `version` y `versionRecolector` dicen `2026-11-20.1` y que las ventas traen `diaVisto`.
3. Subir los commits (`git push`) para que GitHub Pages y el televisor tomen la página nueva.
