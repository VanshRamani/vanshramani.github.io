// Contact contours: the five texture lines draw in once with scroll (scrubbed,
// complete by ~60% into view, and complete for good after that), then drift
// a few user units over 20s+ periods. They never react to the cursor.
// Reduced motion keeps the authored, static, complete lines.
import { gsap, ScrollTrigger, motion, motionPaused, on, watchVisibility, addTicker, pageVisible, viewportTooSmall, clamp } from './core.js';

const DRAW_END = 0.6;          // fraction of the section (or viewport) in view when drawn
const DRIFT_FPS = 30;          // the drift moves < 2 units/s; 30 writes/s is plenty
const TAU = Math.PI * 2;

export function init() {
  if (!motion || !gsap || !ScrollTrigger) return;
  if (viewportTooSmall()) { addEventListener('resize', retry); return; }
  start();
}

function retry() {
  if (viewportTooSmall()) return;
  removeEventListener('resize', retry);
  start();
}

function start() {
  const section = document.getElementById('contact');
  const paths = [...(section?.querySelectorAll('.ending-contact__texture path') || [])];
  if (!paths.length) return;
  const r = section.getBoundingClientRect();
  // Already in view at load: the lines are drawn; only the drift remains.
  if (r.bottom > 0 && r.top < innerHeight) { startDrift(section, paths); return; }
  const stopNear = watchVisibility(section, near => {
    if (!near) return;
    stopNear();
    armDraw(section, paths, () => startDrift(section, paths));
  }, { rootMargin: '0px 0px 100% 0px' });
}

/* ---------------------------------------------------------------- draw */
// The texture is a right-aligned, slice-scaled crop of a wider drawing, so
// most of each path lies outside its box. The scrub only spends scroll on the
// stretch of each line that can actually be seen: [from, to] in path length.
function visibleSpans(svg, paths) {
  const box = svg.getBoundingClientRect();
  return paths.map(path => {
    const len = path.getTotalLength();
    const m = path.getScreenCTM();
    if (!m || box.width < 32 || box.height < 32) return [0, len];
    const N = 24;
    const inside = s => {
      const pt = path.getPointAtLength(s), x = m.a * pt.x + m.c * pt.y + m.e, y = m.b * pt.x + m.d * pt.y + m.f;
      return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
    };
    let first = -1, last = -1;
    for (let k = 0; k <= N; k++) if (inside((len * k) / N)) { if (first < 0) first = k; last = k; }
    if (first < 0) return [0, len];
    // Refine each edge between its last-outside and first-inside samples.
    const edge = (lo, hi) => { for (let j = 0; j < 6; j++) { const mid = (lo + hi) / 2; if (inside(mid) === inside(hi)) hi = mid; else lo = mid; } return (lo + hi) / 2; };
    const from = first === 0 ? 0 : edge((len * (first - 1)) / N, (len * first) / N);
    const to = last === N ? len : edge((len * (last + 1)) / N, (len * last) / N);
    return [Math.max(0, from - len / 160), Math.min(len, to + len / 160)];
  });
}

// Progress is mapped straight onto each line's dash (no timeline), so every
// line holds its from-state until its turn and a resize simply re-measures.
function armDraw(section, paths, done) {
  const svg = paths[0].ownerSVGElement;
  const lens = paths.map(path => path.getTotalLength() + 2);
  const stagger = 0.075, span = 1 - stagger * (paths.length - 1);
  let spans, boxKey = '';
  const measure = () => { const b = svg.getBoundingClientRect(), key = `${Math.round(b.width)}x${Math.round(b.height)}`; if (key !== boxKey) { boxKey = key; spans = visibleSpans(svg, paths); } };
  measure();

  // A dash of `len` shows path positions [0, len - offset]: each line is drawn
  // to its visible start at its local 0 and to its visible end at its local 1.
  const render = progress => paths.forEach((path, i) => {
    const local = clamp((progress - i * stagger) / span, 0, 1);
    const [from, to] = spans[i];
    path.style.strokeDashoffset = `${(lens[i] - (from + (to - from) * local)).toFixed(1)}px`;
  });
  paths.forEach((path, i) => { path.style.strokeDasharray = `${lens[i]} ${lens[i] + 4}`; });
  render(0);

  let trigger = null, finished = false;
  // Deferred: the trigger may report completion while it is still being created.
  const finish = () => {
    if (finished) return;
    finished = true;
    queueMicrotask(() => {
      trigger?.kill();
      paths.forEach(path => path.removeAttribute('style')); // no authored inline style
      done();
    });
  };

  trigger = ScrollTrigger.create({
    trigger: section,
    start: 'top bottom',
    // Drawn once DRAW_END of the section (capped at the viewport) has entered,
    // and never later than the end of the page.
    end: () => {
      const top = section.getBoundingClientRect().top + scrollY;
      const from = top - innerHeight;
      const want = from + DRAW_END * Math.min(section.offsetHeight, innerHeight);
      return Math.max(from + 1, Math.min(want, ScrollTrigger.maxScroll(window) - 4));
    },
    onUpdate: self => { render(self.progress); if (self.progress > 0.999) finish(); },
    onRefresh: self => { measure(); if (!finished) render(self.progress); },
    onLeave: finish,
  });
}

/* --------------------------------------------------------------- drift */
// Each line sways along its own slow sine pair (periods 24–48s), starting
// from its authored position. Only while on screen, the tab is visible and
// motion is not paused; pausing holds the lines where they are.
function startDrift(section, paths) {
  // Amplitudes are in user units (the slice-scaled SVG draws ~1.25px per unit
  // at 1440, ~1.7 on a phone), so each line travels a few px at most.
  const lanes = paths.map((_, i) => ({
    ax: 1.5 + i * 0.2, ay: 0.8 + i * 0.1,
    px: 24 + i * 3.7, py: 31 + i * 4.3,
    fx: i * 1.3, fy: 0.6 + i * 0.9,
  }));
  let t = 0, written = -1, visible = true, stop = null;

  const write = () => paths.forEach((path, i) => {
    const l = lanes[i];
    const x = l.ax * (Math.sin((TAU * t) / l.px + l.fx) - Math.sin(l.fx));
    const y = l.ay * (Math.sin((TAU * t) / l.py + l.fy) - Math.sin(l.fy));
    path.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
  });
  const tick = (_, deltaMs) => {
    t += Math.min(deltaMs, 64) / 1000; // a long frame (tab return) never jumps
    if (t - written < 1 / DRIFT_FPS) return;
    written = t;
    write();
  };
  const update = () => {
    const run = visible && pageVisible() && !motionPaused();
    if (run && !stop) stop = addTicker(tick);
    else if (!run && stop) { stop(); stop = null; }
  };

  watchVisibility(section, isVisible => { visible = isVisible; update(); });
  document.addEventListener('visibilitychange', update);
  on('motion:paused', update);
  update();
}
