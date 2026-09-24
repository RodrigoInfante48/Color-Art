// Pantalla de nivel completado: revela la imagen final sin números y permite descargarla.

/** Animación de revelado en diagonal sobre `canvas`, usando la capa de color del renderer. */
export function playReveal(canvas, source, duration = 1400) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const size = Math.max(1, Math.round(Math.min(rect.width, rect.height) * dpr));
  const { width: sw, height: sh } = source;
  const k = size / Math.max(sw, sh);
  const w = Math.round(sw * k), h = Math.round(sh * k);
  canvas.width = w;
  canvas.height = h;
  ctx.imageSmoothingEnabled = false;

  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const t0 = performance.now();
  let raf = 0;
  const frame = (now) => {
    const p = reduce ? 1 : Math.min(1, (now - t0) / duration);
    const e = 1 - Math.pow(1 - p, 2);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    // Frente diagonal que avanza desde la esquina superior izquierda.
    const d = e * (w + h) * 1.02;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.min(d, w), 0);
    if (d > w) ctx.lineTo(w, Math.min(d - w, h));
    if (d > h) ctx.lineTo(Math.min(d - h, w), h);
    ctx.lineTo(0, Math.min(d, h));
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(source, 0, 0, w, h);
    ctx.restore();
    if (p < 1) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

/** Descarga un Blob como archivo. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
