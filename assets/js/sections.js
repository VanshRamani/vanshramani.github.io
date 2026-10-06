// Quiet print refinements below the hero.
//  • Print registration: boxes that carry the template's offset shadow lay it
//    down from 0 as they enter (the hero panel prints with the hero square).
//  • About: the timeline rail draws once and pulses its nodes as it passes;
//    the portrait linework draws once. The portrait itself never moves.
//  • Writing: each card illustration acts out its idea on hover or keyboard
//    focus (fine pointers only, ≤1s) and always comes back to the authored SVG.
// Nothing is pre-hidden: tweens are armed with fromTo() as a box approaches,
// so a crash leaves the template exactly as flex.css draws it.
import { html, gsap, motion, mq, on, motionPaused, watchVisibility, onceVisible, isScrolling, viewportTooSmall, clamp } from './core.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const REG = { duration: 0.42, ease: 'expo.out' };
const RAIL = { duration: 0.6, gap: 0.06 };

export function init() {
  if (!motion || !gsap) return; // reduced motion / no libraries: authored frames
  if (viewportTooSmall()) { addEventListener('resize', retry); return; }
  start();
}

function retry() {
  if (viewportTooSmall()) return;
  removeEventListener('resize', retry);
  start();
}

function start() {
  const panel = document.querySelector('.molecule-panel');
  if (panel) registerHeroPanel(panel);
  // Each box prints once enough of its offset edges are in view.
  [['.building-visual', '-20%'], ['.experience-v2', '-20%'], ['.bio-v2-photo-mat', '-25%']].forEach(([sel, line]) => {
    const box = document.querySelector(sel);
    if (box) onEnter(box, registration(box), { enter: `0px 0px ${line} 0px` });
  });
  initRail();
  initLinework();
  initCards();
}

/* ------------------------------------------------------------ helpers */
const onScreen = el => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.bottom > 0 && r.top < innerHeight;
};

// Scroll-triggered entrances count as autoplay: under the global pause they
// jump to their final (authored) frame.
const canPlay = () => !motionPaused();
const finishOrPlay = tween => (canPlay() ? tween.play() : tween.progress(1));

/**
 * Arms a paused tween (built by makeTween) as el approaches the viewport and
 * plays it once el enters. Boxes already on screen keep their authored state.
 */
function onEnter(el, makeTween, { enter = '0px 0px -12% 0px' } = {}) {
  if (onScreen(el)) return;
  let tween = null;
  const arm = () => (tween ||= makeTween());
  // While paused nothing is armed, so the box simply stays authored.
  const stopNear = watchVisibility(el, near => { if (near && canPlay()) { stopNear(); arm(); } }, { rootMargin: '0px 0px 80% 0px' });
  onceVisible(el, () => {
    stopNear();
    if (canPlay()) arm().play();
    else tween?.progress(1);
  }, { rootMargin: enter });
}

/* ---------------------------------------------------- print registration */
// --reg (0 → 1) scales the box's offset in sections.css; the class only
// exists while registering, so the rest state is flex.css's own box-shadow.
function registration(box) {
  return () => {
    box.classList.add('is-registering');
    return gsap.fromTo(box, { '--reg': 0 }, {
      '--reg': 1, ...REG, paused: true,
      onComplete: () => { box.classList.remove('is-registering'); box.style.removeProperty('--reg'); },
    });
  };
}

// The hero panel prints in step with the hero square (hero:stamped ≈ 0.8s).
function registerHeroPanel(panel) {
  if (!onScreen(panel)) { onEnter(panel, registration(panel)); return; }
  if (!canPlay()) return;
  const tween = registration(panel)();
  let fired = false;
  const fire = () => {
    if (fired) return;
    fired = true; off(); clearTimeout(fallback);
    finishOrPlay(tween);
  };
  const off = on('hero:stamped', fire);
  const fallback = setTimeout(fire, 1600); // the hero module may be absent
  if (html.classList.contains('hero-stamped')) fire(); // it landed before we subscribed
}

/* -------------------------------------------------------------- About */
function initRail() {
  const map = document.querySelector('.experience-v2-map');
  const rail = map?.querySelector('.experience-v2-rail');
  if (!rail) return;
  const rows = [...map.querySelectorAll('.experience-v2-row')];
  // Played once the map's top passes 40% of the viewport, so (on desktop) every
  // node's pulse is on screen; until then the rows read as a plain list.
  onEnter(map, () => {
    const tl = gsap.timeline({ paused: true, onComplete: () => gsap.set(rail, { clearProps: 'transform' }) });
    tl.fromTo(rail, { scaleY: 0 }, { scaleY: 1, duration: RAIL.duration, ease: 'expo.out' }); // origin: top (flex.css)
    tl.call(() => pulseNodes(map, rows), null, 0);
    return tl;
  }, { enter: '0px 0px -60% 0px' });
}

// Each node fills the moment the rail's head (expo.out) reaches it, at least
// 60ms after the one above. CSS plays the pulse on the ::after ring.
function pulseNodes(map, rows) {
  const h = map.offsetHeight;
  if (!canPlay() || h < 32) return;
  let prev = -Infinity;
  rows.forEach(row => {
    const y = clamp((row.offsetTop + row.offsetHeight / 2) / h, 0, 0.999);
    const pass = (-Math.log2(1 - y) / 10) * RAIL.duration; // inverse of expo.out
    const delay = Math.max(pass, prev + RAIL.gap);
    prev = delay;
    row.style.setProperty('--pulse-delay', `${delay.toFixed(3)}s`);
    const done = event => {
      if (event.animationName !== 'sections-node-pulse') return;
      row.removeEventListener('animationend', done);
      row.removeEventListener('animationcancel', done);
      row.classList.remove('is-pulsing');
      row.style.removeProperty('--pulse-delay');
    };
    row.addEventListener('animationend', done);
    row.addEventListener('animationcancel', done);
    row.classList.add('is-pulsing');
  });
}

function initLinework() {
  // Keyed on the linework itself: it sits at the foot of a tall portrait.
  const svg = document.querySelector('.bio-v2-photo-linework');
  if (!svg) return;
  const paths = [...svg.querySelectorAll('path')];
  const dots = [...svg.querySelectorAll('circle')];
  onEnter(svg, () => {
    const tl = gsap.timeline({ paused: true, onComplete: () => { clearArt(paths, [...DASH, 'fill-opacity']); clearArt(dots, ['transform']); } });
    paths.forEach((path, i) => {
      const len = path.getTotalLength();
      tl.add(drawFrom(path, len, 1.2, { duration: 0.5, ease: 'power2.inOut' }), i * 0.08);
    });
    // The template's paper-coloured crescents only appear once the pen has passed.
    tl.fromTo(paths, { attr: { 'fill-opacity': 0 } }, { attr: { 'fill-opacity': 1 }, duration: 0.15, ease: 'none' }, 0.45);
    // Each node pops as the pen passes it.
    dots.forEach(dot => {
      const at = passTime(paths, +dot.getAttribute('cx'), +dot.getAttribute('cy'), 0.5, 0.08);
      tl.add(scaleFromTo(dot, 0, 1, { duration: 0.2, ease: 'back.out(2)' }), Math.max(0, at - 0.04));
    });
    return tl;
  }, { enter: '0px 0px -15% 0px' });
}

// When a power2.inOut draw of `duration` (staggered by `stagger`) reaches the
// point of any path nearest (x, y).
function passTime(paths, x, y, duration, stagger) {
  let best = { d: Infinity, f: 0, i: 0 };
  paths.forEach((path, i) => {
    const len = path.getTotalLength();
    for (let s = 0; s <= 80; s++) {
      const pt = path.getPointAtLength((len * s) / 80);
      const d = (pt.x - x) ** 2 + (pt.y - y) ** 2;
      if (d < best.d) best = { d, f: s / 80, i };
    }
  });
  const f = best.f;
  const t = f < 0.5 ? Math.sqrt(f / 2) : 1 - Math.sqrt((1 - f) / 2); // inverse power2.inOut
  return best.i * stagger + t * duration;
}

/* ------------------------------------------------------------ drawing */
// Everything below tweens SVG attributes only: no computed-style or getBBox
// reads, so building a gesture never forces a style recalc per element.

// A dash that starts fully off the path (caps included) and draws to 0.
function drawFrom(el, len, width, vars) {
  const pad = width * 2;
  el.setAttribute('stroke-dasharray', `${len} ${len + pad * 2}`);
  return gsap.fromTo(el, { attr: { 'stroke-dashoffset': len + pad } }, { attr: { 'stroke-dashoffset': 0 }, ...vars });
}

// Scale a circle about its own centre via its transform attribute.
const DASH = ['stroke-dasharray', 'stroke-dashoffset'];

const scaleAbout = (cx, cy, k) => `translate(${cx} ${cy}) scale(${k}) translate(${-cx} ${-cy})`;
function scaleFromTo(circle, from, to, vars) {
  const cx = +circle.getAttribute('cx'), cy = +circle.getAttribute('cy');
  return gsap.fromTo(circle, { attr: { transform: scaleAbout(cx, cy, from) } }, { attr: { transform: scaleAbout(cx, cy, to) }, ...vars });
}

// Back to the authored SVG: removes exactly the attributes a gesture added
// (callers name them; e.g. the roots author their own fill, the links their dasharray).
function clearArt(els, attrs) {
  gsap.killTweensOf(els);
  els.forEach(el => attrs.forEach(name => el.removeAttribute(name)));
}

/** Polylines from an absolute M/L/H/V path, or null for anything richer. */
function polylines(d) {
  if (/[^MLHV\d\s,.\-]/.test(d)) return null;
  const tokens = d.match(/[MLHV]|-?\d*\.?\d+/g) || [];
  const lines = [];
  let cmd = 'M', x = 0, y = 0, line = null;
  for (let i = 0; i < tokens.length;) {
    const t = tokens[i];
    if (/[MLHV]/.test(t)) { cmd = t; i++; continue; }
    if (cmd === 'M') { x = +t; y = +tokens[i + 1]; i += 2; line = [[x, y]]; lines.push(line); cmd = 'L'; continue; }
    if (cmd === 'L') { x = +t; y = +tokens[i + 1]; i += 2; }
    else if (cmd === 'H') { x = +t; i++; }
    else { y = +t; i++; }
    line?.push([x, y]);
  }
  return lines;
}

/** Straight segments [x1, y1, x2, y2] of every path in a group. */
function segmentsOf(group) {
  return [...group.querySelectorAll('path')].flatMap(path => {
    const lines = polylines(path.getAttribute('d') || '') || [];
    return lines.flatMap(pts => pts.slice(1).map((p, i) => [...pts[i], ...p]));
  });
}

/**
 * A detached copy of an authored group, one <line> per segment, built once per
 * card. The copy keeps the group's stroke and opacity, so once drawn it
 * matches the original exactly.
 */
function prepareOverlay(group, segs) {
  const copy = group.cloneNode(false);
  copy.removeAttribute('class');
  copy.setAttribute('aria-hidden', 'true');
  const lines = segs.map(([x1, y1, x2, y2]) => {
    const line = document.createElementNS(SVG_NS, 'line');
    Object.entries({ x1, y1, x2, y2 }).forEach(([k, v]) => line.setAttribute(k, v));
    line._len = Math.hypot(x2 - x1, y2 - y1);
    copy.append(line);
    return line;
  });
  return { group, copy, lines, width: +(group.getAttribute('stroke-width') || 1), opacity: group.getAttribute('opacity') };
}

/**
 * Lays a prepared copy over its group for one gesture. With `ghost`, the
 * original stays as a faint underlay (that share of its opacity) fading out
 * over `fade` seconds instead of vanishing. Returns the restore step.
 */
function mountOverlay({ group, copy, opacity }, tl, { ghost = 0, fade = 0.5 } = {}) {
  group.after(copy);
  if (ghost > 0) tl.fromTo(group, { attr: { opacity: +(opacity ?? 1) * ghost } }, { attr: { opacity: 0 }, duration: fade, ease: 'power1.in' }, 0);
  else group.setAttribute('visibility', 'hidden');
  return () => {
    copy.remove();
    group.removeAttribute('visibility');
    if (opacity === null) group.removeAttribute('opacity'); else group.setAttribute('opacity', opacity);
  };
}

/* ------------------------------------------------------ Writing cards */
const fineEvent = event => event.pointerType === 'mouse' || event.pointerType === 'pen';
const idle = fn => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 800 }) : setTimeout(fn, 200));

function initCards() {
  document.querySelectorAll('.notes-card').forEach(card => {
    const svg = card.querySelector('.notes-card__art svg');
    const kind = Object.keys(ART).find(name => card.classList.contains(`notes-card--${name}`));
    if (!svg || !kind) return;
    // Geometry and overlay copies are built once, in idle time, as the card nears.
    let prep = null;
    const ready = () => (prep ||= ART[kind].prepare(svg));
    onceVisible(card, () => idle(ready), { rootMargin: '0px 0px 60% 0px' });

    let playing = false;
    const play = () => {
      if (playing || mq.reduced.matches) return;
      playing = true;
      const tl = gsap.timeline();
      const restores = [];
      ART[kind].play(ready(), tl, restores);
      // Restored after GSAP flushes any lazy renders of this frame.
      tl.eventCallback('onComplete', () => {
        tl.kill();
        queueMicrotask(() => { restores.forEach(fn => fn()); playing = false; });
      });
    };
    card.addEventListener('pointerenter', event => { if (fineEvent(event) && !isScrolling()) play(); });
    card.addEventListener('focus', () => { if (card.matches(':focus-visible')) play(); });
  });
}

// Each card: prepare(svg) caches what it needs; play(prep, tl, restores) fills
// a ≤1s timeline and queues the steps that put the authored SVG back.
const ART = {
  // ICLR: the skyline's survey grid is redrawn from the ground; the Singapore dot pings.
  conference: {
    prepare(svg) {
      const grid = svg.querySelector('.art-gridlines');
      const dot = svg.querySelector('.art-dot');
      // Verticals rise from the ground line; horizontals run left to right.
      const segs = grid ? segmentsOf(grid).map(([x1, y1, x2, y2]) => (x1 === x2 && y1 < y2 ? [x2, y2, x1, y1] : [x1, y1, x2, y2])) : [];
      const overlay = grid && prepareOverlay(grid, segs);
      let ring = null;
      if (dot) {
        ring = dot.cloneNode(false);
        ring.removeAttribute('class');
        ring.setAttribute('aria-hidden', 'true');
        ring.setAttribute('fill', 'none');
        ring.setAttribute('stroke', dot.getAttribute('fill') || 'currentColor');
        ring.setAttribute('stroke-width', '1.2');
      }
      return { overlay, dot, ring, vertical: segs.map(([x1, , x2]) => x1 === x2) };
    },
    play({ overlay, dot, ring, vertical }, tl, restores) {
      if (overlay) {
        restores.push(mountOverlay(overlay, tl, { ghost: 0.4, fade: 0.6 }));
        let v = 0, h = 0;
        overlay.lines.forEach((line, i) => {
          const at = vertical[i] ? v++ * 0.045 : 0.12 + h++ * 0.05;
          tl.add(drawFrom(line, line._len, overlay.width, { duration: vertical[i] ? 0.45 : 0.5, ease: 'power2.out' }), at);
        });
      }
      if (dot && ring) {
        dot.before(ring);
        restores.push(() => ring.remove(), () => clearArt([dot], ['transform']));
        tl.fromTo(ring, { attr: { r: 4, opacity: 0.8 } }, { attr: { r: 13, opacity: 0 }, duration: 0.6, ease: 'power2.out' }, 0.18);
        tl.add(scaleFromTo(dot, 1, 1.6, { duration: 0.16, ease: 'power2.out', immediateRender: false }), 0.18)
          .add(scaleFromTo(dot, 1.6, 1, { duration: 0.3, ease: 'power2.inOut', immediateRender: false }), 0.34);
      }
    },
  },

  // Graph distillation: edges redraw hop by hop from the root, the arrow nudges,
  // and the computation tree pops in level by level before its root pulses.
  graphs: {
    prepare(svg) {
      const edges = svg.querySelector('.art-graph-edges');
      const root = svg.querySelector('.art-graph-root');
      const treeEdges = svg.querySelector('.art-tree-edges');
      const treeNodes = [...svg.querySelectorAll('.art-tree-nodes circle')];
      const treeRoot = svg.querySelector('.art-tree-root');
      const bfs = edges && root ? bfsOrder(segmentsOf(edges), [+root.getAttribute('cx'), +root.getAttribute('cy')]) : [];
      const depths = [...new Set(treeNodes.map(c => +c.getAttribute('cy')))].sort((a, b) => a - b);
      const levelOf = y => Math.max(0, depths.indexOf(y));
      const treeSegs = treeEdges ? segmentsOf(treeEdges).map(([x1, y1, x2, y2]) => (y1 > y2 ? [x2, y2, x1, y1] : [x1, y1, x2, y2])) : [];
      return {
        root, arrow: svg.querySelector('.art-arrow'), treeRoot,
        graph: bfs.length ? prepareOverlay(edges, bfs.map(s => s.seg)) : null, hops: bfs.map(s => s.level),
        tree: treeSegs.length ? prepareOverlay(treeEdges, treeSegs) : null, treeLevels: treeSegs.map(seg => levelOf(seg[3])),
        pops: [...treeNodes, ...(treeRoot ? [treeRoot] : [])].map(node => [node, levelOf(+node.getAttribute('cy'))]),
      };
    },
    play({ root, arrow, treeRoot, graph, hops, tree, treeLevels, pops }, tl, restores) {
      // immediateRender off: the tree root's pop (scale 0) must hold until it plays.
      const pulse = (el, at, k = 1.35) => {
        tl.add(scaleFromTo(el, 1, k, { duration: 0.11, ease: 'power2.out', immediateRender: false }), at)
          .add(scaleFromTo(el, k, 1, { duration: 0.18, ease: 'power2.inOut', immediateRender: false }), at + 0.11);
      };
      if (graph) {
        restores.push(mountOverlay(graph, tl, { ghost: 0.4, fade: 0.45 }));
        graph.lines.forEach((line, i) => tl.add(drawFrom(line, line._len, graph.width, { duration: 0.18, ease: 'power1.out' }), hops[i] * 0.06));
        pulse(root, 0);
      }
      if (arrow) {
        tl.fromTo(arrow, { attr: { transform: 'translate(0 0)' } }, { attr: { transform: 'translate(7 0)' }, duration: 0.15, ease: 'power2.out' }, 0.3)
          .to(arrow, { attr: { transform: 'translate(0 0)' }, duration: 0.25, ease: 'power2.inOut' }, 0.45);
      }
      if (tree) {
        const T = 0.4, STEP = 0.1;
        restores.push(mountOverlay(tree, tl));
        tree.lines.forEach((line, i) => tl.add(drawFrom(line, line._len, tree.width, { duration: 0.13, ease: 'power1.out' }), T + treeLevels[i] * STEP - 0.07));
        pops.forEach(([node, level]) => tl.add(scaleFromTo(node, 0, 1, { duration: 0.24, ease: 'back.out(2.2)' }), T + level * STEP));
        if (treeRoot) pulse(treeRoot, T + 0.3, 1.4); // ends ≈ 0.99s
      }
      restores.push(() => clearArt([root, arrow, ...pops.map(([node]) => node)].filter(Boolean), ['transform']));
    },
  },

  // MolMerger: virtual links carry messages solute → solvent; atoms light in turn.
  molecules: {
    prepare(svg) {
      const atoms = sel => [...svg.querySelectorAll(`${sel} circle`)].map(atom => [atom, atom.parentNode.getAttribute('fill') || '#ffffff']);
      return { links: svg.querySelector('.art-virtual'), solute: atoms('.art-solute-atoms'), solvent: atoms('.art-solvent-atoms') };
    },
    play({ links, solute, solvent }, tl, restores) {
      if (links) {
        // The dash period is 10, so -30 lands on the authored pattern.
        tl.fromTo(links, { attr: { 'stroke-dashoffset': 0 } }, { attr: { 'stroke-dashoffset': -30 }, duration: 0.9, ease: 'power1.inOut' }, 0);
        restores.push(() => clearArt([links], ['stroke-dashoffset']));
      }
      // Each atom swells and flashes to its panel's own outline colour, then
      // returns to the group's fill (#9ac7d0 solute, #aabbd8 solvent).
      const light = (atoms, at, flash) => atoms.forEach(([atom, base], i) => {
        const t = at + i * 0.04;
        tl.add(scaleFromTo(atom, 1, 1.28, { duration: 0.12, ease: 'power2.out' }), t)
          .fromTo(atom, { attr: { fill: base } }, { attr: { fill: flash }, duration: 0.12, ease: 'power2.out' }, t)
          .add(scaleFromTo(atom, 1.28, 1, { duration: 0.22, ease: 'power2.inOut', immediateRender: false }), t + 0.12)
          .to(atom, { attr: { fill: base }, duration: 0.22, ease: 'power2.inOut' }, t + 0.12);
      });
      light(solute, 0, '#9ac7d0');
      light(solvent, 0.4, '#aabbd8');
      restores.push(() => clearArt([...solute, ...solvent].map(([atom]) => atom), ['transform', 'fill']));
    },
  },
};

/**
 * Orders graph segments by hop distance from the root vertex, each pointing
 * away from the root: the receptive field of a message-passing layer.
 */
function bfsOrder(segs, [rx, ry]) {
  const key = (x, y) => `${x},${y}`;
  const adj = new Map();
  segs.forEach(([x1, y1, x2, y2]) => {
    const a = key(x1, y1), b = key(x2, y2);
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b);
    adj.get(b).push(a);
  });
  const hop = new Map([[key(rx, ry), 0]]);
  const queue = [key(rx, ry)];
  while (queue.length) {
    const v = queue.shift();
    (adj.get(v) || []).forEach(n => { if (!hop.has(n)) { hop.set(n, hop.get(v) + 1); queue.push(n); } });
  }
  const far = Math.max(0, ...hop.values()) + 1;
  return segs.map(([x1, y1, x2, y2]) => {
    const ha = hop.get(key(x1, y1)) ?? far, hb = hop.get(key(x2, y2)) ?? far;
    return { level: Math.min(ha, hb), seg: ha <= hb ? [x1, y1, x2, y2] : [x2, y2, x1, y1] };
  });
}
