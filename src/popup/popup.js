/**
 * Bloqueador - Popup
 * Cada checkbox con data-ajuste="ruta.del.ajuste" se enlaza a ese valor de
 * los ajustes; al cambiarlo se guarda y los content scripts lo aplican al momento.
 * El interruptor de la cabecera de cada sitio (.todo-sitio) cambia todas sus
 * opciones a la vez. El panel Resumen enseña las estadísticas que guarda fondo.js.
 */
(async () => {
  'use strict';

  const SITIOS = ['twitter', 'youtube', 'twitch'];

  // Panel que se abre según la pestaña actual
  const PANEL_POR_HOST = {
    'x.com': 'twitter',
    'twitter.com': 'twitter',
    'www.youtube.com': 'youtube',
    'www.twitch.tv': 'twitch'
  };

  const NOMBRES = { twitter: 'Twitter / X', youtube: 'YouTube', twitch: 'Twitch' };

  // Qué cuenta cada clave de las estadísticas ('sitio.tipo')
  const TIPOS = {
    'twitter.anuncios': 'Tweets',
    'twitter.tendencias': 'Tendencias',
    'youtube.video': 'Vídeo',
    'youtube.shorts': 'Shorts',
    'youtube.pagina': 'Página',
    'twitch.directo': 'Pausas',
    'twitch.banners': 'Banners',
    'twitch.pagina': 'Página'
  };

  function leer(objeto, ruta) {
    return ruta.split('.').reduce((valor, clave) => valor[clave], objeto);
  }

  function escribir(objeto, ruta, valor) {
    const claves = ruta.split('.');
    const ultima = claves.pop();
    claves.reduce((valor, clave) => valor[clave], objeto)[ultima] = valor;
  }

  // --- Navegación de la lista de la izquierda --------------------------------
  const pestanas = document.querySelectorAll('.lista-item[data-panel]');

  function mostrarPanel(nombre) {
    for (const pestana of pestanas) {
      const seleccionada = pestana.dataset.panel === nombre;
      pestana.setAttribute('aria-selected', String(seleccionada));
      document.getElementById(`panel-${pestana.dataset.panel}`).hidden = !seleccionada;
    }
  }

  for (const pestana of pestanas) {
    pestana.addEventListener('click', () => mostrarPanel(pestana.dataset.panel));
  }

  // Con activeTab, al abrir el popup se puede leer la URL de la pestaña actual
  try {
    const [pestana] = await chrome.tabs.query({ active: true, currentWindow: true });
    const panel = pestana?.url && PANEL_POR_HOST[new URL(pestana.url).hostname];
    if (panel) mostrarPanel(panel);
  } catch {}

  document.getElementById('version').textContent = chrome.runtime.getManifest().version;

  // --- Ajustes ---------------------------------------------------------------
  const ajustes = await BloqueadorAjustes.cargar();
  const opcionesDe = (sitio) => [...document.querySelectorAll(`input[data-ajuste^="${sitio}."]`)];

  function mostrarEstado() {
    document.body.classList.toggle('pausado', !ajustes.activo);
    document.getElementById('estado-texto').textContent = ajustes.activo ? 'Activo' : 'En pausa';

    for (const sitio of SITIOS) {
      const opciones = opcionesDe(sitio);
      const activas = opciones.filter((input) => input.checked).length;
      const todo = document.querySelector(`.todo-sitio[data-sitio="${sitio}"]`);
      todo.checked = activas === opciones.length;
      todo.indeterminate = activas > 0 && activas < opciones.length;
      document.querySelector(`[data-contador="${sitio}"]`).textContent = `${activas}/${opciones.length}`;
    }
  }

  for (const input of document.querySelectorAll('input[data-ajuste]')) {
    const ruta = input.dataset.ajuste;
    input.checked = leer(ajustes, ruta);
    input.addEventListener('change', () => {
      escribir(ajustes, ruta, input.checked);
      mostrarEstado();
      BloqueadorAjustes.guardar(ajustes);
    });
  }

  // Si estaba a medias, el navegador lo marca al pulsarlo: se activa todo
  for (const todo of document.querySelectorAll('.todo-sitio')) {
    todo.addEventListener('change', () => {
      for (const input of opcionesDe(todo.dataset.sitio)) {
        input.checked = todo.checked;
        escribir(ajustes, input.dataset.ajuste, todo.checked);
      }
      mostrarEstado();
      BloqueadorAjustes.guardar(ajustes);
    });
  }

  mostrarEstado();
  requestAnimationFrame(() => document.body.classList.add('listo'));

  // --- Estadísticas ----------------------------------------------------------
  const formato = new Intl.NumberFormat('es');
  const fechaLocal = (fecha) => fecha.toLocaleDateString('sv'); // AAAA-MM-DD, como fondo.js
  const suma = (valores) => Object.values(valores || {}).reduce((a, b) => a + b, 0);
  const sumaSitio = (valores, sitio) => Object.entries(valores || {})
    .filter(([clave]) => clave.startsWith(`${sitio}.`))
    .reduce((total, [, n]) => total + n, 0);

  // Los últimos 7 días, de hace 6 días a hoy
  function ultimosDias(estadisticas) {
    const dias = [];
    for (let i = 6; i >= 0; i--) {
      const fecha = new Date();
      fecha.setDate(fecha.getDate() - i);
      dias.push({ fecha, valores: estadisticas.dias?.[fechaLocal(fecha)] || {} });
    }
    return dias;
  }

  function pintarGrafico(dias) {
    const grafico = document.getElementById('grafico');
    const maximo = Math.max(1, ...dias.map((d) => suma(d.valores)));
    const indiceMaximo = dias.findIndex((d) => suma(d.valores) === maximo);
    const tooltip = document.createElement('div');
    tooltip.className = 'grafico-tooltip';
    tooltip.hidden = true;
    grafico.replaceChildren(tooltip);

    dias.forEach(({ fecha, valores }, i) => {
      const total = suma(valores);
      const esHoy = i === dias.length - 1;
      const dia = document.createElement('div');
      dia.className = `grafico-dia${esHoy ? ' hoy' : ''}`;

      const zona = document.createElement('div');
      zona.className = 'grafico-zona';
      // Solo se rotulan hoy y el día con más; el resto, al pasar el ratón
      if (total && (esHoy || i === indiceMaximo)) {
        const valor = document.createElement('span');
        valor.className = 'grafico-valor';
        valor.textContent = formato.format(total);
        zona.append(valor);
      }
      const barra = document.createElement('div');
      barra.className = `grafico-barra${total ? '' : ' vacia'}`;
      barra.style.height = `${(total / maximo) * 78}px`;
      zona.append(barra);

      const etiqueta = document.createElement('span');
      etiqueta.className = 'grafico-etiqueta';
      etiqueta.textContent = esHoy ? 'Hoy' : fecha.toLocaleDateString('es', { weekday: 'short' }).replace('.', '');
      dia.append(zona, etiqueta);
      grafico.append(dia);

      zona.addEventListener('mouseenter', () => {
        const titulo = document.createElement('strong');
        titulo.textContent = `${fecha.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' })}: ${formato.format(total)}`;
        const detalle = document.createElement('span');
        detalle.textContent = SITIOS.map((s) => [NOMBRES[s], sumaSitio(valores, s)])
          .filter(([, n]) => n).map(([nombre, n]) => `${nombre} ${formato.format(n)}`).join(' · ') || 'Nada bloqueado';
        tooltip.replaceChildren(titulo, detalle);
        tooltip.hidden = false;
        // Centrado sobre la barra sin salirse de la tarjeta
        const ancho = tooltip.offsetWidth;
        const centro = dia.offsetLeft + dia.offsetWidth / 2;
        tooltip.style.left = `${Math.min(Math.max(centro - ancho / 2, 4), grafico.clientWidth - ancho - 4)}px`;
        tooltip.style.top = '4px';
      });
      zona.addEventListener('mouseleave', () => { tooltip.hidden = true; });
    });

    grafico.setAttribute('aria-label', 'Bloqueados por día: ' + dias.map(({ fecha, valores }) =>
      `${fecha.toLocaleDateString('es', { weekday: 'long' })} ${suma(valores)}`).join(', '));
  }

  function pintarSitios(estadisticas, hoy) {
    const filas = SITIOS.map((sitio) => {
      const fila = document.createElement('div');
      fila.className = 'sitio';
      const icono = document.querySelector(`.lista-item[data-panel="${sitio}"] .lista-icono`).cloneNode(true);

      const texto = document.createElement('div');
      texto.className = 'sitio-texto';
      const nombre = document.createElement('strong');
      nombre.textContent = NOMBRES[sitio];
      const desglose = document.createElement('small');
      desglose.textContent = Object.entries(TIPOS)
        .filter(([clave]) => clave.startsWith(`${sitio}.`) && estadisticas.total?.[clave])
        .map(([clave, tipo]) => `${tipo} ${formato.format(estadisticas.total[clave])}`)
        .join(' · ') || 'Nada bloqueado aún';
      texto.append(nombre, desglose);

      const numeros = document.createElement('div');
      numeros.className = 'sitio-numeros';
      const total = document.createElement('strong');
      total.textContent = formato.format(sumaSitio(estadisticas.total, sitio));
      const deHoy = document.createElement('small');
      deHoy.textContent = `${formato.format(sumaSitio(hoy, sitio))} hoy`;
      numeros.append(total, deHoy);

      fila.append(icono, texto, numeros);
      return fila;
    });
    document.getElementById('por-sitio').replaceChildren(...filas);
  }

  function pintarEstadisticas(estadisticas = {}) {
    const dias = ultimosDias(estadisticas);
    const hoy = dias.at(-1).valores;
    document.getElementById('cifra-hoy').textContent = formato.format(suma(hoy));
    document.getElementById('cifra-semana').textContent = formato.format(dias.reduce((t, d) => t + suma(d.valores), 0));
    document.getElementById('cifra-total').textContent = formato.format(suma(estadisticas.total));
    document.getElementById('resumen-desde').textContent = estadisticas.desde
      ? `Bloqueados desde el ${new Date(`${estadisticas.desde}T00:00`).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}`
      : 'Anuncios y promociones bloqueados';
    pintarGrafico(dias);
    pintarSitios(estadisticas, hoy);
  }

  const { estadisticas } = await chrome.storage.local.get('estadisticas');
  pintarEstadisticas(estadisticas);
  chrome.storage.onChanged.addListener((cambios, zona) => {
    if (zona === 'local' && cambios.estadisticas) pintarEstadisticas(cambios.estadisticas.newValue);
  });

  // Reiniciar pide una segunda pulsación para confirmar
  const reiniciar = document.getElementById('reiniciar');
  let confirmando = null;
  reiniciar.addEventListener('click', () => {
    if (confirmando) {
      clearTimeout(confirmando);
      confirmando = null;
      reiniciar.classList.remove('confirmar');
      reiniciar.textContent = 'Reiniciar estadísticas';
      chrome.storage.local.remove('estadisticas');
      return;
    }
    reiniciar.classList.add('confirmar');
    reiniciar.textContent = '¿Seguro? Pulsa otra vez para borrarlas';
    confirmando = setTimeout(() => {
      confirmando = null;
      reiniciar.classList.remove('confirmar');
      reiniciar.textContent = 'Reiniciar estadísticas';
    }, 3000);
  });
})();
