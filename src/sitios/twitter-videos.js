/**
 * Bloqueador - Twitter/X: botón para descargar vídeos
 * twitter-api.js (mundo MAIN) lee las URLs de los MP4 en la API de X y las
 * manda aquí por postMessage. Este script añade un botón de descarga en la
 * cabecera de los tweets con vídeo (donde estaba el icono de Grok) y pide la
 * descarga al service worker (src/fondo.js): los content scripts no pueden
 * usar chrome.downloads.
 */
(() => {
  'use strict';

  const ORIGEN = 'bloqueador-videos';
  const CLASE_BOTON = 'bloqueador-descargar';

  // Iconos: Phosphor Icons v2.1.1 (https://phosphoricons.com), licencia MIT
  const ICONOS = {
    descargar: 'M224,144v64a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V144a8,8,0,0,1,16,0v56H208V144a8,8,0,0,1,16,0Zm-101.66,5.66a8,8,0,0,0,11.32,0l40-40a8,8,0,0,0-11.32-11.32L136,124.69V32a8,8,0,0,0-16,0v92.69L93.66,98.34a8,8,0,0,0-11.32,11.32Z',
    hecho: 'M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z',
    error: 'M236.8,188.09,149.35,36.22h0a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM222.93,203.8a8.5,8.5,0,0,1-7.48,4.2H40.55a8.5,8.5,0,0,1-7.48-4.2,7.59,7.59,0,0,1,0-7.72L120.52,44.21a8.75,8.75,0,0,1,15,0l87.45,151.87A7.59,7.59,0,0,1,222.93,203.8ZM120,144V104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,180Z'
  };

  // Imita los botones de icono de X: ocupa 20x20 en la fila y el círculo de
  // 34px sobresale con márgenes negativos
  const ESTILOS = `
    .${CLASE_BOTON} { display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; }
    .${CLASE_BOTON} button {
      all: unset; box-sizing: border-box; display: grid; place-items: center;
      width: 34px; height: 34px; margin: -7px; border-radius: 50%;
      color: rgb(113, 118, 123); cursor: pointer;
      transition: background-color 0.2s, color 0.2s;
    }
    .${CLASE_BOTON} button:hover, .${CLASE_BOTON} button:focus-visible {
      background-color: rgba(29, 155, 240, 0.1); color: rgb(29, 155, 240);
    }
    .${CLASE_BOTON} button[data-estado="hecho"] { color: rgb(0, 186, 124); }
    .${CLASE_BOTON} button[data-estado="error"] { color: rgb(244, 33, 46); }
    .${CLASE_BOTON} svg { width: 18.75px; height: 18.75px; fill: currentColor; }`;

  const videos = new Map(); // id del tweet -> { id, usuario, urls }
  let ajustes = BloqueadorAjustes.POR_DEFECTO;
  let pendiente = false;

  const activa = () => ajustes.activo && ajustes.twitter.descargarVideos;

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

  function mostrarEstado(boton, estado, error) {
    boton.replaceChildren(crearIcono(ICONOS[estado]));
    boton.dataset.estado = estado;
    boton.title = error ? `No se pudo descargar: ${error}` : 'Descarga iniciada';
    setTimeout(() => {
      boton.replaceChildren(crearIcono(ICONOS.descargar));
      delete boton.dataset.estado;
      boton.title = 'Descargar vídeo';
      boton.disabled = false;
    }, 2500);
  }

  async function descargar(video, boton) {
    boton.disabled = true;
    let respuesta;
    try {
      respuesta = await chrome.runtime.sendMessage({ tipo: 'descargar-video', ...video });
    } catch (e) {
      // Pasa si la extensión se ha recargado y esta pestaña no
      respuesta = { ok: false, error: 'recarga la página' };
    }
    mostrarEstado(boton, respuesta?.ok ? 'hecho' : 'error', respuesta?.error);
  }

  function crearBoton(video) {
    const contenedor = document.createElement('div');
    contenedor.className = CLASE_BOTON;
    contenedor.dataset.id = video.id;
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.title = 'Descargar vídeo';
    boton.setAttribute('aria-label', 'Descargar vídeo');
    boton.append(crearIcono(ICONOS.descargar));
    boton.addEventListener('click', (e) => {
      // Que el clic no abra el tweet
      e.preventDefault();
      e.stopPropagation();
      descargar(video, boton);
    });
    contenedor.append(boton);
    return contenedor;
  }

  // El botón va en la cabecera del tweet, donde estaba el icono de Grok (que
  // twitter.js oculta con CSS pero sigue en la página): se inserta justo antes
  // de su contenedor. Si no hay icono de Grok, antes del botón "···"
  function hueco(articulo) {
    const grok = articulo.querySelector('button:has(svg[viewBox="0 0 33 32"])')?.parentElement;
    if (grok) return grok;
    let e = articulo.querySelector('[data-testid="caret"]');
    while (e?.parentElement && e.parentElement.children.length === 1) e = e.parentElement;
    return e;
  }

  // IDs de los enlaces "/usuario/status/123" del tweet (el propio y, si lo hay, el citado)
  function idsDe(articulo) {
    return [...articulo.querySelectorAll('a[href*="/status/"]')]
      .map((a) => a.getAttribute('href').match(/\/status\/(\d+)/)?.[1])
      .filter(Boolean);
  }

  function revisar() {
    pendiente = false;
    for (const articulo of document.querySelectorAll('article[data-testid="tweet"]')) {
      const ids = idsDe(articulo);
      const existente = articulo.querySelector(`.${CLASE_BOTON}`);
      // X reutiliza los <article> al hacer scroll: si el botón era de otro tweet, fuera
      if (existente && (!activa() || !ids.includes(existente.dataset.id))) existente.remove();
      else if (existente) continue;
      if (!activa() || !articulo.querySelector('[data-testid="videoPlayer"]')) continue;

      const id = ids.find((i) => videos.has(i));
      const siguiente = hueco(articulo);
      if (!id || !siguiente) continue;
      siguiente.before(crearBoton(videos.get(id)));
    }
  }

  function programar() {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(revisar);
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.origen !== ORIGEN || !Array.isArray(e.data.videos)) return;
    for (const video of e.data.videos) videos.set(String(video.id), video);
    programar();
  });
  // twitter-api.js ya lleva un rato recogiendo vídeos: pedirle los que tenga
  window.postMessage({ origen: ORIGEN, pedir: true }, location.origin);

  const hoja = document.createElement('style');
  hoja.textContent = ESTILOS;
  document.head.appendChild(hoja);

  BloqueadorAjustes.cargar().then((guardados) => { ajustes = guardados; programar(); });
  BloqueadorAjustes.alCambiar((nuevos) => { ajustes = nuevos; programar(); });

  new MutationObserver(programar).observe(document.body, { childList: true, subtree: true });
})();
