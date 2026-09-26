/**
 * Bloqueador - Twitter/X: lectura de vídeos (mundo MAIN)
 * X reproduce los vídeos desde blob: (HLS), así que el MP4 no está en la
 * página. Las URLs de los MP4 vienen en las respuestas de su API GraphQL
 * (video_info.variants). Este script corre en el contexto de la propia página
 * (world: "MAIN", document_start) para poder envolver fetch y XMLHttpRequest
 * antes de que X haga sus peticiones, y pasa lo que encuentra al content
 * script (twitter-videos.js) con postMessage.
 * No tiene acceso a chrome.* ni a los ajustes: si la opción está desactivada,
 * el content script ignora los mensajes.
 */
(() => {
  'use strict';

  const ORIGEN = 'bloqueador-videos';
  const MAX_GUARDADOS = 3000;
  // id del tweet -> { id, usuario, urls }. Se guardan para reenviarlos cuando
  // el content script (que carga más tarde, en document_idle) los pida
  const guardados = new Map();

  function mejorMp4(media) {
    const variantes = (media.video_info?.variants ?? [])
      .filter((v) => v.content_type === 'video/mp4' && v.url)
      .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
    return variantes[0]?.url;
  }

  function videosDe(tweet) {
    const media = tweet?.legacy?.extended_entities?.media ?? [];
    const urls = media
      .filter((m) => m.type === 'video' || m.type === 'animated_gif')
      .map(mejorMp4)
      .filter(Boolean);
    if (!urls.length) return null;
    const usuario = tweet.core?.user_results?.result?.core?.screen_name
      ?? tweet.core?.user_results?.result?.legacy?.screen_name
      ?? '';
    return { usuario, urls };
  }

  // Los tweets con restricciones vienen envueltos en { tweet: {...} }
  const desenvolver = (resultado) => resultado?.tweet ?? resultado;

  // Recorre la respuesta buscando tweets (objetos con legacy.id_str). Un tweet
  // que cita a otro con vídeo se asocia también a ese vídeo, porque en la
  // página el vídeo citado aparece dentro del tweet que cita
  function extraer(nodo, encontrados) {
    if (!nodo || typeof nodo !== 'object') return;
    if (Array.isArray(nodo)) {
      for (const hijo of nodo) extraer(hijo, encontrados);
      return;
    }
    const id = nodo.legacy?.id_str;
    if (id) {
      const videos = videosDe(nodo) ?? videosDe(desenvolver(nodo.quoted_status_result?.result));
      if (videos) encontrados.push({ id, ...videos });
    }
    for (const valor of Object.values(nodo)) extraer(valor, encontrados);
  }

  function enviar(videos) {
    window.postMessage({ origen: ORIGEN, videos }, location.origin);
  }

  function procesar(datos) {
    const encontrados = [];
    extraer(datos, encontrados);
    if (!encontrados.length) return;
    for (const video of encontrados) {
      guardados.delete(video.id);
      guardados.set(video.id, video);
    }
    while (guardados.size > MAX_GUARDADOS) guardados.delete(guardados.keys().next().value);
    enviar(encontrados);
  }

  const esGraphql = (url) => String(url).includes('/graphql/');

  const fetchOriginal = window.fetch;
  window.fetch = async function (recurso, ...resto) {
    const respuesta = await fetchOriginal.call(this, recurso, ...resto);
    const url = typeof recurso === 'string' ? recurso : recurso?.url;
    if (esGraphql(url)) {
      respuesta.clone().json().then(procesar).catch(() => {});
    }
    return respuesta;
  };

  const abrirOriginal = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (metodo, url, ...resto) {
    if (esGraphql(url)) {
      this.addEventListener('load', () => {
        try {
          if (this.responseType === 'json') procesar(this.response);
          else if (this.responseType === '' || this.responseType === 'text') procesar(JSON.parse(this.responseText));
        } catch { /* respuesta que no es JSON */ }
      });
    }
    return abrirOriginal.call(this, metodo, url, ...resto);
  };

  window.addEventListener('message', (e) => {
    if (e.source === window && e.data?.origen === ORIGEN && e.data.pedir) {
      enviar([...guardados.values()]);
    }
  });
})();
