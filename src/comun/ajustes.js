/**
 * Bloqueador - Ajustes compartidos
 * Los usan el popup y los content scripts. Se carga como script clásico antes
 * que el script de cada sitio (los content scripts no pueden usar import sin
 * un bundler), por eso se expone como objeto global.
 */
globalThis.BloqueadorAjustes = (() => {
  'use strict';

  const CLAVE = 'ajustes';

  const POR_DEFECTO = {
    activo: true,
    // true -> lo bloqueado se marca en rojo en vez de ocultarse (para revisar falsos positivos)
    modoRevision: false,
    twitter: {
      anuncios: true,
      premium: true,
      grok: true,
      estudio: true,
      aQuienSeguir: true,
      pieDePagina: true,
      reordenar: true,
      descargarVideos: true,
      cuentasInteres: true,
      tendenciasPlegables: true
    },
    youtube: {
      anunciosVideo: true,
      shorts: true,
      anuncios: true,
      premium: true
    },
    twitch: {
      anunciosDirecto: true,
      anuncios: true,
      turbo: true,
      prime: true,
      bits: true,
      regalos: true,
      textoSuscribirse: true,
      donantes: true,
      avisosChat: true,
      contadores: true,
      campana: true,
      historias: true,
      rachas: true,
      navegacion: true,
      soloSeguidos: true,
      todosSeguidos: true,
      tarjetasLimpias: true,
      barraAncha: true
    }
  };

  // Mezcla lo guardado con los valores por defecto, para que las opciones
  // nuevas tengan valor aunque el usuario ya tuviera ajustes guardados
  function combinar(guardados = {}) {
    const resultado = structuredClone(POR_DEFECTO);
    for (const [clave, valor] of Object.entries(guardados)) {
      if (!(clave in resultado)) continue;
      if (typeof resultado[clave] === 'object') {
        Object.assign(resultado[clave], valor);
      } else {
        resultado[clave] = valor;
      }
    }
    return resultado;
  }

  async function cargar() {
    const datos = await chrome.storage.sync.get(CLAVE);
    return combinar(datos[CLAVE]);
  }

  function guardar(ajustes) {
    return chrome.storage.sync.set({ [CLAVE]: ajustes });
  }

  function alCambiar(callback) {
    chrome.storage.onChanged.addListener((cambios, zona) => {
      if (zona === 'sync' && cambios[CLAVE]) callback(combinar(cambios[CLAVE].newValue));
    });
  }

  return { POR_DEFECTO, cargar, guardar, alCambiar };
})();
