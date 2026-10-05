// Entry point. Each feature is an isolated module: one failing module never
// takes the page down, and the HTML stays fully readable without any of them.
import { html, motion, initScroll, ScrollTrigger, on } from './core.js';

on('molecule:ready', () => html.classList.add('molecule-ready'));

const MODULES = [
  'news', 'hero', 'molecule', 'ramain', 'posters',
  'explainer', 'publications', 'search', 'sections', 'contact-field',
];

initScroll();
html.classList.add(motion ? 'motion-ready' : 'motion-off');
if (!motion) html.classList.add('motion-failed');

const results = await Promise.allSettled(MODULES.map(async name => {
  const mod = await import(`./${name}.js`);
  await mod.init?.();
  return name;
}));
results.forEach((result, i) => {
  if (result.status === 'rejected') console.error(`[claude-flex] ${MODULES[i]} failed to start`, result.reason);
});

ScrollTrigger?.refresh();
// Fonts and lazy images change layout; keep trigger positions honest.
document.fonts?.ready.then(() => ScrollTrigger?.refresh());
addEventListener('load', () => ScrollTrigger?.refresh(), { once: true });
html.classList.add('modules-ready');
