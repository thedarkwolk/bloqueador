/**
 * Bloqueador - Twitter/X: acceso a la página (mundo MAIN)
 * Corre en el contexto de la propia página (world: "MAIN") porque desde el
 * mundo aislado no se ve ni React ni el router de X. Hace estas cosas, que piden
 * los content scripts a través de twitter-comun.js:
 * - Decir si React ya ha hidratado un elemento. X manda la página ya dibujada
 *   desde el servidor, y si se inserta algo antes de que React la haga suya,
 *   la vuelve a dibujar entera.
 * - Dar los MP4 de un tweet. X reproduce los vídeos desde blob: (HLS), así que
 *   el MP4 no está en la página: se lee del almacén de Relay, donde X guarda
 *   todos los tweets que ha cargado.
 * - Dar los datos de un tuit que X ya tiene cargado, y mandar un me gusta o un
 *   repost con el código de la propia X (para el visor).
 * - No dejar que X reproduzca sus vídeos con el visor propio abierto.
 * - Navegar sin recargar: el router de X envuelve history.pushState y solo se
 *   entera si se llama a la suya (el de la web clásica, con un popstate).
 * No tiene acceso a chrome.* ni a los ajustes.
 */
(() => {
  'use strict';

  const ORIGEN = 'bloqueador-x';
  const EVENTO_HIDRATADO = 'bloqueador-hidratado';

  function fibraDe(elemento) {
    const clave = Object.keys(elemento).find((k) => k.startsWith('__reactFiber$'));
    return clave && elemento[clave];
  }

  // ---- Almacén de Relay ----

  let entorno = null;

  // El entorno de Relay está en el contexto de React, por encima de los tweets
  function buscarEntorno() {
    for (const elemento of document.querySelectorAll('article, main, aside')) {
      for (let fibra = fibraDe(elemento); fibra; fibra = fibra.return) {
        const valor = fibra.memoizedProps?.value;
        const candidato = valor?.environment ?? valor;
        if (typeof candidato?.getStore === 'function') return candidato;
      }
    }
    return null;
  }

  function videosDe(id) {
    const fuente = entorno.getStore().getSource();
    const uno = (campo) => (campo?.__ref ? fuente.get(campo.__ref) : null);
    const varios = (campo) => (campo?.__refs ?? []).map((ref) => fuente.get(ref)).filter(Boolean);

    // Los registros van por el id global de GraphQL, que es "Tweet:<id>" en base64
    const tweet = fuente.get(btoa(`Tweet:${id}`));
    const urls = varios(tweet?.media_entities2)
      .filter((media) => media.type === 'video' || media.type === 'animated_gif')
      .map((media) => varios(uno(media.video_info)?.variants)
        .filter((v) => v.content_type === 'video/mp4' && v.url)
        .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0]?.url)
      .filter(Boolean);
    if (!urls.length) return null;
    const autor = uno(uno(uno(tweet.core)?.user_results)?.result);
    return { id, usuario: uno(autor?.core)?.screen_name ?? '', urls };
  }

  // Registro del almacén con lo que cuelga de él, con la misma forma que en las
  // respuestas de la API. Se salta lo que no hace falta para no recorrerlo entero
  const SIN_USO = /^(__|\$|grok_|quoted_|reply_to_|birdwatch|community|card$|article|jetfuel|edit_|unmention|previous_|quick_)/;

  function leerRegistro(fuente, id, niveles) {
    const registro = fuente.get(id);
    if (!registro || niveles < 0) return null;
    const leido = {};
    for (const [campo, valor] of Object.entries(registro)) {
      if (SIN_USO.test(campo)) continue;
      // Sin los argumentos que Relay añade al nombre: "campo(arg:1)"
      const nombre = campo.split('(')[0];
      leido[nombre] = valor?.__ref ? leerRegistro(fuente, valor.__ref, niveles - 1)
        : valor?.__refs ? valor.__refs.map((ref) => leerRegistro(fuente, ref, niveles - 1)).filter(Boolean)
          : valor;
    }
    return leido;
  }

  function leerTuit(id) {
    entorno ??= buscarEntorno();
    if (!entorno) return null;
    try {
      const tuit = leerRegistro(entorno.getStore().getSource(), btoa(`Tweet:${id}`), 6);
      // Por el mensaje solo pasan datos simples
      return tuit && JSON.parse(JSON.stringify(tuit));
    } catch {
      return null; // X ha cambiado el formato del almacén
    }
  }

  // ---- Me gusta y repost ----

  // Las únicas operaciones que se mandan, y cómo dejan el tuit en el almacén
  const OPERACIONES = {
    FavoriteTweet: { campo: 'favorited', cuenta: 'favorite_count', valor: true },
    likeButtonControlUnfavoriteMutation: { campo: 'favorited', cuenta: 'favorite_count', valor: false },
    CreateRetweet: { campo: 'retweeted', cuenta: 'retweet_count', valor: true },
    retweetButtonUnretweetMutation: { campo: 'retweeted', cuenta: 'retweet_count', valor: false }
  };

  // Se manda por la red de Relay de la propia X, con la sesión y las cabeceras
  // que ella pone, como cuando se pulsa su botón
  function ejecutar({ nombre, id, tuit }) {
    const operacion = OPERACIONES[nombre];
    entorno ??= buscarEntorno();
    if (!operacion || !entorno || !/^[\w-]+$/.test(id) || !/^\d+$/.test(tuit)) return Promise.reject(new Error('operación no válida'));
    const parametros = { id, metadata: {}, name: nombre, operationKind: 'mutation', text: null };
    const variables = { tweetId: tuit, ...(nombre !== 'retweetButtonUnretweetMutation' && { engagementRequest: null }) };
    return new Promise((hecho, fallo) => {
      entorno.getNetwork().execute(parametros, variables, { force: true }).subscribe({
        next: (respuesta) => {
          if (respuesta?.errors?.length && !respuesta.data) fallo(new Error(respuesta.errors[0].message));
          else hecho();
        },
        error: fallo,
        complete: hecho
      });
    }).then(() => {
      // Para que el resto de la página lo enseñe
      entorno.commitUpdate((almacen) => {
        const registro = almacen.get(btoa(`Tweet:${tuit}`));
        const estado = registro?.getLinkedRecord('perspective');
        if (!estado || Boolean(estado.getValue(operacion.campo)) === operacion.valor) return;
        estado.setValue(operacion.valor, operacion.campo);
        const cuentas = registro.getLinkedRecord('counts');
        cuentas?.setValue((cuentas.getValue(operacion.cuenta) ?? 0) + (operacion.valor ? 1 : -1), operacion.cuenta);
      });
    });
  }

  function buscarVideos(ids) {
    entorno ??= buscarEntorno();
    if (!entorno) return [];
    return ids.map((id) => {
      try {
        return videosDe(id);
      } catch {
        return null; // X ha cambiado el formato del almacén
      }
    }).filter(Boolean);
  }

  // ---- Vídeos de X ----

  // Con el visor propio abierto, X sigue intentando reproducir el vídeo que
  // tiene debajo (decenas de veces por segundo si se le para)
  const reproducir = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (document.documentElement.hasAttribute('data-bloqueador-visor') && !this.closest('.bloqueador-visor')) {
      return Promise.resolve();
    }
    return reproducir.call(this);
  };

  // ---- Peticiones de los content scripts ----

  // Los eventos del DOM llegan a los dos mundos y se reparten al momento:
  // cancelar el evento es la respuesta "sí, hidratado"
  document.addEventListener(EVENTO_HIDRATADO, (e) => {
    if (fibraDe(e.target)) e.preventDefault();
  }, true);

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.origen !== ORIGEN) return;
    const { pedirVideos, navegar, pedirTuit, ejecutar: orden, turno } = e.data;
    if (Array.isArray(pedirVideos)) {
      const videos = buscarVideos(pedirVideos.filter((id) => /^\d+$/.test(id)));
      if (videos.length) window.postMessage({ origen: ORIGEN, videos }, location.origin);
    }
    const responder = (datos) => window.postMessage({ origen: ORIGEN, respuesta: turno, ...datos }, location.origin);
    if (typeof pedirTuit === 'string' && /^\d+$/.test(pedirTuit)) responder({ tuit: leerTuit(pedirTuit) });
    if (orden) ejecutar(orden).then(() => responder({}), (error) => responder({ error: String(error?.message ?? error) }));
    // Solo rutas de la propia X ("//otro.sitio" sería otro dominio)
    if (typeof navegar === 'string' && /^\/(?!\/)/.test(navegar)) {
      if (document.querySelector('script[src*="/entry-client"]')) {
        history.pushState({}, '', navegar);
      } else {
        history.pushState(history.state, '', navegar);
        window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
      }
    }
  });
})();
