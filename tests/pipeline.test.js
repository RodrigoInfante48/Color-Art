import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildLevel, buildAll, slugify, prettyName } from '../tools/build-levels.js';
import { removeNoise } from '../tools/lib/cleanup.js';
import { writePng } from '../tools/lib/image-io.js';

function solidImage(w, h, fn) {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b, a = 255] = fn(x, y);
    data.set([r, g, b, a], (y * w + x) * 4);
  }
  return { width: w, height: h, data };
}

test('slugify y prettyName', () => {
  assert.equal(slugify('01-Mi_Gató Feliz.png'), 'mi-gato-feliz');
  assert.equal(prettyName('02-pez_payaso.jpg'), 'Pez payaso');
});

test('buildLevel respeta tamaño, número de colores y formato', () => {
  // Cuatro cuadrantes de colores muy distintos + un píxel de ruido.
  const img = solidImage(80, 40, (x, y) => {
    if (x === 10 && y === 10) return [0, 255, 0];
    return x < 40 ? (y < 20 ? [255, 0, 0] : [0, 0, 255]) : (y < 20 ? [255, 255, 0] : [0, 0, 0]);
  });
  const { level } = buildLevel(img, { id: 'x', name: 'X', config: { size: 20, colors: 8 } });
  assert.equal(level.width, 20);
  assert.equal(level.height, 10);
  assert.equal(level.cells.length, 10);
  assert.ok(level.cells.every((r) => r.length === 20 && /^[0-9a-z]+$/.test(r)));
  assert.equal(level.palette.length, 4, 'el ruido se elimina y quedan 4 colores');
  assert.ok(level.palette.every((h) => /^#[0-9a-f]{6}$/.test(h)));
  assert.match(level.hash, /^[0-9a-f]{10}$/);
});

test('fusiona colores casi idénticos', () => {
  const img = solidImage(20, 20, (x) => (x < 10 ? [200, 50, 50] : [202, 51, 49]));
  const { level } = buildLevel(img, { id: 'x', name: 'X', config: { size: 20 } });
  assert.equal(level.palette.length, 1);
});

test('transparencia se compone sobre blanco', () => {
  const img = solidImage(10, 10, () => [0, 0, 0, 0]);
  const { level } = buildLevel(img, { id: 'x', name: 'X', config: { size: 10 } });
  assert.deepEqual(level.palette, ['#ffffff']);
});

test('es determinista', () => {
  const img = solidImage(64, 64, (x, y) => [(x * 4) & 255, (y * 4) & 255, ((x + y) * 2) & 255]);
  const a = buildLevel(img, { id: 'x', name: 'X' }).level;
  const b = buildLevel(img, { id: 'x', name: 'X' }).level;
  assert.deepEqual(a, b);
  assert.ok(a.palette.length <= 12);
});

test('removeNoise absorbe regiones chicas', () => {
  const labels = new Uint16Array([
    0, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 0, 0,
  ]);
  removeNoise(labels, 4, 3, 2);
  assert.ok(labels.every((l) => l === 0));
});

test('buildAll genera archivos, índice y aplica config', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'color-art-'));
  const src = path.join(dir, 'src'), out = path.join(dir, 'out');
  fs.mkdirSync(src);
  const img = solidImage(30, 30, (x) => (x < 15 ? [255, 0, 0] : [0, 0, 255]));
  writePng(path.join(src, '02-b.png'), img.width, img.height, img.data);
  writePng(path.join(src, '01-a.png'), img.width, img.height, img.data);
  fs.writeFileSync(path.join(src, '01-a.config.json'), JSON.stringify({ name: 'Nivel A', size: 12, unlocked: true }));
  fs.mkdirSync(out);
  fs.writeFileSync(path.join(out, 'viejo.json'), '{}');

  const { count, failures } = buildAll(src, out);
  assert.equal(count, 2);
  assert.equal(failures, 0);
  const index = JSON.parse(fs.readFileSync(path.join(out, 'index.json'), 'utf8'));
  assert.deepEqual(index.levels.map((l) => l.id), ['a', 'b']);
  assert.equal(index.levels[0].name, 'Nivel A');
  assert.equal(index.levels[0].width, 12);
  assert.equal(index.levels[0].unlocked, true);
  assert.ok(fs.existsSync(path.join(out, 'a.png')));
  assert.ok(!fs.existsSync(path.join(out, 'viejo.json')), 'borra niveles huérfanos');
});
