/**
 * Bloqueador - Estadísticas (content scripts)
 * Cuenta lo que bloquea cada sitio y lo manda a fondo.js, que es quien lo
 * guarda en chrome.storage.local: así varias pestañas a la vez no se pisan.
 * Se agrupa y se envía como mucho cada 2 s para no escribir a cada anuncio.
 *
 * - sumar(sitio, tipo): cuenta uno (p. ej. un anuncio de vídeo saltado).
 * - vigilar(sitio, tipo, selector, activa): cuenta los elementos nuevos que
 *   cumplen el selector mientras activa() sea cierto. Para lo que se oculta
 *   por CSS, que no pasa por ningún código del sitio.
 */
const BloqueadorEstadisticas = (() => {
  'use strict';

  const pendientes = {}; // 'sitio.tipo' -> cantidad
  let programado = false;

  function enviar() {
    programado = false;
    const cambios = { ...pendientes };
    for (const clave in pendientes) delete pendientes[clave];
    // Falla si la extensión se ha recargado y esta pestaña aún no: se pierde
    chrome.runtime.sendMessage({ tipo: 'estadisticas', cambios }).catch(() => {});
  }

  function sumar(sitio, tipo, cantidad = 1) {
    const clave = `${sitio}.${tipo}`;
    pendientes[clave] = (pendientes[clave] || 0) + cantidad;
    if (!programado) {
      programado = true;
      setTimeout(enviar, 2000);
    }
  }

  function vigilar(sitio, tipo, selector, activa) {
    const vistos = new WeakSet();
    setInterval(() => {
      if (!activa()) return;
      for (const elemento of document.querySelectorAll(selector)) {
        if (vistos.has(elemento)) continue;
        vistos.add(elemento);
        // Con selectores tipo div:has(…) también cumplen los contenedores de
        // dentro: se cuenta solo el de fuera
        if (elemento.parentElement?.closest(selector)) continue;
        sumar(sitio, tipo);
      }
    }, 2000);
  }

  return { sumar, vigilar };
})();
