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
| `tablero-v2.html` | La página del televisor. Sin dependencias ni build: se abre con doble clic |
| `consolidado-scads.xlsx` | Plantilla de la hoja consolidada (Fuentes · Registro · Trafico · Resumen) |
| `plantilla-hoja-cliente.xlsx` | Las dos pestañas que se copian a la hoja de cada cliente |
| `legado/` | La generación anterior. No es referencia de nada, ver CLAUDE.md |

## Para retomarlo en otro computador

No hay nada que instalar. Se clona y ya:

```bash
git clone https://github.com/javpisito/TABLERO-VENTAS.git
```

Para ver el tablero sin conectar nada, se abre `tablero-v2.html` con `?demo` al final de
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

Este repositorio es **privado** a propósito: `tablero-v2.html` lleva la llave del tablero
y la URL del endpoint en texto plano. Si algún día se hace público, hay que cambiar la
llave en las Propiedades del script y en el HTML.
