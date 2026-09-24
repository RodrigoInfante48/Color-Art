#!/usr/bin/env node
// Genera las imágenes de ejemplo en levels-src/ dibujando formas simples por código.
// Uso: npm run samples
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writePng } from './lib/image-io.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'levels-src');
const SIZE = 240;
const SS = 3; // supersampling por eje

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** Rasteriza una escena: `paint(x, y)` recibe coords en [0,1] y devuelve un color hex. */
function render(paint, w = SIZE, h = SIZE) {
  const data = new Uint8Array(w * h * 4);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = hex(paint((px + (sx + 0.5) / SS) / w, (py + (sy + 0.5) / SS) / h));
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const o = (py * w + px) * 4, n = SS * SS;
      data[o] = r / n; data[o + 1] = g / n; data[o + 2] = b / n; data[o + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

const circle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 < r * r;
const ellipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1;

function heart(x, y) {
  // Fondo con lunares, corazón con brillo.
  const X = (x - 0.5) * 2.8, Y = (0.55 - y) * 2.8;
  const inHeart = (X * X + Y * Y - 1) ** 3 - X * X * Y ** 3 < 0;
  if (inHeart) {
    if (ellipse(x, y, 0.36, 0.36, 0.07, 0.045)) return '#ffd6e0';
    if ((X * X + Y * Y - 1) ** 3 - X * X * Y ** 3 > -0.02) return '#a4133c';
    return (x + y) > 1.05 ? '#c9184a' : '#ff4d6d';
  }
  const gx = (x * 6) % 1, gy = (y * 6) % 1;
  if (circle(gx, gy, 0.5, 0.5, 0.12)) return '#ffb3c1';
  return '#fff0f3';
}

function fish(x, y) {
  // Burbujas.
  if (circle(x, y, 0.82, 0.22, 0.035) || circle(x, y, 0.88, 0.12, 0.025) || circle(x, y, 0.78, 0.08, 0.018)) return '#e0fbfc';
  // Ojo.
  if (circle(x, y, 0.64, 0.45, 0.022)) return '#1b1b1e';
  if (circle(x, y, 0.64, 0.45, 0.045)) return '#ffffff';
  // Cuerpo con franjas.
  if (ellipse(x, y, 0.5, 0.5, 0.25, 0.15)) {
    const stripe = Math.abs(x - 0.6) < 0.03 || Math.abs(x - 0.44) < 0.03;
    if (stripe) return '#ffffff';
    if (Math.abs(x - 0.6) < 0.045 || Math.abs(x - 0.44) < 0.045) return '#1b1b1e';
    return y > 0.55 ? '#f77f00' : '#fcbf49';
  }
  // Cola.
  const tx = 0.27 - x;
  if (tx > 0 && tx < 0.14 && Math.abs(y - 0.5) < tx * 1.1) return '#f77f00';
  // Aleta superior.
  if (y < 0.38 && y > 0.3 && x > 0.42 && x < 0.58 && y > 0.38 - (x - 0.42) * 0.6) return '#f77f00';
  // Algas.
  for (const [cx, hgt] of [[0.12, 0.35], [0.22, 0.25], [0.88, 0.3]]) {
    const sx = cx + Math.sin(y * 18) * 0.02;
    if (y > 1 - hgt && Math.abs(x - sx) < 0.025) return '#2a9d8f';
  }
  // Arena.
  if (y > 0.9 + Math.sin(x * 9) * 0.02) return '#e9c46a';
  return y < 0.5 ? '#48cae4' : '#0096c7';
}

function sunset(x, y) {
  const hills = 0.78 + Math.sin(x * 7 + 1) * 0.04;
  if (y > hills) return y > 0.9 ? '#386641' : '#6a994e';
  // Montañas.
  const m1 = 0.35 + Math.abs(x - 0.3) * 1.2;
  const m2 = 0.45 + Math.abs(x - 0.72) * 1.1;
  if (y > m1 || y > m2) {
    const peak = y > m1 ? [0.3, 0.35] : [0.72, 0.45];
    if (y < peak[1] + 0.08) return '#f8f9fa';
    return x < peak[0] ? '#6d597a' : '#355070';
  }
  if (circle(x, y, 0.55, 0.42, 0.12)) return '#ffd166';
  // Nubes.
  if (circle(x, y, 0.15, 0.15, 0.05) || circle(x, y, 0.21, 0.13, 0.065) || circle(x, y, 0.27, 0.16, 0.045)) return '#ffffff';
  // Cielo por franjas.
  if (y < 0.2) return '#e56b6f';
  if (y < 0.35) return '#f28f3b';
  return '#f6bd60';
}

const samples = [
  { file: '01-corazon.png', paint: heart, config: { name: 'Corazón', size: 32, colors: 6, unlocked: true } },
  { file: '02-pez.png', paint: fish, config: { name: 'Pez payaso', size: 48, colors: 10 } },
  { file: '03-atardecer.png', paint: sunset, config: { name: 'Atardecer en la montaña', size: 56, colors: 12 } },
];

fs.mkdirSync(OUT, { recursive: true });
for (const s of samples) {
  const img = render(s.paint);
  writePng(path.join(OUT, s.file), img.width, img.height, img.data);
  fs.writeFileSync(path.join(OUT, s.file.replace(/\.png$/, '.config.json')), JSON.stringify(s.config, null, 2) + '\n');
  console.log(`✓ levels-src/${s.file}`);
}
