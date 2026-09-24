// Carga del catálogo y de niveles. Todas las rutas son relativas al documento para
// que funcione bajo https://<usuario>.github.io/<repo>/.
const base = () => new URL('levels/', document.baseURI);

async function getJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status} al cargar ${url}`);
  return res.json();
}

/** @returns {Promise<Array<{id,name,width,height,colors,thumbUrl,hash,unlocked?}>>} */
export async function loadCatalog() {
  const data = await getJson(new URL('index.json', base()));
  return (data.levels || []).map((l) => ({ ...l, thumbUrl: new URL(l.thumb, base()).href }));
}

/** Descarga un nivel y lo convierte a estructura de juego (celdas en Uint8Array). */
export async function loadLevel(id) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error('id de nivel inválido');
  return parseLevel(await getJson(new URL(`${id}.json`, base())));
}

export function parseLevel(raw) {
  const { id, name, width, height, palette, cells: rows, hash } = raw;
  if (!Array.isArray(rows) || rows.length !== height) throw new Error('nivel mal formado: filas');
  const cells = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = rows[y];
    if (row.length !== width) throw new Error(`nivel mal formado: fila ${y}`);
    for (let x = 0; x < width; x++) {
      const v = parseInt(row[x], 36);
      if (!(v < palette.length)) throw new Error(`color fuera de paleta en ${x},${y}`);
      cells[y * width + x] = v;
    }
  }
  return { id, name, width, height, palette, cells, hash };
}
