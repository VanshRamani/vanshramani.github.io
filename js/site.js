(() => {
  'use strict';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const papers = [...document.querySelectorAll('.paper-row')];
  const filters = [...document.querySelectorAll('[data-filter]')];

  function filterPapers(category = 'all') {
    filters.forEach(button => {
      const active = button.dataset.filter === category;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    let count = 0;
    papers.forEach(paper => {
      paper.hidden = category !== 'all' && paper.dataset.category !== category;
      if (!paper.hidden) count++;
    });
    const counter = document.getElementById('research-count');
    if (counter) counter.textContent = `${count} ${count === 1 ? 'WORK' : 'WORKS'} / 2024–2026`;
  }
  filters.forEach(button => button.addEventListener('click', () => filterPapers(button.dataset.filter)));

  function openPaper(id, scroll = true) {
    const paper = document.getElementById(id);
    if (!paper?.classList.contains('paper-row')) return false;
    filterPapers('all');
    paper.open = true;
    if (scroll) paper.scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start' });
    return true;
  }
  document.addEventListener('click', event => {
    const link = event.target.closest('[data-open-paper]');
    if (!link) return;
    if (openPaper(link.dataset.openPaper)) {
      event.preventDefault();
      history.replaceState(null, '', `#${link.dataset.openPaper}`);
    }
  });
  function openHashPaper() { openPaper(location.hash.slice(1), false); }
  openHashPaper();
  window.addEventListener('hashchange', openHashPaper);

  // Each vector poster is also a normal image link when scripting is unavailable.
  const posterDialog = document.querySelector('.poster-dialog');
  let posterOpener = null;
  document.querySelectorAll('[data-poster]').forEach(link => link.addEventListener('click', event => {
    if (!posterDialog || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    posterOpener = link;
    posterDialog.querySelector('h2').textContent = link.dataset.title;
    const image = posterDialog.querySelector('img');
    image.src = link.getAttribute('href');
    image.alt = link.querySelector('img').alt;
    const paperLink = posterDialog.querySelector('.poster-paper-link');
    if (link.dataset.poster === 'ramain') {
      paperLink.href = 'https://ramain.ai';
      paperLink.textContent = 'Visit ramain.ai ↗';
      delete paperLink.dataset.openPaper;
      posterDialog.querySelector('.poster-dialog-footer > span').textContent = 'Concept illustration · Computer-use workflow';
    } else {
      paperLink.href = `#paper-${link.dataset.poster}`;
      paperLink.dataset.openPaper = `paper-${link.dataset.poster}`;
      paperLink.textContent = 'Publication details ↗';
      posterDialog.querySelector('.poster-dialog-footer > span').textContent = 'Concept illustration · Original paper figures in publication details';
    }
    posterDialog.showModal();
  }));
  posterDialog?.querySelector('.poster-dialog-close').addEventListener('click', () => posterDialog.close());
  posterDialog?.querySelector('.poster-paper-link').addEventListener('click', () => posterDialog.close());
  posterDialog?.addEventListener('close', () => posterOpener?.focus({ preventScroll: true }));
  posterDialog?.addEventListener('click', event => {
    if (event.target !== posterDialog) return;
    const rect = posterDialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) posterDialog.close();
  });

  // Local search: no network request and no external index.
  const dialog = document.querySelector('.search-dialog');
  const input = document.getElementById('site-search');
  const results = document.getElementById('search-results');
  const inArchive = location.pathname.includes('/content/');
  const root = inArchive ? '../' : '';
  const entries = [
    ['PAGE', 'Building ramAIn', 'agents computer use founder CTO YC', `${root}index.html#building`],
    ['PAGE', 'Research', 'publications papers machine learning', `${root}index.html#research`],
    ['PAGE', 'About', 'bio IIT Delhi CMU Copenhagen Aarhus', `${root}index.html#about`],
    ['PAPER', 'Panorama', 'search nearest neighbors FAISS geometry', `${root}index.html#paper-panorama`],
    ['PAPER', 'Bonsai', 'graph graphs distillation gradient-free', `${root}index.html#paper-bonsai`],
    ['PAPER', 'DISSOLVR', 'molecular solubility chemistry ICML', `${root}index.html#paper-dissolvr`],
    ['PAPER', 'Graph Condensation Needs a Reset', 'graph graphs distillation position ICML spotlight', `${root}index.html#paper-condensation`],
    ['PAPER', 'ReasonBENCH', 'reason reasoning stability LLM ICML', `${root}index.html#paper-reasonbench`],
    ['PAPER', 'SC3', 'solvents solubility molecular benchmark NeurIPS 2026', `${root}index.html#paper-sc3`],
    ['PAPER', 'MolMerger', 'molecule molecules chemistry solubility GNN JCTC', `${root}index.html#paper-molmerger`],
    ['PAGE', 'News', 'announcements milestones accepted NeurIPS SC3 YC', `${root}content/news.html`],
    ['PAGE', 'Writing', 'notes blogs tutorials ICLR', `${root}content/blogs.html`],
    ['PAGE', 'Favorites', 'jazz music travel personal', `${root}content/fun.html`],
    ['PAGE', 'Projects', 'erudite packing engineering experiments', `${root}content/projects.html`],
    ['PAGE', 'Experience & news', 'history research internships', `${root}content/background.html`],
    ['PAGE', 'Coursework', 'courses education learning', `${root}content/coursework.html`],
    ['PAGE', 'Achievements', 'awards citadel goldman sachs Lam', `${root}content/achievements.html`]
  ];
  let resultLinks = [], activeResult = -1, searchOpener = null;
  function selectResult(index) {
    activeResult = index;
    resultLinks.forEach((link, i) => link.classList.toggle('active', i === index));
    if (index >= 0) resultLinks[index].scrollIntoView({ block: 'nearest' });
  }
  function renderSearch() {
    const words = input.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    results.replaceChildren();
    const matches = entries.filter(entry => words.every(word => entry.slice(0, 3).join(' ').toLowerCase().includes(word)));
    if (!matches.length) {
      const empty = document.createElement('p'); empty.className = 'no-results'; empty.textContent = 'No matches. Try a paper title or a research area.'; results.append(empty);
    }
    matches.forEach(([type, title, , href]) => {
      const link = document.createElement('a'); link.href = href; link.className = 'search-result';
      const label = document.createElement('span'), small = document.createElement('small'), arrow = document.createElement('span');
      small.textContent = type; label.append(small, title); arrow.textContent = '↗'; link.append(label, arrow);
      link.addEventListener('click', event => {
        dialog.close();
        const target = new URL(href, location.href);
        const id = target.hash.slice(1);
        if (!inArchive && openPaper(id)) { event.preventDefault(); history.replaceState(null, '', `#${id}`); }
      });
      results.append(link);
    });
    resultLinks = [...results.querySelectorAll('a')];
    activeResult = -1;
  }
  function openSearch(opener) {
    if (!dialog || dialog.open || posterDialog?.open || document.querySelector('.molecule-dialog')?.open) return;
    searchOpener = opener || document.activeElement;
    input.value = ''; renderSearch(); dialog.showModal(); input.focus();
  }
  document.querySelectorAll('.search-open').forEach(button => button.addEventListener('click', () => openSearch(button)));
  document.querySelector('.search-close')?.addEventListener('click', () => dialog.close());
  dialog?.addEventListener('close', () => { searchOpener?.focus(); });
  dialog?.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
  input?.addEventListener('input', renderSearch);
  input?.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' && resultLinks.length) { event.preventDefault(); selectResult((activeResult + 1) % resultLinks.length); }
    if (event.key === 'ArrowUp' && resultLinks.length) { event.preventDefault(); selectResult(activeResult <= 0 ? resultLinks.length - 1 : activeResult - 1); }
    if (event.key === 'Enter' && resultLinks.length) { event.preventDefault(); resultLinks[activeResult < 0 ? 0 : activeResult].click(); }
  });
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); }
    if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !/INPUT|TEXTAREA|SELECT/.test(event.target.tagName) && !event.target.isContentEditable && !dialog?.open) { event.preventDefault(); openSearch(); }
  });

  // Progress and section navigation use the page's actual scroll position.
  const progress = document.querySelector('.reading-progress');
  const sections = [...document.querySelectorAll('main > section[id]')];
  const navLinks = [...document.querySelectorAll('.nav nav a')];
  let scrollFrame = 0;
  function updateScroll() {
    scrollFrame = 0;
    const total = document.documentElement.scrollHeight - innerHeight;
    if (progress) progress.style.transform = `scaleX(${total > 0 ? Math.max(0, Math.min(1, scrollY / total)) : 0})`;
    let current = '';
    sections.forEach(section => { if (section.getBoundingClientRect().top < 180) current = section.id; });
    navLinks.forEach(link => { const active = link.hash ? link.hash === `#${current}` : link.pathname === location.pathname; link.classList.toggle('active', active); if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current'); });
  }
  window.addEventListener('scroll', () => { if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll); }, { passive: true });
  window.addEventListener('resize', updateScroll); updateScroll();
  const revealTargets = document.querySelectorAll('.build-grid, .research-heading, .project-card, .bio-v2-intro, .experience-v2, .notes-card');
  if ('IntersectionObserver' in window && !reducedMotion.matches) {
    revealTargets.forEach(element => element.setAttribute('data-reveal', ''));
    document.documentElement.classList.add('reveal-ready');
    const reveal = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('revealed'); reveal.unobserve(entry.target); } }), { threshold: .08 });
    revealTargets.forEach(element => reveal.observe(element));
  }

})();
