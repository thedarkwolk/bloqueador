/**
 * Bloqueador - YouTube
 * - Anuncios de vídeo: se silencian, se aceleran a x16 y se pulsa "Saltar".
 * - Anuncios en Shorts: se pasa al Short siguiente.
 * - Anuncios de la página y promociones de Premium: se ocultan.
 * Qué se hace lo decide el popup (ver src/comun/ajustes.js y ocultar.js).
 *
 * YouTube es una SPA: los anuncios de vídeo y los Shorts se revisan con un
 * intervalo (no con requestAnimationFrame) para que también funcione con la
 * pestaña en segundo plano, que es cuando más se escucha música.
 */
(() => {
  'use strict';

  // Qué ocultar por cada opción del popup (claves de ajustes.youtube).
  // YouTube usa custom elements con nombres estables (ytd-…), que no dependen
  // del idioma.
  const SELECTORES = {
    anuncios: [
      // Anuncio dentro de la cuadrícula de la portada: se oculta el elemento
      // entero de la cuadrícula para que no quede hueco
      'ytd-rich-item-renderer:has(> #content > ytd-ad-slot-renderer)',
      // Anuncios en las sugerencias, los resultados de búsqueda, etc.
      'ytd-ad-slot-renderer',
      // Huecos de anuncio de la cabecera de la portada y de encima de las sugerencias
      '#masthead-ad',
      '#player-ads',
      'ytd-companion-slot-renderer',
      // Tarjeta "Patrocinado" del anunciante junto al vídeo
      'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"]',
      // Banner de anuncio sobre el vídeo (parte inferior del reproductor)
      '.ytp-ad-overlay-container'
    ],
    premium: [
      // "Dos planes premium. Un precio único." en la portada
      'ytd-rich-section-renderer:has(ytd-statement-banner-renderer)',
      'ytd-statement-banner-renderer',
      'ytd-banner-promo-renderer',
      // Aviso "Prueba YouTube Premium" que sale abajo
      'ytd-mealbar-promo-renderer'
    ]
  };

  const REGLAS = {
    // Mientras se salta un bloque de anuncios: ni un fotograma ni la tarjeta del
    // anunciante, y un aviso para que el negro no parezca un fallo (entre un
    // anuncio y otro YouTube tarda unos segundos en cargar el siguiente).
    // "Saltar" se pulsa por código aunque esté oculto
    anunciosVideo: `
      #movie_player.ad-showing video,
      #movie_player.ad-showing .ytp-ad-module { opacity: 0 !important; }
      #movie_player.ad-showing::after {
        content: "Saltando anuncios…";
        position: absolute; inset: 0; z-index: 60;
        display: grid; place-items: center;
        color: #aaa; font: 500 15px Roboto, Arial, sans-serif;
        pointer-events: none;
      }`
  };

  const ajustes = BloqueadorOcultar.iniciar('youtube', SELECTORES, REGLAS);
  const opcion = (clave) => ajustes().activo && ajustes().youtube[clave];

  // --- Anuncios de vídeo -----------------------------------------------------
  // Durante un anuncio el reproductor (#movie_player) lleva la clase
  // "ad-showing" y el <video> reproduce el anuncio. Se silencia, se reproduce a
  // x16 y se pulsa "Saltar" en cuanto aparece. No se salta al final con
  // currentTime: YouTube se queda parado varios segundos tras cada salto, y a
  // x16 el anuncio "termina" solo y pasa al siguiente del bloque sin esperas.
  // Al acabar se devuelven el sonido y la velocidad como estaban: YouTube
  // reutiliza el mismo <video> para el vídeo de verdad.
  const VELOCIDAD_ANUNCIO = 16;
  let previo = null; // { muted, velocidad } antes del primer anuncio del bloque

  function saltarAnuncioVideo() {
    const jugador = document.querySelector('#movie_player');
    const video = jugador?.querySelector('video');
    if (!video) return;

    if (opcion('anunciosVideo') && jugador.classList.contains('ad-showing')) {
      if (!previo) previo = { muted: video.muted, velocidad: video.playbackRate };
      // Solo si cambia: estas asignaciones disparan los eventos que escuchamos
      if (!video.muted) video.muted = true;
      if (video.playbackRate !== VELOCIDAD_ANUNCIO) video.playbackRate = VELOCIDAD_ANUNCIO;
      document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern')?.click();
      if (video.paused) video.play().catch(() => {});
    } else if (previo) {
      video.muted = previo.muted;
      video.playbackRate = previo.velocidad;
      previo = null;
    }
  }

  // Además del intervalo, reaccionar al momento cuando empieza cada anuncio o
  // YouTube le devuelve el sonido o la velocidad, para que no se oiga ni un
  // instante. Los eventos de <video> no burbujean: se escuchan en captura.
  for (const evento of ['loadedmetadata', 'play', 'playing', 'volumechange', 'ratechange']) {
    document.addEventListener(evento, (e) => {
      if (e.target instanceof HTMLVideoElement && e.target.closest('#movie_player')) saltarAnuncioVideo();
    }, true);
  }

  // --- Anuncios en Shorts ----------------------------------------------------
  // El anuncio es un Short más: su ytd-reel-video-renderer contiene un
  // ytd-ad-slot-renderer. Ocultarlo rompería el desplazamiento entre Shorts,
  // así que se pulsa el botón de "siguiente". Solo hay un Short en la página a
  // la vez. Se reintenta como mucho una vez por segundo por si el botón aún no
  // estaba listo.
  let ultimoIntento = 0;

  function saltarShortAnuncio() {
    if (!opcion('shorts') || !location.pathname.startsWith('/shorts/')) return;
    const anuncio = [...document.querySelectorAll('ytd-reel-video-renderer')].find((reel) => {
      if (!reel.querySelector('ytd-ad-slot-renderer')) return false;
      const r = reel.getBoundingClientRect();
      return r.bottom > 0 && r.top < innerHeight;
    });
    if (!anuncio || Date.now() - ultimoIntento < 1000) return;
    ultimoIntento = Date.now();
    document.querySelector('#navigation-button-down button')?.click();
  }

  setInterval(() => {
    saltarAnuncioVideo();
    saltarShortAnuncio();
  }, 300);
})();
