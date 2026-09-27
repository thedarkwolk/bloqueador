/**
 * Bloqueador - Twitter/X: "Qué está pasando" desplegable
 * Al pulsar la cabecera del recuadro de tendencias de la columna derecha se
 * pliega (solo queda el título) o se despliega. Se recuerda entre pestañas y
 * recargas en chrome.storage.local.
 *
 * No se mueven ni se borran nodos de X: se marca la lista con un atributo y la
 * hoja de estilos oculta todo lo que no sea la cabecera. X vuelve a dibujar la
 * columna al navegar, así que se revisa en cada cambio del DOM.
 */
(() => {
  'use strict';

  const CLAVE_PLEGADO = 'tendenciasPlegadas';
  const ATTR_LISTA = 'data-bloqueador-plegable';
  const ATTR_CABECERA = 'data-bloqueador-cabecera';

  // Flecha: Phosphor Icons v2.1.1 (https://phosphoricons.com), licencia MIT
  const ICONO_FLECHA = 'M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z';

  const ESTILOS = `
    [${ATTR_LISTA}="plegada"] > :not([${ATTR_CABECERA}]) { display: none !important; }
    [${ATTR_CABECERA}] { position: relative; cursor: pointer; user-select: none; }
    .bloqueador-plegar {
      all: unset; position: absolute; top: 50%; right: 12px; transform: translateY(-50%);
      display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%;
      color: rgb(113, 118, 123); cursor: pointer; transition: background-color 0.2s, color 0.2s;
    }
    .bloqueador-plegar:hover, .bloqueador-plegar:focus-visible {
      background-color: rgba(29, 155, 240, 0.1); color: rgb(29, 155, 240);
    }
    .bloqueador-plegar svg { width: 18px; height: 18px; fill: currentColor; transition: transform 0.2s; }
    [${ATTR_LISTA}="plegada"] .bloqueador-plegar svg { transform: rotate(-90deg); }`;

  let ajustes = BloqueadorAjustes.POR_DEFECTO;
  let plegado = false;
  let pendiente = false;

  const activa = () => ajustes.activo && ajustes.twitter.tendenciasPlegables;

  function crearBoton() {
    const boton = document.createElement('button');
    boton.className = 'bloqueador-plegar';
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 256 256');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', ICONO_FLECHA);
    svg.append(path);
    boton.append(svg);
    return boton;
  }

  function alternar(evento) {
    evento.preventDefault();
    evento.stopPropagation();
    plegado = !plegado;
    revisar();
    chrome.storage.local.set({ [CLAVE_PLEGADO]: plegado });
  }

  function limpiar() {
    for (const lista of document.querySelectorAll(`[${ATTR_LISTA}]`)) lista.removeAttribute(ATTR_LISTA);
    for (const cabecera of document.querySelectorAll(`[${ATTR_CABECERA}]`)) {
      cabecera.removeAttribute(ATTR_CABECERA);
      cabecera.removeEventListener('click', alternar);
      cabecera.querySelector('.bloqueador-plegar')?.remove();
    }
  }

  function revisar() {
    pendiente = false;
    if (!activa()) {
      limpiar();
      return;
    }
    const seccion = document.querySelector('[data-testid="sidebarColumn"] section:has([data-testid="trend"])');
    const titulo = seccion?.querySelector('h2');
    if (!titulo) return;
    // La lista es el primer antepasado del título que también tiene las
    // tendencias; su hijo con el título es la cabecera
    let lista = titulo.parentElement;
    while (lista !== seccion && !lista.querySelector('[data-testid="trend"]')) lista = lista.parentElement;
    const cabecera = [...lista.children].find((hijo) => hijo.contains(titulo));
    if (!cabecera) return;

    const estado = plegado ? 'plegada' : 'abierta';
    if (lista.getAttribute(ATTR_LISTA) !== estado) lista.setAttribute(ATTR_LISTA, estado);
    if (!cabecera.hasAttribute(ATTR_CABECERA)) {
      cabecera.setAttribute(ATTR_CABECERA, '');
      cabecera.addEventListener('click', alternar);
    }
    let boton = cabecera.querySelector('.bloqueador-plegar');
    if (!boton) {
      boton = crearBoton();
      cabecera.append(boton);
    }
    const etiqueta = plegado ? 'Desplegar' : 'Plegar';
    if (boton.getAttribute('aria-label') !== etiqueta) {
      boton.setAttribute('aria-label', etiqueta);
      boton.setAttribute('aria-expanded', String(!plegado));
      boton.title = etiqueta;
    }
  }

  function programar() {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(revisar);
  }

  const hoja = document.createElement('style');
  hoja.textContent = ESTILOS;
  document.head.append(hoja);

  BloqueadorAjustes.alCambiar((nuevos) => { ajustes = nuevos; programar(); });
  chrome.storage.onChanged.addListener((cambios, zona) => {
    if (zona === 'local' && cambios[CLAVE_PLEGADO]) {
      plegado = Boolean(cambios[CLAVE_PLEGADO].newValue);
      programar();
    }
  });
  Promise.all([BloqueadorAjustes.cargar(), chrome.storage.local.get(CLAVE_PLEGADO)])
    .then(([guardados, datos]) => {
      ajustes = guardados;
      plegado = Boolean(datos[CLAVE_PLEGADO]);
      programar();
    });

  new MutationObserver(programar).observe(document.body, { childList: true, subtree: true });
})();
