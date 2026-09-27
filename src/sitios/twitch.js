/**
 * Bloqueador - Twitch
 * Oculta elementos publicitarios y promocionales de la interfaz: anuncios de
 * portada y del chat, banners patrocinados, Turbo, Prime, Bits, regalos,
 * mayores donantes, avisos del chat, contadores de avisos, campana del canal,
 * historias y rachas. En la barra izquierda deja solo los canales seguidos en
 * directo, todos (ver twitch-seguidos.js), sin líneas extra y más ancha.
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
      'div:has(+ .picture-by-picture-player)',
      // Banners "Stream Display Ads" dentro del reproductor (en el hueco que
      // deja el vídeo encogido, ver REGLAS.anunciosDirecto)
      '[data-test-selector="sda-wrapper"]',
      // Los mismos banners en modo "pushdown", debajo del reproductor cuando
      // hay sitio: el div con el alto (90 px) es el padre de sus iframes
      'div:has(> div > iframe[class*="stream-display-ad__iframe_pushdown"])'
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
      '[data-target="channel-header-right"] div:has(path[d^="M15 19a3 3 0 1 1-6 0h6Z"]):not(:has([data-a-target$="follow-button"]))',
      // Con las notificaciones desactivadas el icono es otro (campana tachada).
      // Es el único botón de la zona con aria-expanded y sin data-a-target
      '[data-target="channel-header-right"] div:has(button[aria-expanded]:not([data-a-target])):not(:has([data-a-target$="follow-button"]))'
    ],
    contadores: [
      // Números rojos sobre la campana de notificaciones y la corona de Prime
      '[data-test-selector="onsite-notifications__badge"]',
      '.prime-offers__pill'
    ],
    historias: [
      // "Abrir historias" en la sección "Para ti" de la barra izquierda
      '[class*="storiesLeftNavSection"]',
      // Con la barra plegada su contenedor, que aun vacío deja un hueco arriba
      '#side-nav div:has([class*="storiesLeftNavSection"]):not(:has(.side-nav-section))'
    ],
    rachas: [
      // "¡Mantén tu racha!" con su "Mostrar más", en la barra izquierda
      '[role="group"]:has(> [class*="saveYourStreakSideNavRow"])'
    ],
    navegacion: [
      // "Siguiendo" y "Explorar" (van en el mismo contenedor) y el menú de
      // los tres puntos, junto al logo
      '.top-nav__menu > div > div:has([data-a-target="following-link"])',
      '.top-nav__menu > div > div:has([data-a-target="ellipsis-button"])'
    ],
    // Barra izquierda, abierta y plegada: la sección de seguidos es la única
    // cuya cabecera lleva .followed-side-nav-header (el resto usa .side-nav-header)
    soloSeguidos: [
      // "Canales en directo", "Categorías recomendadas" y, en un canal,
      // "Los espectadores de X también ven"
      '#side-nav .side-nav-section:not(:has(.followed-side-nav-header))',
      // Con la barra plegada, el corazón que separa los seguidos de las otras
      // secciones: sin ellas sobra
      '#side-nav .followed-side-nav-header[data-a-target="side-nav-header-collapsed"]'
    ],
    todosSeguidos: [
      // Los seguidos en directo se despliegan solos (twitch-seguidos.js); los
      // desconectados que Twitch pone detrás y "Mostrar más/menos" sobran
      '#side-nav .side-nav-card:has(.side-nav-card__avatar--offline)',
      '#side-nav .side-nav-section:has(.followed-side-nav-header) div:has(> button[data-a-target^="side-nav-show-"])'
    ],
    tarjetasLimpias: [
      // Tercera línea de algunos canales ("Racha de visualizaciones", eventos…):
      // el hermano del bloque con el nombre, el juego y los espectadores
      '#side-nav div:has(> [data-a-target="side-nav-card-metadata"]) ~ div'
    ]
  };

  // CSS que no es ocultar
  const REGLAS = {
    // Sin "Siguiendo", "Explorar" ni el menú, el buscador pasa junto al logo:
    // la barra superior son tres columnas flexibles; la del logo deja de
    // crecer (tiene width: 100 %) y la del buscador deja de centrarlo
    navegacion: `
      .top-nav__menu > div:has([data-a-target="home-link"]) { flex: 0 0 auto !important; width: auto !important; }
      .top-nav__menu > div:has([data-a-target="nav-search-box"]) { justify-content: flex-start !important; }`,
    // El directo en la barra superior (twitch-directo.js). Va después de
    // navegacion para que su buscador (a la derecha, estrecho y con borde
    // discreto; en un directo, oculto) gane.
    // Los botones de seguir y suscribirse son los de Twitch fijados encima de
    // la barra: .twilight-main y sus hijos crean capas (z-index) por debajo de
    // la de la barra (1000) y hay que anularlas para que puedan salir
    // La columna central ocupa todo el hueco sin depender de su contenido (si
    // no, un título más largo la ensancha y mueve los botones y el buscador);
    // las de los lados tienen width: 100 % y se ajustan a lo suyo
    directoArriba: `
      .top-nav__menu > div:has([data-a-target="nav-search-box"]) { flex: 1 1 0 !important; min-width: 0 !important; justify-content: flex-end !important; }
      .top-nav__menu > div:is(:has([data-a-target="home-link"]), :last-child) { flex: 0 0 auto !important; width: auto !important; }
      .top-nav__search-container { flex: 0 0 220px !important; }
      .top-nav__search-container input:not(:focus) { box-shadow: inset 0 0 0 1px #3a3a3d !important; }
      html[data-bloqueador-directo] .top-nav__search-container { display: none !important; }
      /* Twitch limita el reproductor a calc(100vh - 16rem) para dejar sitio al
         bloque de información (en línea, en estos tres): ya solo hay que
         descontar la barra superior (5rem) */
      html[data-bloqueador-directo] :is(.channel-page__video-player, .persistent-player, .video-player__container) { max-height: calc(100vh - 5rem) !important; }
      html[data-bloqueador-directo] :is(.twilight-main, .root-scrollable, .channel-root__info) { z-index: auto !important; }
      html[data-bloqueador-directo] #live-channel-stream-information {
        visibility: hidden; height: 0 !important; min-height: 0 !important;
        padding: 0 !important; margin: 0 !important; overflow: visible !important;
      }
      html[data-bloqueador-directo] #live-channel-stream-information [data-target="channel-header-right"] {
        visibility: visible; position: fixed !important; z-index: 1001; margin: 0 !important;
        left: var(--bloqueador-botones-x); top: var(--bloqueador-botones-y);
      }
      /* Corazón de "Dejar de seguir" en morado y centrado: Twitch le deja
         relleno y un margen a la derecha pensados para un texto que no tiene */
      html[data-bloqueador-directo] [data-a-target="unfollow-button"] { color: #a970ff !important; }
      html[data-bloqueador-directo] [data-a-target="unfollow-button"] [data-a-target="tw-core-button-label-text"] { padding: 0 !important; }
      html[data-bloqueador-directo] [data-a-target="unfollow-button"] [data-a-target="tw-core-button-label-text"] div { margin: 0 !important; }
      /* Estrella de "Suscribirse" en naranja (el primer icono; el segundo es la flecha) */
      html[data-bloqueador-directo] [data-a-target="subscribe-button"] > div > div:first-child .tw-core-button-icon { color: #ff9f1a !important; }
      #bloqueador-directo { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; margin: 0 16px 0 12px; color: #efeff1; font-size: 13px; }
      /* Separador con el logo */
      #bloqueador-directo::before { content: ""; flex: none; width: 1px; height: 28px; margin-right: 4px; background: #53535f; }
      #bloqueador-directo img { flex: none; width: 34px; height: 34px; border-radius: 50%; box-shadow: 0 0 0 2px #e91916; }
      #bloqueador-directo .texto { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
      #bloqueador-directo .fila { display: flex; align-items: baseline; gap: 6px; white-space: nowrap; }
      #bloqueador-directo .nombre { font-size: 14px; font-weight: 700; }
      #bloqueador-directo .sep { color: #adadb8; }
      #bloqueador-directo .juego { color: #bf94ff; cursor: pointer; }
      #bloqueador-directo .juego:hover { text-decoration: underline; }
      #bloqueador-directo .titulo { color: #dedee3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      #bloqueador-directo :is(.espectadores, .tiempo) { margin-left: 4px; font-size: 11px; color: #adadb8; }
      #bloqueador-directo .espectadores { color: #ff8280; font-weight: 600; }
      #bloqueador-directo .hueco { flex: none; }`,
    // Tras una pausa publicitaria Twitch encoge el vídeo para poner un banner
    // al lado o debajo: le pone a .video-ref la clase
    // video-player--stream-display-ad_<formato> (lower-third, squeezeback,
    // left-third…) y un alto o ancho en línea menor del 100 %. Se fuerza el
    // tamaño completo; el resto de su CSS (centrado) ya encaja con él
    anunciosDirecto: `
      [class*="video-player--stream-display-ad_"] { width: 100% !important; height: 100% !important; }`,
    // "Suscríbete / Renovar suscripción: ¡hasta un 30 % de descuento!" -> "Suscribirse".
    // El texto original se encoge a 0 y se pinta el nuevo con ::after
    textoSuscribirse: `
      [data-a-target="subscribe-button"] [data-a-target="tw-core-button-label-text"] { font-size: 0 !important; }
      [data-a-target="subscribe-button"] [data-a-target="tw-core-button-label-text"]::after { content: "Suscribirse"; font-size: 14px; }`,
    // La barra izquierda abierta mide 240 px y corta el juego ("League of Le…").
    // Lo de dentro y el contenido de la página se ajustan solos a este ancho
    barraAncha: `
      .side-nav--expanded { width: 280px !important; }`
  };

  const ajustes = BloqueadorOcultar.iniciar('twitch', SELECTORES, REGLAS);

  // --- Puntos del canal ------------------------------------------------------
  // Cada ~15 min de directo aparece junto al saldo de puntos, bajo el chat, un
  // cofre para reclamar una bonificación. Se reconoce por su icono y no por su
  // aria-label ("Reclamar bonificación"), que depende del idioma. Con un
  // intervalo para que también se reclame con la pestaña en segundo plano
  setInterval(() => {
    if (!ajustes().activo || !ajustes().twitch.reclamarPuntos) return;
    document.querySelector('[data-test-selector="community-points-summary"] button:has(.claimable-bonus__icon)')?.click();
  }, 2000);

  // twitch-seguidos.js corre en el mundo de la página y no ve los ajustes:
  // se le avisa con un atributo en <html>
  setInterval(() => {
    const opcion = ajustes().activo && ajustes().twitch.todosSeguidos;
    document.documentElement.toggleAttribute('data-bloqueador-seguidos', opcion);
  }, 1000);

  // --- Anuncios en directo ---------------------------------------------------
  // Durante una pausa publicitaria Twitch pone el anuncio en el reproductor
  // principal (con la etiqueta [data-a-target="video-ad-label"]) y sigue
  // emitiendo el directo en pequeño y silenciado encima del chat
  // (.picture-by-picture-player). Mientras dure la pausa se muestra ese directo
  // en grande encima del anuncio, con sonido, y se silencia el anuncio.
  // Se copia con captureStream() en un <video> propio en vez de mover el de
  // Twitch: la columna del chat no deja sacarlo de su sitio y Twitch le fuerza
  // el volumen. Si no hay directo en pequeño, el anuncio solo se tapa y silencia.
  // En los vídeos guardados (y a veces en directo) el anuncio no va en el stream
  // sino en un <video> aparte encima del principal: ese se silencia, se oculta y
  // se acelera hasta que acaba (probado: 30 s de anuncio pasan en unos 2 s).
  // Se revisa con un intervalo (no con requestAnimationFrame) para que también
  // funcione con la pestaña en segundo plano, que es cuando más molesta el audio.

  const ID_CAPA = 'bloqueador-pausa';
  // El <video> del contenido; los de anuncios aparte van más adentro
  const SELECTOR_PRINCIPAL = '.persistent-player [data-a-target="video-ref"] > video';
  let pausa = null; // { principal, capa, video, origen, mutedPrevio }

  function crearCapa() {
    const capa = document.createElement('div');
    capa.id = ID_CAPA;
    Object.assign(capa.style, {
      position: 'absolute', inset: '0', background: '#000',
      display: 'grid', placeItems: 'center',
      color: '#adadb8', font: '14px system-ui, sans-serif'
    });
    const que = location.pathname.startsWith('/videos/') ? 'el vídeo' : 'el directo';
    capa.textContent = `Anuncio en curso · ${que} vuelve en cuanto acabe`;
    return capa;
  }

  function iniciarPausa() {
    const principal = document.querySelector(SELECTOR_PRINCIPAL);
    if (!principal) return;
    const capa = crearCapa();
    // Justo detrás del <video>: los controles y la cuenta atrás del anuncio,
    // que van después, siguen quedando por encima
    principal.after(capa);
    pausa = { principal, capa, video: null, origen: null, mutedPrevio: principal.muted };
    principal.muted = true;
    conectarDirecto();
    acelerarAnuncios();
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
    acelerarAnuncios();
  }

  // Los <video> de anuncio aparte. Twitch puede reutilizarlos para el siguiente
  // anuncio del bloque, así que se reaplica en cada revisión
  function acelerarAnuncios() {
    for (const video of document.querySelectorAll('.persistent-player video')) {
      if (video === pausa.principal || video === pausa.video) continue;
      video.muted = true;
      video.style.opacity = '0';
      if (video.playbackRate !== 16) video.playbackRate = 16;
    }
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
