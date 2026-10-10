/**
 * Raj Aryan — Portfolio interactions
 *
 * This script contains NO hardcoded project names, URLs, or content.
 * All sections are discovered from the DOM ([data-zone] attribute).
 *
 * Systems:
 *
 *  1. ZONE STATE MACHINE
 *     Runs on scroll (rAF-throttled).
 *     States: distant | approaching | active | leaving | past
 *     Sets data-zone-state on each zone, data-active-zone(-pos) on body,
 *     and updates the orientation mark.
 *
 *  2. PROJECT ACCORDION — one project open at a time.
 *
 *  3. EXPERIMENTS GALLERY — one card expanded at a time.
 *
 *  4. CURSOR / TOUCH PARALLAX — skipped under prefers-reduced-motion.
 *
 *  5. CONTACT FORM — AJAX to /contact. Validates locally before posting.
 */

(function () {
  'use strict';

  const body        = document.body;
  const markPlace   = document.getElementById('mark-place');
  const returnBtn   = document.getElementById('return-btn');
  const contactForm = document.getElementById('contact-form');
  const formStatus  = document.getElementById('form-status');
  const submitBtn   = document.getElementById('submit-btn');

  const zones = Array.from(document.querySelectorAll('[data-zone]'));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let rafPending = false;

  function init() {
    initProjectRows();
    initElasticGallery();
    initRequestTrace();
    initLiveStatus();
    if (!reducedMotion.matches) {
      initCursorParallax();
      initDecodeTitles();
    }

    if (contactForm) contactForm.addEventListener('submit', handleContactSubmit);
    if (returnBtn) {
      returnBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
      });
    }

    window.addEventListener('scroll', () => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        updateZoneStates();
      });
    }, { passive: true });

    updateZoneStates();
  }

  /* ============================================================
     PROJECT ACCORDION
     The header <button> carries aria-expanded; the panel is inert
     while collapsed so its links are skipped by Tab.
     ============================================================ */

  function initProjectRows() {
    const rows = Array.from(document.querySelectorAll('.proj-row'));
    if (!rows.length) return;

    function setOpen(row, open) {
      const toggle = row.querySelector('.proj-header');
      const panel = row.querySelector('.proj-panel');
      row.classList.toggle('is-open', open);
      if (toggle) toggle.setAttribute('aria-expanded', String(open));
      if (panel) panel.inert = !open;
    }

    rows.forEach(row => {
      const toggle = row.querySelector('.proj-header');
      if (!toggle) return;
      toggle.addEventListener('click', () => {
        const willOpen = !row.classList.contains('is-open');
        rows.forEach(r => { if (r !== row) setOpen(r, false); });
        setOpen(row, willOpen);
      });
    });
  }

  /* ============================================================
     EXPERIMENTS GALLERY
     ============================================================ */

  function initElasticGallery() {
    const items = Array.from(document.querySelectorAll('.elastic-item'));
    if (!items.length) return;

    const activate = item => {
      items.forEach(i => {
        const on = i === item;
        i.classList.toggle('active', on);
        const toggle = i.querySelector('.elastic-toggle');
        const panel = i.querySelector('.elastic-active-content');
        if (toggle) toggle.setAttribute('aria-expanded', String(on));
        if (panel) panel.inert = !on;
      });
    };

    items.forEach(item => {
      const toggle = item.querySelector('.elastic-toggle');
      if (window.matchMedia('(hover: hover)').matches) {
        item.addEventListener('mouseenter', () => activate(item));
      }
      if (toggle) {
        toggle.addEventListener('click', () => activate(item));
        toggle.addEventListener('focus', () => activate(item));
      }
    });
  }

  /* ============================================================
     REQUEST TRACE
     Shows the time-to-first-byte this visitor's browser actually
     measured for the page (Navigation Timing API).
     ============================================================ */

  function initRequestTrace() {
    const out = document.getElementById('trace-ttfb');
    if (!out || !window.performance || !performance.getEntriesByType) return;

    const show = () => {
      const nav = performance.getEntriesByType('navigation')[0];
      if (!nav || !nav.responseStart) return;
      out.textContent = `${Math.round(nav.responseStart - nav.requestStart)} ms to first byte`;
      out.hidden = false;
    };
    if (document.readyState === 'complete') show();
    else window.addEventListener('load', show, { once: true });
  }

  /* ============================================================
     LIVE STATUS — experiments
     The server pings each deployed app in the background and
     caches the result; we just render it. Polls once more if the
     first response arrives before the server's check finishes.
     ============================================================ */

  function initLiveStatus() {
    const gallery = document.getElementById('elastic-gallery');
    const badges = Array.from(document.querySelectorAll('[data-status-url]'));
    if (!gallery || !badges.length) return;

    const endpoint = gallery.dataset.statusEndpoint;
    const labels = { up: 'live', idle: 'idle', down: 'down' };

    const render = results => {
      badges.forEach(badge => {
        const r = results[badge.dataset.statusUrl];
        if (!r) return;
        badge.dataset.state = r.state;
        badge.textContent = r.state === 'up' && r.ms != null
          ? `${labels.up} · ${r.ms} ms`
          : labels[r.state] || r.state;
        badge.title = r.state === 'idle'
          ? 'No response within 8 s — free-tier hosting sleeps when idle; it wakes on the first visit.'
          : 'Checked from the server in the last few minutes.';
        badge.hidden = false;
      });
    };

    const poll = attempt => {
      fetch(endpoint, { headers: { Accept: 'application/json' } })
        .then(res => (res.ok ? res.json() : Promise.reject()))
        .then(data => {
          render(data.results || {});
          if (data.pending && attempt < 3) setTimeout(() => poll(attempt + 1), 4000);
        })
        .catch(() => { /* status is decorative; fail silently */ });
    };
    poll(0);
  }

  /* ============================================================
     DECODING SECTION LABELS
     Mono labels resolve from noise the first time they scroll in.
     Lasts 0.7 s, then the exact original text is restored.
     ============================================================ */

  function initDecodeTitles() {
    const titles = Array.from(document.querySelectorAll('.section-title'));
    if (!titles.length || !('IntersectionObserver' in window)) return;

    const glyphs = 'abcdefghijklmnopqrstuvwxyz/<>_-=+*#';
    const decode = el => {
      const text = el.textContent;
      const start = performance.now();
      const duration = 700;
      let done = false;
      // Guarantee the real text returns even if rAF is throttled (background tab).
      setTimeout(() => { done = true; el.textContent = text; }, duration + 150);
      const frame = now => {
        if (done) return;
        const progress = Math.min(1, (now - start) / duration);
        const settled = Math.floor(progress * text.length);
        el.textContent = Array.from(text, (ch, i) => (
          i < settled || ch === ' ' ? ch : glyphs[(Math.random() * glyphs.length) | 0]
        )).join('');
        if (progress < 1) requestAnimationFrame(frame);
        else el.textContent = text;
      };
      requestAnimationFrame(frame);
    };

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        decode(entry.target);
      });
    }, { threshold: 0.6 });
    titles.forEach(t => observer.observe(t));
  }

  /* ============================================================
     CURSOR / TOUCH PARALLAX
     Feeds --cursor-pan-x/y, consumed by transforms in style.css.
     ============================================================ */

  function initCursorParallax() {
    const root = document.documentElement;
    const setPan = (x, y) => {
      root.style.setProperty('--cursor-pan-x', x.toFixed(4));
      root.style.setProperty('--cursor-pan-y', y.toFixed(4));
    };

    /* ── Desktop: pointermove ──────────────────────────────── */
    if (window.matchMedia('(pointer: fine)').matches) {
      document.addEventListener('pointermove', e => {
        setPan(e.clientX / window.innerWidth - 0.5,
               e.clientY / window.innerHeight - 0.5);
      }, { passive: true });
      return;
    }

    /* ── Touch: finger position drives pan, then drifts back ── */
    let panX = 0;
    let panY = 0;

    document.addEventListener('touchmove', e => {
      if (!e.touches.length) return;
      const t = e.touches[0];
      panX = t.clientX / window.innerWidth - 0.5;
      panY = t.clientY / window.innerHeight - 0.5;
      setPan(panX, panY);
    }, { passive: true });

    document.addEventListener('touchend', () => {
      const decay = () => {
        panX *= 0.88;
        panY *= 0.88;
        if (Math.abs(panX) > 0.002 || Math.abs(panY) > 0.002) {
          setPan(panX, panY);
          requestAnimationFrame(decay);
        } else {
          panX = panY = 0;
          setPan(0, 0);
        }
      };
      requestAnimationFrame(decay);
    }, { passive: true });
  }

  /* ============================================================
     ZONE STATE MACHINE
     ============================================================ */

  function updateZoneStates() {
    const vh = window.innerHeight;
    let closestZone = null;
    let minDistance = Infinity;

    zones.forEach(zone => {
      const rect = zone.getBoundingClientRect();
      const top = rect.top / vh;
      const bottom = rect.bottom / vh;
      const center = (top + bottom) / 2;

      let state;
      if (bottom < 0.08)      state = 'past';
      else if (bottom < 0.2)  state = 'leaving';
      else if (top < 0.85)    state = 'active';
      else if (top < 1.15)    state = 'approaching';
      else                    state = 'distant';

      if (zone.getAttribute('data-zone-state') !== state) {
        zone.setAttribute('data-zone-state', state);
      }

      const distanceToCenter = Math.abs(center - 0.5);
      if (distanceToCenter < minDistance) {
        minDistance = distanceToCenter;
        closestZone = zone;
      }
    });

    if (!closestZone) return;

    const zoneId    = closestZone.getAttribute('data-zone');
    const zonePos   = closestZone.getAttribute('data-zone-pos') || 'center';
    const zoneLabel = closestZone.getAttribute('data-zone-label') || zoneId;

    if (body.getAttribute('data-active-zone') !== zoneId) {
      body.setAttribute('data-active-zone', zoneId);
      body.setAttribute('data-active-zone-pos', zonePos);
    }
    if (markPlace && markPlace.textContent !== zoneLabel) {
      markPlace.textContent = zoneLabel;
    }
  }

  /* ============================================================
     CONTACT FORM — AJAX
     ============================================================ */

  async function handleContactSubmit(e) {
    e.preventDefault();

    const value = id => (document.getElementById(id)?.value || '').trim();
    const name    = value('cf-name');
    const email   = value('cf-email');
    const subject = value('cf-subject');
    const message = value('cf-message');
    const website = value('cf-website');

    if (!name || !email || !message) {
      showStatus('name, email and message are required.', 'fail');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showStatus('enter a valid email address.', 'fail');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'sending…';
    }

    try {
      const res = await fetch(contactForm.action, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ name, email, subject, message, website })
      });

      let data = {};
      try { data = await res.json(); } catch (_) { /* non-JSON error page */ }

      if (res.ok && data.success) {
        showStatus(data.message || 'sent.', 'ok');
        contactForm.reset();
      } else {
        showStatus(data.error || 'something went wrong. please try again later.', 'fail');
      }
    } catch (_) {
      showStatus('network error. check your connection.', 'fail');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'send';
      }
    }
  }

  function showStatus(msg, type) {
    if (!formStatus) return;
    formStatus.textContent = msg;
    formStatus.className = `tx-status ${type}`;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
