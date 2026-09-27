/**
 * Bloqueador - YouTube: saltar los anuncios de vídeo
 * El botón "Saltar" no sirve pulsado por código: su onClick comprueba
 * event.isTrusted y, si el clic no es real, no salta y avisa a YouTube de una
 * anomalía. Con un clic real lo que hace es llamar a
 * movie_player.onAdUxClicked('skip-button', layoutId), y eso sí se puede
 * llamar desde la página. El reproductor solo lo atiende si el layoutId es el
 * del anuncio que está sonando y no mira si ya se podía saltar, así que
 * también salta los anuncios "no saltables".
 * Los layoutId vienen en la respuesta del reproductor (getPlayerResponse) y,
 * para los anuncios de mitad de vídeo, en /youtubei/v1/player/ad_break. Este
 * script corre en el mundo de la página (world: "MAIN") para llegar a
 * movie_player y a esas respuestas. No ve chrome.storage: youtube.js pone
 * data-bloqueador-saltar en <html> cuando la opción está activa.
 */
(() => {
  'use strict';

  // Tipos de componente que saltan un anuncio: el botón "Saltar" y el de las
  // encuestas que YouTube pone en lugar de un anuncio de vídeo
  const COMPONENTES = ['skip-button', 'survey-interstitial'];

  const porRespuesta = new WeakMap(); // respuesta del reproductor -> layoutIds
  let deAdBreak = []; // layoutIds del último /player/ad_break

  function layoutIds(json) {
    const ids = [];
    JSON.stringify(json, (clave, valor) => {
      if (clave === 'layoutId' && typeof valor === 'string') ids.push(valor);
      return valor;
    });
    return ids;
  }

  function idsRespuesta(jugador) {
    const respuesta = jugador.getPlayerResponse?.();
    if (!respuesta) return [];
    if (!porRespuesta.has(respuesta)) porRespuesta.set(respuesta, layoutIds(respuesta));
    return porRespuesta.get(respuesta);
  }

  function leerAdBreak(texto) {
    try {
      deAdBreak = layoutIds(JSON.parse(texto));
    } catch {}
  }

  const esAdBreak = (url) => String(url).includes('/youtubei/v1/player/ad_break');

  const fetchOriginal = window.fetch;
  window.fetch = function (recurso, ...resto) {
    const promesa = fetchOriginal.call(this, recurso, ...resto);
    if (esAdBreak(recurso?.url ?? recurso)) {
      promesa.then((r) => r.clone().text()).then(leerAdBreak).catch(() => {});
    }
    return promesa;
  };

  const abrirOriginal = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (metodo, url, ...resto) {
    if (esAdBreak(url)) {
      this.addEventListener('load', () => {
        if (!this.responseType || this.responseType === 'text') leerAdBreak(this.responseText);
      });
    }
    return abrirOriginal.call(this, metodo, url, ...resto);
  };

  // Se llama con todos los layoutId conocidos: el reproductor ignora los que
  // no son del anuncio actual. Se repite en cada vuelta porque el siguiente
  // anuncio del bloque no está activo hasta que acaba (o se salta) el anterior.
  setInterval(() => {
    if (!document.documentElement.hasAttribute('data-bloqueador-saltar')) return;
    const jugador = document.getElementById('movie_player');
    if (!jugador?.classList.contains('ad-showing') || !jugador.onAdUxClicked) return;
    for (const id of new Set([...idsRespuesta(jugador), ...deAdBreak])) {
      for (const componente of COMPONENTES) jugador.onAdUxClicked(componente, id);
    }
  }, 250);
})();
