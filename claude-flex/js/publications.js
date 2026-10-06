// Publication index: one square blue block that slides between the filters,
// rows that collapse together, detail rows that animate their height, and the
// single owner of every [data-open-paper] link on the page.
//
// Without JS the index is plain <details> rows and buttons that do nothing;
// under reduced motion every change is instant and the rows toggle natively.
import { gsap, ScrollTrigger, html, mq, motion, lenis, emit, relayout, navOffset, scrollToEl, focusWithoutScroll } from './core.js';

const FILTER_SLIDE = { duration: 0.2, ease: 'power3.inOut' };
const ROW_COLLAPSE = { duration: 0.18, ease: 'power2.inOut' };
const ROW_OPEN = { duration: 0.35, ease: 'expo.out' };
const ROW_CLOSE = { duration: 0.25, ease: 'power3.out' };
const PILL_BASE = 100; // .filter-pill is a 100px square scaled to the active button

let ui = null;

/** Lazily collects the index, so openPaper() works even before init(). */
function setup() {
  if (ui) return ui;
  const filters = document.querySelector('.filters');
  const buttons = filters ? [...filters.querySelectorAll('[data-filter]')] : [];
  ui = {
    filters,
    buttons,
    pill: filters?.querySelector('.filter-pill') || null,
    rows: [...document.querySelectorAll('.paper-row')],
    counter: document.getElementById('research-count'),
    current: buttons.find(button => button.classList.contains('active'))?.dataset.filter || 'all',
  };
  return ui;
}

/* ----------------------------------------------------------- the filter */

function activeButton() {
  return ui.buttons.find(button => button.dataset.filter === ui.current) || null;
}

/** Places the blue block behind a button. Rects are read once per move, never per frame. */
function movePill(button, { instant = false } = {}) {
  const { filters, pill } = ui;
  if (!motion || !pill || !button) return;
  const box = filters.getBoundingClientRect();
  const rect = button.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return; // laid out at zero size; the ResizeObserver retries
  const to = {
    x: Math.round(rect.left - box.left),
    y: Math.round(rect.top - box.top),
    scaleX: Math.round(rect.width) / PILL_BASE,
    scaleY: Math.round(rect.height) / PILL_BASE,
  };
  if (instant || !filters.classList.contains('has-pill')) {
    // The active button hands its own blue background to the block. The block
    // is shown before GSAP first reads it (GSAP re-parents unrendered elements
    // to measure them); both happen in this task, so no frame paints between.
    filters.classList.add('has-pill');
    gsap.killTweensOf(pill);
    gsap.set(pill, to);
    return;
  }
  gsap.to(pill, { ...to, ...FILTER_SLIDE, overwrite: true });
}

function setCount(count) {
  if (!ui.counter) return;
  const text = `${count} ${count === 1 ? 'WORK' : 'WORKS'} / 2024–2026`;
  if (ui.counter.textContent !== text) ui.counter.textContent = text; // no repeat announcements
}

function setFilter(category, { instant = false } = {}) {
  setup();
  ui.current = category;
  ui.buttons.forEach(button => {
    const on = button.dataset.filter === category;
    button.classList.toggle('active', on);
    button.setAttribute('aria-pressed', String(on));
  });
  movePill(activeButton(), { instant });
  let count = 0;
  ui.rows.forEach(row => {
    const show = category === 'all' || row.dataset.category === category;
    if (show) count++;
    setRowVisible(row, show, { instant: instant || !motion });
  });
  setCount(count);
}

/* ------------------------------------------------------------ the rows */

const summaryOf = row => row.querySelector('summary');
const closedHeight = row => {
  const style = getComputedStyle(row);
  return (summaryOf(row)?.offsetHeight || 0) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
};
/** The row's height at height:auto, measured without a paint. */
function naturalHeight(row) {
  const inline = row.style.height;
  row.style.height = 'auto';
  const height = row.offsetHeight;
  row.style.height = inline;
  return height;
}

function settle(row) {
  row._tween = null;
  row._tweenKind = '';
  row.classList.remove('is-animating');
  gsap?.set(row, { clearProps: 'height,opacity' });
  relayout();
}

function killRowTween(row) {
  row._tween?.kill();
  row._tween = null;
  row._tweenKind = '';
}

function startTween(row, kind, from, to) {
  row.classList.add('is-animating');
  row._tweenKind = kind;
  row._tween = gsap.fromTo(row, from, to);
}

/** Height + opacity, all rows together (no stagger), then [hidden]. */
function setRowVisible(row, show, { instant = false } = {}) {
  const shown = row._shown ?? !row.hidden;
  const filtering = row._tweenKind === 'filter';
  if (show === shown && !(instant && filtering)) return; // already there (or heading there)
  row._shown = show;
  const wasAnimating = !!row._tween;
  killRowTween(row);
  // A filter that interrupts a closing row finishes the close first.
  if (row._openTarget === false) { row.open = false; row.classList.remove('is-closing'); }
  delete row._openTarget;

  if (instant) {
    row.hidden = !show;
    if (wasAnimating || row.style.height || row.style.opacity) settle(row);
    return;
  }
  const from = row.hidden ? 0 : row.offsetHeight;
  const fromOpacity = row.hidden ? 0 : parseFloat(getComputedStyle(row).opacity);
  row.hidden = false;
  const to = show ? naturalHeight(row) : 0;
  startTween(row, 'filter', { height: from, opacity: fromOpacity }, {
    height: to,
    opacity: show ? 1 : 0,
    ...ROW_COLLAPSE,
    onComplete: () => { if (!show) row.hidden = true; settle(row); },
  });
}

/** Opens or closes a <details> row, animating its height and easing the figure in. */
function setOpen(row, open, { animate = motion } = {}) {
  const current = row._openTarget ?? row.open;
  if (current === open) return;
  if (!animate || row.hidden || row._shown === false) {
    killRowTween(row);
    delete row._openTarget;
    row.classList.remove('is-closing');
    row.open = open;
    settle(row);
    return;
  }
  // Start from wherever the row is right now (mid-filter or mid-toggle included).
  const from = row.offsetHeight;
  const fromOpacity = parseFloat(getComputedStyle(row).opacity);
  killRowTween(row);
  row._openTarget = open;

  if (open) {
    const wasShut = !row.open || from <= closedHeight(row) + 1;
    row.classList.remove('is-closing');
    row.open = true;
    const to = naturalHeight(row);
    startTween(row, 'toggle', { height: from, opacity: fromOpacity }, {
      height: to, opacity: 1, ...ROW_OPEN,
      onComplete: () => { delete row._openTarget; settle(row); },
    });
    const figure = row.querySelector('.paper-body img');
    if (figure && wasShut) {
      gsap.fromTo(figure, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.45, delay: 0.05, ease: 'expo.out', overwrite: true, clearProps: 'opacity,transform' });
    }
    return;
  }

  // Closing: the arrow and border read "closed" at once while the height eases shut.
  row.classList.add('is-closing');
  startTween(row, 'toggle', { height: from, opacity: fromOpacity }, {
    height: closedHeight(row), opacity: 1, ...ROW_CLOSE,
    onComplete: () => {
      delete row._openTarget;
      row.open = false;
      row.classList.remove('is-closing');
      settle(row);
    },
  });
}

/* ------------------------------------------------------------ open API */

/** Runs fn once no dialog holds the scroll lock (Lenis ignores scrollTo while stopped). */
function whenScrollFree(fn) {
  if (!html.classList.contains('scroll-locked')) { fn(); return; }
  let done = false;
  const run = () => { if (done) return; done = true; observer.disconnect(); clearTimeout(fallback); setTimeout(fn, 0); };
  const observer = new MutationObserver(() => { if (!html.classList.contains('scroll-locked')) run(); });
  observer.observe(html, { attributes: true, attributeFilter: ['class'] });
  const fallback = setTimeout(run, 1500);
}

/**
 * scrollToEl() that arrives. A native smooth scroll (touch, no Lenis) is
 * cancelled whenever ScrollTrigger.refresh() re-applies scroll positions, which
 * happens as an opened row or a module's late layout settles. So the trip
 * resumes after each interruption until it arrives, the user takes over, or
 * 2.5s pass. Also used by search.js for in-page targets.
 */
export function guidedScrollTo(target, { immediate = false } = {}) {
  // core.scrollToEl resumes native smooth scrolls that a ScrollTrigger refresh interrupts.
  scrollToEl(target, { immediate });
}

/**
 * Resets the filter to "all", opens the paper row, scrolls it under the nav
 * and focuses its summary. Returns false when id is not a paper row.
 */
export function openPaper(id, { scroll = true, focus = true, animate = motion, immediate = false } = {}) {
  const row = id ? document.getElementById(id) : null;
  if (!row?.classList.contains('paper-row')) return false;
  setup();
  if (ui.current !== 'all' || row.hidden) setFilter('all', { instant: true });
  const wasOpen = row._openTarget ?? row.open;
  setOpen(row, true, { animate });
  if (wasOpen) emit('paper:open', { id }); // otherwise the toggle event announces it
  whenScrollFree(() => {
    if (scroll) guidedScrollTo(row, { immediate });
    if (focus) focusWithoutScroll(summaryOf(row));
  });
  return true;
}

function paperIdFromHash() {
  let id = '';
  try { id = decodeURIComponent(location.hash.slice(1)); } catch { return ''; }
  return id.startsWith('paper-') ? id : '';
}

/** Deep links: open the row in place; only scroll if the browser did not already land on it. */
function openFromHash({ initial = false } = {}) {
  const id = paperIdFromHash();
  const row = id ? document.getElementById(id) : null;
  if (!row?.classList.contains('paper-row')) return;
  const top = row.getBoundingClientRect().top;
  const landed = top > 0 && top < innerHeight * 0.6;
  openPaper(id, { scroll: !landed, focus: false, animate: motion && !initial, immediate: initial });
  if (initial) {
    // Fonts can shift layout after the first jump; correct once, without animation.
    document.fonts?.ready.then(() => {
      const after = row.getBoundingClientRect().top;
      if (after < 0 || after > innerHeight * 0.6) scrollToEl(row, { immediate: true });
    });
  }
}

/* ---------------------------------------------------------------- init */

export function init() {
  setup();
  const { filters, buttons, rows } = ui;

  buttons.forEach(button => button.addEventListener('click', () => {
    if (button.dataset.filter !== ui.current) setFilter(button.dataset.filter);
  }));

  // Keep the block on its button through font swaps and resizes.
  if (motion && filters && ui.pill && 'ResizeObserver' in window) {
    const ro = new ResizeObserver(() => movePill(activeButton(), { instant: true }));
    ro.observe(filters);
    buttons.forEach(button => ro.observe(button));
  } else if (motion) movePill(activeButton(), { instant: true });

  rows.forEach(row => {
    // Intercept the summary's activation (click, Enter, Space all dispatch a click) to animate.
    summaryOf(row)?.addEventListener('click', event => {
      if (!motion) return; // native toggle
      event.preventDefault();
      setOpen(row, !(row._openTarget ?? row.open));
    });
    row.addEventListener('toggle', () => {
      relayout();
      if (row.open) emit('paper:open', { id: row.id });
    });
  });

  // Every [data-open-paper] link in the document: gallery ↗ squares, molecule and explainer links.
  document.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.('[data-open-paper]');
    const id = link?.dataset.openPaper;
    if (!id || !document.getElementById(id)?.classList.contains('paper-row')) return;
    event.preventDefault();
    history.replaceState(null, '', `#${id}`);
    openPaper(id);
  });

  openFromHash({ initial: true });
  addEventListener('hashchange', () => openFromHash());
}
