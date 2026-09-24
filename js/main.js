// Punto de entrada: navegación por hash (#/ = catálogo, #/nivel/<id> = juego) y
// conexión entre módulos.
import { t, applyI18n, setLanguage, detectLanguage } from './i18n.js';
import { loadCatalog, loadLevel } from './levels.js';
import { renderCatalog, levelStatuses } from './catalog.js';
import { Game } from './game.js';
import { Viewport } from './viewport.js';
import { Renderer } from './renderer.js';
import { PaletteBar } from './palette.js';
import { attachInput } from './input.js';
import { playReveal, downloadBlob } from './finish.js';
import {
  getLevelProgress, saveLevelProgress, clearLevelProgress,
  encodeBits, decodeBits, isStorageAvailable,
} from './storage.js';

const $ = (id) => document.getElementById(id);
const el = {
  catalog: $('screen-catalog'), grid: $('catalog-grid'), catalogStatus: $('catalog-status'),
  game: $('screen-game'), board: $('board'), stage: document.querySelector('.stage'),
  gameName: $('game-name'), progressBar: $('game-progress-bar'), gameStatus: $('game-status'),
  palette: $('palette'), back: $('btn-back'), pan: $('btn-pan'), fit: $('btn-fit'), hint: $('btn-hint'),
  finish: $('finish'), finishCanvas: $('finish-canvas'),
  download: $('btn-download'), replay: $('btn-replay'), more: $('btn-more'),
  toast: $('toast'),
};

let catalog = null;
let session = null; // partida abierta
let routeToken = 0;

// ---------- utilidades de UI ----------

let toastTimer = 0;
function toast(msg, ms = 2200) {
  el.toast.textContent = msg;
  el.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), ms);
}

function showScreen(name) {
  el.catalog.hidden = name !== 'catalog';
  el.game.hidden = name !== 'game';
  if (name !== 'game') el.finish.hidden = true;
}

// ---------- catálogo ----------

async function getCatalog() {
  if (!catalog) catalog = await loadCatalog();
  return catalog;
}

async function showCatalog() {
  closeLevel();
  showScreen('catalog');
  document.title = t('app.title');
  if (!catalog) el.catalogStatus.textContent = t('catalog.loading');
  try {
    const levels = await getCatalog();
    el.catalogStatus.textContent = levels.length ? '' : t('catalog.empty');
    renderCatalog(el.grid, levels, getLevelProgress, {
      onOpen: (id) => { location.hash = `#/nivel/${id}`; },
      onLocked: () => toast(t('catalog.lockedHint')),
    });
  } catch (e) {
    console.error(e);
    el.catalogStatus.textContent = t('catalog.error');
    const retry = document.createElement('button');
    retry.className = 'btn';
    retry.textContent = t('catalog.retry');
    retry.addEventListener('click', showCatalog);
    el.grid.replaceChildren(retry);
  }
}

// ---------- partida ----------

async function openLevel(id) {
  const token = ++routeToken;
  closeLevel();
  showScreen('game');
  el.gameName.textContent = '';
  el.progressBar.style.width = '0%';
  el.palette.replaceChildren();
  el.gameStatus.textContent = t('game.loading');

  let level;
  try {
    const levels = await getCatalog();
    const idx = levels.findIndex((l) => l.id === id);
    if (idx < 0 || levelStatuses(levels, getLevelProgress)[idx].status === 'locked') {
      toast(t('catalog.lockedHint'));
      location.replace('#/');
      return;
    }
    level = await loadLevel(id);
  } catch (e) {
    console.error(e);
    if (token === routeToken) el.gameStatus.textContent = t('game.error');
    return;
  }
  if (token !== routeToken) return; // el usuario navegó a otra parte mientras cargaba
  el.gameStatus.textContent = '';
  startSession(level);
}

function startSession(level) {
  const saved = getLevelProgress(level.id);
  const n = level.width * level.height;
  const painted = saved.hash === level.hash && saved.painted ? decodeBits(saved.painted, n) : undefined;

  const game = new Game(level, painted);
  const vp = new Viewport(level.width, level.height);
  const renderer = new Renderer(el.board, game, vp);
  const palette = new PaletteBar(el.palette, game);
  const s = { level, game, vp, renderer, palette, panMode: false, saveTimer: 0, lastWrongToast: 0 };
  session = s;

  el.gameName.textContent = level.name;
  document.title = `${level.name} · ${t('app.title')}`;
  setPanMode(false);
  updateProgress();

  s.detachInput = attachInput(el.board, {
    vp,
    onPaint: handlePaint,
    onViewChange: () => renderer.invalidate(),
    isPanMode: () => s.panMode,
    canPaint: () => game.selected >= 0 && !game.isComplete,
  });

  s.resizeObserver = new ResizeObserver(() => renderer.resize());
  s.resizeObserver.observe(el.stage);
  renderer.resize();

  game.addEventListener('paint', () => { updateProgress(); scheduleSave(); });
  game.addEventListener('colordone', (e) => {
    const next = game.nextPendingColor(e.detail.color + 1);
    if (next >= 0) setTimeout(() => session === s && game.select(next), 250);
  });
  game.addEventListener('complete', () => onComplete(s));

  if (game.isComplete) {
    renderer.mode = 'final';
    renderer.invalidate();
    showFinish(s);
  } else {
    game.select(game.nextPendingColor(0));
  }
}

function closeLevel() {
  if (!session) return;
  flushSave();
  const s = session;
  session = null;
  s.detachInput?.();
  s.resizeObserver?.disconnect();
  s.renderer.destroy();
  s.palette.destroy();
  el.finish.hidden = true;
  s.stopReveal?.();
}

function handlePaint(cells, firstOfStroke) {
  const s = session;
  if (!s) return;
  const { game, renderer, level } = s;
  if (game.selected < 0) {
    if (firstOfStroke) toast(t('game.pickColor'));
    return;
  }
  const { painted, wrong } = game.paint(cells.map((c) => c.y * level.width + c.x));
  if (firstOfStroke && !painted.length && wrong.length) {
    const i = wrong[0];
    renderer.flashWrong(i % level.width, (i / level.width) | 0);
    navigator.vibrate?.(12);
    const now = Date.now();
    if (now - s.lastWrongToast > 4000) {
      s.lastWrongToast = now;
      toast(t('game.wrongColor'), 1400);
    }
  }
}

function updateProgress() {
  const g = session?.game;
  if (!g) return;
  el.progressBar.style.width = `${(g.progress * 100).toFixed(1)}%`;
}

function scheduleSave() {
  const s = session;
  clearTimeout(s.saveTimer);
  s.saveTimer = setTimeout(() => save(s), 400);
}

function flushSave() {
  if (!session) return;
  clearTimeout(session.saveTimer);
  save(session);
}

function save(s) {
  const { game, level } = s;
  const pct = game.isComplete ? 100 : game.paintedCount ? Math.max(1, Math.floor(game.progress * 100)) : 0;
  const prev = getLevelProgress(level.id);
  saveLevelProgress(level.id, {
    hash: level.hash,
    painted: encodeBits(game.painted),
    pct,
    completed: game.isComplete || !!prev.completed,
  });
  if (!isStorageAvailable() && !s.warnedStorage) {
    s.warnedStorage = true;
    toast(t('storage.unavailable'), 4000);
  }
}

function onComplete(s) {
  flushSave();
  s.renderer.mode = 'final';
  s.vp.animateTo(s.vp.fitState(), 700);
  s.renderer.invalidate();
  navigator.vibrate?.([20, 60, 20]);
  setTimeout(() => session === s && showFinish(s), 900);
}

function showFinish(s) {
  el.finish.hidden = false;
  s.stopReveal?.();
  s.stopReveal = playReveal(el.finishCanvas, s.renderer.colorLayer.canvas);
  el.download.focus({ preventScroll: true });
}

function setPanMode(on) {
  if (session) session.panMode = on;
  el.pan.setAttribute('aria-pressed', String(on));
  el.board.classList.toggle('is-grab', on);
}

// ---------- botones ----------

el.back.addEventListener('click', () => { location.hash = '#/'; });
el.more.addEventListener('click', () => { location.hash = '#/'; });
el.pan.addEventListener('click', () => setPanMode(!session?.panMode));
el.fit.addEventListener('click', () => {
  if (!session) return;
  session.vp.animateTo(session.vp.fitState());
  session.renderer.invalidate();
});
el.hint.addEventListener('click', () => {
  const s = session;
  if (!s) return;
  const { game, vp, renderer } = s;
  if (game.selected < 0) return toast(t('game.hintNone'));
  const cx = vp.toCellX(vp.viewW / 2), cy = vp.toCellY(vp.viewH / 2);
  const cell = game.findHint(cx, cy);
  if (!cell) return toast(t('game.hintDone'));
  const scale = Math.min(vp.maxScale, Math.max(vp.scale, 28));
  vp.animateTo(vp.stateCenteredOn(cell.x, cell.y, scale), 450);
  renderer.pulseHint(cell.x, cell.y);
  renderer.invalidate();
});
el.download.addEventListener('click', async () => {
  const s = session;
  if (!s) return;
  const blob = await s.renderer.toBlob();
  if (blob) downloadBlob(blob, `color-art-${s.level.id}.png`);
});
el.replay.addEventListener('click', () => {
  const s = session;
  if (!s || !window.confirm(t('finish.replayConfirm'))) return;
  clearLevelProgress(s.level.id);
  s.game.reset();
  s.renderer.mode = 'play';
  s.renderer.rebuildAll();
  s.palette.updateAll();
  updateProgress();
  el.finish.hidden = true;
  s.stopReveal?.();
  s.game.selected = -1;
  s.game.select(0);
  s.vp.animateTo(s.vp.fitState());
  s.renderer.invalidate();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !el.finish.hidden) el.finish.hidden = true;
});

// Guardar al salir o pasar a segundo plano (en móvil, pagehide puede no llegar).
document.addEventListener('visibilitychange', () => { if (document.hidden) flushSave(); });
window.addEventListener('pagehide', flushSave);

// ---------- navegación ----------

function route() {
  const m = location.hash.match(/^#\/nivel\/([a-z0-9-]+)$/);
  if (m) openLevel(m[1]);
  else { routeToken++; showCatalog(); }
}

setLanguage(detectLanguage());
applyI18n();
window.addEventListener('hashchange', route);
route();
