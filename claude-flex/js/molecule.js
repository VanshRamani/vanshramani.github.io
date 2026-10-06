// The caffeine field: "see what a graph neural network sees".
//
// molecule-core.js owns state, input, picking, the card and the legend;
// molecule-2d.js paints from the first frame and plays the intro. Once the
// intro is done and the panel is in view, an idle callback probes WebGL2 and
// lazily loads molecule-gl.js (and Three.js), which compiles off the critical
// path and crossfades in over the 2D canvas at identical framing. Any GL
// failure, or a lost context, leaves (or returns) the page on the 2D canvas.
// ?gl=off forces the 2D canvas; ?gl=force skips the performance-caveat check.
import { emit, onceVisible } from './core.js';
import { createMolecule } from './molecule-core.js';
import { create2DRenderer } from './molecule-2d.js';

const idle = fn => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 200));

export function init() {
  const canvas = document.getElementById('molecule-canvas');
  const data = window.VANSH_MOLECULE;
  if (!canvas || !data?.atoms?.length) return;
  let molecule;
  try {
    molecule = createMolecule(canvas, data);
    molecule.attach(create2DRenderer(canvas, molecule.model));
  } catch (error) {
    showFallback(canvas);
    throw error;
  }
  emit('molecule:ready', { renderer: '2d' });
  molecule.onReady(renderer => emit('molecule:ready', { renderer: renderer.kind }));

  const mode = new URLSearchParams(location.search).get('gl');
  if (mode === 'off') return;
  molecule.whenIntroDone(() => onceVisible(molecule.panel, () => idle(() => startGL(molecule, canvas, mode === 'force'))));
}

async function startGL(molecule, canvas, force) {
  const glCanvas = document.createElement('canvas');
  glCanvas.className = 'molecule-gl';
  glCanvas.setAttribute('aria-hidden', 'true');
  let gl = null;
  try {
    gl = glCanvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, failIfMajorPerformanceCaveat: !force });
  } catch { gl = null; }
  if (!gl) return;                               // no WebGL2, or only a software one: stay 2D
  let renderer = null;
  try {
    const { createGLRenderer } = await import('./molecule-gl.js');
    renderer = await createGLRenderer(glCanvas, gl, molecule.model);
    glCanvas.addEventListener('webglcontextlost', () => molecule.drop(renderer), { once: true });
    canvas.after(glCanvas);
    molecule.adopt(renderer);
  } catch {
    if (renderer) molecule.drop(renderer); else glCanvas.remove();
  }
}

// If the module itself cannot run, show the template's static drawing instead of an empty panel.
function showFallback(canvas) {
  if (canvas.parentElement.querySelector('.molecule-fallback')) return;
  const img = new Image(600, 362);
  img.className = 'molecule-fallback';
  img.src = '../images/caffeine-fallback.svg';
  img.alt = 'Ball-and-stick molecular model of caffeine';
  canvas.replaceWith(img);
}
