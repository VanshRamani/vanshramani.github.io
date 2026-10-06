// The caffeine field's brain. Everything both renderers share lives here: the
// molecular graph, the pose (rest + bounded wobble + drag), the hop expansion,
// the intro wave, input and picking, the inspector card, the legend, and the
// ONE projection that every renderer and every hit-test uses.
//
// Renderers implement { resize(w, h, dpr), render(state), dispose() } and only
// draw what `state` already says: projected atoms, the depth-sorted draw list,
// field weights and colours. They never decide anything themselves, which is
// what keeps the 2D canvas and the WebGL layer pixel-matched.
import { html, mq, motion, motionPaused, on, addTicker, watchVisibility, pageVisible, relayout, clamp } from './core.js';

/* ================================================================ look */
export const FOCAL = 14;                          // camera distance in Å: perspective = 14 / (14 + depth)
export const REST = { yaw: -.26, pitch: .30 };   // the template's resting pose
const WOBBLE = { yaw: .45, pitch: .2, period: 14 };
const DRAG_RATE = .009;                           // rad per CSS px (template)
const KEY_STEP = { yaw: .12, pitch: .10 };        // template arrow-key steps
const PITCH_LIMIT = 1.3;
const DOUBLE_OFFSET = 3;                          // px between a double bond's tubes and its axis, at rest
const RETURN_OMEGA = 9;                           // critically damped return, settles in ≈0.8s

export const ELEMENTS = { C: 0, N: 1, O: 2, H: 3 };

/** sRGB hex → [r, g, b] in 0..1 (no colour management: both renderers draw sRGB as is). */
export const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);

// Glossy CPK palette, locked to the template's 2D drawing.
export const PALETTE = [
  { light: rgb('#8f9bad'), base: rgb('#394455'), dark: rgb('#111827'), radius: .43 }, // C
  { light: rgb('#96c2ff'), base: rgb('#456eff'), dark: rgb('#173399'), radius: .45 }, // N
  { light: rgb('#ffc8e1'), base: rgb('#ef6a9b'), dark: rgb('#a72a61'), radius: .44 }, // O
  { light: rgb('#ffffff'), base: rgb('#edf3ff'), dark: rgb('#a5b5d1'), radius: .23 }, // H
];

export const LOOK = {
  ground: rgb('#e4ecff'),            // panel ground: receding and far atoms tint toward it
  bondOutline: rgb('#6c7b9c'), bondMid: rgb('#bcc9e3'), bondHighlight: 119 / 255,
  atomOutline: rgb('#192943'), atomOutlineAlpha: 43 / 255,
  atomOutlineH: rgb('#b7c8e7'), atomOutlineAlphaH: 119 / 255,
  highlightAlpha: 179 / 255,
  shadow: rgb('#6c83c7'), shadowAlpha: 26 / 255,
  ringGap: 7, ringWidth: 2,
  recedeAtom: .45, recedeBond: .55,  // the template's .55 / .45 alpha, as a tint
  depthTint: .25, depthTintRange: 2.5,
};

// Promolecular density slice: rho(p) = Σ w_i exp(-|p - x_i|² / 2σ_e²) in the
// molecule's own plane (z = 0). Isolines are drawn at L = sqrt(-2 ln rho) = kΔ,
// so an isolated atom gets evenly spaced rings; they are level sets of rho all
// the same. Both renderers read these numbers.
export const FIELD = {
  sigma: [.62, .60, .58, .36],       // C N O H, Å
  delta: .5,                         // ring spacing in L
  kMax: 7,
  margin: 3.2,                       // Å around the atoms' bounding box
  restColor: rgb('#8fabe8'),
  restAlpha: [0, 0, 0, .26, .24, .21, .16, .09],   // rings start at L = 1.5: no loops inside the rings at rest
  selAlpha: [0, .72, .66, .58, .48, .37, .25, .12],
  wash: .075, washFrom: 1.2, washTo: 3.5,
};
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const levelOf = rho => Math.sqrt(Math.max(0, -2 * Math.log(Math.max(rho, 1e-6))));
export const washAt = L => FIELD.wash * (1 - smoothstep(FIELD.washFrom, FIELD.washTo, L));

/* ============================================================ content */
// Verbatim from the template (js/molecule.js); links rebased for claude-flex/.
export const DIRECTIONS = [
  { title: 'Molecular learning', atom: 6, color: '#175c75', tint: '#e1f4f5', links: [['DISSOLVR', 'paper-dissolvr', 'ICML 2026'], ['SC³', 'paper-sc3', 'NeurIPS 2026'], ['MolMerger', 'paper-molmerger', 'JCTC 2024']] },
  { title: 'Graph distillation', atom: 2, color: '#315d36', tint: '#edf5da', links: [['Bonsai', 'paper-bonsai', 'ICLR 2025'], ['Graph Condensation Needs a Reset', 'paper-condensation', 'ICML 2026 · Spotlight']] },
  { title: 'Similarity search', atom: 8, color: '#284fc8', tint: '#e5ebff', links: [['Panorama', 'paper-panorama', 'Fast-Track Nearest Neighbors']] },
  { title: 'Reasoning stability', atom: 3, color: '#6d3b88', tint: '#f0e8f8', links: [['ReasonBENCH', 'paper-reasonbench', 'EIML · ICML 2026']] },
  { title: 'Computer-use agents', atom: 5, color: '#224ca0', tint: '#e1ecff', links: [['ramAIn', 'https://ramain.ai', 'Co-founder & CTO · YC W26'], ['What I’m building', '#building', 'Computer use & orchestration']] },
  { title: 'Unlearning & neurosymbolic AI', atom: 9, color: '#845046', tint: '#f6e9e2', links: [['Research experience', '../content/background.html', 'Carnegie Mellon']] },
];
const PREVIEWS = [
  'Solubility prediction, interpretable models, and solute–solvent interactions.',
  'Representative computation trees and a rethink of graph condensation.',
  'Nearest-neighbor search through spectral structure and incremental distance checks.',
  'Measuring how reasoning traces and answers vary across repeated attempts.',
  'At ramAIn, I build agents that execute work across web portals and legacy systems.',
  'Machine unlearning and neurosymbolic AI at Carnegie Mellon.',
];
const LABELS = {
  touch: ['TAP AN ATOM TO EXPLORE', 'Caffeine research map. Tap an atom to pin its neighborhood contours and research card. Swipe horizontally to rotate; swipe vertically to scroll.'],
  pointer: ['HOVER TO EXPLORE / CLICK TO PIN', 'Caffeine research map. Hover over an atom to show neighborhood contours and a research card. Click to pin; drag or use arrow keys to rotate.'],
};

/* ====================================================== timing language */
// One vocabulary for the intro and every hover: waves leave the root hop by hop.
const INTRO_ROOT = 5;             // eccentricity 6: seven waves
const INTRO_HOP = 90;             // ms between intro waves
const HOVER_HOP = 110;            // ms between hover waves
const RISE = 350;                 // each wave's expo.out
const FALL = 260;
const INTRO_HOLD = 1040;          // the intro colour relaxes into the rest field…
const INTRO_RELAX = 600;          // …over this long
const HOP_WEIGHT = [1, .8, .6];   // hop 0, 1, 2 of the receptive field
const HOVER_HIDE = 180;           // template's grace period before a preview clears

const expoOut = t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const backOut = t => { const u = t - 1; return u * u * (2.6 * u + 1.6) + 1; };   // back.out(1.6)

const tween = v => ({ from: v, to: v, t0: 0, dur: 1 });
const tweenAt = (tw, now) => {
  const p = (now - tw.t0) / tw.dur;
  return p <= 0 ? tw.from : p >= 1 ? tw.to : tw.from + (tw.to - tw.from) * expoOut(p);
};
const tweenTo = (tw, to, now, delay = 0, dur = RISE) => {
  tw.from = tweenAt(tw, now); tw.to = to; tw.t0 = now + delay; tw.dur = Math.max(dur, 1e-3);
};
const tweenBusy = (tw, now) => now < tw.t0 + tw.dur;

/* ========================================================== projection */
/** Framing and rotation for a w×h stage, as the template framed it. Reuses `v`. */
export function makeView(v, w, h, yaw, pitch) {
  const compact = w < 500, mid = !compact && w < 620;
  v.w = w; v.h = h; v.yaw = yaw; v.pitch = pitch;
  v.scale = Math.min(w / 8.6, h / 7.5) * (mid ? .84 : .92);
  v.cx = w * (compact ? .5 : mid ? .30 : .35);
  v.cy = h * .49;
  v.f = v.scale * FOCAL;
  v.cY = Math.cos(yaw); v.sY = Math.sin(yaw); v.cP = Math.cos(pitch); v.sP = Math.sin(pitch);
  return v;
}

/** THE projection: molecule space (Å) → CSS px, depth (Å, + is far) and px-per-Å. */
export function project(v, x, y, z, out) {
  const xx = x * v.cY + z * v.sY, zz = -x * v.sY + z * v.cY;
  const yy = y * v.cP - zz * v.sP, depth = y * v.sP + zz * v.cP;
  const k = v.f / (FOCAL + depth);
  out.x = v.cx + xx * k; out.y = v.cy - yy * k; out.z = depth; out.k = k;
  return out;
}

/**
 * The same projection as matrices, for a GL camera. rotation · p gives
 * (xx, yy, depth); view adds FOCAL; projection maps (X, Y, Z) to clip space
 * with w = Z, so x/w and y/w land exactly where project() puts them.
 * All three are row-major 4×4 arrays (THREE.Matrix4.set order).
 */
export function viewMatrices(v, near = 1, far = 60) {
  const { cY, sY, cP, sP, w, h, f, cx, cy } = v;
  return {
    rotation: [cY, 0, sY, 0, sP * sY, cP, -sP * cY, 0, -cP * sY, sP, cP * cY, 0, 0, 0, 0, 1],
    view: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, FOCAL, 0, 0, 0, 1],
    projection: [
      2 * f / w, 0, 2 * cx / w - 1, 0,
      0, 2 * f / h, 1 - 2 * cy / h, 0,
      0, 0, (far + near) / (far - near), -2 * far * near / (far - near),
      0, 0, 1, 0,
    ],
  };
}

/* ======================================================== the molecule */
export function createMolecule(canvas, data) {
  const stage = canvas.parentElement;
  const panel = canvas.closest('.molecule-panel') || stage;
  const inspector = stage.querySelector('.molecule-hover-inspector');
  const legend = [...panel.querySelectorAll('.molecule-legend button[data-direction]')];
  const instruction = panel.querySelector('.molecule-instruction');
  const $ = id => document.getElementById(id);
  const card = inspector && {
    title: $('molecule-thread-title'), eyebrow: $('molecule-thread-eyebrow'), text: $('molecule-thread-description'),
    links: $('molecule-thread-links'), pin: $('molecule-pin'), readout: $('molecule-neighborhood'),
    close: inspector.querySelector('.molecule-hover-close'),
  };

  /* ------------------------------------------------------------ model */
  const atoms = data.atoms.map(a => {
    const el = ELEMENTS[a.element] ?? 0, [x, y, z] = a.position, s = FIELD.sigma[el];
    return { el, symbol: a.element, x, y, z, R: PALETTE[el].radius, inv2s2: 1 / (2 * s * s) };
  });
  const bonds = data.bonds.map(b => ({ a: b.from, b: b.to, order: b.order || 1 }));
  const N = atoms.length;
  const adjacency = atoms.map(() => []);
  bonds.forEach(({ a, b }) => { adjacency[a].push(b); adjacency[b].push(a); });
  const hopsFrom = root => {
    const hop = new Int8Array(N).fill(-1); hop[root] = 0;
    for (let frontier = [root], d = 1; frontier.length; d++) {
      const next = [];
      frontier.forEach(i => adjacency[i].forEach(j => { if (hop[j] < 0) { hop[j] = d; next.push(j); } }));
      frontier = next;
    }
    return hop;
  };
  const HOPS = atoms.map((_, i) => hopsFrom(i));
  const reach2 = HOPS.map(h => h.filter(d => d >= 0 && d <= 2).length);
  // The template's ownerOf(): the nearest direction atom, ties to the lower index.
  const OWNER = atoms.map((_, i) => {
    for (let d = 0; d < N; d++) {
      const owner = DIRECTIONS.findIndex(dir => HOPS[i][dir.atom] === d);
      if (owner >= 0) return owner;
    }
    return 0;
  });
  const xs = atoms.map(a => a.x), ys = atoms.map(a => a.y);
  const bounds = [Math.min(...xs) - FIELD.margin, Math.min(...ys) - FIELD.margin, Math.max(...xs) + FIELD.margin, Math.max(...ys) + FIELD.margin];
  const model = { atoms, bonds, bounds, N };

  /* ------------------------------------------------------------ state */
  const S = {
    w: 0, h: 0, dpr: 1, view: {}, model,
    proj: atoms.map(() => ({ x: 0, y: 0, z: 0, k: 0, r: 0 })),
    scale: new Float32Array(N),           // intro scale per atom
    tint: new Float32Array(N),            // final tint toward ground per atom
    restW: new Float32Array(N), selW: new Float32Array(N),
    restVersion: 0, selVersion: 0, fieldSettled: true,
    restAlpha: 1, selAlpha: 0, selColor: [0, 0, 0], washAlpha: 0,
    shadowAlpha: 0, fade2D: 1, recede: 0,
    ring: { x: 0, y: 0, r: 0, alpha: 0, color: [0, 0, 0] },
    prims: [],
  };
  const atomItems = atoms.map((a, i) => ({ type: 0, i, el: a.el, x: 0, y: 0, r: 0, z: 0, tint: 0 }));
  // A bond is one or two tubes (screen px, already inset into its atoms); g0..g1 is
  // the visible stretch while the intro grows it from the end the wave reaches first.
  const tube = () => ({ x1: 0, y1: 0, x2: 0, y2: 0 });
  const bondItems = bonds.map((b, i) => ({ type: 1, i, elA: atoms[b.a].el, elB: atoms[b.b].el, tubes: [tube(), tube()], n: 0, g0: 0, g1: 1, z: 0, tint: 0 }));
  const endA = { x: 0, y: 0, z: 0, k: 0 }, endB = { x: 0, y: 0, z: 0, k: 0 };
  const bondFlip = new Uint8Array(bonds.length);

  const restTw = atoms.map(() => tween(0));
  const selTw = atoms.map(() => tween(0));
  const memTw = atoms.map(() => tween(1));
  const selAlphaTw = tween(0), recedeTw = tween(0), colorTw = tween(1);
  const colorFrom = [0, 0, 0], colorTo = [0, 0, 0];

  const sel = { atom: -1, dir: -1, pinned: false, ring: -1 };
  const intro = { state: 'waiting', start: 0, relaxing: false, done: [] };
  const pose = { yaw: REST.yaw, pitch: REST.pitch, phase: 0, env: 0, speed: 0 };
  const user = { yaw: 0, pitch: 0, vy: 0, vp: 0 };
  let gesture = null, keyHold = false, hoverHold = false, focusHold = false, pointerAtom = -1;
  let visible = true, layout = '', layoutDirty = true, hideTimer = 0;
  let cardSize = { w: 230, h: 0 }, cardPos = { left: NaN, top: NaN };
  let rect = null;
  const animate = () => motion && !mq.reduced.matches;

  /* ------------------------------------------------------- renderers */
  let active = null, fallback = null, xfade = null;
  const listeners = { ready: [] };

  function attach(renderer) {
    active = fallback = renderer;
    sizeRenderer(renderer);
    requestFrame();
  }

  /**
   * Crossfades from the 2D canvas to `renderer` (already compiled) over 250ms.
   * Its first frame is drawn while it is still invisible; any failure throws
   * back to the caller, which keeps the 2D canvas.
   */
  function adopt(renderer) {
    sizeRenderer(renderer);
    renderFrame(performance.now(), renderer);
    renderer.verify?.();
    xfade = { to: renderer, start: performance.now(), dur: animate() ? 250 : 0 };
    requestFrame();
  }

  /** A renderer failed or lost its context: return to the 2D canvas. */
  function drop(renderer) {
    if (xfade?.to === renderer) xfade = null;
    if (active === renderer) active = fallback;
    S.fade2D = 1;
    try { renderer.dispose(); } catch { /* already gone */ }
    if (active) { sizeRenderer(active); requestFrame(); }
  }

  function sizeRenderer(r) {
    if (S.w >= 32 && S.h >= 32) r.resize(S.w, S.h, S.dpr);
  }

  function safeRender(r) {
    try { r.render(S); } catch (error) {
      if (r === fallback) throw error;
      drop(r);
    }
  }

  /* ------------------------------------------------------------ ticker */
  let unsubscribe = null, needsFrame = false, last = 0;
  function requestFrame() {
    needsFrame = true;
    if (!unsubscribe && visible && pageVisible()) { last = performance.now(); unsubscribe = addTicker(tick); }
  }
  function sleep() { unsubscribe?.(); unsubscribe = null; }

  // Frame-time governor: drop the pixel ratio in .25 steps when p90 > 18ms.
  const frames = []; let dprDrop = 0;
  function govern(dt) {
    if (dt > 100) { frames.length = 0; return; }
    frames.push(dt);
    if (frames.length < 90) return;
    const sorted = [...frames].sort((a, b) => a - b), p10 = sorted[9], p90 = sorted[80];
    frames.length = 0;
    if (p90 > 18 && p90 > p10 * 1.5 && S.dpr > 1) { dprDrop += .25; resize(); }
  }

  // gsap.ticker is shared: a throw here would starve every later listener, so
  // a failing frame drops the WebGL layer (or stops the 2D one) and reports async.
  function tick() {
    try { step(); } catch (error) {
      sleep();
      if (active && active !== fallback) drop(active);
      setTimeout(() => { throw error; });
    }
  }

  function step() {
    const now = performance.now(), dt = Math.min(64, now - last);
    if (!visible || !pageVisible() || S.w < 32 || S.h < 32) { sleep(); return; }
    let busy = false;
    if (intro.state === 'running') busy = updateIntro(now);
    busy = updateField(now) || busy;
    busy = updatePose(dt) || busy;
    if (xfade) busy = true;
    if (layoutDirty) applyLayout();
    if (busy || needsFrame) {
      if (busy && !needsFrame) govern(now - last);
      renderFrame(now);
      needsFrame = false;
    }
    last = now;
    if (!busy) { frames.length = 0; sleep(); }
  }

  function prepare(now) {
    makeView(S.view, S.w, S.h, pose.yaw, pose.pitch);
    projectAll(now);
    buildDrawList(now);
  }

  // Canvas-only repaint (safe inside a ResizeObserver: no style writes).
  function drawCanvases() {
    if (S.w < 32 || S.h < 32) return;
    prepare(performance.now());
    if (xfade) { safeRender(fallback); if (xfade) safeRender(xfade.to); }
    else if (active) safeRender(active);
  }

  function renderFrame(now, only) {
    if (S.w < 32 || S.h < 32) return;
    prepare(now);
    placeCard();
    if (only) { only.render(S); return; }
    if (xfade) {
      const t = clamp((now - xfade.start) / Math.max(xfade.dur, 1), 0, 1);
      S.fade2D = 1 - t;
      safeRender(fallback);
      if (!xfade) return;                               // the GL layer failed mid-fade
      xfade.to.canvas.style.opacity = String(t);
      safeRender(xfade.to);
      if (t >= 1 && xfade) {
        active = xfade.to; xfade = null; S.fade2D = 1;
        fallback.clear();
        listeners.ready.forEach(fn => fn(active));
      }
      return;
    }
    if (active) safeRender(active);
  }

  /* ------------------------------------------------------------- intro */
  function startIntro() {
    if (intro.state !== 'waiting') return;
    const now = performance.now();
    if (!animate() || motionPaused()) { finishIntro(now, true); return; }
    intro.state = 'running'; intro.start = now;
    printCaption();
    const hop = HOPS[INTRO_ROOT];
    for (let i = 0; i < N; i++) {
      restTw[i] = { from: 0, to: 1, t0: now + hop[i] * INTRO_HOP, dur: RISE };
      if (sel.atom < 0) selTw[i] = { from: 0, to: 1, t0: now + hop[i] * INTRO_HOP, dur: RISE };
    }
    if (sel.atom < 0) {
      setColor(DIRECTIONS[OWNER[INTRO_ROOT]].color, now, true);
      selAlphaTw.from = selAlphaTw.to = 1;
    }
    requestFrame();
  }

  function updateIntro(now) {
    const t = now - intro.start, hop = HOPS[INTRO_ROOT];
    for (let i = 0; i < N; i++) S.scale[i] = backOut(clamp((t - hop[i] * INTRO_HOP) / RISE, 0, 1));
    S.shadowAlpha = expoOut(clamp(t / 500, 0, 1));
    if (!intro.relaxing && t >= INTRO_HOLD) {
      intro.relaxing = true;
      if (sel.atom < 0) { selAlphaTw.from = 1; tweenTo(selAlphaTw, 0, now, 0, INTRO_RELAX); selTw.forEach(tw => tweenTo(tw, 0, now, 0, INTRO_RELAX)); }
    }
    if (t >= INTRO_HOLD + INTRO_RELAX) { finishIntro(now); return true; }
    return true;
  }

  function finishIntro(now, instant = false) {
    intro.state = 'done';
    printCaption();
    S.scale.fill(1); S.shadowAlpha = 1;
    if (instant) restTw.forEach(tw => { tw.from = tw.to = 1; });
    requestFrame();
    intro.done.splice(0).forEach(fn => fn());
  }

  // Bonds grow from the end the wave reaches first.
  bonds.forEach((b, i) => { bondFlip[i] = HOPS[INTRO_ROOT][b.b] < HOPS[INTRO_ROOT][b.a] ? 1 : 0; });

  /* ------------------------------------------------------- field state */
  function setColor(hex, now, instant = false) {
    const target = rgb(hex);
    if (instant || S.selAlpha < .01) { colorFrom.splice(0, 3, ...target); colorTo.splice(0, 3, ...target); colorTw.from = colorTw.to = 1; return; }
    const cur = S.selColor.slice();
    colorFrom.splice(0, 3, ...cur); colorTo.splice(0, 3, ...target);
    colorTw.from = 0; colorTw.to = 1; colorTw.t0 = now; colorTw.dur = 150;
  }

  function updateField(now) {
    let busy = false, restChanged = false, selChanged = false;
    for (let i = 0; i < N; i++) {
      const r = tweenAt(restTw[i], now), s = tweenAt(selTw[i], now);
      if (Math.abs(r - S.restW[i]) > 1e-5) { S.restW[i] = r; restChanged = true; }
      if (Math.abs(s - S.selW[i]) > 1e-5) { S.selW[i] = s; selChanged = true; }
      busy = busy || tweenBusy(restTw[i], now) || tweenBusy(selTw[i], now) || tweenBusy(memTw[i], now);
    }
    if (restChanged) S.restVersion++;
    if (selChanged) S.selVersion++;
    const c = tweenAt(colorTw, now);
    for (let j = 0; j < 3; j++) S.selColor[j] = colorFrom[j] + (colorTo[j] - colorFrom[j]) * c;
    S.selAlpha = tweenAt(selAlphaTw, now);
    S.restAlpha = 1 - .5 * S.selAlpha;
    S.washAlpha = S.selAlpha;
    busy = busy || tweenBusy(colorTw, now) || tweenBusy(selAlphaTw, now) || tweenBusy(recedeTw, now);
    S.fieldSettled = !busy;
    return busy;
  }

  /* -------------------------------------------------------------- pose */
  const wobbleAllowed = () => motion && !motionPaused() && intro.state === 'done' && visible && pageVisible()
    && !hoverHold && !focusHold && !keyHold && !gesture?.dragging && sel.atom < 0;

  function updatePose(dt) {
    let busy = false;
    const target = wobbleAllowed() ? 1 : 0;
    if (pose.speed !== target) {
      pose.speed = target > pose.speed ? Math.min(1, pose.speed + dt / 600) : Math.max(0, pose.speed - dt / 400);
      busy = true;
    }
    if (pose.speed > 0) {
      const s = pose.speed * pose.speed * (3 - 2 * pose.speed);
      pose.phase += dt / 1000 * (2 * Math.PI / WOBBLE.period) * s;
      pose.env = Math.min(1, pose.env + dt / 3000 * s);
      busy = true;
    }
    const held = keyHold || gesture?.dragging;
    if (!held && animate() && (user.yaw || user.pitch || user.vy || user.vp)) { returnStep(dt / 1000); busy = true; }
    const e = pose.env * pose.env * (3 - 2 * pose.env);
    const pitchW = REST.pitch + WOBBLE.pitch * e * Math.cos(pose.phase);
    pose.yaw = REST.yaw + WOBBLE.yaw * e * Math.sin(pose.phase) + user.yaw;
    pose.pitch = clamp(pitchW + user.pitch, -PITCH_LIMIT, PITCH_LIMIT);
    return busy;
  }

  // Exact critically damped step toward the wobble: no overshoot, ≈0.8s.
  function returnStep(t) {
    const w = RETURN_OMEGA, e = Math.exp(-w * t);
    [['yaw', 'vy'], ['pitch', 'vp']].forEach(([x, v]) => {
      const c = user[v] + w * user[x];
      user[x] = (user[x] + c * t) * e;
      user[v] = (user[v] - w * c * t) * e;
      if (Math.abs(user[x]) < 4e-4 && Math.abs(user[v]) < 4e-3) { user[x] = 0; user[v] = 0; }   // < 0.1px
    });
  }

  function rotateBy(dyaw, dpitch) {
    user.yaw += dyaw; user.vy = 0; user.vp = 0;
    const base = pose.pitch - user.pitch;
    user.pitch = clamp(base + user.pitch + dpitch, -PITCH_LIMIT, PITCH_LIMIT) - base;
    requestFrame();
  }

  function releaseRotation() {
    user.yaw = Math.atan2(Math.sin(user.yaw), Math.cos(user.yaw));   // shortest way home
    user.vy = user.vp = 0;
    requestFrame();
  }

  /* ---------------------------------------------------- projection pass */
  function projectAll(now) {
    const v = S.view, recede = tweenAt(recedeTw, now);
    for (let i = 0; i < N; i++) {
      const a = atoms[i], p = project(v, a.x, a.y, a.z, S.proj[i]);
      p.r = a.R * p.k * S.scale[i];
      const depth = LOOK.depthTint * smoothstep(0, LOOK.depthTintRange, p.z);
      const back = LOOK.recedeAtom * recede * (1 - tweenAt(memTw[i], now));
      S.tint[i] = 1 - (1 - depth) * (1 - back);
    }
    S.recede = recede;
  }

  function buildDrawList(now) {
    const list = S.prims; list.length = 0;
    const recede = S.recede, introT = now - intro.start;
    for (let i = 0; i < N; i++) {
      const p = S.proj[i], it = atomItems[i];
      if (p.r < .05) continue;
      it.x = p.x; it.y = p.y; it.r = p.r; it.z = p.z; it.tint = S.tint[i];
      list.push(it);
    }
    for (let i = 0; i < bonds.length; i++) {
      const b = bonds[i], it = bondItems[i], pa = S.proj[b.a], pb = S.proj[b.b];
      let grow = 1;
      if (intro.state === 'running') {
        const later = Math.max(HOPS[INTRO_ROOT][b.a], HOPS[INTRO_ROOT][b.b]);
        grow = expoOut(clamp((introT - later * INTRO_HOP) / RISE, 0, 1));
      } else if (intro.state === 'waiting') grow = 0;
      if (grow <= .001) continue;
      tubesOf(b, it, pa, pb);
      if (!it.n) continue;
      it.g0 = bondFlip[i] ? 1 - grow : 0; it.g1 = bondFlip[i] ? 1 : grow;
      it.z = (pa.z + pb.z) / 2;
      const depth = LOOK.depthTint * smoothstep(0, LOOK.depthTintRange, it.z);
      const member = Math.min(tweenAt(memTw[b.a], now), tweenAt(memTw[b.b], now));
      it.tint = 1 - (1 - depth) * (1 - LOOK.recedeBond * recede * (1 - member));
      list.push(it);
    }
    list.sort((a, b) => b.z - a.z);     // far first; stable, so ties keep atoms under bonds
    const ring = S.ring, ra = sel.ring >= 0 ? S.proj[sel.ring] : null;
    ring.alpha = ra ? S.selAlpha * clamp(S.selW[sel.ring] / HOP_WEIGHT[0], 0, 1) : 0;
    if (ra) { ring.x = ra.x; ring.y = ra.y; ring.r = ra.r + LOOK.ringGap; ring.color = S.selColor; }
  }

  // Single bonds: one tube between the projected atoms. Double bonds: two tubes
  // offset in the molecule's own plane (3px at rest), so they close up edge-on.
  function tubesOf(b, it, pa, pb) {
    it.n = 0;
    if (b.order !== 2) { addTube(it, pa, pb, pa.r, pb.r); return; }
    const A = atoms[b.a], B = atoms[b.b], v = S.view;
    const len = Math.hypot(B.x - A.x, B.y - A.y), d = DOUBLE_OFFSET / v.scale;
    const nx = -(B.y - A.y) / len * d, ny = (B.x - A.x) / len * d;
    for (const side of [1, -1]) {
      project(v, A.x + nx * side, A.y + ny * side, A.z, endA);
      project(v, B.x + nx * side, B.y + ny * side, B.z, endB);
      addTube(it, endA, endB, pa.r, pb.r);
    }
  }
  function addTube(it, a, b, ra, rb) {
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    if (d < 1) return;
    const ux = dx / d, uy = dy / d, t = it.tubes[it.n++];
    t.x1 = a.x + ux * ra * .8; t.y1 = a.y + uy * ra * .8;
    t.x2 = b.x - ux * rb * .8; t.y2 = b.y - uy * rb * .8;
  }

  /* ---------------------------------------------------------- selection */
  function select(atom, dir) {
    clearTimeout(hideTimer);
    if (atom === sel.atom && dir === sel.dir) return;
    if (intro.state === 'waiting') finishIntro(performance.now(), true);
    const now = performance.now(), hop = HOPS[atom], quick = !animate();
    const wasEmpty = sel.atom < 0;
    sel.atom = atom; sel.dir = dir; sel.ring = atom;
    if (intro.state === 'running') intro.relaxing = true;   // the visitor takes over the field
    for (let i = 0; i < N; i++) {
      const d = hop[i], inside = d >= 0 && d <= 2;
      const w = inside ? HOP_WEIGHT[d] : 0, cur = tweenAt(selTw[i], now);
      if (quick) { selTw[i] = { from: w, to: w, t0: now, dur: 1e-3 }; memTw[i] = { from: +inside, to: +inside, t0: now, dur: 1e-3 }; continue; }
      if (w > cur) tweenTo(selTw[i], w, now, d * HOVER_HOP, RISE); else tweenTo(selTw[i], w, now, 0, FALL);
      if (inside) tweenTo(memTw[i], 1, now, d * HOVER_HOP, RISE); else tweenTo(memTw[i], 0, now, 0, FALL);
    }
    setColor(DIRECTIONS[dir].color, now, wasEmpty || quick);
    tweenTo(selAlphaTw, 1, now, 0, quick ? 0 : 200);
    tweenTo(recedeTw, 1, now, 0, quick ? 0 : 220);
    showCard();
    syncLegend();
    requestFrame();
  }

  // restoreFocus: when focus was inside the (now hidden) card, hand it to the
  // direction's legend entry without previewing it again.
  let quietFocus = false;
  function clearSelection({ restoreFocus = true } = {}) {
    clearTimeout(hideTimer);
    if (sel.atom < 0) return;
    const now = performance.now(), quick = !animate();
    const focusInCard = restoreFocus && inspector?.contains(document.activeElement);
    const dir = sel.dir;
    sel.atom = -1; sel.dir = -1; sel.pinned = false;
    selTw.forEach(tw => tweenTo(tw, 0, now, 0, quick ? 0 : FALL));
    tweenTo(selAlphaTw, 0, now, 0, quick ? 0 : FALL);
    tweenTo(recedeTw, 0, now, 0, quick ? 0 : FALL);
    hideCard();
    syncLegend();
    if (focusInCard && legend[dir]) { quietFocus = true; legend[dir].focus({ preventScroll: true }); quietFocus = false; }
    requestFrame();
  }

  function preview(atom, dir = OWNER[atom]) {
    if (sel.pinned) return;
    select(atom, dir);
  }

  function togglePin(atom, dir = OWNER[atom]) {
    if (sel.pinned && sel.atom === atom && sel.dir === dir) { clearSelection(); return; }
    select(atom, dir);
    sel.pinned = true;
    syncPin();
    syncLegend();
    requestFrame();
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    if (sel.pinned || sel.atom < 0) return;
    hideTimer = setTimeout(() => {
      if (sel.pinned || inspector?.matches(':hover') || inspector?.contains(document.activeElement)) return;
      if (hoverHold && pointerAtom === sel.atom) return;     // the pointer is still on the atom
      clearSelection();
    }, HOVER_HIDE);
  }

  /* ------------------------------------------------------------- card */
  function showCard() {
    if (!inspector) return;
    const d = DIRECTIONS[sel.dir];
    inspector.style.setProperty('--thread-color', d.color);
    inspector.style.setProperty('--thread-tint', d.tint);
    card.title.textContent = d.title;
    card.text.textContent = PREVIEWS[sel.dir];
    card.readout.textContent = `${atoms[sel.atom].symbol} · HOP 2 · ${reach2[sel.atom]} ATOMS`;
    card.links.replaceChildren(...d.links.map(([title, destination, meta]) => {
      const a = document.createElement('a'), name = document.createElement('span'), small = document.createElement('small'), arrow = document.createElement('b');
      a.href = destination.startsWith('paper-') ? `#${destination}` : destination;
      if (destination.startsWith('paper-')) a.dataset.openPaper = destination;
      if (destination.startsWith('https:')) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      name.textContent = title; small.textContent = meta; name.append(small); arrow.textContent = '↗';
      a.append(name, arrow);
      a.addEventListener('click', () => clearSelection({ restoreFocus: false }));
      return a;
    }));
    syncPin();
    const opening = inspector.hidden;
    if (opening) inspector.style.visibility = 'hidden';   // measure first, so it never flashes under the pointer
    inspector.hidden = false;
    stage.classList.add('has-inspection');
    cardSize = { w: inspector.offsetWidth, h: inspector.offsetHeight };
    if (opening) {
      cardPos.left = cardPos.top = NaN;
      placeCard();
      inspector.style.removeProperty('visibility');
      if (layout === 'compact') relayout();
    }
  }

  function hideCard() {
    if (!inspector || inspector.hidden) return;
    inspector.hidden = true;
    stage.classList.remove('has-inspection');
    if (layout === 'compact') relayout();
  }

  function syncPin() {
    if (!card) return;
    card.pin.textContent = sel.pinned ? 'Unpin' : 'Pin this view';
    card.pin.setAttribute('aria-pressed', String(sel.pinned));
    card.eyebrow.textContent = sel.pinned ? 'PINNED' : 'PREVIEW';
  }

  // Wide stages: right edge, following the atom vertically, unless that would
  // cover the atom's own neighbours (narrow wide stages), then the freer of the
  // top and bottom slots. Compact stages: in flow below the canvas (CSS).
  function placeCard() {
    if (!inspector || inspector.hidden || sel.atom < 0 || layout === 'compact' || !S.view.f) return;
    const p = S.proj[sel.atom], h = cardSize.h || inspector.offsetHeight;
    const left = Math.round(S.w - cardSize.w - 12), lowest = Math.max(10, S.h - h - 10);
    const hop = HOPS[sel.atom];
    const cover = top => {
      let area = 0;
      for (let i = 0; i < N; i++) {
        if (hop[i] > 1) continue;
        const a = S.proj[i], r = a.r + 4;
        const w = Math.min(a.x + r, S.w) - Math.max(a.x - r, left), v = Math.min(a.y + r, top + h) - Math.max(a.y - r, top);
        if (w > 0 && v > 0) area += w * v;
      }
      return area;
    };
    let top = clamp(p.y - h * .5, 10, lowest);
    if (cover(top) > 0) [10, lowest].forEach(t => { if (cover(t) < cover(top) - 1) top = t; });
    top = Math.round(top);
    if (left !== cardPos.left) inspector.style.left = `${(cardPos.left = left)}px`;
    if (top !== cardPos.top) inspector.style.top = `${(cardPos.top = top)}px`;
  }

  /* ----------------------------------------------------------- legend */
  function syncLegend() {
    legend.forEach((button, i) => {
      const on = i === sel.dir;
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-pressed', String(on && sel.pinned));
    });
  }

  legend.forEach((button, i) => {
    const d = DIRECTIONS[i];
    if (!d) return;
    button.style.setProperty('--dir-color', d.color);
    button.style.setProperty('--dir-tint', d.tint);
    button.setAttribute('aria-pressed', 'false');
    if (inspector) { inspector.id ||= 'molecule-inspector'; button.setAttribute('aria-controls', inspector.id); }
    button.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch' && layout !== 'compact') preview(d.atom, i); });
    button.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch' && layout !== 'compact') scheduleHide(); });
    // Tab from the active legend entry walks into its card, then back out to the next entry.
    button.addEventListener('keydown', e => {
      if (e.key !== 'Tab' || e.shiftKey || !inspector || inspector.hidden || sel.dir !== i) return;
      const first = inspector.querySelector('a[href], button');
      if (first) { e.preventDefault(); first.focus(); }
    });
    button.addEventListener('focus', () => { if (!quietFocus) preview(d.atom, i); });
    button.addEventListener('blur', scheduleHide);
    button.addEventListener('click', () => togglePin(d.atom, i));
  });

  /* ------------------------------------------------------------ input */
  const local = e => {
    rect ||= canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  ['scroll', 'resize'].forEach(type => addEventListener(type, () => { rect = null; }, { passive: true }));

  function hitTest(x, y) {
    let best = -1, bestD = Infinity, bestZ = Infinity;
    for (let i = 0; i < N; i++) {
      const p = S.proj[i];
      if (S.scale[i] < .5) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d > Math.max(p.r + 4, 22)) continue;
      if (d < bestD - .5 || (Math.abs(d - bestD) <= .5 && p.z < bestZ)) { best = i; bestD = d; bestZ = p.z; }
    }
    return best;
  }

  let cursor = '';
  const setCursor = c => { if (c !== cursor) canvas.style.cursor = cursor = c; };
  const inCard = e => !!e.target.closest?.('.molecule-hover-inspector');

  function hover(e) {
    if (gesture || e.pointerType === 'touch') return;
    if (inCard(e)) { clearTimeout(hideTimer); return; }
    const { x, y } = local(e), hit = hitTest(x, y);
    pointerAtom = hit;
    setCursor(hit >= 0 ? 'pointer' : '');
    if (sel.pinned) return;
    if (hit >= 0) preview(hit); else scheduleHide();
  }

  stage.addEventListener('pointerenter', e => {
    rect = null;
    if (e.pointerType !== 'touch') { hoverHold = true; requestFrame(); }
  });
  stage.addEventListener('pointerleave', e => {
    if (e.pointerType === 'touch') return;
    hoverHold = false; pointerAtom = -1; setCursor(''); scheduleHide(); requestFrame();
  });

  stage.addEventListener('pointerdown', e => {
    if (e.button !== 0 || gesture || inCard(e)) return;
    rect = null;
    const { x, y } = local(e);
    gesture = { id: e.pointerId, type: e.pointerType, x0: x, y0: y, x, y, t0: performance.now(), mode: 'pending', dragging: false };
    if (e.pointerType !== 'touch') stage.setPointerCapture?.(e.pointerId);
  });

  stage.addEventListener('pointermove', e => {
    if (!gesture || e.pointerId !== gesture.id) { hover(e); return; }
    const { x, y } = local(e), dx = x - gesture.x0, dy = y - gesture.y0;
    if (gesture.mode === 'pending') {
      const dist = Math.hypot(dx, dy);
      if (gesture.type === 'touch') {
        if (dist < 8) return;
        // Axis lock: rotate only when the swipe is within 30° of horizontal.
        if (Math.atan2(Math.abs(dy), Math.abs(dx)) < Math.PI / 6) { gesture.mode = 'drag'; stage.setPointerCapture?.(e.pointerId); }
        else { gesture.mode = 'scroll'; return; }
      } else if (dist > 4) gesture.mode = 'drag';
      else return;
      gesture.dragging = true;
      stage.classList.add('is-dragging');
      if (sel.atom >= 0 && !sel.pinned) clearSelection();
    }
    if (gesture.mode !== 'drag') return;
    rotateBy((x - gesture.x) * DRAG_RATE, (y - gesture.y) * DRAG_RATE);
    gesture.x = x; gesture.y = y;
  });

  function endGesture(e, cancelled) {
    if (!gesture || e.pointerId !== gesture.id) return;
    const g = gesture; gesture = null;
    stage.classList.remove('is-dragging');
    if (g.dragging) { releaseRotation(); return; }
    if (cancelled || g.mode === 'drag') return;
    const { x, y } = local(e), dist = Math.hypot(x - g.x0, y - g.y0);
    if (g.type === 'touch' && (dist >= 10 || performance.now() - g.t0 >= 300)) return;
    const hit = hitTest(x, y);
    if (hit >= 0) togglePin(hit);
    else if (sel.pinned || g.type === 'touch') clearSelection();
  }
  stage.addEventListener('pointerup', e => endGesture(e, false));
  stage.addEventListener('pointercancel', e => endGesture(e, true));
  stage.addEventListener('lostpointercapture', e => { if (gesture?.dragging && e.pointerId === gesture.id) endGesture(e, true); });

  canvas.addEventListener('keydown', e => {
    const step = { ArrowLeft: [-KEY_STEP.yaw, 0], ArrowRight: [KEY_STEP.yaw, 0], ArrowUp: [0, -KEY_STEP.pitch], ArrowDown: [0, KEY_STEP.pitch] }[e.key];
    if (!step) return;
    e.preventDefault();
    keyHold = true;
    rotateBy(...step);
  });
  canvas.addEventListener('blur', () => { if (keyHold) { keyHold = false; releaseRotation(); } });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || sel.atom < 0 || document.querySelector('dialog[open]')) return;
    e.preventDefault();
    clearSelection();
  });

  if (inspector) {
    inspector.addEventListener('keydown', e => {
      if (e.key !== 'Tab' || sel.dir < 0) return;
      const items = [...inspector.querySelectorAll('a[href], button')];
      const back = e.shiftKey && e.target === items[0], out = !e.shiftKey && e.target === items.at(-1);
      if (!back && !out) return;
      e.preventDefault();
      const entry = legend[sel.dir], next = out ? legend[sel.dir + 1] : entry;
      (next || entry)?.focus();
    });
    inspector.addEventListener('pointerenter', () => clearTimeout(hideTimer));
    inspector.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') scheduleHide(); });
    inspector.addEventListener('focusin', () => clearTimeout(hideTimer));
    inspector.addEventListener('focusout', e => { if (!inspector.contains(e.relatedTarget)) scheduleHide(); });
    card.close?.addEventListener('click', () => clearSelection());
    card.pin?.addEventListener('click', () => {
      sel.pinned = !sel.pinned;
      syncPin(); syncLegend();
      if (!sel.pinned && !inspector.matches(':hover') && !inspector.contains(document.activeElement)) scheduleHide();
      requestFrame();
    });
    new ResizeObserver(entries => {
      const box = entries[0].borderBoxSize?.[0];
      cardSize = box ? { w: box.inlineSize, h: box.blockSize } : { w: inspector.offsetWidth, h: inspector.offsetHeight };
      requestFrame();
    }).observe(inspector);
  }

  // WCAG 2.2.2: the wobble holds while anything in the panel has focus.
  // Mouse focus (a click on the canvas) does not freeze it: hover already does.
  panel.addEventListener('focusin', e => { focusHold = e.target.matches?.(':focus-visible') ?? true; requestFrame(); });
  panel.addEventListener('focusout', e => { if (!panel.contains(e.relatedTarget)) { focusHold = false; requestFrame(); } });

  /* ------------------------------------------------------- environment */
  // The field's caption is printed with the field itself (intro start, or at once).
  const caption = document.createElement('span');
  caption.className = 'molecule-field-label';
  caption.setAttribute('aria-hidden', 'true');
  caption.textContent = 'PROMOLECULAR DENSITY · ILLUSTRATIVE';
  const printCaption = () => { if (!caption.isConnected) (inspector || canvas).before(caption); };

  const hoverNone = matchMedia('(hover: none)');
  function describe() {
    const [text, label] = mq.phone.matches || hoverNone.matches ? LABELS.touch : LABELS.pointer;
    if (instruction) instruction.textContent = text;
    canvas.setAttribute('aria-label', label);
  }
  [mq.phone, hoverNone].forEach(m => m.addEventListener?.('change', describe));
  describe();

  const coarse = () => !mq.fine.matches;
  function resize() {
    const dpr = Math.max(1, Math.min(devicePixelRatio || 1, coarse() ? 1.5 : 2) - dprDrop);
    if (S.w < 32 || S.h < 32) return;
    S.dpr = dpr;
    if (active) sizeRenderer(active);
    if (xfade) sizeRenderer(xfade.to);
    if (fallback && fallback !== active) sizeRenderer(fallback);
    drawCanvases();   // a resized canvas is blank until drawn; card and opacity wait for the ticker
    requestFrame();
  }
  new ResizeObserver(entries => {
    const box = entries[0].contentBoxSize?.[0];
    const w = box ? box.inlineSize : canvas.clientWidth, h = box ? box.blockSize : canvas.clientHeight;
    rect = null;
    if (Math.abs(w - S.w) < .5 && Math.abs(h - S.h) < .5) return;
    S.w = w; S.h = h;
    const next = w >= 500 ? 'wide' : 'compact';
    if (next !== layout) { layout = next; layoutDirty = true; }
    resize();
  }).observe(canvas);
  const watchDpr = () => matchMedia(`(resolution: ${devicePixelRatio || 1}dppx)`).addEventListener?.('change', () => { dprDrop = 0; resize(); watchDpr(); }, { once: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) dprDrop = 0; });
  watchDpr();

  // Layout attribute and card reset are written from the ticker, never from a ResizeObserver.
  function applyLayout() {
    layoutDirty = false;
    stage.dataset.layout = layout;
    cardPos.left = cardPos.top = NaN;
    if (layout === 'compact') { inspector?.style.removeProperty('left'); inspector?.style.removeProperty('top'); }
  }

  watchVisibility(panel, v => { visible = v; if (v) { rect = null; requestFrame(); } });
  document.addEventListener('visibilitychange', () => { if (pageVisible()) requestFrame(); });
  on('motion:paused', () => requestFrame());

  // The intro waits for the hero square to land, then for the panel to be seen.
  function armIntro() {
    let started = false;
    const go = () => {
      if (started) return;
      started = true; off();
      let stop = null;
      stop = watchVisibility(panel, v => { if (v) { stop?.(); startIntro(); } }, { threshold: .15 });
    };
    const off = on('hero:stamped', go);
    if (html.classList.contains('hero-stamped')) go();
  }
  if (!animate() || motionPaused()) finishIntro(performance.now(), true);
  else armIntro();

  return {
    S, model, stage, panel,
    attach, adopt, drop,
    whenIntroDone: fn => (intro.state === 'done' ? fn() : intro.done.push(fn)),
    onReady: fn => listeners.ready.push(fn),
  };
}
