/**
 * Bloqueador - Twitter/X: "Tus favoritos" (cuentas de interés)
 * Recuadro en la columna derecha, encima de "Qué está pasando", con el último tuit de las cuentas
 * que elija el usuario.
 *
 * Los tuits se piden a la API GraphQL de X (UserByScreenName y UserTweets) con
 * la sesión del usuario, como hace la propia página. Los IDs de las consultas
 * y el token "Bearer" cambian con cada versión de X, así que se sacan de su
 * script principal (main.*.js) en vez de escribirlos aquí.
 *
 * Las cuentas se guardan en chrome.storage.sync (clave propia, fuera de los
 * ajustes, para que el popup no las pise al guardar) y lo descargado en
 * chrome.storage.local, compartido entre pestañas.
 */
(() => {
  'use strict';

  const CLAVE_CUENTAS = 'cuentasInteres';
  const CLAVE_CACHE = 'cuentasInteresCache';
  // Cada cuánto se vuelve a pedir el último tuit de una cuenta
  const REFRESCO = 5 * 60 * 1000;
  // Tras un error se reintenta antes
  const REINTENTO = 60 * 1000;
  const CONSULTAS = ['UserByScreenName', 'UserTweets', 'UserTweetsAndReplies'];
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

  // Colores de X según su tema, que se reconoce por el fondo del <body>
  const TEMAS = {
    oscuro: { fondo: '#000000', texto: '#e7e9ea', suave: '#71767b', borde: '#2f3336', hover: 'rgba(255, 255, 255, 0.03)' },
    dim: { fondo: '#15202b', texto: '#f7f9f9', suave: '#8b98a5', borde: '#38444d', hover: 'rgba(255, 255, 255, 0.03)' },
    claro: { fondo: '#ffffff', texto: '#0f1419', suave: '#536471', borde: '#eff3f4', hover: 'rgba(0, 0, 0, 0.03)' }
  };

  // Imita los recuadros de la columna derecha ("Qué está pasando")
  const ESTILOS = `
    .bloqueador-cuentas {
      margin-bottom: 16px; border: 1px solid var(--bc-borde); border-radius: 16px;
      overflow: hidden; background: var(--bc-fondo); color: var(--bc-texto);
      font-family: TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 15px; line-height: 20px;
    }
    .bc-titulo { display: flex; align-items: center; justify-content: space-between; padding: 12px 12px 12px 16px; }
    .bloqueador-cuentas h2 { margin: 0; font-size: 20px; line-height: 24px; font-weight: 800; }
    .bc-anadir {
      all: unset; display: grid; place-items: center; width: 34px; height: 34px; margin: -5px 0;
      border-radius: 50%; color: var(--bc-suave); cursor: pointer; transition: background-color 0.2s, color 0.2s;
    }
    .bc-anadir:hover, .bc-anadir:focus-visible, .bc-anadir[aria-expanded="true"] {
      background-color: rgba(29, 155, 240, 0.1); color: rgb(29, 155, 240);
    }
    .bc-anadir svg { width: 20px; height: 20px; fill: currentColor; }
    .bloqueador-cuentas ul { list-style: none; margin: 0; padding: 0; }
    .bloqueador-cuentas li { display: flex; gap: 12px; padding: 12px 16px; cursor: pointer; transition: background-color 0.2s; }
    .bloqueador-cuentas li:hover { background: var(--bc-hover); }
    .bloqueador-cuentas li + li { border-top: 1px solid var(--bc-borde); }
    .bloqueador-cuentas a { color: inherit; text-decoration: none; }
    .bc-avatar { flex: none; width: 40px; height: 40px; border-radius: 50%; background: var(--bc-borde); object-fit: cover; }
    .bc-cuerpo { flex: 1; min-width: 0; }
    .bc-cabecera { display: flex; align-items: center; gap: 4px; min-width: 0; }
    .bc-nombre { font-weight: 700; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .bc-nombre:hover { text-decoration: underline; }
    .bc-dato { color: var(--bc-suave); white-space: nowrap; }
    .bc-usuario { overflow: hidden; text-overflow: ellipsis; flex-shrink: 1; min-width: 0; }
    .bc-quitar {
      all: unset; margin-left: auto; flex: none; display: grid; place-items: center;
      width: 26px; height: 26px; border-radius: 50%; color: var(--bc-suave); cursor: pointer;
    }
    .bloqueador-cuentas:not(.bc-editando) .bc-quitar { display: none; }
    .bc-quitar:hover, .bc-quitar:focus-visible { background: rgba(244, 33, 46, 0.1); color: rgb(244, 33, 46); }
    .bc-quitar svg { width: 16px; height: 16px; fill: currentColor; }
    .bc-contexto { color: var(--bc-suave); font-size: 13px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .bc-filtros { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 16px 12px; }
    .bc-filtros[hidden] { display: none; }
    .bc-filtros button {
      all: unset; padding: 4px 10px; border: 1px solid var(--bc-borde); border-radius: 9999px;
      font-size: 14px; line-height: 18px; font-weight: 600; color: var(--bc-suave); cursor: pointer;
      transition: background-color 0.2s, color 0.2s;
    }
    .bc-filtros button:hover, .bc-filtros button:focus-visible { background: var(--bc-hover); color: var(--bc-texto); }
    .bc-filtros button[aria-checked="true"] { background: var(--bc-texto); border-color: var(--bc-texto); color: var(--bc-fondo); }
    .bc-texto {
      margin: 2px 0 0; white-space: pre-line; overflow-wrap: anywhere;
      display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 4; overflow: hidden;
    }
    .bc-aviso { margin: 2px 0 0; color: var(--bc-suave); }
    .bc-vacio { margin: 0; padding: 0 16px 12px; color: var(--bc-suave); }
    .bc-formulario { padding: 0 16px 12px; }
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
  let api = null;    // promesa de { bearer, ids }
  let filtro = 'todo';
  let actualizando = false;
  let repetir = false;
  let pendiente = false;

  const activa = () => ajustes.activo && ajustes.twitter.cuentasInteres;
  const clave = (usuario) => usuario.toLowerCase();

  function log(...args) {
    if (ajustes.modoRevision) console.log('[Bloqueador:Twitter]', ...args);
  }

  // ---- API de X ----

  function prepararApi() {
    api ??= (async () => {
      const principal = [...document.querySelectorAll('script[src]')]
        .map((s) => s.src)
        .find((src) => /\/main\.\w+\.js$/.test(src));
      if (!principal) throw new Error('no se encuentra el script principal de X');
      const codigo = await (await fetch(principal)).text();
      const bearer = codigo.match(/"(AAAAAAAAAAAAAAAAAAAAA[^"]+)"/)?.[1];
      const ids = {};
      for (const nombre of CONSULTAS) {
        ids[nombre] = codigo.match(new RegExp(`queryId:"([^"]+)",operationName:"${nombre}"`))?.[1];
      }
      if (!bearer || CONSULTAS.some((nombre) => !ids[nombre])) {
        throw new Error('X ha cambiado su script principal: no se encuentran el token o las consultas');
      }
      return { bearer, ids };
    })();
    // Si falla, se vuelve a intentar en la siguiente actualización
    api.catch(() => { api = null; });
    return api;
  }

  async function consultar(nombre, variables) {
    const { bearer, ids } = await prepararApi();
    const csrf = document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/)?.[1];
    if (!csrf) throw new Error('no hay sesión iniciada');
    const url = `${location.origin}/i/api/graphql/${ids[nombre]}/${nombre}`
      + `?variables=${encodeURIComponent(JSON.stringify(variables))}&features=%7B%7D`;
    const respuesta = await fetch(url, {
      credentials: 'include',
      headers: {
        authorization: `Bearer ${bearer}`,
        'x-csrf-token': csrf,
        'x-twitter-auth-type': 'OAuth2Session',
        'x-twitter-active-user': 'yes'
      }
    });
    if (!respuesta.ok) {
      const detalle = (await respuesta.text().catch(() => '')).slice(0, 300);
      throw new Error(`${nombre}: HTTP ${respuesta.status} ${detalle}`);
    }
    const datos = await respuesta.json();
    // GraphQL puede responder 200 con errores y sin datos
    if (!datos.data && datos.errors?.length) {
      throw new Error(`${nombre}: ${datos.errors.map((e) => e.message).join('; ').slice(0, 300)}`);
    }
    return datos;
  }

  async function buscarPerfil(usuario) {
    const datos = await consultar('UserByScreenName', { screen_name: usuario });
    const perfil = datos.data?.user?.result;
    if (!perfil?.rest_id) return null;
    return {
      id: perfil.rest_id,
      usuario: perfil.core?.screen_name ?? perfil.legacy?.screen_name ?? usuario,
      nombre: perfil.core?.name ?? perfil.legacy?.name ?? usuario,
      avatar: (perfil.avatar?.image_url ?? perfil.legacy?.profile_image_url_https ?? '').replace('_normal.', '_bigger.')
    };
  }

  // Los tuits con restricciones vienen envueltos en { tweet: {...} }
  const desenvolver = (resultado) => resultado?.tweet ?? resultado;

  const autorDe = (tweet) => tweet.core?.user_results?.result?.core?.screen_name
    ?? tweet.core?.user_results?.result?.legacy?.screen_name;

  // Texto legible: entidades HTML decodificadas, enlaces t.co cambiados por su
  // dirección visible y sin el enlace de las fotos/vídeos
  function textoDe(tweet) {
    const nota = tweet.note_tweet?.note_tweet_results?.result;
    let texto = nota?.text ?? tweet.legacy.full_text ?? '';
    const enlaces = [...(tweet.legacy.entities?.urls ?? []), ...(nota?.entity_set?.urls ?? [])];
    for (const enlace of enlaces) texto = texto.replaceAll(enlace.url, enlace.display_url ?? enlace.expanded_url);
    const media = tweet.legacy.extended_entities?.media ?? [];
    for (const m of media) texto = texto.replaceAll(m.url, '');
    texto = texto.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();
    if (!texto && media.length) texto = media[0].type === 'photo' ? '[Foto]' : '[Vídeo]';
    return texto;
  }

  const tipoDe = (nodo) => nodo.legacy.retweeted_status_result ? 'retuit'
    : nodo.legacy.in_reply_to_status_id_str ? 'respuesta'
      : 'post';

  function resumir(nodo, tipo) {
    const original = desenvolver(nodo.legacy.retweeted_status_result?.result);
    const tweet = original?.legacy ? original : nodo;
    return {
      id: tweet.legacy.id_str,
      autor: autorDe(tweet) ?? '',
      tipo,
      respondeA: nodo.legacy.in_reply_to_screen_name ?? '',
      texto: textoDe(tweet),
      fecha: Date.parse(nodo.legacy.created_at)
    };
  }

  /**
   * Último post, respuesta y retuit de la cuenta. UserTweets trae posts y
   * retuits; UserTweetsAndReplies añade las respuestas (con los tuits a los
   * que responden, que se descartan por ser de otras cuentas). Se ignora el
   * tuit fijado, que va en su propia instrucción (TimelinePinEntry), y se
   * elige el id más alto de cada tipo porque los hilos vienen agrupados.
   */
  async function buscarUltimos(idUsuario) {
    // Las mismas variables que manda X en cada consulta: una de más puede
    // hacer que la rechace (withCommunity solo existe en UserTweetsAndReplies)
    const variables = { userId: idUsuario, count: 20, includePromotedContent: false, withVoice: true };
    // Si falla una de las dos, se sigue con la otra
    const resultados = await Promise.allSettled([
      consultar('UserTweets', variables),
      consultar('UserTweetsAndReplies', { ...variables, withCommunity: true })
    ]);
    const fallos = resultados.filter((r) => r.status === 'rejected').map((r) => r.reason);
    fallos.forEach((error) => log(`Error al pedir tuits de ${idUsuario}:`, error.message));
    if (fallos.length === resultados.length) throw fallos[0];
    const respuestas = resultados.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    const ultimos = {};
    (function recorrer(nodo) {
      if (!nodo || typeof nodo !== 'object') return;
      if (Array.isArray(nodo)) return nodo.forEach(recorrer);
      const id = nodo.legacy?.id_str;
      if (id && nodo.legacy.user_id_str === idUsuario) {
        const tipo = tipoDe(nodo);
        if (!ultimos[tipo] || BigInt(id) > BigInt(ultimos[tipo].legacy.id_str)) ultimos[tipo] = nodo;
      }
      Object.values(nodo).forEach(recorrer);
    })(respuestas.flatMap((datos) => datos.data?.user?.result?.timeline?.timeline?.instructions ?? [])
      .filter((i) => i.type === 'TimelineAddEntries'));

    return Object.fromEntries(Object.entries(ultimos).map(([tipo, nodo]) => [tipo, resumir(nodo, tipo)]));
  }

  // El más reciente de los tipos que pide el filtro
  function elegir(tweets = {}, filtro) {
    const candidatos = filtro === 'todo' ? Object.values(tweets) : [tweets[filtro]];
    return candidatos.filter(Boolean).sort((a, b) => b.fecha - a.fecha)[0] ?? null;
  }

  // ---- Datos ----

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
    try {
      const perfil = previo?.perfil ?? await buscarPerfil(usuario);
      if (!perfil) return { error: 'La cuenta no existe', actualizado: Date.now() };
      return { perfil, tweets: await buscarUltimos(perfil.id), actualizado: Date.now() };
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

  const caja = document.createElement('aside');
  caja.className = 'bloqueador-cuentas';
  const cabecera = document.createElement('div');
  cabecera.className = 'bc-titulo';
  const titulo = document.createElement('h2');
  titulo.textContent = 'Tus favoritos';
  const botonAnadir = document.createElement('button');
  botonAnadir.className = 'bc-anadir';
  botonAnadir.setAttribute('aria-label', 'Añadir cuenta');
  botonAnadir.setAttribute('aria-expanded', 'false');
  botonAnadir.title = 'Añadir cuenta';
  botonAnadir.append(crearIcono(ICONO_ANADIR));
  cabecera.append(titulo, botonAnadir);
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
  caja.append(cabecera, formulario, filtros, lista, vacio);

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

  // Navega dentro de X sin recargar la página (su router escucha popstate).
  // Con Ctrl/Mayús/botón central se deja al navegador abrir otra pestaña
  function navegar(evento, ruta) {
    if (evento.ctrlKey || evento.metaKey || evento.shiftKey || evento.button !== 0) return;
    evento.preventDefault();
    history.pushState(history.state, '', ruta);
    window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  }

  function crearEnlace(ruta, clase, contenido) {
    const enlace = document.createElement('a');
    enlace.href = ruta;
    enlace.className = clase;
    enlace.append(contenido);
    enlace.addEventListener('click', (evento) => {
      evento.stopPropagation();
      navegar(evento, ruta);
    });
    return enlace;
  }

  function tiempoRelativo(fecha) {
    const minutos = Math.floor((Date.now() - fecha) / 60000);
    if (minutos < 1) return 'ahora';
    if (minutos < 60) return `${minutos} min`;
    if (minutos < 24 * 60) return `${Math.floor(minutos / 60)} h`;
    const opciones = { day: 'numeric', month: 'short' };
    if (new Date(fecha).getFullYear() !== new Date().getFullYear()) opciones.year = 'numeric';
    return new Date(fecha).toLocaleDateString('es', opciones);
  }

  function crearElemento(usuario) {
    const datos = cache[clave(usuario)] ?? {};
    const perfil = datos.perfil ?? { usuario, nombre: usuario, avatar: '' };
    const tweet = elegir(datos.tweets, filtro);
    const rutaPerfil = `/${perfil.usuario}`;

    const elemento = document.createElement('li');
    const avatar = document.createElement('img');
    avatar.className = 'bc-avatar';
    avatar.alt = '';
    if (perfil.avatar) avatar.src = perfil.avatar;

    const filaNombre = document.createElement('div');
    filaNombre.className = 'bc-cabecera';
    const arroba = document.createElement('span');
    arroba.className = 'bc-dato bc-usuario';
    arroba.textContent = `@${perfil.usuario}`;
    filaNombre.append(crearEnlace(rutaPerfil, 'bc-nombre', perfil.nombre), arroba);
    if (tweet) {
      const hora = document.createElement('span');
      hora.className = 'bc-dato';
      hora.textContent = `· ${tiempoRelativo(tweet.fecha)}`;
      hora.title = new Date(tweet.fecha).toLocaleString('es');
      filaNombre.append(hora);
    }
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
    filaNombre.append(quitar);

    const cuerpo = document.createElement('div');
    cuerpo.className = 'bc-cuerpo';
    cuerpo.append(filaNombre);
    if (tweet) {
      const contexto = tweet.tipo === 'retuit' ? `Retuiteó a @${tweet.autor}`
        : tweet.tipo === 'respuesta' && tweet.respondeA ? `En respuesta a @${tweet.respondeA}`
          : '';
      if (contexto) {
        const linea = document.createElement('div');
        linea.className = 'bc-contexto';
        linea.textContent = contexto;
        cuerpo.append(linea);
      }
      const texto = document.createElement('p');
      texto.className = 'bc-texto';
      texto.textContent = tweet.texto;
      cuerpo.append(texto);
    } else {
      const aviso = document.createElement('p');
      aviso.className = 'bc-aviso';
      // Sin `tweets` es que aún no se ha pedido (o viene de una versión anterior)
      aviso.textContent = datos.error ?? (datos.tweets ? SIN_TWEETS[filtro] : 'Cargando…');
      cuerpo.append(aviso);
    }

    elemento.append(crearEnlace(rutaPerfil, '', avatar), cuerpo);
    // Toda la fila abre el tuit, como en las listas de X
    const rutaTweet = tweet && `/${tweet.autor || perfil.usuario}/status/${tweet.id}`;
    elemento.addEventListener('click', (evento) => {
      if (!rutaTweet) return;
      if (evento.ctrlKey || evento.metaKey) window.open(rutaTweet, '_blank');
      else navegar(evento, rutaTweet);
    });
    // Botón central fuera de los enlaces (en ellos ya lo resuelve el navegador)
    elemento.addEventListener('auxclick', (evento) => {
      if (rutaTweet && evento.button === 1 && !evento.target.closest('a, button')) window.open(rutaTweet, '_blank');
    });
    return elemento;
  }

  function pintar() {
    for (const boton of filtros.children) boton.setAttribute('aria-checked', String(boton.dataset.filtro === filtro));
    filtros.hidden = cuentas.length === 0;
    lista.replaceChildren(...cuentas.map(crearElemento));
    vacio.hidden = cuentas.length > 0;
  }

  function aplicarTema() {
    const [r, g, b] = (getComputedStyle(document.body).backgroundColor.match(/\d+/g) ?? [255, 255, 255]).map(Number);
    const tema = r + g + b > 600 ? TEMAS.claro : b > 30 ? TEMAS.dim : TEMAS.oscuro;
    for (const [nombre, valor] of Object.entries(tema)) caja.style.setProperty(`--bc-${nombre}`, valor);
  }

  /**
   * Coloca el recuadro en la columna derecha, justo encima de "Qué está
   * pasando". Si no está (p. ej. en Explorar), al final, antes del pie de
   * página, que siempre está en el DOM aunque se oculte y sirve para encontrar
   * el contenedor de los recuadros. X vuelve a crear la columna al navegar,
   * así que se comprueba en cada cambio del DOM.
   */
  function colocar() {
    pendiente = false;
    if (!activa()) {
      caja.remove();
      return;
    }
    const pie = document.querySelector('[data-testid="sidebarColumn"] nav:has(a[href$="/tos"])')?.parentElement;
    if (!pie) return;
    const tendencias = [...pie.parentElement.children]
      .find((recuadro) => recuadro.querySelector('section [data-testid="trend"]'));
    const siguiente = tendencias ?? pie;
    if (caja.nextElementSibling !== siguiente) siguiente.before(caja);
    aplicarTema();
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
