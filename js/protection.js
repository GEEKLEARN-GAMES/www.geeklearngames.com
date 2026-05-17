/* ═══════════════════════════════════════════
   GEEKLEARN GAMES — protection.js
   - DevTools detection (no false positives on zoom or mobile)
   - Keyboard shortcut blocking (F12, Ctrl+Shift+I/J/C/K, Ctrl+U)
   - Right-click context menu disabled
   - Shield message is translatable via window._glgSetShieldMsg()
   Loaded in <head> so it fires before any user interaction.
   ═══════════════════════════════════════════ */
(function () {
  'use strict';

  var shieldEl = null;
  /* Default message — overridden by app.js once a language is selected */
  window._glgShieldMsg = 'Access restricted';

  /* ── Allow app.js to push a translated message ─────── */
  window._glgSetShieldMsg = function (msg) {
    window._glgShieldMsg = msg;
    if (shieldEl) {
      var p = shieldEl.querySelector('p');
      if (p) p.textContent = msg;
    }
  };

  /* ── Build the blocking overlay (lazy) ─────────────── */
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
      (window._glgShieldMsg || 'Access restricted') + '</p>';
    document.body.appendChild(shieldEl);
    return shieldEl;
  }

  /* ── DevTools detection — immune to browser zoom ──────
     Key insight:
       • DevTools docked to the SIDE steals window WIDTH only.
         → wDiff is large, hDiff stays near browser-chrome height (≤220px).
       • DevTools docked to the BOTTOM steals window HEIGHT only.
         → hDiff is very large, wDiff is near 0.
       • Browser ZOOM scales both innerWidth AND innerHeight proportionally.
         → Both diffs are large AND wDiff is large (≫ 0), so neither
           condition fires.
       • Touch/mobile devices never have DevTools → always return false.    */
  function devToolsOpen() {
    /* Never block on touch devices (phones/tablets have no DevTools) */
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) return false;
    /* outerWidth/innerWidth may be undefined in some environments */
    if (typeof window.outerWidth === 'undefined') return false;

    var wDiff = window.outerWidth  - window.innerWidth;
    var hDiff = window.outerHeight - window.innerHeight;

    /* DevTools side panel: significant width stolen, normal height diff */
    if (wDiff > 300 && hDiff <= 220) return true;
    /* DevTools bottom panel: significant height stolen, width unchanged */
    if (hDiff > 300 && wDiff <= 20)  return true;

    return false;
  }

  /* ── Show / hide shield ─────────────────────────────── */
  function applyShield() {
    if (devToolsOpen()) {
      var s = getShield();
      s.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    } else {
      if (shieldEl) {
        shieldEl.style.display = 'none';
        /* Restore overflow only when the gate/modals aren't also locking it */
        if (!document.getElementById('lang-gate') ||
            document.getElementById('lang-gate').style.display === 'none') {
          document.documentElement.style.overflow = '';
          document.body.style.overflow = '';
        }
      }
    }
  }

  /* ── Block DevTools keyboard shortcuts ──────────────── */
  document.addEventListener('keydown', function (e) {
    var k    = e.key;
    var ctrl = e.ctrlKey || e.metaKey;
    var shift = e.shiftKey;

    /* F12 */
    if (k === 'F12') { e.preventDefault(); e.stopPropagation(); return false; }

    /* Ctrl/Cmd + Shift + I / J / C / K */
    if (ctrl && shift && /^[ijckIJCK]$/.test(k)) {
      e.preventDefault(); e.stopPropagation(); return false;
    }

    /* Ctrl/Cmd + U (view page source) */
    if (ctrl && !shift && /^[uU]$/.test(k)) {
      e.preventDefault(); e.stopPropagation(); return false;
    }
  }, true);

  /* ── Disable right-click context menu ───────────────── */
  document.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    return false;
  });

  /* ── Poll + resize hook ─────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyShield);
  } else {
    applyShield();
  }
  window.addEventListener('resize', applyShield, { passive: true });
  setInterval(applyShield, 500);

}());

/* ═══════════════════════════════════════════════════════════
   FORM RATE LIMITER
   Max 3 contact-form submissions per 10-minute window
   (tracked per session via sessionStorage).
   ─────────────────────────────────────────────────────────
   Usage:
     const chk = window._glgCheckForm(formEl);
     if (!chk.ok) { ... show error ... return; }
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var MAX   = 3;
  var WIN   = 10 * 60 * 1000; // 10 min
  var MAX_F = 3000;            // max chars per field

  function _log() {
    try { return JSON.parse(sessionStorage.getItem('_glg_fl') || '[]'); }
    catch (e) { return []; }
  }
  function _save(arr) {
    try { sessionStorage.setItem('_glg_fl', JSON.stringify(arr)); } catch (e) {}
  }

  window._glgCheckForm = function (formEl) {
    /* 1 — Honeypot: if the invisible trap field is filled it's a bot */
    var trap = formEl.querySelector('[name="_hp"]');
    if (trap && trap.value.trim() !== '') return { ok: false, reason: 'bot' };

    /* 2 — Rate limit */
    var now = Date.now();
    var log = _log().filter(function (t) { return now - t < WIN; });
    if (log.length >= MAX) return { ok: false, reason: 'rate_limit' };

    /* 3 — Truncate oversized fields silently */
    formEl.querySelectorAll('input, textarea').forEach(function (el) {
      if (el.value.length > MAX_F) el.value = el.value.slice(0, MAX_F);
    });

    /* 4 — Record */
    log.push(now);
    _save(log);
    return { ok: true };
  };

  /* Sanitise a string for safe textContent insertion */
  window._glgSanitize = function (str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;').replace(/\//g, '&#x2F;');
  };
}());

/* ═══════════════════════════════════════════════════════════
   EXTERNAL LINK SECURITY — noopener + noreferrer
   Patches window.open so every call to an external URL
   automatically gets security flags, preventing the opened
   tab from accessing window.opener (tabnapping attack).
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var _orig = window.open.bind(window);
  window.open = function (url, target, features) {
    if (url && /^https?:\/\//i.test(url)) {
      features = (features ? features + ',' : '') + 'noopener,noreferrer';
    }
    return _orig(url, target || '_blank', features);
  };
}());

/* ═══════════════════════════════════════════════════════════
   CONSOLE FINGERPRINT — deters casual script-kiddie attacks
   ═══════════════════════════════════════════════════════════ */
try {
  console.log(
    '%c⚠  GEEKLEARN GAMES',
    'font-size:15px;font-weight:bold;color:#fff;background:#000;padding:4px 10px'
  );
  console.log(
    '%cThis console is for developers. Do not paste code here — it may allow attackers to steal your session or data.',
    'color:#888;font-size:11px'
  );
} catch (e) {}
