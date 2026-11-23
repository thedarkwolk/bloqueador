/**
 * Bloqueador - Twitter/X: "Galería"
 * En un perfil, recuadro en la columna derecha con sus últimas fotos y vídeos y
 * un enlace a la pestaña Multimedia. Los datos los pide twitter-datos.js. Solo
 * en la web nueva de X: la clásica ya trae la suya.
 */
(() => {
  'use strict';

  const MAXIMO = 9;
  // Pestañas del perfil en las que sale (en Multimedia sobra)
  const RUTA_PERFIL = /^\/([A-Za-z0-9_]{1,15})(?:\/(?:with_replies|reposts|highlights|articles|subs)?)?$/;

  // Icono: Phosphor Icons v2.1.1 (https://phosphoricons.com), licencia MIT
  const ICONO_VIDEO = 'M240,128a15.74,15.74,0,0,1-7.6,13.51L88.32,229.65a16,16,0,0,1-16.2.3A15.86,15.86,0,0,1,64,216.13V39.87a15.86,15.86,0,0,1,8.12-13.82,16,16,0,0,1,16.2.3L232.4,114.49A15.74,15.74,0,0,1,240,128Z';

  const ESTILOS = `
    .bc-galeria { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; padding: 0 20px; }
    .bc-galeria a { position: relative; aspect-ratio: 1; overflow: hidden; background: var(--bc-borde); }
    .bc-galeria a:first-child { border-top-left-radius: 12px; }
    .bc-galeria a:nth-child(3) { border-top-right-radius: 12px; }
    .bc-galeria a:nth-child(7) { border-bottom-left-radius: 12px; }
    .bc-galeria a:nth-child(9) { border-bottom-right-radius: 12px; }
    .bc-galeria img { width: 100%; height: 100%; object-fit: cover; display: block; transition: filter 0.2s; }
    .bc-galeria a:hover img { filter: brightness(0.8); }
    .bc-difuminar .bc-sensible img { filter: blur(14px); }
    .bc-galeria svg {
      position: absolute; left: 6px; bottom: 6px; width: 16px; height: 16px; fill: #ffffff;
      filter: drop-shadow(0 0 3px rgba(0, 0, 0, 0.8));
    }`;

  const { crearIcono, crearCaja, crearEnlace, crearCarga, colocar } = BloqueadorRecuadro;

  let ajustes = BloqueadorAjustes.POR_DEFECTO;
  let pendiente = false;
  let pintada = null; // lista pintada

  const activa = () => ajustes.activo && ajustes.twitter.galeria && BloqueadorTwitter.esNueva();

  const { caja } = crearCaja('Galería');
  const cuadricula = document.createElement('div');
  cuadricula.className = 'bc-galeria';
  caja.append(cuadricula);

  const galeriaDe = crearCarga('la galería', BloqueadorTwitterDatos.buscarGaleria, programar);

  // Rutas como /home o /explore también encajan en RUTA_PERFIL: un perfil se
  // reconoce además por su enlace "Siguiendo"
  function perfilAbierto() {
    const usuario = location.pathname.match(RUTA_PERFIL)?.[1];
    return usuario && document.querySelector(`main a[href="/${usuario}/following" i]`) ? usuario : null;
  }

  function crearMiniatura({ ruta, imagen, texto, esVideo, sensible }) {
    const img = document.createElement('img');
    img.src = imagen;
    img.alt = texto;
    img.loading = 'lazy';
    const enlace = crearEnlace(ruta, sensible ? 'bc-sensible' : '', img);
    if (esVideo) enlace.append(crearIcono(ICONO_VIDEO));
    return enlace;
  }

  function pintar(usuario, medios) {
    if (pintada === medios) return;
    pintada = medios;
    cuadricula.replaceChildren(...medios.slice(0, MAXIMO).map(crearMiniatura));
    caja.querySelector('.bc-mas')?.remove();
    caja.append(crearEnlace(`/${usuario}/media`, 'bc-mas', 'Ver todo'));
  }

  function revisar() {
    pendiente = false;
    const usuario = activa() ? perfilAbierto() : null;
    const medios = usuario ? galeriaDe(usuario).lista : [];
    if (!medios.length) {
      caja.remove();
      return;
    }
    pintar(usuario, medios);
    cuadricula.classList.toggle('bc-difuminar', ajustes.twitter.galeriaDifuminar);
    colocar(caja, programar);
  }

  function programar() {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(revisar);
  }

  const hoja = document.createElement('style');
  hoja.textContent = ESTILOS;
  document.head.append(hoja);

  BloqueadorAjustes.cargar().then((guardados) => { ajustes = guardados; programar(); });
  BloqueadorAjustes.alCambiar((nuevos) => { ajustes = nuevos; programar(); });

  new MutationObserver(programar).observe(document.body, { childList: true, subtree: true });
})();
