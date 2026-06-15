/* ═══════════════════════════════════════════
   GEEKLEARN GAMES — protection.js
   ───────────────────────────────────────────
   Sécurité LÉGÈRE, orientée utilisateur :
     - Honeypot + rate-limit du formulaire de contact (anti-spam réel)
     - window.open durci (noopener/noreferrer) → anti-tabnapping
     - Sanitisation de chaînes pour insertion sûre
     - Message console dissuasif (anti self-XSS / copier-coller)

   NB : le blocage F12 / clic-droit / détection DevTools a été RETIRÉ.
   Sur un site public il ne protège rien (contournable en quelques
   secondes), gêne la presse, les devs et les utilisateurs avancés, et
   pouvait afficher un écran noir lors d'un simple redimensionnement.
   `_glgSetShieldMsg` reste défini (no-op) pour compat avec app.js.
   Chargé dans <head> pour s'exécuter avant toute interaction.
   ═══════════════════════════════════════════ */
(function () {
  'use strict';
  /* Compat : app.js appelle window._glgSetShieldMsg() au changement de langue.
     On garde un no-op pour ne pas lever d'erreur. */
  window._glgShieldMsg = '';
  window._glgSetShieldMsg = function () { /* shield removed — no-op */ };
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
   CONSOLE FINGERPRINT — deters casual self-XSS / paste attacks
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
