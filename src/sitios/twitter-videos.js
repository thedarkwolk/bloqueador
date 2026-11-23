/**
 * Bloqueador - Twitter/X: pasar de vídeo en vídeo, como en el móvil
 * En la vista de vídeo de X (…/status/123/video/1), la rueda, las flechas ↑ ↓ o
 * los botones abren encima un reproductor propio a pantalla completa con los
 * demás vídeos, uno debajo de otro. Son los del mismo perfil o los de una
 * búsqueda: la página de búsqueda o de hashtag desde la que se abrió el vídeo
 * (en ese caso se empieza por ella) o, si no, el primer hashtag del tuit.
 *
 * No se usa el visor de X para cada vídeo porque X solo deja abrirlo 50 veces
 * cada 15 minutos (tweetMediaViewerQuery), y al pasarse tampoco abre las fotos.
 * Los datos, con los MP4, los pide twitter-datos.js por páginas de 20.
 */
(() => {
  'use strict';

  const RUTA_VIDEO = /^\/([^/]+)\/status\/(\d+)\/video\/\d+\/?$/;
  const CLAVE_FUENTE = 'videosFuente';
  const FUENTES = { perfil: 'Perfil', tendencia: 'Tendencia' };
  // Tras pasar de vídeo se ignora la rueda un momento: un solo gesto del
  // touchpad manda muchos eventos seguidos
  const ESPERA_RUEDA = 600;
  const UMBRAL_RUEDA = 40;
  // Cuando quedan estos vídeos por delante se pide la página siguiente
  const RESERVA = 4;
  // Si X no responde, cuándo se reintenta (si es por su límite, lo dice el error)
  const REINTENTO = 5 * 1000;
  const SALTO = 5; // segundos, con ← →

  // Iconos: Phosphor Icons v2.1.1 (https://phosphoricons.com), licencia MIT
  const ICONOS = {
    arriba: 'M213.66,165.66a8,8,0,0,1-11.32,0L128,91.31,53.66,165.66a8,8,0,0,1-11.32-11.32l80-80a8,8,0,0,1,11.32,0l80,80A8,8,0,0,1,213.66,165.66Z',
    abajo: 'M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z',
    cerrar: 'M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z',
    sonido: 'M155.51,24.81a8,8,0,0,0-8.42.88L77.25,80H32A16,16,0,0,0,16,96v64a16,16,0,0,0,16,16H77.25l69.84,54.31A8,8,0,0,0,160,224V32A8,8,0,0,0,155.51,24.81ZM144,207.64,84.91,161.69A7.94,7.94,0,0,0,80,160H32V96H80a7.94,7.94,0,0,0,4.91-1.69L144,48.36ZM208,128a39.93,39.93,0,0,1-10,26.46,8,8,0,0,1-12-10.58,24,24,0,0,0,0-31.72,8,8,0,1,1,12-10.58A40,40,0,0,1,208,128Z',
    silencio: 'M155.51,24.81a8,8,0,0,0-8.42.88L77.25,80H32A16,16,0,0,0,16,96v64a16,16,0,0,0,16,16H77.25l69.84,54.31A8,8,0,0,0,160,224V32A8,8,0,0,0,155.51,24.81ZM144,207.64,84.91,161.69A7.94,7.94,0,0,0,80,160H32V96H80a7.94,7.94,0,0,0,4.91-1.69L144,48.36Zm101.66-61.3a8,8,0,0,1-11.32,11.32L216,139.31l-18.34,18.35a8,8,0,0,1-11.32-11.32L204.69,128l-18.35-18.34a8,8,0,0,1,11.32-11.32L216,116.69l18.34-18.35a8,8,0,0,1,11.32,11.32L227.31,128Z',
    tuit: 'M224,104a8,8,0,0,1-16,0V59.32l-66.33,66.34a8,8,0,0,1-11.32-11.32L196.68,48H152a8,8,0,0,1,0-16h64a8,8,0,0,1,8,8Zm-40,24a8,8,0,0,0-8,8v72H48V80h72a8,8,0,0,0,0-16H48A16,16,0,0,0,32,80V208a16,16,0,0,0,16,16H176a16,16,0,0,0,16-16V136A8,8,0,0,0,184,128Z',
    enlace: 'M165.66,90.34a8,8,0,0,1,0,11.32l-64,64a8,8,0,0,1-11.32-11.32l64-64A8,8,0,0,1,165.66,90.34ZM215.6,40.4a56,56,0,0,0-79.2,0L106.34,70.45a8,8,0,0,0,11.32,11.32l30.06-30a40,40,0,0,1,56.57,56.56l-30.07,30.06a8,8,0,0,0,11.31,11.32L215.6,119.6a56,56,0,0,0,0-79.2ZM138.34,174.22l-30.06,30.06a40,40,0,1,1-56.56-56.57l30.05-30.05a8,8,0,0,0-11.32-11.32L40.4,136.4a56,56,0,0,0,79.2,79.2l30.06-30.07a8,8,0,0,0-11.32-11.31Z',
    descargar: 'M224,144v64a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V144a8,8,0,0,1,16,0v56H208V144a8,8,0,0,1,16,0Zm-101.66,5.66a8,8,0,0,0,11.32,0l40-40a8,8,0,0,0-11.32-11.32L136,124.69V32a8,8,0,0,0-16,0v92.69L93.66,98.34a8,8,0,0,0-11.32,11.32Z'
  };

  const ESTILOS = `
    .bloqueador-videos, .bloqueador-feed {
      font-family: TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .bloqueador-videos {
      position: fixed; left: 16px; top: 50%; transform: translateY(-50%); z-index: 30;
      display: flex; flex-direction: column; align-items: center; gap: 8px;
    }
    .bloqueador-videos button, .bloqueador-feed button {
      all: unset; box-sizing: border-box; display: grid; place-items: center; cursor: pointer;
      background: rgba(15, 20, 25, 0.75); color: #ffffff; transition: background-color 0.2s;
    }
    .bloqueador-videos button:hover, .bloqueador-videos button:focus-visible,
    .bloqueador-feed button:hover, .bloqueador-feed button:focus-visible { background: rgba(60, 66, 72, 0.9); }
    .bloqueador-videos button:disabled { opacity: 0.35; cursor: default; }
    .bloqueador-videos .bv-redondo, .bloqueador-feed .bv-redondo { width: 44px; height: 44px; border-radius: 50%; }
    .bv-redondo svg { width: 22px; height: 22px; fill: currentColor; }
    .bv-fuentes { display: flex; flex-direction: column; border-radius: 14px; overflow: hidden; margin-top: 4px; }
    .bloqueador-videos .bv-fuentes button { padding: 7px 10px; font-size: 12px; line-height: 16px; font-weight: 600; }
    .bloqueador-videos .bv-fuentes button[aria-checked="true"] { background: #ffffff; color: #0f1419; }

    .bloqueador-feed { position: fixed; inset: 0; z-index: 20; background: #000000; color: #ffffff; }
    .bv-pista {
      position: absolute; inset: 0; overflow-y: auto; scroll-snap-type: y mandatory; scrollbar-width: none;
      overscroll-behavior: contain;
    }
    .bv-video { position: relative; height: 100%; scroll-snap-align: start; scroll-snap-stop: always; overflow: hidden; }
    .bv-video video { width: 100%; height: 100%; object-fit: contain; display: block; cursor: pointer; }
    .bv-video.bv-tapado video { filter: blur(40px); }
    .bv-aviso {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); pointer-events: none;
      padding: 8px 14px; border-radius: 9999px; background: rgba(15, 20, 25, 0.8); font-size: 14px;
    }
    .bv-aviso:empty { display: none; }
    .bv-info {
      position: absolute; left: 0; right: 0; bottom: 0; padding: 60px 100px 22px 92px; pointer-events: none;
      background: linear-gradient(transparent, rgba(0, 0, 0, 0.75)); font-size: 15px; line-height: 20px;
    }
    .bv-info a { pointer-events: auto; color: inherit; text-decoration: none; font-weight: 700; }
    .bv-info a:hover { text-decoration: underline; }
    .bv-info span { color: rgba(255, 255, 255, 0.7); }
    .bv-info p {
      margin: 4px 0 0; white-space: pre-line; overflow-wrap: anywhere; max-width: 760px;
      display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden;
    }
    .bv-acciones { position: absolute; right: 24px; bottom: 40px; display: flex; flex-direction: column; gap: 10px; }
    .bv-acciones button[data-estado="hecho"] { color: rgb(0, 186, 124); }
    .bv-acciones button[data-estado="error"] { color: rgb(244, 33, 46); }
    .bloqueador-feed .bv-cerrar { position: absolute; left: 16px; top: 16px; z-index: 2; }
    .bv-barra { position: absolute; left: 0; right: 0; bottom: 0; height: 14px; cursor: pointer; }
    .bv-barra::before { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: rgba(255, 255, 255, 0.25); }
    .bv-barra div { position: absolute; left: 0; bottom: 0; height: 4px; background: rgb(29, 155, 240); }
    .bv-barra:hover::before, .bv-barra:hover div { height: 7px; }`;

  const { crearIcono } = BloqueadorRecuadro;

  let ajustes = BloqueadorAjustes.POR_DEFECTO;
  let pendiente = false;
  let fuente = 'perfil';
  // Búsqueda de la página desde la que se abrió el vídeo ('' si no era una)
  let busqueda = '';
  // Fuente elegida con los botones para el vídeo abierto; si no, fuenteInicial()
  let elegida = null;
  // Vídeos: { clave, pedir, videos, cursor, cargando, agotada, reintento }
  let sesion = null;
  let actual = -1; // posición en sesion.videos del que se ve en el reproductor
  let sonido = { muted: false, volume: 1 };
  let acumulado = 0;
  let bloqueadoHasta = 0;

  const activa = () => ajustes.activo && ajustes.twitter.videosSeguidos;

  function videoAbierto() {
    const [, usuario, id] = location.pathname.match(RUTA_VIDEO) ?? [];
    return id ? { usuario, id } : null;
  }

  const visor = () => [...document.querySelectorAll('[role="dialog"]')].reverse().find((d) => d.querySelector('video')) ?? null;

  // La búsqueda de la página actual, si lo es. La del tuit no cuenta como otra
  // página: se puede abrir el tuit desde la búsqueda y luego su vídeo
  function anotarBusqueda() {
    if (/\/status\/\d+/.test(location.pathname)) return;
    const hashtag = location.pathname.match(/^\/hashtag\/([^/]+)/)?.[1];
    busqueda = hashtag ? `#${decodeURIComponent(hashtag)}`
      : location.pathname === '/search' ? new URLSearchParams(location.search).get('q') ?? ''
        : '';
  }

  const fuenteInicial = () => (busqueda ? 'tendencia' : fuente);

  function tendencia() {
    if (busqueda) return busqueda;
    const hashtag = visor()?.querySelector('a[href*="/hashtag/"]')?.getAttribute('href').match(/\/hashtag\/([^/?#]+)/)?.[1];
    return hashtag ? `#${decodeURIComponent(hashtag)}` : '';
  }

  // ---- Lista de vídeos ----

  function abrirSesion({ usuario }) {
    const consulta = (elegida ?? fuenteInicial()) === 'tendencia' ? tendencia() : '';
    const clave = consulta ? `tendencia ${consulta}` : `perfil ${usuario.toLowerCase()}`;
    if (sesion?.clave === clave) return;
    sesion = {
      clave,
      pedir: consulta
        ? (cursor) => BloqueadorTwitterDatos.buscarVideosDe(consulta, cursor)
        : (cursor) => BloqueadorTwitterDatos.buscarVideos(usuario, cursor),
      videos: [],
      cursor: null,
      cargando: false,
      agotada: false,
      reintento: 0
    };
    cargarMas();
  }

  async function cargarMas() {
    const propia = sesion;
    if (!propia || propia.cargando || propia.agotada || Date.now() < propia.reintento) return;
    propia.cargando = true;
    try {
      const { videos, cursor } = await propia.pedir(propia.cursor);
      const vistos = new Set(propia.videos.map((v) => v.id));
      propia.videos.push(...videos.filter((v) => !vistos.has(v.id) && vistos.add(v.id)));
      propia.agotada = !cursor || !videos.length || cursor === propia.cursor;
      propia.cursor = cursor;
    } catch (error) {
      console.debug('[Bloqueador:Twitter]', 'No se han podido cargar más vídeos:', error.message);
      const espera = error.esperar ?? REINTENTO;
      propia.reintento = Date.now() + espera;
      setTimeout(programar, espera + 50);
    }
    propia.cargando = false;
    if (propia === sesion && feed.isConnected) completarPista();
    programar();
  }

  // Posición desde la que se cuenta: la del reproductor o, si está cerrado, la
  // del vídeo abierto en el visor de X (-1 si no está en la lista)
  function posicion() {
    if (feed.isConnected) return actual;
    const id = videoAbierto()?.id;
    return sesion?.videos.findIndex((v) => v.id === id) ?? -1;
  }

  const hay = (pasos) => Boolean(sesion?.videos[posicion() + pasos]);

  // ---- Reproductor ----

  const feed = document.createElement('div');
  feed.className = 'bloqueador-feed';
  const pista = document.createElement('div');
  pista.className = 'bv-pista';
  const cerrarFeed = crearBoton('Cerrar (Esc)', ICONOS.cerrar, () => cerrar());
  cerrarFeed.classList.add('bv-cerrar');
  feed.append(pista, cerrarFeed);

  const observador = new IntersectionObserver((entradas) => {
    for (const entrada of entradas) {
      if (entrada.isIntersecting) activar([...pista.children].indexOf(entrada.target));
    }
  }, { root: pista, threshold: 0.6 });

  function crearBoton(etiqueta, icono, accion) {
    const boton = document.createElement('button');
    boton.className = 'bv-redondo';
    boton.title = etiqueta;
    boton.setAttribute('aria-label', etiqueta);
    boton.append(crearIcono(icono));
    boton.addEventListener('click', () => accion(boton));
    return boton;
  }

  function mostrarEstado(boton, estado) {
    boton.dataset.estado = estado;
    setTimeout(() => delete boton.dataset.estado, 2000);
  }

  function pintarSonido() {
    for (const boton of pista.querySelectorAll('.bv-sonido')) {
      boton.replaceChildren(crearIcono(sonido.muted ? ICONOS.silencio : ICONOS.sonido));
    }
    const video = pista.children[actual]?.querySelector('video');
    if (video) Object.assign(video, sonido);
  }

  function alternarSonido() {
    sonido.muted = !sonido.muted;
    if (!sonido.muted && !sonido.volume) sonido.volume = 1;
    pintarSonido();
  }

  function crearEnlace(ruta, texto) {
    const enlace = document.createElement('a');
    enlace.href = ruta;
    enlace.textContent = texto;
    enlace.addEventListener('click', (evento) => {
      if (evento.ctrlKey || evento.metaKey || evento.shiftKey) return;
      evento.preventDefault();
      irA(ruta);
    });
    return enlace;
  }

  function irA(ruta) {
    cerrar();
    BloqueadorTwitter.navegar(ruta);
  }

  function crearVideo(datos) {
    const bloque = document.createElement('section');
    bloque.className = 'bv-video';
    const video = document.createElement('video');
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.poster = datos.poster;
    const aviso = document.createElement('div');
    aviso.className = 'bv-aviso';
    if (datos.sensible && ajustes.twitter.galeriaDifuminar) {
      bloque.classList.add('bv-tapado');
      aviso.textContent = 'Contenido sensible: pulsa para verlo';
    }
    video.addEventListener('click', () => {
      if (bloque.classList.contains('bv-tapado')) {
        bloque.classList.remove('bv-tapado');
        aviso.textContent = '';
        video.play().catch(() => {});
      } else {
        alternarPausa(video);
      }
    });
    video.addEventListener('error', () => {
      if (video.getAttribute('src')) aviso.textContent = 'No se ha podido reproducir';
    });

    const barra = document.createElement('div');
    barra.className = 'bv-barra';
    const progreso = document.createElement('div');
    barra.append(progreso);
    video.addEventListener('timeupdate', () => {
      progreso.style.width = video.duration ? `${(video.currentTime / video.duration) * 100}%` : '0';
    });
    barra.addEventListener('pointerdown', (evento) => {
      const mover = (e) => {
        const { left, width } = barra.getBoundingClientRect();
        if (video.duration) video.currentTime = Math.min(Math.max((e.clientX - left) / width, 0), 1) * video.duration;
      };
      barra.setPointerCapture(evento.pointerId);
      mover(evento);
      barra.addEventListener('pointermove', mover);
      barra.addEventListener('pointerup', () => barra.removeEventListener('pointermove', mover), { once: true });
    });

    const info = document.createElement('div');
    info.className = 'bv-info';
    const autor = document.createElement('span');
    autor.textContent = ` @${datos.perfil.usuario} · ${new Date(datos.fecha).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}`
      + (datos.meGusta ? ` · ${datos.meGusta.toLocaleString('es', { notation: 'compact' })} me gusta` : '');
    const texto = document.createElement('p');
    texto.textContent = datos.texto;
    info.append(crearEnlace(`/${datos.perfil.usuario}`, datos.perfil.nombre), autor, texto);

    const acciones = document.createElement('div');
    acciones.className = 'bv-acciones';
    const rutaTuit = datos.ruta.replace(/\/video\/\d+$/, '');
    const botonSonido = crearBoton('Sonido (M)', sonido.muted ? ICONOS.silencio : ICONOS.sonido, alternarSonido);
    botonSonido.classList.add('bv-sonido');
    acciones.append(
      botonSonido,
      crearBoton('Abrir el tuit', ICONOS.tuit, () => irA(rutaTuit)),
      crearBoton('Copiar enlace', ICONOS.enlace, (boton) => navigator.clipboard.writeText(`https://x.com${rutaTuit}`)
        .then(() => mostrarEstado(boton, 'hecho'), () => mostrarEstado(boton, 'error'))),
      crearBoton('Descargar vídeo', ICONOS.descargar, (boton) => chrome.runtime
        .sendMessage({ tipo: 'descargar-video', id: datos.id, usuario: datos.perfil.usuario, urls: [datos.mejor] })
        .then((r) => mostrarEstado(boton, r?.ok ? 'hecho' : 'error'), () => mostrarEstado(boton, 'error')))
    );
    bloque.append(video, aviso, info, acciones, barra);
    return bloque;
  }

  function alternarPausa(video) {
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }

  // Añade a la pista los vídeos que aún no están
  function completarPista() {
    for (const datos of sesion.videos.slice(pista.childElementCount)) {
      const bloque = crearVideo(datos);
      pista.append(bloque);
      observador.observe(bloque);
    }
    cargarCercanos();
  }

  // Solo tienen fuente el que se ve y los de al lado, para no descargar de más
  function cargarCercanos() {
    [...pista.children].forEach((bloque, i) => {
      const video = bloque.querySelector('video');
      const cerca = Math.abs(i - actual) <= 1;
      const tiene = video.hasAttribute('src');
      if (cerca && !tiene) {
        video.src = sesion.videos[i].mp4;
      } else if (!cerca && tiene) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
    });
  }

  function activar(i) {
    if (i < 0 || (i === actual && !pista.children[i].querySelector('video').paused)) return;
    actual = i;
    cargarCercanos();
    [...pista.children].forEach((bloque, n) => {
      const video = bloque.querySelector('video');
      if (n !== i) {
        video.pause();
        return;
      }
      Object.assign(video, sonido);
      if (bloque.classList.contains('bv-tapado')) return;
      // Sin interacción previa, Chrome solo deja reproducir en silencio
      video.play().catch((error) => {
        if (error.name !== 'NotAllowedError') return;
        sonido.muted = true;
        pintarSonido();
        video.play().catch(() => {});
      });
    });
    programar();
  }

  function abrir(dialogo, i) {
    const deX = [...dialogo.querySelectorAll('video')].sort((a, b) => b.clientWidth - a.clientWidth)[0];
    if (deX) sonido = { muted: deX.muted, volume: deX.volume };
    for (const video of dialogo.querySelectorAll('video')) video.pause();
    actual = -1;
    pista.replaceChildren();
    dialogo.append(feed);
    completarPista();
    pista.children[i].scrollIntoView({ behavior: 'instant' });
    activar(i);
  }

  function cerrar() {
    if (!feed.isConnected) return;
    feed.remove();
    for (const video of pista.querySelectorAll('video')) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    observador.disconnect();
    pista.replaceChildren();
    actual = -1;
    programar();
  }

  function pasar(pasos) {
    if (!hay(pasos)) return;
    const destino = posicion() + pasos;
    if (!feed.isConnected) {
      abrir(caja.parentElement, destino);
    } else {
      const suave = !matchMedia('(prefers-reduced-motion: reduce)').matches;
      pista.children[destino].scrollIntoView({ behavior: suave ? 'smooth' : 'instant' });
      activar(destino);
    }
    programar();
  }

  // X puede volver a poner en marcha el suyo (al volver a la pestaña, al acabar…)
  document.addEventListener('play', (evento) => {
    if (feed.isConnected && !feed.contains(evento.target)) evento.target.pause();
  }, true);

  // ---- Botones del lateral ----

  const caja = document.createElement('div');
  caja.className = 'bloqueador-videos';
  const anterior = crearBoton('Vídeo anterior (↑)', ICONOS.arriba, () => pasar(-1));
  const siguiente = crearBoton('Vídeo siguiente (↓)', ICONOS.abajo, () => pasar(1));
  const fuentes = document.createElement('div');
  fuentes.className = 'bv-fuentes';
  fuentes.setAttribute('role', 'radiogroup');
  fuentes.setAttribute('aria-label', 'Vídeos de');
  for (const [valor, texto] of Object.entries(FUENTES)) {
    const boton = document.createElement('button');
    boton.dataset.fuente = valor;
    boton.setAttribute('role', 'radio');
    boton.textContent = texto;
    boton.addEventListener('click', () => {
      cerrar();
      fuente = valor;
      elegida = valor;
      chrome.storage.local.set({ [CLAVE_FUENTE]: valor });
      programar();
    });
    fuentes.append(boton);
  }
  caja.append(anterior, siguiente, fuentes);
  // Que lo que se pulsa aquí no llegue al visor de X (lo cerraría)
  for (const propio of [caja, feed]) {
    for (const tipo of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend']) {
      propio.addEventListener(tipo, (e) => e.stopPropagation());
    }
  }

  function poner(elemento, propiedad, valor) {
    if (elemento[propiedad] !== valor) elemento[propiedad] = valor;
  }

  function pintar() {
    const usada = sesion.clave.startsWith('tendencia ') ? sesion.clave.slice('tendencia '.length) : '';
    const consulta = usada || tendencia();
    const [botonPerfil, botonTendencia] = fuentes.children;
    botonPerfil.setAttribute('aria-checked', String(!usada));
    botonTendencia.setAttribute('aria-checked', String(Boolean(usada)));
    poner(botonTendencia, 'disabled', !consulta);
    poner(botonTendencia, 'textContent', busqueda ? 'Búsqueda' : FUENTES.tendencia);
    poner(botonTendencia, 'title', consulta || 'El tuit no tiene hashtags');
    poner(anterior, 'disabled', !hay(-1));
    poner(siguiente, 'disabled', !hay(1));
    poner(siguiente, 'title', hay(1) ? 'Vídeo siguiente (↓)'
      : sesion.agotada ? 'No hay más vídeos'
        : Date.now() < sesion.reintento ? 'X no responde: se reintentará en un momento'
          : 'Cargando…');
  }

  function revisar() {
    pendiente = false;
    const video = activa() ? videoAbierto() : null;
    const dialogo = video && visor();
    if (!dialogo) {
      cerrar();
      caja.remove();
      if (!video) {
        sesion = null;
        elegida = null;
        anotarBusqueda();
      }
      return;
    }
    if (!BloqueadorTwitter.hidratado(dialogo, programar)) return;
    if (!feed.isConnected) abrirSesion(video);
    if (!hay(RESERVA)) cargarMas();
    if (caja.parentElement !== dialogo) dialogo.append(caja);
    pintar();
  }

  function programar() {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(revisar);
  }

  // ---- Rueda y teclado ----

  // La columna con el tuit y las respuestas, al lado del vídeo, tiene su propio
  // scroll; y en los menús y campos tampoco se toca nada
  function enPanel(elemento, dialogo) {
    for (let e = elemento; e && e !== dialogo; e = e.parentElement) {
      const estilo = getComputedStyle(e);
      if (/auto|scroll/.test(estilo.overflowY) && e.scrollHeight > e.clientHeight && e.clientWidth < innerWidth * 0.45) return true;
    }
    return false;
  }

  window.addEventListener('wheel', (evento) => {
    if (!caja.isConnected || evento.ctrlKey || Math.abs(evento.deltaX) > Math.abs(evento.deltaY)) return;
    const dialogo = caja.parentElement;
    if (!dialogo.contains(evento.target) || enPanel(evento.target, dialogo)) return;
    evento.preventDefault();
    evento.stopPropagation();
    if (Date.now() < bloqueadoHasta) return;
    if (Math.sign(evento.deltaY) !== Math.sign(acumulado)) acumulado = 0;
    acumulado += evento.deltaY;
    if (Math.abs(acumulado) < UMBRAL_RUEDA) return;
    const pasos = acumulado > 0 ? 1 : -1;
    acumulado = 0;
    bloqueadoHasta = Date.now() + ESPERA_RUEDA;
    pasar(pasos);
  }, { capture: true, passive: false });

  window.addEventListener('keydown', (evento) => {
    if (!caja.isConnected || evento.ctrlKey || evento.altKey || evento.metaKey || evento.shiftKey) return;
    const abierto = feed.isConnected;
    if (!abierto && evento.target.closest?.('input, textarea, [contenteditable="true"], [role="menu"], [role="slider"]')) return;
    const video = pista.children[actual]?.querySelector('video');
    const acciones = {
      ArrowDown: () => pasar(1),
      ArrowUp: () => pasar(-1),
      ...(abierto && {
        Escape: cerrar,
        ' ': () => alternarPausa(video),
        m: alternarSonido,
        ArrowLeft: () => { video.currentTime -= SALTO; },
        ArrowRight: () => { video.currentTime += SALTO; }
      })
    };
    const accion = acciones[evento.key];
    // Con el reproductor abierto, los atajos de X (me gusta, repostear…) irían a
    // otro tuit: se anulan. Tab e Intro siguen, para moverse por los botones
    if (!accion && (!abierto || ['Tab', 'Enter', 'F5', 'F11', 'F12'].includes(evento.key))) return;
    evento.stopImmediatePropagation();
    if (!accion) return;
    evento.preventDefault();
    if (!evento.repeat || evento.key.startsWith('ArrowL') || evento.key.startsWith('ArrowR')) accion();
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
