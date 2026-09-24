// Cámara 2D: `scale` = píxeles CSS por celda; (ox, oy) = posición en pantalla de la esquina
// superior izquierda de la grilla. Sin DOM, solo matemática.

export class Viewport {
  constructor(gridW, gridH) {
    this.gridW = gridW;
    this.gridH = gridH;
    this.viewW = 1;
    this.viewH = 1;
    this.scale = 1;
    this.ox = 0;
    this.oy = 0;
    this.minScale = 1;
    this.maxScale = 64;
    this.anim = null;
  }

  setViewSize(w, h) {
    const hadSize = this.viewW > 1;
    const cx = this.toCellX(this.viewW / 2), cy = this.toCellY(this.viewH / 2);
    this.viewW = Math.max(1, w);
    this.viewH = Math.max(1, h);
    this.minScale = this.fitScale() * 0.8;
    if (!hadSize) this.fit();
    else this.centerOn(cx, cy, Math.max(this.scale, this.minScale));
  }

  fitScale(padding = 16) {
    return Math.min((this.viewW - padding * 2) / this.gridW, (this.viewH - padding * 2) / this.gridH);
  }

  /** Estado que muestra la grilla completa y centrada. */
  fitState() {
    const scale = this.fitScale();
    return { scale, ox: (this.viewW - this.gridW * scale) / 2, oy: (this.viewH - this.gridH * scale) / 2 };
  }

  fit() { Object.assign(this, this.fitState()); }

  toCellX(sx) { return (sx - this.ox) / this.scale; }
  toCellY(sy) { return (sy - this.oy) / this.scale; }

  /** Celda bajo el punto de pantalla, o null si está fuera de la grilla. */
  cellAt(sx, sy) {
    const x = Math.floor(this.toCellX(sx)), y = Math.floor(this.toCellY(sy));
    if (x < 0 || y < 0 || x >= this.gridW || y >= this.gridH) return null;
    return { x, y };
  }

  centerOn(cx, cy, scale = this.scale) {
    this.scale = scale;
    this.ox = this.viewW / 2 - cx * scale;
    this.oy = this.viewH / 2 - cy * scale;
    this.clamp();
  }

  zoomAt(factor, sx, sy) {
    const s = Math.min(this.maxScale, Math.max(this.minScale, this.scale * factor));
    const k = s / this.scale;
    this.ox = sx - (sx - this.ox) * k;
    this.oy = sy - (sy - this.oy) * k;
    this.scale = s;
    this.clamp();
  }

  pan(dx, dy) {
    this.ox += dx;
    this.oy += dy;
    this.clamp();
  }

  /** Impide que la grilla salga de la vista: siempre queda al menos un margen visible. */
  clamp() {
    const w = this.gridW * this.scale, h = this.gridH * this.scale;
    const mx = Math.min(w, this.viewW) * 0.5, my = Math.min(h, this.viewH) * 0.5;
    this.ox = Math.min(this.viewW - mx, Math.max(mx - w, this.ox));
    this.oy = Math.min(this.viewH - my, Math.max(my - h, this.oy));
  }

  /** Inicia una animación hacia {scale, ox, oy}; avanzar con step() en cada frame. */
  animateTo(target, duration = 350) {
    this.anim = { from: { scale: this.scale, ox: this.ox, oy: this.oy }, to: target, t0: performance.now(), duration };
  }

  step(now = performance.now()) {
    if (!this.anim) return false;
    const { from, to, t0, duration } = this.anim;
    const p = Math.min(1, (now - t0) / duration);
    const e = 1 - Math.pow(1 - p, 3);
    // Se interpola el punto del mundo en el centro de la vista (lineal) y la escala
    // (logarítmica), así el zoom se percibe a velocidad constante.
    const cx0 = (this.viewW / 2 - from.ox) / from.scale, cy0 = (this.viewH / 2 - from.oy) / from.scale;
    const cx1 = (this.viewW / 2 - to.ox) / to.scale, cy1 = (this.viewH / 2 - to.oy) / to.scale;
    this.scale = Math.exp(Math.log(from.scale) + (Math.log(to.scale) - Math.log(from.scale)) * e);
    this.ox = this.viewW / 2 - (cx0 + (cx1 - cx0) * e) * this.scale;
    this.oy = this.viewH / 2 - (cy0 + (cy1 - cy0) * e) * this.scale;
    if (p >= 1) {
      Object.assign(this, { scale: to.scale, ox: to.ox, oy: to.oy });
      this.anim = null;
    }
    return true;
  }

  stopAnimation() { this.anim = null; }

  /** Estado destino para centrar la celda (cx, cy) con cierta escala. */
  stateCenteredOn(cx, cy, scale) {
    return { scale, ox: this.viewW / 2 - (cx + 0.5) * scale, oy: this.viewH / 2 - (cy + 0.5) * scale };
  }

  /** Rango de celdas visibles (inclusive-exclusivo), recortado a la grilla. */
  visibleRange(rect) {
    const r = rect || { x: 0, y: 0, w: this.viewW, h: this.viewH };
    return {
      x0: Math.max(0, Math.floor(this.toCellX(r.x))),
      y0: Math.max(0, Math.floor(this.toCellY(r.y))),
      x1: Math.min(this.gridW, Math.ceil(this.toCellX(r.x + r.w))),
      y1: Math.min(this.gridH, Math.ceil(this.toCellY(r.y + r.h))),
    };
  }
}
