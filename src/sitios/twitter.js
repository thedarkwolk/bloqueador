/**
 * Bloqueador - Twitter/X
 * Oculta los tweets promocionados del timeline, respuestas y búsquedas,
 * y elementos promocionales de la interfaz (Premium, Grok, "A quién seguir"…).
 * Qué se oculta lo decide el popup (ver src/comun/ajustes.js y ocultar.js).
 * Con el modo revisión activo, lo bloqueado se marca en rojo en vez de ocultarse.
 *
 * X es una SPA con lista virtualizada: los tweets se crean y destruyen al hacer
 * scroll, así que usamos un MutationObserver y revisamos los tweets nuevos.
 */
(() => {
  'use strict';

  // Texto exacto de la etiqueta de anuncio según el idioma de la interfaz.
  // "Colaboración pagada" / "Paid partnership" NO se incluye a propósito:
  // son tweets patrocinados de creadores y se quieren seguir viendo.
  const ETIQUETAS_ANUNCIO = new Set([
    'Ad', 'Ads', 'Promoted',
    'Anuncio', 'Promocionado', 'Publicidad', 'Patrocinado'
  ]);

  const ATTR_BLOQUEADO = 'data-bloqueador';

  // Icono de "promocionado". X dibuja los iconos con el <svg> completo
  // (data-icon) o con un <use> a una lista de iconos comunes
  const ICONO_PROMOCIONADO = ':is(svg[data-icon^="icon-promoted"], use[href^="#icon-promoted"])';

  // Qué ocultar por cada opción del popup (claves de ajustes.twitter).
  // Se evitan los textos y aria-label porque cambian según el idioma. Van los
  // de las dos webs de X (ver twitter-comun.js): primero la nueva y luego la
  // clásica. El enlace del menú es el mismo en las dos
  const SELECTORES = {
    // Los tweets anuncio los marca el observer con ATTR_BLOQUEADO
    anuncios: [
      `li[${ATTR_BLOQUEADO}="anuncio"] > *`,
      `[${ATTR_BLOQUEADO}="anuncio"]:not(li)`,
      // Tendencia promocionada ("Qué está pasando" y Explorar): tiene el icono
      // de promocionado
      `[data-href*="trend_click"]:has(${ICONO_PROMOCIONADO})`,
      'div:has(> div > [data-testid="trend"] svg path[d^="M19.498 3h-15c-1.381"])'
    ],
    premium: [
      'nav a[href="/i/premium_sign_up"]',
      // Tarjeta "Suscríbete a Premium" de la columna derecha
      'aside section:has(> div > a[href^="/i/premium"])',
      // Aquí y en las siguientes se oculta el contenedor, para que no quede su margen
      '[data-testid="sidebarColumn"] div:has(> div > aside a[href^="/i/premium"])'
    ],
    grok: [
      'nav a[href="/i/grok"]',
      // Botón flotante de abajo a la derecha, mientras está cerrado
      '[data-slot="xds-dock-window"][data-closed]:has(> [data-slot="xds-dock-launcher"] [data-icon="icon-logo-grok"])',
      // Botón "Explica este post" de cada tweet. El ">" lo distingue del de
      // generar imágenes de la caja para responder, que cuelga de un <div>
      'article span:has(> button[data-slot="xds-button"] [data-icon="icon-logo-grok"])',
      '[data-testid="GrokDrawer"]',
      // Su logo es el único icono con viewBox 33x32 (el resto usa 24x24)
      'article button:has(svg[viewBox="0 0 33 32"])'
    ],
    chat: ['nav a[href^="/i/chat"]'],
    llamadas: ['nav a[href^="/i/calls"]'],
    estudio: ['nav a[href="/i/jf/creators/studio"]'],
    aQuienSeguir: [
      'aside section:has(> a[href^="/i/connect_people"])',
      '[data-testid="sidebarColumn"] div:has(> div > aside a[href^="/i/connect_people"])'
    ],
    // Solo en la página de un tuit (la marca twitter-comun.js). Es el recuadro de
    // cuentas que no lleva "Mostrar más"
    personasRelevantes: [
      '[data-bloqueador-pagina="tweet"] aside section:has(> div > [data-href]):not(:has(> a))',
      '[data-bloqueador-pagina="tweet"] [data-testid="sidebarColumn"] div:has(> aside [data-testid="UserCell"]):not(:has(a[href^="/i/connect_people"]))'
    ],
    // "Qué está pasando", fuera de Inicio. En la clásica se oculta el recuadro
    // entero, que está antes que el del pie de página
    tendenciasSoloInicio: [
      ':root:not([data-bloqueador-pagina="inicio"]) aside section:has([data-href*="trend_click"])',
      ':root:not([data-bloqueador-pagina="inicio"]) [data-testid="sidebarColumn"] div:has(~ div > nav a[href$="/tos"]):has(section [data-testid="trend"])'
    ],
    // "En directo en X" (espacios), fuera de Explorar
    directoSoloExplorar: [
      ':root:not([data-bloqueador-pagina="explorar"]) aside section:has(> [data-fleetline-rows])',
      ':root:not([data-bloqueador-pagina="explorar"]) [data-testid="sidebarColumn"] div:has(> div > h2):has(> [data-testid="placementTracking"])'
    ],
    // Pie de la columna derecha (Términos, Privacidad, © X Corp…). Se reconoce
    // por el enlace a las condiciones, que no depende del idioma
    pieDePagina: [
      'aside nav:has(a[href$="/tos"])',
      '[data-testid="sidebarColumn"] div:has(> nav a[href$="/tos"])'
    ]
  };

  const REGLAS = {
    // La lista virtualizada de X no hace caso a las celdas que miden 0 y deja
    // su hueco: con 1 px sí recoloca las siguientes
    anuncios: 'main li[data-index] { min-height: 1px; }',
    // La lupa del cursor sobre las imágenes (clases de la web nueva)
    sinLupa: ':is(.cursor-zoom-in, .cursor-zoom-out, [style*="cursor: zoom-"]) { cursor: pointer !important; }',
    // El menú ocupa todo el alto libre hasta el usuario: el botón, al final
    postAbajo: `
      [data-rail-overflow] > :has(> #sidebar-compose-post),
      header div:has(> [data-testid="SideNav_NewTweet_Button"]) { margin-top: auto; }
      header div:has(> div > [data-testid="SideNav_NewTweet_Button"]) { flex-grow: 1; }`
  };

  const ajustes = BloqueadorOcultar.iniciar('twitter', SELECTORES, REGLAS);
  const opcionAnuncios = () => ajustes().activo && ajustes().twitter.anuncios;
  // La tendencia promocionada solo la oculta la hoja de estilos
  BloqueadorEstadisticas.vigilar('twitter', 'tendencias', SELECTORES.anuncios.slice(2).join(), opcionAnuncios);
  // IDs de anuncios ya vistos, para no contar dos veces el mismo al hacer scroll
  const anunciosVistos = new Set();
  let pendiente = false;

  function log(...args) {
    if (ajustes().modoRevision) console.log('[Bloqueador:Twitter]', ...args);
  }

  /**
   * Un tweet es anuncio si contiene un elemento "hoja" cuyo texto es exactamente
   * una de las etiquetas (un enlace al anunciante o, si no lo hay, texto). No se
   * miran los textos escritos por usuarios, que van en [dir="auto"] o tweetText (para no
   * ocultar un tweet que simplemente diga "Ad"), ni los tweets citados, ni los
   * botones: los tweets normales con cashtags llevan uno para operar que dice
   * "Patrocinado".
   */
  function esAnuncio(tweet) {
    const deUsuario = BloqueadorTwitter.esNueva() ? '[dir="auto"], button' : '[data-testid="tweetText"]';
    for (const hoja of tweet.querySelectorAll('a, span, div')) {
      if (hoja.childElementCount > 0) continue;
      if (!ETIQUETAS_ANUNCIO.has(hoja.textContent.trim())) continue;
      if (hoja.closest(deUsuario) || hoja.closest('article') !== tweet) continue;
      return true;
    }
    return false;
  }

  /**
   * ID estable del tweet: el enlace "/usuario/status/123…".
   * Si no lo tiene, usamos el inicio del texto.
   */
  function obtenerId(tweet) {
    const ruta = tweet.closest('[data-href*="/status/"]')?.dataset.href
      ?? tweet.querySelector('a[href*="/status/"]')?.getAttribute('href')
      ?? '';
    return ruta.match(/\/status\/(\d+)/)?.[1] ?? tweet.textContent.slice(0, 120);
  }

  // Lo que se oculta de un anuncio: la celda de la lista, si solo lo contiene a
  // él (un hilo lleva varios tweets en la misma celda), o su recuadro
  function contenedorDe(tweet) {
    const celda = tweet.closest('li[data-index], [data-testid="cellInnerDiv"]');
    if (celda && celda.querySelectorAll('article:not(article article)').length === 1) return celda;
    return tweet.closest('[data-navigation-stop]') ?? tweet;
  }

  // Solo marca el contenedor; ocultarlo o no lo decide la hoja de estilos de
  // BloqueadorOcultar, así el popup puede activar y desactivar la opción al momento
  function marcar(contenedor, tweet) {
    contenedor.setAttribute(ATTR_BLOQUEADO, 'anuncio');

    const id = obtenerId(tweet);
    if (anunciosVistos.has(id)) return;
    anunciosVistos.add(id);
    log(`Anuncio detectado (distintos: ${anunciosVistos.size})`, id);
    if (opcionAnuncios()) BloqueadorEstadisticas.sumar('twitter', 'anuncios');
  }

  function revisar() {
    pendiente = false;
    const anuncios = new Map();
    for (const tweet of BloqueadorTwitter.tweets()) {
      if (esAnuncio(tweet)) anuncios.set(contenedorDe(tweet), tweet);
    }
    // Por si X reutiliza un contenedor marcado para otro tweet
    for (const marcado of document.querySelectorAll(`[${ATTR_BLOQUEADO}="anuncio"]`)) {
      if (!anuncios.delete(marcado)) marcado.removeAttribute(ATTR_BLOQUEADO);
    }
    for (const [contenedor, tweet] of anuncios) marcar(contenedor, tweet);
  }

  // Agrupamos las mutaciones en un único repaso por frame
  function programarRevision() {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(revisar);
  }

  const observer = new MutationObserver(programarRevision);
  observer.observe(document.body, { childList: true, subtree: true });

  revisar();
})();
