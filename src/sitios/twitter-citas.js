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
    error: 'No se han podido cargar las citas.',
    limite: 'X ha limitado las búsquedas.'
  };

  const enlaceCitas = (id) => document.querySelector(`main a[href*="/status/${id}/quotes"]`);

  async function pedir(id) {
    const citas = await BloqueadorTwitterDatos.buscarCitas(id);
    // A veces la búsqueda llega vacía aunque las haya: X enlaza a ellas
    if (!citas.length && enlaceCitas(id) && !vacias.has(id)) {
      vacias.add(id);
      throw new Error('búsqueda vacía');
    }
    return citas;
  }

  // Tuits con citas cuya búsqueda ya ha llegado vacía una vez: a la segunda se da
  // por buena (pueden ser de cuentas privadas o bloqueadas)
  const vacias = new Set();
  const citasDe = crearCarga('las citas', pedir, programar);

  // Ni en la de citas (…/quotes) ni con una foto o un vídeo a pantalla completa:
  // el recuadro no se ve y, al pasar de vídeo en vídeo, se gastaría el cupo de
  // búsquedas de X
  function tuitAbierto() {
    const [, usuario, id] = location.pathname.match(/^\/([^/]+)\/status\/(\d+)\/?$/) ?? [];
    return id ? { usuario, id } : null;
  }

  function pintar({ usuario, id }, { lista: citas, estado, hasta }) {
    const clave = `${id} ${estado} ${estado === 'limite' ? hasta : ''}`;
    if (pintado === clave && pintadas === citas) return;
    pintado = clave;
    pintadas = citas;
    lista.replaceChildren(...citas.slice(0, MAXIMO).map(crearFila));
    aviso.hidden = citas.length > 0;
    aviso.textContent = AVISOS[estado];
    if (estado === 'limite') {
      aviso.textContent += ` Se reintentará a las ${new Date(hasta).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}.`;
    }
    if (estado === 'error' || estado === 'limite') {
      const boton = document.createElement('button');
      boton.textContent = 'Reintentar';
      boton.addEventListener('click', () => citasDe.reintentar(id));
      aviso.append(boton);
    }
    caja.querySelector('.bc-mas')?.remove();
    // Aunque no se hayan podido cargar, quedan en la página de X
    if (citas.length || estado === 'error' || estado === 'limite') caja.append(crearEnlace(`/${usuario}/status/${id}/quotes`, 'bc-mas', 'Ver todas las citas'));
  }

  function revisar() {
    pendiente = false;
    const tuit = activa() ? tuitAbierto() : null;
    if (!tuit) {
      caja.remove();
      return;
    }
    pintar(tuit, citasDe(tuit.id));
    lista.classList.toggle('bc-difuminar', ajustes.twitter.galeriaDifuminar);
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
