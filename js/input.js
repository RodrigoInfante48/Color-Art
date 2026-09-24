// Entrada unificada con Pointer Events.
//  Táctil: 1 dedo pinta (tocar o arrastrar); 2 dedos = pellizco para zoom + arrastre para mover.
//          Sin color elegido o con "modo mover", 1 dedo desplaza.
//  Mouse:  clic izquierdo pinta; arrastrar con botón derecho/central o con Espacio presionado
//          desplaza; la rueda hace zoom hacia el cursor.

const TAP_DELAY = 70;   // ms antes de empezar a pintar con un dedo (da tiempo a un 2.º dedo)
const MOVE_SLOP = 6;    // px de movimiento que confirman un trazo

/** Celdas de la línea entre (x0,y0) y (x1,y1) (Bresenham), sin la inicial. */
function cellLine(x0, y0, x1, y1) {
  const out = [];
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  while (x0 !== x1 || y0 !== y1) {
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
    out.push([x0, y0]);
  }
  return out;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ vp, onPaint:(cells:{x,y}[], firstOfStroke:boolean)=>void, onViewChange:()=>void,
 *           isPanMode:()=>boolean, canPaint:()=>boolean }} opts
 * @returns {() => void} función para desconectar los listeners
 */
export function attachInput(canvas, { vp, onPaint, onViewChange, isPanMode, canPaint }) {
  const pointers = new Map();
  let state = 'idle'; // idle | pending | paint | pan | pinch
  let timer = 0;
  let start = null;      // {x,y} de pantalla al iniciar
  let lastCell = null;   // última celda pintada en el trazo
  let pinch = null;      // {dist, mx, my}
  let spaceHeld = false;

  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function beginPaint(p) {
    clearTimeout(timer);
    state = 'paint';
    lastCell = vp.cellAt(p.x, p.y);
    if (lastCell) onPaint([lastCell], true);
  }

  function continuePaint(p) {
    const c = vp.cellAt(p.x, p.y);
    if (!c) { lastCell = null; return; }
    if (lastCell && c.x === lastCell.x && c.y === lastCell.y) return;
    const cells = lastCell
      ? cellLine(lastCell.x, lastCell.y, c.x, c.y).map(([x, y]) => ({ x, y }))
      : [c];
    lastCell = c;
    onPaint(cells, false);
  }

  function pinchInfo() {
    const [a, b] = [...pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }

  function onDown(e) {
    if (pointers.size >= 2) return;
    canvas.setPointerCapture?.(e.pointerId);
    const p = local(e);
    pointers.set(e.pointerId, p);
    vp.stopAnimation();

    if (pointers.size === 2) {
      clearTimeout(timer);
      state = 'pinch';
      pinch = pinchInfo();
      return;
    }
    start = p;
    const wantsPan = isPanMode() || !canPaint() || spaceHeld;
    if (e.pointerType === 'mouse') {
      if (e.button === 1 || e.button === 2 || (e.button === 0 && wantsPan)) state = 'pan';
      else if (e.button === 0) beginPaint(p);
      e.preventDefault();
    } else if (wantsPan) {
      state = 'pan';
    } else {
      state = 'pending';
      timer = setTimeout(() => { if (state === 'pending') beginPaint(start); }, TAP_DELAY);
    }
  }

  function onMove(e) {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const p = local(e);
    pointers.set(e.pointerId, p);

    if (state === 'pending') {
      if (Math.hypot(p.x - start.x, p.y - start.y) > MOVE_SLOP) {
        beginPaint(start);
        continuePaint(p);
      }
    } else if (state === 'paint') {
      continuePaint(p);
    } else if (state === 'pan') {
      vp.pan(p.x - prev.x, p.y - prev.y);
      onViewChange();
    } else if (state === 'pinch' && pointers.size === 2) {
      const now = pinchInfo();
      vp.zoomAt(now.dist / pinch.dist, pinch.mx, pinch.my);
      vp.pan(now.mx - pinch.mx, now.my - pinch.my);
      pinch = now;
      onViewChange();
    }
  }

  function onUp(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (state === 'pending' && e.type === 'pointerup') beginPaint(start);
    clearTimeout(timer);
    if (pointers.size === 1 && state === 'pinch') {
      // Al soltar un dedo del pellizco, el que queda solo desplaza (evita pintar sin querer).
      state = 'pan';
    } else if (pointers.size === 0) {
      state = 'idle';
      lastCell = null;
    }
  }

  function onWheel(e) {
    e.preventDefault();
    const p = local(e);
    const k = e.deltaMode === 1 ? 0.05 : e.deltaMode === 2 ? 1 : 0.0018;
    vp.stopAnimation();
    vp.zoomAt(Math.exp(-e.deltaY * k * (e.ctrlKey ? 4 : 1)), p.x, p.y);
    onViewChange();
  }

  const isTyping = (e) => /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target?.tagName);
  function onKey(e) {
    if (e.code === 'Space' && !isTyping(e)) {
      spaceHeld = e.type === 'keydown';
      canvas.classList.toggle('is-grab', spaceHeld);
      e.preventDefault();
    }
    if (e.type !== 'keydown' || isTyping(e)) return;
    if (e.key === '+' || e.key === '=') { vp.zoomAt(1.25, vp.viewW / 2, vp.viewH / 2); onViewChange(); }
    if (e.key === '-') { vp.zoomAt(0.8, vp.viewW / 2, vp.viewH / 2); onViewChange(); }
  }

  const noMenu = (e) => e.preventDefault();

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('lostpointercapture', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', noMenu);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);

  return () => {
    clearTimeout(timer);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    canvas.removeEventListener('lostpointercapture', onUp);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('contextmenu', noMenu);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onKey);
  };
}
