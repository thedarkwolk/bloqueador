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

  // Qué ocultar por cada opción del popup (claves de ajustes.twitter).
  // Se evitan los textos y aria-label porque cambian según el idioma.
  const SELECTORES = {
    // Los tweets anuncio los marca el observer con ATTR_BLOQUEADO
    anuncios: [
      `[${ATTR_BLOQUEADO}="anuncio"]`,
      // Tendencia promocionada ("Qué está pasando" y Explorar): es la única
      // con el icono de promocionado (el texto "Promoted by…" no se traduce)
      'div:has(> div > [data-testid="trend"] svg path[d^="M19.498 3h-15c-1.381"])'
    ],
    premium: [
      'header [role="navigation"] a[href="/i/premium_sign_up"]',
      // Tarjeta "Suscríbete a Premium" de la columna derecha.
      // Se oculta el contenedor del <aside> para que no quede su margen.
      '[data-testid="sidebarColumn"] div:has(> div > aside a[href^="/i/premium"])'
    ],
    grok: [
      'header [role="navigation"] a[href="/i/grok"]',
      // Botón flotante (abajo a la derecha)
      '[data-testid="GrokDrawer"]',
      // Icono en cada tweet: no tiene data-testid, pero su logo es el
      // único icono de X con viewBox 33x32 (el resto usa 24x24)
      'article button:has(svg[viewBox="0 0 33 32"])'
    ],
    estudio: ['header [role="navigation"] a[href="/i/jf/creators/studio"]'],
    aQuienSeguir: [
      '[data-testid="sidebarColumn"] div:has(> div > aside a[href^="/i/connect_people"])'
    ],
    // Pie de la columna derecha (Condiciones de Servicio, Privacidad, © X Corp…).
    // Se reconoce por el enlace a las condiciones, que no depende del idioma.
    // Se oculta el contenedor del <nav> para que no quede su margen
    pieDePagina: ['[data-testid="sidebarColumn"] div:has(> nav a[href$="/tos"])']
  };

  const ajustes = BloqueadorOcultar.iniciar('twitter', SELECTORES);
  // IDs de anuncios ya vistos, para no contar dos veces el mismo al hacer scroll
  const anunciosVistos = new Set();
  let pendiente = false;

  function log(...args) {
    if (ajustes().modoRevision) console.log('[Bloqueador:Twitter]', ...args);
  }

  /**
   * Un tweet es anuncio si contiene un <span> "hoja" cuyo texto es exactamente
   * una de las etiquetas, y que NO está dentro del texto del propio tweet
   * (para no ocultar un tweet que simplemente diga "Ad").
   */
  function esAnuncio(tweet) {
    for (const span of tweet.querySelectorAll('span')) {
      if (span.childElementCount > 0) continue;
      const texto = span.textContent.trim();
      if (!ETIQUETAS_ANUNCIO.has(texto)) continue;
      if (span.closest('[data-testid="tweetText"]')) continue;
      return true;
    }
    return false;
  }

  /**
   * ID estable del tweet: el enlace "/usuario/status/123…".
   * Si no lo tiene (algunos anuncios no muestran fecha), usamos usuario + inicio del texto.
   */
  function obtenerId(tweet) {
    const enlace = tweet.querySelector('a[href*="/status/"]');
    if (enlace) {
      const match = enlace.getAttribute('href').match(/\/status\/(\d+)/);
      if (match) return match[1];
    }
    const usuario = tweet.querySelector('[data-testid="User-Name"]')?.textContent ?? '';
    const texto = tweet.querySelector('[data-testid="tweetText"]')?.textContent ?? '';
    return `${usuario}|${texto.slice(0, 80)}`;
  }

  // Solo marca la celda; ocultarla o no lo decide la hoja de estilos de
  // BloqueadorOcultar, así el popup puede activar y desactivar la opción al momento
  function marcar(tweet) {
    // Marcamos la celda entera de la lista para no dejar huecos al ocultarla
    const celda = tweet.closest('[data-testid="cellInnerDiv"]') || tweet;
    if (celda.hasAttribute(ATTR_BLOQUEADO)) return;
    celda.setAttribute(ATTR_BLOQUEADO, 'anuncio');

    const id = obtenerId(tweet);
    if (anunciosVistos.has(id)) return;
    anunciosVistos.add(id);
    log(`Anuncio detectado (distintos: ${anunciosVistos.size})`, id);
  }

  function revisar() {
    pendiente = false;
    const tweets = document.querySelectorAll('article[data-testid="tweet"]');
    for (const tweet of tweets) {
      if (tweet.closest(`[${ATTR_BLOQUEADO}]`)) continue;
      if (esAnuncio(tweet)) marcar(tweet);
    }
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
