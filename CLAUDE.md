# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

"Bloqueador" es un bloqueador de anuncios personal, hecho como extensión de Chrome con Manifest V3. Empieza por Twitter/X, y la meta (ver `manifest.json`) es cubrir también YouTube, Twitch y webs en general. Por ahora solo está implementado Twitter/X.

## Desarrollo

No hay paso de compilación, gestor de paquetes, linter ni tests. Es JavaScript plano que Chrome carga directamente.

- **Cargar:** `chrome://extensions` → activar el modo de desarrollador → "Cargar descomprimida" → seleccionar la raíz del repo.
- **Recargar tras cambios:** pulsar el icono de recarga en la tarjeta de la extensión y luego refrescar la pestaña del sitio. Los content scripts no se recargan solos.
- **Depurar:** activa "Modo revisión" en el panel Info del popup: lo bloqueado se marca en rojo en vez de ocultarse y el content script escribe en la consola de DevTools de la *página* con el prefijo `[Bloqueador:<Sitio>]`.

## Arquitectura

- **Piezas:** content scripts por sitio (`src/sitios/twitter.js`, `twitch.js`), un popup (`src/popup/`) y dos scripts comunes: `src/comun/ajustes.js` y `src/comun/ocultar.js`. No hay service worker. Único permiso: `storage`.
- **Ajustes:** `ajustes.js` define `BloqueadorAjustes` (valores por defecto, `cargar`, `guardar`, `alCambiar`) sobre `chrome.storage.sync`. Como los content scripts no pueden usar `import` sin bundler, se carga como script clásico que expone un global: en el manifest va antes del script del sitio dentro del mismo array `js`, y en el popup con un `<script>` antes de `popup.js`. Para añadir una opción: valor por defecto en `POR_DEFECTO`, checkbox con `data-ajuste="ruta.del.ajuste"` en `popup.html` (el popup los enlaza solo) y uso en el script del sitio.
- **Añadir un sitio:** crear `src/sitios/<sitio>.js` (IIFE con `'use strict'`), añadir su entrada en `content_scripts` con `ajustes.js` y `ocultar.js` delante (en ese orden), su sección en `POR_DEFECTO` y su panel en el popup (YouTube aparece deshabilitado como "Pronto"). El popup tiene altura fija (`.cuerpo` en `popup.css`) ajustada al panel más largo; si un panel crece, revísala.
- **Todo se oculta vía una hoja de estilos:** cada sitio define `SELECTORES` (selectores CSS agrupados por opción del popup, mismas claves que `ajustes[sitio]`) y llama a `BloqueadorOcultar.iniciar(sitio, SELECTORES)`, que genera la hoja y la regenera cuando cambian los ajustes. Así el popup activa y desactiva opciones al momento sin recargar la página. El modo revisión solo cambia la regla CSS (ocultar o marcar en rojo). `iniciar` devuelve una función que da los ajustes actuales.
- **Patrón de detección (twitter.js):** los sitios objetivo son SPAs con listas virtualizadas, así que no basta con revisar la página una vez. Un `MutationObserver` sobre `document.body` agrupa las mutaciones en una sola pasada por `requestAnimationFrame` (`programarRevision` → `revisar`). Los tweets anuncio no se ocultan directamente: se marca su `[data-testid="cellInnerDiv"]` con `data-bloqueador="anuncio"` y la hoja de estilos hace el resto (ocultar la celda entera evita huecos en la lista).
- **Detección de anuncios en X:** un `article[data-testid="tweet"]` se considera anuncio si contiene un `<span>` hoja cuyo texto (sin espacios) coincide exactamente con una etiqueta localizada de `ETIQUETAS_ANUNCIO` (inglés y español). Se ignoran los spans dentro de `[data-testid="tweetText"]` para no bloquear tweets cuyo texto dice "Ad". "Colaboración pagada" se excluye a propósito. La detección depende de los atributos `data-testid` de X, así que si el bloqueo deja de funcionar, revisa primero esos selectores.
- **Elementos fijos de la interfaz de X** (Premium, Grok, Estudio para creadores, "A quién seguir"): los selectores usan `href`, `data-testid` o `:has()` en vez de textos o `aria-label`, que dependen del idioma. El icono de Grok de cada tweet no tiene `data-testid` y se detecta por su `svg[viewBox="0 0 33 32"]`.
- **Twitch:** usa clases generadas (`Layout-sc-…`) que cambian con cada versión, así que los selectores tiran de `data-a-target`, `data-test-selector`, iconos (`path[d^=…]`) o el prefijo de clases de CSS modules (`[class*="storiesLeftNavSection"]`). Los anuncios de vídeo van insertados en el stream (no son elementos de la página) y aún no se tratan.
- **Pestaña oculta:** `requestAnimationFrame` no se ejecuta con la pestaña oculta (Chrome la considera oculta si otra ventana la tapa entera), y X tampoco carga tweets nuevos en ese estado. Tenlo en cuenta al probar con automatización.

## Convenciones

Los identificadores, comentarios, mensajes de log y el manifest están en español (`sitios`, `esAnuncio`, `bloquear`, `revisar`). Mantén el código nuevo en español también.
