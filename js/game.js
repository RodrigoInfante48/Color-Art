// Estado y reglas de una partida. Sin DOM: se puede probar en Node.
// Eventos (CustomEvent en `game`):
//   'paint'    detail: { indices: number[] }        celdas recién pintadas
//   'select'   detail: { color: number }            cambio de color elegido
//   'colordone' detail: { color: number }           un color quedó completo
//   'complete'                                        todo el dibujo terminado

export class Game extends EventTarget {
  /**
   * @param {{id,width,height,palette:string[],cells:Uint8Array,hash}} level
   * @param {Uint8Array} [painted] estado guardado (1 = pintada)
   */
  constructor(level, painted) {
    super();
    this.level = level;
    const n = level.width * level.height;
    this.painted = painted && painted.length === n ? painted : new Uint8Array(n);
    this.selected = -1;
    const k = level.palette.length;
    this.total = new Int32Array(k);
    this.remaining = new Int32Array(k);
    for (let i = 0; i < n; i++) {
      const c = level.cells[i];
      this.total[c]++;
      if (!this.painted[i]) this.remaining[c]++;
    }
    // Índices de celdas por color, para resaltado y pistas.
    const offsets = new Int32Array(k + 1);
    for (let c = 0; c < k; c++) offsets[c + 1] = offsets[c] + this.total[c];
    const byColor = new Int32Array(n);
    const fill = offsets.slice(0, k);
    for (let i = 0; i < n; i++) byColor[fill[level.cells[i]]++] = i;
    this.cellsOf = (c) => byColor.subarray(offsets[c], offsets[c + 1]);
    this.paintedCount = n - this.remaining.reduce((a, b) => a + b, 0);
  }

  get cellCount() { return this.painted.length; }
  get progress() { return this.paintedCount / this.cellCount; }
  get isComplete() { return this.paintedCount === this.cellCount; }
  isColorDone(c) { return this.remaining[c] === 0; }

  select(color) {
    if (color === this.selected || color < 0 || color >= this.level.palette.length) return;
    this.selected = color;
    this.dispatchEvent(new CustomEvent('select', { detail: { color } }));
  }

  /** Primer color con celdas pendientes a partir de `from` (circular), o -1. */
  nextPendingColor(from = 0) {
    const k = this.level.palette.length;
    for (let j = 0; j < k; j++) {
      const c = (from + j) % k;
      if (this.remaining[c] > 0) return c;
    }
    return -1;
  }

  /**
   * Intenta pintar celdas con el color elegido. Solo pinta las que corresponden.
   * @param {number[]} indices
   * @returns {{ painted: number[], wrong: number[] }}
   */
  paint(indices) {
    const painted = [], wrong = [];
    const c = this.selected;
    if (c < 0) return { painted, wrong };
    for (const i of indices) {
      if (i < 0 || i >= this.cellCount || this.painted[i]) continue;
      if (this.level.cells[i] !== c) { wrong.push(i); continue; }
      this.painted[i] = 1;
      painted.push(i);
    }
    if (!painted.length) return { painted, wrong };
    this.remaining[c] -= painted.length;
    this.paintedCount += painted.length;
    this.dispatchEvent(new CustomEvent('paint', { detail: { indices: painted } }));
    if (this.remaining[c] === 0) this.dispatchEvent(new CustomEvent('colordone', { detail: { color: c } }));
    if (this.isComplete) this.dispatchEvent(new CustomEvent('complete'));
    return { painted, wrong };
  }

  /**
   * Celda pendiente del color elegido más cercana a (cx, cy), en coordenadas de celda.
   * @returns {{x:number,y:number}|null}
   */
  findHint(cx, cy, color = this.selected) {
    if (color < 0 || this.remaining[color] === 0) return null;
    const { width } = this.level;
    let best = null, bestScore = Infinity;
    for (const i of this.cellsOf(color)) {
      if (this.painted[i]) continue;
      const x = i % width, y = (i / width) | 0;
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (d < bestScore) { bestScore = d; best = { x, y }; }
    }
    return best;
  }

  reset() {
    this.painted.fill(0);
    this.remaining.set(this.total);
    this.paintedCount = 0;
  }
}
