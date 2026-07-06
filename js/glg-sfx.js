/* ══════════════════════════════════════════════════════════════════════
   GLG_SFX — sons d'interface synthétisés (WebAudio, ZÉRO asset audio).
   OPT-IN : coupé par défaut, activé via Options → Personnalisation
   (préférence `prefs.sfx` du profil, miroir localStorage pour le boot).
   Étape launcher : mêmes hooks dans le futur wrapper standalone.

   Design sonore : très discret (master −16 dB env.), timbres courts
   sine/triangle — un "tic" de survol, une impulsion de clic, une tierce
   ascendante de confirmation. Jamais de sample : tout est généré, donc
   invariant au cache, au réseau et au bundle.
══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  let ctx = null, master = null, enabled = false, lastTick = 0;

  function _ctx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.16; // plafond global : toujours discret
      master.connect(ctx.destination);
    }
    // Les navigateurs suspendent l'AudioContext créé hors geste utilisateur
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  /* Oscillateur unique + enveloppe courte. `slide` = glissando de fréquence. */
  function blip(freq, dur, type, vol, delay, slide) {
    const c = _ctx(); if (!c) return;
    const t0 = c.currentTime + (delay || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol || 0.5, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  const SOUNDS = {
    tick:    () => blip(2600, 0.045, 'sine', 0.16),                                   // survol
    press:   () => { blip(340, 0.07, 'triangle', 0.5); blip(1200, 0.05, 'sine', 0.18, 0.004); }, // clic
    confirm: () => { blip(660, 0.09, 'sine', 0.4); blip(990, 0.12, 'sine', 0.32, 0.07); },       // succès
    toggle:  () => blip(880, 0.06, 'triangle', 0.35, 0, 660),                          // interrupteur
    heart:   () => blip(520, 0.08, 'sine', 0.4, 0, 780),                               // wishlist
  };

  function play(name) {
    if (!enabled) return;
    if (name === 'tick') { // anti-mitraillette au survol de grilles
      const n = performance.now();
      if (n - lastTick < 90) return;
      lastTick = n;
    }
    try { (SOUNDS[name] || SOUNDS.press)(); } catch (e) {}
  }

  function setEnabled(on) {
    enabled = !!on;
    try { localStorage.setItem('glg_sfx', enabled ? '1' : '0'); } catch (e) {}
    if (enabled) _ctx(); // créé pendant le geste utilisateur → autoplay policy OK
  }

  try { enabled = localStorage.getItem('glg_sfx') === '1'; } catch (e) {}

  /* Câblage global par DÉLÉGATION (capture) : survit à tous les re-render,
     et ne fait strictement rien tant que `enabled` est faux. */
  const TICK_SEL = '.btn, .nav-link, .c-card, .gate-lang, .set-tab, .shop-deal, .dp-rel-card, .works-filter, .shop-teaser';
  document.addEventListener('pointerenter', (e) => {
    if (!enabled || !(e.target instanceof Element)) return;
    if (e.target.closest(TICK_SEL)) play('tick');
  }, true);
  document.addEventListener('click', (e) => {
    if (!enabled || !(e.target instanceof Element)) return;
    const el = e.target.closest('button, [role="button"], a, input[type="checkbox"]');
    if (!el) return;
    if (el.matches('input[type="checkbox"]')) return play('toggle');
    if (el.closest('[data-wish]')) return play('heart');
    play('press');
  }, true);

  window.GLG_SFX = { play, setEnabled, get enabled() { return enabled; } };
})();
