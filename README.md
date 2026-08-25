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
