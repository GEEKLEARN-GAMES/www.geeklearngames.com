/* ═══════════════════════════════════════════
   GEEKLEARN GAMES — app.js
   ═══════════════════════════════════════════ */
'use strict';

// ── Run before anything else ────────────────
// Tell the browser NOT to restore the previous scroll position on reload.
// Without this, the browser sets scrollY before DOMContentLoaded fires,
// making overflow:hidden and scrollTo(0,0) arrive too late.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

let LANG = 'en';
const t = k => I18N[LANG]?.[k] ?? I18N.en[k] ?? k;

/* True once the user has completed the first language selection and the site
   has fully loaded. Used to show the back button on gate re-opens. */
let _langSelected = false;

/* One-word "back" label per language — no new I18N key needed */
const GATE_BACK_LABELS = {
  fr:'Retour', en:'Back', es:'Volver', de:'Zurück',
  ar:'رجوع',   zh:'返回',  ja:'戻る',  ru:'Назад', pl:'Wróć', it:'Indietro',
};

/* rAF handles for carousel loops — keyed by carousel element id */
const _carouselRAF = {};

/* ── Perf: stop carousel loops when they're not on screen ──
   The auto-scroll loops wrote a transform EVERY frame even when the Works
   page was hidden (or the tab was in the background) — pure wasted work.
   Pause them off-Works and when the tab is hidden; resume on return. */
function pauseCarousels() {
  Object.keys(_carouselRAF).forEach(id => {
    if (_carouselRAF[id]) { cancelAnimationFrame(_carouselRAF[id]); _carouselRAF[id] = null; }
  });
}
document.addEventListener('glg:page-changed', e => {
  if ((e.detail && e.detail.name) !== 'works') pauseCarousels();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseCarousels();
  else if (document.getElementById('page-works')?.classList.contains('active')) buildCarousels();
});

/* ── Currency locale map ── */
const LANG_LOCALE = {
  fr:'fr-FR', en:'en-US', es:'es-ES', de:'de-DE',
  ar:'ar-SA', zh:'zh-CN', ja:'ja-JP', ru:'ru-RU', pl:'pl-PL', it:'it-IT',
};

/* ── Live exchange rates (EUR base) — populated by initFxRates() ── */
let _fxRates = { EUR:1, USD:1.09, CNY:7.87, JPY:161, PLN:4.32, SAR:4.09, RUB:99.5 };

/* Fetch rates from ECB via frankfurter.app — caches 6h in localStorage */
async function initFxRates() {
  const CACHE_KEY = 'glg_fx_v1';
  const TTL = 6 * 3600 * 1000; // 6 hours
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { ts, rates } = JSON.parse(cached);
      if (Date.now() - ts < TTL) { _fxRates = { EUR:1, ...rates }; return; }
    }
  } catch(e) {}
  try {
    const res  = await fetch('https://api.frankfurter.app/latest?from=EUR&to=USD,CNY,JPY,PLN,SAR,RUB');
    if (!res.ok) return;
    const data = await res.json();
    _fxRates = { EUR:1, ...data.rates };
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), rates: data.rates }));
    refreshDisplayedPrices(); // update DOM after rates arrive
  } catch(e) { /* keep fallback rates */ }
}

/* Convert EUR base price to the current language's currency and format it */
function formatPrice(eurAmount, lang) {
  const cur    = LANG_CURRENCY[lang] || 'EUR';
  const rate   = _fxRates[cur] || 1;
  const amount = eurAmount * rate;
  const locale = LANG_LOCALE[lang] || 'en-US';
  const noDecimals = ['JPY'].includes(cur);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency', currency: cur,
      minimumFractionDigits: noDecimals ? 0 : 2,
      maximumFractionDigits: noDecimals ? 0 : 2,
    }).format(amount);
  } catch(e) {
    return amount.toFixed(noDecimals ? 0 : 2) + ' ' + cur;
  }
}

/* Update every .price-display element already in the DOM without full rebuild */
function refreshDisplayedPrices() {
  document.querySelectorAll('.price-display[data-base-price]').forEach(el => {
    const base = parseFloat(el.dataset.basePrice);
    if (!isNaN(base) && base > 0) el.textContent = formatPrice(base, LANG);
  });
}

/* ── Localised price helper ── */
function getPrice(item) {
  if (item.isFree || item.basePrice === 0) return t('free') || 'FREE';
  if (item.basePrice != null) return formatPrice(item.basePrice, LANG);
  return item.price; // legacy fallback
}

/* ── Localised item content helper ── */
// Returns translated field if available for current LANG, else English base
function getItemField(item, field) {
  if (LANG !== 'en' && item.i18n && item.i18n[LANG] && item.i18n[LANG][field] !== undefined) {
    return item.i18n[LANG][field];
  }
  return item[field];
}

/* ── Localised status label ── */
function getStatusLabel(item) {
  if (item.status === 'coming-soon') return t('shopStatus') || 'Coming Soon';
  if (item.status === 'available')   return t('available')  || 'Available';
  return item.statusLabel;
}

/* ── Localised category label ── */
const FILM_LABELS = { fr:'Film Interactif',es:'Film Interactivo',de:'Interaktiver Film',ar:'فيلم تفاعلي',zh:'互动电影',ja:'インタラクティブフィルム',ru:'Интерактивный фильм',pl:'Film Interaktywny',it:'Film Interattivo',en:'Interactive Film' };
const GAME_LABELS = { fr:'Jeu Vidéo',es:'Videojuego',de:'Videospiel',ar:'لعبة فيديو',zh:'电子游戏',ja:'ビデオゲーム',ru:'Видеоигра',pl:'Gra Wideo',it:'Videogioco',en:'Video Game' };
function getCatLabel(item) {
  const map = item.type === 'film' ? FILM_LABELS : GAME_LABELS;
  return map[LANG] || item.cat;
}

/* ── UTILS ── */
const $ = id => document.getElementById(id);
const $$ = sel => [...document.querySelectorAll(sel)];
function setHTML(id, html) { const e = $(id); if(e) e.innerHTML = html; }
function setText(id, txt) { const e = $(id); if(e) e.textContent = txt; }
/* ── Asset cache-busting ──────────────────────────────────────────────
   Visuels d'œuvres (covers/screenshots/logos) référencés SANS ?v= → le
   navigateur les met en cache. Quand tu remplaces les placeholders par du
   VRAI art (même chemin), bumpe ASSET_VER : tous les visuels se rafraîchissent
   d'un coup, sans renommer un seul fichier. `av()` n'ajoute le suffixe qu'aux
   chemins locaux (jamais aux URLs http/data déjà uniques). */
const ASSET_VER = '2026a';
function av(u) {
  if (typeof u !== 'string' || !u) return u;
  if (u.indexOf('?') !== -1 || /^(https?:|data:|blob:)/i.test(u)) return u;
  return u + '?a=' + ASSET_VER;
}
/* "#ff6a00" → "255,106,0" (for rgba() with CSS var). Returns null if invalid. */
function hexToRgb(hex) {
  if (typeof hex !== 'string') return null;
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

/* ══════════════════════════════════════════
   AGE-GATING (18+)
   mature works → hidden from listings for logged-in MINORS,
   gated behind an age confirmation for anonymous visitors,
   unlocked automatically the day the user turns 18 (computed from DOB).
   NB: client-side = UX only. Real enforcement would be server-side.
══════════════════════════════════════════ */
let _siteBuilt = false;
function _currentUserAge() {
  const p = _accountProfile; // kept current by refreshAccountUI()
  if (!p) return null;       // not logged in / unknown age
  if (p.birthdate) { const a = _ageFromDOB(p.birthdate); if (a != null) return a; }
  return (p.age != null) ? p.age : null;
}
/* Hidden from every listing only for a logged-in user known to be < 18 */
function isMatureHidden(item) {
  if (!item || !item.mature) return false;
  const age = _currentUserAge();
  return age != null && age < 18;
}
function filterByAge(list) { return (list || []).filter(w => !isMatureHidden(w)); }
/* Detail access: 'ok' | 'blocked' (logged-in minor) | 'gate' (anon, needs confirm) */
function ageGateState(item) {
  if (!item || !item.mature) return 'ok';
  const age = _currentUserAge();
  if (age != null) return age >= 18 ? 'ok' : 'blocked';
  try { if (sessionStorage.getItem('glg_age_ok') === '1') return 'ok'; } catch (e) {}
  return 'gate';
}
function confirmAdult() {
  try { sessionStorage.setItem('glg_age_ok', '1'); } catch (e) {}
}
/* Rebuild the age-sensitive surfaces after an auth change */
function _refreshAgeGated() {
  if (!_siteBuilt) return;
  try { buildFeaturedWork(); buildCarousels(); initWorksFilters(); } catch (e) {}
}

/* ══════════════════════════════════════════
   LANGUAGE GATE
══════════════════════════════════════════ */

// True crossfade — two stacked imgs per element, swap which slot is on top.
// KEY FIX: mouseleave on the GRID CONTAINER only — prevents EN→FR→DE triple-fire.
let _rainActiveSlot  = 'a';
let _rainCurrentCode = null;
// Wash uses the container's own background directly — no child slots needed.
// This guarantees the correct gradient is always painted BEFORE the container
// becomes visible, eliminating any "wrong-language gradient bleed on first hover".
let _washCurrentCode = null;

// Flag-layout-accurate gradients — each matches the actual flag's colour disposition.
// Used for the ambient colour wash that blooms behind the gate on hover.
const GATE_GLOW = {
  // Vertical tricolore: blue-left → faint white → red-right
  fr: 'linear-gradient(90deg, rgba(0,55,164,.18) 0%, rgba(255,255,255,.04) 50%, rgba(237,41,57,.18) 100%)',
  // Union Jack: ~60% blue field → red cross accent — use lighter blue so it reads on black
  en: 'radial-gradient(ellipse 88% 70% at 50% 46%, rgba(45,100,230,.22) 0%, rgba(0,36,125,.18) 40%, rgba(200,16,46,.10) 72%, transparent 92%)',
  // Horizontal bands: red top/bottom, gold centre
  es: 'linear-gradient(180deg, rgba(198,11,30,.16) 0%, rgba(240,185,11,.20) 50%, rgba(198,11,30,.16) 100%)',
  // Horizontal bands: near-black top, red centre, gold bottom
  de: 'linear-gradient(180deg, rgba(12,12,12,.22) 0%, rgba(220,0,0,.16) 50%, rgba(255,200,0,.18) 100%)',
  // Solid emerald radial
  ar: 'radial-gradient(ellipse 70% 58% at 50% 46%, rgba(0,122,61,.24) 0%, rgba(0,90,40,.08) 60%, transparent 82%)',
  // Red field — pure vivid Chinese red, NO yellow (yellow + red → orange on dark bg)
  zh: 'radial-gradient(ellipse 85% 68% at 50% 46%, rgba(222,41,16,.28) 0%, rgba(200,28,10,.18) 52%, transparent 82%)',
  // Hi-no-Maru: two-layer composite.
  // Layer 1 — the red disc: 15%×25% ratio compensates 16:9 aspect → looks circular on screen.
  // Layer 2 — the white field: boosted to .15 opacity so it's distinctly visible (like FR white band).
  ja: 'radial-gradient(ellipse 15% 25% at 50% 46%, rgba(215,0,38,.62) 0%, rgba(190,0,45,.20) 50%, transparent 68%), radial-gradient(ellipse 88% 72% at 50% 46%, rgba(252,242,242,.15) 0%, rgba(238,224,224,.06) 52%, transparent 84%)',
  // Horizontal bands: faint white top, blue centre, red bottom
  ru: 'linear-gradient(180deg, rgba(220,220,220,.04) 0%, rgba(0,57,166,.18) 50%, rgba(210,43,30,.18) 100%)',
  // Horizontal halves: faint white top, red bottom
  pl: 'linear-gradient(180deg, rgba(220,220,220,.04) 0%, rgba(220,20,60,.22) 100%)',
  // Vertical tricolore: green-left → faint white → red-right
  it: 'linear-gradient(90deg, rgba(0,146,70,.18) 0%, rgba(255,255,255,.04) 50%, rgba(206,43,55,.18) 100%)',
};

function setGateRainFlag(code) { /* flag rain removed — ambient handled by gate-wash */ }

// Wash — gradient is set directly on #gate-wash (no child slots).
// The container's own opacity (CSS transition) handles the fade in/out.
// Correct gradient is always painted synchronously BEFORE the container fades in,
// so the user can never see a "stale" or wrong-language gradient.
function setGateWash(code) {
  const wash = $('gate-wash');
  if (!wash) return;
  if (code) {
    if (code !== _washCurrentCode) {
      wash.style.background = GATE_GLOW[code] || '';
      _washCurrentCode = code;
    }
    wash.classList.add('gate-wash--active');
  } else {
    wash.classList.remove('gate-wash--active');
    _washCurrentCode = null;
  }
}

/* Live system clock in the gate HUD (boot-screen feel). Runs only while the
   gate is visible — stopped on selection / close to avoid a stray timer. */
let _gateClockTimer = null;
function _startGateClock() {
  const el = $('gate-clock'); if (!el) return;
  _stopGateClock();
  const tick = () => { try { el.textContent = new Date().toLocaleTimeString('en-GB'); } catch (e) {} };
  tick();
  _gateClockTimer = setInterval(tick, 1000);
}
function _stopGateClock() { if (_gateClockTimer) { clearInterval(_gateClockTimer); _gateClockTimer = null; } }

function buildGate() {
  const wrap = $('gate-langs');
  if (!wrap) return;

  // ── Ambient colour wash (created once) ──────────────────────────
  if (!$('gate-wash')) {
    const gate = $('lang-gate');
    if (gate) {
      const wash = document.createElement('div');
      wash.id = 'gate-wash';
      wash.setAttribute('aria-hidden', 'true');
      gate.insertBefore(wash, gate.firstChild);
      _washCurrentCode = null;
    }
  }

  // ── Render flag mosaic buttons ──────────────────────────────────
  wrap.innerHTML = LANG_GATE.map((l, i) => `
    <button class="gate-lang" data-code="${l.code}"
            onclick="selectLang('${l.code}')" aria-label="${l.label}"
            style="touch-action:manipulation;--gi:${i}">
      <img class="gate-flag-img"
           src="assets/img/flags/${l.code}.svg"
           alt="${l.label}" decoding="async"
           onerror="this.style.opacity='0'">
      <div class="gate-lang-overlay"></div>
      <div class="gate-lang-info">
        <span class="gate-lang-name">${l.label}</span>
        <span class="gate-lang-code">${l.code.toUpperCase()}</span>
      </div>
      <span class="gate-lang-go" aria-hidden="true">→</span>
    </button>
  `).join('');

  _startGateClock(); // live system clock in the HUD

  // ── Hover: dim others + crossfade wash ──────────────────────────
  // mouseleave on the GRID CONTAINER — moving between buttons never fires
  // an intermediate reset (was the EN→FR→DE triple-fire crossfade bug).
  const btns = wrap.querySelectorAll('.gate-lang');

  function activateFlag(code) {
    setGateWash(code); // gradient is set synchronously, THEN container fades in via CSS
  }
  function deactivateFlag() {
    btns.forEach(b => b.classList.remove('dimmed'));
    setGateWash(null); // container fades out (1.4 s CSS transition)
  }

  btns.forEach(btn => {
    // Mouse hover
    btn.addEventListener('mouseenter', () => {
      btns.forEach(b => { if (b !== btn) b.classList.add('dimmed'); });
      activateFlag(btn.dataset.code);
    });
    // Touch: activate wash + rain on finger-down for instant feedback
    btn.addEventListener('touchstart', () => {
      btns.forEach(b => { if (b !== btn) b.classList.add('dimmed'); });
      activateFlag(btn.dataset.code);
    }, { passive: true });
  });

  // Mouse leaves the grid → reset everything
  wrap.addEventListener('mouseleave', deactivateFlag);

  // Touch ends without a click (drag / accidental tap) → fade wash back out
  // Short delay so the wash is still visible during the tap animation
  wrap.addEventListener('touchend', () => {
    setTimeout(deactivateFlag, 320);
  }, { passive: true });
}

function selectLang(code) {
  LANG = code;
  _stopGateClock(); // gate is about to close
  document.documentElement.lang = code;
  document.documentElement.dir = code === 'ar' ? 'rtl' : 'ltr';

  // Visual feedback on clicked button — highlight selected, dim the rest
  // .selected restores saturation on mobile (where :hover doesn't exist)
  document.querySelectorAll('.gate-lang').forEach(b => {
    b.classList.toggle('dimmed',    b.dataset.code !== code);
    b.classList.toggle('selected',  b.dataset.code === code);
  });

  // Update nav flag to the chosen language
  const flagSrc = `assets/img/flags/${code}.svg`;
  const f1 = $('nav-lang-flag');        if (f1) { f1.src = flagSrc; f1.alt = code.toUpperCase(); }
  const f2 = $('nav-lang-flag-mobile'); if (f2) { f2.src = flagSrc; f2.alt = code.toUpperCase(); }
  const lb = $('nml-lang-label');       if (lb) lb.textContent = t('langChange') || 'Change Language';
  const sl = $('nml-search-label');     if (sl) sl.textContent = t('searchLabel') || 'Search';
  // Update protection-shield message to current language
  if (typeof window._glgSetShieldMsg === 'function') {
    window._glgSetShieldMsg(t('accessRestricted') || 'Access restricted');
  }

  const gate = $('lang-gate');
  const loader = $('loader');

  // ── Show loader instantly, fully covering the gate ──────────────────────
  // KEY: after the forced reflow we CLEAR the inline opacity so that CSS
  // classes (.show / .fade) have exclusive control.  Leaving an inline
  // opacity:1 would silently block the CSS fade-out — the class would set
  // opacity:0 but the inline value always wins, so the loader never fades.
  loader.classList.remove('fade');         // clean state from any previous load
  loader.style.display      = 'flex';     // override display:none from previous load
  loader.style.transition   = 'none';     // instant — no animation on appear
  loader.style.opacity      = '1';        // snap to opaque
  loader.offsetHeight;                    // flush reflow → browser commits the above
  loader.style.transition   = '';         // restore (CSS class transition takes over)
  loader.style.opacity      = '';         // ← clear inline: CSS classes now own opacity
  loader.classList.add('show');           // .show = opacity:1 via CSS (no inline conflict)

  // Now it is safe to fade the gate — the loader is already covering the page
  gate.classList.add('out');

  setTimeout(() => {
    gate.style.display = 'none';
    gate.classList.remove('gate--has-back'); // clean up back-button state
    document.documentElement.style.overflow = ''; // re-enable scrolling (iOS Safari fix)
    document.body.style.overflow = '';

    // ── Build the entire page WHILE the loader is still fully opaque ──────────
    // This guarantees the fade reveals a complete, rendered page instead of
    // fading to a blank/half-built layout that then pops into existence.
    applyTranslations();
    initSite();          // includes window.scrollTo({top:0}) internally
    initFxRates();
    autoTranslateFallback(code);
    _langSelected = true; // back button is now eligible to show on future re-opens

    // Trigger the fade once the browser has committed the built DOM to screen.
    // Strategy: double-rAF ensures at least two paint frames have run, then a
    // 100 ms timeout gives WebKit/Safari enough time to fully composite the new
    // layer before the opacity transition begins — avoids the Safari race
    // condition where .fade fires before the painted content is visible.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          loader.classList.add('fade');
          setTimeout(() => { loader.style.display = 'none'; }, 1200);
        }, 100);
      });
    });

    // FAILSAFE — rAF is throttled/frozen when the tab is backgrounded, which
    // would otherwise strand the loader on screen forever (catastrophic black
    // screen). These plain timers fire regardless of paint state and guarantee
    // the loader always clears. Idempotent with the rAF path above.
    setTimeout(() => { loader.classList.add('fade'); }, 650);
    setTimeout(() => { loader.style.display = 'none'; loader.classList.remove('show'); }, 2100);
  }, 2000);
}

/* ══════════════════════════════════════════
   REOPEN LANGUAGE GATE
   Called by the nav flag button.
   Hides the site, re-shows the gate so the
   user can switch to another language.
══════════════════════════════════════════ */
function reopenLangGate() {
  const gate = $('lang-gate');
  if (!gate) return;

  // Close mobile menu if open
  $('nav-mobile')?.classList.remove('open');
  $('nav-burger')?.classList.remove('open');
    $('nav-burger')?.setAttribute('aria-expanded', 'false');

  // Restore display first, then remove .out on next frame so the CSS
  // fade-in transition (opacity 0→1, scale 1.04→1) fires correctly
  gate.style.display = 'flex';
  gate.offsetHeight;           // force reflow — makes transition fire
  gate.classList.remove('out');

  // Lock scroll — html+body for iOS Safari
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';

  // Reset selection state so all flags appear neutral again
  document.querySelectorAll('.gate-lang').forEach(b => {
    b.classList.remove('dimmed', 'selected');
  });

  _startGateClock(); // resume live HUD clock

  // Show the back button only if a language was already chosen (not on first visit)
  if (_langSelected) {
    const btn = $('gate-back-btn');
    if (btn) {
      /* Update aria-label with localised "Back" word so screen readers get the right language */
      btn.setAttribute('aria-label', GATE_BACK_LABELS[LANG] || 'Back');
    }
    gate.classList.add('gate--has-back');
  }

}

/* ══════════════════════════════════════════
   CLOSE GATE — KEEP CURRENT LANGUAGE
   Called by the back button that appears when
   the gate is re-opened after a language was
   already selected.  Just dismisses the gate
   without changing LANG or rebuilding anything.
══════════════════════════════════════════ */
function closeGateBack() {
  const gate = $('lang-gate');
  if (!gate) return;

  _stopGateClock();

  // Hide back button immediately so it doesn't linger during fade-out
  gate.classList.remove('gate--has-back');

  // Fade the gate out (same .out class used by selectLang)
  gate.classList.add('out');

  // After transition completes: actually hide the gate and unlock scroll
  setTimeout(() => {
    gate.style.display = 'none';
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  }, 720); // matches the .7s gate transition
}

/* ══════════════════════════════════════════
   AUTO-TRANSLATE FALLBACK
   Uses the browser's built-in translation hint (lang attribute)
   so Chrome/Edge can offer to auto-translate the page.
   Also patches any untranslated text nodes dynamically
   for languages not fully covered in I18N.
══════════════════════════════════════════ */
function autoTranslateFallback(code) {
  // Setting document.documentElement.lang triggers Chrome's
  // built-in translation bar for unsupported languages.
  // Already set in selectLang — nothing more needed for browser-native.

  // For fully supported languages (in I18N), applyTranslations() handles everything.
  // For others, we rely on browser translation.
  // We also add a <meta> hint so translation engines know the source lang.
  let metaLang = document.querySelector('meta[name="google"]');
  if (!metaLang) {
    metaLang = document.createElement('meta');
    metaLang.name = 'google';
    document.head.appendChild(metaLang);
  }
  // If language IS in our I18N table, disable auto-translation to avoid conflicts
  if (I18N[code]) {
    metaLang.content = 'notranslate'; // we handle it ourselves
  } else {
    metaLang.content = '';
  }
}

/* Contact promise strip + direct-contact line — i18n (étaient codés en dur en EN) */
const _CONTACT_PROMISE_T = {
  resp:   { fr:'Réponse garantie', en:'Response guaranteed', es:'Respuesta garantizada', de:'Antwort garantiert', it:'Risposta garantita', ar:'رد مضمون', zh:'保证回复', ja:'返信保証', ru:'Гарантированный ответ', pl:'Gwarantowana odpowiedź' },
  read:   { fr:'Messages lus', en:'Messages read', es:'Mensajes leídos', de:'Nachrichten gelesen', it:'Messaggi letti', ar:'الرسائل مقروءة', zh:'消息已读', ja:'メッセージ既読', ru:'Сообщения прочитаны', pl:'Wiadomości czytane' },
  titles: { fr:'Titres en production', en:'Titles in production', es:'Títulos en producción', de:'Titel in Produktion', it:'Titoli in produzione', ar:'عناوين قيد الإنتاج', zh:'制作中的作品', ja:'制作中のタイトル', ru:'Тайтлов в работе', pl:'Tytuły w produkcji' },
  direct: { fr:'Réponse sous 48h — chaque message est lu', en:'We reply within 48h — every message is read', es:'Respondemos en 48h — cada mensaje se lee', de:'Antwort in 48 Std. — jede Nachricht wird gelesen', it:'Rispondiamo entro 48h — ogni messaggio è letto', ar:'نرد خلال 48 ساعة — كل رسالة تُقرأ', zh:'48小时内回复——每条消息都会被阅读', ja:'48時間以内に返信 — すべてのメッセージに目を通します', ru:'Отвечаем в течение 48 ч — каждое сообщение прочитано', pl:'Odpowiadamy w 48h — każda wiadomość jest czytana' },
};
function _cpt(k){ const m=_CONTACT_PROMISE_T[k]; if(!m) return k; return m[LANG]||m.en; }

/* ══════════════════════════════════════════
   TRANSLATIONS — apply to static DOM
══════════════════════════════════════════ */
function applyTranslations() {
  const l = LANG;
  // Nav — order must match the I18N nav array: [home, works, shop, about, contact]
  const navKeys = ['home','works','shop','about','contact'];
  const navLabels = t('nav');
  if (Array.isArray(navLabels)) navLabels.forEach((label, i) => {
    setText('nl-'  + navKeys[i], label);
    setText('nml-' + navKeys[i], label);
  });
  // Hero
  setText('hero-eye',    t('heroEye'));
  setHTML('hero-slogan', t('heroSlogan'));
  setText('hero-desc',   t('heroDesc'));
  setText('hero-btn1',   t('heroBtn1'));
  setText('hero-btn2',   t('heroBtn2'));
  setText('showcase-btn', t('showcaseBtn') || 'Discover all works →');

  // (home page has no category headings — works page handled by applyWorksPageLabels)

  // Studio
  setHTML('studio-quote', t('studioQuote'));
  setText('studio-body1', t('studioBody1'));
  setText('studio-body2', t('studioBody2'));

  // CTA
  setHTML('cta-title', t('ctaTitle').replace('\n','<br>'));
  setText('cta-desc', t('ctaDesc'));
  setText('cta-btn1', t('ctaBtn1'));
  setText('cta-btn2', t('ctaBtn2'));

  // Works page
  setText('works-title', t('worksTitle').replace('\n',' '));
  setText('works-desc', t('worksDesc'));

  // Contact page
  setHTML('contact-title-h', t('contactTitle'));
  setText('contact-desc', t('contactDesc'));
  setText('form-head', t('formTitle'));
  setText('lbl-first', t('lblFirst'));
  setText('lbl-last', t('lblLast'));
  setText('lbl-email', t('lblEmail'));
  setText('lbl-company', t('lblCompany'));
  setText('lbl-subject', t('lblSubject'));
  setText('lbl-message', t('lblMessage'));
  setText('lbl-link', t('lblLink'));
  setText('form-submit-txt', t('formSubmit'));
  setText('form-legal', t('formLegal'));
  setText('contact-info-title', t('contactInfoTitle'));
  const cmpInp = $('inp-company');
  if (cmpInp) cmpInp.placeholder = t('formOptional') || 'Optional';
  const msgInp = $('inp-message');
  if (msgInp) msgInp.placeholder = t('formMsgHint') || 'Tell us about your project...';

  // Contact subject options
  const sel = $('contact-subject');
  if (sel) {
    const opts = t('subjectOpts');
    sel.innerHTML = `<option value="" disabled selected>—</option>` +
      opts.map(o => `<option>${o}</option>`).join('');
  }

  // Stats
  applyWorksPageLabels();
  setText('stat-titles', t('statTitles'));
  setText('stat-films', t('statFilms'));
  setText('stat-games', t('statGames'));
  setText('stat-platforms', t('statPlatforms'));

  // Footer — rebuild all page slots with current language (single source of truth)
  buildPageFooters();

  // Showcase
  const stEl = $('showcase-title');
  if (stEl) { const v = t('showcaseTitle'); stEl.innerHTML = v ? v.replace('\n',' ') : 'WHAT WE CREATE'; }

  // CTA eyebrow
  setText('cta-eye', t('ctaEye') || 'Publishers & Partners');

  // Works page
  setText('works-eye', t('worksEye') || 'Complete Catalogue');

  // About page
  setText('about-eye', t('aboutEye') || 'The Studio');
  const atEl = $('about-title');
  if (atEl) { const v = t('aboutTitle'); atEl.innerHTML = v ? v.replace('\n',' ') : 'ABOUT US'; }
  setText('about-desc', t('aboutDesc'));
  setText('team-eye',  t('teamEye') || 'The Team');
  const ttEl = $('team-title');
  if (ttEl) { const v = t('teamTitle'); ttEl.innerHTML = v ? v.replace('\n',' ') : 'WHO WE ARE'; }
  setText('manifesto-label', t('manifestoLabel') || 'Studio Manifesto');
  setHTML('about-manifesto-quote', t('manifestoQuote') || '');
  setText('awards-eye',   t('awardsEye') || 'Awards & Distinctions');
  const awEl = $('awards-title');
  if (awEl) { const v = t('awardsTitle'); awEl.innerHTML = v ? v.replace('\n',' ') : 'RECOGNISED WORK'; }

  // Contact eyebrow
  setText('contact-eye', t('contactEye') || "Let's talk");

  // Contact info labels
  setText('ci-lbl-gen',   t('ciLblGen')   || 'General');
  setText('ci-sub-gen',   t('ciSubGen')   || 'All inquiries');
  setText('ci-lbl-par',   t('ciLblPar')   || 'Publishers & Partners');
  setText('ci-sub-par',   t('ciSubPar')   || 'Collaborations, licensing, distribution');
  setText('ci-lbl-press', t('ciLblPress') || 'Press & Media');
  setText('ci-sub-press', t('ciSubPress') || 'Press kit on request');
  setText('ci-lbl-bug',   t('ciLblBug')   || 'Bug Report');
  setText('ci-sub-bug',   t('ciSubBug')   || 'Players — report a recurring issue');

  // Contact promise strip + direct-contact promise (were hardcoded EN → now i18n)
  setText('cp-resp',    _cpt('resp'));
  setText('cp-read',    _cpt('read'));
  setText('cp-titles',  _cpt('titles'));
  setText('cd-promise', _cpt('direct'));

  // Shop page
  setText('shop-eye',          t('shopEye')      || 'Under Construction');
  setHTML('shop-sub',          t('shopSub')       || 'Our shop is being assembled...');
  setText('shop-btn-works-txt',t('shopBtnWorks')  || 'Explore Our Works');
  setText('shop-btn-home-txt', t('shopBtnHome')   || 'Back to Home');
  setText('shop-status-txt',   t('shopStatus')    || 'Coming Soon');

  // Search UI
  setText('search-label-txt', t('searchLabel') || 'Search a game or film');
  const sinp = $('search-input');
  if (sinp) sinp.placeholder = t('searchHint') || 'Type a title...';
  applyStudioThemes();
}

/* ══════════════════════════════════════════
   INIT SITE
══════════════════════════════════════════ */
function initSite() {
  window.scrollTo({ top: 0, behavior: 'instant' }); // guarantee top position on every site init
  buildMarquee();
  buildStatsBand();
  buildCarousels();
  buildPuzzleStrips();
  buildAboutPage();
  buildFeaturedWork();
  buildRoadmap();
  initNav();
  initScrollProgress();
  initReveal();
  initCounters();
  initAnimations();
  initWorksFilters();
  initContactEnhancements();
  initAuthUI();
  initA11y();
  applyWorksPageLabels();
  // Initial SEO for the active page (re-runs on each language change via initSite)
  updateSEO(document.querySelector('.nav-link.active')?.dataset.nav || 'home', null);
  _siteBuilt = true; // enables age-gated re-render on auth changes
  // Touch swipe is now built into buildCarousel() — no separate init needed
  // Notify the GSAP animation layer that the site is ready
  document.dispatchEvent(new CustomEvent('glg:site-built'));
}

/* ══════════════════════════════════════════
   NAV
══════════════════════════════════════════ */
/* Guard: scroll / observer listeners are registered only once — not on each initSite() call */
let _navScrollBound = false;
function initNav() {
  if (!_navScrollBound) {
    _navScrollBound = true;
    let _navRaf = false;
    window.addEventListener('scroll', () => {
      if (_navRaf) return;
      _navRaf = true;
      requestAnimationFrame(() => {
        _navRaf = false;
        $('nav').classList.toggle('scrolled', window.scrollY > 40);
      });
    }, { passive: true });
  }

  $('nav-burger')?.addEventListener('click', () => {
    const burger = $('nav-burger');
    burger.classList.toggle('open');
    const isOpen = burger.classList.contains('open');
    burger.setAttribute('aria-expanded', String(isOpen));
    $('nav-mobile')?.classList.toggle('open');
  });
}

/* ── Page-transition veil — "fade from black" launcher feel ──────────────
   Couvre INSTANTANÉMENT la zone contenu avant le swap (aucune image n'est
   peinte entre l'ancienne et la nouvelle page → zéro saut), puis se dissout
   en révélant la nouvelle page. Sous la nav/modales (z-index). */
let _veilEl = null;
const _veilMotion = !window.matchMedia('(prefers-reduced-motion:reduce)').matches;
function _pageVeilCover() {
  if (!_veilMotion) return;
  if (!_veilEl) { _veilEl = document.createElement('div'); _veilEl.id = 'glg-veil'; _veilEl.setAttribute('aria-hidden','true'); document.body.appendChild(_veilEl); }
  _veilEl.style.transition = 'none';
  _veilEl.style.opacity = '1';
  void _veilEl.offsetHeight;          // commit the opaque state before any paint
  _veilEl.style.transition = '';
}
function _pageVeilReveal() {
  if (!_veilMotion || !_veilEl) return;
  // setTimeout (pas rAF) : fiable même si la frame est throttlée (onglet en
  // arrière-plan). L'état final opacity:0 s'applique quoi qu'il arrive → jamais
  // d'écran noir bloqué. Un 2ᵉ timer fait office de filet de sécurité.
  setTimeout(() => { if (_veilEl) _veilEl.style.opacity = '0'; }, 40);
  setTimeout(() => { if (_veilEl) _veilEl.style.opacity = '0'; }, 650);
}

function showPage(name, itemId = null) {
  _pageVeilCover();   // hide the swap behind a veil → smooth cross-fade

  // Reset hero-content styles left by scroll/mouse parallax to avoid visual seams
  const prevHeroContent = document.querySelector('.page.active .hero-content');
  if (prevHeroContent) { prevHeroContent.style.opacity = ''; prevHeroContent.style.transform = ''; }

  $$('.page').forEach(p => p.classList.remove('active'));
  $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === name));
  window.scrollTo({ top: 0, behavior: 'instant' });
  $('nav-mobile')?.classList.remove('open');
  $('nav-burger')?.classList.remove('open');
    $('nav-burger')?.setAttribute('aria-expanded', 'false');

  if (name === 'detail' && itemId) {
    buildDetail(itemId);
    $('page-detail').classList.add('active');
  } else {
    const page = $('page-' + name);
    if (page) page.classList.add('active');
    /* Rebuild carousels once the works page is visible so scrollWidth is accurate */
    if (name === 'works') requestAnimationFrame(buildCarousels);
    /* Build the member space (avatar/banner/wishlist) on demand */
    if (name === 'profile') buildProfilePage();
  }

  // Update browser URL without reload
  const url = itemId ? `#${name}/${itemId}` : `#${name}`;
  window.history.pushState({ page: name, id: itemId }, '', url);

  setTimeout(initReveal, 80);

  // Per-page SEO (title, meta, OpenGraph, structured data)
  updateSEO(name, (name === 'detail' && itemId) ? ALL_WORKS.find(i => i.id === itemId) : null);

  // Notify GSAP animation layer
  const activePage = itemId ? $('page-detail') : $('page-' + name);
  document.dispatchEvent(new CustomEvent('glg:page-changed', { detail: { name, el: activePage } }));

  _pageVeilReveal();  // dissolve the veil → the new page fades up into view
}

/* ══════════════════════════════════════════
   SEO — per-page title / meta / OpenGraph / JSON-LD
   Reuses already-translated DOM labels so it stays multilingual.
══════════════════════════════════════════ */
function _setMeta(attr, key, val) {
  if (val == null) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.setAttribute('content', val);
}
function updateSEO(name, item) {
  const BASE = 'GEEKLEARN GAMES';
  const origin = location.origin && location.origin !== 'null' ? location.origin : 'https://www.geeklearngames.com';
  let title = BASE, desc = '', url = `${origin}/#${name}`, image = `${origin}/assets/img/brand/glg-logo-white.png`;

  if (item) {
    title = `${item.title} — ${BASE}`;
    desc  = (getItemField(item, 'tagline') || (getItemField(item, 'description') || [])[0] || '').slice(0, 300);
    url   = `${origin}/#detail/${item.id}`;
    image = `${origin}/${item.cover}`;
  } else {
    const navBtn = document.querySelector(`.nav-link[data-nav="${name}"]`);
    const lbl = navBtn ? navBtn.textContent.trim() : '';
    title = lbl ? `${lbl} — ${BASE}` : BASE;
    const descId = { home:'hero-desc', works:'works-desc', about:'about-desc', contact:'contact-desc', shop:'shop-sub' }[name];
    desc = (descId && $(descId)?.textContent ? $(descId).textContent : '').replace(/\s+/g, ' ').trim().slice(0, 300);
  }

  document.title = title;
  _setMeta('name', 'description', desc);
  _setMeta('property', 'og:title', title);
  _setMeta('property', 'og:description', desc);
  _setMeta('property', 'og:url', url);
  _setMeta('property', 'og:image', image);
  _setMeta('name', 'twitter:title', title);
  _setMeta('name', 'twitter:description', desc);

  // Structured data for a specific work (rich results)
  let ld = document.getElementById('glg-jsonld-work');
  if (!item) { if (ld) ld.remove(); return; }
  const data = {
    '@context': 'https://schema.org',
    '@type': item.type === 'film' ? 'Movie' : 'VideoGame',
    name: item.title,
    description: ((getItemField(item, 'description') || [])[0] || getItemField(item, 'tagline') || '').slice(0, 500),
    image: `${origin}/${item.cover}`,
    inLanguage: LANG,
    datePublished: String(item.year || ''),
    publisher: { '@type': 'Organization', name: BASE, url: origin },
  };
  if (item.type !== 'film') {
    data.gamePlatform = (item.platforms || []).map(p => PLATS[p]?.name).filter(Boolean);
  }
  if (item.basePrice) {
    data.offers = { '@type': 'Offer', price: item.basePrice, priceCurrency: 'EUR', availability: 'https://schema.org/PreOrder' };
  }
  if (!ld) { ld = document.createElement('script'); ld.type = 'application/ld+json'; ld.id = 'glg-jsonld-work'; document.head.appendChild(ld); }
  ld.textContent = JSON.stringify(data);
}

// Handle browser back/forward
window.addEventListener('popstate', e => {
  const state = e.state;
  if (state) {
    if (state.id) buildDetail(state.id);
    $$('.page').forEach(p => p.classList.remove('active'));
    const page = $('page-' + state.page);
    if (page) page.classList.add('active');
    if (state.page === 'profile') buildProfilePage();
    if (state.page === 'works') requestAnimationFrame(buildCarousels);
  }
});

// Show works page
function showWorksTab() {
  showPage('works');
}

/* ══════════════════════════════════════════
   MARQUEE
══════════════════════════════════════════ */
/* ──────────────────────────────────────────────────────────
   SEAMLESS MARQUEE — measured, gap-proof, constant speed
   ──────────────────────────────────────────────────────────
   Builds the track as TWO identical halves and animates
   translateX(0 → -50%): the loop point is therefore always
   pixel-perfect. Each half is repeated enough times to exceed
   the container width, so no empty gap ever appears (the old
   bug on wide screens). Duration is derived from the measured
   half-width so the speed (px/s) stays constant on every page.
────────────────────────────────────────────────────────── */
function _seamlessMarquee(track, baseHTML, pxPerSec) {
  if (!track || !baseHTML) return;
  pxPerSec = pxPerSec || 50;
  const container = track.parentElement;
  const cw = (container && container.clientWidth) || window.innerWidth || 1280;
  // Measure one base set (animation off so the measurement is stable)
  track.style.animation = 'none';
  track.innerHTML = baseHTML;
  const baseW = track.scrollWidth || cw;
  // Repeat so ONE half comfortably exceeds the container (+1 safety copy)
  const k = Math.max(2, Math.ceil(cw / baseW) + 1);
  let half = '';
  for (let i = 0; i < k; i++) half += baseHTML;
  track.innerHTML = half + half;                 // two identical halves
  const halfW = (track.scrollWidth / 2) || cw;
  track.style.setProperty('--mq-dur', Math.max(8, halfW / pxPerSec).toFixed(1) + 's');
  void track.offsetWidth;                         // reflow → clean restart
  track.style.animation = '';
}

function _marqueeBaseHTML(words) {
  return words.map(w => `<span class="marquee-item"><span class="marquee-dot"></span>${w}</span>`).join('');
}

function buildMarquee() {
  const words = t('marqueeWords') || ['GeekLearn Games','Interactive Films','Video Games','Est. 2026','France','Games That Teach','Games That Move','Games That Haunt'];
  _seamlessMarquee($('marquee-track'), _marqueeBaseHTML(words), 45);
}

/* Re-fill marquees on resize so a widened window never reveals a gap (debounced). */
let _marqueeResizeT = null;
window.addEventListener('resize', () => {
  clearTimeout(_marqueeResizeT);
  _marqueeResizeT = setTimeout(() => {
    buildMarquee();
    const dpTrack = document.querySelector('.dp-marquee-track');
    if (dpTrack && dpTrack._mqBase) _seamlessMarquee(dpTrack, dpTrack._mqBase, 50);
  }, 200);
}, { passive: true });

/* ══════════════════════════════════════════
   CAROUSELS — 4 cards always visible, infinite
══════════════════════════════════════════ */
/* Debounce: multiple synchronous calls in the same tick (e.g. from applyTranslations
   + initSite + applyWorksPageLabels) collapse into a single actual rebuild. */
let _buildCarouselsTimer = null;
function buildCarousels() {
  clearTimeout(_buildCarouselsTimer);
  _buildCarouselsTimer = setTimeout(() => {
    buildWorksGrid('films-carousel', filterByAge(FILMS), FILM_LABELS[LANG] || 'Interactive Film');
    buildWorksGrid('games-carousel', filterByAge(GAMES), GAME_LABELS[LANG] || 'Video Game');
  }, 0);
}

/* ── OUR WORKS — grille de store (remplace l'auto-scroll infini) ─────────
   Choix AAA : un catalogue que l'utilisateur PARCOURT (Steam/Epic/PS), pas
   un bandeau qui défile. Plus premium, accessible, et net sur mobile.
   Réutilise cardHTML + les filtres. Aucune boucle rAF. */
function buildWorksGrid(id, items, typeLabel) {
  const el = $(id);
  if (!el) return;
  if (_carouselRAF[id]) { cancelAnimationFrame(_carouselRAF[id]); _carouselRAF[id] = null; }
  const vp = el.parentElement;
  if (vp) { vp.classList.add('works-grid-vp'); vp.style.direction = 'ltr'; }
  el.classList.add('works-grid');
  el.style.transform = 'none';
  el.innerHTML = items.map(item => cardHTML(item, typeLabel)).join('');
}

/* buildCarousel() — RETIRÉ. OUR WORKS utilise désormais buildWorksGrid()
   (grille de store curatée, plus premium qu'un auto-scroll infini).
   L'ancien moteur (rAF + swipe + momentum) reste dans l'historique git si besoin. */

function cardHTML(item, typeLabel) {
  // --tint = per-work accent colour, revealed only on hover (rest of Works page stays monochrome)
  const tint = item.tint || '#ffffff';
  const tintRgb = hexToRgb(tint) || '255,255,255';
  return `
    <div class="c-card" data-g="${item.glow}" style="--tint:${tint};--tint-rgb:${tintRgb}" role="button" tabindex="0" aria-label="${item.title}" onclick="showPage('detail','${item.id}')">
      <div class="c-card-pw">
        <img src="${av(item.cover)}" alt="${item.title}" loading="lazy" decoding="async"
             onerror="this.style.background='#111';this.style.display='block'">
        <div class="c-card-title-bg" aria-hidden="true">${item.title}</div>
        <div class="c-card-tintwash" aria-hidden="true"></div>
      </div>
      <button class="c-wish ${wishHas(item.id)?'on':''}" data-wish="${item.id}" aria-pressed="${wishHas(item.id)}" aria-label="${_wt('add')}" title="${_wt('add')}" onclick="event.stopPropagation();toggleWish('${item.id}',this)">${_HEART_SVG}</button>
      <span class="c-badge ${item.status}">${getStatusLabel(item)}</span>
      <div class="c-card-overlay">
        <div class="c-card-type">${typeLabel}</div>
        <div class="c-card-name">${item.title}</div>
        <div class="c-card-yr">${item.year} · <span class="price-display" data-base-price="${item.basePrice ?? ''}">${getPrice(item)}</span></div>
        <span class="c-card-cta" aria-hidden="true"><span class="c-card-cta-arrow">→</span></span>
      </div>
    </div>
  `;
}

// buildFooterWorks() removed — footer works list is now built inside footerHTML() / buildPageFooters()

/* ══════════════════════════════════════════
   WORKS — FILTERS (All / Films / Games)
══════════════════════════════════════════ */
const _WORKS_FILTER_LABELS = {
  all:   { fr:'Tout', en:'All', es:'Todo', de:'Alle', ar:'الكل', zh:'全部', ja:'すべて', ru:'Все', pl:'Wszystko', it:'Tutto' },
  films: { fr:'Films', en:'Films', es:'Films', de:'Filme', ar:'أفلام', zh:'电影', ja:'映画', ru:'Фильмы', pl:'Filmy', it:'Film' },
  games: { fr:'Jeux', en:'Games', es:'Juegos', de:'Spiele', ar:'ألعاب', zh:'游戏', ja:'ゲーム', ru:'Игры', pl:'Gry', it:'Giochi' },
};
function initWorksFilters() {
  const page = $('page-works');
  if (!page) return;
  const L = c => _WORKS_FILTER_LABELS[c][LANG] || _WORKS_FILTER_LABELS[c].en;
  let bar = page.querySelector('.works-filters');
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'works-filters reveal';
    const hero = page.querySelector('.works-hero');
    if (hero) hero.insertAdjacentElement('afterend', bar);
    else page.prepend(bar);
  }
  bar.innerHTML = `
    <button class="works-filter active" data-f="all">${L('all')}</button>
    <button class="works-filter" data-f="films">${L('films')}<span class="works-filter-count">${filterByAge(FILMS).length}</span></button>
    <button class="works-filter" data-f="games">${L('games')}<span class="works-filter-count">${filterByAge(GAMES).length}</span></button>`;
  bar.querySelectorAll('.works-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      bar.querySelectorAll('.works-filter').forEach(b => b.classList.toggle('active', b === btn));
      applyWorksFilter(btn.dataset.f);
    });
  });
}
function applyWorksFilter(f) {
  const page = $('page-works'); if (!page) return;
  const sections = [...page.querySelectorAll('.works-cat-section')]; // [0]=films, [1]=games
  const band = page.querySelector('.glg-band');
  const show = (el, vis) => el && el.classList.toggle('wcat-hidden', !vis);
  if (f === 'films') { show(sections[0], true);  show(sections[1], false); if (band) band.style.display = 'none'; }
  else if (f === 'games') { show(sections[0], false); show(sections[1], true);  if (band) band.style.display = 'none'; }
  else { sections.forEach(s => show(s, true)); if (band) band.style.display = ''; }
  requestAnimationFrame(buildCarousels); // re-measure visible carousels
}

/* ══════════════════════════════════════════
   HOME — FEATURED WORK (spotlight)
══════════════════════════════════════════ */
const _FEATURED_LABELS = {
  eyebrow: { fr:'À la une', en:'Featured', es:'Destacado', de:'Im Fokus', ar:'مميّز', zh:'焦点', ja:'注目', ru:'В центре', pl:'Wyróżnione', it:'In evidenza' },
  cta:     { fr:'Découvrir', en:'Discover', es:'Descubrir', de:'Entdecken', ar:'اكتشف', zh:'探索', ja:'詳しく', ru:'Подробнее', it:'Scopri', pl:'Odkryj' },
};
/* Rotating cinematic spotlight of the studio's titles — launcher-style. */
let _fheroTimer = null;
function buildFeaturedWork() {
  const home = $('page-home'); if (!home) return;
  const items = filterByAge(ALL_WORKS).slice(0, 8); // showcase titles (max 8, age-aware)
  if (!items.length) return;
  let host = $('featured-hero');
  if (!host) {
    host = document.createElement('section');
    host.id = 'featured-hero';
    host.className = 'fhero';
    host.setAttribute('aria-roledescription', 'carousel');
    host.setAttribute('aria-label', _FEATURED_LABELS.eyebrow[LANG] || 'Featured');
    // The brand slogan hero stays the landing; the featured spotlight sits BELOW it
    const heroSec = home.querySelector('.hero');
    if (heroSec) heroSec.insertAdjacentElement('afterend', host);
    else home.prepend(host);
  }
  document.querySelector('#page-home .hero')?.classList.remove('hero--replaced'); // ensure brand hero visible
  const eye = _FEATURED_LABELS.eyebrow[LANG] || _FEATURED_LABELS.eyebrow.en;
  const cta = _FEATURED_LABELS.cta[LANG] || _FEATURED_LABELS.cta.en;
  const trailer = t('trailerBtn') || 'Trailer';
  host.innerHTML = `
    <div class="fhero-stage">
      ${items.map((item, i) => `
        <article class="fhero-slide ${i === 0 ? 'active' : ''}" data-i="${i}"
                 style="--tint:${item.tint || '#fff'};--tint-rgb:${hexToRgb(item.tint || '#ffffff') || '255,255,255'}"
                 aria-hidden="${i === 0 ? 'false' : 'true'}">
          <div class="fhero-bg" data-bg="${av(item.cover)}"></div>
          <div class="fhero-scrim"></div>
          <div class="fhero-content">
            <div class="fhero-eyebrow"><span class="fhero-eyebrow-dash"></span>${eye} · ${getCatLabel(item)} · ${item.year}</div>
            <h2 class="fhero-title">${item.title}</h2>
            <p class="fhero-tagline">${getItemField(item, 'tagline')}</p>
            <div class="fhero-cta">
              <button class="btn btn-primary btn-lg" onclick="showPage('detail','${item.id}')">${cta} →</button>
              <button class="btn btn-outline btn-lg" onclick="openTrailerModal('${item.id}')">▶ ${trailer}</button>
            </div>
          </div>
        </article>`).join('')}
    </div>
    <button class="fhero-arrow fhero-prev" aria-label="${_at ? _at('back') : 'Prev'}">
      <svg width="20" height="20" viewBox="0 0 16 16" fill="none"><path d="M10 3l-5 5 5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
    </button>
    <button class="fhero-arrow fhero-next" aria-label="Next">
      <svg width="20" height="20" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
    </button>
    <div class="fhero-dots" role="tablist" aria-label="${eye}">
      ${items.map((it, i) => `<button class="fhero-dot ${i === 0 ? 'active' : ''}" data-i="${i}" role="tab" aria-selected="${i === 0 ? 'true' : 'false'}" aria-label="${it.title}"></button>`).join('')}
    </div>`;
  _initFheroRotation(host);
}

function _initFheroRotation(host) {
  if (_fheroTimer) { clearInterval(_fheroTimer); _fheroTimer = null; }
  const slides = host.querySelectorAll('.fhero-slide');
  const dots   = host.querySelectorAll('.fhero-dot');
  if (slides.length <= 1) return;
  const motion = !window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  let idx = 0;
  // Lazy-load slide backgrounds: only the current + next are fetched (perf for heavy key-art)
  const setBg = i => {
    const b = slides[i]?.querySelector('.fhero-bg');
    if (b && !b.style.backgroundImage && b.dataset.bg) b.style.backgroundImage = `url('${b.dataset.bg}')`;
  };
  const go = n => {
    idx = (n + slides.length) % slides.length;
    setBg(idx); setBg((idx + 1) % slides.length);
    slides.forEach((s, i) => { s.classList.toggle('active', i === idx); s.setAttribute('aria-hidden', i === idx ? 'false' : 'true'); });
    dots.forEach((d, i) => { d.classList.toggle('active', i === idx); d.setAttribute('aria-selected', i === idx ? 'true' : 'false'); });
  };
  setBg(0); setBg(1 % slides.length); // initial
  const start = () => { if (motion && !_fheroTimer) _fheroTimer = setInterval(() => go(idx + 1), 6000); };
  const stop  = () => { if (_fheroTimer) { clearInterval(_fheroTimer); _fheroTimer = null; } };
  const restart = () => { stop(); start(); };
  host.querySelector('.fhero-next').addEventListener('click', () => { go(idx + 1); restart(); });
  host.querySelector('.fhero-prev').addEventListener('click', () => { go(idx - 1); restart(); });
  dots.forEach(d => d.addEventListener('click', () => { go(+d.dataset.i); restart(); }));
  host.addEventListener('mouseenter', stop);
  host.addEventListener('mouseleave', start);
  start();
}

/* ══════════════════════════════════════════
   HOME — ROADMAP / RELEASE SLATE (timeline cinématique des 8 titres)
   Trie les œuvres par date de sortie ; respecte l'age-gating.
══════════════════════════════════════════ */
const _MONTHS = { january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12 };
function _workSortKey(item) {
  const ys = String(item.year || '');
  const y = (ys.match(/\d{4}/) || ['9999'])[0];
  const mm = ys.toLowerCase().match(/(january|february|march|april|may|june|july|august|september|october|november|december)/);
  return parseInt(y, 10) * 100 + (mm ? _MONTHS[mm[1]] : 0);
}
const _ROADMAP_T = {
  eye:   { fr:'Feuille de route', en:'Release slate', es:'Calendario de lanzamientos', de:'Roadmap', it:'Roadmap', ar:'خريطة الإصدارات', zh:'发行计划', ja:'リリース予定', ru:'План релизов', pl:'Plan wydań' },
  title: { fr:'CE QUI ARRIVE', en:"WHAT'S COMING", es:'LO QUE VIENE', de:'WAS KOMMT', it:'COSA ARRIVA', ar:'ما هو قادم', zh:'即将到来', ja:'これから', ru:'ЧТО ВПЕРЕДИ', pl:'CO NADCHODZI' },
  sub:   { fr:'Huit mondes en chantier — voici quand ils ouvriront leurs portes.', en:'Eight worlds in the making — here is when they open their doors.', es:'Ocho mundos en construcción — aquí es cuando abren sus puertas.', de:'Acht Welten in Arbeit — hier öffnen sie ihre Türen.', it:'Otto mondi in lavorazione — ecco quando apriranno le porte.', ar:'ثمانية عوالم قيد الإنشاء — إليك موعد فتح أبوابها.', zh:'八个正在打造的世界——它们将于何时开启大门。', ja:'制作中の8つの世界——その扉が開く時。', ru:'Восемь миров в разработке — вот когда они откроют двери.', pl:'Osiem światów w budowie — oto kiedy otworzą drzwi.' },
  cta:   { fr:'Voir la fiche', en:'View page', es:'Ver ficha', de:'Ansehen', it:'Scheda', ar:'عرض', zh:'查看', ja:'詳しく', ru:'Открыть', pl:'Zobacz' },
};
function buildRoadmap() {
  const home = $('page-home'); if (!home) return;
  const items = filterByAge(ALL_WORKS).slice().sort((a, b) => _workSortKey(a) - _workSortKey(b));
  if (!items.length) return;
  let host = $('home-roadmap');
  if (!host) {
    host = document.createElement('section');
    host.id = 'home-roadmap';
    host.className = 'glg-roadmap glg-pattern';
    const cta = home.querySelector('.glg-cta-band');
    if (cta && cta.parentElement) cta.parentElement.insertBefore(host, cta);
    else home.querySelector('.page-footer-slot')?.before(host);
  }
  const L = m => m[LANG] || m.en;
  host.innerHTML = `
    <div class="glg-pattern-bg glg-pat-subtle" style="--glg-speed:70s"></div>
    <div class="rm-head">
      <div class="section-eye reveal" style="justify-content:center">${L(_ROADMAP_T.eye)}</div>
      <h2 class="rm-title reveal">${L(_ROADMAP_T.title)}</h2>
      <p class="rm-sub reveal">${L(_ROADMAP_T.sub)}</p>
    </div>
    <div class="rm-track">
      <span class="rm-spine" aria-hidden="true"></span>
      ${items.map((it, i) => {
        const tint = it.tint || '#ffffff';
        const rgb  = hexToRgb(tint) || '255,255,255';
        return `
        <button class="rm-node ${i % 2 ? 'rm-node--r reveal reveal-right' : 'rm-node--l reveal reveal-left'}" style="--tint:${tint};--tint-rgb:${rgb}"
                onclick="showPage('detail','${it.id}')" aria-label="${it.title} — ${it.year}">
          <span class="rm-dot" aria-hidden="true"></span>
          <span class="rm-card">
            <span class="rm-date">${it.year}</span>
            <span class="rm-type">${getCatLabel(it)}</span>
            <span class="rm-name">${it.title}</span>
            <span class="rm-tag">${getItemField(it, 'tagline')}</span>
            <span class="rm-go">${L(_ROADMAP_T.cta)} <span class="rm-go-arr">→</span></span>
          </span>
        </button>`;
      }).join('')}
    </div>`;
}

/* ══════════════════════════════════════════
   ABOUT PAGE
══════════════════════════════════════════ */
function buildAboutPage() {
  buildOrgTree();
  buildStudioValues();
  buildAwards();
}

/* ── Studio values — the three brand pillars (Teach · Move · Haunt) ── */
const _VALUES = {
  heading: { fr:'Nos valeurs', en:'What we stand for', es:'Lo que defendemos', de:'Wofür wir stehen', ar:'ما نؤمن به', zh:'我们的信念', ja:'私たちの信条', ru:'Наши ценности', pl:'Nasze wartości', it:'I nostri valori' },
  eyebrow: { fr:'Le studio', en:'The Studio', es:'El estudio', de:'Das Studio', ar:'الأستوديو', zh:'工作室', ja:'スタジオ', ru:'Студия', pl:'Studio', it:'Lo studio' },
  items: [
    { k:'teach', t:{ fr:'TEACH', en:'TEACH', es:'ENSEÑAR', de:'LEHREN', ar:'نُعلّم', zh:'启迪', ja:'学び', ru:'УЧИТЬ', pl:'UCZYĆ', it:'INSEGNARE' },
      d:{ fr:'Chaque monde transmet quelque chose de vrai — sans jamais sacrifier le plaisir de jouer.', en:'Every world teaches something true — without ever sacrificing the joy of play.', es:'Cada mundo enseña algo verdadero, sin sacrificar nunca el placer de jugar.', de:'Jede Welt lehrt etwas Wahres — ohne je den Spielspaß zu opfern.', ar:'كل عالم يُعلّم شيئاً حقيقياً — دون التضحية بمتعة اللعب.', zh:'每个世界都传递真实之物——绝不牺牲游戏的乐趣。', ja:'すべての世界は本物の何かを伝える——遊ぶ喜びを犠牲にせずに。', ru:'Каждый мир учит чему-то настоящему — не жертвуя радостью игры.', pl:'Każdy świat uczy czegoś prawdziwego — nigdy nie kosztem radości z gry.', it:'Ogni mondo insegna qualcosa di vero — senza mai sacrificare il piacere del gioco.' } },
    { k:'move', t:{ fr:'MOVE', en:'MOVE', es:'EMOCIONAR', de:'BEWEGEN', ar:'نُحرّك', zh:'触动', ja:'動かす', ru:'ТРОГАТЬ', pl:'PORUSZAĆ', it:'EMOZIONARE' },
      d:{ fr:'On vise l\'émotion réelle : la chair de poule, les larmes, le cœur qui s\'emballe.', en:'We aim for real emotion: the chills, the tears, the racing heart.', es:'Buscamos emoción real: los escalofríos, las lágrimas, el corazón acelerado.', de:'Wir zielen auf echte Emotion: Gänsehaut, Tränen, rasendes Herz.', ar:'نسعى إلى عاطفة حقيقية: القشعريرة، الدموع، تسارع القلب.', zh:'我们追求真实的情感：战栗、泪水、心跳加速。', ja:'本物の感情を目指す——震え、涙、高鳴る鼓動。', ru:'Мы стремимся к настоящим эмоциям: мурашки, слёзы, бешеное сердце.', pl:'Dążymy do prawdziwych emocji: dreszcze, łzy, przyspieszone bicie serca.', it:'Puntiamo all\'emozione vera: i brividi, le lacrime, il cuore in corsa.' } },
    { k:'haunt', t:{ fr:'HAUNT', en:'HAUNT', es:'PERDURAR', de:'NACHHALLEN', ar:'نبقى', zh:'萦绕', ja:'刻む', ru:'ПРЕСЛЕДОВАТЬ', pl:'NAWIEDZAĆ', it:'RESTARE' },
      d:{ fr:'Nos histoires restent. Longtemps après l\'écran noir, elles continuent de vous habiter.', en:'Our stories linger. Long after the screen goes dark, they stay with you.', es:'Nuestras historias perduran. Mucho después de apagarse la pantalla, siguen contigo.', de:'Unsere Geschichten bleiben. Lange nach dem schwarzen Bildschirm wirken sie nach.', ar:'قصصنا تبقى. بعد انطفاء الشاشة بوقت طويل، تظل معك.', zh:'我们的故事会留下。屏幕熄灭很久之后，依然萦绕于心。', ja:'物語は残る。画面が暗くなった後も、ずっと心に。', ru:'Наши истории остаются. Долго после того, как экран гаснет, они с вами.', pl:'Nasze historie zostają. Długo po wygaśnięciu ekranu wciąż w tobie trwają.', it:'Le nostre storie restano. Molto dopo lo schermo nero, rimangono con te.' } },
  ],
};
function buildStudioValues() {
  const about = $('page-about'); if (!about) return;
  let host = $('studio-values');
  if (!host) {
    host = document.createElement('div');
    host.id = 'studio-values';
    const manifesto = about.querySelector('.about-manifesto');
    if (manifesto) manifesto.insertAdjacentElement('beforebegin', host);
    else return;
  }
  const L = m => m[LANG] || m.en;
  host.innerHTML = `
    <div class="sv-eyebrow reveal">${L(_VALUES.eyebrow)}</div>
    <h2 class="sv-heading reveal">${L(_VALUES.heading)}</h2>
    <div class="sv-grid">
      ${_VALUES.items.map((v, i) => `
        <div class="sv-card reveal" style="transition-delay:${i * 0.08}s">
          <div class="sv-num">0${i + 1}</div>
          <div class="sv-name">${L(v.t)}</div>
          <p class="sv-desc">${L(v.d)}</p>
        </div>`).join('')}
    </div>`;
}

/* ── CINEMA SPLIT — team member cards ── */
function buildOrgTree() {
  const container = $('org-tree');
  if (!container || !TEAM.length) return;
  container.innerHTML = '';

  TEAM.forEach((member, i) => {
    const isLeft = i % 2 === 0; // even index → photo left, odd → photo right
    const card = document.createElement('div');
    card.className = `cm-card${isLeft ? '' : ' cm-card--right'} reveal`;
    card.innerHTML = memberCardHTML(member, isLeft, i);
    container.appendChild(card);
  });
}

/* Builds the inner HTML for one Studio Profile member card */
function memberCardHTML(member, isLeft, index) {
  const initials = ((member.name[0] || '') + (member.nameLine2?.[0] || '')).toUpperCase() || '??';
  const idx      = String((index ?? 0) + 1).padStart(2, '0');

  // Stat labels — contextual info, never repeating the role title
  const lbl = {
    est:     { fr:'Fondé en', en:'Est.',    es:'Desde',  de:'Seit',    ar:'منذ',     zh:'成立', ja:'設立',  ru:'С',      pl:'Od',   it:'Dal'    }[LANG] || 'Est.',
    country: { fr:'Pays',    en:'Country', es:'País',   de:'Land',    ar:'الموقع',  zh:'国家', ja:'拠点',  ru:'Страна', pl:'Kraj', it:'Paese'  }[LANG] || 'Country',
    studio:  { fr:'Studio',  en:'Studio',  es:'Studio', de:'Studio',  ar:'الأستوديو',zh:'工作室',ja:'スタジオ',ru:'Студия',pl:'Studio',it:'Studio'}[LANG] || 'Studio',
  };

  // Localised role + quote + identity (pseudonym large, real name below)
  const roleLabel = (member.roleI18n && member.roleI18n[LANG]) || member.role || '';
  const quote     = (member.quoteI18n && member.quoteI18n[LANG]) || member.quote || '';
  const realName  = member.alias ? `${member.name || ''} ${member.nameLine2 || ''}`.trim() : '';
  const bigName   = member.alias
    ? member.alias
    : `${member.name || ''}${member.nameLine2 ? `<span class="cm-photo-name-hollow">${member.nameLine2}</span>` : ''}`;

  // Photo panel — cinematic identity overlay (pseudonym large, real name + role below)
  const photoBlock = `
    <div class="cm-photo">
      ${member.photo
        ? `<img src="${av(member.photo)}" alt="${member.alias || member.name} ${member.nameLine2 || ''}" loading="lazy" onerror="this.style.display='none'">`
        : `<div class="cm-photo-init">${initials}</div>`
      }
      <div class="cm-photo-grad"></div>
      <div class="cm-photo-ident">
        <div class="cm-photo-name">${bigName}</div>
        ${realName ? `<div class="cm-photo-realname">${realName}</div>` : ''}
        <div class="cm-photo-meta">
          <span class="cm-photo-roletag">${roleLabel}</span>
        </div>
      </div>
    </div>`;

  // Info panel — quote dominates, role shown once, stats provide fresh context
  const infoBlock = `
    <div class="cm-info">
      <div class="cm-watermark">${idx}</div>
      <div class="cm-info-inner">
        <p class="cm-quote">${quote}</p>
        <div class="cm-divider"></div>
        <div class="cm-role">GEEKLEARN GAMES</div>
      </div>
      <div class="cm-stats">
        <div class="cm-stat">
          <div class="cm-stat-value">${member.year || '2026'}</div>
          <div class="cm-stat-label">${lbl.est}</div>
        </div>
        <div class="cm-stat">
          <div class="cm-stat-value">France</div>
          <div class="cm-stat-label">${lbl.country}</div>
        </div>
        <div class="cm-stat">
          <div class="cm-stat-value">GLG</div>
          <div class="cm-stat-label">${lbl.studio}</div>
        </div>
      </div>
      <div class="cm-accent"></div>
    </div>`;

  return isLeft ? photoBlock + infoBlock : infoBlock + photoBlock;
}

/* ── Awards ── */
function buildAwards() {
  const container = $('awards-grid');
  if (!container) return;

  // Empty awards → hide the whole section (cleaner than empty trophy shelves).
  // Populate AWARDS in data.js and it reappears automatically.
  const section = container.closest('.about-awards-section');
  if (!AWARDS.length) {
    if (section) section.style.display = 'none';
    container.innerHTML = '';
    return;
  }
  if (section) section.style.display = '';

  container.innerHTML = AWARDS.map(a => `
    <div class="award-card">
      <div class="award-card-img">
        ${a.photo
          ? `<img src="${av(a.photo)}" alt="${a.event}" loading="lazy">`
          : `<div style="width:100%;height:100%;background:linear-gradient(135deg,var(--s3),var(--s2))"></div>`
        }
      </div>
      <div class="award-card-body">
        <div class="award-card-year">${a.year}</div>
        <div class="award-card-name">${a.name}</div>
        <div class="award-card-event">${a.event}</div>
        <div class="award-card-game">${a.game}</div>
      </div>
    </div>
  `).join('');
}

/* ══════════════════════════════════════════
   DETAIL PAGE — GLG SIGNATURE v2
   Cinematic hero · Story · Features · Screenshots · Buy
══════════════════════════════════════════ */

/* ── Spec block helper ── */
function dpSpecBlock(label, spec) {
  return `
    <div class="dp-spec-col">
      <div class="dp-spec-head">${label}</div>
      <div class="dp-spec-row"><span class="dp-spec-k">${t('specOs')}</span><span class="dp-spec-v">${spec.os}</span></div>
      <div class="dp-spec-row"><span class="dp-spec-k">${t('specCpu')}</span><span class="dp-spec-v">${spec.cpu}</span></div>
      <div class="dp-spec-row"><span class="dp-spec-k">${t('specGpu')}</span><span class="dp-spec-v">${spec.gpu}</span></div>
      <div class="dp-spec-row"><span class="dp-spec-k">${t('specRam')}</span><span class="dp-spec-v">${spec.ram}</span></div>
      <div class="dp-spec-row"><span class="dp-spec-k">${t('specStorage')}</span><span class="dp-spec-v">${spec.storage}</span></div>
      <div class="dp-spec-row"><span class="dp-spec-k">${t('specDx')}</span><span class="dp-spec-v">${spec.dx}</span></div>
    </div>`;
}

/* ── Screenshot carousel ── */
const dpSsStates = {};
function dpSsNav(id, dir) {
  const s = dpSsStates[id];
  if (!s) return;
  s.index = (s.index + dir + s.total) % s.total;
  dpSsUpdate(id);
}
function dpSsGoTo(id, idx) {
  if (!dpSsStates[id]) return;
  dpSsStates[id].index = idx;
  dpSsUpdate(id);
}
function dpSsUpdate(id) {
  const s = dpSsStates[id];
  const track = $(`dp-ss-track-${id}`);
  if (track) track.style.transform = `translateX(-${s.index * 100}%)`;
  const counter = $(`dp-ss-counter-${id}`);
  if (counter) counter.textContent = `${s.index + 1} / ${s.total}`;
  $$(`#dp-ss-thumbs-${id} .dp-ss-thumb`).forEach((th, i) => {
    th.classList.toggle('active', i === s.index);
  });
}

/* ── Sticky bar ── */
let _dpStickyObs = null;
function initDpSticky() {
  const bar  = document.querySelector('#page-detail .dp-sticky') || $('dp-sticky');
  const hero = document.querySelector('#page-detail .dp-hero');
  if (!bar || !hero) return;
  if (_dpStickyObs) _dpStickyObs.disconnect();
  _dpStickyObs = new IntersectionObserver(([e]) => {
    bar.classList.toggle('active', !e.isIntersecting);
    bar.setAttribute('aria-hidden', e.isIntersecting ? 'true' : 'false');
  }, { threshold: 0.1 });
  _dpStickyObs.observe(hero);
}

/* ── 18+ gate screens (anonymous confirm / minor block) ── */
const _AGE_T = {
  title:  { fr:'Contenu 18+', en:'18+ Content', es:'Contenido +18', de:'18+ Inhalt', it:'Contenuto 18+' },
  q:      { fr:"Ce titre est réservé aux personnes majeures (18 ans et plus). Confirmes-tu avoir 18 ans ou plus ?", en:'This title is rated 18+. Please confirm you are 18 or older.', es:'Este título es solo para mayores de 18. ¿Confirmas que tienes 18 años o más?', de:'Dieser Titel ist ab 18. Bestätigst du, dass du 18 oder älter bist?', it:'Questo titolo è 18+. Confermi di avere almeno 18 anni?' },
  yes:    { fr:"Oui, j'ai 18 ans ou plus", en:"Yes, I'm 18 or older", es:'Sí, tengo 18 o más', de:'Ja, ich bin 18 oder älter', it:'Sì, ho almeno 18 anni' },
  no:     { fr:'Non, retour', en:'No, go back', es:'No, volver', de:'Nein, zurück', it:'No, indietro' },
  blocked:{ fr:"Ce contenu n'est pas disponible.", en:'This content is not available.', es:'Este contenido no está disponible.', de:'Dieser Inhalt ist nicht verfügbar.', it:'Questo contenuto non è disponibile.' },
  back:   { fr:'Retour aux œuvres', en:'Back to works', es:'Volver a las obras', de:'Zurück zu den Werken', it:'Torna alle opere' },
};
function _aget(k) { const m = _AGE_T[k]; return m ? (m[LANG] || m.en) : k; }
function _matureBlockedHTML() {
  return `<div class="age-block"><div class="age-block-inner">
      <div class="age-badge-18">18+</div>
      <p class="age-block-msg">${_aget('blocked')}</p>
      <button class="btn btn-outline btn-lg" onclick="showPage('works')">${_aget('back')}</button>
    </div></div>`;
}
function _ageGateHTML(item) {
  return `<div class="age-gate" style="--tint:${item.tint || '#fff'}"><div class="age-gate-inner">
      <div class="age-badge-18">18+</div>
      <h2 class="age-gate-title">${_aget('title')}</h2>
      <p class="age-gate-q">${_aget('q')}</p>
      <div class="age-gate-actions">
        <button class="btn btn-primary btn-lg" id="age-yes">${_aget('yes')}</button>
        <button class="btn btn-outline btn-lg" id="age-no">${_aget('no')}</button>
      </div>
    </div></div>`;
}
function _wireAgeGate(item) {
  $('age-yes')?.addEventListener('click', () => { confirmAdult(); buildDetail(item.id); });
  $('age-no')?.addEventListener('click', () => showPage('works'));
}

function buildDetail(id) {
  const item = ALL_WORKS.find(i => i.id === id);
  if (!item) return;

  const container        = $('page-detail');

  // ── 18+ age gate ────────────────────────────────────────────────
  const gate = ageGateState(item);
  if (gate === 'blocked') { container.innerHTML = _matureBlockedHTML(); return; }
  if (gate === 'gate')    { container.innerHTML = _ageGateHTML(item); _wireAgeGate(item); return; }

  // Per-work colour identity: the ONLY page allowed to break monochrome.
  container.style.setProperty('--tint', item.tint || '#ffffff');
  const tintRGB = hexToRgb(item.tint || '#ffffff');
  if (tintRGB) container.style.setProperty('--tint-rgb', tintRGB);
  const localTagline     = getItemField(item, 'tagline');
  const localDescription = getItemField(item, 'description');
  const localFeatures    = getItemField(item, 'features');
  const localCat         = getCatLabel(item);
  const localStatus      = getStatusLabel(item);
  const localPrice       = getPrice(item);

  // Build marquee content (repeated twice for seamless loop)
  const mqItems = [
    `<span class="dp-mq-item">${t('infoType')} <b>${localCat}</b></span><span class="dp-mq-dot">✦</span>`,
    `<span class="dp-mq-item">${t('infoYear')} <b>${item.year}</b></span><span class="dp-mq-dot">✦</span>`,
    `<span class="dp-mq-item">${t('infoStudio')} <b>GEEKLEARN GAMES</b></span><span class="dp-mq-dot">✦</span>`,
    `<span class="dp-mq-item">${t('infoStatus')} <b>${localStatus}</b></span><span class="dp-mq-dot">✦</span>`,
    `<span class="dp-mq-item">${t('infoPrice')} <b class="price-display" data-base-price="${item.basePrice ?? ''}">${localPrice}</b></span><span class="dp-mq-dot">✦</span>`,
  ].join('');
  // One base set; _seamlessMarquee() fills + duplicates it after render (gap-proof loop)

  container.innerHTML = `

    <!-- ──────── HERO ──────── -->
    <div class="dp-hero">
      <div class="dp-hero-bg" style="background-image:url('${av(item.cover)}')"></div>
      <div class="dp-hero-vignette"></div>
      <div class="dp-hero-tint" style="background:${item.tint}"></div>

      <button class="dp-back" onclick="showPage('works')" aria-label="${t('detailBack')}">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M10 3l-5 5 5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        ${t('detailBack')}
      </button>

      <div class="dp-hero-body">
        <span class="dp-hero-studio">GEEKLEARN GAMES</span>
        <span class="dp-hero-meta">${localCat} · ${item.year}</span>
        <div class="dp-hero-badge">
          <span class="dp-hero-badge-dot"></span>
          ${localStatus}
        </div>
        ${item.logo
          ? `<img class="dp-hero-logo" src="${av(item.logo)}" alt="${item.title}">`
          : `<h1 class="dp-hero-title">${item.title}</h1>`
        }
        <p class="dp-hero-tagline">${localTagline}</p>
        ${_workTagsHTML(item)}
        <div class="dp-hero-cta">
          <button class="btn btn-primary btn-lg" onclick="openBuyModal('${item.id}')">
            ${t('buyNow')} — ${localPrice}
          </button>
          <button class="btn btn-outline btn-lg" onclick="openTrailerModal('${item.id}')">
            ▶ ${t('trailerBtn')}
          </button>
        </div>
      </div>

      <div class="dp-hero-scroll" aria-hidden="true">
        <span class="dp-hero-scroll-label">Scroll</span>
        <div class="dp-hero-scroll-line"></div>
      </div>
    </div>

    <!-- ──────── STICKY BAR ──────── -->
    <div class="dp-sticky" id="dp-sticky" aria-hidden="true">
      <div class="dp-sticky-inner">
        <span class="dp-sticky-title">${item.title}</span>
        <span class="dp-sticky-sep">·</span>
        <span class="dp-sticky-cat">${localCat}</span>
        <span class="dp-sticky-price price-display" data-base-price="${item.basePrice ?? ''}">${localPrice}</span>
        <button class="dp-sticky-buy" onclick="openBuyModal('${item.id}')">${t('buyNow')} →</button>
      </div>
    </div>

    <!-- ──────── MARQUEE INFO STRIP ──────── -->
    <div class="dp-marquee-strip" aria-hidden="true">
      <div class="dp-marquee-track">${mqItems}</div>
    </div>

    <!-- ──────── STORE LAYOUT — media (left) · buy panel (right) ──────── -->
    <div class="dp-store">
      <div class="dp-store-main">

        <!-- Media gallery -->
        <div class="dp-ss reveal">
          <div class="dp-sec-label">${t('ssHead')}</div>
          <div class="dp-ss-main">
            <div class="dp-ss-viewport">
              <div class="dp-ss-track" id="dp-ss-track-${item.id}">
                ${item.screenshots.map((ss, idx) => `
                  <div class="dp-ss-slide">
                    <img src="${av(ss)}" alt="Screenshot ${idx + 1}" loading="lazy" decoding="async"
                         onclick="openLightbox('${item.id}',${idx})"
                         onerror="this.closest('.dp-ss-slide').classList.add('dp-ss-ph')">
                  </div>`).join('')}
              </div>
            </div>
            <div class="dp-ss-nav">
              <button class="dp-ss-prev" onclick="dpSsNav('${item.id}',-1)" aria-label="Previous screenshot">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 3l-5 5 5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
              </button>
              <span class="dp-ss-counter" id="dp-ss-counter-${item.id}">1 / ${item.screenshots.length}</span>
              <button class="dp-ss-next" onclick="dpSsNav('${item.id}',1)" aria-label="Next screenshot">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
              </button>
            </div>
          </div>
          <div class="dp-ss-thumbs" id="dp-ss-thumbs-${item.id}">
            ${item.screenshots.map((ss, i) => `
              <button class="dp-ss-thumb ${i === 0 ? 'active' : ''}" onclick="dpSsGoTo('${item.id}',${i})" aria-label="Screenshot ${i + 1}">
                <img src="${av(ss)}" alt="" loading="lazy" onerror="this.closest('.dp-ss-thumb').classList.add('dp-ss-ph')">
              </button>`).join('')}
          </div>
        </div>

        <!-- About -->
        <div class="dp-story reveal">
          <p class="dp-story-pull">&ldquo;${localTagline}&rdquo;</p>
          <div class="dp-sec-label">${t('aboutHead')}</div>
          <p class="dp-story-p">${localDescription[0] || ''}</p>
          ${localDescription[1] ? `<p class="dp-story-p">${localDescription[1]}</p>` : ''}
        </div>

        <!-- Key features -->
        <div class="dp-features">
          <div class="dp-sec-label reveal">${t('featuresHead')}</div>
          <div class="dp-features-list">
            ${localFeatures.map((f, i) => `
              <div class="dp-feat-item reveal" style="transition-delay:${i * 0.04}s">
                <span class="dp-feat-num">${String(i + 1).padStart(2, '0')}</span>
                <span class="dp-feat-text">${f}</span>
              </div>`).join('')}
          </div>
        </div>

        <!-- Trophies teaser (store-style) -->
        ${dpTrophySectionHTML(item)}

      </div>

      <!-- Sticky buy panel (store-style) -->
      <aside class="dp-store-side">
        <div class="dp-buybox reveal">
          <div class="dp-buybox-cover"><img src="${av(item.cover)}" alt="${item.title}" loading="lazy" onerror="this.parentElement.style.display='none'"></div>
          ${item.logo
            ? `<img class="dp-buybox-logo" src="${av(item.logo)}" alt="${item.title}">`
            : `<div class="dp-buybox-title">${item.title}</div>`}
          <div class="dp-buybox-meta">${localCat} · ${item.year}</div>
          <div class="dp-buybox-status"><span class="dp-buybox-dot"></span>${localStatus}</div>
          <div class="dp-buybox-price price-display" data-base-price="${item.basePrice ?? ''}">${localPrice}</div>
          <button class="btn btn-primary dp-buybox-buy" onclick="openBuyModal('${item.id}')">${t('buyNow')} →</button>
          <button class="dp-buybox-trailer" onclick="openTrailerModal('${item.id}')">▶ ${t('trailerBtn')}</button>
          <button class="dp-buybox-wish ${wishHas(item.id)?'on':''}" data-wish="${item.id}" aria-pressed="${wishHas(item.id)}" onclick="toggleWish('${item.id}',this)">
            <span class="dp-wish-ico">${_HEART_SVG}</span>
            <span class="dp-wish-label" data-wish-label>${wishHas(item.id)?_wt('inList'):_wt('add')}</span>
          </button>
          <div class="dp-buybox-sec">
            <div class="dp-sec-label">${t('platHead')}</div>
            <div class="dp-buybox-plats">
              ${item.platforms.map(p => `
                <button class="dp-buybox-plat" onclick="openBuyModal('${item.id}')" title="${PLATS[p].cta}">
                  <span class="dp-buybox-plat-ico" style="background:${PLATS[p].bg}">${PLATS[p].icon}</span>
                  <span class="dp-buybox-plat-name">${PLATS[p].name}</span>
                  <svg class="dp-buybox-plat-arr" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h10M8 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                </button>`).join('')}
            </div>
          </div>
          <div class="dp-buybox-facts">
            <div class="dp-fact"><span>${t('infoStudio') || 'Studio'}</span><b>GEEKLEARN GAMES</b></div>
            <div class="dp-fact"><span>${t('infoType') || 'Type'}</span><b>${localCat}</b></div>
            <div class="dp-fact"><span>${t('infoYear') || 'Year'}</span><b>${item.year}</b></div>
            ${_gameTrophySummary(item.id) ? `<div class="dp-fact dp-fact--btn" role="button" tabindex="0" onclick="openTrophyList('${item.id}')"><span>${_tt('section')}</span><b>${_gameTrophySummary(item.id).total} · ${_gameTrophySummary(item.id).tiers.platinum} ${_tt('platinum')} →</b></div>` : ''}
            <div class="dp-fact"><span>${_dx('players')}</span><b>${_dx('solo')}</b></div>
            <div class="dp-fact"><span>${_dx('languages')}</span><b>10</b></div>
            <div class="dp-fact"><span>${_dx('rating')}</span><b>${item.mature ? _dx('ratingAdult') : _dx('ratingTeen')}</b></div>
          </div>
        </div>
      </aside>
    </div>

    <!-- ──────── SYSTEM REQUIREMENTS ──────── -->
    ${item.specs ? `
    <div class="dp-specs reveal">
      <div class="dp-sec-label">${t('specsHead')}</div>
      <div class="dp-specs-table">
        ${dpSpecBlock(t('specMin'), item.specs.min)}
        ${dpSpecBlock(t('specRec'), item.specs.rec)}
      </div>
    </div>` : ''}

    ${relatedWorksHTML(item)}

    ${footerHTML()}
  `;

  // Propagate tint color throughout the detail page
  container.style.setProperty('--dp-tint', item.tint);

  // Init screenshot carousel state
  dpSsStates[item.id] = { index: 0, total: item.screenshots.length };

  // Seamless, gap-proof meta marquee (measured fill + constant speed)
  const _dpmq = container.querySelector('.dp-marquee-track');
  if (_dpmq) { _dpmq._mqBase = mqItems; _seamlessMarquee(_dpmq, mqItems, 50); }

  // Init sticky bar (observe hero)
  initDpSticky();

  // Init scroll reveals on newly injected elements
  initReveal();

  // Re-attach magnetic effect to fresh detail page buttons
  initMagneticCTAs();

  // Trigger hero BG slow-zoom entrance
  requestAnimationFrame(() => {
    const hero = container.querySelector('.dp-hero');
    if (hero) requestAnimationFrame(() => hero.classList.add('dp-entered'));
  });
}

/* ══════════════════════════════════════════
   RELATED WORKS (bottom of detail page)
══════════════════════════════════════════ */
const _RELATED_LABELS = {
  fr:'À découvrir aussi', en:'You may also like', es:'También te puede gustar',
  de:'Das könnte dir gefallen', ar:'قد يعجبك أيضاً', zh:'你可能也喜欢',
  ja:'こちらもおすすめ', ru:'Вам может понравиться', pl:'Może ci się spodobać', it:'Potrebbe piacerti',
};
const _RELATED_SUB = {
  fr:'D’autres univers signés GEEKLEARN GAMES.', en:'More universes crafted by GEEKLEARN GAMES.',
  es:'Más universos de GEEKLEARN GAMES.', de:'Weitere Welten von GEEKLEARN GAMES.',
  it:'Altri universi firmati GEEKLEARN GAMES.',
};
const _RELATED_ALL  = { fr:'Tout voir', en:'View all', es:'Ver todo', de:'Alle ansehen', it:'Vedi tutto' };
const _RELATED_VIEW = { fr:'Voir la fiche', en:'View page', es:'Ver ficha', de:'Ansehen', it:'Scheda' };
const _rl = (m) => m[LANG] || m.en;

function relatedWorksHTML(item) {
  const related = ALL_WORKS.filter(w => w.type === item.type && w.id !== item.id && !isMatureHidden(w)).slice(0, 4);
  if (!related.length) return '';
  return `
    <section class="dp-related reveal">
      <div class="dp-related-head">
        <div class="dp-related-head-l">
          <div class="dp-sec-label">${_rl(_RELATED_LABELS)}</div>
          <p class="dp-related-sub">${_rl(_RELATED_SUB)}</p>
        </div>
        <button class="dp-related-all" onclick="showPage('works')">${_rl(_RELATED_ALL)} <span aria-hidden="true">→</span></button>
      </div>
      <div class="dp-related-grid">
        ${related.map(w => {
          const tint = w.tint || '#ffffff';
          const tintRgb = hexToRgb(tint) || '255,255,255';
          return `
          <article class="dp-rel-card" style="--tint:${tint};--tint-rgb:${tintRgb}" role="button" tabindex="0" aria-label="${w.title}" onclick="showPage('detail','${w.id}')">
            <div class="dp-rel-cover">
              <img src="${av(w.cover)}" alt="${w.title}" loading="lazy" decoding="async" onerror="this.closest('.dp-rel-cover').classList.add('no-img');this.remove()">
              <span class="dp-rel-type">${getCatLabel(w)}</span>
              <button class="c-wish ${wishHas(w.id)?'on':''}" data-wish="${w.id}" aria-pressed="${wishHas(w.id)}" aria-label="${_wt('add')}" title="${_wt('add')}" onclick="event.stopPropagation();toggleWish('${w.id}',this)">${_HEART_SVG}</button>
              <span class="dp-rel-go">${_rl(_RELATED_VIEW)}<span class="dp-rel-go-arr" aria-hidden="true">→</span></span>
            </div>
            <div class="dp-rel-foot">
              <h3 class="dp-rel-name">${w.title}</h3>
              <div class="dp-rel-sub2">
                <span class="dp-rel-status ${w.status}"><span class="dp-rel-dot"></span>${getStatusLabel(w)}</span>
                <span class="dp-rel-price price-display" data-base-price="${w.basePrice ?? ''}">${getPrice(w)}</span>
              </div>
            </div>
          </article>`;
        }).join('')}
      </div>
    </section>`;
}

/* ══════════════════════════════════════════
   SCREENSHOT LIGHTBOX
══════════════════════════════════════════ */
let _glb = { shots: [], idx: 0, bound: false };
function _glbEnsure() {
  let bg = $('glg-lightbox');
  if (bg) return bg;
  bg = document.createElement('div');
  bg.id = 'glg-lightbox';
  bg.className = 'gll-bg';
  bg.innerHTML = `
    <div class="gll-stage">
      <button class="gll-close" aria-label="Close">
        <svg width="16" height="16" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      </button>
      <button class="gll-nav gll-prev" aria-label="Previous">
        <svg width="20" height="20" viewBox="0 0 16 16" fill="none"><path d="M10 3l-5 5 5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      </button>
      <img class="gll-img" alt="Screenshot">
      <button class="gll-nav gll-next" aria-label="Next">
        <svg width="20" height="20" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      </button>
      <div class="gll-counter"></div>
    </div>`;
  document.body.appendChild(bg);
  bg.addEventListener('click', e => { if (e.target === bg) closeLightbox(); });
  bg.querySelector('.gll-close').addEventListener('click', closeLightbox);
  bg.querySelector('.gll-prev').addEventListener('click', () => lightboxNav(-1));
  bg.querySelector('.gll-next').addEventListener('click', () => lightboxNav(1));
  if (!_glb.bound) {
    _glb.bound = true;
    document.addEventListener('keydown', e => {
      if (!$('glg-lightbox')?.classList.contains('open')) return;
      if (e.key === 'Escape')     closeLightbox();
      if (e.key === 'ArrowLeft')  lightboxNav(-1);
      if (e.key === 'ArrowRight') lightboxNav(1);
    });
  }
  return bg;
}
function _glbRender() {
  const bg = $('glg-lightbox'); if (!bg) return;
  const img = bg.querySelector('.gll-img');
  img.src = _glb.shots[_glb.idx];
  bg.querySelector('.gll-counter').textContent = `${_glb.idx + 1} / ${_glb.shots.length}`;
}
function openLightbox(id, idx) {
  const item = ALL_WORKS.find(i => i.id === id);
  if (!item || !item.screenshots?.length) return;
  _glb.shots = item.screenshots;
  _glb.idx   = Math.max(0, Math.min(idx || 0, item.screenshots.length - 1));
  const bg = _glbEnsure();
  _glbRender();
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => bg.classList.add('open'));
}
function closeLightbox() {
  const bg = $('glg-lightbox'); if (!bg) return;
  bg.classList.remove('open');
  document.body.style.overflow = '';
}
function lightboxNav(dir) {
  if (!_glb.shots.length) return;
  _glb.idx = (_glb.idx + dir + _glb.shots.length) % _glb.shots.length;
  _glbRender();
}

/* ══════════════════════════════════════════
   BUY MODAL
══════════════════════════════════════════ */
function openBuyModal(id) {
  const item = ALL_WORKS.find(i => i.id === id);
  if (!item) return;
  setText('modal-eye', t('buyModal'));
  setText('modal-title', item.title);
  setText('modal-sub', `${getPrice(item)} · ${getStatusLabel(item)}`);
  setHTML('modal-plats', item.platforms.map(p => `
    <button class="plat-btn" onclick="void(0)">
      <div class="plat-ico-lg" style="background:${PLATS[p].bg}">${PLATS[p].icon}</div>
      <div>
        <div class="plat-nm">${PLATS[p].name}</div>
        <div class="plat-cta">${PLATS[p].cta}</div>
      </div>
      <svg class="plat-arr" width="13" height="13" viewBox="0 0 16 16" fill="none">
        <path d="M3 8h10M8 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </button>
  `).join(''));
  $('modal-buy').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeBuyModal() {
  $('modal-buy').classList.remove('open');
  document.body.style.overflow = '';
}

/* ══════════════════════════════════════════
   TRAILER MODAL
══════════════════════════════════════════ */
function openTrailerModal(id) {
  const item = ALL_WORKS.find(i => i.id === id);
  if (!item) return;

  const wrap = $('trailer-wrap');
  if (item.trailer) {
    // If a YouTube embed URL is provided
    wrap.innerHTML = `<iframe src="${item.trailer}" frameborder="0" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>`;
  } else {
    // Placeholder
    wrap.innerHTML = `
      <div class="trailer-placeholder">
        <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
          <circle cx="22" cy="22" r="21" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
          <polygon points="18,14 32,22 18,30" fill="rgba(255,255,255,0.3)"/>
        </svg>
        <p>TRAILER — ${item.title}<br>Add YouTube embed URL in data.js → item.trailer</p>
      </div>
    `;
  }

  $('trailer-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeTrailerModal() {
  const modal = $('trailer-modal');
  modal.classList.remove('open');
  // Stop video
  const wrap = $('trailer-wrap');
  if (wrap) {
    const iframe = wrap.querySelector('iframe');
    if (iframe) {
      // Remove and re-add to stop playback
      const src = iframe.src;
      iframe.src = '';
      setTimeout(() => { if (iframe) iframe.src = src; }, 200);
    }
    // Clear immediately to stop any audio
    setTimeout(() => { if (!modal.classList.contains('open')) wrap.innerHTML = ''; }, 450);
  }
  document.body.style.overflow = '';
}

/* ══════════════════════════════════════════
   FOOTER HTML
══════════════════════════════════════════ */
function footerHTML() {
  const nav = t('nav'); // [home, works, shop, about, contact]
  return `
  <footer>
    <div class="footer-inner">
      <div class="footer-col">
        <div class="footer-logo">
          <img src="assets/img/brand/glg-logo-white.png" alt="GLG" onerror="this.style.display='none'">
        </div>
        <p class="footer-brand-desc">${t('footerDesc')}</p>
      </div>
      <div class="footer-col">
        <div class="footer-col-title">${t('footerNavTitle')}</div>
        <div class="footer-links">
          <button onclick="showPage('home')">${nav[0]}</button>
          <button onclick="showPage('works')">${nav[1]}</button>
          <button onclick="showPage('shop')">${nav[2]}</button>
          <button onclick="showPage('about')">${nav[3]}</button>
          <button onclick="showPage('contact')">${nav[4]}</button>
        </div>
      </div>
      <div class="footer-col">
        <div class="footer-col-title">${t('footerWorksTitle')}</div>
        <div class="footer-links">
          ${ALL_WORKS.map(w => `<button onclick="showPage('detail','${w.id}')">${w.title}</button>`).join('')}
        </div>
      </div>
      <div class="footer-col">
        <div class="footer-col-title">${t('footerFollowTitle')}</div>
        <div class="footer-socials-row">
          <a href="https://x.com/geeklearngames" target="_blank" rel="noopener" class="footer-soc-btn" title="X / Twitter" aria-label="X Twitter">
            <img src="assets/img/social/x.png" alt="X" class="soc-icon">
          </a>
          <a href="https://discord.gg/M7YJsC9BwH" target="_blank" rel="noopener" class="footer-soc-btn" title="Discord" aria-label="Discord">
            <img src="assets/img/social/discord.png" alt="Discord" class="soc-icon">
          </a>
          <a href="https://www.youtube.com/@GEEKLEARN-GAMES" target="_blank" rel="noopener" class="footer-soc-btn" title="YouTube" aria-label="YouTube">
            <img src="assets/img/social/youtube.png" alt="YouTube" class="soc-icon">
          </a>
          <a href="https://www.instagram.com/geeklearn_games/" target="_blank" rel="noopener" class="footer-soc-btn" title="Instagram" aria-label="Instagram">
            <img src="assets/img/social/instagram.png" alt="Instagram" class="soc-icon">
          </a>
          <a href="https://store.steampowered.com/dev/GEEKLEARN-GAMES" target="_blank" rel="noopener" class="footer-soc-btn" title="Steam" aria-label="Steam">
            <img src="assets/img/social/steam.png" alt="Steam" class="soc-icon">
          </a>
        </div>
      </div>
    </div>
    <div class="footer-bottom">
      <span class="footer-copy">© ${new Date().getFullYear()} GeekLearn Games — ${t('copyright')}</span>
      <span class="footer-copy footer-tagline">${t('footerTagline') || 'Games that teach, move, haunt your mind.'}</span>
    </div>
  </footer>`;
}

/* ── Inject full footer into every page slot (called on init + language change) ──
   All static pages (home/works/shop/about/contact) have a .page-footer-slot div.
   The detail page builds its own footer inline via buildDetail() → footerHTML().  */
function buildPageFooters() {
  document.querySelectorAll('.page-footer-slot').forEach(slot => {
    slot.innerHTML = footerHTML();
  });
}

/* ══════════════════════════════════════════
   SCROLL PROGRESS
══════════════════════════════════════════ */
let _scrollProgressBound = false;
function initScrollProgress() {
  if (!_scrollProgressBound) {
    _scrollProgressBound = true;
    let _rafPending = false;
    window.addEventListener('scroll', () => {
      if (_rafPending) return;
      _rafPending = true;
      requestAnimationFrame(() => {
        _rafPending = false;
        const d = document.documentElement;
        const pct = (window.scrollY / (d.scrollHeight - d.clientHeight)) * 100;
        const el = $('sprogress');
        if (el) el.style.width = pct + '%';
      });
    }, { passive: true });
  }
}

/* ══════════════════════════════════════════
   REVEAL
══════════════════════════════════════════ */
let _revealObs = null;
/* Reveal a single element for good: mark visible + strip any inline opacity/transform
   a GSAP tween may have stranded on it (gsap.from on a .reveal element captures the
   CSS opacity:0 as its "natural" state, so it could otherwise stay invisible). */
function _revealShow(el) {
  el.classList.add('visible');
  el.style.removeProperty('opacity');
  el.style.removeProperty('transform');
}
function initReveal() {
  if (!_revealObs) {
    _revealObs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { _revealShow(e.target); _revealObs.unobserve(e.target); } });
    }, { threshold: 0.02, rootMargin: '0px 0px -20px 0px' });
  }
  // Scope to the ACTIVE page. Elements already on screen are revealed immediately
  // (the IntersectionObserver is unreliable for display:none → block transitions,
  // which is what stranded text after navigating between sections). Off-screen
  // ones are observed for the on-scroll reveal.
  const scope = document.querySelector('.page.active') || document;
  scope.querySelectorAll('.reveal:not(.visible)').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.top < window.innerHeight && r.bottom > 0) _revealShow(el);
    else _revealObs.observe(el);
  });
}

/* ══════════════════════════════════════════
   COUNTERS
══════════════════════════════════════════ */
function initCounters() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const el = e.target;
        const target = parseInt(el.dataset.count);
        const suffix = el.dataset.suffix || '';
        const dur = 1600;
        const start = performance.now();
        const tick = now => {
          const p = Math.min((now - start) / dur, 1);
          const v = Math.floor((1 - Math.pow(1 - p, 3)) * target);
          el.textContent = v + (p < 1 ? '' : suffix);
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        obs.unobserve(el);
      }
    });
  }, { threshold: 0.5 });
  $$('[data-count]').forEach(el => obs.observe(el));
}

/* ══════════════════════════════════════════
   CONTACT FORM
   Real email delivery via FormSubmit.co
   → geeklearngames.studio@gmail.com
   Subject format: [GLG] Category — Name
   ⚠ FIRST USE: FormSubmit will send an
     activation email to the Gmail account.
     Click the link once to activate.
══════════════════════════════════════════ */
async function handleContactForm(e) {
  e.preventDefault();
  const form = e.target;

  /* ── Security check (rate limit + honeypot) ── */
  if (typeof window._glgCheckForm === 'function') {
    const chk = window._glgCheckForm(form);
    if (!chk.ok) {
      if (chk.reason === 'rate_limit') {
        const btn = $('form-submit-btn');
        if (btn) {
          const orig = btn.innerHTML;
          btn.textContent = t('errRateLimit') || 'Too many requests — please wait.';
          btn.disabled = true;
          setTimeout(() => { btn.innerHTML = orig; btn.disabled = false; }, 5000);
        }
      }
      return; // silently ignore bots
    }
  }

  /* ── Clear previous errors ── */
  form.querySelectorAll('.form-err').forEach(el => el.remove());
  form.querySelectorAll('.form-input--err,.form-select--err,.form-textarea--err')
      .forEach(el => el.classList.remove('form-input--err','form-select--err','form-textarea--err'));

  /* ── Validate required fields ── */
  let valid = true;
  form.querySelectorAll('[required]').forEach(input => {
    const val = input.value.trim();
    let msg = '';
    if (!val) {
      msg = input.type === 'email'
        ? (t('errEmail')    || 'Valid email required')
        : (t('errRequired') || 'Required');
    } else if (input.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      msg = t('errEmail') || 'Valid email required';
    }
    if (msg) {
      valid = false;
      const cls = input.tagName === 'SELECT'
        ? 'form-select--err'
        : input.tagName === 'TEXTAREA'
          ? 'form-textarea--err'
          : 'form-input--err';
      input.classList.add(cls);
      const errEl = document.createElement('p');
      errEl.className = 'form-err';
      errEl.textContent = msg;
      input.parentNode.appendChild(errEl);
    }
  });
  if (!valid) return;

  /* ── Gather values ── */
  const first     = ($('inp-first')?.value   || '').trim();
  const last      = ($('inp-last')?.value    || '').trim();
  const email     = ($('inp-email')?.value   || '').trim();
  const company   = ($('inp-company')?.value || '').trim();
  const subjectEl = $('contact-subject');
  const subject   = subjectEl
    ? (subjectEl.options[subjectEl.selectedIndex]?.text || subjectEl.value || '')
    : '';
  const message   = ($('inp-message')?.value || '').trim();
  const portfolio = ($('inp-link')?.value    || '').trim();

  const fullName = `${first} ${last}`.trim();

  /* ── UI: loading state ── */
  const btn  = $('form-submit-btn');
  if (!btn) return;
  const orig = btn.innerHTML;
  const txtEl = btn.querySelector('#form-submit-txt');
  if (txtEl) txtEl.textContent = t('formSending') || 'Sending…';
  btn.disabled = true;
  btn.style.opacity = '0.72';

  /* ── Build the payload for FormSubmit.co ──
     Subject prefixed with [GLG] + category
     → lets Gmail filters auto-label by type  */
  const categoryTag = subject
    ? subject.split(/\s/)[0].replace(/[^a-zA-Z]/g, '')
    : 'Contact';

  // Auto-reply to the sender (FormSubmit feature)
  const autoReply = [
    `Dear ${first},`,
    '',
    `Thank you for reaching out to GEEKLEARN GAMES.`,
    `We've received your message and will get back to you within 48 hours.`,
    '',
    'Best regards,',
    'GEEKLEARN GAMES — geeklearngames.studio@gmail.com',
  ].join('\n');

  const payload = {
    /* FormSubmit meta-fields */
    _subject:      `[GLG][${categoryTag}] ${fullName} — ${subject}`,
    _template:     'table',
    _captcha:      'false',
    _autoresponse: autoReply,
    _replyto:      email,

    /* Visible email body fields */
    'Full Name':   fullName,
    'Email':       email,
    'Company / Studio': company || '—',
    'Subject':     subject,
    'Message':     message,
    'Portfolio / Press kit': portfolio || '—',
    'Language':    LANG || 'en',
    'Sent from':   window.location.hostname,
  };

  // ── Safety net: mirror every message into Supabase (fire-and-forget) ──
  // Guarantees no message is ever lost, even if the email service fails.
  if (window.GLG_AUTH?.isConfigured?.() && GLG_AUTH.getClient()) {
    try {
      GLG_AUTH.getClient().from('messages').insert({
        name: fullName, email, company: company || null, subject,
        body: message, portfolio: portfolio || null, lang: LANG || 'en',
      }).then(({ error }) => { if (error) console.info('[GLG] Supabase message log skipped:', error.message); });
    } catch (_) { /* never block the email path */ }
  }

  try {
    const res = await fetch(
      'https://formsubmit.co/ajax/geeklearngames.studio@gmail.com',
      {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept':        'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    let data = {};
    try { data = await res.json(); } catch (_) { /* network body parse error */ }

    if (res.ok && (data.success === 'true' || data.success === true)) {
      /* ── SUCCESS ── */
      btn.innerHTML = [
        '<svg width="13" height="13" viewBox="0 0 16 16" fill="none">',
        '<path d="M2 8l4 4 8-8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
        '</svg>',
        ` <span id="form-submit-txt">${t('formSent') || 'Message sent!'}</span>`,
      ].join('');
      btn.style.background = 'transparent';
      btn.style.color      = '#fff';
      btn.style.borderColor = 'rgba(255,255,255,.28)';
      btn.style.opacity    = '1';

      setTimeout(() => {
        btn.innerHTML    = orig;
        btn.style.background  = '';
        btn.style.color       = '';
        btn.style.borderColor = '';
        btn.style.opacity     = '';
        btn.disabled = false;
        form.reset();
      }, 4000);

    } else {
      throw new Error(data.message || `HTTP ${res.status}`);
    }

  } catch (err) {
    /* ── ERROR ── */
    console.error('[GLG Contact]', err);
    const errMsg = t('formError') || 'Could not send — please try again or email us directly.';
    if (txtEl) txtEl.textContent = errMsg;
    else if (btn.querySelector('#form-submit-txt')) btn.querySelector('#form-submit-txt').textContent = errMsg;
    btn.style.opacity = '1';
    btn.disabled = false;

    // Show a form-level error
    const globalErr = document.createElement('p');
    globalErr.className = 'form-err';
    globalErr.style.cssText = 'margin-top:8px;font-size:.62rem;';
    globalErr.textContent = errMsg;
    btn.parentNode.appendChild(globalErr);

    setTimeout(() => {
      btn.innerHTML = orig;
      btn.style.background  = '';
      btn.style.color       = '';
      btn.style.opacity     = '';
      globalErr.remove();
    }, 5000);
  }
}

/* ══════════════════════════════════════════
   CONTACT — UX ENHANCEMENTS
   Real-time validation + topic-card → subject autofill
══════════════════════════════════════════ */
let _contactEnhanced = false;
function initContactEnhancements() {
  const form = $('contact-form');
  if (!form || _contactEnhanced) return;
  _contactEnhanced = true;

  // Clear error styling as soon as the user edits a field
  form.addEventListener('input', e => {
    const el = e.target;
    if (!el.matches('input,select,textarea')) return;
    el.classList.remove('form-input--err', 'form-select--err', 'form-textarea--err');
    const next = el.parentNode.querySelector('.form-err');
    if (next) next.remove();
  });

  // Live email format hint on blur
  const email = $('inp-email');
  if (email) {
    email.addEventListener('blur', () => {
      const v = email.value.trim();
      if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
        email.classList.add('form-input--err');
        if (!email.parentNode.querySelector('.form-err')) {
          const p = document.createElement('p');
          p.className = 'form-err';
          p.textContent = t('errEmail') || 'Valid email required';
          email.parentNode.appendChild(p);
        }
      }
    });
  }

  // Topic cards → preselect the matching subject + scroll to form
  // Card order in DOM: [General, Publishers, Press, Bug] → subjectOpts index
  const TOPIC_SUBJ = [7, 0, 2, 5];
  const cards = document.querySelectorAll('.contact-topics .c-info-block');
  cards.forEach((card, i) => {
    card.classList.add('c-info-block--clickable');
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    const pick = () => {
      const sel = $('contact-subject');
      if (sel) {
        sel.selectedIndex = (TOPIC_SUBJ[i] ?? 0) + 1; // +1 skips placeholder
        sel.classList.remove('form-select--err');
        sel.classList.add('field-flash');
        setTimeout(() => sel.classList.remove('field-flash'), 700);
      }
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const firstEmpty = [...form.querySelectorAll('input[required]')].find(el => !el.value.trim());
      if (firstEmpty) setTimeout(() => firstEmpty.focus(), 350);
    };
    card.addEventListener('click', pick);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  });
}

/* ══════════════════════════════════════════
   ACCESSIBILITY — skip link + keyboard activation
══════════════════════════════════════════ */
const _SKIP_LABELS = { fr:'Aller au contenu', en:'Skip to content', es:'Ir al contenido', de:'Zum Inhalt springen', ar:'انتقل إلى المحتوى', zh:'跳到内容', ja:'本文へスキップ', ru:'К содержимому', pl:'Przejdź do treści', it:'Vai al contenuto' };
let _a11yBound = false;
function initA11y() {
  const skip = $('skip-link');
  if (skip) skip.textContent = _SKIP_LABELS[LANG] || _SKIP_LABELS.en;
  if (_a11yBound) return;
  _a11yBound = true;
  skip?.addEventListener('click', e => {
    e.preventDefault();
    const p = document.querySelector('.page.active');
    if (p) { p.setAttribute('tabindex', '-1'); p.focus(); }
  });
  // Keyboard activation (Enter/Space) for clickable, non-button tiles
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target;
    if (el && el.matches && el.matches('.c-card, .dp-rel-card')) { e.preventDefault(); el.click(); }
  });
}

/* ══════════════════════════════════════════
   ACCOUNTS — UI (Supabase)
   Nav button + auth modal (login / signup / profile)
   Data layer lives in js/auth.js → window.GLG_AUTH
══════════════════════════════════════════ */
/* i18n (FR/EN robustes ; repli EN pour les autres langues — extensible) */
/* ══════════════════════════════════════════
   WISHLIST — liste de souhaits (compte + invité)
   ──────────────────────────────────────────
   • Connecté → persistée dans profiles.wishlist (Supabase)
   • Invité   → localStorage (fusionnée au compte à la connexion)
   Cache mémoire `_wishlist` + événement `glg:wishlist-changed`.
══════════════════════════════════════════ */
const _WISH_KEY = 'glg_wishlist';
let _wishlist = [];

const _WISH_T = {
  add:       { fr:'Ajouter à ma liste',  en:'Add to wishlist' },
  inList:    { fr:'Dans ma liste',       en:'In your wishlist' },
  title:     { fr:'Liste de souhaits',   en:'Wishlist' },
  empty:     { fr:'Ta liste de souhaits est vide.', en:'Your wishlist is empty.' },
  emptyCta:  { fr:'Parcourir les œuvres', en:'Browse the works' },
  remove:    { fr:'Retirer de la liste', en:'Remove from list' },
};
function _wt(k){ const m=_WISH_T[k]; if(!m) return k; return m[LANG]||m.en; }

const _HEART_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" class="wish-heart"><path d="M12 20.3l-1.36-1.24C5.4 14.36 2 11.28 2 7.5 2 4.92 4.02 3 6.5 3c1.54 0 3.04.74 3.96 1.92L12 6.6l1.54-1.68C14.46 3.74 15.96 3 17.5 3 19.98 3 22 4.92 22 7.5c0 3.78-3.4 6.86-8.64 11.58L12 20.3z" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linejoin="round"/></svg>`;

function _wishLoadLocal(){ try{ const v=JSON.parse(localStorage.getItem(_WISH_KEY)||'[]'); return Array.isArray(v)?v.filter(x=>typeof x==='string'):[]; }catch(e){ return []; } }
function _wishSaveLocal(){ try{ localStorage.setItem(_WISH_KEY, JSON.stringify(_wishlist)); }catch(e){} }
_wishlist = _wishLoadLocal(); // seed from local cache immediately (before auth resolves)
function wishGet(){ return _wishlist.slice(); }
function wishHas(id){ return _wishlist.indexOf(id) !== -1; }
function wishCount(){ return _wishlist.length; }
function _wishEmit(){ document.dispatchEvent(new CustomEvent('glg:wishlist-changed',{detail:{list:_wishlist.slice()}})); }

/* Add/remove a work; persists to Supabase when logged in, always mirrors locally. */
async function wishToggle(id){
  if(!id) return false;
  const i = _wishlist.indexOf(id);
  const adding = i === -1;
  if(adding) _wishlist.push(id); else _wishlist.splice(i,1);
  _wishSaveLocal();
  _wishEmit();
  if(_accountProfile && window.GLG_AUTH?.isConfigured?.()){
    const snap = _wishlist.slice();
    try{ const r = await GLG_AUTH.updateProfile({ wishlist: snap }); if(r && r.ok && _accountProfile) _accountProfile.wishlist = snap; }catch(e){}
  }
  return adding;
}

/* Called from UI controls (card heart / detail button / remove). */
async function toggleWish(id, el){
  if(el){ el.classList.add('wish-anim'); setTimeout(()=>el.classList.remove('wish-anim'),420); }
  await wishToggle(id);
}

/* Refresh every wishlist control in the DOM after a change (no full rebuild). */
function _refreshWishButtons(){
  document.querySelectorAll('[data-wish]').forEach(b=>{
    const on = wishHas(b.getAttribute('data-wish'));
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
    const lbl = b.querySelector('[data-wish-label]');
    if(lbl) lbl.textContent = on ? _wt('inList') : _wt('add');
  });
  const pp = document.getElementById('page-profile');
  if(pp && pp.classList.contains('active')) _renderProfileWishlist();
}
document.addEventListener('glg:wishlist-changed', _refreshWishButtons);

const _AUTH_T = {
  account:{fr:'Compte',en:'Account'}, signIn:{fr:'Se connecter',en:'Sign in'},
  signUp:{fr:'Créer un compte',en:'Create account'}, myAccount:{fr:'Mon compte',en:'My account'},
  email:{fr:'E-mail',en:'Email'}, password:{fr:'Mot de passe',en:'Password'},
  username:{fr:"Pseudo",en:'Username'}, age:{fr:'Âge',en:'Age'},
  gender:{fr:'Genre',en:'Gender'}, male:{fr:'Homme',en:'Male'}, female:{fr:'Femme',en:'Female'},
  other:{fr:'Autre',en:'Other'}, specify:{fr:'Préciser',en:'Please specify'},
  consent:{fr:"J'accepte que mes données soient utilisées pour gérer mon compte.",en:'I agree that my data is used to manage my account.'},
  submitLogin:{fr:'Connexion',en:'Log in'}, submitSignup:{fr:'Créer mon compte',en:'Create my account'},
  working:{fr:'Veuillez patienter…',en:'Please wait…'},
  logout:{fr:'Se déconnecter',en:'Log out'}, save:{fr:'Enregistrer',en:'Save'},
  saved:{fr:'Enregistré ✓',en:'Saved ✓'}, del:{fr:'Supprimer mon compte',en:'Delete my account'},
  delConfirm:{fr:'Supprimer définitivement ton compte ? Cette action est irréversible.',en:'Permanently delete your account? This cannot be undone.'},
  memberSince:{fr:'Membre depuis',en:'Member since'},
  haveAccount:{fr:'Déjà un compte ?',en:'Already have an account?'},
  noAccount:{fr:'Pas encore de compte ?',en:'No account yet?'},
  checkEmail:{fr:'Compte créé ! Vérifie ta boîte mail pour confirmer ton adresse.',en:'Account created! Check your inbox to confirm your email.'},
  welcome:{fr:'Connecté ✓',en:'Signed in ✓'},
  pwWeak:{fr:'Mot de passe trop faible (8+ caractères, mélange maj/min/chiffre/symbole).',en:'Password too weak (8+ chars, mix upper/lower/digit/symbol).'},
  pwStrength:{fr:['Très faible','Faible','Correct','Bon','Excellent'],en:['Very weak','Weak','Fair','Good','Strong']},
  uTaken:{fr:'Ce pseudo est déjà pris.',en:'This username is taken.'},
  uAvail:{fr:'Pseudo disponible ✓',en:'Username available ✓'},
  uShort:{fr:'3 caractères minimum.',en:'At least 3 characters.'},
  uInvalid:{fr:'Lettres, chiffres, . _ - uniquement.',en:'Letters, numbers, . _ - only.'},
  emailTaken:{fr:'Cet e-mail est déjà utilisé.',en:'This email is already in use.'},
  emailInvalid:{fr:'E-mail invalide.',en:'Invalid email.'},
  badCreds:{fr:'E-mail ou mot de passe incorrect.',en:'Wrong email or password.'},
  notConfirmed:{fr:'E-mail pas encore confirmé — clique le lien reçu par mail.',en:'Email not confirmed yet — click the link sent to your inbox.'},
  ageMin:{fr:'Tu dois avoir au moins 13 ans.',en:'You must be at least 13.'},
  required:{fr:'Champ requis.',en:'Required field.'},
  genderReq:{fr:'Choisis une option.',en:'Please choose an option.'},
  consentReq:{fr:'Tu dois accepter pour continuer.',en:'You must accept to continue.'},
  fail:{fr:"Échec — réessaie.",en:'Failed — please try again.'},
  rateLimit:{fr:"Trop de tentatives. Patiente quelques minutes (limite d'e-mails du plan gratuit), ou désactive temporairement la confirmation e-mail dans Supabase.",en:'Too many attempts. Wait a few minutes (free-tier email limit), or temporarily disable email confirmation in Supabase.'},
  notConfigured:{fr:'Les comptes ne sont pas encore activés sur ce site.',en:'Accounts are not enabled on this site yet.'},
  close:{fr:'Fermer',en:'Close'},
  profileItem:{fr:'Profil',en:'Profile'}, optionsItem:{fr:'Options',en:'Options'},
  chooseAvatar:{fr:'Choisir un avatar',en:'Choose an avatar'},
  avatarChange:{fr:"Changer d'avatar",en:'Change avatar'},
  presetsLabel:{fr:'Personnages',en:'Characters'},
  customLabel:{fr:'Image personnelle',en:'Custom image'},
  uploadBtn:{fr:'Téléverser une image',en:'Upload an image'},
  back:{fr:'Retour',en:'Back'},
  modOff:{fr:"Upload perso bientôt disponible (modération requise). Choisis un personnage pour l'instant.",en:'Custom upload coming soon (moderation required). Pick a character for now.'},
  imgType:{fr:'Format non supporté (PNG, JPG, WEBP).',en:'Unsupported format (PNG, JPG, WEBP).'},
  imgSize:{fr:'Image trop lourde (max 2 Mo).',en:'Image too large (max 2 MB).'},
  imgRejected:{fr:'Image refusée par la modération.',en:'Image rejected by moderation.'},
  imgUploaded:{fr:'Avatar mis à jour ✓',en:'Avatar updated ✓'},
  dobLbl:{fr:'Date de naissance',en:'Date of birth'},
  dayLbl:{fr:'Jour',en:'Day'}, monthLbl:{fr:'Mois',en:'Month'}, yearLbl:{fr:'Année',en:'Year'},
  showPw:{fr:'Afficher le mot de passe',en:'Show password'}, hidePw:{fr:'Masquer le mot de passe',en:'Hide password'},
  dobInvalid:{fr:'Date de naissance invalide.',en:'Invalid date of birth.'},
};
function _at(k){ const m=_AUTH_T[k]; if(!m) return k; return m[LANG]||m.en; }

/* Localised month names for the date-of-birth selector (fallback EN). */
const _AUTH_MONTHS = {
  fr:['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'],
  en:['January','February','March','April','May','June','July','August','September','October','November','December'],
  es:['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],
  de:['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'],
  it:['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'],
};
const _EYE_SVG = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5"/></svg>`;
const _EYE_OFF_SVG = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true"><path d="M3 3l18 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M10.6 6.2A10.8 10.8 0 0112 6c6.5 0 10 7 10 7a18 18 0 01-3.2 3.9M6.3 6.4A18 18 0 002 13s3.5 7 10 7a10.6 10.6 0 004.2-.85" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
/* Compute age (years) from an ISO birthdate string. */
function _ageFromDOB(iso){
  if(!iso) return null;
  const b = new Date(iso + 'T00:00:00'); if (isNaN(b)) return null;
  const n = new Date(); let a = n.getFullYear() - b.getFullYear();
  const m = n.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < b.getDate())) a--;
  return a;
}
/* Wire an eye toggle button to a password input. */
function _wirePwEye(btnId, inputId){
  const btn = $(btnId), inp = $(inputId); if(!btn||!inp) return;
  btn.addEventListener('click', () => {
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    btn.innerHTML = show ? _EYE_OFF_SVG : _EYE_SVG;
    btn.setAttribute('aria-label', show ? _at('hidePw') : _at('showPw'));
    btn.classList.toggle('on', show);
  });
}

let _authUIInit = false;
function initAuthUI() {
  _buildAccountButton();
  _buildAuthModal();
  if (!_authUIInit) {
    _authUIInit = true;
    document.addEventListener('glg:auth-ready', refreshAccountUI);
    if (window.GLG_AUTH?.isConfigured?.()) GLG_AUTH.onChange(() => refreshAccountUI());
  }
  refreshAccountUI();
}

const _ACCOUNT_ICON = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true">
    <circle cx="12" cy="8" r="3.4" stroke="currentColor" stroke-width="1.5"/>
    <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;
let _accountProfile = null;

/* Circular avatar markup: photo if set, else first-letter disc */
function _avatarDiscHTML(profile, user) {
  const url  = profile?.avatar_url;
  const init = ((profile?.username || user?.email || '?')[0] || '?').toUpperCase();
  return url
    ? `<img class="ava-img" src="${url}" alt="" onerror="this.remove()"><span class="ava-init ava-init--fallback">${init}</span>`
    : `<span class="ava-init">${init}</span>`;
}

function _buildAccountButton() {
  if ($('nav-account-btn')) return;
  const nav = $('nav'); if (!nav) return;
  const btn = document.createElement('button');
  btn.id = 'nav-account-btn';
  btn.setAttribute('aria-label', _at('account'));
  btn.setAttribute('aria-haspopup', 'true');
  btn.title = _at('account');
  btn.innerHTML = `<span class="nav-account-ava">${_ACCOUNT_ICON}</span><span class="nav-account-name"></span>`;
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const loggedIn = btn.classList.contains('is-auth');
    if (loggedIn) toggleAccountMenu();
    else openAuthModal('login');
  });
  const langBtn = $('nav-lang-btn');
  if (langBtn) langBtn.insertAdjacentElement('afterend', btn); // account sits after language, before CONTACT cta
  else nav.appendChild(btn);
  _buildAccountMenu();
}

/* Dropdown shown when clicking the avatar (logged in) */
function _buildAccountMenu() {
  if ($('nav-account-menu')) return;
  const menu = document.createElement('div');
  menu.id = 'nav-account-menu';
  menu.className = 'acct-menu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = `
    <button class="acct-menu-item" data-act="profile" role="menuitem">${_at('profileItem')}</button>
    <button class="acct-menu-item" data-act="options" role="menuitem">${_at('optionsItem')}</button>
    <button class="acct-menu-item acct-menu-item--danger" data-act="logout" role="menuitem">${_at('logout')}</button>`;
  document.body.appendChild(menu);
  menu.addEventListener('click', async e => {
    const act = e.target.closest('.acct-menu-item')?.dataset.act;
    if (!act) return;
    closeAccountMenu();
    if (act === 'profile') showPage('profile');
    else if (act === 'options') openAuthModal();
    else if (act === 'logout') { await GLG_AUTH.signOut(); refreshAccountUI(); }
  });
  // Close on outside click / escape
  document.addEventListener('click', e => {
    if (!$('nav-account-menu')?.classList.contains('open')) return;
    if (e.target.closest('#nav-account-menu') || e.target.closest('#nav-account-btn')) return;
    closeAccountMenu();
  });
}
function toggleAccountMenu() {
  const menu = $('nav-account-menu'); const btn = $('nav-account-btn');
  if (!menu || !btn) return;
  if (menu.classList.contains('open')) { closeAccountMenu(); return; }
  // Refresh labels (language may have changed)
  menu.querySelector('[data-act="profile"]').textContent = _at('profileItem');
  menu.querySelector('[data-act="options"]').textContent = _at('optionsItem');
  menu.querySelector('[data-act="logout"]').textContent  = _at('logout');
  const r = btn.getBoundingClientRect();
  menu.style.top   = (r.bottom + 8) + 'px';
  menu.style.right = (window.innerWidth - r.right) + 'px';
  menu.classList.add('open');
}
function closeAccountMenu() { $('nav-account-menu')?.classList.remove('open'); }

let _authTab = 'login';
function _buildAuthModal() {
  if ($('glg-auth-modal')) return;
  const m = document.createElement('div');
  m.id = 'glg-auth-modal';
  m.className = 'auth-bg';
  m.addEventListener('click', e => { if (e.target === m) closeAuthModal(); });
  document.body.appendChild(m);
}

function openAuthModal(tab) {
  _authTab = tab || 'login';
  const m = $('glg-auth-modal'); if (!m) return;
  renderAuthModal();
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => m.classList.add('open'));
}
function closeAuthModal() {
  const m = $('glg-auth-modal'); if (!m) return;
  m.classList.remove('open');
  document.body.style.overflow = '';
}

async function renderAuthModal() {
  const m = $('glg-auth-modal'); if (!m) return;
  const configured = !!window.GLG_AUTH?.isConfigured?.();
  const user = configured ? await GLG_AUTH.getUser() : null;

  if (user) { m.innerHTML = await _profileHTML(); _wireProfile(); return; }

  const notice = configured ? '' : `<div class="auth-notice">${_at('notConfigured')}</div>`;
  m.innerHTML = `
    <div class="auth-box" role="dialog" aria-modal="true">
      <button class="auth-close" aria-label="${_at('close')}" onclick="closeAuthModal()">
        <svg width="14" height="14" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      </button>
      <div class="auth-brand">
        <img src="assets/img/brand/glg-logo-white.png" alt="GEEKLEARN GAMES" onerror="this.style.display='none'">
        <span class="auth-brand-name">GEEKLEARN GAMES</span>
      </div>
      <div class="auth-tabs">
        <button class="auth-tab ${_authTab==='login'?'active':''}" data-tab="login">${_at('signIn')}</button>
        <button class="auth-tab ${_authTab==='signup'?'active':''}" data-tab="signup">${_at('signUp')}</button>
      </div>
      ${notice}
      <div class="auth-body">${_authTab==='login' ? _loginFormHTML() : _signupFormHTML()}</div>
    </div>`;
  m.querySelectorAll('.auth-tab').forEach(b => b.addEventListener('click', () => { _authTab = b.dataset.tab; renderAuthModal(); }));
  if (_authTab === 'login') _wireLogin(); else _wireSignup();
}

function _loginFormHTML() {
  return `
    <form id="auth-login" novalidate>
      <label class="auth-field"><span>${_at('email')}</span>
        <input type="email" id="al-email" autocomplete="email" required></label>
      <label class="auth-field"><span>${_at('password')}</span>
        <div class="auth-pw">
          <input type="password" id="al-pass" autocomplete="current-password" required>
          <button type="button" class="auth-pw-eye" id="al-pass-eye" aria-label="${_at('showPw')}" tabindex="-1">${_EYE_SVG}</button>
        </div></label>
      <p class="auth-err" id="al-err" hidden></p>
      <button type="submit" class="btn btn-primary auth-submit" id="al-submit">${_at('submitLogin')}</button>
      <p class="auth-switch">${_at('noAccount')} <button type="button" class="auth-link" onclick="_authTab='signup';renderAuthModal()">${_at('signUp')}</button></p>
    </form>`;
}
function _signupFormHTML() {
  const pad = n => String(n).padStart(2, '0');
  const dayOpts = Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}">${pad(i + 1)}</option>`).join('');
  const months = _AUTH_MONTHS[LANG] || _AUTH_MONTHS.en;
  const monthOpts = months.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
  const yNow = new Date().getFullYear();
  const yearOpts = Array.from({ length: 88 }, (_, i) => { const y = yNow - 13 - i; return `<option value="${y}">${y}</option>`; }).join(''); // 13–100 yrs
  return `
    <form id="auth-signup" novalidate>
      <label class="auth-field"><span>${_at('username')}</span>
        <input type="text" id="as-user" autocomplete="username" required maxlength="20">
        <span class="auth-hint" id="as-user-hint"></span></label>
      <label class="auth-field"><span>${_at('email')}</span>
        <input type="email" id="as-email" autocomplete="email" required></label>
      <label class="auth-field"><span>${_at('password')}</span>
        <div class="auth-pw">
          <input type="password" id="as-pass" autocomplete="new-password" required>
          <button type="button" class="auth-pw-eye" id="as-pass-eye" aria-label="${_at('showPw')}" tabindex="-1">${_EYE_SVG}</button>
        </div>
        <span class="auth-meter" aria-hidden="true"><i id="as-meter"></i></span>
        <span class="auth-hint" id="as-pass-hint"></span></label>
      <div class="auth-field"><span>${_at('gender')}</span>
        <div class="auth-radios">
          <label><input type="radio" name="as-gender" value="male"><span>${_at('male')}</span></label>
          <label><input type="radio" name="as-gender" value="female"><span>${_at('female')}</span></label>
          <label><input type="radio" name="as-gender" value="other"><span>${_at('other')}</span></label>
        </div>
        <input type="text" id="as-gender-other" class="auth-gender-other" placeholder="${_at('specify')}" maxlength="60" hidden></div>
      <div class="auth-field"><span>${_at('dobLbl')}</span>
        <div class="auth-dob">
          <select id="as-day" required aria-label="${_at('dayLbl')}"><option value="" disabled selected>${_at('dayLbl')}</option>${dayOpts}</select>
          <select id="as-month" required aria-label="${_at('monthLbl')}"><option value="" disabled selected>${_at('monthLbl')}</option>${monthOpts}</select>
          <select id="as-year" required aria-label="${_at('yearLbl')}"><option value="" disabled selected>${_at('yearLbl')}</option>${yearOpts}</select>
        </div>
        <span class="auth-hint" id="as-dob-hint"></span></div>
      <label class="auth-consent"><input type="checkbox" id="as-consent"><span>${_at('consent')}</span></label>
      <p class="auth-err" id="as-err" hidden></p>
      <button type="submit" class="btn btn-primary auth-submit" id="as-submit">${_at('submitSignup')}</button>
      <p class="auth-switch">${_at('haveAccount')} <button type="button" class="auth-link" onclick="_authTab='login';renderAuthModal()">${_at('signIn')}</button></p>
    </form>`;
}

function _showErr(id, msg) { const e = $(id); if (e) { e.textContent = msg; e.hidden = false; } }
function _hideErr(id) { const e = $(id); if (e) e.hidden = true; }

function _wireLogin() {
  const form = $('auth-login'); if (!form) return;
  _wirePwEye('al-pass-eye', 'al-pass');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    _hideErr('al-err');
    if (!window.GLG_AUTH?.isConfigured?.()) { _showErr('al-err', _at('notConfigured')); return; }
    const btn = $('al-submit'); const orig = btn.textContent;
    btn.disabled = true; btn.textContent = _at('working');
    const r = await GLG_AUTH.signIn({ email: $('al-email').value, password: $('al-pass').value });
    btn.disabled = false; btn.textContent = orig;
    if (!r.ok) {
      const map = { badCredentials:_at('badCreds'), rateLimit:_at('rateLimit'), notConfirmed:_at('notConfirmed') };
      _showErr('al-err', map[r.code] || _at('fail')); return;
    }
    closeAuthModal(); refreshAccountUI();
  });
}

function _wireSignup() {
  const form = $('auth-signup'); if (!form) return;
  _wirePwEye('as-pass-eye', 'as-pass');

  // Gender "other" → reveal specify input
  form.querySelectorAll('input[name="as-gender"]').forEach(r =>
    r.addEventListener('change', () => {
      $('as-gender-other').hidden = form.querySelector('input[name="as-gender"]:checked')?.value !== 'other';
    }));

  // Password strength meter (live)
  const pass = $('as-pass');
  pass?.addEventListener('input', () => {
    const s = GLG_AUTH.passwordStrength(pass.value);
    const meter = $('as-meter');
    if (meter) { meter.style.width = (s.score / 4 * 100) + '%'; meter.dataset.score = s.score; }
    const labels = _AUTH_T.pwStrength[LANG] || _AUTH_T.pwStrength.en;
    $('as-pass-hint').textContent = pass.value ? labels[s.score] : '';
  });

  // Username availability (debounced)
  const userI = $('as-user'); let utimer = null;
  userI?.addEventListener('input', () => {
    clearTimeout(utimer);
    const hint = $('as-user-hint'); hint.className = 'auth-hint';
    const v = GLG_AUTH.validateUsername(userI.value);
    if (!v.ok) { hint.textContent = userI.value ? (v.code==='tooShort'?_at('uShort'):_at('uInvalid')) : ''; return; }
    hint.textContent = '…';
    utimer = setTimeout(async () => {
      const a = await GLG_AUTH.checkUsernameAvailable(userI.value);
      if (a.ok && a.available) { hint.textContent = _at('uAvail'); hint.classList.add('ok'); }
      else if (a.ok && !a.available) { hint.textContent = _at('uTaken'); hint.classList.add('bad'); }
      else hint.textContent = '';
    }, 450);
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    _hideErr('as-err');
    if (!window.GLG_AUTH?.isConfigured?.()) { _showErr('as-err', _at('notConfigured')); return; }
    if (!$('as-consent').checked) { _showErr('as-err', _at('consentReq')); return; }
    const gender = form.querySelector('input[name="as-gender"]:checked')?.value;
    // Date of birth → validate a real calendar date + minimum age
    const d = +$('as-day').value, mo = +$('as-month').value, y = +$('as-year').value;
    if (!d || !mo || !y) { _showErr('as-err', _at('dobInvalid')); return; }
    const bd = new Date(y, mo - 1, d);
    if (bd.getFullYear() !== y || bd.getMonth() !== mo - 1 || bd.getDate() !== d) { _showErr('as-err', _at('dobInvalid')); return; }
    const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const age = _ageFromDOB(iso);
    if (age == null || age < 13) { _showErr('as-err', _at('ageMin')); return; }
    const btn = $('as-submit'); const orig = btn.textContent;
    btn.disabled = true; btn.textContent = _at('working');
    const r = await GLG_AUTH.signUp({
      username: $('as-user').value, email: $('as-email').value, password: $('as-pass').value,
      gender, genderOther: $('as-gender-other').value, birthdate: iso, age,
    });
    btn.disabled = false; btn.textContent = orig;
    if (!r.ok) {
      const map = { weak:_at('pwWeak'), taken:_at('uTaken'), emailTaken:_at('emailTaken'),
        invalid:_at('emailInvalid'), tooShort:_at('uShort'), required:_at('required'),
        min:_at('ageMin'), max:_at('required'), rateLimit:_at('rateLimit') };
      const msg = (r.field==='gender') ? _at('genderReq') : (map[r.code] || _at('fail'));
      _showErr('as-err', msg);
      return;
    }
    if (r.needsConfirm) { _showErr('as-err', _at('checkEmail')); $('as-err').classList.add('ok'); }
    else { closeAuthModal(); refreshAccountUI(); }
  });
}

async function _profileHTML() {
  const p = await GLG_AUTH.getProfile();
  const u = await GLG_AUTH.getUser();
  const name = p?.username || u?.email?.split('@')[0] || '—';
  const since = p?.created_at ? new Date(p.created_at).toLocaleDateString(LANG_LOCALE[LANG] || 'en-US', { year:'numeric', month:'long' }) : '';
  const initial = (name[0] || '?').toUpperCase();
  const gLabel = p?.gender === 'male' ? _at('male') : p?.gender === 'female' ? _at('female') : (p?.gender_other || _at('other'));
  return `
    <div class="auth-box auth-box--profile" role="dialog" aria-modal="true">
      <button class="auth-close" aria-label="${_at('close')}" onclick="closeAuthModal()">
        <svg width="14" height="14" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      </button>
      <button type="button" class="auth-avatar auth-avatar--btn" id="ap-avatar" aria-label="${_at('avatarChange')}" title="${_at('avatarChange')}">
        ${_avatarDiscHTML(p, u)}
        <span class="auth-avatar-edit" aria-hidden="true">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M11 2l3 3-8 8H3v-3l8-8z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
        </span>
      </button>
      <h3 class="auth-profile-name">${name}</h3>
      <p class="auth-profile-meta">${u?.email || ''}${since ? ` · ${_at('memberSince')} ${since}` : ''}</p>
      <form id="auth-profile" novalidate>
        <label class="auth-field"><span>${_at('username')}</span>
          <input type="text" id="ap-user" value="${name}" maxlength="20"><span class="auth-hint" id="ap-user-hint"></span></label>
        <div class="auth-row">
          <label class="auth-field"><span>${_at('gender')}</span>
            <select id="ap-gender">
              <option value="male" ${p?.gender==='male'?'selected':''}>${_at('male')}</option>
              <option value="female" ${p?.gender==='female'?'selected':''}>${_at('female')}</option>
              <option value="other" ${p?.gender==='other'?'selected':''}>${_at('other')}</option>
            </select></label>
          <label class="auth-field"><span>${_at('age')}</span>
            <input type="number" id="ap-age" min="13" max="120" value="${p?.age ?? ''}"></label>
        </div>
        <label class="auth-field"><span>${_ppt('bioLabel')}</span>
          <textarea id="ap-bio" maxlength="280" rows="3" placeholder="${_ppt('bioPh')}" style="resize:none;font-family:var(--f-body,sans-serif)">${p?.bio ? escHtml(p.bio) : ''}</textarea>
        </label>
        <p class="auth-err" id="ap-err" hidden></p>
        <button type="submit" class="btn btn-primary auth-submit" id="ap-save">${_at('save')}</button>
      </form>
      <div class="auth-profile-actions">
        <button class="auth-link" id="ap-logout">${_at('logout')}</button>
        <button class="auth-link auth-link--danger" id="ap-delete">${_at('del')}</button>
      </div>
    </div>`;
}

function _wireProfile() {
  $('ap-avatar')?.addEventListener('click', openAvatarPicker);
  $('auth-profile')?.addEventListener('submit', async e => {
    e.preventDefault();
    _hideErr('ap-err');
    const btn = $('ap-save'); const orig = btn.textContent;
    btn.disabled = true; btn.textContent = _at('working');
    const r = await GLG_AUTH.updateProfile({
      username: $('ap-user').value, gender: $('ap-gender').value, age: $('ap-age').value,
      bio: ($('ap-bio')?.value || '').trim(),
    });
    btn.disabled = false;
    if (!r.ok) { btn.textContent = orig; _showErr('ap-err', r.code==='taken'?_at('uTaken'):_at('fail')); return; }
    btn.textContent = _at('saved');
    setTimeout(() => { btn.textContent = orig; }, 2000);
    refreshAccountUI();
    if (document.getElementById('page-profile')?.classList.contains('active')) buildProfilePage();
  });
  $('ap-logout')?.addEventListener('click', async () => { await GLG_AUTH.signOut(); closeAuthModal(); refreshAccountUI(); });
  $('ap-delete')?.addEventListener('click', async () => {
    if (!confirm(_at('delConfirm'))) return;
    const r = await GLG_AUTH.deleteAccount();
    if (r.ok) { closeAuthModal(); refreshAccountUI(); }
    else _showErr('ap-err', _at('fail'));
  });
}

/* Preset avatars = circular crops of each work's cover (replace later with
   dedicated character art dropped into assets/img/avatars/). */
function getPresetAvatars() {
  return (typeof ALL_WORKS !== 'undefined' ? ALL_WORKS : []).map(w => ({ id: w.id, label: w.title, src: w.cover }));
}

/* After a picker action: go back to the edit modal, or — if launched from
   the member-space page — just close the overlay and refresh the page. */
function _pickerReturn(){
  if (document.getElementById('page-profile')?.classList.contains('active')) { closeAuthModal(); buildProfilePage(); }
  else renderAuthModal();
}

async function openAvatarPicker() {
  const m = $('glg-auth-modal'); if (!m) return;
  const presets = getPresetAvatars();
  m.innerHTML = `
    <div class="auth-box" role="dialog" aria-modal="true">
      <button class="auth-close" aria-label="${_at('close')}" onclick="closeAuthModal()">
        <svg width="14" height="14" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      </button>
      <button class="auth-back" id="apick-back">‹ ${_at('back')}</button>
      <h3 class="auth-picker-title">${_at('chooseAvatar')}</h3>
      <div class="auth-picker-label">${_at('presetsLabel')}</div>
      <div class="avatar-grid">
        ${presets.map(p => `
          <button class="avatar-cell" data-src="${p.src}" title="${p.label}">
            <img src="${p.src}" alt="${p.label}" loading="lazy" onerror="this.style.opacity=0">
          </button>`).join('')}
      </div>
      <div class="auth-picker-label">${_at('customLabel')}</div>
      <label class="avatar-upload">
        <input type="file" id="apick-file" accept="image/png,image/jpeg,image/webp" hidden>
        <span>＋ ${_at('uploadBtn')}</span>
      </label>
      <p class="auth-err" id="apick-err" hidden></p>
    </div>`;
  if(!m.classList.contains('open')){ document.body.style.overflow='hidden'; m.classList.add('open'); }
  $('apick-back')?.addEventListener('click', _pickerReturn);
  m.querySelectorAll('.avatar-cell').forEach(c => c.addEventListener('click', async () => {
    _hideErr('apick-err');
    const r = await GLG_AUTH.updateProfile({ avatar_url: c.dataset.src });
    if (r.ok) { await refreshAccountUI(); _pickerReturn(); }
    else _showErr('apick-err', r.code === 'notConfigured' ? _at('notConfigured') : _at('fail'));
  }));
  $('apick-file').addEventListener('change', async e => {
    const file = e.target.files?.[0]; if (!file) return;
    _hideErr('apick-err');
    const r = await GLG_AUTH.uploadAvatar(file);
    if (r.ok) { await refreshAccountUI(); _pickerReturn(); return; }
    const map = { mod_off:_at('modOff'), type:_at('imgType'), size:_at('imgSize'),
      rejected:_at('imgRejected'), notConfigured:_at('notConfigured') };
    _showErr('apick-err', map[r.code] || _at('fail'));
  });
}

async function refreshAccountUI() {
  let user = null;
  if (window.GLG_AUTH?.isConfigured?.()) user = await GLG_AUTH.getUser();
  let p = null;
  if (user) p = await GLG_AUTH.getProfile();

  /* ── Wishlist : synchro + fusion invité→compte ────────── */
  if (user && p) {
    const localIds = _wishLoadLocal();
    const base = Array.isArray(p.wishlist) ? p.wishlist.filter(Boolean) : [];
    const merged = Array.from(new Set([...base, ...localIds]));
    if (merged.length !== base.length && window.GLG_AUTH?.isConfigured?.()) {
      const r = await GLG_AUTH.updateProfile({ wishlist: merged });
      if (r && r.ok) p.wishlist = merged; else p.wishlist = base;
    } else {
      p.wishlist = base;
    }
    _accountProfile = p;
    _wishlist = (p.wishlist || []).slice();
    _wishSaveLocal();
  } else {
    _accountProfile = null;
    _wishlist = _wishLoadLocal();
  }
  _wishEmit();

  /* ── Bouton de compte dans la nav ─────────────────────── */
  const btn = $('nav-account-btn');
  if (btn) {
    const avaEl  = btn.querySelector('.nav-account-ava');
    const nameEl = btn.querySelector('.nav-account-name');
    if (user) {
      const name = p?.username || user.email?.split('@')[0] || '';
      btn.classList.add('is-auth');
      if (avaEl)  avaEl.innerHTML = _avatarDiscHTML(p, user);
      if (nameEl) nameEl.innerHTML = escHtml(name) + _verifiedTag(name);
      btn.title = _at('myAccount');
    } else {
      closeAccountMenu();
      btn.classList.remove('is-auth');
      if (avaEl)  avaEl.innerHTML = _ACCOUNT_ICON;
      if (nameEl) nameEl.textContent = '';
      btn.title = _at('account');
    }
  }

  _refreshAgeGated(); // re-render age-sensitive listings when the user (age) changes
  // Keep the member space live if it is the active page
  if (document.getElementById('page-profile')?.classList.contains('active')) buildProfilePage();
}

/* ══════════════════════════════════════════
   PUBLIC PROFILE / MEMBER SPACE  (#page-profile)
   Bannière + avatar + identité + stats + wishlist.
══════════════════════════════════════════ */
const _PP_T = {
  signedOutH:{fr:'Espace membre',en:'Member space'},
  signedOutP:{fr:'Connecte-toi pour accéder à ton profil, ta liste de souhaits et tes préférences — synchronisés sur tous tes appareils.',en:'Sign in to access your profile, wishlist and preferences — synced across all your devices.'},
  signIn:{fr:'Se connecter',en:'Sign in'},
  createAcc:{fr:'Créer un compte',en:'Create account'},
  edit:{fr:'Modifier le profil',en:'Edit profile'},
  editBanner:{fr:'Bannière',en:'Banner'},
  statWish:{fr:'Souhaits',en:'Wishlist'},
  statMember:{fr:'Membre depuis',en:'Member since'},
  statLib:{fr:'Bibliothèque',en:'Library'},
  soon:{fr:'Bientôt',en:'Soon'},
  defaultBanner:{fr:'Par défaut',en:'Default'},
  pickBanner:{fr:'Choisir une bannière',en:'Choose a banner'},
  years:{fr:'ans',en:'yrs'},
  addBio:{fr:'+ Ajouter une bio',en:'+ Add a bio'},
  bioLabel:{fr:'Bio',en:'Bio'},
  bioPh:{fr:'Parle de toi en quelques mots…',en:'Tell the world about you…'},
};
function _ppt(k){ const m=_PP_T[k]; if(!m) return k; return m[LANG]||m.en; }

async function buildProfilePage(){
  const host = $('page-profile'); if(!host) return;
  const configured = !!window.GLG_AUTH?.isConfigured?.();
  const user = configured ? await GLG_AUTH.getUser() : null;

  /* ── Visiteur non connecté ── */
  if(!user){
    host.innerHTML = `
      <section class="pp-signed-out">
        <div class="pp-so-inner reveal">
          <div class="pp-so-badge">${_ACCOUNT_ICON}</div>
          <h1 class="pp-so-title">${_ppt('signedOutH')}</h1>
          <p class="pp-so-desc">${_ppt('signedOutP')}</p>
          <div class="pp-so-actions">
            <button class="btn btn-primary" onclick="openAuthModal('login')">${_ppt('signIn')}</button>
            <button class="btn btn-outline" onclick="openAuthModal('signup')">${_ppt('createAcc')}</button>
          </div>
          ${wishCount() ? `<div class="pp-section pp-so-wish"><div class="pp-sec-head"><h2 class="pp-sec-title">${_wt('title')}</h2><span class="pp-sec-count" id="pp-wish-count">${wishCount()}</span></div><div class="pp-wish-grid" id="pp-wish-grid"></div></div>` : ''}
        </div>
      </section>
      ${footerHTML()}`;
    _renderProfileWishlist();
    setTimeout(initReveal, 60);
    return;
  }

  /* ── Membre connecté ── */
  const p = (await GLG_AUTH.getProfile()) || {};
  const name  = p.username || user.email?.split('@')[0] || '—';
  const since = p.created_at ? new Date(p.created_at).toLocaleDateString(LANG_LOCALE[LANG]||'en-US',{year:'numeric',month:'long'}) : '—';
  const gLabel = p.gender==='male' ? _at('male') : p.gender==='female' ? _at('female') : (p.gender_other || _at('other'));
  const banner = p.banner_url;

  host.innerHTML = `
    <section class="pp">
      <div class="pp-banner ${banner?'has-img':''}" ${banner?`style="background-image:url('${banner}')"`:''}>
        <div class="pp-banner-scrim"></div>
        <button class="pp-banner-edit" onclick="openBannerPicker()" title="${_ppt('editBanner')}" aria-label="${_ppt('pickBanner')}">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M11 2l3 3-8 8H3v-3l8-8z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
          <span>${_ppt('editBanner')}</span>
        </button>
      </div>

      <div class="pp-head">
        <button class="pp-avatar" onclick="openAvatarPicker()" title="${_at('avatarChange')}" aria-label="${_at('avatarChange')}">
          ${_avatarDiscHTML(p, user)}
          <span class="pp-avatar-edit" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M11 2l3 3-8 8H3v-3l8-8z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg></span>
        </button>
        <div class="pp-id">
          <h1 class="pp-name">${name}${_verifiedTag(name,'glg-verified--lg')}</h1>
          <div class="pp-badges">
            <span class="pp-badge">${gLabel}</span>
            ${p.age?`<span class="pp-badge">${p.age} ${_ppt('years')}</span>`:''}
            <span class="pp-badge pp-badge--muted">${_ppt('statMember')} ${since}</span>
          </div>
          ${p.bio ? `<p class="pp-bio">${escHtml(p.bio)}</p>` : `<button class="pp-bio-add" onclick="openAuthModal()">${_ppt('addBio')}</button>`}
        </div>
        <div class="pp-actions">
          <button class="btn btn-outline pp-edit-btn" onclick="openAuthModal()">${_ppt('edit')}</button>
        </div>
      </div>

      <div class="pp-stats">
        <div class="pp-stat"><b id="pp-stat-wish">${wishCount()}</b><span>${_ppt('statWish')}</span></div>
        <div class="pp-stat"><b id="pp-stat-trophies">0</b><span>${_tt('section')}</span></div>
        <div class="pp-stat"><b id="pp-stat-friends">0</b><span>${_ft('statFriends')}</span></div>
        <div class="pp-stat pp-stat--soon"><b>0</b><span>${_ppt('statLib')} · ${_ppt('soon')}</span></div>
      </div>

      <div class="pp-section pp-trophy-section">
        <div class="pp-sec-head"><h2 class="pp-sec-title">${_tt('level')}</h2></div>
        <div id="pp-trophy-showcase" class="pp-trophy-showcase"></div>
      </div>

      <div class="pp-section pp-link-section">
        <div class="pp-sec-head"><h2 class="pp-sec-title">${_lt('title')}</h2></div>
        <div class="pp-link-rows">${_platformSectionHTML(p.linked_accounts)}</div>
      </div>

      <div class="pp-section pp-friends-section">
        <div class="pp-sec-head">
          <h2 class="pp-sec-title">${_ft('title')}</h2>
          <span class="pp-sec-count" id="pp-friends-count">0</span>
          <button class="pp-add-friend" onclick="openFriendSearch()">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
            <span>${_ft('addFriend')}</span>
          </button>
        </div>
        <div id="pp-friends-body" class="pp-friends-body"></div>
      </div>

      <div class="pp-section pp-tg-section">
        <div class="pp-sec-head"><h2 class="pp-sec-title">${_tt('byGame')}</h2></div>
        <div id="pp-trophy-games" class="pp-tg-grid"></div>
      </div>

      <div class="pp-section">
        <div class="pp-sec-head"><h2 class="pp-sec-title">${_wt('title')}</h2><span class="pp-sec-count" id="pp-wish-count">${wishCount()}</span></div>
        <div class="pp-wish-grid" id="pp-wish-grid"></div>
      </div>
    </section>
    ${footerHTML()}`;
  _renderProfileWishlist();
  refreshFriendsUI();
  refreshTrophiesUI();
  setTimeout(initReveal, 60);
}

/* Render (or re-render) the wishlist grid inside the member space. */
function _renderProfileWishlist(){
  const grid = document.getElementById('pp-wish-grid'); if(!grid) return;
  const ids  = wishGet();
  const works = (typeof ALL_WORKS!=='undefined'?ALL_WORKS:[]).filter(w => ids.includes(w.id) && !isMatureHidden(w));
  const cntEl = document.getElementById('pp-wish-count'); if(cntEl) cntEl.textContent = works.length;
  const statEl = document.getElementById('pp-stat-wish'); if(statEl) statEl.textContent = works.length;
  if(!works.length){
    grid.innerHTML = `<div class="pp-wish-empty"><div class="pp-wish-empty-heart">${_HEART_SVG}</div><p>${_wt('empty')}</p><button class="btn btn-outline" onclick="showPage('works')">${_wt('emptyCta')}</button></div>`;
    return;
  }
  grid.innerHTML = works.map(w=>{
    const tint = w.tint || '#ffffff'; const tintRgb = hexToRgb(tint) || '255,255,255';
    return `<div class="pp-wish-card" style="--tint:${tint};--tint-rgb:${tintRgb}">
      <button class="pp-wish-remove" data-wish="${w.id}" aria-label="${_wt('remove')}" title="${_wt('remove')}" onclick="event.stopPropagation();toggleWish('${w.id}',this)">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
      </button>
      <div class="pp-wish-cover" role="button" tabindex="0" aria-label="${w.title}" onclick="showPage('detail','${w.id}')">
        <img src="${av(w.cover)}" alt="${w.title}" loading="lazy" onerror="this.style.opacity=0">
        <span class="pp-wish-status ${w.status}">${getStatusLabel(w)}</span>
      </div>
      <div class="pp-wish-info">
        <div class="pp-wish-name">${w.title}</div>
        <div class="pp-wish-meta">${w.year} · <span class="price-display" data-base-price="${w.basePrice ?? ''}">${getPrice(w)}</span></div>
      </div>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════════
   AMIS / CONTACTS  (style Steam/Epic)
   UI câblée sur GLG_AUTH.{searchUsers,friendRequest,friendRespond,
   friendRemove,friendsList}. Tout passe par des RPC sécurisées (RLS).
   Conçu pour migrer tel quel dans un futur launcher.
══════════════════════════════════════════ */
const _FRIEND_T = {
  title:      { fr:'Amis', en:'Friends', es:'Amigos', de:'Freunde', it:'Amici', ar:'الأصدقاء', zh:'好友', ja:'フレンド', ru:'Друзья', pl:'Znajomi' },
  add:        { fr:'Ajouter', en:'Add', es:'Añadir', de:'Hinzufügen', it:'Aggiungi', ar:'إضافة', zh:'添加', ja:'追加', ru:'Добавить', pl:'Dodaj' },
  addFriend:  { fr:'Ajouter un ami', en:'Add a friend', es:'Añadir un amigo', de:'Freund hinzufügen', it:'Aggiungi un amico', ar:'إضافة صديق', zh:'添加好友', ja:'フレンドを追加', ru:'Добавить друга', pl:'Dodaj znajomego' },
  searchPh:   { fr:'Rechercher un pseudo…', en:'Search a username…', es:'Buscar un usuario…', de:'Benutzernamen suchen…', it:'Cerca un nome…', ar:'ابحث عن اسم…', zh:'搜索用户名…', ja:'ユーザー名を検索…', ru:'Поиск по имени…', pl:'Szukaj nazwy…' },
  incoming:   { fr:'Demandes reçues', en:'Friend requests', es:'Solicitudes', de:'Anfragen', it:'Richieste', ar:'الطلبات الواردة', zh:'好友请求', ja:'受信したリクエスト', ru:'Входящие запросы', pl:'Zaproszenia' },
  outgoing:   { fr:'En attente', en:'Pending', es:'Pendientes', de:'Ausstehend', it:'In attesa', ar:'قيد الانتظار', zh:'等待中', ja:'保留中', ru:'Ожидание', pl:'Oczekujące' },
  accept:     { fr:'Accepter', en:'Accept', es:'Aceptar', de:'Annehmen', it:'Accetta', ar:'قبول', zh:'接受', ja:'承認', ru:'Принять', pl:'Akceptuj' },
  decline:    { fr:'Refuser', en:'Decline', es:'Rechazar', de:'Ablehnen', it:'Rifiuta', ar:'رفض', zh:'拒绝', ja:'拒否', ru:'Отклонить', pl:'Odrzuć' },
  remove:     { fr:'Retirer', en:'Remove', es:'Quitar', de:'Entfernen', it:'Rimuovi', ar:'إزالة', zh:'移除', ja:'削除', ru:'Удалить', pl:'Usuń' },
  cancel:     { fr:'Annuler', en:'Cancel', es:'Cancelar', de:'Abbrechen', it:'Annulla', ar:'إلغاء', zh:'取消', ja:'キャンセル', ru:'Отмена', pl:'Anuluj' },
  pending:    { fr:'Envoyée', en:'Sent', es:'Enviada', de:'Gesendet', it:'Inviata', ar:'أُرسلت', zh:'已发送', ja:'送信済み', ru:'Отправлено', pl:'Wysłano' },
  friendTag:  { fr:'Ami', en:'Friend', es:'Amigo', de:'Freund', it:'Amico', ar:'صديق', zh:'好友', ja:'フレンド', ru:'Друг', pl:'Znajomy' },
  empty:      { fr:'Aucun ami pour l’instant. Ajoute des contacts pour bâtir ton réseau.', en:'No friends yet. Add contacts to build your network.', es:'Aún no tienes amigos. Añade contactos para crear tu red.', de:'Noch keine Freunde. Füge Kontakte hinzu, um dein Netzwerk aufzubauen.', it:'Ancora nessun amico. Aggiungi contatti per creare la tua rete.', ar:'لا أصدقاء بعد. أضف جهات اتصال لبناء شبكتك.', zh:'还没有好友。添加联系人来建立你的网络。', ja:'まだフレンドがいません。連絡先を追加してネットワークを築きましょう。', ru:'Пока нет друзей. Добавьте контакты, чтобы создать свою сеть.', pl:'Brak znajomych. Dodaj kontakty, aby zbudować sieć.' },
  searchEmpty:{ fr:'Aucun utilisateur trouvé.', en:'No user found.', es:'No se encontró ningún usuario.', de:'Kein Benutzer gefunden.', it:'Nessun utente trovato.', ar:'لم يُعثر على مستخدم.', zh:'未找到用户。', ja:'ユーザーが見つかりません。', ru:'Пользователь не найден.', pl:'Nie znaleziono użytkownika.' },
  searchHint: { fr:'Tape au moins 2 caractères.', en:'Type at least 2 characters.', es:'Escribe al menos 2 caracteres.', de:'Mindestens 2 Zeichen eingeben.', it:'Digita almeno 2 caratteri.', ar:'اكتب حرفين على الأقل.', zh:'请至少输入 2 个字符。', ja:'2文字以上入力してください。', ru:'Введите минимум 2 символа.', pl:'Wpisz co najmniej 2 znaki.' },
  statFriends:{ fr:'Amis', en:'Friends', es:'Amigos', de:'Freunde', it:'Amici', ar:'الأصدقاء', zh:'好友', ja:'フレンド', ru:'Друзья', pl:'Znajomi' },
  needAcc:    { fr:'Connecte-toi pour gérer tes amis.', en:'Sign in to manage your friends.', es:'Inicia sesión para gestionar tus amigos.', de:'Melde dich an, um deine Freunde zu verwalten.', it:'Accedi per gestire i tuoi amici.', ar:'سجّل الدخول لإدارة أصدقائك.', zh:'登录以管理好友。', ja:'ログインしてフレンドを管理。', ru:'Войдите, чтобы управлять друзьями.', pl:'Zaloguj się, aby zarządzać znajomymi.' },
};
function _ft(k){ const m=_FRIEND_T[k]; if(!m) return k; return m[LANG]||m.en; }

const _XSVG = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';

/* ── Compte officiel / vérifié (créateur) ──────────────────────────────
   Pseudo unique en base → check par pseudo sûr. Badge monochrome (sceau
   blanc + coche sombre), au ton du site. */
const VERIFIED_USERS = ['geeklearn'];
function _isVerified(username){ return !!username && VERIFIED_USERS.includes(String(username).trim().toLowerCase()); }
const _VERIFIED_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.6l2.3 1.7 2.8-.4 1 2.7 2.5 1.3-.5 2.8L21.8 12l-1.7 2.3.5 2.8-2.5 1.3-1 2.7-2.8-.4L12 22.4l-2.3-1.7-2.8.4-1-2.7-2.5-1.3.5-2.8L2.2 12l1.7-2.3-.5-2.8 2.5-1.3 1-2.7 2.8.4z" fill="currentColor"/><path d="M8 12.3l2.7 2.7 5-5.5" stroke="#0a0a0a" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function _verifiedTag(username, cls){
  if (!_isVerified(username)) return '';
  return `<span class="glg-verified ${cls||''}" title="Compte officiel · GEEKLEARN GAMES" aria-label="Compte vérifié">${_VERIFIED_SVG}</span>`;
}

/* Avatar disc for an arbitrary user {username, avatar_url} */
function _userAvatarHTML(u){
  const init = (u.username || '?').trim().charAt(0).toUpperCase();
  if (u.avatar_url) return `<img class="ava-img" src="${u.avatar_url}" alt="" loading="lazy" onerror="this.remove()"><span class="ava-init ava-init--fallback">${init}</span>`;
  return `<span class="ava-init">${init}</span>`;
}

let _friendsCache = { friends:[], incoming:[], outgoing:[] };
/* (Re)load + render the friends section inside the member space. */
async function refreshFriendsUI(){
  const body = document.getElementById('pp-friends-body');
  if (!body) return;
  if (!window.GLG_AUTH?.isConfigured?.()){ body.innerHTML = `<p class="pp-friends-note">${_ft('needAcc')}</p>`; return; }
  const r = await GLG_AUTH.friendsList();
  _friendsCache = { friends:r.friends||[], incoming:r.incoming||[], outgoing:r.outgoing||[] };
  const cnt = document.getElementById('pp-friends-count'); if (cnt) cnt.textContent = _friendsCache.friends.length;
  const stat = document.getElementById('pp-stat-friends'); if (stat) stat.textContent = _friendsCache.friends.length;

  let html = '';
  if (_friendsCache.incoming.length){
    html += `<div class="pp-fr-block"><div class="pp-fr-label">${_ft('incoming')} <span class="pp-fr-badge">${_friendsCache.incoming.length}</span></div><div class="pp-fr-reqs">` +
      _friendsCache.incoming.map(u => `
        <div class="pp-fr-req">
          <span class="pp-fr-ava">${_userAvatarHTML(u)}</span>
          <span class="pp-fr-name">${escHtml(u.username||'')}${_verifiedTag(u.username)}</span>
          <span class="pp-fr-actions">
            <button class="pp-fr-accept" onclick="friendAccept('${u.id}')">${_ft('accept')}</button>
            <button class="pp-fr-decline" onclick="friendDecline('${u.id}')" aria-label="${_ft('decline')}" title="${_ft('decline')}">${_XSVG}</button>
          </span>
        </div>`).join('') + `</div></div>`;
  }

  html += `<div class="pp-fr-block"><div class="pp-fr-label">${_ft('title')} <span class="pp-fr-badge">${_friendsCache.friends.length}</span></div>`;
  if (_friendsCache.friends.length){
    html += `<div class="pp-friends-grid">` + _friendsCache.friends.map(u => `
        <div class="pp-friend-card">
          <span class="pp-friend-ava">${_userAvatarHTML(u)}<span class="pp-friend-dot" aria-hidden="true"></span></span>
          <span class="pp-friend-name">${escHtml(u.username||'')}${_verifiedTag(u.username)}</span>
          <button class="pp-friend-remove" onclick="friendRemoveUI('${u.id}')" aria-label="${_ft('remove')}" title="${_ft('remove')}">${_XSVG}</button>
        </div>`).join('') + `</div>`;
  } else {
    html += `<p class="pp-friends-note">${_ft('empty')}</p>`;
  }
  html += `</div>`;

  if (_friendsCache.outgoing.length){
    html += `<div class="pp-fr-block"><div class="pp-fr-label">${_ft('outgoing')} <span class="pp-fr-badge">${_friendsCache.outgoing.length}</span></div><div class="pp-fr-reqs">` +
      _friendsCache.outgoing.map(u => `
        <div class="pp-fr-req pp-fr-req--out">
          <span class="pp-fr-ava">${_userAvatarHTML(u)}</span>
          <span class="pp-fr-name">${escHtml(u.username||'')}${_verifiedTag(u.username)}</span>
          <span class="pp-fr-pending">${_ft('pending')}</span>
          <button class="pp-fr-decline" onclick="friendRemoveUI('${u.id}')" aria-label="${_ft('cancel')}" title="${_ft('cancel')}">${_XSVG}</button>
        </div>`).join('') + `</div></div>`;
  }
  body.innerHTML = html;
}
async function friendAccept(id){ if(window.GLG_AUTH?.friendRespond){ await GLG_AUTH.friendRespond(id, true); } refreshFriendsUI(); }
async function friendDecline(id){ if(window.GLG_AUTH?.friendRespond){ await GLG_AUTH.friendRespond(id, false); } refreshFriendsUI(); }
async function friendRemoveUI(id){ if(window.GLG_AUTH?.friendRemove){ await GLG_AUTH.friendRemove(id); } refreshFriendsUI(); }

/* ── Friend search modal (reuses the auth modal shell) ── */
let _frSearchTimer = null;
function openFriendSearch(){
  const m = $('glg-auth-modal'); if(!m) return;
  m.innerHTML = `
    <div class="auth-box auth-box--wide fr-modal" role="dialog" aria-modal="true" aria-label="${_ft('addFriend')}">
      <button class="auth-close" aria-label="${_at('close')}" onclick="closeAuthModal()">${_XSVG}</button>
      <h3 class="auth-picker-title">${_ft('addFriend')}</h3>
      <div class="fr-search-row">
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="9" cy="9" r="6.5" stroke="currentColor" stroke-width="1.5"/><path d="M14 14l3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        <input id="fr-search-input" type="text" autocomplete="off" spellcheck="false" placeholder="${_ft('searchPh')}" aria-label="${_ft('searchPh')}">
      </div>
      <div id="fr-search-results" class="fr-search-results"><p class="pp-friends-note">${_ft('searchHint')}</p></div>
    </div>`;
  if(!m.classList.contains('open')){ document.body.style.overflow='hidden'; m.classList.add('open'); }
  const inp = $('fr-search-input');
  if (inp){
    inp.addEventListener('input', () => { clearTimeout(_frSearchTimer); _frSearchTimer = setTimeout(() => _friendSearchDo(inp.value), 280); });
    inp.focus();
  }
}
async function _friendSearchDo(q){
  const box = $('fr-search-results'); if(!box) return;
  const v = (q||'').trim();
  if (v.length < 2){ box.innerHTML = `<p class="pp-friends-note">${_ft('searchHint')}</p>`; return; }
  if (!window.GLG_AUTH?.isConfigured?.()){ box.innerHTML = `<p class="pp-friends-note">${_at('notConfigured')}</p>`; return; }
  const r = await GLG_AUTH.searchUsers(v);
  const rows = r.results || [];
  if (!rows.length){ box.innerHTML = `<p class="pp-friends-note">${_ft('searchEmpty')}</p>`; return; }
  box.innerHTML = rows.map(u => {
    let action;
    if (u.relation === 'friends')      action = `<span class="fr-res-tag">${_ft('friendTag')}</span>`;
    else if (u.relation === 'outgoing')action = `<span class="fr-res-tag fr-res-tag--muted">${_ft('pending')}</span>`;
    else if (u.relation === 'incoming')action = `<button class="fr-res-add" onclick="friendAdd('${u.id}',this)">${_ft('accept')}</button>`;
    else                               action = `<button class="fr-res-add" onclick="friendAdd('${u.id}',this)">${_ft('add')}</button>`;
    return `<div class="fr-res">
      <span class="fr-res-ava">${_userAvatarHTML(u)}</span>
      <span class="fr-res-name">${escHtml(u.username||'')}${_verifiedTag(u.username)}</span>
      ${action}
    </div>`;
  }).join('');
}
async function friendAdd(id, btn){
  if (btn){ btn.disabled = true; }
  let res = null;
  if (window.GLG_AUTH?.friendRequest){ const r = await GLG_AUTH.friendRequest(id); res = r.result; }
  if (btn){
    const span = document.createElement('span');
    span.className = 'fr-res-tag fr-res-tag--muted';
    span.textContent = res === 'friends' ? _ft('friendTag') : _ft('pending');
    btn.replaceWith(span);
  }
  refreshFriendsUI(); // keep the profile section in sync in the background
}

/* ══════════════════════════════════════════
   TROPHÉES / SUCCÈS  (style PlayStation)
   Définitions = data.js TROPHIES. Déblocages = base (RLS).
   Platine auto quand tous les autres trophées d'un jeu sont obtenus.
══════════════════════════════════════════ */
const _TROPHY_T = {
  level:    { fr:'Niveau de trophées', en:'Trophy level', es:'Nivel de trofeos', de:'Trophäen-Level', it:'Livello trofei', ar:'مستوى الجوائز', zh:'奖杯等级', ja:'トロフィーレベル', ru:'Уровень трофеев', pl:'Poziom trofeów' },
  section:  { fr:'Trophées', en:'Trophies', es:'Trofeos', de:'Trophäen', it:'Trofei', ar:'الجوائز', zh:'奖杯', ja:'トロフィー', ru:'Трофеи', pl:'Trofea' },
  byGame:   { fr:'Trophées par jeu', en:'Trophies by title', es:'Trofeos por título', de:'Trophäen nach Titel', it:'Trofei per titolo', ar:'الجوائز حسب اللعبة', zh:'各作品奖杯', ja:'タイトル別トロフィー', ru:'Трофеи по тайтлам', pl:'Trofea wg tytułu' },
  platinum: { fr:'Platine', en:'Platinum', es:'Platino', de:'Platin', it:'Platino', ar:'بلاتيني', zh:'白金', ja:'プラチナ', ru:'Платина', pl:'Platyna' },
  gold:     { fr:'Or', en:'Gold', es:'Oro', de:'Gold', it:'Oro', ar:'ذهبي', zh:'金', ja:'ゴールド', ru:'Золото', pl:'Złoto' },
  silver:   { fr:'Argent', en:'Silver', es:'Plata', de:'Silber', it:'Argento', ar:'فضي', zh:'银', ja:'シルバー', ru:'Серебро', pl:'Srebro' },
  bronze:   { fr:'Bronze', en:'Bronze', es:'Bronce', de:'Bronze', it:'Bronzo', ar:'برونزي', zh:'铜', ja:'ブロンズ', ru:'Бронза', pl:'Brąz' },
  hidden:   { fr:'Trophée caché', en:'Hidden trophy', es:'Trofeo oculto', de:'Verstecktes Trophäe', it:'Trofeo nascosto', ar:'جائزة مخفية', zh:'隐藏奖杯', ja:'隠しトロフィー', ru:'Скрытый трофей', pl:'Ukryte trofeum' },
  hiddenD:  { fr:'Continue de jouer pour le révéler.', en:'Keep playing to reveal it.', es:'Sigue jugando para revelarlo.', de:'Spiele weiter, um es freizuschalten.', it:'Continua a giocare per rivelarlo.', ar:'واصل اللعب لكشفها.', zh:'继续游玩以解锁。', ja:'プレイを続けて解放しよう。', ru:'Продолжайте играть, чтобы открыть.', pl:'Graj dalej, aby odblokować.' },
  none:     { fr:'Aucun trophée débloqué pour l’instant — tes jeux rempliront cet espace.', en:'No trophies unlocked yet — your games will fill this in.', es:'Aún no hay trofeos — tus juegos los llenarán.', de:'Noch keine Trophäen — deine Spiele füllen das.', it:'Ancora nessun trofeo — i tuoi giochi lo riempiranno.', ar:'لا جوائز بعد — ألعابك ستملؤها.', zh:'尚无奖杯——你的游戏将填满这里。', ja:'まだトロフィーなし——ゲームが埋めていきます。', ru:'Пока нет трофеев — ваши игры их заполнят.', pl:'Brak trofeów — twoje gry je wypełnią.' },
  view:     { fr:'Voir les trophées', en:'View trophies', es:'Ver trofeos', de:'Trophäen ansehen', it:'Vedi trofei', ar:'عرض الجوائز', zh:'查看奖杯', ja:'トロフィーを見る', ru:'Смотреть трофеи', pl:'Zobacz trofea' },
};
function _tt(k){ const m=_TROPHY_T[k]; return m ? (m[LANG]||m.en) : k; }
const _TROPHY_SVG = '<svg class="trophy-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 4h8v4a4 4 0 0 1-8 0V4z" fill="currentColor"/><path d="M8 5H5v1a3 3 0 0 0 3 3M16 5h3v1a3 3 0 0 1-3 3" stroke="currentColor" stroke-width="1.5"/><path d="M12 12v3" stroke="currentColor" stroke-width="1.5"/><path d="M9.5 20l.6-3h3.8l.6 3z" fill="currentColor"/><path d="M8.5 20h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
const _TIER_POINTS = { bronze:15, silver:30, gold:90, platinum:180 };
const _TIER_ORDER  = { platinum:0, gold:1, silver:2, bronze:3 };
let _achKeys = new Set();

function computeTrophies(){
  const counts = { bronze:0, silver:0, gold:0, platinum:0 };
  const earned = { bronze:0, silver:0, gold:0, platinum:0 };
  let points = 0; const byGame = [];
  Object.keys(TROPHIES).forEach(gid => {
    const work = (typeof ALL_WORKS!=='undefined'?ALL_WORKS:[]).find(w => w.id === gid);
    if (!work || isMatureHidden(work)) return;       // respecte l'age-gating
    const list = TROPHIES[gid];
    const nonPlat = list.filter(x => x.tier !== 'platinum');
    let gEarned = 0; const tiers = { bronze:0, silver:0, gold:0, platinum:0 };
    list.forEach(tr => {
      counts[tr.tier]++;
      const isEarned = (tr.tier === 'platinum')
        ? (nonPlat.length > 0 && nonPlat.every(x => _achKeys.has(gid + '/' + x.code)))
        : _achKeys.has(gid + '/' + tr.code);
      if (isEarned){ earned[tr.tier]++; tiers[tr.tier]++; gEarned++; points += _TIER_POINTS[tr.tier]; }
    });
    byGame.push({ gid, work, total:list.length, earned:gEarned, tiers,
      pct: list.length ? Math.round(gEarned / list.length * 100) : 0 });
  });
  byGame.sort((a,b) => b.pct - a.pct || b.earned - a.earned);
  const total = counts.bronze+counts.silver+counts.gold+counts.platinum;
  const earnedTotal = earned.bronze+earned.silver+earned.gold+earned.platinum;
  const level = Math.max(1, Math.floor(Math.sqrt(points / 45)) + (earned.platinum));
  return { counts, earned, total, earnedTotal, points, level, byGame };
}

function _tierTileHTML(tier, earned, total){
  return `<div class="pp-tier pp-tier--${tier}">
      <span class="pp-tier-ico">${_TROPHY_SVG}</span>
      <span class="pp-tier-count">${earned}<span class="pp-tier-total">/${total}</span></span>
      <span class="pp-tier-label">${_tt(tier)}</span>
    </div>`;
}
function trophyShowcaseHTML(d){
  const pct = d.total ? Math.round(d.earnedTotal / d.total * 100) : 0;
  return `
    <div class="pp-trophy-level">
      <div class="pp-tl-badge"><span class="pp-tl-num">${d.level}</span><span class="pp-tl-cup">${_TROPHY_SVG}</span></div>
      <div class="pp-tl-meta">
        <span class="pp-tl-title">${_tt('level')}</span>
        <span class="pp-tl-sub">${d.earnedTotal} / ${d.total} · ${pct}%</span>
        <span class="pp-tl-bar"><i style="width:${pct}%"></i></span>
      </div>
    </div>
    <div class="pp-tiers">
      ${_tierTileHTML('platinum', d.earned.platinum, d.counts.platinum)}
      ${_tierTileHTML('gold',     d.earned.gold,     d.counts.gold)}
      ${_tierTileHTML('silver',   d.earned.silver,   d.counts.silver)}
      ${_tierTileHTML('bronze',   d.earned.bronze,   d.counts.bronze)}
    </div>`;
}
function trophyGameCardHTML(g){
  const tint = g.work.tint || '#ffffff'; const rgb = hexToRgb(tint) || '255,255,255';
  const mini = ['platinum','gold','silver','bronze'].filter(t => g.tiers[t] > 0)
    .map(t => `<span class="pp-tg-mini pp-tier--${t}">${_TROPHY_SVG}${g.tiers[t]}</span>`).join('');
  return `<button class="pp-tg-card" style="--tint:${tint};--tint-rgb:${rgb}" onclick="openTrophyList('${g.gid}')" aria-label="${g.work.title}">
      <span class="pp-tg-cover"><img src="${av(g.work.cover)}" alt="${g.work.title}" loading="lazy" onerror="this.style.opacity=0"></span>
      <span class="pp-tg-body">
        <span class="pp-tg-name">${g.work.title}</span>
        <span class="pp-tg-stats">${g.earned}/${g.total} · ${g.pct}%</span>
        <span class="pp-tg-mini-row">${mini || `<span class="pp-tg-none">${_tt('platinum')} · 0</span>`}</span>
      </span>
      <span class="pp-tg-ring" style="--pct:${g.pct}"><span class="pp-tg-ring-in">${g.pct}<small>%</small></span></span>
    </button>`;
}
async function refreshTrophiesUI(){
  if (window.GLG_AUTH?.isConfigured?.()){
    try { const r = await GLG_AUTH.getAchievements(); _achKeys = new Set(r.keys || []); } catch(e){ _achKeys = new Set(); }
  } else { _achKeys = new Set(); }
  const d = computeTrophies();
  const statT = document.getElementById('pp-stat-trophies'); if (statT) statT.textContent = d.earnedTotal;
  const sc = document.getElementById('pp-trophy-showcase'); if (sc) sc.innerHTML = trophyShowcaseHTML(d);
  const bg = document.getElementById('pp-trophy-games');
  if (bg) bg.innerHTML = d.byGame.length ? d.byGame.map(trophyGameCardHTML).join('') : `<p class="pp-friends-note">${_tt('none')}</p>`;
}
/* Trophy list for one title (PS-style), opened in the shared modal. */
function openTrophyList(gid){
  const m = $('glg-auth-modal'); if(!m) return;
  const work = (typeof ALL_WORKS!=='undefined'?ALL_WORKS:[]).find(w => w.id === gid);
  const list = (TROPHIES[gid] || []).slice().sort((a,b) => _TIER_ORDER[a.tier]-_TIER_ORDER[b.tier]);
  const nonPlat = list.filter(x => x.tier !== 'platinum');
  const rows = list.map(tr => {
    const earned = (tr.tier === 'platinum')
      ? (nonPlat.length>0 && nonPlat.every(x => _achKeys.has(gid+'/'+x.code)))
      : _achKeys.has(gid+'/'+tr.code);
    const txt = _trophyTxt(tr);
    const masked = tr.hidden && !earned;
    return `<div class="tl-row ${earned?'is-earned':'is-locked'}">
        <span class="tl-ico pp-tier--${tr.tier}">${_TROPHY_SVG}</span>
        <span class="tl-body">
          <span class="tl-name">${masked ? _tt('hidden') : escHtml(txt.t)}</span>
          <span class="tl-desc">${masked ? _tt('hiddenD') : escHtml(txt.d)}</span>
        </span>
        <span class="tl-tier pp-tier--${tr.tier}">${_tt(tr.tier)}</span>
      </div>`;
  }).join('');
  m.innerHTML = `
    <div class="auth-box auth-box--wide tl-modal" role="dialog" aria-modal="true" aria-label="${work?work.title:''}">
      <button class="auth-close" aria-label="${_at('close')}" onclick="closeAuthModal()">${_XSVG}</button>
      <div class="tl-head" style="--tint:${work?.tint||'#fff'}">
        <span class="tl-head-cover"><img src="${av(work?.cover||'')}" alt="" onerror="this.style.opacity=0"></span>
        <span class="tl-head-id"><span class="tl-head-eyebrow">${_tt('section')}</span><span class="tl-head-name">${work?work.title:gid}</span></span>
      </div>
      <div class="tl-list">${rows}</div>
    </div>`;
  if(!m.classList.contains('open')){ document.body.style.overflow='hidden'; m.classList.add('open'); }
}
function _trophyTxt(tr){ return tr[LANG] || tr.en || { t:tr.code, d:'' }; }

/* ── Fiches détail "magazine" : tags, facts, teaser trophées ───────────── */
const _DPX_T = {
  players:    { fr:'Joueurs', en:'Players', es:'Jugadores', de:'Spieler', it:'Giocatori', ar:'اللاعبون', zh:'玩家', ja:'プレイ人数', ru:'Игроки', pl:'Gracze' },
  solo:       { fr:'Solo', en:'Single-player', es:'Un jugador', de:'Einzelspieler', it:'Giocatore singolo', ar:'لاعب واحد', zh:'单人', ja:'シングル', ru:'Одиночная', pl:'Jednoosobowa' },
  languages:  { fr:'Langues', en:'Languages', es:'Idiomas', de:'Sprachen', it:'Lingue', ar:'اللغات', zh:'语言', ja:'言語', ru:'Языки', pl:'Języki' },
  rating:     { fr:'Classification', en:'Rating', es:'Clasificación', de:'Einstufung', it:'Classificazione', ar:'التصنيف', zh:'分级', ja:'レーティング', ru:'Возраст', pl:'Klasyfikacja' },
  ratingAdult:{ fr:'18+', en:'18+', es:'18+', de:'18+', it:'18+', ar:'+18', zh:'18+', ja:'18+', ru:'18+', pl:'18+' },
  ratingTeen: { fr:'12+', en:'12+', es:'12+', de:'12+', it:'12+', ar:'+12', zh:'12+', ja:'12+', ru:'12+', pl:'12+' },
};
function _dx(k){ const m=_DPX_T[k]; return m ? (m[LANG]||m.en) : k; }

function _workTagsHTML(item){
  const ids = (typeof WORK_TAGS!=='undefined' && WORK_TAGS[item.id]) || [];
  if (!ids.length) return '';
  return `<div class="dp-tags">${ids.map(id => {
    const l = (typeof TAG_LABELS!=='undefined') ? TAG_LABELS[id] : null;
    return `<span class="dp-tag">${l ? (l[LANG]||l.en) : id}</span>`;
  }).join('')}</div>`;
}
function _gameTrophySummary(gid){
  const list = (typeof TROPHIES!=='undefined') ? TROPHIES[gid] : null;
  if (!list || !list.length) return null;
  const tiers = { platinum:0, gold:0, silver:0, bronze:0 };
  list.forEach(t => { tiers[t.tier]++; });
  return { total:list.length, tiers };
}
function dpTrophySectionHTML(item){
  const s = _gameTrophySummary(item.id);
  if (!s) return '';
  const list = TROPHIES[item.id].slice().sort((a,b) => _TIER_ORDER[a.tier]-_TIER_ORDER[b.tier]);
  const preview = list.slice(0,4).map(tr => {
    const txt = _trophyTxt(tr); const masked = tr.hidden;
    return `<div class="dp-tr-row">
        <span class="dp-tr-ico pp-tier--${tr.tier}">${_TROPHY_SVG}</span>
        <span class="dp-tr-body"><span class="dp-tr-name">${masked ? _tt('hidden') : escHtml(txt.t)}</span><span class="dp-tr-tier pp-tier--${tr.tier}">${_tt(tr.tier)}</span></span>
      </div>`;
  }).join('');
  const counts = ['platinum','gold','silver','bronze'].filter(t => s.tiers[t])
    .map(t => `<span class="dp-tr-count pp-tier--${t}">${_TROPHY_SVG}${s.tiers[t]}</span>`).join('');
  return `<div class="dp-trophies reveal">
      <div class="dp-sec-label">${_tt('section')}</div>
      <div class="dp-tr-head">
        <div class="dp-tr-counts">${counts}</div>
        <button class="dp-tr-all" onclick="openTrophyList('${item.id}')">${_tt('view')} →</button>
      </div>
      <div class="dp-tr-list">${preview}</div>
    </div>`;
}

/* ══════════════════════════════════════════
   COMPTES LIÉS (Steam / Epic / PlayStation)
   MVP fonctionnel : identifiant stocké sur le profil. L'import d'amis live
   nécessite les API officielles + OAuth serveur (clés secrètes) → étape backend.
══════════════════════════════════════════ */
const _PLATFORMS = [
  { key:'steam', name:'Steam',       icon:'assets/img/stores/steam.svg',       ph:'SteamID / vanity' },
  { key:'epic',  name:'Epic Games',  icon:'assets/img/stores/epic.svg',        ph:'Epic username' },
  { key:'psn',   name:'PlayStation', icon:'assets/img/stores/playstation.svg', ph:'PSN Online ID' },
];
const _LINK_T = {
  title:  { fr:'Comptes liés', en:'Linked accounts', es:'Cuentas vinculadas', de:'Verknüpfte Konten', it:'Account collegati', ar:'الحسابات المرتبطة', zh:'已关联账号', ja:'連携アカウント', ru:'Привязанные аккаунты', pl:'Połączone konta' },
  sub:    { fr:'Lie tes comptes pour retrouver tes amis et préparer ta bibliothèque.', en:'Link your accounts to find friends and prepare your library.', es:'Vincula tus cuentas para encontrar amigos.', de:'Verknüpfe Konten, um Freunde zu finden.', it:'Collega gli account per trovare amici.', ar:'اربط حساباتك للعثور على أصدقائك.', zh:'关联账号以查找好友。', ja:'アカウントを連携して友達を探そう。', ru:'Привяжите аккаунты, чтобы найти друзей.', pl:'Połącz konta, aby znaleźć znajomych.' },
  link:   { fr:'Lier', en:'Link', es:'Vincular', de:'Verknüpfen', it:'Collega', ar:'ربط', zh:'关联', ja:'連携', ru:'Привязать', pl:'Połącz' },
  unlink: { fr:'Délier', en:'Unlink', es:'Desvincular', de:'Trennen', it:'Scollega', ar:'فصل', zh:'取消关联', ja:'解除', ru:'Отвязать', pl:'Odłącz' },
  save:   { fr:'Enregistrer', en:'Save', es:'Guardar', de:'Speichern', it:'Salva', ar:'حفظ', zh:'保存', ja:'保存', ru:'Сохранить', pl:'Zapisz' },
  connected:{ fr:'Lié', en:'Linked', es:'Vinculado', de:'Verknüpft', it:'Collegato', ar:'مرتبط', zh:'已关联', ja:'連携済み', ru:'Привязан', pl:'Połączono' },
};
function _lt(k){ const m=_LINK_T[k]; return m ? (m[LANG]||m.en) : k; }
let _linkedCache = {};
function _platformSectionHTML(la){
  _linkedCache = la || {};
  return _PLATFORMS.map(pf => {
    const val = (la && la[pf.key]) || '';
    return `<div class="pp-link-row ${val?'is-linked':''}">
        <span class="pp-link-ico"><img src="${pf.icon}" alt="${pf.name}" onerror="this.style.opacity=.4"></span>
        <span class="pp-link-id"><span class="pp-link-name">${pf.name}</span>${val?`<span class="pp-link-handle">${escHtml(val)}</span>`:`<span class="pp-link-muted">${_lt('sub')==''?'':''}—</span>`}</span>
        ${val
          ? `<span class="pp-link-state">${_lt('connected')}</span><button class="pp-link-btn pp-link-btn--ghost" onclick="unlinkPlatform('${pf.key}')">${_lt('unlink')}</button>`
          : `<button class="pp-link-btn" onclick="openLinkPlatform('${pf.key}')">${_lt('link')}</button>`}
      </div>`;
  }).join('');
}
function openLinkPlatform(key){
  const pf = _PLATFORMS.find(p => p.key === key); if(!pf) return;
  const m = $('glg-auth-modal'); if(!m) return;
  m.innerHTML = `
    <div class="auth-box fr-modal" role="dialog" aria-modal="true">
      <button class="auth-close" aria-label="${_at('close')}" onclick="closeAuthModal()">${_XSVG}</button>
      <div class="pp-link-modal-head"><span class="pp-link-ico pp-link-ico--lg"><img src="${pf.icon}" alt="${pf.name}" onerror="this.style.opacity=.4"></span><h3 class="auth-picker-title" style="margin:0">${pf.name}</h3></div>
      <label class="auth-field" style="margin-top:16px"><span>${_lt('title')}</span>
        <input id="pp-link-input" type="text" autocomplete="off" placeholder="${pf.ph}" value="${escHtml(_linkedCache[key]||'')}">
      </label>
      <p class="auth-notice" style="margin-top:4px">${_lt('sub')}</p>
      <button class="btn btn-primary auth-submit" onclick="savePlatformLink('${key}')">${_lt('save')}</button>
    </div>`;
  if(!m.classList.contains('open')){ document.body.style.overflow='hidden'; m.classList.add('open'); }
  setTimeout(() => $('pp-link-input')?.focus(), 60);
}
async function savePlatformLink(key){
  const v = ($('pp-link-input')?.value || '').trim().slice(0, 64);
  const la = { ..._linkedCache }; if (v) la[key] = v; else delete la[key];
  if (window.GLG_AUTH?.updateProfile) await GLG_AUTH.updateProfile({ linked_accounts: la });
  closeAuthModal(); buildProfilePage();
}
async function unlinkPlatform(key){
  const la = { ..._linkedCache }; delete la[key];
  if (window.GLG_AUTH?.updateProfile) await GLG_AUTH.updateProfile({ linked_accounts: la });
  buildProfilePage();
}

/* Preset banners = each work's first screenshot (landscape) or its cover. */
function getPresetBanners(){
  const out = [];
  (typeof ALL_WORKS!=='undefined'?ALL_WORKS:[]).forEach(w=>{
    const src = (Array.isArray(w.screenshots) && w.screenshots[0]) || w.cover;
    if(src) out.push({ id:w.id, label:w.title, src });
  });
  return out;
}

async function openBannerPicker(){
  const m = $('glg-auth-modal'); if(!m) return;
  const presets = getPresetBanners();
  m.innerHTML = `
    <div class="auth-box auth-box--wide" role="dialog" aria-modal="true">
      <button class="auth-close" aria-label="${_at('close')}" onclick="closeAuthModal()">
        <svg width="14" height="14" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      </button>
      <h3 class="auth-picker-title">${_ppt('pickBanner')}</h3>
      <div class="auth-picker-label">${_at('customLabel')}</div>
      <label class="avatar-upload avatar-upload--banner">
        <input type="file" id="bpick-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
        <span>＋ ${_at('uploadBtn')}</span>
      </label>
      <div class="auth-picker-label">${_at('presetsLabel')}</div>
      <div class="banner-grid">
        <button class="banner-cell banner-cell--none" data-src=""><span>${_ppt('defaultBanner')}</span></button>
        ${presets.map(p=>`<button class="banner-cell" data-src="${av(p.src)}" title="${p.label}"><img src="${av(p.src)}" alt="${p.label}" loading="lazy" onerror="this.style.opacity=0"><span class="banner-cell-name">${p.label}</span></button>`).join('')}
      </div>
      <p class="auth-err" id="bpick-err" hidden></p>
    </div>`;
  if(!m.classList.contains('open')){ document.body.style.overflow='hidden'; m.classList.add('open'); }
  m.querySelectorAll('.banner-cell').forEach(c => c.addEventListener('click', async () => {
    _hideErr('bpick-err');
    const r = await GLG_AUTH.updateProfile({ banner_url: c.dataset.src || null });
    if(r.ok){ closeAuthModal(); await refreshAccountUI(); buildProfilePage(); }
    else _showErr('bpick-err', r.code === 'notConfigured' ? _at('notConfigured') : _at('fail'));
  }));
  $('bpick-file')?.addEventListener('change', async e => {
    const file = e.target.files?.[0]; if(!file) return;
    _hideErr('bpick-err');
    _showErr('bpick-err', '…'); document.getElementById('bpick-err')?.classList.add('ok');
    const r = await GLG_AUTH.uploadBanner(file);
    document.getElementById('bpick-err')?.classList.remove('ok');
    if(r.ok){ closeAuthModal(); await refreshAccountUI(); buildProfilePage(); return; }
    const map = { type:_at('imgType'), size:_at('imgSize'), rejected:_at('imgRejected'), notConfigured:_at('notConfigured'), notAuth:_at('notConfigured') };
    _showErr('bpick-err', map[r.code] || _at('fail'));
  });
}

/* ══════════════════════════════════════════
   KEYBOARD
══════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeBuyModal();
    closeTrailerModal();
    closeLightbox();
    closeAuthModal();
    closeSearch();
    $('nav-mobile')?.classList.remove('open');
    $('nav-burger')?.classList.remove('open');
    $('nav-burger')?.setAttribute('aria-expanded', 'false');
  }
});

// Click outside modals

/* ══════════════════════════════════════════
   DIAGONAL IMAGE COMPOSITION (Home page)
   Five parallelogram-cut cards with captions.
   Replace item.cover with your own image paths.
══════════════════════════════════════════ */

/* ══════════════════════════════════════════
   DIAGONAL SLICE COMPOSITION (Home page)
   5 full-width landscape parallelogram slices.
   Each expands on hover, caption slides up.
   Replace item.cover with 16:9 landscape images when available.
══════════════════════════════════════════ */
/* ══════════════════════════════════════════
   SHOWCASE MOSAIC (Home page — "WHAT WE CREATE")
   A CSS grid mosaic of varying-size cells.
   Each cell = one game/film cover + quote overlay.
   White glow border. Hover lifts + reveals caption.

   TO CUSTOMISE: edit the 'picks' array below.
   Replace item.cover with your own image paths.
   Recommended dimensions: 16:9 or 4:3 landscape.
══════════════════════════════════════════ */
/* ══════════════════════════════════════════════════
   PUZZLE STRIPS — "WHAT WE CREATE" (Home page)

   Three full-width diagonal strips showing placeholder images.
   Each strip has a large quote overlapping the image.
   These are NOT game cards — no onclick to game pages.
   When you have real key art, replace the src in `strips[]`.

   Image recommendations: 16:9 or wider landscape photos.
   ══════════════════════════════════════════════════ */
function buildPuzzleStrips() {
  const container = document.getElementById('puzzle-strips');
  if (!container) return;

  /*
   * Replace img paths with your own key-art images when ready.
   * Recommended: wide landscape photos (16:9 or wider), min 1600px wide.
   * Leave img as '' to keep the dark placeholder panel.
   */
  const quotes = t('stripQuotes') || [
    "We don't make games. We build worlds that leave marks on the people who enter them.",
    "From horror to celebration - every experience we craft carries a specific human truth.",
    "Games that teach. Games that move. Games that haunt your mind long after the screen goes dark.",
  ];
  const tags = t('stripTags') || [
    'GeekLearn Games - Est. 2026',
    'Interactive Films & Video Games',
    'Our Studio Manifesto',
  ];
  const themes = t('stripThemes') || ['', '', ''];
  const strips = [
    { img: '', quote: quotes[0], tag: tags[0], num: '01', theme: themes[0] },
    { img: '', quote: quotes[1], tag: tags[1], num: '02', theme: themes[1] },
    { img: '', quote: quotes[2], tag: tags[2], num: '03', theme: themes[2] },
  ];

  container.innerHTML = strips.map((s, i) => `
    <div class="puz-strip-row reveal${i > 0 ? ' rd' + i : ''}">
      <!-- The clipped image strip -->
      <div class="puz-strip">
        ${s.img
          ? `<img class="puz-strip-img" src="${s.img}" alt="" loading="lazy">`
          : `<div class="puz-strip-img" style="background:linear-gradient(135deg,#0e0e0e 0%,#1a1a1a 100%)"></div>`
        }
        ${s.theme ? `<div class="puz-cat" aria-hidden="true">${s.theme}</div>` : ''}
        <!-- Gradient so quote text stays readable -->
        <div class="puz-strip-grad"></div>
      </div>
      <!-- Large decorative index number -->
      <div class="puz-strip-index">${s.num}</div>
      <!-- Quote: sits below the strip bottom, overlapping the diagonal cut -->
      <div class="puz-quote">
        <p class="puz-quote-text">${s.quote}</p>
        <span class="puz-quote-tag">${s.tag}</span>
      </div>
    </div>
  `).join('');
}


function applyWorksPageLabels() {
  const setTxt  = (id,v) => { const e=$(id); if(e) e.textContent=v; };
  const setHTML = (id,v) => { const e=$(id); if(e) e.innerHTML=v; };
  setTxt ('wcat-films-label', t('catFilmsLabel'));
  setHTML('wcat-films-title', t('catFilmsTitle').replace('\n',' '));
  setTxt ('wcat-games-label', t('catGamesLabel'));
  setHTML('wcat-games-title', t('catGamesTitle').replace('\n',' '));
  // Showcase eyebrow
  const se = $('showcase-eye');
  if (se) se.textContent = t('showcaseEye') || 'Our Universe';
  // Rebuild carousels so price currency reflects current language
  buildCarousels();
}


/* ══════════════════════════════════════════
   SEARCH MODAL
══════════════════════════════════════════ */
function openSearch() {
  // Close mobile menu if open
  $('nav-mobile')?.classList.remove('open');
  $('nav-burger')?.classList.remove('open');
    $('nav-burger')?.setAttribute('aria-expanded', 'false');
  const modal = $('search-modal');
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => {
    const inp = $('search-input');
    if (inp) { inp.value = ''; inp.focus(); renderSearchResults(''); }
  }, 80);
}

function closeSearch() {
  $('search-modal').classList.remove('open');
  document.body.style.overflow = '';
}

function renderSearchResults(query) {
  const container = $('search-results');
  if (!container) return;

  const q = query.trim().toLowerCase();
  if (!q) {
    container.innerHTML = `<div class="search-empty">${t('searchHint') || 'Start typing a game or film title...'}</div>`;
    return;
  }

  // Match only against titles (English + localised if translated)
  const matches = ALL_WORKS.filter(item => {
    if (isMatureHidden(item)) return false; // 18+ titles never surface for logged-in minors
    if (item.title.toLowerCase().includes(q)) return true;
    const localTitle = (item.i18n?.[LANG]?.title || '').toLowerCase();
    return localTitle && localTitle.includes(q);
  });

  if (!matches.length) {
    container.innerHTML = `<div class="search-empty">${t('searchNoResults') || 'No results for'} "${escHtml(query)}"</div>`;
    return;
  }

  container.innerHTML = matches.map(item => {
    // Show localised title if one exists, fall back to English
    const displayTitle = item.i18n?.[LANG]?.title || item.title;
    const hl = displayTitle.replace(new RegExp('(' + escRe(q) + ')', 'gi'),
      '<span class="match-hl">$1</span>');
    const displayPrice = getPrice(item);
    return `
      <div class="search-result" onclick="closeSearch(); showPage('detail','${item.id}')">
        <div class="search-result-thumb">
          <img src="${av(item.cover)}" alt="" loading="lazy">
        </div>
        <div class="search-result-info">
          <div class="search-result-title">${hl}</div>
          <div class="search-result-meta">${getCatLabel(item)} · ${item.year} · ${displayPrice}</div>

        </div>
        <svg class="search-result-arrow" width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M3 8h10M8 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </div>
    `;
  }).join('');
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
}

/* ══════════════════════════════════════════
   CAROUSEL TOUCH — superseded.
   Touch handling is now integrated directly
   in buildCarousel() where pos / tick / setW
   are in scope.  This stub is kept so any
   lingering call sites don't throw.
══════════════════════════════════════════ */
function initCarouselTouch() { /* no-op — see buildCarousel() */
  [
    { selector: '.carousel-track.films-t', dir: 'left'  },
    { selector: '.carousel-track.games-t', dir: 'right' }
  ].forEach(({ selector, dir }) => {
    const el = document.querySelector(selector);
    if (!el) return;

    let isDragging  = false;
    let startX      = 0;
    let startPx     = 0;
    let velocity    = 0;   // px / ms
    let lastX       = 0;
    let lastT       = 0;
    let rafId       = null; // momentum animation frame handle

    /* Read animated translateX in pixels from computed style */
    function getAnimPx() {
      const t = window.getComputedStyle(el).transform;
      if (!t || t === 'none') return 0;
      const vals = t.match(/matrix.*\((.+)\)/)?.[1].split(',');
      return vals ? parseFloat(vals[4]) : 0;
    }

    /* Read inline transform translateX in pixels */
    function getInlinePx() {
      const raw = el.style.transform.match(/-?[\d.]+/);
      return raw ? parseFloat(raw[0]) : 0;
    }

    /* Re-engage CSS animation from pixel position px */
    function resumeFromPx(px) {
      const halfW    = el.scrollWidth / 2;
      const duration = 90; // must match CSS
      let progress;
      if (dir === 'left') {
        progress = Math.abs(px) / halfW;
      } else {
        progress = (halfW + px) / halfW;
      }
      progress = ((progress % 1) + 1) % 1;
      el.style.transform      = '';
      el.style.animation      = '';
      el.style.animationDelay = `${-(progress * duration)}s`;
    }

    el.addEventListener('touchstart', e => {
      if (window.innerWidth > 640) return;
      /* Cancel any in-progress momentum deceleration */
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

      startPx  = getAnimPx(); // capture live animation frame
      startX   = e.touches[0].clientX;
      lastX    = startX;
      lastT    = Date.now();
      velocity = 0;

      /* Atomically freeze animation + pin to captured position */
      el.style.animation = 'none';
      el.style.transform = `translateX(${startPx}px)`;
      isDragging = true;
    }, { passive: true });

    el.addEventListener('touchmove', e => {
      if (!isDragging) return;
      const now = Date.now();
      const cx  = e.touches[0].clientX;

      /* Rolling velocity sample (px/ms) */
      const dt = now - lastT;
      if (dt > 0) velocity = (cx - lastX) / dt;
      lastX = cx;
      lastT = now;

      let newPx = startPx + (cx - startX);

      /* Seamless wrap within loop range */
      const halfW = el.scrollWidth / 2;
      if (newPx > 0)      newPx -= halfW;
      if (newPx < -halfW) newPx += halfW;

      el.style.transform = `translateX(${newPx}px)`;
    }, { passive: true });

    el.addEventListener('touchend', () => {
      if (!isDragging) return;
      isDragging = false;

      /* Convert velocity: px/ms → px/frame (@ 60 fps = 16.67 ms/frame) */
      const velPF  = velocity * 16.67;
      const THRESH = 0.5; // px/frame — below this: no perceptible momentum
      const FRICTION = 0.88; // multiplied each frame → ~0.5 s deceleration

      if (Math.abs(velPF) > THRESH) {
        /* ── Momentum phase ── */
        let px = getInlinePx();
        let v  = velPF;

        function tick() {
          v  *= FRICTION;
          px += v;

          const halfW = el.scrollWidth / 2;
          if (px > 0)      px -= halfW;
          if (px < -halfW) px += halfW;

          el.style.transform = `translateX(${px}px)`;

          if (Math.abs(v) > THRESH) {
            rafId = requestAnimationFrame(tick);
          } else {
            rafId = null;
            resumeFromPx(px); // hand back to CSS animation
          }
        }
        rafId = requestAnimationFrame(tick);
      } else {
        /* No momentum — resume immediately */
        resumeFromPx(getInlinePx());
      }
    }, { passive: true });
  });
}

/* ════════════════════════════════════════════════════════
   ★  GLG — CINEMATIC ANIMATION SYSTEM v2
   ════════════════════════════════════════════════════════
   Custom cursor · Mouse parallax · Scroll parallax
   Magnetic CTAs · 3-D card tilt
   Guards: pointer:fine / prefers-reduced-motion / touch
════════════════════════════════════════════════════════ */

/* ── Feature detection ──────────────────────────────── */
const _GLG = {
  fine:   () => window.matchMedia('(hover:hover) and (pointer:fine)').matches,
  touch:  () => window.matchMedia('(hover:none),(pointer:coarse)').matches,
  motion: () => !window.matchMedia('(prefers-reduced-motion:reduce)').matches,
};


/* ── 2. Hero content parallax (mouse-move) ──────────── */
/* Moves the TEXT LAYER slightly opposite to the cursor.
   The background is never touched — no conflict with the
   CSS heroDrift animation or dp-hero slow-zoom. */
let _heroParallaxBound = false;
function initHeroParallax() {
  if (_heroParallaxBound || !_GLG.fine() || !_GLG.motion()) return;
  _heroParallaxBound = true;

  let tx = 0, ty = 0, cx = 0, cy = 0;
  let _content = null; // cached on page-changed, never queried inside the loop

  function updateContentRef(pageName) {
    if (_content) { _content.style.transform = ''; }
    cx = 0; cy = 0; tx = 0; ty = 0;
    const page = document.getElementById('page-' + pageName);
    _content = page ? page.querySelector('.hero .hero-content') : null;
  }

  // Keep cache in sync with page navigation — zero DOM queries inside the rAF loop
  document.addEventListener('glg:page-changed', e => updateContentRef(e.detail?.name || ''));
  document.addEventListener('glg:site-built',   () => updateContentRef('home'));

  // Idle-stopping rAF: only runs while there's motion to settle, then halts.
  // (Previously it ran every frame forever — even off-home — for nothing.)
  let _plxRAF = null;
  function loopParallax() {
    cx += (tx - cx) * .05;
    cy += (ty - cy) * .05;
    if (_content) _content.style.transform = `translate(${cx * -8}px,${cy * -5}px)`;
    if (Math.abs(tx - cx) < .0006 && Math.abs(ty - cy) < .0006 &&
        Math.abs(tx) < .0006 && Math.abs(ty) < .0006) { _plxRAF = null; return; } // settled → stop
    _plxRAF = requestAnimationFrame(loopParallax);
  }
  function plxWake() { if (!_plxRAF && _content) _plxRAF = requestAnimationFrame(loopParallax); }

  document.addEventListener('mousemove', e => {
    if (!_content) return;
    const hero = _content.closest('.hero');
    if (!hero) return;
    const r = hero.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right ||
        e.clientY < r.top  || e.clientY > r.bottom) return;
    tx = (e.clientX / window.innerWidth  - .5);
    ty = (e.clientY / window.innerHeight - .5);
    plxWake();
  }, { passive: true });

  document.addEventListener('mouseleave', () => { tx = 0; ty = 0; plxWake(); });
}

/* ── 3. Scroll parallax on home hero ────────────────── */
/* Fades + lifts the hero content as user scrolls down.
   The hero background drift animation is not touched. */
let _scrollParallaxBound = false;
function initScrollParallax() {
  if (_scrollParallaxBound || !_GLG.motion()) return;
  _scrollParallaxBound = true;

  let _rafPending = false;
  window.addEventListener('scroll', () => {
    if (_rafPending) return;
    _rafPending = true;
    requestAnimationFrame(() => {
      _rafPending = false;
      const page = document.getElementById('page-home');
      if (!page?.classList.contains('active')) return;
      const hero    = page.querySelector('.hero');
      const content = page.querySelector('.hero-content');
      if (!hero || !content) return;
      const sy = window.scrollY;
      const h  = hero.offsetHeight;
      if (sy > h) return;
      const p = sy / h;
      content.style.opacity   = String(Math.max(0, 1 - p * 2.2));
      content.style.transform = `translateY(${p * 26}px)`;
    });
  }, { passive: true });
}

/* ── 4. Magnetic CTAs ───────────────────────────────── */
/* Primary buttons gently pull toward the cursor.
   Guard: _magInit prevents double-binding after buildDetail. */
function initMagneticCTAs() {
  if (!_GLG.fine() || !_GLG.motion()) return;
  const SEL = '.btn-primary,.btn-outline,.dp-buy-btn,.dp-sticky-buy';
  document.querySelectorAll(SEL).forEach(btn => {
    if (btn._magInit) return;
    btn._magInit = true;
    btn.addEventListener('mousemove', e => {
      const r = btn.getBoundingClientRect();
      const x = (e.clientX - r.left - r.width  / 2) * .30;
      const y = (e.clientY - r.top  - r.height / 2) * .30;
      btn.style.transform = `translate(${x}px,${y}px)`;
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = '';
    });
  });
}

/* ── 5. 3-D card tilt ───────────────────────────────── */
/* Subtle perspective tilt on carousel cards.
   GPU-composited (rotateX/Y inside perspective). */
let _cardTiltBound = false;
function initCardTilt() {
  if (_cardTiltBound || !_GLG.fine() || !_GLG.motion()) return;
  _cardTiltBound = true;

  let _hoveredCard = null;
  document.addEventListener('mouseover', e => {
    _hoveredCard = e.target.closest?.('.c-card') || null;
  }, { passive: true });

  document.addEventListener('mousemove', e => {
    if (!_hoveredCard) return;
    const r = _hoveredCard.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width  - .5;
    const y = (e.clientY - r.top)  / r.height - .5;
    _hoveredCard.style.transform =
      `translateY(-6px) scale(1.015) perspective(700px) ` +
      `rotateY(${x * 8}deg) rotateX(${-y * 6}deg)`;
  }, { passive: true });

  /* Reset on mouse exit */
  document.addEventListener('mouseout', e => {
    const card = e.target.closest?.('.c-card');
    if (card && !card.contains(e.relatedTarget)) {
      card.style.transform = '';
    }
  });
}

/* ── 6. Master animation init ───────────────────────── */
function initAnimations() {
  initHeroParallax();
  initScrollParallax();
  initMagneticCTAs();
  initCardTilt();
  // initGLGCursor() — removed: using default browser cursor per design spec
  initHeroCanvas();
}

/* ════════════════════════════════════════════════════════
   GLG ENHANCEMENT BLOCK v3 — new functions
   ════════════════════════════════════════════════════════ */

/* ── Custom GLG cursor ────────────────────────────────── */
let _cursorInit = false;
function initGLGCursor() {
  if (_cursorInit || !_GLG.fine()) return;
  _cursorInit = true;

  if (document.getElementById('glg-cur-dot')) return;
  const dot  = Object.assign(document.createElement('div'), { id: 'glg-cur-dot' });
  const ring = Object.assign(document.createElement('div'), { id: 'glg-cur-ring' });
  document.body.append(dot, ring);

  let mx = 0, my = 0, rx = 0, ry = 0, visible = false;
  const INTERACTIVE = 'a,button,[role=button],.c-card,.gate-lang,.dp-plat-btn,' +
    '.soc-btn,label,select,input,textarea,.nav-link,.footer-links button,.search-result';

  document.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    if (!visible) {
      visible = true;
      rx = mx; ry = my;
      dot.classList.add('glg-cur-on');
      ring.classList.add('glg-cur-on');
    }
    dot.style.transform = `translate(calc(${mx}px - 50%),calc(${my}px - 50%))`;
  }, { passive: true });

  (function loopRing() {
    rx += (mx - rx) * .13;
    ry += (my - ry) * .13;
    ring.style.transform = `translate(calc(${rx}px - 50%),calc(${ry}px - 50%))`;
    requestAnimationFrame(loopRing);
  })();

  document.addEventListener('mouseover',  e => { if (e.target.closest(INTERACTIVE)) document.body.classList.add('glg-cur-hover'); });
  document.addEventListener('mouseout',   e => { if (e.target.closest(INTERACTIVE)) document.body.classList.remove('glg-cur-hover'); });
  document.addEventListener('mousedown',  () => document.body.classList.add('glg-cur-click'));
  document.addEventListener('mouseup',    () => document.body.classList.remove('glg-cur-click'));
}

/* ── Hero canvas particles ────────────────────────────── */
let _heroCanvasInit = false;
function initHeroCanvas() {
  if (_heroCanvasInit || !_GLG.motion()) return;
  _heroCanvasInit = true;

  const hero = document.querySelector('.hero');
  if (!hero || document.getElementById('glg-hero-canvas')) return;

  const cvs = document.createElement('canvas');
  cvs.id = 'glg-hero-canvas';
  hero.prepend(cvs);

  const ctx = cvs.getContext('2d');
  let W = 0, H = 0;
  const PARTICLES = [];
  const COUNT = 75;

  function resize() {
    W = cvs.width  = hero.offsetWidth;
    H = cvs.height = hero.offsetHeight;
  }

  function make() {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - .5) * .22,
      vy: (Math.random() - .5) * .14 - .05,
      r:  Math.random() * 1.6 + .3,
      a:  Math.random() * .45 + .08,
      ph: Math.random() * Math.PI * 2,
    };
  }

  function initParticles() {
    PARTICLES.length = 0;
    for (let i = 0; i < COUNT; i++) PARTICLES.push(make());
  }

  let _canvasRafId = null;
  let _canvasActive = false;

  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (const p of PARTICLES) {
      p.x += p.vx; p.y += p.vy; p.ph += .014;
      if (p.x < -4) p.x = W + 4;
      if (p.x > W + 4) p.x = -4;
      if (p.y < -4) p.y = H + 4;
      if (p.y > H + 4) p.y = -4;
      const alpha = p.a * (.55 + .45 * Math.sin(p.ph));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`; // monochrome (was gold — brand coherence)
      ctx.fill();
    }
    _canvasRafId = requestAnimationFrame(draw);
  }

  function canvasStart() { if (!_canvasActive) { _canvasActive = true; _canvasRafId = requestAnimationFrame(draw); } }
  function canvasStop()  { _canvasActive = false; cancelAnimationFrame(_canvasRafId); ctx.clearRect(0, 0, W, H); }

  // Start/stop in sync with page visibility
  document.addEventListener('glg:page-changed', e => {
    e.detail?.name === 'home' ? canvasStart() : canvasStop();
  });

  resize();
  initParticles();
  // Only start if home is already active (initial load)
  if (document.getElementById('page-home')?.classList.contains('active')) canvasStart();

  window.addEventListener('resize', () => { resize(); initParticles(); }, { passive: true });
}

/* ── Studio themes i18n ───────────────────────────────── */
const _STUDIO_THEMES = {
  fr: ['HORREUR','AVENTURE','ÉMOTION','MYSTÈRE'],
  en: ['HORROR','ADVENTURE','EMOTION','MYSTERY'],
  es: ['HORROR','AVENTURA','EMOCIÓN','MISTERIO'],
  de: ['HORROR','ABENTEUER','EMOTION','MYSTERIUM'],
  ar: ['رعب','مغامرة','عاطفة','غموض'],
  zh: ['恐惧','冒险','情感','神秘'],
  ja: ['ホラー','アドベンチャー','感情','ミステリー'],
  ru: ['УЖАС','ПРИКЛЮЧЕНИЕ','ЭМОЦИЯ','ТАЙНА'],
  pl: ['GROZA','PRZYGODA','EMOCJE','TAJEMNICA'],
  it: ['ORRORE','AVVENTURA','EMOZIONE','MISTERO'],
};

const _STUDIO_EYEBROWS = {
  fr: '— Univers Créatifs', en: '— Creative Universes', es: '— Universos Creativos',
  de: '— Kreative Welten',  ar: '— العوالم الإبداعية', zh: '— 创意世界',
  ja: '— クリエイティブな世界', ru: '— Творческие Миры', pl: '— Kreatywne Światy',
  it: '— Universi Creativi',
};

const _STUDIO_FOOTERS = {
  fr: 'Films interactifs & Jeux vidéo · Est. 2026',
  en: 'Interactive Films & Video Games · Est. 2026',
  es: 'Films Interactivos & Videojuegos · Est. 2026',
  de: 'Interaktive Filme & Videospiele · Est. 2026',
  ar: 'أفلام تفاعلية وألعاب فيديو · تأسست 2026',
  zh: '互动电影与电子游戏 · 成立于 2026',
  ja: 'インタラクティブフィルム & ゲーム · 設立 2026',
  ru: 'Интерактивные фильмы и игры · Осн. 2026',
  pl: 'Filmy interaktywne i gry · Zał. 2026',
  it: 'Film Interattivi & Videogiochi · Est. 2026',
};

function applyStudioThemes() {
  const lang = LANG || 'en';
  const themes   = _STUDIO_THEMES[lang]   || _STUDIO_THEMES.en;
  const eyebrow  = _STUDIO_EYEBROWS[lang] || _STUDIO_EYEBROWS.en;
  const footer   = _STUDIO_FOOTERS[lang]  || _STUDIO_FOOTERS.en;

  $$('.studio-theme-name').forEach((el, i) => {
    if (themes[i] !== undefined) el.textContent = themes[i];
  });

  const eyeEl = document.querySelector('.studio-themes-eyebrow span');
  if (eyeEl) eyeEl.textContent = eyebrow;

  const footEl = document.querySelector('.studio-themes-footer');
  if (footEl) footEl.textContent = footer;
}

/* ── Stats band ───────────────────────────────────────── */
let _statsBandBuilt = false;
function buildStatsBand() {
  const marquee = document.querySelector('.marquee-bar');
  if (!marquee) return;

  // Remove previous band if language changed
  const prev = document.querySelector('.glg-stats-band');
  if (prev) prev.remove();

  const lang = LANG || 'en';
  const labels = {
    titles:    (I18N[lang] || I18N.en).statTitles    || 'Titles',
    films:     (I18N[lang] || I18N.en).statFilms     || 'Interactive Films',
    games:     (I18N[lang] || I18N.en).statGames     || 'Video Games',
    platforms: (I18N[lang] || I18N.en).statPlatforms || 'Platforms',
  };

  const band = document.createElement('div');
  band.className = 'glg-stats-band';
  band.innerHTML =
    `<div class="glg-stat-item">
       <div class="glg-stat-num" data-count="8" data-suffix="">0</div>
       <div class="glg-stat-label" id="stat-titles">${labels.titles}</div>
     </div>
     <div class="glg-stat-item">
       <div class="glg-stat-num" data-count="4" data-suffix="+">0</div>
       <div class="glg-stat-label" id="stat-films">${labels.films}</div>
     </div>
     <div class="glg-stat-item">
       <div class="glg-stat-num" data-count="4" data-suffix="+">0</div>
       <div class="glg-stat-label" id="stat-games">${labels.games}</div>
     </div>
     <div class="glg-stat-item">
       <div class="glg-stat-num" data-count="5" data-suffix="+">0</div>
       <div class="glg-stat-label" id="stat-platforms">${labels.platforms}</div>
     </div>`;

  marquee.insertAdjacentElement('afterend', band);
  _statsBandBuilt = true;
}

/* ════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  // Lock scroll while language gate is showing (html+body for iOS Safari)
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';

  $('modal-buy')?.addEventListener('click', e => { if (e.target === $('modal-buy')) closeBuyModal(); });
  // Search input live filter
  const sinp = $('search-input');
  if (sinp) {
    sinp.addEventListener('input', () => renderSearchResults(sinp.value));
    sinp.addEventListener('keydown', e => { if (e.key === 'Escape') closeSearch(); });
  }
  $('trailer-modal')?.addEventListener('click', e => { if (e.target === $('trailer-modal')) closeTrailerModal(); });

  // Prevent the page scrolling behind the language gate on mobile
  const gate = $('lang-gate');
  if (gate) {
    gate.addEventListener('touchmove', e => { e.preventDefault(); }, { passive: false });
  }

  buildGate();
});
