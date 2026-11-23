/**
 * Bloqueador - Twitter/X: "Citas"
 * En la página de un tuit, recuadro en la columna derecha, justo encima de
 * "Qué está pasando", con sus citas más destacadas y un enlace a la página de X
 * con todas. Los datos los pide twitter-datos.js. Se muestra también si el tuit
 * no tiene citas.
 */
(() => {
  'use strict';

  const MAXIMO = 6;

  const { crearFila, crearCaja, crearEnlace, crearCarga, colocar } = BloqueadorRecuadro;

  let ajustes = BloqueadorAjustes.POR_DEFECTO;
  let pendiente = false;
  // Lo que hay pintado: id y estado, y la lista
  let pintado = '';
  let pintadas = null;

  const activa = () => ajustes.activo && ajustes.twitter.citas;

  const { caja } = crearCaja('Citas');
  const lista = document.createElement('ul');
  const aviso = document.createElement('p');
  aviso.className = 'bc-vacio';
  caja.append(lista, aviso);

  // Qué se dice cuando no hay citas que enseñar
  const AVISOS = {
    cargando: 'Cargando…',
    lista: 'Este tuit no tiene citas.',
    error: 'No se han podido cargar las citas.'
  };

  const citasDe = crearCarga('las citas', BloqueadorTwitterDatos.buscarCitas, programar);

  // La foto o el vídeo a pantalla completa se abren sobre la página del tuit;
  // en la de citas (…/quotes) el recuadro sobra
  function tuitAbierto() {
    const [, usuario, id] = location.pathname.match(/^\/([^/]+)\/status\/(\d+)(?:\/(?:photo|video)\/\d+)?\/?$/) ?? [];
    return id ? { usuario, id } : null;
  }

  function pintar({ usuario, id }, { lista: citas, estado }) {
    const clave = `${id} ${estado}`;
    if (pintado === clave && pintadas === citas) return;
    pintado = clave;
    pintadas = citas;
    lista.replaceChildren(...citas.slice(0, MAXIMO).map(crearFila));
    aviso.hidden = citas.length > 0;
    aviso.textContent = AVISOS[estado];
    caja.querySelector('.bc-mas')?.remove();
    if (citas.length) caja.append(crearEnlace(`/${usuario}/status/${id}/quotes`, 'bc-mas', 'Ver todas las citas'));
  }

  function revisar() {
    pendiente = false;
    const tuit = activa() ? tuitAbierto() : null;
    if (!tuit) {
      caja.remove();
      return;
    }
    pintar(tuit, citasDe(tuit.id));
    colocar(caja, programar);
  }

  function programar() {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(revisar);
  }

  BloqueadorAjustes.cargar().then((guardados) => { ajustes = guardados; programar(); });
  BloqueadorAjustes.alCambiar((nuevos) => { ajustes = nuevos; programar(); });

  new MutationObserver(programar).observe(document.body, { childList: true, subtree: true });
})();
