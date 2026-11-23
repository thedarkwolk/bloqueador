/**
 * Bloqueador - Twitter/X: "Tus favoritos" (cuentas de interés)
 * Recuadro en la columna derecha de Inicio, encima de "Qué está pasando", con
 * el último tuit de las cuentas que elija el usuario.
 *
 * Los tuits se piden a la API de X con la sesión del usuario
 * (twitter-datos.js o, en la web clásica, twitter-datos-clasica.js).
 *
 * Las cuentas se guardan en chrome.storage.sync (clave propia, fuera de los
 * ajustes, para que el popup no las pise al guardar) y lo descargado en
 * chrome.storage.local, compartido entre pestañas.
 */
(() => {
  'use strict';

  const { crearIcono, crearFila, crearCaja } = BloqueadorRecuadro;

  const CLAVE_CUENTAS = 'cuentasInteres';
  const CLAVE_CACHE = 'cuentasInteresCache';
  // Cada cuánto se vuelve a pedir el último tuit de una cuenta
  const REFRESCO = 5 * 60 * 1000;
  // Tras un error se reintenta antes
  const REINTENTO = 60 * 1000;
  // Qué tuit se muestra de cada cuenta (se guarda en chrome.storage.sync)
  const CLAVE_FILTRO = 'cuentasInteresFiltro';
  const FILTROS = { todo: 'Todo', post: 'Posts', respuesta: 'Respuestas', retuit: 'Retuits' };
  const SIN_TWEETS = {
    todo: 'Sin tuits recientes',
    post: 'Sin posts recientes',
    respuesta: 'Sin respuestas recientes',
    retuit: 'Sin retuits recientes'
  };
  const FORMATO_USUARIO = /^[A-Za-z0-9_]{1,15}$/;

  // Lo propio de este recuadro (el resto, en twitter-recuadro.js)
  const ESTILOS = `
    .bc-anadir {
      all: unset; display: grid; place-items: center; width: 34px; height: 34px; margin: -5px 0;
      border-radius: 50%; color: var(--bc-suave); cursor: pointer; transition: background-color 0.2s, color 0.2s;
    }
    .bc-anadir:hover, .bc-anadir:focus-visible, .bc-anadir[aria-expanded="true"] {
      background-color: rgba(29, 155, 240, 0.1); color: rgb(29, 155, 240);
    }
    .bc-anadir svg { width: 20px; height: 20px; fill: currentColor; }
    .bc-quitar {
      all: unset; margin-left: auto; flex: none; display: grid; place-items: center;
      width: 26px; height: 26px; border-radius: 50%; color: var(--bc-suave); cursor: pointer;
    }
    .bloqueador-recuadro:not(.bc-editando) .bc-quitar { display: none; }
    .bc-quitar:hover, .bc-quitar:focus-visible { background: rgba(244, 33, 46, 0.1); color: rgb(244, 33, 46); }
    .bc-quitar svg { width: 16px; height: 16px; fill: currentColor; }
    .bc-filtros { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 20px 12px; }
    .bc-filtros[hidden] { display: none; }
    .bc-filtros button {
      all: unset; padding: 4px 10px; border: 1px solid var(--bc-borde); border-radius: 9999px;
      font-size: 14px; line-height: 18px; font-weight: 600; color: var(--bc-suave); cursor: pointer;
      transition: background-color 0.2s, color 0.2s;
    }
    .bc-filtros button:hover, .bc-filtros button:focus-visible { background: var(--bc-hover); color: var(--bc-texto); }
    .bc-filtros button[aria-checked="true"] { background: var(--bc-texto); border-color: var(--bc-texto); color: var(--bc-fondo); }
    .bc-formulario { padding: 0 20px 12px; }
    .bc-formulario[hidden] { display: none; }
    .bc-formulario input {
      box-sizing: border-box; width: 100%; padding: 8px 14px; border: 1px solid var(--bc-borde); border-radius: 9999px;
      background: transparent; color: inherit; font: inherit; outline: none;
    }
    .bc-formulario input:focus { border-color: rgb(29, 155, 240); }
    .bc-formulario input[aria-invalid="true"] { border-color: rgb(244, 33, 46); }`;

  // Iconos: Phosphor Icons v2.1.1 (https://phosphoricons.com), licencia MIT
  const ICONO_ANADIR = 'M256,136a8,8,0,0,1-8,8H232v16a8,8,0,0,1-16,0V144H200a8,8,0,0,1,0-16h16V112a8,8,0,0,1,16,0v16h16A8,8,0,0,1,256,136Zm-57.87,58.85a8,8,0,0,1-12.26,10.3C165.75,181.19,138.09,168,108,168s-57.75,13.19-77.87,37.15a8,8,0,0,1-12.25-10.3c14.94-17.78,33.52-30.41,54.17-37.17a68,68,0,1,1,71.9,0C164.6,164.44,183.18,177.07,198.13,194.85ZM108,152a52,52,0,1,0-52-52A52.06,52.06,0,0,0,108,152Z';
  const ICONO_QUITAR ='M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z';

  let ajustes = BloqueadorAjustes.POR_DEFECTO;
  let cuentas = [];  // nombres de usuario, en el orden en que se añadieron
  let cache = {};    // usuario en minúsculas -> { perfil, tweet, error, actualizado }
  let filtro = 'todo';
  let actualizando = false;
  let repetir = false;
  let pendiente = false;

  // Solo en Inicio
  const activa = () => ajustes.activo && ajustes.twitter.cuentasInteres && location.pathname === '/home';
  const clave = (usuario) => usuario.toLowerCase();

  function log(...args) {
    if (ajustes.modoRevision) console.log('[Bloqueador:Twitter]', ...args);
  }

  // ---- Datos ----

  // El más reciente de los tipos que pide el filtro
  function elegir(tweets = {}, filtro) {
    const candidatos = filtro === 'todo' ? Object.values(tweets) : [tweets[filtro]];
    return candidatos.filter(Boolean).sort((a, b) => b.fecha - a.fecha)[0] ?? null;
  }

  // Se aplica al momento, sin esperar a storage.onChanged, para que dos
  // cambios seguidos no partan de la misma lista
  function guardarCuentas(nuevas) {
    cuentas = nuevas;
    pintar();
    actualizarCaducadas();
    return chrome.storage.sync.set({ [CLAVE_CUENTAS]: nuevas });
  }

  async function actualizarCuenta(usuario) {
    const previo = cache[clave(usuario)];
    const datos = BloqueadorTwitter.esNueva() ? BloqueadorTwitterDatos : BloqueadorTwitterDatosClasica;
    try {
      // También cada vez: el avatar y el nombre cambian
      const perfil = await datos.buscarPerfil(usuario);
      if (!perfil) return { error: 'La cuenta no existe', actualizado: Date.now() };
      return { perfil, tweets: await datos.buscarUltimos(perfil), actualizado: Date.now() };
    } catch (error) {
      log(`No se ha podido actualizar @${usuario}:`, error.message);
      // Se guarda la hora para no reintentar hasta el siguiente refresco
      return { ...previo, error: 'No se ha podido cargar', actualizado: Date.now() };
    }
  }

  // Pide de nuevo las cuentas cuyo último tuit tiene más de REFRESCO. Una a
  // una, para no lanzar muchas peticiones a la vez
  async function actualizarCaducadas() {
    if (!activa() || document.hidden) return;
    // Si ya hay una pasada en marcha, se repite al acabar (p. ej. al añadir una cuenta)
    if (actualizando) {
      repetir = true;
      return;
    }
    actualizando = true;
    repetir = false;
    try {
      for (const usuario of cuentas) {
        const previo = cache[clave(usuario)];
        // Lo guardado por versiones anteriores (sin `tweets`) se pide de nuevo
        const espera = previo?.error ? REINTENTO : REFRESCO;
        const alDia = previo && (previo.tweets || previo.error) && Date.now() - previo.actualizado < espera;
        if (alDia) continue;
        const nuevo = await actualizarCuenta(usuario);
        if (!cuentas.includes(usuario)) continue; // se quitó mientras se pedía
        // Solo se guardan las cuentas que siguen en la lista
        const siguientes = Object.fromEntries(cuentas.map((u) => [clave(u), cache[clave(u)]]).filter(([, v]) => v));
        siguientes[clave(usuario)] = nuevo;
        await chrome.storage.local.set({ [CLAVE_CACHE]: siguientes });
      }
    } finally {
      actualizando = false;
    }
    if (repetir) actualizarCaducadas();
  }

  // ---- Interfaz ----

  const { caja, cabecera } = crearCaja('Tus favoritos');
  const botonAnadir = document.createElement('button');
  botonAnadir.className = 'bc-anadir';
  botonAnadir.setAttribute('aria-label', 'Añadir cuenta');
  botonAnadir.setAttribute('aria-expanded', 'false');
  botonAnadir.title = 'Añadir cuenta';
  botonAnadir.append(crearIcono(ICONO_ANADIR));
  cabecera.append(botonAnadir);
  // El campo para añadir solo se muestra al pulsar el icono; se envía con Intro
  const formulario = document.createElement('form');
  formulario.className = 'bc-formulario';
  formulario.hidden = true;
  const entrada = document.createElement('input');
  entrada.placeholder = '@usuario y pulsa Intro';
  entrada.setAttribute('aria-label', 'Cuenta que añadir');
  formulario.append(entrada);
  // Filtro: qué tuit de cada cuenta se muestra
  const filtros = document.createElement('div');
  filtros.className = 'bc-filtros';
  filtros.setAttribute('role', 'radiogroup');
  filtros.setAttribute('aria-label', 'Qué mostrar');
  for (const [valor, texto] of Object.entries(FILTROS)) {
    const boton = document.createElement('button');
    boton.dataset.filtro = valor;
    boton.setAttribute('role', 'radio');
    boton.textContent = texto;
    boton.addEventListener('click', () => {
      filtro = valor;
      pintar();
      chrome.storage.sync.set({ [CLAVE_FILTRO]: valor });
    });
    filtros.append(boton);
  }
  const lista = document.createElement('ul');
  const vacio = document.createElement('p');
  vacio.className = 'bc-vacio';
  vacio.textContent = 'Pulsa el icono de arriba para añadir cuentas y ver aquí su último tuit.';
  caja.append(formulario, filtros, lista, vacio);

  // Con el campo abierto se muestran también las "x" para quitar cuentas
  function mostrarFormulario(mostrar) {
    formulario.hidden = !mostrar;
    caja.classList.toggle('bc-editando', mostrar);
    botonAnadir.setAttribute('aria-expanded', String(mostrar));
    entrada.value = '';
    entrada.removeAttribute('aria-invalid');
    if (mostrar) entrada.focus();
  }

  botonAnadir.addEventListener('click', () => mostrarFormulario(formulario.hidden));
  entrada.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') mostrarFormulario(false);
  });
  // Al salir del campo sin haber escrito nada se cierra, salvo si es para
  // pulsar el propio icono (que ya lo cierra) o una "x" (que desaparecería
  // antes de recibir el clic)
  entrada.addEventListener('blur', (evento) => {
    if (!entrada.value.trim() && !evento.relatedTarget?.matches('.bc-anadir, .bc-quitar')) mostrarFormulario(false);
  });

  // Acepta "usuario", "@usuario" o el enlace al perfil
  function normalizar(texto) {
    const limpio = texto.trim().replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, '').replace(/^@/, '').split(/[/?#]/)[0];
    return FORMATO_USUARIO.test(limpio) ? limpio : null;
  }

  formulario.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const usuario = normalizar(entrada.value);
    if (!usuario) {
      entrada.setAttribute('aria-invalid', 'true');
      return;
    }
    mostrarFormulario(false);
    if (!cuentas.some((u) => clave(u) === clave(usuario))) guardarCuentas([...cuentas, usuario]);
  });
  entrada.addEventListener('input', () => entrada.removeAttribute('aria-invalid'));

  function crearElemento(usuario) {
    const datos = cache[clave(usuario)] ?? {};
    const perfil = datos.perfil ?? { usuario, nombre: usuario, avatar: '' };
    const tweet = elegir(datos.tweets, filtro);

    const quitar = document.createElement('button');
    quitar.className = 'bc-quitar';
    quitar.setAttribute('aria-label', `Quitar @${perfil.usuario}`);
    quitar.title = 'Quitar';
    quitar.append(crearIcono(ICONO_QUITAR));
    quitar.addEventListener('click', (evento) => {
      evento.stopPropagation();
      guardarCuentas(cuentas.filter((u) => u !== usuario));
      // Se devuelve el foco al campo para que siga cerrándose al salir de él
      entrada.focus();
    });

    return crearFila({
      perfil,
      tweet,
      contexto: tweet?.tipo === 'retuit' ? `Retuiteó a @${tweet.autor}`
        : tweet?.tipo === 'respuesta' && tweet.respondeA ? `En respuesta a @${tweet.respondeA}`
          : '',
      // Sin `tweets` es que aún no se ha pedido (o viene de una versión anterior)
      aviso: datos.error ?? (datos.tweets ? SIN_TWEETS[filtro] : 'Cargando…'),
      accion: quitar
    });
  }

  function pintar() {
    for (const boton of filtros.children) boton.setAttribute('aria-checked', String(boton.dataset.filtro === filtro));
    filtros.hidden = cuentas.length === 0;
    lista.replaceChildren(...cuentas.map(crearElemento));
    vacio.hidden = cuentas.length > 0;
  }

  function colocar() {
    pendiente = false;
    if (!activa()) {
      caja.remove();
      return;
    }
    // Al volver a Inicio, por si algo ha caducado mientras tanto
    if (!caja.isConnected) actualizarCaducadas();
    BloqueadorRecuadro.colocar(caja, programar, { primera: true });
  }

  function programar() {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(colocar);
  }

  // ---- Arranque ----

  const hoja = document.createElement('style');
  hoja.textContent = ESTILOS;
  document.head.append(hoja);

  chrome.storage.onChanged.addListener((cambios, zona) => {
    if (zona === 'sync' && cambios[CLAVE_CUENTAS]) {
      cuentas = cambios[CLAVE_CUENTAS].newValue ?? [];
      pintar();
      actualizarCaducadas();
    }
    if (zona === 'sync' && cambios[CLAVE_FILTRO]) {
      filtro = cambios[CLAVE_FILTRO].newValue ?? 'todo';
      pintar();
    }
    if (zona === 'local' && cambios[CLAVE_CACHE]) {
      cache = cambios[CLAVE_CACHE].newValue ?? {};
      pintar();
    }
  });
  BloqueadorAjustes.alCambiar((nuevos) => {
    ajustes = nuevos;
    programar();
    actualizarCaducadas();
  });

  Promise.all([
    BloqueadorAjustes.cargar(),
    chrome.storage.sync.get([CLAVE_CUENTAS, CLAVE_FILTRO]),
    chrome.storage.local.get(CLAVE_CACHE)
  ]).then(([guardados, datosSync, datosCache]) => {
    ajustes = guardados;
    cuentas = datosSync[CLAVE_CUENTAS] ?? [];
    filtro = FILTROS[datosSync[CLAVE_FILTRO]] ? datosSync[CLAVE_FILTRO] : 'todo';
    cache = datosCache[CLAVE_CACHE] ?? {};
    pintar();
    programar();
    actualizarCaducadas();
  });

  new MutationObserver(programar).observe(document.body, { childList: true, subtree: true });
  // El intervalo solo pide las cuentas caducadas; con la pestaña oculta no hace nada
  setInterval(actualizarCaducadas, 60 * 1000);
  document.addEventListener('visibilitychange', actualizarCaducadas);
})();
