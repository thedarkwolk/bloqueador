/**
 * Bloqueador - Twitch: el directo en la barra superior
 * En la página de un directo, el bloque de debajo del vídeo (avatar, nombre,
 * juego, espectadores, tiempo, título y botones) pasa a la barra superior,
 * entre el logo y el buscador, y "Acerca de" sube hasta el reproductor.
 *
 * El texto es una copia propia que se actualiza cada medio segundo (los
 * espectadores y el tiempo cambian solos). Los botones de seguir y suscribirse
 * son los de Twitch: sus menús se abren pegados a ellos, así que una copia los
 * abriría en el sitio equivocado. La hoja de estilos (REGLAS.directoArriba en
 * twitch.js) los fija sobre un hueco reservado en la copia, con su posición
 * en variables CSS.
 */
(() => {
  'use strict';

  const ID = 'bloqueador-directo';
  // Mientras está, la hoja de estilos oculta el bloque original y sube los botones
  const ATTR = 'data-bloqueador-directo';

  let ajustes = BloqueadorAjustes.POR_DEFECTO;
  const activa = () => ajustes.activo && ajustes.twitch.directoArriba;

  function crear() {
    const barra = document.createElement('div');
    barra.id = ID;
    barra.innerHTML = `
      <img alt="">
      <div class="texto">
        <div class="fila">
          <span class="nombre"></span><span class="sep">·</span><span class="juego"></span>
          <span class="espectadores"></span><span class="tiempo"></span>
        </div>
        <div class="titulo"></div>
      </div>
      <div class="hueco"></div>`;
    // El enlace del juego es de React (navega sin recargar): se reenvía el clic
    barra.querySelector('.juego').addEventListener('click', () => {
      document.querySelector('#live-channel-stream-information [data-a-target="stream-game-link"]')?.click();
    });
    return barra;
  }

  function poner(nodo, texto) {
    if (nodo.textContent !== texto) nodo.textContent = texto;
  }

  function quitar() {
    document.getElementById(ID)?.remove();
    document.documentElement.removeAttribute(ATTR);
  }

  function revisar() {
    const info = document.querySelector('#live-channel-stream-information');
    const columna = document.querySelector('.top-nav__menu > div:has([data-a-target="nav-search-box"])');
    // En modo cine no hay barra superior y Twitch ya pone su propia cabecera
    // encima del vídeo: los botones fijados quedarían flotando sobre él
    const cine = document.querySelector('.channel-page__video-player--theatre-mode');
    if (!activa() || !info || !columna || cine) return quitar();

    let barra = document.getElementById(ID);
    if (!barra) barra = crear();
    if (barra.parentElement !== columna) columna.prepend(barra);
    document.documentElement.setAttribute(ATTR, '');

    const $ = (selector) => info.querySelector(selector);
    const avatar = $('img');
    const img = barra.querySelector('img');
    if (avatar && img.src !== avatar.src) img.src = avatar.src;
    const titulo = $('[data-a-target="stream-title"]')?.textContent ?? '';
    poner(barra.querySelector('.nombre'), $('h1')?.textContent ?? '');
    poner(barra.querySelector('.juego'), $('[data-a-target="stream-game-link"]')?.textContent ?? '');
    poner(barra.querySelector('.titulo'), titulo);
    barra.querySelector('.titulo').title = titulo;
    const espectadores = $('[data-a-target="animated-channel-viewers-count"]')?.textContent ?? '';
    poner(barra.querySelector('.espectadores'), espectadores && `● ${espectadores}`);
    // .live-time repite el tiempo para lectores de pantalla: "1:08:261:08:26 desde que…"
    poner(barra.querySelector('.tiempo'), $('.live-time')?.textContent.match(/^\d+:\d{2}:\d{2}/)?.[0] ?? '');

    // Los botones acaban a la altura del borde derecho del reproductor, donde
    // empieza el chat (con el chat plegado, junto a los iconos de la derecha)
    const jugador = document.querySelector('.channel-root__player');
    if (jugador) {
      const derecha = columna.getBoundingClientRect().right - jugador.getBoundingClientRect().right;
      barra.style.marginRight = `${Math.max(16, derecha + 10)}px`;
    }

    // Hueco del ancho de los botones y, encima, los botones (position: fixed)
    const botones = $('[data-target="channel-header-right"]');
    const hueco = barra.querySelector('.hueco');
    hueco.style.width = `${botones?.offsetWidth ?? 0}px`;
    if (botones) {
      const r = hueco.getBoundingClientRect();
      const raiz = document.documentElement.style;
      raiz.setProperty('--bloqueador-botones-x', `${r.left}px`);
      raiz.setProperty('--bloqueador-botones-y', `${r.top + (r.height - botones.offsetHeight) / 2}px`);
    }
  }

  BloqueadorAjustes.cargar().then((guardados) => { ajustes = guardados; revisar(); });
  BloqueadorAjustes.alCambiar((nuevos) => { ajustes = nuevos; revisar(); });
  // Con un intervalo y no con un MutationObserver: los espectadores y el
  // tiempo cambian cada segundo y el observador saltaría sin parar
  setInterval(revisar, 500);
  addEventListener('resize', revisar);
})();
