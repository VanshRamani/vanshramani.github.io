// WebGL layer for the caffeine field (Three.js r169, loaded lazily by molecule.js).
//
// Three draw calls, all hand-written GLSL ES 3.00:
//   1. the grounded shadow ellipse (screen space, as the template drew it);
//   2. the promolecular field: a quad in the molecule's own plane, under a camera
//      built from molecule-core's projection, so it rotates with the molecule and
//      turns honestly edge-on. Isolines are antialiased with fwidth at 1 CSS px;
//   3. every atom, bond tube and the selection ring as one instanced impostor
//      pass, in the core's depth-sorted order (identical layering to the 2D canvas).
// Colours are sRGB values written straight to an sRGB canvas: no colour
// management, no tone mapping, no post-processing.
import * as THREE from '../vendor/three.module.min.js';
import { PALETTE, LOOK, FIELD, FOCAL, viewMatrices } from './molecule-core.js';

const MAX_PRIMS = 64;

// Screen-space quads map y-down pixels to y-up clip space, which flips their
// winding, so culling is off for every pass.
const BLEND = {
  transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  glslVersion: THREE.GLSL3,
};

const SCREEN_VERTEX = /* glsl */ `
uniform vec2 uViewport;
vec4 toClip(vec2 px) { return vec4(px.x / uViewport.x * 2. - 1., 1. - px.y / uViewport.y * 2., 0., 1.); }
`;

const COMMON = /* glsl */ `
uniform float uPx;   // device px per CSS px
vec4 over(vec4 dst, vec3 c, float a) { return vec4(c * a, a) + dst * (1. - a); }
// Box-filtered coverage of a filled shape at signed distance sd (CSS px, < 0 inside).
float fillCov(float sd) { return clamp(.5 - sd * uPx, 0., 1.); }
// Coverage of a stroke of width w (CSS px) at distance d from its centre line.
float strokeCov(float d, float w) { float W = w * uPx; return clamp(max(W, 1.) * .5 + .5 - d * uPx, 0., 1.) * min(W, 1.); }
`;

/* ------------------------------------------------------------- shadow */
const shadowVertex = /* glsl */ `precision highp float;
in vec3 position;
uniform vec4 uEllipse;   // centre, radii (CSS px)
out vec2 vQ;
${SCREEN_VERTEX}
void main() { vQ = position.xy; gl_Position = toClip(uEllipse.xy + position.xy * uEllipse.zw); }`;
const shadowFragment = /* glsl */ `precision highp float;
in vec2 vQ;
uniform vec3 uColor;
uniform float uAlpha;
out vec4 fragColor;
void main() { float a = uAlpha * max(0., 1. - length(vQ)); fragColor = vec4(uColor * a, a); }`;

/* -------------------------------------------------------------- field */
const fieldVertex = /* glsl */ `precision highp float;
in vec3 position;
uniform mat4 modelViewMatrix, projectionMatrix;
out vec2 vPlane;
void main() { vPlane = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;

const fieldFragment = n => /* glsl */ `precision highp float;
#define N ${n}
in vec2 vPlane;
uniform vec4 uAtom[N];      // x, y, z², 1 / 2σ²
uniform vec4 uWeight[N];    // rest weight, selection weight
uniform vec3 uRestColor, uSelColor;
uniform float uRestGain, uSelGain, uWashGain;
uniform float uRestA[8], uSelA[8];
uniform float uDelta, uWash, uWashFrom, uWashTo;
uniform vec4 uBounds;
out vec4 fragColor;
${COMMON}
float level(float rho) { return sqrt(max(0., -2. * log(max(rho, 1e-6)))); }
// One CSS px isolines at L = kΔ. gw is |∇(L/Δ)| per device px.
float isoline(float L, float gw) {
  float g = L / uDelta, k = floor(g + .5);
  float d = abs(g - k) / max(gw, 1e-4);
  float cov = clamp(.5 * uPx + .5 - d, 0., 1.);
  cov *= 1. - smoothstep(.35, .7, gw);     // well centres: rings closer than ~2 device px
  cov *= smoothstep(.0005, .003, gw);      // plateaus
  return cov * step(k, 7.5);
}
void main() {
  float rest = 0., sel = 0.;
  for (int i = 0; i < N; i++) {
    vec2 d = vPlane - uAtom[i].xy;
    float g = exp(-(dot(d, d) + uAtom[i].z) * uAtom[i].w);
    rest += uWeight[i].x * g;
    sel += uWeight[i].y * g;
  }
  float Lr = level(rest), Ls = level(sel);
  float gr = length(vec2(dFdx(Lr), dFdy(Lr))) / uDelta;
  float gs = length(vec2(dFdx(Ls), dFdy(Ls))) / uDelta;
  int kr = int(clamp(floor(Lr / uDelta + .5), 0., 7.)), ks = int(clamp(floor(Ls / uDelta + .5), 0., 7.));
  float edge = min(min(vPlane.x - uBounds.x, uBounds.z - vPlane.x), min(vPlane.y - uBounds.y, uBounds.w - vPlane.y));
  edge = smoothstep(0., .8, edge);
  vec4 c = vec4(uSelColor, 1.) * (uWash * (1. - smoothstep(uWashFrom, uWashTo, Ls)) * uWashGain);
  c = over(c, uRestColor, uRestA[kr] * uRestGain * isoline(Lr, gr));
  c = over(c, uSelColor, uSelA[ks] * uSelGain * isoline(Ls, gs));
  fragColor = c * edge;
}`;

/* --------------------------------------------- atoms, bonds and the ring */
const primVertex = /* glsl */ `precision highp float;
in vec3 position;
in vec4 iA, iB, iC, iD;
out vec2 vPx;
flat out vec4 vA, vB, vC, vD;
${SCREEN_VERTEX}
void main() {
  vec2 px;
  if (iB.x < .5) {                                  // atom: centre, radius
    px = iA.xy + position.xy * (iA.z + 2.);
  } else if (iB.x < 1.5) {                          // bond tube: P1 → P2, visible g0..g1
    vec2 d = iA.zw - iA.xy;
    float len = length(d);
    vec2 u = len > 1e-4 ? d / len : vec2(1., 0.), n = vec2(-u.y, u.x);
    vec2 a = mix(iA.xy, iA.zw, iC.x), b = mix(iA.xy, iA.zw, iC.y);
    px = (a + b) * .5 + u * position.x * (length(b - a) * .5 + 6.) + n * position.y * 6.5;
  } else {                                          // selection ring: centre, radius, width
    px = iA.xy + position.xy * (iA.z + iA.w + 2.);
  }
  vPx = px; vA = iA; vB = iB; vC = iC; vD = iD;
  gl_Position = toClip(px);
}`;

const primFragment = /* glsl */ `precision highp float;
in vec2 vPx;
flat in vec4 vA, vB, vC, vD;
uniform vec3 uLight[4], uBase[4], uDark[4];
uniform vec3 uGround, uBondOutline, uBondMid, uAtomOutline, uAtomOutlineH;
uniform float uAtomOutlineA, uAtomOutlineAH, uHighlightA, uBondHighlightA;
out vec4 fragColor;
${COMMON}
float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0., 1.);
  return length(pa - ba * h);
}
// The template's createRadialGradient(c0, r0, c1, r1), solved as canvas does:
// the largest ω with p on the circle lerp(c0, c1, ω), lerp(r0, r1, ω).
vec3 atomGradient(vec2 p, vec2 c, float r, int el) {
  vec2 c0 = c + vec2(-.32, -.38) * r, c1 = c + vec2(.12, .16) * r;
  float r0 = .03 * r, dr = 1.12 * r;
  vec2 cd = c1 - c0, q = p - c0;
  float A = dot(cd, cd) - dr * dr, B = dot(q, cd) + r0 * dr, C = dot(q, q) - r0 * r0;
  float w = clamp((B - sqrt(max(B * B - A * C, 0.))) / A, 0., 1.);
  return w < .38 ? mix(uLight[el], uBase[el], w / .38) : mix(uBase[el], uDark[el], (w - .38) / .62);
}
vec4 atom(vec2 p) {
  vec2 c = vA.xy; float r = vA.z; int el = int(vB.y + .5);
  float d = length(p - c);
  vec4 col = vec4(atomGradient(p, c, r, el), 1.) * fillCov(d - r);
  bool h = el == 3;
  col = over(col, h ? uAtomOutlineH : uAtomOutline, (h ? uAtomOutlineAH : uAtomOutlineA) * strokeCov(abs(d - r), .7));
  // specular: ellipse(c - (.29r, .37r), .12r × .065r, rotation -.6)
  vec2 e = p - (c + vec2(-.29, -.37) * r), R = vec2(.12, .065) * r;
  vec2 q = vec2(cos(.6) * e.x - sin(.6) * e.y, sin(.6) * e.x + cos(.6) * e.y) / R;
  float k = length(q);
  float sd = (k - 1.) * k / max(length(q / R), 1e-4);
  return over(col, vec3(1.), uHighlightA * fillCov(sd));
}
vec4 bond(vec2 p) {
  vec2 P1 = vA.xy, P2 = vA.zw, d = P2 - P1;
  float len2 = max(dot(d, d), 1e-6);
  vec2 u = d / sqrt(len2), n = vec2(-u.y, u.x);
  vec2 a = mix(P1, P2, vC.x), b = mix(P1, P2, vC.y);
  int ea = int(vB.y + .5), eb = int(vB.z + .5);
  vec4 col = vec4(uBondOutline, 1.) * fillCov(segDist(p, a, b) - 4.5);
  vec2 o = vec2(-n.y, -n.x) * .7;                    // the template's core offset
  float t = clamp(dot(p - P1, d) / len2, 0., 1.);
  vec3 g = t < .47 ? mix(uBase[ea], uBondMid, t / .47) : mix(uBondMid, uBase[eb], (t - .47) / .53);
  col = over(col, g, fillCov(segDist(p, a + o, b + o) - 3.15));
  vec2 hl = n * 1.6;
  return over(col, vec3(1.), uBondHighlightA * strokeCov(segDist(p, a + hl, b + hl), 1.4));
}
void main() {
  vec4 col;
  if (vB.x < .5) col = atom(vPx);
  else if (vB.x < 1.5) col = bond(vPx);
  else col = vec4(vD.rgb, 1.) * strokeCov(abs(length(vPx - vA.xy) - vA.z), vA.w);
  col.rgb = mix(col.rgb, uGround * col.a, vB.w);     // recede / depth tint toward the panel
  fragColor = col * vC.z;
}`;

/* ==================================================================== */
export async function createGLRenderer(canvas, gl, model) {
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  let shaderError = false;
  renderer.debug.onShaderError = () => { shaderError = true; };
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  camera.matrixAutoUpdate = false;
  camera.matrix.makeTranslation(0, 0, -FOCAL);       // so the view matrix is +FOCAL along depth
  camera.matrixWorldNeedsUpdate = true;
  const group = new THREE.Group();
  group.matrixAutoUpdate = false;
  scene.add(group);

  const quad = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    return g;
  };
  const flat3 = list => new Float32Array(list.flat());
  const N = model.N;

  /* 1. shadow */
  const shadow = new THREE.Mesh(quad(), new THREE.RawShaderMaterial({
    ...BLEND, vertexShader: shadowVertex, fragmentShader: shadowFragment,
    uniforms: { uViewport: { value: [1, 1] }, uEllipse: { value: [0, 0, 1, 1] }, uColor: { value: LOOK.shadow }, uAlpha: { value: 0 } },
  }));

  /* 2. field quad, in the molecule's plane */
  const [x0, y0, x1, y1] = model.bounds;
  const fieldGeo = new THREE.BufferGeometry();
  fieldGeo.setAttribute('position', new THREE.Float32BufferAttribute([x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0], 3));
  fieldGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const atomData = new Float32Array(N * 4), weights = new Float32Array(N * 4);
  model.atoms.forEach((a, i) => atomData.set([a.x, a.y, a.z * a.z, a.inv2s2], i * 4));
  const fieldMat = new THREE.RawShaderMaterial({
    ...BLEND, vertexShader: fieldVertex, fragmentShader: fieldFragment(N),
    uniforms: {
      uAtom: { value: atomData }, uWeight: { value: weights },
      uRestColor: { value: FIELD.restColor }, uSelColor: { value: [0, 0, 0] },
      uRestGain: { value: 1 }, uSelGain: { value: 0 }, uWashGain: { value: 0 },
      uRestA: { value: Float32Array.from(FIELD.restAlpha) }, uSelA: { value: Float32Array.from(FIELD.selAlpha) },
      uDelta: { value: FIELD.delta }, uWash: { value: FIELD.wash }, uWashFrom: { value: FIELD.washFrom }, uWashTo: { value: FIELD.washTo },
      uBounds: { value: model.bounds }, uPx: { value: 1 },
    },
  });
  const field = new THREE.Mesh(fieldGeo, fieldMat);
  group.add(field);

  /* 3. instanced primitives */
  const prims = new THREE.InstancedBufferGeometry();
  prims.setAttribute('position', quad().getAttribute('position'));
  prims.setIndex([0, 1, 2, 0, 2, 3]);
  const inst = ['iA', 'iB', 'iC', 'iD'].map(name => {
    const attr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PRIMS * 4), 4);
    attr.setUsage(THREE.DynamicDrawUsage);
    prims.setAttribute(name, attr);
    return attr;
  });
  prims.instanceCount = 0;
  const primMat = new THREE.RawShaderMaterial({
    ...BLEND, vertexShader: primVertex, fragmentShader: primFragment,
    uniforms: {
      uViewport: { value: [1, 1] }, uPx: { value: 1 },
      uLight: { value: flat3(PALETTE.map(p => p.light)) }, uBase: { value: flat3(PALETTE.map(p => p.base)) }, uDark: { value: flat3(PALETTE.map(p => p.dark)) },
      uGround: { value: LOOK.ground }, uBondOutline: { value: LOOK.bondOutline }, uBondMid: { value: LOOK.bondMid },
      uAtomOutline: { value: LOOK.atomOutline }, uAtomOutlineH: { value: LOOK.atomOutlineH },
      uAtomOutlineA: { value: LOOK.atomOutlineAlpha }, uAtomOutlineAH: { value: LOOK.atomOutlineAlphaH },
      uHighlightA: { value: LOOK.highlightAlpha }, uBondHighlightA: { value: LOOK.bondHighlight },
    },
  });
  const primMesh = new THREE.Mesh(prims, primMat);

  [shadow, field, primMesh].forEach((mesh, i) => { mesh.frustumCulled = false; mesh.renderOrder = i; });
  scene.add(shadow, primMesh);

  let W = 1, H = 1;
  function resize(w, h, dpr) {
    W = w; H = h;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    const px = canvas.width / w;
    shadow.material.uniforms.uViewport.value = [w, h];
    primMat.uniforms.uViewport.value = [w, h];
    primMat.uniforms.uPx.value = px;
    fieldMat.uniforms.uPx.value = px;
  }

  function writePrims(S) {
    const [A, B, C, D] = inst.map(a => a.array);
    let n = 0;
    const put = (a, b, c, d) => { if (n >= MAX_PRIMS) return; const o = n * 4; A.set(a, o); B.set(b, o); C.set(c, o); D.set(d, o); n++; };
    for (const it of S.prims) {
      if (it.type === 0) { if (it.r >= .2) put([it.x, it.y, it.r, 0], [0, it.el, 0, it.tint], [0, 0, 1, 0], [0, 0, 0, 0]); continue; }
      // the core's tubes, exactly as the 2D renderer strokes them
      for (let k = 0; k < it.n; k++) {
        const t = it.tubes[k];
        put([t.x1, t.y1, t.x2, t.y2], [1, it.elA, it.elB, it.tint], [it.g0, it.g1, 1, 0], [0, 0, 0, 0]);
      }
    }
    const ring = S.ring;
    if (ring.alpha >= .003) put([ring.x, ring.y, ring.r, LOOK.ringWidth], [2, 0, 0, 0], [0, 0, ring.alpha, 0], [...ring.color, 0]);
    prims.instanceCount = n;
    inst.forEach(a => { a.clearUpdateRanges(); a.addUpdateRange(0, n * 4); a.needsUpdate = true; });
  }

  function render(S) {
    if (W < 32 || H < 32) return;
    const m = viewMatrices(S.view);
    camera.projectionMatrix.set(...m.projection);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    group.matrix.set(...m.rotation);
    group.matrixWorldNeedsUpdate = true;

    const su = shadow.material.uniforms;
    su.uEllipse.value = [S.view.cx, H * .87, W * .27, W * .27 * .18];
    su.uAlpha.value = LOOK.shadowAlpha * S.shadowAlpha;

    const fu = fieldMat.uniforms;
    for (let i = 0; i < N; i++) { weights[i * 4] = S.restW[i]; weights[i * 4 + 1] = S.selW[i]; }
    fu.uSelColor.value = S.selColor.slice();
    fu.uRestGain.value = S.restAlpha;
    fu.uSelGain.value = S.selAlpha;
    fu.uWashGain.value = S.washAlpha;

    writePrims(S);
    renderer.render(scene, camera);
  }

  function dispose() {
    [shadow, field, primMesh].forEach(mesh => { mesh.geometry.dispose(); mesh.material.dispose(); });
    renderer.dispose();
    canvas.remove();
  }

  // Compile off the critical path, then prove a frame renders before anyone sees it.
  await renderer.compileAsync(scene, camera);
  if (shaderError) throw new Error('molecule: shader compile failed');

  return {
    kind: 'gl', canvas, resize, render, dispose,
    clear: () => renderer.clear(),
    verify() { if (shaderError || gl.isContextLost()) throw new Error('molecule: WebGL frame failed'); },
  };
}
