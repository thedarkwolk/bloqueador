/**
 * Bloqueador - Twitter/X: visor propio de vídeos
 * Al abrir un vídeo a pantalla completa (…/status/123/video/1 o …/mediaviewer) se
 * pone este visor encima del de X: así sirve para todas las formas de abrirlos y
 * "atrás" sigue funcionando. La primera es un diálogo y va dentro, para que
 * pulsarlo no lo cierre; la otra es una página. Las fotos se dejan al de X.
 * Con el ratón, X no abre los vídeos de los tweets al pulsarlos (los pausa): aquí
 * sí, siguiendo por donde iban.
 *
 * - La rueda, ↑ ↓ o los botones pasan a otro vídeo del mismo perfil o de una
 *   búsqueda: la página de búsqueda o de hashtag desde la que se abrió (en ese
 *   caso se empieza por ella) o, si no, el primer hashtag del tuit. No se usa el
 *   visor de X para cada uno porque solo se deja abrir 50 veces cada 15 minutos
 *   (tweetMediaViewerQuery).
 * - Me gusta y repost los manda la propia X con su código (twitter-api.js); en
 *   la web clásica se abre su página de confirmación.
 * - Un panel lateral enseña el tuit y sus respuestas.
 *
 * Los datos los piden twitter-datos.js y, para el tuit que se abre, el almacén
 * de X (twitter-api.js).
 */
(() => {
  'use strict';

  const RUTA_MEDIO = /^\/([^/]+)\/status\/(\d+)\/(?:video\/(\d+)|mediaviewer)\/?$/;
  // Las fotos las enseña el visor de X
  const RUTA_FOTO = /^\/[^/]+\/status\/\d+\/photo\//;
  const ATTR_VISOR = 'data-bloqueador-visor';
  const CLAVE_FUENTE = 'videosFuente';
  const FUENTES = { perfil: 'Perfil', tendencia: 'Tendencia' };
  // Tras pasar a otro se ignora la rueda un momento: un solo gesto del touchpad
  // manda muchos eventos seguidos
  const ESPERA_RUEDA = 600;
  const UMBRAL_RUEDA = 40;
  // Cuando quedan estos por delante se pide la página siguiente
  const RESERVA = 4;
  // Si X no responde, cuándo se reintenta (si es por su límite, lo dice el error)
  const REINTENTO = 5 * 1000;
  const SALTO = 5; // segundos, con ← →
  const VELOCIDADES = [1, 1.25, 1.5, 2];
  // Lo que hay que quedarse en uno para pedir sus respuestas o sus subtítulos
  const ESPERA_EXTRAS = 500;
  const ESPERA_CONFIRMAR = 3000;
  // Tras destapar un medio sensible, los clics que no cuentan (doble clic)
  const ESPERA_DESTAPAR = 500;

  // Iconos: Phosphor Icons v2.1.1 (https://phosphoricons.com), licencia MIT
  const ICONOS = {
    arriba: 'M213.66,165.66a8,8,0,0,1-11.32,0L128,91.31,53.66,165.66a8,8,0,0,1-11.32-11.32l80-80a8,8,0,0,1,11.32,0l80,80A8,8,0,0,1,213.66,165.66Z',
    abajo: 'M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z',
    izquierda: 'M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z',
    derecha: 'M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z',
    cerrar: 'M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z',
    sonido: 'M155.51,24.81a8,8,0,0,0-8.42.88L77.25,80H32A16,16,0,0,0,16,96v64a16,16,0,0,0,16,16H77.25l69.84,54.31A8,8,0,0,0,160,224V32A8,8,0,0,0,155.51,24.81ZM144,207.64,84.91,161.69A7.94,7.94,0,0,0,80,160H32V96H80a7.94,7.94,0,0,0,4.91-1.69L144,48.36ZM208,128a39.93,39.93,0,0,1-10,26.46,8,8,0,0,1-12-10.58,24,24,0,0,0,0-31.72,8,8,0,1,1,12-10.58A40,40,0,0,1,208,128Z',
    silencio: 'M155.51,24.81a8,8,0,0,0-8.42.88L77.25,80H32A16,16,0,0,0,16,96v64a16,16,0,0,0,16,16H77.25l69.84,54.31A8,8,0,0,0,160,224V32A8,8,0,0,0,155.51,24.81ZM144,207.64,84.91,161.69A7.94,7.94,0,0,0,80,160H32V96H80a7.94,7.94,0,0,0,4.91-1.69L144,48.36Zm101.66-61.3a8,8,0,0,1-11.32,11.32L216,139.31l-18.34,18.35a8,8,0,0,1-11.32-11.32L204.69,128l-18.35-18.34a8,8,0,0,1,11.32-11.32L216,116.69l18.34-18.35a8,8,0,0,1,11.32,11.32L227.31,128Z',
    tuit: 'M224,104a8,8,0,0,1-16,0V59.32l-66.33,66.34a8,8,0,0,1-11.32-11.32L196.68,48H152a8,8,0,0,1,0-16h64a8,8,0,0,1,8,8Zm-40,24a8,8,0,0,0-8,8v72H48V80h72a8,8,0,0,0,0-16H48A16,16,0,0,0,32,80V208a16,16,0,0,0,16,16H176a16,16,0,0,0,16-16V136A8,8,0,0,0,184,128Z',
    enlace: 'M165.66,90.34a8,8,0,0,1,0,11.32l-64,64a8,8,0,0,1-11.32-11.32l64-64A8,8,0,0,1,165.66,90.34ZM215.6,40.4a56,56,0,0,0-79.2,0L106.34,70.45a8,8,0,0,0,11.32,11.32l30.06-30a40,40,0,0,1,56.57,56.56l-30.07,30.06a8,8,0,0,0,11.31,11.32L215.6,119.6a56,56,0,0,0,0-79.2ZM138.34,174.22l-30.06,30.06a40,40,0,1,1-56.56-56.57l30.05-30.05a8,8,0,0,0-11.32-11.32L40.4,136.4a56,56,0,0,0,79.2,79.2l30.06-30.07a8,8,0,0,0-11.32-11.31Z',
    descargar: 'M224,144v64a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V144a8,8,0,0,1,16,0v56H208V144a8,8,0,0,1,16,0Zm-101.66,5.66a8,8,0,0,0,11.32,0l40-40a8,8,0,0,0-11.32-11.32L136,124.69V32a8,8,0,0,0-16,0v92.69L93.66,98.34a8,8,0,0,0-11.32,11.32Z',
    gustar: 'M178,40c-20.65,0-38.73,8.88-50,23.89C116.73,48.88,98.65,40,78,40a62.07,62.07,0,0,0-62,62c0,70,103.79,126.66,108.21,129a8,8,0,0,0,7.58,0C136.21,228.66,240,172,240,102A62.07,62.07,0,0,0,178,40ZM128,214.8C109.74,204.16,32,155.69,32,102A46.06,46.06,0,0,1,78,56c19.45,0,35.78,10.36,42.6,27a8,8,0,0,0,14.8,0c6.82-16.67,23.15-27,42.6-27a46.06,46.06,0,0,1,46,46C224,155.61,146.24,204.15,128,214.8Z',
    gustado: 'M240,102c0,70-103.79,126.66-108.21,129a8,8,0,0,1-7.58,0C119.79,228.66,16,172,16,102A62.07,62.07,0,0,1,78,40c20.65,0,38.73,8.88,50,23.89C139.27,48.88,157.35,40,178,40A62.07,62.07,0,0,1,240,102Z',
    repostear: 'M24,128A72.08,72.08,0,0,1,96,56H204.69L194.34,45.66a8,8,0,0,1,11.32-11.32l24,24a8,8,0,0,1,0,11.32l-24,24a8,8,0,0,1-11.32-11.32L204.69,72H96a56.06,56.06,0,0,0-56,56,8,8,0,0,1-16,0Zm200-8a8,8,0,0,0-8,8,56.06,56.06,0,0,1-56,56H51.31l10.35-10.34a8,8,0,0,0-11.32-11.32l-24,24a8,8,0,0,0,0,11.32l24,24a8,8,0,0,0,11.32-11.32L51.31,200H160a72.08,72.08,0,0,0,72-72A8,8,0,0,0,224,120Z',
    respuestas: 'M128,24A104,104,0,0,0,36.18,176.88L24.83,210.93a16,16,0,0,0,20.24,20.24l34.05-11.35A104,104,0,1,0,128,24Zm0,192a87.87,87.87,0,0,1-44.06-11.81,8,8,0,0,0-6.54-.67L40,216,52.47,178.6a8,8,0,0,0-.66-6.54A88,88,0,1,1,128,216Z'
  };

  const ESTILOS = `
    [role="dialog"]:has(> .bloqueador-visor) > :not(.bloqueador-visor) { display: none !important; }
    .bloqueador-visor {
      position: fixed; inset: 0; z-index: 9999; background: #000000; color: #ffffff; text-align: left;
      font-family: TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 15px; line-height: 20px;
    }
    .bv-escena { position: absolute; inset: 0; transition: right 0.2s; }
    .bv-con-panel .bv-escena { right: min(420px, 45vw); }
    .bv-pista {
      position: absolute; inset: 0; overflow-y: auto; scroll-snap-type: y mandatory; scrollbar-width: none;
      overscroll-behavior: contain;
    }
    .bloqueador-visor button.bv-boton {
      all: unset; box-sizing: border-box; display: grid; place-items: center; cursor: pointer; flex: none;
      min-width: 42px; height: 42px; border-radius: 21px;
      background: rgba(15, 20, 25, 0.75); color: #ffffff; transition: background-color 0.2s, color 0.2s;
    }
    .bloqueador-visor button.bv-boton:hover, .bloqueador-visor button.bv-boton:focus-visible { background: rgba(60, 66, 72, 0.9); }
    .bloqueador-visor button.bv-boton:disabled { opacity: 0.35; cursor: default; }
    .bv-boton svg { width: 21px; height: 21px; fill: currentColor; }
    .bloqueador-visor button.bv-cerrar { position: absolute; left: 16px; top: 16px; z-index: 2; }
    .bv-lateral {
      position: absolute; left: 16px; top: 50%; transform: translateY(-50%); z-index: 2;
      display: flex; flex-direction: column; align-items: center; gap: 8px;
    }
    .bv-fuentes { display: flex; flex-direction: column; border-radius: 14px; overflow: hidden; margin-top: 4px; }
    .bloqueador-visor .bv-fuentes button {
      all: unset; padding: 7px 10px; font-size: 12px; line-height: 16px; font-weight: 600; text-align: center;
      background: rgba(15, 20, 25, 0.75); cursor: pointer;
    }
    .bloqueador-visor .bv-fuentes button:hover { background: rgba(60, 66, 72, 0.9); }
    .bloqueador-visor .bv-fuentes button:disabled { opacity: 0.35; cursor: default; }
    .bloqueador-visor .bv-fuentes button[aria-checked="true"] { background: #ffffff; color: #0f1419; }

    .bv-bloque { position: relative; height: 100%; scroll-snap-align: start; scroll-snap-stop: always; overflow: hidden; }
    .bv-medio { position: absolute; inset: 0; overflow: hidden; }
    .bv-medio video { width: 100%; height: 100%; object-fit: contain; display: block; cursor: pointer; }
    .bv-tapado video { filter: blur(40px); }
    .bv-aviso {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); pointer-events: none; z-index: 1;
      padding: 8px 14px; border-radius: 9999px; background: rgba(15, 20, 25, 0.8); font-size: 14px;
    }
    .bv-aviso:empty { display: none; }
    .bv-info {
      position: absolute; left: 0; right: 0; bottom: 0; padding: 60px 100px 22px 108px; pointer-events: none;
      background: linear-gradient(transparent, rgba(0, 0, 0, 0.75));
    }
    .bv-info a { pointer-events: auto; color: inherit; text-decoration: none; font-weight: 700; }
    .bv-info a:hover { text-decoration: underline; }
    .bv-info span { color: rgba(255, 255, 255, 0.7); }
    .bv-info p {
      margin: 4px 0 0; white-space: pre-line; overflow-wrap: anywhere; max-width: 760px;
      display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden;
    }
    .bv-acciones {
      position: absolute; right: 20px; bottom: 36px; z-index: 1;
      display: flex; flex-direction: column; align-items: center; gap: 8px;
    }
    .bv-acciones small { margin: -6px 0 0; font-size: 12px; line-height: 14px; text-shadow: 0 0 4px #000000; }
    .bv-acciones small:empty { display: none; }
    .bloqueador-visor .bv-acciones [data-puesto="gustar"] { color: rgb(249, 24, 128); }
    .bloqueador-visor .bv-acciones [data-puesto="repostear"] { color: rgb(0, 186, 124); }
    .bloqueador-visor .bv-acciones [data-puesto="si"] { color: rgb(29, 155, 240); }
    .bloqueador-visor .bv-acciones [data-estado="hecho"] { color: rgb(0, 186, 124); }
    .bloqueador-visor .bv-acciones [data-estado="error"] { color: rgb(244, 33, 46); }
    .bloqueador-visor .bv-acciones button.bv-boton[data-estado="confirmar"] {
      padding: 0 14px; background: rgb(0, 186, 124); font-size: 13px; font-weight: 700;
    }
    .bloqueador-visor .bv-acciones button.bv-texto { font-size: 13px; font-weight: 700; }
    .bloqueador-visor button.bv-paso { position: absolute; top: 50%; transform: translateY(-50%); z-index: 1; }
    .bloqueador-visor button.bv-paso-izquierda { left: 110px; }
    .bloqueador-visor button.bv-paso-derecha { right: 80px; }
    .bv-cuenta {
      position: absolute; top: 22px; left: 50%; transform: translateX(-50%); padding: 4px 10px; border-radius: 9999px;
      background: rgba(15, 20, 25, 0.75); font-size: 13px;
    }
    .bv-barra { position: absolute; left: 0; right: 0; bottom: 0; height: 14px; cursor: pointer; z-index: 1; }
    .bv-barra::before { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: rgba(255, 255, 255, 0.25); }
    .bv-barra div { position: absolute; left: 0; bottom: 0; height: 4px; background: rgb(29, 155, 240); }
    .bv-barra:hover::before, .bv-barra:hover div { height: 7px; }
    .bv-medio video::cue { background: rgba(0, 0, 0, 0.7); color: #ffffff; }

    .bv-panel {
      --bc-fondo: #000000; --bc-texto: #e7e9ea; --bc-suave: #8b98a5; --bc-borde: #2f3336; --bc-hover: rgba(255, 255, 255, 0.05);
      position: absolute; top: 0; right: 0; bottom: 0; width: min(420px, 45vw); box-sizing: border-box; display: none;
      overflow-y: auto; scrollbar-width: thin; border-left: 1px solid var(--bc-borde); background: #000000; color: var(--bc-texto);
    }
    .bv-con-panel .bv-panel { display: block; }
    .bv-panel .bloqueador-recuadro { border: 0; border-radius: 0; margin: 0; }
    .bv-panel .bv-tuit { padding: 16px 20px; border-bottom: 1px solid var(--bc-borde); }
    .bv-tuit header { display: flex; gap: 12px; align-items: center; }
    .bv-tuit header div { min-width: 0; }
    .bv-tuit a { color: inherit; text-decoration: none; }
    .bv-tuit .bc-nombre { display: block; }
    .bv-tuit p { margin: 12px 0; white-space: pre-line; overflow-wrap: anywhere; font-size: 16px; line-height: 22px; }
    .bv-tuit footer { display: flex; align-items: center; justify-content: space-between; color: var(--bc-suave); font-size: 14px; }
    .bloqueador-visor button.bv-responder {
      all: unset; padding: 6px 16px; border-radius: 9999px; background: #eff3f4; color: #0f1419; font-size: 14px; font-weight: 700; cursor: pointer;
    }
    .bloqueador-visor button.bv-responder:hover { background: #d7dbdc; }
    .bv-panel .bc-vacio { padding: 16px 20px; }`;

  const { crearIcono, crearFila, crearEnlace } = BloqueadorRecuadro;

  let ajustes = BloqueadorAjustes.POR_DEFECTO;
  let pendiente = false;
  let fuente = 'perfil';
  // Búsqueda de la página desde la que se abrió ('' si no era una)
  let busqueda = '';
  // Si se ha pasado por alguna otra página: al cerrar se vuelve a ella
  let hayAnterior = false;
  // Ruta que se deja para el visor de X (lo que el nuestro no sabe abrir)
  let omitida = '';
  // Lo abierto: { ruta, usuario, id, sesion }. La sesión es la lista por la
  // que se pasa: { clave, pedir, tuits, cursor, cargando, agotada, reintento }
  let abierto = null;
  let actual = -1; // posición en abierto.sesion.tuits
  let sonido = { muted: false, volume: 1 };
  let velocidad = 1;
  let subtitulos = false;
  let panelAbierto = false;
  // Segundo por el que iba el vídeo del tweet que se ha pulsado: { id, segundo }
  let pulsado = null;
  let temporizador = 0;
  let acumulado = 0;
  let bloqueadoHasta = 0;

  const activa = () => ajustes.activo && ajustes.twitter.visor;
  const compacto = (numero) => (numero ? numero.toLocaleString('es', { notation: 'compact' }) : '');
  const rutaTuit = (tuit) => `/${tuit.perfil.usuario}/status/${tuit.id}`;

  // ---- De qué página se viene ----

  function anotarPagina() {
    // Desde la foto de un tuit se puede pasar a su vídeo sin salir del visor de X,
    // así que no es otra página a la que volver
    if (RUTA_FOTO.test(location.pathname)) return;
    hayAnterior = true;
    // La del tuit no cuenta como otra búsqueda: se puede abrir el tuit desde la
    // búsqueda y luego su vídeo
    if (/\/status\/\d+/.test(location.pathname)) return;
    const hashtag = location.pathname.match(/^\/hashtag\/([^/]+)/)?.[1];
    busqueda = hashtag ? `#${decodeURIComponent(hashtag)}`
      : location.pathname === '/search' ? new URLSearchParams(location.search).get('q') ?? ''
        : '';
  }

  const tendencia = () => busqueda || abierto?.sesion?.tuits[Math.max(actual, 0)]?.texto.match(/#[\p{L}\p{N}_]+/u)?.[0] || '';

  // ---- Lista por la que se pasa ----

  function crearSesion(tuit, elegida) {
    const consulta = elegida === 'tendencia' ? tendencia() : '';
    return {
      clave: consulta ? `tendencia ${consulta}` : 'perfil',
      pedir: (cursor) => BloqueadorTwitterDatos.buscarMedios(
        consulta ? { consulta } : { usuario: tuit.perfil.usuario }, cursor
      ),
      tuits: [tuit],
      cursor: null,
      cargando: false,
      agotada: false,
      reintento: 0
    };
  }

  async function cargarMas() {
    const sesion = abierto?.sesion;
    if (!sesion || sesion.cargando || sesion.agotada || Date.now() < sesion.reintento) return;
    sesion.cargando = true;
    try {
      const primera = sesion.cursor === null;
      const { tuits, cursor } = await sesion.pedir(sesion.cursor);
      const vistos = new Set(sesion.tuits.map((t) => t.id));
      const nuevos = tuits.filter((t) => !vistos.has(t.id) && vistos.add(t.id));
      // En la primera página, lo que va antes que el tuit abierto queda encima
      const corte = primera ? tuits.findIndex((t) => t.id === sesion.tuits[0].id) : -1;
      const antes = corte > 0 ? new Set(tuits.slice(0, corte).map((t) => t.id)) : new Set();
      const encima = nuevos.filter((t) => antes.has(t.id));
      sesion.tuits = [...encima, ...sesion.tuits, ...nuevos.filter((t) => !antes.has(t.id))];
      sesion.agotada = !cursor || !tuits.length || cursor === sesion.cursor;
      sesion.cursor = cursor;
      if (sesion === abierto?.sesion) completarPista(encima.length);
    } catch (error) {
      console.debug('[Bloqueador:Twitter]', 'No se han podido cargar más vídeos:', error.message);
      const espera = error.esperar ?? REINTENTO;
      sesion.reintento = Date.now() + espera;
      setTimeout(programar, espera + 50);
    }
    sesion.cargando = false;
    programar();
  }

  const hay = (pasos) => Boolean(abierto?.sesion?.tuits[actual + pasos]);

  // ---- Piezas ----

  function crear(etiqueta, clase = '', texto = '') {
    const elemento = document.createElement(etiqueta);
    elemento.className = clase;
    elemento.textContent = texto;
    return elemento;
  }

  function crearBoton(etiqueta, icono, accion) {
    const boton = crear('button', 'bv-boton');
    boton.title = etiqueta;
    boton.setAttribute('aria-label', etiqueta);
    if (ICONOS[icono]) boton.append(crearIcono(ICONOS[icono]));
    boton.addEventListener('click', () => accion(boton));
    return boton;
  }

  function mostrarEstado(boton, estado) {
    boton.dataset.estado = estado;
    setTimeout(() => {
      if (boton.dataset.estado === estado) delete boton.dataset.estado;
    }, 2000);
  }

  const visor = crear('div', 'bloqueador-visor');
  const escena = crear('div', 'bv-escena');
  const pista = crear('div', 'bv-pista');
  const aviso = crear('div', 'bv-aviso');
  const panel = crear('aside', 'bv-panel');
  const botonCerrar = crearBoton('Cerrar (Esc)', 'cerrar', () => salir());
  botonCerrar.classList.add('bv-cerrar');
  const lateral = crear('div', 'bv-lateral');
  const anterior = crearBoton('Anterior (↑)', 'arriba', () => pasar(-1));
  const siguiente = crearBoton('Siguiente (↓)', 'abajo', () => pasar(1));
  const fuentes = crear('div', 'bv-fuentes');
  fuentes.setAttribute('role', 'radiogroup');
  fuentes.setAttribute('aria-label', 'Seguir con');
  for (const [valor, texto] of Object.entries(FUENTES)) {
    const boton = crear('button', '', texto);
    boton.setAttribute('role', 'radio');
    boton.addEventListener('click', () => elegirFuente(valor));
    fuentes.append(boton);
  }
  lateral.append(anterior, siguiente, fuentes);
  escena.append(pista, aviso, botonCerrar, lateral);
  visor.append(escena, panel);
  // Que lo que se pulsa aquí no llegue al visor de X (lo cerraría)
  for (const tipo of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend']) {
    visor.addEventListener(tipo, (e) => e.stopPropagation());
  }

  // ---- Navegación ----

  function irA(ruta) {
    cerrar();
    BloqueadorTwitter.navegar(ruta);
  }

  // Cierra también el de X: se vuelve a donde se estaba o, si se entró
  // directamente por el enlace, al tuit
  function salir() {
    const { usuario, id } = abierto;
    cerrar();
    if (hayAnterior) history.back();
    else BloqueadorTwitter.navegar(`/${usuario}/status/${id}`);
  }

  // Lo negro de alrededor del vídeo, que es parte de su elemento (object-fit:
  // contain); mientras carga no hay vídeo y lo es todo lo que no sea un control
  function esNegro({ target, clientX, clientY }) {
    if (!target.matches('video')) return target.matches('.bv-escena, .bv-pista, .bv-bloque, .bv-medio');
    const { left, top, width, height } = target.getBoundingClientRect();
    const escala = Math.min(width / target.videoWidth, height / target.videoHeight);
    return Math.abs(clientX - left - width / 2) > (target.videoWidth * escala) / 2
      || Math.abs(clientY - top - height / 2) > (target.videoHeight * escala) / 2;
  }

  // Se sale si se pulsa y se suelta ahí, no al soltar ahí algo que se arrastraba
  let pulsadoNegro = false;
  escena.addEventListener('pointerdown', (evento) => { pulsadoNegro = esNegro(evento); }, true);
  escena.addEventListener('click', (evento) => {
    if (!pulsadoNegro || !esNegro(evento)) return;
    evento.stopPropagation();
    salir();
  }, true);

  // Los enlaces de dentro cierran el visor: si no, seguiría encima de la página
  function enlazar(ruta, clase, contenido) {
    const enlace = crearEnlace(ruta, clase, contenido);
    enlace.addEventListener('click', (e) => { if (e.defaultPrevented) cerrar(); });
    return enlace;
  }

  // ---- Me gusta y repost ----

  // `accion`: gustar o repostear. Se pinta al momento y se deshace si X falla
  async function alternar(tuit, accion, boton) {
    const [estado, cuenta] = accion === 'gustar' ? ['gustado', 'meGusta'] : ['reposteado', 'reposts'];
    if (!BloqueadorTwitter.esNueva()) {
      irA(accion === 'gustar' ? `/intent/like?tweet_id=${tuit.id}` : `/intent/retweet?tweet_id=${tuit.id}`);
      return;
    }
    if (tuit.enviando) return;
    tuit.enviando = true;
    const poner = !tuit[estado];
    const cambiar = (valor) => {
      tuit[estado] = valor;
      tuit[cuenta] += valor ? 1 : -1;
      pintarAcciones(tuit);
    };
    cambiar(poner);
    try {
      await BloqueadorTwitterDatos.accionar(accion, poner, tuit.id);
    } catch (error) {
      console.debug('[Bloqueador:Twitter]', `No se ha podido ${accion}:`, error.message);
      cambiar(!poner);
      mostrarEstado(boton, 'error');
    }
    tuit.enviando = false;
  }

  // Repostear se confirma con un segundo clic, que un roce no lo mande
  function repostear(tuit, boton) {
    if (tuit.reposteado || boton.dataset.estado === 'confirmar' || !BloqueadorTwitter.esNueva()) {
      delete boton.dataset.estado;
      alternar(tuit, 'repostear', boton);
      pintarAcciones(tuit);
      return;
    }
    boton.dataset.estado = 'confirmar';
    boton.textContent = '¿Repostear?';
    setTimeout(() => {
      if (boton.dataset.estado !== 'confirmar') return;
      delete boton.dataset.estado;
      pintarAcciones(tuit);
    }, ESPERA_CONFIRMAR);
  }

  function pintarAcciones(tuit) {
    const bloque = pista.querySelector(`[data-id="${tuit.id}"]`);
    if (!bloque) return;
    const poner = (accion, puesto, icono, cuenta) => {
      const boton = bloque.querySelector(`[data-accion="${accion}"]`);
      if (boton.dataset.estado === 'confirmar') return;
      boton.replaceChildren(crearIcono(ICONOS[icono]));
      if (puesto) boton.dataset.puesto = accion;
      else delete boton.dataset.puesto;
      boton.nextElementSibling.textContent = compacto(cuenta);
    };
    poner('gustar', tuit.gustado, tuit.gustado ? 'gustado' : 'gustar', tuit.meGusta);
    poner('repostear', tuit.reposteado, 'repostear', tuit.reposts);
    poner('respuestas', false, 'respuestas', tuit.respuestas);
  }

  // ---- Bloques (un tuit con sus vídeos) ----

  const medioDe = (bloque) => bloque.tuit.medios[bloque.indice];
  const videoDe = (bloque) => bloque?.querySelector('video');

  function crearBloque(tuit, indice = 0) {
    const bloque = crear('section', 'bv-bloque');
    bloque.tuit = tuit;
    bloque.indice = indice;
    bloque.dataset.id = tuit.id;
    const zona = crear('div', 'bv-medio');
    const barra = crear('div', 'bv-barra');
    barra.append(crear('div'));

    const info = crear('div', 'bv-info');
    const datos = crear('span', '', ` @${tuit.perfil.usuario} · ${new Date(tuit.fecha).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}`
      + (tuit.vistas ? ` · ${compacto(tuit.vistas)} visualizaciones` : ''));
    info.append(enlazar(`/${tuit.perfil.usuario}`, '', tuit.perfil.nombre), datos, crear('p', '', tuit.texto));

    const acciones = crear('div', 'bv-acciones');
    const conCuenta = (boton, accion) => {
      boton.dataset.accion = accion;
      acciones.append(boton, crear('small'));
    };
    conCuenta(crearBoton('Me gusta', 'gustar', (b) => alternar(tuit, 'gustar', b)), 'gustar');
    conCuenta(crearBoton('Repostear', 'repostear', (b) => repostear(tuit, b)), 'repostear');
    conCuenta(crearBoton('Tuit y respuestas (R)', 'respuestas', alternarPanel), 'respuestas');
    const deVideo = crear('div', 'bv-acciones-video');
    deVideo.style.display = 'contents';
    acciones.append(
      deVideo,
      crearBoton('Abrir el tuit', 'tuit', () => irA(rutaTuit(tuit))),
      crearBoton('Copiar enlace', 'enlace', (boton) => navigator.clipboard.writeText(`https://x.com${rutaTuit(tuit)}`)
        .then(() => mostrarEstado(boton, 'hecho'), () => mostrarEstado(boton, 'error')))
    );
    bloque.append(zona, info, acciones, barra);

    if (tuit.medios.length > 1) {
      const izquierda = crearBoton('Anterior del tuit (←)', 'izquierda', () => cambiarMedio(bloque, -1));
      const derecha = crearBoton('Siguiente del tuit (→)', 'derecha', () => cambiarMedio(bloque, 1));
      izquierda.classList.add('bv-paso', 'bv-paso-izquierda');
      derecha.classList.add('bv-paso', 'bv-paso-derecha');
      bloque.append(izquierda, derecha, crear('div', 'bv-cuenta'));
    }
    return bloque;
  }

  // Solo tienen su vídeo puesto el bloque que se ve y los de al lado
  function cargarMedio(bloque) {
    const medio = medioDe(bloque);
    if (bloque.cargado === medio) return;
    bloque.cargado = medio;
    const zona = bloque.querySelector('.bv-medio');
    const tapado = medio.sensible && ajustes.twitter.galeriaDifuminar && !bloque.destapado;
    zona.classList.toggle('bv-tapado', tapado);
    const nota = crear('div', 'bv-aviso', tapado ? 'Contenido sensible: pulsa para verlo' : '');
    const video = crearVideo(bloque, medio, nota);
    video.addEventListener('click', () => {
      if (destapar(bloque) || Date.now() - bloque.destapado < ESPERA_DESTAPAR) return;
      alternarPausa(video);
    });
    quitarVideo(bloque);
    zona.replaceChildren(video, nota);
    bloque.querySelector('.bv-acciones-video').replaceChildren(...accionesVideo(bloque, medio));
    const cuenta = bloque.querySelector('.bv-cuenta');
    if (cuenta) cuenta.textContent = `${bloque.indice + 1} / ${bloque.tuit.medios.length}`;
    pintarAcciones(bloque.tuit);
  }

  // Quita el tapado de un medio sensible y lo pone en marcha. false si no lo había
  function destapar(bloque) {
    const zona = bloque?.querySelector('.bv-tapado');
    if (!zona) return false;
    bloque.destapado = Date.now();
    zona.classList.remove('bv-tapado');
    zona.querySelector('.bv-aviso').textContent = '';
    const video = videoDe(bloque);
    if (video) reproducir(video);
    return true;
  }

  function descargarMedio(bloque) {
    quitarVideo(bloque);
    bloque.querySelector('.bv-medio').replaceChildren();
    bloque.cargado = null;
  }

  // Para que el navegador deje de descargarlo
  function quitarVideo(bloque) {
    const video = videoDe(bloque);
    if (!video) return;
    video.pause();
    video.removeAttribute('src');
    video.load();
  }

  function cambiarMedio(bloque, pasos) {
    const indice = bloque.indice + pasos;
    if (!bloque.tuit.medios[indice]) return false;
    bloque.indice = indice;
    cargarMedio(bloque);
    if (bloque === pista.children[actual]) {
      reproducirActual();
      programarExtras();
    }
    return true;
  }

  function crearVideo(bloque, medio, nota) {
    const video = crear('video');
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.poster = medio.imagen;
    video.src = medio.mp4;
    video.addEventListener('error', () => {
      if (video.getAttribute('src')) nota.textContent = 'No se ha podido reproducir';
    });
    const barra = bloque.querySelector('.bv-barra');
    video.addEventListener('timeupdate', () => {
      barra.firstChild.style.width = video.duration ? `${(video.currentTime / video.duration) * 100}%` : '0';
    });
    barra.onpointerdown = (evento) => {
      const mover = (e) => {
        const { left, width } = barra.getBoundingClientRect();
        if (video.duration) video.currentTime = Math.min(Math.max((e.clientX - left) / width, 0), 1) * video.duration;
      };
      barra.setPointerCapture(evento.pointerId);
      mover(evento);
      barra.onpointermove = mover;
      barra.onpointerup = () => { barra.onpointermove = null; };
    };
    return video;
  }

  // ---- Controles del vídeo ----

  function accionesVideo(bloque, medio) {
    const botonSonido = crearBoton('Sonido (M)', sonido.muted ? 'silencio' : 'sonido', alternarSonido);
    botonSonido.classList.add('bv-sonido');
    const botonVelocidad = crearBoton('Velocidad', '', () => {
      velocidad = VELOCIDADES[(VELOCIDADES.indexOf(velocidad) + 1) % VELOCIDADES.length];
      pintarControles();
    });
    botonVelocidad.classList.add('bv-texto', 'bv-velocidad');
    const botonSubtitulos = crearBoton('Subtítulos (C)', '', alternarSubtitulos);
    botonSubtitulos.classList.add('bv-texto', 'bv-subtitulos');
    botonSubtitulos.textContent = 'CC';
    botonSubtitulos.hidden = true;
    botonSubtitulos.style.display = 'none';
    const botonFlotante = crearBoton('Ventana flotante', '', () => {
      const video = videoDe(bloque);
      if (document.pictureInPictureElement === video) document.exitPictureInPicture();
      else video.requestPictureInPicture().catch(() => mostrarEstado(botonFlotante, 'error'));
    });
    botonFlotante.classList.add('bv-texto');
    botonFlotante.textContent = 'PiP';
    const botonDescargar = crearBoton('Descargar vídeo', 'descargar', (boton) => chrome.runtime
      .sendMessage({ tipo: 'descargar-video', id: bloque.tuit.id, usuario: bloque.tuit.perfil.usuario, urls: [medio.mejor] })
      .then((r) => mostrarEstado(boton, r?.ok ? 'hecho' : 'error'), () => mostrarEstado(boton, 'error')));
    const botones = [botonSonido, botonVelocidad, botonSubtitulos, botonFlotante, botonDescargar];
    botonVelocidad.textContent = `${velocidad}x`;
    return botones;
  }

  function pintarControles() {
    for (const boton of pista.querySelectorAll('.bv-sonido')) {
      boton.replaceChildren(crearIcono(ICONOS[sonido.muted ? 'silencio' : 'sonido']));
    }
    for (const boton of pista.querySelectorAll('.bv-velocidad')) boton.textContent = `${velocidad}x`;
    for (const boton of pista.querySelectorAll('.bv-subtitulos')) {
      if (subtitulos) boton.dataset.puesto = 'si';
      else delete boton.dataset.puesto;
    }
    const video = videoDe(pista.children[actual]);
    if (!video) return;
    Object.assign(video, sonido, { playbackRate: velocidad });
    for (const pistaTexto of video.textTracks) pistaTexto.mode = subtitulos ? 'showing' : 'hidden';
  }

  function alternarSonido() {
    sonido.muted = !sonido.muted;
    if (!sonido.muted && !sonido.volume) sonido.volume = 1;
    pintarControles();
  }

  function alternarSubtitulos() {
    subtitulos = !subtitulos;
    pintarControles();
  }

  // Los subtítulos van en el HLS del vídeo. Se añaden como cues y no con un
  // <track> para no depender de qué orígenes permite la página
  async function cargarSubtitulos(bloque) {
    const video = videoDe(bloque);
    const { hls } = medioDe(bloque) ?? {};
    if (!video || !hls || video.textTracks.length) return;
    try {
      const lista = (await (await fetch(hls)).text()).match(/#EXT-X-MEDIA:[^\n]*TYPE=SUBTITLES[^\n]*/)?.[0];
      const ruta = lista?.match(/URI="([^"]+)"/)?.[1];
      if (!ruta || video.textTracks.length) return;
      const direccion = new URL(ruta, hls);
      const trozos = (await (await fetch(direccion)).text()).split('\n').filter((l) => l.trim() && !l.startsWith('#'));
      const pistaTexto = video.addTextTrack('subtitles', lista.match(/NAME="([^"]+)"/)?.[1] ?? 'Subtítulos', lista.match(/LANGUAGE="([^"]+)"/)?.[1] ?? '');
      pistaTexto.mode = subtitulos ? 'showing' : 'hidden';
      for (const trozo of trozos) anadirCues(pistaTexto, await (await fetch(new URL(trozo.trim(), direccion))).text());
      const boton = bloque.querySelector('.bv-subtitulos');
      if (boton && videoDe(bloque) === video) boton.style.display = '';
    } catch (error) {
      console.debug('[Bloqueador:Twitter]', 'Sin subtítulos:', error.message);
    }
  }

  const segundos = (tiempo) => tiempo.split(':').reduce((total, parte) => total * 60 + Number(parte), 0);

  function anadirCues(pistaTexto, vtt) {
    for (const parrafo of vtt.replace(/\r/g, '').split('\n\n')) {
      const m = parrafo.match(/([\d:.]+) --> ([\d:.]+)[^\n]*\n([\s\S]+)/);
      // Sin etiquetas: los automáticos llevan una con los tiempos de cada palabra
      if (m) pistaTexto.addCue(new VTTCue(segundos(m[1]), segundos(m[2]), m[3].replace(/<[^>]+>/g, '').trim()));
    }
  }

  function alternarPausa(video) {
    if (video.paused) reproducir(video);
    else video.pause();
  }

  function reproducir(video) {
    Object.assign(video, sonido, { playbackRate: velocidad });
    // Sin interacción previa, Chrome solo deja reproducir en silencio
    video.play().catch((error) => {
      if (error.name === 'NotAllowedError') {
        sonido.muted = true;
        pintarControles();
      } else if (error.name !== 'AbortError') {
        return; // no se puede reproducir: lo dice su evento error
      }
      // Interrumpido mientras cargaba: se vuelve a intentar si sigue siendo el que se ve
      if (videoDe(pista.children[actual]) === video) video.play().catch(() => {});
    });
  }

  function reproducirActual() {
    [...pista.children].forEach((bloque, i) => {
      const video = videoDe(bloque);
      if (!video) return;
      if (i !== actual) video.pause();
      else if (!bloque.querySelector('.bv-tapado') && video.paused) reproducir(video);
    });
    pintarControles();
  }

  // ---- Pista ----

  const observador = new IntersectionObserver((entradas) => {
    for (const entrada of entradas) {
      if (entrada.isIntersecting) activar([...pista.children].indexOf(entrada.target));
    }
  }, { root: pista, threshold: 0.6 });

  // Pone en la pista los tuits que faltan. `encima`: cuántos van al principio
  function completarPista(encima = 0) {
    const { tuits } = abierto.sesion;
    const nuevos = (desde, hasta) => tuits.slice(desde, hasta).map((tuit) => {
      const bloque = crearBloque(tuit);
      observador.observe(bloque);
      return bloque;
    });
    if (encima) {
      pista.prepend(...nuevos(0, encima));
      actual += encima;
      pista.children[actual].scrollIntoView({ behavior: 'instant' });
    }
    pista.append(...nuevos(pista.childElementCount));
    cargarCercanos();
  }

  function cargarCercanos() {
    [...pista.children].forEach((bloque, i) => {
      if (Math.abs(i - actual) <= 1) cargarMedio(bloque);
      else if (bloque.cargado) descargarMedio(bloque);
    });
  }

  function activar(i) {
    if (i < 0 || i === actual) return;
    actual = i;
    cargarCercanos();
    reproducirActual();
    programarExtras();
    programar();
  }

  // Lo que solo se pide si se queda en él
  function programarExtras() {
    clearTimeout(temporizador);
    pintarPanel();
    temporizador = setTimeout(() => {
      const bloque = pista.children[actual];
      if (!bloque) return;
      completar(bloque);
      cargarSubtitulos(bloque);
      if (panelAbierto) cargarRespuestas(bloque.tuit);
    }, ESPERA_EXTRAS);
  }

  // Lo que les falta a los tuits que vienen incompletos (ver tuitDe)
  async function completar(bloque) {
    const { tuit } = bloque;
    if (!tuit.parcial) return;
    tuit.parcial = false;
    try {
      const completo = await BloqueadorTwitterDatos.buscarTuit(tuit.id);
      if (!completo) return;
      Object.assign(tuit, completo, { medios: tuit.medios });
      bloque.querySelector('.bv-info p').textContent = tuit.texto;
      pintarAcciones(tuit);
      panelPintado = '';
      pintarPanel();
    } catch (error) {
      tuit.parcial = true;
      console.debug('[Bloqueador:Twitter]', 'No se ha podido completar el tuit:', error.message);
    }
  }

  function pasar(pasos) {
    if (!hay(pasos)) return;
    const destino = actual + pasos;
    const suave = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    pista.children[destino].scrollIntoView({ behavior: suave ? 'smooth' : 'instant' });
    activar(destino);
  }

  function elegirFuente(valor) {
    const tuit = abierto?.sesion?.tuits[actual];
    if (!tuit) return;
    fuente = valor;
    chrome.storage.local.set({ [CLAVE_FUENTE]: valor });
    empezar(tuit, pista.children[actual].indice, valor);
  }

  // ---- Panel: el tuit y sus respuestas ----

  const conversaciones = new Map(); // id -> { respuestas, cursor, estado }

  function alternarPanel() {
    panelAbierto = !panelAbierto;
    visor.classList.toggle('bv-con-panel', panelAbierto);
    pintarPanel();
    const tuit = abierto?.sesion?.tuits[actual];
    if (panelAbierto && tuit) cargarRespuestas(tuit);
  }

  async function cargarRespuestas(tuit, mas = false) {
    const previa = conversaciones.get(tuit.id);
    if (previa && (previa.estado === 'cargando' || (!mas && previa.estado === 'lista') || (mas && !previa.cursor))) return;
    const conversacion = { respuestas: previa?.respuestas ?? [], cursor: previa?.cursor ?? null, estado: 'cargando' };
    conversaciones.set(tuit.id, conversacion);
    pintarPanel();
    try {
      const { respuestas, cursor } = await BloqueadorTwitterDatos.buscarRespuestas(tuit.id, conversacion.cursor);
      const vistas = new Set(conversacion.respuestas.map((r) => r.tweet.id));
      const nuevas = respuestas.filter((r) => !vistas.has(r.tweet.id));
      conversacion.respuestas = [...conversacion.respuestas, ...nuevas];
      conversacion.cursor = nuevas.length ? cursor : null;
      conversacion.estado = 'lista';
    } catch (error) {
      console.debug('[Bloqueador:Twitter]', 'No se han podido cargar las respuestas:', error.message);
      conversacion.estado = 'error';
    }
    pintarPanel();
  }

  let panelPintado = '';

  function pintarPanel() {
    const tuit = abierto?.sesion?.tuits[actual];
    if (!panelAbierto || !tuit) return;
    const conversacion = conversaciones.get(tuit.id) ?? { respuestas: [], estado: 'cargando' };
    const clave = `${tuit.id} ${conversacion.estado} ${conversacion.respuestas.length}`;
    if (panelPintado === clave) return;
    const mismo = panelPintado.startsWith(`${tuit.id} `);
    panelPintado = clave;

    const ficha = crear('div', 'bv-tuit');
    const cabecera = crear('header');
    const avatar = crear('img', 'bc-avatar');
    avatar.alt = '';
    if (tuit.perfil.avatar) avatar.src = tuit.perfil.avatar;
    const nombres = crear('div');
    nombres.append(enlazar(`/${tuit.perfil.usuario}`, 'bc-nombre', tuit.perfil.nombre), crear('span', 'bc-dato', `@${tuit.perfil.usuario}`));
    cabecera.append(enlazar(`/${tuit.perfil.usuario}`, '', avatar), nombres);
    const pie = crear('footer');
    const responder = crear('button', 'bv-responder', 'Responder');
    responder.addEventListener('click', () => irA(`/compose/post?in_reply_to=${tuit.id}`));
    pie.append(crear('span', '', new Date(tuit.fecha).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })), responder);
    ficha.append(cabecera, crear('p', '', tuit.texto), pie);

    const recuadro = crear('div', 'bloqueador-recuadro');
    const lista = crear('ul');
    lista.classList.toggle('bc-difuminar', ajustes.twitter.galeriaDifuminar);
    lista.append(...conversacion.respuestas.map((r) => crearFila(r)));
    recuadro.append(lista);
    const texto = conversacion.estado === 'cargando' ? 'Cargando…'
      : conversacion.estado === 'error' ? 'No se han podido cargar las respuestas.'
        : conversacion.respuestas.length ? '' : 'Sin respuestas.';
    if (texto) {
      const nota = crear('p', 'bc-vacio', texto);
      if (conversacion.estado === 'error') {
        const reintentar = crear('button', '', 'Reintentar');
        reintentar.addEventListener('click', () => cargarRespuestas(tuit, conversacion.respuestas.length > 0));
        nota.append(reintentar);
      }
      recuadro.append(nota);
    }
    panel.replaceChildren(ficha, recuadro);
    if (!mismo) panel.scrollTop = 0;
  }

  panel.addEventListener('scroll', () => {
    const tuit = abierto?.sesion?.tuits[actual];
    const conversacion = tuit && conversaciones.get(tuit.id);
    if (conversacion?.estado === 'lista' && conversacion.cursor && panel.scrollTop + panel.clientHeight > panel.scrollHeight - 400) {
      cargarRespuestas(tuit, true);
    }
  });

  // ---- Abrir y cerrar ----

  function vaciar() {
    observador.disconnect();
    clearTimeout(temporizador);
    for (const bloque of pista.children) quitarVideo(bloque);
    pista.replaceChildren();
    actual = -1;
  }

  // Empieza una lista nueva por un tuit
  function empezar(tuit, indice, elegida) {
    abierto.sesion = crearSesion(tuit, elegida);
    vaciar();
    aviso.textContent = '';
    const bloque = crearBloque(tuit, indice);
    pista.append(bloque);
    observador.observe(bloque);
    activar(0);
    cargarMas();
  }

  async function abrir(contenedor, [ruta, usuario, id, numero = '1']) {
    const propio = { ruta, usuario, id, sesion: null };
    abierto = propio;
    vaciar();
    if (pulsado?.id === id) {
      // En los tweets van en silencio; aquí se ha pedido verlo
      sonido.muted = false;
    } else {
      const deX = [...contenedor.querySelectorAll('video')].sort((a, b) => b.clientWidth - a.clientWidth)[0];
      if (deX) sonido = { muted: deX.muted, volume: deX.volume };
    }
    // X vuelve a poner en marcha los suyos: con el atributo, twitter-api.js no le deja
    document.documentElement.setAttribute(ATTR_VISOR, '');
    for (const video of document.querySelectorAll('video')) video.pause();
    aviso.textContent = 'Cargando…';
    visor.classList.toggle('bv-con-panel', panelAbierto);
    contenedor.append(visor);

    let tuit = null;
    try {
      tuit = await BloqueadorTwitterDatos.buscarTuit(id);
    } catch (error) {
      console.debug('[Bloqueador:Twitter]', 'No se ha podido abrir el vídeo:', error.message);
    }
    if (abierto !== propio) return;
    // Directos, tarjetas… o un fallo: se queda el visor de X
    if (!tuit?.medios.length) {
      omitida = ruta;
      cerrar();
      for (const video of contenedor.querySelectorAll('[role="dialog"] video, main video')) video.play().catch(() => {});
      return;
    }
    // El número cuenta también las fotos del tuit, que aquí no están
    const indice = tuit.medios.findIndex((m) => m.numero === Number(numero));
    empezar(tuit, Math.max(indice, 0), busqueda ? 'tendencia' : fuente);
    const video = videoDe(pista.children[0]);
    if (video && pulsado?.id === id) video.currentTime = pulsado.segundo;
    pulsado = null;
    programar();
  }

  function cerrar() {
    abierto = null;
    document.documentElement.removeAttribute(ATTR_VISOR);
    if (document.pictureInPictureElement && pista.contains(document.pictureInPictureElement)) document.exitPictureInPicture();
    vaciar();
    visor.remove();
    panelPintado = '';
  }

  function poner(elemento, propiedad, valor) {
    if (elemento[propiedad] !== valor) elemento[propiedad] = valor;
  }

  function pintarLateral() {
    const { sesion } = abierto;
    const usada = sesion?.clave.startsWith('tendencia ') ? sesion.clave.slice('tendencia '.length) : '';
    const consulta = usada || tendencia();
    const [botonPerfil, botonTendencia] = fuentes.children;
    botonPerfil.setAttribute('aria-checked', String(!usada));
    botonTendencia.setAttribute('aria-checked', String(Boolean(usada)));
    poner(botonTendencia, 'disabled', !consulta);
    poner(botonTendencia, 'textContent', busqueda ? 'Búsqueda' : FUENTES.tendencia);
    poner(botonTendencia, 'title', consulta || 'El tuit no tiene hashtags');
    poner(anterior, 'disabled', !hay(-1));
    poner(siguiente, 'disabled', !hay(1));
    poner(siguiente, 'title', hay(1) || !sesion ? 'Siguiente (↓)'
      : sesion.agotada ? 'No hay más'
        : Date.now() < sesion.reintento ? 'X no responde: se reintentará en un momento'
          : 'Cargando…');
  }

  function revisar() {
    pendiente = false;
    const ruta = location.pathname.match(RUTA_MEDIO);
    if (!ruta) {
      omitida = '';
      if (abierto) cerrar();
      anotarPagina();
      return;
    }
    if (!activa() || ruta[0] === omitida) {
      if (abierto) cerrar();
      return;
    }
    const contenedor = ruta[3] ? [...document.querySelectorAll('[role="dialog"]')].at(-1) : document.body;
    if (!contenedor || !BloqueadorTwitter.hidratado(contenedor, programar)) return;
    if (abierto?.ruta !== ruta[0]) {
      abrir(contenedor, ruta);
      return;
    }
    if (visor.parentElement !== contenedor) contenedor.append(visor);
    if (abierto.sesion && !hay(RESERVA)) cargarMas();
    pintarLateral();
  }

  function programar() {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(revisar);
  }

  // ---- Vídeos de los tweets ----

  // Lo que se pulsa de un vídeo sin contar sus controles. En la web nueva, los
  // botones que lo cubren entero; en la clásica, el propio vídeo o su "play"
  const SUPERFICIE = '[data-slot="xds-context-menu-trigger"] > button';
  const REPRODUCTOR = '[data-slot="xds-context-menu-trigger"], [data-testid="videoPlayer"]';

  function superficieDe(elemento) {
    const nueva = elemento.closest(SUPERFICIE);
    if (nueva) return nueva;
    if (!elemento.closest('[data-testid="videoPlayer"]')) return null;
    if (elemento.closest('[data-testid="playButton"]')) return elemento;
    return elemento.closest('button, a, [role="slider"], [role="menu"]') ? null : elemento;
  }

  // "/usuario/status/123" del tuit del vídeo, que puede ser el citado
  function rutaDelTuit(elemento, articulo) {
    const recuadro = elemento.closest('[data-href*="/status/"]');
    if (recuadro) return recuadro.dataset.href;
    return [...articulo.querySelectorAll('a[href*="/status/"]')]
      .map((a) => a.getAttribute('href').match(/^\/[^/]+\/status\/\d+/)?.[0])
      .find(Boolean);
  }

  window.addEventListener('click', (evento) => {
    if (!activa() || visor.isConnected || evento.button !== 0) return;
    if (evento.ctrlKey || evento.metaKey || evento.shiftKey || evento.altKey) return;
    const articulo = evento.target.closest?.('article');
    if (!articulo || !superficieDe(evento.target)) return;
    if (RUTA_MEDIO.test(location.pathname) || RUTA_FOTO.test(location.pathname)) return;
    const ruta = rutaDelTuit(evento.target, articulo);
    const id = ruta?.match(/\/status\/(\d+)/)[1];
    if (!id) return;
    evento.preventDefault();
    evento.stopImmediatePropagation();
    // Qué número hace entre las fotos y vídeos del tuit
    const reproductor = evento.target.closest(REPRODUCTOR);
    const medios = [...articulo.querySelectorAll(`a[href*="/photo/"], ${REPRODUCTOR}`)].filter((e) => e.closest('article') === articulo);
    const numero = Math.max(medios.indexOf(reproductor), 0) + 1;
    const video = reproductor.querySelector('video') ?? reproductor.parentElement.querySelector('video');
    pulsado = { id, segundo: video?.currentTime ?? 0 };
    BloqueadorTwitter.navegar(`${ruta.match(/^\/[^/]+\/status\/\d+/)[0]}/video/${numero}`);
  }, true);

  // ---- Rueda y teclado ----

  window.addEventListener('wheel', (evento) => {
    if (!visor.isConnected || evento.ctrlKey || !visor.contains(evento.target)) return;
    evento.stopPropagation();
    if (panel.contains(evento.target)) return;
    evento.preventDefault();
    if (Date.now() < bloqueadoHasta || Math.abs(evento.deltaX) > Math.abs(evento.deltaY)) return;
    if (Math.sign(evento.deltaY) !== Math.sign(acumulado)) acumulado = 0;
    acumulado += evento.deltaY;
    if (Math.abs(acumulado) < UMBRAL_RUEDA) return;
    const pasos = acumulado > 0 ? 1 : -1;
    acumulado = 0;
    bloqueadoHasta = Date.now() + ESPERA_RUEDA;
    pasar(pasos);
  }, { capture: true, passive: false });

  // ← →: otro vídeo del tuit o, si solo tiene uno, adelante y atrás en él
  function moverHorizontal(pasos) {
    const bloque = pista.children[actual];
    if (!bloque || bloque.tuit.medios.length > 1) {
      if (bloque) cambiarMedio(bloque, pasos);
      return;
    }
    const video = videoDe(bloque);
    if (video) video.currentTime += pasos * SALTO;
  }

  window.addEventListener('keydown', (evento) => {
    if (!visor.isConnected || evento.ctrlKey || evento.altKey || evento.metaKey) return;
    const enBoton = evento.target.closest?.('button, a');
    const acciones = {
      ArrowDown: () => pasar(1),
      ArrowUp: () => pasar(-1),
      ArrowLeft: () => moverHorizontal(-1),
      ArrowRight: () => moverHorizontal(1),
      Escape: salir,
      m: alternarSonido,
      c: alternarSubtitulos,
      r: alternarPanel,
      // En un botón o enlace, el espacio lo pulsa
      ...(!(enBoton && visor.contains(enBoton)) && {
        ' ': () => {
          const bloque = pista.children[actual];
          const video = videoDe(bloque);
          if (!destapar(bloque) && video) alternarPausa(video);
        }
      })
    };
    const accion = acciones[evento.key];
    // Los atajos de X (me gusta, repostear…) irían a otro tuit: se anulan. Tab,
    // Intro, espacio y las teclas de función siguen
    if (!accion && (evento.key.length > 1 || evento.key === ' ')) return;
    evento.stopImmediatePropagation();
    if (!accion) return;
    evento.preventDefault();
    if (!evento.repeat || evento.key === 'ArrowLeft' || evento.key === 'ArrowRight') accion();
  }, true);

  // ---- Arranque ----

  const hoja = document.createElement('style');
  hoja.textContent = ESTILOS;
  document.head.append(hoja);

  Promise.all([BloqueadorAjustes.cargar(), chrome.storage.local.get(CLAVE_FUENTE)]).then(([guardados, datos]) => {
    ajustes = guardados;
    fuente = FUENTES[datos[CLAVE_FUENTE]] ? datos[CLAVE_FUENTE] : 'perfil';
    programar();
  });
  BloqueadorAjustes.alCambiar((nuevos) => { ajustes = nuevos; programar(); });

  new MutationObserver(programar).observe(document.body, { childList: true, subtree: true });
})();
