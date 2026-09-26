/**
 * Bloqueador - Service worker
 * Descarga los vídeos de X que pide twitter-videos.js: los content scripts no
 * pueden usar chrome.downloads.
 */
'use strict';

// Solo se descargan vídeos del CDN de X, aunque la página intente colar otra URL
// (los mensajes pasan por postMessage desde el contexto de la página)
const ORIGEN_VIDEOS = 'https://video.twimg.com/';

const nombreSeguro = (texto) => String(texto).replace(/[^\w.-]+/g, '_').slice(0, 60);

chrome.runtime.onMessage.addListener((mensaje, remitente, responder) => {
  if (mensaje?.tipo !== 'descargar-video' || remitente.id !== chrome.runtime.id) return;

  const urls = (Array.isArray(mensaje.urls) ? mensaje.urls : [])
    .filter((url) => typeof url === 'string' && url.startsWith(ORIGEN_VIDEOS));
  if (!urls.length) {
    responder({ ok: false, error: 'URL de vídeo no válida' });
    return;
  }

  // usuario_idtweet.mp4 (o _1, _2… si el tweet tiene varios vídeos)
  const base = `${nombreSeguro(mensaje.usuario) || 'x'}_${nombreSeguro(mensaje.id)}`;
  const descargas = urls.map((url, i) => chrome.downloads.download({
    url,
    filename: urls.length > 1 ? `${base}_${i + 1}.mp4` : `${base}.mp4`,
    conflictAction: 'uniquify'
  }));
  Promise.all(descargas).then(
    () => responder({ ok: true }),
    (e) => responder({ ok: false, error: e.message })
  );
  return true; // la respuesta llega de forma asíncrona
});
