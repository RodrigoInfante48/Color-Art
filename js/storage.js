// Progreso persistente en localStorage. Todo acceso va en try/catch: en modo privado,
// con cookies bloqueadas o cuota llena, el juego sigue funcionando con memoria.
const KEY = 'color-art:v1';

let cache = null;
let available = true;

function read() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? JSON.parse(raw) : null;
  } catch {
    available = false;
  }
  if (!cache || typeof cache !== 'object' || !cache.levels) cache = { levels: {} };
  return cache;
}

function write() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
    available = true;
  } catch {
    available = false;
  }
}

export const isStorageAvailable = () => (read(), available);

/**
 * @returns {{ hash?: string, painted?: string, completed?: boolean, pct?: number }}
 *   painted: bitset en base64 de celdas pintadas
 */
export function getLevelProgress(id) {
  return read().levels[id] || {};
}

export function saveLevelProgress(id, data) {
  read().levels[id] = { ...read().levels[id], ...data, t: Date.now() };
  write();
}

export function clearLevelProgress(id) {
  const prev = read().levels[id] || {};
  // Se conserva "completed" para que el desbloqueo de niveles no retroceda.
  read().levels[id] = prev.completed ? { completed: true, hash: prev.hash } : {};
  write();
}

export function encodeBits(bits) {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) if (bits[i]) bytes[i >> 3] |= 1 << (i & 7);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function decodeBits(str, length) {
  const out = new Uint8Array(length);
  try {
    const s = atob(str);
    for (let i = 0; i < length; i++) out[i] = (s.charCodeAt(i >> 3) >> (i & 7)) & 1;
  } catch { /* progreso corrupto: se empieza de cero */ }
  return out;
}
