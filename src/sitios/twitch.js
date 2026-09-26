/**
 * Bloqueador - Twitch
 * Oculta elementos publicitarios y promocionales de la interfaz: anuncios de
 * portada y del chat, banners patrocinados, Turbo, Prime, Bits, regalos,
 * mayores donantes, avisos del chat, contadores de avisos, campana del canal,
 * historias y rachas.
 * Qué se oculta lo decide el popup (ver src/comun/ajustes.js y ocultar.js).
 *
 * Los anuncios de vídeo del directo van insertados en el propio stream: esos
 * no se ocultan, se tapan con el directo en pequeño que Twitch sigue emitiendo
 * durante la pausa (ver "Anuncios en directo" más abajo).
 */
(() => {
  'use strict';

  // Qué ocultar por cada opción del popup (claves de ajustes.twitch).
  // Twitch usa clases generadas (Layout-sc-…) que cambian con cada versión, así
  // que se usan data-a-target, iconos o el prefijo de las clases de CSS modules.
  // Los botones de la barra superior se ocultan con su contenedor para que no
  // quede su margen.
  // Truco para elementos sin contenedor propio: `div:has(X):not(:has(Y))` son
  // los contenedores de X que no incluyen a su vecino Y; el más externo es el
  // que lleva el margen, y ocultarlo oculta todo lo de dentro.
  const SELECTORES = {
    anunciosDirecto: [
      // Banner "¡Suscríbete para ver contenido sin anuncios…" que sale durante
      // la pausa publicitaria, justo encima del directo en pequeño
      'div:has(+ .picture-by-picture-player)'
    ],
    anuncios: [
      // Anuncio grande de la portada, detrás del carrusel de directos
      '[data-a-target="frontpage-headliner"]',
      // Tarjeta de vídeo ("Anuncio 0:18 · Más información") metida en las filas
      // de canales. No tiene atributos propios; las tarjetas de canal usan
      // miniaturas, así que se reconoce por su <video> servido desde Amazon
      '.tw-tower > div:has(video[src*="amazon"])',
      // El mismo tipo de vídeo encima del chat de un canal
      '.chat-shell div:has(video[src*="amazon"]):not(:has([role="log"]))',
      // Banner patrocinado bajo el directo ("Bonus de suscripciones… Presentado
      // por…"): se reconoce por sus imágenes de campañas de suscripción
      '.channel-info-content > div > div:has(img[src*="subs-image-assets"])'
    ],
    turbo: [
      // "Prueba 1 mes sin anuncios": sin atributos propios, se reconoce por
      // su icono (un rayo dentro de una tele), que no se usa en otro sitio
      '.top-nav__menu > div > div:has(path[d^="m13 8-5.349 3.12"])'
    ],
    prime: ['.top-nav__menu > div > div:has([data-a-target="prime-offers-icon"])'],
    bits: [
      '.top-nav__menu > div > div:has([data-a-target="top-nav-get-bits-button"])',
      // En la barra del canal usa el mismo data-a-target que en la superior
      '[data-target="channel-header-right"] > div:has([data-a-target="top-nav-get-bits-button"])',
      // Botón "Cheer" del chat
      '[data-a-target="bits-button"]',
      // Saldo de Bits bajo el chat (icono + número); los puntos del canal se quedan
      '[data-test-selector="bits-balance-string"]',
      'div:has(+ [data-test-selector="bits-balance-string"])'
    ],
    regalos: [
      // "Regalo: suscripciones extra", junto al botón de suscribirse
      '[data-target="channel-header-right"] div:has([data-a-target="gift-button"]):not(:has([data-a-target="subscribe-button"]))'
    ],
    donantes: [
      // Clasificación de "Mayores donantes" encima del chat
      '.chat-shell div:has([data-testid="leaderboard-top-three-entry"]):not(:has([role="log"]))'
    ],
    avisosChat: [
      // Pila de tarjetas encima del chat: Drops ("Suscríbete para conseguir…"),
      // mensajes fijados, eventos… Se oculta la pila entera
      '.chat-shell div:has(> [class*="community-highlight-stack__scroll-area"])'
    ],
    campana: [
      // Preferencias de notificaciones del canal, junto al botón de seguir.
      // Sin atributos propios: se reconoce por su icono, que es único en la página
      '[data-target="channel-header-right"] div:has(path[d^="M15 19a3 3 0 1 1-6 0h6Z"]):not(:has([data-a-target$="follow-button"]))'
    ],
    contadores: [
      // Números rojos sobre la campana de notificaciones y la corona de Prime
      '[data-test-selector="onsite-notifications__badge"]',
      '.prime-offers__pill'
    ],
    historias: [
      // "Abrir historias" en la sección "Para ti" de la barra izquierda
      '[class*="storiesLeftNavSection"]'
    ],
    rachas: [
      // "¡Mantén tu racha!" con su "Mostrar más", en la barra izquierda
      '[role="group"]:has(> [class*="saveYourStreakSideNavRow"])'
    ]
  };

  // CSS que no es ocultar
  const REGLAS = {
    // "Suscríbete / Renovar suscripción: ¡hasta un 30 % de descuento!" -> "Suscribirse".
    // El texto original se encoge a 0 y se pinta el nuevo con ::after
    textoSuscribirse: `
      [data-a-target="subscribe-button"] [data-a-target="tw-core-button-label-text"] { font-size: 0 !important; }
      [data-a-target="subscribe-button"] [data-a-target="tw-core-button-label-text"]::after { content: "Suscribirse"; font-size: 14px; }`
  };

  const ajustes = BloqueadorOcultar.iniciar('twitch', SELECTORES, REGLAS);

  // --- Anuncios en directo ---------------------------------------------------
  // Durante una pausa publicitaria Twitch pone el anuncio en el reproductor
  // principal (con la etiqueta [data-a-target="video-ad-label"]) y sigue
  // emitiendo el directo en pequeño y silenciado encima del chat
  // (.picture-by-picture-player). Mientras dure la pausa se muestra ese directo
  // en grande encima del anuncio, con sonido, y se silencia el anuncio.
  // Se copia con captureStream() en un <video> propio en vez de mover el de
  // Twitch: la columna del chat no deja sacarlo de su sitio y Twitch le fuerza
  // el volumen. Si no hay directo en pequeño, el anuncio solo se tapa y silencia.
  // Se revisa con un intervalo (no con requestAnimationFrame) para que también
  // funcione con la pestaña en segundo plano, que es cuando más molesta el audio.

  const ID_CAPA = 'bloqueador-pausa';
  let pausa = null; // { principal, capa, video, origen, mutedPrevio }

  function crearCapa() {
    const capa = document.createElement('div');
    capa.id = ID_CAPA;
    Object.assign(capa.style, {
      position: 'absolute', inset: '0', background: '#000',
      display: 'grid', placeItems: 'center',
      color: '#adadb8', font: '14px system-ui, sans-serif'
    });
    capa.textContent = 'Anuncio en curso · el directo vuelve en cuanto acabe';
    return capa;
  }

  function iniciarPausa() {
    const principal = document.querySelector('.persistent-player video');
    if (!principal) return;
    const capa = crearCapa();
    // Justo detrás del <video>: los controles y la cuenta atrás del anuncio,
    // que van después, siguen quedando por encima
    principal.after(capa);
    pausa = { principal, capa, video: null, origen: null, mutedPrevio: principal.muted };
    principal.muted = true;
    conectarDirecto();
  }

  // El directo en pequeño puede aparecer después que la etiqueta de anuncio,
  // o cambiar a mitad de pausa, así que se vuelve a intentar en cada revisión
  function conectarDirecto() {
    const origen = document.querySelector('.picture-by-picture-player video');
    if (!origen || origen === pausa.origen) return;
    pausa.origen = origen;
    const video = pausa.video || document.createElement('video');
    Object.assign(video.style, { width: '100%', height: '100%', objectFit: 'contain' });
    video.playsInline = true;
    video.srcObject = origen.captureStream();
    video.muted = pausa.mutedPrevio;
    video.volume = pausa.principal.volume;
    pausa.capa.replaceChildren(video);
    pausa.video = video;
    // Sin interacción previa con la página Chrome puede bloquear el sonido:
    // entonces se reproduce en silencio y se activa al hacer clic
    video.play().catch(() => {
      video.muted = true;
      video.play();
      pausa.capa.addEventListener('click', () => { video.muted = false; }, { once: true });
    });
  }

  function mantenerPausa() {
    // Twitch puede volver a activar el sonido del anuncio (p. ej. entre anuncios)
    pausa.principal.muted = true;
    if (pausa.video) pausa.video.volume = pausa.principal.volume;
    conectarDirecto();
  }

  function terminarPausa() {
    if (pausa.video) pausa.video.srcObject = null;
    pausa.capa.remove();
    pausa.principal.muted = pausa.mutedPrevio;
    pausa = null;
  }

  setInterval(() => {
    const opcion = ajustes().activo && ajustes().twitch.anunciosDirecto;
    const enAnuncio = opcion && !!document.querySelector('[data-a-target="video-ad-label"]');
    // Si Twitch sustituye el reproductor (p. ej. al cambiar de canal), la pausa queda huérfana
    if (pausa && !pausa.principal.isConnected) { pausa.capa.remove(); pausa = null; }
    if (enAnuncio && !pausa) iniciarPausa();
    else if (!enAnuncio && pausa) terminarPausa();
    else if (pausa) mantenerPausa();
  }, 500);
})();
