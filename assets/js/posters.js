// Research posters: inline overlays and one short gesture per poster.
//
// The seven research cards (ramAIn belongs to ramain.js) get their sanitized
// inline SVG laid over the <img> as they come within a viewport of the screen.
// Each poster then acts out its own idea in at most 1.6s: once, the first time
// its card is at least half in view, and again on a deliberate mouse/pen hover
// or keyboard focus. Only one poster performs at a time.
//
// Rest-state parity is the hard rule. Every gesture runs on a Stage that
// snapshots each attribute it (or GSAP) can touch and every node it adds, and
// puts them back exactly when the gesture completes, is killed, or is reversed
// to its start. The resting frame is therefore always the authored poster.
//
// Exports for the explainer: playGesture(name, svg, {speed}) → timeline|null,
// hasGesture(name), stopGesture(svg) and GESTURES. A gesture timeline is
// single-use (call playGesture again to replay); add your own callbacks with
// tl.then() or tl.call() rather than replacing its onComplete.

import { gsap, motion, mq, on, lenis, debounce, motionPaused, watchVisibility, onceVisible, relayout, pageVisible } from './core.js';
import { overlayPoster } from './poster-svg.js';

const SVGNS = 'http://www.w3.org/2000/svg';
// Everything a gesture may change on an authored element. GSAP clearProps alone
// is not enough: it deletes authored transform attributes and leaves
// transform-origin styles and data-svg-origin behind.
const SNAPSHOT = ['style', 'transform', 'data-svg-origin', 'mask', 'marker-end'];
let maskId = 0;

/* ------------------------------------------------------------------ stage */
function createStage(svg) {
  const saved = new Map();
  const added = [];
  const keep = el => {
    if (!saved.has(el)) saved.set(el, SNAPSHOT.map(name => [name, el.getAttribute(name)]));
    return el;
  };
  const original = (el, name) => saved.get(el)?.find(([n]) => n === name)?.[1];
  const put = (el, name, value) => {
    // Reading first flushes Chrome's lazy style-attribute sync; otherwise the
    // inline style GSAP just emptied reappears later as style="".
    el.getAttribute(name);
    if (value == null) el.removeAttribute(name); else el.setAttribute(name, value);
  };
  return {
    keep,
    setAttr(el, name, value) { keep(el); el.setAttribute(name, value); },
    resetAttr(el, name) { if (saved.has(el)) put(el, name, original(el, name)); },
    add(node) {
      let defs = svg.querySelector('defs');
      if (!defs) { defs = make('defs'); svg.prepend(defs); added.push(defs); }
      defs.append(node);
      added.push(node);
      return node;
    },
    restore() {
      const els = [...saved.keys()];
      if (els.length) gsap.set(els, { clearProps: 'all' });
      saved.forEach((attrs, el) => attrs.forEach(([name, value]) => put(el, name, value)));
      added.splice(0).forEach(node => node.remove());
    },
  };
}

function make(tag, attrs = {}) {
  const el = document.createElementNS(SVGNS, tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

const lengthOf = el => { try { return el.getTotalLength(); } catch { return 0; } };
const opacityOf = el => { const v = parseFloat(getComputedStyle(el).opacity); return Number.isFinite(v) ? v : 1; };
const firstPoint = d => (d.match(/-?\d*\.?\d+/g) || []).slice(0, 2).map(Number);
const lastPoint = d => (d.match(/-?\d*\.?\d+/g) || []).slice(-2).map(Number);
const num = (el, name) => parseFloat(el.getAttribute(name)) || 0;

/* --------------------------------------------------------------- toolkit */
// Small, restorable verbs the gestures are written in. `at` is a time in
// seconds or a function (el, i) → seconds. Selections silently drop anything
// inside a filter= group (never animated), so a missing hook simply means that
// part of the poster stays still.
function toolkit(svg, tl, stage) {
  const live = el => el && el.nodeType === 1 && !el.closest('[filter]');
  const list = els => (els ? (els.nodeType === 1 ? [els] : [...els]) : []).filter(live);
  const time = (at, el, i) => (typeof at === 'function' ? at(el, i) : at);
  // Transform verbs skip elements with an authored transform (GSAP would fold
  // it into absolute x/y/scale and the last frame would no longer match).
  const free = el => !el.hasAttribute('transform');

  // Hide an arrowhead (own or inherited marker-end) until its line has arrived.
  function holdMarker(el, until) {
    const marker = el.closest('[marker-end]');
    if (!marker || marker.getAttribute('marker-end') === 'none') return;
    stage.setAttr(el, 'marker-end', 'none');
    tl.call(() => stage.resetAttr(el, 'marker-end'), null, until);
  }

  return {
    $: sel => list(svg.querySelectorAll(sel)),

    /** Draw solid strokes in from their start (dash trick). */
    draw(els, at, { duration = .3, ease = 'power2.out', stagger = 0 } = {}) {
      list(els).forEach((el, i) => {
        const L = lengthOf(el);
        if (!(L > 0)) return;
        const t = time(at, el, i) + i * stagger;
        stage.keep(el);
        tl.fromTo(el, { strokeDasharray: `${L} ${L + 100}`, strokeDashoffset: L + .5 },
          { strokeDashoffset: 0, duration, ease, immediateRender: true }, t);
        holdMarker(el, t + duration);
      });
    },

    /**
     * Reveal a stroke through a growing mask, so authored dash patterns stay
     * untouched. Each "M" subpath grows on its own (all together, or when
     * partAt(d, k, t) says), which lets a fan of lines draw out from a hub.
     */
    reveal(els, at, { duration = .35, ease = 'power2.out', stagger = 0, split = true, partAt } = {}) {
      list(els).forEach((el, i) => {
        const d = el.getAttribute('d');
        if (!d) return;
        const parts = split ? d.split(/(?=M)/).map(s => s.trim()).filter(Boolean) : [d];
        const sw = parseFloat(getComputedStyle(el).strokeWidth) || 2;
        const box = (() => { try { return el.getBBox(); } catch { return null; } })();
        const pad = sw * 2 + 16;
        const region = box && box.width + box.height > 0
          ? { x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2 }
          : { x: -1200, y: -800, width: 3600, height: 2400 };
        const id = `${svg.getAttribute('data-psvg') || 'poster'}-reveal${++maskId}`;
        const mask = stage.add(make('mask', { id, maskUnits: 'userSpaceOnUse', ...region }));
        const t0 = time(at, el, i) + i * stagger;
        let end = t0 + duration;
        parts.forEach((part, k) => {
          const stroke = make('path', { d: part, fill: 'none', stroke: '#fff', 'stroke-width': sw + 8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
          mask.append(stroke);
          const L = lengthOf(stroke);
          if (!(L > 0)) return;
          const t = partAt ? partAt(part, k, t0) : t0;
          end = Math.max(end, t + duration);
          tl.fromTo(stroke, { strokeDasharray: `${L} ${L + 100}`, strokeDashoffset: L + .5 },
            { strokeDashoffset: 0, duration, ease, immediateRender: true }, t);
        });
        stage.setAttr(el, 'mask', `url(#${id})`);
        holdMarker(el, end);
        tl.call(() => stage.resetAttr(el, 'mask'), null, end);
      });
    },

    /** Scale in from nothing (or `from`) about each element's own centre. */
    pop(els, at, { duration = .26, ease = 'back.out(2.2)', stagger = 0, from = 0 } = {}) {
      list(els).filter(free).forEach((el, i) => {
        stage.keep(el);
        tl.fromTo(el, { scale: from, transformOrigin: '50% 50%' },
          { scale: 1, duration, ease, immediateRender: true }, time(at, el, i) + i * stagger);
      });
    },

    /** Swell and return, starting and ending at the authored frame. */
    pulse(els, at, { peak = 1.3, duration = .36, stagger = 0 } = {}) {
      list(els).filter(free).forEach((el, i) => {
        stage.keep(el);
        tl.to(el, { scale: peak, transformOrigin: '50% 50%', duration: duration / 2, ease: 'power2.out', yoyo: true, repeat: 1 },
          time(at, el, i) + i * stagger);
      });
    },

    /** Land from above-and-large like a rubber stamp. */
    stamp(els, at, { duration = .2, stagger = 0, from = 1.8 } = {}) {
      list(els).filter(free).forEach((el, i) => {
        stage.keep(el);
        tl.fromTo(el, { scale: from, opacity: 0, transformOrigin: '50% 50%' },
          { scale: 1, opacity: opacityOf(el), duration, ease: 'power3.in', immediateRender: true }, time(at, el, i) + i * stagger);
      });
    },

    /** Drop a few units into place while fading up to the authored opacity. */
    settle(els, at, { duration = .28, ease = 'power3.out', stagger = 0, dy = 8 } = {}) {
      list(els).forEach((el, i) => {
        stage.keep(el);
        const from = { opacity: 0 }, to = { opacity: opacityOf(el), duration, ease, immediateRender: true };
        if (free(el)) { from.y = -dy; to.y = 0; }
        tl.fromTo(el, from, to, time(at, el, i) + i * stagger);
      });
    },

    /** Grow along one axis from an edge (e.g. a fill rising from its top). */
    grow(els, at, { duration = .3, ease = 'power2.out', stagger = 0, axis = 'y', origin = '50% 0%' } = {}) {
      const prop = axis === 'x' ? 'scaleX' : 'scaleY';
      list(els).filter(free).forEach((el, i) => {
        stage.keep(el);
        tl.fromTo(el, { [prop]: 0, transformOrigin: origin },
          { [prop]: 1, duration, ease, immediateRender: true }, time(at, el, i) + i * stagger);
      });
    },

    /** March an authored dash pattern forward by whole periods. */
    march(els, at, { duration = .6, ease = 'power1.inOut', periods = 3 } = {}) {
      list(els).forEach((el, i) => {
        const dash = (el.getAttribute('stroke-dasharray') || '').split(/[\s,]+/).map(Number).filter(n => n > 0);
        const period = dash.reduce((a, b) => a + b, 0) * (dash.length % 2 ? 2 : 1);
        if (!period) return;
        stage.keep(el);
        const start = num(el, 'stroke-dashoffset');
        tl.fromTo(el, { strokeDashoffset: start }, { strokeDashoffset: start - period * periods, duration, ease, immediateRender: true }, time(at, el, i));
      });
    },

    /** Push sideways and spring back. */
    nudge(els, at, { x = 8, duration = .34 } = {}) {
      const targets = list(els).filter(free);
      if (!targets.length) return;
      targets.forEach(stage.keep);
      tl.to(targets, { x, duration: duration / 2, ease: 'power2.out', yoyo: true, repeat: 1 }, at);
    },
  };
}

/* -------------------------------------------------------------- gestures */
// Each one acts out its poster's own idea and ends on the authored frame.
const quadInOutInverse = p => (p < .5 ? Math.sqrt(p / 2) : 1 - Math.sqrt((1 - p) / 2));
const byAttr = name => (a, b) => num(a, name) - num(b, name);

const BUILDERS = {
  // Prunes candidates: the query reaches its neighbours, the spectrum decays,
  // grey candidates are cut with an X while blue survivors run on to the
  // exact nearest set.
  panorama({ $, draw, reveal, pop, pulse, stamp }) {
    pulse($('circle[cx="208"][cy="501"]'), 0, { peak: 1.22, duration: .4 });
    reveal($('g[stroke-dasharray="5 6"] > path'), .02, { duration: .4 });
    draw($('path[d^="M342 496"]'), .2, { duration: .14, ease: 'power1.in' });
    draw($('g[stroke="#5f6d9a"] > path'), .26, { duration: .2, stagger: .02, ease: 'power1.out' });
    draw($('path[d^="M548 386"]'), .36, { duration: .1, ease: 'none' });
    $('path[d^="M608 "]').forEach((bar, i) => draw(bar, .42 + i * .045, { duration: .36 - i * .035, ease: 'power3.out' }));
    reveal($('g[stroke-dasharray="5 5"] > path'), .5, { duration: .3, stagger: .03, ease: 'power1.inOut' });
    draw($('g[stroke="#b4bedf"] > path'), .78, { duration: .26, ease: 'power2.out' });
    draw($('g[stroke="#7580a8"] > path'), .82, { duration: .08, stagger: .03, ease: 'none' });
    stamp($('g[stroke="#64719a"] > path'), .88, { stagger: .05, duration: .18 });
    draw($('g[stroke="#3159e8"][stroke-width="2.5"] > path'), .84, { duration: .44, stagger: .045, ease: 'power2.inOut' });
    pop($('circle[cx="791"]'), (el, i) => 1.22 + i * .045, { duration: .2 });
    draw($('path[d^="M800 612"]'), 1.14, { duration: .12, ease: 'none' });
    reveal($('g[stroke="#3159e8"][stroke-width="2.3"] > path'), 1.22, { duration: .2 });
    pop($('g[stroke="#fffefa"] > circle'), 1.24, { stagger: .04, duration: .24 });
  },

  // Gathers its evidence: the glycerol skeleton draws, fine paths carry it
  // from the hub into three descriptor rows, and the traces gather and split
  // into aqueous and organic outputs.
  dissolvr({ $, draw, reveal, pop, grow }) {
    const bonds = $('g[data-c~="bond"] > path');
    draw(bonds[0], 0, { duration: .32, ease: 'power1.inOut' });
    reveal(bonds.slice(1), .16, { duration: .2 });
    pop($('g[stroke-width="2.6"] > circle'), .04, { stagger: .07, duration: .22 });
    const fine = $('path[data-c~="fine"]');
    const fromHub = p => p.getAttribute('d').startsWith('M334');
    draw(fine.filter(p => !fromHub(p)), .3, { duration: .16, ease: 'power1.in' });
    pop($('circle[cx="334"][cy="410"]'), .42, { duration: .22 });
    draw(fine.filter(fromHub), .46, { duration: .3, ease: 'power2.out' });
    grow($('path[d^="M386 "]'), .64, { stagger: .07, duration: .26, origin: '50% 0%' });
    draw($('path[d^="M748 "]'), .76, { duration: .2, stagger: .05 });
    pop($('circle[cx="801"]'), .9, { stagger: .05, duration: .2 });
    draw($('path[d^="M801 "]'), 1.0, { duration: .22, ease: 'power1.inOut' });
    pop($('circle[cx="858"][cy="438"]'), 1.18, { duration: .22 });
    reveal($('path[d^="M865 "]'), 1.22, { duration: .2 });
    draw($('path[d^="M894 304H"], path[d^="M894 460H"]'), 1.3, { duration: .24, ease: 'power2.inOut' });
    draw($('path[d^="M1000 "]'), 1.32, { duration: .26, ease: 'power1.inOut' });
  },

  // The graph resolves into its computation trees: faint edges draw, the
  // three selected nodes pulse, SELECT points right, and each tree grows from
  // its root one level at a time.
  bonsai({ $, draw, reveal, pop, pulse }) {
    draw($('g[data-c~="faint"] > path'), 0, { duration: .42, stagger: .035, ease: 'power1.inOut' });
    draw($('g[data-c~="edge"] > path'), .12, { duration: .38, stagger: .05 });
    pulse($('circle[data-c~="selected"]'), .4, { peak: 1.4, duration: .34, stagger: .07 });
    draw($('path[d^="M523 "]'), .6, { duration: .18, ease: 'power1.in' });
    const edges = $('g[data-c~="tree-edge"] > path');
    const step = .14;
    $('circle[data-c~="tree-root"]').forEach((root, i) => {
      const t0 = .74 + i * .08;
      const nodes = [...root.parentNode.querySelectorAll('circle')];
      const ys = [...new Set(nodes.map(n => num(n, 'cy')))].sort((a, b) => a - b);
      const level = y => ys.reduce((best, v, k) => (Math.abs(v - y) < Math.abs(ys[best] - y) ? k : best), 0);
      const cx = num(root, 'cx'), cy = num(root, 'cy');
      pop(root, t0, { duration: .22 });
      draw($(`path[d^="M${cx} ${cy + 21}"]`), t0 + .1, { duration: .1, ease: 'none' });
      pop(nodes.filter(n => n !== root), n => t0 + .06 + level(num(n, 'cy')) * step - .02, { duration: .2 });
      const own = edges.filter(p => { const [x, y] = firstPoint(p.getAttribute('d')); return Math.abs(x - cx) < 1 && Math.abs(y - cy) < 1; });
      reveal(own, t0, { duration: step, ease: 'none', partAt: d => t0 + .06 + level(firstPoint(d)[1]) * step });
    });
  },

  // Regimes sweep: the dashed training loop marches and is struck out, the
  // CONDENSE hinge nudges, the compact graph forms and its branch lines reach
  // MODEL A, B and C in turn while the masthead arc sweeps.
  condensation({ $, draw, reveal, pop, stamp, march, nudge }) {
    march($('path[stroke-dasharray="7 7"]'), 0, { duration: .5 });
    draw($('path[d^="M1017 104"]'), .1, { duration: .52, ease: 'power2.inOut' });
    stamp($('path[stroke="#D04432"]'), .4, { duration: .2 });
    nudge([...$('circle[cx="581"][cy="472"]'), ...$('path[d^="M572 472"]')], .5, { x: 7, duration: .34 });
    draw($('g[transform="translate(0 8)"] > path'), .64, { duration: .38, ease: 'power1.inOut' });
    pop($('g[transform="translate(0 8)"] > circle'), .6, { stagger: .035, duration: .24 });
    draw($('path[d^="M827 474"]'), .96, { duration: .14, ease: 'none' });
    pop($('circle[cx="864"][cy="474"]'), 1.0, { duration: .2 });
    const reach = k => 1.06 + k * .1;
    reveal($('path[d^="M864 424"]'), 1.06, { duration: .1, ease: 'none', partAt: (d, k) => reach(k) });
    pop($('circle[cx="1094"]').sort(byAttr('cy')), (el, i) => reach(i) + .1, { duration: .22 });
  },

  // Paths diverge: the question's inlet fans out, ten traces run left to
  // right, stable ones converge on A while unstable ones split to A and B,
  // and the outcome cards settle.
  reasonbench({ svg, $, draw, reveal, pop, settle }) {
    draw($('path[d^="M282 420"]'), 0, { duration: .12, ease: 'none' });
    pop($('circle[cx="322"][cy="420"]'), .08, { duration: .2 });
    draw($('path[d^="M322 420"]'), .14, { duration: .26, ease: 'power1.out' });
    const under = $('g[data-c~="path-under"] > path');
    const D = .62, X0 = 420, X1 = 915;
    const start = i => (i < 5 ? .34 + i * .03 : .42 + (i - 5) * .03);
    const arrive = new Map();
    $('g[data-c~="path-core"] > path').forEach((core, i) => {
      draw([core, under[i]], start(i), { duration: D, ease: 'power1.inOut' });
      const y = Math.round(lastPoint(core.getAttribute('d'))[1]);
      arrive.set(y, Math.max(arrive.get(y) || 0, start(i) + D));
    });
    const passes = x => .36 + D * quadInOutInverse(Math.min(1, Math.max(0, (x - X0) / (X1 - X0))));
    pop($('g[stroke="#6557a8"] > circle, g[fill="#b54f9f"] > circle'), el => passes(num(el, 'cx')), { duration: .2 });
    pop($('circle[cx="915"]'), el => (arrive.get(Math.round(num(el, 'cy'))) ?? 1.1) - .02, { duration: .2 });
    draw($('path[d^="M915 364"]'), (arrive.get(364) ?? 1) + .02, { duration: .14, ease: 'power1.out' });
    reveal($('path[d^="M915 532"]'), Math.max(arrive.get(532) ?? 1.1, arrive.get(586) ?? 1.1), { duration: .16 });
    // The cards' frames sit in a shadow filter group and stay put; their contents settle.
    const cards = [...svg.querySelectorAll('g[filter] > rect')]
      .map(r => ({ x: num(r, 'x'), y: num(r, 'y'), w: num(r, 'width'), h: num(r, 'height') }))
      .filter(c => c.x > svg.viewBox.baseVal.width / 2).sort((a, b) => a.y - b.y);
    const place = el => {
      try {
        const b = el.getBBox(), x = b.x + b.width / 2, y = b.y + b.height / 2;
        return { card: cards.findIndex(c => x > c.x && x < c.x + c.w && y > c.y && y < c.y + c.h), y };
      } catch { return { card: -1, y: 0 }; }
    };
    // Row by row, top to bottom: the stable card first, then the unstable one.
    [...svg.children].filter(el => /^(rect|circle|text|path)$/.test(el.localName))
      .map(el => ({ el, ...place(el) })).filter(c => c.card >= 0)
      .forEach(({ el, card, y }) => settle(el, 1.06 + card * .12 + (y - cards[card].y) / cards[card].h * .2, { duration: .24, dy: 7 }));
  },

  // The solvent matrix fills: six column fills come down from their headers
  // in sequence, the shared solute glyph lands in each, and each column's
  // solvent molecule draws.
  sc3({ $, draw, grow, settle }) {
    draw($('path[d^="M278 467"]'), 0, { duration: .16, ease: 'power1.in' });
    const fills = $('rect[height="432"]').sort(byAttr('x'));
    const column = x => Math.max(0, fills.findIndex(f => x >= num(f, 'x') - 1 && x <= num(f, 'x') + num(f, 'width') + 1));
    const groupX = el => firstPoint(el.closest('g[transform]')?.getAttribute('transform') || '')[0] || 0;
    const T = k => .08 + k * .1;
    fills.forEach((fill, k) => grow(fill, T(k), { duration: .36, origin: '50% 0%', ease: 'power2.out' }));
    $('g[transform*="scale(.24)"] > use').forEach(glyph => {
      const k = column(groupX(glyph));
      settle(glyph, T(k) + .14, { duration: .36, dy: 120, ease: 'back.out(1.8)' });
    });
    $('g[stroke="#18284e"][stroke-width="3"] > g').forEach(mol => {
      draw(mol.querySelectorAll('path'), T(column(groupX(mol))) + .44, { duration: .34, ease: 'power1.inOut' });
    });
    $('g[font-size="18"] > text').forEach(label => settle(label, T(column(num(label, 'x'))) + .7, { duration: .24, dy: 5 }));
  },

  // Virtual bonds draw in between the two molecules, the bridge atoms pulse,
  // then the merged graph cascades through attention, the GRU and log S.
  molmerger({ $, draw, reveal, pop, pulse, settle }) {
    const rings = $('g[stroke="#315bd6"][stroke-width="2"] > circle');
    const near = ([x, y]) => rings.filter(c => Math.hypot(num(c, 'cx') - x, num(c, 'cy') - y) < 2);
    $('g[stroke-dasharray="3 10"] > path').forEach((edge, i) => {
      const t = .02 + i * .1, D = .42, d = edge.getAttribute('d');
      reveal(edge, t, { duration: D, ease: 'power1.inOut' });
      pulse(near(firstPoint(d)), t, { peak: 1.45, duration: .3 });
      pulse(near(lastPoint(d)), t + D - .1, { peak: 1.45, duration: .3 });
    });
    draw($('path[d^="M817 476"]'), .62, { duration: .14, ease: 'power1.in' });
    draw($('g[opacity=".62"] > path'), .72, { duration: .26, ease: 'power1.inOut' });
    settle($('g[opacity=".62"] > path'), .76, { duration: .24, dy: 0 });
    pop($('g[fill="#52bbaa"] > circle'), .74, { stagger: .06, duration: .22 });
    draw($('path[d^="M1017 410"]'), .98, { duration: .1, ease: 'none' });
    const boxes = $('g[fill="#e6f5ef"] > rect').sort(byAttr('x'));
    pop(boxes, (el, i) => 1.06 + i * .09, { duration: .22, ease: 'back.out(1.8)' });
    settle($('text[y="503"]').sort(byAttr('x')), (el, i) => 1.1 + i * .09, { duration: .2, dy: 5 });
    draw($('g[marker-end] > path').sort((a, b) => firstPoint(a.getAttribute('d'))[0] - firstPoint(b.getAttribute('d'))[0]), (el, i) => 1.15 + i * .09, { duration: .07, ease: 'none' });
    draw($('path[d^="M1017 535"]'), 1.32, { duration: .08, ease: 'none' });
    settle($('rect[fill="#173a43"]'), 1.34, { duration: .22, dy: 6 });
    settle($('text[x="1017"]'), 1.36, { stagger: .03, duration: .2, dy: 5 });
  },
};

export const GESTURES = Object.freeze(Object.keys(BUILDERS));
export const hasGesture = name => Object.hasOwn(BUILDERS, name);

/* ---------------------------------------------------------------- runner */
const active = new WeakMap(); // svg → { tl, finish }

function runGesture(name, svg, { speed = 1, onEnd } = {}) {
  if (!gsap || !hasGesture(name) || !(svg instanceof SVGSVGElement) || mq.reduced.matches) return null;
  stopGesture(svg);
  // On a card, the authored frame dissolves into the build-up instead of cutting:
  // a still copy (ids stripped, so it reuses the live defs) fades out on top.
  const ghost = svg.parentElement?.classList.contains('poster-link') ? svg.cloneNode(true) : null;
  if (ghost) {
    ghost.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.pointerEvents = 'none';
    svg.after(ghost);
  }
  const dropGhost = () => ghost?.remove();
  const stage = createStage(svg);
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    dropGhost();
    stage.restore();
    if (active.get(svg)?.finish === finish) active.delete(svg);
    onEnd?.();
  };
  const tl = gsap.timeline({ paused: true, onComplete: finish, onInterrupt: finish, onReverseComplete: finish });
  try {
    BUILDERS[name]({ svg, ...toolkit(svg, tl, stage) });
  } catch (error) {
    done = true;
    tl.kill();
    dropGhost();
    stage.restore();
    console.warn(`[site] ${name} gesture skipped:`, error);
    return null;
  }
  if (!(tl.duration() > 0)) { done = true; dropGhost(); stage.restore(); return null; }
  if (ghost) tl.fromTo(ghost, { opacity: 1 }, { opacity: 0, duration: .22, ease: 'power1.out', onComplete: dropGhost }, 0);
  tl.call(finish, null, tl.duration());
  active.set(svg, { tl, finish });
  tl.timeScale(speed > 0 ? speed : 1).play();
  return tl;
}

/** Plays a poster's gesture on any sanitized instance and restores it at the end. */
export function playGesture(name, svg, { speed = 1 } = {}) {
  return runGesture(name, svg, { speed });
}

/** Stops whatever gesture is running on svg and returns it to its authored frame. */
export function stopGesture(svg) {
  const entry = svg && active.get(svg);
  if (!entry) return;
  entry.tl.kill();
  entry.finish();
}

/* ------------------------------------------------------- gallery policy */
const states = new Map(); // link → card state
const queue = new Set();  // cards waiting for their first autoplay, in arrival order
let current = null;       // the one card performing right now
let pumpCall = null;
const HOVER_DWELL = .12, COOLDOWN = 500;

// Scroll state. core's isScrolling() trusts Lenis, but Lenis 1.1 can leave
// isScrolling at 'native' after a zero-delta scroll event (e.g. after
// scrollIntoView), which would block replays forever. Here only Lenis's own
// smooth (wheel) scroll or a scroll event in the last 140ms counts.
let speed = 0, lastY = 0, lastT = 0;
function trackScroll() {
  const now = performance.now();
  speed = Math.abs(scrollY - lastY) / Math.max(1, now - lastT);
  lastY = scrollY; lastT = now;
}
const scrolling = () => lenis?.isScrolling === 'smooth' || performance.now() - lastT < 140;
// A gentle reading scroll may still autoplay; anything faster waits.
const calm = () => !scrolling() || speed < .25;

// Inline, at home in its card, and not too small to read (the Browser pane can
// load tiny; a resize re-pumps the queue once cards grow past 32px).
function ready(state) {
  const { link } = state, svg = link._posterSVG;
  if (!svg || svg.parentNode !== link || !link.classList.contains('has-svg') || state.borrowed) return false;
  // Never cut into a gesture someone else (e.g. the explainer) started on this SVG.
  if (active.has(svg) && !state.tl) return false;
  return link.offsetWidth >= 32;
}

function perform(state, kind) {
  if (!ready(state) || state.tl) return;
  if (current && current !== state) stopGesture(current.link._posterSVG);
  const tl = runGesture(state.name, state.link._posterSVG, { onEnd: () => ended(state) });
  if (!tl) return;
  state.tl = tl;
  state.kind = kind;
  current = state;
}

function ended(state) {
  state.tl = null;
  state.cooldownUntil = performance.now() + COOLDOWN;
  if (current === state) current = null;
  schedulePump(.25);
}

function schedulePump(delay = 0) {
  if (pumpCall) return;
  pumpCall = gsap.delayedCall(delay, () => { pumpCall = null; pump(); });
}

function pump() {
  if (current || !queue.size || motionPaused() || !pageVisible()) return;
  if (!calm()) { schedulePump(.15); return; }
  for (const state of queue) {
    if (state.played || state.ratio < .5 || !ready(state)) continue;
    queue.delete(state);
    state.played = true;
    perform(state, 'auto');
    return;
  }
}

function canReplay(state) {
  return !state.tl && performance.now() >= state.cooldownUntil && !mq.reduced.matches && ready(state);
}

function cancelDwell(state) {
  state.dwell?.kill();
  state.dwell = null;
}

/**
 * Replay after a short dwell, if the user is still there and the page is
 * still. Hover gives up if the page is scrolling (the next pointermove
 * re-arms it); focus waits a little for its own scroll-into-view to settle.
 */
function dwellThenPlay(state, stillThere, kind, tries = 0) {
  if (state.dwell || !canReplay(state)) return;
  state.dwell = gsap.delayedCall(HOVER_DWELL, () => {
    state.dwell = null;
    if (!stillThere() || !canReplay(state)) return;
    if (scrolling()) {
      if (kind === 'focus' && tries < 8) dwellThenPlay(state, stillThere, kind, tries + 1);
      return;
    }
    state.armed = false;
    state.played = true;
    queue.delete(state);
    perform(state, kind);
  });
}

function setupCard(link) {
  const state = {
    link, name: link.dataset.poster, ratio: 0, played: false, tl: null, kind: null,
    armed: false, hovered: false, focused: false, dwell: null, cooldownUntil: 0, borrowed: false,
  };
  states.set(link, state);

  // Inline the vector poster once the card is within a viewport of the screen.
  onceVisible(link, async () => {
    if (await overlayPoster(link)) { relayout(); schedulePump(); }
  }, { rootMargin: '100% 0px' });

  watchVisibility(link, (visible, entry) => {
    state.ratio = visible ? (entry ? entry.intersectionRatio : 1) : 0;
    if (!visible) {
      cancelDwell(state);
      if (state.tl) stopGesture(link._posterSVG);
      return;
    }
    if (state.ratio >= .5 && !state.played) { queue.add(state); schedulePump(); }
  }, { threshold: [0, .5] });

  // Hover replay: fine pointers only, a real pointermove, a short dwell, once per visit.
  const precise = event => event.pointerType === 'mouse' || event.pointerType === 'pen';
  link.addEventListener('pointerenter', event => {
    if (!precise(event)) return;
    state.hovered = true;
    state.armed = !state.tl;
  });
  link.addEventListener('pointermove', event => {
    if (!precise(event) || !state.hovered || !state.armed) return;
    if (scrolling()) { cancelDwell(state); return; }
    dwellThenPlay(state, () => state.hovered && state.armed, 'hover');
  });
  link.addEventListener('pointerleave', event => {
    if (!precise(event)) return;
    state.hovered = false;
    state.armed = false;
    cancelDwell(state);
  });

  // Keyboard parity: arriving on a card with visible focus replays it too.
  link.addEventListener('focus', () => {
    if (!link.matches(':focus-visible')) return;
    state.focused = true;
    dwellThenPlay(state, () => state.focused, 'focus');
  });
  link.addEventListener('blur', () => { state.focused = false; cancelDwell(state); });
}

export async function init() {
  // Reduced motion (or no GSAP): the authored <img> stays, and nothing moves.
  if (!motion) return;
  const links = [...document.querySelectorAll('.research-gallery .project-card .poster-link[data-poster]')]
    .filter(link => hasGesture(link.dataset.poster));
  if (!links.length) return;
  lastY = scrollY;
  addEventListener('scroll', trackScroll, { passive: true });
  links.forEach(setupCard);

  on('motion:paused', paused => {
    if (paused && current?.kind === 'auto') stopGesture(current.link._posterSVG);
    if (!paused) schedulePump();
  });
  on('explainer:open', ({ link } = {}) => {
    const state = states.get(link);
    if (!state) return;
    state.borrowed = true;
    cancelDwell(state);
    if (state.tl) stopGesture(link._posterSVG);
  });
  on('explainer:close', ({ link } = {}) => {
    const state = states.get(link);
    if (!state) return;
    state.borrowed = false;
    state.armed = false;
    state.cooldownUntil = performance.now() + COOLDOWN;
  });
  addEventListener('resize', debounce(() => schedulePump(), 200));
  document.addEventListener('visibilitychange', () => {
    if (!pageVisible() && current) stopGesture(current.link._posterSVG);
    else schedulePump();
  });
}
