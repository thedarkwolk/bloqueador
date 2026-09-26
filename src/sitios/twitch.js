/**
 * Bloqueador - Twitch
 * Oculta elementos publicitarios y promocionales de la interfaz: anuncio de
 * portada, Turbo, Prime, Bits, contadores de avisos, historias y rachas.
 * Qué se oculta lo decide el popup (ver src/comun/ajustes.js y ocultar.js).
 *
 * Los anuncios de vídeo van insertados en el propio stream, así que ocultar
 * elementos no los quita; eso necesita otro mecanismo (pendiente).
 */
(() => {
  'use strict';

  // Qué ocultar por cada opción del popup (claves de ajustes.twitch).
  // Twitch usa clases generadas (Layout-sc-…) que cambian con cada versión, así
  // que se usan data-a-target, iconos o el prefijo de las clases de CSS modules.
  // Los botones de la barra superior se ocultan con su contenedor para que no
  // quede su margen.
  const SELECTORES = {
    anuncios: [
      // Anuncio grande de la portada, detrás del carrusel de directos
      '[data-a-target="frontpage-headliner"]',
      // Tarjeta de vídeo ("Anuncio 0:18 · Más información") metida en las filas
      // de canales. No tiene atributos propios; las tarjetas de canal usan
      // miniaturas, así que se reconoce por su <video> servido desde Amazon
      '.tw-tower > div:has(video[src*="amazon"])'
    ],
    turbo: [
      // "Prueba 1 mes sin anuncios": sin atributos propios, se reconoce por
      // su icono (un rayo dentro de una tele), que no se usa en otro sitio
      '.top-nav__menu > div > div:has(path[d^="m13 8-5.349 3.12"])'
    ],
    prime: ['.top-nav__menu > div > div:has([data-a-target="prime-offers-icon"])'],
    bits: ['.top-nav__menu > div > div:has([data-a-target="top-nav-get-bits-button"])'],
    contadores: [
      // Números rojos sobre la campana de notificaciones y la corona de Prime
      '[data-test-selector="onsite-notifications__badge"]',
      '.prime-offers__pill'
    ],
    historias: [
      // "Abrir historias" en la sección "Para ti" de la barra izquierda
      '[class*="storiesLeftNavSection"]'
    ],
    rachas: [
      // "¡Mantén tu racha!" con su "Mostrar más", en la barra izquierda
      '[role="group"]:has(> [class*="saveYourStreakSideNavRow"])'
    ]
  };

  BloqueadorOcultar.iniciar('twitch', SELECTORES);
})();
