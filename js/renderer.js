// Dibujo del lienzo por capas con Canvas 2D.
//
// Capas (canvas fuera de pantalla, 1 píxel = 1 celda, escaladas sin suavizado):
//   colorLayer      color final de las celdas pintadas; gris tenue (según luminancia) si no.
//   highlightLayer  sombreado de las celdas pendientes del color elegido.
// Encima, en el canvas visible, se dibujan solo para las celdas visibles: grilla, números
// (desde un atlas de glifos precalculado) y efectos (error, pista).
//
// Redibujo: nada se dibuja fuera de requestAnimationFrame. Si solo cambiaron celdas
// (cámara quieta) se redibuja únicamente el rectángulo afectado (dirty rect).

const GRID_MIN = 7;     // px CSS por celda desde los que se ve la grilla
const NUMBERS_MIN = 10; // px CSS por celda desde los que se ven los números
const HIGHLIGHT_RGBA = [70, 80, 110, 105];
const WRONG_MS = 450;
const HINT_MS = 1400;

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export class Renderer {
  constructor(canvas, game, viewport) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.game = game;
    this.vp = viewport;
    this.mode = 'play'; // 'play' | 'final'
    this.effects = [];
    this.fullDirty = true;
    this.dirtyCells = null; // {x0,y0,x1,y1} en celdas
    this.raf = 0;
    this.atlas = null;
    this.bg = '#e9ecef';

    const { width: w, height: h, palette } = game.level;
    this.rgb = palette.map(hexToRgb);
    this.colorLayer = this.makeLayer(w, h);
    this.highlightLayer = this.makeLayer(w, h);
    this.colorData = this.colorLayer.ctx.createImageData(w, h);
    this.highlightData = this.highlightLayer.ctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) this.writeColorPixel(i);
    this.colorLayer.ctx.putImageData(this.colorData, 0, 0);

    this.onPaint = (e) => this.cellsPainted(e.detail.indices);
    this.onSelect = () => this.rebuildHighlight();
    game.addEventListener('paint', this.onPaint);
    game.addEventListener('select', this.onSelect);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.game.removeEventListener('paint', this.onPaint);
    this.game.removeEventListener('select', this.onSelect);
  }

  makeLayer(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return { canvas: c, ctx: c.getContext('2d') };
  }

  writeColorPixel(i) {
    const d = this.colorData.data, o = i * 4;
    const [r, g, b] = this.rgb[this.game.level.cells[i]];
    if (this.game.painted[i]) {
      d[o] = r; d[o + 1] = g; d[o + 2] = b;
    } else {
      // Gris muy claro que insinúa la luminancia del color final.
      const v = Math.round(228 + ((0.299 * r + 0.587 * g + 0.114 * b) / 255) * 27);
      d[o] = d[o + 1] = d[o + 2] = v;
    }
    d[o + 3] = 255;
  }

  rebuildHighlight() {
    const d = this.highlightData.data;
    d.fill(0);
    const c = this.game.selected;
    if (c >= 0) {
      const [r, g, b, a] = HIGHLIGHT_RGBA;
      for (const i of this.game.cellsOf(c)) {
        if (this.game.painted[i]) continue;
        const o = i * 4;
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = a;
      }
    }
    this.highlightLayer.ctx.putImageData(this.highlightData, 0, 0);
    this.invalidate();
  }

  cellsPainted(indices) {
    const w = this.game.level.width;
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    const hd = this.highlightData.data;
    for (const i of indices) {
      this.writeColorPixel(i);
      hd[i * 4 + 3] = 0;
      const x = i % w, y = (i / w) | 0;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
    const dw = x1 - x0 + 1, dh = y1 - y0 + 1;
    this.colorLayer.ctx.putImageData(this.colorData, 0, 0, x0, y0, dw, dh);
    this.highlightLayer.ctx.putImageData(this.highlightData, 0, 0, x0, y0, dw, dh);
    this.invalidateCells(x0, y0, x1 + 1, y1 + 1);
  }

  /** Recalcula todas las capas (tras reiniciar el nivel). */
  rebuildAll() {
    const n = this.game.cellCount;
    for (let i = 0; i < n; i++) this.writeColorPixel(i);
    this.colorLayer.ctx.putImageData(this.colorData, 0, 0);
    this.rebuildHighlight();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.vp.setViewSize(rect.width, rect.height);
    this.bg = getComputedStyle(this.canvas).getPropertyValue('--canvas-bg').trim() || this.bg;
    this.invalidate();
  }

  invalidate() {
    this.fullDirty = true;
    this.schedule();
  }

  invalidateCells(x0, y0, x1, y1) {
    const d = this.dirtyCells;
    this.dirtyCells = d
      ? { x0: Math.min(d.x0, x0), y0: Math.min(d.y0, y0), x1: Math.max(d.x1, x1), y1: Math.max(d.y1, y1) }
      : { x0, y0, x1, y1 };
    this.schedule();
  }

  schedule() {
    if (!this.raf) this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  flashWrong(x, y) {
    this.effects.push({ type: 'wrong', x, y, t0: performance.now(), dur: WRONG_MS });
    this.schedule();
  }

  pulseHint(x, y) {
    this.effects.push({ type: 'hint', x, y, t0: performance.now(), dur: HINT_MS });
    this.schedule();
  }

  frame(now) {
    this.raf = 0;
    if (this.vp.step(now)) this.fullDirty = true;

    // Los efectos activos marcan su zona; los que terminaron marcan una última vez para borrarse.
    for (const fx of this.effects) {
      const r = fx.type === 'hint' ? Math.ceil(Math.max(4, 40 / this.vp.scale)) + 1 : 1;
      this.invalidateCellsNoSchedule(fx.x - r, fx.y - r, fx.x + r + 1, fx.y + r + 1);
    }
    this.effects = this.effects.filter((fx) => now - fx.t0 < fx.dur);

    if (this.fullDirty) this.draw(null, now);
    else if (this.dirtyCells) this.draw(this.cellsToScreen(this.dirtyCells), now);
    this.fullDirty = false;
    this.dirtyCells = null;

    if (this.vp.anim || this.effects.length) this.schedule();
  }

  invalidateCellsNoSchedule(x0, y0, x1, y1) {
    const d = this.dirtyCells;
    this.dirtyCells = d
      ? { x0: Math.min(d.x0, x0), y0: Math.min(d.y0, y0), x1: Math.max(d.x1, x1), y1: Math.max(d.y1, y1) }
      : { x0, y0, x1, y1 };
  }

  cellsToScreen({ x0, y0, x1, y1 }) {
    const { scale: s, ox, oy } = this.vp;
    const pad = 3, d = this.dpr;
    // Alineado a píxeles del dispositivo: un recorte con bordes fraccionarios se
    // antialiasa y deja "fantasmas" al mezclarse con el cuadro anterior.
    const l = Math.floor((ox + x0 * s - pad) * d) / d, t = Math.floor((oy + y0 * s - pad) * d) / d;
    const r = Math.ceil((ox + x1 * s + pad) * d) / d, b = Math.ceil((oy + y1 * s + pad) * d) / d;
    return { x: l, y: t, w: r - l, h: b - t };
  }

  draw(clip, now = performance.now()) {
    const { ctx, vp } = this;
    const { width: gw, height: gh } = this.game.level;
    const s = vp.scale;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.save();
    if (clip) {
      ctx.beginPath();
      ctx.rect(clip.x, clip.y, clip.w, clip.h);
      ctx.clip();
    }
    ctx.fillStyle = this.bg;
    if (clip) ctx.fillRect(clip.x, clip.y, clip.w, clip.h);
    else ctx.fillRect(0, 0, vp.viewW, vp.viewH);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.colorLayer.canvas, vp.ox, vp.oy, gw * s, gh * s);

    if (this.mode === 'play') {
      ctx.drawImage(this.highlightLayer.canvas, vp.ox, vp.oy, gw * s, gh * s);
      const range = vp.visibleRange(clip);
      if (range.x1 > range.x0 && range.y1 > range.y0) {
        if (s >= GRID_MIN) this.drawGrid(range, s);
        if (s >= NUMBERS_MIN) this.drawNumbers(range, s);
      }
      this.drawEffects(now, s);
    }
    ctx.restore();
  }

  drawGrid({ x0, y0, x1, y1 }, s) {
    const { ctx, vp } = this;
    const alpha = Math.min(1, (s - GRID_MIN) / 10) * 0.22;
    ctx.beginPath();
    for (let x = x0; x <= x1; x++) {
      const px = Math.round((vp.ox + x * s) * this.dpr) / this.dpr + 0.5 / this.dpr;
      ctx.moveTo(px, vp.oy + y0 * s);
      ctx.lineTo(px, vp.oy + y1 * s);
    }
    for (let y = y0; y <= y1; y++) {
      const py = Math.round((vp.oy + y * s) * this.dpr) / this.dpr + 0.5 / this.dpr;
      ctx.moveTo(vp.ox + x0 * s, py);
      ctx.lineTo(vp.ox + x1 * s, py);
    }
    ctx.lineWidth = 1 / this.dpr;
    ctx.strokeStyle = `rgba(40,45,60,${alpha})`;
    ctx.stroke();
  }

  /** Atlas de números: fila 0 = normal, fila 1 = resaltado. Se regenera al cambiar el tamaño. */
  getAtlas(s) {
    // Tamaño cuantizado en pasos de ~19% para no regenerar el atlas en cada cuadro del zoom;
    // drawImage escala el glifo al tamaño exacto de la celda.
    const g = Math.max(8, Math.round(2 ** (Math.ceil(Math.log2(s * this.dpr) * 4) / 4)));
    if (this.atlas && this.atlas.g === g) return this.atlas;
    const k = this.rgb.length;
    const c = this.atlas?.canvas || document.createElement('canvas');
    c.width = g * k;
    c.height = g * 2;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < k; i++) {
      const label = String(i + 1);
      const size = Math.round(g * (label.length > 1 ? 0.44 : 0.52));
      ctx.font = `600 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
      ctx.fillStyle = '#8a909a';
      ctx.fillText(label, i * g + g / 2, g / 2 + g * 0.04);
      ctx.fillStyle = '#15171f';
      ctx.fillText(label, i * g + g / 2, g + g / 2 + g * 0.04);
    }
    this.atlas = { canvas: c, g };
    return this.atlas;
  }

  drawNumbers({ x0, y0, x1, y1 }, s) {
    const { ctx, vp } = this;
    const { cells, width } = this.game.level;
    const painted = this.game.painted;
    const sel = this.game.selected;
    const { canvas: atlas, g } = this.getAtlas(s);
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = Math.min(1, (s - NUMBERS_MIN) / 5 + 0.35);
    for (let y = y0; y < y1; y++) {
      const py = vp.oy + y * s;
      let i = y * width + x0;
      for (let x = x0; x < x1; x++, i++) {
        if (painted[i]) continue;
        const c = cells[i];
        ctx.drawImage(atlas, c * g, c === sel ? g : 0, g, g, vp.ox + x * s, py, s, s);
      }
    }
    ctx.globalAlpha = 1;
  }

  drawEffects(now, s) {
    const { ctx, vp } = this;
    for (const fx of this.effects) {
      const p = Math.min(1, (now - fx.t0) / fx.dur);
      const cx = vp.ox + (fx.x + 0.5) * s, cy = vp.oy + (fx.y + 0.5) * s;
      if (fx.type === 'wrong') {
        ctx.globalAlpha = 1 - p;
        ctx.strokeStyle = '#e5484d';
        ctx.lineWidth = Math.max(2, s * 0.12);
        const shake = Math.sin(p * Math.PI * 6) * s * 0.08 * (1 - p);
        ctx.strokeRect(vp.ox + fx.x * s + shake + 1, vp.oy + fx.y * s + 1, s - 2, s - 2);
      } else {
        const r0 = Math.max(s * 4, 40), r1 = Math.max(s * 0.7, 10);
        for (const phase of [0, 0.35]) {
          const q = Math.min(1, Math.max(0, (p - phase) / 0.65));
          if (q <= 0 || q >= 1) continue;
          ctx.globalAlpha = Math.sin(q * Math.PI) * 0.9;
          ctx.strokeStyle = '#7c5cff';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(cx, cy, r0 + (r1 - r0) * q, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Imagen final como PNG (cada celda = bloque de `cell` px). */
  toBlob(maxSide = 1200) {
    const { width: w, height: h } = this.game.level;
    const cell = Math.max(1, Math.floor(maxSide / Math.max(w, h)));
    const c = document.createElement('canvas');
    c.width = w * cell;
    c.height = h * cell;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.colorLayer.canvas, 0, 0, c.width, c.height);
    return new Promise((resolve) => c.toBlob(resolve, 'image/png'));
  }
}
