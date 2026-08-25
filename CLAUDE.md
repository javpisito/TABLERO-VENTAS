# Tablero de ventas · SC Ads

Contexto del proyecto para trabajar en él. Léelo antes de tocar cualquier archivo.

## Qué es

Un informe de ventas en vivo que se muestra en un televisor en la oficina de SC Ads
(agencia de marketing digital en Cali, Colombia). Muestra las ventas del mes en curso
de 4-5 clientes, y cada vez que se registra una venta nueva la pantalla se toma con
una animación y suena una campana.

No es un dashboard genérico: es una pantalla que ve todo el equipo comercial todo el día.
Las decisiones de diseño priorizan legibilidad a 3 metros y el momento de la celebración.

## Con quién trabajas

Analista en SC Ads, séptimo semestre de ingeniería de sistemas. Entiende el código, no
necesita que le expliquen qué es una función, pero sí valora que le señalen las trampas
del entorno (cuotas de Apps Script, políticas de autoplay del navegador, tokens que se vencen).

Habla español. Todo el código, comentarios, nombres de variables y documentación van en
español. Es una convención deliberada del proyecto, no un accidente.

## Arquitectura

```
5 hojas de Google (una por cliente, cada una con su pestaña SCADS_Ventas)
        |
        |  recolector.js, disparador cada 1 minuto
        v
1 hoja consolidada de SC Ads
   - Fuentes   (configuración: qué hoja es de quién)
   - Registro  (histórico normalizado, append-only, lo llena el script)
   - Trafico   (inversión de Meta, se sobrescribe cada 30 min)
   - Resumen   (fórmulas, mes en curso)
        |
        |  doGet() sirve JSON del mes en curso, protegido con una llave
        v
index.html       (estático, en GitHub Pages, abierto en el TV de la oficina)
```

## Archivos

| Archivo | Qué es | ¿Se edita? |
|---|---|---|
| `recolector.js` | Apps Script pegado en la hoja consolidada | Sí, es el backend |
| `index.html` | La página del televisor, sin dependencias ni build | Sí, es el frontend |
| `consolidado-scads.xlsx` | Plantilla de la hoja consolidada | Solo si cambia el esquema |
| `plantilla-hoja-cliente.xlsx` | Las dos pestañas que se copian a cada cliente | Solo si cambia el contrato |

Los .xlsx se generaron con openpyxl. Si hay que regenerarlos, hazlo con un script de
Python, no editando el binario.

`legado/` guarda la generación anterior (`apps-script-conector.js`, `tablero-ventas.html`,
`base-tablero-ventas.xlsx`). Usaba otro vocabulario — `Ganada`/`Abierta`, `alEditar`,
`doPost` — y otro contrato. No es referencia de nada: si algo de ahí hace falta, se
traduce al contrato de arriba primero.

## Decisiones ya tomadas

No las revivas sin preguntar. Cada una resolvió un problema concreto.

**Hoja intermedia, no lectura directa de las 5 hojas.** Cada cliente tiene su hoja armada
a su manera. La consolidada aísla la página web de esos cambios y es donde cada venta
recibe un id estable.

**Una pestaña estándar dentro de la hoja de cada cliente** (`SCADS_Ventas`), en vez de
mapear las columnas propias de cada cliente. Las cinco tienen exactamente las mismas
siete columnas.

Se revisó el 21 de agosto de 2026 y **se confirmó**. El equipo ya registra las ventas en
otra tabla de la misma hoja, así que `SCADS_Ventas` sí es doble digitación. Se evaluó
leer la tabla que ya llenan, mapeando las columnas por nombre de encabezado desde
`Fuentes` y agregándole una sola columna de `id` autollenada. Se decidió seguir manual:
el registro se sigue haciendo en `SCADS_Ventas`. No lo cambies sin que el analista lo
pida de nuevo.

**Las ventas se agrupan por el prefijo del id, no por el nombre del cliente.**
`CUC-000001` pertenece a quien tenga `prefijo = CUC` en `Fuentes`, se llame como se llame
hoy. El nombre sí cambia: "Dr Jacobo" pasó a "Dr. Jacobo Cucalón" un martes cualquiera, y
como el Registro guarda el nombre con el que entró la venta, las filas viejas quedaron
huérfanas — el cliente mostraba cero y la plata seguía contando en la vendedora, así que
los totales no cuadraban y nada lo avisaba.

Por eso también: si una venta del mes tiene un prefijo que no está en `Fuentes`, sale
aviso rojo con cuántas son. Y `actualizarSiCambio()` refresca el nombre en el Registro
cuando lo cambian en `Fuentes`, para que la hoja no muestre el nombre viejo.

**Cambiar un `prefijo` en `Fuentes` sí rompe todo**, al revés que el nombre: desconecta
todas las ventas históricas de ese cliente. Los prefijos no se tocan.

**El id lo escribe el recolector dentro de la hoja del cliente**, no se calcula con un
fingerprint. Requiere permiso de edición en las cinco hojas. Un fingerprint (fecha +
vendedora + monto) se rompe cuando alguien corrige un monto: la venta se duplica.

**La campana suena cuando se hace o se agenda una venta**, es decir la primera vez que
aparece la fila, y sin importar para qué día quedó la `fecha`. Suena una sola vez por
venta. Es lo contrario de la plata: la campana es del momento en que se registra, la
plata es del día en que la venta se hace efectiva.

Cuando llega el día y el dinero pasa de proyectado a facturado, no vuelve a sonar.

**Ventana mensual calculada en el servidor**, del día 1 al último del mes, zona
`America/Bogota`. No hay selector de fechas: nadie escoge nada, y el 1ro de cada mes
los números vuelven a cero solos. Lo que manda es la `fecha` de la venta, no cuándo la
escribieron: una venta del 3 registrada el 20 cuenta igual, porque el mes se llena a mano
y se recuperan días atrasados.

**Una carga masiva no suena** (`CONFIG.maxDeGolpe`, en el HTML). Si en una sola pasada
aparecen más de cuatro ventas nuevas, entran calladas: eso no es actividad comercial, es
alguien digitando el mes atrasado, y veinte celebraciones seguidas son veinte minutos de
confeti que le quitan todo el significado a la campana. El corte va por cuántas llegan
juntas, no por la fecha que tengan: atarlo a la fecha dejaba muda la venta que se acaba
de cerrar con fecha de ayer, que sí es una venta que se acaba de hacer.

**Botón de encendido en la página.** Los navegadores bloquean el audio hasta que hay una
interacción del usuario. Sin ese clic inicial, la campana nunca suena. No lo quites.

**Lo facturado va SIEMPRE por dentro de lo proyectado.** No son dos montones separados.
Proyectado es todo el mes; facturado es la parte que ya se hizo efectiva. Por eso las dos
cifras se encuentran el último día del mes y nunca antes: cuando ya no quedan días por
delante, todo lo proyectado o pasó o se anuló.

**Lo único que se tiene en cuenta es lo que vale el procedimiento, y lo único que decide
es la fecha de la cita.** Si hoy es 21, todo lo del 21 hacia atrás ya está facturado; lo
del 22 en adelante todavía no, aunque siga contando en el total del mes:

| Hoy es 21 · la cita es | facturado | proyectado |
|---|---|---|
| del 18, monto 1M | 1M | 1M |
| del 22, monto 1M | 0 | 1M |
| `Anulada` | 0 | 0 |

**El `estado` no mueve plata.** Solo `Anulada` saca la venta de las dos cifras. `Agendada`
y `Facturada` quedan como información para el equipo: el día de la cita ya dice todo lo
que el tablero necesita saber, así que nadie tiene que ir fila por fila cambiando estados
cuando pasa el día.

Se evaluó un `abono` (anticipos de una cita futura) y se descartó el 21 de agosto de 2026:
solo cuenta el valor del procedimiento. La columna se quitó de los dos .xlsx. No la
vuelvas a meter sin que el analista la pida.

Todo esto vive en `repartir()` y en ningún otro lado. Si la regla cambia, se cambia ahí.

**Facturado y proyectado nunca se suman entre sí.** No porque sean incompatibles, sino
porque lo facturado ya está adentro de lo proyectado: sumarlos cuenta dos veces la misma
plata. Por eso el ranking de vendedoras ordena por proyectado, no por la suma.

**El alcance de Meta no se suma** entre días ni entre clientes: las mismas personas ven
la pauta varios días. Se muestra por cliente o no se muestra.

**La recolección tiene horario** (`HORARIO` en `recolector.js`, 6:00 a 21:00 de lunes a
sábado). Abrir cinco hojas 1.440 veces al día se come la cuota diaria de tiempo de
ejecución de Apps Script, y de madrugada nadie registra ventas. El disparador sigue
corriendo cada minuto: lo que se salta es el trabajo, no la corrida.

**El latido se marca siempre, incluso fuera de horario.** Es lo único que distingue
"el disparador se murió" de "es domingo". Sin él, un disparador caído deja el televisor
mostrando cifras viejas con cara de estar al día.

**La recolección corre con candado** (`LockService`). Dos pasadas simultáneas leen el
mismo `getLastRow()`, asignan el mismo id y la venta entra dos veces al Registro.

**Una fila sin monto no se recoge.** No es validación por gusto: la pasada corre cada
minuto y alcanza a tomar la fila mientras la vendedora la está escribiendo. Le ponía id,
la campana sonaba con `$ 0` y la venta quedaba "vista", así que nunca volvía a sonar con
el valor real. Hacen falta `fecha`, `vendedora` y `monto` para que la fila exista.

**La fecha se guarda al mediodía, no a medianoche.** Es la trampa que más caro salió.
Una fecha de celda es un día del calendario, no un instante, pero Google la guarda como
medianoche *en la zona de esa hoja*. Las hojas nuevas no siempre quedan en Bogotá: una en
UTC-4 guarda el 22 como las 04:00 UTC, que releídas en Bogotá son las 23:00 del 21. La
cita del 22 aparecía como ya pasada y sumaba a facturado un día antes de tiempo.

`fechaDelDia()` la normaliza al mediodía al copiarla al Registro, y así aguanta ±11 horas
de diferencia entre hojas sin cambiarse de día. Además `diaClave()` y `mesClave()` reciben
la zona explícita: la de la hoja para las fechas de las celdas, la de la oficina (`ZONA`)
para el "hoy" y el mes en curso.

Ideal igual es que las seis hojas y el proyecto de Apps Script estén en
`(GMT-05:00) Bogotá`. `probarMontaje()` imprime la zona de cada una y marca las que no.

**El estado se normaliza al leerlo.** Un `facturada` en minúscula escrito a mano sumaba
en la vendedora pero no en el cliente, y los totales dejaban de cuadrar.

**Una venta borrada de la hoja del cliente se avisa, no se borra sola.** Se queda en el
Registro sumando para siempre y nadie puede arreglarlo desde la hoja del cliente. El
recolector la detecta y la saca como aviso rojo; el analista decide qué hacer.

**La barra de avance del cliente mide facturado contra `meta_mes`**, nunca proyectado.
La meta se cumple con plata que ya se hizo efectiva, no con lo que falta por pasar.

## Contrato de datos

Pestaña `SCADS_Ventas` en la hoja de cada cliente:

| Columna | Tipo | Nota |
|---|---|---|
| `id` | texto | Lo escribe el recolector. Nadie lo toca |
| `fecha` | fecha real | El día de la cita. Es lo único que decide facturado vs proyectado. Fecha de verdad, no texto |
| `vendedora` | lista | Desplegable desde `SCADS_Vendedoras` |
| `monto` | número | Lo que vale el procedimiento. COP sin puntos ni símbolo |
| `estado` | lista | `Agendada` / `Facturada` / `Anulada`. Solo `Anulada` cambia las cifras |
| `producto` | texto | Opcional |

Las seis columnas van en ese orden exacto: el recolector las lee por posición, y
`revisarEncabezados()` no recoge una hoja que no calce, en vez de dar cifras equivocadas
en silencio. Lo mismo con el `Registro` de la consolidada, que son ocho: si no cuadra, no
se recoge nada y se dice, antes de tocar el histórico. `probarMontaje()` revisa las dos
puntas.

Una fila sin `fecha`, sin `vendedora` o sin `monto` no existe todavía para el recolector.

Las `Anuladas` no cuentan en ninguna suma.

JSON que devuelve `doGet`:

```json
{
  "version": "2026-08-21.4",
  "versionRecolector": "2026-08-21.4",
  "actualizado": "2026-08-21T17:44:00.000Z",
  "recolectado": "2026-08-21T17:43:12.000Z",
  "latidoHaceMin": 1,
  "dormido": false,
  "metaConectada": false,
  "mes": "agosto 2026",
  "dia": 21,
  "diasDelMes": 31,
  "totales": { "facturado": 0, "proyectado": 0, "inversion": 0 },
  "clientes":   [{ "cliente": "", "facturado": 0, "proyectado": 0, "ventas": 0, "inversion": 0, "metaMes": 0 }],
  "vendedoras": [{ "vendedora": "", "facturado": 0, "proyectado": 0, "ventas": 0 }],
  "ventas":     [{ "id": "", "cliente": "", "vendedora": "", "monto": 0, "estado": "", "producto": "", "ts": "", "dia": 18 }],
  "avisos": []
}
```

Los cuatro campos de arriba son de diagnóstico, no de negocio:

| Campo | Para qué |
|---|---|
| `dia` · `diasDelMes` | El día de hoy y cuántos tiene el mes, ya en hora de Bogotá. Para la gráfica, sin que el televisor parsee fechas |
| `version` | La del código **publicado**, que es el que sirve `/exec` |
| `versionRecolector` | La del código **guardado**, que es el que corre el disparador. Si no coinciden, alguien guardó sin publicar y sale como aviso rojo |
| `recolectado` | Cuándo entró la última venta nueva al Registro |
| `latidoHaceMin` | Minutos desde la última corrida del disparador. La calcula el servidor porque el reloj del televisor puede estar corrido |
| `dormido` | Si ahora mismo está fuera del `HORARIO` de recolección |
| `metaConectada` | Si hay `META_TOKEN` guardado. Distingue "Meta sin conectar" de "invirtió cero" |

Si cambias este contrato, cambia los dos lados en el mismo commit.

## Convenciones

**Sin dependencias.** El HTML no usa frameworks ni build. Se abre con doble clic y
funciona. Si una librería parece necesaria, pregunta antes.

**Sin `localStorage`.** El estado vive en memoria; la página se recarga sola cuando
alguien reinicia el TV y eso está bien.

**Los secretos van en Propiedades del script** (`LLAVE_TABLERO`, `META_TOKEN`), nunca en
el código ni en celdas de la hoja.

**Los errores se muestran en pantalla, no se tragan.** Un token vencido tiene que
aparecer como aviso rojo en el televisor. Un cero silencioso hace que alguien concluya
que la pauta se apagó.

**Paleta y tipografía del tablero** (no improvisar otras). Es la del reporte de
resultados de SC Ads: fondo claro, tarjetas blancas y el azul de la marca.

| Variable | Color | Para qué |
|---|---|---|
| `--azul` | `#2563EB` | El azul de SC Ads. Barras, acentos, tarjeta destacada |
| `--azul-fuerte` | `#1D4ED8` | Hover y meta cumplida |
| `--azul-suave` | `#EEF3FF` | Fondo de las píldoras |
| `--tinta` | `#0B1B33` | Cifras y títulos |
| `--tinta-2` | `#33425C` | Texto secundario |
| `--humo` | `#7A8AA3` | Rótulos y texto tenue |
| `--papel` | `#F4F7FC` | Fondo de la página |
| `--tarjeta` | `#FFFFFF` | Fondo de las tarjetas |
| `--linea` | `#E3E9F3` | Bordes |
| `--senal` | `#DC2626` | Solo avisos. En ninguna otra parte |

Lo que va en azul sólido con texto blanco es lo que importa: la tarjeta de Facturado, la
fila de la vendedora líder y la pantalla de celebración. Es el tratamiento de "resultado
que importa" del reporte.

Archivo (variable, ancho expandido para nombres) + Martian Mono (cifras).
La firma visual son las fichas que giran, tipo tablero de aeropuerto.

**Distribución**, de arriba abajo: encabezado · franja de avisos · cinco indicadores ·
gráfica del mes junto al ranking de vendedoras · tira de tarjetas de cliente. Todo cabe
en una pantalla, sin scroll: `#tablero` es una rejilla de alto fijo `100vh` y cada panel
lleva `min-height:0` para que nada se desborde.

El 21 de agosto de 2026 se decidió acercarlo a un tablero tipo Power BI, con más paneles
y una gráfica. La restricción que **no** cambió es que se lee desde tres metros: por eso
son cinco indicadores y no doce, las cifras del eje van en millones (`$12 M`, no
`$12.000.000`) y no hay tablas de detalle. Si algo no se alcanza a leer desde el fondo de
la oficina, no va.

**La gráfica se dibuja a mano en SVG**, sin librerías, en `pintarGrafico()`. Es una sola
curva: el acumulado del mes por día de cita, sólida hasta hoy y punteada de ahí en
adelante. Que las dos mitades sean la misma curva es justamente el modelo — lo facturado
va por dentro de lo proyectado — y el punteado muestra a dónde llega el mes si todo lo
agendado se cumple. La línea de la meta va de referencia.

El día lo manda el servidor (`dia` por venta, `dia` y `diasDelMes` arriba). El televisor
no vuelve a parsear fechas: ahí fue donde se coló el corrimiento de zona.

**Apps Script** corre en runtime V8, pero el código está escrito en estilo ES5 con
`function` y `var`. Mantén el estilo por consistencia.

## Estado actual

**Funcionando de punta a punta desde el 21 de agosto de 2026.** Hoja consolidada montada,
script publicado en la versión `2026-08-21.6`, llave guardada, endpoint respondiendo con
datos reales y el tablero pintándolos. Los cinco clientes son Dra. Dayan Moriones,
Dra. Daniela Correa, Dr. Jacobo Cucalón, Automat Soft y Decotienda; las vendedoras salen
solas del Registro.

Falta desplegar el HTML en GitHub Pages y abrirlo en el televisor de la oficina.

El esquema es el de seis columnas por cliente y ocho en el `Registro`.

Cada vez que cambie `recolector.js`: subir `VERSION`, pegar, guardar y **publicar nueva
versión**. Guardar no cambia lo que sirve `/exec`. Conviene *editar* la implementación que
ya existe en vez de crear otra: así la URL no cambia y no hay que tocar el HTML.

## Despliegue

Mientras se prueba se usa la **implementación de prueba** de Apps Script, cuya URL termina
en `/dev` y corre siempre el código guardado — no hay que publicar versión en cada cambio.
La contra: solo responde a alguien con acceso al script y con sesión de Google abierta, así
que no sirve para el televisor de la oficina, solo para probar desde el portátil del
analista. `revisarURL()` acepta las dos formas.

Cuando esté al 100% se hacen las dos cosas juntas: subir a GitHub Pages y publicar la
implementación definitiva con la URL `/exec`. Hasta entonces el proyecto no va a GitHub.

La URL que va en `CONFIG.urlDatos` es la que termina en `/exec`, la de Gestionar
implementaciones. La de `script.googleusercontent.com/macros/echo?user_content_key=…`
que aparece en la barra del navegador al abrir el endpoint es la redirección interna:
sirve un rato y después deja el tablero en blanco. `revisarURL()` detecta las tres formas
de equivocarse y las escribe en la franja roja.

Ojo con la llave: viaja en el HTML estático, así que cualquiera con la URL de GitHub Pages
puede leer las ventas del mes. Es inherente a no tener backend.

Para revisar el tablero en un portátil sin tocar el archivo, se abre con `?demo` al final
de la URL. El modo demo trae metas de mentira para poder ver las barras de avance.

Fase 2, inversión desde Meta: el código está escrito y apagado. Muestra cero y dice
"pendiente de conectar Meta". Se enciende llenando `META_TOKEN` y la columna
`cuenta_meta` en `Fuentes`.

Bloqueo conocido: SC Ads no tiene un portafolio propio en Meta que agrupe las cuentas de
los clientes. La decisión fue arrancar con un token de usuario personal (se vence cada
60 días) y crear el portafolio después. Por eso `recolector.js` detecta el error 190 de
Meta y lo muestra como aviso en pantalla.

Sin resolver: los ids de las cuentas publicitarias.

Los cinco clientes son Dayan, Daniela, Cucalón, Autonal y Decotienda.

## Cómo ayudar

Cuando reporte un error de montaje, empieza por el registro de ejecución de
`probarMontaje`: casi todos los problemas de esta fase son de permisos o de zonas
horarias, no de código.

Si una cifra sale corrida por un día, sospecha de la zona horaria de la hoja antes que
del código. Se ve en el `ts` del JSON: si termina en `T04:00:00.000Z` o `T00:00:00.000Z`
en vez de `T17:00:00.000Z`, esa fila es vieja y todavía no la ha normalizado el
recolector.

La trampa que se lleva a todo el mundo: al cambiar el código del script, la URL `/exec`
sigue sirviendo la versión anterior hasta publicar una **nueva versión** desde
Gestionar implementaciones. Recuérdalo cada vez que un cambio "no haga nada".

Para no adivinar: **sube `VERSION` en `recolector.js` cada vez que lo cambies.** El JSON
devuelve `version` (la publicada) y `versionRecolector` (la que corre el disparador), y el
televisor saca un aviso rojo si no coinciden. Un `version` viejo en el endpoint significa
que falta publicar; un `versionRecolector` viejo significa que ni siquiera se guardó.

Antes de buscar en el código: la franja roja del televisor dice casi todo lo que puede
estar mal (URL equivocada, llave que no coincide, disparador caído, token de Meta
vencido, venta borrada de una hoja de cliente, `LLAVE_TABLERO` sin guardar).

Cuando algo del entorno de Google o Meta pueda haber cambiado (nombres de menús,
permisos, versiones de la Graph API), dilo en vez de afirmarlo con seguridad.
