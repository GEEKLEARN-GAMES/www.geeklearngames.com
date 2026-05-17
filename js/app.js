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

/* rAF handles for carousel loops — keyed by carousel element id */
const _carouselRAF = {};

/* ── Localised price helper ── */
function getPrice(item) {
  if (item.isFree) return t('free') || 'FREE';
  if (item.prices) {
    const cur = LANG_CURRENCY[LANG] || 'eur';
    return item.prices[cur] || item.price;
  }
  return item.price;
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
let _rainActiveSlot = 'a';
let _rainCurrentCode = null;
let _washActiveSlot  = 'a';
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

// Rain flag crossfade — swaps which image slot is shown (a/b per flag element).
function setGateRainFlag(code) {
  if (code === _rainCurrentCode) return;
  _rainCurrentCode = code;
  const rain   = $('gate-rain');
  const inners = rain ? rain.querySelectorAll('.gate-rain-inner') : [];
  if (!inners.length) return;
  const nextSlot = _rainActiveSlot === 'a' ? 'b' : 'a';
  const curSlot  = _rainActiveSlot;
  const src      = `assets/images/FLAGS/${code}.svg`;
  inners.forEach(inner => {
    const next = inner.querySelector(`.grfi-${nextSlot}`);
    const cur  = inner.querySelector(`.grfi-${curSlot}`);
    if (!next || !cur) return;
    next.src = src;
    // Two rAFs: frame 1 registers new src, frame 2 triggers the CSS opacity
    // transition — direct dissolve with no black gap between flags.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      next.style.opacity = '1';
      cur.style.opacity  = '0';
    }));
  });
  _rainActiveSlot = nextSlot;
}

// Wash crossfade — same two-slot pattern as rain, so gradient changes always fade.
// Ensures no instant background swap even on very fast hover.
function setGateWash(code) {
  if (code === _washCurrentCode) return;
  _washCurrentCode = code;
  const wash = $('gate-wash');
  if (!wash) return;
  const nextSlot = _washActiveSlot === 'a' ? 'b' : 'a';
  const curSlot  = _washActiveSlot;
  const nextEl   = wash.querySelector(`.gwash-${nextSlot}`);
  const curEl    = wash.querySelector(`.gwash-${curSlot}`);
  if (!nextEl || !curEl) return;
  nextEl.style.background = GATE_GLOW[code] || GATE_GLOW.en;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    nextEl.style.opacity = '1';
    curEl.style.opacity  = '0';
  }));
  _washActiveSlot = nextSlot;
}

function buildGate() {
  const wrap = $('gate-langs');
  if (!wrap) return;

  // ── Flag rain background (built once) ──────────────────────────
  if (!$('gate-rain')) {
    const gate = $('lang-gate');
    const rain = document.createElement('div');
    rain.id = 'gate-rain';
    rain.className = 'gate-rain';
    rain.setAttribute('aria-hidden', 'true');

    const defaultCode = LANG_GATE[0].code;
    _rainCurrentCode  = defaultCode;

    const vpW   = window.innerWidth;
    // Adaptive count — more on wide screens, fewer on mobile
    // For a rich rain effect: many flags, varied sizes, slight overlaps are fine.
    // Brief overlaps look natural for falling objects (same as real rain).
    const COUNT = vpW < 600 ? 10 : vpW < 1024 ? 15 : 22;

    // ── Jittered-grid placement ─────────────────────────────────────
    // Sizes shuffled independently of positions for natural variety.
    const sizes = Array.from({ length: COUNT }, () => {
      const w    = Math.round(58 + Math.random() * 102);   // 58–160 px (larger range)
      const h    = Math.round(w * 0.667);
      const diag = Math.ceil(Math.sqrt(w * w + h * h));
      return { w, h, diag };
    }).sort(() => Math.random() - 0.5);

    // One flag per zone with random jitter inside the zone.
    const zoneW = vpW / COUNT;
    const flags = sizes.map((sz, i) => ({
      ...sz,
      cx: i * zoneW + zoneW * (0.15 + Math.random() * 0.7),
    }));

    // 4. Build DOM elements.
    flags.forEach(f => {
      const leftPx  = f.cx - f.w / 2;
      const leftPct = (leftPx / vpW * 100).toFixed(2);
      const fallDur = (30 + Math.random() * 38).toFixed(1);  // 30–68 s
      const delay   = -(Math.random() * parseFloat(fallDur)).toFixed(2);
      const rotDur  = (9  + Math.random() * 22).toFixed(1);  // 9–31 s
      const blur    = (f.w > 120                             // larger → less blur
                         ? (0.6 + Math.random() * 1.6)
                         : (1.4 + Math.random() * 2.8)).toFixed(1);
      const op      = (f.w > 120
                         ? 0.70 + Math.random() * 0.20        // 0.70–0.90
                         : 0.60 + Math.random() * 0.22).toFixed(2);
      const reverse = Math.random() > 0.5;

      const item = document.createElement('div');
      item.className = 'gate-rain-item';
      item.style.cssText =
        `left:${leftPct}%;top:-${f.h + 20}px;` +
        `animation-delay:${delay}s;--fall-dur:${fallDur}s;`;

      const inner = document.createElement('div');
      inner.className = 'gate-rain-inner';
      inner.style.cssText =
        `width:${f.w}px;height:${f.h}px;` +
        `--blur:${blur}px;--opacity:${op};--rot-dur:${rotDur}s;`;
      if (reverse) inner.style.animationDirection = 'reverse';

      // Two stacked imgs — slot 'a' visible on load, 'b' prepped for crossfade
      ['a', 'b'].forEach((slot, si) => {
        const img = document.createElement('img');
        img.className = `grfi grfi-${slot}`;
        img.src = `assets/images/FLAGS/${defaultCode}.svg`;
        img.alt = '';
        img.style.opacity = si === 0 ? '1' : '0';
        inner.appendChild(img);
      });

      item.appendChild(inner);
      rain.appendChild(item);
    });

    if (gate) gate.insertBefore(rain, gate.firstChild);

    // ── Ambient colour wash (created once, two slots for smooth crossfade) ──
    if (gate && !$('gate-wash')) {
      const wash = document.createElement('div');
      wash.id = 'gate-wash';
      wash.setAttribute('aria-hidden', 'true');
      // Two stacked child divs — same crossfade pattern as the rain flag images.
      // Pre-fill slot 'a' with the default flag's gradient so first hover is
      // instant (no flash or load delay).
      ['a', 'b'].forEach((slot, si) => {
        const el = document.createElement('div');
        el.className = `gwash-slot gwash-${slot}`;
        el.style.opacity = si === 0 ? '1' : '0';
        if (si === 0) el.style.background = GATE_GLOW[defaultCode] || GATE_GLOW.en;
        wash.appendChild(el);
      });
      // Insert after rain (renders above rain at same z-index)
      gate.insertBefore(wash, rain.nextSibling);
      // Sync internal wash state with pre-filled default
      _washCurrentCode = defaultCode;
      _washActiveSlot  = 'a';
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

  // ── Hover: dim others + crossfade rain + crossfade wash ─────────
  // mouseleave on the GRID CONTAINER — moving between buttons never fires
  // an intermediate reset (was the EN→FR→DE triple-fire crossfade bug).
  const btns = wrap.querySelectorAll('.gate-lang');
  const rain  = $('gate-rain');
  const wash  = $('gate-wash');

  function activateFlag(code) {
    if (rain) rain.classList.add('gate-rain--hover');
    if (wash) wash.classList.add('gate-wash--active');
    setGateRainFlag(code);
    setGateWash(code);
  }
  function deactivateFlag() {
    btns.forEach(b => b.classList.remove('dimmed'));
    if (rain) rain.classList.remove('gate-rain--hover');
    if (wash) wash.classList.remove('gate-wash--active');
    setGateRainFlag(LANG_GATE[0].code);
    setGateWash(LANG_GATE[0].code);
  }

  btns.forEach(btn => {
    // Mouse hover
    btn.addEventListener('mouseenter', () => {
      btns.forEach(b => { if (b !== btn) b.classList.add('dimmed'); });
      activateFlag(btn.dataset.code);
    });
    // Touch: brief visual feedback before selectLang fires via onclick
    btn.addEventListener('touchstart', () => {
      btns.forEach(b => { if (b !== btn) b.classList.add('dimmed'); });
      activateFlag(btn.dataset.code);
    }, { passive: true });
  });

  wrap.addEventListener('mouseleave', deactivateFlag);
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

  // Make loader opaque INSTANTLY (no transition) before touching the gate.
  // This ensures the page behind is never visible during the gate fade-out.
  loader.style.transition = 'none';
  loader.style.opacity    = '1';
  loader.style.pointerEvents = 'all';
  loader.offsetHeight; // force reflow so the above applies before the next paint
  loader.style.transition = ''; // restore transition (used later for fade-out)
  loader.classList.add('show');

  // Now it is safe to fade the gate — the loader is already covering the page
  gate.classList.add('out');

  // Animate percentage counter
  let pct = 0;
  const pctEl = $('loader-pct');
  const timer = setInterval(() => {
    pct += Math.floor(Math.random() * 14) + 4;
    if (pct >= 100) { pct = 100; clearInterval(timer); }
    if (pctEl) pctEl.textContent = pct + '%';
  }, 90);

  setTimeout(() => {
    gate.style.display = 'none';
    document.documentElement.style.overflow = ''; // re-enable scrolling (iOS Safari fix)
    document.body.style.overflow = '';
    loader.classList.add('fade');
    setTimeout(() => {
      loader.style.display = 'none';
      window.scrollTo({ top: 0, behavior: 'instant' }); // always land at the top
      applyTranslations();
      initSite();
      // Auto-translate any text not covered by I18N using browser API if available
      autoTranslateFallback(code);
    }, 760); // ≥ loader .fade transition duration (720ms) so animation completes first
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

  // Reset rain to the default flag (first language)
  setGateRainFlag(LANG_GATE[0].code);
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
  t('nav').forEach((label, i) => {
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
  if (stEl) { const v = t('showcaseTitle'); stEl.innerHTML = v ? v.replace('\n','<br>') : 'WHAT WE<br>CREATE'; }

  // CTA eyebrow
  setText('cta-eye', t('ctaEye') || 'Publishers & Partners');

  // Works page
  setText('works-eye', t('worksEye') || 'Complete Catalogue');

  // About page
  setText('about-eye', t('aboutEye') || 'The Studio');
  const atEl = $('about-title');
  if (atEl) { const v = t('aboutTitle'); atEl.innerHTML = v ? v.replace('\n','<br>') : 'ABOUT<br>US'; }
  setText('about-desc', t('aboutDesc'));
  setText('team-eye',  t('teamEye') || 'The Team');
  const ttEl = $('team-title');
  if (ttEl) { const v = t('teamTitle'); ttEl.innerHTML = v ? v.replace('\n','<br>') : 'WHO WE<br>ARE'; }
  setText('manifesto-label', t('manifestoLabel') || 'Studio Manifesto');
  setHTML('about-manifesto-quote', t('manifestoQuote') || '');
  setText('awards-eye',   t('awardsEye') || 'Awards & Distinctions');
  const awEl = $('awards-title');
  if (awEl) { const v = t('awardsTitle'); awEl.innerHTML = v ? v.replace('\n','<br>') : 'RECOGNISED<br>WORK'; }

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
  initCarouselTouch();
}

/* ══════════════════════════════════════════
   NAV
══════════════════════════════════════════ */
function initNav() {
  window.addEventListener('scroll', () => {
    $('nav').classList.toggle('scrolled', window.scrollY > 40);
  }, { passive: true });

  $('nav-burger')?.addEventListener('click', () => {
    $('nav-burger').classList.toggle('open');
    $('nav-mobile')?.classList.toggle('open');
  });
}

function showPage(name, itemId = null) {
  $$('.page').forEach(p => p.classList.remove('active'));
  $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === name));
  window.scrollTo({ top: 0, behavior: 'instant' });
  $('nav-mobile')?.classList.remove('open');
  $('nav-burger')?.classList.remove('open');

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
function buildCarousels() {
  buildCarousel('films-carousel', FILMS, FILM_LABELS[LANG] || 'Interactive Film');
  buildCarousel('games-carousel', GAMES, GAME_LABELS[LANG] || 'Video Game');
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
   * In an RTL document (Arabic etc.), an overflow:hidden parent aligns its child's
   * RIGHT edge to the container right edge, so translateX(0) would expose the wrong
   * end of the track. Pinning the viewport to LTR guarantees the track's LEFT edge
   * always anchors left, making translateX / teleport logic direction-agnostic.
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
  const cardW = Math.min(200, Math.max(130, vw * 0.16)) + 10; // matches CSS clamp
  const setW  = items.length * cardW;                         // width of ONE full set
  /* Need at least 2 full sets visible; round up to an even number for symmetry */
  let setsNeeded = Math.max(4, Math.ceil((vw * 2.5) / setW + 1));
  if (setsNeeded % 2 !== 0) setsNeeded++;

  let html = '';
  for (let i = 0; i < setsNeeded; i++) {
    items.forEach(item => { html += cardHTML(item, typeLabel); });
  }
  el.innerHTML = html;

  /*
   * Measure the ACTUAL rendered width of one set.
   * If the page is hidden (display:none), scrollWidth returns 0 — fall back to
   * the JS estimate (setW).  The carousel is rebuilt with the exact measurement
   * the moment showPage('works') fires (see below).
   */
  const measuredW  = el.scrollWidth;
  const actualSetW = measuredW > 0 ? measuredW / setsNeeded : setW;

  /*
   * Starting positions:
   *   Left  (films):  pos = 0        → moves to –actualSetW then teleports to 0
   *   Right (games):  pos = –actualSetW → moves to 0 then teleports to –actualSetW
   * The two visible windows are always showing identical content → seamless jump.
   */
  let pos = (dir === 1) ? -actualSetW : 0;
  el.style.transform = `translateX(${pos}px)`;

  function tick() {
    /* Pause on hover (works for nested cards too via :hover propagation) */
    if (!el.matches(':hover')) {
      pos += dir * speed;
      /* Seamless teleport when one full set has scrolled past */
      if (dir < 0 && pos <= -actualSetW) pos += actualSetW;
      if (dir > 0 && pos >= 0)           pos -= actualSetW;
      el.style.transform = `translateX(${pos}px)`;
    }
    _carouselRAF[id] = requestAnimationFrame(tick);
  }

  _carouselRAF[id] = requestAnimationFrame(tick);
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
        <div class="c-card-yr">${item.year} · ${getPrice(item)}</div>
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
  const words    = member.name.trim().split(/\s+/);
  const initials = words.length > 1
    ? words.map(w => w[0]).join('').slice(0, 2)
    : member.name.slice(0, 2);

  const idx     = String((index ?? 0) + 1).padStart(2, '0');
  const eyebrow = member.role.split(/\s*[·\-,]\s*/)[0].trim();

  // Stats row — three chips beneath the quote
  const statRole   = eyebrow;
  const statStudio = 'GLG';
  const statEst    = member.year || '2026';
  // Labels adapt to current language
  const lbl = {
    role:   { fr:'Rôle',    es:'Rol',    de:'Rolle',   ar:'الدور',   zh:'职位',  ja:'役職',  ru:'Роль',   pl:'Rola',   it:'Ruolo',  en:'Role'   }[LANG] || 'Role',
    studio: { fr:'Studio',  es:'Studio', de:'Studio',  ar:'الأستوديو',zh:'工作室',ja:'スタジオ',ru:'Студия', pl:'Studio', it:'Studio', en:'Studio' }[LANG] || 'Studio',
    est:    { fr:'Fondé en',es:'Fundado',de:'Gegründet',ar:'تأسيس',  zh:'成立',  ja:'設立',  ru:'Осн.',   pl:'Założone',it:'Fondato',en:'Est.'   }[LANG] || 'Est.',
  };

  const photoBlock = `
    <div class="cm-photo">
      ${member.photo
        ? `<img src="${member.photo}" alt="${member.name}" onerror="this.style.display='none'">`
        : `<div class="cm-photo-init">${initials.toUpperCase()}</div>`
      }
      <div class="cm-photo-grad"></div>
    </div>`;

  const infoBlock = `
    <div class="cm-info">
      <div class="cm-idx">${idx}</div>
      <div class="cm-info-top">
        <div class="cm-eye">${eyebrow}</div>
        <div class="cm-name">${member.name}</div>
        ${member.realName ? `<div class="cm-realname">${member.realName}</div>` : ''}
        <div class="cm-role">${member.role}</div>
        <div class="cm-divider"></div>
        <p class="cm-quote">${member.quote}</p>
      </div>
      <div class="cm-stats">
        <div class="cm-stat">
          <div class="cm-stat-label">${lbl.role}</div>
          <div class="cm-stat-value">${statRole}</div>
        </div>
        <div class="cm-stat">
          <div class="cm-stat-label">${lbl.studio}</div>
          <div class="cm-stat-value">${statStudio}</div>
        </div>
        <div class="cm-stat">
          <div class="cm-stat-label">${lbl.est}</div>
          <div class="cm-stat-value">${statEst}</div>
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
   DETAIL PAGE — with centered hero, screenshot
   carousel, system requirements
══════════════════════════════════════════ */
function buildDetail(id) {
  const item = ALL_WORKS.find(i => i.id === id);
  if (!item) return;

  const container = $('page-detail');

  // Specs helper
  const specBlock = (label, spec) => `
    <div class="spec-block">
      <div class="spec-os-head">${label}</div>
      <div class="spec-row"><span class="spec-k">${t('specOs')}</span><span class="spec-v">${spec.os}</span></div>
      <div class="spec-row"><span class="spec-k">${t('specCpu')}</span><span class="spec-v">${spec.cpu}</span></div>
      <div class="spec-row"><span class="spec-k">${t('specGpu')}</span><span class="spec-v">${spec.gpu}</span></div>
      <div class="spec-row"><span class="spec-k">${t('specRam')}</span><span class="spec-v">${spec.ram}</span></div>
      <div class="spec-row"><span class="spec-k">${t('specStorage')}</span><span class="spec-v">${spec.storage}</span></div>
      <div class="spec-row"><span class="spec-k">${t('specDx')}</span><span class="spec-v">${spec.dx}</span></div>
    </div>
  `;

  // Screenshots dots
  const ssCount = item.screenshots.length;

  const localTagline     = getItemField(item, 'tagline');
  const localDescription = getItemField(item, 'description');
  const localFeatures    = getItemField(item, 'features');
  const localCat         = getCatLabel(item);
  const localStatus      = getStatusLabel(item);
  const localPrice       = getPrice(item);
  const genres           = item.genres || [];

  container.innerHTML = `
    <!-- HERO -->
    <div class="detail-hero">
      <div class="detail-hero-bg" style="background-image:url('${item.cover}')"></div>
      <div class="detail-hero-grad"></div>
      <div class="detail-hero-tint" style="background:${item.tint}"></div>
      <button class="detail-back" onclick="showPage('works')">${t('detailBack')}</button>

      <div class="detail-hero-content">
        ${item.logo
          ? `<img class="detail-game-logo" src="${item.logo}" alt="${item.title}">`
          : `<h1 class="detail-game-title">${item.title}</h1>`
        }
        <div class="detail-cat-label">${localCat} · ${item.year}</div>
        <p class="detail-tagline">${localTagline}</p>
        ${genres.length ? `<div class="genre-tags">${genres.map(g=>`<span class="genre-tag">${g}</span>`).join('')}</div>` : ''}
        <div class="detail-btns">
          <button class="btn btn-primary btn-lg" onclick="openBuyModal('${item.id}')">
            ${t('buyNow')} — ${localPrice}
          </button>
          <button class="btn btn-outline btn-lg" onclick="openTrailerModal('${item.id}')">
            ${t('trailerBtn')}
          </button>
        </div>
      </div>
    </div>

    <!-- BODY -->
    <div class="detail-body">
      <div class="detail-grid">
        <div>
          <!-- About -->
          <div class="detail-sec-head">${t('aboutHead')}</div>
          <div class="detail-desc">
            ${localDescription.map(p => `<p>${p}</p>`).join('')}
          </div>

          <!-- Features -->
          <div class="detail-sec-head" style="margin-top:40px">${t('featuresHead')}</div>
          <ul style="list-style:none;display:flex;flex-direction:column;gap:9px;margin-top:4px">
            ${localFeatures.map(f => `
              <li style="display:flex;align-items:flex-start;gap:11px;font-size:.86rem;color:var(--greyt);line-height:1.5">
                <span style="color:var(--grey);flex-shrink:0;font-family:var(--f-mono);font-size:.72rem;margin-top:2px">—</span>
                ${f}
              </li>`).join('')}
          </ul>

          <!-- Screenshots carousel -->
          <div class="detail-sec-head" style="margin-top:48px">${t('ssHead')}</div>
          <div class="ss-wrap" id="ss-wrap-${item.id}">
            <div class="ss-viewport">
              <div class="ss-track" id="ss-track-${item.id}">
                ${item.screenshots.map((ss, idx) => `
                  <div class="ss-slide">
                    <img src="${ss}" alt="Screenshot ${idx + 1}" loading="lazy"
                         onerror="this.style.display='none'">
                  </div>`).join('')}
              </div>
            </div>
            <button class="ss-arrow ss-arrow-prev" onclick="ssNav('${item.id}',-1)">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 3l-5 5 5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            </button>
            <button class="ss-arrow ss-arrow-next" onclick="ssNav('${item.id}',1)">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            </button>
            <div class="ss-dots" id="ss-dots-${item.id}">
              ${item.screenshots.map((_, i) =>
                `<div class="ss-dot ${i === 0 ? 'active' : ''}" onclick="ssGoTo('${item.id}',${i})"></div>`
              ).join('')}
            </div>
          </div>

          <!-- System requirements -->
          <div class="detail-sec-head" style="margin-top:48px">${t('specsHead')}</div>
          <div class="specs-table" style="margin-top:12px">
            ${specBlock(t('specMin'), item.specs.min)}
            ${specBlock(t('specRec'), item.specs.rec)}
          </div>
        </div>

        <!-- Sidebar -->
        <aside class="detail-sidebar">
          <div class="sbox">
            <div class="sbox-head">${t('infoHead')}</div>
            <div class="sbox-body">
              <div class="irow"><span class="ik">${t('infoType')}</span><span class="iv">${localCat}</span></div>
              ${item.type === 'game' ? `<div class="irow"><span class="ik">${t('infoGenre')}</span><span class="iv">${localCat}</span></div>` : ''}
              ${item.duration ? `<div class="irow"><span class="ik">${t('infoDuration')}</span><span class="iv">${item.duration}</span></div>` : ''}
              <div class="irow"><span class="ik">${t('infoYear')}</span><span class="iv">${item.year}</span></div>
              <div class="irow"><span class="ik">${t('infoStudio')}</span><span class="iv">GEEKLEARN GAMES</span></div>
              <div class="irow"><span class="ik">${t('infoStatus')}</span><span class="iv">${localStatus}</span></div>
              <div class="irow" style="border:none"><span class="ik">${t('infoPrice')}</span><span class="iv" style="font-size:1.05rem;font-weight:700">${getPrice(item)}</span></div>
            </div>
          </div>
          <div class="sbox">
            <div class="sbox-head">${t('platHead')}</div>
            <div class="sbox-body">
              ${item.platforms.map(p => `
                <div class="plat-entry">
                  <div class="plat-ico" style="background:${PLATS[p].bg}">${PLATS[p].icon}</div>
                  <span>${PLATS[p].name}</span>
                </div>`).join('')}
              <button class="sidebar-buy" onclick="openBuyModal('${item.id}')">
                ${t('buyNow')}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>

    ${footerHTML()}
  `;

  // Init screenshot state
  ssStates[item.id] = { index: 0, total: item.screenshots.length };
}

/* ── Screenshot carousel ── */
const ssStates = {};
function ssNav(id, dir) {
  const state = ssStates[id];
  if (!state) return;
  state.index = (state.index + dir + state.total) % state.total;
  ssUpdate(id);
}
function ssGoTo(id, idx) {
  if (!ssStates[id]) return;
  ssStates[id].index = idx;
  ssUpdate(id);
}
function ssUpdate(id) {
  const state = ssStates[id];
  const track = $(`ss-track-${id}`);
  if (track) track.style.transform = `translateX(-${state.index * 100}%)`;
  $$(`#ss-dots-${id} .ss-dot`).forEach((dot, i) => {
    dot.classList.toggle('active', i === state.index);
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
function initScrollProgress() {
  window.addEventListener('scroll', () => {
    const d = document.documentElement;
    const pct = (window.scrollY / (d.scrollHeight - d.clientHeight)) * 100;
    const el = $('sprogress');
    if (el) el.style.width = pct + '%';
  }, { passive: true });
}

/* ══════════════════════════════════════════
   REVEAL
══════════════════════════════════════════ */
function initReveal() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }
    });
  }, { threshold: 0.06, rootMargin: '0px 0px -28px 0px' });
  $$('.reveal:not(.visible)').forEach(el => obs.observe(el));
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
  const strips = [
    { img: '', quote: quotes[0], tag: tags[0], num: '01' },
    { img: '', quote: quotes[1], tag: tags[1], num: '02' },
    { img: '', quote: quotes[2], tag: tags[2], num: '03' },
  ];

  container.innerHTML = strips.map(s => `
    <div class="puz-strip-row">
      <!-- The clipped image strip -->
      <div class="puz-strip">
        ${s.img
          ? `<img class="puz-strip-img" src="${s.img}" alt="" loading="lazy">`
          : `<div class="puz-strip-img" style="background:linear-gradient(135deg,#0e0e0e 0%,#1a1a1a 100%)"></div>`
        }
        <!-- Gradient so quote text stays readable -->
        <div class="puz-strip-grad"></div>
      </div>
      <!-- Large decorative index number -->
      <div class="puz-strip-index">${s.num}</div>
      <!-- Quote: sits below the strip bottom, overlapping the diagonal cut -->
      <div class="puz-quote">
        <span class="puz-quote-num">${s.num}</span>
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
  setHTML('wcat-films-title', t('catFilmsTitle').replace('\n','<br>'));
  setTxt ('wcat-games-label', t('catGamesLabel'));
  setHTML('wcat-games-title', t('catGamesTitle').replace('\n','<br>'));
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
   CAROUSEL TOUCH — mobile swipe (≤ 640px)

   Drag:    finger takes live control.
   Flick:   if finger lifts with velocity,
            momentum decelerates via rAF
            before animation resumes.
   Release: animation resumes from the exact
            pixel position — no jump, no snap.
══════════════════════════════════════════ */
function initCarouselTouch() {
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
