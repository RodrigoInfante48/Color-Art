#!/usr/bin/env node
// Convierte cada imagen de levels-src/ en un nivel jugable dentro de levels/.
// Uso: npm run levels   (o: node tools/build-levels.js [--src dir] [--out dir])
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readImage, writePng } from './lib/image-io.js';
import { resizeToGrid, gridSizeFor } from './lib/resize.js';
import { kmeans } from './lib/quantize.js';
import { mergeSimilar, removeNoise, compactPalette } from './lib/cleanup.js';
import { toHex } from './lib/color.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg']);
const MAX_COLORS = 36; // las celdas se codifican con un carácter base36
const MAX_SIDE = 150;

export const DEFAULTS = {
  size: 48,          // lado mayor de la grilla, en celdas
  colors: 12,        // colores máximos de la paleta
  mergeDistance: 10, // ΔE bajo el cual dos colores se fusionan
  minRegion: 3,      // regiones más chicas que esto se absorben (ruido)
  unlocked: false,   // si true, el nivel siempre está disponible
};

/** "01-mi_gato.png" -> "mi-gato" */
export function slugify(file) {
  return path.parse(file).name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^\d+[-_ ]+/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'nivel';
}

/** "01-mi_gato.png" -> "Mi gato" */
export function prettyName(file) {
  const s = path.parse(file).name.replace(/^\d+[-_ ]+/, '').replace(/[-_]+/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : 'Nivel';
}

function readConfig(srcDir, file) {
  const cfgPath = path.join(srcDir, path.parse(file).name + '.config.json');
  if (!fs.existsSync(cfgPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch (e) {
    throw new Error(`Config inválida en ${path.basename(cfgPath)}: ${e.message}`);
  }
}

const clampInt = (v, lo, hi, name) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) throw new Error(`"${name}" debe ser un número`);
  return Math.min(hi, Math.max(lo, n));
};

/** Procesa una imagen y devuelve { level, thumb }. Función pura (no escribe archivos). */
export function buildLevel(img, { id, name, config = {} }) {
  const opts = { ...DEFAULTS, ...config };
  const size = clampInt(opts.size, 4, MAX_SIDE, 'size');
  const grid = gridSizeFor(img.width, img.height, {
    size,
    width: opts.width ? clampInt(opts.width, 4, MAX_SIDE, 'width') : undefined,
    height: opts.height ? clampInt(opts.height, 4, MAX_SIDE, 'height') : undefined,
  });
  const colors = clampInt(opts.colors, 2, MAX_COLORS, 'colors');

  const rgb = resizeToGrid(img, grid.width, grid.height);
  const { centers, labels: raw } = kmeans(rgb, colors);
  const merged = mergeSimilar(centers, raw, Number(opts.mergeDistance) || 0);
  removeNoise(raw, grid.width, grid.height, clampInt(opts.minRegion, 1, 64, 'minRegion'));
  const { palette, labels } = compactPalette(merged, raw);

  const cells = [];
  for (let y = 0; y < grid.height; y++) {
    let row = '';
    for (let x = 0; x < grid.width; x++) row += labels[y * grid.width + x].toString(36);
    cells.push(row);
  }
  const paletteHex = palette.map(toHex);
  const hash = crypto.createHash('sha1')
    .update(JSON.stringify([grid.width, grid.height, paletteHex, cells]))
    .digest('hex').slice(0, 10);

  const level = {
    id,
    name: String(opts.name || name),
    width: grid.width,
    height: grid.height,
    palette: paletteHex,
    cells,
    hash,
  };
  return { level, thumb: renderThumb(grid.width, grid.height, palette, labels), unlocked: !!opts.unlocked };
}

/** Miniatura PNG ~160px con cada celda como bloque de píxeles. */
function renderThumb(w, h, palette, labels, target = 160) {
  const s = Math.max(1, Math.floor(target / Math.max(w, h)));
  const tw = w * s, th = h * s;
  const data = new Uint8Array(tw * th * 4);
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const c = palette[labels[((y / s) | 0) * w + ((x / s) | 0)]];
      const o = (y * tw + x) * 4;
      data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
    }
  }
  return { width: tw, height: th, data };
}

export function buildAll(srcDir = path.join(ROOT, 'levels-src'), outDir = path.join(ROOT, 'levels')) {
  fs.mkdirSync(outDir, { recursive: true });
  const files = fs.readdirSync(srcDir)
    .filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

  const index = [];
  const produced = new Set(['index.json']);
  const seen = new Map();
  let failures = 0;

  for (const file of files) {
    const id = slugify(file);
    if (seen.has(id)) {
      console.error(`✗ ${file}: el id "${id}" choca con ${seen.get(id)}. Renombra uno de los dos.`);
      failures++;
      continue;
    }
    seen.set(id, file);
    try {
      const t0 = Date.now();
      const config = readConfig(srcDir, file);
      const img = readImage(path.join(srcDir, file));
      const { level, thumb, unlocked } = buildLevel(img, { id, name: prettyName(file), config });
      fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(level, null, 1) + '\n');
      writePng(path.join(outDir, `${id}.png`), thumb.width, thumb.height, thumb.data);
      produced.add(`${id}.json`).add(`${id}.png`);
      const entry = {
        id, name: level.name, width: level.width, height: level.height,
        colors: level.palette.length, thumb: `${id}.png`, hash: level.hash,
      };
      if (unlocked) entry.unlocked = true;
      index.push(entry);
      console.log(`✓ ${file} → ${id} (${level.width}x${level.height}, ${level.palette.length} colores, ${Date.now() - t0} ms)`);
    } catch (e) {
      console.error(`✗ ${file}: ${e.message}`);
      failures++;
    }
  }

  // Borrar niveles generados cuya imagen ya no existe (solo si todo salió bien,
  // para no perder un nivel existente por un error puntual).
  for (const f of failures ? [] : fs.readdirSync(outDir)) {
    if (/\.(json|png)$/.test(f) && !produced.has(f)) {
      fs.unlinkSync(path.join(outDir, f));
      console.log(`- eliminado levels/${f} (sin imagen de origen)`);
    }
  }

  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify({ version: 1, levels: index }, null, 2) + '\n');
  console.log(`\n${index.length} nivel(es) en levels/index.json${failures ? `, ${failures} con error` : ''}`);
  return { count: index.length, failures };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? path.resolve(process.argv[i + 1]) : undefined;
  };
  const { failures } = buildAll(arg('--src'), arg('--out'));
  process.exitCode = failures ? 1 : 0;
}
