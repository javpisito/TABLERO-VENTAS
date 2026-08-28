# Tablero de ventas · SC Ads

Informe de ventas en vivo que se muestra en un televisor en la oficina. Lee las ventas
del mes de cinco hojas de Google, las consolida en una sola, y las pinta en una página
estática que se abre en el TV. Cuando entra una venta nueva, la pantalla se toma con una
animación y suena una campana.

**Todo el contexto del proyecto está en [CLAUDE.md](CLAUDE.md)**: la arquitectura, las
decisiones ya tomadas y por qué, el contrato de datos y las trampas del entorno. Léelo
antes de tocar cualquier archivo.

## Qué hay aquí

| Archivo | Qué es |
|---|---|
| `recolector.js` | El backend. Va pegado en Extensiones → Apps Script de la hoja consolidada |
| `index.html` | La página del televisor. Sin dependencias ni build: se abre con doble clic |
| `consolidado-scads.xlsx` | Plantilla de la hoja consolidada (Fuentes · Registro · Trafico · Resumen) |
| `plantilla-hoja-cliente.xlsx` | Las dos pestañas que se copian a la hoja de cada cliente |
| `legado/` | La generación anterior. No es referencia de nada, ver CLAUDE.md |

## Para retomarlo en otro computador

No hay nada que instalar. Se clona y ya:

```bash
git clone https://github.com/javpisito/TABLERO-VENTAS.git
```

Para ver el tablero sin conectar nada, se abre `index.html` con `?demo` al final de
la URL: trae datos de mentira repartidos por todo el mes.

Lo que **no** está en este repositorio y vive solo en Google:

- La hoja consolidada y las cinco hojas de cliente
- El proyecto de Apps Script publicado (la URL `/exec` que está en `CONFIG.urlDatos`)
- Las Propiedades del script: `LLAVE_TABLERO` y, cuando se conecte Meta, `META_TOKEN`

## Dónde verlo

Hay dos versiones del mismo archivo, y la diferencia son las canciones.

| | URL | Canciones |
|---|---|---|
| Pública | https://javpisito.github.io/TABLERO-VENTAS/ | no |
| Local | doble clic en `tablero.bat` | sí |

La pública la abre cualquiera desde cualquier parte, sin que tengas nada prendido.
No suena música porque `audio/` no está en el repositorio, a propósito.

## Verlo desde otro aparato de la misma red

El servidor local intenta escuchar en toda la red, pero Windows pide permiso para
eso. Sin el permiso solo funciona en la máquina que lo corre, y `tablero.bat` lo
dice al arrancar.

Se da una sola vez, en **PowerShell como administrador**:

```
netsh http add urlacl url=http://+:8765/ user=%USERNAME%
netsh advfirewall firewall add rule name="Tablero SC Ads" dir=in action=allow protocol=TCP localport=8765
```

El primero autoriza a abrir el puerto para toda la red; el segundo le dice al
firewall que deje entrar. Después, `tablero.bat` imprime la dirección que hay que
abrir en los otros aparatos, del estilo `http://192.168.1.15:8765/`.

Esa dirección sirve solo dentro de tu red: desde fuera de la oficina no se ve.

**Y ojo con el Worker:** si le pusiste valor a `ORIGENES`, hay que agregar ahí ese
mismo origen (`http://192.168.1.15:8765`) o el tablero cargará sin cifras. Como la
IP de la máquina puede cambiar, conviene fijarla en el router si esto va a quedar
funcionando.

## Al cambiar el recolector

Subir `VERSION`, pegar en el editor, guardar y **publicar una versión nueva** desde
Implementar → Gestionar implementaciones. Guardar no cambia lo que sirve `/exec`.

El propio tablero avisa si se te olvida: el JSON devuelve `version` (la publicada) y
`versionRecolector` (la que corre el disparador), y sale franja roja si no coinciden.

## Ojo

`index.html` ya **no lleva ninguna llave**. El televisor le pide los datos al Worker de
Cloudflare (`worker.js`), y es el Worker quien guarda la llave y se la agrega antes de
llamar a Apps Script. La llave vive en dos sitios y en ninguno es visible: Propiedades
del script en Apps Script, y las variables del Worker marcada como *secret*.

El repositorio es **público** desde el 25 de agosto de 2026. Se decidió a sabiendas de
que eso deja a la vista los nombres de los cinco clientes, que además ya estaban en el
historial desde el primer commit.

Lo que **no** está resuelto: cualquiera que descubra la URL del Worker lee las ventas del
mes sin llave. El filtro `ORIGENES` es un obstáculo, no una defensa — un `curl` manda la
cabecera `Origin` que quiera. Cerrarlo de verdad es ponerle Cloudflare Access delante, y
está pendiente.
