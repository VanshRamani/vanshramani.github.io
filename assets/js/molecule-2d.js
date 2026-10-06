// 2D canvas renderer. A faithful port of the template's drawAtom / drawBond /
// drawContours, plus the in-plane promolecular field. It paints from the first
// frame, plays the intro, and stays on as the fallback when WebGL is missing.
//
// The field is contoured in the molecule's own plane (marching squares on a
// ~6px grid, in Å, chained into polylines) and only re-contoured when its
// weights change (≤30fps while they animate). Every frame just re-projects the
// stored polylines, so rotation costs a few thousand point projections.
import { PALETTE, LOOK, FIELD, levelOf, washAt } from './molecule-core.js';

const css = (c, a = 1) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;
const mix = (c, g, t) => (t <= 0 ? c : [c[0] + (g[0] - c[0]) * t, c[1] + (g[1] - c[1]) * t, c[2] + (g[2] - c[2]) * t]);
const WHITE = [1, 1, 1];

export function create2DRenderer(canvas, model) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const field = createField(model);
  let W = 0, H = 0, sx = 1, sy = 1;
  const G = LOOK.ground;

  function resize(w, h, dpr) {
    W = w; H = h;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    sx = canvas.width / w; sy = canvas.height / h;   // exact CSS px → buffer px, as the GL layer maps it
  }

  function clear() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function render(S) {
    if (W < 32 || H < 32) return;
    clear();
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
    const fade = S.fade2D;
    if (fade > 0) {
      drawShadow(S, fade);
      field.update(S);
      drawField(S, fade);
    }
    for (const it of S.prims) (it.type === 0 ? drawAtom(it) : drawBond(it));
    drawRing(S.ring);
  }

  /* --------------------------------------------------------- shadow */
  // The template's grounded ellipse: radial #6c83c7 .1 → 0, squashed to 18%.
  function drawShadow(S, fade) {
    const a = LOOK.shadowAlpha * S.shadowAlpha * fade;
    if (a < .002) return;
    const cx = S.view.cx, cy = H * .87, R = W * .27;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, css(LOOK.shadow, a)); g.addColorStop(1, css(LOOK.shadow, 0));
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(1, .18); ctx.translate(-cx, -cy);
    ctx.fillStyle = g; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    ctx.restore();
  }

  /* ---------------------------------------------------------- field */
  function drawField(S, fade) {
    const v = S.view;
    if (S.washAlpha * fade > .003 && field.wash) drawWash(v, S.washAlpha * fade * FIELD.wash);
    strokeLevels(field.rest, FIELD.restColor, FIELD.restAlpha, S.restAlpha * fade, v);
    if (S.selAlpha * fade > .003) strokeLevels(field.sel, S.selColor, FIELD.selAlpha, S.selAlpha * fade, v);
  }

  // Each isoline is a chained polyline in the plane; projected per frame and
  // stroked through its edge midpoints so the cell facets never show.
  let XS = new Float32Array(512), YS = new Float32Array(512);
  function strokeLevels(levels, color, alphas, gain, v) {
    const { cY, sY, cP, sP, f, cx, cy } = v;
    ctx.lineWidth = 1; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = css(color);
    for (let k = 1; k <= FIELD.kMax; k++) {
      const lines = levels[k], alpha = alphas[k] * gain;
      if (!lines.length || alpha < .003) continue;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      for (const { pts, closed } of lines) {
        const m = pts.length >> 1;
        if (m > XS.length) { XS = new Float32Array(m * 2); YS = new Float32Array(m * 2); }
        for (let i = 0; i < m; i++) {
          // project() for a point of the molecule's plane (z = 0), inlined
          const x = pts[2 * i], y = pts[2 * i + 1], zz = -x * sY, q = f / (14 + y * sP + zz * cP);
          XS[i] = cx + x * cY * q; YS[i] = cy - (y * cP - zz * sP) * q;
        }
        if (m < 3) { ctx.moveTo(XS[0], YS[0]); ctx.lineTo(XS[m - 1], YS[m - 1]); continue; }
        if (closed) {
          ctx.moveTo((XS[m - 1] + XS[0]) / 2, (YS[m - 1] + YS[0]) / 2);
          for (let i = 0; i < m; i++) { const j = i + 1 < m ? i + 1 : 0; ctx.quadraticCurveTo(XS[i], YS[i], (XS[i] + XS[j]) / 2, (YS[i] + YS[j]) / 2); }
        } else {
          ctx.moveTo(XS[0], YS[0]);
          for (let i = 1; i < m - 1; i++) ctx.quadraticCurveTo(XS[i], YS[i], (XS[i] + XS[i + 1]) / 2, (YS[i] + YS[i + 1]) / 2);
          ctx.lineTo(XS[m - 1], YS[m - 1]);
        }
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // The colour wash is sampled on the plane grid and laid down with the plane's
  // local affine projection: soft enough that the small perspective error never shows.
  function drawWash(v, alpha) {
    const { step, x0, y0, cxp, cyp } = field.grid;
    const P = (x, y) => {
      const zz = -x * v.sY, k = v.f / (14 + y * v.sP + zz * v.cP);
      return [v.cx + x * v.cY * k, v.cy - (y * v.cP - zz * v.sP) * k];
    };
    const c = P(cxp, cyp), ex = P(cxp + 1, cyp), wx = P(cxp - 1, cyp), ey = P(cxp, cyp + 1), wy = P(cxp, cyp - 1);
    const j00 = (ex[0] - wx[0]) / 2, j10 = (ex[1] - wx[1]) / 2, j01 = (ey[0] - wy[0]) / 2, j11 = (ey[1] - wy[1]) / 2;
    const ox = x0 - .5 * step - cxp, oy = y0 - .5 * step - cyp;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.setTransform(sx * j00 * step, sy * j10 * step, sx * j01 * step, sy * j11 * step, sx * (c[0] + j00 * ox + j01 * oy), sy * (c[1] + j10 * ox + j11 * oy));
    ctx.drawImage(field.wash, 0, 0);
    ctx.restore();
  }

  /* ---------------------------------------------------------- atoms */
  function drawAtom(it) {
    const r = it.r;
    if (r < .2) return;
    const c = PALETTE[it.el], t = it.tint, x = it.x, y = it.y;
    const g = ctx.createRadialGradient(x - r * .32, y - r * .38, r * .03, x + r * .12, y + r * .16, r * 1.15);
    g.addColorStop(0, css(mix(c.light, G, t))); g.addColorStop(.38, css(mix(c.base, G, t))); g.addColorStop(1, css(mix(c.dark, G, t)));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = it.el === 3 ? css(mix(LOOK.atomOutlineH, G, t), LOOK.atomOutlineAlphaH) : css(mix(LOOK.atomOutline, G, t), LOOK.atomOutlineAlpha);
    ctx.lineWidth = .7; ctx.stroke();
    ctx.fillStyle = css(mix(WHITE, G, t), LOOK.highlightAlpha);
    ctx.beginPath(); ctx.ellipse(x - r * .29, y - r * .37, r * .12, r * .065, -.6, 0, Math.PI * 2); ctx.fill();
  }

  /* ---------------------------------------------------------- bonds */
  // The template's tube: #6c7b9c outline, an A → #bcc9e3 → B gradient core and a
  // thin white highlight, stroked along the core's tubes.
  function drawBond(it) {
    const t = it.tint, outline = css(mix(LOOK.bondOutline, G, t)), highlight = css(mix(WHITE, G, t), LOOK.bondHighlight);
    const ca = css(mix(PALETTE[it.elA].base, G, t)), cm = css(mix(LOOK.bondMid, G, t)), cb = css(mix(PALETTE[it.elB].base, G, t));
    ctx.lineCap = 'round';
    for (let k = 0; k < it.n; k++) {
      const { x1: ax, y1: ay, x2: bx, y2: by } = it.tubes[k];
      const d = Math.hypot(bx - ax, by - ay), nx = -(by - ay) / d, ny = (bx - ax) / d;
      const gradient = ctx.createLinearGradient(ax, ay, bx, by);
      gradient.addColorStop(0, ca); gradient.addColorStop(.47, cm); gradient.addColorStop(1, cb);
      const x1 = ax + (bx - ax) * it.g0, y1 = ay + (by - ay) * it.g0, x2 = ax + (bx - ax) * it.g1, y2 = ay + (by - ay) * it.g1;
      ctx.strokeStyle = outline; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      // The template offsets the core by (-ny, -nx) * .7; kept for an identical tube.
      ctx.strokeStyle = gradient; ctx.lineWidth = 6.3;
      ctx.beginPath(); ctx.moveTo(x1 - ny * .7, y1 - nx * .7); ctx.lineTo(x2 - ny * .7, y2 - nx * .7); ctx.stroke();
      ctx.strokeStyle = highlight; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x1 + nx * 1.6, y1 + ny * 1.6); ctx.lineTo(x2 + nx * 1.6, y2 + ny * 1.6); ctx.stroke();
    }
  }

  function drawRing(ring) {
    if (ring.alpha < .003) return;
    ctx.strokeStyle = css(ring.color, ring.alpha); ctx.lineWidth = LOOK.ringWidth;
    ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2); ctx.stroke();
  }

  return { kind: '2d', canvas, resize, render, clear, dispose: clear };
}

/* ====================================================================== */
// The plane field: per-atom Gaussians precomputed on a grid in Å, weighted sums
// on demand, and marching squares on L = sqrt(-2 ln rho) for each ring level.
function createField(model) {
  const { atoms, bounds, N } = model;
  const self = { grid: null, rest: levels(), sel: levels(), wash: null };
  const cache = { scale: 0, rest: -1, sel: -1, color: '', restT: 0, selT: 0 };
  let rho = null, L = null, washCtx = null, washData = null;

  function levels() { return Array.from({ length: FIELD.kMax + 1 }, () => []); }

  function build(scale) {
    const step = 6 / scale;
    const [x0, y0, x1, y1] = bounds;
    const cols = Math.ceil((x1 - x0) / step), rows = Math.ceil((y1 - y0) / step);
    const stride = cols + 1, nodes = stride * (rows + 1);
    const gauss = new Float32Array(N * nodes), boxes = [];
    atoms.forEach((a, i) => {
      const reach = Math.sqrt(Math.log(1e5) / a.inv2s2);     // beyond this the Gaussian is < 1e-5
      const i0 = Math.max(0, Math.floor((a.x - reach - x0) / step)), i1 = Math.min(cols, Math.ceil((a.x + reach - x0) / step));
      const j0 = Math.max(0, Math.floor((a.y - reach - y0) / step)), j1 = Math.min(rows, Math.ceil((a.y + reach - y0) / step));
      boxes.push([i0, i1, j0, j1]);
      const z2 = a.z * a.z, base = i * nodes;
      for (let j = j0; j <= j1; j++) {
        const dy = y0 + j * step - a.y;
        for (let k = i0; k <= i1; k++) {
          const dx = x0 + k * step - a.x;
          gauss[base + j * stride + k] = Math.exp(-(dx * dx + dy * dy + z2) * a.inv2s2);
        }
      }
    });
    self.grid = { step, x0, y0, cols, rows, stride, nodes, gauss, boxes, cxp: (x0 + x1) / 2, cyp: (y0 + y1) / 2 };
    rho = new Float32Array(nodes); L = new Float32Array(nodes);
    const wash = document.createElement('canvas');
    wash.width = stride; wash.height = rows + 1;
    washCtx = wash.getContext('2d'); washData = washCtx.createImageData(stride, rows + 1);
    self.wash = null; self.washCanvas = wash;
    cache.rest = cache.sel = -1; cache.color = '';
  }

  function levelField(weights) {
    const { stride, nodes, gauss, boxes } = self.grid;
    rho.fill(0);
    for (let i = 0; i < N; i++) {
      const w = weights[i];
      if (w < 1e-4) continue;
      const [i0, i1, j0, j1] = boxes[i], base = i * nodes;
      for (let j = j0; j <= j1; j++) for (let k = i0, n = j * stride + i0; k <= i1; k++, n++) rho[n] += w * gauss[base + n];
    }
    for (let n = 0; n < nodes; n++) L[n] = levelOf(rho[n]);
  }

  const segPts = levels(), segKeys = levels();
  function contour(out) {
    const { step, x0, y0, cols, rows, stride } = self.grid, D = FIELD.delta, K = FIELD.kMax;
    segPts.forEach(a => { a.length = 0; }); segKeys.forEach(a => { a.length = 0; });
    const lMax = (K + .5) * D;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const n = j * stride + i;
        const v0 = L[n], v1 = L[n + 1], v2 = L[n + stride + 1], v3 = L[n + stride];
        const lo = Math.min(v0, v1, v2, v3), hi = Math.max(v0, v1, v2, v3);
        if (lo > lMax || hi < D) continue;
        const kLo = Math.max(1, Math.floor(lo / D) + 1), kHi = Math.min(K, Math.floor(hi / D));
        const px = x0 + i * step, py = y0 + j * step;
        for (let k = kLo; k <= kHi; k++) {
          const c = k * D, segs = segPts[k], keys = segKeys[k];
          const idx = (v0 < c ? 1 : 0) | (v1 < c ? 2 : 0) | (v2 < c ? 4 : 0) | (v3 < c ? 8 : 0);
          if (idx === 0 || idx === 15) continue;
          // edge crossings: 0 top (v0→v1), 1 right (v1→v2), 2 bottom (v3→v2), 3 left (v0→v3).
          // Keys name the grid edge, so neighbouring cells agree on shared points.
          const e = edge => {
            if (edge === 0) { segs.push(px + step * (c - v0) / (v1 - v0), py); keys.push(n * 2); }
            else if (edge === 1) { segs.push(px + step, py + step * (c - v1) / (v2 - v1)); keys.push((n + 1) * 2 + 1); }
            else if (edge === 2) { segs.push(px + step * (c - v3) / (v2 - v3), py + step); keys.push((n + stride) * 2); }
            else { segs.push(px, py + step * (c - v0) / (v3 - v0)); keys.push(n * 2 + 1); }
          };
          const seg = (a, b) => { e(a); e(b); };
          switch (idx) {
            case 1: case 14: seg(3, 0); break;
            case 2: case 13: seg(0, 1); break;
            case 3: case 12: seg(3, 1); break;
            case 4: case 11: seg(1, 2); break;
            case 6: case 9: seg(0, 2); break;
            case 7: case 8: seg(3, 2); break;
            case 5: case 10: {
              // saddle: decide by the cell centre
              const inside = (v0 + v1 + v2 + v3) / 4 < c;
              if ((idx === 5) === inside) { seg(0, 1); seg(2, 3); } else { seg(3, 0); seg(1, 2); }
              break;
            }
          }
        }
      }
    }
    for (let k = 1; k <= K; k++) out[k] = chain(segKeys[k], segPts[k]);
  }

  // Joins segments that share a grid edge into polylines (closed when they loop).
  function chain(keys, pts) {
    const n = keys.length >> 1, ends = new Map(), used = new Uint8Array(n), lines = [];
    const link = (key, s) => { const list = ends.get(key); if (list) list.push(s); else ends.set(key, [s]); };
    for (let s = 0; s < n; s++) { link(keys[2 * s], s); link(keys[2 * s + 1], s); }
    const next = (key, s) => { const list = ends.get(key); return list.length > 1 ? (list[0] === s ? list[1] : list[0]) : -1; };
    // walk from end `e` of segment s0, collecting the far point of each joined segment
    const walk = (s0, e, out) => {
      let s = s0, key = keys[2 * s0 + e];
      for (;;) {
        const t = next(key, s);
        if (t < 0) return false;
        if (t === s0) return true;
        if (used[t]) return false;
        used[t] = 1;
        const far = keys[2 * t] === key ? 1 : 0;
        out.push(pts[4 * t + 2 * far], pts[4 * t + 2 * far + 1]);
        key = keys[2 * t + far]; s = t;
      }
    };
    for (let s0 = 0; s0 < n; s0++) {
      if (used[s0]) continue;
      used[s0] = 1;
      const fwd = [pts[4 * s0], pts[4 * s0 + 1], pts[4 * s0 + 2], pts[4 * s0 + 3]];
      const closed = walk(s0, 1, fwd);
      if (closed) { fwd.length -= 2; lines.push({ pts: Float32Array.from(fwd), closed }); continue; }
      const back = [];
      walk(s0, 0, back);
      const all = [];
      for (let i = back.length - 2; i >= 0; i -= 2) all.push(back[i], back[i + 1]);
      lines.push({ pts: Float32Array.from(all.concat(fwd)), closed: false });
    }
    return lines;
  }

  function paintWash(color) {
    const { nodes } = self.grid, d = washData.data;
    const r = Math.round(color[0] * 255), g = Math.round(color[1] * 255), b = Math.round(color[2] * 255);
    for (let n = 0, o = 0; n < nodes; n++, o += 4) {
      d[o] = r; d[o + 1] = g; d[o + 2] = b;
      d[o + 3] = Math.round(washAt(L[n]) / FIELD.wash * 255);
    }
    washCtx.putImageData(washData, 0, 0);
    self.wash = self.washCanvas;
  }

  // The wash image stores washAt(L) / FIELD.wash; the renderer scales it by FIELD.wash.
  self.update = S => {
    const scale = S.view.scale, now = performance.now();
    if (!self.grid || Math.abs(scale - cache.scale) > cache.scale * .02) { cache.scale = scale; build(scale); }
    if (S.restVersion !== cache.rest && (S.fieldSettled || now - cache.restT > 32)) {
      levelField(S.restW); contour(self.rest);
      cache.rest = S.restVersion; cache.restT = now;
    }
    const color = S.selColor.map(c => c.toFixed(3)).join();
    if ((S.selVersion !== cache.sel || color !== cache.color) && (S.fieldSettled || now - cache.selT > 32)) {
      levelField(S.selW); contour(self.sel); paintWash(S.selColor);
      cache.sel = S.selVersion; cache.color = color; cache.selT = now;
    }
  };

  return self;
}
