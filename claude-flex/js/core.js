// Shared runtime for every claude-flex module: media queries, the GSAP/Lenis
// scroll engine, a single animation ticker, a tiny event bus, the global
// pause-motion state, visibility helpers and text splitting.
//
// Rules every module follows:
//  • gsap.ticker is the only requestAnimationFrame owner (use addTicker()).
//  • Never pre-hide content at load. Arm tweens lazily when an element enters,
//    and use fromTo() so a crashed module leaves content visible.
//  • Anything CSS hides must be gated by `html.motion:not(.motion-failed)`.
//  • After any layout change (inline SVG swap, expand, filter) call relayout().
//  • Never tween transforms on a modal <dialog> with GSAP: its transform parser re-parents
//    the element to measure it, which drops a modal out of the top layer. Animate an inner
//    wrapper, or use the Web Animations API.

export const html = document.documentElement;

export const mq = {
  reduced: matchMedia('(prefers-reduced-motion: reduce)'),
  fine: matchMedia('(hover: hover) and (pointer: fine)'),
  phone: matchMedia('(max-width: 760px)'),
};

export const gsap = window.gsap || null;
export const ScrollTrigger = window.ScrollTrigger || null;
if (gsap && ScrollTrigger) {
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });
}

/** True when animation is allowed and the motion libraries loaded (fixed at load). */
export const motion = !mq.reduced.matches && !!gsap && !!ScrollTrigger;

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const mapRange = (v, a, b, c, d) => c + ((v - a) / (b - a)) * (d - c);
export const debounce = (fn, ms = 120) => { let t = 0; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; };

/* ---------------------------------------------------------------- events */
export const bus = new EventTarget();
export const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));
export const on = (type, fn) => {
  const handler = event => fn(event.detail);
  bus.addEventListener(type, handler);
  return () => bus.removeEventListener(type, handler);
};

/* ------------------------------------------------------------ the ticker */
/** Subscribe fn(timeSeconds, deltaMs) to the one shared frame loop. Returns an unsubscribe. */
export function addTicker(fn) {
  if (gsap) {
    const cb = (time, delta) => fn(time, delta);
    gsap.ticker.add(cb);
    return () => gsap.ticker.remove(cb);
  }
  let raf = 0, last = performance.now();
  const loop = now => { fn(now / 1000, now - last); last = now; raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(raf);
}

/* ------------------------------------------------- global pause motion */
// WCAG 2.2.2: one control stops everything that moves on its own
// (news rotation, molecule wobble, ramAIn demo, poster autoplay, contour drift).
// User-initiated motion (hover, drag, clicks) still works while paused.
const PAUSE_KEY = 'claude-flex:motion-paused';
let paused = false;
try { paused = localStorage.getItem(PAUSE_KEY) === '1'; } catch { /* storage unavailable */ }
export const motionPaused = () => paused || mq.reduced.matches;
export function setMotionPaused(value) {
  paused = !!value;
  try { localStorage.setItem(PAUSE_KEY, paused ? '1' : '0'); } catch { /* ignore */ }
  html.classList.toggle('motion-paused', paused);
  emit('motion:paused', paused);
}
html.classList.toggle('motion-paused', paused);
mq.reduced.addEventListener?.('change', () => emit('motion:paused', motionPaused()));

/* ---------------------------------------------------------------- scroll */
export let lenis = null;

export function navOffset() {
  const nav = document.querySelector('.nav');
  return (nav ? nav.getBoundingClientRect().height : 0) + 8;
}

/** True while the page is actively scrolling (used to ignore hover during scroll). */
let lastScroll = 0;
addEventListener('scroll', () => { lastScroll = performance.now(); }, { passive: true });
// Lenis 1.1.13 can leave isScrolling stuck on 'native' after a zero-delta scroll, so only trust 'smooth'.
export const isScrolling = () => lenis?.isScrolling === 'smooth' || performance.now() - lastScroll < 140;

export function initScroll() {
  // Smooth scrolling is a desktop refinement. Touch and reduced motion stay native.
  if (motion && window.Lenis && mq.fine.matches) {
    lenis = new window.Lenis({ lerp: 0.14, smoothWheel: true, wheelMultiplier: 1, syncTouch: false });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(time => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  // In-page anchors go through one path so Lenis and native scrolling agree.
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href^="#"]');
    if (!link || link.hasAttribute('data-open-paper')) return;
    const id = link.getAttribute('href').slice(1);
    const target = id ? document.getElementById(id) : null;
    if (!target) return;
    event.preventDefault();
    scrollToEl(id === 'main' ? 0 : target);
    history.replaceState(null, '', id === 'main' ? location.pathname : `#${id}`);
    focusWithoutScroll(target);
  });
  // A debounced refresh keeps ScrollTrigger honest as layout settles.
  if ('ResizeObserver' in window) new ResizeObserver(relayout).observe(document.querySelector('main') || document.body);
}

export function focusWithoutScroll(target) {
  if (!target || target === document.body) return;
  if (!target.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|SUMMARY|DETAILS|TEXTAREA|SELECT)$/.test(target.tagName)) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
}

export function scrollToEl(target, { offset, immediate = false } = {}) {
  const off = offset ?? -navOffset();
  const instant = immediate || mq.reduced.matches;
  if (lenis) {
    lenis.scrollTo(target, { offset: typeof target === 'number' ? 0 : off, immediate: instant, duration: 1.1, easing: t => 1 - Math.pow(1 - t, 4) });
    return;
  }
  const y = typeof target === 'number' ? target : target.getBoundingClientRect().top + scrollY + off;
  scrollTo({ top: y, behavior: instant ? 'instant' : 'smooth' });
  if (!instant && typeof target !== 'number') resumeIfInterrupted(target, off);
}

// A ScrollTrigger.refresh() (from relayout) restores scroll positions and so cancels a
// native smooth scroll in flight. Re-issue it until it lands, unless the user takes over.
function resumeIfInterrupted(target, off) {
  const takeover = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
  const capture = { passive: true, capture: true };
  let tries = 0, pending = 0;
  const arrived = () => Math.abs(target.getBoundingClientRect().top + off) <= 2;
  const stop = () => {
    clearTimeout(timer); clearTimeout(pending);
    ScrollTrigger?.removeEventListener('refresh', resume);
    removeEventListener('scrollend', resume);
    takeover.forEach(type => removeEventListener(type, stop, capture));
  };
  const resume = () => {
    clearTimeout(pending);
    pending = setTimeout(() => {
      if (arrived()) stop();
      else if (tries++ < 4) scrollTo({ top: target.getBoundingClientRect().top + scrollY + off, behavior: 'smooth' });
    }, 60);
  };
  const timer = setTimeout(stop, 2500);
  ScrollTrigger?.addEventListener('refresh', resume);
  addEventListener('scrollend', resume);
  takeover.forEach(type => addEventListener(type, stop, capture));
}

/** Freeze page scroll while a dialog or overlay owns the screen. */
let lockCount = 0;
export function lockScroll() {
  if (lockCount++ === 0) { lenis?.stop(); html.classList.add('scroll-locked'); }
}
export function unlockScroll() {
  if (lockCount === 0) return;
  if (--lockCount === 0) { lenis?.start(); html.classList.remove('scroll-locked'); }
}

/** Debounced ScrollTrigger.refresh() — call after anything changes layout. */
export const relayout = debounce(() => ScrollTrigger?.refresh(), 150);

/* ------------------------------------------------------------ visibility */
/** Calls cb(true|false, entry) whenever el enters/leaves. Returns a disposer. */
export function watchVisibility(el, cb, { rootMargin = '0px', threshold = 0 } = {}) {
  if (!('IntersectionObserver' in window)) { cb(true); return () => {}; }
  const io = new IntersectionObserver(entries => entries.forEach(entry => cb(entry.isIntersecting, entry)), { rootMargin, threshold });
  io.observe(el);
  return () => io.disconnect();
}

/** Calls cb once, the first time el comes within rootMargin of the viewport. */
export function onceVisible(el, cb, { rootMargin = '0px', threshold = 0 } = {}) {
  let done = false;
  const stop = watchVisibility(el, visible => {
    if (visible && !done) { done = true; stop(); cb(); }
  }, { rootMargin, threshold });
  return stop;
}

/** True while the document is visible (tab focused). */
export const pageVisible = () => document.visibilityState !== 'hidden';

/** Viewport too small for motion setup (the Browser pane can load at a tiny size). */
export const viewportTooSmall = () => innerWidth < 64 || innerHeight < 64;

/* ---------------------------------------------------------- text splitting */
const measureCtx = document.createElement('canvas').getContext('2d');

/**
 * Splits an element's text into masked word spans (and optionally char spans),
 * keeping the original text available to assistive technology.
 * Char splitting compensates for kerning lost between adjacent glyphs.
 * Returns { words: HTMLElement[], chars: HTMLElement[] }.
 */
export function splitText(el, { chars = false } = {}) {
  if (el.dataset.split) return { words: [...el.querySelectorAll('.split-word')], chars: [...el.querySelectorAll('.split-char')] };
  el.dataset.split = chars ? 'chars' : 'words';
  const words = [], letters = [];
  const style = getComputedStyle(el);
  measureCtx.font = `${style.fontWeight} 100px ${style.fontFamily}`;
  const kern = (a, b) => (measureCtx.measureText(a + b).width - measureCtx.measureText(a).width - measureCtx.measureText(b).width) / 100;
  const label = el.textContent.replace(/\s+/g, ' ').trim();
  const walk = node => {
    [...node.childNodes].forEach(child => {
      if (child.nodeType === 3) {
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.append(document.createTextNode(' ')); return; }
          const mask = document.createElement('span'); mask.className = 'split-mask'; mask.setAttribute('aria-hidden', 'true');
          const word = document.createElement('span'); word.className = 'split-word';
          if (chars) {
            [...part].forEach((ch, i, arr) => {
              const c = document.createElement('span'); c.className = 'split-char'; c.textContent = ch;
              if (i < arr.length - 1) { const k = kern(ch, arr[i + 1]); if (Math.abs(k) > 0.001) c.style.marginRight = `${k}em`; }
              word.append(c); letters.push(c);
            });
          } else word.textContent = part;
          mask.append(word); frag.append(mask); words.push(word);
        });
        child.replaceWith(frag);
      } else if (child.nodeType === 1 && !child.classList.contains('sq') && !child.classList.contains('sr-only') && child.getAttribute('aria-hidden') !== 'true') walk(child);
    });
  };
  walk(el);
  if (!el.querySelector('.sr-only')) { const sr = document.createElement('span'); sr.className = 'sr-only'; sr.textContent = label; el.prepend(sr); }
  return { words, chars: letters };
}
