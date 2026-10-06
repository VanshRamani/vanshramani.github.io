// Hero module: the blue-square motif, the hero type and the nav.
//
//  • The name's per-line clip rise and the hero square's stamp are pure CSS
//    (hero.css, keyed on html.motion) so they run at first paint. This file only
//    waits for the square to land and emits 'hero:stamped' (html.hero-stamped
//    marks it for modules that subscribe late).
//  • Heading squares and section bullets stamp once as they scroll in.
//  • The nav: active section + aria-current, reading progress, the sliding 6px
//    marker, the border merge over the ramAIn band, and the hand-off, where the
//    hero's period flies into the nav and becomes the marker (scrubbed, reversible).
//  • The pause-motion toggle (WCAG 2.2.2), wired to core.
import { html, mq, gsap, ScrollTrigger, motion, clamp, lerp, emit, on, motionPaused, setMotionPaused, relayout, debounce, viewportTooSmall } from './core.js';

const ACTIVE_LINE = 180;   // the template's rule: a section is current once its top passes 180px
const SECTION_IDS = ['building', 'research', 'about', 'writing'];
const BULLETS = '.section-no, .bio-v2-section-number, .ending-writing__eyebrow, .ending-contact__eyebrow';
const STAMP = { duration: .35, ease: 'back.out(1.6)' };
const SLIDE = { duration: .35, ease: 'power3.inOut' };

const smooth = t => t * t * (3 - 2 * t);
const snap = v => { const d = devicePixelRatio || 1; return Math.round(v * d) / d; };

let stamped = false;
const onLand = [];

export function init() {
  initMotionToggle();
  initNav();
  initStamps();
  initHeroSquare();
}

/* ------------------------------------------------------------ hero square */
// The stamp itself is CSS. Resolve when it lands, or at once if it cannot run.
function initHeroSquare() {
  const land = () => {
    if (stamped) return;
    stamped = true;
    html.classList.add('hero-stamped');
    onLand.forEach(fn => fn());
    emit('hero:stamped');
  };
  // The name is static type: the square is already in place, so the next beat can start.
  land();
}

/* ------------------------------------------------- heading + bullet stamps */
const armed = new Set();

function initStamps() {
  if (!motion || !ScrollTrigger || motionPaused() || viewportTooSmall()) return;
  document.querySelectorAll('.display-heading .sq').forEach(sq => armStamp(sq, sq.closest('.display-heading'), .8));
  document.querySelectorAll(BULLETS).forEach(el => armStamp(el, el, .85));
  on('motion:paused', paused => { if (paused) disarmAll(); });
}

// Armed (scale 0) only while still below the fold; stamped when the trigger's top
// crosses `line` (a fraction of the viewport). Anything already on screen or passed
// is left alone, including a square a fast fling lands on screen short of the line.
function armStamp(el, trigger, line) {
  if (!el || !trigger || trigger.getBoundingClientRect().top < innerHeight) return;
  const entry = { el };
  entry.st = ScrollTrigger.create({
    trigger, start: 'top bottom+=160', end: `top ${line * 100}%`,
    onEnter: () => {
      const top = trigger.getBoundingClientRect().top;
      if (top >= innerHeight) el.classList.add('sq-armed');
      else if (top > innerHeight * line) release(entry);
    },
    onLeaveBack: () => el.classList.remove('sq-armed'),
    onLeave: () => { if (armed.has(entry)) { release(entry); stampSquare(el); } },   // also fires when a jump skips past
  });
  armed.add(entry);
}
function release(entry) { entry.st.kill(); armed.delete(entry); }
function disarmAll() { [...armed].forEach(entry => { release(entry); entry.el.classList.remove('sq-armed', 'sq-stamping'); }); }

/** Stamps one square (an element whose ::before is the ink) 0 → 1, then releases it. */
export function stampSquare(el) {
  if (!el || !motion) return;
  let timer = 0;
  const done = () => { clearTimeout(timer); el.removeEventListener('animationend', onEnd); el.classList.remove('sq-armed', 'sq-stamping'); };
  const onEnd = event => { if (event.animationName === 'sq-stamp') done(); };
  el.addEventListener('animationend', onEnd);
  el.classList.add('sq-armed', 'sq-stamping');
  timer = setTimeout(done, 1000);   // failsafe: never leave a square hidden
}

/* ------------------------------------------------------------------- nav */
function initNav() {
  const navEl = document.querySelector('.nav');
  const inner = navEl?.querySelector('nav');
  if (!navEl || !inner) return;
  const marker = inner.querySelector('.nav-marker');
  const bar = navEl.querySelector('.reading-progress i');
  const banner = document.querySelector('.news-banner');
  const period = document.querySelector('.hero-name .name-period');
  const links = SECTION_IDS.map(id => inner.querySelector(`a[href="#${id}"]`)).filter(Boolean);
  const sections = [...document.querySelectorAll('main > section[id]')]
    .map(el => ({ el, top: 0, bottom: 0, link: links.find(a => a.hash === `#${el.id}`) || null }));
  const building = sections.find(s => s.el.id === 'building');
  const buildingLink = building?.link || null;

  // Cached geometry (document coordinates unless noted); refreshed on ScrollTrigger refresh.
  const g = { ok: false, max: 0, navNatural: 0, navH: 0, innerLeft: 0, innerDy: 0, mLeft: 0, mTop: 0, mW: 6, mH: 6, linkX: new Map(), p: null, s0: 0, s1: 0 };
  const navTop = s => Math.max(0, g.navNatural - s);   // the sticky nav's viewport top at scroll s
  let active = null, merged = false, flying = false, handoff = false, markerX = null;
  const clone = motion && marker && period ? Object.assign(document.createElement('i'), { className: 'sq-clone' }) : null;
  if (clone) { clone.setAttribute('aria-hidden', 'true'); document.body.append(clone); }

  function measure() {
    if (innerWidth < 32 || innerHeight < 32) { g.ok = false; return; }
    const sy = scrollY;
    sections.forEach(s => { const r = s.el.getBoundingClientRect(); s.top = r.top + sy; s.bottom = r.bottom + sy; });
    g.max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    const nr = navEl.getBoundingClientRect(), ir = inner.getBoundingClientRect();
    g.navNatural = banner ? banner.getBoundingClientRect().bottom + sy : 0;
    g.navH = nr.height;
    g.innerLeft = ir.left;
    g.innerDy = ir.top - nr.top;
    if (marker) {
      const cs = getComputedStyle(marker);
      g.mLeft = parseFloat(cs.left) || 0; g.mTop = parseFloat(cs.top) || 0;
      g.mW = parseFloat(cs.width) || 6; g.mH = parseFloat(cs.height) || 6;
    }
    g.linkX.clear();
    links.forEach(a => { const r = labelRect(a); g.linkX.set(a, snap(r.left - ir.left + r.width / 2 - g.mW / 2 - g.mLeft)); });
    if (period) {
      // The ink box of .sq::before: left .061em, on the baseline, .212 × .199em.
      const r = period.getBoundingClientRect(), fs = parseFloat(getComputedStyle(period).fontSize);
      g.p = { x: r.left + .061 * fs, y: r.bottom - .199 * fs + sy, w: .212 * fs, h: .199 * fs };
    }
    // 01 Building turns active at s1, so the flight ends there. The period rides with
    // the name until it is ~20% of the viewport below the nav, then peels off; s0 is
    // capped so the vertical path never overshoots the slot (the Hermite in fly()
    // stays monotonic while the flight is at most 3× the height it has to climb).
    g.s1 = building ? building.top - ACTIVE_LINE : 0;
    if (g.p) {
      const want = g.p.y - (g.navH + innerHeight * .2), cap = (3 * (g.p.y - g.innerDy - g.mTop) - g.s1) / 2;
      g.s0 = clamp(Math.min(want, cap), 0, g.s1);
    }
    g.ok = true;
    handoff = !!clone && !!buildingLink && mq.fine.matches && !mq.phone.matches && g.s1 - g.s0 > 120 && !!g.p && g.p.w > 2;
    if (clone && g.p) { clone.style.width = `${g.p.w}px`; clone.style.height = `${g.p.h}px`; }
  }

  function update() {
    if (!g.ok) return;
    const s = scrollY;
    if (bar) bar.style.transform = `scaleX(${g.max > 0 ? clamp(s / g.max, 0, 1) : 0})`;
    let current = null;
    sections.forEach(sec => { if (sec.top - s < ACTIVE_LINE) current = sec; });
    setActive(current ? current.link : null);
    const navBottom = navTop(s) + g.navH;
    const m = !!building && building.top - s <= navBottom + 1 && building.bottom - s > navBottom;
    if (m !== merged) { merged = m; navEl.classList.toggle('nav-merged', m); }
    fly(s);
  }

  function setActive(link) {
    if (link === active) return;
    const prev = active;
    active = link;
    links.forEach(a => {
      const on = a === link;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
    });
    moveMarker(prev, link);
  }

  function setMarker(vars) {
    if ('x' in vars) markerX = vars.x;
    if (gsap) { gsap.killTweensOf(marker); gsap.set(marker, vars); return; }
    if ('x' in vars) marker.style.transform = `translateX(${vars.x}px)`;
    marker.style.opacity = vars.opacity;
  }

  // Desktop marker: slides between links, stamps in from nothing, and at the
  // hero boundary hands over to (or takes over from) the flying clone.
  function moveMarker(prev, next) {
    if (!marker) return;
    const x = next ? g.linkX.get(next) ?? 0 : 0;
    const quiet = !motion || !gsap || mq.phone.matches;
    const docked = handoff && ((!prev && next === buildingLink) || (prev === buildingLink && !next));
    if (!next) {
      if (quiet || docked) setMarker({ opacity: 0 });
      else { gsap.killTweensOf(marker); gsap.to(marker, { opacity: 0, scale: .4, duration: .2, ease: 'power2.in' }); }
    } else if (!prev || quiet || docked) {
      setMarker({ x, opacity: 1, scale: 1 });
      if (!prev && !quiet && !docked) gsap.fromTo(marker, { scale: 0 }, { scale: 1, ...STAMP });
    } else {
      markerX = x;
      gsap.killTweensOf(marker);
      gsap.to(marker, { x, opacity: 1, scale: 1, ...SLIDE });
    }
  }

  // The hand-off: one square, scrubbed by scroll from the period's ink box to the
  // marker under 01 Building. y is a cubic Hermite in scroll: it leaves at page
  // speed (dy/ds = -1, so it peels off the name with no jolt) and docks at rest.
  function fly(s) {
    const on = handoff && stamped && s > g.s0 && s <= g.s1;
    if (on !== flying) {
      flying = on;
      clone.style.visibility = on ? 'visible' : 'hidden';
      clone.style.willChange = on ? 'transform' : 'auto';
      period.classList.toggle('sq-away', on);
    }
    if (!on) return;
    const L = g.s1 - g.s0, t = (s - g.s0) / L, t2 = t * t, t3 = t2 * t;
    const y0 = g.p.y - g.s0;
    const y1 = navTop(s) + g.innerDy + g.mTop;
    const y = (2 * t3 - 3 * t2 + 1) * y0 - (t3 - 2 * t2 + t) * L + (3 * t2 - 2 * t3) * y1;
    const k = smooth(t), ks = smooth(Math.min(1, t / .85));   // it is marker-sized for the last stretch
    const x = lerp(g.p.x, g.innerLeft + g.mLeft + (g.linkX.get(buildingLink) ?? 0), k);
    const sx = lerp(g.p.w, g.mW, ks) / g.p.w, sy = lerp(g.p.h, g.mH, ks) / g.p.h;
    clone.style.transform = `translate(${snap(x)}px, ${snap(y)}px) scale(${sx}, ${sy})`;
  }

  function refresh() {
    measure();
    if (!g.ok) return;
    // Re-seat the marker only if its link moved, so a refresh never cuts a slide short.
    if (marker && active && g.linkX.get(active) !== markerX) setMarker({ x: g.linkX.get(active) ?? 0, opacity: 1, scale: 1 });
    update();
  }

  refresh();
  if (ScrollTrigger) {
    ScrollTrigger.addEventListener('refresh', refresh);
    // onUpdate runs in the same tick Lenis moves the page, so the clone never lags it.
    ScrollTrigger.create({ start: 0, end: 'max', onUpdate: update });
  } else {
    addEventListener('scroll', update, { passive: true });
    addEventListener('resize', debounce(refresh, 150));
  }
  onLand.push(refresh);   // the name no longer moves: measure the period for real
  [mq.fine, mq.phone].forEach(q => q.addEventListener?.('change', refresh));
  if (banner && 'ResizeObserver' in window) new ResizeObserver(relayout).observe(banner);
}

// The marker centres on the word ("Building"), not on the tiny muted "01" before it.
function labelRect(link) {
  const text = [...link.childNodes].reverse().find(n => n.nodeType === 3 && n.textContent.trim());
  if (!text) return link.getBoundingClientRect();
  const range = document.createRange();
  range.setStart(text, text.textContent.search(/\S/));
  range.setEnd(text, text.textContent.trimEnd().length);
  const r = range.getBoundingClientRect();
  return r.width ? r : link.getBoundingClientRect();
}

/* --------------------------------------------------------- motion toggle */
function initMotionToggle() {
  const button = document.querySelector('.motion-toggle');
  if (!button) return;
  const label = document.createElement('span');
  label.className = 'motion-toggle-label';
  button.replaceChildren(label);
  const sync = () => {
    const paused = motionPaused();
    label.textContent = paused ? 'PLAY MOTION' : 'PAUSE MOTION';
    button.title = paused ? 'Play motion' : 'Pause motion';   // the label folds away on narrow screens
  };
  button.addEventListener('click', () => setMotionPaused(!motionPaused()));
  on('motion:paused', sync);
  sync();
}
