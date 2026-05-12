/* ═══════════════════════════════════════════
   GEEKLEARN GAMES — protection.js
   Site protection: DevTools detection,
   keyboard shortcut blocking.
   Loaded in <head> so it fires before
   any user interaction.
   ═══════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Detection thresholds ───────────────────
     Browser chrome (toolbars, scrollbars) takes
     ~80–100 px. 200 px gives safe headroom above
     that while still catching docked DevTools.   */
  var W = 200, H = 200;
  var shieldEl = null;

  /* ── Build the blocking overlay ─────────── */
  function getShield() {
    if (shieldEl) return shieldEl;
    shieldEl = document.createElement('div');
    shieldEl.id = '_glg_shield';
    shieldEl.setAttribute('aria-hidden', 'true');
    shieldEl.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;background:#000;' +
      'display:none;align-items:center;justify-content:center;' +
      'flex-direction:column;gap:20px;pointer-events:all;' +
      'user-select:none;-webkit-user-select:none';
    shieldEl.innerHTML =
      '<img src="assets/images/logo/GEEKLEARN_GAMES_NEW_LOGO_V4_WHITE.png"' +
      ' alt="GLG" style="height:42px;opacity:.65;pointer-events:none;display:block">' +
      '<p style="font-family:monospace;font-size:10px;letter-spacing:.3em;' +
      'color:rgba(255,255,255,.25);text-transform:uppercase;margin:0">' +
      'Access restricted</p>';
    document.body.appendChild(shieldEl);
    return shieldEl;
  }

  /* ── Check if DevTools is docked/open ───── */
  function devToolsOpen() {
    return (
      window.outerWidth  - window.innerWidth  > W ||
      window.outerHeight - window.innerHeight > H
    );
  }

  /* ── Show / hide shield ─────────────────── */
  function applyShield() {
    /* Only run on real browsers with window sizing */
    if (typeof window.outerWidth === 'undefined') return;

    if (devToolsOpen()) {
      var s = getShield();
      s.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    } else {
      if (shieldEl) {
        shieldEl.style.display = 'none';
        /* Restore overflow only when the gate/modals aren't already locking it */
        if (!document.getElementById('lang-gate') ||
            document.getElementById('lang-gate').style.display === 'none') {
          document.documentElement.style.overflow = '';
          document.body.style.overflow = '';
        }
      }
    }
  }

  /* ── Block DevTools keyboard shortcuts ──── */
  document.addEventListener('keydown', function (e) {
    var k = e.key;
    var ctrl = e.ctrlKey || e.metaKey;
    var shift = e.shiftKey;

    /* F12 */
    if (k === 'F12') { e.preventDefault(); e.stopPropagation(); return false; }

    /* Ctrl/Cmd + Shift + I / J / C / K  (open DevTools panels) */
    if (ctrl && shift && /^[ijckIJCK]$/.test(k)) {
      e.preventDefault(); e.stopPropagation(); return false;
    }

    /* Ctrl/Cmd + U  (view page source) */
    if (ctrl && !shift && /^[uU]$/.test(k)) {
      e.preventDefault(); e.stopPropagation(); return false;
    }
  }, true /* capture: fires before any element handler */);

  /* ── Poll continuously ───────────────────── */
  /* Runs check at page load and on every resize so opening/docking
     DevTools is caught as soon as the window dimensions change.      */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyShield);
  } else {
    applyShield();
  }
  window.addEventListener('resize', applyShield, { passive: true });
  setInterval(applyShield, 500);

}());
