/**
 * Bloqueador - Twitter/X clásico: datos de las cuentas
 * Lo mismo que twitter-datos.js para la web anterior de X: otra API GraphQL
 * (UserByScreenName, UserTweets y UserTweetsAndReplies), cuyos IDs y token
 * "Bearer" se sacan de su script principal (main.*.js).
 */
globalThis.BloqueadorTwitterDatosClasica = (() => {
  'use strict';

  const CONSULTAS = ['UserByScreenName', 'UserTweets', 'UserTweetsAndReplies'];

  let api = null; // promesa de { bearer, ids }

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
  async function buscarUltimos({ id: idUsuario }) {
    // Las mismas variables que manda X en cada consulta: una de más puede
    // hacer que la rechace (withCommunity solo existe en UserTweetsAndReplies)
    const variables = { userId: idUsuario, count: 20, includePromotedContent: false, withVoice: true };
    // Si falla una de las dos, se sigue con la otra
    const resultados = await Promise.allSettled([
      consultar('UserTweets', variables),
      consultar('UserTweetsAndReplies', { ...variables, withCommunity: true })
    ]);
    const fallos = resultados.filter((r) => r.status === 'rejected').map((r) => r.reason);
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

  return { buscarPerfil, buscarUltimos };
})();
