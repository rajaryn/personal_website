/**
 * Raj Aryan — Spatial Portfolio Engine
 *
 * This script contains NO hardcoded project names, URLs, or content.
 * All destination zones are discovered from the DOM ([data-zone] attribute).
 * Zone positions (left/right/center) are read from [data-zone-pos] attribute set by Jinja.
 *
 * Systems:
 *
 *  1. PORTAL CROSSING
 *     Raw scrollY drives panel animation.
 *     No crossing-zone spacer. World starts at document top.
 *     The real world is visible through the opening seam.
 *     Crossing completes at CROSS_END_VH (55% of viewport height).
 *     States: outside → approaching → opening → crossing → inside.
 *     Reversible: scrolling back re-crosses in reverse.
 *
 *  2. ZONE STATE MACHINE
 *     Runs on every scroll event (rAF-throttled).
 *     getBoundingClientRect() per zone → zone center relative to viewport.
 *     States: distant | approaching | active | leaving | past
 *     Sets data-zone-state on zone element.
 *     Sets data-active-zone and data-active-zone-pos on body.
 *     No hardcoded zone names — works for any number of projects.
 *
 *  3. CONTACT FORM
 *     AJAX to /contact. Validates locally before posting.
 *
 *  4. RETURN
 *     Smooth scroll to top. Re-initiates crossing.
 */

(function () {
  'use strict';

  /* ============================================================
     CONFIGURATION
     ============================================================ */

  const CROSS_END_VH = 0.45;  // crossing completes quicker

  /* ============================================================
     ELEMENT REFERENCES
     ============================================================ */

  const body       = document.body;
  const threshold  = document.getElementById('threshold');
  const worldEl    = document.getElementById('world');
  const markPlace  = document.getElementById('mark-place');
  const returnBtn  = document.getElementById('return-btn');
  const contactForm = document.getElementById('contact-form');
  const formStatus = document.getElementById('form-status');
  const submitBtn  = document.getElementById('submit-btn');

  const zones = Array.from(document.querySelectorAll('[data-zone]'));

  let panelTop    = null;
  let panelBottom = null;
  let crossingComplete = false;
  let lastState = '';
  let rafPending = false;

  /* ============================================================
     INIT
     ============================================================ */

  function init() {
    if (prefersReducedMotion()) {
      initReducedMotion();
      return;
    }

    injectPanels();
    setBodyState('outside');

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    if (returnBtn) returnBtn.addEventListener('click', returnToOutside);
    if (contactForm) contactForm.addEventListener('submit', handleContactSubmit);
  }

  function injectPanels() {
    if (!threshold) return;

    function makePanel(cls, posStyles) {
      const el = document.createElement('div');
      el.className = cls;
      el.setAttribute('aria-hidden', 'true');
      Object.assign(el.style, {
        position: 'absolute',
        left: '0', right: '0',
        backgroundColor: 'var(--c-void)',
        willChange: 'transform',
        zIndex: '0',
        ...posStyles
      });
      return el;
    }
    panelTop    = makePanel('panel-top',    { top: '0',    height: '50%' });
    panelBottom = makePanel('panel-bottom', { bottom: '0', height: '50%' });
    threshold.appendChild(panelTop);
    threshold.appendChild(panelBottom);
  }

  /* ============================================================
     SCROLL HANDLER
     Portal has priority. Zones stay pre-entry until portal finishes.
     ============================================================ */

  function onScroll() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      const vh = window.innerHeight;
      const y  = window.scrollY;
      const endPx = CROSS_END_VH * vh;
      const progress = Math.max(0, Math.min(1, y / endPx));

      if (progress < 1) {
        if (crossingComplete) {
          crossingComplete = false;
        }
        handlePortalState(y, vh, progress);
        updateZoneStates(true); // isCrossing = true
      } else {
        if (!crossingComplete) {
          crossingComplete = true;
          setBodyState('inside');
          setPanelProgress(1);
        }
        updateZoneStates(false); // isCrossing = false
      }
    });
  }

  function handlePortalState(y, vh, progress) {
    if (y < 0.05 * vh) setBodyState('outside');
    else if (y < 0.15 * vh) setBodyState('approaching');
    else if (y < 0.30 * vh) setBodyState('opening');
    else setBodyState('crossing');

    setPanelProgress(easeOutCubic(progress));
  }

  function setPanelProgress(p) {
    if (panelTop)    panelTop.style.transform    = `translateY(${-p * 100}%)`;
    if (panelBottom) panelBottom.style.transform = `translateY(${p  * 100}%)`;
  }

  function returnToOutside() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ============================================================
     ZONE STATE MACHINE
     ============================================================ */

  function updateZoneStates(isCrossing) {
    const vh = window.innerHeight;
    let closestZone = null;
    let minDistance = Infinity;

    zones.forEach(zone => {
      const rect = zone.getBoundingClientRect();
      const top = rect.top / vh;
      const bottom = rect.bottom / vh;
      const center = (top + bottom) / 2;

      let state;
      if (bottom < 0.15) {
        state = 'past';
      } else if (bottom < 0.35) {
        state = 'leaving';
      } else if (top < 0.85) {
        state = 'active';
      } else if (top < 1.15) {
        state = 'approaching';
      } else {
        state = 'distant';
      }

      /* PORTAL PRIORITY: Destinations remain completely pre-entry until portal completes */
      if (isCrossing) {
        state = 'distant';
      }

      if (zone.getAttribute('data-zone-state') !== state) {
        zone.setAttribute('data-zone-state', state);
      }

      if (!isCrossing) {
        const distanceToCenter = Math.abs(center - 0.5);
        if (distanceToCenter < minDistance) {
          minDistance = distanceToCenter;
          closestZone = zone;
        }
      }
    });

    if (isCrossing) {
      if (body.hasAttribute('data-active-zone')) {
        body.removeAttribute('data-active-zone');
        body.removeAttribute('data-active-zone-pos');
      }
      if (markPlace) markPlace.textContent = body.getAttribute('data-state');
    } else if (closestZone) {
      const zoneId  = closestZone.getAttribute('data-zone');
      const zonePos = closestZone.getAttribute('data-zone-pos') || 'center';
      const zoneLabel = closestZone.getAttribute('data-zone-label') || zoneId;

      if (body.getAttribute('data-active-zone') !== zoneId) {
        body.setAttribute('data-active-zone', zoneId);
        body.setAttribute('data-active-zone-pos', zonePos);
      }
      if (markPlace && markPlace.textContent !== zoneLabel) {
        markPlace.textContent = zoneLabel;
      }
    }
  }

  /* ============================================================
     STATE MANAGEMENT
     ============================================================ */

  function setBodyState(state) {
    if (lastState === state) return;
    lastState = state;
    body.setAttribute('data-state', state);

    if (markPlace) {
      if (state === 'inside') markPlace.textContent = 'world';
      else markPlace.textContent = state;
    }
  }

  /* ============================================================
     CONTACT FORM — AJAX
     ============================================================ */

  async function handleContactSubmit(e) {
    e.preventDefault();

    const name    = (document.getElementById('cf-name')?.value    || '').trim();
    const email   = (document.getElementById('cf-email')?.value   || '').trim();
    const subject = (document.getElementById('cf-subject')?.value || '').trim();
    const message = (document.getElementById('cf-message')?.value || '').trim();

    if (!name || !email || !message) {
      showStatus('name, email and message are required.', 'fail');
      return;
    }

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email)) {
      showStatus('enter a valid email address.', 'fail');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'sending…';
    }

    try {
      const res = await fetch('/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ name, email, subject, message })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        showStatus('sent.', 'ok');
        contactForm.reset();
      } else {
        showStatus(data.error || 'something went wrong.', 'fail');
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

  /* ============================================================
     REDUCED MOTION FAST PATH
     Skip all animation. World is immediately accessible.
     ============================================================ */

  function initReducedMotion() {
    body.setAttribute('data-state', 'inside');
    if (markPlace) markPlace.textContent = 'world';

    /* Wire non-visual systems */
    if (contactForm) contactForm.addEventListener('submit', handleContactSubmit);
    if (returnBtn)   returnBtn.addEventListener('click', () => window.scrollTo({ top: 0 }));

    window.addEventListener('scroll', () => {
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(() => { rafPending = false; updateZoneStates(); });
      }
    }, { passive: true });

    updateZoneStates();
  }

  /* ============================================================
     UTILITIES
     ============================================================ */

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
  }

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ============================================================
     ENTRY POINT
     ============================================================ */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
