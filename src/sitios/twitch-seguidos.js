/**
 * Bloqueador - Twitch: todos los seguidos en directo en la barra izquierda
 * Twitch enseña 12 canales seguidos y el resto tras "Mostrar más", botón que
 * con la barra plegada ni siquiera existe. Cuántos se enseñan es un estado de
 * React del componente de la sección, así que este script corre en el mundo
 * de la página (world: "MAIN") para llegar a él y subirlo hasta el número de
 * canales en directo.
 * No ve chrome.storage: twitch.js pone data-bloqueador-seguidos en <html>
 * cuando la opción está activa. Los desconectados que Twitch añada detrás se
 * ocultan por CSS (SELECTORES.todosSeguidos en twitch.js).
 */
(() => {
  'use strict';

  // El componente de la sección: el primero hacia arriba con initialDisplayAmount
  function componenteSeccion(seccion) {
    const clave = Object.keys(seccion).find((k) => k.startsWith('__reactFiber'));
    let fiber = clave && seccion[clave];
    for (let i = 0; fiber && i < 10; i++, fiber = fiber.return) {
      if (fiber.memoizedProps?.initialDisplayAmount) return fiber;
    }
    return null;
  }

  function desplegar() {
    if (!document.documentElement.hasAttribute('data-bloqueador-seguidos')) return;
    for (const seccion of document.querySelectorAll('#side-nav .side-nav-section')) {
      const fiber = componenteSeccion(seccion);
      const datos = fiber?.memoizedProps.section;
      // sectionId: "provider-side-nav-followed-channels-1"
      if (!datos?.sectionId?.includes('followed')) continue;
      const enDirecto = datos.streams?.length ?? 0;
      // El primer useState numérico es cuántos canales se enseñan
      for (let hook = fiber.memoizedState; hook; hook = hook.next) {
        if (typeof hook.memoizedState !== 'number' || !hook.queue?.dispatch) continue;
        if (hook.memoizedState < enDirecto) hook.queue.dispatch(enDirecto);
        break;
      }
    }
  }

  setInterval(desplegar, 1000);
})();
