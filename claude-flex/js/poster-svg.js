// Turns a poster file from ../images/posters/ into a self-contained inline <svg>.
//
// The eight posters were authored as standalone documents. Inlined side by side
// they collide: they reuse ids (#arrow, #paper, #grid, #poster-title…), ship
// unscoped <style> rules (.node, .eyebrow, text{}) that leak both ways, and their
// <title> elements become hover tooltips. Every instance therefore gets:
//   • ids prefixed with a unique scope, and every url(#…), href and aria ref rewritten
//   • classes renamed to <scope>-<class>; the originals stay in data-c="…" as
//     animation hooks, so select with [data-c~="node"] rather than .node
//   • its <style> selectors scoped to [data-psvg="<scope>"]
//   • <title>/<desc> removed (the card's <img alt> is the accessible name)
// The source files in ../images/posters/ are never modified.

const textCache = new Map();
let instance = 0;

export const POSTERS = ['ramain', 'panorama', 'dissolvr', 'bonsai', 'condensation', 'reasonbench', 'sc3', 'molmerger'];
export const posterURL = name => `../images/posters/${name}.svg`;

export function fetchPosterText(name) {
  if (!textCache.has(name)) {
    textCache.set(name, fetch(posterURL(name)).then(response => {
      if (!response.ok) throw new Error(`poster ${name}: HTTP ${response.status}`);
      return response.text();
    }));
  }
  return textCache.get(name);
}

const URL_REF = /url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/g;
const XLINK = 'http://www.w3.org/1999/xlink';

function scopeCSS(css, scope, renameId) {
  const withRefs = css.replace(URL_REF, (match, id) => renameId(id) ? `url(#${renameId(id)})` : match);
  return withRefs.replace(/([^{}]+)\{/g, (match, selectors) => {
    if (selectors.trim().startsWith('@')) return match;
    return selectors.split(',').map(sel => {
      const renamed = sel.trim().replace(/\.([A-Za-z_][\w-]*)/g, (m, cls) => `.${scope}-${cls}`);
      return `[data-psvg="${scope}"] ${renamed}`;
    }).join(', ') + '{';
  });
}

/**
 * Returns a new SVGSVGElement for the poster. Each call is an independent
 * instance, so the same poster can be inlined in the gallery and the explainer.
 * The root carries data-poster-svg="<name>" and data-psvg="<unique scope>".
 */
export async function createPosterSVG(name) {
  const source = await fetchPosterText(name);
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  const svg = doc.documentElement;
  if (svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error(`poster ${name}: unparseable SVG`);

  const scope = `ps${++instance}-${name}`;
  svg.querySelectorAll('title, desc').forEach(node => node.remove());
  svg.removeAttribute('aria-labelledby');
  svg.removeAttribute('aria-describedby');

  const ids = new Set([...svg.querySelectorAll('[id]')].map(node => node.id));
  const renameId = id => (ids.has(id) ? `${scope}-${id}` : null);
  svg.querySelectorAll('[id]').forEach(node => { node.id = renameId(node.id); });

  [svg, ...svg.querySelectorAll('*')].forEach(el => {
    const cls = el.getAttribute('class');
    if (cls) {
      el.setAttribute('data-c', cls);
      el.setAttribute('class', cls.split(/\s+/).filter(Boolean).map(c => `${scope}-${c}`).join(' '));
    }
    [...el.attributes].forEach(attr => {
      const value = attr.value;
      let next = value;
      if (attr.localName === 'href' && value.startsWith('#') && renameId(value.slice(1))) next = `#${renameId(value.slice(1))}`;
      else if (value.includes('url(')) next = value.replace(URL_REF, (match, id) => renameId(id) ? `url(#${renameId(id)})` : match);
      if (next === value) return;
      if (attr.namespaceURI === XLINK) el.setAttributeNS(XLINK, attr.name, next);
      else el.setAttribute(attr.name, next);
    });
  });
  svg.querySelectorAll('style').forEach(style => { style.textContent = scopeCSS(style.textContent, scope, renameId); });

  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.removeAttribute('role');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('data-poster-svg', name);
  svg.setAttribute('data-psvg', scope);
  svg.setAttribute('focusable', 'false');
  svg.classList.add('poster-svg');
  return document.importNode(svg, true);
}

/** Select inside a sanitized poster by its ORIGINAL class name(s). */
export const byClass = (svg, cls) => [...svg.querySelectorAll(`[data-c~="${cls}"]`)];

/**
 * Lays the inline SVG over a card's <img> (same box, no layout shift) and hides
 * the <img> underneath. The <img> stays in place as the fallback and keeps the
 * card filled if the SVG is borrowed by the explainer. Resolves to the SVG, or
 * null if anything failed (the <img> then simply remains visible).
 */
export async function overlayPoster(link) {
  if (link._posterSVG) return link._posterSVG;
  const name = link.dataset.poster;
  const img = link.querySelector('img');
  try {
    const svg = await createPosterSVG(name);
    svg.setAttribute('aria-hidden', 'true');
    if (img) img.after(svg); else link.prepend(svg);
    link.classList.add('has-svg');
    link._posterSVG = svg;
    return svg;
  } catch (error) {
    console.warn('[claude-flex] poster stayed as <img>:', error);
    return null;
  }
}

/** Temporarily take a card's SVG (e.g. into the explainer); the <img> shows meanwhile. */
export function borrowPoster(link) {
  const svg = link?._posterSVG;
  if (!svg) return null;
  link.classList.remove('has-svg');
  return svg;
}

/** Return a borrowed SVG to its card. */
export function returnPoster(link) {
  const svg = link?._posterSVG;
  if (!svg) return;
  const img = link.querySelector('img');
  if (svg.parentNode !== link) (img ? img.after(svg) : link.prepend(svg));
  link.classList.add('has-svg');
}
