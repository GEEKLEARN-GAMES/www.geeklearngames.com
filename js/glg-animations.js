/*!
 * GEEKLEARN GAMES — glg-animations.js
 * ─────────────────────────────────────────────────────────────
 * GSAP + ScrollTrigger — cinematic AAA studio animations
 * Depends on: gsap.min.js + ScrollTrigger.min.js (CDN, deferred)
 * Listens for:  glg:site-built   → full init
 *               glg:page-changed → refresh triggers + page enter
 * ─────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  /* ── Bail if GSAP not available ─────────────────────────── */
  const waitForGSAP = (cb, tries = 0) => {
    if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') return cb();
    if (tries > 40) return; // give up after ~2s
    setTimeout(() => waitForGSAP(cb, tries + 1), 50);
  };

  /* ── Respect prefers-reduced-motion ─────────────────────── */
  const MOTION = !window.matchMedia('(prefers-reduced-motion:reduce)').matches;

  /* ── Shared ease ─────────────────────────────────────────── */
  const E  = 'power3.out';
  const E2 = 'power2.out';

  /* ═══════════════════════════════════════════════════════════
     1. HERO ENTRANCE — staggered sequence
  ═══════════════════════════════════════════════════════════ */
  function animHero() {
    if (!MOTION) return;
    if (!document.getElementById('page-home')?.classList.contains('active')) return;

    // Reset all hero elements
    gsap.set(['.hero-eyebrow', '.hero-slogan', '.hero-desc', '.hero-btns', '.hero-scroll'],
      { opacity: 0, y: 28, willChange: 'transform, opacity' });

    const tl = gsap.timeline({ delay: 0.15 });
    tl.to('.hero-eyebrow', { opacity: 1, y: 0, duration: 0.6, ease: E })
      .to('.hero-slogan',  { opacity: 1, y: 0, duration: 0.85, ease: E }, '-=0.35')
      .to('.hero-desc',    { opacity: 1, y: 0, duration: 0.55, ease: E2 }, '-=0.45')
      .to('.hero-btns',    { opacity: 1, y: 0, duration: 0.5,  ease: E2 }, '-=0.38')
      .to('.hero-scroll',  { opacity: 0.35, y: 0, duration: 0.4, ease: E2 }, '-=0.3');
  }

  /* ═══════════════════════════════════════════════════════════
     2. STATS BAND — stagger from bottom
  ═══════════════════════════════════════════════════════════ */
  function animStats() {
    if (!MOTION) return;
    const band = document.querySelector('.glg-stats-band');
    if (!band) return;

    gsap.from('.glg-stat-item', {
      scrollTrigger: { trigger: band, start: 'top 87%', once: true },
      y: 35, opacity: 0, duration: 0.55, ease: E, stagger: 0.1
    });
  }

  /* ═══════════════════════════════════════════════════════════
     3. SHOWCASE HEADER + PUZZLE STRIPS — alternating entry
  ═══════════════════════════════════════════════════════════ */
  function animShowcase() {
    if (!MOTION) return;

    // Header
    gsap.from('.showcase-header', {
      scrollTrigger: { trigger: '.showcase-section', start: 'top 85%', once: true },
      y: 40, opacity: 0, duration: 0.75, ease: E
    });

    // Each strip slides in from alternating sides
    document.querySelectorAll('.puz-strip-row').forEach((row, i) => {
      gsap.from(row, {
        scrollTrigger: { trigger: row, start: 'top 92%', once: true },
        x: i % 2 === 0 ? -50 : 50,
        opacity: 0,
        duration: 0.85,
        ease: E,
        delay: 0.05 * i
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════
     4. GLG BAND — label reveal
  ═══════════════════════════════════════════════════════════ */
  function animGLGBand() {
    if (!MOTION) return;
    document.querySelectorAll('.glg-band-label').forEach(lbl => {
      gsap.from(lbl, {
        scrollTrigger: { trigger: lbl, start: 'top 90%', once: true },
        opacity: 0, y: 10, duration: 0.5, ease: E2
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════
     5. STUDIO BLOCK — split entry: quote left, themes right
  ═══════════════════════════════════════════════════════════ */
  function animStudio() {
    if (!MOTION) return;
    const block = document.querySelector('.studio-block');
    if (!block) return;

    const trigger = { trigger: block, start: 'top 82%', once: true };

    gsap.from('.studio-quote',  { scrollTrigger: trigger, x: -40, opacity: 0, duration: 0.85, ease: E });
    gsap.from('.studio-body p', { scrollTrigger: trigger, y: 20,  opacity: 0, duration: 0.55, ease: E2, stagger: 0.12, delay: 0.2 });
    gsap.from('.studio-theme-item', { scrollTrigger: trigger, x: 35, opacity: 0, duration: 0.5, ease: E, stagger: 0.1, delay: 0.15 });
  }

  /* ═══════════════════════════════════════════════════════════
     6. CTA BAND — scale-up reveal
  ═══════════════════════════════════════════════════════════ */
  function animCTA() {
    if (!MOTION) return;
    const cta = document.querySelector('.glg-cta-band');
    if (!cta) return;

    const trigger = { trigger: cta, start: 'top 80%', once: true };

    gsap.from('#cta-eye, #cta-title, #cta-desc', {
      scrollTrigger: trigger,
      y: 30, opacity: 0, duration: 0.7, ease: E, stagger: 0.12
    });
    gsap.from('#cta-btn1, #cta-btn2', {
      scrollTrigger: trigger,
      y: 20, opacity: 0, duration: 0.5, ease: E2, stagger: 0.1, delay: 0.35
    });
  }

  /* ═══════════════════════════════════════════════════════════
     7. WORKS PAGE — category headers + card stagger
  ═══════════════════════════════════════════════════════════ */
  function animWorks() {
    if (!MOTION) return;

    // Category headers
    document.querySelectorAll('.works-cat-title').forEach(h => {
      gsap.from(h, {
        scrollTrigger: { trigger: h, start: 'top 88%', once: true },
        y: 35, opacity: 0, duration: 0.7, ease: E
      });
    });
    document.querySelectorAll('.works-cat-label').forEach(l => {
      gsap.from(l, {
        scrollTrigger: { trigger: l, start: 'top 90%', once: true },
        y: 15, opacity: 0, duration: 0.45, ease: E2
      });
    });

    // Initial visible cards entrance
    document.querySelectorAll('.carousel-viewport').forEach(vp => {
      const cards = vp.querySelectorAll('.c-card');
      if (!cards.length) return; // cards not built yet — skip (avoids empty-target warning)
      gsap.from(cards, {
        scrollTrigger: { trigger: vp, start: 'top 88%', once: true },
        y: 25, opacity: 0, duration: 0.45, ease: E2,
        stagger: { amount: 0.35, from: 'start' }
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════
     8. ABOUT PAGE
  ═══════════════════════════════════════════════════════════ */
  function animAbout() {
    if (!MOTION) return;

    // About hero heading
    gsap.from('#about-title, #about-eye, #about-desc', {
      scrollTrigger: { trigger: '.about-hero', start: 'top 85%', once: true },
      y: 30, opacity: 0, duration: 0.65, ease: E, stagger: 0.12
    });

    // Team cards
    document.querySelectorAll('.cm-card').forEach((card, i) => {
      gsap.from(card, {
        scrollTrigger: { trigger: card, start: 'top 88%', once: true },
        y: 40, opacity: 0, duration: 0.7, ease: E, delay: i * 0.1
      });
    });

    // Manifesto quote
    gsap.from('.about-manifesto-quote', {
      scrollTrigger: { trigger: '.about-manifesto', start: 'top 80%', once: true },
      y: 20, opacity: 0, duration: 0.8, ease: E
    });
  }

  /* ═══════════════════════════════════════════════════════════
     9. CONTACT PAGE
  ═══════════════════════════════════════════════════════════ */
  function animContact() {
    if (!MOTION) return;

    gsap.from('.contact-hero-h, .contact-eye-lbl, .contact-hero-desc', {
      scrollTrigger: { trigger: '.contact-hero', start: 'top 85%', once: true },
      y: 30, opacity: 0, duration: 0.65, ease: E, stagger: 0.1
    });

    gsap.from('.contact-promises', {
      scrollTrigger: { trigger: '.contact-promises', start: 'top 88%', once: true },
      y: 20, opacity: 0, duration: 0.5, ease: E2
    });

    gsap.from('.contact-form-col, .contact-info-col', {
      scrollTrigger: { trigger: '.contact-layout', start: 'top 85%', once: true },
      y: 25, opacity: 0, duration: 0.6, ease: E, stagger: 0.12
    });
  }

  /* ═══════════════════════════════════════════════════════════
     10. FOOTER — stagger columns
  ═══════════════════════════════════════════════════════════ */
  function animFooter() {
    if (!MOTION) return;
    if (!document.querySelector('.footer-col')) return; // no footer on this page yet

    gsap.from('.footer-col', {
      scrollTrigger: { trigger: '.footer-inner', start: 'top 90%', once: true },
      y: 22, opacity: 0, duration: 0.5, ease: E2, stagger: 0.08
    });
  }

  /* ═══════════════════════════════════════════════════════════
     11. PAGE TRANSITION — smooth enter
  ═══════════════════════════════════════════════════════════ */
  function animPageEnter(pageEl) {
    if (!MOTION || !pageEl) return;
    gsap.fromTo(pageEl,
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: 0.45, ease: E2, clearProps: 'transform,opacity',
        onComplete: () => ScrollTrigger.refresh() }
    );
  }

  /* ═══════════════════════════════════════════════════════════
     SAFETY — kill triggers WITHOUT leaving elements hidden
     ─────────────────────────────────────────────────────────
     gsap.from() immediately sets its targets to opacity:0 (the
     "from" state) and waits for the ScrollTrigger to fire. If the
     user navigates away before scrolling that element into view,
     the trigger is killed BEFORE it fires — and a plain .kill()
     does NOT restore the inline styles, so the element stays
     invisible forever. THIS is the "text/buttons disappear after
     browsing a while" bug.
     Reverting each tween before killing restores the natural state,
     so the worst case becomes "visible, just not animated" — never
     "stuck invisible".
  ═══════════════════════════════════════════════════════════ */
  function killTriggers() {
    ScrollTrigger.getAll().forEach(t => {
      const tween = t.animation;
      // Force any reveal tween to its FINAL (fully-visible) state BEFORE killing.
      // t.kill() kills the attached tween at its CURRENT value, so if we killed
      // first an in-between fade would be frozen (e.g. opacity:0.49) — and a tween
      // that never fired would freeze at opacity:0 (the "disappearing text" bug).
      // progress(1) guarantees the element ends visible no matter what.
      if (tween && typeof tween.progress === 'function') {
        try { tween.progress(1); } catch (e) { /* noop */ }
      }
      t.kill();
    });
  }

  /* Reveal-target selectors per page — used to GUARANTEE visibility on re-visits. */
  const _PAGE_SELECTORS = {
    home: ['.hero-eyebrow','.hero-slogan','.hero-desc','.hero-btns','.glg-stat-item','.showcase-header','.puz-strip-row','.glg-band-label','.studio-quote','.studio-body p','.studio-theme-item','#cta-eye','#cta-title','#cta-desc','#cta-btn1','#cta-btn2'],
    works:   ['.works-cat-title','.works-cat-label','.c-card'],
    about:   ['#about-title','#about-eye','#about-desc','.cm-card','.about-manifesto-quote'],
    contact: ['.contact-hero-h','.contact-eye-lbl','.contact-hero-desc','.contact-promises','.contact-form-col','.contact-info-col'],
  };

  /* Force every reveal target on a page to its visible resting state (no animation). */
  function ensurePageVisible(name) {
    const sels = (_PAGE_SELECTORS[name] || []).filter(s => document.querySelector(s));
    if (sels.length) { try { gsap.set(sels.join(','), { opacity: 1, x: 0, y: 0, clearProps: 'transform,willChange' }); } catch (e) {} }
    if (document.querySelector('.footer-col')) { try { gsap.set('.footer-col', { opacity: 1, clearProps: 'transform,willChange' }); } catch (e) {} }
    if (document.querySelector('.hero-scroll')) { try { gsap.set('.hero-scroll', { opacity: 0.35, clearProps: 'transform' }); } catch (e) {} }
  }

  /* ── FAILSAFE — nothing may ever stay invisible ──────────────────
     A few seconds after a page is shown, any reveal target / .reveal
     element still stranded at opacity ~0 (a ScrollTrigger that never
     fired) is force-revealed. Pure safety net: when reveals fire
     normally it's a no-op (elements are already visible).            */
  let _failsafeT = null;
  function scheduleRevealFailsafe(name) {
    clearTimeout(_failsafeT);
    _failsafeT = setTimeout(() => {
      const page = document.getElementById('page-' + (name === 'detail' ? 'detail' : name)) ||
                   document.querySelector('.page.active');
      // 1) Known GSAP reveal selectors for this page
      ensurePageVisible(name);
      // 2) Any element carrying an inline opacity near 0 inside the active page
      if (page) {
        page.querySelectorAll('[style*="opacity"]').forEach(el => {
          const o = parseFloat(el.style.opacity);
          if (!isNaN(o) && o < 0.05 && !el.matches('.hero-scroll')) {
            el.style.removeProperty('opacity');
            el.style.removeProperty('transform');
          }
        });
        // 3) CSS .reveal class fallback (in case the observer missed them)
        page.querySelectorAll('.reveal:not(.visible)').forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.top < window.innerHeight * 1.4) el.classList.add('visible');
        });
      }
    }, 1600);
  }

  /* Animate a page's reveals the FIRST time it's shown; afterwards just keep it visible.
     Re-hiding on every visit is what let rapid navigation strand elements at opacity:0,
     so we never re-hide — content can only ever end up visible. */
  const _animDone = {};
  function runPageAnims(name) {
    if (_animDone[name]) { ensurePageVisible(name); return; }
    _animDone[name] = true;
    if (name === 'home') {
      animHero(); animStats(); animShowcase(); animGLGBand(); animStudio(); animCTA();
    } else if (name === 'works')   { animWorks(); }
    else if (name === 'about')     { animAbout(); }
    else if (name === 'contact')   { animContact(); }
    // 'detail' has no scroll-reveal tweens of its own (page-enter handles it)
    animFooter();
  }

  /* ═══════════════════════════════════════════════════════════
     INIT ALL — called once site DOM is built
  ═══════════════════════════════════════════════════════════ */
  function initAll() {
    killTriggers();
    setTimeout(() => {
      const active = document.querySelector('.page.active');
      const name = active ? active.id.replace('page-', '') : 'home';
      runPageAnims(name);
      ScrollTrigger.refresh();
      scheduleRevealFailsafe(name);
    }, 120);
  }

  /* ═══════════════════════════════════════════════════════════
     LISTENERS
  ═══════════════════════════════════════════════════════════ */
  function setup() {
    gsap.registerPlugin(ScrollTrigger);

    // Default settings
    gsap.defaults({ ease: E, duration: 0.7 });

    // ScrollTrigger defaults
    ScrollTrigger.defaults({ markers: false });

    document.addEventListener('glg:site-built', initAll);

    document.addEventListener('glg:page-changed', e => {
      const { name, el } = e.detail || {};
      animPageEnter(el);

      // Re-run page-specific animations with slight delay.
      // killTriggers() first reverts every tween so nothing is left
      // stuck at opacity:0 from a trigger that never fired.
      setTimeout(() => {
        killTriggers();
        runPageAnims(name);
        ScrollTrigger.refresh();
      }, 200);

      // Safety net: guarantee no element stays invisible.
      scheduleRevealFailsafe(name);
    });
  }

  /* ═══════════════════════════════════════════════════════════
     LENIS SMOOTH SCROLL (optional enhancement)
     If Lenis is loaded, wire it to GSAP ticker.
  ═══════════════════════════════════════════════════════════ */
  function initLenis() {
    if (typeof Lenis === 'undefined') return;
    try {
      const lenis = new Lenis({
        duration:        0.9,
        easing:          t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        wheelMultiplier: 1.0,
        touchMultiplier: 1.8,
        syncTouch:       false,
        smoothTouch:     false,
        smoothWheel:     true,
      });
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(time => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
      // Make lenis accessible for page-nav scroll-to-top calls
      window._lenis = lenis;
    } catch(e) {
      // Lenis failed gracefully — native scroll remains
    }
  }

  waitForGSAP(() => { setup(); initLenis(); });
})();
