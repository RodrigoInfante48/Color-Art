# CLAUDE.md: contexto del proyecto Color Art

> **Instrucción para Claude:** al **inicio** de cada sesión lee este archivo completo. Al **final**
> de cada sesión actualízalo: arquitectura si cambió, formato de nivel si cambió, y agrega una
> entrada al «Registro de decisiones» por cada decisión relevante que se haya tomado.

## Objetivo
Juego web de colorear por números, **mobile-first** (se juega con el dedo), publicado en GitHub Pages.
El dueño del repo agrega niveles subiendo imágenes a `levels-src/`. Un pipeline Node los convierte
en niveles JSON y un workflow los publica automáticamente.

## Restricciones (no negociables)
- **GitHub Pages**: solo archivos estáticos. No hay servidor, base de datos ni API propia.
- **Vanilla**: HTML + CSS + JavaScript con ES modules y Canvas 2D. Sin frameworks ni bundler **en el juego**.
  `package.json` y `node_modules` existen **solo** para `tools/` y `tests/`.
- **Rutas relativas siempre** (`levels/...`, `js/...`). El sitio vive bajo `/<repo>/`. Nunca uses rutas que empiecen con `/`.
  En JS se resuelven con `new URL('levels/', document.baseURI)`.
- **Textos de UI** solo en `js/strings/<lang>.js`, usados con `t('clave')` o `data-i18n*` en el HTML. Nada de strings visibles hardcodeados.
- `localStorage` siempre dentro de try/catch (`js/storage.js`).
- Rendimiento objetivo: fluido en celulares medianos con grillas de hasta 100×100 (máx. permitido por el pipeline: 150).

## Arquitectura

### Juego (`index.html` + `js/`)
Navegación por hash: `#/` = catálogo, `#/nivel/<id>` = partida. El botón atrás del celular funciona.

| Módulo | Responsabilidad | DOM |
|---|---|---|
| `main.js` | Arranque, router por hash, crea y destruye la sesión de juego, botones, guardado con debounce (400 ms) y al ocultar la página | sí |
| `i18n.js` + `strings/es.js` | `t(key, vars)`, `applyI18n()`, detección de idioma | sí (solo en apply) |
| `levels.js` | `loadCatalog()`, `loadLevel(id)`, `parseLevel(raw)` (valida y pasa filas base36 a `Uint8Array`) | no* |
| `catalog.js` | `levelStatuses()` (regla de desbloqueo, pura) y `renderCatalog()` | sí |
| `game.js` | Clase `Game` (EventTarget): celdas pintadas, restantes por color, `paint()`, `findHint()`, `nextPendingColor()`. Eventos: `paint`, `select`, `colordone`, `complete` | no |
| `viewport.js` | Clase `Viewport`: `scale` (px CSS por celda), `ox/oy`; zoom hacia un punto, pan con límites, `fitState()`, animación (`animateTo` y `step`) | no |
| `renderer.js` | Canvas por capas y redibujo en rAF (detalle abajo) | sí |
| `input.js` | Pointer Events: tocar/arrastrar pinta, 2 dedos = pellizco y pan, rueda = zoom, clic derecho/central o Espacio = pan | sí |
| `palette.js` | Botones de color con anillo de progreso (`conic-gradient` con `--p`) | sí |
| `finish.js` | Revelado diagonal de la imagen final y `downloadBlob()` | sí |
| `storage.js` | `getLevelProgress`, `saveLevelProgress`, `clearLevelProgress`, bitset en base64 | no* |

\* usan APIs del navegador (`fetch`, `localStorage`, `btoa`) solo dentro de funciones, así que se pueden importar en Node.

**Flujo de datos:** `levels.js` → `new Game(level, paintedGuardado)` → eventos del `Game` → `Renderer` y `PaletteBar` se actualizan; `main.js` guarda. `input.js` traduce gestos a llamadas de `Viewport` (cámara) o `onPaint(cells)` → `game.paint()`.

**Renderer:**
- `colorLayer`: canvas fuera de pantalla de 1 px por celda. Las celdas pintadas llevan el color real; las no pintadas, un gris claro según la luminancia del color final. Pintar una celda modifica solo su píxel (`putImageData` con dirty rect).
- `highlightLayer`: igual de tamaño; sombrea las pendientes del color elegido. Se reconstruye al cambiar de color.
- Las dos capas se dibujan escaladas con `imageSmoothingEnabled = false`. Encima van la grilla (≥7 px/celda) y los números (≥10 px/celda), **solo en las celdas visibles**. Los números salen de un **atlas de glifos** precalculado.
- Si solo cambiaron celdas o efectos, se redibuja un **rectángulo recortado** alineado a píxeles del dispositivo. Si cambió la cámara, se redibuja todo. Nunca se dibuja fuera de `requestAnimationFrame`.
- DPR limitado a 2.

**Reglas de juego:** solo se pinta si el color elegido es el de la celda. Un toque erróneo da feedback (parpadeo rojo, vibración corta y un toast cada 4 s como máximo). En arrastre, las celdas erróneas se ignoran en silencio. Al completar un color se elige solo el siguiente pendiente. Desbloqueo: los 3 primeros niveles están abiertos; los demás se abren si el anterior está completado, si ya tienen progreso o si traen `unlocked: true`.

### Pipeline (`tools/`)
`npm run levels` → `tools/build-levels.js`: por cada `levels-src/*.{png,jpg,jpeg}`, en orden natural de nombre de archivo:
1. `lib/image-io.js`: decodifica (pngjs / jpeg-js, JS puro).
2. `lib/resize.js`: promedio por área a la grilla (lado mayor = `size`, respeta proporción); la transparencia pasa a blanco.
3. `lib/quantize.js`: **k-means++ ponderado en Lab** con PRNG de semilla fija (**determinista**: misma imagen → mismo JSON).
4. `lib/cleanup.js`: `mergeSimilar` (fusiona centros con ΔE76 < `mergeDistance`), `removeNoise` (regiones 4-conexas < `minRegion` pasan al color vecino mayoritario en 8-vecindad) y `compactPalette` (quita colores sin uso y ordena de oscuro a claro).
5. Escribe `levels/<id>.json`, la miniatura `levels/<id>.png` (~160 px) y `levels/index.json`. Borra los archivos huérfanos (solo si no hubo errores). Termina con código 1 si alguna imagen falla.

Config opcional `levels-src/<nombre>.config.json`: `name`, `size`, `width`, `height`, `colors` (2–36), `mergeDistance`, `minRegion`, `unlocked`.
`tools/make-samples.js` dibuja las 3 imágenes de ejemplo (01–03). Los niveles 04–08 son pinturas de dominio público subidas por el dueño (fuentes de 120×120 px).
**Receta para fotos/pinturas:** `size` 64, `colors` 20, `mergeDistance` 6. Para dibujos planos bastan los valores por defecto.

### Formato exacto de nivel: `levels/<id>.json`
```json
{
 "id": "corazon",               // slug del nombre de archivo sin prefijo numérico
 "name": "Corazón",             // nombre visible
 "width": 32,                   // columnas
 "height": 32,                  // filas
 "palette": ["#c51b4a", "..."], // hex en minúsculas, ordenado de oscuro a claro; el número visible es índice+1
 "cells": ["3333...", "..."],   // `height` strings de `width` caracteres; cada carácter = índice de paleta en base36 (0-9a-z)
 "hash": "23559be092"           // sha1 corto de [width,height,palette,cells]; invalida el progreso guardado si cambia
}
```
`levels/index.json`:
```json
{ "version": 1, "levels": [ { "id", "name", "width", "height", "colors", "thumb": "<id>.png", "hash", "unlocked"?: true } ] }
```
`thumb` es relativo a `levels/`.

**localStorage** (`color-art:v1`): `{ levels: { <id>: { hash, painted: base64-bitset, pct, completed, t } } }`.

### Deploy (`.github/workflows/pages.yml`)
En cada push a `main` (o manual):
- Job `levels`: si cambió `levels-src/`, `tools/` o `package*.json` (o si se fuerza), corre `npm ci && npm test && npm run levels` y hace commit de `levels/` con `[skip ci]`. Expone el SHA resultante.
- Job `deploy`: checkout de ese SHA, copia solo `index.html favicon.svg css js levels` a `_site/` y publica con `actions/deploy-pages`.

Hace falta un solo workflow encadenado porque los commits hechos con `GITHUB_TOKEN` no disparan otros workflows.
Pages debe estar configurado con **Source: GitHub Actions**.

## Convenciones de código
- ES modules, `const`/`let`, sin dependencias en el juego. 2 espacios, comillas simples, punto y coma.
- Comentarios y textos en español. Nombres de código en inglés.
- La lógica pura (sin DOM) va en módulos testeables (`game.js`, `viewport.js`, `levels.parseLevel`, `catalog.levelStatuses`, `tools/lib/*`).
- Si agregas un texto visible, agrega su clave a `strings/es.js`.
- No edites `levels/` a mano: se regenera.
- Estilos: variables CSS en `:root` y tema oscuro por `prefers-color-scheme`. Objetivos táctiles ≥44 px.

## Cómo probar
- `npm test`: pruebas unitarias con `node:test` (pipeline, reglas de juego, viewport, desbloqueo).
- `npm run levels` y revisar el log (tamaño y colores por nivel).
- `npm run serve` y abrir `http://localhost:8080`. Para simular la subruta de Pages, sirve la carpeta **padre**
  (o un symlink `Color-Art` → repo) y abre `http://localhost:8080/Color-Art/`.
- E2E manual o con Playwright (Chromium está en `/opt/pw-browsers/chromium` en el entorno de Claude Code web). Verificado así en la sesión 1:
  emulación de Pixel 7, pintar un nivel completo con toques, recargar para comprobar la persistencia, pellizco con `Input.dispatchTouchEvent` por CDP, pista y descarga del PNG.
  Rendimiento: nivel de 100×100 con 30 colores y CPU ×4 más lenta → `draw()` completo con mediana de 2 ms, redibujo parcial de 0,1 ms.
- Validar el workflow con `actionlint`.

## Registro de decisiones
| Fecha | Decisión | Motivo |
|---|---|---|
| 2026-09-24 | Decodificar imágenes con `pngjs` + `jpeg-js` en vez de `sharp` | JS puro: sin binarios nativos que fallen en CI o en otras máquinas; la redimensión propia por promedio de área basta para grillas ≤150 |
| 2026-09-24 | Cuantización k-means++ en Lab con semilla fija | Mejores paletas perceptuales que median cut; determinista para que los JSON no cambien sin motivo en git |
| 2026-09-24 | Celdas como array de strings base36 (una por fila) | Compacto (~10 KB para 100×100), legible y con diffs por fila; límite de 36 colores |
| 2026-09-24 | Paleta ordenada de oscuro a claro | Orden estable y predecible en la barra |
| 2026-09-24 | Un solo workflow con jobs `levels` → `deploy` | Los pushes con `GITHUB_TOKEN` no disparan otro workflow; el deploy usa el SHA con los niveles nuevos |
| 2026-09-24 | Navegación por hash | Funciona en Pages sin reescrituras 404 y el botón atrás del celular vuelve al catálogo |
| 2026-09-24 | Renderer con capas de 1 px por celda + atlas de números + dirty rect alineado al píxel | Fluido con 100×100; el recorte con bordes fraccionarios dejaba "fantasmas" antialiasados |
| 2026-09-24 | Un toque con 1 dedo espera 70 ms (o 6 px de movimiento) antes de pintar | Permite empezar un pellizco sin pintar por accidente; al soltar un dedo del pellizco, el otro solo desplaza |
| 2026-09-24 | Sin color elegido o con «modo mover», 1 dedo desplaza | Hay alternativa al pellizco para mover el lienzo |
| 2026-09-24 | Desbloqueo: 3 primeros abiertos, luego secuencial; `unlocked` en la config lo fuerza | Da variedad al inicio sin perder la progresión |
| 2026-09-24 | Progreso como bitset base64 + `hash` del nivel | ~1,7 KB por nivel de 100×100; si el nivel se regenera distinto, se descarta el progreso parcial sin romper nada |
| 2026-09-24 | Pinturas famosas (niveles 04–08) con `size: 64`, `colors: 20`, `mergeDistance: 6`, `minRegion: 3` | Comparé 48/12, 56/16, 64/20 y 64-72/24 en un montaje: con `mergeDistance: 10` Venus colapsaba a 6 colores (paleta apagada); 24 colores o 72 celdas casi no suman detalle con fuentes de 120 px y hacen el nivel más tedioso |
| 2026-09-24 | Pinturas 04–08 con `unlocked: true` | Pedido del dueño: disponibles desde el inicio, sin completar los niveles anteriores |
