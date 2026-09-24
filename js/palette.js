// Barra de paleta: un botón por color con su número y un anillo de progreso.
import { t } from './i18n.js';

function textColorFor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? '#1b1e28' : '#ffffff';
}

export class PaletteBar {
  constructor(root, game) {
    this.root = root;
    this.game = game;
    this.buttons = [];
    root.replaceChildren();
    root.setAttribute('aria-label', t('game.paletteLabel'));

    game.level.palette.forEach((hex, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.style.setProperty('--swatch', hex);
      b.style.setProperty('--swatch-text', textColorFor(hex));
      b.innerHTML = `<span class="swatch-dot"><span class="swatch-num">${i + 1}</span></span>`;
      b.addEventListener('click', () => game.select(i));
      root.append(b);
      this.buttons.push(b);
      this.update(i);
    });

    this.onPaint = () => this.update(game.selected);
    this.onSelect = () => this.syncSelection();
    game.addEventListener('paint', this.onPaint);
    game.addEventListener('select', this.onSelect);
    this.syncSelection();
  }

  destroy() {
    this.game.removeEventListener('paint', this.onPaint);
    this.game.removeEventListener('select', this.onSelect);
  }

  update(i) {
    const b = this.buttons[i];
    if (!b) return;
    const total = this.game.total[i];
    const done = total - this.game.remaining[i];
    const complete = done === total;
    b.style.setProperty('--p', `${Math.round((done / total) * 100)}%`);
    b.classList.toggle('is-done', complete);
    b.setAttribute('aria-label', complete
      ? t('game.colorDone', { n: i + 1 })
      : t('game.colorLabel', { n: i + 1, done, total }));
  }

  updateAll() {
    this.buttons.forEach((_, i) => this.update(i));
  }

  syncSelection() {
    this.buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === this.game.selected)));
    const b = this.buttons[this.game.selected];
    b?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }
}
