// Lectura/escritura de imágenes en JS puro (sin binarios nativos).
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

/** Lee un PNG o JPG y devuelve { width, height, data } con data RGBA (Uint8Array). */
export function readImage(file) {
  const buf = fs.readFileSync(file);
  const ext = path.extname(file).toLowerCase();
  if (ext === '.png') {
    const png = PNG.sync.read(buf);
    return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
  }
  if (ext === '.jpg' || ext === '.jpeg') {
    const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 });
    return { width: img.width, height: img.height, data: img.data };
  }
  throw new Error(`Formato no soportado: ${ext}`);
}

/** Escribe un PNG RGBA. */
export function writePng(file, width, height, data) {
  const png = new PNG({ width, height });
  png.data = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  fs.writeFileSync(file, PNG.sync.write(png, { colorType: 6 }));
}
