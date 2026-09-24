// Limpieza para jugabilidad: fusionar colores parecidos, eliminar ruido y compactar la paleta.
import { dist2, labToRgb } from './color.js';

/**
 * Fusiona centros con ΔE76 < threshold (promedio ponderado por cantidad de celdas).
 * Modifica `labels` en sitio y devuelve los nuevos centros.
 */
export function mergeSimilar(centers, labels, threshold) {
  const counts = new Array(centers.length).fill(0);
  for (const l of labels) counts[l]++;
  let cs = centers.map((c, i) => ({ lab: c.slice(), count: counts[i], alias: i }));
  const t2 = threshold * threshold;
  for (;;) {
    let bi = -1, bj = -1, bd = Infinity;
    for (let i = 0; i < cs.length; i++) {
      if (!cs[i].count) continue;
      for (let j = i + 1; j < cs.length; j++) {
        if (!cs[j].count) continue;
        const d = dist2(cs[i].lab, cs[j].lab);
        if (d < bd) { bd = d; bi = i; bj = j; }
      }
    }
    if (bi < 0 || bd >= t2) break;
    const a = cs[bi], b = cs[bj], w = a.count + b.count;
    a.lab = a.lab.map((v, k) => (v * a.count + b.lab[k] * b.count) / w);
    a.count = w;
    b.count = 0;
    b.alias = bi;
  }
  const resolve = (i) => { while (cs[i].alias !== i) i = cs[i].alias; return i; };
  for (let i = 0; i < labels.length; i++) labels[i] = resolve(labels[i]);
  return cs.map((c) => c.lab);
}

/**
 * Reasigna regiones conectadas (4-vecindad) más chicas que minRegion al color vecino mayoritario.
 * Repite hasta estabilizar (máx. `passes`). Modifica `labels` en sitio.
 */
export function removeNoise(labels, width, height, minRegion, passes = 6) {
  if (minRegion <= 1) return;
  const n = width * height;
  const region = new Int32Array(n);
  const stack = new Int32Array(n);
  for (let pass = 0; pass < passes; pass++) {
    region.fill(-1);
    let changed = false;
    let rid = 0;
    for (let start = 0; start < n; start++) {
      if (region[start] !== -1) continue;
      const color = labels[start];
      // Flood fill iterativo.
      const cells = [];
      let sp = 0;
      stack[sp++] = start;
      region[start] = rid;
      while (sp) {
        const i = stack[--sp];
        cells.push(i);
        const x = i % width, y = (i / width) | 0;
        if (x > 0 && region[i - 1] === -1 && labels[i - 1] === color) { region[i - 1] = rid; stack[sp++] = i - 1; }
        if (x < width - 1 && region[i + 1] === -1 && labels[i + 1] === color) { region[i + 1] = rid; stack[sp++] = i + 1; }
        if (y > 0 && region[i - width] === -1 && labels[i - width] === color) { region[i - width] = rid; stack[sp++] = i - width; }
        if (y < height - 1 && region[i + width] === -1 && labels[i + width] === color) { region[i + width] = rid; stack[sp++] = i + width; }
      }
      rid++;
      if (cells.length >= minRegion) continue;
      // Color vecino mayoritario (8-vecindad para suavizar diagonales).
      const votes = new Map();
      for (const i of cells) {
        const x = i % width, y = (i / width) | 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const l = labels[ny * width + nx];
            if (l !== color) votes.set(l, (votes.get(l) || 0) + 1);
          }
        }
      }
      let best = -1, bv = 0;
      for (const [l, v] of votes) if (v > bv || (v === bv && l < best)) { bv = v; best = l; }
      if (best >= 0) {
        for (const i of cells) labels[i] = best;
        changed = true;
      }
    }
    if (!changed) break;
  }
}

/**
 * Elimina colores sin uso, ordena la paleta de oscuro a claro y remapea `labels`.
 * @returns {{ palette: number[][], labels: Uint8Array }} paleta en RGB
 */
export function compactPalette(centers, labels) {
  const used = new Map();
  for (const l of labels) used.set(l, (used.get(l) || 0) + 1);
  const order = [...used.keys()].sort((a, b) => centers[a][0] - centers[b][0] || a - b);
  const remap = new Map(order.map((old, i) => [old, i]));
  const out = new Uint8Array(labels.length);
  for (let i = 0; i < labels.length; i++) out[i] = remap.get(labels[i]);
  return { palette: order.map((i) => labToRgb(...centers[i])), labels: out };
}
