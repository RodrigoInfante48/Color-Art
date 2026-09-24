import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { parseLevel } from '../js/levels.js';
import { Viewport } from '../js/viewport.js';
import { levelStatuses } from '../js/catalog.js';

const raw = { id: 't', name: 'T', width: 3, height: 2, palette: ['#000000', '#ffffff'], cells: ['010', '001'], hash: 'h' };

test('parseLevel convierte filas base36 a Uint8Array', () => {
  const lvl = parseLevel(raw);
  assert.deepEqual([...lvl.cells], [0, 1, 0, 0, 0, 1]);
  assert.throws(() => parseLevel({ ...raw, cells: ['012', '001'] }));
});

test('solo pinta con el color correcto y emite eventos', () => {
  const game = new Game(parseLevel(raw));
  const events = [];
  for (const ev of ['paint', 'colordone', 'complete']) game.addEventListener(ev, () => events.push(ev));

  assert.deepEqual(game.paint([0]), { painted: [], wrong: [] }, 'sin color elegido no hace nada');
  game.select(1);
  assert.deepEqual(game.paint([0, 1]), { painted: [1], wrong: [0] });
  assert.equal(game.remaining[1], 1);
  game.paint([5]);
  assert.ok(game.isColorDone(1));
  game.select(0);
  game.paint([0, 2, 3, 4]);
  assert.ok(game.isComplete);
  assert.deepEqual(events, ['paint', 'paint', 'colordone', 'paint', 'colordone', 'complete']);
});

test('restaura progreso guardado y ofrece pistas', () => {
  const painted = new Uint8Array([1, 0, 0, 0, 0, 0]);
  const game = new Game(parseLevel(raw), painted);
  assert.equal(game.paintedCount, 1);
  game.select(0);
  assert.deepEqual(game.findHint(0, 0), { x: 0, y: 1 });
  assert.equal(game.nextPendingColor(0), 0);
});

test('viewport: zoom hacia un punto mantiene la celda bajo el cursor', () => {
  const vp = new Viewport(50, 50);
  vp.setViewSize(400, 800);
  const before = [vp.toCellX(123), vp.toCellY(456)];
  vp.zoomAt(2, 123, 456);
  assert.ok(Math.abs(vp.toCellX(123) - before[0]) < 1e-9);
  assert.ok(Math.abs(vp.toCellY(456) - before[1]) < 1e-9);
  assert.equal(vp.cellAt(-5000, -5000), null);
});

test('desbloqueo de niveles', () => {
  const levels = [1, 2, 3, 4, 5].map((i) => ({ id: `l${i}` }));
  const prog = { l3: { completed: true }, l2: { pct: 40 } };
  const st = levelStatuses(levels, (id) => prog[id] || {}).map((s) => s.status);
  assert.deepEqual(st, ['new', 'progress', 'completed', 'new', 'locked']);
});
