/**
 * Bloqueador - Twitter/X: recuadros propios de la columna derecha
 * Lo común de "Tus favoritos" (twitter-cuentas.js), "Citas" (twitter-citas.js) y
 * "Galería" (twitter-galeria.js): aspecto, filas de tuits, carga de datos y
 * dónde se colocan. Imitan los recuadros de X.
 */
globalThis.BloqueadorRecuadro = (() => {
  'use strict';

  // Colores de X según su tema, que se reconoce por el fondo del <body>
  const TEMAS = {
    oscuro: { fondo: '#000000', texto: '#ffffff', suave: '#999999', borde: '#2f3336', hover: 'rgba(255, 255, 255, 0.03)' },
    dim: { fondo: '#15202b', texto: '#f7f9f9', suave: '#8b98a5', borde: '#38444d', hover: 'rgba(255, 255, 255, 0.03)' },
    claro: { fondo: '#ffffff', texto: '#0f1419', suave: '#536471', borde: '#eff3f4', hover: 'rgba(0, 0, 0, 0.03)' }
  };

  const ESTILOS = `
    .bloqueador-recuadro {
      border: 1px solid var(--bc-borde); border-radius: 16px;
      overflow: hidden; background-color: var(--bc-fondo); color: var(--bc-texto);
      font-size: 15px; line-height: 20px;
    }
    .bc-titulo { display: flex; align-items: center; justify-content: space-between; padding: 16px 12px 10px 20px; }
    .bloqueador-recuadro h2 { margin: 0; font-size: 17px; line-height: 20px; font-weight: 500; }
    /* En la web nueva el borde de los recuadros es más suave */
    .bloqueador-recuadro:not(.bloqueador-clasico) { border-color: rgba(128, 128, 128, 0.15); }
    .bloqueador-recuadro.bloqueador-clasico {
      margin-bottom: 16px;
      font-family: TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .bloqueador-clasico h2 { font-size: 20px; line-height: 24px; font-weight: 800; }
    .bloqueador-recuadro ul { list-style: none; margin: 0; padding: 0; }
    .bloqueador-recuadro li { display: flex; gap: 12px; padding: 12px 20px; cursor: pointer; transition: background-color 0.2s; }
    .bloqueador-recuadro li:hover { background: var(--bc-hover); }
    .bloqueador-recuadro li + li { border-top: 1px solid var(--bc-borde); }
    .bloqueador-recuadro a { color: inherit; text-decoration: none; }
    .bc-avatar { flex: none; width: 40px; height: 40px; border-radius: 50%; background: var(--bc-borde); object-fit: cover; }
    .bc-cuerpo { flex: 1; min-width: 0; }
    .bc-cabecera { display: flex; align-items: center; gap: 4px; min-width: 0; }
    .bc-nombre { font-weight: 700; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .bc-nombre:hover { text-decoration: underline; }
    .bc-dato { color: var(--bc-suave); white-space: nowrap; }
    .bc-usuario { overflow: hidden; text-overflow: ellipsis; flex-shrink: 1; min-width: 0; }
    .bc-contexto { color: var(--bc-suave); font-size: 13px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .bc-texto {
      margin: 2px 0 0; white-space: pre-line; overflow-wrap: anywhere;
      display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 4; overflow: hidden;
    }
    .bc-aviso { margin: 2px 0 0; color: var(--bc-suave); }
    .bc-vacio { margin: 0; padding: 0 20px 12px; color: var(--bc-suave); }
    .bc-mas { display: block; padding: 12px 20px; color: rgb(29, 155, 240) !important; font-size: 14px; }
    .bc-mas:hover { background: var(--bc-hover); }`;

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

  // Navega dentro de X sin recargar la página. Con Ctrl/Mayús/botón central se
  // deja al navegador abrir otra pestaña
  function navegar(evento, ruta) {
    if (evento.ctrlKey || evento.metaKey || evento.shiftKey || evento.button !== 0) return;
    evento.preventDefault();
    BloqueadorTwitter.navegar(ruta);
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

  /**
   * Fila de un tuit, como en las listas de X: toda ella lo abre. `contexto` es
   * una línea sobre el texto; `aviso`, lo que se enseña si no hay tuit.
   */
  function crearFila({ perfil, tweet, contexto = '', aviso = '', accion = null }) {
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
    if (accion) filaNombre.append(accion);

    const cuerpo = document.createElement('div');
    cuerpo.className = 'bc-cuerpo';
    cuerpo.append(filaNombre);
    if (tweet && contexto) {
      const linea = document.createElement('div');
      linea.className = 'bc-contexto';
      linea.textContent = contexto;
      cuerpo.append(linea);
    }
    const texto = document.createElement('p');
    texto.className = tweet ? 'bc-texto' : 'bc-aviso';
    texto.textContent = tweet ? tweet.texto : aviso;
    cuerpo.append(texto);

    elemento.append(crearEnlace(rutaPerfil, '', avatar), cuerpo);
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

  function crearCaja(textoTitulo) {
    const caja = document.createElement('section');
    caja.className = 'bloqueador-recuadro';
    const cabecera = document.createElement('div');
    cabecera.className = 'bc-titulo';
    const titulo = document.createElement('h2');
    titulo.textContent = textoTitulo;
    cabecera.append(titulo);
    caja.append(cabecera);
    return { caja, cabecera };
  }

  function aplicarTema(caja) {
    const [r, g, b] = (getComputedStyle(document.body).backgroundColor.match(/\d+/g) ?? [255, 255, 255]).map(Number);
    const tema = r + g + b > 600 ? TEMAS.claro : b > 30 ? TEMAS.dim : TEMAS.oscuro;
    for (const [nombre, valor] of Object.entries(tema)) caja.style.setProperty(`--bc-${nombre}`, valor);
  }

  // Las clases y colores de los recuadros de X (en la nueva, fondo degradado)
  function vestir(caja) {
    const nueva = BloqueadorTwitter.esNueva();
    const modelo = nueva
      ? [...document.querySelectorAll('aside section')].find((e) => !e.matches('.bloqueador-recuadro') && !e.parentElement.closest('section'))
      : null;
    const clases = [
      nueva ? modelo?.className : 'bloqueador-clasico',
      'bloqueador-recuadro',
      caja.classList.contains('bc-editando') && 'bc-editando'
    ].filter(Boolean).join(' ');
    if (caja.className !== clases) caja.className = clases;
    aplicarTema(caja);
  }

  /**
   * Coloca una caja en la columna derecha, justo encima de "Qué está pasando".
   * Si no está (p. ej. en Explorar), al final, antes del pie de página, que
   * siempre está en el DOM aunque se oculte y sirve para encontrar el contenedor
   * de los recuadros. Con `primera`, por encima de las demás cajas propias. X
   * vuelve a crear la columna al navegar, así que hay que llamarla en cada
   * cambio del DOM (`reintentar`, por si React aún no ha hidratado la columna).
   */
  function colocar(caja, reintentar, { primera = false } = {}) {
    const nueva = BloqueadorTwitter.esNueva();
    // En la web clásica, el pie y los recuadros van dentro de un <div> cada uno
    const pie = nueva
      ? document.querySelector('aside nav:has(a[href$="/tos"])')
      : document.querySelector('[data-testid="sidebarColumn"] nav:has(a[href$="/tos"])')?.parentElement;
    if (!pie || !BloqueadorTwitter.hidratado(pie, reintentar)) return;
    const hermanos = [...pie.parentElement.children].filter((e) => e !== caja);
    const siguiente = (primera && hermanos.find((e) => e.matches('.bloqueador-recuadro')))
      || hermanos.find((e) => e.querySelector('[data-href*="trend_click"], section [data-testid="trend"]'))
      || pie;
    if (caja.nextElementSibling !== siguiente) siguiente.before(caja);
    vestir(caja);
  }

  // Cada cuánto se vuelven a pedir los datos de un recuadro y, tras un error, cuándo se reintenta
  const VIGENCIA = 5 * 60 * 1000;
  const REINTENTO = 60 * 1000;

  /**
   * Listas que se piden a X según la página (por id de tuit, por usuario…).
   * `pedir(clave)` da la promesa de la lista; `alCargar` se llama cuando llega.
   * Devuelve una función que da { lista, estado } de una clave y la pide si hace
   * falta. El estado es 'cargando', 'lista' o 'error'; si ya había datos y se
   * están renovando (o falla al renovarlos), sigue en 'lista'.
   */
  function crearCarga(nombre, pedir, alCargar) {
    const datos = new Map(); // clave -> { lista, estado, pidiendo, caduca }
    return (clave) => {
      const previo = datos.get(clave) ?? { lista: [], estado: 'cargando', caduca: 0 };
      if (document.hidden || previo.pidiendo || Date.now() < previo.caduca) return previo;
      const pidiendo = { ...previo, pidiendo: true };
      datos.set(clave, pidiendo);
      pedir(clave).then(
        (lista) => datos.set(clave, { lista, estado: 'lista', caduca: Date.now() + VIGENCIA }),
        (error) => {
          console.debug('[Bloqueador:Twitter]', `No se ha podido cargar ${nombre}:`, error.message);
          const estado = previo.estado === 'lista' ? 'lista' : 'error';
          datos.set(clave, { lista: previo.lista, estado, caduca: Date.now() + REINTENTO });
        }
      ).then(alCargar);
      return pidiendo;
    };
  }

  const hoja = document.createElement('style');
  hoja.textContent = ESTILOS;
  document.head.append(hoja);

  return { crearIcono, crearEnlace, crearFila, crearCaja, crearCarga, colocar };
})();
