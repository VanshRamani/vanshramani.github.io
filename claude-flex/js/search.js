// Site search: a local index (no network request) in the template's framed
// dialog. The dialog scales up from the search button, results render
// instantly, and one blue fill slides to the active result. ARIA combobox
// pattern: focus stays in the input, ↑/↓ move aria-activedescendant.
import { gsap, motion, lockScroll, unlockScroll, scrollToEl, focusWithoutScroll } from './core.js';

// The original js/site.js index, verbatim, with paths fixed for claude-flex/.
const ENTRIES = [
  ['PAGE', 'Building ramAIn', 'agents computer use founder CTO YC', '#building'],
  ['PAGE', 'Research', 'publications papers machine learning', '#research'],
  ['PAGE', 'About', 'bio IIT Delhi CMU Copenhagen Aarhus', '#about'],
  ['PAPER', 'Panorama', 'search nearest neighbors FAISS geometry', '#paper-panorama'],
  ['PAPER', 'Bonsai', 'graph graphs distillation gradient-free', '#paper-bonsai'],
  ['PAPER', 'DISSOLVR', 'molecular solubility chemistry ICML', '#paper-dissolvr'],
  ['PAPER', 'Graph Condensation Needs a Reset', 'graph graphs distillation position ICML spotlight', '#paper-condensation'],
  ['PAPER', 'ReasonBENCH', 'reason reasoning stability LLM ICML', '#paper-reasonbench'],
  ['PAPER', 'SC3', 'solvents solubility molecular benchmark NeurIPS 2026', '#paper-sc3'],
  ['PAPER', 'MolMerger', 'molecule molecules chemistry solubility GNN JCTC', '#paper-molmerger'],
  ['PAGE', 'News', 'announcements milestones accepted NeurIPS SC3 YC', '../content/news.html'],
  ['PAGE', 'Writing', 'notes blogs tutorials ICLR', '../content/blogs.html'],
  ['PAGE', 'Favorites', 'jazz music travel personal', '../content/fun.html'],
  ['PAGE', 'Projects', 'erudite packing engineering experiments', '../content/projects.html'],
  ['PAGE', 'Experience & news', 'history research internships', '../content/background.html'],
  ['PAGE', 'Coursework', 'courses education learning', '../content/coursework.html'],
  ['PAGE', 'Achievements', 'awards citadel goldman sachs Lam', '../content/achievements.html'],
];

const EMPTY_TEXT = 'No matches. Try a paper title or a research area.';
const OPEN_FROM = 0.6;   // the dialog starts at 60% scale, anchored on the search button
const FILL_BASE = 100;   // .search-fill is 100px tall, scaled to the active row

const isTyping = el => !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);

export function init() {
  const dialog = document.querySelector('.search-dialog');
  const input = document.getElementById('site-search');
  const results = document.getElementById('search-results');
  const openers = [...document.querySelectorAll('.search-open')];
  if (!dialog || !input || !results || typeof dialog.showModal !== 'function') return;

  /* ---------------------------------------------------------- structure */
  // Results: one scroll box holding the decorative fill, the listbox and the empty state.
  results.removeAttribute('aria-live'); // per-keystroke announcements are spam; a debounced status replaces it
  const fill = document.createElement('i');
  fill.className = 'search-fill';
  fill.setAttribute('aria-hidden', 'true');
  const list = document.createElement('div');
  list.className = 'search-list';
  list.id = 'search-listbox';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Results');
  const empty = document.createElement('p');
  empty.className = 'no-results';
  empty.textContent = EMPTY_TEXT;
  empty.hidden = true;
  results.replaceChildren(fill, list, empty);
  if (gsap) results.classList.add('has-fill');

  const status = document.createElement('p');
  status.className = 'sr-only';
  status.setAttribute('role', 'status');
  dialog.append(status);

  const help = dialog.querySelector('.search-help');
  if (help && !help.id) help.id = 'search-help';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', list.id);
  input.setAttribute('aria-expanded', 'false');
  if (help) input.setAttribute('aria-describedby', help.id);
  openers.forEach(button => {
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-keyshortcuts', 'Meta+K Control+K /');
  });

  /* ------------------------------------------------------------ results */
  let matches = [];
  let active = -1;
  let fillShown = false;
  let statusTimer = 0;

  function optionFor([type, title, , href], index) {
    const option = document.createElement('a');
    option.className = 'search-result';
    option.href = href;
    option.id = `search-option-${index}`;
    option.dataset.index = String(index);
    option.tabIndex = -1;
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', 'false');
    const label = document.createElement('span');
    const small = document.createElement('small');
    const arrow = document.createElement('span');
    small.textContent = type;
    label.append(small, title);
    arrow.textContent = '↗';
    arrow.setAttribute('aria-hidden', 'true');
    option.append(label, arrow);
    return option;
  }

  /** Same word-AND matching as the original, over type, title and keywords. */
  function render() {
    const words = input.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    matches = ENTRIES.filter(entry => words.every(word => entry.slice(0, 3).join(' ').toLowerCase().includes(word)));
    list.replaceChildren(...matches.map(optionFor));
    empty.hidden = matches.length > 0;
    list.hidden = matches.length === 0;
    input.setAttribute('aria-expanded', String(matches.length > 0));
    results.scrollTop = 0;
    select(-1);
  }

  function announce() {
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      const n = matches.length;
      status.textContent = n ? `${n} ${n === 1 ? 'result' : 'results'}` : EMPTY_TEXT;
    }, 450);
  }

  /** The blue fill: one element, translated and scaled onto the active row. */
  function moveFill(option) {
    if (!gsap) return;
    if (!option) {
      gsap.killTweensOf(fill);
      gsap.set(fill, { opacity: 0 });
      fillShown = false;
      return;
    }
    // Fractional rects in the scroll box's content space (offset* would round).
    const box = results.getBoundingClientRect(), rect = option.getBoundingClientRect();
    const to = { x: rect.left - box.left - results.clientLeft, y: rect.top - box.top - results.clientTop + results.scrollTop, scaleY: rect.height / FILL_BASE };
    fill.style.width = `${rect.width}px`;
    if (!fillShown || !motion) {
      gsap.killTweensOf(fill);
      gsap.set(fill, { ...to, opacity: 1 });
      fillShown = true;
      return;
    }
    gsap.to(fill, { ...to, opacity: 1, duration: 0.15, ease: 'power2.out', overwrite: true });
  }

  function select(index) {
    active = index;
    const options = [...list.children];
    options.forEach((option, i) => {
      const on = i === index;
      option.classList.toggle('active', on);
      option.setAttribute('aria-selected', String(on));
    });
    const option = options[index];
    if (!option) {
      input.removeAttribute('aria-activedescendant');
      moveFill(null);
      return;
    }
    input.setAttribute('aria-activedescendant', option.id);
    // Keep the active row inside the scroll box without scrolling the page.
    const top = option.offsetTop, bottom = top + option.offsetHeight;
    if (top < results.scrollTop) results.scrollTop = top;
    else if (bottom > results.scrollTop + results.clientHeight) results.scrollTop = bottom - results.clientHeight;
    moveFill(option);
  }

  /* ------------------------------------------------------ open & close */
  let closing = null;
  let locked = false;

  /** transform-origin at the search button's centre, in the dialog's own box. */
  function originFromButton() {
    const button = openers.find(b => b.getClientRects().length) || null;
    const box = dialog.getBoundingClientRect();
    if (!button || box.width < 32) return '50% 0%';
    const b = button.getBoundingClientRect();
    return `${b.left + b.width / 2 - box.left}px ${b.top + b.height / 2 - box.top}px`;
  }

  // The dialog itself is animated with the Web Animations API, not GSAP: GSAP's
  // transform parser briefly re-parents elements without an offsetParent (a
  // fixed, modal dialog has none), which drops the dialog out of the top layer.
  let anims = [];
  const EASE_OUT = 'cubic-bezier(.215, .61, .355, 1)'; // power3.out
  const EASE_IN = 'cubic-bezier(.55, .055, .675, .19)'; // power3.in

  function stopAnims() {
    anims.forEach(anim => anim.cancel());
    anims = [];
  }

  function animate(scale, opacity, { easing, delay = 0 }) {
    // Reversing mid-way starts from wherever the running animation has got to.
    if (anims.length) {
      const now = getComputedStyle(dialog);
      scale = [now.transform, scale[1]];
      opacity = [now.opacity, opacity[1]];
      delay = 0;
    }
    stopAnims();
    dialog.style.transformOrigin = originFromButton();
    const run = [
      dialog.animate({ transform: scale }, { duration: 180, easing, fill: 'forwards' }),
      dialog.animate({ opacity }, { duration: 120, delay, easing: 'linear', fill: 'forwards' }),
    ];
    anims = run;
    // Resolves true when this run finished, false when something replaced it.
    return Promise.all(run.map(anim => anim.finished)).then(() => anims === run, () => false);
  }

  function open() {
    if (dialog.open || closing) return;
    if (document.querySelector('dialog[open]')) return; // another dialog owns the screen
    input.value = '';
    render();
    dialog.showModal();
    if (!locked) { lockScroll(); locked = true; }
    input.focus({ preventScroll: true });
    if (!motion || typeof dialog.animate !== 'function') return;
    // Once settled, drop the held end state so the dialog rests on its own CSS.
    animate([`scale(${OPEN_FROM})`, 'none'], [0, 1], { easing: EASE_OUT }).then(done => { if (done) stopAnims(); });
  }

  /** Cleans up exactly once per opening, whichever way the dialog closed. */
  function cleanup() {
    clearTimeout(statusTimer);
    status.textContent = '';
    dialog.classList.remove('is-closing');
    stopAnims();
    dialog.style.removeProperty('transform-origin');
    if (locked) { locked = false; unlockScroll(); }
    closing = null;
  }

  /** The opening animation reversed, then close(). Resolves once scroll is unlocked. */
  function close({ animate: animated = motion } = {}) {
    if (!dialog.open) return Promise.resolve();
    if (closing) return closing;
    closing = new Promise(resolve => {
      const finish = () => { if (dialog.open) dialog.close(); cleanup(); resolve(); };
      if (!animated || typeof dialog.animate !== 'function') { finish(); return; }
      dialog.classList.add('is-closing');
      animate(['none', `scale(${OPEN_FROM})`], [1, 0], { easing: EASE_IN, delay: 60 }).then(finish, finish);
    });
    return closing;
  }

  async function choose(entry) {
    if (!entry || closing) return;
    const href = entry[3];
    if (!href.startsWith('#')) {
      // Another page: close at once (a back-forward restore finds it shut) and navigate.
      close({ animate: false });
      location.assign(new URL(href, location.href).href);
      return;
    }
    await close();
    const id = href.slice(1);
    let index = null;
    try { index = await import('./publications.js'); } catch { /* plain anchor scroll below */ }
    if (id.startsWith('paper-') && index?.openPaper(id)) { history.replaceState(null, '', href); return; }
    const target = document.getElementById(id);
    if (!target) return;
    // guidedScrollTo survives the layout refreshes that cancel native smooth scrolls on touch.
    (index?.guidedScrollTo || scrollToEl)(target);
    history.replaceState(null, '', href);
    focusWithoutScroll(target);
  }

  /* ------------------------------------------------------------- events */
  openers.forEach(button => button.addEventListener('click', () => open()));
  dialog.querySelector('.search-close')?.addEventListener('click', () => close());
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('close', cleanup); // also covers a forced close without 'cancel'
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close();
  });

  input.addEventListener('input', () => { render(); announce(); });
  input.addEventListener('keydown', event => {
    if (event.isComposing) return;
    if (event.key === 'ArrowDown' && matches.length) { event.preventDefault(); select((active + 1) % matches.length); }
    else if (event.key === 'ArrowUp' && matches.length) { event.preventDefault(); select(active <= 0 ? matches.length - 1 : active - 1); }
    else if (event.key === 'Enter' && matches.length) { event.preventDefault(); choose(matches[active < 0 ? 0 : active]); }
    // A search field's first Esc would only clear it; here Esc always closes.
    else if (event.key === 'Escape') { event.preventDefault(); close(); }
  });

  // Options keep focus in the input; plain clicks choose, modified clicks open a new tab.
  list.addEventListener('mousedown', event => event.preventDefault());
  list.addEventListener('click', event => {
    const option = event.target.closest('.search-result');
    if (!option || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    choose(matches[Number(option.dataset.index)]);
  });

  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing) return;
    if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (dialog.open) { input.focus(); input.select(); } else open();
      return;
    }
    if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !dialog.open && !isTyping(event.target)) {
      event.preventDefault();
      open();
    }
  });

  // A back-forward cache restore must never show a half-closed dialog.
  addEventListener('pageshow', event => { if (event.persisted && dialog.open) close({ animate: false }); });
}
