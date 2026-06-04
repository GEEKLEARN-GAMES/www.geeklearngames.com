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
     INIT ALL — called once site DOM is built
  ═══════════════════════════════════════════════════════════ */
  function initAll() {
    // Kill stale triggers
    ScrollTrigger.getAll().forEach(t => t.kill());

    setTimeout(() => {
      animHero();
      animStats();
      animShowcase();
      animGLGBand();
      animStudio();
      animCTA();
      animWorks();
      animAbout();
      animContact();
      animFooter();
      ScrollTrigger.refresh();
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

      // Re-run page-specific animations with slight delay
      setTimeout(() => {
        ScrollTrigger.getAll().forEach(t => t.kill());
        if (name === 'works')   animWorks();
        if (name === 'about')   animAbout();
        if (name === 'contact') animContact();
        if (name === 'home')    { animStats(); animShowcase(); animStudio(); animCTA(); }
        animFooter();
        ScrollTrigger.refresh();
      }, 200);
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
