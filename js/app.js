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
            style="touch-action:manipulation">
      <img class="gate-flag-img"
           src="assets/images/FLAGS/${l.code}.svg"
           alt="${l.label}"
           onerror="this.style.opacity='0'">
      <div class="gate-lang-overlay"></div>
      <div class="gate-lang-info">
        <span class="gate-lang-name">${l.label}</span>
        <span class="gate-lang-code">${l.code.toUpperCase()}</span>
      </div>
    </button>
  `).join('');

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
  document.documentElement.lang = code;
  document.documentElement.dir = code === 'ar' ? 'rtl' : 'ltr';

  // Visual feedback on clicked button — highlight selected, dim the rest
  // .selected restores saturation on mobile (where :hover doesn't exist)
  document.querySelectorAll('.gate-lang').forEach(b => {
    b.classList.toggle('dimmed',    b.dataset.code !== code);
    b.classList.toggle('selected',  b.dataset.code === code);
  });

  // Update nav flag to the chosen language
  const flagSrc = `assets/images/FLAGS/${code}.svg`;
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
}

/* ══════════════════════════════════════════
   INIT SITE
══════════════════════════════════════════ */
function initSite() {
  window.scrollTo({ top: 0, behavior: 'instant' }); // guarantee top position on every site init
  buildMarquee();
  buildCarousels();
  buildPuzzleStrips();
  buildAboutPage();
  initNav();
  initScrollProgress();
  initReveal();
  initCounters();
  applyWorksPageLabels();
  // Touch swipe is now built into buildCarousel() — no separate init needed
}

/* ══════════════════════════════════════════
   NAV
══════════════════════════════════════════ */
/* Guard: scroll / observer listeners are registered only once — not on each initSite() call */
let _navScrollBound = false;
function initNav() {
  if (!_navScrollBound) {
    _navScrollBound = true;
    window.addEventListener('scroll', () => {
      $('nav').classList.toggle('scrolled', window.scrollY > 40);
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

function showPage(name, itemId = null) {
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
  }

  // Update browser URL without reload
  const url = itemId ? `#${name}/${itemId}` : `#${name}`;
  window.history.pushState({ page: name, id: itemId }, '', url);

  setTimeout(initReveal, 80);
}

// Handle browser back/forward
window.addEventListener('popstate', e => {
  const state = e.state;
  if (state) {
    if (state.id) buildDetail(state.id);
    $$('.page').forEach(p => p.classList.remove('active'));
    const page = $('page-' + state.page);
    if (page) page.classList.add('active');
  }
});

// Show works page
function showWorksTab() {
  showPage('works');
}

/* ══════════════════════════════════════════
   MARQUEE
══════════════════════════════════════════ */
function buildMarquee() {
  const words = t('marqueeWords') || ['GeekLearn Games','Interactive Films','Video Games','Est. 2026','France','Games That Teach','Games That Move','Games That Haunt'];
  // Perfect seamless loop: use an EVEN number of copies so that
  // translateX(-50%) lands exactly at the visual start of the second half,
  // which is identical to the first half — zero visible jump.
  const approxItemW = 160; // px per word item (including padding + dot)
  const vw = window.innerWidth || 1280;
  let half = Math.max(1, Math.ceil(vw / (words.length * approxItemW)));
  const copies = half * 2; // always even → -50% = perfect loop point

  let html = '';
  for (let i = 0; i < copies; i++) {
    words.forEach(w => { html += `<span class="marquee-item"><span class="marquee-dot"></span>${w}</span>`; });
  }
  const track = $('marquee-track');
  if (track) track.innerHTML = html;
}

/* ══════════════════════════════════════════
   CAROUSELS — 4 cards always visible, infinite
══════════════════════════════════════════ */
/* Debounce: multiple synchronous calls in the same tick (e.g. from applyTranslations
   + initSite + applyWorksPageLabels) collapse into a single actual rebuild. */
let _buildCarouselsTimer = null;
function buildCarousels() {
  clearTimeout(_buildCarouselsTimer);
  _buildCarouselsTimer = setTimeout(() => {
    buildCarousel('films-carousel', FILMS, FILM_LABELS[LANG] || 'Interactive Film');
    buildCarousel('games-carousel', GAMES, GAME_LABELS[LANG] || 'Video Game');
  }, 0);
}

function buildCarousel(id, items, typeLabel) {
  const el = $(id);
  if (!el) return;

  /* ── Cancel any previous rAF loop for this carousel ── */
  if (_carouselRAF[id]) {
    cancelAnimationFrame(_carouselRAF[id]);
    _carouselRAF[id] = null;
  }

  /*
   * RTL-safety: force direction:ltr on the overflow container (.carousel-viewport).
   */
  if (el.parentElement) el.parentElement.style.direction = 'ltr';

  /*
   * Direction: films scroll LEFT (-1), games scroll RIGHT (+1).
   * Speed: px per frame at 60 fps → ~33 px/s at 0.55.
   */
  const dir   = (id === 'games-carousel') ? 1 : -1;
  const speed = 0.55;

  /* ── Build enough copies so the track is always wider than the viewport ── */
  const vw    = window.innerWidth || 1280;
  const cardW = Math.min(200, Math.max(130, vw * 0.16)) + 10;
  const setW  = items.length * cardW;
  let setsNeeded = Math.max(4, Math.ceil((vw * 2.5) / setW + 1));
  if (setsNeeded % 2 !== 0) setsNeeded++;

  let html = '';
  for (let i = 0; i < setsNeeded; i++) {
    items.forEach(item => { html += cardHTML(item, typeLabel); });
  }
  el.innerHTML = html;

  const measuredW  = el.scrollWidth;
  const actualSetW = measuredW > 0 ? measuredW / setsNeeded : setW;

  let pos = (dir === 1) ? -actualSetW : 0;
  el.style.transform = `translateX(${pos}px)`;

  /*
   * HOVER BUG FIX — mobile/touch:
   * On touch screens, :hover gets "stuck" on the last-touched element and never
   * clears until something else is touched.  This froze the carousel indefinitely.
   * Fix: only use :hover pause on real pointer devices (mouse + fine pointer).
   * Touch devices always scroll — swipe handling is managed below.
   */
  const hasPreciseHover = window.matchMedia('(hover:hover) and (pointer:fine)').matches;

  function tick() {
    if (!hasPreciseHover || !el.matches(':hover')) {
      pos += dir * speed;
      if (dir < 0 && pos <= -actualSetW) pos += actualSetW;
      if (dir > 0 && pos >= 0)           pos -= actualSetW;
      el.style.transform = `translateX(${pos}px)`;
    }
    _carouselRAF[id] = requestAnimationFrame(tick);
  }

  _carouselRAF[id] = requestAnimationFrame(tick);

  /*
   * TOUCH SWIPE — integrated here so we have direct access to pos/tick/actualSetW.
   * Replaces the broken initCarouselTouch() which targeted non-existent CSS classes
   * and tried to restart a CSS animation that was never running.
   *
   * Guards:
   *  - el._touchBound: listeners are added only once; el._cs carries mutable state
   *    that the persistent listeners read on every call (survives carousel rebuilds).
   */
  if (!el._cs) el._cs = {};
  el._cs.pos      = pos;
  el._cs.setW     = actualSetW;
  el._cs.dir      = dir;
  el._cs.getTick  = () => tick; // getter so momentum handler always uses latest tick

  if (!el._touchBound) {
    el._touchBound = true;

    let dragging   = false;
    let startX     = 0;
    let startPos   = 0;
    let velX       = 0;
    let lastX      = 0;
    let lastT      = 0;
    let momRAF     = null;

    el.addEventListener('touchstart', e => {
      /* Cancel any in-progress momentum */
      if (momRAF) { cancelAnimationFrame(momRAF); momRAF = null; }
      /* Pause the auto-scroll loop while finger is on screen */
      if (_carouselRAF[id]) { cancelAnimationFrame(_carouselRAF[id]); _carouselRAF[id] = null; }

      startX   = e.touches[0].clientX;
      startPos = el._cs.pos;  // capture live position
      lastX    = startX;
      lastT    = Date.now();
      velX     = 0;
      dragging = true;
    }, { passive: true });

    el.addEventListener('touchmove', e => {
      if (!dragging) return;
      const now = Date.now();
      const cx  = e.touches[0].clientX;
      const dt  = now - lastT;
      if (dt > 0) velX = (cx - lastX) / dt; // px/ms rolling sample
      lastX = cx;
      lastT = now;

      const cs  = el._cs;
      let np = startPos + (cx - startX);
      /* Seamless loop wrap */
      while (np > 0)        np -= cs.setW;
      while (np < -cs.setW) np += cs.setW;
      cs.pos = np;
      pos    = np; // keep closure in sync for when tick resumes
      el.style.transform = `translateX(${np}px)`;
    }, { passive: true });

    el.addEventListener('touchend', () => {
      if (!dragging) return;
      dragging = false;

      const cs      = el._cs;
      const velPF   = velX * 16.67;  // px/ms → px/frame @60fps
      const THRESH  = 0.35;
      const FRICTION = 0.90;          // ~0.45 s deceleration arc

      if (Math.abs(velPF) > THRESH) {
        /* ── Momentum phase ── */
        let v = velPF;
        function momentum() {
          v  *= FRICTION;
          let np = cs.pos + v;
          while (np > 0)        np -= cs.setW;
          while (np < -cs.setW) np += cs.setW;
          cs.pos = np;
          pos    = np;
          el.style.transform = `translateX(${np}px)`;

          if (Math.abs(v) > THRESH) {
            momRAF = requestAnimationFrame(momentum);
          } else {
            /* Momentum ended — hand back to the auto-scroll loop */
            momRAF = null;
            _carouselRAF[id] = requestAnimationFrame(el._cs.getTick());
          }
        }
        momRAF = requestAnimationFrame(momentum);
      } else {
        /* No meaningful velocity — resume auto-scroll immediately */
        _carouselRAF[id] = requestAnimationFrame(el._cs.getTick());
      }
    }, { passive: true });
  }

  /* Sync state object every rebuild so persistent touch handler sees fresh values */
  el._cs.pos  = pos;
  el._cs.setW = actualSetW;
}

function cardHTML(item, typeLabel) {
  return `
    <div class="c-card" data-g="${item.glow}" onclick="showPage('detail','${item.id}')">
      <div class="c-card-pw">
        <img src="${item.cover}" alt="${item.title}" loading="lazy"
             onerror="this.style.background='#111';this.style.display='block'">
      </div>
      <span class="c-badge ${item.status}">${getStatusLabel(item)}</span>
      <div class="c-card-overlay">
        <div class="c-card-type">${typeLabel}</div>
        <div class="c-card-name">${item.title}</div>
        <div class="c-card-yr">${item.year} · <span class="price-display" data-base-price="${item.basePrice ?? ''}">${getPrice(item)}</span></div>
      </div>
    </div>
  `;
}

// filterWorks / buildWorksList removed — works page uses carousels only
// buildFooterWorks() removed — footer works list is now built inside footerHTML() / buildPageFooters()

/* ══════════════════════════════════════════
   ABOUT PAGE
══════════════════════════════════════════ */
function buildAboutPage() {
  buildOrgTree();
  buildAwards();
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

  // Photo panel — cinematic name overlay (first name large, last name hollow below)
  const photoBlock = `
    <div class="cm-photo">
      ${member.photo
        ? `<img src="${member.photo}" alt="${member.name} ${member.nameLine2 || ''}" onerror="this.style.display='none'">`
        : `<div class="cm-photo-init">${initials}</div>`
      }
      <div class="cm-photo-grad"></div>
      <div class="cm-photo-ident">
        <div class="cm-photo-name">
          ${member.name}${member.nameLine2 ? `<span class="cm-photo-name-hollow">${member.nameLine2}</span>` : ''}
        </div>
        <div class="cm-photo-meta">
          <span class="cm-photo-roletag">GEEKLEARN GAMES</span>
        </div>
      </div>
    </div>`;

  // Info panel — quote dominates, role shown once, stats provide fresh context
  const infoBlock = `
    <div class="cm-info">
      <div class="cm-watermark">${idx}</div>
      <div class="cm-info-inner">
        <p class="cm-quote">${member.quote}</p>
        <div class="cm-divider"></div>
        <div class="cm-role">${member.role}</div>
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

  if (!AWARDS.length) {
    // Show 3 placeholder cards
    container.innerHTML = [1,2,3].map(() => `
      <div class="award-card award-card--soon">
        <div class="award-soon-inner">
          <div class="award-soon-icon">★</div>
          <div class="award-soon-label">${t('awardsSoon') || 'Coming Soon'}</div>
        </div>
      </div>
    `).join('');
    return;
  }

  container.innerHTML = AWARDS.map(a => `
    <div class="award-card">
      <div class="award-card-img">
        ${a.photo
          ? `<img src="${a.photo}" alt="${a.event}" loading="lazy">`
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

function buildDetail(id) {
  const item = ALL_WORKS.find(i => i.id === id);
  if (!item) return;

  const container        = $('page-detail');
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
  const mqTrack = mqItems + mqItems; // duplicate for seamless loop

  container.innerHTML = `

    <!-- ──────── HERO ──────── -->
    <div class="dp-hero">
      <div class="dp-hero-bg" style="background-image:url('${item.cover}')"></div>
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
          ? `<img class="dp-hero-logo" src="${item.logo}" alt="${item.title}">`
          : `<h1 class="dp-hero-title">${item.title}</h1>`
        }
        <p class="dp-hero-tagline">${localTagline}</p>
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
      <div class="dp-marquee-track">${mqTrack}</div>
    </div>

    <!-- ──────── STORY ──────── -->
    <div class="dp-story reveal">
      <p class="dp-story-pull">&ldquo;${localTagline}&rdquo;</p>
      <div class="dp-story-body">
        <div>
          <div class="dp-sec-label">${t('aboutHead')}</div>
          <p class="dp-story-p">${localDescription[0] || ''}</p>
        </div>
        <div>
          <p class="dp-story-p" style="margin-top:clamp(36px,4vw,52px)">${localDescription[1] || ''}</p>
        </div>
      </div>
    </div>

    <!-- ──────── KEY FEATURES ──────── -->
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

    <!-- ──────── SCREENSHOTS ──────── -->
    <div class="dp-ss reveal">
      <div class="dp-sec-label">${t('ssHead')}</div>
      <div class="dp-ss-main">
        <div class="dp-ss-viewport">
          <div class="dp-ss-track" id="dp-ss-track-${item.id}">
            ${item.screenshots.map((ss, idx) => `
              <div class="dp-ss-slide">
                <img src="${ss}" alt="Screenshot ${idx + 1}" loading="lazy"
                     onerror="this.parentElement.style.background='var(--s2)'">
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
            <img src="${ss}" alt="" loading="lazy">
          </button>`).join('')}
      </div>
    </div>

    <!-- ──────── GET THE GAME ──────── -->
    <div class="dp-buy reveal">
      <div class="dp-buy-inner">
        <div class="dp-buy-cover">
          <img class="dp-buy-cover-img" src="${item.cover}" alt="${item.title}">
        </div>
        <div class="dp-buy-plats">
          <div class="dp-sec-label">${t('platHead')}</div>
          <div class="dp-plat-list">
            ${item.platforms.map(p => `
              <button class="dp-plat-btn" onclick="openBuyModal('${item.id}')">
                <div class="dp-plat-ico" style="background:${PLATS[p].bg}">${PLATS[p].icon}</div>
                <div>
                  <div class="dp-plat-name">${PLATS[p].name}</div>
                  <div class="dp-plat-cta-lbl">${PLATS[p].cta}</div>
                </div>
                <svg class="dp-plat-arr" width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 8h10M8 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </button>`).join('')}
          </div>
        </div>
        <div class="dp-price-card">
          ${item.logo
            ? `<img class="dp-price-logo" src="${item.logo}" alt="${item.title}">`
            : `<div class="dp-price-title">${item.title}</div>`
          }
          <div class="dp-price-num price-display" data-base-price="${item.basePrice ?? ''}">${localPrice}</div>
          <div class="dp-price-status">${localStatus}</div>
          <button class="dp-buy-btn" onclick="openBuyModal('${item.id}')">
            ${t('buyNow')}
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 8h10M8 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>
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

    ${footerHTML()}
  `;

  // Propagate tint color throughout the detail page
  container.style.setProperty('--dp-tint', item.tint);

  // Init screenshot carousel state
  dpSsStates[item.id] = { index: 0, total: item.screenshots.length };

  // Init sticky bar (observe hero)
  initDpSticky();

  // Init scroll reveals on newly injected elements
  initReveal();

  // Trigger hero BG slow-zoom entrance
  requestAnimationFrame(() => {
    const hero = container.querySelector('.dp-hero');
    if (hero) requestAnimationFrame(() => hero.classList.add('dp-entered'));
  });
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
      <div>
        <div class="footer-logo">
          <img src="assets/images/logo/GEEKLEARN_GAMES_NEW_LOGO_V4_WHITE.png" alt="GLG" onerror="this.style.display='none'">
        </div>
        <p class="footer-brand-desc">${t('footerDesc')}</p>
      </div>
      <div>
        <div class="footer-col-title">${t('footerNavTitle')}</div>
        <div class="footer-links">
          <button onclick="showPage('home')">${nav[0]}</button>
          <button onclick="showPage('works')">${nav[1]}</button>
          <button onclick="showPage('shop')">${nav[2]}</button>
          <button onclick="showPage('about')">${nav[3]}</button>
          <button onclick="showPage('contact')">${nav[4]}</button>
        </div>
      </div>
      <div>
        <div class="footer-col-title">${t('footerWorksTitle')}</div>
        <div class="footer-links">
          ${ALL_WORKS.map(w => `<button onclick="showPage('detail','${w.id}')">${w.title}</button>`).join('')}
        </div>
      </div>
      <div>
        <div class="footer-col-title">${t('footerFollowTitle')}</div>
        <div class="footer-socials-row">
          <a href="https://x.com/geeklearngames" target="_blank" rel="noopener" class="footer-soc-btn" title="X / Twitter" aria-label="X Twitter">
            <img src="assets/images/LINKS - LOGOS/X_logo_2023_(white).png" alt="X" class="soc-icon">
          </a>
          <a href="https://discord.gg/M7YJsC9BwH" target="_blank" rel="noopener" class="footer-soc-btn" title="Discord" aria-label="Discord">
            <img src="assets/images/LINKS - LOGOS/DISCORD - LOGO - TRANSPARANT.png" alt="Discord" class="soc-icon">
          </a>
          <a href="https://www.youtube.com/@GEEKLEARN-GAMES" target="_blank" rel="noopener" class="footer-soc-btn" title="YouTube" aria-label="YouTube">
            <img src="assets/images/LINKS - LOGOS/YOUTUBE - LOGO - TRANSPARENT.png" alt="YouTube" class="soc-icon">
          </a>
          <a href="https://www.instagram.com/geeklearn_games/" target="_blank" rel="noopener" class="footer-soc-btn" title="Instagram" aria-label="Instagram">
            <img src="assets/images/LINKS - LOGOS/INSTAGRAM - LOGO - TRANSPARENT.png" alt="Instagram" class="soc-icon">
          </a>
          <a href="https://store.steampowered.com/dev/GEEKLEARN-GAMES" target="_blank" rel="noopener" class="footer-soc-btn" title="Steam" aria-label="Steam">
            <img src="assets/images/LINKS - LOGOS/STEAM - LOGO - TRANSPARENT.png" alt="Steam" class="soc-icon">
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
    window.addEventListener('scroll', () => {
      const d = document.documentElement;
      const pct = (window.scrollY / (d.scrollHeight - d.clientHeight)) * 100;
      const el = $('sprogress');
      if (el) el.style.width = pct + '%';
    }, { passive: true });
  }
}

/* ══════════════════════════════════════════
   REVEAL
══════════════════════════════════════════ */
let _revealObs = null;
function initReveal() {
  if (!_revealObs) {
    _revealObs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('visible'); _revealObs.unobserve(e.target); }
      });
    }, { threshold: 0.06, rootMargin: '0px 0px -28px 0px' });
  }
  // Observe any .reveal elements not yet visible (safe to call multiple times)
  $$('.reveal:not(.visible)').forEach(el => _revealObs.observe(el));
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
══════════════════════════════════════════ */
function handleContactForm(e) {
  e.preventDefault();
  const form = e.target;

  /* ── Security check (rate limit + honeypot, via protection.js) ── */
  if (typeof window._glgCheckForm === 'function') {
    const chk = window._glgCheckForm(form);
    if (!chk.ok) {
      if (chk.reason === 'rate_limit') {
        const btn = $('form-submit-btn');
        if (btn) {
          const orig = btn.innerHTML;
          btn.textContent = t('errRateLimit') || 'Too many requests — please wait a few minutes.';
          btn.disabled = true;
          setTimeout(() => { btn.innerHTML = orig; btn.disabled = false; }, 5000);
        }
      }
      // Bot case: silently pretend success (don't educate bots about the check)
      return;
    }
  }

  /* ── Clear previous inline errors ── */
  form.querySelectorAll('.form-err').forEach(el => el.remove());
  form.querySelectorAll('.form-input--err, .form-select--err, .form-textarea--err')
    .forEach(el => el.classList.remove('form-input--err','form-select--err','form-textarea--err'));

  /* ── Gather fields ── */
  const inputs = form.querySelectorAll('[required]');
  let valid = true;

  inputs.forEach(input => {
    const val = input.value.trim();
    let errMsg = '';

    if (!val) {
      const tag = input.tagName.toLowerCase();
      if (tag === 'select') errMsg = t('errRequired') || 'Required';
      else if (input.type === 'email') errMsg = t('errEmail') || 'Valid email required';
      else errMsg = t('errRequired') || 'Required';
    } else if (input.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      errMsg = t('errEmail') || 'Valid email required';
    }

    if (errMsg) {
      valid = false;
      /* Mark input */
      const errClass = input.tagName === 'SELECT'
        ? 'form-select--err'
        : input.tagName === 'TEXTAREA'
          ? 'form-textarea--err'
          : 'form-input--err';
      input.classList.add(errClass);
      /* Inject error message */
      const err = document.createElement('p');
      err.className = 'form-err';
      err.textContent = errMsg;
      input.parentNode.appendChild(err);
    }
  });

  if (!valid) return; /* Stop — errors shown */

  /* ── All valid — show success ── */
  const btn = $('form-submit-btn');
  if (!btn) return;
  const orig = btn.innerHTML;
  btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 8l4 4 8-8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> <span id="form-submit-txt">${t('formSent') || 'Sent!'}</span>`;
  btn.style.background = 'transparent';
  btn.style.color = 'var(--white)';
  btn.disabled = true;
  setTimeout(() => {
    btn.innerHTML = orig;
    btn.style.background = '';
    btn.style.color = '';
    btn.disabled = false;
    form.reset();
  }, 3500);
}

/* ══════════════════════════════════════════
   KEYBOARD
══════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeBuyModal();
    closeTrailerModal();
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
          <img src="${item.cover}" alt="" loading="lazy">
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
