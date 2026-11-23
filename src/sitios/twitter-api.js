/**
 * Bloqueador - Twitter/X: acceso a la página (mundo MAIN)
 * Corre en el contexto de la propia página (world: "MAIN") porque desde el
 * mundo aislado no se ve ni React ni el router de X. Hace tres cosas, que piden
 * los content scripts a través de twitter-comun.js:
 * - Decir si React ya ha hidratado un elemento. X manda la página ya dibujada
 *   desde el servidor, y si se inserta algo antes de que React la haga suya,
 *   la vuelve a dibujar entera.
 * - Dar los MP4 de un tweet. X reproduce los vídeos desde blob: (HLS), así que
 *   el MP4 no está en la página: se lee del almacén de Relay, donde X guarda
 *   todos los tweets que ha cargado.
 * - Navegar sin recargar: el router de X envuelve history.pushState y solo se
 *   entera si se llama a la suya (el de la web clásica, con un popstate).
 * No tiene acceso a chrome.* ni a los ajustes.
 */
(() => {
  'use strict';

  const ORIGEN = 'bloqueador-x';
  const EVENTO_HIDRATADO = 'bloqueador-hidratado';

  function fibraDe(elemento) {
    const clave = Object.keys(elemento).find((k) => k.startsWith('__reactFiber$'));
    return clave && elemento[clave];
  }

  // ---- Almacén de Relay ----

  let entorno = null;

  // El entorno de Relay está en el contexto de React, por encima de los tweets
  function buscarEntorno() {
    for (const elemento of document.querySelectorAll('article, main, aside')) {
      for (let fibra = fibraDe(elemento); fibra; fibra = fibra.return) {
        const valor = fibra.memoizedProps?.value;
        const candidato = valor?.environment ?? valor;
        if (typeof candidato?.getStore === 'function') return candidato;
      }
    }
    return null;
  }

  function videosDe(id) {
    const fuente = entorno.getStore().getSource();
    const uno = (campo) => (campo?.__ref ? fuente.get(campo.__ref) : null);
    const varios = (campo) => (campo?.__refs ?? []).map((ref) => fuente.get(ref)).filter(Boolean);

    // Los registros van por el id global de GraphQL, que es "Tweet:<id>" en base64
    const tweet = fuente.get(btoa(`Tweet:${id}`));
    const urls = varios(tweet?.media_entities2)
      .filter((media) => media.type === 'video' || media.type === 'animated_gif')
      .map((media) => varios(uno(media.video_info)?.variants)
        .filter((v) => v.content_type === 'video/mp4' && v.url)
        .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0]?.url)
      .filter(Boolean);
    if (!urls.length) return null;
    const autor = uno(uno(uno(tweet.core)?.user_results)?.result);
    return { id, usuario: uno(autor?.core)?.screen_name ?? '', urls };
  }

  function buscarVideos(ids) {
    entorno ??= buscarEntorno();
    if (!entorno) return [];
    return ids.map((id) => {
      try {
        return videosDe(id);
      } catch {
        return null; // X ha cambiado el formato del almacén
      }
    }).filter(Boolean);
  }

  // ---- Peticiones de los content scripts ----

  // Los eventos del DOM llegan a los dos mundos y se reparten al momento:
  // cancelar el evento es la respuesta "sí, hidratado"
  document.addEventListener(EVENTO_HIDRATADO, (e) => {
    if (fibraDe(e.target)) e.preventDefault();
  }, true);

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.origen !== ORIGEN) return;
    const { pedirVideos, navegar } = e.data;
    if (Array.isArray(pedirVideos)) {
      const videos = buscarVideos(pedirVideos.filter((id) => /^\d+$/.test(id)));
      if (videos.length) window.postMessage({ origen: ORIGEN, videos }, location.origin);
    }
    // Solo rutas de la propia X ("//otro.sitio" sería otro dominio)
    if (typeof navegar === 'string' && /^\/(?!\/)/.test(navegar)) {
      if (document.querySelector('script[src*="/entry-client"]')) {
        history.pushState({}, '', navegar);
      } else {
        history.pushState(history.state, '', navegar);
        window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
      }
    }
  });
})();
