// Cuantización de paleta con k-means++ ponderado en espacio Lab.
// Determinista: usa un PRNG con semilla fija para que el mismo input dé el mismo nivel.
import { rgbToLab, dist2 } from './color.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {Float64Array} rgb RGB por celda
 * @param {number} k número máximo de colores
 * @param {{seed?:number, iterations?:number}} [opts]
 * @returns {{ centers: number[][], labels: Uint16Array }} centros en Lab y etiqueta por celda
 */
export function kmeans(rgb, k, { seed = 1234, iterations = 40 } = {}) {
  const n = rgb.length / 3;

  // Agrupar colores idénticos (tras redondear) para trabajar con pesos.
  const map = new Map();
  const cellToUnique = new Uint32Array(n);
  const points = [];
  const weights = [];
  for (let i = 0; i < n; i++) {
    const r = Math.round(rgb[i * 3]), g = Math.round(rgb[i * 3 + 1]), b = Math.round(rgb[i * 3 + 2]);
    const key = (r << 16) | (g << 8) | b;
    let u = map.get(key);
    if (u === undefined) {
      u = points.length;
      map.set(key, u);
      points.push(rgbToLab(r, g, b));
      weights.push(0);
    }
    weights[u]++;
    cellToUnique[i] = u;
  }

  const m = points.length;
  k = Math.min(k, m);
  const rand = mulberry32(seed);

  // Inicialización k-means++: primer centro = color más frecuente.
  let first = 0;
  for (let u = 1; u < m; u++) if (weights[u] > weights[first]) first = u;
  const centers = [points[first].slice()];
  const d2 = new Float64Array(m).fill(Infinity);
  while (centers.length < k) {
    const c = centers[centers.length - 1];
    let total = 0;
    for (let u = 0; u < m; u++) {
      const d = dist2(points[u], c);
      if (d < d2[u]) d2[u] = d;
      total += d2[u] * weights[u];
    }
    if (total === 0) break;
    let r = rand() * total;
    let pick = m - 1;
    for (let u = 0; u < m; u++) {
      r -= d2[u] * weights[u];
      if (r <= 0) { pick = u; break; }
    }
    centers.push(points[pick].slice());
  }

  // Iteraciones de Lloyd.
  const assign = new Uint16Array(m);
  for (let it = 0; it < iterations; it++) {
    let changed = false;
    for (let u = 0; u < m; u++) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = dist2(points[u], centers[c]);
        if (d < bd) { bd = d; best = c; }
      }
      if (assign[u] !== best || it === 0) { assign[u] = best; changed = true; }
    }
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let u = 0; u < m; u++) {
      const s = sums[assign[u]], p = points[u], w = weights[u];
      s[0] += p[0] * w; s[1] += p[1] * w; s[2] += p[2] * w; s[3] += w;
    }
    for (let c = 0; c < centers.length; c++) {
      const s = sums[c];
      if (s[3] > 0) centers[c] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]];
    }
    if (!changed) break;
  }

  const labels = new Uint16Array(n);
  for (let i = 0; i < n; i++) labels[i] = assign[cellToUnique[i]];
  return { centers, labels };
}
