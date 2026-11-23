/**
 * Bloqueador - Twitter/X: datos de las cuentas (web nueva)
 * Pide el perfil y los últimos tuits de una cuenta a la API GraphQL de X
 * (UserByScreenName y las pestañas Posts, Respuestas y Reposts del perfil) con
 * la sesión del usuario, como hace la propia página. Los IDs de las consultas,
 * sus variables y el token "Bearer" cambian con cada versión de X, así que se
 * sacan de sus scripts en vez de escribirlos aquí.
 * También las citas de un tuit (SearchByRawQuery, la de la página de citas) y
 * las fotos y vídeos de una cuenta (pestaña Multimedia).
 * Lo usan twitter-cuentas.js (twitter-datos-clasica.js es lo mismo para la web
 * anterior) y twitter-galeria.js y twitter-citas.js (esta en las dos webs: en
 * la clásica tira de los IDs guardados la última vez que se abrió la nueva).
 */
globalThis.BloqueadorTwitterDatos = (() => {
  'use strict';

  const API = 'https://api.x.com/graphql';
  // Lo sacado de los scripts de X, para no releerlos en cada carga (chrome.storage.local)
  const CLAVE_API = 'cuentasInteresApi';
  // Consultas que cargan scripts propios y ruta de X que los carga: las pestañas
  // del perfil y la página de citas
  const RUTAS = {
    UserOriginalsTimeline: '/$username/_profile/',
    UserRepliesTimeline: '/$username/_profile/with_replies',
    UserRepostsTimeline: '/$username/_profile/reposts',
    UserPhotoTimeline: '/$username/_profile/media',
    UserVideoTimeline: '/$username/_profile/media',
    SearchByRawQuery: '/$username/status/$id/_engagements/quotes'
  };

  let api = null; // promesa de { version, bearer, consultas }

  // Los imports de un script de X (módulos ES empaquetados con Vite)
  const importados = (codigo, url) => [...codigo.matchAll(/(?:from|import)\s*["'`](\.{1,2}\/[^"'`]+\.js)["'`]/g)]
    .map((m) => new URL(m[1], url).href);

  async function leer(url) {
    const respuesta = await fetch(url);
    if (!respuesta.ok) throw new Error(`${url}: HTTP ${respuesta.status}`);
    return respuesta.text();
  }

  // Id de una consulta y nombres de las variables que añade Relay por su cuenta
  function extraerConsulta(codigo, nombre) {
    const m = codigo.match(new RegExp(
      `id:["'\`]([\\w-]+)["'\`],metadata:\\{[^{}]*\\},name:["'\`]${nombre}["'\`],operationKind:["'\`]query["'\`](?:,text:null)?(?:,providedVariables:\\{([^{}]*)\\})?`
    ));
    return m && { id: m[1], variables: [...(m[2] ?? '').matchAll(/__relay_internal__\w+/g)].map((v) => v[0]) };
  }

  // Cada una de esas páginas tiene su consulta en un script propio: se llega a él
  // por la definición de su ruta, que lleva justo delante los import() que carga
  async function buscarConsulta(nombre, ruta, rutas, comunes) {
    const posicion = rutas.codigo.indexOf(`(\`${ruta}\`)`);
    if (posicion < 0) return null;
    const cargas = [...rutas.codigo.slice(Math.max(0, posicion - 800), posicion).matchAll(/import\(["'`]([^"'`]+\.js)["'`]\)/g)]
      .slice(-2).map((m) => new URL(m[1], rutas.url).href);
    for (const url of cargas) {
      const codigo = await leer(url);
      const directa = extraerConsulta(codigo, nombre);
      if (directa) return directa;
      // Los imports propios de la pestaña van al final
      for (const otra of importados(codigo, url).reverse()) {
        if (comunes.has(otra)) continue;
        const consulta = extraerConsulta(await leer(otra), nombre);
        if (consulta) return consulta;
      }
    }
    return null;
  }

  async function leerApi(version) {
    const codigoEntrada = await leer(version);
    const comunes = new Set(importados(codigoEntrada, version));
    const scripts = [];
    for (const url of comunes) scripts.push({ url, codigo: await leer(url) });

    const bearer = scripts.map((s) => s.codigo.match(/Bearer (A{10,}[\w%-]+)/)?.[1]).find(Boolean);
    const consultas = { UserByScreenName: scripts.map((s) => extraerConsulta(s.codigo, 'UserByScreenName')).find(Boolean) };
    for (const [nombre, ruta] of Object.entries(RUTAS)) {
      const rutas = scripts.find((s) => s.codigo.includes(`(\`${ruta}\`)`));
      consultas[nombre] = rutas && await buscarConsulta(nombre, ruta, rutas, comunes);
    }
    if (!bearer) throw new Error('X ha cambiado sus scripts: no se encuentra el token');
    return { version, bearer, consultas };
  }

  function prepararApi() {
    api ??= (async () => {
      const { [CLAVE_API]: guardada } = await chrome.storage.local.get(CLAVE_API);
      const version = document.querySelector('script[src*="/entry-client"]')?.src;
      if (!version && !guardada) throw new Error('no se encuentra el script principal de X');
      const completa = ({ consultas }) => ['UserByScreenName', ...Object.keys(RUTAS)].every((nombre) => consultas[nombre]);
      if (guardada && (!version || (guardada.version === version && completa(guardada)))) return guardada;
      const nueva = await leerApi(version);
      // Si falta alguna consulta, se vuelve a buscar en la próxima carga
      if (completa(nueva)) await chrome.storage.local.set({ [CLAVE_API]: nueva });
      return nueva;
    })();
    // Si falla, se vuelve a intentar en la siguiente actualización
    api.catch(() => { api = null; });
    return api;
  }

  async function consultar(nombre, propias) {
    const { bearer, consultas } = await prepararApi();
    const csrf = document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/)?.[1];
    if (!csrf) throw new Error('no hay sesión iniciada');
    if (!consultas[nombre]) throw new Error(`X ha cambiado sus scripts: no se encuentra ${nombre}`);
    const { id, variables } = consultas[nombre];
    // Las de Relay son opciones de X (traducciones, resultados deportivos…) que
    // no hacen falta, salvo decir que hay sesión; pero tienen que ir todas
    const deRelay = Object.fromEntries(variables.map((v) => [v, /viewerisloggedin/.test(v)]));
    const respuesta = await fetch(`${API}/${id}/${nombre}?variables=${encodeURIComponent(JSON.stringify({ ...propias, ...deRelay }))}`, {
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
    return datos.data;
  }

  const perfilDe = (usuario) => ({
    id: usuario.rest_id,
    usuario: usuario.core?.screen_name ?? '',
    nombre: usuario.core?.name ?? usuario.core?.screen_name ?? '',
    avatar: (usuario.avatar?.image_url ?? '').replace('_normal.', '_bigger.')
  });

  async function buscarPerfil(nombreUsuario) {
    const datos = await consultar('UserByScreenName', { screenName: nombreUsuario, withIdentity: true });
    const usuario = datos?.user_result_by_screen_name?.result;
    return usuario?.rest_id ? perfilDe(usuario) : null;
  }

  // Los tuits con restricciones vienen envueltos en { tweet: {...} }
  const desenvolver = (resultado) => resultado?.tweet ?? resultado;

  const autorDe = (tweet) => tweet.core?.user_results?.result;

  // Texto legible: sin las menciones del principio de las respuestas ni el
  // enlace de las fotos y vídeos (display_text_range los deja fuera), enlaces
  // t.co cambiados por su dirección visible y entidades HTML decodificadas
  function textoDe(tweet) {
    const nota = tweet.note_tweet?.note_tweet_results?.result;
    const [inicio, fin] = tweet.details.display_text_range ?? [];
    // El rango cuenta caracteres Unicode, no unidades UTF-16
    let texto = nota?.text ?? [...(tweet.details.full_text ?? '')].slice(inicio, fin).join('');
    const enlaces = [...(tweet.url_entities ?? []), ...(nota?.entity_set?.urls ?? [])];
    for (const enlace of enlaces) {
      if (enlace.url) texto = texto.replaceAll(enlace.url, enlace.display_url ?? enlace.expanded_url ?? enlace.url);
    }
    texto = texto.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();
    const media = tweet.media_entities2 ?? [];
    if (!texto && media.length) texto = media[0].type === 'photo' ? '[Foto]' : '[Vídeo]';
    return texto;
  }

  const originalDe = (nodo) => desenvolver(nodo.legacy?.retweeted_status_results?.result);

  const tipoDe = (nodo) => nodo.legacy?.retweeted_status_results ? 'retuit'
    : nodo.reply_to_results || nodo.reply_to_user_results ? 'respuesta'
      : 'post';

  function resumir(nodo, tipo) {
    const original = originalDe(nodo);
    const tweet = original?.details ? original : nodo;
    return {
      id: tweet.rest_id,
      autor: autorDe(tweet)?.core?.screen_name ?? '',
      tipo,
      respondeA: nodo.reply_to_user_results?.result?.core?.screen_name ?? '',
      texto: textoDe(tweet),
      fecha: nodo.details.created_at_ms
    };
  }

  /**
   * Último post, respuesta y retuit de la cuenta, de las tres pestañas de su
   * perfil. En Respuestas vienen también los tuits a los que responde, que se
   * descartan por ser de otras cuentas. Se ignora el tuit fijado, que va en su
   * propia instrucción (TimelinePinEntry), y se elige el id más alto de cada
   * tipo porque los hilos vienen agrupados.
   */
  async function buscarUltimos({ id: idUsuario, usuario }) {
    // Las mismas variables que manda X en cada consulta
    const variables = { screenName: usuario, count: 20, cursor: null };
    // Si falla alguna, se sigue con las demás
    const resultados = await Promise.allSettled([
      consultar('UserOriginalsTimeline', { ...variables, sortByMostLiked: null }),
      consultar('UserRepliesTimeline', variables),
      consultar('UserRepostsTimeline', variables)
    ]);
    const fallos = resultados.filter((r) => r.status === 'rejected').map((r) => r.reason);
    if (fallos.length === resultados.length) throw fallos[0];
    const ultimos = {};
    (function recorrer(nodo) {
      if (!nodo || typeof nodo !== 'object') return;
      if (Array.isArray(nodo)) return nodo.forEach(recorrer);
      if (nodo.rest_id && nodo.details && autorDe(nodo)?.rest_id === idUsuario) {
        const tipo = tipoDe(nodo);
        if (!ultimos[tipo] || BigInt(nodo.rest_id) > BigInt(ultimos[tipo].rest_id)) ultimos[tipo] = nodo;
      }
      Object.values(nodo).forEach(recorrer);
    })(resultados
      // Cada pestaña llega en su campo: profile_user_…_timeline
      .flatMap((r) => Object.values(r.value?.user_result_by_screen_name?.result ?? {}))
      .flatMap((campo) => campo?.timeline?.instructions ?? [])
      .filter((i) => i.__typename === 'TimelineAddEntries'));

    return Object.fromEntries(Object.entries(ultimos).map(([tipo, nodo]) => [tipo, resumir(nodo, tipo)]));
  }

  /** Citas más destacadas de un tuit: [{ perfil, tweet }] */
  async function buscarCitas(idTweet) {
    const datos = await consultar('SearchByRawQuery', {
      rawQuery: `quoted_tweet_id:${idTweet}`, product: 'Top', querySource: 'tdqt',
      count: 20, cursor: null, withMediaGridTweet: false
    });
    return (datos?.search_by_raw_query?.search_timeline?.timeline?.instructions ?? [])
      .flatMap((i) => i.entries ?? [])
      // Solo tuits: también vienen cursores y anuncios ("promoted-…")
      .filter((e) => e.entry_id?.startsWith('tweet-'))
      .map((e) => desenvolver(e.content?.content?.tweet_results?.result))
      .filter((nodo) => nodo?.details && autorDe(nodo)?.core)
      .map((nodo) => {
        // Sin el enlace al propio tuit citado
        const urls = (nodo.url_entities ?? []).map((u) => (u.expanded_url?.includes(`/status/${idTweet}`) ? { ...u, display_url: '' } : u));
        return { perfil: perfilDe(autorDe(nodo)), tweet: resumir({ ...nodo, url_entities: urls }, 'post') };
      });
  }

  /** Últimas fotos y vídeos de una cuenta, de más nuevos a más antiguos */
  async function buscarGaleria(usuario) {
    const variables = { screenName: usuario, count: 20, cursor: null };
    // Si falla una, se sigue con la otra
    const resultados = await Promise.allSettled([
      consultar('UserPhotoTimeline', variables),
      consultar('UserVideoTimeline', variables)
    ]);
    if (resultados.every((r) => r.status === 'rejected')) throw resultados[0].reason;
    const medios = new Map(); // un tuit con foto y vídeo sale en las dos
    (function recorrer(nodo) {
      if (!nodo || typeof nodo !== 'object') return;
      if (Array.isArray(nodo)) return nodo.forEach(recorrer);
      const autor = autorDe(nodo)?.core?.screen_name;
      if (nodo.rest_id && nodo.details && autor?.toLowerCase() === usuario.toLowerCase()) {
        for (const media of nodo.media_entities2 ?? []) {
          // ".../usuario/status/123/photo/1", que X abre a pantalla completa
          const ruta = media.expanded_url?.match(/\/[^/]+\/status\/\d+\/(?:photo|video)\/\d+$/)?.[0];
          if (!ruta || !media.media_url_https) continue;
          medios.set(media.id_str, {
            ruta,
            imagen: `${media.media_url_https}?name=small`,
            texto: media.ext_alt_text ?? '',
            esVideo: media.type !== 'photo',
            sensible: Boolean(media.sensitive_media_warning ?? nodo.legacy?.possibly_sensitive),
            fecha: nodo.details.created_at_ms
          });
        }
      }
      Object.values(nodo).forEach(recorrer);
    })(resultados.map((r) => r.value));
    return [...medios.values()].sort((a, b) => b.fecha - a.fecha);
  }

  return { buscarPerfil, buscarUltimos, buscarCitas, buscarGaleria };
})();
