/**
 * Bloqueador - Service worker
 * - Descarga los vídeos de X que pide twitter-acciones.js: los content scripts
 *   no pueden usar chrome.downloads.
 * - Guarda las estadísticas que mandan los content scripts (estadisticas.js).
 */
'use strict';

// --- Estadísticas ------------------------------------------------------------
// En chrome.storage.local, clave "estadisticas":
//   { desde: 'AAAA-MM-DD', total: { 'sitio.tipo': n }, dias: { 'AAAA-MM-DD': { 'sitio.tipo': n } } }
// Se guardan los últimos DIAS_GUARDADOS días. Las escrituras van en cola para
// que dos pestañas que mandan a la vez no se pisen.
const DIAS_GUARDADOS = 30;
let colaEstadisticas = Promise.resolve();

const fechaLocal = (fecha = new Date()) => fecha.toLocaleDateString('sv'); // AAAA-MM-DD

async function sumarEstadisticas(cambios) {
  const hoy = fechaLocal();
  const { estadisticas: datos = { desde: hoy, total: {}, dias: {} } } = await chrome.storage.local.get('estadisticas');
  const dia = (datos.dias[hoy] ??= {});
  for (const [clave, cantidad] of Object.entries(cambios)) {
    if (!Number.isInteger(cantidad) || cantidad <= 0) continue;
    datos.total[clave] = (datos.total[clave] || 0) + cantidad;
    dia[clave] = (dia[clave] || 0) + cantidad;
  }
  const limite = new Date();
  limite.setDate(limite.getDate() - DIAS_GUARDADOS);
  for (const fecha of Object.keys(datos.dias)) {
    if (fecha < fechaLocal(limite)) delete datos.dias[fecha];
  }
  await chrome.storage.local.set({ estadisticas: datos });
}

chrome.runtime.onMessage.addListener((mensaje, remitente) => {
  if (mensaje?.tipo !== 'estadisticas' || remitente.id !== chrome.runtime.id) return;
  if (typeof mensaje.cambios !== 'object' || !mensaje.cambios) return;
  colaEstadisticas = colaEstadisticas.then(() => sumarEstadisticas(mensaje.cambios)).catch(() => {});
});

// --- Descarga de vídeos de X -------------------------------------------------

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
