(() => {
  'use strict';
  const entries = [{"id": "sc3", "date": "2026", "summary": "SC³ accepted at NeurIPS 2026."}, {"id": "yc", "date": "NOV 2025", "summary": "Accepted into Y Combinator — building ramAIn, YC W26."}, {"id": "panorama", "date": "OCT 2025", "summary": "Panorama: Fast-Track Nearest Neighbors submitted to arXiv."}, {"id": "ddsa", "date": "AUG 2025", "summary": "Received a Danish Data Science Academy Scholarship for research at Copenhagen."}, {"id": "cmu", "date": "JUL 2025", "summary": "Completed a research internship at Carnegie Mellon’s RAIL group."}, {"id": "raf", "date": "MAY 2025", "summary": "Received IIT Delhi’s Research Acceleration Fund grant for ICLR 2025."}, {"id": "bronstein", "date": "APR 2025", "summary": "Presented Bonsai to Michael Bronstein at ICLR 2025 in Singapore."}, {"id": "bonsai", "date": "FEB 2025", "summary": "Bonsai accepted at ICLR 2025."}, {"id": "lam", "date": "DEC 2024", "summary": "Pi Propulsion won the Lam Research Challenge — ₹5,00,000 prize."}, {"id": "acs-talk", "date": "NOV 2024", "summary": "Spoke at the ACS × BioPractify Students Journal Club on AI."}, {"id": "goldman", "date": "NOV 2024", "summary": "Placed fourth nationally at the Goldman Sachs India Hackathon."}, {"id": "citadel", "date": "SEP 2024", "summary": "Won first place in Citadel’s Quants Arena Challenge."}, {"id": "molmerger", "date": "JUL 2024", "summary": "First-author molecular learning paper published in ACS JCTC."}];
  const banner = document.querySelector('.news-banner');
  if (!banner) return;
  const content = banner.querySelector('.news-banner-content');
  content.setAttribute('aria-atomic', 'true');
  const story = banner.querySelector('.news-banner-story');
  const date = banner.querySelector('.news-banner-date');
  const pause = banner.querySelector('.news-banner-pause');
  const count = banner.querySelector('.news-banner-count');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const root = location.pathname.includes('/content/') ? '../' : '';
  let index = 0, timer = 0, paused = reduced.matches, hovering = false, focused = false, visible = true;
  try { banner.hidden = sessionStorage.getItem('vansh-news-dismissed') === '1'; } catch (_) {}
  function schedule() {
    content.setAttribute('aria-live', paused || focused ? 'polite' : 'off');
    clearTimeout(timer);
    if (!banner.hidden && !paused && !hovering && !focused && visible && !document.hidden) {
      timer = setTimeout(() => { show(index + 1); schedule(); }, 8000);
    }
  }
  function show(next) {
    index = next % entries.length;
    const entry = entries[index];
    story.textContent = entry.summary;
    story.href = `${root}content/news.html#news-${entry.id}`;
    date.textContent = entry.date;
    // SC3's announcement has a confirmed conference year, without an invented month.
    const monthNames = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const month = monthNames.indexOf(entry.date.slice(0, 3));
    date.dateTime = month < 0 ? entry.date : `${entry.date.slice(-4)}-${String(month + 1).padStart(2, '0')}`;
    count.textContent = `${index + 1} of ${entries.length} updates`;
    if (!reduced.matches) story.animate([{opacity: 0, transform: 'translateY(4px)'}, {opacity: 1, transform: 'translateY(0)'}], {duration: 220, easing: 'ease-out'});
  }
  function syncPause() {
    pause.textContent = paused ? '▷' : 'Ⅱ';
    pause.setAttribute('aria-label', paused ? 'Play news rotation' : 'Pause news rotation');
    pause.setAttribute('aria-pressed', String(paused));
    schedule();
  }
  banner.querySelector('.news-banner-next').addEventListener('click', () => { show(index + 1); schedule(); });
  pause.addEventListener('click', () => { paused = !paused; syncPause(); });
  banner.querySelector('.news-banner-close').addEventListener('click', () => {
    banner.hidden = true;
    clearTimeout(timer);
    try { sessionStorage.setItem('vansh-news-dismissed', '1'); } catch (_) {}
    document.querySelector('.nav .brand').focus({preventScroll: true});
  });
  banner.addEventListener('pointerenter', () => { hovering = true; schedule(); });
  banner.addEventListener('pointerleave', () => { hovering = false; schedule(); });
  banner.addEventListener('focusin', () => { focused = true; schedule(); });
  banner.addEventListener('focusout', () => { requestAnimationFrame(() => { focused = banner.contains(document.activeElement); schedule(); }); });
  document.addEventListener('visibilitychange', schedule);
  reduced.addEventListener('change', event => { paused = event.matches; syncPause(); });
  if ('IntersectionObserver' in window) new IntersectionObserver(entries => { visible = entries[0].isIntersecting; schedule(); }).observe(banner);
  syncPause();
})();
