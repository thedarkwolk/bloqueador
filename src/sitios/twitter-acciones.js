/**
 * Bloqueador - Twitter/X: acciones del tweet
 * - Estadísticas arriba: las estadísticas (visualizaciones) pasan a la cabecera
 *   del tweet, donde estaba el icono de Grok.
 * - En su hueco de la barra de acciones: botón de copiar enlace.
 * - En los tweets con vídeo: botón de descarga, pegado a "Guardar".
 *
 * No se mueven nodos de X (React los volvería a dibujar o se rompería): arriba
 * se pone una copia de las estadísticas que se mantiene al día y la original
 * se oculta.
 *
 * Los vídeos: twitter-api.js (mundo MAIN) lee las URLs de los MP4 en la API de
 * X y las manda aquí por postMessage. La descarga la hace el service worker
 * (src/fondo.js): los content scripts no pueden usar chrome.downloads.
 */
(() => {
  'use strict';

  const ORIGEN = 'bloqueador-videos';
  const ATTR_ID = 'data-bloqueador-id';
  const ATTR_OCULTO = 'data-bloqueador-oculto';

  // Iconos: Phosphor Icons v2.1.1 (https://phosphoricons.com), licencia MIT
  const ICONOS = {
    descargar: 'M224,144v64a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V144a8,8,0,0,1,16,0v56H208V144a8,8,0,0,1,16,0Zm-101.66,5.66a8,8,0,0,0,11.32,0l40-40a8,8,0,0,0-11.32-11.32L136,124.69V32a8,8,0,0,0-16,0v92.69L93.66,98.34a8,8,0,0,0-11.32,11.32Z',
    enlace: 'M165.66,90.34a8,8,0,0,1,0,11.32l-64,64a8,8,0,0,1-11.32-11.32l64-64A8,8,0,0,1,165.66,90.34ZM215.6,40.4a56,56,0,0,0-79.2,0L106.34,70.45a8,8,0,0,0,11.32,11.32l30.06-30a40,40,0,0,1,56.57,56.56l-30.07,30.06a8,8,0,0,0,11.31,11.32L215.6,119.6a56,56,0,0,0,0-79.2ZM138.34,174.22l-30.06,30.06a40,40,0,1,1-56.56-56.57l30.05-30.05a8,8,0,0,0-11.32-11.32L40.4,136.4a56,56,0,0,0,79.2,79.2l30.06-30.07a8,8,0,0,0-11.32-11.31Z',
    hecho: 'M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z',
    error: 'M236.8,188.09,149.35,36.22h0a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM222.93,203.8a8.5,8.5,0,0,1-7.48,4.2H40.55a8.5,8.5,0,0,1-7.48-4.2,7.59,7.59,0,0,1,0-7.72L120.52,44.21a8.75,8.75,0,0,1,15,0l87.45,151.87A7.59,7.59,0,0,1,222.93,203.8ZM120,144V104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,180Z'
  };

  // Los botones imitan los de icono de X: cada uno ocupa 20x20 en la fila y el
  // círculo de 34px sobresale con márgenes negativos. El del enlace ocupa el
  // mismo espacio flexible que tenía el hueco de las estadísticas; el de
  // descarga, lo mismo que "Guardar" (tamaño fijo y 8px a la derecha)
  const ESTILOS = `
    [${ATTR_OCULTO}] { display: none !important; }
    .bloqueador-estadisticas { display: flex; align-items: center; margin-right: 8px; }
    .bloqueador-accion { display: flex; align-items: center; }
    .bloqueador-enlace { flex: 1; }
    .bloqueador-descarga { flex: 0 0 auto; margin-right: 8px; }
    .bloqueador-accion button {
      all: unset; box-sizing: border-box; display: grid; place-items: center;
      width: 34px; height: 34px; margin: -7px; border-radius: 50%;
      color: rgb(113, 118, 123); cursor: pointer;
      transition: background-color 0.2s, color 0.2s;
    }
    .bloqueador-accion button:hover, .bloqueador-accion button:focus-visible {
      background-color: rgba(29, 155, 240, 0.1); color: rgb(29, 155, 240);
    }
    .bloqueador-accion button[data-estado="hecho"] { color: rgb(0, 186, 124); }
    .bloqueador-accion button[data-estado="error"] { color: rgb(244, 33, 46); }
    .bloqueador-accion svg { width: 18.75px; height: 18.75px; fill: currentColor; }`;

  const videos = new Map(); // id del tweet -> { id, usuario, urls }
  let ajustes = BloqueadorAjustes.POR_DEFECTO;
  let pendiente = false;

  const activa = (opcion) => ajustes.activo && ajustes.twitter[opcion];

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

  // Las estadísticas van en la cabecera, pegadas al botón "···" (donde estaba
  // el icono de Grok). Se sube desde "···" hasta el primer elemento que está en
  // una fila flex sin reparto de espacio: insertando justo antes, quedan al
  // lado. Más arriba la fila es space-between y las separaría de "···"
  function huecoCabecera(articulo) {
    for (let e = articulo.querySelector('[data-testid="caret"]'); e?.parentElement && e !== articulo; e = e.parentElement) {
      const fila = getComputedStyle(e.parentElement);
      if (fila.display.includes('flex') && fila.flexDirection === 'row' && !fila.justifyContent.startsWith('space-')) return e;
    }
    return null;
  }

  // Copia de las estadísticas: mismo contenido (clases de X incluidas, así se
  // ve igual) y el clic se reenvía al original para que X navegue como siempre
  function crearCopiaEstadisticas(original, articulo, id) {
    const contenedor = document.createElement('div');
    contenedor.className = 'bloqueador-estadisticas';
    contenedor.setAttribute(ATTR_ID, id);
    const copia = original.cloneNode(true);
    copia.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      articulo.querySelector('[role="group"] a[href*="/analytics"]')?.click();
    });
    contenedor.append(copia);
    return contenedor;
  }

  function revisarTweet(articulo) {
    const barra = articulo.querySelector('[role="group"]');
    const estadisticas = barra?.querySelector('a[href*="/analytics"]');
    // El enlace de estadísticas es "/usuario/status/123/analytics" del propio
    // tweet; sin él, el enlace de la fecha
    const enlace = estadisticas?.getAttribute('href') ?? articulo.querySelector('a[href*="/status/"]:has(time)')?.getAttribute('href') ?? '';
    const [, usuario, id] = enlace.match(/^\/([^/]+)\/status\/(\d+)/) ?? [];

    // X reutiliza los <article> al hacer scroll: fuera lo que sea de otro tweet
    for (const e of articulo.querySelectorAll(`[${ATTR_ID}]`)) {
      if (e.getAttribute(ATTR_ID) !== id) e.remove();
    }
    if (!barra || !id) return;

    // 1. Estadísticas arriba
    const huecoEstadisticas = estadisticas?.closest('[role="group"] > *');
    let copia = articulo.querySelector('.bloqueador-estadisticas');
    if (activa('reordenar') && huecoEstadisticas) {
      if (!copia) {
        const destino = huecoCabecera(articulo);
        if (destino) {
          copia = crearCopiaEstadisticas(estadisticas, articulo, id);
          destino.before(copia);
        }
      } else if (copia.textContent !== estadisticas.textContent) {
        // Las visualizaciones van subiendo
        copia.replaceWith(copia = crearCopiaEstadisticas(estadisticas, articulo, id));
      }
    } else {
      copia?.remove();
      copia = null;
    }
    const movidas = !!copia;
    for (const e of barra.querySelectorAll(`[${ATTR_OCULTO}]`)) {
      if (e !== huecoEstadisticas || !movidas) e.removeAttribute(ATTR_OCULTO);
    }
    if (movidas) huecoEstadisticas.setAttribute(ATTR_OCULTO, '');

    // 2. Copiar enlace, en el hueco de las estadísticas
    const botonEnlace = articulo.querySelector('.bloqueador-enlace');
    if (movidas && !botonEnlace) {
      const url = `https://x.com/${usuario}/status/${id}`;
      huecoEstadisticas.before(crearContenedor('bloqueador-enlace', id,
        crearBoton('Copiar enlace', ICONOS.enlace, (b) => copiarEnlace(url, b))));
    } else if (!movidas) {
      botonEnlace?.remove();
    }

    // 3. Descargar, pegado a "Guardar" (entre Guardar y Compartir)
    const video = activa('descargarVideos') && articulo.querySelector('[data-testid="videoPlayer"]')
      ? [...articulo.querySelectorAll('a[href*="/status/"]')]
        .map((a) => videos.get(a.getAttribute('href').match(/\/status\/(\d+)/)?.[1]))
        .find(Boolean)
      : null;
    let descarga = articulo.querySelector('.bloqueador-descarga');
    if (descarga && descarga.dataset.video !== video?.id) {
      descarga.remove();
      descarga = null;
    }
    const guardar = barra.querySelector('[data-testid="bookmark"], [data-testid="removeBookmark"]')?.closest('[role="group"] > *');
    if (video && !descarga && guardar) {
      descarga = crearContenedor('bloqueador-descarga', id,
        crearBoton('Descargar vídeo', ICONOS.descargar, (b) => descargar(video, b)));
      descarga.dataset.video = video.id;
      guardar.after(descarga);
    }
  }

  function crearContenedor(clase, id, boton) {
    const contenedor = document.createElement('div');
    contenedor.className = `bloqueador-accion ${clase}`;
    contenedor.setAttribute(ATTR_ID, id);
    contenedor.append(boton);
    return contenedor;
  }

  function revisar() {
    pendiente = false;
    for (const articulo of document.querySelectorAll('article[data-testid="tweet"]')) revisarTweet(articulo);
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
