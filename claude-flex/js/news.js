// News banner: the original rotating announcement, every 8s, with a mask-slide
// (the current story leaves upward as the next rises from below). The first
// rotation waits 8s, so nothing above the hero moves during the intro.
// Pauses on hover, keyboard focus, off-screen, hidden tabs and the global
// pause; reduced motion keeps the latest story static. No announcements.
import { gsap, mq, on, motionPaused, watchVisibility, pageVisible } from './core.js';

// The original js/news.js entries, verbatim.
const ENTRIES = [
  { id: 'sc3', date: '2026', summary: 'SC³ accepted at NeurIPS 2026.' },
  { id: 'yc', date: 'NOV 2025', summary: 'Accepted into Y Combinator — building ramAIn, YC W26.' },
  { id: 'panorama', date: 'OCT 2025', summary: 'Panorama: Fast-Track Nearest Neighbors submitted to arXiv.' },
  { id: 'ddsa', date: 'AUG 2025', summary: 'Received a Danish Data Science Academy Scholarship for research at Copenhagen.' },
  { id: 'cmu', date: 'JUL 2025', summary: 'Completed a research internship at Carnegie Mellon’s RAIL group.' },
  { id: 'raf', date: 'MAY 2025', summary: 'Received IIT Delhi’s Research Acceleration Fund grant for ICLR 2025.' },
  { id: 'bronstein', date: 'APR 2025', summary: 'Presented Bonsai to Michael Bronstein at ICLR 2025 in Singapore.' },
  { id: 'bonsai', date: 'FEB 2025', summary: 'Bonsai accepted at ICLR 2025.' },
  { id: 'lam', date: 'DEC 2024', summary: 'Pi Propulsion won the Lam Research Challenge — ₹5,00,000 prize.' },
  { id: 'acs-talk', date: 'NOV 2024', summary: 'Spoke at the ACS × BioPractify Students Journal Club on AI.' },
  { id: 'goldman', date: 'NOV 2024', summary: 'Placed fourth nationally at the Goldman Sachs India Hackathon.' },
  { id: 'citadel', date: 'SEP 2024', summary: 'Won first place in Citadel’s Quants Arena Challenge.' },
  { id: 'molmerger', date: 'JUL 2024', summary: 'First-author molecular learning paper published in ACS JCTC.' },
];

const INTERVAL = 8000;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** SC3's announcement has a confirmed conference year, without an invented month. */
function machineDate(text) {
  const month = MONTHS.indexOf(text.slice(0, 3));
  return month < 0 ? text : `${text.slice(-4)}-${String(month + 1).padStart(2, '0')}`;
}

export function init() {
  const banner = document.querySelector('.news-banner');
  const content = banner?.querySelector('.news-banner-content');
  const story = banner?.querySelector('.news-banner-story');
  const date = banner?.querySelector('.news-banner-date');
  if (!content || !story) return;

  // The mask is the whole strip, so lines enter and leave at the banner's own
  // edges; ghosts are placed against it, so re-centred content never moves them.
  const mask = content.parentElement || banner;
  content.setAttribute('aria-atomic', 'true');
  mask.style.position = 'relative';

  let index = Math.max(0, ENTRIES.findIndex(entry => story.getAttribute('href')?.endsWith(`#news-${entry.id}`)));
  let timer = 0, hovering = false, focused = false, visible = true;
  let slide = null; // the in-flight transition, finished early if another one starts

  const canRotate = () => !motionPaused() && !hovering && !focused && visible && pageVisible();

  function schedule() {
    // Auto-rotation never announces; a paused or focused banner may.
    content.setAttribute('aria-live', motionPaused() || focused ? 'polite' : 'off');
    clearTimeout(timer);
    if (canRotate()) timer = setTimeout(() => { show(index + 1); schedule(); }, INTERVAL);
  }

  function apply(entry) {
    story.textContent = entry.summary;
    story.href = `../content/news.html#news-${entry.id}`;
    if (date) { date.textContent = entry.date; date.dateTime = machineDate(entry.date); }
  }

  /**
   * A decorative, inert copy of what is leaving, laid exactly over the original.
   * Fractional rects, not offset*: a width rounded down would re-wrap the copy.
   */
  function ghostOf(el, box) {
    const rect = el.getBoundingClientRect();
    const ghost = el.cloneNode(true);
    ghost.removeAttribute('href');
    ghost.removeAttribute('datetime');
    ghost.setAttribute('aria-hidden', 'true');
    Object.assign(ghost.style, {
      position: 'absolute', left: `${rect.left - box.left}px`, top: `${rect.top - box.top}px`,
      width: `${rect.width + 0.5}px`, margin: '0', pointerEvents: 'none',
    });
    return ghost;
  }

  function finishSlide() {
    slide?.progress(1);
    slide = null;
  }

  function show(next) {
    index = next % ENTRIES.length;
    const entry = ENTRIES[index];
    if (!gsap || mq.reduced.matches || mask.offsetHeight < 1) { apply(entry); return; }
    finishSlide();
    const parts = [story, date].filter(el => el && el.getClientRects().length);
    const box = mask.getBoundingClientRect();
    const ghosts = parts.map(el => ghostOf(el, box));
    mask.append(...ghosts);
    apply(entry);
    // Every line travels the strip's full height, so old and new move as one.
    const distance = Math.ceil(box.height) + 1;
    mask.style.overflow = 'hidden';
    slide = gsap.timeline({
      defaults: { duration: 0.5, ease: 'expo.inOut' },
      onComplete: () => {
        ghosts.forEach(ghost => ghost.remove());
        gsap.set(parts, { clearProps: 'transform' });
        mask.style.overflow = '';
        slide = null;
      },
    });
    slide.to(ghosts, { y: -distance }, 0).fromTo(parts, { y: distance }, { y: 0 }, 0);
  }

  banner.addEventListener('pointerenter', event => { if (event.pointerType === 'touch') return; hovering = true; schedule(); });
  banner.addEventListener('pointerleave', () => { if (!hovering) return; hovering = false; schedule(); });
  banner.addEventListener('focusin', () => { focused = true; schedule(); });
  banner.addEventListener('focusout', () => setTimeout(() => { focused = banner.contains(document.activeElement); schedule(); }, 0));
  document.addEventListener('visibilitychange', schedule);
  on('motion:paused', schedule);
  watchVisibility(banner, isVisible => { visible = isVisible; schedule(); });
  schedule();
}
