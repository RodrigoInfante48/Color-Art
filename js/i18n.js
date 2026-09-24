// Traducciones: t('clave', { var }) y aplicación sobre atributos data-i18n* del HTML.
import es from './strings/es.js';

const DICTS = { es };
const FALLBACK = 'es';
let current = FALLBACK;

export function setLanguage(lang) {
  current = DICTS[lang] ? lang : FALLBACK;
  document.documentElement.lang = current;
}

export function detectLanguage() {
  const wanted = (navigator.languages || [navigator.language || FALLBACK]).map((l) => String(l).slice(0, 2));
  return wanted.find((l) => DICTS[l]) || FALLBACK;
}

export function t(key, vars) {
  let s = DICTS[current][key] ?? DICTS[FALLBACK][key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}

/** Rellena textos de elementos con data-i18n, data-i18n-aria (aria-label) y data-i18n-title. */
export function applyI18n(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
}
