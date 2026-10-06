// ramAIn live demo. The poster IS the demo: the inline poster acts out one
// illustrative Observe → Reason → Act → Verify pass the first time the visual
// is ≥40% in view, then holds on Verify. The caption tracks the active phase
// (blue text + the square motif) and its ↺ becomes a real replay button.
//
// Performance: the poster's windows sit inside a 13px-blur filter group, so
// nothing inside it is ever touched. Every moving part is an exact copy in one
// overlay <g> appended to the SVG root, promoted to its own compositor layer
// (will-change) only while a sequence runs, so the filtered artwork below is
// never re-rasterised. Swapping originals for copies is pixel-identical, which
// makes the held frame the authored poster with the Verify node lit.
//
// Fidelity note: the poster's SAVE RECORD button is almost fully covered by
// the front window, so the press lands on the record field that carries the
// authored check mark; Verify then redraws that check.

import { mq, gsap, motion, motionPaused, on, relayout, watchVisibility, pageVisible } from './core.js';
import { overlayPoster } from './poster-svg.js';

export const RAMAIN_STEPS = ['Observe', 'Reason', 'Act', 'Verify'];

const NS = 'http://www.w3.org/2000/svg';
const FRONT = 'rotate(4 596 484)';        // the CASE RECORD window
const INK = '#2688a9';                    // the poster's check teal: the agent's annotation ink
const PULSE = '#f4fcff';                  // the poster's cursor fill: one pulse around the loop
const CARET = '#18336b';                  // the poster's cursor outline
const NODE_AT = [[186, 386], [1012, 386], [1012, 599], [186, 599]]; // Observe, Reason, Act, Verify
const REST = [793, 534];                  // the authored cursor tip
const CHECK_LEN = 20.6;                   // M785 576l5 5 9-10
const BAR_W = 136;                        // the authored value bar
// UI element bounds in the front window's own coordinates (padded 3 units).
const BOX = {
  title: [408, 368, 447, 49],
  input: [565, 506, 238, 37],
  record: [565, 565, 238, 30],
  list: [440, 445, 77, 79],
};
const FIELD = [568, 568, 232, 24];        // the record field (press target)

const reducedNow = () => mq.reduced.matches || !motion;

/* ------------------------------------------------------------- geometry */
function inFront(x, y) {
  const a = (4 * Math.PI) / 180, dx = x - 596, dy = y - 484;
  return [596 + dx * Math.cos(a) - dy * Math.sin(a), 484 + dx * Math.sin(a) + dy * Math.cos(a)];
}
const TYPE_AT = inFront(583, 532);        // just below-left of the input's value, so typing stays visible
const PRESS_AT = inFront(700, 580);       // inside the record field
const PLAN = [REST, [760, 492], [650, 488], TYPE_AT]; // Reason's planned path (one cubic)

function cubic(p, t) {
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * p[0][0] + b * p[1][0] + c * p[2][0] + d * p[3][0], a * p[0][1] + b * p[1][1] + c * p[2][1] + d * p[3][1]];
}

/** Arc-length table so dots are evenly spaced and the cursor glides at a true speed. */
function arcTable(p, n = 120) {
  const pts = [cubic(p, 0)], len = [0];
  for (let i = 1; i <= n; i++) {
    pts.push(cubic(p, i / n));
    len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  return { pts, len, total: len[n] };
}
const PLAN_ARC = arcTable(PLAN);

function pointAt(arc, s) {
  const { pts, len } = arc;
  if (s <= 0) return pts[0];
  if (s >= arc.total) return pts[pts.length - 1];
  let lo = 0, hi = len.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (len[mid] <= s) lo = mid; else hi = mid; }
  const f = (s - len[lo]) / (len[hi] - len[lo] || 1);
  return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * f, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * f];
}

/** Length of an authored "M x y C x1 y1 x2 y2 x y" arrow, without needing layout. */
function cubicLength(d) {
  const n = (d.match(/-?\d*\.?\d+/g) || []).map(Number);
  return n.length >= 8 ? arcTable([[n[0], n[1]], [n[2], n[3]], [n[4], n[5]], [n[6], n[7]]], 48).total : 220;
}

/* ------------------------------------------------------------------ rig */
function make(name, attrs, parent) {
  const node = document.createElementNS(NS, name);
  for (const key in attrs) node.setAttribute(key, attrs[key]);
  parent?.append(node);
  return node;
}

/** A lit copy of a phase node: tint, heavier ring, the icon on top, one hairline halo. */
function litNode(circle, parent) {
  const cx = circle.getAttribute('cx'), cy = circle.getAttribute('cy');
  const icon = [...circle.parentNode.children].filter(n => n !== circle && n.localName !== 'text');
  const tone = icon.find(n => n.getAttribute('stroke'))?.getAttribute('stroke') || circle.getAttribute('stroke');
  const g = make('g', {}, parent);
  make('circle', { cx, cy, r: 32, fill: tone, 'fill-opacity': 0.24 }, g);
  make('circle', { cx, cy, r: 32, fill: 'none', stroke: tone, 'stroke-width': 3 }, g);
  icon.forEach(n => g.append(n.cloneNode(true)));
  g._halo = make('circle', { cx, cy, r: 40, fill: 'none', stroke: tone, 'stroke-opacity': 0.55, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }, g);
  return g;
}

const rigs = new WeakMap();

/** Builds (once per SVG instance) the overlay of exact copies. Null if the poster changed shape. */
function getRig(svg) {
  if (!svg || !gsap) return null;
  if (rigs.has(svg)) return rigs.get(svg);
  const q = sel => svg.querySelector(sel);
  const win = q(`g[transform="${FRONT}"]`);
  const parts = {
    cursor: q('path[d^="M793 534"]'),
    ring: q('circle[cx="804"][cy="552"]'),
    bar: win?.querySelector('rect[x="579"][y="520"]'),
    input: win?.querySelector('rect[x="568"][y="509"]'),
    panel: win?.querySelector('rect[x="547"][y="434"]'),
    field: win?.querySelector(`rect[x="${FIELD[0]}"][y="${FIELD[1]}"]`),
    check: win?.querySelector('path[d^="M785 576"]'),
  };
  const nodes = NODE_AT.map(([x, y]) => q(`circle[cx="${x}"][cy="${y}"][r="32"]`));
  const arrows = [...svg.querySelectorAll('g[marker-end] > path')];
  if (!Object.values(parts).every(Boolean) || !nodes.every(Boolean) || arrows.length !== 4) { rigs.set(svg, null); return null; }

  const root = make('g', { class: 'ramain-overlay', 'aria-hidden': 'true', 'pointer-events': 'none' }, svg);
  const lit = nodes.map(c => litNode(c, root));
  const loop = make('g', { fill: 'none', stroke: PULSE, 'stroke-width': 2.6 }, root);
  const pulses = arrows.map(p => {
    const d = p.getAttribute('d');
    const copy = make('path', { d }, loop);
    copy._len = cubicLength(d);
    return copy;
  });
  const w = make('g', { transform: FRONT }, root);
  // The value bar: a cover in the input's own fill, with a copy that can be retyped.
  const fill = make('g', {}, w);
  make('rect', { x: 577, y: 518, width: 140, height: 12, fill: parts.input.getAttribute('fill') }, fill);
  const typed = fill.appendChild(parts.bar.cloneNode());
  const caret = make('rect', { x: 580, y: 517, width: 1.6, height: 14, fill: CARET }, fill);
  // The record field: a panel-white cover, a pressable copy and the check copy.
  const record = make('g', {}, w);
  make('rect', { x: 566, y: 566, width: 236, height: 28, fill: parts.panel.getAttribute('fill') }, record);
  const press = make('g', {}, record);
  press.append(parts.field.cloneNode());
  const tick = record.appendChild(parts.check.cloneNode());
  const ripple = make('rect', { x: FIELD[0], y: FIELD[1], width: FIELD[2], height: FIELD[3], rx: 5, fill: 'none', stroke: INK, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }, w);
  const boxes = {};
  for (const key in BOX) {
    const [x, y, width, height] = BOX[key];
    boxes[key] = make('rect', { x, y, width, height, fill: 'none', stroke: INK, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }, w);
    boxes[key]._r = BOX[key];
  }
  const dots = make('g', { fill: INK }, root);
  const pointer = make('g', {}, root);
  const hand = make('g', {}, pointer);
  const ring = hand.appendChild(parts.ring.cloneNode());
  hand.append(parts.cursor.cloneNode());

  const rig = { svg, root, parts, lit, pulses, fill, typed, caret, record, press, tick, ripple, boxes, dots, dotList: [], pointer, hand, ring, tl: null, owner: null };
  clear(rig);
  rigs.set(svg, rig);
  return rig;
}

/** Authored frame: every copy hidden, originals shown, no layer promotion. */
function clear(rig) {
  const { parts } = rig;
  gsap.set([...rig.lit, ...rig.pulses, ...Object.values(rig.boxes), rig.fill, rig.record, rig.ripple, rig.pointer, rig.caret], { opacity: 0 });
  rig.lit.forEach(g => g._halo.setAttribute('r', 40));
  rig.typed.removeAttribute('style');
  rig.typed.setAttribute('width', BAR_W);
  rig.tick.removeAttribute('style');
  [rig.press, rig.hand, rig.pointer].forEach(n => n.removeAttribute('transform'));
  rig.ring.setAttribute('r', 31);
  rig.dots.replaceChildren();
  rig.dotList = [];
  gsap.set(rig.dots, { opacity: 1 });
  parts.cursor.removeAttribute('visibility');
  parts.ring.removeAttribute('visibility');
  rig.root.style.willChange = '';
}

function reset(rig) {
  const tl = rig.tl;
  rig.tl = null;
  rig.owner = null;
  tl?.kill();
  clear(rig);
}

/** Hand the moving parts to the overlay. Copies match the originals, so nothing visibly changes. */
function swapIn(rig) {
  rig.root.style.willChange = 'transform';
  rig.parts.cursor.setAttribute('visibility', 'hidden');
  rig.parts.ring.setAttribute('visibility', 'hidden');
  gsap.set([rig.pointer, rig.fill, rig.record, rig.typed, rig.tick], { opacity: 1 });
}

/** End of a pass: back to the authored frame, with one phase node left lit. */
function settle(rig, index) {
  clear(rig);
  if (index >= 0) gsap.set(rig.lit[index], { opacity: 1 });
  rig.tl = null;
  rig.owner = null;
}

/** Rendered CSS px per poster unit (for dots and the caret, which must stay legible at any size). */
function unitPx(svg) {
  const rect = svg.getBoundingClientRect();
  const vb = svg.viewBox?.baseVal;
  const s = vb && vb.width ? Math.min(rect.width / vb.width, rect.height / vb.height) : 0;
  return s > 0.02 ? s : 0.5;
}

/* ------------------------------------------------------- phase builders */
// Each builder adds tweens to c.tl at an absolute time. Under reduced motion
// c.dur() is 0, so the same timeline becomes a series of still frames.
function context(rig, discrete) {
  const scale = unitPx(rig.svg);
  return { rig, discrete, px: 1 / scale, tl: gsap.timeline({ paused: true }), dur: x => (discrete ? 0 : x) };
}

const ft = (c, el, from, to, at) => c.tl.fromTo(el, from, { ...to, immediateRender: false }, at);

function lightNode(c, index, at, onPhase) {
  c.rig.lit.forEach((g, k) => {
    if (k === index) {
      ft(c, g, { opacity: 0 }, { opacity: 1, duration: c.dur(0.3), ease: 'power2.out' }, at);
      ft(c, g._halo, { attr: { r: 33 } }, { attr: { r: 40 }, duration: c.dur(0.5), ease: 'expo.out' }, at);
    } else c.tl.to(g, { opacity: 0, duration: c.dur(0.3), ease: 'power1.out' }, at);
  });
  if (onPhase) c.tl.call(onPhase, [index], at);
}

/** A hairline box snaps from slightly larger onto the element (grounding). */
function snapBox(c, box, at) {
  const [x, y, width, height] = box._r;
  ft(c, box, { opacity: 0, attr: { x: x - 8, y: y - 8, width: width + 16, height: height + 16 } },
    { opacity: 1, attr: { x, y, width, height }, duration: c.dur(0.4), ease: 'expo.out' }, at);
}

const fadeOut = (c, els, at, d = 0.3) => c.tl.to(els, { opacity: 0, duration: c.dur(d), ease: 'power1.out' }, at);

/** Reason: a dotted path from the cursor to the field, drawn dot by dot. */
function drawPlan(c, at, d) {
  const { rig, px } = c;
  const r = Math.max(1.6, 1.2 * px), gap = Math.max(9, 7 * px);
  rig.dots.replaceChildren();
  rig.dotList = [];
  for (let s = gap * 0.6; s < PLAN_ARC.total - gap * 0.4; s += gap) {
    const [cx, cy] = pointAt(PLAN_ARC, s);
    const dot = make('circle', { cx: cx.toFixed(1), cy: cy.toFixed(1), r: r.toFixed(2), opacity: 0 }, rig.dots);
    rig.dotList.push({ dot, s, done: false });
  }
  const els = rig.dotList.map(o => o.dot);
  ft(c, els, { opacity: 0 }, { opacity: 1, duration: c.dur(0.12), stagger: c.dur(d / els.length), ease: 'none' }, at);
}

function placePointer(rig, x, y) {
  rig.pointer.setAttribute('transform', `translate(${(x - REST[0]).toFixed(2)} ${(y - REST[1]).toFixed(2)})`);
}

/** Act: the cursor follows the planned path, consuming the dots behind it. */
function followPlan(c, at, d) {
  const { rig } = c, p = { s: 0 };
  ft(c, p, { s: 0 }, {
    s: PLAN_ARC.total, duration: c.dur(d), ease: 'power2.inOut',
    onUpdate() {
      const [x, y] = pointAt(PLAN_ARC, p.s);
      placePointer(rig, x, y);
      rig.dotList.forEach(o => { if (!o.done && o.s < p.s) { o.done = true; o.dot.style.opacity = 0; } });
    },
  }, at);
}

function glide(c, from, to, at, d) {
  const { rig } = c, p = { t: 0 };
  ft(c, p, { t: 0 }, {
    t: 1, duration: c.dur(d), ease: 'power2.inOut',
    onUpdate: () => placePointer(rig, from[0] + (to[0] - from[0]) * p.t, from[1] + (to[1] - from[1]) * p.t),
  }, at);
}

/** A click: the cursor dips about its tip while the focus ring tightens. */
function click(c, at) {
  const { rig } = c, p = { k: 1 };
  const apply = () => rig.hand.setAttribute('transform', `translate(${REST[0]} ${REST[1]}) scale(${p.k.toFixed(3)}) translate(${-REST[0]} ${-REST[1]})`);
  c.tl.to(p, { k: 0.9, duration: c.dur(0.08), ease: 'power2.in', onUpdate: apply }, at)
    .to(p, { k: 1, duration: c.dur(0.2), ease: 'power2.out', onUpdate: apply }, at + 0.08);
  ft(c, rig.ring, { attr: { r: 31 } }, { attr: { r: 26 }, duration: c.dur(0.08), ease: 'power2.in' }, at);
  ft(c, rig.ring, { attr: { r: 26 } }, { attr: { r: 31 }, duration: c.dur(0.3), ease: 'power2.out' }, at + 0.08);
}

/** The field's value bar retypes in character-sized steps behind a caret. */
function type(c, at, d) {
  const { rig, px } = c;
  rig.caret.setAttribute('width', Math.max(1.6, 1.4 * px).toFixed(2));
  ft(c, rig.typed, { opacity: 1, attr: { width: 0 } }, { attr: { width: BAR_W }, duration: c.dur(d), ease: 'steps(14)' }, at);
  ft(c, rig.caret, { opacity: 1, attr: { x: 580 } }, { attr: { x: 580 + BAR_W }, duration: c.dur(d), ease: 'steps(14)' }, at);
  fadeOut(c, rig.caret, at + d + 0.05, 0.12);
}

/** Press on the record field: scale .97 and one hairline ripple. */
function pressRecord(c, at) {
  const { rig } = c, p = { k: 1 };
  const [x, y, w, h] = FIELD, cx = x + w / 2, cy = y + h / 2;
  const apply = () => rig.press.setAttribute('transform', `translate(${cx} ${cy}) scale(${p.k.toFixed(4)}) translate(${-cx} ${-cy})`);
  click(c, at);
  c.tl.to(p, { k: 0.97, duration: c.dur(0.08), ease: 'power2.in', onUpdate: apply }, at)
    .to(p, { k: 1, duration: c.dur(0.24), ease: 'power2.out', onUpdate: apply }, at + 0.08);
  if (!c.discrete) {
    ft(c, rig.ripple, { opacity: 0.9, attr: { x, y, width: w, height: h, rx: 5 } },
      { opacity: 0, attr: { x: x - 9, y: y - 9, width: w + 18, height: h + 18, rx: 9 }, duration: 0.6, ease: 'power2.out' }, at + 0.04);
  }
}

function drawCheck(c, at) {
  ft(c, c.rig.tick, { opacity: 1, strokeDasharray: `${CHECK_LEN} ${CHECK_LEN + 2}`, strokeDashoffset: CHECK_LEN },
    { strokeDashoffset: 0, duration: c.dur(0.36), ease: 'power2.out' }, at);
}

/** Verify: one bright segment runs once around the four loop arrows. */
function pulseLoop(c, at) {
  if (c.discrete) return;
  c.rig.pulses[0].parentNode.setAttribute('stroke-width', Math.max(2.6, 1.6 * c.px).toFixed(2)); // ≥1.6 CSS px at any size
  c.rig.pulses.forEach((path, k) => {
    const len = path._len, seg = Math.min(70, len * 0.32), t = at + k * 0.15;
    ft(c, path, { opacity: 1, strokeDasharray: `${seg} ${len + seg}`, strokeDashoffset: seg },
      { strokeDashoffset: -len, duration: 0.55, ease: 'power1.inOut' }, t);
    c.tl.to(path, { opacity: 0, duration: 0.1 }, t + 0.45);
  });
}

/* ------------------------------------------------------------ sequences */
/** The full illustrative pass (~6.8s): Observe 1.6 · Reason 1.4 · Act 2.4 · Verify 1.4. */
function fullPass(rig, { discrete, onPhase }) {
  const c = context(rig, discrete);
  const { tl, rig: { boxes } } = c;
  tl.call(swapIn, [rig], 0);
  // OBSERVE: clear the record, then ground the UI one element at a time.
  lightNode(c, 0, 0, onPhase);
  fadeOut(c, [rig.typed, rig.tick], 0.05, 0.3);
  ['title', 'input', 'record', 'list'].forEach((key, n) => snapBox(c, boxes[key], 0.3 + n * 0.25));
  // REASON: keep the target, plan the path to it.
  lightNode(c, 1, 1.6, onPhase);
  fadeOut(c, [boxes.title, boxes.record, boxes.list], 1.65, 0.35);
  drawPlan(c, 1.8, 0.95);
  // ACT: follow the plan, type the value, ground the record field and press it.
  lightNode(c, 2, 3.0, onPhase);
  followPlan(c, 3.05, 0.75);
  click(c, 3.8);
  fadeOut(c, boxes.input, 3.85);
  type(c, 3.92, 0.8);
  glide(c, TYPE_AT, PRESS_AT, 4.78, 0.42);
  snapBox(c, boxes.record, 4.82);
  pressRecord(c, 5.2);
  fadeOut(c, boxes.record, 5.2, 0.14); // the ripple takes over from the box
  // VERIFY: the check draws, the loop closes, the cursor returns to rest.
  lightNode(c, 3, 5.4, onPhase);
  drawCheck(c, 5.5);
  pulseLoop(c, 5.75);
  glide(c, PRESS_AT, REST, 6.05, 0.6);
  tl.call(settle, [rig, 3], 6.8);
  return tl;
}

/** One phase on its own, for the explainer. Starts and ends on the authored frame (node left lit). */
function stepPass(rig, index, discrete) {
  const c = context(rig, discrete);
  const { tl, rig: { boxes } } = c;
  let end = 2.4;
  tl.call(swapIn, [rig], 0);
  lightNode(c, index, 0);
  if (index === 0) {
    ['title', 'input', 'record', 'list'].forEach((key, n) => snapBox(c, boxes[key], 0.2 + n * 0.22));
    fadeOut(c, Object.values(boxes), 1.95, 0.4);
  } else if (index === 1) {
    snapBox(c, boxes.input, 0.1);
    drawPlan(c, 0.35, 0.9);
    fadeOut(c, [boxes.input, rig.dots], 1.9, 0.4);
  } else if (index === 2) {
    fadeOut(c, rig.typed, 0.05, 0.25);
    drawPlan(c, 0.1, 0.3);
    followPlan(c, 0.5, 0.75);
    click(c, 1.25);
    type(c, 1.37, 0.8);
    glide(c, TYPE_AT, PRESS_AT, 2.25, 0.42);
    pressRecord(c, 2.67);
    glide(c, PRESS_AT, REST, 3.15, 0.6);
    end = 3.85;
  } else {
    fadeOut(c, rig.tick, 0.02, 0.15);
    drawCheck(c, 0.3);
    pulseLoop(c, 0.55);
    end = 1.75;
  }
  tl.call(settle, [rig, index], end);
  return tl;
}

/**
 * Plays phase `index` (0 Observe, 1 Reason, 2 Act, 3 Verify) on any sanitized
 * ramAIn poster instance and settles back on the authored frame with that
 * phase's node lit. Returns the GSAP timeline (thenable), or null.
 */
export function playRamainStep(svg, index) {
  const rig = getRig(svg);
  const i = Math.round(Number(index));
  if (!rig || !(i >= 0 && i < RAMAIN_STEPS.length)) return null;
  reset(rig);
  rig.owner = 'step';
  rig.tl = stepPass(rig, i, reducedNow());
  return rig.tl.play(0);
}

/** Restores any ramAIn instance to the exact authored frame (nothing lit). */
export function restoreRamain(svg) {
  const rig = rigs.get(svg);
  if (rig) reset(rig);
}

/* -------------------------------------------------------------- caption */
function enhanceCaption(caption) {
  const spans = RAMAIN_STEPS.map(step => caption.querySelector(`[data-phase="${step.toLowerCase()}"]`));
  if (spans.some(span => !span)) return null;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'loop-replay';
  button.setAttribute('aria-label', 'Replay the illustrative agent loop');
  button.textContent = '↺';
  const loopGlyph = [...caption.querySelectorAll('i')].find(i => i.textContent.trim() === '↺');
  if (loopGlyph) loopGlyph.replaceWith(button); else caption.append(button);
  const label = document.createElement('span');
  label.className = 'ramain-illustrative mono';
  label.textContent = 'ILLUSTRATIVE';
  caption.prepend(label);
  const marker = document.createElement('i');
  marker.className = 'ramain-marker';
  marker.setAttribute('aria-hidden', 'true');
  caption.append(marker);
  caption.classList.add('has-demo');
  return { caption, spans, button, marker, active: -1 };
}

function markerSpot(cap, i) {
  const span = cap.spans[i];
  return { x: span.offsetLeft + span.offsetWidth / 2 - 3, y: span.offsetTop + span.offsetHeight + 1 };
}

function setCaptionPhase(cap, i, instant = reducedNow()) {
  if (!cap || cap.active === i) return;
  const first = cap.active < 0;
  cap.active = i;
  cap.spans.forEach((span, k) => span.classList.toggle('is-active', k === i));
  if (i < 0) { gsap.to(cap.marker, { scale: 0, duration: instant ? 0 : 0.2, overwrite: true }); return; }
  const { x, y } = markerSpot(cap, i);
  // Its own layer only while it moves, so the slide never repaints the page.
  const layer = instant ? {} : { onStart: () => { cap.marker.style.willChange = 'transform'; }, onComplete: () => { cap.marker.style.willChange = ''; } };
  if (first) {
    gsap.set(cap.marker, { x, y });
    gsap.fromTo(cap.marker, { scale: 0 }, { scale: 1, duration: instant ? 0 : 0.35, ease: 'back.out(1.6)', overwrite: true, ...layer });
  } else {
    gsap.to(cap.marker, { x, y, scale: 1, duration: instant ? 0 : 0.32, ease: 'power3.inOut', overwrite: true, ...layer });
  }
}

function placeMarker(cap) {
  if (!cap || cap.active < 0) return;
  gsap.set(cap.marker, markerSpot(cap, cap.active));
}

/* ----------------------------------------------------------------- page */
export async function init() {
  const link = document.querySelector('#building .building-visual .poster-link[data-poster="ramain"]');
  if (!link) return;
  const visual = link.closest('.building-visual');
  const captionEl = visual.querySelector('.building-visual-caption');
  // Inline right away: the band sits just below the hero. The <img> stays as the fallback.
  const ready = overlayPoster(link);
  if (!gsap) return;

  const state = { svg: null, rig: null, cap: null, played: false, inView: false, ratio: 0, explainer: false, user: false };
  const bigEnough = () => link.clientWidth >= 32 && link.clientHeight >= 32;

  /** Starts, pauses or resumes the in-page pass from the current conditions. */
  function update() {
    const { rig } = state;
    if (!rig) return;
    const live = state.inView && pageVisible() && !state.explainer && bigEnough();
    if (!state.played && live && state.ratio >= 0.4 && motion && !motionPaused()) { playPage(false); return; }
    if (rig.owner !== 'page' || !rig.tl) return;
    rig.tl.paused(!(live && (state.user || !motionPaused())));
  }

  function playPage(user) {
    const { rig } = state;
    state.played = true;
    state.user = user;
    // A replay fades the held Verify light out instead of cutting it.
    const lit = rig.lit.map(g => Number(gsap.getProperty(g, 'opacity')) || 0);
    reset(rig);
    rig.lit.forEach((g, k) => gsap.set(g, { opacity: lit[k] }));
    rig.owner = 'page';
    rig.tl = fullPass(rig, { discrete: reducedNow(), onPhase: i => setCaptionPhase(state.cap, i) });
    update();
  }

  /** The held frame: authored poster, Verify lit, caption on Verify. */
  function hold() {
    if (!state.rig) return;
    reset(state.rig);
    settle(state.rig, 3);
    setCaptionPhase(state.cap, 3, true);
  }

  const svg = await ready;
  const rig = getRig(svg);
  if (!rig) return; // poster stays exactly as authored
  state.svg = svg;
  state.rig = rig;

  state.cap = captionEl ? enhanceCaption(captionEl) : null;
  if (state.cap) {
    state.cap.button.addEventListener('click', () => { if (!state.explainer) playPage(true); });
    if ('ResizeObserver' in window) new ResizeObserver(() => placeMarker(state.cap)).observe(captionEl);
    document.fonts?.ready.then(() => placeMarker(state.cap));
    relayout();
  }

  watchVisibility(visual, (visible, entry) => {
    state.inView = visible;
    state.ratio = entry ? entry.intersectionRatio : 1;
    update();
  }, { threshold: [0, 0.4] });
  if ('ResizeObserver' in window) new ResizeObserver(update).observe(link);
  document.addEventListener('visibilitychange', update);
  on('motion:paused', paused => { if (paused) state.user = false; update(); });

  // The explainer borrows this SVG: give it the authored frame, then re-hold on return.
  on('explainer:open', detail => {
    if (detail?.name !== 'ramain') return;
    state.explainer = true;
    state.played = true;
    if (rig.owner !== 'step') reset(rig);
  });
  on('explainer:close', detail => {
    if (detail?.name !== 'ramain') return;
    state.explainer = false;
    hold();
  });
}
