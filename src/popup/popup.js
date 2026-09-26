/**
 * Bloqueador - Popup
 * Cada checkbox con data-ajuste="ruta.del.ajuste" se enlaza a ese valor de
 * los ajustes; al cambiarlo se guarda y los content scripts lo aplican al momento.
 */
(async () => {
  'use strict';

  function leer(objeto, ruta) {
    return ruta.split('.').reduce((valor, clave) => valor[clave], objeto);
  }

  function escribir(objeto, ruta, valor) {
    const claves = ruta.split('.');
    const ultima = claves.pop();
    claves.reduce((valor, clave) => valor[clave], objeto)[ultima] = valor;
  }

  function mostrarEstado(ajustes) {
    document.body.classList.toggle('pausado', !ajustes.activo);
    document.getElementById('estado-texto').textContent = ajustes.activo ? 'Activo' : 'En pausa';
  }

  // Navegación de la lista de la izquierda
  const pestanas = document.querySelectorAll('.lista-item[data-panel]');
  for (const pestana of pestanas) {
    pestana.addEventListener('click', () => {
      for (const otra of pestanas) {
        const seleccionada = otra === pestana;
        otra.setAttribute('aria-selected', String(seleccionada));
        document.getElementById(`panel-${otra.dataset.panel}`).hidden = !seleccionada;
      }
    });
  }

  document.getElementById('version').textContent = chrome.runtime.getManifest().version;

  const ajustes = await BloqueadorAjustes.cargar();
  mostrarEstado(ajustes);

  for (const input of document.querySelectorAll('input[data-ajuste]')) {
    const ruta = input.dataset.ajuste;
    input.checked = leer(ajustes, ruta);
    input.addEventListener('change', () => {
      escribir(ajustes, ruta, input.checked);
      mostrarEstado(ajustes);
      BloqueadorAjustes.guardar(ajustes);
    });
  }

  requestAnimationFrame(() => document.body.classList.add('listo'));
})();
