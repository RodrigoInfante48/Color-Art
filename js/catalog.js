// Pantalla de inicio: catálogo de niveles con estado bloqueado / nuevo / en progreso / completado.
import { t } from './i18n.js';

const ALWAYS_OPEN = 3; // cantidad de primeros niveles abiertos desde el inicio

/**
 * Regla de desbloqueo: un nivel está abierto si está entre los primeros ALWAYS_OPEN,
 * si su config dice `unlocked`, si ya tiene progreso o si el anterior está completado.
 * @returns {Array<{status:'locked'|'new'|'progress'|'completed', pct:number}>}
 */
export function levelStatuses(levels, getProgress) {
  return levels.map((lvl, i) => {
    const p = getProgress(lvl.id);
    if (p.completed) return { status: 'completed', pct: 100 };
    const prevDone = i > 0 && getProgress(levels[i - 1].id).completed;
    const open = i < ALWAYS_OPEN || lvl.unlocked || prevDone || p.pct > 0;
    if (!open) return { status: 'locked', pct: 0 };
    return p.pct > 0 ? { status: 'progress', pct: p.pct } : { status: 'new', pct: 0 };
  });
}

/**
 * @param {HTMLElement} root contenedor de la grilla
 * @param {Array} levels catálogo
 * @param {(id:string)=>object} getProgress
 * @param {{ onOpen:(id:string)=>void, onLocked:()=>void }} handlers
 */
export function renderCatalog(root, levels, getProgress, { onOpen, onLocked }) {
  const statuses = levelStatuses(levels, getProgress);
  root.replaceChildren();
  levels.forEach((lvl, i) => {
    const { status, pct } = statuses[i];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `card is-${status}`;

    const img = document.createElement('img');
    img.src = lvl.thumbUrl;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.width = lvl.width;
    img.height = lvl.height;

    const thumb = document.createElement('span');
    thumb.className = 'card-thumb';
    thumb.append(img);
    if (status === 'progress') {
      const bar = document.createElement('span');
      bar.className = 'card-bar';
      bar.style.setProperty('--p', `${pct}%`);
      thumb.append(bar);
    }

    const badge = document.createElement('span');
    badge.className = 'card-badge';
    badge.textContent = {
      locked: '🔒',
      new: t('catalog.new'),
      progress: t('catalog.progress', { pct }),
      completed: '✓',
    }[status];

    const name = document.createElement('span');
    name.className = 'card-name';
    name.textContent = lvl.name;

    const meta = document.createElement('span');
    meta.className = 'card-meta';
    meta.textContent = t('catalog.size', { w: lvl.width, h: lvl.height, n: lvl.colors });

    card.append(thumb, badge, name, meta);

    const label = status === 'locked' ? `${lvl.name}. ${t('catalog.locked')}`
      : status === 'completed' ? `${lvl.name}. ${t('catalog.completed')}`
      : status === 'progress' ? `${lvl.name}. ${t('catalog.progress', { pct })}`
      : lvl.name;
    card.setAttribute('aria-label', label);
    if (status === 'locked') {
      card.setAttribute('aria-disabled', 'true');
      card.title = t('catalog.lockedHint');
      card.addEventListener('click', onLocked);
    } else {
      card.addEventListener('click', () => onOpen(lvl.id));
    }
    root.append(card);
  });
}
