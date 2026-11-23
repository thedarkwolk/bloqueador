/**
 * Bloqueador - Twitter/X: datos de las cuentas (web nueva)
 * Pide el perfil y los últimos tuits de una cuenta a la API GraphQL de X
 * (UserByScreenName y las pestañas Posts, Respuestas y Reposts del perfil) con
 * la sesión del usuario, como hace la propia página. Los IDs de las consultas,
 * sus variables y el token "Bearer" cambian con cada versión de X, así que se
 * sacan de sus scripts en vez de escribirlos aquí.
 * También las citas de un tuit (SearchByRawQuery, la de la página de citas) y
 * las fotos y vídeos de una cuenta (pestaña Multimedia) o de una búsqueda, y las
 * respuestas a un tuit.
 * Lo usan twitter-cuentas.js (twitter-datos-clasica.js es lo mismo para la web
 * anterior) y twitter-galeria.js, twitter-citas.js y twitter-visor.js (estas dos
 * en las dos webs: en la clásica tiran de los IDs guardados la última vez que se
 * abrió la nueva).
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
    SearchByRawQuery: '/$username/status/$id/_engagements/quotes',
    TweetDetail: '/$username/status/$id/_media',
    FavoriteTweet: '/$username/status/$id/_media',
    likeButtonControlUnfavoriteMutation: '/$username/status/$id/_media',
    CreateRetweet: '/$username/status/$id/_media',
    retweetButtonUnretweetMutation: '/$username/status/$id/_media'
  };

  // Cuántos imports se siguen desde una ruta
  const SALTOS_MAXIMOS = 3;
  // Espera mínima y máxima cuando X limita las peticiones
  const ESPERA_LIMITE = 60 * 1000;
  const MAXIMO_LIMITE = 15 * 60 * 1000;

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
      `id:["'\`]([\\w-]+)["'\`],metadata:\\{[^{}]*\\},name:["'\`]${nombre}["'\`],operationKind:["'\`](?:query|mutation)["'\`](?:,text:null)?(?:,providedVariables:\\{([^{}]*)\\})?`
    ));
    return m && { id: m[1], variables: [...(m[2] ?? '').matchAll(/__relay_internal__\w+/g)].map((v) => v[0]) };
  }

  // Cada una de esas páginas tiene su consulta en un script propio: se llega a él
  // por la definición de su ruta, que lleva justo delante los import() que carga,
  // y, desde ellos, por lo que importan (los imports propios van al final)
  async function buscarConsulta(nombre, ruta, rutas, comunes, leerUnaVez) {
    const posicion = rutas.codigo.indexOf(`(\`${ruta}\`)`);
    if (posicion < 0) return null;
    let nivel = [...rutas.codigo.slice(Math.max(0, posicion - 800), posicion).matchAll(/import\(["'`]([^"'`]+\.js)["'`]\)/g)]
      .slice(-2).map((m) => new URL(m[1], rutas.url).href);
    const vistos = new Set(comunes);
    for (let salto = 0; salto <= SALTOS_MAXIMOS; salto++) {
      const siguiente = [];
      for (const url of nivel) {
        if (vistos.has(url)) continue;
        vistos.add(url);
        const codigo = await leerUnaVez(url);
        const consulta = extraerConsulta(codigo, nombre);
        if (consulta) return consulta;
        siguiente.push(...importados(codigo, url).reverse());
      }
      nivel = siguiente;
    }
    return null;
  }

  async function leerApi(version) {
    const codigoEntrada = await leer(version);
    const comunes = new Set(importados(codigoEntrada, version));
    const leidos = new Map();
    const leerUnaVez = (url) => {
      if (!leidos.has(url)) leidos.set(url, leer(url));
      return leidos.get(url);
    };
    const scripts = [];
    for (const url of comunes) scripts.push({ url, codigo: await leer(url) });

    const bearer = scripts.map((s) => s.codigo.match(/Bearer (A{10,}[\w%-]+)/)?.[1]).find(Boolean);
    const consultas = { UserByScreenName: scripts.map((s) => extraerConsulta(s.codigo, 'UserByScreenName')).find(Boolean) };
    for (const [nombre, ruta] of Object.entries(RUTAS)) {
      const rutas = scripts.find((s) => s.codigo.includes(`(\`${ruta}\`)`));
      consultas[nombre] = rutas && await buscarConsulta(nombre, ruta, rutas, comunes, leerUnaVez);
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
      const error = new Error(`${nombre}: HTTP ${respuesta.status} ${detalle}`);
      if (respuesta.status === 429) {
        // Límite de X: hasta cuándo, si lo dice (segundos desde 1970)
        const fin = Number(respuesta.headers.get('x-rate-limit-reset')) * 1000;
        error.esperar = Math.min(Math.max(fin - Date.now() + 1000, ESPERA_LIMITE), MAXIMO_LIMITE);
      } else if ([400, 404, 422].includes(respuesta.status) && BloqueadorTwitter.esNueva()) {
        // La consulta ya no vale: se vuelve a leer de los scripts de X. En la
        // clásica no se puede, así que se conserva lo que haya
        api = null;
        await chrome.storage.local.remove(CLAVE_API);
      }
      throw error;
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

  // La fecha va en el propio id (los tuits de la cuadrícula de fotos no la traen)
  const fechaDe = (nodo) => nodo.details.created_at_ms ?? Number((BigInt(nodo.rest_id) >> 22n) + 1288834974657n);

  // "/usuario/status/123/photo/1", que X abre a pantalla completa
  const rutaDe = (media) => media.expanded_url?.match(/\/[^/]+\/status\/\d+\/(?:photo|video)\/\d+$/)?.[0];

  // El MP4 más pequeño que llena la pantalla o, si ninguno llega, el mayor. El
  // tamaño va en la URL (".../1920x1080/..."); `mp4s` va de mayor a menor
  function mp4ParaPantalla(mp4s) {
    const llena = ({ url }) => {
      const [, ancho, alto] = url.match(/[/]([0-9]+)x([0-9]+)[/]/) ?? [];
      return ancho >= screen.width * devicePixelRatio || alto >= screen.height * devicePixelRatio;
    };
    return mp4s.findLast(llena) ?? mp4s[0];
  }

  // Fotos y vídeos de un tuit. De los vídeos, `mp4` para verlo, `mejor` (el de
  // más calidad) para descargarlo y `hls`, donde van los subtítulos
  const mediosDe = (nodo) => (nodo.media_entities2 ?? [])
    .filter((media) => media.media_url_https)
    .map((media, i) => {
      const variantes = media.video_info?.variants ?? [];
      const mp4s = variantes
        .filter((v) => v.content_type === 'video/mp4' && v.url)
        .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
      return {
        id: media.id_str,
        ruta: rutaDe(media)
          ?? `/${autorDe(nodo)?.core?.screen_name ?? 'i'}/status/${nodo.rest_id}/${media.type === 'photo' ? 'photo' : 'video'}/${i + 1}`,
        original: media.media_url_https,
        imagen: `${media.media_url_https}?name=small`,
        ancho: media.original_info?.width,
        alto: media.original_info?.height,
        texto: media.ext_alt_text ?? '',
        esVideo: media.type !== 'photo',
        mp4: mp4s.length ? mp4ParaPantalla(mp4s).url : '',
        mejor: mp4s[0]?.url ?? '',
        hls: variantes.find((v) => /mpegurl/i.test(v.content_type ?? ''))?.url ?? '',
        sensible: Boolean(media.sensitive_media_warning ?? nodo.legacy?.possibly_sensitive),
        fecha: fechaDe(nodo)
      };
    });

  // Un tuit con sus medios, para el visor (solo los que sabe enseñar). Los de la
  // cuadrícula de fotos vienen incompletos (`parcial`): sin avatar, sin si te
  // gustan y con el enlace de la foto en el texto
  function tuitDe(nodo) {
    if (!nodo?.details || !autorDe(nodo)?.core) return null;
    return {
      id: nodo.rest_id,
      perfil: perfilDe(autorDe(nodo)),
      texto: textoDe(nodo).replace(/^\[(Foto|Vídeo)\]$/, '')
        .replace(nodo.details.display_text_range ? '' : /\s*https:\/\/t\.co\/\w+$/, ''),
      fecha: fechaDe(nodo),
      parcial: !nodo.perspective,
      vistas: Number(nodo.views?.count) || 0,
      meGusta: nodo.counts?.favorite_count ?? 0,
      reposts: nodo.counts?.retweet_count ?? 0,
      respuestas: nodo.counts?.reply_count ?? 0,
      gustado: Boolean(nodo.perspective?.favorited),
      reposteado: Boolean(nodo.perspective?.retweeted),
      medios: mediosDe(nodo).filter((m) => !m.esVideo || m.mp4)
    };
  }

  // Un tuit para las listas: { perfil, tweet }
  function filaDe(nodo) {
    const tweet = resumir(nodo, 'post');
    tweet.medio = mediosDe(nodo)[0] ?? null;
    // Se ve el propio medio: no hace falta el "[Foto]" de textoDe
    if (tweet.medio && /^\[(Foto|Vídeo)\]$/.test(tweet.texto)) tweet.texto = '';
    return { perfil: perfilDe(autorDe(nodo)), tweet };
  }

  /** Citas más destacadas de un tuit: [{ perfil, tweet }] */
  async function buscarCitas(idTweet) {
    const datos = await consultar('SearchByRawQuery', {
      rawQuery: `quoted_tweet_id:${idTweet}`, product: 'Top', querySource: 'tdqt',
      count: 20, cursor: null, withMediaGridTweet: false
    });
    const instrucciones = datos?.search_by_raw_query?.search_timeline?.timeline?.instructions;
    // Sin citas también hay instrucciones; si no las hay, es que ha fallado
    if (!instrucciones) throw new Error('X ha respondido sin datos');
    return instrucciones
      .flatMap((i) => i.entries ?? [])
      // Solo tuits: también vienen cursores y anuncios ("promoted-…")
      .filter((e) => e.entry_id?.startsWith('tweet-'))
      .map((e) => desenvolver(e.content?.content?.tweet_results?.result))
      .filter((nodo) => nodo?.details && autorDe(nodo)?.core)
      .map((nodo) => {
        // Sin el enlace al propio tuit citado
        const urls = (nodo.url_entities ?? []).map((u) => (u.expanded_url?.includes(`/status/${idTweet}`) ? { ...u, display_url: '' } : u));
        return filaDe({ ...nodo, url_entities: urls });
      });
  }

  const entradasDe = (instrucciones) => {
    if (!instrucciones) throw new Error('X ha respondido sin datos');
    // La primera página trae los cursores como entradas; las siguientes pueden
    // reemplazarlos una a una (TimelineReplaceEntry)
    return instrucciones.flatMap((i) => i.entries ?? (i.entry ? [i.entry] : []));
  };

  const cursorDe = (entradas) => {
    const contenido = entradas.find((e) => /^cursor-(bottom|showmore)/.test(e.entry_id ?? ''))?.content;
    return contenido?.value ?? contenido?.content?.value ?? null;
  };

  const nodoDe = (contenido) => desenvolver(contenido?.content?.tweet_results?.result ?? contenido?.tweet_results?.result);

  /**
   * Tuits con fotos o vídeos (`tipo`: photo o video) de una cuenta, de más nuevos
   * a más antiguos, o los más destacados de una búsqueda: { tuits, cursor }
   */
  async function buscarMedios({ usuario, consulta }, tipo, cursor) {
    const foto = tipo === 'photo';
    let instrucciones;
    if (consulta) {
      const datos = await consultar('SearchByRawQuery', {
        rawQuery: `${consulta} filter:${foto ? 'images' : 'native_video'}`, product: 'Top', querySource: 'typed_query',
        count: 20, cursor, withMediaGridTweet: false
      });
      instrucciones = datos?.search_by_raw_query?.search_timeline?.timeline?.instructions;
    } else {
      const datos = await consultar(foto ? 'UserPhotoTimeline' : 'UserVideoTimeline', { screenName: usuario, count: 20, cursor });
      // Cada pestaña llega en su campo: profile_user_…_timeline
      instrucciones = Object.values(datos?.user_result_by_screen_name?.result ?? {})
        .find((campo) => campo?.timeline?.instructions)?.timeline.instructions;
    }
    const entradas = entradasDe(instrucciones);
    // Sueltos o en una cuadrícula, que en las páginas siguientes se amplía
    // (TimelineAddToModule). Sin anuncios ("promoted-…")
    const tuits = [
      ...entradas.map((e) => ({ id: e.entry_id, contenido: e.content })),
      ...[...entradas.flatMap((e) => e.content?.items ?? []), ...instrucciones.flatMap((i) => i.module_items ?? [])]
        .map((i) => ({ id: i.entry_id, contenido: i.item }))
    ]
      .filter(({ id }) => /(^|-)tweet-\d+$/.test(id ?? '') && !/promoted/.test(id))
      .map(({ contenido }) => tuitDe(nodoDe(contenido)))
      .filter((tuit) => tuit?.medios.some((m) => m.esVideo !== foto));
    return { tuits, cursor: cursorDe(entradas) };
  }

  async function pedirConversacion(id, cursor) {
    const datos = await consultar('TweetDetail', {
      cursor, focalTweetId: id, rankingMode: null, referrer: null, withFocalTweet: !cursor
    });
    return entradasDe(datos?.threaded_conversation_with_injections_v2?.instructions);
  }

  /** Un tuit con sus medios: el que X ya tiene cargado o, si no, se pide */
  async function buscarTuit(id) {
    const cargado = tuitDe(await BloqueadorTwitter.pedirTuit(id));
    if (cargado?.medios.length && !cargado.parcial) return cargado;
    const entradas = await pedirConversacion(id, null);
    return tuitDe(nodoDe(entradas.find((e) => e.entry_id === `tweet-${id}`)?.content));
  }

  /** Respuestas a un tuit, con las del hilo detrás de cada una: { respuestas, cursor } */
  async function buscarRespuestas(id, cursor) {
    const entradas = await pedirConversacion(id, cursor);
    const nodos = entradas
      .filter((e) => e.entry_id?.startsWith('conversationthread-'))
      .flatMap((e) => e.content?.items ?? [])
      .filter((i) => !/promoted/.test(i.entry_id ?? ''))
      .map((i) => nodoDe(i.item) ?? nodoDe(i.item?.content))
      .filter((nodo) => nodo?.details && autorDe(nodo)?.core);
    return { respuestas: nodos.map(filaDe), cursor: cursorDe(entradas) };
  }

  // Lo que hace cada botón y lo que lo deshace
  const ACCIONES = {
    gustar: ['FavoriteTweet', 'likeButtonControlUnfavoriteMutation'],
    repostear: ['CreateRetweet', 'retweetButtonUnretweetMutation']
  };

  /**
   * Me gusta o repost (o quitarlos). Lo manda la propia X con su código, desde
   * twitter-api.js: aquí solo se le dice qué operación. Solo en la web nueva.
   */
  async function accionar(accion, poner, idTweet) {
    const nombre = ACCIONES[accion][poner ? 0 : 1];
    const { consultas } = await prepararApi();
    if (!consultas[nombre]) throw new Error(`X ha cambiado sus scripts: no se encuentra ${nombre}`);
    await BloqueadorTwitter.ejecutar(nombre, consultas[nombre].id, idTweet);
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
        for (const medio of mediosDe(nodo)) medios.set(medio.id, medio);
      }
      Object.values(nodo).forEach(recorrer);
    })(resultados.map((r) => r.value));
    return [...medios.values()].sort((a, b) => b.fecha - a.fecha);
  }

  return { buscarPerfil, buscarUltimos, buscarCitas, buscarGaleria, buscarMedios, buscarTuit, buscarRespuestas, accionar };
})();
