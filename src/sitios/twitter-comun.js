/**
 * Bloqueador - Twitter/X: utilidades comunes de los content scripts
 * Se carga antes que los demás twitter-*.js. Habla con twitter-api.js, que
 * corre en el mundo MAIN.
 *
 * X está cambiando de web (noviembre de 2026) y sirve una u otra según le
 * parece, así que se soportan las dos: la "clásica" (data-testid, main.*.js) y
 * la "nueva" (data-slot, data-href, Relay, dibujada en el servidor).
 */
globalThis.BloqueadorTwitter = (() => {
  'use strict';

  const ORIGEN = 'bloqueador-x';
  const EVENTO_HIDRATADO = 'bloqueador-hidratado';
  const ESPERA_HIDRATACION = 500;

  // Se comprueba cada vez: no cambia sin recargar, pero el script podría faltar
  // si se pregunta muy pronto
  const esNueva = () => Boolean(document.querySelector('script[src*="/entry-client"]'));

  const reintentos = new Set();

  /**
   * ¿React ya se ha hecho cargo del elemento? Si no, no hay que insertar nada
   * dentro todavía. Como hidratar no cambia el DOM (ningún observer salta), se
   * llama a `reintentar` pasado un momento.
   */
  function hidratado(elemento, reintentar) {
    const evento = new Event(EVENTO_HIDRATADO, { bubbles: true, cancelable: true });
    if (!elemento.dispatchEvent(evento)) return true;
    if (!reintentos.has(reintentar)) {
      reintentos.add(reintentar);
      setTimeout(() => {
        reintentos.delete(reintentar);
        reintentar();
      }, ESPERA_HIDRATACION);
    }
    return false;
  }

  // Los vídeos llegan por postMessage (ver alRecibirVideos). En la web clásica,
  // twitter-api-clasica.js los manda solo según X los carga
  function pedirVideos(ids) {
    window.postMessage({ origen: ORIGEN, pedirVideos: ids }, location.origin);
  }

  function alRecibirVideos(callback) {
    window.addEventListener('message', (e) => {
      if (e.source !== window || e.data?.origen !== ORIGEN || !Array.isArray(e.data.videos)) return;
      callback(e.data.videos);
    });
    // Lo que twitter-api-clasica.js haya recogido antes de cargar esto
    window.postMessage({ origen: ORIGEN, pedirTodos: true }, location.origin);
  }

  function navegar(ruta) {
    window.postMessage({ origen: ORIGEN, navegar: ruta }, location.origin);
  }

  /**
   * Tweets de la página. Los citados también son <article>, dentro del que los
   * cita, y no se cuentan.
   */
  function tweets() {
    return [...document.querySelectorAll('article')].filter((a) => !a.parentElement.closest('article'));
  }

  // Marca en <html> la página de X en la que se está, para lo que solo se oculta
  // en algunas (ver SELECTORES en twitter.js). Se revisa en cada cambio del DOM
  // porque X navega sin recargar
  const ATTR_PAGINA = 'data-bloqueador-pagina';
  function marcarPagina() {
    const pagina = location.pathname === '/home' ? 'inicio'
      : /^\/[^/]+\/status\/\d+/.test(location.pathname) ? 'tweet'
        : /^[/]explore([/]|$)/.test(location.pathname) ? 'explorar'
          : 'otra';
    if (document.documentElement.getAttribute(ATTR_PAGINA) !== pagina) {
      document.documentElement.setAttribute(ATTR_PAGINA, pagina);
    }
  }
  marcarPagina();
  new MutationObserver(marcarPagina).observe(document.body, { childList: true, subtree: true });

  return { esNueva, hidratado, pedirVideos, alRecibirVideos, navegar, tweets };
})();
