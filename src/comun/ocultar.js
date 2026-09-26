/**
 * Bloqueador - Ocultar con hoja de estilos
 * Todo lo que se oculta en un sitio pasa por una única hoja de estilos: las
 * SPAs vuelven a renderizar la interfaz al navegar y la hoja se sigue
 * aplicando sin tener que revisar cada elemento. Se regenera cada vez que
 * cambian los ajustes, así el popup activa y desactiva opciones al momento.
 * Se carga después de ajustes.js y antes del script del sitio.
 */
globalThis.BloqueadorOcultar = (() => {
  'use strict';

  const ESTILO_OCULTAR = 'display: none !important;';
  const ESTILO_REVISION =
    'outline: 3px solid #E0413A !important; outline-offset: -3px !important; opacity: 0.4 !important;';

  /**
   * `selectores` agrupa los selectores CSS por opción del popup, con las
   * mismas claves que ajustes[sitio]. `reglas` (opcional) añade CSS propio por
   * opción, para lo que no es simplemente ocultar (p. ej. cambiar un texto).
   * Devuelve una función que da los ajustes actuales (se cargan de forma
   * asíncrona).
   */
  function iniciar(sitio, selectores, reglas = {}) {
    let ajustes = BloqueadorAjustes.POR_DEFECTO;
    const hoja = document.createElement('style');

    function actualizar() {
      const activa = (opcion) => ajustes.activo && ajustes[sitio][opcion];
      const activos = Object.entries(selectores)
        .filter(([opcion]) => activa(opcion))
        .flatMap(([, lista]) => lista);
      const regla = ajustes.modoRevision ? ESTILO_REVISION : ESTILO_OCULTAR;
      const extra = Object.entries(reglas)
        .filter(([opcion]) => activa(opcion))
        .map(([, css]) => css);
      hoja.textContent = [
        activos.length ? `${activos.join(',\n')} { ${regla} }` : '',
        ...extra
      ].join('\n');
    }

    document.head.appendChild(hoja);
    actualizar();

    BloqueadorAjustes.alCambiar((nuevos) => {
      ajustes = nuevos;
      actualizar();
    });
    BloqueadorAjustes.cargar().then((guardados) => {
      ajustes = guardados;
      actualizar();
    });

    return () => ajustes;
  }

  return { iniciar };
})();
