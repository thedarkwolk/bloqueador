<div align="center">

<img src="icons/icon128.png" alt="Logo de Bloqueador" width="96" height="96">

# Bloqueador

**Bloqueador de anuncios personal para X, YouTube y Twitch.**
Quita anuncios, promociones y distracciones, y añade algún extra útil.

![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-sin%20dependencias-F7DF1E?logo=javascript&logoColor=black)
![Licencia MIT](https://img.shields.io/badge/licencia-MIT-green)

</div>

---

## ✨ Qué hace

Todo se activa y desactiva al momento desde el popup de la extensión, sin recargar la página.

### 𝕏 Twitter / X

| | |
|---|---|
| 🚫 **Anuncios** | Tuits promocionados del timeline, respuestas y búsquedas, y la tendencia promocionada de «Qué está pasando» |
| 🧹 **Interfaz limpia** | Fuera Premium, Grok (menú, botón flotante e icono de cada tuit), Estudio para creadores, «A quién seguir» y el pie de página |
| ⭐ **Tus favoritos** | Recuadro en la columna derecha con el último tuit de las cuentas que elijas, filtrando por todo, posts, respuestas o retuits |
| 📂 **«Qué está pasando» desplegable** | Pulsa el título para plegar o desplegar las tendencias |
| ⬇️ **Descargar vídeos** | Botón de descarga en los tuits con vídeo, en la mejor calidad disponible |
| 🔗 **Estadísticas arriba y copiar enlace** | Las visualizaciones pasan a la cabecera del tuit y en su hueco aparece un botón para copiar el enlace |

### ▶️ YouTube

| | |
|---|---|
| ⏩ **Anuncios de vídeo** | Se saltan solos, antes y durante el vídeo (silenciados y a velocidad máxima hasta que se pueden omitir) |
| 📱 **Anuncios en Shorts** | Pasa al Short siguiente cuando sale un anuncio |
| 🚫 **Anuncios de la página** | Portada, sugerencias, búsquedas y tarjetas patrocinadas |
| 🧹 **Premium** | Banners y avisos para suscribirse a YouTube Premium |

### 🟣 Twitch

| | |
|---|---|
| 📺 **Anuncios en directo** | Durante la pausa publicitaria sigues viendo y oyendo el directo en lugar del anuncio |
| 🚫 **Anuncios de la página** | Portada, vídeos junto al chat y banners patrocinados |
| 🧹 **Promociones** | Turbo, Prime, Bits, regalar suscripciones y el texto de descuento del botón de suscribirse |
| 🔕 **Distracciones** | Mayores donantes, avisos encima del chat, contadores rojos, campana, historias y rachas |

## 📦 Instalación

La extensión no está en la Chrome Web Store: se instala a mano en un momento.

1. Descarga el repositorio: botón verde **Code → Download ZIP** (y descomprímelo) o
   ```bash
   git clone https://github.com/thedarkwolk/bloqueador.git
   ```
2. Abre `chrome://extensions` en Chrome (también vale en Edge, Brave y otros basados en Chromium).
3. Activa el **Modo de desarrollador** (arriba a la derecha).
4. Pulsa **Cargar descomprimida** y elige la carpeta del repositorio.
5. Fija el icono en la barra para tener el popup a mano.

**Para actualizar:** descarga la versión nueva (o `git pull`), pulsa el icono de recargar en la tarjeta de la extensión y refresca las pestañas abiertas.

## 🎛️ Uso

Pulsa el icono de Bloqueador para abrir el popup: a la izquierda eliges el sitio y a la derecha activas o desactivas cada opción. El interruptor de arriba pausa la extensión entera.

**Tus favoritos (X):** pulsa el icono de añadir junto al título del recuadro, escribe `@usuario` (o pega el enlace del perfil) y pulsa Intro. Con el campo abierto aparece una ✕ en cada cuenta para quitarla. Los botones **Todo · Posts · Respuestas · Retuits** eligen qué tuit de cada cuenta se muestra. Se actualiza solo cada 5 minutos.

**Modo revisión:** en el panel *Info* del popup. Lo bloqueado se marca en rojo en vez de ocultarse, para comprobar que no se esconde nada que no debería.

## 🔒 Privacidad

- No recoge ni envía datos a ningún servidor propio o de terceros. No hay analíticas.
- Los ajustes se guardan en el almacenamiento de Chrome (se sincronizan con tu cuenta de Chrome si tienes la sincronización activada).
- «Tus favoritos» pide los tuits a la propia API de X con tu sesión, igual que hace la web de X.
- Permisos: `storage` (ajustes) y `downloads` (descargar vídeos de X). Solo actúa en x.com, youtube.com y twitch.tv.

## 🛠️ Desarrollo

JavaScript plano, sin compilación ni dependencias: Chrome carga los archivos tal cual.

```
manifest.json
src/
├── comun/     ajustes compartidos y hoja de estilos para ocultar
├── popup/     interfaz del popup
├── sitios/    un content script por sitio (twitter*.js, youtube.js, twitch.js)
└── fondo.js   service worker (solo para las descargas)
```

Tras cambiar algo, recarga la extensión en `chrome://extensions` y refresca la pestaña. La arquitectura y las decisiones de cada sitio están explicadas en [`CLAUDE.md`](CLAUDE.md).

## 📄 Licencia

[MIT](LICENSE) © 2026 jiji. Puedes usarlo, modificarlo y compartirlo libremente siempre que mantengas el aviso de copyright.

Iconos de [Phosphor Icons](https://phosphoricons.com) (MIT).
