// Reducción de tamaño por promedio de área. La transparencia se compone sobre blanco.

/**
 * @param {{width:number,height:number,data:Uint8Array}} img RGBA
 * @param {number} tw ancho destino (celdas)
 * @param {number} th alto destino (celdas)
 * @returns {Float64Array} RGB por celda (tw*th*3), valores 0..255
 */
export function resizeToGrid(img, tw, th) {
  const { width: sw, height: sh, data } = img;
  const out = new Float64Array(tw * th * 3);
  for (let ty = 0; ty < th; ty++) {
    const y0 = Math.floor((ty * sh) / th);
    const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * sh) / th));
    for (let tx = 0; tx < tw; tx++) {
      const x0 = Math.floor((tx * sw) / tw);
      const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * sw) / tw));
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        let i = (y * sw + x0) * 4;
        for (let x = x0; x < x1; x++, i += 4) {
          const a = data[i + 3] / 255;
          r += data[i] * a + 255 * (1 - a);
          g += data[i + 1] * a + 255 * (1 - a);
          b += data[i + 2] * a + 255 * (1 - a);
          n++;
        }
      }
      const o = (ty * tw + tx) * 3;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
    }
  }
  return out;
}

/** Calcula el tamaño de grilla respetando la proporción: el lado mayor mide `size`. */
export function gridSizeFor(srcW, srcH, { size, width, height }) {
  if (width && height) return { width, height };
  if (width) return { width, height: Math.max(1, Math.round((width * srcH) / srcW)) };
  if (height) return { width: Math.max(1, Math.round((height * srcW) / srcH)), height };
  if (srcW >= srcH) return { width: size, height: Math.max(1, Math.round((size * srcH) / srcW)) };
  return { width: Math.max(1, Math.round((size * srcW) / srcH)), height: size };
}
