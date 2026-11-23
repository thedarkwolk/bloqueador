/**
 * Bloqueador - Twitter/X: acciones del tweet
 * Botones en la cabecera del tweet, pegados a los tres puntos (donde estaba el
 * icono de Grok):
 * - Copiar enlace.
 * - Descargar, en los tweets con vídeo.
 *
 * No se mueven nodos de X (React los volvería a dibujar o se rompería): solo se
 * insertan los propios.
 *
 * Los vídeos: twitter-api.js (mundo MAIN; en la web clásica,
 * twitter-api-clasica.js) saca las URLs de los MP4 de los datos de X y las manda aquí por postMessage. La descarga la hace el
 * service worker (src/fondo.js): los content scripts no pueden usar
 * chrome.downloads.
 */
(() => {
  'use strict';

  const ATTR_ID = 'data-bloqueador-id';

  // Iconos: Phosphor Icons v2.1.1 (https://phosphoricons.com), licencia MIT
  const ICONOS = {
    descargar: 'M224,144v64a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V144a8,8,0,0,1,16,0v56H208V144a8,8,0,0,1,16,0Zm-101.66,5.66a8,8,0,0,0,11.32,0l40-40a8,8,0,0,0-11.32-11.32L136,124.69V32a8,8,0,0,0-16,0v92.69L93.66,98.34a8,8,0,0,0-11.32,11.32Z',
    enlace: 'M165.66,90.34a8,8,0,0,1,0,11.32l-64,64a8,8,0,0,1-11.32-11.32l64-64A8,8,0,0,1,165.66,90.34ZM215.6,40.4a56,56,0,0,0-79.2,0L106.34,70.45a8,8,0,0,0,11.32,11.32l30.06-30a40,40,0,0,1,56.57,56.56l-30.07,30.06a8,8,0,0,0,11.31,11.32L215.6,119.6a56,56,0,0,0,0-79.2ZM138.34,174.22l-30.06,30.06a40,40,0,1,1-56.56-56.57l30.05-30.05a8,8,0,0,0-11.32-11.32L40.4,136.4a56,56,0,0,0,79.2,79.2l30.06-30.07a8,8,0,0,0-11.32-11.31Z',
    hecho: 'M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z',
    error: 'M236.8,188.09,149.35,36.22h0a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM222.93,203.8a8.5,8.5,0,0,1-7.48,4.2H40.55a8.5,8.5,0,0,1-7.48-4.2,7.59,7.59,0,0,1,0-7.72L120.52,44.21a8.75,8.75,0,0,1,15,0l87.45,151.87A7.59,7.59,0,0,1,222.93,203.8ZM120,144V104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,180Z'
  };

  // Los botones imitan el de los tres puntos: círculo (algo menor, de 28px,
  // para que queden juntos) que sobresale de la línea con márgenes negativos.
  // En la web clásica el icono es algo más grande. El color lo da la clase text-secondary de X
  const ESTILOS = `
    .bloqueador-accion { display: flex; align-items: center; flex: none; }
    .bloqueador-accion button {
      all: unset; box-sizing: border-box; display: grid; place-items: center;
      width: 28px; height: 28px; margin: -6px 0; border-radius: 50%;
      color: inherit; cursor: pointer; transition: background-color 0.2s, color 0.2s;
    }
    .bloqueador-accion svg { width: 16px; height: 16px; fill: currentColor; }
    .bloqueador-accion button:hover, .bloqueador-accion button:focus-visible {
      background-color: rgba(29, 155, 240, 0.1); color: rgb(29, 155, 240);
    }
    .bloqueador-accion button[data-estado="hecho"] { color: rgb(0, 186, 124); }
    .bloqueador-accion button[data-estado="error"] { color: rgb(244, 33, 46); }
    .bloqueador-accion.bloqueador-clasico { color: rgb(113, 118, 123); margin-right: 4px; }
    /* Sin la separación entre elementos de la fila (4px en la nueva) */
    .bloqueador-enlace:has(+ .bloqueador-descarga) { margin-right: -4px; }
    .bloqueador-clasico.bloqueador-enlace:has(+ .bloqueador-descarga) { margin-right: 0; }
    .bloqueador-clasico svg { width: 18.75px; height: 18.75px; }`;

  // Cada cuánto se vuelve a pedir un vídeo que X aún no tenía cargado
  const REINTENTO_VIDEO = 2000;

  const videos = new Map(); // id del tweet -> { id, usuario, urls }
  const pedidos = new Map(); // id del tweet -> cuándo se pidió su vídeo
  let ajustes = BloqueadorAjustes.POR_DEFECTO;
  let pendiente = false;

  const activa = (opcion) => ajustes.activo && ajustes.twitter[opcion];

  // text-secondary es de X: da el color del tema
  const claseWeb = () => (BloqueadorTwitter.esNueva() ? 'text-secondary' : 'bloqueador-clasico');

  function crearIcono(d) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 256 256');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.append(path);
    return svg;
  }

  // Icono verde (hecho) o rojo (error) durante un momento
  function mostrarEstado(boton, icono, estado, titulo) {
    const tituloOriginal = boton.getAttribute('aria-label');
    boton.replaceChildren(crearIcono(ICONOS[estado]));
    boton.dataset.estado = estado;
    boton.title = titulo;
    setTimeout(() => {
      boton.replaceChildren(crearIcono(icono));
      delete boton.dataset.estado;
      boton.title = tituloOriginal;
      boton.disabled = false;
    }, 2500);
  }

  function crearBoton(etiqueta, icono, accion) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.title = etiqueta;
    boton.setAttribute('aria-label', etiqueta);
    boton.append(crearIcono(icono));
    boton.addEventListener('click', (e) => {
      // Que el clic no abra el tweet
      e.preventDefault();
      e.stopPropagation();
      accion(boton);
    });
    return boton;
  }

  async function descargar(video, boton) {
    boton.disabled = true;
    let respuesta;
    try {
      respuesta = await chrome.runtime.sendMessage({ tipo: 'descargar-video', ...video });
    } catch {
      // Pasa si la extensión se ha recargado y esta pestaña no
      respuesta = { ok: false, error: 'recarga la página' };
    }
    if (respuesta?.ok) mostrarEstado(boton, ICONOS.descargar, 'hecho', 'Descarga iniciada');
    else mostrarEstado(boton, ICONOS.descargar, 'error', `No se pudo descargar: ${respuesta?.error}`);
  }

  async function copiarEnlace(url, boton) {
    try {
      await navigator.clipboard.writeText(url);
      mostrarEstado(boton, ICONOS.enlace, 'hecho', 'Enlace copiado');
    } catch {
      mostrarEstado(boton, ICONOS.enlace, 'error', 'No se pudo copiar el enlace');
    }
  }

  // Los botones van en la cabecera, pegados a los tres puntos: es el único menú
  // del tweet fuera de la barra de acciones. Se sube desde él hasta el primer
  // elemento que está en una fila flex sin reparto de espacio: insertando justo
  // antes, quedan al lado. Más arriba la fila es space-between y los separaría
  function huecoCabecera(articulo, barra) {
    // En la clásica puede tardar en aparecer: si no está, se espera a otra pasada
    // (el siguiente menú de la página del tweet es el de ordenar respuestas)
    const menu = BloqueadorTwitter.esNueva()
      ? [...articulo.querySelectorAll('button[aria-haspopup="menu"]')]
        .find((boton) => boton.closest('article') === articulo && !barra.contains(boton))
      : articulo.querySelector('[data-testid="caret"]');
    for (let e = menu; e?.parentElement && e !== articulo; e = e.parentElement) {
      const fila = getComputedStyle(e.parentElement);
      if (fila.display.includes('flex') && fila.flexDirection === 'row' && !fila.justifyContent.startsWith('space-')) return e;
    }
    return null;
  }

  // Responder, repostear, me gusta…
  function buscarBarra(articulo) {
    return [...articulo.querySelectorAll('[role="group"]')]
      .find((grupo) => grupo.closest('article') === articulo && grupo.querySelector('[data-engagement-action], [data-testid="reply"]'));
  }

  // "/usuario/status/123" del propio tweet. En las listas lo lleva su recuadro;
  // en la página del tweet (y en la web clásica), el enlace de la fecha o el de
  // las estadísticas
  function rutaTweet(articulo) {
    const recuadro = articulo.closest('[data-href*="/status/"]');
    if (recuadro) return recuadro.dataset.href;
    return [...articulo.querySelectorAll('a[href*="/status/"]')]
      .find((a) => a.closest('article') === articulo && /^\/[^/]+\/status\/\d+(\/analytics)?$/.test(a.getAttribute('href')))
      ?.getAttribute('href') ?? '';
  }

  // Vídeo del tweet o, si no tiene, del que cita. Si X lo tiene cargado pero
  // aún no se ha pedido, se pide y llegará en otra pasada
  function buscarVideo(articulo, id) {
    if (!articulo.querySelector('video, [data-testid="videoPlayer"]')) return null;
    const enlaces = [...articulo.querySelectorAll('a[href*="/status/"]')]
      .map((a) => a.getAttribute('href').match(/\/status\/(\d+)/)?.[1]);
    const ids = [...new Set([id, ...enlaces.filter(Boolean)])];
    const encontrado = ids.map((i) => videos.get(i)).find(Boolean);
    if (encontrado) return encontrado;
    const ahora = Date.now();
    const pendientes = ids.filter((i) => ahora - (pedidos.get(i) ?? 0) > REINTENTO_VIDEO);
    if (pendientes.length) {
      for (const i of pendientes) pedidos.set(i, ahora);
      BloqueadorTwitter.pedirVideos(pendientes);
    }
    return null;
  }

  function revisarTweet(articulo) {
    if (!BloqueadorTwitter.hidratado(articulo, programar)) return;
    const barra = buscarBarra(articulo);
    const [, usuario, id] = rutaTweet(articulo).match(/^\/([^/]+)\/status\/(\d+)/) ?? [];

    // Por si X reutiliza el <article>: fuera lo que sea de otro tweet
    for (const e of articulo.querySelectorAll(`[${ATTR_ID}]`)) {
      if (e.getAttribute(ATTR_ID) !== id) e.remove();
    }
    if (!barra || !id) return;

    const enlace = articulo.querySelector('.bloqueador-enlace');
    if (!activa('copiarEnlace')) {
      enlace?.remove();
    } else if (!enlace) {
      const url = `https://x.com/${usuario}/status/${id}`;
      huecoCabecera(articulo, barra)?.before(crearContenedor('bloqueador-enlace', id,
        crearBoton('Copiar enlace', ICONOS.enlace, (b) => copiarEnlace(url, b))));
    }

    const video = activa('descargarVideos') ? buscarVideo(articulo, id) : null;
    let descarga = articulo.querySelector('.bloqueador-descarga');
    if (descarga && descarga.dataset.video !== video?.id) {
      descarga.remove();
      descarga = null;
    }
    if (video && !descarga) {
      descarga = crearContenedor('bloqueador-descarga', id,
        crearBoton('Descargar vídeo', ICONOS.descargar, (b) => descargar(video, b)));
      descarga.dataset.video = video.id;
      huecoCabecera(articulo, barra)?.before(descarga);
    }
  }

  function crearContenedor(clase, id, boton) {
    const contenedor = document.createElement('div');
    contenedor.className = `bloqueador-accion ${clase} ${claseWeb()}`;
    contenedor.setAttribute(ATTR_ID, id);
    contenedor.append(boton);
    return contenedor;
  }

  function revisar() {
    pendiente = false;
    for (const articulo of BloqueadorTwitter.tweets()) revisarTweet(articulo);
  }

  function programar() {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(revisar);
  }

  BloqueadorTwitter.alRecibirVideos((recibidos) => {
    for (const video of recibidos) videos.set(String(video.id), video);
    programar();
  });

  const hoja = document.createElement('style');
  hoja.textContent = ESTILOS;
  document.head.appendChild(hoja);

  BloqueadorAjustes.cargar().then((guardados) => { ajustes = guardados; programar(); });
  BloqueadorAjustes.alCambiar((nuevos) => { ajustes = nuevos; programar(); });

  new MutationObserver(programar).observe(document.body, { childList: true, subtree: true });
})();
