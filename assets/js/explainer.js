// Poster explainer: the template's framed poster dialog, enlarged to near full
// screen. Only the vector poster moves out of its card (FLIP); a viewBox camera
// then walks through the poster's own stages. Step titles are the poster's own
// stage labels, captions quote only text printed on that poster or on this page
// (the paper row's description is read from the DOM), and the last step shows
// the original paper figure, venue, authors and only the links that exist.
//
// Owns every click on .poster-link[data-poster]. Modifier clicks and no-JS keep
// the native link to the SVG file.
import { gsap, motion, clamp, lerp, debounce, emit, lockScroll, unlockScroll } from './core.js';
import { borrowPoster, returnPoster, createPosterSVG } from './poster-svg.js';

const PW = 1200, PH = 800;                       // poster units
const FULL = { cx: 600, cy: 400, w: 1200, h: 800 };
const PAD = 1.06;                                // breathing room around a stage
const MIN_W = 300;                               // never zoom tighter than this
const NOTE_RESEARCH = 'Concept illustration · Original paper figures in publication details';
const NOTE_RAMAIN = 'Concept illustration · Computer-use workflow';

/* --------------------------------------------------------------------------
   Stages. Every string below is printed on that poster (see images/posters/).
   cam = the stage's region in poster units {cx, cy, w, h}.
   terms = [label, sublabel?] pairs, also printed on the poster.
   -------------------------------------------------------------------------- */
const POSTERS = {
  panorama: {
    overview: { kicker: 'HIGH-DIMENSIONAL SIMILARITY SEARCH', title: 'FAST-TRACK NEAREST NEIGHBORS', terms: [['SPECTRAL PROJECTION → DISTANCE BOUNDS → PRUNING → EXACT VERIFICATION.']] },
    stages: [
      { title: '01 / VECTOR SPACE', caption: 'QUERY VECTOR', cam: { cx: 209, cy: 485, w: 330, h: 520 } },
      { title: '02 / SPECTRAL PROJECTION', caption: 'energy concentrates early', terms: [['ORTHOGONAL'], ['SPECTRAL DECAY']], cam: { cx: 600, cy: 360, w: 440, h: 240 } },
      { title: 'INCREMENTAL DISTANCE BOUNDS', caption: 'partial distance → tighter bound → prune', terms: [['EARLY CANDIDATE PRUNING']], cam: { cx: 600, cy: 600, w: 430, h: 250 } },
      { title: '03 / NEAREST SET', caption: 'EXACT VERIFY', terms: [['k NEAREST NEIGHBORS']], cam: { cx: 989, cy: 485, w: 334, h: 520 } },
    ],
  },
  dissolvr: {
    overview: { kicker: 'MOLECULAR MACHINE LEARNING', title: 'An interpretable framework for aqueous and organic solubility prediction', terms: [['STRUCTURE → EVIDENCE → PREDICTION']] },
    stages: [
      { title: '01 / SOLUTE STRUCTURE', caption: 'ILLUSTRATIVE SOLUTE · GLYCEROL', terms: [['LOCAL HYDROXYL MOTIF'], ['LOCAL STRUCTURE HIGHLIGHT']], cam: { cx: 206, cy: 442, w: 303, h: 395 } },
      { title: '02 / FEATURE EVIDENCE', caption: 'DESCRIPTOR CONTRIBUTIONS', terms: [['TOPOLOGICAL STRUCTURE', 'Connectivity · local patterns'], ['POLARITY', 'Functional-group features'], ['THERMODYNAMIC RECONSTRUCTION', 'Energetic projections · temperature']], cam: { cx: 607, cy: 422, w: 485, h: 355 } },
      { title: '03 / SOLUBILITY OUTPUTS', caption: 'Predicted solubility', terms: [['AQUEOUS', 'log S'], ['ORGANIC', 'log S']], cam: { cx: 1005, cy: 428, w: 290, h: 365 } },
    ],
  },
  bonsai: {
    overview: { kicker: 'GRAPH DISTILLATION / NODE CLASSIFICATION', title: 'Gradient-free graph distillation.' },
    stages: [
      { title: 'FULL GRAPH', caption: 'many linked neighborhoods', terms: [['SELECTED NODE'], ['NEIGHBOR RELATION']], cam: { cx: 295, cy: 375, w: 470, h: 390 } },
      { title: 'REPRESENTATIVE COMPUTATION TREES', caption: ['small structures stand in for the whole', 'Bonsai selects representative computation trees for node classification, without gradient-based distillation.'], terms: [['SELECT'], ['TREE NODE']], cam: { cx: 832, cy: 370, w: 635, h: 380 } },
    ],
  },
  condensation: {
    overview: { kicker: 'RETHINKING DATA-EFFICIENT LEARNING', title: 'Move beyond full-dataset training and model dependence', terms: [['DATA → STRUCTURE → MULTIPLE MODEL BRANCHES']] },
    stages: [
      { title: 'FULL DATASET', caption: 'large graph · repeated input', cam: { cx: 195, cy: 455, w: 250, h: 190 } },
      { title: 'TRAIN / MODEL', caption: 'dataset-specific fit', cam: { cx: 430, cy: 465, w: 240, h: 230 } },
      { title: 'CONDENSE', caption: 'graph structure', cam: { cx: 582, cy: 495, w: 160, h: 130 } },
      { title: 'COMPACT GRAPH', caption: 'FROM REPEATED TRAINING TO A SHARED GRAPH', cam: { cx: 726, cy: 478, w: 222, h: 190 } },
      { title: 'MODEL BRANCHES', caption: 'A compact graph representation connected across model branches.', terms: [['MODEL A'], ['MODEL B'], ['MODEL C']], cam: { cx: 985, cy: 462, w: 290, h: 210 } },
    ],
  },
  reasonbench: {
    overview: { kicker: 'RESEARCH PAPER / ICML 2026', title: 'Benchmarking the (In)Stability of LLM Reasoning' },
    stages: [
      { title: 'ONE QUESTION', caption: 'same input', terms: [['FIXED PROMPT']], cam: { cx: 182, cy: 400, w: 230, h: 340 } },
      { title: 'REASONING PATHS', caption: 'REASONING TRACES', terms: [['ANSWER VARIATION']], cam: { cx: 625, cy: 432, w: 650, h: 400 } },
      { title: 'OUTCOMES', caption: 'ANSWERS DIVERGE', terms: [['STABLE'], ['UNSTABLE']], cam: { cx: 1036, cy: 432, w: 190, h: 400 } },
    ],
  },
  sc3: {
    overview: { kicker: 'NEURIPS 2026', title: 'ONE SHARED SPECIMEN / DISTINCT TEST CONDITIONS' },
    stages: [
      { title: 'SAME SOLUTE', caption: 'held constant across the panel', terms: [['ONE MOLECULAR INPUT']], cam: { cx: 182, cy: 470, w: 265, h: 480 } },
      { title: 'SOLVENT MATRIX', caption: 'IDENTICAL SOLUTE IN EACH COLUMN', terms: [['SIX SOLVENT CONDITIONS', 'WATER · ETHANOL · ACETONE · BENZENE · ACETONITRILE · DMSO'], ['SOLVENT CONTEXT']], cam: { cx: 731, cy: 470, w: 827, h: 480 } },
    ],
  },
  molmerger: {
    overview: { kicker: 'MOLECULAR GRAPH LEARNING', title: 'Solute–solvent interactions become edges in a merged molecular graph' },
    stages: [
      { title: 'SEPARATE INPUT GRAPHS', caption: 'SOLID = WITHIN-MOLECULE BOND', terms: [['SOLUTE'], ['SOLVENT']], cam: { cx: 186, cy: 460, w: 272, h: 440 } },
      { title: 'MERGED REPRESENTATION', caption: ['ONE GRAPH REPRESENTATION', 'SOLUTE + SOLVENT COMPONENTS'], terms: [['SOLUTE BONDS'], ['SOLVENT BONDS'], ['VIRTUAL INTERACTION EDGE', 'DASHED = VIRTUAL SOLUTE–SOLVENT INTERACTION']], cam: { cx: 604, cy: 460, w: 488, h: 440 } },
      { title: 'PREDICTION', terms: [['ATTENTION', 'WEIGHTED MESSAGE'], ['GRU'], ['PREDICTED', 'log S']], cam: { cx: 1010, cy: 460, w: 276, h: 440 } },
    ],
  },
  ramain: {
    overview: { kicker: 'COMPUTER-USE AGENTS / RAMAIN', title: 'OBSERVE → REASON → ACT → VERIFY ↺', terms: [['WEB PORTALS'], ['LEGACY SYSTEMS']] },
    stages: [
      // The phase nodes ring the shared windows, so no wash: ramain.js lights the active node.
      // Regions stay narrow enough that the framing sits between the header rule and the footer.
      { title: 'Observe', caption: 'SCREEN STATE', phase: 0, cam: { cx: 482, cy: 472, w: 620, h: 280, wash: false } },
      { title: 'Reason', caption: 'NEXT STEP', phase: 1, cam: { cx: 810, cy: 470, w: 560, h: 260, wash: false } },
      { title: 'Act', caption: 'UI INPUT', terms: [['SAVE RECORD']], phase: 2, cam: { cx: 790, cy: 560, w: 600, h: 250, wash: false } },
      { title: 'Verify', caption: 'RESULT', phase: 3, cam: { cx: 480, cy: 560, w: 680, h: 240, wash: false } },
    ],
  },
};

/* ------------------------------------------------------------ DOM reading */
const text = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();

/** The first and last steps come from the page itself (single source of truth). */
function buildSteps(name) {
  const config = POSTERS[name];
  const steps = [{ ...config.overview, cam: FULL, overview: true }];
  steps.push(...config.stages);

  if (name === 'ramain') {
    const band = document.getElementById('building');
    steps[0].caption = text(band?.querySelector('.build-copy > p:not(.build-lead)')) || undefined;
    const cta = band?.querySelector('.build-copy a[href^="http"]');
    steps.push({
      kicker: text(band?.querySelector('.section-label > span:last-child')),
      title: text(band?.querySelector('.build-heading h2')) || 'ramAIn',
      caption: text(band?.querySelector('.build-lead')) || undefined,
      terms: [...(band?.querySelectorAll('.build-tags span') || [])].map(span => [text(span)]),
      cam: FULL,
      cta: { href: cta?.href || 'https://ramain.ai', label: 'Visit ramain.ai ↗', external: true },
    });
    return steps;
  }

  const row = document.getElementById(`paper-${name}`);
  const body = row?.querySelector('.paper-body');
  steps[0].caption = text(body?.querySelector('p:not(.authors)')) || undefined;
  const figure = body?.querySelector('img');
  steps.push({
    kicker: text(row?.querySelector('.paper-venue')),
    title: text(row?.querySelector('summary h3')) || POSTERS[name].overview.title,
    authors: text(body?.querySelector('.authors')),
    figure: figure ? { src: figure.getAttribute('src'), alt: figure.getAttribute('alt') || '' } : null,
    links: [...(body?.querySelectorAll('.paper-links a') || [])],
    cam: FULL,
    cta: { href: `#paper-${name}`, label: 'Publication details ↗', paper: `paper-${name}` },
  });
  return steps;
}

/* ----------------------------------------------------------------- camera */
/** Expand a stop to the stage aspect (never crop the region), then clamp it inside the poster. */
function fitView(stop, aspect) {
  const pad = stop === FULL ? 1 : PAD;
  let w = Math.max(stop.w * pad, MIN_W);
  let h = Math.max(stop.h * pad, MIN_W / 1.5);
  if (w / h < aspect) w = h * aspect; else h = w / aspect;
  const x = w >= PW ? (PW - w) / 2 : clamp(stop.cx - w / 2, 0, PW - w);
  const y = h >= PH ? (PH - h) / 2 : clamp(stop.cy - h / 2, 0, PH - h);
  return { x, y, w, h };
}

/** The stage region itself (padded, inside the poster): everything outside it is washed back. */
function focusOf(stop) {
  if (stop === FULL || stop.wash === false) return { fx: 0, fy: 0, fw: PW, fh: PH };
  const fw = Math.min(stop.w * PAD, PW), fh = Math.min(stop.h * PAD, PH);
  return { fx: clamp(stop.cx - fw / 2, 0, PW - fw), fy: clamp(stop.cy - fh / 2, 0, PH - fh), fw, fh };
}

/** Camera state for a stop: the fitted viewBox plus the focus window, tweened together. */
const viewFor = (stop, aspect) => ({ ...fitView(stop, aspect || 1.5), ...focusOf(stop) });

const f2 = n => n.toFixed(2);
const viewBoxOf = v => `${f2(v.x)} ${f2(v.y)} ${f2(v.w)} ${f2(v.h)}`;

/**
 * Transform (origin 0 0) that places the stage SVG, showing viewBox `view`
 * inside `stage`, so that its poster lands exactly on the card poster `card`
 * (which shows the whole poster, xMidYMid meet).
 */
function flipTransform(card, stage, view) {
  const c = Math.min(card.width / PW, card.height / PH);
  const ox = card.left + (card.width - PW * c) / 2;
  const oy = card.top + (card.height - PH * c) / 2;
  const s = stage.width / view.w;
  return { x: ox - stage.left + c * view.x, y: oy - stage.top + c * view.y, scale: c / s };
}

/* --------------------------------------------------------------------- UI */
let ui = null;
let state = null;

function el(tag, className, attrs = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

function buildUI() {
  const dialog = el('dialog', 'explainer', { id: 'explainer-dialog', 'aria-labelledby': 'explainer-title', 'aria-describedby': 'explainer-caption', 'data-lenis-prevent': '' });
  dialog.innerHTML = `
    <div class="explainer-frame" aria-hidden="true"></div>
    <div class="explainer-layout">
      <header class="explainer-head">
        <h2 id="explainer-title"></h2>
        <button class="explainer-close" type="button" aria-label="Esc, close poster">Esc <span aria-hidden="true">×</span></button>
      </header>
      <div class="explainer-stage" role="img">
        <div class="explainer-tint" aria-hidden="true"></div>
        <svg class="explainer-focus" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid meet" viewBox="0 0 1200 800"><path fill-rule="evenodd"></path><rect class="explainer-crop" vector-effect="non-scaling-stroke"></rect><path class="explainer-marks" vector-effect="non-scaling-stroke"></path></svg>
      </div>
      <div class="explainer-side">
        <div class="explainer-panel" data-lenis-prevent>
          <div class="explainer-step">
            <div class="explainer-figure" id="explainer-figure"></div>
            <p class="explainer-kicker mono" id="explainer-kicker"></p>
            <h3 class="explainer-heading" id="explainer-step-title" tabindex="-1"></h3>
            <div class="explainer-caption" id="explainer-caption"></div>
            <ul class="explainer-terms" id="explainer-terms"></ul>
            <div class="explainer-actions" id="explainer-actions"></div>
          </div>
          <ol class="explainer-index" aria-hidden="true"></ol>
        </div>
        <div class="explainer-controls" role="group" aria-label="Poster steps">
          <button class="explainer-prev" type="button" aria-label="Previous step"><span aria-hidden="true">←</span> Prev</button>
          <ol class="explainer-dots" id="explainer-dots"></ol>
          <span class="explainer-count mono" aria-hidden="true"></span>
          <button class="explainer-next" type="button" aria-label="Next step">Next <span aria-hidden="true">→</span></button>
        </div>
      </div>
      <footer class="explainer-foot">
        <span id="explainer-note"></span>
        <a id="explainer-foot-link" href="#research"></a>
      </footer>
    </div>
    <p class="sr-only" id="explainer-live" aria-live="polite" aria-atomic="true"></p>`;
  document.body.append(dialog);

  const $ = selector => dialog.querySelector(selector);
  ui = {
    dialog,
    frame: $('.explainer-frame'), head: $('.explainer-head'), side: $('.explainer-side'), foot: $('.explainer-foot'),
    stage: $('.explainer-stage'), tint: $('.explainer-tint'), focus: $('.explainer-focus'), focusPath: $('.explainer-focus path'), crop: $('.explainer-crop'), marks: $('.explainer-marks'), panel: $('.explainer-panel'), step: $('.explainer-step'),
    title: $('#explainer-title'), close: $('.explainer-close'),
    figure: $('#explainer-figure'), kicker: $('#explainer-kicker'), heading: $('#explainer-step-title'),
    caption: $('#explainer-caption'), terms: $('#explainer-terms'), actions: $('#explainer-actions'),
    dots: $('#explainer-dots'), index: $('.explainer-index'), prev: $('.explainer-prev'), next: $('.explainer-next'), count: $('.explainer-count'),
    note: $('#explainer-note'), footLink: $('#explainer-foot-link'), live: $('#explainer-live'),
  };
  ui.chrome = [ui.frame, ui.head, ui.side, ui.foot, ui.tint, ui.focus];
  bindUI();
}

function bindUI() {
  const { dialog } = ui;
  ui.close.addEventListener('click', requestClose);
  ui.prev.addEventListener('click', () => go(state ? state.index - 1 : 0));
  ui.next.addEventListener('click', () => go(state ? state.index + 1 : 0));
  ui.dots.addEventListener('click', event => {
    const dot = event.target.closest('[data-step]');
    if (dot) go(+dot.dataset.step);
  });
  ui.panel.addEventListener('scroll', scrollCue, { passive: true });
  // The stage index is a pointer convenience (keyboard and AT use the dots).
  ui.index.addEventListener('click', event => {
    const row = event.target.closest('[data-step]');
    if (row) go(+row.dataset.step);
  });

  dialog.addEventListener('keydown', event => {
    if (!state) return;
    if (event.key === 'Escape') { event.preventDefault(); requestClose(); return; }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const delta = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (delta) { event.preventDefault(); go(state.index + delta); return; }
    if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); go(event.key === 'Home' ? 0 : state.steps.length - 1); }
  });
  // Esc arrives as `cancel`; animate the close instead of the instant UA close.
  dialog.addEventListener('cancel', event => { event.preventDefault(); requestClose(); });
  // A close we did not drive (e.g. a forced second Esc) still restores everything.
  dialog.addEventListener('close', () => { if (state && !dialog.open) finish(); });
  dialog.addEventListener('click', event => {
    if (event.target === dialog && state) {
      const r = dialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) requestClose();
    }
  });
  // publications.js owns [data-open-paper]: close first (window capture runs
  // before any document listener), then let the click reach it untouched.
  addEventListener('click', event => {
    if (state && dialog.contains(event.target) && event.target.closest?.('[data-open-paper]')) finish({ focus: false });
  }, true);

  // Swipe left / right on the stage (touch and pen; mouse uses the buttons).
  let swipe = null;
  ui.stage.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' || !event.isPrimary) return;
    swipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  ui.stage.addEventListener('pointerup', event => {
    if (!swipe || event.pointerId !== swipe.id || !state) { swipe = null; return; }
    const dx = event.clientX - swipe.x, dy = event.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.4) go(state.index + (dx < 0 ? 1 : -1));
  });
  ui.stage.addEventListener('pointercancel', () => { swipe = null; });

  if ('ResizeObserver' in window) new ResizeObserver(refit).observe(ui.stage);
}

/* ------------------------------------------------------------ populating */
function populate(name, link) {
  const research = name !== 'ramain';
  const tint = getComputedStyle(link).getPropertyValue('--card-tint').trim();
  ui.dialog.style.setProperty('--explainer-tint', tint || 'var(--tint-ramain)');
  ui.dialog.dataset.poster = name;
  ui.title.textContent = link.dataset.title || text(link.closest('.project-card')?.querySelector('h3')) || name;
  ui.stage.setAttribute('aria-label', link.querySelector('img')?.alt || ui.title.textContent);
  ui.note.textContent = research ? NOTE_RESEARCH : NOTE_RAMAIN;

  const cta = state.steps[state.steps.length - 1].cta;
  setLink(ui.footLink, cta);

  ui.index.replaceChildren(...state.steps.map((step, i) => {
    const li = el('li', '', { 'data-step': i });
    const no = el('span', 'explainer-index-no'); no.textContent = String(i + 1).padStart(2, '0');
    const label = el('span', 'explainer-index-label'); label.textContent = step.title;
    li.append(no, label);
    return li;
  }));

  ui.dots.replaceChildren(...state.steps.map((step, i) => {
    const li = el('li');
    const dot = el('button', 'explainer-dot', { type: 'button', 'data-step': i, 'aria-label': `Step ${i + 1} of ${state.steps.length}: ${step.title}` });
    dot.append(el('i', '', { 'aria-hidden': 'true' }));
    li.append(dot);
    return li;
  }));
}

function setLink(anchor, cta) {
  anchor.href = cta.href;
  anchor.textContent = cta.label;
  anchor.removeAttribute('data-open-paper');
  anchor.removeAttribute('target');
  anchor.removeAttribute('rel');
  if (cta.paper) anchor.dataset.openPaper = cta.paper;
  if (cta.external) { anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; }
}

function paragraph(str) {
  const p = el('p');
  p.textContent = str;
  if (!/[a-z]/.test(str)) p.className = 'is-label';   // the poster's own caps labels read as labels
  return p;
}

function renderStep(i) {
  const step = state.steps[i];
  const total = state.steps.length;

  ui.kicker.textContent = step.kicker || '';
  ui.kicker.hidden = !step.kicker;
  ui.heading.textContent = step.title;

  const captions = [].concat(step.caption || []).map(paragraph);
  if (step.authors) { const p = el('p', 'explainer-authors'); p.textContent = step.authors; captions.push(p); }
  ui.caption.replaceChildren(...captions);

  ui.terms.replaceChildren(...(step.terms || []).map(([label, note]) => {
    const li = el('li');
    const t = el('span', 'explainer-term'); t.textContent = label; li.append(t);
    if (note) { const d = el('span', 'explainer-term-note'); d.textContent = note; li.append(d); }
    return li;
  }));
  ui.terms.hidden = !step.terms?.length;

  ui.figure.replaceChildren();
  if (step.figure) {
    const img = el('img', '', { src: step.figure.src, alt: step.figure.alt, decoding: 'async' });
    if (!img.complete) img.addEventListener('load', fitIndex, { once: true });   // re-measure once it has height
    ui.figure.append(img);
  }
  ui.figure.hidden = !step.figure;

  ui.actions.replaceChildren();
  if (step.links?.length) {
    const links = el('div', 'explainer-links');
    step.links.forEach(source => {
      const a = el('a', '', { href: source.getAttribute('href') });
      if (source.target) a.target = source.target;
      if (source.rel) a.rel = source.rel;
      a.textContent = text(source);
      links.append(a);
    });
    ui.actions.append(links);
  }
  if (step.cta) {
    const a = el('a', 'solid-link explainer-cta');
    setLink(a, step.cta);
    const label = step.cta.label.replace(/\s*↗$/, '');
    a.textContent = label + ' ';
    const arrow = el('span', '', { 'aria-hidden': 'true' }); arrow.textContent = '↗';
    a.append(arrow);
    ui.actions.append(a);
  }
  ui.actions.hidden = !ui.actions.childElementCount;

  [...ui.dots.querySelectorAll('.explainer-dot')].forEach((dot, n) => {
    if (n === i) dot.setAttribute('aria-current', 'step'); else dot.removeAttribute('aria-current');
    dot.classList.toggle('is-seen', n < i);
  });
  [...ui.index.children].forEach((row, n) => row.classList.toggle('is-current', n === i));
  ui.panel.scrollTop = 0;
  fitIndex();
  ui.prev.setAttribute('aria-disabled', String(i === 0));
  ui.next.setAttribute('aria-disabled', String(i === total - 1));
  ui.count.textContent = `${String(i + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
}

/** The stage index only shows when it fits without making the panel scroll. */
function fitIndex() {
  ui.index.hidden = false;
  if (ui.panel.scrollHeight > ui.panel.clientHeight + 1) ui.index.hidden = true;
  scrollCue();
}

/** A soft fade at the panel's foot while more text sits below it. */
function scrollCue() {
  const p = ui.panel;
  p.classList.toggle('has-more', p.scrollHeight - p.clientHeight - p.scrollTop > 4);
}

/** One polite announcement per settled step (rapid key presses collapse into one). */
const announce = debounce(() => {
  if (!state) return;
  const step = state.steps[state.index];
  const words = [].concat(step.caption || []).join(' ') || step.authors || (step.terms?.[0]?.[0] ?? '');
  ui.live.textContent = `Step ${state.index + 1} of ${state.steps.length}. ${step.title}. ${words}`.trim();
}, 320);

/* ------------------------------------------------------------- open/close */
function cardRect(link) {
  const box = link.querySelector('img') || link;
  return box.getBoundingClientRect();
}

const usable = rect => rect && rect.width >= 32 && rect.height >= 32;
const onScreen = rect => usable(rect) && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;

async function open(link) {
  const name = link.dataset.poster;
  state = { name, link, steps: buildSteps(name), index: 0, busy: true, closing: false, done: false, pending: null };
  const current = state;

  // Measure before borrowing: the card's live SVG is where the FLIP starts.
  const inCard = link._posterSVG && link._posterSVG.parentNode === link ? link._posterSVG : null;
  const from = inCard && link.classList.contains('has-svg') ? inCard.getBoundingClientRect() : null;
  let svg = from ? borrowPoster(link) : null;
  current.borrowed = !!svg;
  if (!svg) {
    try { svg = await createPosterSVG(name); } catch { svg = null; }
    if (state !== current) return;
    if (!svg) { svg = el('img', 'explainer-fallback', { src: link.getAttribute('href'), alt: '' }); current.static = true; }
  }
  current.svg = svg;
  current.saved = { style: svg.getAttribute('style'), viewBox: svg.getAttribute('viewBox'), hidden: svg.getAttribute('aria-hidden') };
  svg.setAttribute('aria-hidden', 'true');

  populate(name, link);
  ui.live.textContent = '';
  ui.stage.insertBefore(svg, ui.focus);
  lockScroll();
  current.locked = true;
  ui.dialog.classList.toggle('is-reduced', !motion);
  ui.dialog.showModal();
  ui.close.focus({ preventScroll: true });

  measureStage();
  current.cam = viewFor(FULL, current.aspect);
  applyCam();
  renderStep(0);
  emit('explainer:open', { name, link });
  animateIn(usable(from) && onScreen(from) && motion ? from : null);
}

/** Something failed mid-open: put everything back so the page stays usable. */
function abort(error) {
  if (state && !state.done) {
    const { link } = state;
    try { finish({ focus: true }); } catch { state = null; }
    if (ui.dialog.open) ui.dialog.close();
    if (link?._posterSVG && link._posterSVG.parentNode !== link) returnPoster(link);
  }
  console.error('[site] explainer failed to open', error);
}

/** Rest rect of the stage SVG (measured only while it carries no transform). */
function measureStage() {
  if (!state?.svg) return null;
  const rect = state.svg.getBoundingClientRect();
  if (usable(rect)) { state.aspect = rect.width / rect.height; state.stageRect = rect; }
  return rect;
}

function applyCam() {
  if (!state || state.static || !state.cam) return;
  const v = state.cam;
  const box = viewBoxOf(v);
  state.svg.setAttribute('viewBox', box);
  // The wash shares the poster's viewBox, so it is drawn in poster units.
  ui.focus.setAttribute('viewBox', box);
  ui.focusPath.setAttribute('d', `M${f2(v.x - 1)} ${f2(v.y - 1)}h${f2(v.w + 2)}v${f2(v.h + 2)}h${f2(-v.w - 2)}Z M${f2(v.fx)} ${f2(v.fy)}h${f2(v.fw)}v${f2(v.fh)}h${f2(-v.fw)}Z`);
  // A hairline crop with corner marks (the molecule panel's brackets) makes the
  // framing read as deliberate rather than as text cut off at the stage edge.
  const whole = v.fw >= PW - 1 && v.fh >= PH - 1;
  ui.crop.setAttribute('x', f2(v.fx)); ui.crop.setAttribute('y', f2(v.fy));
  ui.crop.setAttribute('width', f2(v.fw)); ui.crop.setAttribute('height', f2(v.fh));
  const k = Math.min(v.fw, v.fh) * 0.07, x0 = v.fx, y0 = v.fy, x1 = v.fx + v.fw, y1 = v.fy + v.fh;
  ui.marks.setAttribute('d', `M${f2(x0)} ${f2(y0 + k)}V${f2(y0)}H${f2(x0 + k)}M${f2(x1 - k)} ${f2(y0)}H${f2(x1)}V${f2(y0 + k)}M${f2(x1)} ${f2(y1 - k)}V${f2(y1)}H${f2(x1 - k)}M${f2(x0 + k)} ${f2(y1)}H${f2(x0)}V${f2(y1 - k)}`);
  ui.focus.classList.toggle('is-whole', whole);
}

function animateIn(from) {
  const { svg } = state;
  if (!gsap) { settle(); return; }
  if (!motion) {
    gsap.fromTo([...ui.chrome, svg], { opacity: 0 }, { opacity: 1, duration: 0.15, ease: 'none', onComplete: settle });
    return;
  }
  gsap.fromTo(ui.frame, { opacity: 0, scale: 0.985 }, { opacity: 1, scale: 1, duration: 0.25, ease: 'power2.out' });
  gsap.fromTo([ui.head, ui.side, ui.foot, ui.tint, ui.focus], { opacity: 0 }, { opacity: 1, duration: 0.25, delay: 0.05, ease: 'power1.out' });
  // The poster's gesture plays during the flight, so its build-up is the arrival.
  state.introMotion = true;
  playStepMotion(0);
  if (from && state.stageRect) {
    const t = flipTransform(from, state.stageRect, state.cam);
    gsap.fromTo(svg, { x: t.x, y: t.y, scale: t.scale, transformOrigin: '0 0', willChange: 'transform' },
      { x: 0, y: 0, scale: 1, duration: 0.5, ease: 'expo.out', onComplete: settle });
  } else {
    gsap.fromTo(svg, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power1.out', onComplete: settle });
  }
}

function settle() {
  if (!state || state.closing) return;
  gsap?.set([state.svg, ...ui.chrome], { clearProps: 'transform,transformOrigin,willChange,opacity' });
  state.busy = false;
  measureStage();
  const pending = state.pending;
  state.pending = null;
  if (pending != null && pending !== 0) go(pending);
  else { refitNow(); if (!state.introMotion) playStepMotion(0); }
}

function requestClose() {
  if (!state) return;
  if (state.closing) { finish(); return; }          // a second request finishes at once
  state.closing = true;
  stopTweens();
  const { svg, link } = state;
  const card = cardRect(link);
  ui.dialog.classList.add('is-closing');
  if (!gsap) { finish(); return; }

  const fade = motion ? 0.22 : 0.15;
  gsap.killTweensOf(ui.chrome);
  gsap.to([ui.frame, ui.head, ui.side, ui.foot], { opacity: 0, duration: fade, ease: 'power1.in' });
  // The stage tint and wash leave first, so only the vector is seen flying home.
  gsap.to([ui.tint, ui.focus], { opacity: 0, duration: motion ? 0.12 : 0.15, ease: 'power1.in' });
  if (motion && !state.static && onScreen(card) && state.stageRect) {
    // Reverse FLIP from wherever the vector is (even mid-open). The camera zooms
    // back out to the whole poster on the way, so the full poster, not a cropped
    // stage, lands on the card.
    const from = { ...state.cam };
    const to = viewFor(FULL, state.aspect);
    const t0 = { x: +gsap.getProperty(svg, 'x') || 0, y: +gsap.getProperty(svg, 'y') || 0, k: +gsap.getProperty(svg, 'scaleX') || 1 };
    const t1 = flipTransform(card, state.stageRect, to);
    gsap.set(svg, { transformOrigin: '0 0', willChange: 'transform' });
    const setX = gsap.quickSetter(svg, 'x', 'px'), setY = gsap.quickSetter(svg, 'y', 'px'), setK = gsap.quickSetter(svg, 'scale');
    const p = { t: 0 };
    gsap.to(p, {
      t: 1, duration: 0.34, ease: 'power3.inOut', onComplete: finish,
      onUpdate: () => {
        Object.keys(to).forEach(key => { state.cam[key] = lerp(from[key], to[key], p.t); });
        applyCam();
        setX(lerp(t0.x, t1.x, p.t)); setY(lerp(t0.y, t1.y, p.t)); setK(lerp(t0.k, t1.scale, p.t));
      },
    });
    state.closeTween = p;
  } else {
    gsap.to(svg, { opacity: 0, duration: fade, ease: 'power1.in', onComplete: finish });
  }
}

/** Restore everything: the SVG goes home pixel-identical, scroll and focus return. */
function finish({ focus = true } = {}) {
  if (!state || state.done) return;
  const current = state;
  current.done = true;
  stopTweens();
  const { svg, link, name, saved, borrowed } = current;
  if (current.closeTween) gsap?.killTweensOf(current.closeTween);
  settleGesture(current);

  if (svg) {
    gsap?.killTweensOf(svg);
    gsap?.set(svg, { clearProps: 'all' });
    if (saved.hidden == null) svg.removeAttribute('aria-hidden'); else svg.setAttribute('aria-hidden', saved.hidden);
    if (saved.style == null) svg.removeAttribute('style'); else svg.setAttribute('style', saved.style);
    if (svg.tagName.toLowerCase() === 'svg') svg.setAttribute('viewBox', saved.viewBox || `0 0 ${PW} ${PH}`);
    if (borrowed) returnPoster(link); else svg.remove();
  }
  gsap?.killTweensOf(ui.chrome);
  gsap?.set(ui.chrome, { clearProps: 'all' });
  ui.dialog.classList.remove('is-closing');
  state = null;
  if (ui.dialog.open) ui.dialog.close();
  if (current.locked) unlockScroll();
  if (focus && link.isConnected) link.focus({ preventScroll: true });
  emit('explainer:close', { name, link });
}

/* ------------------------------------------------------------------ steps */
function go(i) {
  if (!state || state.closing) return;
  const next = clamp(i, 0, state.steps.length - 1);
  if (state.busy) { state.pending = next; return; }       // wait for the FLIP to land
  if (next === state.index) return;
  state.index = next;
  renderStep(next);
  stampDot(next);
  revealStep();
  moveCamera(state.steps[next].cam);
  playStepMotion(next);
  announce();
}

function moveCamera(stop) {
  if (state.static) return;
  const target = viewFor(stop, state.aspect);
  state.camTween?.kill();
  if (!gsap || !motion) { state.cam = target; applyCam(); return; }
  state.camTween = gsap.to(state.cam, { ...target, duration: 0.7, ease: 'power3.inOut', onUpdate: applyCam });
}

function revealStep() {
  if (!gsap) return;
  gsap.killTweensOf(ui.step);
  if (motion) gsap.fromTo(ui.step, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.28, ease: 'power2.out', clearProps: 'opacity,transform' });
  else gsap.fromTo(ui.step, { opacity: 0 }, { opacity: 1, duration: 0.15, ease: 'none', clearProps: 'opacity' });
}

/** The motif: the active square stamps in (0 → 1, back.out). */
function stampDot(i) {
  if (!gsap || !motion) return;
  const square = ui.dots.querySelectorAll('.explainer-dot i')[i];
  if (square) gsap.fromTo(square, { scale: 0 }, { scale: 1, duration: 0.35, ease: 'back.out(1.6)', clearProps: 'transform' });
}

/**
 * The opening step replays the poster's own gesture (posters.js); each ramAIn
 * phase step acts out that phase (ramain.js). Both modules return the poster to
 * its authored frame when they finish or are stopped.
 */
async function playStepMotion(i) {
  const current = state;
  if (!current || current.static) return;
  const step = current.steps[i];
  const live = () => state === current && current.index === i && !current.closing;
  try {
    if (current.name === 'ramain') {
      const mod = await import('./ramain.js');
      if (!live()) return;
      current.stopMotion = () => mod.restoreRamain?.(current.svg);
      if (step.phase != null) current.gesture = mod.playRamainStep?.(current.svg, step.phase);
      else if (i === 0) mod.restoreRamain?.(current.svg);
    } else if (i === 0 && motion) {
      const mod = await import('./posters.js');
      if (!live()) return;
      current.stopMotion = () => mod.stopGesture?.(current.svg);
      current.gesture = mod.playGesture?.(current.name, current.svg);
    }
  } catch { /* the authored poster frame stays */ }
}

/** Stop any running gesture: its module restores the authored frame. */
function settleGesture(current) {
  try { current.stopMotion?.(); } catch { /* ignore */ }
  current.gesture = null;
}

function stopTweens() {
  if (!state) return;
  state.camTween?.kill();
  state.camTween = null;
  if (gsap && state.svg) gsap.killTweensOf(state.svg);
  if (gsap) gsap.killTweensOf(ui.step);
}

/* ----------------------------------------------------------------- resize */
function refitNow() {
  if (!state || state.static) return;
  const rect = measureStage();
  if (!usable(rect)) return;
  state.camTween?.kill();
  state.cam = viewFor(state.steps[state.index].cam, state.aspect);
  applyCam();
}

function refit() {
  if (!state || state.busy || state.closing) return;
  refitNow();
  fitIndex();
}

/* ------------------------------------------------------------------- init */
export function init() {
  buildUI();
  document.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.('.poster-link[data-poster]');
    if (!link || !POSTERS[link.dataset.poster] || ui.dialog.contains(link)) return;
    event.preventDefault();
    if (!state) open(link).catch(abort);
  });
}
