# Color Art 🎨

Juego web de **colorear por números** pensado para jugarse en el celular con el dedo.
Eliges un dibujo, tocas un color de la paleta y pintas las celdas que tienen ese número
hasta completar la imagen. Es 100% estático: HTML, CSS y JavaScript sin frameworks,
publicado en GitHub Pages.

**Jugar:** https://rodrigoinfante48.github.io/Color-Art/ *(placeholder: se activa cuando GitHub Pages esté configurado, ver más abajo)*

---

## Cómo jugar

1. En la pantalla de inicio elige un dibujo. Los niveles bloqueados (🔒) se abren al completar el anterior.
2. Abajo está la **paleta**. Toca un color: sus celdas se sombrean en el lienzo.
3. **Toca o arrastra** sobre las celdas para pintarlas. Solo se pintan las que corresponden al color elegido; si te equivocas, la celda parpadea en rojo.
4. El anillo de cada color muestra su avance y se marca con ✓ al terminarlo. Luego pasa solo al siguiente color pendiente.
5. Al terminar verás la obra sin números y podrás **descargarla como PNG**.

| Gesto | Celular | Computador |
|---|---|---|
| Pintar | tocar / arrastrar con 1 dedo | clic / arrastrar con botón izquierdo |
| Zoom | pellizcar con 2 dedos | rueda del mouse (o `+` / `-`) |
| Mover lienzo | arrastrar con 2 dedos, o botón ✥ «Mover» y 1 dedo | arrastrar con botón derecho/central, o mantener `Espacio` |
| Ver todo | botón ⛶ | botón ⛶ |
| Pista | botón 💡: lleva a la celda pendiente más cercana del color elegido | igual |

El progreso se guarda solo en tu navegador (`localStorage`). En modo privado el juego funciona, pero no recuerda el avance.

---

## Cómo agregar un nivel nuevo

1. **Prepara la imagen** (PNG o JPG). Funcionan mejor las imágenes con formas claras y pocos colores: ilustraciones, íconos, pixel art. Las fotos también sirven, pero con más detalle perdido. La transparencia se convierte en blanco.
2. **Ponle un nombre de archivo** con un prefijo numérico para el orden del catálogo, por ejemplo `levels-src/04-gato.png`.
   - El **id** del nivel sale del nombre sin prefijo ni acentos: `gato`.
   - El **nombre visible** por defecto es `Gato`.
3. **(Opcional) Crea un archivo de configuración** con el mismo nombre: `levels-src/04-gato.config.json`.
   ```json
   {
     "name": "Gato dormilón",
     "size": 64,
     "colors": 14,
     "minRegion": 3,
     "mergeDistance": 10,
     "unlocked": false
   }
   ```
   | Opción | Por defecto | Qué hace |
   |---|---|---|
   | `name` | según el archivo | Nombre que se ve en el juego |
   | `size` | `48` | Celdas del **lado mayor**; el otro lado respeta la proporción de la imagen (máx. 150) |
   | `width` / `height` | — | Fija el tamaño exacto de la grilla (si pones solo uno, el otro se calcula) |
   | `colors` | `12` | Máximo de colores de la paleta (2–36) |
   | `mergeDistance` | `10` | Colores más parecidos que esta distancia (ΔE en Lab) se fusionan en uno |
   | `minRegion` | `3` | Manchas de menos celdas que esto se absorben en el color vecino (quita el "ruido") |
   | `unlocked` | `false` | Si es `true`, el nivel nunca está bloqueado |
4. **Súbelo a `main`**: arrastra los archivos a la carpeta `levels-src/` desde la web de GitHub (*Add file → Upload files*) o haz commit y push.
5. **Qué pasa después (automático):** el workflow *Niveles y deploy a GitHub Pages*:
   1. detecta que cambió `levels-src/`,
   2. corre `npm run levels`, que genera `levels/gato.json`, la miniatura `levels/gato.png` y actualiza `levels/index.json`,
   3. hace commit de esos archivos (`chore(levels): regenerar niveles [skip ci]`),
   4. publica el sitio. En 1–2 minutos el nivel aparece en el juego.

   Puedes seguir el avance en la pestaña **Actions** del repo.

¿No te gustó el resultado? Ajusta el `.config.json` (más `colors`, otro `size`, etc.) y vuelve a subirlo.
También puedes previsualizarlo localmente (ver abajo) antes de subirlo.
Para **quitar** un nivel, borra su imagen de `levels-src/`: el script elimina los archivos generados.

> Nota: si cambias un nivel que alguien ya estaba pintando, su progreso parcial de ese nivel se reinicia
> (el nivel lleva un `hash`). Si ya lo había completado, sigue contando como completado.

---

## Correrlo localmente

Requisitos: Node 18+ (solo para las herramientas) y cualquier servidor estático.

```bash
npm install        # dependencias del pipeline (pngjs, jpeg-js)
npm run levels     # genera levels/ desde levels-src/
npm test           # pruebas unitarias (node:test)
npm run serve      # python3 -m http.server 8080  → http://localhost:8080
```

Sin Python, `npx http-server -p 8080` sirve igual. El juego **no** funciona abriendo `index.html`
directo con `file://`, porque los módulos ES y `fetch` necesitan HTTP.

`npm run samples` regenera las 3 imágenes de ejemplo de `levels-src/`.

---

## Estructura del repo

```
index.html              Página única (catálogo, juego y diálogo final)
favicon.svg
css/styles.css          Estilos mobile-first (tema claro/oscuro automático)
js/
  main.js               Arranque, navegación por hash (#/ y #/nivel/<id>) y conexión de módulos
  i18n.js               t('clave') y aplicación de textos al HTML
  strings/es.js         Todos los textos de la interfaz (agregar en.js para inglés)
  levels.js             Carga de levels/index.json y levels/<id>.json
  catalog.js            Pantalla de inicio y reglas de desbloqueo
  game.js               Estado y reglas de la partida (sin DOM)
  viewport.js           Cámara: zoom y desplazamiento (sin DOM)
  renderer.js           Dibujo en Canvas por capas y redibujo parcial
  input.js              Toque, pellizco, mouse y rueda (Pointer Events)
  palette.js            Barra de colores con progreso
  finish.js             Animación final y descarga PNG
  storage.js            Progreso en localStorage (con try/catch)
levels/                 GENERADO: niveles JSON, miniaturas e index.json (no editar a mano)
levels-src/             Imágenes fuente + configs opcionales
tools/
  build-levels.js       Pipeline de imagen a nivel (npm run levels)
  make-samples.js       Dibuja las imágenes de ejemplo
  lib/                  Lectura PNG/JPG, redimensión, k-means en Lab, limpieza
tests/                  Pruebas con node:test
.github/workflows/pages.yml   Genera niveles y publica en GitHub Pages
CLAUDE.md               Contexto técnico y registro de decisiones
```

## Activar GitHub Pages (una sola vez)

1. **Settings → Pages → Build and deployment → Source: «GitHub Actions»**.
2. Listo: el próximo push a `main` (o *Actions → Niveles y deploy → Run workflow*) publica el sitio.

Si el paso de commit de niveles falla con un error de permisos:
- Revisa **Settings → Actions → General → Workflow permissions**. El workflow ya pide `contents: write`, pero una organización puede restringirlo.
- Si `main` tiene reglas de protección que bloquean pushes directos, permite que `github-actions[bot]` las omita, o genera los niveles localmente con `npm run levels` y súbelos junto a la imagen.
