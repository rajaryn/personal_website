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
 *     Scroll progress drives a layered parallax passage.
 *     The scene scales and moves at different rates to suggest depth.
 *     Crossing completes across a short, phone-friendly scroll distance.
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

  const CROSS_END_VH_DESKTOP = 0.45;
  const CROSS_END_VH_MOBILE = 0.68;

  /* ============================================================
     ELEMENT REFERENCES
     ============================================================ */

  const body       = document.body;
  const threshold  = document.getElementById('threshold');
  const meZone     = document.getElementById('zone-me');
  const markPlace  = document.getElementById('mark-place');
  const returnBtn  = document.getElementById('return-btn');
  const contactForm = document.getElementById('contact-form');
  const formStatus = document.getElementById('form-status');
  const submitBtn  = document.getElementById('submit-btn');

  const zones = Array.from(document.querySelectorAll('[data-zone]'));

  let crossingComplete = false;
  let portalWasCrossing = false;
  let lastState = '';
  let rafPending = false;
  let portalViewportHeight = window.innerHeight;
  let portalViewportWidth = window.innerWidth;
  let hasLandedAtIntroduction = false;
  let introductionLandingY = null;
  let introductionLockUntil = 0;

  /* ============================================================
     INIT
     ============================================================ */

  function init() {
    window.addEventListener('resize', () => {
      const width = window.innerWidth;
      // Mobile browser chrome can change innerHeight while scrolling. Keep the
      // crossing distance stable until the device is actually rotated/resized.
      if (width !== portalViewportWidth || !window.matchMedia('(max-width: 768px)').matches) {
        portalViewportHeight = window.innerHeight;
        portalViewportWidth = width;
      }
    }, { passive: true });

    initCursorParallax();
    initProjectRows();
    initElasticGallery();
    
    // Bypass portal logic completely and just show the world
    initReducedMotion();
  }

  /* ============================================================
     PROJECT ROW CONTROLLER
     One project open at a time.
     Panel expands via CSS (aria-expanded); no layout shift outside.
     ============================================================ */

  function initProjectRows() {
    const rows = document.querySelectorAll('.proj-row');
    if (!rows.length) return;

    function openRow(row) {
      rows.forEach(r => {
        if (r !== row) {
          r.setAttribute('aria-expanded', 'false');
          const p = r.querySelector('.proj-panel');
          if (p) p.setAttribute('aria-hidden', 'true');
        }
      });
      const isOpen = row.getAttribute('aria-expanded') === 'true';
      row.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
      const panel = row.querySelector('.proj-panel');
      if (panel) panel.setAttribute('aria-hidden', isOpen ? 'true' : 'false');
    }

    rows.forEach(row => {
      row.addEventListener('click', () => openRow(row));
      row.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openRow(row);
        }
      });
    });
  }

  function initElasticGallery() {
    const items = document.querySelectorAll('.elastic-item');
    if (!items.length) return;

    items.forEach(item => {
      const activate = () => {
        items.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
      };
      item.addEventListener('mouseenter', activate);
      item.addEventListener('click', activate);
      item.addEventListener('focus', activate);
    });
  }

  function initCursorParallax() {
    const setPan = (x, y) => {
      document.documentElement.style.setProperty('--cursor-pan-x', x.toFixed(4));
      document.documentElement.style.setProperty('--cursor-pan-y', y.toFixed(4));
    };

    /* ── Desktop: pointermove ──────────────────────────────── */
    if (window.matchMedia('(pointer: fine)').matches) {
      document.addEventListener('pointermove', (e) => {
        setPan(e.clientX / window.innerWidth - 0.5,
               e.clientY / window.innerHeight - 0.5);
      }, { passive: true });
      return;
    }

    /* ── Mobile: touchmove ─────────────────────────────────── */
    /* Finger position relative to viewport center drives pan. */
    document.addEventListener('touchmove', (e) => {
      if (!e.touches.length) return;
      const t = e.touches[0];
      setPan(t.clientX / window.innerWidth - 0.5,
             t.clientY / window.innerHeight - 0.5);
    }, { passive: true });

    /* Reset when finger lifts */
    document.addEventListener('touchend', () => {
      /* Smoothly drift back to center */
      let cx = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--cursor-pan-x') || 0
      );
      let cy = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--cursor-pan-y') || 0
      );
      const decay = () => {
        cx *= 0.88;
        cy *= 0.88;
        setPan(cx, cy);
        if (Math.abs(cx) > 0.002 || Math.abs(cy) > 0.002) {
          requestAnimationFrame(decay);
        } else {
          setPan(0, 0);
        }
      };
      requestAnimationFrame(decay);
    }, { passive: true });

    /* ── Mobile: deviceorientation (gyroscope) ─────────────── */
    /* Tilt of the phone maps to pan. Only activates if API available. */
    let gyroEnabled = false;

    const tryGyro = () => {
      window.addEventListener('deviceorientation', (e) => {
        if (e.gamma === null || e.beta === null) return;
        gyroEnabled = true;
        /* gamma: left-right tilt (-90 to 90) → pan x */
        /* beta:  front-back tilt (0 to 180)  → pan y (offset from ~45° neutral) */
        const panX = Math.max(-0.5, Math.min(0.5, e.gamma / 40));
        const panY = Math.max(-0.5, Math.min(0.5, (e.beta - 45) / 40));
        setPan(panX, panY);
      }, { passive: true });
    };

    /* iOS 13+ requires permission for deviceorientation */
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      /* Wait for a user gesture, then silently request permission */
      const requestOnce = () => {
        DeviceOrientationEvent.requestPermission().then(state => {
          if (state === 'granted') tryGyro();
        }).catch(() => {});
        document.removeEventListener('touchstart', requestOnce);
      };
      document.addEventListener('touchstart', requestOnce, { once: true, passive: true });
    } else {
      tryGyro();
    }
  }

  /* ============================================================
     PORTAL PARALLAX
     Drives four CSS/title layers inside .threshold at different rates.
     Reads the same scroll progress as the entry animation.
     Sets per-layer CSS vars consumed by composited transforms.
     No layout reads inside the hot path.
     ============================================================ */

  function initPortalParallax() {
    if (prefersReducedMotion()) return;
    if (!threshold) return;

    const layers = Array.from(threshold.querySelectorAll('[data-parallax-layer]'));
    const passageTitle = threshold.querySelector('.portal-layer__title');
    const clamp01 = value => Math.max(0, Math.min(1, value));
    let targetProgress = 0;
    let renderedProgress = 0;
    let animationFrame = 0;

    // Match the reference component's four independent scrub distances.
    const layerTravel = { '1': 70, '2': 55, '3': 40, '4': 10 };

    const render = () => {
      const delta = targetProgress - renderedProgress;
      renderedProgress += delta * 0.16;

      if (Math.abs(delta) < 0.001) renderedProgress = targetProgress;
      const p = renderedProgress;

      layers.forEach(layer => {
        const distance = layerTravel[layer.dataset.parallaxLayer] || 0;
        layer.style.setProperty('--parallax-y', `${(p * distance).toFixed(2)}%`);
      });

      // Hold the portfolio copy back until the visitor is nearly through.
      const copyProgress = clamp01((p - 0.8) / 0.2);
      const copyReveal = easeInOutCubic(copyProgress);
      if (meZone) meZone.style.setProperty('--me-copy-reveal', copyReveal.toFixed(4));

      if (passageTitle) {
        const fadeIn = easeInOutCubic(clamp01((p - 0.56) / 0.16));
        const fadeOut = easeInOutCubic(clamp01((0.98 - p) / 0.14));
        passageTitle.style.setProperty('--passage-title-opacity', (fadeIn * fadeOut).toFixed(4));
      }

      if (renderedProgress !== targetProgress) {
        animationFrame = requestAnimationFrame(render);
      } else {
        animationFrame = 0;
      }
    };

    window._updatePortalParallax = progress => {
      targetProgress = clamp01(progress);
      if (!animationFrame) animationFrame = requestAnimationFrame(render);
    };
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
      const vh = portalViewportHeight;
      const y  = window.scrollY;
      
      document.documentElement.style.setProperty('--scroll-y', `${y}px`);
      
      const mobile = window.matchMedia('(max-width: 768px)').matches;
      const endPx = (mobile ? CROSS_END_VH_MOBILE : CROSS_END_VH_DESKTOP) * vh;
      const progress = Math.max(0, Math.min(1, y / endPx));

      /* The layered passage follows the same scroll progress as the entry. */
      if (window._updatePortalParallax) window._updatePortalParallax(progress);

      if (progress < 1) {
        hasLandedAtIntroduction = false;
        introductionLandingY = null;
        introductionLockUntil = 0;
        body.removeAttribute('data-entry-landed');
        if (crossingComplete) {
          crossingComplete = false;
        }
        handlePortalState(y, vh);
        // Zones are all distant while the portal is closed. Avoid measuring
        // every section on every touch-scroll frame; refresh once on entry.
        if (!portalWasCrossing) updateZoneStates(true);
        portalWasCrossing = true;
      } else {
        portalWasCrossing = false;
        if (!crossingComplete) {
          crossingComplete = true;
          setBodyState('inside');
          landOnIntroduction();
        }

        // Keep a fast touch fling from carrying the first view past the
        // introduction while the landing correction is settling.
        if (introductionLandingY !== null && performance.now() < introductionLockUntil) {
          // The guard is only for downward fling overshoot. If the visitor
          // starts scrolling up, release it immediately so the reverse
          // handoff never gets pulled back toward the introduction.
          if (y < introductionLandingY - 1) {
            introductionLandingY = null;
            introductionLockUntil = 0;
            body.removeAttribute('data-entry-landed');
          } else if (y > introductionLandingY + 1) {
            window.scrollTo({ top: introductionLandingY, behavior: 'auto' });
          }
        }
        updateZoneStates(false); // isCrossing = false
      }
    });
  }

  function landOnIntroduction() {
    if (!meZone || hasLandedAtIntroduction) return;

    hasLandedAtIntroduction = true;
    body.setAttribute('data-entry-landed', 'true');
    const headerPosition = portalViewportHeight * 0.22;
    introductionLandingY = Math.max(
      0,
      Math.round(window.scrollY + meZone.getBoundingClientRect().top - headerPosition)
    );
    introductionLockUntil = performance.now() + 420;
    window.scrollTo({ top: introductionLandingY, behavior: 'auto' });
  }

  function handlePortalState(y, vh) {
    if (y < 0.05 * vh) setBodyState('outside');
    else if (y < 0.15 * vh) setBodyState('approaching');
    else if (y < 0.30 * vh) setBodyState('opening');
    else setBodyState('crossing');
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

  function easeInOutCubic(t) {
    const p = Math.max(0, Math.min(1, t));
    return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
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
