/* ═══════════════════════════════════════════
   GEEKLEARN GAMES, app.js
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

/* One-word "back" label per language, no new I18N key needed */
const GATE_BACK_LABELS = {
  fr:'Retour', en:'Back', es:'Volver', de:'Zurück',
  ar:'رجوع',   zh:'返回',  ja:'戻る',  ru:'Назад', pl:'Wróć', it:'Indietro',
};

/* rAF handles for carousel loops, keyed by carousel element id */
const _carouselRAF = {};

/* ── Perf: stop carousel loops when they're not on screen ──
   The auto-scroll loops wrote a transform EVERY frame even when the Works
   page was hidden (or the tab was in the background), pure wasted work.
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

/* ── Live exchange rates (EUR base), populated by initFxRates() ── */
let _fxRates = { EUR:1, USD:1.09, CNY:7.87, JPY:161, PLN:4.32, SAR:4.09, RUB:99.5 };

/* Fetch rates from ECB via frankfurter.app, caches 6h in localStorage */
async function initFxRates() {
  const CACHE_KEY = 'glg_fx_v1';
  const TTL = 6 * 3600 * 1000; // 6 hours
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { ts, rates } = JSON.parse(cached);
      // MERGE (ne pas remplacer) : la BCE ne cote ni SAR ni RUB → on garde
      // les fallbacks statiques pour ces devises, sinon rate=1 → prix faux.
      if (Date.now() - ts < TTL) { _fxRates = { ..._fxRates, EUR:1, ...rates }; return; }
    }
  } catch(e) {}
  try {
    const res  = await fetch('https://api.frankfurter.app/latest?from=EUR&to=USD,CNY,JPY,PLN');
    if (!res.ok) return;
    const data = await res.json();
    // SAR est arrimé au dollar (peg 3,75) → dérivé du USD live quand dispo
    if (data.rates && data.rates.USD) data.rates.SAR = +(data.rates.USD * 3.75).toFixed(4);
    _fxRates = { ..._fxRates, EUR:1, ...data.rates };
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

/* ── Promotions (offres de précommande / soldes) ─────────────────────────
   data.js : `promo:{ pct:20, until:'2026-12-31' }` sur une œuvre.
   `until` (optionnel, inclus) coupe l'offre automatiquement côté client -
   retirer une promo = supprimer le champ, aucune logique à toucher. */
function activePromo(item) {
  const p = item && item.promo;
  if (!p || !(p.pct > 0) || item.isFree || !(item.basePrice > 0)) return null;
  if (p.until) {
    const end = Date.parse(p.until + 'T23:59:59');
    if (!isNaN(end) && Date.now() > end) return null;
  }
  return p;
}

/* Prix courant en EUR, remise déduite (base de toutes les conversions FX). */
function promoPrice(item) {
  const p = activePromo(item);
  return p ? Math.max(0, +(item.basePrice * (1 - p.pct / 100)).toFixed(2)) : item.basePrice;
}

/* Prix courant (remise déduite), formaté dans la devise de la langue. */
function getPriceNow(item) {
  if (item.isFree || item.basePrice === 0) return t('free') || 'FREE';
  if (item.basePrice != null) return formatPrice(promoPrice(item), LANG);
  return t('priceTBA'); // aucun prix inventé avant l'annonce
}

/* Fragment HTML de prix : badge −XX% + ancien prix barré + prix courant.
   Chaque montant garde son data-base-price → refreshDisplayedPrices()
   continue de convertir les devises sans reconstruire la page. */
function priceHTML(item, opts) {
  const o   = opts || {};
  const cls = 'glg-price' + (o.size ? ' glg-price--' + o.size : '');
  if (item.basePrice == null && !item.isFree)
    return `<span class="${cls} glg-price--tba"><span class="glg-price-now">${t('priceTBA')}</span></span>`;
  if (item.isFree || item.basePrice === 0)
    return `<span class="${cls}"><span class="glg-price-now">${getPrice(item)}</span></span>`;
  const p = activePromo(item);
  if (!p)
    return `<span class="${cls}"><span class="glg-price-now price-display" data-base-price="${item.basePrice}">${formatPrice(item.basePrice, LANG)}</span></span>`;
  const now = promoPrice(item);
  return `<span class="${cls} glg-price--promo">` +
    `<span class="glg-price-pct">−${p.pct}%</span>` +
    `<s class="glg-price-old price-display" data-base-price="${item.basePrice}">${formatPrice(item.basePrice, LANG)}</s>` +
    `<span class="glg-price-now price-display" data-base-price="${now}">${formatPrice(now, LANG)}</span></span>`;
}

/* ── ÉDITIONS Standard/Deluxe (buybox, style Steam) ──────────────────────
   Données : WORK_EDITIONS (data.js). La promo s'applique à chaque édition ;
   chaque montant garde son data-base-price → conversions FX intactes. */
const _ED_T = {
  editions: { fr:'Édition', en:'Edition', es:'Edición', de:'Edition', it:'Edizione', ar:'الإصدار', zh:'版本', ja:'エディション', ru:'Издание', pl:'Edycja' },
  standard: { fr:'Édition Standard', en:'Standard Edition', es:'Edición Estándar', de:'Standard Edition', it:'Edizione Standard', ar:'الإصدار القياسي', zh:'标准版', ja:'スタンダード版', ru:'Стандартное издание', pl:'Edycja standardowa' },
  deluxe:   { fr:'Édition Deluxe', en:'Deluxe Edition', es:'Edición Deluxe', de:'Deluxe Edition', it:'Edizione Deluxe', ar:'الإصدار الفاخر', zh:'豪华版', ja:'デラックス版', ru:'Издание Deluxe', pl:'Edycja Deluxe' },
  includes: { fr:'Inclut', en:'Includes', es:'Incluye', de:'Enthält', it:'Include', ar:'يتضمن', zh:'包含', ja:'同梱内容', ru:'Включает', pl:'Zawiera' },
  ost:      { fr:'Bande originale numérique', en:'Digital soundtrack', es:'Banda sonora digital', de:'Digitaler Soundtrack', it:'Colonna sonora digitale', ar:'الموسيقى التصويرية الرقمية', zh:'数字原声音乐', ja:'デジタルサウンドトラック', ru:'Цифровой саундтрек', pl:'Cyfrowa ścieżka dźwiękowa' },
  artbook:  { fr:'Artbook numérique', en:'Digital artbook', es:'Artbook digital', de:'Digitales Artbook', it:'Artbook digitale', ar:'كتاب فني رقمي', zh:'数字画集', ja:'デジタルアートブック', ru:'Цифровой артбук', pl:'Cyfrowy artbook' },
  skins:    { fr:'Pack de skins exclusifs', en:'Exclusive skin pack', es:'Pack de skins exclusivos', de:'Exklusives Skin-Paket', it:'Pacchetto skin esclusive', ar:'حزمة أشكال حصرية', zh:'专属皮肤包', ja:'限定スキンパック', ru:'Набор эксклюзивных скинов', pl:'Pakiet ekskluzywnych skórek' },
  wallpapers:{ fr:'Fonds d’écran 4K', en:'4K wallpapers', es:'Fondos de pantalla 4K', de:'4K-Hintergründe', it:'Sfondi 4K', ar:'خلفيات 4K', zh:'4K壁纸', ja:'4K壁紙', ru:'Обои 4K', pl:'Tapety 4K' },
};
const _edt = k => (_ED_T[k] && (_ED_T[k][LANG] || _ED_T[k].en)) || k;
const _dpEditionSel = {}; // workId → clé d'édition choisie (mémoire de session)

function _workEditions(item) { return (typeof WORK_EDITIONS !== 'undefined' && WORK_EDITIONS[item.id]) || null; }
function _selEdition(item) {
  const eds = _workEditions(item); if (!eds || !eds.length) return null;
  const k = _dpEditionSel[item.id] || eds[0].key;
  return eds.find(e => e.key === k) || eds[0];
}
/* Prix (promo appliquée) de l'édition sélectionnée, même contrat que priceHTML. */
function _editionPriceHTML(item) {
  const ed = _selEdition(item);
  if (!ed || item.isFree || item.basePrice == null) return priceHTML(item);
  const base = +(item.basePrice + (ed.delta || 0)).toFixed(2);
  const p = activePromo(item);
  if (!p) return `<span class="glg-price"><span class="glg-price-now price-display" data-base-price="${base}">${formatPrice(base, LANG)}</span></span>`;
  const now = +(base * (1 - p.pct / 100)).toFixed(2);
  return `<span class="glg-price glg-price--promo">` +
    `<span class="glg-price-pct">−${p.pct}%</span>` +
    `<s class="glg-price-old price-display" data-base-price="${base}">${formatPrice(base, LANG)}</s>` +
    `<span class="glg-price-now price-display" data-base-price="${now}">${formatPrice(now, LANG)}</span></span>`;
}
function _editionPerksHTML(item) {
  const ed = _selEdition(item);
  if (!ed || !ed.perks || !ed.perks.length) return '';
  return `<div class="dp-ed-perks-in">
    <span class="dp-ed-inc">${_edt('includes')}</span>
    ${ed.perks.map(p => `<span class="dp-ed-perk"><span aria-hidden="true">✓</span> ${_edt(p)}</span>`).join('')}
  </div>`;
}
function _dpEditionsHTML(item) {
  const eds = _workEditions(item); if (!eds) return '';
  const sel = _selEdition(item);
  const p = activePromo(item);
  return `
  <div class="dp-editions" role="radiogroup" aria-label="${_edt('editions')}">
    ${eds.map(e => {
      const base = +(item.basePrice + (e.delta || 0)).toFixed(2);
      const now = p ? +(base * (1 - p.pct / 100)).toFixed(2) : base;
      return `
      <button type="button" class="dp-ed ${e.key === sel.key ? 'on' : ''}" role="radio" aria-checked="${e.key === sel.key}"
              data-ed="${e.key}" onclick="dpSelectEdition('${item.id}','${e.key}')">
        <span class="dp-ed-name">${_edt(e.key)}</span>
        <span class="dp-ed-price price-display" data-base-price="${now}">${formatPrice(now, LANG)}</span>
      </button>`;
    }).join('')}
  </div>
  <div id="dp-ed-perks">${_editionPerksHTML(item)}</div>`;
}
function dpSelectEdition(workId, key) {
  _dpEditionSel[workId] = key;
  const item = ALL_WORKS.find(w => w.id === workId); if (!item) return;
  document.querySelectorAll('.dp-ed').forEach(b => {
    const on = b.dataset.ed === key;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
  });
  const priceBox = document.querySelector('.dp-buybox-price');
  if (priceBox) priceBox.innerHTML = _editionPriceHTML(item);
  const perks = document.getElementById('dp-ed-perks');
  if (perks) perks.innerHTML = _editionPerksHTML(item);
  window.GLG_SFX?.play('toggle');
}

/* Ligne « Offre de précommande jusqu'au … » (buybox des fiches). */
const _PROMO_T = {
  ends:  { fr:'Offre de précommande jusqu’au %s', en:'Pre-order offer until %s', es:'Oferta de reserva hasta el %s', de:'Vorbestellerangebot bis %s', it:'Offerta preordine fino al %s', ar:'عرض الطلب المسبق حتى %s', zh:'预购优惠截止至%s', ja:'予約特典は%sまで', ru:'Скидка за предзаказ до %s', pl:'Oferta przedsprzedaży do %s' },
  offer: { fr:'Offre de précommande', en:'Pre-order offer', es:'Oferta de reserva', de:'Vorbestellerangebot', it:'Offerta preordine', ar:'عرض الطلب المسبق', zh:'预购优惠', ja:'予約特典', ru:'Скидка за предзаказ', pl:'Oferta przedsprzedaży' },
};
function promoEndsHTML(item) {
  const p = activePromo(item);
  if (!p) return '';
  const T = k => (_PROMO_T[k][LANG] || _PROMO_T[k].en);
  if (!p.until) return `<div class="dp-promo-note">${T('offer')}</div>`;
  let d = p.until;
  try { d = new Date(p.until + 'T12:00:00').toLocaleDateString(LANG_LOCALE[LANG] || 'en-US', { day:'numeric', month:'long', year:'numeric' }); } catch (e) {}
  return `<div class="dp-promo-note">${T('ends').replace('%s', d)}</div>`;
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
  try { _buildHomeHero(); buildCarousels(); } catch (e) {}
}

/* ══════════════════════════════════════════
   LANGUAGE GATE
══════════════════════════════════════════ */

// True crossfade, two stacked imgs per element, swap which slot is on top.
// KEY FIX: mouseleave on the GRID CONTAINER only, prevents EN→FR→DE triple-fire.
let _rainActiveSlot  = 'a';
let _rainCurrentCode = null;
// Wash uses the container's own background directly, no child slots needed.
// This guarantees the correct gradient is always painted BEFORE the container
// becomes visible, eliminating any "wrong-language gradient bleed on first hover".
let _washCurrentCode = null;

// Flag-layout-accurate gradients, each matches the actual flag's colour disposition.
// Used for the ambient colour wash that blooms behind the gate on hover.
const GATE_GLOW = {
  // Vertical tricolore: blue-left → faint white → red-right
  fr: 'linear-gradient(90deg, rgba(0,55,164,.18) 0%, rgba(255,255,255,.04) 50%, rgba(237,41,57,.18) 100%)',
  // Union Jack: ~60% blue field → red cross accent, use lighter blue so it reads on black
  en: 'radial-gradient(ellipse 88% 70% at 50% 46%, rgba(45,100,230,.22) 0%, rgba(0,36,125,.18) 40%, rgba(200,16,46,.10) 72%, transparent 92%)',
  // Horizontal bands: red top/bottom, gold centre
  es: 'linear-gradient(180deg, rgba(198,11,30,.16) 0%, rgba(240,185,11,.20) 50%, rgba(198,11,30,.16) 100%)',
  // Horizontal bands: near-black top, red centre, gold bottom
  de: 'linear-gradient(180deg, rgba(12,12,12,.22) 0%, rgba(220,0,0,.16) 50%, rgba(255,200,0,.18) 100%)',
  // Solid emerald radial
  ar: 'radial-gradient(ellipse 70% 58% at 50% 46%, rgba(0,122,61,.24) 0%, rgba(0,90,40,.08) 60%, transparent 82%)',
  // Red field, pure vivid Chinese red, NO yellow (yellow + red → orange on dark bg)
  zh: 'radial-gradient(ellipse 85% 68% at 50% 46%, rgba(222,41,16,.28) 0%, rgba(200,28,10,.18) 52%, transparent 82%)',
  // Hi-no-Maru: two-layer composite.
  // Layer 1, the red disc: 15%×25% ratio compensates 16:9 aspect → looks circular on screen.
  // Layer 2, the white field: boosted to .15 opacity so it's distinctly visible (like FR white band).
  ja: 'radial-gradient(ellipse 15% 25% at 50% 46%, rgba(215,0,38,.62) 0%, rgba(190,0,45,.20) 50%, transparent 68%), radial-gradient(ellipse 88% 72% at 50% 46%, rgba(252,242,242,.15) 0%, rgba(238,224,224,.06) 52%, transparent 84%)',
  // Horizontal bands: faint white top, blue centre, red bottom
  ru: 'linear-gradient(180deg, rgba(220,220,220,.04) 0%, rgba(0,57,166,.18) 50%, rgba(210,43,30,.18) 100%)',
  // Horizontal halves: faint white top, red bottom
  pl: 'linear-gradient(180deg, rgba(220,220,220,.04) 0%, rgba(220,20,60,.22) 100%)',
  // Vertical tricolore: green-left → faint white → red-right
  it: 'linear-gradient(90deg, rgba(0,146,70,.18) 0%, rgba(255,255,255,.04) 50%, rgba(206,43,55,.18) 100%)',
};


// Wash, gradient is set directly on #gate-wash (no child slots).
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
   gate is visible, stopped on selection / close to avoid a stray timer. */
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

  // ── Cinematic breathing aura (created once, sits behind everything) ──
  const gateEl = $('lang-gate');
  if (gateEl && !gateEl.querySelector('.gate-aura')) {
    const aura = document.createElement('div');
    aura.className = 'gate-aura';
    aura.setAttribute('aria-hidden', 'true');
    gateEl.insertBefore(aura, gateEl.firstChild);
  }

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
  window.GLG_GATE_FIELD?.start(); // champ de drapeaux cinématique (dégrade proprement si absent/reduced-motion)

  // ── Hover: dim others + crossfade wash ──────────────────────────
  // mouseleave on the GRID CONTAINER, moving between buttons never fires
  // an intermediate reset (was the EN→FR→DE triple-fire crossfade bug).
  const btns = wrap.querySelectorAll('.gate-lang');

  function activateFlag(code) {
    setGateWash(code); // gradient is set synchronously, THEN container fades in via CSS
    window.GLG_GATE_FIELD?.setTint(code); // réveille en couleur les drapeaux de cette langue dans le champ
  }
  function deactivateFlag() {
    btns.forEach(b => b.classList.remove('dimmed'));
    setGateWash(null); // container fades out (1.4 s CSS transition)
    window.GLG_GATE_FIELD?.setTint(null);
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
  try { localStorage.setItem('glg_lang', code); } catch (e) {} // retour direct au prochain passage
  _stopGateClock(); // gate is about to close
  window.GLG_GATE_FIELD?.burst(code); // impulsion : les drapeaux de la langue choisie fusent vers le haut
  document.documentElement.lang = code;
  document.documentElement.dir = code === 'ar' ? 'rtl' : 'ltr';

  // Visual feedback on clicked button, highlight selected, dim the rest
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
  // opacity:1 would silently block the CSS fade-out, the class would set
  // opacity:0 but the inline value always wins, so the loader never fades.
  loader.classList.remove('fade');         // clean state from any previous load
  loader.style.display      = 'flex';     // override display:none from previous load
  loader.style.transition   = 'none';     // instant, no animation on appear
  loader.style.opacity      = '1';        // snap to opaque
  loader.offsetHeight;                    // flush reflow → browser commits the above
  loader.style.transition   = '';         // restore (CSS class transition takes over)
  loader.style.opacity      = '';         // ← clear inline: CSS classes now own opacity
  loader.classList.add('show');           // .show = opacity:1 via CSS (no inline conflict)

  // Now it is safe to fade the gate, the loader is already covering the page
  gate.classList.add('out');

  setTimeout(() => {
    gate.style.display = 'none';
    gate.classList.remove('gate--has-back'); // clean up back-button state
    window.GLG_GATE_FIELD?.stop(); // gèle le champ : le gate est caché
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

    // Deep-link ?work=<id> : ouvrir la fiche demandée pendant que le loader
    // couvre encore la page (même chemin que le clic d'une carte -
    // age-gating et SEO gérés par showPage/buildDetail).
    if (window._bootWorkId) {
      const _bw = window._bootWorkId; window._bootWorkId = null;
      showPage('detail', _bw);
    } else if (window._bootPage) {
      // Raccourcis PWA (#works/#profile…) : router après construction.
      // profile/settings retombent proprement sur leur état déconnecté.
      const _bp = window._bootPage; window._bootPage = null;
      showPage(_bp);
    } else if (window._pendingLaunch) {
      // Deep-link glg:// arrivé AVANT le choix de langue (launcher fraîchement
      // ouvert par le site web) : consommé maintenant que tout est construit.
      const _pl = window._pendingLaunch; window._pendingLaunch = null;
      _applyLaunchAction(_pl);
    }

    // Trigger the fade once the browser has committed the built DOM to screen.
    // Strategy: double-rAF ensures at least two paint frames have run, then a
    // 100 ms timeout gives WebKit/Safari enough time to fully composite the new
    // layer before the opacity transition begins, avoids the Safari race
    // condition where .fade fires before the painted content is visible.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          loader.classList.add('fade');
          setTimeout(() => { loader.style.display = 'none'; }, 1200);
        }, 100);
      });
    });

    // FAILSAFE, rAF is throttled/frozen when the tab is backgrounded, which
    // would otherwise strand the loader on screen forever (catastrophic black
    // screen). These plain timers fire regardless of paint state and guarantee
    // the loader always clears. Idempotent with the rAF path above.
    setTimeout(() => { loader.classList.add('fade'); }, 650);
    setTimeout(() => { loader.style.display = 'none'; loader.classList.remove('show'); }, 2100);
  }, 700); // était 2000, la construction du DOM prend <100 ms ; on garde un court battement cinématique
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
  gate.offsetHeight;           // force reflow, makes transition fire
  gate.classList.remove('out');

  // Lock scroll, html+body for iOS Safari
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';

  // Reset selection state so all flags appear neutral again
  document.querySelectorAll('.gate-lang').forEach(b => {
    b.classList.remove('dimmed', 'selected');
  });

  _startGateClock(); // resume live HUD clock
  window.GLG_GATE_FIELD?.start(); // relance le champ de drapeaux

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
   CLOSE GATE, KEEP CURRENT LANGUAGE
   Called by the back button that appears when
   the gate is re-opened after a language was
   already selected.  Just dismisses the gate
   without changing LANG or rebuilding anything.
══════════════════════════════════════════ */
function closeGateBack() {
  const gate = $('lang-gate');
  if (!gate) return;

  _stopGateClock();
  window.GLG_GATE_FIELD?.stop(); // gèle le champ pendant la fermeture

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
  // Already set in selectLang, nothing more needed for browser-native.

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

/* Contact promise strip + direct-contact line, i18n (étaient codés en dur en EN) */
const _CONTACT_PROMISE_T = {
  resp:   { fr:'Réponse garantie', en:'Response guaranteed', es:'Respuesta garantizada', de:'Antwort garantiert', it:'Risposta garantita', ar:'رد مضمون', zh:'保证回复', ja:'返信保証', ru:'Гарантированный ответ', pl:'Gwarantowana odpowiedź' },
  read:   { fr:'Messages lus', en:'Messages read', es:'Mensajes leídos', de:'Nachrichten gelesen', it:'Messaggi letti', ar:'الرسائل مقروءة', zh:'消息已读', ja:'メッセージ既読', ru:'Сообщения прочитаны', pl:'Wiadomości czytane' },
  titles: { fr:'Langues prises en charge', en:'Languages supported', es:'Idiomas disponibles', de:'Unterstützte Sprachen', it:'Lingue supportate', ar:'لغات مدعومة', zh:'支持的语言', ja:'対応言語', ru:'Языков поддерживается', pl:'Obsługiwane języki' },
  direct: { fr:'Réponse sous 48 h, chaque message est lu', en:'We reply within 48h, every message is read', es:'Respondemos en 48h, cada mensaje se lee', de:'Antwort in 48 Std., jede Nachricht wird gelesen', it:'Rispondiamo entro 48h, ogni messaggio è letto', ar:'نرد خلال 48 ساعة، كل رسالة تُقرأ', zh:'48小时内回复、每条消息都会被阅读', ja:'48時間以内に返信、すべてのメッセージに目を通します', ru:'Отвечаем в течение 48 ч, каждое сообщение прочитано', pl:'Odpowiadamy w 48h, każda wiadomość jest czytana' },
};
function _cpt(k){ const m=_CONTACT_PROMISE_T[k]; if(!m) return k; return m[LANG]||m.en; }

/* ══════════════════════════════════════════
   TRANSLATIONS, apply to static DOM
══════════════════════════════════════════ */
function applyTranslations() {
  const l = LANG;
  // Nav, order must match the I18N nav array: [home, works, about, contact]
  const navKeys = ['home','works','about','contact'];
  const navLabels = t('nav');
  if (Array.isArray(navLabels)) navLabels.forEach((label, i) => {
    setText('nl-'  + navKeys[i], label);
    setText('nml-' + navKeys[i], label);
  });
  // Bibliothèque, libellé hors tableau nav (id dédié, i18n _LIB_T)
  setText('nl-library',  _lbt('navLabel'));
  setText('nml-library', _lbt('navLabel'));
  // La bibliothèque déjà rendue se reconstruit dans la nouvelle langue
  if ($('library-root')?.childElementCount) buildLibraryPage();
  // Menu du compte (avatar) : régénère ses libellés dans la nouvelle langue
  if ($('nav-account-menu')) _buildAccountMenu();
  // Hero
  setHTML('studio-slogan', t('heroSlogan'));
  setText('nav-getl', t('navGet'));


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
    sel.innerHTML = `<option value="" disabled selected>-</option>` +
      opts.map(o => `<option>${o}</option>`).join('');
  }

  // Footer, rebuild all page slots with current language (single source of truth)
  buildPageFooters();

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

  // Contact promise strip + direct-contact promise (were hardcoded EN → now i18n)
  setText('cp-resp',    _cpt('resp'));
  setText('cp-read',    _cpt('read'));
  setText('cp-titles',  _cpt('titles'));
  setText('cd-promise', _cpt('direct'));

  // Pages légales, reconstruites si déjà affichées
  ['legal', 'privacy', 'terms'].forEach(n => {
    const pg = $('page-' + n);
    if (pg && pg.childElementCount) buildLegalPage(n);
  });
  const _prp = $('page-press');
  if (_prp && _prp.childElementCount) buildPressPage();
  const _jrp = $('page-journal');
  if (_jrp && _jrp.childElementCount) buildJournalPage();

  // Search UI
  setText('search-label-txt', t('searchLabel') || 'Search a game or film');
  const sinp = $('search-input');
  if (sinp) sinp.placeholder = t('searchHint') || 'Type a title...';
  // Barre de titre du launcher frameless : aria-labels dans la langue choisie
  if (typeof _refreshTitlebarLabels === 'function') _refreshTitlebarLabels();
  // Messagerie : libellés du bouton header + FAB + page reconstruite dans la langue
  const chatBtn = $('nav-chat-btn');
  if (chatBtn) { chatBtn.title = _chT('navLabel'); chatBtn.setAttribute('aria-label', _chT('navLabel')); }
  setText('nml-chat', _chT('navLabel'));
  const fab = $('glg-chatfab');
  if (fab) { fab.title = _chT('navLabel'); fab.setAttribute('aria-label', _chT('navLabel')); }
  if ($('chat-root')?.childElementCount) buildChatPage();
  applyStudioThemes();
}

/* ══════════════════════════════════════════
   INIT SITE
══════════════════════════════════════════ */
function initSite() {
  window.scrollTo({ top: 0, behavior: 'instant' }); // guarantee top position on every site init
  buildMarquee();
  buildCarousels();
  _buildOdyssey();
  buildAboutPage();
  _buildHomeHero();
  buildLauncherTeaser();
  initNav();
  initScrollProgress();
  initReveal();
  initAnimations();
  initContactEnhancements();
  initAuthUI();
  initA11y();
  initAnimIdleObserver();
  // Initial SEO for the active page (re-runs on each language change via initSite)
  updateSEO(document.querySelector('.nav-link.active')?.dataset.nav || 'home', null);
  _siteBuilt = true; // enables age-gated re-render on auth changes
  // Touch swipe is now built into buildCarousel(), no separate init needed
  // Notify the GSAP animation layer that the site is ready
  document.dispatchEvent(new CustomEvent('glg:site-built'));
}

/* ══════════════════════════════════════════
   PERF, PAUSE DES ANIMATIONS HORS ÉCRAN
   ──────────────────────────────────────────
   Les bandes à motifs (glgDrift), le héro (heroDrift + halo) et le marquee
   tournent en boucle infinie. Hors écran, elles coûtaient du compositing
   pour rien → jank en bas de l'accueil. Un IntersectionObserver pose
   `.glg-anim-idle` (animation-play-state:paused, CSS glg-aaa §56) sur
   toute section signature sortie du viewport. Ré-appelable (idempotent) :
   ré-observer un élément déjà suivi est un no-op, et les éléments injectés
   plus tard (boutique, roadmap) sont couverts par les appels post-build.
══════════════════════════════════════════ */
let _glgIdleIO = null;
function initAnimIdleObserver() {
  if (!('IntersectionObserver' in window)) return;
  if (!_glgIdleIO) {
    _glgIdleIO = new IntersectionObserver(entries => {
      entries.forEach(en => en.target.classList.toggle('glg-anim-idle', !en.isIntersecting));
    }, { rootMargin: '140px 0px' });
  }
  document.querySelectorAll('.hero, .marquee-bar, .glg-band, .glg-pattern, .showcase-section, .puzzle-strips, .works-hero')
    .forEach(el => _glgIdleIO.observe(el));
}

/* ══════════════════════════════════════════
   NAV
══════════════════════════════════════════ */
/* Guard: scroll / observer listeners are registered only once, not on each initSite() call */
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

/* ── Page-transition veil, "fade from black" launcher feel ──────────────
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
  setTimeout(() => { if (_veilEl) { _veilEl.style.opacity = '0'; _veilEl.classList.add('revealing'); } }, 40);
  setTimeout(() => { if (_veilEl) { _veilEl.style.opacity = '0'; _veilEl.classList.remove('revealing'); } }, 650);
}

/* Saut instantané en haut de page, réinitialise Lenis (smooth-scroll) puis le
   scroll natif. Appelé pendant une transition de page (sous le voile = invisible)
   pour qu'on arrive TOUJOURS en haut, quelle que soit la position précédente. */
function _scrollTopInstant() {
  try {
    if (window._lenis && typeof window._lenis.scrollTo === 'function') {
      window._lenis.scrollTo(0, { immediate: true, force: true });
    }
  } catch (e) {}
  window.scrollTo({ top: 0, behavior: 'instant' });
  document.documentElement.scrollTop = 0;
  if (document.body) document.body.scrollTop = 0;
}

function showPage(name, itemId = null) {
  // Quitter la page profil annule le mode "profil public d'un autre joueur"
  if (name !== 'profile') _viewProfileId = null;
  _pageVeilCover();   // hide the swap behind a veil → smooth cross-fade

  // Reset hero-content styles left by scroll/mouse parallax to avoid visual seams
  const prevHeroContent = document.querySelector('.page.active .hero-content');
  if (prevHeroContent) { prevHeroContent.style.opacity = ''; prevHeroContent.style.transform = ''; }

  $$('.page').forEach(p => p.classList.remove('active'));
  $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === name));
  // Toujours repartir du haut de la nouvelle page (sous le voile = invisible).
  // Lenis pilote le scroll : un simple window.scrollTo serait écrasé par sa
  // position interne → on réinitialise Lenis ET le scroll natif (fallback).
  _scrollTopInstant();
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
    /* Build the dedicated settings page on demand */
    if (name === 'settings') buildSettingsPage();
    /* Pages légales, construites à la demande (i18n interne _LEGAL_T) */
    if (name === 'legal' || name === 'privacy' || name === 'terms') buildLegalPage(name);
    if (name === 'press') buildPressPage();
    if (name === 'journal') buildJournalPage();
    /* Build the player's game library on demand (Rockstar/Steam-style) */
    if (name === 'library') buildLibraryPage();
    /* Build the chat (GLG Chat, MP + groupes) on demand */
    if (name === 'chat') buildChatPage();
    /* Launcher : le contact vit sur le SITE WEB (formulaire + réseaux) */
    if (name === 'contact' && IS_TAURI) _contactLauncherCard();
  }

  // Update browser URL without reload.
  // Fiches → ?work=<id> (URL indexable/partageable, honorée au boot) ;
  // autres pages → fragment (pathname explicite pour purger un ?work résiduel).
  const url = itemId
    ? `${location.pathname}?work=${encodeURIComponent(itemId)}`
    : `${location.pathname}#${name}`;
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
   SEO, per-page title / meta / OpenGraph / JSON-LD
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
    title = `${item.title} · ${BASE}`;
    desc  = (getItemField(item, 'tagline') || (getItemField(item, 'description') || [])[0] || '').slice(0, 300);
    url   = `${origin}/?work=${item.id}`; // URL réelle (non-fragment) = indexable + partageable
    image = `${origin}/${item.cover}`;
  } else if (name === 'press') {
    title = `${_pt('title')} · ${BASE}`;
    desc = _pt('intro').slice(0, 200);
  } else if (name === 'journal') {
    title = `${_jt('title')} · ${BASE}`;
    desc = _jt('intro').slice(0, 200);
  } else if (name === 'legal' || name === 'privacy' || name === 'terms') {
    title = `${_lgt(name + 'Title')} · ${BASE}`;
    const el = $('pl-body-' + name);
    desc = (el ? el.textContent : '').replace(/\s+/g, ' ').trim().slice(0, 200);
  } else {
    const navBtn = document.querySelector(`.nav-link[data-nav="${name}"]`);
    const lbl = navBtn ? navBtn.textContent.trim() : '';
    title = lbl ? `${lbl} · ${BASE}` : BASE;
    const descId = { home:'studio-body1', works:'works-desc', about:'about-desc', contact:'contact-desc' }[name];
    desc = (descId && $(descId)?.textContent ? $(descId).textContent : '').replace(/\s+/g, ' ').trim().slice(0, 300);
  }

  document.title = title;
  // Canonical par page : la fiche pointe vers sa propre URL ?work=<id>
  const _canon = document.head.querySelector('link[rel="canonical"]');
  if (_canon) _canon.setAttribute('href', item ? url : `${origin}/`);
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
    data.offers = { '@type': 'Offer', price: promoPrice(item), priceCurrency: 'EUR', availability: 'https://schema.org/PreOrder' };
    const _pr = activePromo(item);
    if (_pr && _pr.until) data.offers.priceValidUntil = _pr.until;
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
    if (state.page === 'settings') buildSettingsPage();
    if (state.page === 'legal' || state.page === 'privacy' || state.page === 'terms') buildLegalPage(state.page);
    if (state.page === 'press') buildPressPage();
    if (state.page === 'journal') buildJournalPage();
    if (state.page === 'library') buildLibraryPage();
    if (state.page === 'works') requestAnimationFrame(buildCarousels);
    _scrollTopInstant();
  }
});

/* ══════════════════════════════════════════
   MARQUEE
══════════════════════════════════════════ */
/* ──────────────────────────────────────────────────────────
   SEAMLESS MARQUEE, measured, gap-proof, constant speed
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
   CAROUSELS, 4 cards always visible, infinite
══════════════════════════════════════════ */
/* Debounce: multiple synchronous calls in the same tick (e.g. from applyTranslations
   + initSite) collapse into a single actual rebuild. */
let _buildCarouselsTimer = null;
/* ══ ACCUEIL « ODYSSEY v3 », LA TRAVERSÉE : spectacle pur ══
   Le v1 « panneaux-réclame » (un écran + bouton Découvrir + prix par œuvre)
   est retiré : place à TROIS ACTES scrubbés au scroll, façon rockstargames.com/VI.
     I.   MANIFESTE, typographie monumentale REMPLIE par les key arts
          (background-clip:text), grain argentique, lettres qui se resserrent.
     II.  LA TRAVERSÉE, la caméra remonte un couloir de cards 3D
          (perspective + translateZ) ; braises <canvas> teintées par l'œuvre
          au premier plan, halo, sweep de lumière, tilt à la souris.
          Les cards se cliquent (fiche) mais AUCUN bouton, AUCUN prix.
     III. FINALE, les braises convergent, le monogramme s'embrase.
          UN seul CTA sur toute la séquence.
   Sans GSAP / mouvement réduit : bascule .od3-static (grille statique). */
const _ODY_T = {
  present:{ fr:'GEEKLEARN GAMES PRÉSENTE', en:'GEEKLEARN GAMES PRESENTS', es:'GEEKLEARN GAMES PRESENTA', de:'GEEKLEARN GAMES PRÄSENTIERT', it:'GEEKLEARN GAMES PRESENTA', ar:'GEEKLEARN GAMES تقدّم', zh:'GEEKLEARN GAMES 呈现', ja:'GEEKLEARN GAMES プレゼンツ', ru:'GEEKLEARN GAMES ПРЕДСТАВЛЯЕТ', pl:'GEEKLEARN GAMES PRZEDSTAWIA' },
  m1: { fr:'QUATRE MONDES', en:'FOUR WORLDS', es:'CUATRO MUNDOS', de:'VIER WELTEN', it:'QUATTRO MONDI', ar:'أربعة عوالم', zh:'四个世界', ja:'四つの世界', ru:'ЧЕТЫРЕ МИРА', pl:'CZTERY ŚWIATY' },
  m2: { fr:'UNE SEULE OBSESSION', en:'ONE OBSESSION', es:'UNA SOLA OBSESIÓN', de:'EINE BESESSENHEIT', it:'UNA SOLA OSSESSIONE', ar:'هوس واحد', zh:'唯一的执念', ja:'ただひとつの執念', ru:'ОДНА ОДЕРЖИМОСТЬ', pl:'JEDNA OBSESJA' },
  msub:{ fr:'Chaque univers est façonné à la main, pixel par pixel, cauchemar par cauchemar.', en:'Every universe is shaped by hand, pixel by pixel, nightmare by nightmare.', es:'Cada universo está moldeado a mano, píxel a píxel, pesadilla a pesadilla.', de:'Jedes Universum ist handgefertigt, Pixel für Pixel, Albtraum für Albtraum.', it:'Ogni universo è plasmato a mano, pixel dopo pixel, incubo dopo incubo.', ar:'كل عالم مصنوع يدويًا، بكسلًا بعد بكسل، وكابوسًا بعد كابوس.', zh:'每个宇宙都由双手打造、一个像素、一个梦魇地雕琢。', ja:'すべての世界は手作業で紡がれる、1ピクセルずつ、悪夢をひとつずつ。', ru:'Каждая вселенная создана вручную, пиксель за пикселем, кошмар за кошмаром.', pl:'Każdy świat tworzymy ręcznie, piksel po pikselu, koszmar po koszmarze.' },
  cross:{ fr:'LA TRAVERSÉE', en:'THE CROSSING', es:'LA TRAVESÍA', de:'DIE ÜBERFAHRT', it:'LA TRAVERSATA', ar:'العبور', zh:'穿越', ja:'横断', ru:'ПЕРЕХОД', pl:'PRZEPRAWA' },
  hint:{ fr:'DÉFILER', en:'SCROLL', es:'DESLIZA', de:'SCROLLEN', it:'SCORRI', ar:'مرِّر', zh:'滚动', ja:'スクロール', ru:'ЛИСТАЙТЕ', pl:'PRZEWIŃ' },
  f1:{ fr:'La traversée ne fait que commencer.', en:'The crossing has only begun.', es:'La travesía apenas comienza.', de:'Die Überfahrt hat gerade erst begonnen.', it:'La traversata è appena iniziata.', ar:'العبور لم يبدأ إلا للتو.', zh:'穿越才刚刚开始。', ja:'横断はまだ始まったばかり。', ru:'Переход только начинается.', pl:'Przeprawa dopiero się zaczyna.' },
  explore:{ fr:'Explorer nos mondes', en:'Explore our worlds', es:'Explora nuestros mundos', de:'Unsere Welten erkunden', it:'Esplora i nostri mondi', ar:'استكشف عوالمنا', zh:'探索我们的世界', ja:'私たちの世界を探索', ru:'Исследовать наши миры', pl:'Poznaj nasze światy' },
};
const _odt = k => (_ODY_T[k] && (_ODY_T[k][LANG] || _ODY_T[k].en)) || '';
let _odyST = [];   // ScrollTriggers de l'Odyssey (tués à chaque rebuild)

/* Braises sur <canvas> : un moteur par scène (voyage, finale). Coût nul
   hors écran, IntersectionObserver + visibilitychange coupent le rAF.
   DPR plafonné à 1.5 : sur un écran 4K on dessine moitié moins de pixels
   sans différence visible sur des points lumineux flous. */
function _od3Engine(canvas, opt) {
  const o = Object.assign({ count: 100 }, opt || {});
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  let W = 2, H = 2, run = false, seen = false, raf = 0, dead = false;
  let tint = [255, 168, 92], target = tint.slice();   // braise chaude par défaut
  let pull = 0, mx = 0, my = 0;
  const P = [];
  const rnd = (a, b) => a + Math.random() * (b - a);
  function spawn(p, anywhere) {
    p.d = rnd(.25, 1);                                 // profondeur → taille/vitesse/alpha
    p.x = rnd(-20, W + 20); p.y = anywhere ? rnd(0, H) : H + rnd(6, 40);
    p.vy = rnd(.14, .55) * p.d; p.vx = rnd(-.09, .09);
    p.s = rnd(.6, 2.4) * p.d; p.tw = rnd(0, 6.283); p.ts = rnd(.01, .035);
  }
  function size() {
    const r = canvas.getBoundingClientRect();
    W = Math.max(2, r.width | 0); H = Math.max(2, r.height | 0);
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  function frame() {
    if (!run || dead) return;
    raf = requestAnimationFrame(frame);
    for (let k = 0; k < 3; k++) tint[k] += (target[k] - tint[k]) * .045;
    const R = tint[0] | 0, G = tint[1] | 0, B = tint[2] | 0;
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    const cx = W / 2, cy = H * .46;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      p.tw += p.ts;
      let x = p.x + mx * 52 * p.d, y = p.y + my * 30 * p.d;
      if (pull > 0) { x += (cx - x) * pull; y += (cy - y) * pull; }
      const a = (.1 + .42 * p.d) * (.55 + .45 * Math.sin(p.tw));
      ctx.fillStyle = 'rgba(' + R + ',' + G + ',' + B + ',' + a.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(x, y, p.s * (1 + pull * .8), 0, 6.2832);
      ctx.fill();
      p.y -= p.vy; p.x += p.vx + Math.sin(p.tw) * .05;
      if (p.y < -30 || p.x < -40 || p.x > W + 40) spawn(p);
    }
  }
  function sync() {
    const want = seen && !document.hidden && !dead;
    if (want && !run) { run = true; size(); frame(); }
    else if (!want && run) { run = false; cancelAnimationFrame(raf); }
  }
  size();                                             // jamais de 1er dessin sur le 300x150 par défaut
  for (let i = 0; i < o.count; i++) { const p = {}; spawn(p, true); P.push(p); }
  const io = new IntersectionObserver(es => { es.forEach(en => { seen = en.isIntersecting; }); sync(); });
  io.observe(canvas);
  const onVis = () => sync(), onRes = () => { if (run) size(); };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('resize', onRes);
  return {
    setTint(rgb) { const m = String(rgb).split(','); if (m.length === 3) target = [+m[0], +m[1], +m[2]]; },
    setPull(v) { pull = Math.max(0, Math.min(.9, v)); },
    setMouse(x, y) { mx = x; my = y; },
    destroy() {
      dead = true; run = false; cancelAnimationFrame(raf); io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('resize', onRes);
    },
  };
}

function _buildOdyssey() {
  const host = document.getElementById('glg-odyssey'); if (!host) return;
  _odyST.forEach(t => { try { t.kill(); } catch (e) {} }); _odyST = [];
  if (window._od3Fx) { window._od3Fx.forEach(fx => { try { fx.destroy(); } catch (e) {} }); window._od3Fx = null; }
  const real = (typeof ALL_WORKS !== 'undefined' ? ALL_WORKS : []).filter(w => !isMatureHidden(w));
  const works = real.concat(_SECRETS.map((sc, i) => ({ id:'', secret:true, title:'', year:'', tint:'#3d3d47', cover:sc.art })));
  host.classList.remove('od3-static');
  if (!works.length) { host.innerHTML = ''; return; }
  const n = works.length;
  host.innerHTML = `
    <div class="od3-manif">
      <div class="od3-pin od3-mpin">
        <p class="od3-kicker">${_odt('present')}</p>
        <h2 class="od3-mask"><span>${escHtml(_odt('m1'))}</span><span>${escHtml(_odt('m2'))}</span></h2>
        <p class="od3-sub">${escHtml(_odt('msub'))}</p>
        <span class="od3-hint">${escHtml(_odt('hint'))}<i aria-hidden="true"></i></span>
        <div class="od3-grain" aria-hidden="true"></div>
      </div>
    </div>
    <div class="od3-voyage" style="height:${n * 60 + 130}vh">
      <div class="od3-pin od3-stage">
        <div class="od3-aura" aria-hidden="true"></div>
        <canvas class="od3-fx" aria-hidden="true"></canvas>
        <p class="od3-kicker od3-ck">${_odt('cross')}</p>
        <div class="od3-world">
          ${works.map(w => w.secret ? `
          <figure class="od3-card od3-card--secret" role="button" tabindex="0" data-whisper="${escHtml(_sct('whisper'))}" onclick="glgSecretWhisper(this)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();glgSecretWhisper(this)}" aria-label="${escHtml(_sct('title'))}" style="--tint:#3d3d47;--tint-rgb:61,61,71">
            <span class="od3-frame"><img src="${av(w.cover)}" alt="" loading="lazy" decoding="async"><span class="od3-sheen" aria-hidden="true"></span></span>
            <figcaption class="od3-cap"><b>${escHtml(_sct('title'))}</b><i>${escHtml(_sct('sub'))}</i></figcaption>
          </figure>` : `
          <figure class="od3-card" data-ody="${w.id}" role="link" tabindex="0" aria-label="${escHtml(w.title)}" style="--tint:${w.tint || '#fff'};--tint-rgb:${hexToRgb(w.tint || '#ffffff') || '255,255,255'}">
            <span class="od3-frame"><img src="${av(w.cover)}" alt="" loading="lazy" decoding="async"><span class="od3-sheen" aria-hidden="true"></span></span>
            <figcaption class="od3-cap"><b>${escHtml(w.title)}</b><i>${getCatLabel(w)} · ${w.year}</i></figcaption>
          </figure>`).join('')}
        </div>
        <span class="od3-count" aria-hidden="true">01 / ${String(n).padStart(2, '0')}</span>
        <div class="od3-vig" aria-hidden="true"></div>
        <div class="od3-grain" aria-hidden="true"></div>
      </div>
    </div>
    <div class="od3-finale">
      <div class="od3-pin od3-fpin">
        <canvas class="od3-fx od3-fx2" aria-hidden="true"></canvas>
        <h2 class="od3-brand"><span>GEEKLEARN</span><span>GAMES</span></h2>
        <p class="od3-sub od3-f1">${escHtml(_odt('f1'))}</p>
        <button class="btn btn-ghost od3-cta" onclick="showPage('works')">${_odt('explore')} <span aria-hidden="true">${_ARR()}</span></button>
        <div class="od3-grain" aria-hidden="true"></div>
      </div>
    </div>`;
  _od3Collage(host.querySelector('.od3-mask'), works);
  _odyWire(host, works);
}

/* Le manifeste est rempli par un collage des 4 premiers key arts. PIÈGE DE
   PERF : mettre les SVG directement en background du clip-text force leur
   re-rasterisation À CHAQUE repaint du texte (gel de ~30s mesuré). On
   compose donc le collage UNE fois dans un canvas hors écran, exporté en
   JPEG data-URI : le repaint du texte redevient trivial. */
function _od3Collage(mask, works) {
  if (!mask) return;
  const srcs = works.slice(0, 4).map(w => av(w.cover));
  if (!srcs.length) return;
  let left = srcs.length;
  const imgs = srcs.map(s => {
    const im = new Image();
    im.onload = im.onerror = () => { if (--left === 0) paint(); };
    im.src = s;
    return im;
  });
  function paint() {
    try {
      const cv = document.createElement('canvas');
      cv.width = 1280; cv.height = 720;
      const cx = cv.getContext('2d'); if (!cx) return;
      cx.fillStyle = '#3b3b44'; cx.fillRect(0, 0, 1280, 720);
      const qw = 640, qh = 360, pos = [[0, 0], [qw, 0], [0, qh], [qw, qh]];
      imgs.forEach((im, i) => {
        if (!im.naturalWidth || !pos[i]) return;
        const sc = Math.max(qw / im.naturalWidth, qh / im.naturalHeight);
        const dw = im.naturalWidth * sc, dh = im.naturalHeight * sc;
        cx.save();
        cx.beginPath(); cx.rect(pos[i][0], pos[i][1], qw, qh); cx.clip();
        cx.drawImage(im, pos[i][0] + (qw - dw) / 2, pos[i][1] + (qh - dh) / 2, dw, dh);
        cx.restore();
      });
      mask.style.backgroundImage = 'url(' + cv.toDataURL('image/jpeg', .82) + ')';
    } catch (e) {}
  }
}

/* Chorégraphie : tout est scrubbé ease:none (collé au doigt/à la molette).
   La timeline du voyage vit en temps ABSOLU : LEAD d'entrée, une card
   toutes les STEP unités (chevauchement volontaire → flux continu). */
function _odyWire(host, works) {
  const gs = window.gsap, ST = window.ScrollTrigger;
  // Les cards restent cliquables (fiche) dans les DEUX modes
  host.querySelectorAll('.od3-card').forEach(card => {
    const go = () => { if (card.dataset.ody) showPage('detail', card.dataset.ody); };
    card.addEventListener('click', go);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
  if (!gs || !ST || document.documentElement.classList.contains('glg-reduce-motion')) {
    host.classList.add('od3-static'); return;
  }
  const q = s => host.querySelector(s);
  const stage = q('.od3-stage'), world = q('.od3-world');
  const cards = Array.from(host.querySelectorAll('.od3-card'));
  const n = cards.length;
  const tints = works.map(w => hexToRgb(w.tint || '#ffffff') || '255,168,92');
  const small = matchMedia('(max-width:760px)').matches;
  const fx1 = _od3Engine(q('.od3-fx'), { count: small ? 44 : 104 });
  const fx2 = _od3Engine(q('.od3-fx2'), { count: small ? 34 : 64 });
  window._od3Fx = [fx1, fx2].filter(Boolean);
  /* : Acte I : manifeste, (opacity/scale UNIQUEMENT : tout tween qui
     repeint le clip-text : letterSpacing, backgroundPosition, gèle la
     frame ; le zoom léger donne déjà l'effet de resserrement) */
  const mpin = q('.od3-mpin'), mask = q('.od3-mask');
  const tl1 = gs.timeline({ scrollTrigger: { trigger: q('.od3-manif'), start: 'top bottom', end: 'bottom top', scrub: .6 } });
  tl1.fromTo(q('.od3-manif .od3-kicker'), { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: .12, ease: 'none' }, .16)
     .fromTo(mask, { opacity: 0, scale: .93 }, { opacity: 1, scale: 1, duration: .3, ease: 'none' }, .18)
     .fromTo(q('.od3-sub'), { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: .14, ease: 'none' }, .32)
     .fromTo(q('.od3-hint'), { opacity: 0 }, { opacity: .75, duration: .1, ease: 'none' }, .42)
     .to(mpin, { opacity: 0, y: -50, duration: .2, ease: 'none' }, .78);
  _odyST.push(tl1.scrollTrigger);

  /* : Acte II : la traversée, */
  const LANES = [
    { x: -24, y: -6, r: -10, fx: -9 }, { x: 24, y: 5, r: 9, fx: 9 },
    { x: -19, y: 7, r: -7, fx: -8 },  { x: 21, y: -7, r: 8, fx: 8 },
  ];
  const STEP = .82, DUR = 1.3, LEAD = .25;
  const D = LEAD + (n - 1) * STEP + DUR;
  const count = q('.od3-count'), ck = q('.od3-ck');
  const pad2 = v => String(v).padStart(2, '0');
  let live = -1;
  const auraCur = tints[0].split(',').map(Number);
  cards.forEach(c => { c.tabIndex = -1; });            // seule la card au 1er plan est tabbable
  const tl2 = gs.timeline({ scrollTrigger: {
    trigger: q('.od3-voyage'), start: 'top top', end: 'bottom bottom', scrub: .5,
    onUpdate(self) {
      const t = self.progress * D;
      const a = Math.max(0, Math.min(n - 1, Math.round((t - LEAD - DUR * .62) / STEP)));
      if (a !== live) {
        live = a;
        count.textContent = pad2(a + 1) + ' / ' + pad2(n);
        for (let j = 0; j < n; j++) { cards[j].classList.toggle('is-live', j === a); cards[j].tabIndex = j === a ? 0 : -1; }
        fx1 && fx1.setTint(tints[a]);
      }
      const tg = tints[live < 0 ? 0 : live].split(',');
      for (let k = 0; k < 3; k++) auraCur[k] += (tg[k] - auraCur[k]) * .14;
      stage.style.setProperty('--live-rgb', (auraCur[0] | 0) + ',' + (auraCur[1] | 0) + ',' + (auraCur[2] | 0));
    },
  } });
  tl2.fromTo([ck, count], { opacity: 0 }, { opacity: 1, duration: .22, ease: 'none' }, 0)
     .to([ck, count], { opacity: 0, duration: .25, ease: 'none' }, D - .3);
  cards.forEach((card, i) => {
    const L = LANES[i % 4], pos = LEAD + i * STEP;
    const cap = card.querySelector('.od3-cap'), sheen = card.querySelector('.od3-sheen');
    gs.set(card, { xPercent: -50, yPercent: -50, x: L.x * 1.3 + 'vw', y: L.y + 'vh', z: -1500, rotationY: L.r * 1.5, opacity: 0, force3D: true, lazy: false });
    tl2.to(card, { keyframes: [
      { x: L.x * 1.3 + 'vw', y: L.y + 'vh', z: -1500, rotationY: L.r * 1.5, opacity: 0, duration: .0001, ease: 'none' },
      { x: L.x * .6 + 'vw', y: L.y * .55 + 'vh', z: -430, rotationY: L.r * .7, opacity: .92, duration: .5499, ease: 'none' },
      { x: L.fx + 'vw', y: '0vh', z: 40, rotationY: L.r * .22, opacity: 1, duration: .45, ease: 'none' },
      { x: (L.fx - L.x * .95) + 'vw', y: (-L.y * .6) + 'vh', z: 780, rotationY: -L.r * .55, opacity: 0, duration: .3, ease: 'none' },
    ] }, pos);
    tl2.fromTo(cap, { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: .16, ease: 'none' }, pos + .58)
       .to(cap, { opacity: 0, duration: .12, ease: 'none' }, pos + .93);
    tl2.fromTo(sheen, { xPercent: -160 }, { xPercent: 160, duration: .32, ease: 'none' }, pos + .6);
  });
  _odyST.push(tl2.scrollTrigger);
  // Tilt 3D à la souris (desktop uniquement) + parallaxe des braises
  if (matchMedia('(pointer:fine)').matches) {
    const qry = gs.quickTo(world, 'rotationY', { duration: .7, ease: 'power2.out' });
    const qrx = gs.quickTo(world, 'rotationX', { duration: .7, ease: 'power2.out' });
    stage.addEventListener('pointermove', e => {
      const r = stage.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - .5, ny = (e.clientY - r.top) / r.height - .5;
      qry(nx * 7); qrx(ny * -5);
      fx1 && fx1.setMouse(nx, ny);
    });
  }

  /* : Acte III : finale, */
  const brand = q('.od3-brand');
  const tl3 = gs.timeline({ scrollTrigger: {
    trigger: q('.od3-finale'), start: 'top bottom', end: 'bottom bottom', scrub: .6,
    onUpdate(self) { fx2 && fx2.setPull(Math.max(0, self.progress - .12) * .62); },
  } });
  tl3.fromTo(brand.children, { yPercent: 72, opacity: 0 }, { yPercent: 0, opacity: 1, stagger: .09, duration: .3, ease: 'none' }, .16)
     .fromTo(brand, { backgroundPosition: '130% 50%' }, { backgroundPosition: '-30% 50%', duration: .5, ease: 'none' }, .3)
     .fromTo(q('.od3-f1'), { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: .15, ease: 'none' }, .48)
     .fromTo(q('.od3-cta'), { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: .15, ease: 'none' }, .6);
  _odyST.push(tl3.scrollTrigger);
  requestAnimationFrame(() => { try { ST.refresh(); } catch (e) {} });
}
// Revenir sur l'accueil → recalage des déclencheurs (la page était display:none)
if (!window._odyPageHook) {
  window._odyPageHook = true;
  document.addEventListener('glg:page-changed', e => {
    if (e.detail && e.detail.name === 'home') requestAnimationFrame(() => { try { window.ScrollTrigger && window.ScrollTrigger.refresh(); } catch (err) {} });
  });
}

function buildCarousels() {
  clearTimeout(_buildCarouselsTimer);
  _buildCarouselsTimer = setTimeout(() => {
    // ── NOS ŒUVRES v2 : un titre en pleine lumière, trois dans l'ombre ──
    const works = filterByAge(typeof ALL_WORKS !== 'undefined' ? ALL_WORKS : []);
    const spot = $('works-spot');
    if (spot) {
      const w = works[0];
      spot.innerHTML = !w ? '' : `
      <section class="wspot reveal" style="--tint:${w.tint || '#fff'};--tint-rgb:${hexToRgb(w.tint || '#ffffff') || '255,255,255'}">
        <div class="wspot-media" role="button" tabindex="0" aria-label="${escHtml(w.title)}"
             onclick="showPage('detail','${w.id}')"
             onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();showPage('detail','${w.id}');}">
          <img src="${av(w.cover)}" alt="${escHtml(w.title)}" decoding="async">
          <span class="wspot-sheen" aria-hidden="true"></span>
        </div>
        <div class="wspot-body">
          <p class="wspot-eye">${_sct('spotEye')} · ${getCatLabel(w)} · ${w.year}</p>
          <h2 class="wspot-title">${escHtml(w.title)}</h2>
          <p class="wspot-tag">${escHtml(getItemField(w, 'tagline') || '')}</p>
          <div class="wspot-cta">
            <button class="btn btn-primary btn-lg" onclick="showPage('detail','${w.id}')">${_sct('cta')} <span aria-hidden="true">${_ARR()}</span></button>
            <button class="c-wish wspot-wish ${wishHas(w.id) ? 'on' : ''}" data-wish="${w.id}" aria-pressed="${wishHas(w.id)}" aria-label="${_wt('add')}" title="${_wt('add')}" onclick="toggleWish('${w.id}',this)">${_HEART_SVG}</button>
          </div>
          <p class="wspot-plat">${w.platformLabel ? w.platformLabel + ' · ' : ''}${t('priceTBA')}</p>
        </div>
      </section>`;
    }
    const se = $('wsec-eye'), sh = $('wsec-title');
    if (se) se.textContent = _sct('eye');
    if (sh) sh.textContent = _sct('head');
    const sg = $('secret-grid');
    if (sg) sg.innerHTML = _SECRETS.map((sc, i) => _secretCardHTML(i)).join('');
  }, 0);
}

/* ══ PROJETS SECRETS ═════════════════════════════════════════════════════
   Trois chantiers réels, volontairement non annoncés : pas de nom, pas de
   fiche, pas de date, seulement la preuve qu'on travaille. Les visuels ne
   montrent rien : c'est leur fonction. Partagés par Nos Œuvres, l'odyssée
   de l'accueil et la feuille de route. ══ */
const _SECRETS = [
  { art:'assets/img/works/secret/secret-1.svg' },
  { art:'assets/img/works/secret/secret-2.svg' },
  { art:'assets/img/works/secret/secret-3.svg' },
];
const _SECRET_T = {
  title:  { fr:'PROJET SECRET', en:'SECRET PROJECT', es:'PROYECTO SECRETO', de:'GEHEIMPROJEKT', it:'PROGETTO SEGRETO', ar:'مشروع سرّي', zh:'秘密企划', ja:'シークレットプロジェクト', ru:'СЕКРЕТНЫЙ ПРОЕКТ', pl:'TAJNY PROJEKT' },
  sub:    { fr:'Annonce à venir', en:'Announcement to come', es:'Anuncio próximamente', de:'Ankündigung folgt', it:'Annuncio in arrivo', ar:'الإعلان لاحقاً', zh:'待正式公布', ja:'発表をお待ちください', ru:'Анонс впереди', pl:'Zapowiedź wkrótce' },
  eye:    { fr:'Ce qui vient', en:'What comes next', es:'Lo que viene', de:'Was als Nächstes kommt', it:'Ciò che arriva', ar:'ما هو قادم', zh:'接下来', ja:'この先にあるもの', ru:'Что дальше', pl:'Co dalej' },
  head:   { fr:'DANS L’OMBRE', en:'IN THE DARK', es:'EN LA SOMBRA', de:'IM SCHATTEN', it:'NELL’OMBRA', ar:'في الظل', zh:'暗处', ja:'影の中', ru:'В ТЕНИ', pl:'W CIENIU' },
  spotEye:{ fr:'Titre annoncé', en:'Announced title', es:'Título anunciado', de:'Angekündigter Titel', it:'Titolo annunciato', ar:'عنوان معلن', zh:'已公布作品', ja:'発表済みタイトル', ru:'Анонсированный проект', pl:'Zapowiedziany tytuł' },
  cta:    { fr:'Découvrir', en:'Discover', es:'Descubrir', de:'Entdecken', it:'Scopri', ar:'اكتشف', zh:'了解详情', ja:'詳しく見る', ru:'Узнать больше', pl:'Odkryj' },
  whisper:{ fr:'Scellé jusqu’à l’annonce', en:'Sealed until the reveal', es:'Sellado hasta el anuncio', de:'Versiegelt bis zur Ankündigung', it:'Sigillato fino all’annuncio', ar:'مختوم حتى الإعلان', zh:'公布前保密', ja:'発表まで封印', ru:'Запечатано до анонса', pl:'Zapieczętowane do zapowiedzi' },
};
const _sct = k => (_SECRET_T[k] && (_SECRET_T[k][LANG] || _SECRET_T[k].en)) || '';

function _secretCardHTML(i) {
  const sc = _SECRETS[i];
  return `
    <div class="sec-card reveal" style="transition-delay:${i * .07}s" role="button" tabindex="0" data-whisper="${_sct('whisper')}" onclick="glgSecretWhisper(this)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();glgSecretWhisper(this)}" aria-label="${_sct('title')}, ${_sct('sub')}">
      <img src="${av(sc.art)}" alt="" loading="lazy" decoding="async">
      <span class="sec-veil" aria-hidden="true"></span>
      <span class="sec-body">
        <b>${_sct('title')}</b>
        <i>${_sct('sub')}</i>
      </span>
      <span class="sec-seal" aria-hidden="true">${typeof _LOCK_SVG !== 'undefined' ? _LOCK_SVG : ''}</span>
    </div>`;
}

/* ══════════════════════════════════════════
   BIBLIOTHÈQUE (façon Rockstar/Steam), jeux possédés du joueur
   Données : profiles.library [{id,platform,at}] (RPC grant_game à l'achat).
   JOUER / INSTALLER → hand-off vers le launcher via le protocole glg://
   (même mécanique que steam://) ; le launcher confirme l'action chez lui.
══════════════════════════════════════════ */
const _LIB_T = {
  navLabel:   { fr:'Bibliothèque', en:'Library', es:'Biblioteca', de:'Bibliothek', it:'Libreria', ar:'المكتبة', zh:'游戏库', ja:'ライブラリ', ru:'Библиотека', pl:'Biblioteka' },
  inLib:      { fr:'Dans ta bibliothèque', en:'In your library', es:'En tu biblioteca', de:'In deiner Bibliothek', it:'Nella tua libreria', ar:'في مكتبتك', zh:'已在你的游戏库中', ja:'ライブラリに追加済み', ru:'В вашей библиотеке', pl:'W twojej bibliotece' },
  eyebrow:    { fr:'Ma bibliothèque', en:'My library', es:'Mi biblioteca', de:'Meine Bibliothek', it:'La mia libreria', ar:'مكتبتي', zh:'我的游戏库', ja:'マイライブラリ', ru:'Моя библиотека', pl:'Moja biblioteka' },
  play:       { fr:'Jouer', en:'Play', es:'Jugar', de:'Spielen', it:'Gioca', ar:'العب', zh:'开始游戏', ja:'プレイ', ru:'Играть', pl:'Graj' },
  install:    { fr:'Installer', en:'Install', es:'Instalar', de:'Installieren', it:'Installa', ar:'تثبيت', zh:'安装', ja:'インストール', ru:'Установить', pl:'Zainstaluj' },
  signedOut:  { fr:'Connecte-toi pour retrouver tous les jeux que tu possèdes, prêts à installer et à lancer.', en:'Sign in to find every game you own, ready to install and launch.', es:'Inicia sesión para encontrar todos los juegos que posees, listos para instalar y jugar.', de:'Melde dich an, um alle deine Spiele zu finden, bereit zum Installieren und Starten.', it:'Accedi per ritrovare tutti i giochi che possiedi, pronti da installare e avviare.', ar:'سجّل الدخول لتجد كل ألعابك جاهزة للتثبيت والتشغيل.', zh:'登录后即可找到你拥有的所有游戏，随时安装与启动。', ja:'サインインすると、所有しているすべてのゲームをインストール・起動できます。', ru:'Войдите, чтобы увидеть все ваши игры, готовые к установке и запуску.', pl:'Zaloguj się, aby zobaczyć wszystkie posiadane gry, gotowe do instalacji i uruchomienia.' },
  empty:      { fr:'Aucun jeu pour le moment', en:'No games yet', es:'Aún no hay juegos', de:'Noch keine Spiele', it:'Ancora nessun gioco', ar:'لا ألعاب بعد', zh:'暂无游戏', ja:'まだゲームがありません', ru:'Пока нет игр', pl:'Brak gier' },
  emptyNote:  { fr:'Tes achats GEEKLEARN GAMES apparaîtront ici, prêts à installer.', en:'Your GEEKLEARN GAMES purchases will appear here, ready to install.', es:'Tus compras de GEEKLEARN GAMES aparecerán aquí, listas para instalar.', de:'Deine GEEKLEARN-GAMES-Käufe erscheinen hier, bereit zur Installation.', it:'I tuoi acquisti GEEKLEARN GAMES appariranno qui, pronti da installare.', ar:'ستظهر هنا مشترياتك من GEEKLEARN GAMES جاهزة للتثبيت.', zh:'你在 GEEKLEARN GAMES 的购买内容会显示在这里，随时可以安装。', ja:'GEEKLEARN GAMESでの購入タイトルが、ここにインストール可能な状態で表示されます。', ru:'Ваши покупки в GEEKLEARN GAMES появятся здесь, готовые к установке.', pl:'Twoje zakupy w GEEKLEARN GAMES pojawią się tutaj, gotowe do instalacji.' },
  browse:     { fr:'Parcourir Nos Œuvres', en:'Browse Our Works', es:'Ver Nuestras Obras', de:'Unsere Werke ansehen', it:'Sfoglia le Opere', ar:'تصفّح أعمالنا', zh:'浏览我们的作品', ja:'作品一覧を見る', ru:'К нашим работам', pl:'Przeglądaj Nasze Dzieła' },
  ownedOn:    { fr:'Possédé sur %s', en:'Owned on %s', es:'En propiedad en %s', de:'Im Besitz auf %s', it:'Posseduto su %s', ar:'مملوك على %s', zh:'拥有于%s', ja:'%sで所有', ru:'Куплено в %s', pl:'Posiadane na %s' },
  since:      { fr:'Ajouté le %s', en:'Added %s', es:'Añadido el %s', de:'Hinzugefügt am %s', it:'Aggiunto il %s', ar:'أُضيف في %s', zh:'添加于%s', ja:'%sに追加', ru:'Добавлено %s', pl:'Dodano %s' },
  handoffPlayT:{ fr:'Ouvrir le launcher pour jouer ?', en:'Open the launcher to play?', es:'¿Abrir el launcher para jugar?', de:'Launcher zum Spielen öffnen?', it:'Aprire il launcher per giocare?', ar:'فتح المشغّل للعب؟', zh:'打开启动器开始游戏？', ja:'ランチャーを開いてプレイしますか？', ru:'Открыть лаунчер, чтобы играть?', pl:'Otworzyć launcher, aby zagrać?' },
  handoffInstT:{ fr:'Ouvrir le launcher pour installer ?', en:'Open the launcher to install?', es:'¿Abrir el launcher para instalar?', de:'Launcher zum Installieren öffnen?', it:'Aprire il launcher per installare?', ar:'فتح المشغّل للتثبيت؟', zh:'打开启动器进行安装？', ja:'ランチャーを開いてインストールしますか？', ru:'Открыть лаунчер для установки?', pl:'Otworzyć launcher, aby zainstalować?' },
  handoffBody: { fr:'%s va s’ouvrir dans le launcher GEEKLEARN GAMES, tu confirmeras l’action là-bas.', en:'%s will open in the GEEKLEARN GAMES launcher, you’ll confirm the action there.', es:'%s se abrirá en el launcher de GEEKLEARN GAMES, confirmarás la acción allí.', de:'%s öffnet sich im GEEKLEARN-GAMES-Launcher, dort bestätigst du die Aktion.', it:'%s si aprirà nel launcher GEEKLEARN GAMES, confermerai l’azione lì.', ar:'سيُفتح %s في مشغّل GEEKLEARN GAMES, وستؤكد الإجراء هناك.', zh:'%s 将在 GEEKLEARN GAMES 启动器中打开、你将在那里确认操作。', ja:'%sはGEEKLEARN GAMESランチャーで開きます、操作はそこで確認します。', ru:'%s откроется в лаунчере GEEKLEARN GAMES, действие вы подтвердите там.', pl:'%s otworzy się w launcherze GEEKLEARN GAMES, tam potwierdzisz działanie.' },
  open:       { fr:'Ouvrir le launcher', en:'Open launcher', es:'Abrir el launcher', de:'Launcher öffnen', it:'Apri il launcher', ar:'فتح المشغّل', zh:'打开启动器', ja:'ランチャーを開く', ru:'Открыть лаунчер', pl:'Otwórz launcher' },
  missT:      { fr:'Launcher introuvable', en:'Launcher not found', es:'Launcher no encontrado', de:'Launcher nicht gefunden', it:'Launcher non trovato', ar:'المشغّل غير موجود', zh:'未找到启动器', ja:'ランチャーが見つかりません', ru:'Лаунчер не найден', pl:'Nie znaleziono launchera' },
  missNote:   { fr:'Le launcher GEEKLEARN GAMES n’est pas encore installé sur cette machine. Il arrive très bientôt en téléchargement, tes jeux restent liés à ton compte, rien n’est perdu.', en:'The GEEKLEARN GAMES launcher isn’t installed on this machine yet. It’s coming very soon, your games stay tied to your account, nothing is lost.', es:'El launcher de GEEKLEARN GAMES aún no está instalado en este equipo. Llegará muy pronto, tus juegos permanecen vinculados a tu cuenta.', de:'Der GEEKLEARN-GAMES-Launcher ist auf diesem Rechner noch nicht installiert. Er kommt sehr bald, deine Spiele bleiben mit deinem Konto verknüpft.', it:'Il launcher GEEKLEARN GAMES non è ancora installato su questa macchina. Arriverà molto presto, i tuoi giochi restano legati al tuo account.', ar:'مشغّل GEEKLEARN GAMES غير مثبّت على هذا الجهاز بعد. سيتوفر قريباً جداً، تبقى ألعابك مرتبطة بحسابك.', zh:'这台设备尚未安装 GEEKLEARN GAMES 启动器。它很快就会推出、你的游戏始终绑定在你的账户上。', ja:'このマシンにはGEEKLEARN GAMESランチャーがまだインストールされていません。まもなく登場します、ゲームはアカウントに紐づいたままです。', ru:'Лаунчер GEEKLEARN GAMES ещё не установлен на этом компьютере. Он скоро выйдет, ваши игры остаются привязанными к аккаунту.', pl:'Launcher GEEKLEARN GAMES nie jest jeszcze zainstalowany na tym komputerze. Pojawi się już wkrótce, twoje gry pozostają przypisane do konta.' },
  ok:         { fr:'Compris', en:'Got it', es:'Entendido', de:'Verstanden', it:'Capito', ar:'فهمت', zh:'知道了', ja:'了解', ru:'Понятно', pl:'Rozumiem' },
  colFavs:    { fr:'Favoris', en:'Favorites', es:'Favoritos', de:'Favoriten', it:'Preferiti', ar:'المفضلة', zh:'收藏', ja:'お気に入り', ru:'Избранное', pl:'Ulubione' },
  colGames:   { fr:'Jeux vidéo', en:'Video games', es:'Videojuegos', de:'Videospiele', it:'Videogiochi', ar:'ألعاب الفيديو', zh:'电子游戏', ja:'ゲーム', ru:'Видеоигры', pl:'Gry wideo' },
  colFilms:   { fr:'Films interactifs', en:'Interactive films', es:'Películas interactivas', de:'Interaktive Filme', it:'Film interattivi', ar:'أفلام تفاعلية', zh:'互动电影', ja:'インタラクティブ映画', ru:'Интерактивные фильмы', pl:'Filmy interaktywne' },
  favAdd:     { fr:'Ajouter aux favoris', en:'Add to favorites', es:'Añadir a favoritos', de:'Zu Favoriten hinzufügen', it:'Aggiungi ai preferiti', ar:'أضف إلى المفضلة', zh:'加入收藏', ja:'お気に入りに追加', ru:'В избранное', pl:'Dodaj do ulubionych' },
  favDel:     { fr:'Retirer des favoris', en:'Remove from favorites', es:'Quitar de favoritos', de:'Aus Favoriten entfernen', it:'Rimuovi dai preferiti', ar:'أزل من المفضلة', zh:'移出收藏', ja:'お気に入りから削除', ru:'Убрать из избранного', pl:'Usuń z ulubionych' },
  installing: { fr:'Installation…', en:'Installing…', es:'Instalando…', de:'Wird installiert…', it:'Installazione…', ar:'جارٍ التثبيت…', zh:'安装中…', ja:'インストール中…', ru:'Установка…', pl:'Instalowanie…' },
  uninstall:  { fr:'Désinstaller', en:'Uninstall', es:'Desinstalar', de:'Deinstallieren', it:'Disinstalla', ar:'إلغاء التثبيت', zh:'卸载', ja:'アンインストール', ru:'Удалить', pl:'Odinstaluj' },
  uninstallQ: { fr:'Désinstaller %s de cette machine ?', en:'Uninstall %s from this machine?', es:'¿Desinstalar %s de este equipo?', de:'%s von diesem Rechner deinstallieren?', it:'Disinstallare %s da questa macchina?', ar:'إلغاء تثبيت %s من هذا الجهاز؟', zh:'从这台设备卸载 %s？', ja:'%s をこのマシンからアンインストールしますか？', ru:'Удалить %s с этого компьютера?', pl:'Odinstalować %s z tego komputera?' },
  installedOk:{ fr:'Installation terminée', en:'Install complete', es:'Instalación completada', de:'Installation abgeschlossen', it:'Installazione completata', ar:'اكتمل التثبيت', zh:'安装完成', ja:'インストール完了', ru:'Установка завершена', pl:'Instalacja zakończona' },
};
const _lbt = k => (_LIB_T[k] && (_LIB_T[k][LANG] || _LIB_T[k].en)) || '';
/* Flèche directionnelle : « → » pointe EN ARRIÈRE en RTL (arabe), miroir. */
const _ARR = () => (LANG === 'ar' ? '←' : '→');
const _ARIA_T = {
  prev: { fr:'Précédent', en:'Previous', es:'Anterior', de:'Zurück', it:'Precedente', ar:'السابق', zh:'上一张', ja:'前へ', ru:'Назад', pl:'Poprzedni' },
  next: { fr:'Suivant', en:'Next', es:'Siguiente', de:'Weiter', it:'Successivo', ar:'التالي', zh:'下一张', ja:'次へ', ru:'Далее', pl:'Następny' },
};
const _ariaT = k => (_ARIA_T[k] && (_ARIA_T[k][LANG] || _ARIA_T[k].en)) || k;
const _LIB_PLAT_NAME = pid => (pid === 'glg' || !pid) ? 'GEEKLEARN GAMES' : ((typeof PLATS !== 'undefined' && PLATS[pid] && PLATS[pid].name) || pid);

/* ── « EXCLUSIF AU LAUNCHER » (site web) ────────────────────────────────
   Le web ne présente plus la bibliothèque : la route #library y devient
   une page d'invitation à installer l'application de bureau. */
const _LIBX_T = {
  eyebrow: { fr:'Exclusivité launcher', en:'Launcher exclusive', es:'Exclusivo del launcher', de:'Exklusiv im Launcher', it:'Esclusiva del launcher', ar:'حصري للمشغّل', zh:'启动器专属', ja:'ランチャー限定', ru:'Эксклюзив лаунчера', pl:'Ekskluzywne dla launchera' },
  title:   { fr:'TA BIBLIOTHÈQUE VIT DANS LE LAUNCHER', en:'YOUR LIBRARY LIVES IN THE LAUNCHER', es:'TU BIBLIOTECA VIVE EN EL LAUNCHER', de:'DEINE BIBLIOTHEK LEBT IM LAUNCHER', it:'LA TUA LIBRERIA VIVE NEL LAUNCHER', ar:'مكتبتك تعيش في المشغّل', zh:'你的游戏库安家于启动器', ja:'ライブラリはランチャーの中に', ru:'ТВОЯ БИБЛИОТЕКА ЖИВЁТ В ЛАУНЧЕРЕ', pl:'TWOJA BIBLIOTEKA ŻYJE W LAUNCHERZE' },
  sub:     { fr:'Jeux possédés, succès, actualités, DLC, contacts qui y jouent, l’expérience bibliothèque complète est réservée à l’application de bureau. Le site est la vitrine ; le launcher, ta salle de jeux.', en:'Owned games, achievements, news, DLC, friends who play, the full library experience is exclusive to the desktop app. The site is the showcase; the launcher is your game room.', es:'Juegos, logros, noticias, DLC, contactos que juegan, la experiencia completa de la biblioteca es exclusiva de la aplicación de escritorio. El sitio es el escaparate; el launcher, tu sala de juegos.', de:'Spiele, Erfolge, News, DLC, Freunde, die spielen, das volle Bibliothekserlebnis gibt es nur in der Desktop-App. Die Website ist das Schaufenster; der Launcher dein Spielzimmer.', it:'Giochi, obiettivi, notizie, DLC, amici che giocano, l\'esperienza completa della libreria è esclusiva dell\'app desktop. Il sito è la vetrina; il launcher, la tua sala giochi.', ar:'الألعاب والإنجازات والأخبار والمحتوى الإضافي والأصدقاء، تجربة المكتبة الكاملة حصرية لتطبيق سطح المكتب. الموقع واجهة العرض؛ والمشغّل غرفة ألعابك.', zh:'拥有的游戏、成就、新闻、DLC, 在玩的好友、完整的游戏库体验为桌面应用独享。网站是橱窗，启动器才是你的游戏室。', ja:'所有ゲーム、実績、ニュース、DLC, プレイ中のフレンド、ライブラリの完全体験はデスクトップアプリ限定。サイトはショーケース、ランチャーはあなたのゲームルーム。', ru:'Игры, достижения, новости, DLC, друзья в игре, полная библиотека доступна только в настольном приложении. Сайт, витрина; лаунчер, твоя игровая.', pl:'Posiadane gry, osiągnięcia, aktualności, DLC, grający znajomi, pełna biblioteka jest dostępna wyłącznie w aplikacji desktopowej. Strona to witryna; launcher to twój pokój gier.' },
  cta:     { fr:'Télécharger le launcher', en:'Download the launcher', es:'Descargar el launcher', de:'Launcher herunterladen', it:'Scarica il launcher', ar:'حمّل المشغّل', zh:'下载启动器', ja:'ランチャーをダウンロード', ru:'Скачать лаунчер', pl:'Pobierz launcher' },
  hint:    { fr:'Déjà installé ? Ouvre l’application GEEKLEARN GAMES sur ton bureau, ta bibliothèque t’y attend.', en:'Already installed? Open the GEEKLEARN GAMES app on your desktop, your library is waiting.', es:'¿Ya está instalado? Abre la aplicación GEEKLEARN GAMES en tu escritorio, tu biblioteca te espera.', de:'Schon installiert? Öffne die GEEKLEARN-GAMES-App auf deinem Desktop, deine Bibliothek wartet.', it:'Già installato? Apri l\'app GEEKLEARN GAMES sul desktop, la tua libreria ti aspetta.', ar:'مثبّت بالفعل؟ افتح تطبيق GEEKLEARN GAMES على سطح المكتب، مكتبتك بانتظارك.', zh:'已经安装？在桌面上打开 GEEKLEARN GAMES 应用、你的游戏库正在等你。', ja:'インストール済み？デスクトップのGEEKLEARN GAMESアプリを開こう、ライブラリが待っています。', ru:'Уже установлен? Открой приложение GEEKLEARN GAMES на рабочем столе, библиотека ждёт.', pl:'Już zainstalowany? Otwórz aplikację GEEKLEARN GAMES na pulpicie, twoja biblioteka czeka.' },
};
const _lxt = k => (_LIBX_T[k] && (_LIBX_T[k][LANG] || _LIBX_T[k].en)) || '';

let _libSelected = null;

/* Le FONDATEUR certifié (VERIFIED_USERS) possède l'intégralité du catalogue :
   il est l'auteur des œuvres, sa bibliothèque affiche donc tout (dotation
   virtuelle côté client ; les joueurs réels restent servis par la base). */
function _isFounderAccount() {
  return !!(_accountProfile && typeof _isVerified === 'function' && _isVerified(_accountProfile.username));
}

/* Possession d'une œuvre (bibliothèque du profil), synchrone, utilisable par buildDetail. */
function _ownsWork(id) {
  if (_isFounderAccount()) return true;
  const lib = _accountProfile && _accountProfile.library;
  return Array.isArray(lib) && lib.some(e => e && e.id === id);
}

async function buildLibraryPage() {
  const root = $('library-root');
  if (!root) return;

  /* ── SITE WEB : la bibliothèque est une EXCLUSIVITÉ du launcher ──
     Pas de rail, pas de vitrine, une invitation cinématique à installer
     l'application de bureau (fenêtre stylisée §64 réutilisée). */
  if (!IS_TAURI) {
    const os = _dlOS();
    const P = LAUNCHER_DL.platforms;
    const priKey = (os === 'mac' || os === 'linux') && P[os] && P[os].length ? os : 'win';
    const pri = P[priKey][0];
    const priOS = priKey === 'mac' ? 'macOS' : priKey === 'linux' ? 'Linux' : 'Windows';
    root.innerHTML = `
    <section class="libx glg-pattern">
      <div class="glg-pattern-bg glg-pat-subtle" style="--glg-speed:80s"></div>
      <div class="libx-inner">
        <div class="libx-copy reveal">
          <p class="section-eye">${_lxt('eyebrow')}</p>
          <h1 class="libx-title">${_lxt('title')}</h1>
          <p class="libx-sub">${_lxt('sub')}</p>
          <div class="libx-chips">
            <span class="libx-chip">${_tt('section')}</span>
            <span class="libx-chip">${_NEWS_T.head[LANG] || _NEWS_T.head.en}</span>
            <span class="libx-chip">DLC</span>
            <span class="libx-chip">${_ft('title')}</span>
          </div>
          <div class="libx-actions">
            <a class="btn btn-primary btn-lg" href="${pri.u}" ${pri.u.indexOf('http') !== 0 ? 'download' : ''}>${_lxt('cta')}, ${priOS}</a>
            <a class="btn btn-outline btn-lg" href="${LAUNCHER_DL.all}" target="_blank" rel="noopener">${_lnt('allVer')}</a>
          </div>
          <p class="libx-hint">${_lxt('hint')}</p>
        </div>
        <div class="libx-visual reveal" aria-hidden="true">
          <div class="lt-window">
            <div class="lt-window-bar"><span></span><span></span><span></span></div>
            <div class="lt-window-body">
              <div class="lt-w-rail">
                <span class="lt-w-logo"><img src="assets/img/brand/glg-mark.png" alt="" onerror="this.style.display='none'"></span>
                <span class="lt-w-line" style="width:72%"></span>
                <span class="lt-w-line" style="width:58%"></span>
                <span class="lt-w-line lt-w-line--on" style="width:80%"></span>
                <span class="lt-w-line" style="width:64%"></span>
                <span class="lt-w-line" style="width:70%"></span>
              </div>
              <div class="lt-w-stage">
                <span class="lt-w-title"></span>
                <span class="lt-w-sub"></span>
                <span class="lt-w-btn">▶</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>`;
    setTimeout(initReveal, 60);
    initAnimIdleObserver();
    return;
  }

  const configured = !!window.GLG_AUTH?.isConfigured?.();
  const user = configured ? await GLG_AUTH.getUser() : null;

  if (!user) {
    root.innerHTML = `
      <section class="pp-signed-out"><div class="pp-so-inner reveal">
        <div class="pp-so-badge">${_ACCOUNT_ICON}</div>
        <h1 class="pp-so-title">${_lbt('navLabel')}</h1>
        <p class="pp-so-desc">${_lbt('signedOut')}</p>
        <div class="pp-so-actions">
          <button class="btn btn-primary" onclick="openAuthModal('login')">${_ppt('signIn')}</button>
          <button class="btn btn-outline" onclick="openAuthModal('signup')">${_ppt('createAcc')}</button>
        </div>
      </div></section>`;
    setTimeout(initReveal, 60);
    return;
  }

  const p = (await GLG_AUTH.getProfile()) || {};
  let entries = Array.isArray(p.library) ? p.library.slice() : [];
  // Fondateur certifié → catalogue complet (les entrées réelles gardent
  // leur plateforme/date ; les manquantes sont dotées virtuellement).
  if (typeof _isVerified === 'function' && _isVerified(p.username)) {
    const have = new Set(entries.map(e => e && e.id));
    ALL_WORKS.forEach(w => {
      if (!have.has(w.id)) entries.push({ id: w.id, platform: 'glg', at: p.created_at || null });
    });
  }
  const lib = entries
    .map(e => ({ e, w: ALL_WORKS.find(w => w.id === e.id) }))
    .filter(x => x.w && !isMatureHidden(x.w));

  if (!lib.length) {
    root.innerHTML = `
      <section class="pp-signed-out"><div class="pp-so-inner reveal">
        <div class="pp-so-badge">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5.5h16v13H4z" stroke="currentColor" stroke-width="1.4"/><path d="M4 9h16M8 5.5V9" stroke="currentColor" stroke-width="1.4"/><path d="M9.5 13.5l2 2 3.5-3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <h1 class="pp-so-title">${_lbt('empty')}</h1>
        <p class="pp-so-desc">${_lbt('emptyNote')}</p>
        <div class="pp-so-actions">
          <button class="btn btn-primary" onclick="showPage('works')">${_lbt('browse')}</button>
        </div>
      </div></section>`;
    setTimeout(initReveal, 60);
    return;
  }

  if (!_libSelected || !lib.some(x => x.w.id === _libSelected)) _libSelected = lib[0].w.id;
  const recent = Array.isArray(p.recent_games) ? p.recent_games : [];

  // Succès réels du joueur, alimente la section « Succès » de chaque vitrine
  if (configured) { try { const r = await GLG_AUTH.getAchievements(); _achKeys = new Set(r.keys || []); } catch (e) {} }

  _applyPrefs(_userPrefs || p.prefs);   // LOCAL d'abord : un fetch en retard n'écrase jamais un réglage frais
  _libData = { lib, recent };   // partagé avec le toggle favori + install (maj in-place)

  root.innerHTML = `
    <div class="lib-shell lib-shell--zen">
      <aside class="lib-rail" aria-label="${_lbt('eyebrow')}">
        <div class="lib-rail-head">
          <span>${_lbt('eyebrow')}</span>
          <span class="lib-count">${lib.length}</span>
        </div>
        <div class="lib-rail-list">${_libRailListHTML()}</div>
      </aside>
      <div class="lib-stage" id="lib-stage">${_libStageHTML(lib.find(x => x.w.id === _libSelected), recent)}</div>
    </div>`;

  _libWireRail(root);
  setTimeout(() => $('lib-stage')?.classList.add('lib-stage--in'), 30);
  _libFillFriendsPlayed(_libSelected);
  _libFillMyReview(_libSelected);
}

/* ── Rail : collections façon Steam, Favoris (prefs.favs) puis,
   OBLIGATOIREMENT, Jeux vidéo et Films interactifs (une œuvre favorite
   apparaît dans les deux). Rendu par helper : le toggle favori ne re-rend
   QUE cette liste (jamais la page entière). ── */
let _libData = { lib: [], recent: [] };
const _LIB_STAR = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 1.8 9.9 5.9l4.4.5-3.3 3 .9 4.4L8 11.5 4.1 13.8l.9-4.4-3.3-3 4.4-.5Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>';
function _libRailListHTML() {
  const lib = _libData.lib;
  const favSet = new Set((_userPrefs && _userPrefs.favs) || []);
  const railItem = x => `
          <button class="lib-item ${x.w.id === _libSelected ? 'active' : ''}" data-lib="${x.w.id}" aria-current="${x.w.id === _libSelected ? 'true' : 'false'}">
            <span class="lib-item-cover"><img src="${av(x.w.cover)}" alt="" loading="lazy" decoding="async"></span>
            <span class="lib-item-name">${x.w.title}</span>
            <span class="lib-item-fav ${favSet.has(x.w.id) ? 'on' : ''}" data-fav="${x.w.id}" role="button" tabindex="0"
              aria-label="${favSet.has(x.w.id) ? _lbt('favDel') : _lbt('favAdd')}" title="${favSet.has(x.w.id) ? _lbt('favDel') : _lbt('favAdd')}">${_LIB_STAR}</span>
          </button>`;
  const favList = lib.filter(x => favSet.has(x.w.id));
  const games   = lib.filter(x => x.w.type !== 'film');
  const films   = lib.filter(x => x.w.type === 'film');
  const groups  = [];
  if (favList.length) groups.push(['colFavs', favList]);
  if (games.length)   groups.push(['colGames', games]);
  if (films.length)   groups.push(['colFilms', films]);
  return groups.map(([key, arr]) => `
          <div class="lib-col">
            <div class="lib-col-head lib-col-head--btn" data-col="${key}" role="button" tabindex="0" title="${_lbt(key)}">${key === 'colFavs' ? `<span class="lib-col-star">${_LIB_STAR}</span>` : ''}<span>${_lbt(key)}</span><span class="lib-col-n">${arr.length}</span></div>
            ${arr.map(railItem).join('')}
          </div>`).join('');
}

/* Câblage du rail (étoiles + sélection), rappelé après chaque re-rendu. */
function _libWireRail(root) {
  root = root || $('page-library'); if (!root) return;

  // En-têtes de collections → GRILLE de la collection (façon Steam)
  root.querySelectorAll('[data-col]').forEach(h => {
    const open = ev => { ev.stopPropagation(); _libShowCollection(h.dataset.col); };
    h.addEventListener('click', open);
    h.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') open(ev); });
  });

  // Étoiles favoris : toggle in-place (les collections se regroupent)
  root.querySelectorAll('[data-fav]').forEach(s => {
    const toggle = ev => { ev.stopPropagation(); ev.preventDefault(); _libToggleFav(s.dataset.fav); };
    s.addEventListener('click', toggle);
    s.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') toggle(ev); });
  });

  root.querySelectorAll('[data-lib]').forEach(b => b.addEventListener('click', () => {
    _libSelected = b.dataset.lib;
    // Sélection via la liste → le rail se rétracte en douceur : la vitrine
    // (bannière, logo, boutons) occupe quasi tout l'écran. Survoler le rail
    // le ré-étend temporairement (§69, :has).
    root.querySelector('.lib-shell')?.classList.add('lib-shell--zen');
    root.querySelectorAll('[data-lib]').forEach(x => { x.classList.toggle('active', x.dataset.lib === b.dataset.lib); x.setAttribute('aria-current', x.dataset.lib === b.dataset.lib ? 'true' : 'false'); });
    const stage = $('lib-stage');
    if (stage) {
      stage.classList.remove('lib-stage--in');
      stage.innerHTML = _libStageHTML(_libData.lib.find(x => x.w.id === _libSelected), _libData.recent);
      _scrollTopInstant();          // repartir en haut de la nouvelle vitrine
      _libFillFriendsPlayed(_libSelected);
      _libFillMyReview(_libSelected);
      setTimeout(() => stage.classList.add('lib-stage--in'), 20); // setTimeout, pas rAF (onglet caché)
    }
  }));
}

/* ══════════════════════════════════════════
   BIBLIOTHÈQUE, SECTIONS FAÇON STEAM sous le héro de chaque œuvre :
   Succès (progression réelle) · Contacts qui y ont joué (RPC friends_played)
   · DLC & extensions (GLG_DLC) · Actualités (WORK_NEWS, mêmes cartes que
   les fiches §54). Le tout rendu par _libBelowHTML, appelé par _libStageHTML.
══════════════════════════════════════════ */
const _LIBS_T = {
  ach:        { fr:'Succès', en:'Achievements', es:'Logros', de:'Erfolge', it:'Obiettivi', ar:'الإنجازات', zh:'成就', ja:'実績', ru:'Достижения', pl:'Osiągnięcia' },
  achOf:      { fr:'%a sur %b débloqués', en:'%a of %b unlocked', es:'%a de %b desbloqueados', de:'%a von %b freigeschaltet', it:'%a su %b sbloccati', ar:'%a من %b مفتوحة', zh:'已解锁 %a / %b', ja:'%a / %b 解除済み', ru:'Открыто %a из %b', pl:'Odblokowano %a z %b' },
  achView:    { fr:'Voir mes succès', en:'View my achievements', es:'Ver mis logros', de:'Meine Erfolge ansehen', it:'Vedi i miei obiettivi', ar:'عرض إنجازاتي', zh:'查看我的成就', ja:'実績を見る', ru:'Мои достижения', pl:'Zobacz moje osiągnięcia' },
  achLocked:  { fr:'Succès verrouillés', en:'Locked achievements', es:'Logros bloqueados', de:'Gesperrte Erfolge', it:'Obiettivi bloccati', ar:'إنجازات مقفلة', zh:'未解锁的成就', ja:'未解除の実績', ru:'Закрытые достижения', pl:'Zablokowane osiągnięcia' },
  friends:    { fr:'Contacts qui y ont joué', en:'Friends who played it', es:'Contactos que ya lo jugaron', de:'Freunde, die es gespielt haben', it:'Amici che ci hanno giocato', ar:'أصدقاء لعبوه', zh:'玩过的好友', ja:'プレイしたフレンド', ru:'Друзья, которые играли', pl:'Znajomi, którzy grali' },
  friendsNone:{ fr:'Aucun de tes contacts n’y a encore joué.', en:'None of your friends have played it yet.', es:'Ninguno de tus contactos lo ha jugado todavía.', de:'Noch keiner deiner Freunde hat es gespielt.', it:'Nessuno dei tuoi amici ci ha ancora giocato.', ar:'لم يلعبه أي من أصدقائك بعد.', zh:'你的好友中还没有人玩过。', ja:'まだプレイしたフレンドはいません。', ru:'Никто из ваших друзей ещё не играл.', pl:'Żaden z twoich znajomych jeszcze nie grał.' },
  friendsOne: { fr:'%s contact y a déjà joué', en:'%s friend has played it', es:'%s contacto ya lo ha jugado', de:'%s Freund hat es gespielt', it:'%s amico ci ha già giocato', ar:'لعبه صديق واحد (%s)', zh:'%s 位好友玩过', ja:'%s人のフレンドがプレイ済み', ru:'%s друг уже играл', pl:'%s znajomy już grał' },
  friendsMany:{ fr:'%s contacts y ont déjà joué', en:'%s friends have played it', es:'%s contactos ya lo han jugado', de:'%s Freunde haben es gespielt', it:'%s amici ci hanno già giocato', ar:'لعبه %s من الأصدقاء', zh:'%s 位好友玩过', ja:'%s人のフレンドがプレイ済み', ru:'Друзей уже играло: %s', pl:'%s znajomych już grało' },
  dlc:        { fr:'DLC & extensions', en:'DLC & expansions', es:'DLC y expansiones', de:'DLC & Erweiterungen', it:'DLC ed espansioni', ar:'المحتوى الإضافي والتوسعات', zh:'DLC 与扩展内容', ja:'DLC・拡張コンテンツ', ru:'DLC и дополнения', pl:'DLC i rozszerzenia' },
  kindExpansion:{ fr:'Extension', en:'Expansion', es:'Expansión', de:'Erweiterung', it:'Espansione', ar:'توسعة', zh:'扩展内容', ja:'拡張コンテンツ', ru:'Дополнение', pl:'Rozszerzenie' },
  kindBase:   { fr:'Jeu de base', en:'Base game', es:'Juego base', de:'Hauptspiel', it:'Gioco base', ar:'اللعبة الأساسية', zh:'本体游戏', ja:'ベースゲーム', ru:'Базовая игра', pl:'Gra podstawowa' },
  news:       { fr:'Actualités', en:'News', es:'Noticias', de:'Neuigkeiten', it:'Notizie', ar:'الأخبار', zh:'新闻动态', ja:'ニュース', ru:'Новости', pl:'Aktualności' },
  store:      { fr:'Page du magasin', en:'Store page', es:'Página de la tienda', de:'Shopseite', it:'Pagina del negozio', ar:'صفحة المتجر', zh:'商店页面', ja:'ストアページ', ru:'Страница магазина', pl:'Strona sklepu' },
  rev:        { fr:'Ton évaluation', en:'Your review', es:'Tu reseña', de:'Deine Bewertung', it:'La tua recensione', ar:'تقييمك', zh:'你的评价', ja:'あなたのレビュー', ru:'Ваш отзыв', pl:'Twoja recenzja' },
  revPh:      { fr:'Partage ton avis sur ce titre…', en:'Share your thoughts on this title…', es:'Comparte tu opinión sobre este título…', de:'Teile deine Meinung zu diesem Titel…', it:'Condividi la tua opinione su questo titolo…', ar:'شارك رأيك في هذا العنوان…', zh:'分享你对这部作品的看法……', ja:'このタイトルの感想を書こう…', ru:'Поделитесь мнением об этом тайтле…', pl:'Podziel się opinią o tym tytule…' },
  revSave:    { fr:'Publier', en:'Post', es:'Publicar', de:'Veröffentlichen', it:'Pubblica', ar:'نشر', zh:'发布', ja:'投稿', ru:'Опубликовать', pl:'Opublikuj' },
  revSaved:   { fr:'Évaluation publiée ✓', en:'Review posted ✓', es:'Reseña publicada ✓', de:'Bewertung veröffentlicht ✓', it:'Recensione pubblicata ✓', ar:'نُشر التقييم ✓', zh:'评价已发布 ✓', ja:'レビューを投稿しました ✓', ru:'Отзыв опубликован ✓', pl:'Recenzja opublikowana ✓' },
  newsNone:   { fr:'Aucune actualité pour le moment, les mises à jour du studio pour ce titre apparaîtront ici.', en:'No news yet, studio updates for this title will appear here.', es:'Aún no hay noticias, las novedades del estudio sobre este título aparecerán aquí.', de:'Noch keine Neuigkeiten, Studio-Updates zu diesem Titel erscheinen hier.', it:'Ancora nessuna notizia, gli aggiornamenti dello studio su questo titolo appariranno qui.', ar:'لا أخبار بعد، ستظهر هنا تحديثات الأستوديو لهذا العنوان.', zh:'暂无新闻、工作室关于该作品的更新将显示在这里。', ja:'まだニュースはありません、このタイトルのアップデート情報がここに表示されます。', ru:'Пока нет новостей, обновления студии по этому тайтлу появятся здесь.', pl:'Brak aktualności, informacje studia o tym tytule pojawią się tutaj.' },
};
const _lst = k => (_LIBS_T[k] && (_LIBS_T[k][LANG] || _LIBS_T[k].en)) || '';
const _LIB_LOCK_SVG = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5.5" y="10.5" width="13" height="9" rx="1.6" stroke="currentColor" stroke-width="1.4"/><path d="M8.5 10V8a3.5 3.5 0 0 1 7 0v2" stroke="currentColor" stroke-width="1.4"/></svg>';

/* ── Succès : progression RÉELLE du joueur (_achKeys, rechargés par
   buildLibraryPage) sur les définitions publiques (TROPHIES). ── */
function _libAchSectionHTML(gid) {
  const list = (typeof TROPHIES !== 'undefined' && TROPHIES[gid]) || [];
  if (!list.length) return '';
  const nonPlat = list.filter(x => x.tier !== 'platinum');
  const isEarned = tr => tr.tier === 'platinum'
    ? (nonPlat.length > 0 && nonPlat.every(x => _achKeys.has(gid + '/' + x.code)))
    : _achKeys.has(gid + '/' + tr.code);
  const sorted = list.slice().sort((a, b) => _TIER_ORDER[a.tier] - _TIER_ORDER[b.tier]);
  const un = sorted.filter(isEarned), lk = sorted.filter(tr => !isEarned(tr));
  const pct = Math.round(un.length / list.length * 100);
  const tile = (tr, locked) => {
    const txt = _trophyTxt(tr);
    const name = (locked && tr.hidden) ? _tt('hidden') : txt.t;
    return `<button class="lib-ach-tile ${locked ? 'lib-ach-tile--lock' : `pp-tier--${tr.tier}`}"
      onclick="openTrophyList('${gid}')" title="${escHtml(name)}" aria-label="${escHtml(name)}">${locked ? _LIB_LOCK_SVG : _TROPHY_SVG}</button>`;
  };
  return `
  <section class="lib-sec lib-sec--ach">
    <div class="lib-sec-head"><h2 class="lib-sec-title">${_lst('ach')}</h2><span class="lib-sec-count">${un.length}/${list.length}</span></div>
    <div class="lib-ach-progress">
      <span class="lib-ach-of">${_lst('achOf').replace('%a', un.length).replace('%b', list.length)} · ${pct}%</span>
      <span class="lib-ach-bar"><i style="width:${pct}%"></i></span>
    </div>
    ${un.length ? `<div class="lib-ach-row">${un.map(tr => tile(tr, false)).join('')}</div>` : ''}
    ${lk.length ? `<div class="lib-ach-lockl">${_lst('achLocked')}</div><div class="lib-ach-row lib-ach-row--lock">${lk.map(tr => tile(tr, true)).join('')}</div>` : ''}
    <button class="lib-sec-btn" onclick="openTrophyList('${gid}')">${_lst('achView')} <span aria-hidden="true">${_ARR()}</span></button>
  </section>`;
}

/* ── Contacts qui y ont joué : coquille rendue tout de suite, avatars
   remplis en asynchrone (RPC friends_played, cache par œuvre). ── */
let _libFpCache = {};
function _libFriendsSectionHTML() {
  return `
  <section class="lib-sec lib-sec--friends">
    <div class="lib-sec-head"><h2 class="lib-sec-title">${_lst('friends')}</h2><span class="lib-sec-count" id="lib-fp-count"></span></div>
    <div class="lib-fp-body" id="lib-fp-body"><p class="lib-sec-note">···</p></div>
  </section>`;
}
async function _libFillFriendsPlayed(gid) {
  const body = document.getElementById('lib-fp-body'); if (!body) return;
  let rows = _libFpCache[gid];
  if (!rows) {
    try { const r = await window.GLG_AUTH?.friendsPlayed?.(gid); rows = (r && r.friends) || []; }
    catch (e) { rows = []; }
    _libFpCache[gid] = rows;
  }
  if (document.getElementById('lib-fp-body') !== body) return; // le joueur a changé d'œuvre entre-temps
  const cnt = document.getElementById('lib-fp-count'); if (cnt) cnt.textContent = rows.length || '';
  if (!rows.length) { body.innerHTML = `<p class="lib-sec-note">${_lst('friendsNone')}</p>`; return; }
  body.innerHTML = `
    <div class="lib-fp-row">
      ${rows.slice(0, 10).map(u => `
      <button class="lib-fp-ava" onclick="openUserProfile('${u.id}')" title="${escHtml(u.username || '')}" aria-label="${escHtml(u.username || '')}">${_userAvatarHTML(u)}</button>`).join('')}
      ${rows.length > 10 ? `<span class="lib-fp-more">+${rows.length - 10}</span>` : ''}
    </div>
    <p class="lib-sec-note">${(rows.length === 1 ? _lst('friendsOne') : _lst('friendsMany')).replace('%s', rows.length)}</p>`;
}

/* ── DLC & extensions (GLG_DLC, data.js) : possédé → Jouer ; sinon prix +
   fiche. Le lien de parenté (extension/jeu de base) est affiché. ── */
function _libDlcSectionHTML(gid) {
  const rel = (typeof GLG_DLC !== 'undefined' && GLG_DLC[gid]) || [];
  const items = rel.map(r => ({ r, w: ALL_WORKS.find(w => w.id === r.id) })).filter(x => x.w && !isMatureHidden(x.w));
  if (!items.length) return '';
  return `
  <section class="lib-sec lib-sec--dlc">
    <div class="lib-sec-head"><h2 class="lib-sec-title">${_lst('dlc')}</h2></div>
    <div class="lib-dlc-list">
      ${items.map(({ r, w }) => {
        const owned = _ownsWork(w.id);
        return `
      <div class="lib-dlc-card" style="--tint:${w.tint || '#fff'};--tint-rgb:${hexToRgb(w.tint || '#ffffff') || '255,255,255'}">
        <span class="lib-dlc-cover"><img src="${av(w.cover)}" alt="" loading="lazy" decoding="async" onerror="this.style.opacity=0"></span>
        <span class="lib-dlc-body">
          <span class="lib-dlc-kind">${_lst(r.kind === 'base' ? 'kindBase' : 'kindExpansion')}</span>
          <span class="lib-dlc-name">${w.title}</span>
          <span class="lib-dlc-meta">${owned ? `<span class="lib-dlc-owned">${_lbt('inLib')}</span>` : priceHTML(w)}</span>
        </span>
        <span class="lib-dlc-act">
          ${owned
            ? `<button class="btn btn-outline lib-dlc-btn" onclick="launcherHandoff('${w.id}','play')">▶ ${_lbt('play')}</button>`
            : `<button class="btn btn-primary lib-dlc-btn" onclick="showPage('detail','${w.id}')">${_sct('cta')}</button>`}
        </span>
      </div>`;
      }).join('')}
    </div>
  </section>`;
}

/* ── Actualités de l'œuvre : mêmes données (WORK_NEWS) et mêmes cartes
   que le journal des fiches (§54), zéro duplication de style. ── */
function _libNewsSectionHTML(gid) {
  const list = (typeof WORK_NEWS !== 'undefined' && WORK_NEWS[gid]) || [];
  const entries = [...list].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);
  const items = entries.map(n => {
    let d = n.date;
    try { d = new Date(n.date + 'T12:00:00').toLocaleDateString(LANG_LOCALE[LANG] || 'en-US', { day:'numeric', month:'short', year:'numeric' }); } catch (e) {}
    const tag = _NEWS_T.tags[n.tag] || _NEWS_T.tags.update;
    return `
    <article class="dp-news-item">
      <div class="dp-news-side">
        <time class="dp-news-date" datetime="${n.date}">${d}</time>
        <span class="dp-news-tag dp-news-tag--${n.tag}">${tag[LANG] || tag.en}</span>
      </div>
      <div class="dp-news-main">
        <h3 class="dp-news-title">${n.title[LANG] || n.title.en}</h3>
        <p class="dp-news-body">${n.body[LANG] || n.body.en}</p>
      </div>
    </article>`;
  }).join('');
  return `
  <section class="lib-sec lib-sec--news">
    <div class="lib-sec-head"><h2 class="lib-sec-title">${_lst('news')}</h2>${entries.length ? `<span class="lib-sec-count">${entries.length}</span>` : ''}</div>
    ${entries.length ? `<div class="dp-news-list lib-news-list">${items}</div>` : `<p class="lib-sec-note">${_lst('newsNone')}</p>`}
  </section>`;
}

/* ── Barre d'outils sous la bannière (façon Steam : ★ favori, « Page du
   magasin », DLC, Succès, Actualités, Désinstaller), hors bannière/logo.
   Elle accueille aussi la méta froide (possession, date, temps de jeu)
   retirée du héro pour le garder épuré. ── */
function _libToolbarHTML(w, e, recent) {
  e = e || {};
  const scroll = sel => `glgScrollToEl('${sel}')`;
  const hasDlc  = typeof GLG_DLC !== 'undefined' && GLG_DLC[w.id] && GLG_DLC[w.id].length;
  const hasAch  = typeof TROPHIES !== 'undefined' && TROPHIES[w.id] && TROPHIES[w.id].length;
  const storeIco = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.5 5.5l1-3h9l1 3M2.5 5.5h11M2.5 5.5V13a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5V5.5M6.5 13V9h3v4" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';
  const isFav = !!(_userPrefs && _userPrefs.favs && _userPrefs.favs.includes(w.id));
  const rec = (recent || []).find(r => r.id === w.id);
  let playedTxt = '';
  if (rec && rec.mins > 0) {
    const mins = Math.max(0, parseInt(rec.mins, 10) || 0);
    let h = '';
    try { h = new Intl.NumberFormat(LANG_LOCALE[LANG] || 'en-US', { maximumFractionDigits: mins >= 600 ? 0 : 1 }).format(mins / 60); } catch (err) { h = (mins / 60).toFixed(1); }
    playedTxt = mins >= 60 ? _rgt('playedH').replace('%s', h) : _rgt('playedM').replace('%s', String(mins));
  }
  let sinceTxt = '';
  if (e.at) { try { sinceTxt = _lbt('since').replace('%s', new Date(e.at).toLocaleDateString(LANG_LOCALE[LANG] || 'en-US', { day:'numeric', month:'long', year:'numeric' })); } catch (err) {} }
  const meta = [_lbt('ownedOn').replace('%s', escHtml(_LIB_PLAT_NAME(e.platform))), sinceTxt, playedTxt].filter(Boolean).join(' · ');
  return `
  <div class="lib-toolbar">
    <button id="lib-fav-tool" class="lib-tool lib-tool--fav ${isFav ? 'on' : ''}" data-id="${w.id}"
      onclick="_libToggleFav('${w.id}')" title="${isFav ? _lbt('favDel') : _lbt('favAdd')}">★ <span>${isFav ? _lbt('favDel') : _lbt('favAdd')}</span></button>
    <button class="lib-tool lib-tool--store" onclick="showPage('detail','${w.id}')">${storeIco} ${_lst('store')}</button>
    ${hasDlc ? `<button class="lib-tool" onclick="${scroll('.lib-sec--dlc')}">DLC</button>` : ''}
    ${hasAch ? `<button class="lib-tool" onclick="${scroll('.lib-sec--ach')}">${_lst('ach')}</button>` : ''}
    <button class="lib-tool" onclick="${scroll('.lib-sec--news')}">${_lst('news')}</button>
    <button class="lib-tool" onclick="${scroll('.lib-sec--rev')}">${_lst('rev')}</button>
    ${_libIsInstalled(w.id) ? `<button class="lib-tool lib-tool--uninst" onclick="_libUninstall('${w.id}')">${_lbt('uninstall')}</button>` : ''}
    <span class="lib-toolbar-meta">${meta}</span>
  </div>`;
}

/* ── « Ton évaluation » (bibliothèque) : la note du JOUEUR sur l'œuvre -
   étoiles + texte, réutilise les RPC reviews des fiches (upsert/delete).
   Coquille rendue tout de suite, remplie en asynchrone (myReview). ── */
let _libRevState = { workId: null, rating: 0 };
function _libReviewSectionHTML() {
  return `
  <section class="lib-sec lib-sec--rev">
    <div class="lib-sec-head"><h2 class="lib-sec-title">${_lst('rev')}</h2></div>
    <div id="lib-rev-body"><p class="lib-sec-note">···</p></div>
  </section>`;
}
async function _libFillMyReview(gid) {
  const body = document.getElementById('lib-rev-body'); if (!body) return;
  const w = ALL_WORKS.find(x => x.id === gid); if (!w) return;
  if (!_workIsReleased(w)) { body.innerHTML = `<p class="lib-sec-note">${_rvt('opens')}</p>`; return; }
  let mine = null;
  try { const r = await window.GLG_AUTH?.myReview?.(gid); mine = (r && r.review) || null; } catch (e) {}
  if (document.getElementById('lib-rev-body') !== body) return; // œuvre changée entre-temps
  _libRevState = { workId: gid, rating: mine ? (parseInt(mine.rating, 10) || 0) : 0 };
  let updTxt = '';
  if (mine && mine.updated_at) { try { updTxt = new Date(mine.updated_at).toLocaleDateString(LANG_LOCALE[LANG] || 'en-US', { day:'numeric', month:'short', year:'numeric' }); } catch (e) {} }
  body.innerHTML = `
    <div class="lib-rev-stars" role="radiogroup" aria-label="${_lst('rev')}">
      ${[1,2,3,4,5].map(n => `<button type="button" class="rv-star-btn${n <= _libRevState.rating ? ' on' : ''}" data-n="${n}" onclick="_libRevSetStar(${n})" aria-label="${n}/5">${_RV_STAR}</button>`).join('')}
    </div>
    <textarea id="lib-rev-text" class="lib-rev-text" maxlength="1200" rows="3" placeholder="${_lst('revPh')}">${mine && mine.body ? escHtml(mine.body) : ''}</textarea>
    <div class="lib-rev-actions">
      <button class="btn btn-primary lib-rev-save" onclick="_libRevSubmit()">${_lst('revSave')}</button>
      ${mine ? `<button class="lib-sec-btn lib-rev-del" onclick="_libRevDelete()">${_ft('remove')}</button>` : ''}
      <span class="lib-rev-note" id="lib-rev-note">${mine && updTxt ? `${_lst('revSaved')} · ${updTxt}` : ''}</span>
    </div>`;
}
function _libRevSetStar(n) {
  _libRevState.rating = n;
  document.querySelectorAll('.lib-rev-stars .rv-star-btn').forEach(b => b.classList.toggle('on', +b.dataset.n <= n));
}
async function _libRevSubmit() {
  const gid = _libRevState.workId; if (!gid || !_libRevState.rating) return;
  const txt = document.getElementById('lib-rev-text')?.value || '';
  const btn = document.querySelector('.lib-rev-save'); if (btn) btn.disabled = true;
  try {
    const r = await window.GLG_AUTH?.upsertReview?.(gid, _libRevState.rating, txt.trim() || null);
    if (r && r.ok) { _libFillMyReview(gid); return; }
  } catch (e) {}
  if (btn) btn.disabled = false;
}
async function _libRevDelete() {
  const gid = _libRevState.workId; if (!gid) return;
  try { await window.GLG_AUTH?.deleteReview?.(gid); } catch (e) {}
  _libFillMyReview(gid);
}

/* Bandeau de sections sous le héro : actualités + évaluation du joueur en
   colonne principale, succès / contacts / DLC en rail latéral (disposition
   Steam, en mieux). */
function _libBelowHTML(w) {
  return `
  <div class="lib-below" style="--tint:${w.tint || '#fff'};--tint-rgb:${hexToRgb(w.tint || '#ffffff') || '255,255,255'}">
    <div class="lib-below-main">
      ${_libNewsSectionHTML(w.id)}
      ${_libReviewSectionHTML()}
    </div>
    <aside class="lib-below-side">
      ${_libAchSectionHTML(w.id)}
      ${_libFriendsSectionHTML()}
      ${_libDlcSectionHTML(w.id)}
    </aside>
  </div>`;
}

/* Vue GRILLE d'une collection (clic sur son en-tête dans le rail) -
   couvertures 2:3 cliquables, comme la grille de Steam. */
function _libShowCollection(key) {
  const lib = _libData.lib;
  const favs = new Set((_userPrefs && _userPrefs.favs) || []);
  const arr = key === 'colGames' ? lib.filter(x => x.w.type !== 'film')
            : key === 'colFilms' ? lib.filter(x => x.w.type === 'film')
            : lib.filter(x => favs.has(x.w.id));
  const stage = $('lib-stage'); if (!stage || !arr.length) return;
  document.querySelectorAll('#page-library .lib-rail [data-lib]').forEach(x => { x.classList.remove('active'); x.setAttribute('aria-current', 'false'); });
  stage.classList.remove('lib-stage--in');
  stage.innerHTML = `
    <div class="lib-gridwrap">
      <div class="lib-grid-head">${key === 'colFavs' ? `<span class="lib-col-star">${_LIB_STAR}</span>` : ''}<h2>${_lbt(key)}</h2><span class="lib-col-n">${arr.length}</span></div>
      <div class="lib-grid">${arr.map(x => `
        <button class="lib-gcard" data-glib="${x.w.id}" style="--tint-rgb:${hexToRgb(x.w.tint || '#ffffff') || '255,255,255'}" aria-label="${x.w.title}">
          <img src="${av(x.w.cover)}" alt="" loading="lazy" decoding="async">
          <span class="lib-gcard-name">${x.w.title}</span>
        </button>`).join('')}
      </div>
    </div>`;
  stage.querySelectorAll('[data-glib]').forEach(b => b.addEventListener('click', () => {
    _libSelected = b.dataset.glib;
    document.querySelectorAll('#page-library .lib-rail [data-lib]').forEach(x => { const on = x.dataset.lib === _libSelected; x.classList.toggle('active', on); x.setAttribute('aria-current', on ? 'true' : 'false'); });
    stage.classList.remove('lib-stage--in');
    stage.innerHTML = _libStageHTML(_libData.lib.find(x => x.w.id === _libSelected), _libData.recent);
    _scrollTopInstant(); _libFillFriendsPlayed(_libSelected); _libFillMyReview(_libSelected);
    setTimeout(() => stage.classList.add('lib-stage--in'), 20);
  }));
  _scrollTopInstant();
  setTimeout(() => stage.classList.add('lib-stage--in'), 20);
}

/* Favori on/off (étoile du rail + bouton de la barre d'outils) → prefs.favs.
   FIX : maj IN-PLACE, seul le rail se re-rend (les collections se
   regroupent), la vitrine, le scroll, le zen et la sélection ne bougent
   plus, et l'UI n'attend plus le réseau (persistance en arrière-plan). */
function _libToggleFav(id) {
  if (!id) return;
  const favs = ((_userPrefs && _userPrefs.favs) || []).slice();
  const i = favs.indexOf(id);
  if (i >= 0) favs.splice(i, 1); else favs.push(id);
  _savePrefs({ favs });   // maj _userPrefs immédiate (sync), réseau ensuite

  // 1) le rail : re-rendu seul, scroll préservé
  const list = document.querySelector('#page-library .lib-rail-list');
  if (list) {
    const keep = list.scrollTop;
    list.innerHTML = _libRailListHTML();
    _libWireRail($('page-library'));
    list.scrollTop = keep;
  }
  // 2) le bouton ★ de la barre d'outils (œuvre affichée)
  const t = document.getElementById('lib-fav-tool');
  if (t && t.dataset.id === id) {
    const on = favs.includes(id);
    t.classList.toggle('on', on);
    const lbl = t.querySelector('span'); if (lbl) lbl.textContent = on ? _lbt('favDel') : _lbt('favAdd');
    t.title = on ? _lbt('favDel') : _lbt('favAdd');
  }
}

/* ── INSTALLER / JOUER : un SEUL bouton sous le logo (état persistant
   prefs.installed). Installation simulée avec progression crédible, le
   téléchargement natif du launcher se branchera ici. ── */
let _libBusy = {};   // id → progression (0-100) d'une installation en cours
function _libIsInstalled(id) { return !!(_userPrefs && Array.isArray(_userPrefs.installed) && _userPrefs.installed.includes(id)); }
function _libCtaHTML(w) {
  if (_libBusy[w.id] != null) return `
      <button class="btn btn-primary btn-lg lib-cta-btn lib-cta-installing" disabled>
        <span class="lib-cta-bar" style="width:${_libBusy[w.id]}%" aria-hidden="true"></span>
        <span class="lib-cta-txt">${_lbt('installing')} ${Math.round(_libBusy[w.id])}%</span>
      </button>`;
  if (_libIsInstalled(w.id)) return `
      <button class="btn btn-primary btn-lg lib-cta-btn lib-play" onclick="launcherHandoff('${w.id}','play')">▶ ${_lbt('play')}</button>`;
  return `
      <button class="btn btn-primary btn-lg lib-cta-btn" onclick="_libInstallStart('${w.id}')">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 2v7.4M4.6 6.4 8 9.8l3.4-3.4M3 13.4h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        ${_lbt('install')}</button>`;
}
function _libInstallStart(id) {
  if (_libBusy[id] != null || _libIsInstalled(id)) return;
  const w = ALL_WORKS.find(x => x.id === id); if (!w) return;
  _libBusy[id] = 0;
  const cta0 = document.getElementById('lib-cta');
  if (cta0 && _libSelected === id) cta0.innerHTML = _libCtaHTML(w);
  const t0 = Date.now(), dur = 4200 + Math.random() * 1800;
  // setInterval (pas rAF) : la progression survit à un onglet/launcher masqué
  const iv = setInterval(() => {
    const p = Math.min(100, (Date.now() - t0) / dur * 100);
    _libBusy[id] = p;
    const cta = document.getElementById('lib-cta');
    if (cta && _libSelected === id) {
      const bar = cta.querySelector('.lib-cta-bar'), txt = cta.querySelector('.lib-cta-txt');
      if (bar && txt) { bar.style.width = p + '%'; txt.textContent = `${_lbt('installing')} ${Math.round(p)}%`; }
      else cta.innerHTML = _libCtaHTML(w);
    }
    if (p >= 100) {
      clearInterval(iv);
      delete _libBusy[id];
      const installed = ((_userPrefs && _userPrefs.installed) || []).slice();
      if (!installed.includes(id)) installed.push(id);
      _savePrefs({ installed });
      GLG_TOAST.show(w.title, _lbt('installedOk'));
      const c = document.getElementById('lib-cta');
      if (c && _libSelected === id) {
        c.innerHTML = _libCtaHTML(w);
        c.classList.add('lib-cta--pop'); setTimeout(() => c.classList.remove('lib-cta--pop'), 700);
        _libRefreshToolbar(id);
      }
    }
  }, 120);
}
function _libUninstall(id) {
  const w = ALL_WORKS.find(x => x.id === id); if (!w) return;
  if (!confirm(_lbt('uninstallQ').replace('%s', w.title))) return;
  const installed = ((_userPrefs && _userPrefs.installed) || []).filter(g => g !== id);
  _savePrefs({ installed });
  if (_libSelected === id) {
    const cta = document.getElementById('lib-cta');
    if (cta) cta.innerHTML = _libCtaHTML(w);
    _libRefreshToolbar(id);
  }
}
/* Re-rend la barre d'outils de l'œuvre affichée (fav / désinstaller / méta). */
function _libRefreshToolbar(id) {
  const x = _libData.lib.find(v => v.w.id === id); if (!x) return;
  const bar = document.querySelector('#page-library .lib-toolbar');
  if (bar) bar.outerHTML = _libToolbarHTML(x.e ? x.w : x, x.e || {}, _libData.recent);
}

/* Vitrine du jeu sélectionné, héro ÉPURÉ : rien que le key art plein
   cadre, le logo, et UN bouton (INSTALLER → JOUER une fois installé).
   Tout le reste (favori, magasin, méta, sections) vit sous la bannière. */
function _libStageHTML(x, recent) {
  if (!x) return '';
  const w = x.e ? x.w : x, e = x.e || {};
  const tint = w.tint || '#ffffff';
  const rgb  = hexToRgb(tint) || '255,255,255';
  return `
    <div class="lib-hero lib-hero--min" style="--tint:${tint};--tint-rgb:${rgb}">
      <div class="lib-hero-bg" style="background-image:url('${av(w.cover)}')"></div>
      <div class="lib-hero-veil"></div>
      <div class="lib-hero-body">
        ${w.logo ? `<img class="lib-logo" src="${av(w.logo)}" alt="${w.title}">` : `<h1 class="lib-title">${w.title}</h1>`}
        <div class="lib-ctas" id="lib-cta">${_libCtaHTML(w)}</div>
      </div>
      <span class="lib-scroll-cue" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 6l5 5 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span>
    </div>
    ${_libToolbarHTML(w, e, recent)}
    ${_libBelowHTML(w)}`;
}

/* ── HAND-OFF LAUNCHER (glg://, même mécanique que steam://) ───────────
   Le site demande, le launcher confirme. Si le protocole n'est pas
   enregistré (launcher absent), la page ne perd jamais le focus →
   on bascule la modale en état "launcher introuvable". */
function launcherHandoff(gameId, verb) {
  const w = ALL_WORKS.find(i => i.id === gameId);
  if (!w) return;
  // DANS le launcher : pas de modale de passage de relais, on agit direct
  // (bibliothèque, jeu sélectionné ; le téléchargement natif viendra ici).
  if (IS_TAURI) { window.__GLG_DEEPLINK?.(`glg://${verb}/${gameId}`); return; }
  document.getElementById('glg-handoff')?.remove();
  const ov = document.createElement('div');
  ov.id = 'glg-handoff';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.setAttribute('aria-label', verb === 'play' ? _lbt('handoffPlayT') : _lbt('handoffInstT'));
  ov.innerHTML = `
    <div class="handoff-card">
      <div class="handoff-ico" aria-hidden="true">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="M13.5 4.5c2.6-1.4 5-1.5 6-1 .5 1 .4 3.4-1 6-1.1 2-2.9 4-5.2 5.6l-.6 3.2-2.4-1.4-2.7 1.6.3-3.1-2.2-2.2-3.1.3 1.6-2.7L2.8 8.4 6 7.8C7.6 5.5 11.4 5.6 13.5 4.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><circle cx="14.5" cy="9.5" r="1.5" stroke="currentColor" stroke-width="1.2"/></svg>
      </div>
      <h3 class="handoff-title" id="ho-title">${verb === 'play' ? _lbt('handoffPlayT') : _lbt('handoffInstT')}</h3>
      <p class="handoff-body" id="ho-body">${_lbt('handoffBody').replace('%s', `<b>${escHtml(w.title)}</b>`)}</p>
      <div class="handoff-actions" id="ho-actions">
        <button class="btn btn-primary" id="ho-open">${_lbt('open')}</button>
        <button class="auth-link" id="ho-cancel">${_mt('cancel')}</button>
      </div>
      <p class="handoff-proto" aria-hidden="true">glg://${verb}/${escHtml(gameId)}</p>
    </div>`;
  const opener = document.activeElement; // restituer le focus à la fermeture (a11y)
  const close = () => {
    ov.remove(); document.removeEventListener('keydown', onKey);
    if (opener && document.contains(opener)) { try { opener.focus(); } catch (e) {} }
  };
  const onKey = ev => {
    if (ev.key === 'Escape') { close(); return; }
    if (ev.key === 'Tab') { // piège de focus : Tab circule DANS la modale
      const f = [...ov.querySelectorAll('button:not([disabled])')];
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    }
  };
  ov.addEventListener('click', ev => { if (ev.target === ov) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(ov);
  setTimeout(() => { ov.classList.add('open'); ov.querySelector('#ho-open')?.focus(); }, 20); // setTimeout, pas rAF

  ov.querySelector('#ho-cancel')?.addEventListener('click', close);
  ov.querySelector('#ho-open')?.addEventListener('click', () => {
    const btn = ov.querySelector('#ho-open');
    btn.disabled = true;
    let left = false;
    const onBlur = () => { left = true; };
    window.addEventListener('blur', onBlur, { once: true });
    // Navigation vers le protocole custom : no-op silencieux s'il n'est pas
    // enregistré ; sinon l'OS ouvre le launcher (qui prend le focus).
    try { window.location.href = `glg://${verb}/${encodeURIComponent(gameId)}`; } catch (err) {}
    setTimeout(() => {
      window.removeEventListener('blur', onBlur);
      if (left || document.hidden) { close(); return; }   // launcher ouvert
      // Launcher absent → état "introuvable" (le télécharger arrive avec Tauri)
      ov.querySelector('#ho-title').textContent = _lbt('missT');
      ov.querySelector('#ho-body').textContent = _lbt('missNote');
      ov.querySelector('#ho-actions').innerHTML = `<button class="btn btn-outline" id="ho-ok">${_lbt('ok')}</button>`;
      const ok = ov.querySelector('#ho-ok');
      ok?.addEventListener('click', close);
      ok?.focus(); // l'élément focalisé vient d'être détruit → re-ancrer le focus
    }, 1500);
  });
}

/* ══════════════════════════════════════════
   ACCUEIL : HÉROS LUMBRA (le titre annoncé EST l'ouverture)
   Un seul héros. La jaquette du monde annoncé en pleine page, l'accroche,
   deux gestes (découvrir, liste de souhaits). Reconstruit à chaque langue.
══════════════════════════════════════════ */
function _buildHomeHero() {
  const host = $('home-hero-content'); if (!host) return;
  const w = filterByAge(typeof ALL_WORKS !== 'undefined' ? ALL_WORKS : [])[0];
  const bg = $('home-hero-bg');
  if (bg) bg.style.backgroundImage = w ? `url('${av((Array.isArray(w.screenshots) && w.screenshots[1]) || w.cover)}')` : '';
  if (!w) { host.innerHTML = ''; return; }
  const tagMono = (typeof TAG_LABELS !== 'undefined' && TAG_LABELS.monochrome) ? (TAG_LABELS.monochrome[LANG] || TAG_LABELS.monochrome.en) : '';
  host.innerHTML = `
    <div class="hero-eyebrow">
      <span class="hero-eyebrow-dash"></span>
      <span class="hero-eyebrow-text">${_odt('present')}</span>
      <span class="hero-eyebrow-dash"></span>
    </div>
    <h1 class="hero-slogan hl-title">${escHtml(w.title)}</h1>
    <p class="hl-tagline">${escHtml(getItemField(w, 'tagline') || '')}</p>
    <p class="hl-meta">${getCatLabel(w)} · ${tagMono} · ${w.year}${w.platformLabel ? ' · ' + w.platformLabel : ''}</p>
    <div class="hero-btns">
      <button class="btn btn-primary btn-lg" onclick="showPage('detail','${w.id}')">${_sct('cta')} <span aria-hidden="true">${_ARR()}</span></button>
      <button class="c-wish wspot-wish hl-wish ${wishHas(w.id) ? 'on' : ''}" data-wish="${w.id}" aria-pressed="${wishHas(w.id)}" aria-label="${_wt('add')}" title="${_wt('add')}" onclick="toggleWish('${w.id}',this)">${_HEART_SVG}</button>
    </div>`;
  /* Un seul geste signé par page : ici, un balayage de lumière traverse le
     héros UNE fois par session (jamais en boucle, jamais au retour). */
  const heroEl = document.querySelector('.hero--lumbra');
  if (heroEl && !sessionStorage.getItem('glg_swept')) {
    heroEl.classList.add('hero-swept');
    try { sessionStorage.setItem('glg_swept', '1'); } catch (e) {}
  }
}

/* ══════════════════════════════════════════
   ACCUEIL, « LE LAUNCHER ARRIVE » (annonce du standalone V1.0.0)
   Fenêtre stylisée (chrome + rail bibliothèque esquissé) + 4 piliers +
   plateformes. Le launcher web étant complet, cette section vend l'app
   de bureau qui reprendra le même compte, la même bibliothèque.
══════════════════════════════════════════ */
const _LNCH_T = {
  sub:     { fr:'Tout ce que tu utilises ici, compte, bibliothèque, amis, trophées, dans une application installée, plus rapide, avec mises à jour automatiques signées.', en:'Everything you use here, account, library, friends, trophies, in an installed app: faster, with signed automatic updates.', es:'Todo lo que usas aquí, cuenta, biblioteca, amigos, trofeos, en una aplicación instalada, más rápida y con actualizaciones automáticas firmadas.', de:'Alles, was du hier nutzt, Konto, Bibliothek, Freunde, Trophäen, in einer installierten App: schneller, mit signierten automatischen Updates.', it:'Tutto quello che usi qui, account, libreria, amici, trofei, in un\'app installata: più veloce, con aggiornamenti automatici firmati.', ar:'كل ما تستخدمه هنا، الحساب والمكتبة والأصدقاء والجوائز، في تطبيق مثبّت، أسرع، مع تحديثات تلقائية موقَّعة.', zh:'你在这里使用的一切、账户、游戏库、好友、奖杯、都将进入一款安装式应用：更快，且带有签名的自动更新。', ja:'ここで使うすべて、アカウント、ライブラリ、フレンド、トロフィー、がインストール型アプリに。より速く、署名付き自動アップデート対応。', ru:'Всё, чем вы пользуетесь здесь, аккаунт, библиотека, друзья, трофеи, в установленном приложении: быстрее, с подписанными автообновлениями.', pl:'Wszystko, czego używasz tutaj, konto, biblioteka, znajomi, trofea, w zainstalowanej aplikacji: szybszej, z podpisanymi automatycznymi aktualizacjami.' },
  f1t: { fr:'Une seule identité', en:'One identity', es:'Una sola identidad', de:'Eine Identität', it:'Un\'unica identità', ar:'هوية واحدة', zh:'同一身份', ja:'ひとつのアカウント', ru:'Единый аккаунт', pl:'Jedna tożsamość' },
  f1d: { fr:'Même compte, même bibliothèque, mêmes amis, le site et l’app ne font qu’un.', en:'Same account, same library, same friends, site and app are one.', es:'Misma cuenta, misma biblioteca, mismos amigos, el sitio y la app son uno.', de:'Gleiches Konto, gleiche Bibliothek, gleiche Freunde, Website und App sind eins.', it:'Stesso account, stessa libreria, stessi amici, sito e app sono una cosa sola.', ar:'الحساب نفسه والمكتبة نفسها والأصدقاء أنفسهم، الموقع والتطبيق واحد.', zh:'同一账户、同一游戏库、同样的好友、网站与应用合而为一。', ja:'同じアカウント、同じライブラリ、同じフレンド、サイトとアプリはひとつ。', ru:'Тот же аккаунт, та же библиотека, те же друзья, сайт и приложение едины.', pl:'To samo konto, ta sama biblioteka, ci sami znajomi, strona i aplikacja to jedno.' },
  f2t: { fr:'Installation et jeu en un clic', en:'One-click install & play', es:'Instalar y jugar en un clic', de:'Installieren & Spielen mit einem Klick', it:'Installa e gioca in un clic', ar:'تثبيت ولعب بنقرة', zh:'一键安装与启动', ja:'ワンクリックでインストール&プレイ', ru:'Установка и запуск в один клик', pl:'Instalacja i gra jednym kliknięciem' },
  f2d: { fr:'Le bouton Jouer du site ouvre l’app (glg://), elle télécharge, installe et lance.', en:'The site\'s Play button opens the app (glg://), it downloads, installs and launches.', es:'El botón Jugar del sitio abre la app (glg://): descarga, instala y lanza.', de:'Der Spielen-Button der Website öffnet die App (glg://), sie lädt, installiert und startet.', it:'Il pulsante Gioca del sito apre l\'app (glg://): scarica, installa e avvia.', ar:'زر اللعب في الموقع يفتح التطبيق (glg://), فيُنزّل ويثبّت ويشغّل.', zh:'网站上的“开始游戏”按钮会打开应用（glg://）、由它完成下载、安装与启动。', ja:'サイトのプレイボタンがアプリ（glg://）を開き、ダウンロード・インストール・起動まで行います。', ru:'Кнопка «Играть» на сайте открывает приложение (glg://), оно скачивает, устанавливает и запускает.', pl:'Przycisk Graj na stronie otwiera aplikację (glg://), ona pobiera, instaluje i uruchamia.' },
  f3t: { fr:'Mises à jour signées', en:'Signed updates', es:'Actualizaciones firmadas', de:'Signierte Updates', it:'Aggiornamenti firmati', ar:'تحديثات موقَّعة', zh:'签名更新', ja:'署名付きアップデート', ru:'Подписанные обновления', pl:'Podpisane aktualizacje' },
  f3d: { fr:'Jeux et launcher se mettent à jour tout seuls, avec vérification cryptographique.', en:'Games and launcher update themselves, cryptographically verified.', es:'Los juegos y el launcher se actualizan solos, con verificación criptográfica.', de:'Spiele und Launcher aktualisieren sich selbst, kryptografisch verifiziert.', it:'Giochi e launcher si aggiornano da soli, con verifica crittografica.', ar:'تتحدّث الألعاب والمشغّل تلقائياً مع تحقق تشفيري.', zh:'游戏与启动器自动更新，并经过加密校验。', ja:'ゲームもランチャーも自動更新。暗号署名で検証されます。', ru:'Игры и лаунчер обновляются сами, с криптографической проверкой.', pl:'Gry i launcher aktualizują się same, z weryfikacją kryptograficzną.' },
  f4t: { fr:'Sécurité intégrale', en:'Full security', es:'Seguridad total', de:'Volle Sicherheit', it:'Sicurezza totale', ar:'أمان كامل', zh:'全面安全', ja:'万全のセキュリティ', ru:'Полная защита', pl:'Pełne bezpieczeństwo' },
  f4d: { fr:'2FA type Steam Guard, données chiffrées, vie privée respectée, déjà actifs ici.', en:'Steam Guard-style 2FA, encrypted data, privacy respected, already live here.', es:'2FA al estilo Steam Guard, datos cifrados, privacidad respetada, ya activos aquí.', de:'2FA im Steam-Guard-Stil, verschlüsselte Daten, gewahrte Privatsphäre, hier bereits aktiv.', it:'2FA in stile Steam Guard, dati cifrati, privacy rispettata, già attivi qui.', ar:'مصادقة ثنائية بأسلوب Steam Guard وبيانات مشفّرة وخصوصية محترمة، مفعّلة هنا بالفعل.', zh:'Steam 令牌式两步验证、数据加密、尊重隐私、这些已在此生效。', ja:'Steam Guard式2FA, 暗号化データ、プライバシー尊重、すでにここで稼働中。', ru:'2FA в стиле Steam Guard, шифрование данных, уважение к приватности, уже работает здесь.', pl:'2FA w stylu Steam Guard, szyfrowane dane, poszanowanie prywatności, już działa tutaj.' },
  eyebrowDl:{ fr:'Application de bureau · V%s disponible', en:'Desktop app · V%s available', es:'Aplicación de escritorio · V%s disponible', de:'Desktop-App · V%s verfügbar', it:'App desktop · V%s disponibile', ar:'تطبيق سطح المكتب · V%s متاح الآن', zh:'桌面应用 · V%s 现已推出', ja:'デスクトップアプリ · V%s 配信中', ru:'Настольное приложение · доступна V%s', pl:'Aplikacja desktopowa · V%s dostępna' },
  titleDl: { fr:'TÉLÉCHARGE LE LAUNCHER', en:'DOWNLOAD THE LAUNCHER', es:'DESCARGA EL LAUNCHER', de:'LADE DEN LAUNCHER', it:'SCARICA IL LAUNCHER', ar:'حمّل المشغّل', zh:'下载启动器', ja:'ランチャーをダウンロード', ru:'СКАЧАЙ ЛАУНЧЕР', pl:'POBIERZ LAUNCHER' },
  dlWin:   { fr:'Télécharger pour Windows', en:'Download for Windows', es:'Descargar para Windows', de:'Für Windows herunterladen', it:'Scarica per Windows', ar:'تنزيل لويندوز', zh:'下载 Windows 版', ja:'Windows版をダウンロード', ru:'Скачать для Windows', pl:'Pobierz dla Windows' },
  dlMeta:  { fr:'%s Mo · installation en un clic · mises à jour automatiques signées', en:'%s MB · one-click install · signed auto-updates', es:'%s MB · instalación en un clic · actualizaciones automáticas firmadas', de:'%s MB · Ein-Klick-Installation · signierte Auto-Updates', it:'%s MB · installazione in un clic · aggiornamenti automatici firmati', ar:'%s م.ب · تثبيت بنقرة · تحديثات تلقائية موقَّعة', zh:'%s MB · 一键安装 · 签名自动更新', ja:'%s MB · ワンクリックインストール · 署名付き自動更新', ru:'%s МБ · установка в один клик · подписанные автообновления', pl:'%s MB · instalacja jednym kliknięciem · podpisane autoaktualizacje' },
  dlSoon:  { fr:'bientôt', en:'soon', es:'pronto', de:'bald', it:'presto', ar:'قريباً', zh:'即将推出', ja:'近日', ru:'скоро', pl:'wkrótce' },
  allVer:  { fr:'Toutes les versions et notes de version', en:'All versions & release notes', es:'Todas las versiones y notas de la versión', de:'Alle Versionen & Release-Notes', it:'Tutte le versioni e note di rilascio', ar:'كل الإصدارات وملاحظات النسخة', zh:'全部版本与发行说明', ja:'すべてのバージョンとリリースノート', ru:'Все версии и примечания к выпуску', pl:'Wszystkie wersje i informacje o wydaniu' },
  dlSha:   { fr:'Empreinte SHA-256 du programme d’installation', en:'Installer SHA-256 checksum', es:'Huella SHA-256 del instalador', de:'SHA-256-Prüfsumme des Installers', it:'Impronta SHA-256 dell’installer', ar:'بصمة SHA-256 للمثبّت', zh:'安装包 SHA-256 校验值', ja:'インストーラのSHA-256チェックサム', ru:'Контрольная сумма SHA-256 установщика', pl:'Suma kontrolna SHA-256 instalatora' },
};
const _lnt = k => (_LNCH_T[k] && (_LNCH_T[k][LANG] || _LNCH_T[k].en)) || '';

/* Téléchargements du launcher, UNE seule source de vérité pour les URLs.
   Windows : installeur auto-hébergé (léger, 1,7 Mo). macOS/Linux : renseigner
   les URLs GitHub Releases à la 1re release CI (tag launcher-v*). */
/* Base des fichiers de la release CI signée, à bumper à chaque release. */
const _DL_VER = '1.0.5';
const _DL_REL = `https://github.com/GEEKLEARN-GAMES/www.geeklearngames.com/releases/download/launcher-v${_DL_VER}`;
const LAUNCHER_DL = {
  version: _DL_VER,
  sizeMB: 2.2,
  sha256: '2ab4561823c880a029fef6b21751d570cfe8f20e3d054ea53faa552d56eec2ee',
  all: 'https://github.com/GEEKLEARN-GAMES/www.geeklearngames.com/releases/latest',
  /* Variantes par plateforme : la 1re = lien principal (gros bouton pour
     l'OS détecté), toutes sont listées sur la carte de la plateforme. */
  platforms: {
    win: [
      // auto-hébergé, ?v= : purge le cache edge Cloudflare à chaque release
      { l: 'x64 · .exe (NSIS)', u: `download/GEEKLEARN-GAMES-Setup.exe?v=${_DL_VER}` },
    ],
    mac: [
      { l: 'Apple Silicon · .dmg',  u: `${_DL_REL}/GEEKLEARN.GAMES_${_DL_VER}_aarch64.dmg` },
      { l: 'Intel x86-64 · .dmg',   u: `${_DL_REL}/GEEKLEARN.GAMES_${_DL_VER}_x64.dmg` },
    ],
    linux: [
      { l: 'x64 · .AppImage',   u: `${_DL_REL}/GEEKLEARN.GAMES_${_DL_VER}_amd64.AppImage` },
      { l: 'x64 · .deb',        u: `${_DL_REL}/GEEKLEARN.GAMES_${_DL_VER}_amd64.deb` },
      { l: 'x64 · .rpm',        u: `${_DL_REL}/GEEKLEARN.GAMES-${_DL_VER}-1.x86_64.rpm` },
      { l: 'ARM64 · .AppImage', u: `${_DL_REL}/GEEKLEARN.GAMES_${_DL_VER}_aarch64.AppImage` },
      { l: 'ARM64 · .deb',      u: `${_DL_REL}/GEEKLEARN.GAMES_${_DL_VER}_arm64.deb` },
      { l: 'ARM64 · .rpm',      u: `${_DL_REL}/GEEKLEARN.GAMES-${_DL_VER}-1.aarch64.rpm` },
    ],
  },
};
/* OS du visiteur (pour proposer le bon bouton). iOS contient "like Mac OS X"
   → exclu. Android exclu de linux. Défaut raisonnable : windows. */
function _dlOS() {
  const u = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(u)) return 'mobile';
  if (/android/i.test(u)) return 'mobile';
  if (/mac/i.test(u)) return 'mac';
  if (/linux|x11/i.test(u)) return 'linux';
  return 'win';
}

function buildLauncherTeaser() {
  const home = $('page-home'); if (!home) return;
  // Dans le launcher lui-même, « Le launcher arrive » n'a pas de sens.
  if (IS_TAURI) { $('home-launcher')?.remove(); return; }
  let host = $('home-launcher');
  if (!host) {
    host = document.createElement('section');
    host.id = 'home-launcher';
    host.className = 'glg-launcher-teaser';
    const cta = home.querySelector('.glg-cta-band');
    if (cta && cta.parentElement) cta.parentElement.insertBefore(host, cta);
    else home.querySelector('.page-footer-slot')?.before(host);
  }
  const FEATS = [
    ['f1t','f1d','<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8.4" r="3.2" stroke="currentColor" stroke-width="1.3"/><path d="M5.4 19c1-3 3.5-4.6 6.6-4.6s5.6 1.6 6.6 4.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>'],
    ['f2t','f2d','<svg viewBox="0 0 24 24" fill="none"><path d="M8 5.5l10 6.5-10 6.5v-13z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>'],
    ['f3t','f3d','<svg viewBox="0 0 24 24" fill="none"><path d="M19.5 9.5A7.5 7.5 0 006 7M4.5 14.5A7.5 7.5 0 0018 17" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M19.8 4.6v4.2h-4.2M4.2 19.4v-4.2h4.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>'],
    ['f4t','f4d','<svg viewBox="0 0 24 24" fill="none"><path d="M12 3L5 5.6v5.2c0 4.6 3 7.7 7 9.4 4-1.7 7-4.8 7-9.4V5.6L12 3z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M9 11.4l2.2 2.2 3.8-4.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>'],
  ];
  // Bouton principal selon l'OS du visiteur ; chaque carte plateforme liste
  // TOUTES ses variantes (Apple Silicon/Intel, x64/ARM64, AppImage/deb/rpm) -
  // URLs centralisées dans LAUNCHER_DL.platforms.
  const os = _dlOS();
  const P = LAUNCHER_DL.platforms;
  const dlIcon = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 2v8M4.5 6.5L8 10l3.5-3.5M2.5 13h11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  let sizeTxt = String(LAUNCHER_DL.sizeMB);
  try { sizeTxt = new Intl.NumberFormat(LANG_LOCALE[LANG] || 'en-US', { maximumFractionDigits: 1 }).format(LAUNCHER_DL.sizeMB); } catch (e) {}
  const priKey = (os === 'mac' || os === 'linux') && P[os] && P[os].length ? os : 'win';
  const pri = P[priKey][0];
  const primary = `<a class="btn btn-primary btn-lg" href="${pri.u}" ${pri.u.indexOf('http') !== 0 ? 'download' : ''}>${dlIcon} ${priKey === 'mac' ? 'macOS' : priKey === 'linux' ? 'Linux' : _lnt('dlWin')}</a>`;
  host.innerHTML = `
    <div class="lt-inner">
      <div class="lt-copy">
        <p class="section-eye reveal">${_lnt('eyebrowDl').replace('%s', LAUNCHER_DL.version)}</p>
        <h2 class="section-h reveal" style="margin:12px 0 16px">${_lnt('titleDl')}</h2>
        <p class="lt-sub reveal">${_lnt('sub')}</p>
        <div class="lt-feats">
          ${FEATS.map(([t, d, svg], i) => `
          <div class="lt-feat reveal" style="transition-delay:${i * 0.05}s">
            <span class="lt-feat-ico" aria-hidden="true">${svg}</span>
            <span class="lt-feat-txt"><b>${_lnt(t)}</b><span>${_lnt(d)}</span></span>
          </div>`).join('')}
        </div>
        <div class="lt-actions reveal">
          ${primary}
        </div>
        <p class="lt-dl-meta reveal">${_lnt('dlMeta').replace('%s', sizeTxt)}</p>
        <div class="lt-dl-grid reveal">
          ${[
            ['win',   'Windows 10/11', '.exe · NSIS',
              '<svg viewBox="0 0 16 16" fill="none"><path d="M2 3.6l5.4-.8v4.9H2V3.6zM8.4 2.6L14 1.8v5.9H8.4V2.6zM2 8.7h5.4v4.9L2 12.8V8.7zM8.4 8.7H14v5.9l-5.6-.8V8.7z" fill="currentColor"/></svg>'],
            ['mac',   'macOS',         'Apple Silicon & Intel',
              '<svg viewBox="0 0 16 16" fill="none"><path d="M11.1 8.5c0-1.5 1.2-2.2 1.3-2.3-.7-1-1.8-1.2-2.2-1.2-.9-.1-1.8.6-2.3.6-.5 0-1.2-.6-2-.5-1 0-2 .6-2.5 1.5-1.1 1.9-.3 4.6.8 6.1.5.8 1.1 1.6 1.9 1.6.8 0 1.1-.5 2-.5s1.2.5 2 .5 1.4-.7 1.9-1.5c.6-.9.8-1.7.8-1.8 0 0-1.6-.6-1.7-2.5zM9.6 3.9c.4-.5.7-1.2.6-2-.6 0-1.4.4-1.8 1-.4.4-.7 1.2-.6 1.9.7.1 1.4-.4 1.8-.9z" fill="currentColor"/></svg>'],
            ['linux', 'Linux',         'x64 & ARM64',
              '<svg viewBox="0 0 16 16" fill="none"><rect x="1.6" y="2.4" width="12.8" height="11.2" rx="1.4" stroke="currentColor" stroke-width="1.2"/><path d="M4.4 6.2l2 1.8-2 1.8M8 10.6h3.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'],
          ].map(([k, name, fmt, ico]) => {
            const vars = P[k] || [];
            if (!vars.length) return `
          <span class="lt-dl-card" aria-disabled="true">
            <span class="lt-dl-ico" aria-hidden="true">${ico}</span>
            <span class="lt-dl-name">${name}</span>
            <span class="lt-dl-fmt">${fmt}</span>
            <span class="lt-dl-get lt-dl-get--soon">${_lnt('dlSoon')}</span>
          </span>`;
            return `
          <div class="lt-dl-card lt-dl-card--on">
            <span class="lt-dl-ico" aria-hidden="true">${ico}</span>
            <span class="lt-dl-name">${name}</span>
            <span class="lt-dl-fmt">${fmt}</span>
            <span class="lt-dl-vars">
              ${vars.map(v => `
              <a class="lt-dl-var" href="${v.u}" ${v.u.indexOf('http') !== 0 ? 'download' : ''} aria-label="${name}, ${v.l}">
                <span class="lt-dl-var-l">${v.l}</span>
                <span class="lt-dl-var-get" aria-hidden="true">${dlIcon}</span>
              </a>`).join('')}
            </span>
          </div>`;
          }).join('')}
        </div>
        <p class="lt-sha reveal">${_lnt('dlSha')} <code>${LAUNCHER_DL.sha256}</code></p>
        ${LAUNCHER_DL.all ? `<a class="lt-allver reveal" href="${LAUNCHER_DL.all}" target="_blank" rel="noopener">${_lnt('allVer')} <span aria-hidden="true">${_ARR()}</span></a>` : ''}
      </div>
      <div class="lt-visual reveal" aria-hidden="true">
        <div class="lt-window">
          <div class="lt-window-bar"><span></span><span></span><span></span></div>
          <div class="lt-window-body">
            <div class="lt-w-rail">
              <span class="lt-w-logo"><img src="assets/img/brand/glg-mark.png" alt="" onerror="this.style.display='none'"></span>
              <span class="lt-w-line" style="width:72%"></span>
              <span class="lt-w-line" style="width:58%"></span>
              <span class="lt-w-line lt-w-line--on" style="width:80%"></span>
              <span class="lt-w-line" style="width:64%"></span>
              <span class="lt-w-line" style="width:70%"></span>
            </div>
            <div class="lt-w-stage">
              <span class="lt-w-title"></span>
              <span class="lt-w-sub"></span>
              <span class="lt-w-btn">▶</span>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  initAnimIdleObserver();
}

/* ══════════════════════════════════════════
   ABOUT PAGE
══════════════════════════════════════════ */
function buildAboutPage() {
  _buildAboutStory();
  buildOrgTree();
  buildStudioValues();
  buildAwards();
}

/* ── L'HISTOIRE, les faits, sans superlatifs : c'est la page qu'un
   partenaire lit en entier. Injectée entre le hero et l'équipe. ── */
const _ABOUT2_T = {
  eye:  { fr:'L’histoire', en:'The story', es:'La historia', de:'Die Geschichte', it:'La storia', ar:'القصة', zh:'我们的故事', ja:'ストーリー', ru:'История', pl:'Historia' },
  head: { fr:'UN STUDIO,\nUN MONDE À LA FOIS', en:'ONE STUDIO,\nONE WORLD AT A TIME', es:'UN ESTUDIO,\nUN MUNDO A LA VEZ', de:'EIN STUDIO,\nEINE WELT NACH DER ANDEREN', it:'UNO STUDIO,\nUN MONDO ALLA VOLTA', ar:'استوديو واحد،\nعالم واحد في كل مرة', zh:'一间工作室，\n一次一个世界', ja:'ひとつのスタジオ、\nひとつずつの世界', ru:'ОДНА СТУДИЯ , \nОДИН МИР ЗА РАЗ', pl:'JEDNO STUDIO,\nJEDEN ŚWIAT NARAZ' },
  p1: {
    fr:'GEEKLEARN GAMES naît en 2026 à Blyes, un village de l’Ain, en Auvergne-Rhône-Alpes. Pas de tour de bureaux ni d’open space : un studio indépendant, enregistré comme entreprise individuelle, et une obsession : construire des mondes qui laissent des traces.',
    en:'GEEKLEARN GAMES was born in 2026 in Blyes, a village in the Ain, Auvergne-Rhône-Alpes. No office tower, no open space: an independent studio, registered as a sole proprietorship, and one obsession: building worlds that leave marks.',
    es:'GEEKLEARN GAMES nace en 2026 en Blyes, un pueblo del Ain, en Auvergne-Rhône-Alpes. Sin torre de oficinas ni open space: un estudio independiente, registrado como empresa individual, y una obsesión: construir mundos que dejan huella.',
    de:'GEEKLEARN GAMES entsteht 2026 in Blyes, einem Dorf im Ain, Auvergne-Rhône-Alpes. Kein Büroturm, kein Großraumbüro: ein unabhängiges Studio, als Einzelunternehmen eingetragen, und eine Besessenheit: Welten zu bauen, die Spuren hinterlassen.',
    it:'GEEKLEARN GAMES nasce nel 2026 a Blyes, un paese dell’Ain, in Alvernia-Rodano-Alpi. Niente torre di uffici né open space: uno studio indipendente, registrato come impresa individuale, e un’ossessione: costruire mondi che lasciano il segno.',
    ar:'وُلد GEEKLEARN GAMES عام 2026 في بلييس، قرية في مقاطعة آن (Ain) بمنطقة أوفرن-رون-ألب. لا برج مكاتب ولا مساحات مفتوحة: استوديو مستقل مسجّل كمؤسسة فردية، وهوس واحد: بناء عوالم تترك أثراً.',
    zh:'GEEKLEARN GAMES 于2026年诞生在布利耶斯、奥弗涅-罗讷-阿尔卑斯大区安省的一个村庄。没有写字楼，没有开放式办公区：一间以个体企业注册的独立工作室，和一个执念：打造留下印记的世界。',
    ja:'GEEKLEARN GAMESは2026年、オーヴェルニュ＝ローヌ＝アルプ地方アン県の村ブリエスで生まれた。オフィスビルもオープンスペースもない。個人事業として登記されたインディースタジオと、ただひとつの執念、痕跡を残す世界を作ること。',
    ru:'GEEKLEARN GAMES родилась в 2026 году в Блиесе : деревне в департаменте Эн, Овернь-Рона-Альпы. Ни офисной башни, ни опенспейса: независимая студия, зарегистрированная как индивидуальное предприятие, и одна одержимость: строить миры, которые оставляют след.',
    pl:'GEEKLEARN GAMES powstało w 2026 roku w Blyes, wiosce w departamencie Ain, w regionie Owernia-Rodan-Alpy. Bez biurowca, bez open space’u: niezależne studio, zarejestrowane jako działalność jednoosobowa, i jedna obsesja: budować światy, które zostawiają ślad.',
  },
  p2: {
    fr:'Le studio travaille à l’ancienne : un monde à la fois. Plutôt que d’annoncer dix promesses, nous préférons montrer peu, et tenir. Notre premier titre, LUMBRA, est en développement pour PC ; trois autres chantiers avancent dans l’ombre, et sortiront de la nuit quand ils seront prêts.',
    en:'The studio works the old way: one world at a time. Rather than announcing ten promises, we prefer to show little, and deliver. Our first title, LUMBRA, is in development for PC; three other projects are moving forward in the dark, and will step out of the night when they are ready.',
    es:'El estudio trabaja a la antigua: un mundo a la vez. En lugar de anunciar diez promesas, preferimos mostrar poco, y cumplir. Nuestro primer título, LUMBRA, está en desarrollo para PC; otros tres proyectos avanzan en la sombra y saldrán de la noche cuando estén listos.',
    de:'Das Studio arbeitet auf die alte Art: eine Welt nach der anderen. Statt zehn Versprechen anzukündigen, zeigen wir lieber wenig, und halten es. Unser erster Titel, LUMBRA, ist für PC in Entwicklung; drei weitere Projekte wachsen im Schatten und treten aus der Nacht, wenn sie bereit sind.',
    it:'Lo studio lavora alla vecchia maniera: un mondo alla volta. Invece di annunciare dieci promesse, preferiamo mostrare poco, e mantenere. Il nostro primo titolo, LUMBRA, è in sviluppo per PC; altri tre cantieri avanzano nell’ombra e usciranno dalla notte quando saranno pronti.',
    ar:'يعمل الاستوديو على الطريقة القديمة: عالم واحد في كل مرة. بدل إطلاق عشرة وعود، نفضّل أن نُري القليل، وأن نفي به. عنواننا الأول LUMBRA قيد التطوير للحاسوب؛ وثلاثة مشاريع أخرى تتقدم في الظل وستخرج من الليل حين تصبح جاهزة.',
    zh:'工作室以老派方式运作：一次只做一个世界。与其许下十个承诺，我们宁愿少展示、但说到做到。我们的首部作品 LUMBRA 正在为 PC 开发；另有三个项目在暗处推进，待时机成熟便会走出黑夜。',
    ja:'このスタジオは昔ながらのやり方で働く。一度にひとつの世界だけ。10の約束を掲げるより、少なく見せて、確実に届けたい。最初のタイトル「LUMBRA」はPC向けに開発中。ほかの3つのプロジェクトは影の中で進み、準備ができたとき夜から歩み出る。',
    ru:'Студия работает по-старому: один мир за раз. Вместо десяти обещаний мы предпочитаем показывать мало, и выполнять. Наш первый проект, LUMBRA, разрабатывается для PC; ещё три движутся вперёд в тени и выйдут из ночи, когда будут готовы.',
    pl:'Studio pracuje po staremu: jeden świat naraz. Zamiast ogłaszać dziesięć obietnic, wolimy pokazywać mało, i dotrzymywać słowa. Nasz pierwszy tytuł, LUMBRA, powstaje na PC; trzy inne projekty posuwają się naprzód w cieniu i wyjdą z nocy, gdy będą gotowe.',
  },
  p3: {
    fr:'Derrière le nom, une personne : et autour, une communauté qui grandit sur le launcher GLG, le Discord et les réseaux. Éditeurs, presse, partenaires : la porte est ouverte, contact@geeklearngames.com.',
    en:'Behind the name, one person : and around it, a community growing on the GLG launcher, Discord and social networks. Publishers, press, partners: the door is open, contact@geeklearngames.com.',
    es:'Detrás del nombre, una persona : y alrededor, una comunidad que crece en el launcher GLG, Discord y las redes. Editores, prensa, socios: la puerta está abierta, contact@geeklearngames.com.',
    de:'Hinter dem Namen steht ein Mensch : und darum herum eine Community, die im GLG-Launcher, auf Discord und in den Netzwerken wächst. Publisher, Presse, Partner: die Tür ist offen, contact@geeklearngames.com.',
    it:'Dietro il nome, una persona : e intorno, una community che cresce sul launcher GLG, su Discord e sui social. Editori, stampa, partner: la porta è aperta, contact@geeklearngames.com.',
    ar:'خلف الاسم شخص واحد : وحوله مجتمع ينمو عبر مشغّل GLG وDiscord والشبكات. الناشرون والصحافة والشركاء: الباب مفتوح، contact@geeklearngames.com.',
    zh:'名字背后是一个人、身边则是一个在 GLG 启动器、Discord 与社交网络上不断成长的社区。发行商、媒体、合作伙伴：大门敞开、contact@geeklearngames.com。',
    ja:'名前の後ろにいるのは、ひとりの人間。その周りには、GLGランチャーやDiscord, SNSで育つコミュニティがある。パブリッシャー、プレス、パートナーの皆さまへ、扉は開いています。contact@geeklearngames.com',
    ru:'За именем : один человек, а вокруг, сообщество, растущее в лаунчере GLG, в Discord и соцсетях. Издатели, пресса, партнёры: дверь открыта, contact@geeklearngames.com.',
    pl:'Za nazwą stoi jedna osoba : a wokół niej społeczność rosnąca w launcherze GLG, na Discordzie i w mediach społecznościowych. Wydawcy, prasa, partnerzy: drzwi są otwarte, contact@geeklearngames.com.',
  },
  fFounded: { fr:'Fondation', en:'Founded', es:'Fundación', de:'Gegründet', it:'Fondazione', ar:'التأسيس', zh:'创立', ja:'設立', ru:'Основана', pl:'Założone' },
  fBase:    { fr:'Port d’attache', en:'Home base', es:'Base', de:'Sitz', it:'Sede', ar:'المقر', zh:'所在地', ja:'拠点', ru:'База', pl:'Siedziba' },
  fLegal:   { fr:'Structure', en:'Legal form', es:'Estructura', de:'Rechtsform', it:'Forma giuridica', ar:'الكيان', zh:'注册形式', ja:'形態', ru:'Форма', pl:'Forma prawna' },
  fLegalV:  { fr:'Entreprise individuelle', en:'Sole proprietorship (EI)', es:'Empresa individual (EI)', de:'Einzelunternehmen (EI)', it:'Impresa individuale (EI)', ar:'مؤسسة فردية (EI)', zh:'个体企业（EI）', ja:'個人事業（EI）', ru:'ИП (EI)', pl:'Działalność jednoosobowa (EI)' },
  fFirst:   { fr:'Titre annoncé', en:'Announced title', es:'Título anunciado', de:'Angekündigter Titel', it:'Titolo annunciato', ar:'العنوان المعلن', zh:'已公布作品', ja:'発表タイトル', ru:'Анонсировано', pl:'Zapowiedziany tytuł' },
};
const _a2 = k => (_ABOUT2_T[k] && (_ABOUT2_T[k][LANG] || _ABOUT2_T[k].en)) || '';

function _buildAboutStory() {
  const about = $('page-about'); if (!about) return;
  let host = $('about-story');
  if (!host) {
    host = document.createElement('div');
    host.id = 'about-story';
    const hero = about.querySelector('.about-hero');
    if (hero) hero.insertAdjacentElement('afterend', host);
    else about.prepend(host);
  }
  host.innerHTML = `
    <div class="ast-inner">
      <div class="about-section-eye reveal">${_a2('eye')}</div>
      <h2 class="about-section-title reveal">${_a2('head').replace('\n', '<br>')}</h2>
      <div class="ast-cols">
        <p class="ast-p reveal">${_a2('p1')}</p>
        <p class="ast-p reveal">${_a2('p2')}</p>
        <p class="ast-p reveal">${_a2('p3').replace('contact@geeklearngames.com', '<a class="ast-mail" href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a>')}</p>
      </div>
      <div class="ast-facts reveal">
        <div class="ast-fact"><b>2026</b><span>${_a2('fFounded')}</span></div>
        <div class="ast-fact"><b>Blyes (Ain), France</b><span>${_a2('fBase')}</span></div>
        <div class="ast-fact"><b>${_a2('fLegalV')}</b><span>${_a2('fLegal')}</span></div>
        <div class="ast-fact"><b>LUMBRA · Q4 2027</b><span>${_a2('fFirst')}</span></div>
      </div>
    </div>`;
}

/* ── Studio values, the three brand pillars (Teach · Move · Haunt) ── */
const _VALUES = {
  heading: { fr:'Nos valeurs', en:'What we stand for', es:'Lo que defendemos', de:'Wofür wir stehen', ar:'ما نؤمن به', zh:'我们的信念', ja:'私たちの信条', ru:'Наши ценности', pl:'Nasze wartości', it:'I nostri valori' },
  eyebrow: { fr:'Le studio', en:'The Studio', es:'El estudio', de:'Das Studio', ar:'الأستوديو', zh:'工作室', ja:'スタジオ', ru:'Студия', pl:'Studio', it:'Lo studio' },
  items: [
    { k:'teach', t:{ fr:'ENSEIGNER', en:'TEACH', es:'ENSEÑAR', de:'LEHREN', ar:'نُعلّم', zh:'启迪', ja:'学び', ru:'УЧИТЬ', pl:'UCZYĆ', it:'INSEGNARE' },
      d:{ fr:'Chaque monde transmet quelque chose de vrai, sans jamais sacrifier le plaisir de jouer.', en:'Every world teaches something true, without ever sacrificing the joy of play.', es:'Cada mundo enseña algo verdadero, sin sacrificar nunca el placer de jugar.', de:'Jede Welt lehrt etwas Wahres, ohne je den Spielspaß zu opfern.', ar:'كل عالم يُعلّم شيئاً حقيقياً، دون التضحية بمتعة اللعب.', zh:'每个世界都传递真实之物、绝不牺牲游戏的乐趣。', ja:'すべての世界は本物の何かを伝える、遊ぶ喜びを犠牲にせずに。', ru:'Каждый мир учит чему-то настоящему, не жертвуя радостью игры.', pl:'Każdy świat uczy czegoś prawdziwego, nigdy nie kosztem radości z gry.', it:'Ogni mondo insegna qualcosa di vero, senza mai sacrificare il piacere del gioco.' } },
    { k:'move', t:{ fr:'ÉMOUVOIR', en:'MOVE', es:'EMOCIONAR', de:'BEWEGEN', ar:'نُحرّك', zh:'触动', ja:'動かす', ru:'ТРОГАТЬ', pl:'PORUSZAĆ', it:'EMOZIONARE' },
      d:{ fr:'On vise l’émotion réelle : la chair de poule, les larmes, le cœur qui s’emballe.', en:'We aim for real emotion: the chills, the tears, the racing heart.', es:'Buscamos emoción real: los escalofríos, las lágrimas, el corazón acelerado.', de:'Wir zielen auf echte Emotion: Gänsehaut, Tränen, rasendes Herz.', ar:'نسعى إلى عاطفة حقيقية: القشعريرة، الدموع، تسارع القلب.', zh:'我们追求真实的情感：战栗、泪水、心跳加速。', ja:'本物の感情を目指す、震え、涙、高鳴る鼓動。', ru:'Мы стремимся к настоящим эмоциям: мурашки, слёзы, бешеное сердце.', pl:'Dążymy do prawdziwych emocji: dreszcze, łzy, przyspieszone bicie serca.', it:'Puntiamo all\'emozione vera: i brividi, le lacrime, il cuore in corsa.' } },
    { k:'haunt', t:{ fr:'HANTER', en:'HAUNT', es:'PERDURAR', de:'NACHHALLEN', ar:'نبقى', zh:'萦绕', ja:'刻む', ru:'ПРЕСЛЕДОВАТЬ', pl:'NAWIEDZAĆ', it:'RESTARE' },
      d:{ fr:'Nos histoires restent. Longtemps après l’écran noir, elles continuent de vous habiter.', en:'Our stories linger. Long after the screen goes dark, they stay with you.', es:'Nuestras historias perduran. Mucho después de apagarse la pantalla, siguen contigo.', de:'Unsere Geschichten bleiben. Lange nach dem schwarzen Bildschirm wirken sie nach.', ar:'قصصنا تبقى. بعد انطفاء الشاشة بوقت طويل، تظل معك.', zh:'我们的故事会留下。屏幕熄灭很久之后，依然萦绕于心。', ja:'物語は残る。画面が暗くなった後も、ずっと心に。', ru:'Наши истории остаются. Долго после того, как экран гаснет, они с вами.', pl:'Nasze historie zostają. Długo po wygaśnięciu ekranu wciąż w tobie trwają.', it:'Le nostre storie restano. Molto dopo lo schermo nero, rimangono con te.' } },
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

/* ── CINEMA SPLIT, team member cards ── */
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

  // Stat labels, contextual info, never repeating the role title
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

  // Photo panel, cinematic identity overlay (pseudonym large, real name + role below)
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

  // Info panel, quote dominates, role shown once, stats provide fresh context
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
   DETAIL PAGE, GLG SIGNATURE v2
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
let _dpStickyObs = null, _dpStickyEndObs = null;
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
  // Dock mobile : la barre s'efface dès que "À découvrir aussi" OU le footer
  // est à l'écran (sinon elle chevauche la fin de page).
  const ends = ['#page-detail .dp-related', '#page-detail footer', '#page-detail .footer']
    .map(sel => document.querySelector(sel)).filter(Boolean);
  if (_dpStickyEndObs) _dpStickyEndObs.disconnect();
  if (ends.length) {
    const vis = new Set();
    _dpStickyEndObs = new IntersectionObserver(entries => {
      entries.forEach(e => e.isIntersecting ? vis.add(e.target) : vis.delete(e.target));
      bar.classList.toggle('dp-sticky--end', vis.size > 0);
    }, { threshold: 0.05 });
    ends.forEach(el => _dpStickyEndObs.observe(el));
  }
}

/* ── 18+ gate screens (anonymous confirm / minor block) ── */
const _AGE_T = {
  title:  { fr:'Contenu 18+', en:'18+ Content', es:'Contenido +18', de:'18+ Inhalt', it:'Contenuto 18+', ar:'محتوى +18', zh:'18+ 内容', ja:'18歳以上向けコンテンツ', ru:'Контент 18+', pl:'Treści 18+' },
  q:      { fr:"Ce titre est réservé aux personnes majeures (18 ans et plus). Confirmes-tu avoir 18 ans ou plus ?", en:'This title is rated 18+. Please confirm you are 18 or older.', es:'Este título es solo para mayores de 18. ¿Confirmas que tienes 18 años o más?', de:'Dieser Titel ist ab 18. Bestätigst du, dass du 18 oder älter bist?', it:'Questo titolo è 18+. Confermi di avere almeno 18 anni?', ar:'هذا العنوان مخصص للبالغين (18 عامًا فأكثر). هل تؤكد أنك تبلغ 18 عامًا أو أكثر؟', zh:'本作品仅限18岁及以上人士。请确认您已年满18岁。', ja:'このタイトルは18歳以上対象です。18歳以上であることを確認してください。', ru:'Этот тайтл предназначен для лиц 18+. Подтвердите, что вам есть 18 лет.', pl:'Ten tytuł jest przeznaczony dla osób 18+. Potwierdź, że masz ukończone 18 lat.' },
  yes:    { fr:"Oui, j'ai 18 ans ou plus", en:"Yes, I'm 18 or older", es:'Sí, tengo 18 o más', de:'Ja, ich bin 18 oder älter', it:'Sì, ho almeno 18 anni', ar:'نعم، عمري 18 عامًا أو أكثر', zh:'是的，我已年满18岁', ja:'はい、18歳以上です', ru:'Да, мне есть 18 лет', pl:'Tak, mam ukończone 18 lat' },
  no:     { fr:'Non, retour', en:'No, go back', es:'No, volver', de:'Nein, zurück', it:'No, indietro', ar:'لا، العودة', zh:'否，返回', ja:'いいえ、戻る', ru:'Нет, назад', pl:'Nie, wróć' },
  blocked:{ fr:"Ce contenu n'est pas disponible.", en:'This content is not available.', es:'Este contenido no está disponible.', de:'Dieser Inhalt ist nicht verfügbar.', it:'Questo contenuto non è disponibile.', ar:'هذا المحتوى غير متاح.', zh:'此内容不可用。', ja:'このコンテンツは利用できません。', ru:'Этот контент недоступен.', pl:'Ta treść jest niedostępna.' },
  back:   { fr:'Retour aux œuvres', en:'Back to works', es:'Volver a las obras', de:'Zurück zu den Werken', it:'Torna alle opere', ar:'العودة إلى الأعمال', zh:'返回作品', ja:'作品一覧へ戻る', ru:'Назад к работам', pl:'Powrót do prac' },
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

/* Ornements vectoriels latéraux du hero, donnent une identité (teinte) propre
   à chaque fiche, façon HUD/key-art de store AAA. Décoratif, sous le texte. */
function _dpHeroArtHTML(item) {
  const tint = item.tint || '#ffffff';
  return `
    <div class="dp-hero-art" aria-hidden="true" style="color:${tint}">
      <svg class="dp-art dp-art--l" viewBox="0 0 220 700" preserveAspectRatio="xMidYMid slice" fill="none">
        <circle cx="-130" cy="350" r="300" stroke="currentColor" stroke-width="1.1" opacity=".30"/>
        <circle cx="-130" cy="350" r="225" stroke="currentColor" stroke-width="1"   opacity=".18"/>
        <line x1="62" y1="46" x2="62" y2="654" stroke="currentColor" stroke-width="1.1" opacity=".5"/>
        <line x1="50" y1="130" x2="74" y2="130" stroke="currentColor" stroke-width="1.1" opacity=".5"/>
        <line x1="50" y1="350" x2="74" y2="350" stroke="currentColor" stroke-width="1.1" opacity=".5"/>
        <line x1="50" y1="570" x2="74" y2="570" stroke="currentColor" stroke-width="1.1" opacity=".5"/>
        <circle cx="62" cy="350" r="6" stroke="currentColor" stroke-width="1.2" opacity=".75"/>
        <rect x="40" y="408" width="9" height="9" stroke="currentColor" stroke-width="1.1" opacity=".5" transform="rotate(45 44 412)"/>
      </svg>
      <svg class="dp-art dp-art--r" viewBox="0 0 220 700" preserveAspectRatio="xMidYMid slice" fill="none">
        <circle cx="350" cy="350" r="300" stroke="currentColor" stroke-width="1.1" opacity=".30"/>
        <circle cx="350" cy="350" r="225" stroke="currentColor" stroke-width="1"   opacity=".18"/>
        <circle cx="350" cy="350" r="150" stroke="currentColor" stroke-width=".8"  opacity=".12"/>
        <line x1="158" y1="46" x2="158" y2="654" stroke="currentColor" stroke-width="1.1" opacity=".5"/>
        <path d="M146 210h24M158 198v24" stroke="currentColor" stroke-width="1.1" opacity=".6"/>
        <path d="M146 490h24M158 478v24" stroke="currentColor" stroke-width="1.1" opacity=".6"/>
      </svg>
    </div>`;
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
  const localPrice       = getPriceNow(item); // remise déduite (promo éventuelle)
  const basePriceNow     = (item.isFree || item.basePrice == null) ? '' : promoPrice(item);
  const owned            = _ownsWork(item.id); // possédé → JOUER/INSTALLER au lieu d'ACHETER
  const noPrice          = !item.isFree && item.basePrice == null; // teaser : prix à l'annonce

  // Build marquee content (repeated twice for seamless loop)
  const mqItems = [
    `<span class="dp-mq-item">${t('infoType')} <b>${localCat}</b></span><span class="dp-mq-dot">✦</span>`,
    `<span class="dp-mq-item">${t('infoYear')} <b>${item.year}</b></span><span class="dp-mq-dot">✦</span>`,
    `<span class="dp-mq-item">${t('infoStudio')} <b>GEEKLEARN GAMES</b></span><span class="dp-mq-dot">✦</span>`,
    `<span class="dp-mq-item">${t('infoStatus')} <b>${localStatus}</b></span><span class="dp-mq-dot">✦</span>`,
    noPrice
      ? `<span class="dp-mq-item">${t('infoPrice')} <b>${t('priceTBA')}</b></span><span class="dp-mq-dot">✦</span>`
      : `<span class="dp-mq-item">${t('infoPrice')} <b class="price-display" data-base-price="${basePriceNow}">${localPrice}</b></span><span class="dp-mq-dot">✦</span>`,
  ].join('');
  // One base set; _seamlessMarquee() fills + duplicates it after render (gap-proof loop)

  container.innerHTML = `

    <!-- ──────── HERO ──────── -->
    <div class="dp-hero${item.artworks ? ' dp-hero--lantern' : ''}">
      <div class="dp-hero-bg" style="background-image:url('${av(item.cover)}')"></div>
      ${item.artworks ? `<div class="dp-lantern" aria-hidden="true" style="background-image:url('${av(item.cover)}')"></div>` : ''}
      <div class="dp-hero-vignette"></div>
      <div class="dp-hero-tint" style="background:${item.tint}"></div>
      ${_dpHeroArtHTML(item)}

      <button class="dp-back dp-back--min" onclick="showPage('works')" aria-label="${t('detailBack')}" title="${t('detailBack')}">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M13 8H3M7.5 3.5 3 8l4.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
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
          ${owned
            ? `<button class="btn btn-primary btn-lg" onclick="launcherHandoff('${item.id}','play')">▶ ${_lbt('play')}</button>`
            : noPrice
              ? `<button class="btn btn-primary btn-lg dp-hero-wish ${wishHas(item.id) ? 'on' : ''}" data-wish="${item.id}" aria-pressed="${wishHas(item.id)}" onclick="toggleWish('${item.id}',this)">${_HEART_SVG} <span data-wish-label>${wishHas(item.id) ? _wt('inList') : _wt('add')}</span></button>`
              : `<button class="btn btn-primary btn-lg" onclick="openBuyModal('${item.id}')">${t('buyNow')} · ${localPrice}</button>`}
          ${item.trailer ? `<button class="btn btn-outline btn-lg" onclick="openTrailerModal('${item.id}')">
            ▶ ${t('trailerBtn')}
          </button>` : ''}
        </div>
      </div>

      <div class="dp-hero-scroll" aria-hidden="true">
        <span class="dp-hero-scroll-label">Scroll</span>
        <div class="dp-hero-scroll-line"></div>
      </div>
    </div>

    <!-- ──────── STICKY BAR ──────── -->
    <div class="dp-sticky dp-sticky--v2" id="dp-sticky" aria-hidden="true">
      <div class="dp-sticky-inner">
        <span class="dp-sticky-cover" aria-hidden="true"><img src="${av(item.cover)}" alt="" loading="lazy" onerror="this.style.opacity=0"></span>
        <span class="dp-sticky-title">${item.title}</span>
        <span class="dp-sticky-sep">·</span>
        <span class="dp-sticky-cat">${localCat}</span>
        <button class="dp-sticky-wish ${wishHas(item.id)?'on':''}" data-wish="${item.id}" aria-pressed="${wishHas(item.id)}" onclick="toggleWish('${item.id}',this)" aria-label="${_wt('add')}">${_HEART_SVG}</button>
        ${owned
          ? `<span class="dp-sticky-price dp-sticky-owned">${_lbt('inLib')}</span>
        <button class="dp-sticky-buy" onclick="launcherHandoff('${item.id}','play')">▶ ${_lbt('play')}</button>`
          : noPrice
            ? `<span class="dp-sticky-price dp-sticky-tba">${item.year}</span>`
            : `<span class="dp-sticky-price">${priceHTML(item, { size:'sm' })}</span>
        <button class="dp-sticky-buy" onclick="openBuyModal('${item.id}')">${t('buyNow')} ${_ARR()}</button>`}
      </div>
    </div>


    <!-- Sous-nav ancrée : présentation · media · actus · évaluations + souhaits -->
    <div class="dp-subnav" aria-label="${item.title}">
      <button onclick="glgScrollToEl('.dp-story',8)">${t('aboutHead')}</button>
      <button onclick="glgScrollToEl('.dp-ss',8)">${item.artworks ? t('artHead') : t('ssHead')}</button>
      ${(typeof WORK_NEWS !== 'undefined' && WORK_NEWS[item.id] && WORK_NEWS[item.id].length) ? `<button onclick="glgScrollToEl('#dp-news',8)">${_NEWS_T.head[LANG] || _NEWS_T.head.en}</button>` : ''}
      <button onclick="glgScrollToEl('#dp-reviews',8)">${_rvt('section')}</button>
      <button class="dp-sn-wish ${wishHas(item.id) ? 'on' : ''}" data-wish="${item.id}" aria-pressed="${wishHas(item.id)}" onclick="toggleWish('${item.id}',this)">${_HEART_SVG} <span data-wish-label>${wishHas(item.id) ? _wt('inList') : _wt('add')}</span></button>
    </div>

    <!-- ──────── STORE LAYOUT, media (left) · buy panel (right) ──────── -->
    <div class="dp-store">
      <div class="dp-store-main">

        <!-- Media gallery -->
        <div class="dp-ss reveal">
          <div class="dp-sec-label">${item.artworks ? t('artHead') : t('ssHead')}</div>
          <div class="dp-ss-main">
            <div class="dp-ss-viewport">
              <div class="dp-ss-track" id="dp-ss-track-${item.id}">
                ${item.screenshots.map((ss, idx) => `
                  <div class="dp-ss-slide">
                    <img src="${av(ss)}" alt="${item.artworks ? 'Artwork' : 'Screenshot'} ${idx + 1}" loading="lazy" decoding="async"
                         onclick="openLightbox('${item.id}',${idx})"
                         onerror="this.closest('.dp-ss-slide').classList.add('dp-ss-ph')">
                  </div>`).join('')}
              </div>
            </div>
            <div class="dp-ss-nav">
              <button class="dp-ss-prev" onclick="dpSsNav('${item.id}',-1)" aria-label="${_ariaT('prev')}">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 3l-5 5 5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
              </button>
              <span class="dp-ss-counter" id="dp-ss-counter-${item.id}">1 / ${item.screenshots.length}</span>
              <button class="dp-ss-next" onclick="dpSsNav('${item.id}',1)" aria-label="${_ariaT('next')}">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
              </button>
            </div>
          </div>
          <div class="dp-ss-thumbs" id="dp-ss-thumbs-${item.id}">
            ${item.screenshots.map((ss, i) => `
              <button class="dp-ss-thumb ${i === 0 ? 'active' : ''}" onclick="dpSsGoTo('${item.id}',${i})" aria-label="${item.artworks ? 'Artwork' : 'Screenshot'} ${i + 1}">
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

        <!-- Update journal (Steam-style news) -->
        ${dpNewsSectionHTML(item)}

        <!-- Trophies teaser (store-style) -->
        ${dpTrophySectionHTML(item)}

        <!-- Player reviews (Steam-style) -->
        ${dpReviewsShellHTML(item)}

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
          ${owned ? `
          <div class="dp-buybox-owned">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.5 8.5l3.5 3.5 7.5-8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            ${_lbt('inLib')}
          </div>
          <button class="btn btn-primary dp-buybox-buy" onclick="launcherHandoff('${item.id}','play')">▶ ${_lbt('play')}</button>
          <button class="dp-buybox-trailer" onclick="launcherHandoff('${item.id}','install')">${_lbt('install')}</button>` : noPrice ? `
          <div class="dp-buybox-price dp-buybox-price--tba">${t('priceTBA')}</div>
          ${item.trailer ? `<button class="dp-buybox-trailer" onclick="openTrailerModal('${item.id}')">▶ ${t('trailerBtn')}</button>` : ''}` : `
          ${_dpEditionsHTML(item)}
          <div class="dp-buybox-price">${_editionPriceHTML(item)}</div>
          ${promoEndsHTML(item)}
          <button class="btn btn-primary dp-buybox-buy" onclick="openBuyModal('${item.id}')">${t('buyNow')} ${_ARR()}</button>
          <button class="dp-buybox-trailer" onclick="openTrailerModal('${item.id}')">▶ ${t('trailerBtn')}</button>`}
          <button class="dp-buybox-wish ${wishHas(item.id)?'on':''}" data-wish="${item.id}" aria-pressed="${wishHas(item.id)}" onclick="toggleWish('${item.id}',this)">
            <span class="dp-wish-ico">${_HEART_SVG}</span>
            <span class="dp-wish-label" data-wish-label>${wishHas(item.id)?_wt('inList'):_wt('add')}</span>
          </button>
          ${item.platforms.length ? `
          <div class="dp-buybox-sec">
            <div class="dp-sec-label">${t('platHead')}</div>
            <div class="dp-buybox-plats">
              ${item.platforms.map(p => `
                <button class="dp-buybox-plat" onclick="openBuyModal('${item.id}')" title="${_platCta(p)}">
                  <span class="dp-buybox-plat-ico" style="background:${PLATS[p].bg}">${PLATS[p].icon}</span>
                  <span class="dp-buybox-plat-name">${PLATS[p].name}</span>
                  <svg class="dp-buybox-plat-arr" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h10M8 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                </button>`).join('')}
            </div>
          </div>` : item.platformLabel ? `
          <div class="dp-buybox-sec">
            <div class="dp-sec-label">${t('platHead')}</div>
            <div class="dp-plat-simple">${item.platformLabel}</div>
          </div>` : ''}
          ${_dpCapsHTML(item)}
          <div class="dp-buybox-facts">
            <div class="dp-fact"><span>${t('infoStudio') || 'Studio'}</span><b>GEEKLEARN GAMES</b></div>
            <div class="dp-fact"><span>${t('infoType') || 'Type'}</span><b>${localCat}</b></div>
            <div class="dp-fact"><span>${t('infoYear') || 'Year'}</span><b>${item.year}</b></div>
            ${item.status !== 'available' ? `<div class="dp-fact"><span>${_tt('section')}</span><b>${t('trophiesTBA')}</b></div>` : _gameTrophySummary(item.id) ? `<div class="dp-fact dp-fact--btn" role="button" tabindex="0" onclick="openTrophyList('${item.id}')"><span>${_tt('section')}</span><b>${_gameTrophySummary(item.id).total} · ${_gameTrophySummary(item.id).tiers.platinum} ${_tt('platinum')} →</b></div>` : ''}
            <div class="dp-fact dp-fact--btn" id="dp-fact-rev" role="button" tabindex="0" style="display:none" onclick="glgScrollToEl('#dp-reviews',8)"><span>${_rvt('section')}</span><b></b></div>
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

  // Load player reviews (async, Supabase; shell renders instantly)
  _loadDpReviews(item);

  // Init scroll reveals on newly injected elements
  initReveal();

  // Re-attach magnetic effect to fresh detail page buttons
  initMagneticCTAs();

  // Trigger hero BG slow-zoom entrance
  requestAnimationFrame(() => {
    const hero = container.querySelector('.dp-hero');
    if (hero) requestAnimationFrame(() => hero.classList.add('dp-entered'));
    _glgLantern();
  });
}

/* ══════════════════════════════════════════
   JOURNAL DES MISES À JOUR (fiches, style Steam)
   Données : WORK_NEWS (data.js). Œuvre sans entrée → section absente.
══════════════════════════════════════════ */
const _NEWS_T = {
  head: { fr:'Actualités & mises à jour', en:'News & updates', es:'Noticias y actualizaciones', de:'Neuigkeiten & Updates', it:'Notizie e aggiornamenti', ar:'الأخبار والتحديثات', zh:'新闻与更新', ja:'ニュースとアップデート', ru:'Новости и обновления', pl:'Aktualności i aktualizacje' },
  tags: {
    update:   { fr:'Mise à jour', en:'Update', es:'Actualización', de:'Update', it:'Aggiornamento', ar:'تحديث', zh:'更新', ja:'アップデート', ru:'Обновление', pl:'Aktualizacja' },
    devlog:   { fr:'Devlog', en:'Devlog', es:'Devlog', de:'Devlog', it:'Devlog', ar:'مذكرات التطوير', zh:'开发日志', ja:'開発日誌', ru:'Девлог', pl:'Devlog' },
    announce: { fr:'Annonce', en:'Announcement', es:'Anuncio', de:'Ankündigung', it:'Annuncio', ar:'إعلان', zh:'公告', ja:'お知らせ', ru:'Анонс', pl:'Ogłoszenie' },
  },
};
function dpNewsSectionHTML(item) {
  const list = (typeof WORK_NEWS !== 'undefined' && WORK_NEWS[item.id]) || [];
  if (!list.length) return '';
  const entries = [...list].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 4);
  return `
    <div class="dp-news" id="dp-news">
      <div class="dp-sec-label reveal">${_NEWS_T.head[LANG] || _NEWS_T.head.en}</div>
      <div class="dp-news-list">
        ${entries.map((n, i) => {
          let d = n.date;
          try { d = new Date(n.date + 'T12:00:00').toLocaleDateString(LANG_LOCALE[LANG] || 'en-US', { day:'numeric', month:'short', year:'numeric' }); } catch (e) {}
          const tag = _NEWS_T.tags[n.tag] || _NEWS_T.tags.update;
          return `
          <article class="dp-news-item reveal" style="transition-delay:${i * 0.05}s">
            <div class="dp-news-side">
              <time class="dp-news-date" datetime="${n.date}">${d}</time>
              <span class="dp-news-tag dp-news-tag--${n.tag}">${tag[LANG] || tag.en}</span>
            </div>
            <div class="dp-news-main">
              <h3 class="dp-news-title">${n.title[LANG] || n.title.en}</h3>
              <p class="dp-news-body">${n.body[LANG] || n.body.en}</p>
            </div>
          </article>`;
        }).join('')}
      </div>
    </div>`;
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
  it:'Altri universi firmati GEEKLEARN GAMES.', ar:'عوالم أخرى من توقيع GEEKLEARN GAMES.',
  zh:'更多出自 GEEKLEARN GAMES 的世界。', ja:'GEEKLEARN GAMESが手がけた別の世界たち。',
  ru:'Другие миры от GEEKLEARN GAMES.', pl:'Inne światy od GEEKLEARN GAMES.',
};
const _RELATED_ALL  = { fr:'Tout voir', en:'View all', es:'Ver todo', de:'Alle ansehen', it:'Vedi tutto', ar:'عرض الكل', zh:'查看全部', ja:'すべて見る', ru:'Смотреть все', pl:'Zobacz wszystko' };
const _RELATED_VIEW = { fr:'Voir la fiche', en:'View page', es:'Ver ficha', de:'Ansehen', it:'Scheda', ar:'عرض الصفحة', zh:'查看页面', ja:'ページを見る', ru:'К странице', pl:'Zobacz stronę' };
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
                <span class="dp-rel-price">${priceHTML(w, { size:'sm' })}</span>
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
/* « Acheter sur %s », localisé (PLATS.cta était de l'anglais en dur). */
const _BUYON_T = { fr:'Acheter sur %s', en:'Buy on %s', es:'Comprar en %s', de:'Kaufen auf %s', it:'Acquista su %s', ar:'اشترِ على %s', zh:'在%s购买', ja:'%sで購入', ru:'Купить в %s', pl:'Kup na %s' };
const _platCta = p => (_BUYON_T[LANG] || _BUYON_T.en).replace('%s', (PLATS[p] && PLATS[p].name) || p);
/* Note honnête de la modale d'achat (les stores n'ont pas encore d'URL). */
const _BUYNOTE_T = {
  fr:'Les précommandes ouvriront ici à l’approche de la sortie, ajoute le titre à ta liste de souhaits pour être prévenu.',
  en:'Pre-orders will open here as release approaches, wishlist the title to get notified.',
  es:'Las reservas se abrirán aquí cuando se acerque el lanzamiento, añade el título a tu lista de deseos para recibir aviso.',
  de:'Vorbestellungen öffnen hier, wenn der Release näher rückt, setz den Titel auf deine Wunschliste, um benachrichtigt zu werden.',
  it:'I preordini apriranno qui all’avvicinarsi dell’uscita, aggiungi il titolo alla lista dei desideri per essere avvisato.',
  ar:'ستُفتح الطلبات المسبقة هنا مع اقتراب الإصدار، أضف اللعبة إلى قائمة رغباتك ليصلك إشعار.',
  zh:'临近发售时预购将在此开启、将作品加入心愿单即可收到通知。',
  ja:'発売が近づくとここで予約が始まります、ウィッシュリストに追加して通知を受け取りましょう。',
  ru:'Предзаказы откроются здесь ближе к выходу, добавьте игру в список желаемого, чтобы получить уведомление.',
  pl:'Przedsprzedaż ruszy tutaj przed premierą, dodaj tytuł do listy życzeń, aby dostać powiadomienie.',
};
function openBuyModal(id) {
  const item = ALL_WORKS.find(i => i.id === id);
  if (!item) return;
  setText('modal-eye', t('buyModal'));
  setText('modal-title', item.title);
  setText('modal-sub', `${getPriceNow(item)} · ${getStatusLabel(item)}`);
  // Rangées de plateformes NON cliquables (aucune URL de store n'existe
  // encore) : fini le faux bouton, état honnête + wishlist pour être prévenu.
  setHTML('modal-plats', item.platforms.map(p => `
    <div class="plat-btn plat-btn--static">
      <div class="plat-ico-lg" style="background:${PLATS[p].bg}">${PLATS[p].icon}</div>
      <div>
        <div class="plat-nm">${PLATS[p].name}</div>
        <div class="plat-cta">${_platCta(p)}</div>
      </div>
    </div>
  `).join('') + `
    <p class="buy-note">${_BUYNOTE_T[LANG] || _BUYNOTE_T.en}</p>
    <button class="btn btn-outline buy-wish ${wishHas(item.id) ? 'on' : ''}" data-wish="${item.id}" aria-pressed="${wishHas(item.id)}" onclick="toggleWish('${item.id}',this)">
      <span class="dp-wish-ico">${_HEART_SVG}</span>
      <span data-wish-label>${wishHas(item.id) ? _wt('inList') : _wt('add')}</span>
    </button>`);
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
        <p>${item.title}, ${_sct('sub')}</p>
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
  // DANS le launcher : pas de footer, un launcher est une APPLICATION
  // (Steam/Discord/Epic n'en ont pas). Le footer reste un geste de site web.
  if (IS_TAURI) return '';
  const nav = t('nav'); // [home, works, about, contact]
  return `
  <footer>
    <div class="footer-inner">
      <div class="footer-col footer-brand">
        <div class="footer-brand-frame">
          <span class="fb-corner fb-tl" aria-hidden="true"></span>
          <span class="fb-corner fb-tr" aria-hidden="true"></span>
          <span class="fb-corner fb-bl" aria-hidden="true"></span>
          <span class="fb-corner fb-br" aria-hidden="true"></span>
          <div class="footer-logo">
            <img src="assets/img/brand/glg-logo-white.png" alt="GLG" onerror="this.style.display='none'">
          </div>
          <p class="footer-brand-desc">${t('footerDesc')}</p>
        </div>
      </div>
      <div class="footer-col">
        <div class="footer-col-title">${t('footerNavTitle')}</div>
        <div class="footer-links">
          <button onclick="showPage('home')">${nav[0]}</button>
          <button onclick="showPage('works')">${nav[1]}</button>
          ${IS_TAURI ? `<button class="footer-lib" onclick="showPage('library')">${_lbt('navLabel')}</button>` : ''}
          <button onclick="showPage('about')">${nav[2]}</button>
          <button onclick="showPage('contact')">${nav[3]}</button>
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
    <div class="footer-legal-row">
      <button onclick="showPage('press')">${_pt('title')}</button>
      <span class="flr-dot" aria-hidden="true">·</span>
      <button onclick="showPage('journal')">${_jt('title')}</button>
      <span class="flr-dot" aria-hidden="true">·</span>
      <button onclick="showPage('legal')">${_lgt('legalTitle')}</button>
      <span class="flr-dot" aria-hidden="true">·</span>
      <button onclick="showPage('privacy')">${_lgt('privacyTitle')}</button>
      <span class="flr-dot" aria-hidden="true">·</span>
      <button onclick="showPage('terms')">${_lgt('termsTitle')}</button>
      <a class="flr-mail" href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a>
    </div>
    <div class="footer-bottom">
      <span class="footer-copy">© ${new Date().getFullYear()} GeekLearn Games · ${t('copyright')}</span>
      <span class="footer-sig">GEEKLEARN GAMES · Blyes, Ain · MMXXVI</span>
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


/* ══ PAGES LÉGALES ═══════════════════════════════════════════════════════
   Mentions légales · Confidentialité · CGU, sobres, exactes, reliées au
   pied de page. La version française fait foi ; les autres langues portent
   la mention. Contenu construit à la demande (showPage → buildLegalPage). ══ */
const _LEGAL_UPDATED = '2026-08-21';
const _LEGAL_T = {
  legalTitle:   { fr:'Mentions légales', en:'Legal notice', es:'Aviso legal', de:'Impressum', it:'Note legali', ar:'إشعار قانوني', zh:'法律声明', ja:'法的表記', ru:'Правовая информация', pl:'Nota prawna' },
  privacyTitle: { fr:'Confidentialité', en:'Privacy', es:'Privacidad', de:'Datenschutz', it:'Privacy', ar:'الخصوصية', zh:'隐私政策', ja:'プライバシー', ru:'Конфиденциальность', pl:'Prywatność' },
  termsTitle:   { fr:'Conditions d’utilisation', en:'Terms of use', es:'Condiciones de uso', de:'Nutzungsbedingungen', it:'Condizioni d’uso', ar:'شروط الاستخدام', zh:'使用条款', ja:'利用規約', ru:'Условия использования', pl:'Warunki korzystania' },
  updated:      { fr:'Dernière mise à jour', en:'Last updated', es:'Última actualización', de:'Zuletzt aktualisiert', it:'Ultimo aggiornamento', ar:'آخر تحديث', zh:'最近更新', ja:'最終更新', ru:'Обновлено', pl:'Ostatnia aktualizacja' },
  prevail:      { fr:'La version française fait foi.', en:'The French version prevails.', es:'La versión francesa prevalece.', de:'Die französische Fassung ist maßgeblich.', it:'Fa fede la versione francese.', ar:'النسخة الفرنسية هي المرجع.', zh:'以法语版本为准。', ja:'正文はフランス語版とします。', ru:'Преимущественную силу имеет французская версия.', pl:'Wiążąca jest wersja francuska.' },
  legalBody: {
    fr:`<h3>Éditeur du site</h3>
<p>GEEKLEARN GAMES, entreprise individuelle de M. Evan Preney.<br>SIRET : 104 149 414 00033 · Blyes (Ain), France.<br>Contact : <a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a></p>
<h3>Directeur de la publication</h3>
<p>Evan Preney.</p>
<h3>Hébergement</h3>
<p>Site hébergé par GitHub, Inc. (service GitHub Pages) : 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis, <a href="https://github.com" target="_blank" rel="noopener">github.com</a>.<br>Les services de comptes et de données communautaires sont fournis par Supabase, Inc.</p>
<h3>Propriété intellectuelle</h3>
<p>L’ensemble des contenus du site (textes, visuels, logos, marques, mondes et titres, dont LUMBRA) est la propriété de GEEKLEARN GAMES, sauf mention contraire. Toute reproduction non autorisée est interdite. Les marques tierces citées appartiennent à leurs propriétaires respectifs.</p>
<h3>Signalement</h3>
<p>Pour signaler un contenu ou poser une question relative au site : <a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a>.</p>`,
    en:`<h3>Publisher</h3>
<p>GEEKLEARN GAMES, sole proprietorship of Mr Evan Preney.<br>SIRET (French company id): 104 149 414 00033 · Blyes (Ain), France.<br>Contact: <a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a></p>
<h3>Publication director</h3>
<p>Evan Preney.</p>
<h3>Hosting</h3>
<p>Website hosted by GitHub, Inc. (GitHub Pages) : 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, USA, <a href="https://github.com" target="_blank" rel="noopener">github.com</a>.<br>Account and community data services are provided by Supabase, Inc.</p>
<h3>Intellectual property</h3>
<p>All site content (texts, visuals, logos, trademarks, worlds and titles, including LUMBRA) belongs to GEEKLEARN GAMES unless stated otherwise. Unauthorised reproduction is prohibited. Third-party trademarks belong to their respective owners.</p>
<h3>Reporting</h3>
<p>To report content or ask a question about the site: <a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a>.</p>`,
    es:`<h3>Editor</h3><p>GEEKLEARN GAMES : empresa individual de Evan Preney.<br>SIRET: 104 149 414 00033 · Blyes (Ain), Francia.<br>Contacto: <a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a></p><h3>Director de la publicación</h3><p>Evan Preney.</p><h3>Alojamiento</h3><p>Sitio alojado por GitHub, Inc. (GitHub Pages), 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, EE. UU. Los servicios de cuentas y datos comunitarios los presta Supabase, Inc.</p><h3>Propiedad intelectual</h3><p>Todo el contenido del sitio (textos, visuales, logotipos, marcas, mundos y títulos, incluido LUMBRA) pertenece a GEEKLEARN GAMES salvo indicación contraria. Queda prohibida la reproducción no autorizada.</p><h3>Avisos</h3><p>Para señalar un contenido: <a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a>.</p>`,
    de:`<h3>Herausgeber</h3><p>GEEKLEARN GAMES : Einzelunternehmen von Evan Preney.<br>SIRET: 104 149 414 00033 · Blyes (Ain), Frankreich.<br>Kontakt: <a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a></p><h3>Verantwortlich für die Veröffentlichung</h3><p>Evan Preney.</p><h3>Hosting</h3><p>Website gehostet von GitHub, Inc. (GitHub Pages), 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, USA. Konto- und Community-Datendienste werden von Supabase, Inc. bereitgestellt.</p><h3>Geistiges Eigentum</h3><p>Alle Inhalte der Website (Texte, Bilder, Logos, Marken, Welten und Titel, einschließlich LUMBRA) gehören GEEKLEARN GAMES, sofern nicht anders angegeben. Unerlaubte Vervielfältigung ist untersagt.</p><h3>Meldungen</h3><p>Inhalte melden: <a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a>.</p>`,
    it:`<h3>Editore</h3><p>GEEKLEARN GAMES : impresa individuale di Evan Preney.<br>SIRET: 104 149 414 00033 · Blyes (Ain), Francia.<br>Contatto: <a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a></p><h3>Direttore della pubblicazione</h3><p>Evan Preney.</p><h3>Hosting</h3><p>Sito ospitato da GitHub, Inc. (GitHub Pages), 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, USA. I servizi di account e dati della community sono forniti da Supabase, Inc.</p><h3>Proprietà intellettuale</h3><p>Tutti i contenuti del sito (testi, immagini, loghi, marchi, mondi e titoli, incluso LUMBRA) appartengono a GEEKLEARN GAMES salvo diversa indicazione. È vietata la riproduzione non autorizzata.</p><h3>Segnalazioni</h3><p>Per segnalare un contenuto: <a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a>.</p>`,
    ar:`<h3>الناشر</h3><p>GEEKLEARN GAMES : مؤسسة فردية للسيد إيفان بريني.<br>SIRET: ‏104 149 414 00033 · بلييس (Ain)، فرنسا.<br>التواصل: <a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a></p><h3>مدير النشر</h3><p>إيفان بريني.</p><h3>الاستضافة</h3><p>الموقع مستضاف لدى GitHub, Inc.‏ (GitHub Pages)، سان فرانسيسكو، الولايات المتحدة. خدمات الحسابات وبيانات المجتمع تقدمها Supabase, Inc.</p><h3>الملكية الفكرية</h3><p>جميع محتويات الموقع (نصوص وصور وشعارات وعلامات وعوالم وعناوين، بما فيها LUMBRA) ملك لـ GEEKLEARN GAMES ما لم يُذكر خلاف ذلك. يُمنع النسخ غير المصرّح به.</p><h3>الإبلاغ</h3><p>للإبلاغ عن محتوى: <a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a>.</p>`,
    zh:`<h3>网站出版方</h3><p>GEEKLEARN GAMES, Evan Preney 的个体企业。<br>SIRET：104 149 414 00033 · 法国安省布利耶斯。<br>联系：<a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a></p><h3>出版负责人</h3><p>Evan Preney。</p><h3>托管</h3><p>网站由 GitHub, Inc.（GitHub Pages）托管、美国旧金山。账户与社区数据服务由 Supabase, Inc. 提供。</p><h3>知识产权</h3><p>本站全部内容（文字、视觉、标识、商标、世界与作品名，包括 LUMBRA）除另有说明外均归 GEEKLEARN GAMES 所有，禁止未经授权的复制。</p><h3>举报</h3><p>举报内容请联系：<a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a>。</p>`,
    ja:`<h3>サイト運営者</h3><p>GEEKLEARN GAMES, Evan Preney の個人事業。<br>SIRET：104 149 414 00033 · フランス、アン県ブリエス。<br>連絡先：<a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a></p><h3>発行責任者</h3><p>Evan Preney。</p><h3>ホスティング</h3><p>本サイトは GitHub, Inc.（GitHub Pages, 米国サンフランシスコ）にホストされています。アカウントとコミュニティデータのサービスは Supabase, Inc. が提供します。</p><h3>知的財産</h3><p>本サイトの全コンテンツ（テキスト、ビジュアル、ロゴ、商標、世界観とタイトル、LUMBRAを含む）は、特記なき限り GEEKLEARN GAMES に帰属します。無断複製を禁じます。</p><h3>通報</h3><p>コンテンツの通報：<a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a></p>`,
    ru:`<h3>Издатель сайта</h3><p>GEEKLEARN GAMES : индивидуальное предприятие Эвана Прене.<br>SIRET: 104 149 414 00033 · Блиес (Эн), Франция.<br>Контакт: <a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a></p><h3>Директор публикации</h3><p>Эван Прене.</p><h3>Хостинг</h3><p>Сайт размещён у GitHub, Inc. (GitHub Pages), Сан-Франциско, США. Сервисы аккаунтов и данных сообщества предоставляет Supabase, Inc.</p><h3>Интеллектуальная собственность</h3><p>Все материалы сайта (тексты, изображения, логотипы, товарные знаки, миры и названия, включая LUMBRA) принадлежат GEEKLEARN GAMES, если не указано иное. Несанкционированное воспроизведение запрещено.</p><h3>Жалобы</h3><p>Сообщить о контенте: <a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a>.</p>`,
    pl:`<h3>Wydawca</h3><p>GEEKLEARN GAMES : działalność jednoosobowa Evana Preneya.<br>SIRET: 104 149 414 00033 · Blyes (Ain), Francja.<br>Kontakt: <a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a></p><h3>Dyrektor publikacji</h3><p>Evan Preney.</p><h3>Hosting</h3><p>Strona hostowana przez GitHub, Inc. (GitHub Pages), San Francisco, USA. Usługi kont i danych społeczności zapewnia Supabase, Inc.</p><h3>Własność intelektualna</h3><p>Wszystkie treści strony (teksty, grafiki, loga, znaki, światy i tytuły, w tym LUMBRA) należą do GEEKLEARN GAMES, o ile nie wskazano inaczej. Nieautoryzowane kopiowanie jest zabronione.</p><h3>Zgłoszenia</h3><p>Zgłoś treść: <a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a>.</p>`,
  },
  privacyBody: {
    fr:`<h3>Responsable de traitement</h3>
<p>Evan Preney, GEEKLEARN GAMES, Blyes (Ain), France. Toute demande : <a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a>.</p>
<h3>Ce que nous collectons</h3>
<p>Un compte est facultatif pour parcourir le site. Si tu en crées un : adresse e-mail, pseudonyme, mot de passe (haché, jamais lisible), et les éléments que tu choisis d’ajouter (avatar, bio, âge, liste de souhaits, messages du chat). C’est tout : pas de profilage publicitaire, pas de collecte cachée.</p>
<h3>Ce que nous en faisons</h3>
<p>Faire fonctionner les services : compte, bibliothèque, amis, chat, trophées. Tes données ne sont jamais vendues ni transmises à des fins publicitaires.</p>
<h3>Stockage local</h3>
<p>Le site n’utilise qu’un stockage strictement nécessaire (langue choisie, préférences d’interface, session de connexion). Aucun cookie publicitaire, aucun traceur tiers, c’est pourquoi aucun bandeau de consentement n’est requis.</p>
<h3>Hébergement et sécurité</h3>
<p>Les données de compte sont hébergées chez Supabase, Inc. et chiffrées en transit. La double authentification (2FA) est disponible dans les Options.</p>
<h3>Durées et suppression</h3>
<p>Ton compte est conservé tant que tu l’utilises. Tu peux le supprimer toi-même à tout moment (Options → Compte) : la suppression est effective immédiatement.</p>
<h3>Tes droits</h3>
<p>Accès, rectification, effacement, portabilité, opposition : écris-nous à <a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a>. Tu peux aussi saisir la CNIL (cnil.fr).</p>
<h3>Âge minimum</h3>
<p>La création de compte est réservée aux personnes de 13 ans et plus.</p>`,
    en:`<h3>Data controller</h3>
<p>Evan Preney, GEEKLEARN GAMES, Blyes (Ain), France. Any request: <a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a>.</p>
<h3>What we collect</h3>
<p>An account is optional for browsing. If you create one: e-mail address, username, password (hashed, never readable), and whatever you choose to add (avatar, bio, age, wishlist, chat messages). That is all: no ad profiling, no hidden collection.</p>
<h3>What we do with it</h3>
<p>Run the services: account, library, friends, chat, trophies. Your data is never sold nor shared for advertising.</p>
<h3>Local storage</h3>
<p>The site only uses strictly necessary storage (chosen language, interface preferences, sign-in session). No advertising cookies, no third-party trackers, which is why no consent banner is required.</p>
<h3>Hosting and security</h3>
<p>Account data is hosted by Supabase, Inc. and encrypted in transit. Two-factor authentication (2FA) is available in Options.</p>
<h3>Retention and deletion</h3>
<p>Your account is kept while you use it. You can delete it yourself at any time (Options → Account): deletion is immediate.</p>
<h3>Your rights</h3>
<p>Access, rectification, erasure, portability, objection: write to <a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a>. You may also contact the French authority, CNIL (cnil.fr).</p>
<h3>Minimum age</h3>
<p>Account creation is restricted to people aged 13 and over.</p>`,
    es:`<h3>Responsable</h3><p>Evan Preney, GEEKLEARN GAMES, Blyes (Ain), Francia. Solicitudes: <a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a>.</p><h3>Qué recogemos</h3><p>La cuenta es opcional. Si creas una: e-mail, pseudónimo, contraseña (con hash) y lo que decidas añadir (avatar, bio, edad, lista de deseos, mensajes del chat). Sin perfiles publicitarios ni recogida oculta.</p><h3>Para qué</h3><p>Para operar los servicios: cuenta, biblioteca, amigos, chat, trofeos. Tus datos nunca se venden ni se comparten con fines publicitarios.</p><h3>Almacenamiento local</h3><p>Solo lo estrictamente necesario (idioma, preferencias, sesión). Sin cookies publicitarias ni rastreadores de terceros: por eso no se requiere banner de consentimiento.</p><h3>Alojamiento y seguridad</h3><p>Los datos de cuenta se alojan en Supabase, Inc., cifrados en tránsito. La 2FA está disponible en Opciones.</p><h3>Conservación y supresión</h3><p>Puedes eliminar tu cuenta en cualquier momento (Opciones → Cuenta): efecto inmediato.</p><h3>Tus derechos</h3><p>Acceso, rectificación, supresión, portabilidad, oposición: <a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a>. También ante la CNIL (cnil.fr).</p><h3>Edad mínima</h3><p>13 años o más para crear cuenta.</p>`,
    de:`<h3>Verantwortlicher</h3><p>Evan Preney : GEEKLEARN GAMES, Blyes (Ain), Frankreich. Anfragen: <a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a>.</p><h3>Was wir erheben</h3><p>Ein Konto ist optional. Wenn du eines erstellst: E-Mail, Nutzername, Passwort (gehasht) und was du hinzufügst (Avatar, Bio, Alter, Wunschliste, Chat-Nachrichten). Kein Werbeprofiling, keine versteckte Erhebung.</p><h3>Wofür</h3><p>Zum Betrieb der Dienste: Konto, Bibliothek, Freunde, Chat, Trophäen. Deine Daten werden nie verkauft oder zu Werbezwecken geteilt.</p><h3>Lokaler Speicher</h3><p>Nur das strikt Notwendige (Sprache, Einstellungen, Sitzung). Keine Werbe-Cookies, keine Dritt-Tracker, deshalb ist kein Consent-Banner nötig.</p><h3>Hosting und Sicherheit</h3><p>Kontodaten liegen bei Supabase, Inc., verschlüsselt übertragen. 2FA ist in den Optionen verfügbar.</p><h3>Speicherung und Löschung</h3><p>Du kannst dein Konto jederzeit selbst löschen (Optionen → Konto): sofort wirksam.</p><h3>Deine Rechte</h3><p>Auskunft, Berichtigung, Löschung, Übertragbarkeit, Widerspruch: <a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a>. Beschwerde: CNIL (cnil.fr).</p><h3>Mindestalter</h3><p>Konten ab 13 Jahren.</p>`,
    it:`<h3>Titolare</h3><p>Evan Preney, GEEKLEARN GAMES, Blyes (Ain), Francia. Richieste: <a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a>.</p><h3>Cosa raccogliamo</h3><p>L’account è facoltativo. Se ne crei uno: e-mail, pseudonimo, password (hash) e ciò che scegli di aggiungere (avatar, bio, età, lista dei desideri, messaggi della chat). Nessuna profilazione pubblicitaria, nessuna raccolta nascosta.</p><h3>Perché</h3><p>Per far funzionare i servizi: account, libreria, amici, chat, trofei. I tuoi dati non vengono mai venduti né condivisi a fini pubblicitari.</p><h3>Memorizzazione locale</h3><p>Solo lo strettamente necessario (lingua, preferenze, sessione). Niente cookie pubblicitari né tracker di terze parti: per questo non serve alcun banner di consenso.</p><h3>Hosting e sicurezza</h3><p>I dati dell’account sono ospitati da Supabase, Inc., cifrati in transito. La 2FA è disponibile nelle Opzioni.</p><h3>Conservazione e cancellazione</h3><p>Puoi eliminare l’account in ogni momento (Opzioni → Account): effetto immediato.</p><h3>I tuoi diritti</h3><p>Accesso, rettifica, cancellazione, portabilità, opposizione: <a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a>. Reclamo: CNIL (cnil.fr).</p><h3>Età minima</h3><p>Account dai 13 anni in su.</p>`,
    ar:`<h3>المسؤول عن المعالجة</h3><p>إيفان بريني : GEEKLEARN GAMES، بلييس (Ain)، فرنسا. للطلبات: <a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a>.</p><h3>ما نجمعه</h3><p>إنشاء الحساب اختياري. إن أنشأت حساباً: البريد الإلكتروني، الاسم المستعار، كلمة المرور (مجزّأة)، وما تختار إضافته (صورة، نبذة، عمر، قائمة أمنيات، رسائل الدردشة). لا تنميط إعلاني ولا جمع خفي.</p><h3>الغرض</h3><p>تشغيل الخدمات: الحساب والمكتبة والأصدقاء والدردشة والجوائز. لا تُباع بياناتك ولا تُشارك لأغراض إعلانية.</p><h3>التخزين المحلي</h3><p>الضروري فقط (اللغة، التفضيلات، الجلسة). لا كوكيز إعلانية ولا متتبعات طرف ثالث، لذلك لا حاجة لشريط موافقة.</p><h3>الاستضافة والأمان</h3><p>بيانات الحساب لدى Supabase, Inc. ومشفّرة أثناء النقل. المصادقة الثنائية متاحة في الخيارات.</p><h3>الحذف</h3><p>يمكنك حذف حسابك في أي وقت (الخيارات ← الحساب) وبأثر فوري.</p><h3>حقوقك</h3><p>الوصول والتصحيح والمحو والنقل والاعتراض: <a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a>. ويمكنك اللجوء إلى CNIL (cnil.fr).</p><h3>الحد الأدنى للعمر</h3><p>13 سنة فأكثر.</p>`,
    zh:`<h3>数据控制者</h3><p>Evan Preney, GEEKLEARN GAMES，法国安省布利耶斯。联系：<a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a>。</p><h3>我们收集什么</h3><p>浏览网站无需账户。若你创建账户：邮箱、昵称、密码（哈希存储）以及你自愿添加的内容（头像、简介、年龄、愿望单、聊天消息）。没有广告画像，没有隐藏收集。</p><h3>用途</h3><p>用于运行服务：账户、游戏库、好友、聊天、奖杯。你的数据绝不出售，也不用于广告。</p><h3>本地存储</h3><p>仅保存必要信息（语言、界面偏好、登录会话）。没有广告 Cookie，没有第三方追踪器、因此无需同意横幅。</p><h3>托管与安全</h3><p>账户数据托管于 Supabase, Inc.，传输加密。选项中可启用两步验证（2FA）。</p><h3>保存与删除</h3><p>你可随时自行删除账户（选项 → 账户），立即生效。</p><h3>你的权利</h3><p>访问、更正、删除、可携、反对：<a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a>。亦可向法国 CNIL（cnil.fr）投诉。</p><h3>最低年龄</h3><p>创建账户须年满13岁。</p>`,
    ja:`<h3>データ管理者</h3><p>Evan Preney, GEEKLEARN GAMES（フランス、アン県ブリエス）。お問い合わせ：<a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a></p><h3>収集する情報</h3><p>閲覧にアカウントは不要です。作成する場合：メールアドレス、ユーザー名、パスワード（ハッシュ化）、および任意で追加する情報（アバター、自己紹介、年齢、ウィッシュリスト、チャットメッセージ）。広告プロファイリングも隠れた収集もありません。</p><h3>利用目的</h3><p>アカウント、ライブラリ、フレンド、チャット、トロフィーなどのサービス運営のため。データを販売・広告目的で共有することはありません。</p><h3>ローカルストレージ</h3><p>必要最小限のみ（言語、UI設定、ログインセッション）。広告Cookieや第三者トラッカーはないため、同意バナーは不要です。</p><h3>ホスティングとセキュリティ</h3><p>アカウントデータは Supabase, Inc. にホストされ、通信は暗号化されます。オプションで2FAを利用できます。</p><h3>保存と削除</h3><p>アカウントはいつでも自分で削除できます（オプション→アカウント）。即時に反映されます。</p><h3>あなたの権利</h3><p>アクセス・訂正・消去・ポータビリティ・異議：<a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a>。CNIL（cnil.fr）への申立ても可能です。</p><h3>最低年齢</h3><p>アカウント作成は13歳以上。</p>`,
    ru:`<h3>Оператор данных</h3><p>Эван Прене : GEEKLEARN GAMES, Блиес (Эн), Франция. Запросы: <a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a>.</p><h3>Что мы собираем</h3><p>Аккаунт не обязателен для просмотра. Если вы его создаёте: e-mail, никнейм, пароль (в хешированном виде) и то, что вы сами добавляете (аватар, био, возраст, список желаемого, сообщения чата). Без рекламного профилирования и скрытого сбора.</p><h3>Зачем</h3><p>Для работы сервисов: аккаунт, библиотека, друзья, чат, трофеи. Данные никогда не продаются и не передаются для рекламы.</p><h3>Локальное хранилище</h3><p>Только необходимое (язык, настройки интерфейса, сессия). Нет рекламных cookie и сторонних трекеров, поэтому баннер согласия не требуется.</p><h3>Хостинг и безопасность</h3><p>Данные аккаунтов хранятся у Supabase, Inc., шифруются при передаче. Доступна 2FA (Настройки).</p><h3>Хранение и удаление</h3><p>Аккаунт можно удалить самостоятельно в любой момент (Настройки → Аккаунт), немедленно.</p><h3>Ваши права</h3><p>Доступ, исправление, удаление, переносимость, возражение: <a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a>. Жалоба, в CNIL (cnil.fr).</p><h3>Минимальный возраст</h3><p>С 13 лет.</p>`,
    pl:`<h3>Administrator danych</h3><p>Evan Preney : GEEKLEARN GAMES, Blyes (Ain), Francja. Wnioski: <a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a>.</p><h3>Co zbieramy</h3><p>Konto jest opcjonalne. Jeśli je założysz: e-mail, pseudonim, hasło (haszowane) oraz to, co sam dodasz (awatar, bio, wiek, lista życzeń, wiadomości czatu). Bez profilowania reklamowego i ukrytego zbierania.</p><h3>Po co</h3><p>Do działania usług: konto, biblioteka, znajomi, czat, trofea. Dane nigdy nie są sprzedawane ani udostępniane w celach reklamowych.</p><h3>Pamięć lokalna</h3><p>Tylko to, co niezbędne (język, preferencje, sesja). Bez reklamowych cookies i trackerów, dlatego baner zgody nie jest wymagany.</p><h3>Hosting i bezpieczeństwo</h3><p>Dane kont hostuje Supabase, Inc., szyfrowane w tranzycie. 2FA dostępne w Opcjach.</p><h3>Przechowywanie i usuwanie</h3><p>Konto możesz usunąć samodzielnie w każdej chwili (Opcje → Konto), ze skutkiem natychmiastowym.</p><h3>Twoje prawa</h3><p>Dostęp, sprostowanie, usunięcie, przenoszenie, sprzeciw: <a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a>. Skarga: CNIL (cnil.fr).</p><h3>Minimalny wiek</h3><p>Od 13 lat.</p>`,
  },
  termsBody: {
    fr:`<h3>Objet</h3>
<p>Ces conditions encadrent l’usage du site geeklearngames.com et de ses services communautaires gratuits : compte, liste de souhaits, bibliothèque, amis, chat et launcher de bureau, édités par GEEKLEARN GAMES.</p>
<h3>Compte</h3>
<p>Création réservée aux 13 ans et plus, avec des informations exactes. Tu es responsable de la confidentialité de ton mot de passe ; la double authentification est disponible et recommandée.</p>
<h3>Règles de conduite</h3>
<p>Sont interdits : harcèlement, contenus illicites ou haineux, usurpation d’identité, spam, perturbation du service. Le studio peut retirer un contenu, suspendre ou supprimer un compte qui enfreint ces règles.</p>
<h3>Tes contenus</h3>
<p>Tu restes titulaire de ce que tu publies (messages, avis, images). Tu accordes au studio la licence strictement nécessaire pour les afficher dans le service.</p>
<h3>Propriété intellectuelle</h3>
<p>Les mondes, marques, visuels et textes du studio sont protégés. Aucun droit ne t’est cédé en dehors de l’usage normal du site.</p>
<h3>Disponibilité</h3>
<p>Le service est fourni « en l’état », sans garantie de disponibilité continue. Nous faisons de notre mieux, et nous prévenons quand nous le pouvons.</p>
<h3>Évolution</h3>
<p>Ces conditions peuvent évoluer ; la version en vigueur est celle publiée sur cette page.</p>
<h3>Droit applicable</h3>
<p>Droit français. En cas de litige, une solution amiable sera recherchée avant toute action ; les tribunaux français sont compétents.</p>`,
    en:`<h3>Purpose</h3>
<p>These terms govern the use of geeklearngames.com and its free community services: account, wishlist, library, friends, chat and the desktop launcher, published by GEEKLEARN GAMES.</p>
<h3>Account</h3>
<p>Creation is restricted to ages 13 and over, with accurate information. You are responsible for keeping your password confidential; two-factor authentication is available and recommended.</p>
<h3>Code of conduct</h3>
<p>Prohibited: harassment, unlawful or hateful content, impersonation, spam, disrupting the service. The studio may remove content or suspend/delete an account that breaks these rules.</p>
<h3>Your content</h3>
<p>You remain the owner of what you post (messages, reviews, images). You grant the studio the licence strictly needed to display it within the service.</p>
<h3>Intellectual property</h3>
<p>The studio’s worlds, trademarks, visuals and texts are protected. No rights are transferred to you beyond normal use of the site.</p>
<h3>Availability</h3>
<p>The service is provided “as is”, with no guarantee of continuous availability. We do our best, and give notice when we can.</p>
<h3>Changes</h3>
<p>These terms may change; the applicable version is the one published on this page.</p>
<h3>Governing law</h3>
<p>French law. In case of dispute, an amicable solution will be sought first; French courts have jurisdiction.</p>`,
    es:`<h3>Objeto</h3><p>Estas condiciones regulan el uso de geeklearngames.com y de sus servicios comunitarios gratuitos (cuenta, lista de deseos, biblioteca, amigos, chat, launcher), editados por GEEKLEARN GAMES.</p><h3>Cuenta</h3><p>Solo a partir de 13 años, con información exacta. Eres responsable de tu contraseña; la 2FA está disponible y recomendada.</p><h3>Conducta</h3><p>Prohibidos: acoso, contenidos ilícitos u odiosos, suplantación, spam, perturbación del servicio. El estudio puede retirar contenidos o suspender cuentas.</p><h3>Tus contenidos</h3><p>Sigues siendo titular de lo que publicas; concedes solo la licencia necesaria para mostrarlo en el servicio.</p><h3>Propiedad intelectual</h3><p>Los mundos, marcas y textos del estudio están protegidos.</p><h3>Disponibilidad</h3><p>Servicio «tal cual», sin garantía de disponibilidad continua.</p><h3>Cambios</h3><p>La versión aplicable es la publicada en esta página.</p><h3>Derecho aplicable</h3><p>Derecho francés; tribunales franceses competentes, tras buscar una solución amistosa.</p>`,
    de:`<h3>Gegenstand</h3><p>Diese Bedingungen regeln die Nutzung von geeklearngames.com und seiner kostenlosen Community-Dienste (Konto, Wunschliste, Bibliothek, Freunde, Chat, Launcher), herausgegeben von GEEKLEARN GAMES.</p><h3>Konto</h3><p>Erst ab 13 Jahren, mit korrekten Angaben. Du bist für dein Passwort verantwortlich; 2FA ist verfügbar und empfohlen.</p><h3>Verhaltensregeln</h3><p>Verboten: Belästigung, rechtswidrige oder hasserfüllte Inhalte, Identitätsmissbrauch, Spam, Störung des Dienstes. Das Studio kann Inhalte entfernen oder Konten sperren.</p><h3>Deine Inhalte</h3><p>Du bleibst Inhaber deiner Beiträge; du gewährst nur die zur Anzeige nötige Lizenz.</p><h3>Geistiges Eigentum</h3><p>Welten, Marken und Texte des Studios sind geschützt.</p><h3>Verfügbarkeit</h3><p>Dienst „wie besehen“, ohne Garantie ständiger Verfügbarkeit.</p><h3>Änderungen</h3><p>Es gilt die auf dieser Seite veröffentlichte Fassung.</p><h3>Anwendbares Recht</h3><p>Französisches Recht; zuständig sind französische Gerichte, nach Suche einer gütlichen Einigung.</p>`,
    it:`<h3>Oggetto</h3><p>Queste condizioni regolano l’uso di geeklearngames.com e dei suoi servizi community gratuiti (account, lista dei desideri, libreria, amici, chat, launcher), editi da GEEKLEARN GAMES.</p><h3>Account</h3><p>Dai 13 anni in su, con informazioni esatte. Sei responsabile della tua password; la 2FA è disponibile e consigliata.</p><h3>Condotta</h3><p>Vietati: molestie, contenuti illeciti o d’odio, furto d’identità, spam, disturbo del servizio. Lo studio può rimuovere contenuti o sospendere account.</p><h3>I tuoi contenuti</h3><p>Resti titolare di ciò che pubblichi; concedi solo la licenza necessaria a mostrarlo nel servizio.</p><h3>Proprietà intellettuale</h3><p>Mondi, marchi e testi dello studio sono protetti.</p><h3>Disponibilità</h3><p>Servizio «così com’è», senza garanzia di disponibilità continua.</p><h3>Modifiche</h3><p>Vale la versione pubblicata su questa pagina.</p><h3>Legge applicabile</h3><p>Diritto francese; competenti i tribunali francesi, previa ricerca di una soluzione amichevole.</p>`,
    ar:`<h3>الموضوع</h3><p>تنظّم هذه الشروط استخدام geeklearngames.com وخدماته المجتمعية المجانية (الحساب، قائمة الأمنيات، المكتبة، الأصدقاء، الدردشة، المشغّل) الصادرة عن GEEKLEARN GAMES.</p><h3>الحساب</h3><p>من 13 سنة فأكثر وبمعلومات صحيحة. أنت مسؤول عن سرية كلمة مرورك؛ المصادقة الثنائية متاحة ومستحسنة.</p><h3>قواعد السلوك</h3><p>يُمنع: التحرش، المحتوى غير القانوني أو الكاره، انتحال الشخصية، السبام، تعطيل الخدمة. يمكن للاستوديو إزالة محتوى أو تعليق حساب مخالف.</p><h3>محتوياتك</h3><p>تبقى مالكاً لما تنشره؛ وتمنح الاستوديو الترخيص اللازم فقط لعرضه داخل الخدمة.</p><h3>الملكية الفكرية</h3><p>عوالم الاستوديو وعلاماته ونصوصه محمية.</p><h3>التوفر</h3><p>الخدمة مقدمة «كما هي» دون ضمان توفر دائم.</p><h3>التعديلات</h3><p>النسخة السارية هي المنشورة في هذه الصفحة.</p><h3>القانون المطبق</h3><p>القانون الفرنسي؛ والمحاكم الفرنسية مختصة بعد محاولة حل ودي.</p>`,
    zh:`<h3>目的</h3><p>本条款规范 geeklearngames.com 及其免费社区服务（账户、愿望单、游戏库、好友、聊天、启动器）的使用，由 GEEKLEARN GAMES 发布。</p><h3>账户</h3><p>须年满13岁并提供准确信息。你须妥善保管密码；建议启用两步验证。</p><h3>行为准则</h3><p>禁止：骚扰、违法或仇恨内容、冒充他人、垃圾信息、破坏服务。工作室可移除内容或暂停/删除违规账户。</p><h3>你的内容</h3><p>你发布的内容归你所有；你仅授予在服务内展示所需的许可。</p><h3>知识产权</h3><p>工作室的世界、商标、视觉与文字受保护。</p><h3>可用性</h3><p>服务按「现状」提供，不保证持续可用。</p><h3>变更</h3><p>以本页公布的版本为准。</p><h3>适用法律</h3><p>适用法国法律；争议先行友好协商，法国法院管辖。</p>`,
    ja:`<h3>目的</h3><p>本規約は、GEEKLEARN GAMES が提供する geeklearngames.com と無料コミュニティサービス（アカウント、ウィッシュリスト、ライブラリ、フレンド、チャット、ランチャー）の利用を定めます。</p><h3>アカウント</h3><p>13歳以上、正確な情報での登録が必要です。パスワードの管理はご自身の責任です。2FAの利用を推奨します。</p><h3>行動規範</h3><p>禁止事項：ハラスメント、違法・憎悪コンテンツ、なりすまし、スパム、サービス妨害。違反時、スタジオはコンテンツ削除やアカウント停止を行うことがあります。</p><h3>あなたのコンテンツ</h3><p>投稿物の権利はあなたに帰属します。サービス内で表示するために必要な範囲のみ許諾いただきます。</p><h3>知的財産</h3><p>スタジオの世界観、商標、ビジュアル、テキストは保護されています。</p><h3>可用性</h3><p>サービスは「現状有姿」で提供され、継続的な可用性は保証されません。</p><h3>変更</h3><p>適用されるのは本ページに掲載された最新版です。</p><h3>準拠法</h3><p>フランス法。紛争はまず友好的解決を図り、フランスの裁判所を管轄とします。</p>`,
    ru:`<h3>Предмет</h3><p>Эти условия регулируют использование geeklearngames.com и его бесплатных сервисов сообщества (аккаунт, список желаемого, библиотека, друзья, чат, лаунчер), издаваемых GEEKLEARN GAMES.</p><h3>Аккаунт</h3><p>С 13 лет, с точными данными. Вы отвечаете за сохранность пароля; доступна и рекомендуется 2FA.</p><h3>Правила поведения</h3><p>Запрещены: харассмент, незаконный или ненавистнический контент, выдача себя за другого, спам, нарушение работы сервиса. Студия может удалить контент или заблокировать аккаунт.</p><h3>Ваш контент</h3><p>Вы остаётесь владельцем публикуемого; студии предоставляется лишь лицензия, необходимая для отображения в сервисе.</p><h3>Интеллектуальная собственность</h3><p>Миры, знаки и тексты студии защищены.</p><h3>Доступность</h3><p>Сервис предоставляется «как есть», без гарантии непрерывной доступности.</p><h3>Изменения</h3><p>Действует версия, опубликованная на этой странице.</p><h3>Применимое право</h3><p>Французское право; компетентны французские суды, после попытки мирного урегулирования.</p>`,
    pl:`<h3>Przedmiot</h3><p>Niniejsze warunki regulują korzystanie z geeklearngames.com i jego bezpłatnych usług społecznościowych (konto, lista życzeń, biblioteka, znajomi, czat, launcher), wydawanych przez GEEKLEARN GAMES.</p><h3>Konto</h3><p>Od 13 lat, z prawdziwymi danymi. Odpowiadasz za poufność hasła; 2FA jest dostępne i zalecane.</p><h3>Zasady</h3><p>Zabronione: nękanie, treści bezprawne lub nienawistne, podszywanie się, spam, zakłócanie usługi. Studio może usuwać treści lub zawieszać konta.</p><h3>Twoje treści</h3><p>Pozostajesz właścicielem tego, co publikujesz; udzielasz jedynie licencji niezbędnej do wyświetlania w usłudze.</p><h3>Własność intelektualna</h3><p>Światy, znaki i teksty studia są chronione.</p><h3>Dostępność</h3><p>Usługa „taka, jaka jest”, bez gwarancji ciągłej dostępności.</p><h3>Zmiany</h3><p>Obowiązuje wersja opublikowana na tej stronie.</p><h3>Prawo właściwe</h3><p>Prawo francuskie; właściwe sądy francuskie, po próbie polubownego rozwiązania.</p>`,
  },
};
const _lgt = k => (_LEGAL_T[k] && (_LEGAL_T[k][LANG] || _LEGAL_T[k].en)) || '';

/* ══════════════════════════════════════════
   PRESSE & PARTENAIRES : faits vérifiés, kit officiel, contact 48 h.
   Les textes du jeu viennent de data.js (source unique) ; tout le reste
   vit dans _PRESS_T (10 langues). Les tailles des fichiers sont mesurées.
══════════════════════════════════════════ */
const _PRESS_T = {
  title:   { fr:'Presse', en:'Press', es:'Prensa', de:'Presse', it:'Stampa', ar:'الصحافة', zh:'媒体', ja:'プレス', ru:'Пресса', pl:'Prasa' },
  eye:     { fr:'Journalistes & partenaires', en:'Journalists & partners', es:'Periodistas y socios', de:'Journalisten & Partner', it:'Giornalisti e partner', ar:'الصحافيون والشركاء', zh:'媒体与合作伙伴', ja:'報道関係者とパートナー', ru:'Журналистам и партнёрам', pl:'Dziennikarze i partnerzy' },
  intro:   { fr:'Tout ce qu’il faut pour parler de GEEKLEARN GAMES : des faits vérifiés, des visuels officiels en haute définition et un contact qui répond sous 48 heures.', en:'Everything you need to cover GEEKLEARN GAMES: verified facts, official high-resolution assets, and a contact that replies within 48 hours.', es:'Todo lo necesario para hablar de GEEKLEARN GAMES: datos verificados, material oficial en alta resolución y un contacto que responde en 48 horas.', de:'Alles, was Sie brauchen, um über GEEKLEARN GAMES zu berichten: geprüfte Fakten, offizielles Material in hoher Auflösung und ein Kontakt, der innerhalb von 48 Stunden antwortet.', it:'Tutto il necessario per parlare di GEEKLEARN GAMES: fatti verificati, materiali ufficiali in alta risoluzione e un contatto che risponde entro 48 ore.', ar:'كل ما تحتاجه للحديث عن GEEKLEARN GAMES: حقائق موثوقة وصور رسمية عالية الدقة وجهة اتصال ترد خلال 48 ساعة.', zh:'报道 GEEKLEARN GAMES 所需的一切：经过核实的资料、官方高清素材，以及 48 小时内回复的联系渠道。', ja:'GEEKLEARN GAMESを取り上げるために必要なものすべて。確認済みの事実、公式高解像度素材、48時間以内に返信する窓口。', ru:'Всё, что нужно, чтобы рассказать о GEEKLEARN GAMES: проверенные факты, официальные материалы в высоком разрешении и контакт, отвечающий в течение 48 часов.', pl:'Wszystko, czego potrzebujesz, aby opowiedzieć o GEEKLEARN GAMES: zweryfikowane fakty, oficjalne materiały w wysokiej rozdzielczości i kontakt odpowiadający w 48 godzin.' },
  factsHead:{ fr:'Le studio en bref', en:'The studio at a glance', es:'El estudio en pocas palabras', de:'Das Studio im Überblick', it:'Lo studio in breve', ar:'الاستوديو باختصار', zh:'工作室简介', ja:'スタジオ概要', ru:'Студия кратко', pl:'Studio w skrócie' },
  fFound:  { fr:'Fondation', en:'Founded', es:'Fundación', de:'Gegründet', it:'Fondazione', ar:'التأسيس', zh:'成立', ja:'設立', ru:'Основана', pl:'Założone' },
  fFounder:{ fr:'Fondateur', en:'Founder', es:'Fundador', de:'Gründer', it:'Fondatore', ar:'المؤسس', zh:'创始人', ja:'創設者', ru:'Основатель', pl:'Założyciel' },
  fStatus: { fr:'Statut', en:'Status', es:'Estatuto', de:'Rechtsform', it:'Statuto', ar:'الوضع القانوني', zh:'法律形式', ja:'形態', ru:'Статус', pl:'Status' },
  fStatusV:{ fr:'Studio indépendant, entrepreneur individuel (EI) · SIRET 104 149 414 00033', en:'Independent studio, French sole proprietorship (EI) · SIRET 104 149 414 00033', es:'Estudio independiente, empresario individual francés (EI) · SIRET 104 149 414 00033', de:'Unabhängiges Studio, französisches Einzelunternehmen (EI) · SIRET 104 149 414 00033', it:'Studio indipendente, ditta individuale francese (EI) · SIRET 104 149 414 00033', ar:'استوديو مستقل، مؤسسة فردية فرنسية (EI) · SIRET 104 149 414 00033', zh:'独立工作室，法国个人企业（EI）· SIRET 104 149 414 00033', ja:'独立系スタジオ、フランス個人事業（EI）· SIRET 104 149 414 00033', ru:'Независимая студия, французское ИП (EI) · SIRET 104 149 414 00033', pl:'Niezależne studio, francuska działalność jednoosobowa (EI) · SIRET 104 149 414 00033' },
  fLoc:    { fr:'Localisation', en:'Location', es:'Ubicación', de:'Standort', it:'Sede', ar:'الموقع', zh:'所在地', ja:'所在地', ru:'Локация', pl:'Lokalizacja' },
  fFirst:  { fr:'Premier titre annoncé', en:'First announced title', es:'Primer título anunciado', de:'Erster angekündigter Titel', it:'Primo titolo annunciato', ar:'أول عنوان معلن', zh:'首款公布作品', ja:'発表済み第1作', ru:'Первый анонсированный проект', pl:'Pierwszy zapowiedziany tytuł' },
  fContact:{ fr:'Contact presse', en:'Press contact', es:'Contacto de prensa', de:'Pressekontakt', it:'Contatto stampa', ar:'الاتصال الصحفي', zh:'媒体联络', ja:'プレス窓口', ru:'Пресс-контакт', pl:'Kontakt prasowy' },
  f48:     { fr:'réponse sous 48 h', en:'reply within 48 h', es:'respuesta en 48 h', de:'Antwort innerhalb von 48 Std.', it:'risposta entro 48 ore', ar:'رد خلال 48 ساعة', zh:'48 小时内回复', ja:'48時間以内に返信', ru:'ответ в течение 48 ч', pl:'odpowiedź w 48 godz.' },
  aboutHead:{ fr:'À propos du studio', en:'About the studio', es:'Sobre el estudio', de:'Über das Studio', it:'Sullo studio', ar:'عن الاستوديو', zh:'关于工作室', ja:'スタジオについて', ru:'О студии', pl:'O studiu' },
  about1:  { fr:'GEEKLEARN GAMES est un studio indépendant français fondé en 2026 par Evan PRENEY, à Blyes, dans l’Ain. Le studio conçoit et développe tout en interne : ses jeux, son site et son launcher de bureau aux mises à jour signées.', en:'GEEKLEARN GAMES is a French independent studio founded in 2026 by Evan PRENEY in Blyes, Ain. Everything is designed and built in-house: the games, the website and the desktop launcher with signed updates.', es:'GEEKLEARN GAMES es un estudio independiente francés fundado en 2026 por Evan PRENEY en Blyes, Ain. Todo se diseña y desarrolla internamente: los juegos, el sitio y el launcher de escritorio con actualizaciones firmadas.', de:'GEEKLEARN GAMES ist ein unabhängiges französisches Studio, 2026 von Evan PRENEY in Blyes (Ain) gegründet. Alles entsteht im Haus: die Spiele, die Website und der Desktop-Launcher mit signierten Updates.', it:'GEEKLEARN GAMES è uno studio indipendente francese fondato nel 2026 da Evan PRENEY a Blyes, nell’Ain. Tutto è progettato e sviluppato internamente: i giochi, il sito e il launcher desktop con aggiornamenti firmati.', ar:'GEEKLEARN GAMES استوديو فرنسي مستقل أسسه Evan PRENEY عام 2026 في بلييس بمقاطعة آن (Ain). كل شيء يُصمَّم ويُطوَّر داخلياً: الألعاب والموقع ومشغّل سطح المكتب بتحديثات موقَّعة.', zh:'GEEKLEARN GAMES 是一家法国独立工作室，由 Evan PRENEY 于 2026 年创立于安省（Ain）布利耶（Blyes）。游戏、网站与带签名更新的桌面启动器全部由工作室内部设计开发。', ja:'GEEKLEARN GAMESは、2026年にEvan PRENEYがフランス・アン県ブリー(Blyes)で設立した独立系スタジオ。ゲーム、サイト、署名付きアップデート対応のデスクトップランチャーまで、すべて自社開発。', ru:'GEEKLEARN GAMES, французская независимая студия, основанная в 2026 году Эваном PRENEY в Бли (департамент Эн). Всё создаётся внутри студии: игры, сайт и настольный лаунчер с подписанными обновлениями.', pl:'GEEKLEARN GAMES to francuskie niezależne studio założone w 2026 roku przez Evana PRENEY w Blyes (Ain). Wszystko powstaje wewnętrznie: gry, strona i launcher z podpisanymi aktualizacjami.' },
  about2:  { fr:'Son premier titre annoncé, LUMBRA, arrive au Q4 2027 sur PC. Trois autres projets sont en développement et seront révélés en leur temps. Chaque sortie du studio est publiée en dix langues.', en:'Its first announced title, LUMBRA, is coming in Q4 2027 on PC. Three more projects are in development and will be revealed in due time. Every studio release ships in ten languages.', es:'Su primer título anunciado, LUMBRA, llegará en el Q4 de 2027 a PC. Otros tres proyectos están en desarrollo y se revelarán a su debido tiempo. Cada lanzamiento del estudio se publica en diez idiomas.', de:'Der erste angekündigte Titel LUMBRA erscheint im Q4 2027 für PC. Drei weitere Projekte sind in Entwicklung und werden zu gegebener Zeit enthüllt. Jede Veröffentlichung erscheint in zehn Sprachen.', it:'Il primo titolo annunciato, LUMBRA, arriverà nel Q4 2027 su PC. Altri tre progetti sono in sviluppo e saranno svelati a tempo debito. Ogni uscita dello studio è pubblicata in dieci lingue.', ar:'أول عنوان معلن، LUMBRA، سيصدر في الربع الأخير من 2027 على PC. ثلاثة مشاريع أخرى قيد التطوير وسيُكشف عنها في وقتها. كل إصدار يصدر بعشر لغات.', zh:'首款公布作品《LUMBRA》将于 2027 年第四季度登陆 PC。另有三个项目正在开发中，将适时公布。工作室的每次发布均支持十种语言。', ja:'発表済み第1作『LUMBRA』は2027年第4四半期にPC向けにリリース予定。さらに3つのプロジェクトが開発中で、時が来れば公開されます。スタジオのリリースはすべて10言語対応。', ru:'Первый анонсированный проект, LUMBRA, выйдет в четвёртом квартале 2027 года на PC. Ещё три проекта в разработке и будут раскрыты в своё время. Каждый релиз студии выходит на десяти языках.', pl:'Pierwszy zapowiedziany tytuł, LUMBRA, ukaże się w Q4 2027 na PC. Trzy kolejne projekty są w produkcji i zostaną ujawnione we właściwym czasie. Każde wydanie studia ukazuje się w dziesięciu językach.' },
  lumbraCta:{ fr:'Voir la fiche du jeu', en:'View the game page', es:'Ver la ficha del juego', de:'Zur Spielseite', it:'Vai alla scheda del gioco', ar:'عرض صفحة اللعبة', zh:'查看游戏页面', ja:'ゲームページを見る', ru:'Открыть страницу игры', pl:'Zobacz stronę gry' },
  kitHead: { fr:'Kit presse', en:'Press kit', es:'Kit de prensa', de:'Pressekit', it:'Kit stampa', ar:'الملف الصحفي', zh:'媒体资料包', ja:'プレスキット', ru:'Пресс-кит', pl:'Zestaw prasowy' },
  kitSub:  { fr:'Visuels officiels en haute définition, libres d’usage éditorial. Le kit complet contient les PNG, les fichiers vectoriels SVG, le logo et la fiche technique.', en:'Official high-resolution assets, free for editorial use. The full kit contains the PNG files, the SVG vector files, the logo and the factsheet.', es:'Material oficial en alta resolución, libre para uso editorial. El kit completo contiene los PNG, los vectoriales SVG, el logotipo y la ficha técnica.', de:'Offizielles Material in hoher Auflösung, frei für redaktionelle Nutzung. Das komplette Kit enthält die PNG-Dateien, die SVG-Vektordateien, das Logo und das Factsheet.', it:'Materiali ufficiali in alta risoluzione, liberi per uso editoriale. Il kit completo contiene i PNG, i vettoriali SVG, il logo e la scheda tecnica.', ar:'صور رسمية عالية الدقة متاحة للاستخدام التحريري. الملف الكامل يضم ملفات PNG وملفات SVG المتجهة والشعار والبطاقة التقنية.', zh:'官方高清素材，可自由用于编辑报道。完整资料包含 PNG、SVG 矢量文件、标志与资料表。', ja:'公式高解像度素材。編集目的で自由に使用できます。完全版キットにはPNG、SVGベクター、ロゴ、ファクトシートが含まれます。', ru:'Официальные материалы в высоком разрешении, свободные для редакционного использования. Полный набор содержит PNG, векторные SVG, логотип и факт-лист.', pl:'Oficjalne materiały w wysokiej rozdzielczości, do swobodnego użytku redakcyjnego. Pełny zestaw zawiera pliki PNG, wektorowe SVG, logo i kartę informacyjną.' },
  zipBtn:  { fr:'Tout télécharger', en:'Download everything', es:'Descargar todo', de:'Alles herunterladen', it:'Scarica tutto', ar:'تنزيل الكل', zh:'全部下载', ja:'すべてダウンロード', ru:'Скачать всё', pl:'Pobierz wszystko' },
  aJaq:    { fr:'Jaquette LUMBRA', en:'LUMBRA key art', es:'Arte principal de LUMBRA', de:'LUMBRA Key-Art', it:'Key art di LUMBRA', ar:'الغلاف الرئيسي لـ LUMBRA', zh:'LUMBRA 主视觉', ja:'LUMBRAキーアート', ru:'Ключевой арт LUMBRA', pl:'Grafika główna LUMBRA' },
  aArt:    { fr:'Artwork', en:'Artwork', es:'Ilustración', de:'Artwork', it:'Artwork', ar:'عمل فني', zh:'艺术图', ja:'アートワーク', ru:'Иллюстрация', pl:'Grafika' },
  aLogo:   { fr:'Logo du studio', en:'Studio logo', es:'Logotipo del estudio', de:'Studio-Logo', it:'Logo dello studio', ar:'شعار الاستوديو', zh:'工作室标志', ja:'スタジオロゴ', ru:'Логотип студии', pl:'Logo studia' },
  aLogoM:  { fr:'fond transparent', en:'transparent background', es:'fondo transparente', de:'transparenter Hintergrund', it:'sfondo trasparente', ar:'خلفية شفافة', zh:'透明背景', ja:'透過背景', ru:'прозрачный фон', pl:'przezroczyste tło' },
  aFact:   { fr:'Fiche technique', en:'Factsheet', es:'Ficha técnica', de:'Factsheet', it:'Scheda tecnica', ar:'البطاقة التقنية', zh:'资料表', ja:'ファクトシート', ru:'Факт-лист', pl:'Karta informacyjna' },
  aFactM:  { fr:'FR + EN, texte brut', en:'FR + EN, plain text', es:'FR + EN, texto plano', de:'FR + EN, Reintext', it:'FR + EN, testo semplice', ar:'FR + EN، نص عادي', zh:'FR + EN，纯文本', ja:'FR + EN、プレーンテキスト', ru:'FR + EN, простой текст', pl:'FR + EN, zwykły tekst' },
  dlAria:  { fr:'Télécharger', en:'Download', es:'Descargar', de:'Herunterladen', it:'Scarica', ar:'تنزيل', zh:'下载', ja:'ダウンロード', ru:'Скачать', pl:'Pobierz' },
  usageHead:{ fr:'Règles d’usage', en:'Usage guidelines', es:'Normas de uso', de:'Nutzungsregeln', it:'Regole d’uso', ar:'قواعد الاستخدام', zh:'使用规范', ja:'使用ガイドライン', ru:'Правила использования', pl:'Zasady użycia' },
  usage1:  { fr:'Usage éditorial libre : articles, vidéos, reportages, recadrage autorisé.', en:'Free editorial use: articles, videos, coverage; cropping allowed.', es:'Uso editorial libre: artículos, vídeos, reportajes; se permite recortar.', de:'Freie redaktionelle Nutzung: Artikel, Videos, Berichte; Zuschneiden erlaubt.', it:'Uso editoriale libero: articoli, video, servizi; ritaglio consentito.', ar:'استخدام تحريري حر: مقالات وفيديوهات وتقارير، ويُسمح بالاقتصاص.', zh:'可自由用于编辑内容：文章、视频、报道；允许裁剪。', ja:'編集目的での自由な使用が可能：記事、動画、特集。トリミング可。', ru:'Свободное редакционное использование: статьи, видео, репортажи; кадрирование разрешено.', pl:'Swobodny użytek redakcyjny: artykuły, wideo, relacje; kadrowanie dozwolone.' },
  usage2:  { fr:'Ne pas déformer, recolorer ni altérer le logo et les visuels.', en:'Do not distort, recolor or alter the logo and the artwork.', es:'No deformar, recolorear ni alterar el logotipo ni los visuales.', de:'Logo und Material nicht verzerren, umfärben oder verändern.', it:'Non deformare, ricolorare o alterare il logo e i materiali.', ar:'لا تشوّه الشعار أو الصور ولا تغيّر ألوانها.', zh:'请勿变形、改色或修改标志与素材。', ja:'ロゴや素材の変形、色変更、改変は不可。', ru:'Не искажайте, не перекрашивайте и не изменяйте логотип и материалы.', pl:'Nie zniekształcaj, nie przebarwiaj ani nie zmieniaj logo i materiałów.' },
  usage3:  { fr:'Aucune mention de partenariat ou de soutien sans accord écrit du studio.', en:'No claim of partnership or endorsement without the studio’s written consent.', es:'Ninguna mención de asociación o apoyo sin acuerdo escrito del estudio.', de:'Keine Nennung einer Partnerschaft oder Unterstützung ohne schriftliche Zustimmung des Studios.', it:'Nessuna menzione di partnership o sostegno senza accordo scritto dello studio.', ar:'لا يجوز الإيحاء بشراكة أو دعم دون موافقة خطية من الاستوديو.', zh:'未经工作室书面同意，不得声称存在合作或背书关系。', ja:'スタジオの書面による同意なしに、提携や公認を示唆しないでください。', ru:'Никаких заявлений о партнёрстве или поддержке без письменного согласия студии.', pl:'Zakaz sugerowania partnerstwa lub wsparcia bez pisemnej zgody studia.' },
  boilerHead:{ fr:'Description officielle', en:'Official boilerplate', es:'Descripción oficial', de:'Offizielle Kurzbeschreibung', it:'Descrizione ufficiale', ar:'الوصف الرسمي', zh:'官方简介', ja:'公式ボイラープレート', ru:'Официальное описание', pl:'Opis oficjalny' },
  boiler:  { fr:'GEEKLEARN GAMES est un studio de jeux vidéo indépendant fondé en 2026 par Evan PRENEY à Blyes, en France. Son premier titre annoncé, LUMBRA, une aventure narrative en noir et blanc, est prévu pour le Q4 2027 sur PC.', en:'GEEKLEARN GAMES is an independent game studio founded in 2026 by Evan PRENEY in Blyes, France. Its first announced title, LUMBRA, a black-and-white narrative adventure, is planned for Q4 2027 on PC.', es:'GEEKLEARN GAMES es un estudio de videojuegos independiente fundado en 2026 por Evan PRENEY en Blyes, Francia. Su primer título anunciado, LUMBRA, una aventura narrativa en blanco y negro, está previsto para el Q4 de 2027 en PC.', de:'GEEKLEARN GAMES ist ein unabhängiges Spielestudio, 2026 von Evan PRENEY in Blyes, Frankreich, gegründet. Der erste angekündigte Titel LUMBRA, ein Erzähl-Abenteuer in Schwarz-Weiß, ist für Q4 2027 auf PC geplant.', it:'GEEKLEARN GAMES è uno studio di videogiochi indipendente fondato nel 2026 da Evan PRENEY a Blyes, in Francia. Il primo titolo annunciato, LUMBRA, un’avventura narrativa in bianco e nero, è previsto per il Q4 2027 su PC.', ar:'GEEKLEARN GAMES استوديو ألعاب مستقل أسسه Evan PRENEY عام 2026 في بلييس بفرنسا. أول عنوان معلن له، LUMBRA، مغامرة سردية بالأبيض والأسود، متوقع في الربع الأخير من 2027 على PC.', zh:'GEEKLEARN GAMES 是一家独立游戏工作室，由 Evan PRENEY 于 2026 年创立于法国布利耶（Blyes）。其首款公布作品《LUMBRA》是一款黑白叙事冒险游戏，计划于 2027 年第四季度登陆 PC。', ja:'GEEKLEARN GAMESは、2026年にEvan PRENEYがフランスのブリー(Blyes)で設立した独立系ゲームスタジオ。発表済み第1作『LUMBRA』はモノクロのナラティブアドベンチャーで、2027年第4四半期にPC向けリリース予定。', ru:'GEEKLEARN GAMES, независимая игровая студия, основанная в 2026 году Эваном PRENEY в Бли, Франция. Первый анонсированный проект, LUMBRA, чёрно-белое повествовательное приключение, запланирован на четвёртый квартал 2027 года на PC.', pl:'GEEKLEARN GAMES to niezależne studio gier założone w 2026 roku przez Evana PRENEY w Blyes we Francji. Pierwszy zapowiedziany tytuł, LUMBRA, czarno-biała przygoda narracyjna, planowany jest na Q4 2027 na PC.' },
  boilerCopy:{ fr:'Copier le texte', en:'Copy text', es:'Copiar texto', de:'Text kopieren', it:'Copia testo', ar:'نسخ النص', zh:'复制文本', ja:'テキストをコピー', ru:'Скопировать текст', pl:'Kopiuj tekst' },
  boilerCopied:{ fr:'Copié !', en:'Copied!', es:'¡Copiado!', de:'Kopiert!', it:'Copiato!', ar:'تم النسخ!', zh:'已复制！', ja:'コピーしました', ru:'Скопировано!', pl:'Skopiowano!' },
  mb:      { fr:'Mo', en:'MB', es:'MB', de:'MB', it:'MB', ar:'م.ب', zh:'MB', ja:'MB', ru:'МБ', pl:'MB' },
  ko:      { fr:'Ko', en:'KB', es:'KB', de:'KB', it:'KB', ar:'ك.ب', zh:'KB', ja:'KB', ru:'КБ', pl:'KB' },
};
const _pt = k => (_PRESS_T[k] && (_PRESS_T[k][LANG] || _PRESS_T[k].en)) || '';

function buildPressPage() {
  const host = $('page-press'); if (!host) return;
  const fmtN = n => { try { return new Intl.NumberFormat(LANG_LOCALE[LANG] || 'en-US', { maximumFractionDigits: 1 }).format(n); } catch (e) { return String(n); } };
  const dlIcon = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 2v8M4.5 6.5L8 10l3.5-3.5M2.5 13h11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const lu = (typeof ALL_WORKS !== 'undefined' ? ALL_WORKS : []).find(w => w.id === 'lumbra');
  const luTag  = lu ? (getItemField(lu, 'tagline') || '') : '';
  const luDesc = lu ? ((getItemField(lu, 'description') || [])[0] || '') : '';
  const card = (thumb, label, meta, links) => `
    <div class="press-card reveal">
      <div class="press-thumb${thumb.pad ? ' press-thumb--pad' : ''}">${thumb.img ? `<img src="${thumb.img}" alt="${label}" loading="lazy" decoding="async">` : `<span class="press-thumb-txt" aria-hidden="true">${thumb.txt}</span>`}</div>
      <div class="press-card-b">
        <div class="press-card-t">${label}</div>
        <div class="press-card-m">${meta}</div>
        <div class="press-dls">${links.map(l => `<a class="press-dl-btn" href="${l.h}" download aria-label="${_pt('dlAria')} : ${label} (${l.f})">${l.f}</a>`).join('')}</div>
      </div>
    </div>`;
  host.innerHTML = `
    <div class="pl-hero glg-pattern glg-line-after">
      <div class="glg-pattern-bg glg-pat-subtle"></div>
      <p class="section-eye reveal">${_pt('eye')}</p>
      <h1 class="pl-title reveal">${_pt('title')}</h1>
      <p class="press-intro reveal">${_pt('intro')}</p>
    </div>
    <div class="press-body">
      <section class="press-block reveal">
        <div class="press-sec-label">${_pt('factsHead')}</div>
        <dl class="press-facts">
          <div><dt>${_pt('fFound')}</dt><dd>2026</dd></div>
          <div><dt>${_pt('fFounder')}</dt><dd>Evan PRENEY (GEEKLEARN)</dd></div>
          <div><dt>${_pt('fStatus')}</dt><dd>${_pt('fStatusV')}</dd></div>
          <div><dt>${_pt('fLoc')}</dt><dd>Blyes (Ain), Auvergne-Rhône-Alpes, France</dd></div>
          <div><dt>${_pt('fFirst')}</dt><dd>LUMBRA · Q4 2027 · PC</dd></div>
          <div><dt>${_pt('fContact')}</dt><dd><a href="mailto:contact@geeklearngames.com">contact@geeklearngames.com</a><br>${_pt('f48')}</dd></div>
        </dl>
      </section>
      <section class="press-block reveal">
        <div class="press-sec-label">${_pt('aboutHead')}</div>
        <p class="press-p">${_pt('about1')}</p>
        <p class="press-p">${_pt('about2')}</p>
      </section>
      <section class="press-block reveal">
        <div class="press-sec-label">LUMBRA</div>
        ${luTag ? `<p class="press-tag">&ldquo;${escHtml(luTag)}&rdquo;</p>` : ''}
        ${luDesc ? `<p class="press-p">${escHtml(luDesc)}</p>` : ''}
        <button class="btn btn-outline" onclick="showPage('detail','lumbra')">${_pt('lumbraCta')}</button>
      </section>
      <section class="press-block">
        <div class="press-sec-label reveal">${_pt('kitHead')}</div>
        <p class="press-p press-kit-sub reveal">${_pt('kitSub')}</p>
        <a class="btn btn-primary btn-lg press-zip reveal" href="assets/press/kit-presse-geeklearn-games.zip" download>${dlIcon} ${_pt('zipBtn')} <span class="press-zip-m">.zip · ${fmtN(5.8)} ${_pt('mb')}</span></a>
        <div class="press-grid">
          ${card({ img: 'assets/img/works/games/lumbra.svg' }, _pt('aJaq'), `PNG · 1200×1800 · ${fmtN(1.5)} ${_pt('mb')}`, [
            { h: 'assets/press/lumbra-jaquette.png', f: 'PNG' },
            { h: 'assets/img/works/games/lumbra.svg', f: 'SVG' }])}
          ${card({ img: 'assets/img/works/games/lumbra-art1.svg' }, `${_pt('aArt')} 1`, `PNG · 1920×1080 · ${fmtN(1.3)} ${_pt('mb')}`, [
            { h: 'assets/press/lumbra-artwork-1.png', f: 'PNG' },
            { h: 'assets/img/works/games/lumbra-art1.svg', f: 'SVG' }])}
          ${card({ img: 'assets/img/works/games/lumbra-art2.svg' }, `${_pt('aArt')} 2`, `PNG · 1920×1080 · ${fmtN(1.4)} ${_pt('mb')}`, [
            { h: 'assets/press/lumbra-artwork-2.png', f: 'PNG' },
            { h: 'assets/img/works/games/lumbra-art2.svg', f: 'SVG' }])}
          ${card({ img: 'assets/img/works/games/lumbra-art3.svg' }, `${_pt('aArt')} 3`, `PNG · 1920×1080 · ${fmtN(1.6)} ${_pt('mb')}`, [
            { h: 'assets/press/lumbra-artwork-3.png', f: 'PNG' },
            { h: 'assets/img/works/games/lumbra-art3.svg', f: 'SVG' }])}
          ${card({ img: 'assets/img/brand/glg-logo-white.png', pad: true }, _pt('aLogo'), `PNG · 3901×1254 · 42 ${_pt('ko')} · ${_pt('aLogoM')}`, [
            { h: 'assets/img/brand/glg-logo-white.png', f: 'PNG' }])}
          ${card({ txt: 'TXT' }, _pt('aFact'), `${_pt('aFactM')} · ${fmtN(2.3)} ${_pt('ko')}`, [
            { h: 'assets/press/factsheet-presse.txt', f: 'TXT' }])}
        </div>
      </section>
      <section class="press-block reveal">
        <div class="press-sec-label">${_pt('usageHead')}</div>
        <ul class="press-usage">
          <li>${_pt('usage1')}</li>
          <li>${_pt('usage2')}</li>
          <li>${_pt('usage3')}</li>
        </ul>
      </section>
      <section class="press-block press-boiler reveal">
        <div class="press-sec-label">${_pt('boilerHead')}</div>
        <p class="press-p" id="press-boiler-txt">${_pt('boiler')}</p>
        <button class="btn btn-outline" id="press-copy" onclick="glgCopyBoiler(this)">${_pt('boilerCopy')}</button>
      </section>
    </div>
    <div class="page-footer-slot">${footerHTML()}</div>`;
  initReveal();
}

/* Copie la description officielle ; retour visuel sur le bouton. */
function glgCopyBoiler(btn) {
  const txt = document.getElementById('press-boiler-txt')?.textContent || '';
  const done = () => {
    btn.textContent = _pt('boilerCopied');
    btn.disabled = true;
    setTimeout(() => { btn.textContent = _pt('boilerCopy'); btn.disabled = false; }, 1600);
  };
  try { navigator.clipboard.writeText(txt).then(done, done); } catch (e) { done(); }
}

/* ══════════════════════════════════════════
   JOURNAL DU STUDIO : uniquement des faits datés (GLG_JOURNAL, data.js).
   Liens d'entrée réutilisant l'i18n existante : fiche (_pt lumbraCta),
   launcher (navGet), presse (_pt title).
══════════════════════════════════════════ */
const _JRNL_T = {
  title: { fr:'Journal', en:'Journal', es:'Diario', de:'Journal', it:'Diario', ar:'اليوميات', zh:'日志', ja:'ジャーナル', ru:'Журнал', pl:'Dziennik' },
  eye:   { fr:'La vie du studio', en:'Life at the studio', es:'La vida del estudio', de:'Das Studioleben', it:'La vita dello studio', ar:'حياة الاستوديو', zh:'工作室动态', ja:'スタジオの日々', ru:'Жизнь студии', pl:'Życie studia' },
  intro: { fr:'Les nouvelles du studio, écrites par le studio : annonces, versions du launcher, évolutions du site. Sans bruit, seulement ce qui a vraiment eu lieu.', en:'News from the studio, written by the studio: announcements, launcher releases, website evolutions. No noise, only what actually happened.', es:'Las noticias del estudio, escritas por el estudio: anuncios, versiones del launcher, evoluciones del sitio. Sin ruido, solo lo que realmente ocurrió.', de:'Neuigkeiten aus dem Studio, vom Studio geschrieben: Ankündigungen, Launcher-Versionen, Website-Entwicklungen. Kein Lärm, nur was wirklich passiert ist.', it:'Le notizie dello studio, scritte dallo studio: annunci, versioni del launcher, evoluzioni del sito. Senza rumore, solo ciò che è realmente accaduto.', ar:'أخبار الاستوديو بقلم الاستوديو: إعلانات وإصدارات المشغّل وتطورات الموقع. بلا ضجيج، فقط ما حدث فعلاً.', zh:'来自工作室的一手动态：公告、启动器版本、网站演进。不制造噪音，只记录真实发生的事。', ja:'スタジオ自身が綴るニュース。発表、ランチャーのリリース、サイトの進化。ノイズはなし、実際に起きたことだけ。', ru:'Новости студии от самой студии: анонсы, версии лаунчера, развитие сайта. Без шума, только то, что действительно произошло.', pl:'Wiadomości studia pisane przez studio: zapowiedzi, wersje launchera, rozwój strony. Bez szumu, tylko to, co naprawdę się wydarzyło.' },
  tagStudio:   { fr:'Studio', en:'Studio', es:'Estudio', de:'Studio', it:'Studio', ar:'الاستوديو', zh:'工作室', ja:'スタジオ', ru:'Студия', pl:'Studio' },
  tagSite:     { fr:'Site', en:'Website', es:'Sitio', de:'Website', it:'Sito', ar:'الموقع', zh:'网站', ja:'サイト', ru:'Сайт', pl:'Strona' },
  tagLauncher: { fr:'Launcher', en:'Launcher', es:'Launcher', de:'Launcher', it:'Launcher', ar:'المشغّل', zh:'启动器', ja:'ランチャー', ru:'Лаунчер', pl:'Launcher' },
};
const _jt = k => (_JRNL_T[k] && (_JRNL_T[k][LANG] || _JRNL_T[k].en)) || '';

function buildJournalPage() {
  const host = $('page-journal'); if (!host) return;
  const log = (typeof GLG_JOURNAL !== 'undefined' && Array.isArray(GLG_JOURNAL)) ? GLG_JOURNAL : [];
  const loc = m => (m && (m[LANG] || m.en)) || '';
  const tagOf = t => t === 'lumbra' ? 'LUMBRA' : t === 'launcher' ? _jt('tagLauncher') : t === 'site' ? _jt('tagSite') : _jt('tagStudio');
  const linkOf = l => {
    if (l === 'lumbra')   return { lbl: _pt('lumbraCta'), oc: "showPage('detail','lumbra')" };
    if (l === 'launcher') return { lbl: t('navGet') || 'Launcher', oc: '_glgGetLauncher()' };
    if (l === 'press')    return { lbl: _pt('title'), oc: "showPage('press')" };
    return null;
  };
  const fdate = iso => { try { return new Date(iso + 'T12:00:00').toLocaleDateString(LANG_LOCALE[LANG] || 'en-US', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return iso; } };
  host.innerHTML = `
    <div class="pl-hero glg-pattern glg-line-after">
      <div class="glg-pattern-bg glg-pat-subtle"></div>
      <p class="section-eye reveal">${_jt('eye')}</p>
      <h1 class="pl-title reveal">${_jt('title')}</h1>
      <p class="press-intro reveal">${_jt('intro')}</p>
    </div>
    <div class="jr-body">
      ${log.map(e => {
        const lk = linkOf(e.link);
        return `
        <article class="jr-entry reveal">
          <div class="jr-side">
            <time class="jr-date" datetime="${e.date}">${fdate(e.date)}</time>
            <span class="jr-tag">${tagOf(e.tag)}</span>
          </div>
          <div class="jr-main">
            <h2 class="jr-title">${escHtml(loc(e.title))}</h2>
            ${(e.body || []).map(p => `<p class="press-p">${escHtml(loc(p))}</p>`).join('')}
            ${lk ? `<button class="jr-link" onclick="${lk.oc}">${lk.lbl}</button>` : ''}
          </div>
        </article>`;
      }).join('')}
    </div>
    <div class="page-footer-slot">${footerHTML()}</div>`;
  initReveal();
}

function buildLegalPage(name) {
  const host = $('page-' + name); if (!host) return;
  let d = _LEGAL_UPDATED;
  try { d = new Date(_LEGAL_UPDATED + 'T12:00:00').toLocaleDateString(LANG_LOCALE[LANG] || 'fr-FR', { day:'numeric', month:'long', year:'numeric' }); } catch (e) {}
  host.innerHTML = `
    <div class="pl-hero glg-pattern glg-line-after">
      <div class="glg-pattern-bg glg-pat-subtle"></div>
      <p class="section-eye reveal">GEEKLEARN GAMES</p>
      <h1 class="pl-title reveal">${_lgt(name + 'Title')}</h1>
      <p class="pl-updated reveal">${_lgt('updated')} : ${d}</p>
    </div>
    <div class="pl-body reveal" id="pl-body-${name}">${_lgt(name + 'Body')}</div>
    ${LANG === 'fr' ? '' : `<p class="pl-prevail">${_lgt('prevail')}</p>`}
    <div class="page-footer-slot">${footerHTML()}</div>`;
  initReveal();
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
      // rootMargin bas POSITIF : la révélation démarre ~28% de viewport AVANT
      // l'entrée à l'écran. Avec le scroll fluide (Lenis), l'ancien -20px
      // faisait traverser du noir : les cartes apparaissaient en retard
      // (très visible sur la roadmap de l'accueil).
    }, { threshold: 0, rootMargin: '0px 0px 28% 0px' });
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

/* ══════════════════════════════════════════
   CONTACT FORM
   Real email delivery via FormSubmit.co
   → contact@geeklearngames.com
   Subject format: [GLG] Category, Name
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
          btn.textContent = t('errRateLimit') || 'Too many requests, please wait.';
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
    'GEEKLEARN GAMES, contact@geeklearngames.com',
  ].join('\n');

  const payload = {
    /* FormSubmit meta-fields */
    _subject:      `[GLG][${categoryTag}] ${fullName}, ${subject}`,
    _template:     'table',
    _captcha:      'false',
    _autoresponse: autoReply,
    _replyto:      email,

    /* Visible email body fields */
    'Full Name':   fullName,
    'Email':       email,
    'Company / Studio': company || '-',
    'Subject':     subject,
    'Message':     message,
    'Portfolio / Press kit': portfolio || '-',
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
      'https://formsubmit.co/ajax/contact@geeklearngames.com',
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
    const errMsg = t('formError') || 'Could not send, please try again or email us directly.';
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
   CONTACT, UX ENHANCEMENTS
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

}

/* ══════════════════════════════════════════
   LIENS EXTERNES + CONTACT côté LAUNCHER
   ──────────────────────────────────────────
   La WebView du launcher BLOQUE les nouvelles fenêtres (window.open,
   target=_blank) : tout lien externe passe par le plugin opener
   (navigateur par défaut, dispo à partir du launcher 1.0.4, fallback
   window.open sur le web). Le CONTACT (formulaire + réseaux) reste une
   affaire de SITE WEB : dans le launcher, la page devient une carte de
   renvoi (le formulaire FormSubmit y échouait de toute façon).
══════════════════════════════════════════ */
function glgOpenExternal(url) {
  if (!url) return;
  try {
    const op = IS_TAURI && window.__TAURI__ && window.__TAURI__.opener;
    if (op && op.openUrl) { const pr = op.openUrl(url); if (pr && pr.catch) pr.catch(() => {}); return; }
    const c = IS_TAURI && window.__TAURI__ && window.__TAURI__.core;   // repli : invoke direct
    if (c && c.invoke) { const pr = c.invoke('plugin:opener|open_url', { url }); if (pr && pr.catch) pr.catch(() => {}); return; }
  } catch (e) {}
  try { window.open(url, '_blank', 'noopener'); } catch (e) {}
}
/* Launcher : intercepte TOUT lien target=_blank (pièces jointes du chat,
   liens futurs) et le route vers le navigateur par défaut. */
document.addEventListener('click', e => {
  if (!IS_TAURI) return;   // teste AU CLIC, const declaree plus bas (TDZ au chargement)
  const a = e.target && e.target.closest && e.target.closest('a[target="_blank"]');
  if (!a || !a.href) return;
  e.preventDefault();
  glgOpenExternal(a.href);
}, true);

const _CTC_LX = {
  title: { fr:'LE CONTACT VIT SUR LE SITE WEB', en:'CONTACT LIVES ON THE WEBSITE', es:'EL CONTACTO VIVE EN LA WEB', de:'DER KONTAKT LEBT AUF DER WEBSITE', it:'IL CONTATTO VIVE SUL SITO WEB', ar:'التواصل يتم عبر الموقع الإلكتروني', zh:'联系我们请前往官网', ja:'お問い合わせはウェブサイトで', ru:'КОНТАКТЫ ЖИВУТ НА САЙТЕ', pl:'KONTAKT ŻYJE NA STRONIE WWW' },
  sub:   { fr:'Éditeurs, presse, joueurs, le formulaire et les réseaux du studio s’ouvrent dans ton navigateur. Ton launcher, lui, reste ta salle de jeux.', en:'Publishers, press, players, the form and the studio’s socials open in your browser. Your launcher stays your game room.', es:'Editores, prensa, jugadores, el formulario y las redes del estudio se abren en tu navegador. Tu launcher sigue siendo tu sala de juego.', de:'Publisher, Presse, Spieler, Formular und Studio-Kanäle öffnen sich in deinem Browser. Dein Launcher bleibt dein Spielzimmer.', it:'Editori, stampa, giocatori, il modulo e i social dello studio si aprono nel tuo browser. Il launcher resta la tua sala giochi.', ar:'الناشرون والصحافة واللاعبون، يُفتح النموذج وقنوات الأستوديو في متصفحك، ويبقى المشغّل غرفة ألعابك.', zh:'发行商、媒体、玩家、表单与工作室社交渠道会在浏览器中打开。启动器依然是你的游戏空间。', ja:'パブリッシャー・プレス・プレイヤーの皆さま、フォームとSNSはブラウザで開きます。ランチャーはあなたのゲームルームのままです。', ru:'Издатели, пресса, игроки, форма и соцсети студии открываются в браузере. Лаунчер остаётся вашей игровой комнатой.', pl:'Wydawcy, prasa, gracze, formularz i kanały studia otwierają się w przeglądarce. Launcher pozostaje twoją salą gier.' },
  open:  { fr:'Ouvrir la page contact', en:'Open the contact page', es:'Abrir la página de contacto', de:'Kontaktseite öffnen', it:'Apri la pagina contatti', ar:'فتح صفحة التواصل', zh:'打开联系页面', ja:'お問い合わせページを開く', ru:'Открыть страницу контактов', pl:'Otwórz stronę kontaktu' },
  mail:  { fr:'Copier l’e-mail', en:'Copy the email', es:'Copiar el correo', de:'E-Mail kopieren', it:'Copia l’e-mail', ar:'نسخ البريد الإلكتروني', zh:'复制邮箱地址', ja:'メールアドレスをコピー', ru:'Скопировать e-mail', pl:'Skopiuj e-mail' },
  copied:{ fr:'E-mail copié ✓', en:'Email copied ✓', es:'Correo copiado ✓', de:'E-Mail kopiert ✓', it:'E-mail copiata ✓', ar:'تم نسخ البريد ✓', zh:'已复制 ✓', ja:'コピーしました ✓', ru:'Скопировано ✓', pl:'Skopiowano ✓' },
};
const _cxt = k => (_CTC_LX[k] && (_CTC_LX[k][LANG] || _CTC_LX[k].en)) || '';
function _contactLauncherCard() {
  const host = $('page-contact'); if (!host) return;
  host.innerHTML = `
    <section class="pp-signed-out"><div class="pp-so-inner reveal">
      <div class="pp-so-badge">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3.5 5.5h17v13h-17z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="m4 6 8 6.5L20 6" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
      </div>
      <h1 class="pp-so-title">${_cxt('title')}</h1>
      <p class="pp-so-desc">${_cxt('sub')}</p>
      <div class="pp-so-actions">
        <button class="btn btn-primary" onclick="glgOpenExternal('https://www.geeklearngames.com/#contact')">${_cxt('open')}</button>
        <button class="btn btn-outline" id="ctc-lx-mail">${_cxt('mail')}</button>
      </div>
      <p class="ctc-lx-mailtxt">contact@geeklearngames.com</p>
    </div></section>`;
  host.querySelector('#ctc-lx-mail')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('contact@geeklearngames.com');
      const b = host.querySelector('#ctc-lx-mail'); if (b) b.textContent = _cxt('copied');
      setTimeout(() => { const b2 = host.querySelector('#ctc-lx-mail'); if (b2) b2.textContent = _cxt('mail'); }, 1800);
    } catch (e) {}
  });
  setTimeout(initReveal, 60);
}

/* ══════════════════════════════════════════
   ACCESSIBILITY, skip link + keyboard activation
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
   ACCOUNTS, UI (Supabase)
   Nav button + auth modal (login / signup / profile)
   Data layer lives in js/auth.js → window.GLG_AUTH
══════════════════════════════════════════ */
/* i18n (FR/EN robustes ; repli EN pour les autres langues, extensible) */
/* ══════════════════════════════════════════
   WISHLIST, liste de souhaits (compte + invité)
   ──────────────────────────────────────────
   • Connecté → persistée dans profiles.wishlist (Supabase)
   • Invité   → localStorage (fusionnée au compte à la connexion)
   Cache mémoire `_wishlist` + événement `glg:wishlist-changed`.
══════════════════════════════════════════ */
const _WISH_KEY = 'glg_wishlist';
let _wishlist = [];

const _WISH_T = {
  add:       { fr:'Ajouter à ma liste',  en:'Add to wishlist', es:'Añadir a deseos', de:'Zur Wunschliste', ar:'أضِف إلى قائمة الرغبات', zh:'加入心愿单', ja:'ウィッシュリストに追加', ru:'В список желаемого', pl:'Dodaj do listy życzeń', it:'Aggiungi alla lista' },
  inList:    { fr:'Dans ma liste',       en:'In your wishlist', es:'En tu lista', de:'In deiner Wunschliste', ar:'في قائمة رغباتك', zh:'已在心愿单', ja:'ウィッシュリストに登録済み', ru:'В списке желаемого', pl:'Na liście życzeń', it:'Nella tua lista' },
  title:     { fr:'Liste de souhaits',   en:'Wishlist', es:'Lista de deseos', de:'Wunschliste', ar:'قائمة الرغبات', zh:'心愿单', ja:'ウィッシュリスト', ru:'Список желаемого', pl:'Lista życzeń', it:'Lista dei desideri' },
  empty:     { fr:'Ta liste de souhaits est vide.', en:'Your wishlist is empty.', es:'Tu lista de deseos está vacía.', de:'Deine Wunschliste ist leer.', ar:'قائمة رغباتك فارغة.', zh:'你的心愿单是空的。', ja:'ウィッシュリストは空です。', ru:'Ваш список желаемого пуст.', pl:'Twoja lista życzeń jest pusta.', it:'La tua lista dei desideri è vuota.' },
  emptyCta:  { fr:'Parcourir les œuvres', en:'Browse the works', es:'Explorar las obras', de:'Werke durchstöbern', ar:'تصفّح الأعمال', zh:'浏览作品', ja:'作品を見る', ru:'Смотреть работы', pl:'Przeglądaj prace', it:'Sfoglia le opere' },
  remove:    { fr:'Retirer de la liste', en:'Remove from list', es:'Quitar de la lista', de:'Aus Liste entfernen', ar:'إزالة من القائمة', zh:'从列表移除', ja:'リストから削除', ru:'Убрать из списка', pl:'Usuń z listy', it:'Rimuovi dalla lista' },
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
  account:{fr:'Compte',en:'Account',es:'Cuenta',de:'Konto',ar:'الحساب',zh:'账号',ja:'アカウント',ru:'Аккаунт',pl:'Konto',it:'Account'}, signIn:{fr:'Se connecter',en:'Sign in',es:'Iniciar sesión',de:'Anmelden',ar:'تسجيل الدخول',zh:'登录',ja:'サインイン',ru:'Войти',pl:'Zaloguj się',it:'Accedi'},
  signUp:{fr:'Créer un compte',en:'Create account',es:'Crear cuenta',de:'Konto erstellen',ar:'إنشاء حساب',zh:'创建账号',ja:'アカウント作成',ru:'Создать аккаунт',pl:'Utwórz konto',it:'Crea un account'}, myAccount:{fr:'Mon compte',en:'My account',es:'Mi cuenta',de:'Mein Konto',ar:'حسابي',zh:'我的账号',ja:'マイアカウント',ru:'Мой аккаунт',pl:'Moje konto',it:'Il mio account'},
  email:{fr:'E-mail',en:'Email',es:'Correo',de:'E-Mail',ar:'البريد الإلكتروني',zh:'邮箱',ja:'メール',ru:'Эл. почта',pl:'E-mail',it:'E-mail'}, password:{fr:'Mot de passe',en:'Password',es:'Contraseña',de:'Passwort',ar:'كلمة المرور',zh:'密码',ja:'パスワード',ru:'Пароль',pl:'Hasło',it:'Password'},
  username:{fr:"Pseudo",en:'Username',es:'Usuario',de:'Benutzername',ar:'اسم المستخدم',zh:'用户名',ja:'ユーザー名',ru:'Никнейм',pl:'Nazwa użytkownika',it:'Nome utente'}, age:{fr:'Âge',en:'Age',es:'Edad',de:'Alter',ar:'العمر',zh:'年龄',ja:'年齢',ru:'Возраст',pl:'Wiek',it:'Età'},
  gender:{fr:'Genre',en:'Gender',es:'Género',de:'Geschlecht',ar:'الجنس',zh:'性别',ja:'性別',ru:'Пол',pl:'Płeć',it:'Genere'}, male:{fr:'Homme',en:'Male',es:'Hombre',de:'Männlich',ar:'ذكر',zh:'男',ja:'男性',ru:'Мужской',pl:'Mężczyzna',it:'Uomo'}, female:{fr:'Femme',en:'Female',es:'Mujer',de:'Weiblich',ar:'أنثى',zh:'女',ja:'女性',ru:'Женский',pl:'Kobieta',it:'Donna'},
  other:{fr:'Autre',en:'Other',es:'Otro',de:'Andere',ar:'آخر',zh:'其他',ja:'その他',ru:'Другой',pl:'Inna',it:'Altro'}, specify:{fr:'Préciser',en:'Please specify',es:'Especificar',de:'Bitte angeben',ar:'يرجى التحديد',zh:'请说明',ja:'詳細を入力',ru:'Уточните',pl:'Określ',it:'Specifica'},
  consent:{fr:"J'accepte que mes données soient utilisées pour gérer mon compte.",en:'I agree that my data is used to manage my account.',es:'Acepto que mis datos se usen para gestionar mi cuenta.',de:'Ich stimme zu, dass meine Daten zur Verwaltung meines Kontos verwendet werden.',ar:'أوافق على استخدام بياناتي لإدارة حسابي.',zh:'我同意将我的数据用于管理我的账号。',ja:'アカウント管理のためにデータが利用されることに同意します。',ru:'Я согласен на использование моих данных для управления аккаунтом.',pl:'Zgadzam się na wykorzystanie moich danych do zarządzania kontem.',it:"Acconsento all'uso dei miei dati per gestire il mio account."},
  submitLogin:{fr:'Connexion',en:'Log in',es:'Entrar',de:'Einloggen',ar:'دخول',zh:'登录',ja:'ログイン',ru:'Вход',pl:'Zaloguj',it:'Entra'}, submitSignup:{fr:'Créer mon compte',en:'Create my account',es:'Crear mi cuenta',de:'Mein Konto erstellen',ar:'إنشاء حسابي',zh:'创建我的账号',ja:'アカウントを作成',ru:'Создать аккаунт',pl:'Utwórz konto',it:'Crea il mio account'},
  remember:{fr:'Se souvenir de cet appareil',en:'Remember this device',es:'Recordar este dispositivo',de:'Dieses Gerät merken',ar:'تذكّر هذا الجهاز',zh:'记住此设备',ja:'このデバイスを記憶する',ru:'Запомнить это устройство',pl:'Zapamiętaj to urządzenie',it:'Ricorda questo dispositivo'},
  working:{fr:'Veuillez patienter…',en:'Please wait…',es:'Espera un momento…',de:'Bitte warten…',ar:'يرجى الانتظار…',zh:'请稍候…',ja:'お待ちください…',ru:'Подождите…',pl:'Proszę czekać…',it:'Attendere…'},
  logout:{fr:'Se déconnecter',en:'Log out',es:'Cerrar sesión',de:'Abmelden',ar:'تسجيل الخروج',zh:'退出登录',ja:'ログアウト',ru:'Выйти',pl:'Wyloguj się',it:'Esci'}, save:{fr:'Enregistrer',en:'Save',es:'Guardar',de:'Speichern',ar:'حفظ',zh:'保存',ja:'保存',ru:'Сохранить',pl:'Zapisz',it:'Salva'},
  saved:{fr:'Enregistré ✓',en:'Saved ✓',es:'Guardado ✓',de:'Gespeichert ✓',ar:'تم الحفظ ✓',zh:'已保存 ✓',ja:'保存しました ✓',ru:'Сохранено ✓',pl:'Zapisano ✓',it:'Salvato ✓'}, del:{fr:'Supprimer mon compte',en:'Delete my account',es:'Eliminar mi cuenta',de:'Mein Konto löschen',ar:'حذف حسابي',zh:'删除我的账号',ja:'アカウントを削除',ru:'Удалить аккаунт',pl:'Usuń moje konto',it:'Elimina il mio account'},
  delConfirm:{fr:'Supprimer définitivement ton compte ? Cette action est irréversible.',en:'Permanently delete your account? This cannot be undone.',es:'¿Eliminar tu cuenta de forma permanente? Esta acción no se puede deshacer.',de:'Konto endgültig löschen? Das kann nicht rückgängig gemacht werden.',ar:'حذف حسابك نهائيًا؟ لا يمكن التراجع عن هذا الإجراء.',zh:'永久删除你的账号？此操作无法撤销。',ja:'アカウントを完全に削除しますか？この操作は取り消せません。',ru:'Удалить аккаунт навсегда? Это действие необратимо.',pl:'Trwale usunąć konto? Tej operacji nie można cofnąć.',it:"Eliminare definitivamente il tuo account? L'azione è irreversibile."},
  memberSince:{fr:'Membre depuis',en:'Member since',es:'Miembro desde',de:'Mitglied seit',ar:'عضو منذ',zh:'注册于',ja:'登録日',ru:'В сообществе с',pl:'Członek od',it:'Membro dal'},
  haveAccount:{fr:'Déjà un compte ?',en:'Already have an account?',es:'¿Ya tienes una cuenta?',de:'Schon ein Konto?',ar:'لديك حساب بالفعل؟',zh:'已有账号？',ja:'すでにアカウントをお持ちですか？',ru:'Уже есть аккаунт?',pl:'Masz już konto?',it:'Hai già un account?'},
  noAccount:{fr:'Pas encore de compte ?',en:'No account yet?',es:'¿Aún no tienes cuenta?',de:'Noch kein Konto?',ar:'ليس لديك حساب بعد؟',zh:'还没有账号？',ja:'アカウントをお持ちでない方',ru:'Ещё нет аккаунта?',pl:'Nie masz jeszcze konta?',it:'Non hai ancora un account?'},
  checkEmail:{fr:'Compte créé ! Vérifie ta boîte mail pour confirmer ton adresse.',en:'Account created! Check your inbox to confirm your email.',es:'¡Cuenta creada! Revisa tu correo para confirmar tu dirección.',de:'Konto erstellt! Prüfe dein Postfach, um deine E-Mail zu bestätigen.',ar:'تم إنشاء الحساب! تحقق من بريدك لتأكيد عنوانك.',zh:'账号已创建！请查收邮件以确认你的邮箱。',ja:'アカウントを作成しました！メールを確認してアドレスを認証してください。',ru:'Аккаунт создан! Проверьте почту, чтобы подтвердить адрес.',pl:'Konto utworzone! Sprawdź skrzynkę, aby potwierdzić adres e-mail.',it:"Account creato! Controlla la tua casella per confermare l'indirizzo."},
  pwWeak:{fr:'Mot de passe trop faible (8+ caractères, mélange maj/min/chiffre/symbole).',en:'Password too weak (8+ chars, mix upper/lower/digit/symbol).',es:'Contraseña demasiado débil (8+ caracteres, mezcla mayús/minús/dígito/símbolo).',de:'Passwort zu schwach (8+ Zeichen, Mix aus Groß-/Kleinbuchstaben/Ziffer/Symbol).',ar:'كلمة المرور ضعيفة جدًا (8 أحرف على الأقل، مزيج من حروف كبيرة وصغيرة ورقم ورمز).',zh:'密码太弱（至少8位，需含大小写字母、数字和符号）。',ja:'パスワードが弱すぎます（8文字以上、大小英字・数字・記号の混在）。',ru:'Слишком слабый пароль (8+ символов, смесь заглавных/строчных/цифр/символов).',pl:'Hasło zbyt słabe (min. 8 znaków, duże/małe litery, cyfra, symbol).',it:'Password troppo debole (8+ caratteri, mix maiusc/minusc/cifra/simbolo).'},
  pwStrength:{fr:['Très faible','Faible','Correct','Bon','Excellent'],en:['Very weak','Weak','Fair','Good','Strong'],es:['Muy débil','Débil','Aceptable','Buena','Excelente'],de:['Sehr schwach','Schwach','Mittel','Gut','Stark'],ar:['ضعيفة جدًا','ضعيفة','مقبولة','جيدة','قوية'],zh:['非常弱','弱','一般','良好','很强'],ja:['非常に弱い','弱い','普通','良い','強い'],ru:['Очень слабый','Слабый','Средний','Хороший','Надёжный'],pl:['Bardzo słabe','Słabe','Średnie','Dobre','Mocne'],it:['Molto debole','Debole','Discreta','Buona','Forte']},
  uTaken:{fr:'Ce pseudo est déjà pris.',en:'This username is taken.',es:'Este nombre de usuario ya está en uso.',de:'Dieser Benutzername ist bereits vergeben.',ar:'اسم المستخدم هذا مأخوذ بالفعل.',zh:'该用户名已被使用。',ja:'このユーザー名は既に使われています。',ru:'Этот никнейм уже занят.',pl:'Ta nazwa użytkownika jest już zajęta.',it:'Questo nome utente è già in uso.'},
  uAvail:{fr:'Pseudo disponible ✓',en:'Username available ✓',es:'Nombre disponible ✓',de:'Benutzername verfügbar ✓',ar:'اسم المستخدم متاح ✓',zh:'用户名可用 ✓',ja:'このユーザー名は使えます ✓',ru:'Никнейм свободен ✓',pl:'Nazwa dostępna ✓',it:'Nome utente disponibile ✓'},
  uShort:{fr:'3 caractères minimum.',en:'At least 3 characters.',es:'Mínimo 3 caracteres.',de:'Mindestens 3 Zeichen.',ar:'3 أحرف على الأقل.',zh:'至少3个字符。',ja:'3文字以上。',ru:'Минимум 3 символа.',pl:'Co najmniej 3 znaki.',it:'Minimo 3 caratteri.'},
  uInvalid:{fr:'Lettres, chiffres, . _ - uniquement.',en:'Letters, numbers, . _ - only.',es:'Solo letras, números, . _ -',de:'Nur Buchstaben, Zahlen, . _ -',ar:'حروف وأرقام و . _ - فقط.',zh:'仅限字母、数字和 . _ -',ja:'英数字と . _ - のみ。',ru:'Только буквы, цифры, . _ -',pl:'Tylko litery, cyfry, . _ -',it:'Solo lettere, numeri, . _ -'},
  emailTaken:{fr:'Cet e-mail est déjà utilisé.',en:'This email is already in use.',es:'Este correo ya está en uso.',de:'Diese E-Mail wird bereits verwendet.',ar:'هذا البريد مستخدم بالفعل.',zh:'该邮箱已被使用。',ja:'このメールは既に使われています。',ru:'Эта почта уже используется.',pl:'Ten e-mail jest już używany.',it:'Questa e-mail è già in uso.'},
  emailInvalid:{fr:'E-mail invalide.',en:'Invalid email.',es:'Correo no válido.',de:'Ungültige E-Mail.',ar:'بريد إلكتروني غير صالح.',zh:'邮箱无效。',ja:'無効なメールアドレス。',ru:'Неверный e-mail.',pl:'Nieprawidłowy e-mail.',it:'E-mail non valida.'},
  badCreds:{fr:'E-mail ou mot de passe incorrect.',en:'Wrong email or password.',es:'Correo o contraseña incorrectos.',de:'E-Mail oder Passwort falsch.',ar:'البريد أو كلمة المرور غير صحيحة.',zh:'邮箱或密码错误。',ja:'メールまたはパスワードが正しくありません。',ru:'Неверная почта или пароль.',pl:'Błędny e-mail lub hasło.',it:'E-mail o password errati.'},
  notConfirmed:{fr:'E-mail pas encore confirmé, clique le lien reçu par mail.',en:'Email not confirmed yet, click the link sent to your inbox.',es:'Correo aún sin confirmar: haz clic en el enlace que te enviamos.',de:'E-Mail noch nicht bestätigt - klicke auf den zugesandten Link.',ar:'لم يتم تأكيد البريد بعد، انقر على الرابط المُرسل إلى بريدك.',zh:'邮箱尚未确认、请点击邮件中的链接。',ja:'メール未確認です、受信したリンクをクリックしてください。',ru:'Почта ещё не подтверждена, нажмите на ссылку из письма.',pl:'E-mail nie został jeszcze potwierdzony, kliknij link z wiadomości.',it:'E-mail non ancora confermata, clicca il link ricevuto.'},
  ageMin:{fr:'Tu dois avoir au moins 13 ans.',en:'You must be at least 13.',es:'Debes tener al menos 13 años.',de:'Du musst mindestens 13 Jahre alt sein.',ar:'يجب أن يكون عمرك 13 عامًا على الأقل.',zh:'你必须年满13岁。',ja:'13歳以上である必要があります。',ru:'Вам должно быть не менее 13 лет.',pl:'Musisz mieć co najmniej 13 lat.',it:'Devi avere almeno 13 anni.'},
  required:{fr:'Champ requis.',en:'Required field.',es:'Campo obligatorio.',de:'Pflichtfeld.',ar:'حقل مطلوب.',zh:'必填项。',ja:'必須項目です。',ru:'Обязательное поле.',pl:'Pole wymagane.',it:'Campo obbligatorio.'},
  genderReq:{fr:'Choisis une option.',en:'Please choose an option.',es:'Elige una opción.',de:'Bitte eine Option wählen.',ar:'يرجى اختيار خيار.',zh:'请选择一个选项。',ja:'選択してください。',ru:'Выберите вариант.',pl:'Wybierz opcję.',it:"Scegli un'opzione."},
  consentReq:{fr:'Tu dois accepter pour continuer.',en:'You must accept to continue.',es:'Debes aceptar para continuar.',de:'Du musst zustimmen, um fortzufahren.',ar:'يجب أن توافق للمتابعة.',zh:'你必须同意才能继续。',ja:'続行するには同意が必要です。',ru:'Чтобы продолжить, нужно согласие.',pl:'Musisz zaakceptować, aby kontynuować.',it:'Devi accettare per continuare.'},
  fail:{fr:"Échec, réessaie.",en:'Failed, please try again.',es:'Error: inténtalo de nuevo.',de:'Fehlgeschlagen - bitte erneut versuchen.',ar:'فشل، حاول مرة أخرى.',zh:'失败、请重试。',ja:'失敗しました、もう一度お試しください。',ru:'Не удалось, попробуйте снова.',pl:'Niepowodzenie, spróbuj ponownie.',it:'Operazione fallita, riprova.'},
  rateLimit:{fr:"Trop de tentatives. Patiente quelques minutes (limite d'e-mails du plan gratuit), ou désactive temporairement la confirmation e-mail dans Supabase.",en:'Too many attempts. Wait a few minutes (free-tier email limit), or temporarily disable email confirmation in Supabase.',es:'Demasiados intentos. Espera unos minutos (límite de correos del plan gratuito) o desactiva temporalmente la confirmación por correo en Supabase.',de:'Zu viele Versuche. Warte einige Minuten (E-Mail-Limit im Gratis-Tarif) oder deaktiviere die E-Mail-Bestätigung in Supabase vorübergehend.',ar:'محاولات كثيرة جدًا. انتظر بضع دقائق (حد رسائل الخطة المجانية)، أو عطّل تأكيد البريد مؤقتًا في Supabase.',zh:'尝试次数过多。请等待几分钟（免费套餐邮件限制），或在 Supabase 中暂时关闭邮箱确认。',ja:'試行回数が多すぎます。数分お待ちください（無料プランのメール制限）。または Supabase でメール確認を一時的に無効化してください。',ru:'Слишком много попыток. Подождите несколько минут (лимит писем бесплатного тарифа) или временно отключите подтверждение почты в Supabase.',pl:'Zbyt wiele prób. Poczekaj kilka minut (limit e-maili w darmowym planie) lub tymczasowo wyłącz potwierdzanie e-mail w Supabase.',it:'Troppi tentativi. Attendi qualche minuto (limite e-mail del piano gratuito) o disattiva temporaneamente la conferma e-mail in Supabase.'},
  notConfigured:{fr:'Les comptes ne sont pas encore activés sur ce site.',en:'Accounts are not enabled on this site yet.',es:'Las cuentas aún no están activadas en este sitio.',de:'Konten sind auf dieser Seite noch nicht aktiviert.',ar:'الحسابات غير مفعّلة على هذا الموقع بعد.',zh:'本站尚未启用账号功能。',ja:'このサイトではアカウント機能はまだ有効ではありません。',ru:'Аккаунты на этом сайте пока не включены.',pl:'Konta nie są jeszcze włączone na tej stronie.',it:'Gli account non sono ancora attivi su questo sito.'},
  close:{fr:'Fermer',en:'Close',es:'Cerrar',de:'Schließen',ar:'إغلاق',zh:'关闭',ja:'閉じる',ru:'Закрыть',pl:'Zamknij',it:'Chiudi'},
  profileItem:{fr:'Profil',en:'Profile',es:'Perfil',de:'Profil',ar:'الملف الشخصي',zh:'个人资料',ja:'プロフィール',ru:'Профиль',pl:'Profil',it:'Profilo'}, optionsItem:{fr:'Options',en:'Options',es:'Opciones',de:'Optionen',ar:'الخيارات',zh:'选项',ja:'オプション',ru:'Настройки',pl:'Opcje',it:'Opzioni'},
  chooseAvatar:{fr:'Choisir un avatar',en:'Choose an avatar',es:'Elegir un avatar',de:'Avatar wählen',ar:'اختر صورة رمزية',zh:'选择头像',ja:'アバターを選ぶ',ru:'Выбрать аватар',pl:'Wybierz awatar',it:'Scegli un avatar'},
  avatarChange:{fr:"Changer d'avatar",en:'Change avatar',es:'Cambiar avatar',de:'Avatar ändern',ar:'تغيير الصورة الرمزية',zh:'更换头像',ja:'アバターを変更',ru:'Сменить аватар',pl:'Zmień awatar',it:'Cambia avatar'},
  presetsLabel:{fr:'Personnages',en:'Characters',es:'Personajes',de:'Charaktere',ar:'الشخصيات',zh:'角色',ja:'キャラクター',ru:'Персонажи',pl:'Postacie',it:'Personaggi'},
  customLabel:{fr:'Image personnelle',en:'Custom image',es:'Imagen personal',de:'Eigenes Bild',ar:'صورة شخصية',zh:'自定义图片',ja:'カスタム画像',ru:'Своё изображение',pl:'Własny obraz',it:'Immagine personale'},
  uploadBtn:{fr:'Téléverser une image',en:'Upload an image',es:'Subir una imagen',de:'Bild hochladen',ar:'رفع صورة',zh:'上传图片',ja:'画像をアップロード',ru:'Загрузить изображение',pl:'Prześlij obraz',it:"Carica un'immagine"},
  back:{fr:'Retour',en:'Back',es:'Volver',de:'Zurück',ar:'رجوع',zh:'返回',ja:'戻る',ru:'Назад',pl:'Wstecz',it:'Indietro'},
  imgType:{fr:'Format non supporté (PNG, JPG, WEBP).',en:'Unsupported format (PNG, JPG, WEBP).',es:'Formato no admitido (PNG, JPG, WEBP).',de:'Format nicht unterstützt (PNG, JPG, WEBP).',ar:'صيغة غير مدعومة (PNG، JPG، WEBP).',zh:'不支持的格式（PNG, JPG, WEBP）。',ja:'対応していない形式です（PNG, JPG, WEBP）。',ru:'Формат не поддерживается (PNG, JPG, WEBP).',pl:'Nieobsługiwany format (PNG, JPG, WEBP).',it:'Formato non supportato (PNG, JPG, WEBP).'},
  imgSize:{fr:'Image trop lourde (max 2 Mo).',en:'Image too large (max 2 MB).',es:'Imagen demasiado grande (máx. 2 MB).',de:'Bild zu groß (max. 2 MB).',ar:'الصورة كبيرة جدًا (الحد الأقصى 2 ميغابايت).',zh:'图片过大（最大2 MB）。',ja:'画像が大きすぎます（最大2 MB）。',ru:'Изображение слишком большое (макс. 2 МБ).',pl:'Obraz zbyt duży (maks. 2 MB).',it:'Immagine troppo pesante (max 2 MB).'},
  dobLbl:{fr:'Date de naissance',en:'Date of birth',es:'Fecha de nacimiento',de:'Geburtsdatum',ar:'تاريخ الميلاد',zh:'出生日期',ja:'生年月日',ru:'Дата рождения',pl:'Data urodzenia',it:'Data di nascita'},
  dayLbl:{fr:'Jour',en:'Day',es:'Día',de:'Tag',ar:'اليوم',zh:'日',ja:'日',ru:'День',pl:'Dzień',it:'Giorno'}, monthLbl:{fr:'Mois',en:'Month',es:'Mes',de:'Monat',ar:'الشهر',zh:'月',ja:'月',ru:'Месяц',pl:'Miesiąc',it:'Mese'}, yearLbl:{fr:'Année',en:'Year',es:'Año',de:'Jahr',ar:'السنة',zh:'年',ja:'年',ru:'Год',pl:'Rok',it:'Anno'},
  showPw:{fr:'Afficher le mot de passe',en:'Show password',es:'Mostrar contraseña',de:'Passwort anzeigen',ar:'إظهار كلمة المرور',zh:'显示密码',ja:'パスワードを表示',ru:'Показать пароль',pl:'Pokaż hasło',it:'Mostra password'}, hidePw:{fr:'Masquer le mot de passe',en:'Hide password',es:'Ocultar contraseña',de:'Passwort verbergen',ar:'إخفاء كلمة المرور',zh:'隐藏密码',ja:'パスワードを隠す',ru:'Скрыть пароль',pl:'Ukryj hasło',it:'Nascondi password'},
  dobInvalid:{fr:'Date de naissance invalide.',en:'Invalid date of birth.',es:'Fecha de nacimiento no válida.',de:'Ungültiges Geburtsdatum.',ar:'تاريخ ميلاد غير صالح.',zh:'出生日期无效。',ja:'無効な生年月日です。',ru:'Неверная дата рождения.',pl:'Nieprawidłowa data urodzenia.',it:'Data di nascita non valida.'},
};
function _at(k){ const m=_AUTH_T[k]; if(!m) return k; return m[LANG]||m.en; }

/* Localised month names for the date-of-birth selector (fallback EN). */
const _AUTH_MONTHS = {
  fr:['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'],
  en:['January','February','March','April','May','June','July','August','September','October','November','December'],
  es:['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],
  de:['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'],
  it:['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'],
  ar:['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'],
  zh:['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'],
  ja:['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'],
  ru:['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'],
  pl:['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'],
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
  const url  = safeMediaUrl(profile?.avatar_url);
  const init = escHtml(((profile?.username || user?.email || '?')[0] || '?').toUpperCase());
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
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', 'nav-account-menu');
  btn.title = _at('account');
  btn.innerHTML = `<span class="nav-account-ava">${_ACCOUNT_ICON}</span><span class="nav-account-name"></span>`;
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const loggedIn = btn.classList.contains('is-auth');
    if (loggedIn) toggleAccountMenu();
    else openAuthModal('login');
  });
  // Le compte vit dans le cluster droit (.nav-right) → toujours tout à droite
  const right = nav.querySelector('.nav-right');
  if (right) right.appendChild(btn);
  else nav.appendChild(btn);
  _buildAccountMenu();
}

/* Dropdown shown when clicking the avatar (logged in) */
function _buildAccountMenu() {
  // Contenu du menu, regénéré à chaque appel (les libellés suivent la langue).
  // Bibliothèque : entrée réservée au launcher (le web n'y présente pas la page).
  const itemsHTML = `
    <button class="acct-menu-item" data-act="profile" role="menuitem">${_at('profileItem')}</button>
    ${IS_TAURI ? `<button class="acct-menu-item" data-act="library" role="menuitem">${_lbt('navLabel')}</button>` : ''}
    ${IS_TAURI ? `<button class="acct-menu-item" data-act="options" role="menuitem">${_at('optionsItem')}</button>` : ''}
    <button class="acct-menu-item acct-menu-item--danger" data-act="logout" role="menuitem">${_at('logout')}</button>`;
  const existing = $('nav-account-menu');
  if (existing) { existing.innerHTML = itemsHTML; return; } // listeners délégués conservés
  const menu = document.createElement('div');
  menu.id = 'nav-account-menu';
  menu.className = 'acct-menu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = itemsHTML;
  document.body.appendChild(menu);
  menu.addEventListener('click', async e => {
    const act = e.target.closest('.acct-menu-item')?.dataset.act;
    if (!act) return;
    closeAccountMenu();
    if (act === 'profile') { _viewProfileId = null; showPage('profile'); }
    else if (act === 'library') showPage('library');
    else if (act === 'options') showPage('settings');
    else if (act === 'logout') { await GLG_AUTH.signOut(); refreshAccountUI(); }
  });
  // Navigation clavier du menu (pattern ARIA menu) : flèches + Échap
  menu.addEventListener('keydown', e => {
    const items = [...menu.querySelectorAll('.acct-menu-item')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { closeAccountMenu(); $('nav-account-btn')?.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); (items[i + 1] || items[0])?.focus(); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); (items[i - 1] || items[items.length - 1])?.focus(); }
    else if (e.key === 'Home')      { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === 'End')       { e.preventDefault(); items[items.length - 1]?.focus(); }
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
  menu.querySelector('[data-act="library"]') && (menu.querySelector('[data-act="library"]').textContent = _lbt('navLabel'));
  menu.querySelector('[data-act="options"]').textContent = _at('optionsItem');
  menu.querySelector('[data-act="logout"]').textContent  = _at('logout');
  const r = btn.getBoundingClientRect();
  menu.style.top   = (r.bottom + 8) + 'px';
  menu.style.right = (window.innerWidth - r.right) + 'px';
  menu.classList.add('open');
  btn.setAttribute('aria-expanded', 'true');
  setTimeout(() => menu.querySelector('.acct-menu-item')?.focus(), 20); // focus premier item (a11y)
}
function closeAccountMenu() {
  $('nav-account-menu')?.classList.remove('open');
  $('nav-account-btn')?.setAttribute('aria-expanded', 'false');
}

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

  if (user) { closeAuthModal(); showPage('settings'); return; }  // connecté → page Paramètres dédiée

  const notice = configured ? '' : `<div class="auth-notice">${_at('notConfigured')}</div>`;
  m.innerHTML = `
    <div class="auth-box" role="dialog" aria-modal="true" aria-label="${_at(_authTab === 'login' ? 'signIn' : 'signUp')}">
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
      <label class="auth-consent auth-remember"><input type="checkbox" id="al-remember" checked><span>${_at('remember')}</span></label>
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
  const yearOpts = Array.from({ length: 88 }, (_, i) => { const y = yNow - 13 - i; return `<option value="${y}">${y}</option>`; }).join(''); // 13-100 yrs
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
      <label class="auth-consent auth-remember"><input type="checkbox" id="as-remember" checked><span>${_at('remember')}</span></label>
      <label class="auth-consent"><input type="checkbox" id="as-consent"><span>${_at('consent')}</span></label>
      <p class="auth-err" id="as-err" hidden></p>
      <button type="submit" class="btn btn-primary auth-submit" id="as-submit">${_at('submitSignup')}</button>
      <p class="auth-switch">${_at('haveAccount')} <button type="button" class="auth-link" onclick="_authTab='login';renderAuthModal()">${_at('signIn')}</button></p>
    </form>`;
}

function _showErr(id, msg) { const e = $(id); if (e) { e.setAttribute('role', 'alert'); e.textContent = msg; e.hidden = false; } } // role=alert → lu par les lecteurs d'écran
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
    // « Se souvenir de cet appareil » : posé AVANT signIn → la session
    // atterrit dans le bon stockage (local = survit, session = éphémère).
    window.GLG_AUTH?.setRemember?.($('al-remember')?.checked !== false);
    const r = await GLG_AUTH.signIn({ email: $('al-email').value, password: $('al-pass').value });
    btn.disabled = false; btn.textContent = orig;
    if (!r.ok) {
      const map = { badCredentials:_at('badCreds'), rateLimit:_at('rateLimit'), notConfirmed:_at('notConfirmed') };
      _showErr('al-err', map[r.code] || _at('fail')); return;
    }
    // ── 2FA (style Steam Guard) : si le compte a un facteur TOTP vérifié,
    // la session est encore en aal1 → exiger le code à 6 chiffres avant
    // d'ouvrir le compte. Annuler = déconnexion (jamais de demi-session).
    try {
      const aal = await GLG_AUTH.mfaAal?.();
      if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') { _renderTotpStep(); return; }
    } catch (err) {}
    closeAuthModal(); refreshAccountUI();
  });
}

/* Étape TOTP de la modale de connexion (après mot de passe correct). */
function _renderTotpStep() {
  const m = $('glg-auth-modal'); if (!m) return;
  m.querySelector('.auth-box')?.setAttribute('aria-label', _mt('stepTitle')); // nom accessible de l'étape
  const box = m.querySelector('.auth-body') || m;
  box.innerHTML = `
    <form id="auth-totp" class="auth-totp" novalidate>
      <div class="auth-totp-ico" aria-hidden="true">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.4"/><path d="M8 10V7a4 4 0 018 0v3" stroke="currentColor" stroke-width="1.4"/><circle cx="12" cy="15" r="1.4" fill="currentColor"/></svg>
      </div>
      <h3 class="auth-totp-title">${_mt('stepTitle')}</h3>
      <p class="auth-totp-sub">${_mt('stepSub')}</p>
      <input type="text" id="at-code" class="auth-totp-input" inputmode="numeric" autocomplete="one-time-code"
             maxlength="6" pattern="[0-9]*" placeholder="••••••" aria-label="${_mt('stepTitle')}">
      <p class="auth-err" id="at-err" hidden></p>
      <button type="submit" class="btn btn-primary auth-submit" id="at-submit">${_mt('verify')}</button>
      <button type="button" class="auth-link" id="at-cancel">${_mt('cancel')}</button>
    </form>`;
  const input = $('at-code'); input?.focus();
  input?.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 6); });
  $('at-cancel')?.addEventListener('click', async () => { await GLG_AUTH.signOut(); closeAuthModal(); refreshAccountUI(); });
  $('auth-totp')?.addEventListener('submit', async e => {
    e.preventDefault(); _hideErr('at-err');
    const code = (input?.value || '').trim();
    if (code.length !== 6) { _showErr('at-err', _mt('badCode')); return; }
    const btn = $('at-submit'); const orig = btn.textContent;
    btn.disabled = true; btn.textContent = _at('working');
    const r = await GLG_AUTH.mfaChallengeVerify?.(code);
    btn.disabled = false; btn.textContent = orig;
    if (!r || !r.ok) { _showErr('at-err', _mt('badCode')); return; }
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
    window.GLG_AUTH?.setRemember?.($('as-remember')?.checked !== false); // avant signUp → bon stockage
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

/* ══════════════════════════════════════════════════════════
   PRÉFÉRENCES UTILISATEUR (colonne profiles.prefs jsonb)
   Réellement fonctionnelles côté client : réduction d'animations,
   couleur d'accent, filtres de notifications, confidentialité.
══════════════════════════════════════════════════════════ */
/* ── 2FA TOTP (Steam Guard maison), i18n ── */
const _MFA_T = {
  title:    { fr:'Authentification à deux facteurs', en:'Two-factor authentication', es:'Autenticación en dos pasos', de:'Zwei-Faktor-Authentifizierung', it:'Autenticazione a due fattori', ar:'المصادقة الثنائية', zh:'两步验证', ja:'二段階認証', ru:'Двухфакторная аутентификация', pl:'Uwierzytelnianie dwuskładnikowe' },
  desc:     { fr:'Protège ton compte comme Steam Guard : un code à 6 chiffres depuis ton application d’authentification (Google Authenticator, Authy…) sera demandé à chaque connexion.', en:'Protect your account Steam Guard-style: a 6-digit code from your authenticator app (Google Authenticator, Authy…) will be required at every sign-in.', es:'Protege tu cuenta al estilo Steam Guard: se pedirá un código de 6 dígitos de tu app de autenticación en cada inicio de sesión.', de:'Schütze dein Konto im Steam-Guard-Stil: Bei jeder Anmeldung wird ein 6-stelliger Code aus deiner Authenticator-App verlangt.', it:'Proteggi il tuo account in stile Steam Guard: a ogni accesso verrà richiesto un codice a 6 cifre dalla tua app di autenticazione.', ar:'احمِ حسابك على طريقة Steam Guard: سيُطلب رمز من 6 أرقام من تطبيق المصادقة عند كل تسجيل دخول.', zh:'像 Steam 令牌一样保护你的账户：每次登录都需要输入身份验证器应用中的6位验证码。', ja:'Steam Guardのようにアカウントを保護：ログインごとに認証アプリの6桁コードが必要になります。', ru:'Защитите аккаунт в стиле Steam Guard: при каждом входе потребуется 6-значный код из приложения-аутентификатора.', pl:'Chroń konto w stylu Steam Guard: przy każdym logowaniu wymagany będzie 6-cyfrowy kod z aplikacji uwierzytelniającej.' },
  enable:   { fr:'Activer le 2FA', en:'Enable 2FA', es:'Activar 2FA', de:'2FA aktivieren', it:'Attiva 2FA', ar:'تفعيل المصادقة الثنائية', zh:'启用两步验证', ja:'二段階認証を有効化', ru:'Включить 2FA', pl:'Włącz 2FA' },
  disable:  { fr:'Désactiver', en:'Disable', es:'Desactivar', de:'Deaktivieren', it:'Disattiva', ar:'تعطيل', zh:'停用', ja:'無効化', ru:'Отключить', pl:'Wyłącz' },
  active:   { fr:'2FA actif, ton compte est protégé', en:'2FA active, your account is protected', es:'2FA activo, tu cuenta está protegida', de:'2FA aktiv, dein Konto ist geschützt', it:'2FA attivo, il tuo account è protetto', ar:'المصادقة الثنائية مفعّلة، حسابك محمي', zh:'两步验证已启用、你的账户受到保护', ja:'二段階認証が有効、アカウントは保護されています', ru:'2FA включена, ваш аккаунт защищён', pl:'2FA aktywne, twoje konto jest chronione' },
  scan:     { fr:'1. Scanne ce QR code avec ton application d’authentification', en:'1. Scan this QR code with your authenticator app', es:'1. Escanea este código QR con tu app de autenticación', de:'1. Scanne diesen QR-Code mit deiner Authenticator-App', it:'1. Scansiona questo codice QR con la tua app di autenticazione', ar:'1. امسح رمز QR بتطبيق المصادقة', zh:'1. 用身份验证器应用扫描此二维码', ja:'1. 認証アプリでこのQRコードをスキャン', ru:'1. Отсканируйте этот QR-код приложением-аутентификатором', pl:'1. Zeskanuj ten kod QR aplikacją uwierzytelniającą' },
  manual:   { fr:'Ou saisis cette clé manuellement :', en:'Or enter this key manually:', es:'O introduce esta clave manualmente:', de:'Oder gib diesen Schlüssel manuell ein:', it:'Oppure inserisci questa chiave manualmente:', ar:'أو أدخل هذا المفتاح يدوياً:', zh:'或手动输入此密钥：', ja:'または、このキーを手動で入力：', ru:'Или введите этот ключ вручную:', pl:'Lub wpisz ten klucz ręcznie:' },
  confirm:  { fr:'2. Saisis le code à 6 chiffres généré', en:'2. Enter the generated 6-digit code', es:'2. Introduce el código de 6 dígitos generado', de:'2. Gib den generierten 6-stelligen Code ein', it:'2. Inserisci il codice a 6 cifre generato', ar:'2. أدخل الرمز المكوَّن من 6 أرقام', zh:'2. 输入生成的6位验证码', ja:'2. 生成された6桁コードを入力', ru:'2. Введите сгенерированный 6-значный код', pl:'2. Wpisz wygenerowany 6-cyfrowy kod' },
  verify:   { fr:'Vérifier', en:'Verify', es:'Verificar', de:'Bestätigen', it:'Verifica', ar:'تحقّق', zh:'验证', ja:'確認', ru:'Подтвердить', pl:'Zweryfikuj' },
  cancel:   { fr:'Annuler', en:'Cancel', es:'Cancelar', de:'Abbrechen', it:'Annulla', ar:'إلغاء', zh:'取消', ja:'キャンセル', ru:'Отмена', pl:'Anuluj' },
  badCode:  { fr:'Code invalide, réessaie.', en:'Invalid code, try again.', es:'Código no válido, inténtalo de nuevo.', de:'Ungültiger Code, versuch es erneut.', it:'Codice non valido, riprova.', ar:'رمز غير صالح، حاول مجدداً.', zh:'验证码无效、请重试。', ja:'コードが無効です、もう一度お試しください。', ru:'Неверный код, попробуйте ещё раз.', pl:'Nieprawidłowy kod, spróbuj ponownie.' },
  stepTitle:{ fr:'Vérification en deux étapes', en:'Two-step verification', es:'Verificación en dos pasos', de:'Bestätigung in zwei Schritten', it:'Verifica in due passaggi', ar:'التحقق بخطوتين', zh:'两步验证', ja:'2段階認証', ru:'Двухэтапная проверка', pl:'Weryfikacja dwuetapowa' },
  stepSub:  { fr:'Saisis le code à 6 chiffres de ton application d’authentification.', en:'Enter the 6-digit code from your authenticator app.', es:'Introduce el código de 6 dígitos de tu app de autenticación.', de:'Gib den 6-stelligen Code aus deiner Authenticator-App ein.', it:'Inserisci il codice a 6 cifre della tua app di autenticazione.', ar:'أدخل الرمز المكوَّن من 6 أرقام من تطبيق المصادقة.', zh:'请输入身份验证器应用中的6位验证码。', ja:'認証アプリの6桁コードを入力してください。', ru:'Введите 6-значный код из приложения-аутентификатора.', pl:'Wpisz 6-cyfrowy kod z aplikacji uwierzytelniającej.' },
  disableConfirm: { fr:'Désactiver la double authentification ? Ton compte sera moins protégé.', en:'Disable two-factor authentication? Your account will be less protected.', es:'¿Desactivar la autenticación en dos pasos? Tu cuenta estará menos protegida.', de:'Zwei-Faktor-Authentifizierung deaktivieren? Dein Konto ist dann weniger geschützt.', it:'Disattivare l’autenticazione a due fattori? Il tuo account sarà meno protetto.', ar:'تعطيل المصادقة الثنائية؟ سيصبح حسابك أقل حماية.', zh:'停用两步验证？你的账户保护将降低。', ja:'二段階認証を無効にしますか？アカウントの保護が弱くなります。', ru:'Отключить двухфакторную аутентификацию? Ваш аккаунт будет защищён хуже.', pl:'Wyłączyć uwierzytelnianie dwuskładnikowe? Twoje konto będzie słabiej chronione.' },
  err:      { fr:'Opération impossible pour le moment.', en:'Operation unavailable right now.', es:'Operación no disponible ahora mismo.', de:'Vorgang derzeit nicht möglich.', it:'Operazione non disponibile al momento.', ar:'العملية غير متاحة حالياً.', zh:'操作暂时不可用。', ja:'現在この操作はできません。', ru:'Операция сейчас недоступна.', pl:'Operacja chwilowo niedostępna.' },
};
const _mt = k => (_MFA_T[k] && (_MFA_T[k][LANG] || _MFA_T[k].en)) || '';

const _OPT_T = {
  descProfile:{fr:'Ton identité publique, pseudo, genre, âge, bio et bannière.',en:'Your public identity, username, gender, age, bio and banner.',es:'Tu identidad pública, usuario, género, edad, bio y portada.',de:'Deine öffentliche Identität, Name, Geschlecht, Alter, Bio und Banner.',it:'La tua identità pubblica, nome, genere, età, bio e banner.',ar:'هويتك العامة، الاسم والجنس والعمر والنبذة والغلاف.',zh:'你的公开身份、用户名、性别、年龄、简介与横幅。',ja:'あなたの公開プロフィール、名前・性別・年齢・自己紹介・バナー。',ru:'Ваша публичная личность, имя, пол, возраст, био и баннер.',pl:'Twoja publiczna tożsamość, nazwa, płeć, wiek, bio i baner.'},
  descPerso:{fr:'L’apparence et le ressenti du launcher, couleur d’accent, animations, sons.',en:'How the launcher looks and feels, accent color, motion, sounds.',es:'La apariencia del launcher, color de acento, animaciones, sonidos.',de:'Aussehen und Verhalten des Launchers, Akzentfarbe, Animationen, Sounds.',it:'Aspetto e feeling del launcher, colore d’accento, animazioni, suoni.',ar:'مظهر المشغّل وإحساسه، لون التمييز والحركة والأصوات.',zh:'启动器的外观与手感、强调色、动效、音效。',ja:'ランチャーの見た目と手触り、アクセントカラー・アニメーション・サウンド。',ru:'Внешний вид лаунчера, акцентный цвет, анимации, звуки.',pl:'Wygląd i odczucia launchera, kolor akcentu, animacje, dźwięki.'},
  descNotif:{fr:'Choisis ce qui mérite de te prévenir, le reste se tait.',en:'Choose what deserves to notify you, the rest stays quiet.',es:'Elige qué merece avisarte, el resto guarda silencio.',de:'Wähle, was dich benachrichtigen darf, der Rest bleibt still.',it:'Scegli cosa merita di avvisarti, il resto tace.',ar:'اختر ما يستحق تنبيهك، ويصمت الباقي.',zh:'选择值得提醒你的内容、其余保持安静。',ja:'通知する価値のあるものだけを選ぼう、あとは静かに。',ru:'Выберите, что достойно уведомления, остальное молчит.',pl:'Wybierz, co zasługuje na powiadomienie, reszta milczy.'},
  descPrivacy:{fr:'Ce que les autres joueurs voient de toi. Toi seul décides.',en:'What other players see of you. You alone decide.',es:'Lo que otros jugadores ven de ti. Solo tú decides.',de:'Was andere Spieler von dir sehen. Du allein entscheidest.',it:'Ciò che gli altri giocatori vedono di te. Decidi solo tu.',ar:'ما يراه اللاعبون الآخرون عنك. أنت وحدك من يقرر.',zh:'其他玩家能看到你的哪些内容，由你决定。',ja:'他のプレイヤーに何を見せるか。決めるのはあなただけ。',ru:'Что видят о вас другие игроки. Решаете только вы.',pl:'Co widzą o tobie inni gracze. Tylko ty decydujesz.'},
  descAccount:{fr:'Sécurité et accès, mot de passe, double authentification, langue, session.',en:'Security and access, password, two-factor, language, session.',es:'Seguridad y acceso, contraseña, doble factor, idioma, sesión.',de:'Sicherheit und Zugang, Passwort, 2FA, Sprache, Sitzung.',it:'Sicurezza e accesso, password, 2FA, lingua, sessione.',ar:'الأمان والوصول، كلمة المرور والمصادقة الثنائية واللغة والجلسة.',zh:'安全与访问、密码、两步验证、语言、会话。',ja:'セキュリティとアクセス、パスワード・2FA・言語・セッション。',ru:'Безопасность и доступ, пароль, 2FA, язык, сессия.',pl:'Bezpieczeństwo i dostęp, hasło, 2FA, język, sesja.'},
  descUpdates:{fr:'La version du launcher, les mises à jour signées et le journal des nouveautés.',en:'Launcher version, signed updates and the changelog.',es:'La versión del launcher, actualizaciones firmadas y novedades.',de:'Launcher-Version, signierte Updates und das Änderungsprotokoll.',it:'Versione del launcher, aggiornamenti firmati e novità.',ar:'إصدار المشغّل والتحديثات الموقّعة وسجل الجديد.',zh:'启动器版本、签名更新与更新日志。',ja:'ランチャーのバージョン、署名付きアップデート、更新履歴。',ru:'Версия лаунчера, подписанные обновления и журнал изменений.',pl:'Wersja launchera, podpisane aktualizacje i dziennik zmian.'},
  tabAv:{fr:'Voix & vidéo',en:'Voice & video',es:'Voz y vídeo',de:'Sprache & Video',it:'Voce e video',ar:'الصوت والفيديو',zh:'语音与视频',ja:'音声・ビデオ',ru:'Голос и видео',pl:'Głos i wideo'},
  descAv:{fr:'Micro, sortie audio et caméra, teste tout ici avant tes appels et notes vocales.',en:'Microphone, audio output and camera, test everything here before your calls and voice notes.',es:'Micrófono, salida de audio y cámara, pruébalo todo aquí antes de tus llamadas.',de:'Mikrofon, Audioausgabe und Kamera, teste hier alles vor deinen Anrufen.',it:'Microfono, uscita audio e fotocamera, prova tutto qui prima delle chiamate.',ar:'الميكروفون ومخرج الصوت والكاميرا، اختبر كل شيء هنا قبل مكالماتك.',zh:'麦克风、音频输出与摄像头、通话前在这里全部测试。',ja:'マイク・オーディオ出力・カメラ、通話前にここですべてテスト。',ru:'Микрофон, вывод звука и камера, проверьте всё здесь перед звонками.',pl:'Mikrofon, wyjście audio i kamera, przetestuj wszystko przed rozmowami.'},
  micIn:{fr:'Périphérique d’entrée',en:'Input device',es:'Dispositivo de entrada',de:'Eingabegerät',it:'Dispositivo di ingresso',ar:'جهاز الإدخال',zh:'输入设备',ja:'入力デバイス',ru:'Устройство ввода',pl:'Urządzenie wejściowe'},
  audioOut:{fr:'Périphérique de sortie',en:'Output device',es:'Dispositivo de salida',de:'Ausgabegerät',it:'Dispositivo di uscita',ar:'جهاز الإخراج',zh:'输出设备',ja:'出力デバイス',ru:'Устройство вывода',pl:'Urządzenie wyjściowe'},
  camera:{fr:'Caméra',en:'Camera',es:'Cámara',de:'Kamera',it:'Fotocamera',ar:'الكاميرا',zh:'摄像头',ja:'カメラ',ru:'Камера',pl:'Kamera'},
  devDefault:{fr:'Par défaut du système',en:'System default',es:'Predeterminado del sistema',de:'Systemstandard',it:'Predefinito di sistema',ar:'افتراضي النظام',zh:'系统默认',ja:'システム既定',ru:'Системный по умолчанию',pl:'Domyślne systemowe'},
  micTest:{fr:'Tester le micro',en:'Test microphone',es:'Probar el micrófono',de:'Mikrofon testen',it:'Prova il microfono',ar:'اختبار الميكروفون',zh:'测试麦克风',ja:'マイクをテスト',ru:'Проверить микрофон',pl:'Przetestuj mikrofon'},
  testStop:{fr:'Arrêter le test',en:'Stop test',es:'Detener la prueba',de:'Test beenden',it:'Ferma il test',ar:'إيقاف الاختبار',zh:'停止测试',ja:'テストを停止',ru:'Остановить проверку',pl:'Zatrzymaj test'},
  outTest:{fr:'Tester la sortie',en:'Test output',es:'Probar la salida',de:'Ausgabe testen',it:'Prova l’uscita',ar:'اختبار الإخراج',zh:'测试输出',ja:'出力をテスト',ru:'Проверить вывод',pl:'Przetestuj wyjście'},
  camTest:{fr:'Aperçu de la caméra',en:'Camera preview',es:'Vista previa de la cámara',de:'Kameravorschau',it:'Anteprima fotocamera',ar:'معاينة الكاميرا',zh:'摄像头预览',ja:'カメラプレビュー',ru:'Предпросмотр камеры',pl:'Podgląd kamery'},
  devHint:{fr:'Les noms des périphériques apparaissent après la première autorisation du micro/caméra.',en:'Device names appear after the first microphone/camera permission.',es:'Los nombres de los dispositivos aparecen tras el primer permiso de micro/cámara.',de:'Gerätenamen erscheinen nach der ersten Mikrofon-/Kamera-Freigabe.',it:'I nomi dei dispositivi appaiono dopo il primo consenso a micro/fotocamera.',ar:'تظهر أسماء الأجهزة بعد أول إذن للميكروفون/الكاميرا.',zh:'设备名称在首次授权麦克风/摄像头后显示。',ja:'デバイス名はマイク／カメラの初回許可後に表示されます。',ru:'Названия устройств появляются после первого разрешения микрофона/камеры.',pl:'Nazwy urządzeń pojawiają się po pierwszej zgodzie na mikrofon/kamerę.'},
  optxTitle:{fr:'LES OPTIONS VIVENT DANS LE LAUNCHER',en:'SETTINGS LIVE IN THE LAUNCHER',es:'LOS AJUSTES VIVEN EN EL LAUNCHER',de:'DIE OPTIONEN LEBEN IM LAUNCHER',it:'LE OPZIONI VIVONO NEL LAUNCHER',ar:'الإعدادات تعيش في المشغّل',zh:'设置安家于启动器',ja:'設定はランチャーの中に',ru:'НАСТРОЙКИ ЖИВУТ В ЛАУНЧЕРЕ',pl:'OPCJE ŻYJĄ W LAUNCHERZE'},
  optxSub:{fr:'Profil, personnalisation, notifications, confidentialité, sécurité (2FA) et mises à jour, le centre de contrôle complet est réservé à l’application de bureau.',en:'Profile, personalization, notifications, privacy, security (2FA) and updates, the full control center is exclusive to the desktop app.',es:'Perfil, personalización, notificaciones, privacidad, seguridad (2FA) y actualizaciones, el centro de control completo es exclusivo de la aplicación de escritorio.',de:'Profil, Personalisierung, Benachrichtigungen, Privatsphäre, Sicherheit (2FA) und Updates, das komplette Kontrollzentrum gibt es nur in der Desktop-App.',it:'Profilo, personalizzazione, notifiche, privacy, sicurezza (2FA) e aggiornamenti, il centro di controllo completo è esclusivo dell’app desktop.',ar:'الملف والتخصيص والإشعارات والخصوصية والأمان (2FA) والتحديثات، مركز التحكم الكامل حصري لتطبيق سطح المكتب.',zh:'个人资料、个性化、通知、隐私、安全（两步验证）与更新、完整的控制中心为桌面应用独享。',ja:'プロフィール、カスタマイズ、通知、プライバシー、セキュリティ（2FA）、アップデート、完全なコントロールセンターはデスクトップアプリ限定。',ru:'Профиль, персонализация, уведомления, приватность, безопасность (2FA) и обновления, полный центр управления только в настольном приложении.',pl:'Profil, personalizacja, powiadomienia, prywatność, bezpieczeństwo (2FA) i aktualizacje, pełne centrum sterowania wyłącznie w aplikacji desktopowej.'},
  sfx:{fr:'Sons d’interface',en:'Interface sounds',es:'Sonidos de interfaz',de:'Interface-Sounds',it:'Suoni dell’interfaccia',ar:'أصوات الواجهة',zh:'界面音效',ja:'インターフェース音',ru:'Звуки интерфейса',pl:'Dźwięki interfejsu'},
  sfxD:{fr:'Retour sonore discret sur les boutons et menus (façon launcher).',en:'Subtle audio feedback on buttons and menus (launcher-style).',es:'Respuesta sonora sutil en botones y menús.',de:'Dezentes Klangfeedback auf Buttons und Menüs.',it:'Feedback sonoro discreto su pulsanti e menu.',ar:'ارتجاع صوتي خفيف للأزرار والقوائم.',zh:'按钮与菜单的轻微音效反馈。',ja:'ボタンやメニューの控えめな音のフィードバック。',ru:'Деликатный звуковой отклик кнопок и меню.',pl:'Subtelny dźwiękowy feedback przycisków i menu.'},
  privShowRecent:{fr:'Afficher mon activité de jeu',en:'Show my game activity',es:'Mostrar mi actividad de juego',de:'Meine Spielaktivität anzeigen',it:'Mostra la mia attività di gioco',ar:'إظهار نشاطي في اللعب',zh:'显示我的游戏动态',ja:'ゲームアクティビティを表示',ru:'Показывать мою игровую активность',pl:'Pokazuj moją aktywność w grach'},
  privShowRecentD:{fr:'Tes jeux récents et ton temps de jeu sur ton profil public.',en:'Your recent games and playtime on your public profile.',es:'Tus juegos recientes y tiempo de juego en tu perfil público.',de:'Deine letzten Spiele und Spielzeit im öffentlichen Profil.',it:'I tuoi giochi recenti e il tempo di gioco sul profilo pubblico.',ar:'ألعابك الأخيرة ووقت اللعب في ملفك العام.',zh:'公开资料中的最近游戏与游戏时长。',ja:'公開プロフィールの最近のゲームとプレイ時間。',ru:'Недавние игры и время в игре в публичном профиле.',pl:'Ostatnie gry i czas gry w profilu publicznym.'},
  whatsNew:{fr:'Quoi de neuf',en:'What’s new',es:'Novedades',de:'Was ist neu',it:'Novità',ar:'ما الجديد',zh:'新变化',ja:'新着情報',ru:'Что нового',pl:'Co nowego'},
  releaseTag:{fr:'Version majeure',en:'Major release',es:'Versión principal',de:'Hauptversion',it:'Release principale',ar:'إصدار رئيسي',zh:'重大版本',ja:'メジャーリリース',ru:'Крупный релиз',pl:'Wydanie główne'},
  updateTag:{fr:'Mise à jour',en:'Update',es:'Actualización',de:'Update',it:'Aggiornamento',ar:'تحديث',zh:'更新',ja:'アップデート',ru:'Обновление',pl:'Aktualizacja'},
  tabProfile:{fr:'Profil',en:'Profile',es:'Perfil',de:'Profil',it:'Profilo',ar:'الملف',zh:'资料',ja:'プロフィール',ru:'Профиль',pl:'Profil'},
  tabPerso:{fr:'Personnalisation',en:'Personalization',es:'Personalización',de:'Personalisierung',it:'Personalizzazione',ar:'التخصيص',zh:'个性化',ja:'カスタマイズ',ru:'Оформление',pl:'Personalizacja'},
  tabNotif:{fr:'Notifications',en:'Notifications',es:'Notificaciones',de:'Mitteilungen',it:'Notifiche',ar:'الإشعارات',zh:'通知',ja:'通知',ru:'Уведомления',pl:'Powiadomienia'},
  tabPrivacy:{fr:'Confidentialité',en:'Privacy',es:'Privacidad',de:'Datenschutz',it:'Privacy',ar:'الخصوصية',zh:'隐私',ja:'プライバシー',ru:'Приватность',pl:'Prywatność'},
  tabAccount:{fr:'Compte',en:'Account',es:'Cuenta',de:'Konto',it:'Account',ar:'الحساب',zh:'账户',ja:'アカウント',ru:'Аккаунт',pl:'Konto'},
  banner:{fr:'Changer la bannière',en:'Change banner',es:'Cambiar el banner',de:'Banner ändern',it:'Cambia banner',ar:'تغيير الغلاف',zh:'更换横幅',ja:'バナーを変更',ru:'Сменить баннер',pl:'Zmień baner'},
  accent:{fr:"Couleur d'accent du profil",en:'Profile accent color',es:'Color de acento',de:'Akzentfarbe',it:'Colore d’accento',ar:'لون التمييز',zh:'强调色',ja:'アクセントカラー',ru:'Цвет акцента',pl:'Kolor akcentu'},
  accentNone:{fr:'Aucune (par défaut)',en:'None (default)',es:'Ninguno',de:'Keine',it:'Nessuno',ar:'بدون',zh:'无',ja:'なし',ru:'Нет',pl:'Brak'},
  reducedMotion:{fr:'Réduire les animations',en:'Reduce animations',es:'Reducir animaciones',de:'Animationen reduzieren',it:'Riduci animazioni',ar:'تقليل الحركة',zh:'减少动画',ja:'アニメーションを減らす',ru:'Меньше анимаций',pl:'Ogranicz animacje'},
  reducedMotionD:{fr:'Coupe les effets de mouvement (confort & performance).',en:'Turns off motion effects (comfort & performance).',es:'Desactiva los efectos de movimiento.',de:'Schaltet Bewegungseffekte aus.',it:'Disattiva gli effetti di movimento.',ar:'يوقف تأثيرات الحركة.',zh:'关闭动效（更舒适、更流畅）。',ja:'モーション効果を無効化（快適・軽量）。',ru:'Отключает эффекты движения.',pl:'Wyłącza efekty ruchu.'},
  notifFriendReq:{fr:'Demandes d’ami reçues',en:'Friend requests received',es:'Solicitudes recibidas',de:'Erhaltene Anfragen',it:'Richieste ricevute',ar:'طلبات الصداقة',zh:'收到的好友请求',ja:'受信したフレンド申請',ru:'Входящие заявки',pl:'Otrzymane zaproszenia'},
  notifFriendAcc:{fr:'Demandes d’ami acceptées',en:'Friend requests accepted',es:'Solicitudes aceptadas',de:'Angenommene Anfragen',it:'Richieste accettate',ar:'الطلبات المقبولة',zh:'已接受的请求',ja:'承認された申請',ru:'Принятые заявки',pl:'Przyjęte zaproszenia'},
  notifRelease:{fr:'Sorties de ma liste de souhaits',en:'Releases from my wishlist',es:'Estrenos de mi lista',de:'Releases aus meiner Wunschliste',it:'Uscite dalla mia lista',ar:'إصدارات قائمة الرغبات',zh:'愿望单上线提醒',ja:'ウィッシュリストの配信',ru:'Релизы из списка желаний',pl:'Premiery z listy życzeń'},
  privShowTrophies:{fr:'Afficher mes trophées sur mon profil',en:'Show my trophies on my profile',es:'Mostrar mis trofeos',de:'Meine Trophäen zeigen',it:'Mostra i miei trofei',ar:'إظهار جوائزي',zh:'在资料中显示奖杯',ja:'プロフィールにトロフィーを表示',ru:'Показывать трофеи',pl:'Pokaż moje trofea'},
  privShowWishlist:{fr:'Afficher ma liste de souhaits',en:'Show my wishlist',es:'Mostrar mi lista de deseos',de:'Meine Wunschliste zeigen',it:'Mostra la mia lista',ar:'إظهار قائمة رغباتي',zh:'显示我的愿望单',ja:'ウィッシュリストを表示',ru:'Показывать список желаний',pl:'Pokaż listę życzeń'},
  privShowOnline:{fr:'Afficher mon statut en ligne',en:'Show my online status',es:'Mostrar mi estado',de:'Online-Status zeigen',it:'Mostra stato online',ar:'إظهار حالة الاتصال',zh:'显示在线状态',ja:'オンライン状態を表示',ru:'Показывать статус «в сети»',pl:'Pokaż status online'},
  changePw:{fr:'Changer le mot de passe',en:'Change password',es:'Cambiar contraseña',de:'Passwort ändern',it:'Cambia password',ar:'تغيير كلمة المرور',zh:'修改密码',ja:'パスワード変更',ru:'Сменить пароль',pl:'Zmień hasło'},
  newPw:{fr:'Nouveau mot de passe',en:'New password',es:'Nueva contraseña',de:'Neues Passwort',it:'Nuova password',ar:'كلمة مرور جديدة',zh:'新密码',ja:'新しいパスワード',ru:'Новый пароль',pl:'Nowe hasło'},
  confirmPw:{fr:'Confirmer',en:'Confirm',es:'Confirmar',de:'Bestätigen',it:'Conferma',ar:'تأكيد',zh:'确认',ja:'確認',ru:'Подтвердить',pl:'Potwierdź'},
  pwMismatch:{fr:'Les mots de passe ne correspondent pas.',en:'Passwords don’t match.',es:'Las contraseñas no coinciden.',de:'Passwörter stimmen nicht überein.',it:'Le password non coincidono.',ar:'كلمتا المرور غير متطابقتين.',zh:'两次密码不一致。',ja:'パスワードが一致しません。',ru:'Пароли не совпадают.',pl:'Hasła nie są zgodne.'},
  pwChanged:{fr:'Mot de passe modifié ✓',en:'Password changed ✓',es:'Contraseña cambiada ✓',de:'Passwort geändert ✓',it:'Password aggiornata ✓',ar:'تم تغيير كلمة المرور ✓',zh:'密码已修改 ✓',ja:'パスワード変更 ✓',ru:'Пароль изменён ✓',pl:'Hasło zmienione ✓'},
  updatePw:{fr:'Mettre à jour',en:'Update',es:'Actualizar',de:'Aktualisieren',it:'Aggiorna',ar:'تحديث',zh:'更新',ja:'更新',ru:'Обновить',pl:'Zaktualizuj'},
  language:{fr:'Langue',en:'Language',es:'Idioma',de:'Sprache',it:'Lingua',ar:'اللغة',zh:'语言',ja:'言語',ru:'Язык',pl:'Język'},
  changeLang:{fr:'Changer de langue',en:'Change language',es:'Cambiar idioma',de:'Sprache wechseln',it:'Cambia lingua',ar:'تغيير اللغة',zh:'更改语言',ja:'言語を変更',ru:'Сменить язык',pl:'Zmień język'},
  settingsTitle:{fr:'Paramètres',en:'Settings',es:'Ajustes',de:'Einstellungen',it:'Impostazioni',ar:'الإعدادات',zh:'设置',ja:'設定',ru:'Настройки',pl:'Ustawienia'},
  viewProfile:{fr:'Voir le profil',en:'View profile',es:'Ver perfil',de:'Profil ansehen',it:'Vedi profilo',ar:'عرض الملف الشخصي',zh:'查看个人资料',ja:'プロフィールを見る',ru:'Открыть профиль',pl:'Zobacz profil'},
  tabLauncher:{fr:'Launcher',en:'Launcher',es:'Launcher',de:'Launcher',it:'Launcher',ar:'المشغّل',zh:'启动器',ja:'ランチャー',ru:'Лаунчер',pl:'Launcher'},
  descLauncher:{fr:'Ton launcher, à ton image, ambiance, densité, zoom, marque et démarrage.',en:'Your launcher, your way, ambiance, density, zoom, branding and startup.',es:'Tu launcher, a tu manera, ambiente, densidad, zoom, marca e inicio.',de:'Dein Launcher, dein Stil, Ambiente, Dichte, Zoom, Branding und Start.',it:'Il tuo launcher, a modo tuo, atmosfera, densità, zoom, marchio e avvio.',ar:'مشغّلك على ذوقك، الأجواء والكثافة والتكبير والشعار وبدء التشغيل.',zh:'你的启动器，由你定义、氛围、密度、缩放、品牌与启动页。',ja:'ランチャーを自分好みに、アンビエンス・密度・ズーム・ブランド・起動ページ。',ru:'Ваш лаунчер, по-вашему: атмосфера, плотность, масштаб, брендинг и запуск.',pl:'Twój launcher po twojemu, klimat, gęstość, zoom, branding i start.'},
  ambiance:{fr:'Ambiance de couleurs',en:'Color ambiance',es:'Ambiente de color',de:'Farbambiente',it:'Atmosfera di colore',ar:'أجواء الألوان',zh:'色彩氛围',ja:'カラーアンビエンス',ru:'Цветовая атмосфера',pl:'Klimat kolorystyczny'},
  thNoir:{fr:'Noir GLG',en:'GLG Black',es:'Negro GLG',de:'GLG-Schwarz',it:'Nero GLG',ar:'أسود GLG',zh:'GLG 纯黑',ja:'GLGブラック',ru:'Чёрный GLG',pl:'Czerń GLG'},
  thCarbone:{fr:'Carbone',en:'Carbon',es:'Carbono',de:'Carbon',it:'Carbonio',ar:'كربون',zh:'碳灰',ja:'カーボン',ru:'Карбон',pl:'Karbon'},
  thMinuit:{fr:'Minuit',en:'Midnight',es:'Medianoche',de:'Mitternacht',it:'Mezzanotte',ar:'منتصف الليل',zh:'午夜蓝',ja:'ミッドナイト',ru:'Полночь',pl:'Północ'},
  thBraise:{fr:'Braise',en:'Ember',es:'Brasa',de:'Glut',it:'Brace',ar:'جمرة',zh:'余烬',ja:'エンバー',ru:'Тлеющий уголь',pl:'Żar'},
  density:{fr:'Densité d’affichage',en:'Display density',es:'Densidad de la interfaz',de:'Anzeigedichte',it:'Densità di visualizzazione',ar:'كثافة العرض',zh:'显示密度',ja:'表示密度',ru:'Плотность интерфейса',pl:'Gęstość interfejsu'},
  densityConfort:{fr:'Confortable',en:'Comfortable',es:'Cómoda',de:'Komfortabel',it:'Comoda',ar:'مريحة',zh:'舒适',ja:'ゆったり',ru:'Комфортная',pl:'Komfortowa'},
  densityCompact:{fr:'Compacte',en:'Compact',es:'Compacta',de:'Kompakt',it:'Compatta',ar:'مضغوطة',zh:'紧凑',ja:'コンパクト',ru:'Компактная',pl:'Kompaktowa'},
  uiZoom:{fr:'Zoom de l’interface',en:'Interface zoom',es:'Zoom de la interfaz',de:'Oberflächen-Zoom',it:'Zoom dell’interfaccia',ar:'تكبير الواجهة',zh:'界面缩放',ja:'インターフェースズーム',ru:'Масштаб интерфейса',pl:'Powiększenie interfejsu'},
  uiZoomD:{fr:'Zoom natif de la fenêtre, net à toutes les tailles (launcher 1.0.4+).',en:'Native window zoom, crisp at every size (launcher 1.0.4+).',es:'Zoom nativo de la ventana, nítido en todos los tamaños (launcher 1.0.4+).',de:'Nativer Fenster-Zoom, gestochen scharf in jeder Größe (Launcher 1.0.4+).',it:'Zoom nativo della finestra, nitido a ogni dimensione (launcher 1.0.4+).',ar:'تكبير أصلي للنافذة، حاد في كل الأحجام (المشغّل 1.0.4+).',zh:'窗口原生缩放、任何尺寸都清晰（启动器 1.0.4+）。',ja:'ウィンドウのネイティブズーム、どのサイズでも鮮明（ランチャー1.0.4以降）。',ru:'Нативный зум окна, чёткий при любом размере (лаунчер 1.0.4+).',pl:'Natywny zoom okna, ostry w każdym rozmiarze (launcher 1.0.4+).'},
  tbBrand:{fr:'Marque de la barre de titre',en:'Title bar branding',es:'Marca de la barra de título',de:'Titelleisten-Branding',it:'Marchio della barra del titolo',ar:'شعار شريط العنوان',zh:'标题栏品牌样式',ja:'タイトルバーのブランド表示',ru:'Брендинг строки заголовка',pl:'Branding paska tytułu'},
  brandLogo:{fr:'Logo seul',en:'Logo only',es:'Solo logo',de:'Nur Logo',it:'Solo logo',ar:'الشعار فقط',zh:'仅 Logo',ja:'ロゴのみ',ru:'Только логотип',pl:'Tylko logo'},
  brandLogoName:{fr:'Logo + nom',en:'Logo + name',es:'Logo + nombre',de:'Logo + Name',it:'Logo + nome',ar:'الشعار + الاسم',zh:'Logo + 名称',ja:'ロゴ + 名前',ru:'Логотип + имя',pl:'Logo + nazwa'},
  startPage:{fr:'Page ouverte au lancement',en:'Page opened at launch',es:'Página al iniciar',de:'Seite beim Start',it:'Pagina all’avvio',ar:'الصفحة عند التشغيل',zh:'启动时打开的页面',ja:'起動時に開くページ',ru:'Страница при запуске',pl:'Strona przy starcie'},
  startPageD:{fr:'Le launcher s’ouvrira directement sur cette section.',en:'The launcher will open straight to this section.',es:'El launcher se abrirá directamente en esta sección.',de:'Der Launcher öffnet direkt diesen Bereich.',it:'Il launcher si aprirà direttamente su questa sezione.',ar:'سيفتح المشغّل مباشرة على هذا القسم.',zh:'启动器将直接打开该板块。',ja:'ランチャーはこのセクションを直接開きます。',ru:'Лаунчер будет открываться сразу на этом разделе.',pl:'Launcher otworzy się od razu na tej sekcji.'},
  startHome:{fr:'Accueil',en:'Home',es:'Inicio',de:'Startseite',it:'Home',ar:'الرئيسية',zh:'首页',ja:'ホーム',ru:'Главная',pl:'Strona główna'},
  notifSystem:{fr:'Notifications système',en:'System notifications',es:'Notificaciones del sistema',de:'Systembenachrichtigungen',it:'Notifiche di sistema',ar:'إشعارات النظام',zh:'系统通知',ja:'システム通知',ru:'Системные уведомления',pl:'Powiadomienia systemowe'},
  notifSystemD:{fr:'Toasts Windows quand le launcher est en arrière-plan (messages, appels, amis, installations).',en:'Windows toasts while the launcher is in the background (messages, calls, friends, installs).',es:'Avisos de Windows con el launcher en segundo plano (mensajes, llamadas, amigos, instalaciones).',de:'Windows-Toasts, wenn der Launcher im Hintergrund läuft (Nachrichten, Anrufe, Freunde, Installationen).',it:'Toast di Windows quando il launcher è in background (messaggi, chiamate, amici, installazioni).',ar:'إشعارات ويندوز عندما يكون المشغّل في الخلفية (رسائل ومكالمات وأصدقاء وتثبيتات).',zh:'启动器在后台时显示 Windows 通知（消息、通话、好友、安装）。',ja:'ランチャーがバックグラウンドのときにWindows通知を表示（メッセージ・通話・フレンド・インストール）。',ru:'Уведомления Windows, когда лаунчер в фоне (сообщения, звонки, друзья, установки).',pl:'Powiadomienia Windows, gdy launcher działa w tle (wiadomości, połączenia, znajomi, instalacje).'},
  notifChatMsg:{fr:'Nouveaux messages du chat',en:'New chat messages',es:'Nuevos mensajes del chat',de:'Neue Chat-Nachrichten',it:'Nuovi messaggi della chat',ar:'رسائل دردشة جديدة',zh:'新的聊天消息',ja:'新しいチャットメッセージ',ru:'Новые сообщения чата',pl:'Nowe wiadomości czatu'},
  ambCustom:{fr:'Couleurs personnalisées',en:'Custom colors',es:'Colores personalizados',de:'Eigene Farben',it:'Colori personalizzati',ar:'ألوان مخصصة',zh:'自定义颜色',ja:'カスタムカラー',ru:'Свои цвета',pl:'Własne kolory'},
  ambC1:{fr:'Couleur 1',en:'Color 1',es:'Color 1',de:'Farbe 1',it:'Colore 1',ar:'اللون 1',zh:'颜色 1',ja:'カラー1',ru:'Цвет 1',pl:'Kolor 1'},
  ambC2:{fr:'Couleur 2',en:'Color 2',es:'Color 2',de:'Farbe 2',it:'Colore 2',ar:'اللون 2',zh:'颜色 2',ja:'カラー2',ru:'Цвет 2',pl:'Kolor 2'},
  ambGrad:{fr:'Dégradé (deux couleurs)',en:'Gradient (two colors)',es:'Degradado (dos colores)',de:'Verlauf (zwei Farben)',it:'Sfumatura (due colori)',ar:'تدرّج (لونان)',zh:'渐变（双色）',ja:'グラデーション（2色）',ru:'Градиент (два цвета)',pl:'Gradient (dwa kolory)'},
  ambDir:{fr:'Direction du dégradé',en:'Gradient direction',es:'Dirección del degradado',de:'Verlaufsrichtung',it:'Direzione della sfumatura',ar:'اتجاه التدرّج',zh:'渐变方向',ja:'グラデーションの向き',ru:'Направление градиента',pl:'Kierunek gradientu'},
  ambForce:{fr:'Intensité',en:'Intensity',es:'Intensidad',de:'Intensität',it:'Intensità',ar:'الشدة',zh:'强度',ja:'強さ',ru:'Интенсивность',pl:'Intensywność'},
  dirV:{fr:'Vertical',en:'Vertical',es:'Vertical',de:'Vertikal',it:'Verticale',ar:'عمودي',zh:'垂直',ja:'縦',ru:'Вертикально',pl:'Pionowo'},
  dirH:{fr:'Horizontal',en:'Horizontal',es:'Horizontal',de:'Horizontal',it:'Orizzontale',ar:'أفقي',zh:'水平',ja:'横',ru:'Горизонтально',pl:'Poziomo'},
  dirD:{fr:'Diagonal',en:'Diagonal',es:'Diagonal',de:'Diagonal',it:'Diagonale',ar:'قطري',zh:'对角',ja:'斜め',ru:'По диагонали',pl:'Po przekątnej'},
  dirR:{fr:'Radial',en:'Radial',es:'Radial',de:'Radial',it:'Radiale',ar:'شعاعي',zh:'径向',ja:'放射状',ru:'Радиально',pl:'Promieniście'},
  privShowFavs:{fr:'Afficher mes jeux favoris',en:'Show my favorite games',es:'Mostrar mis juegos favoritos',de:'Meine Lieblingsspiele zeigen',it:'Mostra i miei giochi preferiti',ar:'إظهار ألعابي المفضلة',zh:'展示我的收藏游戏',ja:'お気に入りのゲームを表示',ru:'Показывать любимые игры',pl:'Pokazuj ulubione gry'},
  privShowFavsD:{fr:'Ta vitrine « Favoris » apparaît sur ton profil public.',en:'Your “Favorites” showcase appears on your public profile.',es:'Tu vitrina de «Favoritos» aparece en tu perfil público.',de:'Deine „Favoriten“-Vitrine erscheint auf deinem öffentlichen Profil.',it:'La tua vetrina «Preferiti» appare sul tuo profilo pubblico.',ar:'تظهر واجهة «المفضلة» في ملفك العام.',zh:'你的“收藏”橱窗会显示在公开个人资料上。',ja:'「お気に入り」ショーケースが公開プロフィールに表示されます。',ru:'Витрина «Избранное» видна в вашем публичном профиле.',pl:'Twoja gablota „Ulubione” pojawia się na profilu publicznym.'},
  tabUpdates:{fr:'Mises à jour',en:'Updates',es:'Actualizaciones',de:'Updates',it:'Aggiornamenti',ar:'التحديثات',zh:'更新',ja:'更新',ru:'Обновления',pl:'Aktualizacje'},
  autostartHead:{fr:'Démarrage',en:'Startup',es:'Inicio',de:'Autostart',it:'Avvio',ar:'بدء التشغيل',zh:'启动',ja:'スタートアップ',ru:'Автозапуск',pl:'Uruchamianie'},
  autostart:{fr:'Lancer avec Windows',en:'Start with Windows',es:'Iniciar con Windows',de:'Mit Windows starten',it:'Avvia con Windows',ar:'التشغيل مع Windows',zh:'随 Windows 启动',ja:'Windowsと同時に起動',ru:'Запускать вместе с Windows',pl:'Uruchamiaj z systemem Windows'},
  autostartD:{fr:'S’ouvre en réduit à l’ouverture de session. Modifiable à tout moment.',en:'Opens minimized at sign-in. Change anytime.',es:'Se abre minimizado al iniciar sesión. Cámbialo cuando quieras.',de:'Startet minimiert bei der Anmeldung. Jederzeit änderbar.',it:'Si apre ridotto a icona all’accesso. Modificabile in ogni momento.',ar:'يفتح مصغّراً عند تسجيل الدخول. يمكن تغييره في أي وقت.',zh:'登录时以最小化方式打开。可随时更改。',ja:'サインイン時に最小化で起動します。いつでも変更可能。',ru:'Открывается свёрнутым при входе. Можно изменить в любой момент.',pl:'Otwiera się zminimalizowany przy logowaniu. Można zmienić w każdej chwili.'},
  appVersion:{fr:'Version installée',en:'Installed version',es:'Versión instalada',de:'Installierte Version',it:'Versione installata',ar:'الإصدار المثبت',zh:'已安装版本',ja:'インストール済みバージョン',ru:'Установленная версия',pl:'Zainstalowana wersja'},
  upToDate:{fr:'Tu utilises la dernière version. ✓',en:'You’re on the latest version. ✓',es:'Estás en la última versión. ✓',de:'Du nutzt die neueste Version. ✓',it:'Hai l’ultima versione. ✓',ar:'أنت تستخدم أحدث إصدار. ✓',zh:'已是最新版本。✓',ja:'最新バージョンです。✓',ru:'У вас последняя версия. ✓',pl:'Masz najnowszą wersję. ✓'},
  checkUpdates:{fr:'Vérifier les mises à jour',en:'Check for updates',es:'Buscar actualizaciones',de:'Nach Updates suchen',it:'Cerca aggiornamenti',ar:'التحقق من التحديثات',zh:'检查更新',ja:'更新を確認',ru:'Проверить обновления',pl:'Sprawdź aktualizacje'},
  checking:{fr:'Vérification…',en:'Checking…',es:'Comprobando…',de:'Wird geprüft…',it:'Controllo…',ar:'جارٍ التحقق…',zh:'检查中…',ja:'確認中…',ru:'Проверка…',pl:'Sprawdzanie…'},
  launcherNote:{fr:'Dans l’application téléchargeable (launcher), les mises à jour s’installeront automatiquement depuis cette page.',en:'In the downloadable app (launcher), updates will install automatically from this page.',es:'En la app descargable (launcher), las actualizaciones se instalarán desde esta página.',de:'In der herunterladbaren App (Launcher) werden Updates über diese Seite installiert.',it:'Nell’app scaricabile (launcher), gli aggiornamenti si installeranno da questa pagina.',ar:'في التطبيق القابل للتنزيل، ستُثبَّت التحديثات من هذه الصفحة.',zh:'在可下载的客户端中，更新将从此页面自动安装。',ja:'ダウンロード版（ランチャー）では、更新はこのページから自動インストールされます。',ru:'В загружаемом приложении (лаунчере) обновления будут устанавливаться с этой страницы.',pl:'W aplikacji do pobrania (launcher) aktualizacje będą instalowane z tej strony.'},
};
function _ot(k){ const m=_OPT_T[k]; return m ? (m[LANG]||m.en) : k; }
const GLG_VERSION = '1.0.0';

let _userPrefs = null;
function _defaultPrefs(){ return { accent:null, reducedMotion:false, sfx:false, notif:{friendReq:true,friendAcc:true,release:true,system:true,chatMsg:true}, privacy:{showTrophies:true,showWishlist:true,showOnline:true,showRecent:true,showFavs:true}, favs:[], installed:[], gifs:[], av:{micId:null,outId:null,camId:null}, launcher:{amb:{on:false,c1:'#4060d6',c2:null,dir:'v',force:8},density:'confort',zoom:100,start:'home',brand:'logo'} }; }
function _normPrefs(p){ const d=_defaultPrefs(); p=(p&&typeof p==='object')?p:{}; return {
  accent:(typeof p.accent==='string' && /^#[0-9a-fA-F]{3,8}$/.test(p.accent))?p.accent:null,
  reducedMotion:!!p.reducedMotion,
  sfx:!!p.sfx,
  notif:Object.assign({},d.notif,p.notif||{}),
  privacy:Object.assign({},d.privacy,p.privacy||{}),
  favs:Array.isArray(p.favs)?p.favs.filter(x=>typeof x==='string').slice(0,64):[],   // jeux favoris (bibliothèque)
  installed:Array.isArray(p.installed)?p.installed.filter(x=>typeof x==='string').slice(0,64):[],  // jeux installés (launcher)
  gifs:Array.isArray(p.gifs)?p.gifs                                                  // historique GIF du chat
    .filter(g=>g&&typeof g==='object'&&typeof g.u==='string'&&/^https:\/\//i.test(g.u))
    .map(g=>({u:g.u.slice(0,500),n:(typeof g.n==='string'?g.n:'GIF').slice(0,80)})).slice(0,48):[],
  av:{ micId:(p.av&&typeof p.av.micId==='string')?p.av.micId:null,                   // périphériques voix/vidéo
       outId:(p.av&&typeof p.av.outId==='string')?p.av.outId:null,
       camId:(p.av&&typeof p.av.camId==='string')?p.av.camId:null },
  launcher:(l=>{                                                                     // personnalisation du LAUNCHER
    const hex = v => (typeof v==='string' && /^#[0-9a-fA-F]{6}$/.test(v)) ? v.toLowerCase() : null;
    // héritage : les 4 anciens thèmes fixes deviennent des ambiances équivalentes
    const legacy = { carbone:{on:true,c1:'#9ea3b1',c2:'#787e8c',dir:'v',force:7},
                     minuit:{on:true,c1:'#4060d6',c2:'#182660',dir:'v',force:9},
                     braise:{on:true,c1:'#d6662c',c2:'#782a10',dir:'v',force:7} };
    const a0 = (l.amb && typeof l.amb==='object') ? l.amb : (legacy[l.theme] || { on:false });
    return {
      amb:{ on:!!a0.on && !!hex(a0.c1),
            c1:hex(a0.c1) || '#4060d6',
            c2:hex(a0.c2),                                     // null = couleur unie
            dir:['v','h','d','r'].includes(a0.dir) ? a0.dir : 'v',
            force:Math.min(32, Math.max(4, parseInt(a0.force, 10) || 8)) },
      density:l.density==='compact'?'compact':'confort',
      zoom:[90,100,110].includes(+l.zoom)?+l.zoom:100,
      start:['home','library','chat'].includes(l.start)?l.start:'home',
      brand:l.brand==='logo-name'?'logo-name':'logo',
    };
  })((p.launcher&&typeof p.launcher==='object')?p.launcher:{}) }; }
function _applyPrefs(p){
  _userPrefs = _normPrefs(p);
  document.documentElement.classList.toggle('glg-reduce-motion', _userPrefs.reducedMotion);
  if (_userPrefs.accent) document.documentElement.style.setProperty('--user-accent', _userPrefs.accent);
  else document.documentElement.style.removeProperty('--user-accent');
  window.GLG_SFX?.setEnabled(_userPrefs.sfx); // sons d'interface (opt-in)
  _applyLauncherPrefs();                      // personnalisation launcher (thème/densité/zoom/marque)
  return _userPrefs;
}
/* ── Personnalisation du LAUNCHER (Options → Launcher) ──────────────────
   Ambiance (voile coloré plein écran, zéro risque de layout), densité,
   zoom natif WebView (API Tauri, dispo à partir du launcher 1.0.4),
   marque de la barre de titre. Miroir localStorage pour un boot SANS
   flash (thème + page de démarrage appliqués avant le profil réseau). */
/* Fond CSS d'une ambiance (couleur unie ou dégradé v/h/d/radial). */
function _glgAmbCss(amb){
  if (!amb || !amb.on || !amb.c1) return null;
  if (!amb.c2) return amb.c1;
  if (amb.dir === 'r') return `radial-gradient(circle at 28% 18%, ${amb.c1}, ${amb.c2})`;
  const ang = amb.dir === 'h' ? '90deg' : amb.dir === 'd' ? '135deg' : '180deg';
  return `linear-gradient(${ang}, ${amb.c1}, ${amb.c2})`;
}
/* Applique une ambiance au voile plein écran (blend screen, force = opacité). */
function _glgAmbApply(amb){
  _glgEnsureAmbiance();
  const el = document.getElementById('glg-ambiance'); if (!el) return;
  const bg = _glgAmbCss(amb);
  const de = document.documentElement;
  if (!bg) { el.style.opacity = '0'; de.style.removeProperty('--glg-sb'); return; }
  el.style.background = bg;
  el.style.opacity = String((amb.force || 8) / 100);
  de.style.setProperty('--glg-sb', amb.c1);   // la scrollbar suit la couleur 1
}
function _applyLauncherPrefs(){
  if (!IS_TAURI || !_userPrefs || !_userPrefs.launcher) return;
  const L = _userPrefs.launcher, de = document.documentElement;
  ['glg-th-carbone','glg-th-minuit','glg-th-braise'].forEach(c => de.classList.remove(c));
  de.classList.toggle('glg-compact', L.density === 'compact');
  _glgAmbApply(L.amb);
  try {
    const wv = window.__TAURI__ && window.__TAURI__.webview;
    const cur = wv && wv.getCurrentWebview && wv.getCurrentWebview();
    if (cur && cur.setZoom) { const pr = cur.setZoom(L.zoom / 100); if (pr && pr.catch) pr.catch(() => {}); }
  } catch (e) {}
  _refreshTitlebarBrand(L.brand);
  try { localStorage.setItem('glg_lprefs', JSON.stringify(L)); } catch (e) {}
}
function _glgEnsureAmbiance(){
  if (!IS_TAURI || document.getElementById('glg-ambiance') || !document.body) return;
  const d = document.createElement('div');
  d.id = 'glg-ambiance'; d.setAttribute('aria-hidden', 'true');
  document.body.appendChild(d);
}
async function _savePrefs(patch){
  _userPrefs = _normPrefs(Object.assign({}, _userPrefs||_defaultPrefs(), patch));
  _applyPrefs(_userPrefs);
  try { await GLG_AUTH.updateProfile?.({ prefs: _userPrefs }); } catch(e){}
}
function _toggleHTML(id, label, desc, on){
  return `<label class="set-toggle" for="${id}">
      <span class="set-toggle-main"><span class="set-toggle-label">${label}</span>${desc?`<span class="set-toggle-desc">${desc}</span>`:''}</span>
      <input type="checkbox" id="${id}" ${on?'checked':''}><span class="set-switch" aria-hidden="true"></span>
    </label>`;
}
const _ACCENTS = ['#00d4ff','#a878e0','#e5564e','#ffb44c','#4cc38a','#ff7ab8'];

/* « Quoi de neuf », journal des versions (GLG_CHANGELOG, data.js).
   Le launcher standalone lira la même structure pour ses notes de MAJ. */
function _changelogHTML() {
  const log = (typeof GLG_CHANGELOG !== 'undefined' && Array.isArray(GLG_CHANGELOG)) ? GLG_CHANGELOG : [];
  if (!log.length) return '';
  return log.map((rel, i) => {
    let d = rel.date || '';
    try { d = new Date(rel.date + 'T12:00:00').toLocaleDateString(LANG_LOCALE[LANG] || 'en-US', { day:'numeric', month:'long', year:'numeric' }); } catch (e) {}
    return `
    <div class="chg-release ${i === 0 ? 'chg-release--current' : ''}">
      <div class="chg-head">
        <span class="chg-v">v${rel.v}</span>
        <span class="chg-tag">${_ot(rel.tag === 'release' ? 'releaseTag' : 'updateTag')}</span>
        <span class="chg-date">${d}</span>
      </div>
      <ul class="chg-notes">
        ${(rel.notes || []).map(n => `<li>${n[LANG] || n.en}</li>`).join('')}
      </ul>
    </div>`;
  }).join('');
}

/* Onglets des paramètres (partagés modale + page dédiée), iconés (launcher). */
const _SET_TAB_ICONS = {
  profile: '<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5.4" r="2.6" stroke="currentColor" stroke-width="1.3"/><path d="M3 13.4c.9-2.2 2.7-3.4 5-3.4s4.1 1.2 5 3.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  perso:   '<svg viewBox="0 0 16 16" fill="none"><path d="M3 5h7M12.5 5H13M3 11h.5M6 11h7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="11" cy="5" r="1.7" stroke="currentColor" stroke-width="1.3"/><circle cx="4.6" cy="11" r="1.7" stroke="currentColor" stroke-width="1.3"/></svg>',
  notif:   '<svg viewBox="0 0 16 16" fill="none"><path d="M8 2.2c-2.3 0-3.7 1.7-3.7 3.9 0 3.1-1.1 4-1.1 4h9.6s-1.1-.9-1.1-4c0-2.2-1.4-3.9-3.7-3.9z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.7 12.6a1.4 1.4 0 002.6 0" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  privacy: '<svg viewBox="0 0 16 16" fill="none"><path d="M8 1.8L3 3.6v3.6c0 3.2 2.1 5.4 5 6.6 2.9-1.2 5-3.4 5-6.6V3.6L8 1.8z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M5.8 7.8l1.6 1.6 2.8-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  account: '<svg viewBox="0 0 16 16" fill="none"><circle cx="6" cy="8" r="2.6" stroke="currentColor" stroke-width="1.3"/><path d="M8.6 8H14M12 8v2.4M14 8v1.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  updates: '<svg viewBox="0 0 16 16" fill="none"><path d="M13.4 6.5A5.5 5.5 0 003.6 5M2.6 9.5A5.5 5.5 0 0012.4 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M13.6 2.6v3h-3M2.4 13.4v-3h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  av:      '<svg viewBox="0 0 16 16" fill="none"><rect x="6" y="1.6" width="4" height="8" rx="2" stroke="currentColor" stroke-width="1.3"/><path d="M3.4 7.4a4.6 4.6 0 0 0 9.2 0M8 12v2.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  launcher:'<svg viewBox="0 0 16 16" fill="none"><rect x="2" y="2.6" width="12" height="10.8" rx="1.4" stroke="currentColor" stroke-width="1.3"/><path d="M2 5.4h12" stroke="currentColor" stroke-width="1.3"/><circle cx="4" cy="4" r=".62" fill="currentColor"/><circle cx="6" cy="4" r=".62" fill="currentColor"/></svg>',
};
/* Préréglages du studio d'ambiance, clairs, foncés, flashy, duos.
   t = clé i18n (les 4 historiques), n = nom de style universel. */
const _AMB_PRESETS = [
  { k:'off',       t:'thNoir',    a:{ on:false, c1:'#4060d6', c2:null,      dir:'v', force:8 } },
  { k:'carbone',   t:'thCarbone', a:{ on:true,  c1:'#9ea3b1', c2:'#787e8c', dir:'v', force:7 } },
  { k:'minuit',    t:'thMinuit',  a:{ on:true,  c1:'#4060d6', c2:'#182660', dir:'v', force:9 } },
  { k:'braise',    t:'thBraise',  a:{ on:true,  c1:'#d6662c', c2:'#782a10', dir:'v', force:7 } },
  { k:'synthwave', n:'Synthwave', a:{ on:true,  c1:'#ff3ea5', c2:'#5b2bff', dir:'d', force:10 } },
  { k:'cyber',     n:'Cyber',     a:{ on:true,  c1:'#00e5ff', c2:'#0033aa', dir:'d', force:10 } },
  { k:'aurora',    n:'Aurora',    a:{ on:true,  c1:'#2bff88', c2:'#1240c0', dir:'r', force:9 } },
  { k:'sunset',    n:'Sunset',    a:{ on:true,  c1:'#ff9e2c', c2:'#b8336a', dir:'d', force:9 } },
  { k:'sakura',    n:'Sakura',    a:{ on:true,  c1:'#ff9ecb', c2:'#c05de0', dir:'v', force:8 } },
  { k:'glacier',   n:'Glacier',   a:{ on:true,  c1:'#bfeaff', c2:'#7aa8d8', dir:'v', force:8 } },
  { k:'gold',      n:'Gold',      a:{ on:true,  c1:'#ffd452', c2:'#a86a12', dir:'d', force:8 } },
  { k:'crimson',   n:'Crimson',   a:{ on:true,  c1:'#ff2e4d', c2:'#5c0715', dir:'v', force:8 } },
  { k:'emerald',   n:'Emerald',   a:{ on:true,  c1:'#20e3a2', c2:'#0a5c46', dir:'v', force:8 } },
  { k:'violet',    n:'Violet',    a:{ on:true,  c1:'#a06bff', c2:'#3b1a80', dir:'v', force:9 } },
  { k:'lime',      n:'Neon Lime', a:{ on:true,  c1:'#c8ff3e', c2:'#2c8a12', dir:'d', force:9 } },
  { k:'ocean',     n:'Ocean',     a:{ on:true,  c1:'#38b6ff', c2:'#062e64', dir:'v', force:9 } },
  // Exclusifs Récompenses GLG, verrouillés par points (rpc glg_progress)
  { k:'aube',      n:'Aube dorée',    lock:40,   a:{ on:true, c1:'#ffd9a0', c2:'#c2571b', dir:'r', force:9 } },
  { k:'nebula',    n:'Nébuleuse',     lock:100,  a:{ on:true, c1:'#7df9ff', c2:'#7b2bff', dir:'r', force:10 } },
  { k:'royal',     n:'Pourpre royal', lock:180,  a:{ on:true, c1:'#ff2e88', c2:'#4a0a2e', dir:'d', force:10 } },
  { k:'legende',   n:'Légende',       lock:300,  a:{ on:true, c1:'#f4f4ff', c2:'#6a5bff', dir:'r', force:11 } },
];
const _ambEq = (a, b) => !!a && !!b && a.on === b.on && (!a.on || (a.c1 === b.c1 && (a.c2 || null) === (b.c2 || null) && a.dir === b.dir && +a.force === +b.force));

function _settingsTabs(){
  const tab = (key, label, active) => `
        <button class="set-tab ${active ? 'active' : ''}" data-tab="${key}">
          <span class="set-tab-ico" aria-hidden="true">${_SET_TAB_ICONS[key] || ''}</span>
          <span>${label}</span>
        </button>`;
  return tab('profile', _ot('tabProfile'), true)
       + tab('perso',   _ot('tabPerso'))
       + tab('launcher',_ot('tabLauncher'))
       + tab('av',      _ot('tabAv'))
       + tab('notif',   _ot('tabNotif'))
       + tab('privacy', _ot('tabPrivacy'))
       + tab('account', _ot('tabAccount'))
       + tab('updates', _ot('tabUpdates'));
}
/* Panneaux des paramètres (partagés modale + page dédiée).
   Chaque panneau : en-tête (titre + description) puis contenus en CARTES. */
function _settingsPanels(p, u, pr){
  const uname = p.username || u.email?.split('@')[0] || '';
  const head = (t, d) => `<div class="set-phead"><h2>${_ot(t)}</h2><p>${_ot(d)}</p></div>`;
  return `
        <div class="set-panel active" data-panel="profile">
          ${head('tabProfile', 'descProfile')}
          <form id="auth-profile" class="set-card" novalidate>
            <label class="auth-field"><span>${_at('username')}</span>
              <input type="text" id="ap-user" value="${escHtml(uname)}" maxlength="20"><span class="auth-hint" id="ap-user-hint"></span></label>
            <div class="auth-row">
              <label class="auth-field"><span>${_at('gender')}</span>
                <select id="ap-gender">
                  <option value="male" ${p.gender==='male'?'selected':''}>${_at('male')}</option>
                  <option value="female" ${p.gender==='female'?'selected':''}>${_at('female')}</option>
                  <option value="other" ${p.gender==='other'?'selected':''}>${_at('other')}</option>
                </select></label>
              <label class="auth-field"><span>${_at('age')}</span>
                <input type="number" id="ap-age" min="13" max="120" value="${p.age ?? ''}"></label>
            </div>
            <label class="auth-field"><span>${_ppt('bioLabel')}</span>
              <textarea id="ap-bio" maxlength="280" rows="3" placeholder="${_ppt('bioPh')}" style="resize:none;font-family:var(--f-body,sans-serif)">${p.bio ? escHtml(p.bio) : ''}</textarea></label>
            <button type="button" class="set-link-btn" id="ap-banner-btn">⌑ ${_ot('banner')}</button>
            <p class="auth-err" id="ap-err" hidden></p>
            <button type="submit" class="btn btn-primary auth-submit" id="ap-save">${_at('save')}</button>
          </form>
        </div>
        <div class="set-panel" data-panel="perso" hidden>
          ${head('tabPerso', 'descPerso')}
          <div class="set-card">
          <div class="set-group-label">${_ot('accent')}</div>
          <div class="set-accents" id="ap-accents">
            <button type="button" class="set-accent set-accent--none ${!pr.accent?'on':''}" data-accent="" title="${_ot('accentNone')}">∅</button>
            ${_ACCENTS.map(c=>`<button type="button" class="set-accent ${pr.accent&&pr.accent.toLowerCase()===c?'on':''}" data-accent="${c}" style="--sw:${c}" aria-label="${c}"></button>`).join('')}
          </div>
          <div class="set-toggle-list">
            ${_toggleHTML('ap-rmotion', _ot('reducedMotion'), _ot('reducedMotionD'), pr.reducedMotion)}
            ${_toggleHTML('ap-sfx', _ot('sfx'), _ot('sfxD'), pr.sfx)}
          </div>
          </div>
        </div>
        <div class="set-panel" data-panel="launcher" hidden>
          ${head('tabLauncher', 'descLauncher')}
          <div class="set-card">
            <div class="set-group-label">${_ot('ambiance')}</div>
            <div class="set-amb2-grid" id="ap-amb-presets">
              ${_AMB_PRESETS.map(ps => `
              <button type="button" class="set-amb2 ${_ambEq(pr.launcher.amb, ps.a) ? 'on' : ''} ${ps.lock && !_rwdHas(ps.lock) ? 'set-amb2--locked' : ''}" data-k="${ps.k}" ${ps.lock ? `data-lock="${ps.lock}"` : ''}
                title="${ps.t ? _ot(ps.t) : ps.n}${ps.lock && !_rwdHas(ps.lock) ? ', ' + _rwt('lockAt').replace('%s', ps.lock) : ''}" aria-label="${ps.t ? _ot(ps.t) : ps.n}"
                style="background:${ps.a.on ? _glgAmbCss(ps.a) : '#050506'}">${ps.lock ? `<span class="set-amb2-lock" aria-hidden="true">${_LOCK_SVG}</span>` : ''}</button>`).join('')}
            </div>
            <div class="set-group-label" style="margin-top:22px">${_ot('ambCustom')}</div>
            <div class="set-amb-custom">
              <label class="set-amb-color"><input type="color" id="ap-amb-c1" value="${pr.launcher.amb.c1}"><span>${_ot('ambC1')}</span></label>
              <label class="set-amb-color" id="ap-amb-c2wrap" ${pr.launcher.amb.c2 ? '' : 'data-off="1"'}><input type="color" id="ap-amb-c2" value="${pr.launcher.amb.c2 || '#182660'}"><span>${_ot('ambC2')}</span></label>
            </div>
            <div class="set-toggle-list" style="margin-top:10px">
              ${_toggleHTML('ap-amb-grad', _ot('ambGrad'), '', !!pr.launcher.amb.c2)}
            </div>
            <div class="set-group-label" style="margin-top:16px">${_ot('ambDir')}</div>
            <div class="set-seg" id="ap-amb-dir" role="radiogroup" aria-label="${_ot('ambDir')}">
              ${[['v','↓','dirV'],['h','→','dirH'],['d','↘','dirD'],['r','◎','dirR']].map(([v, ico, lbl]) => `
              <button type="button" data-v="${v}" class="${pr.launcher.amb.dir === v ? 'on' : ''}" title="${_ot(lbl)}" aria-label="${_ot(lbl)}">${ico}</button>`).join('')}
            </div>
            <div class="set-group-label" style="margin-top:16px">${_ot('ambForce')} · <span id="ap-amb-forceval">${pr.launcher.amb.force}%</span></div>
            <input type="range" id="ap-amb-force" class="set-range" min="4" max="32" step="1" value="${pr.launcher.amb.force}" aria-label="${_ot('ambForce')}">
          </div>
          <div class="set-card">
            <div class="set-group-label">${_ot('density')}</div>
            <div class="set-seg" id="ap-lc-density" role="radiogroup" aria-label="${_ot('density')}">
              <button type="button" data-v="confort" class="${pr.launcher.density==='confort'?'on':''}">${_ot('densityConfort')}</button>
              <button type="button" data-v="compact" class="${pr.launcher.density==='compact'?'on':''}">${_ot('densityCompact')}</button>
            </div>
            <div class="set-group-label" style="margin-top:20px">${_ot('uiZoom')}</div>
            <div class="set-seg" id="ap-lc-zoom" role="radiogroup" aria-label="${_ot('uiZoom')}">
              ${[90,100,110].map(z => `<button type="button" data-v="${z}" class="${pr.launcher.zoom===z?'on':''}">${z}%</button>`).join('')}
            </div>
            <p class="set-update-note" style="margin-top:10px">${_ot('uiZoomD')}</p>
          </div>
          <div class="set-card">
            <div class="set-group-label">${_ot('tbBrand')}</div>
            <div class="set-seg" id="ap-lc-brand" role="radiogroup" aria-label="${_ot('tbBrand')}">
              <button type="button" data-v="logo" class="${pr.launcher.brand==='logo'?'on':''}">${_ot('brandLogo')}</button>
              <button type="button" data-v="logo-name" class="${pr.launcher.brand==='logo-name'?'on':''}">${_ot('brandLogoName')}</button>
            </div>
            <div class="set-group-label" style="margin-top:20px">${_ot('startPage')}</div>
            <select id="ap-lc-start" class="set-av-select" style="max-width:300px">
              <option value="home" ${pr.launcher.start==='home'?'selected':''}>${_ot('startHome')}</option>
              <option value="library" ${pr.launcher.start==='library'?'selected':''}>${_lbt('navLabel')}</option>
              <option value="chat" ${pr.launcher.start==='chat'?'selected':''}>${_chT('navLabel')}</option>
            </select>
            <p class="set-update-note" style="margin-top:10px">${_ot('startPageD')}</p>
          </div>
          ${IS_TAURI ? `
          <div class="set-card">
            <div class="set-group-label">${_ot('autostartHead')}</div>
            <div class="set-toggle-list">
              ${_toggleHTML('ap-lc-autostart', _ot('autostart'), _ot('autostartD'), false)}
            </div>
          </div>` : ''}
        </div>
        <div class="set-panel" data-panel="av" hidden>
          ${head('tabAv', 'descAv')}
          <div class="set-card">
            <div class="set-group-label">${_ot('micIn')}</div>
            <div class="set-av-row">
              <select id="ap-av-mic" class="set-av-select"><option value="">${_ot('devDefault')}</option></select>
              <button type="button" class="btn btn-outline set-av-btn" id="ap-av-mictest">${_ot('micTest')}</button>
            </div>
            <div class="set-av-meter" id="ap-av-meter" aria-hidden="true"><i></i></div>
          </div>
          <div class="set-card">
            <div class="set-group-label">${_ot('audioOut')}</div>
            <div class="set-av-row">
              <select id="ap-av-out" class="set-av-select"><option value="">${_ot('devDefault')}</option></select>
              <button type="button" class="btn btn-outline set-av-btn" id="ap-av-outtest">${_ot('outTest')}</button>
            </div>
          </div>
          <div class="set-card">
            <div class="set-group-label">${_ot('camera')}</div>
            <div class="set-av-row">
              <select id="ap-av-cam" class="set-av-select"><option value="">${_ot('devDefault')}</option></select>
              <button type="button" class="btn btn-outline set-av-btn" id="ap-av-camtest">${_ot('camTest')}</button>
            </div>
            <video id="ap-av-campreview" class="set-av-campreview" autoplay muted playsinline hidden></video>
            <p class="set-update-note" style="margin-top:12px">${_ot('devHint')}</p>
          </div>
        </div>
        <div class="set-panel" data-panel="notif" hidden>
          ${head('tabNotif', 'descNotif')}
          <div class="set-card">
          <div class="set-toggle-list">
            ${IS_TAURI ? _toggleHTML('ap-n-sys', _ot('notifSystem'), _ot('notifSystemD'), pr.notif.system !== false) : ''}
            ${_toggleHTML('ap-n-chat', _ot('notifChatMsg'), '', pr.notif.chatMsg !== false)}
            ${_toggleHTML('ap-n-freq', _ot('notifFriendReq'), '', pr.notif.friendReq)}
            ${_toggleHTML('ap-n-facc', _ot('notifFriendAcc'), '', pr.notif.friendAcc)}
            ${_toggleHTML('ap-n-rel',  _ot('notifRelease'),  '', pr.notif.release)}
          </div>
          </div>
        </div>
        <div class="set-panel" data-panel="privacy" hidden>
          ${head('tabPrivacy', 'descPrivacy')}
          <div class="set-card">
          <div class="set-toggle-list">
            ${_toggleHTML('ap-p-tro',  _ot('privShowTrophies'), '', pr.privacy.showTrophies)}
            ${_toggleHTML('ap-p-wish', _ot('privShowWishlist'), '', pr.privacy.showWishlist)}
            ${_toggleHTML('ap-p-favs', _ot('privShowFavs'),     _ot('privShowFavsD'), pr.privacy.showFavs)}
            ${_toggleHTML('ap-p-onl',  _ot('privShowOnline'),   '', pr.privacy.showOnline)}
            ${_toggleHTML('ap-p-rec',  _ot('privShowRecent'),   _ot('privShowRecentD'), pr.privacy.showRecent)}
          </div>
          </div>
        </div>
        <div class="set-panel" data-panel="account" hidden>
          ${head('tabAccount', 'descAccount')}
          <div class="set-card">
          <label class="auth-field"><span>${_at('email')}</span><input type="email" value="${u.email||''}" disabled></label>
          </div>
          <div class="set-card">
          <div class="set-group-label">${_ot('changePw')}</div>
          <label class="auth-field"><span>${_ot('newPw')}</span><input type="password" id="ap-pw1" autocomplete="new-password"></label>
          <label class="auth-field"><span>${_ot('confirmPw')}</span><input type="password" id="ap-pw2" autocomplete="new-password"></label>
          <p class="auth-err" id="ap-pw-err" hidden></p>
          <button type="button" class="btn btn-outline set-w" id="ap-pw-save">${_ot('updatePw')}</button>
          </div>
          <div class="set-card">
          <div class="set-group-label">${_mt('title')}</div>
          <div class="set-mfa" id="ap-mfa"><p class="set-update-status">…</p></div>
          </div>
          <div class="set-card">
          <div class="set-group-label">${_ot('language')}</div>
          <button type="button" class="set-link-btn" id="ap-lang-btn">🌐 ${_ot('changeLang')}</button>
          <div class="auth-profile-actions">
            <button type="button" class="auth-link" id="ap-logout">${_at('logout')}</button>
            <button type="button" class="auth-link auth-link--danger" id="ap-delete">${_at('del')}</button>
          </div>
          </div>
        </div>
        <div class="set-panel" data-panel="updates" hidden>
          ${head('tabUpdates', 'descUpdates')}
          <div class="set-card">
          <div class="set-update-row">
            <div><div class="set-group-label" style="margin:0 0 5px">${_ot('appVersion')}</div><div class="set-version">GEEKLEARN GAMES · v${GLG_VERSION}</div></div>
            <button type="button" class="btn btn-outline" id="ap-update-check">${_ot('checkUpdates')}</button>
          </div>
          <p class="set-update-status" id="ap-update-status">${_ot('upToDate')}</p>
          <p class="set-update-note">${_ot('launcherNote')}</p>
          </div>
          <div class="set-card">
          <div class="set-group-label">${_ot('whatsNew')}</div>
          <div class="set-changelog">${_changelogHTML()}</div>
          </div>
        </div>`;
}

/* Page dédiée PARAMÈTRES (#page-settings). Remplace l'ancienne pop-up : plus
   d'espace, plus de confort, et c'est ICI que le launcher standalone gérera
   ses mises à jour (onglet "Mises à jour"). */
async function buildSettingsPage(){
  const host = $('page-settings'); if(!host) return;

  /* ── SITE WEB : les Options sont une EXCLUSIVITÉ du launcher ──
     (même geste que la bibliothèque : invitation à installer l'app). */
  if (!IS_TAURI) {
    const os = _dlOS();
    const P = LAUNCHER_DL.platforms;
    const priKey = (os === 'mac' || os === 'linux') && P[os] && P[os].length ? os : 'win';
    const pri = P[priKey][0];
    host.innerHTML = `
    <section class="libx glg-pattern">
      <div class="glg-pattern-bg glg-pat-subtle" style="--glg-speed:80s"></div>
      <div class="libx-inner">
        <div class="libx-copy reveal">
          <p class="section-eye">${_lxt('eyebrow')}</p>
          <h1 class="libx-title">${_ot('optxTitle')}</h1>
          <p class="libx-sub">${_ot('optxSub')}</p>
          <div class="libx-chips">
            <span class="libx-chip">${_ot('tabProfile')}</span>
            <span class="libx-chip">${_ot('tabPrivacy')}</span>
            <span class="libx-chip">${_mt('title')}</span>
            <span class="libx-chip">${_ot('tabUpdates')}</span>
          </div>
          <div class="libx-actions">
            <a class="btn btn-primary btn-lg" href="${pri.u}" ${pri.u.indexOf('http') !== 0 ? 'download' : ''}>${_lxt('cta')}, ${priKey === 'mac' ? 'macOS' : priKey === 'linux' ? 'Linux' : 'Windows'}</a>
            <a class="btn btn-outline btn-lg" href="${LAUNCHER_DL.all}" target="_blank" rel="noopener">${_lnt('allVer')}</a>
          </div>
          <p class="libx-hint">${_lxt('hint')}</p>
        </div>
      </div>
    </section>${footerHTML()}`;
    setTimeout(initReveal, 60);
    initAnimIdleObserver();
    return;
  }

  const configured = !!window.GLG_AUTH?.isConfigured?.();
  const user = configured ? await GLG_AUTH.getUser() : null;
  if (!user){
    host.innerHTML = `
      <section class="pp-signed-out"><div class="pp-so-inner reveal">
        <div class="pp-so-badge">${_ACCOUNT_ICON}</div>
        <h1 class="pp-so-title">${_ot('settingsTitle')}</h1>
        <p class="pp-so-desc">${_ppt('signedOutP')}</p>
        <div class="pp-so-actions">
          <button class="btn btn-primary" onclick="openAuthModal('login')">${_ppt('signIn')}</button>
          <button class="btn btn-outline" onclick="openAuthModal('signup')">${_ppt('createAcc')}</button>
        </div>
      </div></section>${footerHTML()}`;
    setTimeout(initReveal, 60); return;
  }
  const p = (await GLG_AUTH.getProfile()) || {};
  if (_accountProfile && _accountProfile.avatar_url !== undefined) p.avatar_url = _accountProfile.avatar_url;
  const pr = _applyPrefs(_userPrefs || p.prefs);   // LOCAL d'abord (anti-reset)
  const name = p.username || user.email?.split('@')[0] || '-';
  const since = p.created_at ? new Date(p.created_at).toLocaleDateString(LANG_LOCALE[LANG]||'en-US',{year:'numeric',month:'long'}) : '';
  host.innerHTML = `
    <section class="settings-page">
      <!-- En-tête v3 : carte propre SANS bannière photo derrière le texte -
           plus aucun chevauchement pseudo/eyebrow, hiérarchie nette. -->
      <div class="settings-page-head settings-page-head--v3">
        <div class="sph-card">
          <button type="button" class="auth-avatar auth-avatar--btn sph-ava" id="ap-avatar" aria-label="${_at('avatarChange')}" title="${_at('avatarChange')}">
            ${_avatarDiscHTML(p, user)}
            <span class="auth-avatar-edit" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M11 2l3 3-8 8H3v-3l8-8z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg></span>
          </button>
          <div class="sph-id">
            <span class="sph-eyebrow">${_ot('settingsTitle')}</span>
            <h1 class="sph-name">${escHtml(name)}${_verifiedTag(name,'glg-verified--lg')}</h1>
            <p class="sph-meta">${user.email||''}${since?` <span class="sph-dot">·</span> ${_at('memberSince')} ${since}`:''}</p>
          </div>
          <div class="sph-actions">
            <button type="button" class="btn btn-outline sph-profile-btn" onclick="showPage('profile')">${_ot('viewProfile')}</button>
          </div>
        </div>
      </div>
      <div class="settings-layout">
        <aside class="settings-nav set-tabs" role="tablist">${_settingsTabs()}</aside>
        <div class="settings-content set-panels">${_settingsPanels(p, user, pr)}</div>
      </div>
    </section>
    ${footerHTML()}`;
  _wireSettings(host);
  setTimeout(initReveal, 60);
}

/* Câblage des paramètres, scopé à `root` (modale OU page #page-settings). */
function _wireSettings(root) {
  root = root || $('glg-auth-modal'); if (!root) return;
  const q = sel => root.querySelector(sel);
  _wireAvPanel(q);   // onglet Voix & vidéo (périphériques + tests)
  // Onglets
  root.querySelectorAll('.set-tab').forEach(t => t.addEventListener('click', () => {
    root.querySelectorAll('.set-tab').forEach(x => x.classList.toggle('active', x === t));
    root.querySelectorAll('.set-panel').forEach(pn => { const on = pn.dataset.panel === t.dataset.tab; pn.classList.toggle('active', on); pn.hidden = !on; });
  }));
  q('#ap-avatar')?.addEventListener('click', openAvatarPicker);
  q('#ap-banner-btn')?.addEventListener('click', openBannerPicker);
  q('#ap-lang-btn')?.addEventListener('click', () => { reopenLangGate(); });
  // Enregistrer le profil (texte)
  q('#auth-profile')?.addEventListener('submit', async e => {
    e.preventDefault();
    _hideErr('ap-err');
    const btn = q('#ap-save'); const orig = btn.textContent;
    btn.disabled = true; btn.textContent = _at('working');
    const r = await GLG_AUTH.updateProfile({
      username: q('#ap-user').value, gender: q('#ap-gender').value, age: q('#ap-age').value,
      bio: (q('#ap-bio')?.value || '').trim(),
    });
    btn.disabled = false;
    if (!r.ok) { btn.textContent = orig; _showErr('ap-err', r.code==='taken'?_at('uTaken'):_at('fail')); return; }
    btn.textContent = _at('saved');
    setTimeout(() => { btn.textContent = orig; }, 2000);
    refreshAccountUI();
    if (document.getElementById('page-profile')?.classList.contains('active')) buildProfilePage();
  });
  // Couleur d'accent
  root.querySelectorAll('.set-accent').forEach(b => b.addEventListener('click', async () => {
    root.querySelectorAll('.set-accent').forEach(x => x.classList.toggle('on', x === b));
    await _savePrefs({ accent: b.dataset.accent || null });
    if (document.getElementById('page-profile')?.classList.contains('active')) buildProfilePage();
  }));
  // Réduction d'animations
  $('ap-rmotion')?.addEventListener('change', e => _savePrefs({ reducedMotion: e.target.checked }));
  // Sons d'interface (opt-in), petit "confirm" immédiat comme feedback
  $('ap-sfx')?.addEventListener('change', async e => {
    await _savePrefs({ sfx: e.target.checked });
    if (e.target.checked) window.GLG_SFX?.play('confirm');
  });
  // Notifications
  const notifSave = () => _savePrefs({ notif:{
    friendReq:$('ap-n-freq').checked, friendAcc:$('ap-n-facc').checked, release:$('ap-n-rel').checked,
    system:$('ap-n-sys') ? $('ap-n-sys').checked : (_userPrefs?.notif?.system !== false),
    chatMsg:$('ap-n-chat') ? $('ap-n-chat').checked : (_userPrefs?.notif?.chatMsg !== false),
  } });
  ['ap-n-freq','ap-n-facc','ap-n-rel','ap-n-sys','ap-n-chat'].forEach(id => $(id)?.addEventListener('change', notifSave));
  // Activer les toasts système = demander la permission Windows tout de suite
  $('ap-n-sys')?.addEventListener('change', e => { if (e.target.checked) GLG_TOAST.ensure(); });

  // ── Launcher : STUDIO D'AMBIANCE (presets + couleurs libres + dégradés) ──
  const ambSave = amb => _savePrefs({ launcher: Object.assign({}, _userPrefs.launcher, { amb }) });
  const ambReflect = amb => {   // reflète une ambiance dans les contrôles custom
    if (q('#ap-amb-c1')) q('#ap-amb-c1').value = amb.c1;
    if (q('#ap-amb-c2') && amb.c2) q('#ap-amb-c2').value = amb.c2;
    const g = $('ap-amb-grad'); if (g) g.checked = !!amb.c2;
    const w = $('ap-amb-c2wrap'); if (w) { if (amb.c2) w.removeAttribute('data-off'); else w.setAttribute('data-off', '1'); }
    root.querySelectorAll('#ap-amb-dir button').forEach(x => x.classList.toggle('on', x.dataset.v === amb.dir));
    const f = $('ap-amb-force'); if (f) f.value = amb.force;
    const fv = $('ap-amb-forceval'); if (fv) fv.textContent = amb.force + '%';
  };
  root.querySelectorAll('#ap-amb-presets .set-amb2').forEach(b => b.addEventListener('click', () => {
    const ps = _AMB_PRESETS.find(x => x.k === b.dataset.k); if (!ps) return;
    if (ps.lock && !_rwdHas(ps.lock)) {               // verrouillé : refus animé
      b.classList.add('deny'); setTimeout(() => b.classList.remove('deny'), 450); return;
    }
    root.querySelectorAll('#ap-amb-presets .set-amb2').forEach(x => x.classList.toggle('on', x === b));
    ambReflect(ps.a);
    ambSave(Object.assign({}, ps.a));
  }));
  // Aperçu au survol : l'ambiance s'ESSAIE avant de s'adopter (déverrouillés)
  root.querySelectorAll('#ap-amb-presets .set-amb2').forEach(b => {
    b.addEventListener('mouseenter', () => {
      const ps = _AMB_PRESETS.find(x => x.k === b.dataset.k);
      if (!ps || (ps.lock && !_rwdHas(ps.lock))) return;
      _glgAmbApply(ps.a);
    });
    b.addEventListener('mouseleave', () => {
      _glgAmbApply((_userPrefs && _userPrefs.launcher && _userPrefs.launcher.amb) || { on: false });
    });
  });
  // Points GLG frais → lève les cadenas mérités (sans reconstruire la page)
  _rwdEnsure().then(() => {
    root.querySelectorAll('#ap-amb-presets [data-lock]').forEach(b => {
      const ok = _rwdHas(+b.dataset.lock);
      b.classList.toggle('set-amb2--locked', !ok);
      const ps = _AMB_PRESETS.find(x => x.k === b.dataset.k);
      if (ps) b.title = (ps.t ? _ot(ps.t) : ps.n) + (ok ? '' : ', ' + _rwt('lockAt').replace('%s', ps.lock));
    });
  });
  let _ambT = 0;
  const ambCustom = () => {
    const grad = $('ap-amb-grad') && $('ap-amb-grad').checked;
    const amb = {
      on: true,
      c1: (q('#ap-amb-c1') && q('#ap-amb-c1').value) || '#4060d6',
      c2: grad ? ((q('#ap-amb-c2') && q('#ap-amb-c2').value) || '#182660') : null,
      dir: (root.querySelector('#ap-amb-dir button.on') || {}).dataset ? root.querySelector('#ap-amb-dir button.on').dataset.v : 'v',
      force: parseInt($('ap-amb-force') && $('ap-amb-force').value, 10) || 8,
    };
    _glgAmbApply(amb);                                    // visuel IMMÉDIAT
    root.querySelectorAll('#ap-amb-presets .set-amb2').forEach(x => x.classList.remove('on'));
    const w = $('ap-amb-c2wrap'); if (w) { if (amb.c2) w.removeAttribute('data-off'); else w.setAttribute('data-off', '1'); }
    const fv = $('ap-amb-forceval'); if (fv) fv.textContent = amb.force + '%';
    clearTimeout(_ambT); _ambT = setTimeout(() => ambSave(amb), 500);   // réseau débouncé
  };
  ['#ap-amb-c1', '#ap-amb-c2'].forEach(sel => q(sel) && q(sel).addEventListener('input', ambCustom));
  $('ap-amb-grad') && $('ap-amb-grad').addEventListener('change', ambCustom);
  $('ap-amb-force') && $('ap-amb-force').addEventListener('input', ambCustom);
  root.querySelectorAll('#ap-amb-dir button').forEach(b => b.addEventListener('click', () => {
    root.querySelectorAll('#ap-amb-dir button').forEach(x => x.classList.toggle('on', x === b));
    ambCustom();
  }));
  const _seg = (sel, key, cast) => root.querySelectorAll(sel + ' button').forEach(b => b.addEventListener('click', () => {
    root.querySelectorAll(sel + ' button').forEach(x => x.classList.toggle('on', x === b));
    _savePrefs({ launcher: Object.assign({}, _userPrefs.launcher, { [key]: cast ? cast(b.dataset.v) : b.dataset.v }) });
  }));
  _seg('#ap-lc-density', 'density');
  _seg('#ap-lc-zoom', 'zoom', Number);
  _seg('#ap-lc-brand', 'brand');
  q('#ap-lc-start')?.addEventListener('change', e => _savePrefs({ launcher: Object.assign({}, _userPrefs.launcher, { start: e.target.value }) }));
  // Démarrage avec Windows (launcher seul), plugin autostart : état réel lu au montage,
  // bascule revertie si l'IPC échoue (capability absente = toggle inerte, jamais menteur).
  const asT = q('#ap-lc-autostart');
  if (asT && IS_TAURI && window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
    const inv = c => window.__TAURI__.core.invoke(c);
    inv('plugin:autostart|is_enabled').then(v => { asT.checked = !!v; }).catch(() => {});
    asT.addEventListener('change', () => {
      inv(asT.checked ? 'plugin:autostart|enable' : 'plugin:autostart|disable')
        .then(() => { window.GLG_SFX?.play('toggle'); })
        .catch(() => { asT.checked = !asT.checked; });
    });
  }
  // Confidentialité (impacte l'affichage du profil)
  const privSave = async () => {
    await _savePrefs({ privacy:{ showTrophies:$('ap-p-tro').checked, showWishlist:$('ap-p-wish').checked, showFavs:$('ap-p-favs')?.checked !== false, showOnline:$('ap-p-onl').checked, showRecent:$('ap-p-rec')?.checked !== false } });
    GLG_PRESENCE.setVisible($('ap-p-onl').checked);   // bascule visible/invisible immédiate
    if (document.getElementById('page-profile')?.classList.contains('active')) buildProfilePage();
  };
  ['ap-p-tro','ap-p-wish','ap-p-favs','ap-p-onl','ap-p-rec'].forEach(id => $(id)?.addEventListener('change', privSave));
  // Changement de mot de passe
  $('ap-pw-save')?.addEventListener('click', async () => {
    _hideErr('ap-pw-err');
    const a = $('ap-pw1').value, b = $('ap-pw2').value;
    if (a !== b) { _showErr('ap-pw-err', _ot('pwMismatch')); return; }
    const strong = window.GLG_AUTH?.passwordStrength?.(a);
    if (strong && !strong.ok) { _showErr('ap-pw-err', _at('pwWeak')); return; }
    const btn = $('ap-pw-save'); const orig = btn.textContent; btn.disabled = true; btn.textContent = _at('working');
    const r = await GLG_AUTH.changePassword?.(a);
    btn.disabled = false;
    if (!r || !r.ok) { btn.textContent = orig; _showErr('ap-pw-err', (r && r.code==='weak') ? _at('pwWeak') : _at('fail')); return; }
    btn.textContent = _ot('pwChanged'); $('ap-pw1').value = ''; $('ap-pw2').value = '';
    setTimeout(() => { btn.textContent = orig; }, 2200);
  });
  // Vérification de mise à jour, RÉELLE quand le service worker est actif
  // (prod PWA) : update() → si une version attend, on l'active et on recharge
  // sous le veil de transition. Sinon (dev / Tauri futur) : état "à jour".
  q('#ap-update-check')?.addEventListener('click', async () => {
    const st = q('#ap-update-status'); const btn = q('#ap-update-check'); if (!st || !btn) return;
    const orig = btn.textContent; btn.disabled = true; btn.textContent = _ot('checking'); st.textContent = _ot('checking');
    let reloaded = false;
    try {
      const reg = window._glgSwReg || (('serviceWorker' in navigator) ? await navigator.serviceWorker.getRegistration() : null);
      if (reg){
        await reg.update();
        const waiting = reg.waiting;
        if (waiting){
          st.textContent = _ot('checking');
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (reloaded) return; reloaded = true;
            _pageVeilCover();                       // MAJ cinématique, sous le veil
            setTimeout(() => location.reload(), 90);
          });
          waiting.postMessage('SKIP_WAITING');
          return;
        }
      }
    } catch(e){}
    setTimeout(() => { btn.disabled = false; btn.textContent = orig; st.textContent = _ot('upToDate'); }, 900);
  });
  // 2FA TOTP (Steam Guard maison), état + enrôlement + désactivation
  _initMfaBlock(root);
  // Déconnexion / suppression, referme la modale (si présente) ET quitte la page
  $('ap-logout')?.addEventListener('click', async () => { await GLG_AUTH.signOut(); closeAuthModal(); refreshAccountUI(); showPage('home'); });
  $('ap-delete')?.addEventListener('click', async () => {
    if (!confirm(_at('delConfirm'))) return;
    const r = await GLG_AUTH.deleteAccount();
    if (r.ok) { closeAuthModal(); refreshAccountUI(); showPage('home'); }
    else _showErr('ap-err', _at('fail'));
  });
}

/* ── 2FA TOTP (Options → Compte), états OFF / enrôlement / ON ──────────
   Le QR (SVG) et le secret viennent de l'API MFA Supabase (mfaEnroll).
   Annuler l'enrôlement dé-enrôle le facteur (pas de facteur fantôme). */
async function _initMfaBlock(root) {
  const box = (root || document).querySelector('#ap-mfa'); if (!box) return;
  if (!window.GLG_AUTH?.mfaFactors) { box.innerHTML = `<p class="set-update-status">${_mt('err')}</p>`; return; }
  const { ok, factors } = await GLG_AUTH.mfaFactors();
  if (!ok) { box.innerHTML = `<p class="set-update-status">${_mt('err')}</p>`; return; }
  factors.length ? _renderMfaOn(box, factors[0]) : _renderMfaOff(box);
}
/* Élément d'erreur UNIQUE du bloc 2FA (réutilisé, plus d'empilement). */
function _mfaBoxErr(box) {
  let e = box.querySelector('.set-mfa-errline');
  if (!e) { e = document.createElement('p'); e.className = 'auth-err set-mfa-errline'; box.appendChild(e); }
  e.setAttribute('role', 'alert'); e.textContent = _mt('err'); e.hidden = false;
}
function _renderMfaOff(box) {
  box.innerHTML = `
    <p class="set-mfa-desc">${_mt('desc')}</p>
    <button type="button" class="btn btn-outline set-w" id="ap-mfa-on">${_mt('enable')}</button>`;
  box.querySelector('#ap-mfa-on')?.addEventListener('click', async () => {
    const btn = box.querySelector('#ap-mfa-on'); btn.disabled = true;
    const r = await GLG_AUTH.mfaEnroll();
    if (!r.ok) { btn.disabled = false; _mfaBoxErr(box); return; }
    _renderMfaEnroll(box, r);
  });
}
function _renderMfaEnroll(box, r) {
  // r.qr = SVG généré par Supabase (API MFA officielle), source de confiance
  box.innerHTML = `
    <p class="set-mfa-step">${_mt('scan')}</p>
    <div class="set-mfa-qr" aria-hidden="true">${r.qr && r.qr.trim().startsWith('<svg') ? r.qr : ''}</div>
    <p class="set-mfa-step set-mfa-step--sub">${_mt('manual')}</p>
    <code class="set-mfa-secret">${escHtml(r.secret || '')}</code>
    <p class="set-mfa-step">${_mt('confirm')}</p>
    <div class="set-mfa-row">
      <input type="text" class="set-mfa-input" id="ap-mfa-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" aria-label="${_mt('confirm')}">
      <button type="button" class="btn btn-primary" id="ap-mfa-verify">${_mt('verify')}</button>
      <button type="button" class="auth-link" id="ap-mfa-cancel">${_mt('cancel')}</button>
    </div>
    <p class="auth-err" id="ap-mfa-err" hidden></p>`;
  const input = box.querySelector('#ap-mfa-code');
  input?.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 6); });
  input?.focus();
  box.querySelector('#ap-mfa-cancel')?.addEventListener('click', async () => {
    try { await GLG_AUTH.mfaUnenroll(r.factorId); } catch (e) {}
    _renderMfaOff(box);
  });
  box.querySelector('#ap-mfa-verify')?.addEventListener('click', async () => {
    const err = box.querySelector('#ap-mfa-err'); err.hidden = true;
    const code = (input?.value || '').trim();
    if (code.length !== 6) { err.textContent = _mt('badCode'); err.hidden = false; return; }
    const btn = box.querySelector('#ap-mfa-verify'); btn.disabled = true;
    const v = await GLG_AUTH.mfaVerifyEnroll(r.factorId, code);
    btn.disabled = false;
    if (!v.ok) { err.textContent = _mt('badCode'); err.hidden = false; return; }
    window.GLG_SFX?.play('confirm');
    _renderMfaOn(box, { id: r.factorId });
  });
}
function _renderMfaOn(box, factor) {
  box.innerHTML = `
    <p class="set-mfa-active"><span class="set-mfa-dot" aria-hidden="true"></span>${_mt('active')}</p>
    <button type="button" class="auth-link auth-link--danger" id="ap-mfa-off">${_mt('disable')}</button>`;
  box.querySelector('#ap-mfa-off')?.addEventListener('click', async e => {
    if (!confirm(_mt('disableConfirm'))) return;
    const btn = e.currentTarget; btn.disabled = true;      // anti double-clic pendant le RPC
    const r = await GLG_AUTH.mfaUnenroll(factor.id);
    if (r && r.ok) { _renderMfaOff(box); }
    else { btn.disabled = false; _mfaBoxErr(box); }
  });
}

/* Preset avatars = circular crops of each work's cover (replace later with
   dedicated character art dropped into assets/img/avatars/). */
function getPresetAvatars() {
  return (typeof ALL_WORKS !== 'undefined' ? ALL_WORKS : []).map(w => ({ id: w.id, label: w.title, src: w.cover }));
}

/* After a picker action: go back to the edit modal, or, if launched from
   the member-space page, just close the overlay and refresh the page. */
function _pickerReturn(){
  closeAuthModal();
  if (document.getElementById('page-settings')?.classList.contains('active')) buildSettingsPage();
  else if (document.getElementById('page-profile')?.classList.contains('active')) buildProfilePage();
  else renderAuthModal();
}

/* Synchronise l'avatar PARTOUT immédiatement (nav + page profil + modale/paramètres)
   sans attendre un getProfile potentiellement en retard → les deux restent toujours
   alignés. Met aussi à jour le cache _accountProfile (source de vérité du profil). */
function _setAvatarEverywhere(url){
  const uname = _accountProfile?.username;
  if (_accountProfile) _accountProfile.avatar_url = url || null;
  const disc = _avatarDiscHTML({ avatar_url: url || null, username: uname }, null);
  // 1) Mini-avatar de la nav
  const navAva = document.querySelector('#nav-account-btn .nav-account-ava');
  if (navAva) navAva.innerHTML = disc;
  // 2) Grand avatar de la page profil (on conserve le crayon d'édition)
  const ppAva = document.querySelector('#page-profile .pp-avatar');
  if (ppAva){ const pencil = ppAva.querySelector('.pp-avatar-edit')?.outerHTML || ''; ppAva.innerHTML = disc + pencil; }
  // 3) Avatar d'en-tête de la modale/page paramètres
  document.querySelectorAll('#glg-auth-modal .auth-avatar, #page-settings .auth-avatar').forEach(av => {
    const pencil = av.querySelector('.auth-avatar-edit')?.outerHTML || '';
    av.innerHTML = disc + pencil;
  });
}

/* Lit un fichier image → recadre/redimensionne via canvas (ULTRA optimisé) →
   renvoie une data-URL légère. Marche SANS bucket de stockage : la data-URL
   est stockée dans profiles.avatar_url / banner_url (colonnes texte). C'est ce
   qui rend l'avatar/bannière perso réellement fonctionnels tout de suite. */
function _processImageFile(file, opts){
  opts = opts || {};
  const maxW = opts.maxW || 256, maxH = opts.maxH || 256, square = !!opts.square, quality = opts.quality || 0.85;
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error('type'));
    if (file.size > 12 * 1024 * 1024) return reject(new Error('size'));   // garde-fou source 12 Mo
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let tw, th, sx, sy, sw, sh;
      if (square){
        const side = Math.min(img.width, img.height);
        sx = (img.width - side) / 2; sy = (img.height - side) / 2; sw = sh = side;
        tw = th = Math.min(maxW, side) || maxW;
      } else {
        const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
        tw = Math.max(1, Math.round(img.width * ratio)); th = Math.max(1, Math.round(img.height * ratio));
        sx = 0; sy = 0; sw = img.width; sh = img.height;
      }
      const c = document.createElement('canvas'); c.width = tw; c.height = th;
      const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, tw, th);
      let out;
      try { out = c.toDataURL('image/webp', quality); if (!/^data:image\/webp/.test(out)) out = c.toDataURL('image/jpeg', quality); }
      catch (e) { try { out = c.toDataURL('image/jpeg', quality); } catch (e2) { return reject(new Error('encode')); } }
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    img.src = url;
  });
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
    const url = c.dataset.src;
    const r = await GLG_AUTH.updateProfile({ avatar_url: url });
    if (r.ok) { _setAvatarEverywhere(url); await refreshAccountUI(); _pickerReturn(); }
    else _showErr('apick-err', r.code === 'notConfigured' ? _at('notConfigured') : _at('fail'));
  }));
  $('apick-file').addEventListener('change', async e => {
    const file = e.target.files?.[0]; if (!file) return;
    _hideErr('apick-err');
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) { _showErr('apick-err', _at('imgType')); return; }
    try {
      // Recadrage carré + compression → data-URL (avatar net et léger, optimisé)
      const dataUrl = await _processImageFile(file, { maxW: 256, maxH: 256, square: true, quality: 0.86 });
      const r = await GLG_AUTH.updateProfile({ avatar_url: dataUrl });
      if (r.ok) { _setAvatarEverywhere(dataUrl); await refreshAccountUI(); _pickerReturn(); return; }
      const map = { notConfigured:_at('notConfigured'), notAuth:_at('notConfigured') };
      _showErr('apick-err', map[r.code] || _at('fail'));
    } catch (err) {
      _showErr('apick-err', err.message === 'size' ? _at('imgSize') : err.message === 'type' ? _at('imgType') : _at('fail'));
    } finally { e.target.value = ''; }
  });
}

/* ══════════════════════════════════════════════════════════
   CENTRE DE NOTIFICATIONS (cloche nav)
   Modèle local (localStorage, par utilisateur) alimenté par des
   ÉVÉNEMENTS dérivés de l'état réel : demande d'ami reçue,
   demande d'ami acceptée, jeu de la wishlist sorti. Conçu pour
   recevoir aussi des events backend/realtime plus tard via add().
══════════════════════════════════════════════════════════ */
const _NOTIF_T = {
  title:{fr:'Notifications',en:'Notifications',es:'Notificaciones',de:'Benachrichtigungen',ar:'الإشعارات',zh:'通知',ja:'通知',ru:'Уведомления',pl:'Powiadomienia',it:'Notifiche'},
  empty:{fr:'Aucune notification pour le moment.',en:'No notifications yet.',es:'No hay notificaciones por ahora.',de:'Noch keine Benachrichtigungen.',ar:'لا توجد إشعارات بعد.',zh:'暂无通知。',ja:'通知はまだありません。',ru:'Пока нет уведомлений.',pl:'Brak powiadomień.',it:'Nessuna notifica per ora.'},
  markAll:{fr:'Tout marquer comme lu',en:'Mark all as read',es:'Marcar todo como leído',de:'Alle als gelesen markieren',ar:'تعليم الكل كمقروء',zh:'全部标记为已读',ja:'すべて既読にする',ru:'Отметить все как прочитанные',pl:'Oznacz wszystkie jako przeczytane',it:'Segna tutto come letto'},
  friendReq:{fr:'Nouvelle demande d’ami',en:'New friend request',es:'Nueva solicitud de amistad',de:'Neue Freundschaftsanfrage',ar:'طلب صداقة جديد',zh:'新的好友请求',ja:'新しいフレンド申請',ru:'Новый запрос в друзья',pl:'Nowe zaproszenie do znajomych',it:'Nuova richiesta di amicizia'},
  friendReqB:{fr:'%s souhaite t’ajouter.',en:'%s wants to add you.',es:'%s quiere añadirte.',de:'%s möchte dich hinzufügen.',ar:'يريد %s إضافتك.',zh:'%s 想添加你为好友。',ja:'%s さんがあなたを追加したがっています。',ru:'%s хочет добавить вас.',pl:'%s chce Cię dodać.',it:'%s vuole aggiungerti.'},
  friendOk:{fr:'Demande d’ami acceptée',en:'Friend request accepted',es:'Solicitud de amistad aceptada',de:'Freundschaftsanfrage angenommen',ar:'تم قبول طلب الصداقة',zh:'好友请求已接受',ja:'フレンド申請が承認されました',ru:'Запрос в друзья принят',pl:'Zaproszenie przyjęte',it:'Richiesta di amicizia accettata'},
  friendOkB:{fr:'%s et vous êtes maintenant amis.',en:'%s and you are now friends.',es:'%s y tú ahora sois amigos.',de:'%s und du seid jetzt Freunde.',ar:'أنت و%s أصبحتما صديقين الآن.',zh:'你和 %s 现在是好友了。',ja:'%s さんとフレンドになりました。',ru:'Теперь вы и %s друзья.',pl:'Ty i %s jesteście teraz znajomymi.',it:'Tu e %s ora siete amici.'},
  release:{fr:'Disponible !',en:'Out now!',es:'¡Ya disponible!',de:'Jetzt verfügbar!',ar:'متاح الآن!',zh:'现已推出！',ja:'配信開始！',ru:'Уже доступно!',pl:'Już dostępne!',it:'Ora disponibile!'},
  releaseB:{fr:'%s de ta liste de souhaits est sorti.',en:'%s from your wishlist is out.',es:'%s de tu lista de deseos ya está disponible.',de:'%s aus deiner Wunschliste ist erschienen.',ar:'صدر %s من قائمة رغباتك.',zh:'心愿单中的 %s 已发布。',ja:'ウィッシュリストの %s が配信されました。',ru:'%s из вашего списка желаемого вышел.',pl:'%s z Twojej listy życzeń jest już dostępny.',it:'%s dalla tua lista dei desideri è uscito.'},
  now:{fr:'à l’instant',en:'just now',es:'ahora mismo',de:'gerade eben',ar:'الآن',zh:'刚刚',ja:'たった今',ru:'только что',pl:'przed chwilą',it:'proprio ora'},
};
function _nt(k){ const m=_NOTIF_T[k]; return m ? (m[LANG]||m.en) : k; }

const GLG_NOTIF = (function(){
  let _uid = 'anon';
  let _list = [];
  let _seenFriends = null;   // baseline set (ids déjà amis), null = pas encore initialisé
  const KEY  = () => 'glg_notifs_' + _uid;
  const SKEY = () => 'glg_friendseen_' + _uid;

  function _load(){
    try { _list = JSON.parse(localStorage.getItem(KEY()) || '[]') || []; } catch(e){ _list = []; }
    try { const s = JSON.parse(localStorage.getItem(SKEY()) || 'null'); _seenFriends = Array.isArray(s) ? new Set(s) : null; } catch(e){ _seenFriends = null; }
  }
  function _save(){
    try { localStorage.setItem(KEY(), JSON.stringify(_list.slice(0,60))); } catch(e){}
    try { if (_seenFriends) localStorage.setItem(SKEY(), JSON.stringify([..._seenFriends])); } catch(e){}
  }
  function setUser(uid){ _uid = uid || 'anon'; _load(); }
  function add(n){
    if (!n || !n.id) return false;
    if (_list.some(x => x.id === n.id)) return false;   // dédup stable
    _list.unshift(Object.assign({ ts: Date.now(), read: false }, n));
    _save(); _emit();
    // Launcher en arrière-plan → la notification devient un toast Windows
    try { GLG_TOAST.show(n.title, n.body); } catch(e){}
    return true;
  }
  function getAll(){ return _list.slice(); }
  function unread(){ return _list.filter(n => !n.read).length; }
  function markAllRead(){ let ch=false; _list.forEach(n => { if(!n.read){ n.read=true; ch=true; } }); if(ch){ _save(); _emit(); } }
  function clear(){ _list=[]; _save(); _emit(); }
  function _emit(){ document.dispatchEvent(new CustomEvent('glg:notif-changed')); }

  /* Dérive des notifs depuis l'état réel (idempotent grâce au dédup par id). */
  function sync(opts){
    opts = opts || {};
    const friends  = opts.friends  || { friends:[], incoming:[], outgoing:[] };
    const works    = opts.wishlistWorks || [];
    const np       = opts.notifPrefs || { friendReq:true, friendAcc:true, release:true };
    // 1) Demandes d'ami reçues
    if (np.friendReq !== false) (friends.incoming||[]).forEach(u => {
      add({ id:'freq:'+u.id, type:'friend_request', icon:'friend',
            title:_nt('friendReq'), body:_nt('friendReqB').replace('%s', u.username||'?'), data:{ uid:u.id } });
    });
    // 2) Demandes acceptées (nouvel ami apparu après le baseline)
    const ids = (friends.friends||[]).map(u => u.id);
    if (_seenFriends === null){ _seenFriends = new Set(ids); _save(); }   // 1er passage = baseline, pas de spam
    else {
      (friends.friends||[]).forEach(u => {
        if (!_seenFriends.has(u.id)){
          _seenFriends.add(u.id);
          if (np.friendAcc !== false) add({ id:'facc:'+u.id+':'+Date.now(), type:'friend_accepted', icon:'friend',
                title:_nt('friendOk'), body:_nt('friendOkB').replace('%s', u.username||'?'), data:{ uid:u.id } });
        }
      });
      _save();
    }
    // 3) Jeu de la wishlist sorti (statut "disponible/sorti")
    if (np.release !== false) works.forEach(w => {
      const st = (w.status||'').toLowerCase();
      if (/avail|released|out|sorti|disponible(?!.*bient)/.test(st) && !/coming|bient/.test(st)){
        add({ id:'rel:'+w.id, type:'wishlist_release', icon:'release',
              title:_nt('release'), body:_nt('releaseB').replace('%s', w.title||''), data:{ wid:w.id } });
      }
    });
  }
  return { setUser, add, getAll, unread, markAllRead, clear, sync };
})();
window.GLG_NOTIF = GLG_NOTIF;

/* ══════════════════════════════════════════
   TOASTS SYSTÈME (launcher), plugin Tauri notification (1.0.4+).
   Un toast Windows n'apparaît QUE si la fenêtre n'est pas au premier
   plan (sinon l'UI in-app suffit), et si Options → Notifications →
   « Notifications système » est actif. Silencieux sur le web et sur
   les launchers antérieurs (l'API n'existe pas → no-op).
══════════════════════════════════════════ */
const GLG_TOAST = {
  _perm: null,
  api(){ return (IS_TAURI && window.__TAURI__ && window.__TAURI__.notification) || null; },
  inv(cmd, args){ try { const c = IS_TAURI && window.__TAURI__ && window.__TAURI__.core; return (c && c.invoke) ? c.invoke('plugin:notification|' + cmd, args || {}) : null; } catch(e){ return null; } },
  async ensure(){
    if (!IS_TAURI) return false;
    if (this._perm === true) return true;
    try {
      const n = this.api();
      let ok = n ? await n.isPermissionGranted() : await this.inv('is_permission_granted');
      if (!ok) { const r = n ? await n.requestPermission() : await this.inv('request_permission'); ok = (r === 'granted' || r === true); }
      this._perm = !!ok; return this._perm;
    } catch(e){ return false; }
  },
  async show(title, body){
    if (!IS_TAURI) return;
    if (_userPrefs && _userPrefs.notif && _userPrefs.notif.system === false) return;
    try { if (document.hasFocus()) return; } catch(e){}
    if (!(await this.ensure())) return;
    const t = String(title || 'GEEKLEARN GAMES').slice(0, 80), b = String(body || '').slice(0, 180);
    try {
      const n = this.api();
      if (n) n.sendNotification({ title: t, body: b });
      else await this.inv('notify', { options: { title: t, body: b } });
    } catch(e){ try { await this.inv('notify', { options: { title: t, body: b } }); } catch(e2){} }
  },
};
window.GLG_TOAST = GLG_TOAST;

/* ══════════════════════════════════════════
   PRÉSENCE EN LIGNE (Supabase Realtime presence) + notifs d'amis LIVE
   ──────────────────────────────────────────
   Un seul canal presence partagé ('glg:online', key = uid). On ne
   s'annonce que si prefs.privacy.showOnline le permet (mode invisible
   sinon, on VOIT les autres sans être vu, comme Steam). Les nouvelles
   lignes `friendships` me concernant (RLS) rafraîchissent amis + notifs
   en direct. Dégradation propre : sans Realtime, tout le reste vit.
══════════════════════════════════════════ */
const GLG_PRESENCE = (function(){
  let ch = null, fch = null, online = new Set();
  function start(uid){
    stop();
    const sb = window.GLG_AUTH?.getClient?.(); if (!sb || !uid || !sb.channel) return;
    try {
      ch = sb.channel('glg:online', { config: { presence: { key: uid } } });
      ch.on('presence', { event: 'sync' }, () => {
        online = new Set(Object.keys(ch.presenceState() || {}));
        document.dispatchEvent(new CustomEvent('glg:presence-changed'));
      }).subscribe(st => {
        if (st === 'SUBSCRIBED' && (_userPrefs?.privacy?.showOnline !== false)){
          try { ch.track({ at: Date.now() }); } catch(e){}
        }
      });
      fch = sb.channel('glg:friendships')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => {
          try { refreshFriendsUI(); } catch(e){}
          try { _syncNotifications(); } catch(e){}
        })
        .subscribe();
    } catch(e){ ch = null; fch = null; }
  }
  function stop(){
    try { ch?.unsubscribe(); } catch(e){}
    try { fch?.unsubscribe(); } catch(e){}
    ch = null; fch = null; online = new Set();
    document.dispatchEvent(new CustomEvent('glg:presence-changed'));
  }
  /* Bascule immédiate quand l'utilisateur change sa préférence "En ligne" */
  function setVisible(v){ if (!ch) return; try { v ? ch.track({ at: Date.now() }) : ch.untrack(); } catch(e){} }
  return { start, stop, setVisible, isOnline: id => online.has(id), count: () => online.size };
})();
window.GLG_PRESENCE = GLG_PRESENCE;

/* Applique l'état de présence sur les pastilles + compteur "N en ligne" */
document.addEventListener('glg:presence-changed', () => {
  document.querySelectorAll('.pp-friend-dot[data-uid]').forEach(dot => {
    dot.classList.toggle('is-on', GLG_PRESENCE.isOnline(dot.dataset.uid));
  });
  const el = document.getElementById('pp-friends-online');
  if (el){
    const n = (_friendsCache?.friends || []).filter(f => GLG_PRESENCE.isOnline(f.id)).length;
    el.textContent = n ? `${n} ${_ft('online')}` : '';
  }
});

/* ── Lien d'invitation (?add=<uid>), zéro backend, zéro spam ──────────
   "Inviter" copie un lien ; au premier login/inscription du destinataire,
   la demande d'ami part automatiquement puis l'URL est nettoyée. */
async function copyInviteLink(btn){
  try {
    const user = await GLG_AUTH.getUser(); if (!user) return;
    const url = `${location.origin}${location.pathname}?add=${encodeURIComponent(user.id)}`;
    await navigator.clipboard.writeText(url);
    if (btn){ const old = btn.dataset.label || btn.textContent; btn.dataset.label = old;
      btn.textContent = _ft('inviteCopied'); btn.disabled = true;
      setTimeout(() => { btn.textContent = btn.dataset.label; btn.disabled = false; }, 2200); }
  } catch(e){}
}
async function _handleInviteParam(user){
  try {
    const target = new URLSearchParams(location.search).get('add');
    if (!target || !user || target === user.id) return;
    await GLG_AUTH.friendRequest?.(target);
    const url = new URL(location.href); url.searchParams.delete('add');
    history.replaceState(history.state, '', url.pathname + url.search + location.hash);
    refreshFriendsUI();
  } catch(e){}
}

const _NOTIF_ICONS = {
  friend:'<svg viewBox="0 0 20 20" fill="none"><circle cx="7.5" cy="6.5" r="3" stroke="currentColor" stroke-width="1.4"/><path d="M2.5 16c0-2.8 2.2-4.5 5-4.5s5 1.7 5 4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M15 7v5M12.5 9.5h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  release:'<svg viewBox="0 0 20 20" fill="none"><path d="M10 2.5 12.2 7l4.8.5-3.6 3.3 1 4.7L10 13.2 5.6 15.5l1-4.7L3 7.5 7.8 7 10 2.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
  system:'<svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7.5" stroke="currentColor" stroke-width="1.4"/><path d="M10 6.2v4.3M10 13.3h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
};
function _notifRelTime(ts){
  const s = Math.round((Date.now()-ts)/1000);
  if (s < 45) return _nt('now');
  try {
    const rtf = new Intl.RelativeTimeFormat(LANG||'en', { numeric:'auto' });
    if (s < 3600) return rtf.format(-Math.round(s/60), 'minute');
    if (s < 86400) return rtf.format(-Math.round(s/3600), 'hour');
    return rtf.format(-Math.round(s/86400), 'day');
  } catch(e){ return ''; }
}
function _refreshNotifBell(){
  const dot = $('nav-notif-dot'); if (!dot) return;
  const n = GLG_NOTIF.unread();
  dot.textContent = n > 9 ? '9+' : (n || '');
  dot.classList.toggle('on', n > 0);
}
function _renderNotifPanel(){
  const panel = $('nav-notif-panel'); if (!panel) return;
  const list = GLG_NOTIF.getAll();
  const items = list.length ? list.map(n => `
    <button class="notif-item ${n.read?'':'is-unread'}" data-id="${n.id}" data-type="${n.type}" data-uid="${n.data?.uid||''}" data-wid="${n.data?.wid||''}">
      <span class="notif-ico notif-ico--${n.icon||'system'}">${_NOTIF_ICONS[n.icon]||_NOTIF_ICONS.system}</span>
      <span class="notif-body">
        <span class="notif-title">${escHtml(n.title||'')}</span>
        <span class="notif-text">${escHtml(n.body||'')}</span>
        <span class="notif-time">${_notifRelTime(n.ts)}</span>
      </span>
      ${n.read?'':'<span class="notif-unread-dot" aria-hidden="true"></span>'}
    </button>`).join('') : `<div class="notif-empty">${_nt('empty')}</div>`;
  panel.innerHTML = `
    <div class="notif-head"><span class="notif-h-title">${_nt('title')}</span>${list.some(n=>!n.read)?`<button class="notif-markall" onclick="GLG_NOTIF.markAllRead()">${_nt('markAll')}</button>`:''}</div>
    <div class="notif-list">${items}</div>`;
  panel.querySelectorAll('.notif-item').forEach(it => it.addEventListener('click', () => {
    const type = it.dataset.type, uid = it.dataset.uid;
    closeNotifPanel();
    if ((type==='friend_request'||type==='friend_accepted')){ showPage('profile'); }
    else if (type==='wishlist_release' && it.dataset.wid){ showPage('detail', it.dataset.wid); }
  }));
}
function toggleNotifPanel(e){
  if (e) e.stopPropagation();
  let panel = $('nav-notif-panel');
  if (!panel){
    panel = document.createElement('div');
    panel.id = 'nav-notif-panel'; panel.className = 'notif-panel'; panel.setAttribute('role','dialog');
    document.body.appendChild(panel);
    document.addEventListener('click', ev => {
      if (!$('nav-notif-panel')?.classList.contains('open')) return;
      if (ev.target.closest('#nav-notif-panel') || ev.target.closest('#nav-notif-btn')) return;
      closeNotifPanel();
    });
  }
  if (panel.classList.contains('open')){ closeNotifPanel(); return; }
  _renderNotifPanel();
  const btn = $('nav-notif-btn'); const r = btn.getBoundingClientRect();
  panel.style.top = (r.bottom + 10) + 'px';
  panel.style.right = Math.max(12, window.innerWidth - r.right - 30) + 'px';
  panel.classList.add('open');
  // Vu → on marque comme lu après un court instant (le badge se vide)
  setTimeout(() => { GLG_NOTIF.markAllRead(); }, 1400);
}
function closeNotifPanel(){ $('nav-notif-panel')?.classList.remove('open'); }
document.addEventListener('glg:notif-changed', () => { _refreshNotifBell(); if ($('nav-notif-panel')?.classList.contains('open')) _renderNotifPanel(); });

async function refreshAccountUI() {
  let user = null;
  if (window.GLG_AUTH?.isConfigured?.()) user = await GLG_AUTH.getUser();
  _currentUserId = user ? user.id : null;   // sert à détecter "c'est vous" sur les profils publics
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
    _applyPrefs(p.prefs);                 // applique réduction d'animations + accent dès la connexion
    if (IS_TAURI) { try { GLG_TOAST.ensure(); } catch(e){} }   // permission toasts demandée tôt
    // Tes couleurs te suivent : le miroir LOCAL (dernier réglage sur cette
    // machine) prime sur un serveur en retard (save débouncée coupée par une
    // fermeture), et on le repousse au serveur dans la foulée.
    if (IS_TAURI) { try {
      const Lm = JSON.parse(localStorage.getItem('glg_lprefs') || 'null');
      if (Lm) _savePrefs({ launcher: Lm });
    } catch(e){} }
  } else {
    _accountProfile = null;
    _wishlist = _wishLoadLocal();
    _applyPrefs(null);                    // reset aux valeurs par défaut à la déconnexion
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

  /* ── Bibliothèque : EXCLUSIVE AU LAUNCHER (différenciation web/app) ──
     Sur le site web, l'entrée n'existe plus dans le header : la route
     #library y devient une page « exclusif au launcher » (buildLibraryPage).
     Dans le launcher (IS_TAURI), elle n'apparaît qu'aux joueurs connectés. */
  ['nl-library', 'nml-library'].forEach(id => $(id)?.classList.toggle('is-auth', !!user && IS_TAURI));
  document.body.classList.toggle('glg-authed', !!user);

  /* ── Messagerie (GLG Chat) : bouton header (web) / FAB flottant (launcher)
     + abonnement temps réel ── */
  ['nav-chat-btn', 'nml-chat'].forEach(id => $(id)?.classList.toggle('is-auth', !!user && !IS_TAURI));
  if (user) { _chatMe = user.id || null; _chatEnsureRealtime(); }
  else { _chatMe = null; _chatTeardownRealtime(); }

  /* ── Cloche de notifications : visible seulement connecté ── */
  const bell = $('nav-notif-btn');
  if (bell) {
    if (user) {
      bell.classList.add('is-auth');
      GLG_NOTIF.setUser(user.id || user.email || 'anon');
      _refreshNotifBell();
      _syncNotifications();              // dérive les notifs (amis, sorties wishlist)
    } else {
      bell.classList.remove('is-auth');
      closeNotifPanel();
      GLG_NOTIF.setUser('anon');
      _refreshNotifBell();
    }
  }

  /* ── Présence temps réel + lien d'invitation (?add=<uid>) ── */
  if (user) {
    GLG_PRESENCE.start(user.id);
    _handleInviteParam(user);
  } else {
    GLG_PRESENCE.stop();
  }

  _refreshAgeGated(); // re-render age-sensitive listings when the user (age) changes
  // Keep the member pages live if one of them is the active page
  // (sinon : bibliothèque/paramètres figés sur l'état d'avant login/logout)
  if (document.getElementById('page-profile')?.classList.contains('active')) buildProfilePage();
  if (document.getElementById('page-library')?.classList.contains('active')) buildLibraryPage();
  if (document.getElementById('page-settings')?.classList.contains('active')) buildSettingsPage();
}

/* Récupère amis + wishlist et alimente le centre de notifications. */
async function _syncNotifications(){
  if (!window.GLG_AUTH?.isConfigured?.()) return;
  let friends = { friends:[], incoming:[], outgoing:[] };
  try { const r = await GLG_AUTH.friendsList(); friends = { friends:r.friends||[], incoming:r.incoming||[], outgoing:r.outgoing||[] }; } catch(e){}
  const ids = (typeof wishGet==='function') ? wishGet() : [];
  const works = (typeof ALL_WORKS!=='undefined'?ALL_WORKS:[]).filter(w => ids.includes(w.id));
  try { GLG_NOTIF.sync({ friends, wishlistWorks: works, notifPrefs: _userPrefs && _userPrefs.notif }); } catch(e){}
  _refreshNotifBell();
}

/* ══════════════════════════════════════════
   PUBLIC PROFILE / MEMBER SPACE  (#page-profile)
   Bannière + avatar + identité + stats + wishlist.
══════════════════════════════════════════ */
const _PP_T = {
  activity:{fr:'Activité récente',en:'Recent activity',es:'Actividad reciente',de:'Letzte Aktivität',ar:'النشاط الأخير',zh:'最近动态',ja:'最近のアクティビティ',ru:'Недавняя активность',pl:'Ostatnia aktywność',it:'Attività recente'},
  actFriend:{fr:'Ami avec',en:'Became friends with',es:'Ahora es amigo de',de:'Jetzt befreundet mit',ar:'أصبح صديقًا لـ',zh:'与以下用户成为好友：',ja:'フレンドになりました：',ru:'Теперь в друзьях с',pl:'Zaprzyjaźnił się z',it:'Ora amico di'},
  actReview:{fr:'A évalué',en:'Reviewed',es:'Reseñó',de:'Bewertete',ar:'قيّم',zh:'评价了',ja:'レビューしました：',ru:'Оценил(а)',pl:'Ocenił(a)',it:'Ha recensito'},
  actEmpty:{fr:'Ton activité (trophées, amis, évaluations) apparaîtra ici.',en:'Your activity (trophies, friends, reviews) will appear here.',es:'Tu actividad aparecerá aquí.',de:'Deine Aktivität erscheint hier.',ar:'سيظهر نشاطك هنا.',zh:'你的动态将显示在这里。',ja:'アクティビティがここに表示されます。',ru:'Ваша активность появится здесь.',pl:'Twoja aktywność pojawi się tutaj.',it:'La tua attività apparirà qui.'},
  signedOutH:{fr:'Espace membre',en:'Member space',es:'Espacio de miembro',de:'Mitgliedsbereich',ar:'مساحة العضو',zh:'会员空间',ja:'メンバースペース',ru:'Личный кабинет',pl:'Strefa członka',it:'Area membro'},
  signedOutP:{fr:'Connecte-toi pour accéder à ton profil, ta liste de souhaits et tes préférences, synchronisés sur tous tes appareils.',en:'Sign in to access your profile, wishlist and preferences, synced across all your devices.',es:'Inicia sesión para acceder a tu perfil, tu lista de deseos y tus preferencias, sincronizados en todos tus dispositivos.',de:'Melde dich an, um auf dein Profil, deine Wunschliste und deine Einstellungen zuzugreifen - auf allen Geräten synchronisiert.',ar:'سجّل الدخول للوصول إلى ملفك الشخصي وقائمة رغباتك وتفضيلاتك، متزامنة عبر جميع أجهزتك.',zh:'登录以访问你的个人资料、心愿单和偏好设置、在所有设备间同步。',ja:'サインインしてプロフィール、ウィッシュリスト、設定にアクセス、すべてのデバイスで同期されます。',ru:'Войдите, чтобы открыть профиль, список желаемого и настройки, синхронизированные на всех устройствах.',pl:'Zaloguj się, aby uzyskać dostęp do profilu, listy życzeń i ustawień, zsynchronizowanych na wszystkich urządzeniach.',it:'Accedi per gestire il tuo profilo, la lista dei desideri e le preferenze, sincronizzati su tutti i dispositivi.'},
  signIn:{fr:'Se connecter',en:'Sign in',es:'Iniciar sesión',de:'Anmelden',ar:'تسجيل الدخول',zh:'登录',ja:'サインイン',ru:'Войти',pl:'Zaloguj się',it:'Accedi'},
  createAcc:{fr:'Créer un compte',en:'Create account',es:'Crear cuenta',de:'Konto erstellen',ar:'إنشاء حساب',zh:'创建账号',ja:'アカウント作成',ru:'Создать аккаунт',pl:'Utwórz konto',it:'Crea un account'},
  edit:{fr:'Modifier le profil',en:'Edit profile',es:'Editar perfil',de:'Profil bearbeiten',ar:'تعديل الملف الشخصي',zh:'编辑资料',ja:'プロフィール編集',ru:'Редактировать профиль',pl:'Edytuj profil',it:'Modifica profilo'},
  editBanner:{fr:'Bannière',en:'Banner',es:'Portada',de:'Banner',ar:'الغلاف',zh:'横幅',ja:'バナー',ru:'Баннер',pl:'Baner',it:'Banner'},
  statWish:{fr:'Souhaits',en:'Wishlist',es:'Deseos',de:'Wunschliste',ar:'الرغبات',zh:'心愿单',ja:'ウィッシュリスト',ru:'Желаемое',pl:'Życzenia',it:'Desideri'},
  statGames:{fr:'Jeux',en:'Games',es:'Juegos',de:'Spiele',ar:'الألعاب',zh:'游戏',ja:'ゲーム',ru:'Игры',pl:'Gry',it:'Giochi'},
  statMember:{fr:'Membre depuis',en:'Member since',es:'Miembro desde',de:'Mitglied seit',ar:'عضو منذ',zh:'注册于',ja:'登録日',ru:'В сообществе с',pl:'Członek od',it:'Membro dal'},
  defaultBanner:{fr:'Par défaut',en:'Default',es:'Por defecto',de:'Standard',ar:'افتراضي',zh:'默认',ja:'デフォルト',ru:'По умолчанию',pl:'Domyślny',it:'Predefinito'},
  pickBanner:{fr:'Choisir une bannière',en:'Choose a banner',es:'Elegir una portada',de:'Banner auswählen',ar:'اختر غلافًا',zh:'选择横幅',ja:'バナーを選ぶ',ru:'Выбрать баннер',pl:'Wybierz baner',it:'Scegli un banner'},
  years:{fr:'ans',en:'yrs',es:'años',de:'J.',ar:'سنة',zh:'岁',ja:'歳',ru:'лет',pl:'lat',it:'anni'},
  addBio:{fr:'+ Ajouter une bio',en:'+ Add a bio',es:'+ Añadir una bio',de:'+ Bio hinzufügen',ar:'+ إضافة نبذة',zh:'+ 添加简介',ja:'+ 自己紹介を追加',ru:'+ Добавить описание',pl:'+ Dodaj bio',it:'+ Aggiungi una bio'},
  bioLabel:{fr:'Bio',en:'Bio',es:'Bio',de:'Bio',ar:'نبذة',zh:'简介',ja:'自己紹介',ru:'Описание',pl:'Bio',it:'Bio'},
  bioPh:{fr:'Parle de toi en quelques mots…',en:'Tell the world about you…',es:'Cuéntale al mundo quién eres…',de:'Erzähl der Welt von dir…',ar:'عرّف العالم بنفسك…',zh:'向大家介绍一下你自己……',ja:'あなたについて世界に伝えましょう…',ru:'Расскажите о себе…',pl:'Opowiedz światu o sobie…',it:'Racconta al mondo chi sei…'},
};
function _ppt(k){ const m=_PP_T[k]; if(!m) return k; return m[LANG]||m.en; }

async function buildProfilePage(){
  const host = $('page-profile'); if(!host) return;
  // Mode "profil public d'un autre joueur" (clic sur un ami / une recherche)
  if (_viewProfileId){ return buildPublicProfilePage(_viewProfileId); }
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
  // Anti-retard : si on vient de changer d'avatar, le cache est plus frais que getProfile
  if (_accountProfile && _accountProfile.avatar_url !== undefined) p.avatar_url = _accountProfile.avatar_url;
  const pr = _applyPrefs(_userPrefs || p.prefs);   // LOCAL d'abord (anti-reset)   // confidentialité + accent + réduction d'animations
  const name  = p.username || user.email?.split('@')[0] || '-';
  const since = p.created_at ? new Date(p.created_at).toLocaleDateString(LANG_LOCALE[LANG]||'en-US',{year:'numeric',month:'long'}) : '-';
  const gLabel = p.gender==='male' ? _at('male') : p.gender==='female' ? _at('female') : (p.gender_other || _at('other'));
  const banner = safeMediaUrl(p.banner_url);
  // Jeux possédés (le fondateur certifié possède le catalogue entier)
  const gamesCount = (typeof _isVerified === 'function' && _isVerified(p.username))
    ? ALL_WORKS.length
    : (Array.isArray(p.library) ? p.library.length : 0);

  host.innerHTML = `
    <section class="pp pp--v3">
      <div class="pp-banner ${banner?'has-img':''}" ${banner?`style="background-image:url(${banner})"`:''}>
        <div class="pp-banner-scrim"></div>
        <button class="pp-banner-edit" onclick="openBannerPicker()" title="${_ppt('editBanner')}" aria-label="${_ppt('pickBanner')}">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M11 2l3 3-8 8H3v-3l8-8z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
          <span>${_ppt('editBanner')}</span>
        </button>
      </div>

      <!-- Plaque d'identité façon Steam-mais-mieux : elle chevauche la
           bannière ; niveau de trophées en anneau à droite (geste Steam). -->
      <div class="pp-head">
        <button class="pp-avatar" onclick="openAvatarPicker()" title="${_at('avatarChange')}" aria-label="${_at('avatarChange')}">
          ${_avatarDiscHTML(p, user)}
          <span class="pp-avatar-edit" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M11 2l3 3-8 8H3v-3l8-8z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg></span>
        </button>
        <div class="pp-id">
          <h1 class="pp-name">${escHtml(name)}${_verifiedTag(name,'glg-verified--lg')}</h1>
          <span class="pp-online"><i aria-hidden="true"></i>${_ft('online')}</span>
          ${pr.privacy.showTrophies ? `<span class="pp-level-chip" id="pp-level-chip"></span>` : ''}
          <div class="pp-badges">
            <span class="pp-badge">${escHtml(gLabel)}</span>
            ${p.age?`<span class="pp-badge">${p.age} ${_ppt('years')}</span>`:''}
            <span class="pp-badge pp-badge--muted">${_ppt('statMember')} ${since}</span>
          </div>
          ${p.bio ? `<p class="pp-bio">${escHtml(p.bio)}</p>` : `<button class="pp-bio-add" onclick="showPage('settings')">${_ppt('addBio')}</button>`}
        </div>
        <div class="pp-actions">
          ${pr.privacy.showTrophies ? `<div class="pp-level-ring" id="pp-level-ring" title="${_tt('level')}" aria-label="${_tt('level')}"></div>` : ''}
          <button class="btn btn-outline pp-edit-btn" onclick="showPage('settings')">${_ppt('edit')}</button>
        </div>
      </div>

      <!-- Compteurs cliquables (mieux que Steam : chaque compteur mène à sa
           section, Jeux ouvre la bibliothèque du launcher). -->
      <div class="pp-stats">
        <button class="pp-stat" onclick="showPage('library')"><b id="pp-stat-games">${gamesCount}</b><span>${_ppt('statGames')}</span></button>
        <button class="pp-stat" onclick="glgScrollToEl('.pp-trophy-section')"><b id="pp-stat-trophies">0</b><span>${_tt('section')}</span></button>
        <button class="pp-stat" onclick="glgScrollToEl('.pp-friends-section')"><b id="pp-stat-friends">0</b><span>${_ft('statFriends')}</span></button>
        <button class="pp-stat" onclick="glgScrollToEl('.pp-rev-section')"><b id="pp-stat-reviews">0</b><span>${_rvt('section')}</span></button>
        <button class="pp-stat" onclick="glgScrollToEl('#pp-wish-grid')"><b id="pp-stat-wish">${wishCount()}</b><span>${_ppt('statWish')}</span></button>
      </div>

      <!-- Disposition launcher : colonne principale (contenu vivant) + rail (infos froides) -->
      <div class="pp-cols">
        <div class="pp-main">
          <div class="pp-section pp-recent-section">
            <div class="pp-sec-head"><h2 class="pp-sec-title" data-idx="01 /">${_rgt('title')}</h2></div>
            ${_recentGamesHTML(p.recent_games, { owner: true })}
          </div>

          <div class="pp-section" id="pp-rewards" hidden></div>

          ${pr.privacy.showTrophies ? `
          <div class="pp-section pp-trophy-section">
            <div class="pp-sec-head"><h2 class="pp-sec-title" data-idx="02 /">${_tt('section')}</h2></div>
            <div id="pp-trophy-showcase" class="pp-trophy-showcase"></div>
            <div id="pp-trophy-games" class="pp-tg-grid"></div>
          </div>` : ''}

          <div class="pp-section pp-rev-section">
            <div class="pp-sec-head"><h2 class="pp-sec-title" data-idx="03 /">${_rvt('section')}</h2><span class="pp-sec-count" id="pp-rev-count">0</span></div>
            <div id="pp-reviews-body" class="pp-reviews-body"><div class="dp-rev-loading">···</div></div>
          </div>

          <div class="pp-section pp-shots-section">
            <div class="pp-sec-head">
              <h2 class="pp-sec-title" data-idx="04 /">${_sht('title')}</h2>
              <span class="pp-sec-count" id="pp-shots-count"></span>
              <button class="pp-add-friend" id="pp-shot-add">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
                <span>${_sht('add')}</span>
              </button>
              <input type="file" id="pp-shot-file" accept="image/png,image/jpeg,image/webp" hidden>
            </div>
            <div id="pp-shots-body" class="pp-shots-grid"><p class="pp-friends-note">···</p></div>
          </div>

          <div class="pp-section pp-act-section">
            <div class="pp-sec-head"><h2 class="pp-sec-title" data-idx="05 /">${_ppt('activity')}</h2></div>
            <div id="pp-activity-body" class="pp-activity-body"></div>
          </div>
        </div>

        <aside class="pp-rail">
          <div class="pp-section pp-friends-section">
            <div class="pp-sec-head">
              <h2 class="pp-sec-title">${_ft('title')}</h2>
              <span class="pp-sec-count" id="pp-friends-count">0</span>
              <span class="pp-fr-online" id="pp-friends-online"></span>
              <button class="pp-add-friend" onclick="openFriendSearch()">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
                <span>${_ft('addFriend')}</span>
              </button>
            </div>
            <div id="pp-friends-body" class="pp-friends-body"></div>
            <button class="pp-invite-btn" onclick="copyInviteLink(this)" title="${_ft('inviteHint')}">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6.5 9.5l3-3M7.5 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M8.5 11.5l-1 1a2.5 2.5 0 0 1-3.5-3.5l1-1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
              <span>${_ft('invite')}</span>
            </button>
          </div>

          <div class="pp-section pp-link-section">
            <div class="pp-sec-head"><h2 class="pp-sec-title">${_lt('title')}</h2></div>
            <div class="pp-link-rows">${_platformSectionHTML(p.linked_accounts)}</div>
          </div>

          ${pr.privacy.showWishlist ? `
          <div class="pp-section">
            <div class="pp-sec-head"><h2 class="pp-sec-title">${_wt('title')}</h2><span class="pp-sec-count" id="pp-wish-count">${wishCount()}</span></div>
            <div class="pp-wish-grid" id="pp-wish-grid"></div>
          </div>` : ''}
        </aside>
      </div>
    </section>
    ${footerHTML()}`;
  _renderProfileWishlist();
  refreshFriendsUI().then(() => _renderProfileActivity());   // l'activité lit le cache d'amis
  refreshTrophiesUI();
  _renderProfileReviews(user.id);
  _initProfileShots(user.id);
  setTimeout(initReveal, 60);
}

/* ══════════════════════════════════════════
   GALERIE DE CAPTURES D'ÉCRAN (profil, style Steam)
   Stockage : bucket Supabase `screenshots` (db/schema.sql), lecture publique,
   écriture/suppression limitées au dossier du joueur (RLS). L'app compresse
   en WebP ≤1600px AVANT upload. 12 captures max (borne côté auth.js).
══════════════════════════════════════════ */
/* ══════════════════════════════════════════
   JEUX RÉCENTS (profil, style Steam/PSN)
   Données : profiles.recent_games [{id,at,mins}] alimenté par la RPC
   touch_recent_game (appelée par le jeu/launcher en fin de session).
══════════════════════════════════════════ */
const _RECENT_T = {
  title:   { fr:'Jeux récents', en:'Recent games', es:'Juegos recientes', de:'Kürzlich gespielt', it:'Giochi recenti', ar:'الألعاب الأخيرة', zh:'最近游玩', ja:'最近プレイしたゲーム', ru:'Недавние игры', pl:'Ostatnio grane' },
  lastAt:  { fr:'Dernière session le %s', en:'Last played %s', es:'Última sesión el %s', de:'Zuletzt gespielt am %s', it:'Ultima sessione il %s', ar:'آخر جلسة في %s', zh:'最后游玩于%s', ja:'最終プレイ：%s', ru:'Последняя сессия: %s', pl:'Ostatnia sesja: %s' },
  playedH: { fr:'%s h de jeu', en:'%s hrs on record', es:'%s h de juego', de:'%s Std. gespielt', it:'%s ore di gioco', ar:'%s ساعة لعب', zh:'总时数 %s 小时', ja:'プレイ時間 %s 時間', ru:'%s ч в игре', pl:'%s godz. gry' },
  playedM: { fr:'%s min de jeu', en:'%s min on record', es:'%s min de juego', de:'%s Min. gespielt', it:'%s min di gioco', ar:'%s دقيقة لعب', zh:'总时数 %s 分钟', ja:'プレイ時間 %s 分', ru:'%s мин в игре', pl:'%s min gry' },
  emptyOwn:{ fr:'Aucune session pour le moment, tes jeux lancés apparaîtront ici, comme sur Steam.', en:'No sessions yet, the games you launch will appear here, Steam-style.', es:'Aún no hay sesiones, los juegos que inicies aparecerán aquí.', de:'Noch keine Sessions, gestartete Spiele erscheinen hier.', it:'Nessuna sessione per ora, i giochi avviati appariranno qui.', ar:'لا جلسات بعد، ستظهر الألعاب التي تشغّلها هنا.', zh:'暂无游戏记录、你启动的游戏将显示在这里。', ja:'まだセッションがありません、起動したゲームがここに表示されます。', ru:'Пока нет сессий, запущенные игры появятся здесь.', pl:'Brak sesji, uruchamiane gry pojawią się tutaj.' },
};
const _rgt = k => (_RECENT_T[k] && (_RECENT_T[k][LANG] || _RECENT_T[k].en)) || '';

/* Lignes façon Steam : mini-cover, titre, temps de jeu cumulé, dernière
   session, chevron → fiche. `list` = profiles.recent_games (déjà trié). */
function _recentGamesHTML(list, opts) {
  const o = opts || {};
  const rows = (Array.isArray(list) ? list : [])
    .map(e => ({ e, w: ALL_WORKS.find(w => w.id === e.id) }))
    .filter(x => x.w && !isMatureHidden(x.w))
    .slice(0, 5);
  if (!rows.length) {
    return o.owner ? `<p class="pp-friends-note">${_rgt('emptyOwn')}</p>` : '';
  }
  return `<div class="pp-recent-list">${rows.map(({ e, w }) => {
    const tint = w.tint || '#ffffff';
    const rgb  = hexToRgb(tint) || '255,255,255';
    const mins = Math.max(0, parseInt(e.mins, 10) || 0);
    let hoursTxt = '';
    try { hoursTxt = new Intl.NumberFormat(LANG_LOCALE[LANG] || 'en-US', { maximumFractionDigits: mins >= 600 ? 0 : 1 }).format(mins / 60); }
    catch (err) { hoursTxt = (mins / 60).toFixed(1); }
    const played = mins >= 60
      ? _rgt('playedH').replace('%s', hoursTxt)
      : _rgt('playedM').replace('%s', String(mins));
    let dateTxt = '';
    try { dateTxt = new Date(e.at).toLocaleDateString(LANG_LOCALE[LANG] || 'en-US', { day:'numeric', month:'short' }); } catch (err) {}
    return `
    <button class="pp-recent" style="--tint:${tint};--tint-rgb:${rgb}" onclick="showPage('detail','${w.id}')" aria-label="${w.title}">
      <span class="pp-recent-cover"><img src="${av(w.cover)}" alt="" loading="lazy" decoding="async" onerror="this.style.opacity=0"></span>
      <span class="pp-recent-info">
        <span class="pp-recent-name">${w.title}</span>
        <span class="pp-recent-meta">${played}${dateTxt ? ` · ${_rgt('lastAt').replace('%s', dateTxt)}` : ''}</span>
      </span>
      <svg class="pp-recent-arr" width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
    </button>`;
  }).join('')}</div>`;
}

const _SHOT_T = {
  title:  { fr:'Captures d’écran', en:'Screenshots', es:'Capturas de pantalla', de:'Screenshots', it:'Screenshot', ar:'لقطات الشاشة', zh:'截图', ja:'スクリーンショット', ru:'Скриншоты', pl:'Zrzuty ekranu' },
  add:    { fr:'Ajouter', en:'Add', es:'Añadir', de:'Hinzufügen', it:'Aggiungi', ar:'إضافة', zh:'添加', ja:'追加', ru:'Добавить', pl:'Dodaj' },
  empty:  { fr:'Aucune capture pour le moment.', en:'No screenshots yet.', es:'Aún no hay capturas.', de:'Noch keine Screenshots.', it:'Ancora nessuno screenshot.', ar:'لا توجد لقطات بعد.', zh:'暂无截图。', ja:'まだスクリーンショットがありません。', ru:'Пока нет скриншотов.', pl:'Brak zrzutów ekranu.' },
  emptyOwn:{ fr:'Partage tes plus beaux moments de jeu, ajoute ta première capture.', en:'Share your best gaming moments, add your first screenshot.', es:'Comparte tus mejores momentos de juego, añade tu primera captura.', de:'Teile deine besten Gaming-Momente, füge deinen ersten Screenshot hinzu.', it:'Condividi i tuoi momenti di gioco migliori, aggiungi il primo screenshot.', ar:'شارك أجمل لحظات لعبك، أضف أول لقطة.', zh:'分享你最精彩的游戏时刻、添加第一张截图。', ja:'最高のゲームの瞬間をシェアしよう、最初の1枚を追加。', ru:'Поделитесь лучшими игровыми моментами, добавьте первый скриншот.', pl:'Podziel się najlepszymi momentami z gier, dodaj pierwszy zrzut.' },
  uploading:{ fr:'Envoi en cours…', en:'Uploading…', es:'Subiendo…', de:'Wird hochgeladen…', it:'Caricamento…', ar:'جارٍ الرفع…', zh:'上传中…', ja:'アップロード中…', ru:'Загрузка…', pl:'Przesyłanie…' },
  limit:  { fr:'Limite de 12 captures atteinte, supprime-en une d’abord.', en:'12-screenshot limit reached, delete one first.', es:'Límite de 12 capturas alcanzado, elimina una primero.', de:'Limit von 12 Screenshots erreicht, lösche zuerst einen.', it:'Limite di 12 screenshot raggiunto, eliminane uno prima.', ar:'بلغت حد 12 لقطة، احذف واحدة أولاً.', zh:'已达到12张上限、请先删除一张。', ja:'12枚の上限に達しました、先に1枚削除してください。', ru:'Достигнут лимит в 12 скриншотов, сначала удалите один.', pl:'Osiągnięto limit 12 zrzutów, najpierw usuń jeden.' },
  fail:   { fr:'Envoi impossible, réessaie.', en:'Upload failed, try again.', es:'Error al subir, inténtalo de nuevo.', de:'Upload fehlgeschlagen, versuch es erneut.', it:'Caricamento non riuscito, riprova.', ar:'فشل الرفع، حاول مجدداً.', zh:'上传失败、请重试。', ja:'アップロードに失敗しました、もう一度お試しください。', ru:'Не удалось загрузить, попробуйте ещё раз.', pl:'Przesyłanie nie powiodło się, spróbuj ponownie.' },
  delQ:   { fr:'Supprimer cette capture ?', en:'Delete this screenshot?', es:'¿Eliminar esta captura?', de:'Diesen Screenshot löschen?', it:'Eliminare questo screenshot?', ar:'حذف هذه اللقطة؟', zh:'删除此截图？', ja:'このスクリーンショットを削除しますか？', ru:'Удалить этот скриншот?', pl:'Usunąć ten zrzut ekranu?' },
  close:  { fr:'Fermer', en:'Close', es:'Cerrar', de:'Schließen', it:'Chiudi', ar:'إغلاق', zh:'关闭', ja:'閉じる', ru:'Закрыть', pl:'Zamknij' },
};
const _sht = k => (_SHOT_T[k] && (_SHOT_T[k][LANG] || _SHOT_T[k].en)) || '';

function _dataUrlToBlob(dataUrl) {
  const [head, b64] = String(dataUrl).split(',');
  const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/webp';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

async function _initProfileShots(uid, opts) {
  const body = document.getElementById('pp-shots-body'); if (!body) return;
  const readOnly = !!(opts && opts.readOnly);
  const addBtn = document.getElementById('pp-shot-add');
  const fileInp = document.getElementById('pp-shot-file');

  const load = async () => {
    const r = await (window.GLG_AUTH?.listScreenshots?.(uid) || Promise.resolve({ shots: [] }));
    const shots = r.shots || [];
    const count = document.getElementById('pp-shots-count');
    if (count) count.textContent = shots.length || '';
    if (!shots.length) {
      body.innerHTML = `<p class="pp-friends-note">${readOnly ? _sht('empty') : _sht('emptyOwn')}</p>`;
      return;
    }
    body.innerHTML = shots.map(s => `
      <figure class="pp-shot" data-path="${escHtml(s.path)}">
        <button type="button" class="pp-shot-open" aria-label="${_sht('title')}" onclick="_openShotView(this.querySelector('img')?.src)">
          <img src="${safeMediaUrl(s.url)}" alt="" loading="lazy" decoding="async"
               onerror="this.closest('.pp-shot')?.remove()">
        </button>
        ${readOnly ? '' : `<button class="pp-shot-del" data-del="${escHtml(s.path)}" aria-label="${_sht('delQ')}" title="${_sht('delQ')}">
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
        </button>`}
      </figure>`).join('');
    if (!readOnly) body.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm(_sht('delQ'))) return;
      b.disabled = true;
      const r2 = await GLG_AUTH.deleteScreenshot?.(b.dataset.del);
      if (r2 && r2.ok) load(); else b.disabled = false;
    }));
  };

  if (readOnly) { addBtn?.remove(); }
  else if (addBtn && fileInp) {
    addBtn.addEventListener('click', () => fileInp.click());
    fileInp.addEventListener('change', async () => {
      const file = fileInp.files && fileInp.files[0];
      fileInp.value = '';
      if (!file) return;
      const label = addBtn.querySelector('span'); const orig = label ? label.textContent : '';
      addBtn.disabled = true; if (label) label.textContent = _sht('uploading');
      try {
        // Compression client : WebP ≤1600×1000, un screenshot 4K devient ~150-400 Ko
        const dataUrl = await _processImageFile(file, { maxW: 1600, maxH: 1000, quality: 0.82 });
        const r = await GLG_AUTH.uploadScreenshot?.(_dataUrlToBlob(dataUrl));
        if (!r || !r.ok) alert(r && r.code === 'limit' ? _sht('limit') : _sht('fail'));
        else { window.GLG_SFX?.play('confirm'); await load(); }
      } catch (e) { alert(_sht('fail')); }
      addBtn.disabled = false; if (label) label.textContent = orig;
    });
  }
  load();
}

/* Visionneuse plein écran d'une capture (ESC / clic pour fermer). */
function _openShotView(url) {
  const safe = safeMediaUrl(url); if (!safe) return;
  document.getElementById('glg-shot-view')?.remove();
  const ov = document.createElement('div');
  ov.id = 'glg-shot-view';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.setAttribute('aria-label', _sht('title'));
  ov.innerHTML = `
    <img src="${safe}" alt="">
    <button class="shot-view-close" aria-label="${_sht('close')}">
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
    </button>`;
  const opener = document.activeElement; // a11y : restituer le focus à la fermeture
  const close = () => {
    ov.remove(); document.removeEventListener('keydown', onKey); document.body.style.overflow = '';
    if (opener && document.contains(opener)) { try { opener.focus(); } catch (e) {} }
  };
  const onKey = e => {
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'Tab') { e.preventDefault(); ov.querySelector('.shot-view-close')?.focus(); } // un seul focusable
  };
  ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('.shot-view-close')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(ov);
  document.body.style.overflow = 'hidden';
  // setTimeout (PAS rAF) : rAF est gelé quand l'onglet est en arrière-plan
  // → la visionneuse resterait invisible (même piège que le loader).
  setTimeout(() => { ov.classList.add('open'); ov.querySelector('.shot-view-close')?.focus(); }, 20);
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
        <div class="pp-wish-meta">${w.year} · ${priceHTML(w, { size:'sm' })}</div>
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
  online:     { fr:'en ligne', en:'online', es:'en línea', de:'online', it:'online', ar:'متصل', zh:'在线', ja:'オンライン', ru:'в сети', pl:'online' },
  invite:     { fr:'Inviter', en:'Invite', es:'Invitar', de:'Einladen', it:'Invita', ar:'دعوة', zh:'邀请', ja:'招待', ru:'Пригласить', pl:'Zaproś' },
  inviteCopied:{ fr:'Lien d’invitation copié !', en:'Invite link copied!', es:'¡Enlace de invitación copiado!', de:'Einladungslink kopiert!', it:'Link d’invito copiato!', ar:'تم نسخ رابط الدعوة!', zh:'邀请链接已复制！', ja:'招待リンクをコピーしました！', ru:'Ссылка-приглашение скопирована!', pl:'Skopiowano link zaproszenia!' },
  inviteHint: { fr:'Partage ce lien : tes amis créent un compte et la demande part automatiquement.', en:'Share this link: your friends create an account and the request is sent automatically.', es:'Comparte este enlace: tus amigos crean una cuenta y la solicitud se envía sola.', de:'Teile diesen Link: Freunde erstellen ein Konto, die Anfrage wird automatisch gesendet.', it:'Condividi questo link: i tuoi amici creano un account e la richiesta parte da sola.', ar:'شارك هذا الرابط: ينشئ أصدقاؤك حسابًا ويُرسَل الطلب تلقائيًا.', zh:'分享此链接：好友注册后将自动发送好友请求。', ja:'このリンクを共有：友達がアカウントを作ると自動でリクエストが送られます。', ru:'Поделитесь ссылкой: друзья создадут аккаунт, запрос отправится сам.', pl:'Udostępnij link: znajomi zakładają konto, a zaproszenie wysyła się samo.' },
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
  const init = escHtml((u.username || '?').trim().charAt(0).toUpperCase());
  const url = safeMediaUrl(u.avatar_url);
  if (url) return `<img class="ava-img" src="${url}" alt="" loading="lazy" onerror="this.remove()"><span class="ava-init ava-init--fallback">${init}</span>`;
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
  // Alimente le centre de notifications (demandes reçues / acceptées) en direct
  try { const ids=(typeof wishGet==='function')?wishGet():[]; const works=(typeof ALL_WORKS!=='undefined'?ALL_WORKS:[]).filter(w=>ids.includes(w.id)); GLG_NOTIF.sync({ friends:_friendsCache, wishlistWorks:works, notifPrefs:_userPrefs&&_userPrefs.notif }); _refreshNotifBell(); } catch(e){}
  const cnt = document.getElementById('pp-friends-count'); if (cnt) cnt.textContent = _friendsCache.friends.length;
  const stat = document.getElementById('pp-stat-friends'); if (stat) stat.textContent = _friendsCache.friends.length;

  let html = '';
  if (_friendsCache.incoming.length){
    html += `<div class="pp-fr-block"><div class="pp-fr-label">${_ft('incoming')} <span class="pp-fr-badge">${_friendsCache.incoming.length}</span></div><div class="pp-fr-reqs">` +
      _friendsCache.incoming.map(u => `
        <div class="pp-fr-req">
          <button class="pp-fr-open" onclick="openUserProfile('${u.id}')" aria-label="${escHtml(u.username||'')}">
            <span class="pp-fr-ava">${_userAvatarHTML(u)}</span>
            <span class="pp-fr-name">${escHtml(u.username||'')}${_verifiedTag(u.username)}</span>
          </button>
          <span class="pp-fr-actions">
            <button class="pp-fr-accept" onclick="friendAccept('${u.id}', this)">${_ft('accept')}</button>
            <button class="pp-fr-decline" onclick="friendDecline('${u.id}', this)" aria-label="${_ft('decline')}" title="${_ft('decline')}">${_XSVG}</button>
          </span>
        </div>`).join('') + `</div></div>`;
  }

  html += `<div class="pp-fr-block"><div class="pp-fr-label">${_ft('title')} <span class="pp-fr-badge">${_friendsCache.friends.length}</span></div>`;
  if (_friendsCache.friends.length){
    // Carte cliquable → profil public (le retrait d'ami se fait DEPUIS ce profil)
    html += `<div class="pp-friends-grid">` + _friendsCache.friends.map(u => `
        <button class="pp-friend-card" onclick="openUserProfile('${u.id}')" aria-label="${escHtml(u.username||'')}" title="${escHtml(u.username||'')}">
          <span class="pp-friend-ava">${_userAvatarHTML(u)}<span class="pp-friend-dot" data-uid="${escHtml(u.id)}" aria-hidden="true"></span></span>
          <span class="pp-friend-name">${escHtml(u.username||'')}${_verifiedTag(u.username)}</span>
        </button>`).join('') + `</div>`;
  } else {
    html += `<p class="pp-friends-note">${_ft('empty')}</p>`;
  }
  html += `</div>`;

  if (_friendsCache.outgoing.length){
    html += `<div class="pp-fr-block"><div class="pp-fr-label">${_ft('outgoing')} <span class="pp-fr-badge">${_friendsCache.outgoing.length}</span></div><div class="pp-fr-reqs">` +
      _friendsCache.outgoing.map(u => `
        <div class="pp-fr-req pp-fr-req--out">
          <button class="pp-fr-open" onclick="openUserProfile('${u.id}')" aria-label="${escHtml(u.username||'')}">
            <span class="pp-fr-ava">${_userAvatarHTML(u)}</span>
            <span class="pp-fr-name">${escHtml(u.username||'')}${_verifiedTag(u.username)}</span>
          </button>
          <span class="pp-fr-pending">${_ft('pending')}</span>
          <button class="pp-fr-decline" onclick="friendRemoveUI('${u.id}', this)" aria-label="${_ft('cancel')}" title="${_ft('cancel')}">${_XSVG}</button>
        </div>`).join('') + `</div></div>`;
  }
  body.innerHTML = html;
  // Ré-applique l'état de présence sur les pastilles fraîchement rendues
  document.dispatchEvent(new CustomEvent('glg:presence-changed'));
}
/* btn passé par onclick="...(id, this)" → désactivé pendant le RPC (anti double-clic) */
async function friendAccept(id, btn){ if (btn) btn.disabled = true; if(window.GLG_AUTH?.friendRespond){ await GLG_AUTH.friendRespond(id, true); } refreshFriendsUI(); }
async function friendDecline(id, btn){ if (btn) btn.disabled = true; if(window.GLG_AUTH?.friendRespond){ await GLG_AUTH.friendRespond(id, false); } refreshFriendsUI(); }
async function friendRemoveUI(id, btn){ if (btn) btn.disabled = true; if(window.GLG_AUTH?.friendRemove){ await GLG_AUTH.friendRemove(id); } refreshFriendsUI(); }

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
      <button class="fr-res-open" onclick="openUserProfile('${escHtml(u.id)}')" aria-label="${escHtml(u.username||'')}">
        <span class="fr-res-ava">${_userAvatarHTML(u)}</span>
        <span class="fr-res-name">${escHtml(u.username||'')}${_verifiedTag(u.username)}</span>
      </button>
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

/* ══════════════════════════════════════════════════════════
   PROFIL PUBLIC d'un autre joueur (style Steam)
   Cliquable depuis : carte d'ami, demande, résultat de recherche.
   Le bouton "Retirer des amis" n'apparaît QUE sur le profil d'un
   ami (jamais sur le sien, on ne se retire pas soi-même).
══════════════════════════════════════════════════════════ */
const _UP_T = {
  add:      { fr:'Ajouter en ami', en:'Add friend', es:'Añadir amigo', de:'Freund hinzufügen', it:'Aggiungi amico', ar:'إضافة صديق', zh:'添加好友', ja:'フレンド追加', ru:'Добавить в друзья', pl:'Dodaj znajomego' },
  accept:   { fr:'Accepter la demande', en:'Accept request', es:'Aceptar solicitud', de:'Anfrage annehmen', it:'Accetta richiesta', ar:'قبول الطلب', zh:'接受请求', ja:'リクエストを承認', ru:'Принять заявку', pl:'Przyjmij zaproszenie' },
  pending:  { fr:'Demande envoyée', en:'Request sent', es:'Solicitud enviada', de:'Anfrage gesendet', it:'Richiesta inviata', ar:'تم إرسال الطلب', zh:'请求已发送', ja:'リクエスト送信済み', ru:'Заявка отправлена', pl:'Wysłano zaproszenie' },
  remove:   { fr:'Retirer des amis', en:'Remove friend', es:'Eliminar amigo', de:'Freund entfernen', it:'Rimuovi amico', ar:'إزالة الصديق', zh:'移除好友', ja:'フレンド解除', ru:'Удалить из друзей', pl:'Usuń znajomego' },
  removeQ:  { fr:'Retirer cette personne de tes amis ?', en:'Remove this person from your friends?', es:'¿Eliminar a esta persona de tus amigos?', de:'Diese Person aus deinen Freunden entfernen?', it:'Rimuovere questa persona dai tuoi amici?', ar:'إزالة هذا الشخص من أصدقائك؟', zh:'将此人从好友中移除？', ja:'この人をフレンドから外しますか？', ru:'Удалить этого человека из друзей?', pl:'Usunąć tę osobę ze znajomych?' },
  noBio:    { fr:'Ce joueur n’a pas encore de bio.', en:'This player hasn’t added a bio yet.', es:'Este jugador aún no tiene biografía.', de:'Dieser Spieler hat noch keine Bio.', it:'Questo giocatore non ha ancora una bio.', ar:'لم يضف هذا اللاعب نبذة بعد.', zh:'该玩家尚未填写简介。', ja:'このプレイヤーはまだ自己紹介がありません。', ru:'Игрок ещё не добавил описание.', pl:'Ten gracz nie dodał jeszcze bio.' },
  founder:  { fr:'Fondateur du studio', en:'Studio founder', es:'Fundador del estudio', de:'Studio-Gründer', it:'Fondatore dello studio', ar:'مؤسس الأستوديو', zh:'工作室创始人', ja:'スタジオ創設者', ru:'Основатель студии', pl:'Założyciel studia' },
  favShowcase:{ fr:'Jeux favoris', en:'Favorite games', es:'Juegos favoritos', de:'Lieblingsspiele', it:'Giochi preferiti', ar:'الألعاب المفضلة', zh:'收藏的游戏', ja:'お気に入りのゲーム', ru:'Любимые игры', pl:'Ulubione gry' },
};
function _upt(k){ const m=_UP_T[k]; return m ? (m[LANG]||m.en) : k; }

let _currentUserId = null; // mis à jour par refreshAccountUI
async function _userRelation(uid){
  if (_currentUserId && uid === _currentUserId) return 'self';
  if (_friendsCache.friends.some(f => f.id === uid))  return 'friend';
  if (_friendsCache.incoming.some(f => f.id === uid)) return 'incoming';
  if (_friendsCache.outgoing.some(f => f.id === uid)) return 'outgoing';
  return 'none';
}

/* Carte wishlist en LECTURE SEULE (profil public d'un autre joueur). */
function _publicWishCardHTML(w){
  const tint = w.tint || '#ffffff'; const rgb = hexToRgb(tint) || '255,255,255';
  return `<div class="pp-wish-card" style="--tint:${tint};--tint-rgb:${rgb}">
      <div class="pp-wish-cover" role="button" tabindex="0" aria-label="${w.title}" onclick="showPage('detail','${w.id}')">
        <img src="${av(w.cover)}" alt="${w.title}" loading="lazy" onerror="this.style.opacity=0">
        <span class="pp-wish-status ${w.status}">${getStatusLabel(w)}</span>
      </div>
      <div class="pp-wish-info">
        <div class="pp-wish-name">${w.title}</div>
        <div class="pp-wish-meta">${w.year} · ${priceHTML(w, { size:'sm' })}</div>
      </div>
    </div>`;
}

/* Ouvre le profil PUBLIC d'un autre joueur = PAGE complète (comme la nôtre). */
let _viewProfileId = null;
function openUserProfile(uid){
  if (!uid) return;
  _viewProfileId = (_currentUserId && uid === _currentUserId) ? null : uid;
  closeAuthModal();
  showPage('profile');               // showPage → buildProfilePage() → mode public
}
function _backFromPublic(){ _viewProfileId = null; showPage('profile'); }

/* Rendu de la page profil PUBLIC d'un autre joueur, même disposition que la
   nôtre : bannière, avatar, identité, stats, trophées (les SIENS), wishlist
   (la SIENNE). Lecture seule + bouton d'action ami (selon la relation). */
async function buildPublicProfilePage(viewId){
  const host = $('page-profile'); if(!host) return;
  host.innerHTML = `<section class="pp"><div class="pp-loading">…</div></section>`;
  let prof = null;
  try { const r = await GLG_AUTH.getPublicProfile?.(viewId); if (r && r.ok) prof = r.profile; } catch(e){}
  if (!prof){
    const all = [..._friendsCache.friends, ..._friendsCache.incoming, ..._friendsCache.outgoing];
    const f = all.find(x => x.id === viewId) || {};
    prof = { id:viewId, username:f.username||'-', avatar_url:f.avatar_url||null, banner_url:null, bio:null, created_at:null, friend_count:null, wishlist:[], achievements:[] };
  }
  if (!_friendsCache.friends.length && !_friendsCache.incoming.length && !_friendsCache.outgoing.length){
    try { const fr = await GLG_AUTH.friendsList?.(); if (fr && fr.ok) _friendsCache = { friends:fr.friends||[], incoming:fr.incoming||[], outgoing:fr.outgoing||[] }; } catch(e){}
  }
  const name = prof.username || '-';
  const since = prof.created_at ? new Date(prof.created_at).toLocaleDateString(LANG_LOCALE[LANG]||'en-US',{year:'numeric',month:'long'}) : '-';
  const banner = safeMediaUrl(prof.banner_url);
  const keys = new Set(Array.isArray(prof.achievements) ? prof.achievements : []);
  const d = computeTrophies(keys);                       // trophées calculés depuis SES déblocages
  const wids = Array.isArray(prof.wishlist) ? prof.wishlist : [];
  const wWorks = (typeof ALL_WORKS!=='undefined'?ALL_WORKS:[]).filter(w => wids.includes(w.id) && !isMatureHidden(w));
  // v4 : vitrine « Favoris » + compteur de jeux (public_profile étendu ;
  // les deux restent vides/null tant que schema.sql n'a pas été rejoué).
  const favIds = Array.isArray(prof.favorites) ? prof.favorites.filter(x => typeof x === 'string') : [];
  const favWorks = (typeof ALL_WORKS!=='undefined'?ALL_WORKS:[]).filter(w => favIds.includes(w.id) && !isMatureHidden(w));
  const isFounder = (typeof _isVerified === 'function') && _isVerified(name);
  const gamesCount = isFounder ? ALL_WORKS.length : (prof.games_count != null ? prof.games_count : null);
  const rel = await _userRelation(viewId);
  let action = '';
  if (rel === 'friend')        action = `<button class="btn btn-primary up-action" onclick="openChatWith('${escHtml(viewId)}')">${_chT('navLabel')}</button>
                                         <button class="btn btn-outline up-action up-action--remove" data-act="remove">${_upt('remove')}</button>`;
  else if (rel === 'incoming') action = `<button class="btn btn-primary up-action" data-act="accept">${_upt('accept')}</button>`;
  else if (rel === 'outgoing') action = `<span class="up-pending">${_upt('pending')}</span>`;
  else if (rel === 'self')     action = '';
  else                         action = `<button class="btn btn-primary up-action" data-act="add">${_upt('add')}</button>`;

  host.innerHTML = `
    <section class="pp pp--public pp--v4">
      <div class="pp-banner ${banner?'has-img':''}" ${banner?`style="background-image:url(${banner})"`:''}><div class="pp-banner-scrim"></div></div>
      <div class="pp-head">
        <span class="pp-avatar pp-avatar--ro ${GLG_PRESENCE.isOnline(viewId) ? 'pp-avatar--online' : ''}">${_userAvatarHTML(prof)}</span>
        <div class="pp-id">
          <h1 class="pp-name">${escHtml(name)}${_verifiedTag(name,'glg-verified--lg')}</h1>
          ${GLG_PRESENCE.isOnline(viewId) ? `<span class="pp-online"><i aria-hidden="true"></i>${_ft('online')}</span>` : ''}
          <div class="pp-badges">
            ${isFounder ? `<span class="pp-badge pp-badge--founder">★ ${_upt('founder')}</span>` : ''}
            <span class="pp-badge pp-badge--muted">${_ppt('statMember')} ${since}</span>
          </div>
          ${prof.bio ? `<p class="pp-bio">${escHtml(prof.bio)}</p>` : `<p class="pp-bio pp-bio--empty">${_upt('noBio')}</p>`}
        </div>
        <div class="pp-actions pp-actions--public">
          <div class="pp-level-ring" title="${_tt('level')}" aria-label="${_tt('level')}"><span class="pp-ring-track" style="--pct:${d.nextPct}"><span class="pp-ring-in"><b>${d.level}</b><small>${_tt('levelShort')}</small></span></span></div>
          <div class="pp-actions-btns">
            <button class="btn btn-outline pp-back-btn" onclick="_backFromPublic()">‹ ${_ft('title')}</button>
            ${action}
          </div>
        </div>
      </div>
      <!-- v4 : 5 compteurs (jeux, trophées, amis, évaluations, souhaits) -
           parité visuelle avec le profil perso, mieux que Steam. -->
      <div class="pp-stats pp-stats--public">
        <div class="pp-stat"><b>${gamesCount != null ? gamesCount : '-'}</b><span>${_ppt('statGames')}</span></div>
        <button class="pp-stat" onclick="glgScrollToEl('.pp-trophy-section')"><b>${d.earnedTotal}</b><span>${_tt('section')}</span></button>
        <div class="pp-stat"><b>${prof.friend_count!=null?prof.friend_count:'-'}</b><span>${_ft('statFriends')}</span></div>
        <button class="pp-stat" onclick="glgScrollToEl('.pp-rev-section')"><b id="pp-stat-reviews">0</b><span>${_rvt('section')}</span></button>
        <button class="pp-stat" onclick="glgScrollToEl('.pp-wish-grid')"><b>${wWorks.length}</b><span>${_wt('title')}</span></button>
      </div>
      <div class="pp-section" id="pp-rewards" hidden></div>
      ${(() => { /* numérotation continue même quand « Jeux récents » est absent */
        let _pi = 0; const nidx = () => `${String(++_pi).padStart(2, '0')} /`;
        const rg = _recentGamesHTML(prof.recent_games);
        return `
      <div class="pp-cols">
        <div class="pp-main">
          ${favWorks.length ? `
          <div class="pp-section pp-favs-section">
            <div class="pp-sec-head"><h2 class="pp-sec-title" data-idx="${nidx()}">${_upt('favShowcase')}</h2><span class="pp-sec-count">${favWorks.length}</span></div>
            <div class="pp-favs-grid">${favWorks.map(_publicWishCardHTML).join('')}</div>
          </div>` : ''}
          ${rg ? `
          <div class="pp-section pp-recent-section">
            <div class="pp-sec-head"><h2 class="pp-sec-title" data-idx="${nidx()}">${_rgt('title')}</h2></div>
            ${rg}
          </div>` : ''}
          <div class="pp-section pp-trophy-section">
            <div class="pp-sec-head"><h2 class="pp-sec-title" data-idx="${nidx()}">${_tt('section')}</h2></div>
            <div class="pp-trophy-showcase">${trophyShowcaseHTML(d)}</div>
            <div class="pp-tg-grid">${d.byGame.length ? d.byGame.map(g => trophyGameCardHTML(g).replace(/ onclick="[^"]*"/,'')).join('') : `<p class="pp-friends-note">${_tt('none')}</p>`}</div>
          </div>
          <div class="pp-section pp-rev-section">
            <div class="pp-sec-head"><h2 class="pp-sec-title" data-idx="${nidx()}">${_rvt('section')}</h2><span class="pp-sec-count" id="pp-rev-count">0</span></div>
            <div id="pp-reviews-body" class="pp-reviews-body"><div class="dp-rev-loading">···</div></div>
          </div>
          <div class="pp-section pp-shots-section">
            <div class="pp-sec-head"><h2 class="pp-sec-title" data-idx="${nidx()}">${_sht('title')}</h2><span class="pp-sec-count" id="pp-shots-count"></span></div>
            <div id="pp-shots-body" class="pp-shots-grid"><p class="pp-friends-note">···</p></div>
          </div>
        </div>
        <aside class="pp-rail">
          <div class="pp-section">
            <div class="pp-sec-head"><h2 class="pp-sec-title">${_wt('title')}</h2><span class="pp-sec-count">${wWorks.length}</span></div>
            <div class="pp-wish-grid">${wWorks.length ? wWorks.map(_publicWishCardHTML).join('') : `<p class="pp-friends-note">${_wt('empty')}</p>`}</div>
          </div>
        </aside>
      </div>`;
      })()}
    </section>
    ${footerHTML()}`;
  _renderProfileReviews(viewId);
  _renderRewards(viewId);
  _initProfileShots(viewId, { readOnly: true });

  // FIX : câbler TOUS les boutons d'action (avant : querySelector ne prenait
  // que le 1er .up-action, pour un ami, c'était « Message » (onclick inline)
  // et « Retirer des amis » restait MORT).
  host.querySelectorAll('.up-action[data-act]').forEach(actBtn => actBtn.addEventListener('click', async () => {
    const act = actBtn.dataset.act;
    if (act === 'remove' && !confirm(_upt('removeQ'))) return;
    actBtn.disabled = true;
    try {
      if (act === 'add')      await GLG_AUTH.friendRequest?.(viewId);
      else if (act === 'accept') await GLG_AUTH.friendRespond?.(viewId, true);
      else if (act === 'remove') await GLG_AUTH.friendRemove?.(viewId);
    } catch(e){}
    await refreshFriendsUI();
    buildPublicProfilePage(viewId);
  }));
  setTimeout(initReveal, 60);
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
  none:     { fr:'Aucun trophée débloqué pour l’instant, tes jeux rempliront cet espace.', en:'No trophies unlocked yet, your games will fill this in.', es:'Aún no hay trofeos, tus juegos los llenarán.', de:'Noch keine Trophäen, deine Spiele füllen das.', it:'Ancora nessun trofeo, i tuoi giochi lo riempiranno.', ar:'لا جوائز بعد، ألعابك ستملؤها.', zh:'尚无奖杯、你的游戏将填满这里。', ja:'まだトロフィーなし、ゲームが埋めていきます。', ru:'Пока нет трофеев, ваши игры их заполнят.', pl:'Brak trofeów, twoje gry je wypełnią.' },
  view:     { fr:'Voir les trophées', en:'View trophies', es:'Ver trofeos', de:'Trophäen ansehen', it:'Vedi trofei', ar:'عرض الجوائز', zh:'查看奖杯', ja:'トロフィーを見る', ru:'Смотреть трофеи', pl:'Zobacz trofea' },
  levelShort:{ fr:'NIV.', en:'LVL', es:'NIV.', de:'STUFE', it:'LIV.', ar:'مستوى', zh:'等级', ja:'LV', ru:'УР.', pl:'POZ.' },
  rarUltra: { fr:'Ultra rare', en:'Ultra rare', es:'Ultra raro', de:'Ultraselten', it:'Ultra raro', ar:'نادر جدًا', zh:'极为稀有', ja:'ウルトラレア', ru:'Ультраредкий', pl:'Ultrarzadkie' },
  rarVery:  { fr:'Très rare', en:'Very rare', es:'Muy raro', de:'Sehr selten', it:'Molto raro', ar:'نادر للغاية', zh:'非常稀有', ja:'とてもレア', ru:'Очень редкий', pl:'Bardzo rzadkie' },
  rarRare:  { fr:'Rare', en:'Rare', es:'Raro', de:'Selten', it:'Raro', ar:'نادر', zh:'稀有', ja:'レア', ru:'Редкий', pl:'Rzadkie' },
  rarCommon:{ fr:'Courant', en:'Common', es:'Común', de:'Häufig', it:'Comune', ar:'شائع', zh:'常见', ja:'コモン', ru:'Обычный', pl:'Częste' },
};
function _tt(k){ const m=_TROPHY_T[k]; return m ? (m[LANG]||m.en) : k; }
const _TROPHY_SVG = '<svg class="trophy-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 4h8v4a4 4 0 0 1-8 0V4z" fill="currentColor"/><path d="M8 5H5v1a3 3 0 0 0 3 3M16 5h3v1a3 3 0 0 1-3 3" stroke="currentColor" stroke-width="1.5"/><path d="M12 12v3" stroke="currentColor" stroke-width="1.5"/><path d="M9.5 20l.6-3h3.8l.6 3z" fill="currentColor"/><path d="M8.5 20h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
const _TIER_POINTS = { bronze:15, silver:30, gold:90, platinum:180 };
const _TIER_ORDER  = { platinum:0, gold:1, silver:2, bronze:3 };
let _achKeys = new Set();

function computeTrophies(keys){
  const K = keys || _achKeys;                          // set de clés (par défaut : l'utilisateur courant)
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
        ? (nonPlat.length > 0 && nonPlat.every(x => K.has(gid + '/' + x.code)))
        : K.has(gid + '/' + tr.code);
      if (isEarned){ earned[tr.tier]++; tiers[tr.tier]++; gEarned++; points += _TIER_POINTS[tr.tier]; }
    });
    byGame.push({ gid, work, total:list.length, earned:gEarned, tiers,
      pct: list.length ? Math.round(gEarned / list.length * 100) : 0 });
  });
  byGame.sort((a,b) => b.pct - a.pct || b.earned - a.earned);
  const total = counts.bronze+counts.silver+counts.gold+counts.platinum;
  const earnedTotal = earned.bronze+earned.silver+earned.gold+earned.platinum;
  const level = Math.max(1, Math.floor(Math.sqrt(points / 45)) + (earned.platinum));
  // Progression vers le niveau suivant (le badge d'en-tête l'affiche, comme PSN)
  const _lvlBase = 45 * Math.pow(Math.max(0, level - earned.platinum), 2);
  const _lvlNext = 45 * Math.pow(Math.max(1, level + 1 - earned.platinum), 2);
  const nextPct  = Math.max(0, Math.min(100, Math.round((points - _lvlBase) / Math.max(1, _lvlNext - _lvlBase) * 100)));
  return { counts, earned, total, earnedTotal, points, level, byGame, nextPct };
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
  // Badge de niveau dans l'en-tête d'identité (geste PSN reconnaissable)
  const chip = document.getElementById('pp-level-chip');
  if (chip) chip.innerHTML = `<span class="pp-lc-cup">${_TROPHY_SVG}</span><b>${_tt('levelShort')} ${d.level}</b><span class="pp-lc-bar"><i style="width:${d.nextPct}%"></i></span>`;
  // Anneau de niveau façon Steam (plaque d'identité, progression conique)
  const ring = document.getElementById('pp-level-ring');
  if (ring) ring.innerHTML = `<span class="pp-ring-track" style="--pct:${d.nextPct}"><span class="pp-ring-in"><b>${d.level}</b><small>${_tt('levelShort')}</small></span></span>`;
  _renderRewards();                                  // couche Points GLG (serveur)
}

/* ── Section "Évaluations" du profil (perso + public), via user_reviews ── */
async function _renderProfileReviews(uid){
  const body = document.getElementById('pp-reviews-body'); if (!body) return;
  if (!window.GLG_AUTH?.isConfigured?.() || !uid){
    body.innerHTML = `<p class="pp-friends-note">${_rvt('profNone')}</p>`; return;
  }
  let rows = [];
  try { const r = await GLG_AUTH.userReviews(uid); rows = r.reviews || []; } catch(e){}
  const items = rows
    .map(r => ({ r, work: (typeof ALL_WORKS!=='undefined'?ALL_WORKS:[]).find(w => w.id === r.work_id) }))
    .filter(x => x.work && !isMatureHidden(x.work));
  const cnt  = document.getElementById('pp-rev-count');    if (cnt)  cnt.textContent  = items.length;
  const stat = document.getElementById('pp-stat-reviews'); if (stat) stat.textContent = items.length;
  if (!items.length){ body.innerHTML = `<p class="pp-friends-note">${_rvt('profNone')}</p>`; return; }
  body.innerHTML = items.map(({ r, work }) => {
    const tint = work.tint || '#ffffff';
    return `<button class="pp-rev-row" style="--tint:${tint}" onclick="showPage('detail','${work.id}')" aria-label="${work.title}">
        <span class="pp-rev-cover"><img src="${av(work.cover)}" alt="" loading="lazy" onerror="this.style.opacity=0"></span>
        <span class="pp-rev-main">
          <span class="pp-rev-title"><b>${work.title}</b>${_rvStarsHTML(r.rating)}</span>
          ${r.body ? `<span class="pp-rev-excerpt">${escHtml(r.body)}</span>` : ''}
          <span class="pp-rev-date">${_notifRelTime(new Date(r.updated_at).getTime())}</span>
        </span>
      </button>`;
  }).join('');
}

/* ── Flux "Activité récente" (profil perso), merge client trophées/amis/évals,
     ZÉRO table supplémentaire : tout vient de données déjà horodatées. ── */
async function _renderProfileActivity(){
  const body = document.getElementById('pp-activity-body'); if (!body) return;
  const events = [];
  try {
    if (window.GLG_AUTH?.isConfigured?.()){
      const a = await GLG_AUTH.getAchievements();
      (a.rows || []).forEach(row => {
        const slash = String(row.ach_key).indexOf('/');
        const gid = String(row.ach_key).slice(0, slash), code = String(row.ach_key).slice(slash + 1);
        const work = (typeof ALL_WORKS!=='undefined'?ALL_WORKS:[]).find(w => w.id === gid);
        if (!work || isMatureHidden(work)) return;
        const def = (typeof TROPHIES!=='undefined' && TROPHIES[gid] || []).find(t => t.code === code);
        const txt = def ? _trophyTxt(def) : { t: code };
        events.push({ ts: new Date(row.unlocked_at).getTime(), icon: 'trophy', tier: def?.tier || 'bronze',
          html: `${escHtml(txt.t)} <span class="pp-act-dim">${work.title}</span>` });
      });
      (_friendsCache.friends || []).forEach(f => {
        if (!f.since) return;
        events.push({ ts: new Date(f.since).getTime(), icon: 'friend',
          html: `${_ppt('actFriend')} <b>${escHtml(f.username || '?')}</b>` });
      });
      const user = await GLG_AUTH.getUser();
      if (user){
        const rv = await GLG_AUTH.userReviews(user.id);
        (rv.reviews || []).forEach(r => {
          const w = (typeof ALL_WORKS!=='undefined'?ALL_WORKS:[]).find(x => x.id === r.work_id);
          if (!w || isMatureHidden(w)) return;
          events.push({ ts: new Date(r.updated_at).getTime(), icon: 'review',
            html: `${_ppt('actReview')} <b>${w.title}</b> ${_rvStarsHTML(r.rating)}` });
        });
      }
    }
  } catch(e){}
  events.sort((a, b) => b.ts - a.ts);
  const top = events.filter(ev => !isNaN(ev.ts)).slice(0, 8);
  if (!top.length){ body.innerHTML = `<p class="pp-friends-note">${_ppt('actEmpty')}</p>`; return; }
  body.innerHTML = top.map(ev => `
    <div class="pp-act-row">
      <span class="pp-act-ico${ev.tier ? ' pp-tier--' + ev.tier : ''}">${ev.icon === 'trophy' ? _TROPHY_SVG : (ev.icon === 'friend' ? _NOTIF_ICONS.friend : _RV_STAR)}</span>
      <span class="pp-act-text">${ev.html}</span>
      <span class="pp-act-time">${_notifRelTime(ev.ts)}</span>
    </div>`).join('');
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
        <span class="tl-rar" data-rar="${gid}/${tr.code}"></span>
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
  _fillTrophyRarity(gid, m);
}
function _trophyTxt(tr){ return tr[LANG] || tr.en || { t:tr.code, d:'' }; }

/* ── Rareté (signature PSN), remplie en asynchrone, cache par session.
     Cold start honnête : sous 5 joueurs, on n'affiche RIEN (pas de "100%"). ── */
const _rarityCache = new Map();
async function _fillTrophyRarity(gid, root){
  if (!window.GLG_AUTH?.isConfigured?.() || !window.GLG_AUTH?.trophyRarity) return;
  let rows = _rarityCache.get(gid);
  if (!rows){
    try { const r = await GLG_AUTH.trophyRarity(gid); if (r.ok){ rows = r.rows; _rarityCache.set(gid, rows); } } catch(e){}
  }
  if (!rows || !rows.length) return;
  const players = Number(rows[0]?.players || 0);
  if (players < 5) return;
  const byKey = {}; rows.forEach(r => { byKey[r.ach_key] = r; });
  root.querySelectorAll('.tl-rar').forEach(el => {
    const r = byKey[el.dataset.rar]; if (!r) return;
    const pct = Number(r.pct);
    const label = pct < 5 ? _tt('rarUltra') : pct < 10 ? _tt('rarVery') : pct < 20 ? _tt('rarRare') : _tt('rarCommon');
    const pctTxt = pct.toLocaleString(LANG_LOCALE[LANG] || 'en', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    el.innerHTML = `<b>${pctTxt}%</b><span>${label}</span>`;
  });
}

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

/* ── Badges de fonctionnalités (buybox) : manette / cloud / sous-titres.
   SVG stroke maison (1.4px, style cloche/loupe), jamais d'emoji. ── */
const _CAPS_T = {
  controller:{ fr:'Manette', en:'Controller', es:'Mando', de:'Controller', it:'Controller', ar:'يد التحكم', zh:'手柄', ja:'コントローラー', ru:'Геймпад', pl:'Kontroler' },
  cloud:     { fr:'Sauvegarde cloud', en:'Cloud saves', es:'Guardado en la nube', de:'Cloud-Speicher', it:'Salvataggi cloud', ar:'حفظ سحابي', zh:'云存档', ja:'クラウドセーブ', ru:'Облачные сохранения', pl:'Zapisy w chmurze' },
  subs:      { fr:'Sous-titres', en:'Subtitles', es:'Subtítulos', de:'Untertitel', it:'Sottotitoli', ar:'ترجمات', zh:'字幕', ja:'字幕', ru:'Субтитры', pl:'Napisy' },
};
const _CAPS_SVG = {
  controller:'<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M6.2 6h7.6c1.9 0 3.4 1.5 3.6 3.4l.4 3.6a1.8 1.8 0 0 1-3.1 1.4l-1.6-1.7H6.9l-1.6 1.7a1.8 1.8 0 0 1-3.1-1.4l.4-3.6C2.8 7.5 4.3 6 6.2 6Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M6.8 9.2v2.4M5.6 10.4H8M13.2 9.6h.01M14.8 11h.01" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  cloud:'<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M6 14.5a3.5 3.5 0 0 1-.5-7A4.5 4.5 0 0 1 14.2 8a3.3 3.3 0 0 1-.7 6.5H6Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  subs:'<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="2.5" y="4.5" width="15" height="11" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M5 11.5h6M13 11.5h2M5 8.5h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
};
function _capsT(k){ const m=_CAPS_T[k]; return m ? (m[LANG]||m.en) : k; }
function _dpCapsHTML(item){
  const caps = (typeof WORK_CAPS!=='undefined' && (WORK_CAPS[item.id] || WORK_CAPS.default)) || null;
  if (!caps) return '';
  const chips = ['controller','cloud','subs'].filter(k => caps[k])
    .map(k => `<span class="dp-cap"><span class="dp-cap-ico">${_CAPS_SVG[k]}</span>${_capsT(k)}</span>`).join('');
  return chips ? `<div class="dp-caps">${chips}</div>` : '';
}

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
  // Règle studio : les listes de trophées ne sont révélées qu'à la sortie.
  if (item.status !== 'available') return '';
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
   ÉVALUATIONS DES JOUEURS (style Steam), DB-backed, RLS + RPC rate-limitées
   ──────────────────────────────────────────
   Écriture réservée aux œuvres SORTIES (même règle que la notif "sorti") :
   tant qu'un titre est "coming soon", la section montre la preuve sociale
   réelle ("N joueurs l'attendent" via wishlist_count), jamais d'étoiles
   vides mortes. Tout contenu utilisateur passe par escHtml (XSS).
══════════════════════════════════════════ */
const _REV_T = {
  section:  { fr:'Évaluations des joueurs', en:'Player reviews', es:'Reseñas de jugadores', de:'Spielerbewertungen', it:'Recensioni dei giocatori', ar:'تقييمات اللاعبين', zh:'玩家评价', ja:'プレイヤーレビュー', ru:'Отзывы игроков', pl:'Recenzje graczy' },
  countOne: { fr:'1 évaluation', en:'1 review', es:'1 reseña', de:'1 Bewertung', it:'1 recensione', ar:'تقييم واحد', zh:'1 条评价', ja:'1件のレビュー', ru:'1 отзыв', pl:'1 recenzja' },
  countMany:{ fr:'%s évaluations', en:'%s reviews', es:'%s reseñas', de:'%s Bewertungen', it:'%s recensioni', ar:'%s تقييمات', zh:'%s 条评价', ja:'%s件のレビュー', ru:'%s отзывов', pl:'%s recenzji' },
  delQ:     { fr:'Supprimer ton évaluation ?', en:'Delete your review?', es:'¿Eliminar tu reseña?', de:'Deine Bewertung löschen?', it:'Eliminare la tua recensione?', ar:'حذف تقييمك؟', zh:'删除你的评价？', ja:'レビューを削除しますか？', ru:'Удалить ваш отзыв?', pl:'Usunąć swoją recenzję?' },
  waiting:  { fr:'%s joueurs l’attendent déjà', en:'%s players are already waiting', es:'%s jugadores ya lo esperan', de:'%s Spieler warten bereits darauf', it:'%s giocatori lo stanno già aspettando', ar:'%s لاعبًا ينتظرونه بالفعل', zh:'已有 %s 名玩家在等待', ja:'すでに%s人のプレイヤーが待っています', ru:'%s игроков уже ждут', pl:'%s graczy już czeka' },
  opens:    { fr:'Les évaluations ouvriront à la sortie du titre.', en:'Reviews open when the title releases.', es:'Las reseñas se abrirán con el lanzamiento.', de:'Bewertungen öffnen zum Release.', it:'Le recensioni apriranno all’uscita.', ar:'تُفتح التقييمات عند صدور العنوان.', zh:'评价将在游戏发售后开放。', ja:'レビューはタイトル発売時に開放されます。', ru:'Отзывы откроются после выхода.', pl:'Recenzje otworzą się w dniu premiery.' },
  beFirst:  { fr:'Aucune évaluation pour l’instant, la tienne sera la première.', en:'No reviews yet, yours will be the first.', es:'Aún no hay reseñas: la tuya será la primera.', de:'Noch keine Bewertungen, deine wird die erste sein.', it:'Ancora nessuna recensione: la tua sarà la prima.', ar:'لا توجد تقييمات بعد، سيكون تقييمك الأول.', zh:'暂无评价、你的将是第一条。', ja:'まだレビューはありません。あなたが最初です。', ru:'Пока нет отзывов, ваш будет первым.', pl:'Brak recenzji, twoja będzie pierwsza.' },
  write:    { fr:'Rédiger une évaluation', en:'Write a review', es:'Escribir una reseña', de:'Bewertung schreiben', it:'Scrivi una recensione', ar:'اكتب تقييمًا', zh:'撰写评价', ja:'レビューを書く', ru:'Написать отзыв', pl:'Napisz recenzję' },
  edit:     { fr:'Modifier mon évaluation', en:'Edit my review', es:'Editar mi reseña', de:'Meine Bewertung bearbeiten', it:'Modifica la mia recensione', ar:'تعديل تقييمي', zh:'编辑我的评价', ja:'レビューを編集', ru:'Изменить мой отзыв', pl:'Edytuj moją recenzję' },
  ph:       { fr:'Partage ton expérience (facultatif)…', en:'Share your experience (optional)…', es:'Comparte tu experiencia (opcional)…', de:'Teile deine Erfahrung (optional)…', it:'Condividi la tua esperienza (facoltativo)…', ar:'شارك تجربتك (اختياري)…', zh:'分享你的体验（可选）…', ja:'体験を共有しよう（任意）…', ru:'Поделитесь впечатлениями (необязательно)…', pl:'Podziel się wrażeniami (opcjonalnie)…' },
  publish:  { fr:'Publier', en:'Publish', es:'Publicar', de:'Veröffentlichen', it:'Pubblica', ar:'نشر', zh:'发布', ja:'投稿', ru:'Опубликовать', pl:'Opublikuj' },
  update:   { fr:'Mettre à jour', en:'Update', es:'Actualizar', de:'Aktualisieren', it:'Aggiorna', ar:'تحديث', zh:'更新', ja:'更新', ru:'Обновить', pl:'Aktualizuj' },
  del:      { fr:'Supprimer', en:'Delete', es:'Eliminar', de:'Löschen', it:'Elimina', ar:'حذف', zh:'删除', ja:'削除', ru:'Удалить', pl:'Usuń' },
  signin:   { fr:'Connecte-toi pour évaluer ce titre.', en:'Sign in to review this title.', es:'Inicia sesión para reseñar este título.', de:'Melde dich an, um zu bewerten.', it:'Accedi per recensire questo titolo.', ar:'سجّل الدخول لتقييم هذا العنوان.', zh:'登录后即可评价该作品。', ja:'ログインしてレビューを書こう。', ru:'Войдите, чтобы оставить отзыв.', pl:'Zaloguj się, aby ocenić.' },
  report:   { fr:'Signaler', en:'Report', es:'Denunciar', de:'Melden', it:'Segnala', ar:'إبلاغ', zh:'举报', ja:'報告', ru:'Пожаловаться', pl:'Zgłoś' },
  reported: { fr:'Signalé', en:'Reported', es:'Denunciada', de:'Gemeldet', it:'Segnalata', ar:'تم الإبلاغ', zh:'已举报', ja:'報告済み', ru:'Отправлено', pl:'Zgłoszono' },
  needStars:{ fr:'Choisis une note (1-5 étoiles).', en:'Pick a rating (1-5 stars).', es:'Elige una nota (1-5 estrellas).', de:'Wähle eine Wertung (1-5 Sterne).', it:'Scegli un voto (1-5 stelle).', ar:'اختر تقييمًا (1-5 نجوم).', zh:'请选择评分（1-5 星）。', ja:'評価を選んでください（星1〜5）。', ru:'Выберите оценку (1-5 звёзд).', pl:'Wybierz ocenę (1-5 gwiazdek).' },
  err:      { fr:'Impossible d’enregistrer, réessaie.', en:'Could not save, try again.', es:'No se pudo guardar; inténtalo de nuevo.', de:'Speichern fehlgeschlagen, bitte erneut.', it:'Salvataggio non riuscito: riprova.', ar:'تعذّر الحفظ، حاول مجددًا.', zh:'保存失败，请重试。', ja:'保存できませんでした。再試行してください。', ru:'Не удалось сохранить, попробуйте ещё раз.', pl:'Nie udało się zapisać, spróbuj ponownie.' },
  limit:    { fr:'Limite atteinte, réessaie dans 24 h.', en:'Limit reached, try again in 24 h.', es:'Límite alcanzado; vuelve en 24 h.', de:'Limit erreicht, in 24 h erneut.', it:'Limite raggiunto: riprova tra 24 h.', ar:'بلغت الحد، حاول بعد 24 ساعة.', zh:'已达上限，请 24 小时后再试。', ja:'上限に達しました。24時間後に再試行してください。', ru:'Лимит исчерпан, повторите через 24 ч.', pl:'Limit osiągnięty, spróbuj za 24 h.' },
  profNone: { fr:'Aucune évaluation rédigée pour l’instant.', en:'No reviews written yet.', es:'Aún no ha escrito reseñas.', de:'Noch keine Bewertungen verfasst.', it:'Nessuna recensione scritta.', ar:'لم تُكتب أي تقييمات بعد.', zh:'尚未撰写任何评价。', ja:'まだレビューはありません。', ru:'Отзывы ещё не написаны.', pl:'Nie napisano jeszcze recenzji.' },
};
function _rvt(k){ const m = _REV_T[k]; return m ? (m[LANG] || m.en) : k; }

/* Une œuvre est "sortie" ? (même règle que GLG_NOTIF.sync) */
function _workIsReleased(item){
  const st = String(item?.status || '').toLowerCase();
  return /avail|released|out|sorti|disponible(?!.*bient)/.test(st) && !/coming|bient/.test(st);
}

/* Étoile maison : trait fin monochrome (jamais d'emoji ni de jaune) */
const _RV_STAR = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8 9.9 5.9l4.4.5-3.3 3 .9 4.4L8 11.5 4.1 13.8l.9-4.4-3.3-3 4.4-.5Z" fill="currentColor" stroke="currentColor" stroke-width=".6" stroke-linejoin="round"/></svg>';
function _rvStarsHTML(n){
  let out = '';
  for (let i = 1; i <= 5; i++) out += `<span class="rv-star${i <= n ? ' on' : ''}">${_RV_STAR}</span>`;
  return `<span class="rv-stars" aria-label="${n}/5">${out}</span>`;
}

let _dpRevState = { workId: null, rating: 0, mine: null };

function dpReviewsShellHTML(item){
  return `<div class="dp-reviews reveal" id="dp-reviews">
      <div class="dp-sec-label">${_rvt('section')}</div>
      <div class="dp-rev-body" id="dp-rev-body"><div class="dp-rev-loading">···</div></div>
    </div>`;
}

async function _loadDpReviews(item){
  const body = document.getElementById('dp-rev-body'); if (!body) return;
  _dpRevState = { workId: item.id, rating: 0, mine: null };
  const released = _workIsReleased(item);
  if (!window.GLG_AUTH?.isConfigured?.()){
    body.innerHTML = `<p class="dp-rev-note">${released ? _rvt('beFirst') : _rvt('opens')}</p>`;
    return;
  }
  try {
    const [sum, list, user, mine] = await Promise.all([
      GLG_AUTH.reviewSummary(item.id),
      GLG_AUTH.workReviews(item.id, 10, 0),
      GLG_AUTH.getUser(),
      GLG_AUTH.myReview(item.id),
    ]);
    let waiting = 0;
    if (!released){
      const w = await GLG_AUTH.wishlistCount(item.id);
      waiting = w?.count || 0;
    }
    if (_dpRevState.workId !== item.id) return;   // on a navigué ailleurs entre-temps
    _dpRevState.mine = mine?.review || null;
    _dpRevState.rating = _dpRevState.mine?.rating || 0;
    _renderDpReviews(item, { sum, reviews: list.reviews || [], user, released, waiting });
  } catch(e){
    body.innerHTML = `<p class="dp-rev-note">${_rvt('opens')}</p>`;
  }
}

function _renderDpReviews(item, { sum, reviews, user, released, waiting }){
  const body = document.getElementById('dp-rev-body'); if (!body) return;
  const cnt = sum?.count || 0;
  let html = '';

  /* : Agrégat : moyenne + histogramme hairlines (à la Steam), */
  if (cnt > 0){
    const histo = sum.histo || {};
    const max = Math.max(1, ...Object.values(histo).map(Number));
    const bars = [5,4,3,2,1].map(n => {
      const v = Number(histo[String(n)] || 0);
      return `<div class="rv-h-row"><span class="rv-h-n">${n}</span><span class="rv-h-bar"><span style="width:${Math.round(v / max * 100)}%"></span></span><span class="rv-h-v">${v}</span></div>`;
    }).join('');
    html += `<div class="rv-agg">
        <div class="rv-agg-main">
          <span class="rv-agg-avg">${(sum.avg ?? 0).toFixed(1)}</span>
          ${_rvStarsHTML(Math.round(sum.avg || 0))}
          <span class="rv-agg-count">${cnt === 1 ? _rvt('countOne') : _rvt('countMany').replace('%s', cnt)}</span>
        </div>
        <div class="rv-histo">${bars}</div>
      </div>`;
    /* Fact buybox : ★ 4,3 · 27 (lien vers la section) */
    const fact = document.getElementById('dp-fact-rev');
    if (fact){ fact.style.display = ''; const b = fact.querySelector('b'); if (b) b.textContent = `★ ${(sum.avg ?? 0).toFixed(1)} · ${cnt}`; }
  }

  /* : Avant la sortie : preuve sociale réelle, pas d'étoiles mortes, */
  if (!released){
    if (waiting >= 10) html += `<p class="rv-waiting">${_rvt('waiting').replace('%s', waiting)}</p>`;
    html += `<p class="dp-rev-note">${_rvt('opens')}</p>`;
  } else if (user){
    /* : Formulaire (upsert : 1 avis par joueur, éditable), */
    const mine = _dpRevState.mine;
    html += `<div class="rv-form">
        <div class="rv-form-title">${mine ? _rvt('edit') : _rvt('write')}</div>
        <div class="rv-form-stars" id="rv-form-stars">${[1,2,3,4,5].map(n =>
          `<button type="button" class="rv-star-btn${n <= _dpRevState.rating ? ' on' : ''}" data-n="${n}" onclick="_dpRevSetStar(${n})" aria-label="${n}/5">${_RV_STAR}</button>`).join('')}</div>
        <textarea class="rv-form-body" id="rv-form-body" maxlength="1200" rows="4" placeholder="${_rvt('ph')}">${escHtml(mine?.body || '')}</textarea>
        <div class="rv-form-foot">
          ${mine ? `<button type="button" class="rv-del" onclick="_dpRevDelete(this)">${_rvt('del')}</button>` : '<span></span>'}
          <button type="button" class="btn btn-primary rv-submit" onclick="_dpRevSubmit()">${mine ? _rvt('update') : _rvt('publish')}</button>
        </div>
        <p class="rv-err" id="rv-form-err" hidden></p>
      </div>`;
  } else {
    html += `<p class="dp-rev-note rv-signin"><button class="rv-signin-btn" onclick="openAuthModal()">${_rvt('signin')}</button></p>`;
  }

  /* : Liste (pseudo cliquable → profil public, comme Steam), */
  if (reviews.length){
    html += `<div class="rv-list">` + reviews.map(r => {
      const own = user && r.user_id === user.id;
      const uid = escHtml(r.user_id);
      return `<div class="rv-item${own ? ' rv-item--own' : ''}">
          <button class="rv-ava" onclick="openUserProfile('${uid}')" aria-label="${escHtml(r.username || '?')}">${_userAvatarHTML(r)}</button>
          <div class="rv-main">
            <div class="rv-head">
              <button class="rv-name" onclick="openUserProfile('${uid}')">${escHtml(r.username || '?')}</button>
              ${_rvStarsHTML(r.rating)}
              <span class="rv-date">${_notifRelTime(new Date(r.updated_at).getTime())}</span>
              ${user && !own ? `<button class="rv-report" onclick="_dpRevReport('${uid}','${escHtml(item.id)}',this)">${_rvt('report')}</button>` : ''}
            </div>
            ${r.body ? `<p class="rv-body">${escHtml(r.body)}</p>` : ''}
          </div>
        </div>`;
    }).join('') + `</div>`;
  } else if (released && cnt === 0){
    html += `<p class="dp-rev-note">${_rvt('beFirst')}</p>`;
  }

  body.innerHTML = html;
}

function _dpRevSetStar(n){
  _dpRevState.rating = n;
  document.querySelectorAll('#rv-form-stars .rv-star-btn').forEach(b =>
    b.classList.toggle('on', Number(b.dataset.n) <= n));
}
async function _dpRevSubmit(){
  const err = document.getElementById('rv-form-err');
  const btn = document.querySelector('.rv-submit');
  if (!_dpRevState.rating){ if (err){ err.textContent = _rvt('needStars'); err.hidden = false; } return; }
  if (btn) btn.disabled = true;
  const bodyTxt = document.getElementById('rv-form-body')?.value || '';
  const res = await GLG_AUTH.upsertReview(_dpRevState.workId, _dpRevState.rating, bodyTxt);
  if (btn) btn.disabled = false;
  if (!res.ok){
    if (err){ err.textContent = res.code === 'limit' ? _rvt('limit') : _rvt('err'); err.hidden = false; }
    return;
  }
  const item = ALL_WORKS.find(w => w.id === _dpRevState.workId);
  if (item) _loadDpReviews(item);
}
async function _dpRevDelete(btn){
  if (!confirm(_rvt('delQ'))) return;          // action destructive → confirmation (comme les captures)
  if (btn) btn.disabled = true;
  const res = await GLG_AUTH.deleteReview(_dpRevState.workId);
  if (res.ok){
    const item = ALL_WORKS.find(w => w.id === _dpRevState.workId);
    if (item) _loadDpReviews(item);
  } else if (btn) { btn.disabled = false; }
}
async function _dpRevReport(uid, wid, btn){
  const res = await GLG_AUTH.reportReview(uid, wid);
  if (btn){ btn.textContent = _rvt('reported'); btn.disabled = true; }
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
        <span class="pp-link-id"><span class="pp-link-name">${pf.name}</span>${val?`<span class="pp-link-handle">${escHtml(val)}</span>`:`<span class="pp-link-muted">-</span>`}</span>
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
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) { _showErr('bpick-err', _at('imgType')); return; }
    _showErr('bpick-err', '…'); document.getElementById('bpick-err')?.classList.add('ok');
    try {
      // Bannière paysage redimensionnée + compressée → data-URL (fonctionne sans bucket)
      const dataUrl = await _processImageFile(file, { maxW: 1600, maxH: 520, square: false, quality: 0.82 });
      const r = await GLG_AUTH.updateProfile({ banner_url: dataUrl });
      document.getElementById('bpick-err')?.classList.remove('ok');
      if(r.ok){ closeAuthModal(); await refreshAccountUI(); buildProfilePage(); return; }
      const map = { notConfigured:_at('notConfigured'), notAuth:_at('notConfigured') };
      _showErr('bpick-err', map[r.code] || _at('fail'));
    } catch (err) {
      document.getElementById('bpick-err')?.classList.remove('ok');
      _showErr('bpick-err', err.message === 'size' ? _at('imgSize') : err.message === 'type' ? _at('imgType') : _at('fail'));
    } finally { e.target.value = ''; }
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
   SHOWCASE MOSAIC (Home page, "WHAT WE CREATE")
   A CSS grid mosaic of varying-size cells.
   Each cell = one game/film cover + quote overlay.
   White glow border. Hover lifts + reveals caption.

   TO CUSTOMISE: edit the 'picks' array below.
   Replace item.cover with your own image paths.
   Recommended dimensions: 16:9 or 4:3 landscape.
══════════════════════════════════════════ */
/* ══════════════════════════════════════════════════
   PUZZLE STRIPS, "WHAT WE CREATE" (Home page)

   Three full-width diagonal strips showing placeholder images.
   Each strip has a large quote overlapping the image.
   These are NOT game cards, no onclick to game pages.
   When you have real key art, replace the src in `strips[]`.

   Image recommendations: 16:9 or wider landscape photos.
   ══════════════════════════════════════════════════ */




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
    const displayPrice = getPriceNow(item);
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
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}
/* Sanitize an image/media URL before it lands in an HTML attribute or CSS url().
   Accepts only data:image/*, https:, blob: and same-origin relative paths, and
   rejects any character that could break out of an attribute or url() context.
   User-controlled avatar_url / banner_url MUST pass through this. */
function safeMediaUrl(u) {
  if (typeof u !== 'string') return '';
  const s = u.trim();
  if (!s) return '';
  if (/["'()<>\\`\s]/.test(s)) return '';            // no breakout chars
  if (/^data:image\/(png|jpe?g|webp|gif|avif|svg\+xml);/i.test(s)) return s;
  if (/^https:\/\//i.test(s)) return s;
  if (/^blob:/i.test(s)) return s;
  if (/^(?:\/(?!\/)|\.\/|assets\/)/i.test(s)) return s; // relative site asset
  return '';
}
function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
}


/* ════════════════════════════════════════════════════════
   ★  GLG, CINEMATIC ANIMATION SYSTEM v2
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
   The background is never touched, no conflict with the
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

  // Keep cache in sync with page navigation, zero DOM queries inside the rAF loop
  document.addEventListener('glg:page-changed', e => updateContentRef(e.detail?.name || ''));
  document.addEventListener('glg:site-built',   () => updateContentRef('home'));

  // Idle-stopping rAF: only runs while there's motion to settle, then halts.
  // (Previously it ran every frame forever : even off-home, for nothing.)
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
/* ── 6. Master animation init ───────────────────────── */
function initAnimations() {
  initHeroParallax();
  initScrollParallax();
  initMagneticCTAs();
  // initGLGCursor(), removed: using default browser cursor per design spec
  initHeroCanvas();
}

/* ════════════════════════════════════════════════════════
   GLG ENHANCEMENT BLOCK v3, new functions
   ════════════════════════════════════════════════════════ */

/* Custom GLG cursor removed by design (default browser cursor). The old
   initGLGCursor() : with an unbounded rAF ring-follow loop, is deleted. */

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
      ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`; // monochrome (was gold, brand coherence)
      ctx.fill();
    }
    _canvasRafId = requestAnimationFrame(draw);
  }

  function canvasStart() { if (!_canvasActive) { _canvasActive = true; _canvasRafId = requestAnimationFrame(draw); } }
  function canvasStop()  { _canvasActive = false; cancelAnimationFrame(_canvasRafId); ctx.clearRect(0, 0, W, H); }

  // Le canvas ne doit tourner QUE si (page home active) ET (héro à l'écran).
  // Avant : il dessinait 75 particules/frame même le héro scrollé hors vue
  // → jank en bas de l'accueil. L'IO coupe la boucle dès que le héro sort.
  let _heroOnScreen = true;
  const _syncCanvas = () => {
    const homeActive = document.getElementById('page-home')?.classList.contains('active');
    (homeActive && _heroOnScreen) ? canvasStart() : canvasStop();
  };
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => {
      _heroOnScreen = es[0]?.isIntersecting !== false;
      _syncCanvas();
    }, { rootMargin: '80px 0px' }).observe(hero);
  }
  document.addEventListener('glg:page-changed', _syncCanvas);

  resize();
  initParticles();
  _syncCanvas(); // état initial (home active au chargement)

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
  fr: 'Univers créatifs', en: 'Creative Universes', es: 'Universos Creativos',
  de: ',  Kreative Welten',  ar: ',  العوالم الإبداعية', zh: ',  创意世界',
  ja: ',  クリエイティブな世界', ru: ',  Творческие Миры', pl: ',  Kreatywne Światy',
  it: 'Universi Creativi',
};

const _STUDIO_FOOTERS = {
  en: 'Video games · Est. 2026',
  fr: 'Jeux vidéo · Est. 2026',
  es: 'Videojuegos · Est. 2026',
  de: 'Videospiele · Gegr. 2026',
  ar: 'ألعاب فيديو · تأسس 2026',
  zh: '电子游戏 · 成立于 2026',
  ja: 'ビデオゲーム · 設立 2026',
  ru: 'Видеоигры · Осн. 2026',
  pl: 'Gry wideo · Zał. 2026',
  it: 'Videogiochi · Fond. 2026',
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

  // ── Deep-link d'œuvre partageable (?work=<id>), SEO + étape launcher ──
  // /?work=lumbra ouvre directement la fiche (après le choix de
  // langue si nécessaire). Consommé par selectLang une fois le site construit.
  // Les anciens liens #detail/<id> restent honorés.
  try {
    const qsWork = new URLSearchParams(location.search).get('work');
    let wid = qsWork || (location.hash.startsWith('#detail/') ? location.hash.slice(8) : null);
    if (wid === 'hush') wid = 'lumbra'; // ancien nom de LUMBRA : liens partagés/indexés honorés
    if (wid && ALL_WORKS.some(w => w.id === wid)) window._bootWorkId = wid;
  } catch (e) {}

  // ── Pages profondes au boot (#works, #about…, raccourcis PWA du manifest,
  // liens partagés). Consommé par selectLang après initSite, comme _bootWorkId.
  try {
    const h = (location.hash || '').replace(/^#/, '');
    if (!window._bootWorkId && ['works', 'library', 'about', 'contact', 'profile', 'settings', 'chat', 'press', 'journal', 'legal', 'privacy', 'terms'].includes(h)) {
      window._bootPage = h;
    }
  } catch (e) {}


  // ── URL de langue partageable / SEO (?lang=xx) ─────────────────────────
  // Une URL comme /?lang=fr entre directement dans la langue demandée
  // (équivaut à un clic sur le drapeau : selectLang gère loader + failsafes).
  // C'est aussi ce que les balises hreflang annoncent aux moteurs.
  try {
    const qLang = new URLSearchParams(location.search).get('lang');
    if (qLang && LANG_GATE.some(l => l.code === qLang)) {
      selectLang(qLang);
    } else {
      // ── Retour d'un visiteur : la cérémonie du rideau n'a lieu qu'une fois.
      // Le choix mémorisé entre directement (le drapeau du header rouvre le
      // rideau à tout moment). Le loader assure la transition, comme ?lang=.
      const saved = localStorage.getItem('glg_lang');
      if (saved && LANG_GATE.some(l => l.code === saved)) {
        const g = $('lang-gate'); if (g) g.style.display = 'none';
        selectLang(saved);
      }
    }
  } catch (e) {}
});

/* ══════════════════════════════════════════
   PWA, service worker (étape launcher)
   ──────────────────────────────────────────
   Production uniquement (jamais en localhost/dev, jamais dans Tauri où
   l'updater natif prendra le relais). Nouvelle version détectée → notif
   maison via la cloche (jamais un confirm() navigateur). L'activation
   se fait depuis Options → Mises à jour (bouton "Vérifier").
══════════════════════════════════════════ */
/* Le site tourne-t-il DANS le launcher de bureau ? Deux signaux :
   l'injection Tauri (pages locales) OU l'user-agent posé par la fenêtre
   du launcher (contenu distant, voir launcher/src-tauri/tauri.conf.json). */
const IS_TAURI = '__TAURI_INTERNALS__' in window || /GLGLauncher/i.test(navigator.userAgent);

/* ── Direction A : la nav se pose transparente sur le héros et ne
   s'assombrit qu'après le premier écran (jamais de saut de layout). ── */
(() => {
  const nav = document.getElementById('nav');
  if (!nav) return;
  let last = -1;
  const upd = () => {
    const on = window.scrollY > 40;
    if (on !== last) { nav.classList.toggle('nav-scrolled', on); last = on; }
  };
  window.addEventListener('scroll', upd, { passive: true });
  upd();
})();

/* ── Défilement vers une section, fiable partout ─────────────────────────
   Quand Lenis pilote la page, un scrollIntoView natif se fait manger par sa
   boucle : on passe par lui. Sinon, scroll natif doux. Dans les deux cas un
   décalage garde le titre visé SOUS la nav fixe (et la sous-nav collante). */
function glgScrollToEl(target, extra) {
  const el = typeof target === 'string'
    ? (document.querySelector(target) || document.getElementById(target.replace(/^#/, '')))
    : target;
  if (!el) return;
  const off = -(76 + (extra || 0));
  const L = window.glgLenis || window._lenis;
  if (L && typeof L.scrollTo === 'function') {
    try { L.scrollTo(el, { offset: off }); return; } catch (e) {}
  }
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + off, behavior: 'smooth' });
}

/* Les projets scellés répondent : le sceau luit et murmure une ligne.
   Aucune navigation (rien à montrer, c'est le principe), mais plus jamais
   de carte muette sous le clic. */
function glgSecretWhisper(el) {
  if (!el || el.classList.contains('sec-hush')) return;
  el.classList.add('sec-hush');
  try { window.GLG_SFX?.play('hover'); } catch (e) {}
  setTimeout(() => el.classList.remove('sec-hush'), 1700);
}

/* ── LA LANTERNE (fiche LUMBRA) ──────────────────────────────────────────
   « N'aie pas peur du noir » : la jaquette repose dans l'obscurité et le
   pointeur la révèle, halo doux qui suit la souris. Sans pointeur (tactile,
   ou avant le premier survol), la lumière dérive lentement toute seule.
   reduced-motion : halo immobile au centre, aucune animation. */
function _glgLantern() {
  const hero = document.querySelector('#page-detail .dp-hero--lantern');
  if (!hero || hero._lanternOn) return;
  const lan = hero.querySelector('.dp-lantern');
  if (!lan) return;
  hero._lanternOn = true;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let tx = 50, ty = 42, cx = 50, cy = 42, drifting = true, t0 = performance.now(), raf = 0;
  const step = now => {
    if (!document.body.contains(hero)) { cancelAnimationFrame(raf); return; }
    if (drifting) {
      const t = (now - t0) / 1000;
      tx = 50 + 17 * Math.sin(t * .38);
      ty = 42 + 11 * Math.sin(t * .27 + 1.7);
    }
    cx += (tx - cx) * .075; cy += (ty - cy) * .075;
    hero.style.setProperty('--lx', cx.toFixed(2) + '%');
    hero.style.setProperty('--ly', cy.toFixed(2) + '%');
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  if (window.matchMedia('(hover: hover)').matches) {
    hero.addEventListener('pointermove', e => {
      const r = hero.getBoundingClientRect();
      drifting = false;
      tx = (e.clientX - r.left) / r.width * 100;
      ty = (e.clientY - r.top) / r.height * 100;
    });
    hero.addEventListener('pointerleave', () => { drifting = true; t0 = performance.now(); });
  }
}

/* CTA launcher permanent : descend à la section téléchargement (web).
   Dans l'application, le bouton n'a pas de sens : retiré au boot.
   Robuste : si on n'est pas sur l'accueil, on y va d'abord, puis on attend
   que la section soit réellement posée (la transition de page remettait le
   scroll à zéro APRÈS l'ancien setTimeout : bouton perçu comme mort). */
function _glgGetLauncher() {
  const go = () => {
    let tries = 0;
    const wait = () => {
      const el = document.getElementById('home-launcher');
      if (el && el.offsetHeight > 40) glgScrollToEl(el);
      else if (++tries < 30) setTimeout(wait, 120);
    };
    wait();
  };
  const home = document.getElementById('page-home');
  if (home && home.classList.contains('active')) go();
  else { showPage('home'); setTimeout(go, 640); }
}
if (IS_TAURI) { document.getElementById('nav-getl')?.remove(); }

// ── Launcher : préférences INSTANTANÉES (miroir localStorage), thème sans
// flash + page de démarrage (Options → Launcher), appliquées avant le profil.
if (IS_TAURI) { try {
  const L = JSON.parse(localStorage.getItem('glg_lprefs') || 'null');
  if (L) {
    const legacy = { carbone:{on:true,c1:'#9ea3b1',c2:'#787e8c',dir:'v',force:7},
                     minuit:{on:true,c1:'#4060d6',c2:'#182660',dir:'v',force:9},
                     braise:{on:true,c1:'#d6662c',c2:'#782a10',dir:'v',force:7} };
    const amb = L.amb || legacy[L.theme];
    if (amb) _glgAmbApply(amb);
    if (L.density === 'compact') document.documentElement.classList.add('glg-compact');
    if (!window._bootWorkId && !window._bootPage && L.start && L.start !== 'home') window._bootPage = L.start;
  }
} catch (e) {} }

/* ── BARRE DE TITRE CUSTOM (launcher ≥ 1.0.2, fenêtre sans décorations) ──
   Comme Discord : titre « GEEKLEARN GAMES » CENTRÉ, zone de drag pleine
   largeur, contrôles fenêtre à droite. Ne se rend QUE si l'IPC fenêtre est
   exposé (window.__TAURI__ ← capability remote-window-controls du shell) :
   les anciens launchers à fenêtre décorée (≤ 1.0.1) ne changent pas. */
const _TB_T = {
  min:  { fr:'Réduire', en:'Minimize', es:'Minimizar', de:'Minimieren', it:'Riduci', ar:'تصغير', zh:'最小化', ja:'最小化', ru:'Свернуть', pl:'Minimalizuj' },
  max:  { fr:'Agrandir / restaurer', en:'Maximize / restore', es:'Maximizar / restaurar', de:'Maximieren / wiederherstellen', it:'Ingrandisci / ripristina', ar:'تكبير / استعادة', zh:'最大化 / 还原', ja:'最大化 / 元に戻す', ru:'Развернуть / восстановить', pl:'Maksymalizuj / przywróć' },
  close:{ fr:'Fermer', en:'Close', es:'Cerrar', de:'Schließen', it:'Chiudi', ar:'إغلاق', zh:'关闭', ja:'閉じる', ru:'Закрыть', pl:'Zamknij' },
};
const _tbT = k => (_TB_T[k] && (_TB_T[k][LANG] || _TB_T[k].en)) || '';
function _refreshTitlebarLabels() {
  const bar = document.getElementById('glg-titlebar'); if (!bar) return;
  const set = (id, k) => { const b = bar.querySelector('#' + id); if (b) { b.setAttribute('aria-label', _tbT(k)); b.title = _tbT(k); } };
  set('tb-min', 'min'); set('tb-max', 'max'); set('tb-close', 'close');
}
/* Marque de la barre de titre (Options → Launcher) : logo seul (défaut)
   ou logo + wordmark, appliqué live, persisté prefs.launcher.brand. */
function _refreshTitlebarBrand(mode) {
  const t = document.querySelector('#glg-titlebar .tb-title'); if (!t) return;
  const img = '<img src="assets/img/brand/glg-mark.png" alt="GEEKLEARN GAMES" onerror="this.outerHTML=\'<span>GEEKLEARN GAMES</span>\'">';
  t.innerHTML = mode === 'logo-name' ? img + '<span class="tb-name">GEEKLEARN GAMES</span>' : img;
}
function _initTauriTitlebar() {
  try {
    const W = window.__TAURI__ && window.__TAURI__.window;
    if (!IS_TAURI || !W || document.getElementById('glg-titlebar')) return;
    const win = W.getCurrentWindow ? W.getCurrentWindow() : (W.getCurrent ? W.getCurrent() : null);
    if (!win) return;
    const bar = document.createElement('div');
    bar.id = 'glg-titlebar';
    bar.innerHTML = `
      <div class="tb-drag" data-tauri-drag-region></div>
      <span class="tb-title" aria-hidden="true">
        <img src="assets/img/brand/glg-mark.png" alt="GEEKLEARN GAMES" onerror="this.outerHTML='<span>GEEKLEARN GAMES</span>'">
      </span>
      <div class="tb-controls">
        <button class="tb-btn" id="tb-min">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true"><path d="M1 5.5h9" stroke="currentColor" stroke-width="1.1"/></svg>
        </button>
        <button class="tb-btn" id="tb-max">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true"><rect x="1.5" y="1.5" width="8" height="8" stroke="currentColor" stroke-width="1.1"/></svg>
        </button>
        <button class="tb-btn tb-btn--close" id="tb-close">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true"><path d="M1.5 1.5l8 8m0-8l-8 8" stroke="currentColor" stroke-width="1.1"/></svg>
        </button>
      </div>`;
    document.body.prepend(bar);
    document.documentElement.classList.add('glg-frameless');
    _refreshTitlebarLabels();
    bar.querySelector('#tb-min').addEventListener('click', () => { try { win.minimize(); } catch (e) {} });
    bar.querySelector('#tb-max').addEventListener('click', () => { try { win.toggleMaximize(); } catch (e) {} });
    bar.querySelector('#tb-close').addEventListener('click', () => { try { win.close(); } catch (e) {} });
  } catch (e) {}
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _initTauriTitlebar);
else _initTauriTitlebar();

/* ── DEEP-LINKS glg:// REÇUS PAR LE LAUNCHER ────────────────────────────
   Le shell Tauri (launcher/src-tauri/src/lib.rs) évalue
   __GLG_DEEPLINK('glg://play/<id>') quand l'OS lui transmet le protocole
   (clic « Jouer » sur le SITE web → launcher). Le launcher « confirme » :
   il ouvre la bibliothèque avec le jeu demandé sélectionné. */
function _applyLaunchAction(act) {
  if (!act || !ALL_WORKS.some(w => w.id === act.id)) return;
  _libSelected = act.id;
  showPage('library');
}
window.__GLG_DEEPLINK = function (url) {
  try {
    const m = String(url || '').match(/^glg:\/\/(play|install)\/([a-z0-9-]+)/i);
    if (!m) return;
    const act = { verb: m[1].toLowerCase(), id: m[2].toLowerCase() };
    if (!_siteBuilt) { window._pendingLaunch = act; return; } // gate pas encore franchi → consommé après selectLang
    _applyLaunchAction(act);
  } catch (e) {}
};
const _SWUP_T = {
  t:{ fr:'Mise à jour disponible', en:'Update available', es:'Actualización disponible', de:'Update verfügbar', it:'Aggiornamento disponibile', ar:'تحديث متوفر', zh:'有可用更新', ja:'アップデートがあります', ru:'Доступно обновление', pl:'Dostępna aktualizacja' },
  b:{ fr:'Options → Mises à jour pour l’installer.', en:'Options → Updates to install it.', es:'Opciones → Actualizaciones para instalarla.', de:'Optionen → Updates zum Installieren.', it:'Opzioni → Aggiornamenti per installarlo.', ar:'الخيارات ← التحديثات لتثبيته.', zh:'前往 选项 → 更新 安装。', ja:'オプション→アップデートからインストール。', ru:'Настройки → Обновления, чтобы установить.', pl:'Opcje → Aktualizacje, aby zainstalować.' },
};
if ('serviceWorker' in navigator && !IS_TAURI && /(^|\.)geeklearngames\.com$/.test(location.hostname)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      window._glgSwReg = reg;
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            try {
              GLG_NOTIF.add({ id:'swup:' + Date.now(), type:'system', icon:'system',
                title:(_SWUP_T.t[LANG] || _SWUP_T.t.en), body:(_SWUP_T.b[LANG] || _SWUP_T.b.en) });
              _refreshNotifBell();
            } catch(e){}
          }
        });
      });
    }).catch(() => {});
  });
}

/* ══ MOTION GLG, la couche « sensation » ══
   1) Entrée de page chorégraphiée : à chaque navigation, la page active
      rejoue une montée douce (sous le voile de cross-fade existant) et
      ses grilles connues cascadent (§87, nth-child plafonné).
   2) Tilt 3D des cards au pointeur (œuvres + bibliothèque), souris
      uniquement, coupé en mouvement réduit, transform inline nettoyée
      à la sortie pour rendre la main au :hover CSS. */
if (!window._glgMotionHook) {
  window._glgMotionHook = true;
  document.addEventListener('glg:page-changed', () => {
    const pg = document.querySelector('.page.active'); if (!pg) return;
    pg.classList.remove('page-in');
    void pg.offsetWidth;                       // redémarre l'animation
    pg.classList.add('page-in');
    clearTimeout(pg._pinT);
    pg._pinT = setTimeout(() => pg.classList.remove('page-in'), 800);
  });
}
/* Tilt 3D retiré en v126 (Direction A) : un cadre ne bouge jamais. */

/* ══ MODE MANETTE (tâche #60) ══
   Navigation SPATIALE au gamepad, partout : croix/stick = focus dirigé
   (score distance + pénalité transverse), A = valider, B = retour
   (palette → visionneuse → fiche → accueil), LB/RB = sections du header,
   gâchettes = défilement (via Lenis, jamais window.scrollTo : désync).
   Barre d'aide en bas tant qu'une manette est connectée. Aucun coût
   manette débranchée : la boucle rAF ne tourne qu'entre connected et
   disconnected. */
const _PAD_T = {
  ok:      { fr:'Valider', en:'Select', es:'Aceptar', de:'Auswählen', it:'Conferma', ar:'تأكيد', zh:'确认', ja:'決定', ru:'Выбрать', pl:'Wybierz' },
  back:    { fr:'Retour', en:'Back', es:'Atrás', de:'Zurück', it:'Indietro', ar:'رجوع', zh:'返回', ja:'戻る', ru:'Назад', pl:'Wstecz' },
  sections:{ fr:'Sections', en:'Sections', es:'Secciones', de:'Bereiche', it:'Sezioni', ar:'الأقسام', zh:'栏目', ja:'セクション', ru:'Разделы', pl:'Sekcje' },
  on:      { fr:'Manette connectée, navigation au pad active', en:'Controller connected, pad navigation on', es:'Mando conectado, navegación con mando activa', de:'Controller verbunden, Pad-Navigation aktiv', it:'Controller collegato, navigazione col pad attiva', ar:'تم توصيل يد التحكم، التنقل باليد مفعّل', zh:'手柄已连接、手柄导航已开启', ja:'コントローラー接続、パッド操作が有効', ru:'Геймпад подключён, навигация активна', pl:'Pad podłączony, nawigacja padem włączona' },
};
const _pdt = k => (_PAD_T[k] && (_PAD_T[k][LANG] || _PAD_T[k].en)) || '';
function _padBar(show) {
  let bar = document.getElementById('glg-padbar');
  if (!show) { bar?.remove(); return; }
  if (bar) return;
  bar = document.createElement('div');
  bar.id = 'glg-padbar';
  bar.setAttribute('aria-hidden', 'true');
  bar.innerHTML = `
    <span><i class="pb-btn pb-a">A</i>${_pdt('ok')}</span>
    <span><i class="pb-btn pb-b">B</i>${_pdt('back')}</span>
    <span><i class="pb-btn pb-w">LB</i><i class="pb-btn pb-w">RB</i>${_pdt('sections')}</span>`;
  document.body.appendChild(bar);
}
const _GLG_PAD = (() => {
  let raf = 0, on = false, focusEl = null;
  let prevB = [], lastDir = '', lastMove = 0, firstAt = 0;
  const AXIS = .55, REP0 = 320, REP = 130;
  function focusables() {
    const page = document.querySelector('.page.active') || document.body;
    const scopes = [page, document.getElementById('nav'), document.getElementById('glg-cmdk'),
                    document.getElementById('glg-mediaview'), document.getElementById('glg-titlebar')].filter(Boolean);
    const sel = 'button, a[href], input, select, textarea, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])';
    const out = [];
    scopes.forEach(s => s.querySelectorAll(sel).forEach(el => {
      if (el.disabled || el.getAttribute('aria-hidden') === 'true') return;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      if (r.bottom < -420 || r.top > innerHeight + 420) return;    // fenêtre ± écran
      out.push({ el, r });
    }));
    return out;
  }
  function setFocus(el) {
    if (focusEl && focusEl !== el) focusEl.classList.remove('glg-pad-focus');
    focusEl = el; if (!el) return;
    el.classList.add('glg-pad-focus');
    try { el.focus({ preventScroll: true }); } catch (e) {}
    const r = el.getBoundingClientRect();
    if (r.top < 96 || r.bottom > innerHeight - 96) {
      const L = window.glgLenis || window._lenis;
      const y = Math.max(0, (window.scrollY || 0) + r.top - innerHeight / 2 + r.height / 2);
      if (L && L.scrollTo) L.scrollTo(y, { duration: .45 }); else window.scrollTo({ top: y, behavior: 'smooth' });
    }
  }
  function move(dir) {
    const cands = focusables(); if (!cands.length) return;
    if (!focusEl || !document.contains(focusEl)) {
      setFocus((cands.find(c => c.r.top > 90 && c.r.top < innerHeight) || cands[0]).el);
      return;
    }
    const fr = focusEl.getBoundingClientRect();
    const fx = fr.left + fr.width / 2, fy = fr.top + fr.height / 2;
    let best = null, bestScore = Infinity;
    cands.forEach(c => {
      if (c.el === focusEl) return;
      const dx = (c.r.left + c.r.width / 2) - fx, dy = (c.r.top + c.r.height / 2) - fy;
      let main, cross;
      if (dir === 'left') { if (dx > -4) return; main = -dx; cross = Math.abs(dy); }
      else if (dir === 'right') { if (dx < 4) return; main = dx; cross = Math.abs(dy); }
      else if (dir === 'up') { if (dy > -4) return; main = -dy; cross = Math.abs(dx); }
      else { if (dy < 4) return; main = dy; cross = Math.abs(dx); }
      const score = main + cross * 2.2;
      if (score < bestScore) { bestScore = score; best = c.el; }
    });
    if (best) setFocus(best);
  }
  function press() {
    const el = focusEl && document.contains(focusEl) ? focusEl : null;
    if (!el) { move('down'); return; }
    el.classList.add('glg-pad-press');
    setTimeout(() => el.classList.remove('glg-pad-press'), 160);
    el.click();
  }
  function back() {
    if (document.getElementById('glg-cmdk')) { _ckClose(); return; }
    const mv = document.querySelector('#glg-mediaview .mv-close'); if (mv) { mv.click(); return; }
    const bk = document.querySelector('.page.active .dp-back--min, .page.active .pp-back-btn');
    if (bk) { bk.click(); return; }
    showPage('home');
  }
  function cycle(dirn) {
    const links = Array.from(document.querySelectorAll('#nav .nav-link')).filter(b => b.offsetParent);
    if (!links.length) return;
    const cur = Math.max(0, links.findIndex(b => b.classList.contains('active')));
    links[(cur + dirn + links.length) % links.length].click();
  }
  function loop() {
    if (!on) return;
    raf = requestAnimationFrame(loop);
    const gp = (navigator.getGamepads ? Array.from(navigator.getGamepads()) : []).find(g => g && g.connected);
    if (!gp) return;
    const b = gp.buttons.map(x => !!x.pressed);
    const edge = i => b[i] && !prevB[i];
    let dir = '';
    if (b[12] || gp.axes[1] < -AXIS) dir = 'up';
    else if (b[13] || gp.axes[1] > AXIS) dir = 'down';
    else if (b[14] || gp.axes[0] < -AXIS) dir = 'left';
    else if (b[15] || gp.axes[0] > AXIS) dir = 'right';
    const now = performance.now();
    if (dir) {
      if (dir !== lastDir) { move(dir); firstAt = now; lastMove = now; }
      else if (now - lastMove >= (lastMove === firstAt ? REP0 : REP)) { move(dir); lastMove = now; }
      lastDir = dir;
    } else lastDir = '';
    if (edge(0)) press();
    if (edge(1)) back();
    if (edge(4)) cycle(-1);
    if (edge(5)) cycle(1);
    const tr = ((gp.buttons[7] && gp.buttons[7].value) || 0) - ((gp.buttons[6] && gp.buttons[6].value) || 0);
    if (Math.abs(tr) > .12) {
      const L = window.glgLenis || window._lenis;
      const y = Math.max(0, (L && L.scroll != null ? L.scroll : window.scrollY) + tr * 30);
      if (L && L.scrollTo) L.scrollTo(y, { immediate: true });
    }
    prevB = b;
  }
  function start() {
    if (on) return;
    on = true;
    document.body.classList.add('glg-pad-on');
    _padBar(true);
    prevB = []; lastDir = '';
    raf = requestAnimationFrame(loop);
  }
  function stop() {
    if (!on) return;
    on = false;
    cancelAnimationFrame(raf);
    document.body.classList.remove('glg-pad-on');
    if (focusEl) focusEl.classList.remove('glg-pad-focus');
    focusEl = null;
    _padBar(false);
  }
  window.addEventListener('gamepadconnected', start);
  window.addEventListener('gamepaddisconnected', () => {
    const any = (navigator.getGamepads ? Array.from(navigator.getGamepads()) : []).some(g => g && g.connected);
    if (!any) stop();
  });
  return { start, stop, move, setFocus, get on() { return on; } };
})();

/* ══ PALETTE UNIVERSELLE Ctrl+K (tâche #62) ══
   Pages (labels du header, donc déjà localisés) + œuvres (age-gating
   respecté) + actions. Clavier complet : ↑↓ naviguer, ↵ ouvrir, Échap
   fermer. Recherche insensible aux accents. */
const _CK_T = {
  ph:     { fr:'Rechercher une page, une œuvre, une action…', en:'Search a page, a work, an action…', es:'Busca una página, una obra, una acción…', de:'Seite, Werk oder Aktion suchen…', it:'Cerca una pagina, un\u2019opera, un\u2019azione…', ar:'ابحث عن صفحة أو عمل أو إجراء…', zh:'搜索页面、作品或操作……', ja:'ページ・作品・アクションを検索…', ru:'Найдите страницу, работу или действие…', pl:'Szukaj strony, dzieła lub akcji…' },
  pages:  { fr:'Pages', en:'Pages', es:'Páginas', de:'Seiten', it:'Pagine', ar:'الصفحات', zh:'页面', ja:'ページ', ru:'Страницы', pl:'Strony' },
  works:  { fr:'Œuvres', en:'Works', es:'Obras', de:'Werke', it:'Opere', ar:'الأعمال', zh:'作品', ja:'作品', ru:'Работы', pl:'Dzieła' },
  actions:{ fr:'Actions', en:'Actions', es:'Acciones', de:'Aktionen', it:'Azioni', ar:'إجراءات', zh:'操作', ja:'アクション', ru:'Действия', pl:'Akcje' },
  aSearch:{ fr:'Rechercher un titre', en:'Search a title', es:'Buscar un título', de:'Titel suchen', it:'Cerca un titolo', ar:'ابحث عن عنوان', zh:'搜索标题', ja:'タイトルを検索', ru:'Найти игру', pl:'Szukaj tytułu' },
  aLang:  { fr:'Changer de langue', en:'Change language', es:'Cambiar idioma', de:'Sprache ändern', it:'Cambia lingua', ar:'تغيير اللغة', zh:'更改语言', ja:'言語を変更', ru:'Сменить язык', pl:'Zmień język' },
  aDl:    { fr:'Télécharger le launcher', en:'Download the launcher', es:'Descargar el launcher', de:'Launcher herunterladen', it:'Scarica il launcher', ar:'تنزيل المشغّل', zh:'下载启动器', ja:'ランチャーをダウンロード', ru:'Скачать лаунчер', pl:'Pobierz launcher' },
  empty:  { fr:'Aucun résultat', en:'No results', es:'Sin resultados', de:'Keine Ergebnisse', it:'Nessun risultato', ar:'لا نتائج', zh:'无结果', ja:'該当なし', ru:'Ничего не найдено', pl:'Brak wyników' },
  hOpen:  { fr:'Ouvrir', en:'Open', es:'Abrir', de:'Öffnen', it:'Apri', ar:'فتح', zh:'打开', ja:'開く', ru:'Открыть', pl:'Otwórz' },
  hNav:   { fr:'Naviguer', en:'Navigate', es:'Navegar', de:'Navigieren', it:'Naviga', ar:'تنقّل', zh:'切换', ja:'移動', ru:'Навигация', pl:'Nawiguj' },
  hClose: { fr:'Fermer', en:'Close', es:'Cerrar', de:'Schließen', it:'Chiudi', ar:'إغلاق', zh:'关闭', ja:'閉じる', ru:'Закрыть', pl:'Zamknij' },
};
const _ckt = k => (_CK_T[k] && (_CK_T[k][LANG] || _CK_T[k].en)) || '';
const _ckNorm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
let _ckSel = 0, _ckList = [];
function _ckItems() {
  const items = [];
  document.querySelectorAll('#nav .nav-link').forEach(b => {
    const lbl = b.textContent.trim();
    if (!lbl || !b.offsetParent) return;       // masqué (web ≠ launcher) : absent
    items.push({ g: 'pages', label: lbl, act: () => b.click() });
  });
  (typeof ALL_WORKS !== 'undefined' ? ALL_WORKS : []).filter(w => !isMatureHidden(w)).forEach(w => {
    items.push({ g: 'works', label: w.title, sub: getCatLabel(w) + ' · ' + w.year, img: av(w.cover), act: () => showPage('detail', w.id) });
  });
  items.push({ g: 'actions', label: _ckt('aSearch'), act: () => { try { openSearch(); } catch (e) {} } });
  items.push({ g: 'actions', label: _ckt('aLang'), act: () => { try { reopenLangGate(); } catch (e) {} } });
  if (!IS_TAURI) items.push({ g: 'actions', label: _ckt('aDl'), act: () => showPage('launcher') });
  return items;
}
function _ckClose() { document.getElementById('glg-cmdk')?.remove(); }
function _ckRender(q) {
  const list = document.getElementById('ck-list'); if (!list) return;
  const nq = _ckNorm(q);
  const scored = _ckItems().map(it => {
    if (!nq) return { it, s: 1 };
    const L = _ckNorm(it.label), S = _ckNorm(it.sub || '');
    const s = L.startsWith(nq) ? 0 : L.indexOf(nq) >= 0 ? 1 : S.indexOf(nq) >= 0 ? 2 : -1;
    return { it, s };
  }).filter(x => x.s >= 0);
  scored.sort((x, y) => x.s - y.s);
  _ckList = scored.slice(0, 24).map(x => x.it);
  _ckSel = 0;
  if (!_ckList.length) { list.innerHTML = `<p class="ck-none">${_ckt('empty')}</p>`; return; }
  let html = '', lastG = '';
  _ckList.forEach((it, i) => {
    if (it.g !== lastG) { html += `<div class="ck-group">${_ckt(it.g)}</div>`; lastG = it.g; }
    html += `<button class="ck-item ${i === 0 ? 'sel' : ''}" data-i="${i}" type="button">
      ${it.img ? `<img src="${it.img}" alt="" loading="lazy">` : ''}
      <b>${escHtml(it.label)}</b>${it.sub ? `<small>${escHtml(it.sub)}</small>` : ''}</button>`;
  });
  list.innerHTML = html;
  list.querySelectorAll('.ck-item').forEach(b => b.addEventListener('click', () => _ckGo(+b.dataset.i)));
}
function _ckGo(i) {
  const it = _ckList[i]; if (!it) return;
  _ckClose();
  try { it.act(); } catch (e) {}
}
function _ckMove(d) {
  if (!_ckList.length) return;
  _ckSel = (_ckSel + d + _ckList.length) % _ckList.length;
  const items = document.querySelectorAll('#ck-list .ck-item');
  items.forEach((b, i) => b.classList.toggle('sel', i === _ckSel));
  items[_ckSel]?.scrollIntoView({ block: 'nearest' });
}
function _ckOpen() {
  if (document.getElementById('glg-cmdk')) { _ckClose(); return; }
  const ov = document.createElement('div');
  ov.id = 'glg-cmdk';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.innerHTML = `
    <div class="ck-card">
      <input id="ck-input" class="ck-input" type="text" placeholder="${_ckt('ph')}" autocomplete="off" spellcheck="false">
      <div id="ck-list" class="ck-list" data-lenis-prevent></div>
      <div class="ck-foot">
        <span><kbd>↵</kbd>${_ckt('hOpen')}</span>
        <span><kbd>↑↓</kbd>${_ckt('hNav')}</span>
        <span><kbd>Esc</kbd>${_ckt('hClose')}</span>
      </div>
    </div>`;
  ov.addEventListener('click', e => { if (e.target === ov) _ckClose(); });
  document.body.appendChild(ov);
  const inp = document.getElementById('ck-input');
  inp.addEventListener('input', () => _ckRender(inp.value));
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); _ckMove(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); _ckMove(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); _ckGo(_ckSel); }
    else if (e.key === 'Escape') { e.preventDefault(); _ckClose(); }
  });
  _ckRender('');
  inp.focus();
}
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); _ckOpen(); }
});

/* ══ RÉCOMPENSES GLG (tâche #58) ══
   Le NIVEAU (anneau) reste le niveau de trophées calculé côté client.
   S'ajoute ici la couche VÉRIFIÉE SERVEUR (rpc glg_progress + liste
   blanche) : Points GLG, 6 badges, cadre d'avatar par palier, et 4
   presets d'ambiance verrouillés par points. Triche par insertion de
   fausses clés : impossible (les clés hors liste blanche comptent zéro). */
const _RWD_T = {
  title:   { fr:'Récompenses GLG', en:'GLG Rewards', es:'Recompensas GLG', de:'GLG-Belohnungen', it:'Ricompense GLG', ar:'مكافآت GLG', zh:'GLG 奖励', ja:'GLGリワード', ru:'Награды GLG', pl:'Nagrody GLG' },
  points:  { fr:'points', en:'points', es:'puntos', de:'Punkte', it:'punti', ar:'نقطة', zh:'积分', ja:'ポイント', ru:'очков', pl:'punktów' },
  rookie:  { fr:'Recrue', en:'Rookie', es:'Recluta', de:'Rekrut', it:'Recluta', ar:'مبتدئ', zh:'新兵', ja:'ルーキー', ru:'Новичок', pl:'Rekrut' },
  lockAt:  { fr:'Se débloque à %s points GLG', en:'Unlocks at %s GLG points', es:'Se desbloquea con %s puntos GLG', de:'Wird bei %s GLG-Punkten freigeschaltet', it:'Si sblocca a %s punti GLG', ar:'يُفتح عند %s نقطة GLG', zh:'达到 %s GLG 积分解锁', ja:'GLGポイント%sで解除', ru:'Откроется при %s очках GLG', pl:'Odblokuje się przy %s punktach GLG' },
  bdFirstT:{ fr:'Premier sang', en:'First Blood', es:'Primera sangre', de:'Erstes Blut', it:'Primo sangue', ar:'الدم الأول', zh:'首杀', ja:'ファーストブラッド', ru:'Первая кровь', pl:'Pierwsza krew' },
  bdFirstD:{ fr:'Débloque ton premier trophée', en:'Unlock your first trophy', es:'Desbloquea tu primer trofeo', de:'Schalte deine erste Trophäe frei', it:'Sblocca il tuo primo trofeo', ar:'افتح أول كأس لك', zh:'解锁你的第一个奖杯', ja:'最初のトロフィーを獲得', ru:'Получите первый трофей', pl:'Zdobądź pierwsze trofeum' },
  bdPlatT: { fr:'Platine', en:'Platinum', es:'Platino', de:'Platin', it:'Platino', ar:'بلاتيني', zh:'白金', ja:'プラチナ', ru:'Платина', pl:'Platyna' },
  bdPlatD: { fr:'Décroche une platine', en:'Earn a platinum', es:'Consigue un platino', de:'Hole ein Platin', it:'Ottieni un platino', ar:'احصل على بلاتينية', zh:'获得一个白金奖杯', ja:'プラチナを獲得', ru:'Получите платину', pl:'Zdobądź platynę' },
  bdCritT: { fr:'Plume critique', en:'Critic', es:'Crítico', de:'Kritiker', it:'Critico', ar:'ناقد', zh:'评论家', ja:'批評家', ru:'Критик', pl:'Krytyk' },
  bdCritD: { fr:'Publie 3 évaluations', en:'Publish 3 reviews', es:'Publica 3 reseñas', de:'Veröffentliche 3 Bewertungen', it:'Pubblica 3 recensioni', ar:'انشر 3 تقييمات', zh:'发布 3 条评价', ja:'レビューを3件投稿', ru:'Опубликуйте 3 отзыва', pl:'Opublikuj 3 recenzje' },
  bdSocT:  { fr:'Bien entouré', en:'Well Connected', es:'Bien acompañado', de:'Gut vernetzt', it:'In buona compagnia', ar:'محاط بالأصدقاء', zh:'广交好友', ja:'友達の輪', ru:'В кругу друзей', pl:'W dobrym towarzystwie' },
  bdSocD:  { fr:'Compte 5 amis', en:'Have 5 friends', es:'Ten 5 amigos', de:'Habe 5 Freunde', it:'Abbi 5 amici', ar:'كوّن 5 أصدقاء', zh:'拥有 5 位好友', ja:'フレンド5人', ru:'Заведите 5 друзей', pl:'Miej 5 znajomych' },
  bdHuntT: { fr:'Chasseur', en:'Hunter', es:'Cazador', de:'Jäger', it:'Cacciatore', ar:'صيّاد', zh:'猎手', ja:'ハンター', ru:'Охотник', pl:'Łowca' },
  bdHuntD: { fr:'Débloque 50 trophées', en:'Unlock 50 trophies', es:'Desbloquea 50 trofeos', de:'Schalte 50 Trophäen frei', it:'Sblocca 50 trofei', ar:'افتح 50 كأسًا', zh:'解锁 50 个奖杯', ja:'トロフィーを50個獲得', ru:'Получите 50 трофеев', pl:'Zdobądź 50 trofeów' },
  bdFndT:  { fr:'Pionnier', en:'Pioneer', es:'Pionero', de:'Pionier', it:'Pioniere', ar:'رائد', zh:'先驱', ja:'パイオニア', ru:'Первопроходец', pl:'Pionier' },
  bdFndD:  { fr:'Compte créé la première année du studio', en:'Account created in the studio\u2019s first year', es:'Cuenta creada el primer año del estudio', de:'Konto im ersten Studiojahr erstellt', it:'Account creato nel primo anno dello studio', ar:'حساب أُنشئ في السنة الأولى للاستوديو', zh:'工作室元年注册的账号', ja:'スタジオ最初の年に作成されたアカウント', ru:'Аккаунт создан в первый год студии', pl:'Konto założone w pierwszym roku studia' },
  brTro:   { fr:'Trophées', en:'Trophies', es:'Trofeos', de:'Trophäen', it:'Trofei', ar:'الكؤوس', zh:'奖杯', ja:'トロフィー', ru:'Трофеи', pl:'Trofea' },
  brRev:   { fr:'Évaluations', en:'Reviews', es:'Reseñas', de:'Bewertungen', it:'Recensioni', ar:'التقييمات', zh:'评价', ja:'レビュー', ru:'Отзывы', pl:'Recenzje' },
  brYears: { fr:'Ancienneté', en:'Seniority', es:'Antigüedad', de:'Mitglied seit', it:'Anzianità', ar:'الأقدمية', zh:'资历', ja:'在籍', ru:'Стаж', pl:'Staż' },
  brFr:    { fr:'Amis', en:'Friends', es:'Amigos', de:'Freunde', it:'Amici', ar:'الأصدقاء', zh:'好友', ja:'フレンド', ru:'Друзья', pl:'Znajomi' },
};
const _rwt = k => (_RWD_T[k] && (_RWD_T[k][LANG] || _RWD_T[k].en)) || '';
const _LOCK_SVG = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3.4" y="7" width="9.2" height="6.4" rx="1.6" stroke="currentColor" stroke-width="1.4"/><path d="M5.4 7V5.2a2.6 2.6 0 0 1 5.2 0V7" stroke="currentColor" stroke-width="1.4"/></svg>';
const _RWD_BADGES = [
  { k:'first_blood', t:'bdFirstT', d:'bdFirstD', ico:'<path d="M8 2.2c2.2 3 4 5 4 7.2a4 4 0 1 1-8 0c0-2.2 1.8-4.2 4-7.2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>' },
  { k:'platinum',    t:'bdPlatT',  d:'bdPlatD',  ico:'<path d="M4 3h8v3a4 4 0 0 1-8 0V3zM2 4h2M12 4h2M6.6 10.6 6 13.4h4l-.6-2.8M4.6 13.4h6.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>' },
  { k:'critic',      t:'bdCritT',  d:'bdCritD',  ico:'<path d="M11 2.4 13.6 5 6 12.6l-3.4.8.8-3.4L11 2.4z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>' },
  { k:'social',      t:'bdSocT',   d:'bdSocD',   ico:'<circle cx="5.6" cy="5.8" r="2.2" stroke="currentColor" stroke-width="1.3"/><circle cx="10.8" cy="6.6" r="1.7" stroke="currentColor" stroke-width="1.2"/><path d="M2.2 13c.5-2.3 1.8-3.4 3.4-3.4s2.9 1.1 3.4 3.4M9.4 10.2c1.9-.5 3.6.4 4.3 2.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>' },
  { k:'hunter',      t:'bdHuntT',  d:'bdHuntD',  ico:'<circle cx="8" cy="8" r="5.4" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="2.2" stroke="currentColor" stroke-width="1.3"/><path d="M8 1v2.4M8 12.6V15M1 8h2.4M12.6 8H15" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>' },
  { k:'founder',     t:'bdFndT',   d:'bdFndD',   ico:'<path d="M8 1.8 9.8 5.6l4.2.6-3 2.9.7 4.1L8 11.2l-3.7 2 .7-4.1-3-2.9 4.2-.6L8 1.8z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>' },
];
const _RWD_FRAMES = [[300, 'plat'], [180, 'gold'], [100, 'silver'], [40, 'bronze']];
function _rwdFrame(pts) { const f = _RWD_FRAMES.find(x => pts >= x[0]); return f ? f[1] : ''; }
let _rwdMe = null, _rwdMeAt = 0;
function _rwdHas(pts) { return !!_rwdMe && _rwdMe.points >= pts; }
async function _rwdEnsure(force) {
  if (!window.GLG_AUTH?.isConfigured?.() || typeof GLG_AUTH.glgProgress !== 'function') return null;
  if (_rwdMe && !force && Date.now() - _rwdMeAt < 60000) return _rwdMe;
  try {
    const r = await GLG_AUTH.glgProgress();
    if (r && r.ok) { _rwdMe = r.progress; _rwdMeAt = Date.now(); }
  } catch (e) {}
  return _rwdMe;
}
/* Carte « Récompenses GLG » : profil perso (uid absent) et profil public. */
async function _renderRewards(uid) {
  const host = document.getElementById('pp-rewards'); if (!host) return;
  let pg = null;
  try {
    if (uid) { const r = await GLG_AUTH.glgProgress(uid); pg = r && r.ok ? r.progress : null; }
    else pg = await _rwdEnsure(true);
  } catch (e) {}
  if (!pg) { host.hidden = true; return; }
  const frame = _rwdFrame(pg.points);
  const tierName = frame ? _tt(frame === 'plat' ? 'platinum' : frame === 'gold' ? 'gold' : frame === 'silver' ? 'silver' : 'bronze') : _rwt('rookie');
  const badges = Array.isArray(pg.badges) ? pg.badges : [];
  host.hidden = false;
  host.innerHTML = `
    <div class="pp-sec-head"><h2 class="pp-sec-title">${_rwt('title')}</h2></div>
    <div class="rwd-card ${frame ? 'rwd-card--' + frame : ''}">
      <div class="rwd-score">
        <b>${(+pg.points || 0).toLocaleString(LANG_LOCALE[LANG] || 'en-US')}</b>
        <span>${_rwt('points')}</span>
        <i class="rwd-tier">${tierName}</i>
      </div>
      <div class="rwd-badges">
        ${_RWD_BADGES.map(b => {
          const on = badges.indexOf(b.k) >= 0;
          return `<span class="rwd-badge ${on ? 'on' : ''}" title="${_rwt(b.t)}, ${_rwt(b.d)}" aria-label="${_rwt(b.t)}">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">${b.ico}</svg>
            <small>${_rwt(b.t)}</small>${on ? '' : _LOCK_SVG}</span>`;
        }).join('')}
      </div>
      <div class="rwd-break">
        <span>${_rwt('brTro')} · ${(pg.tiers && (pg.tiers.bronze + pg.tiers.silver + pg.tiers.gold + pg.tiers.platinum)) || 0}</span>
        <span>${_rwt('brRev')} · ${pg.reviews || 0}</span>
        <span>${_rwt('brFr')} · ${pg.friends || 0}</span>
        <span>${_rwt('brYears')} · ${pg.years || 0}</span>
      </div>
    </div>`;
  const av2 = document.querySelector('.pp-avatar');
  if (av2) {
    av2.classList.remove('glg-frame--bronze', 'glg-frame--silver', 'glg-frame--gold', 'glg-frame--plat');
    if (frame) av2.classList.add('glg-frame--' + frame);
  }
}

/* ══ MENU CONTEXTUEL DU LAUNCHER (clic droit) ══
   Le menu NATIF de la WebView exposait « Enregistrer sous / Imprimer »
   (fuite du HTML et des assets du launcher). Remplacé par un menu GLG
   minimal façon Steam : uniquement des actions contextuelles utiles
   (couper/copier/coller, lien, image, actualiser). Le SITE WEB garde le
   menu natif du navigateur, bloquer le clic droit sur le web est hostile
   et ne protège rien (Ctrl+U, DevTools, curl…). */
const _CTX_T = {
  copy:    { fr:'Copier', en:'Copy', es:'Copiar', de:'Kopieren', it:'Copia', ar:'نسخ', zh:'复制', ja:'コピー', ru:'Копировать', pl:'Kopiuj' },
  cut:     { fr:'Couper', en:'Cut', es:'Cortar', de:'Ausschneiden', it:'Taglia', ar:'قص', zh:'剪切', ja:'切り取り', ru:'Вырезать', pl:'Wytnij' },
  paste:   { fr:'Coller', en:'Paste', es:'Pegar', de:'Einfügen', it:'Incolla', ar:'لصق', zh:'粘贴', ja:'貼り付け', ru:'Вставить', pl:'Wklej' },
  selAll:  { fr:'Tout sélectionner', en:'Select all', es:'Seleccionar todo', de:'Alles auswählen', it:'Seleziona tutto', ar:'تحديد الكل', zh:'全选', ja:'すべて選択', ru:'Выделить всё', pl:'Zaznacz wszystko' },
  copyLink:{ fr:'Copier le lien', en:'Copy link', es:'Copiar enlace', de:'Link kopieren', it:'Copia link', ar:'نسخ الرابط', zh:'复制链接', ja:'リンクをコピー', ru:'Копировать ссылку', pl:'Kopiuj link' },
  openExt: { fr:'Ouvrir dans le navigateur', en:'Open in browser', es:'Abrir en el navegador', de:'Im Browser öffnen', it:'Apri nel browser', ar:'فتح في المتصفح', zh:'在浏览器中打开', ja:'ブラウザで開く', ru:'Открыть в браузере', pl:'Otwórz w przeglądarce' },
  copyImg: { fr:"Copier l'adresse de l'image", en:'Copy image address', es:'Copiar dirección de la imagen', de:'Bildadresse kopieren', it:'Copia indirizzo immagine', ar:'نسخ عنوان الصورة', zh:'复制图片地址', ja:'画像アドレスをコピー', ru:'Копировать адрес изображения', pl:'Kopiuj adres obrazu' },
  reload:  { fr:'Actualiser', en:'Refresh', es:'Actualizar', de:'Aktualisieren', it:'Aggiorna', ar:'تحديث', zh:'刷新', ja:'更新', ru:'Обновить', pl:'Odśwież' },
};
const _ctxT = k => (_CTX_T[k] && (_CTX_T[k][LANG] || _CTX_T[k].en)) || '';
function _glgCtxClose() { document.getElementById('glg-ctx')?.remove(); }
function _glgCtxOpen(e) {
  _glgCtxClose();
  const t = e.target, items = [];
  const ed = t.closest && t.closest('input,textarea,[contenteditable="true"]');
  const isInput = !!(ed && (ed.tagName === 'INPUT' || ed.tagName === 'TEXTAREA'));
  const sel = isInput
    ? String(ed.value).slice(ed.selectionStart ?? 0, ed.selectionEnd ?? 0)
    : String(window.getSelection() || '');
  if (ed) {
    if (sel && isInput && !ed.readOnly) items.push(['cut', () => {
      navigator.clipboard.writeText(sel).catch(() => {});
      ed.setRangeText('', ed.selectionStart, ed.selectionEnd, 'end');
      ed.dispatchEvent(new Event('input', { bubbles: true }));
    }]);
    if (sel) items.push(['copy', () => navigator.clipboard.writeText(sel).catch(() => {})]);
    items.push(['paste', async () => {
      try {
        const txt = await navigator.clipboard.readText();
        if (txt && isInput && !ed.readOnly) {
          ed.setRangeText(txt, ed.selectionStart ?? ed.value.length, ed.selectionEnd ?? ed.value.length, 'end');
          ed.dispatchEvent(new Event('input', { bubbles: true }));
          ed.focus();
        }
      } catch (err) {}   // lecture presse-papiers refusée → Ctrl+V reste possible
    }]);
    items.push(['selAll', () => { if (isInput) ed.select(); }]);
  } else if (sel) {
    items.push(['copy', () => navigator.clipboard.writeText(sel).catch(() => {})]);
  }
  const a = t.closest && t.closest('a[href]');
  if (a && /^https?:/i.test(a.href)) {
    items.push(['copyLink', () => navigator.clipboard.writeText(a.href).catch(() => {})]);
    items.push(['openExt', () => glgOpenExternal(a.href)]);
  }
  const im = t.closest && t.closest('img');
  if (im && /^https?:/i.test(im.src || '')) items.push(['copyImg', () => navigator.clipboard.writeText(im.src).catch(() => {})]);
  const menu = document.createElement('div');
  menu.id = 'glg-ctx'; menu.setAttribute('role', 'menu');
  menu.innerHTML = items.map(([k]) => `<button role="menuitem" data-k="${k}">${_ctxT(k)}</button>`).join('')
    + (items.length ? '<hr>' : '')
    + `<button role="menuitem" data-k="reload">${_ctxT('reload')}</button>`;
  const acts = Object.fromEntries(items);
  acts.reload = () => location.reload();
  menu.addEventListener('click', ev => {
    const b = ev.target.closest('[data-k]'); if (!b) return;
    ev.stopPropagation(); _glgCtxClose();
    const fn = acts[b.dataset.k]; if (fn) fn();
  });
  document.body.appendChild(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.max(4, Math.min(e.clientX, innerWidth - r.width - 8)) + 'px';
  menu.style.top = Math.max(4, Math.min(e.clientY, innerHeight - r.height - 8)) + 'px';
}
document.addEventListener('contextmenu', e => {
  if (!IS_TAURI) return;                       // évalué au clic : pas de piège TDZ
  e.preventDefault();
  _glgCtxOpen(e);
});
document.addEventListener('click', _glgCtxClose);
document.addEventListener('keydown', e => { if (e.key === 'Escape') _glgCtxClose(); });
window.addEventListener('scroll', _glgCtxClose, true);

/* ══════════════════════════════════════════
   GLG CHAT, messagerie (MP entre amis + groupes « serveurs »)
   ──────────────────────────────────────────
   Backend : db/schema.sql § GLG CHAT (RLS + chat_can_access + realtime).
   MP disponibles PARTOUT (site + launcher) ; les GROUPES sont une
   exclusivité du launcher (le web affiche une invitation à l'installer).
   Pièces jointes : tout type de fichier (bucket chat-media, 50 Mo,
   garde-fous _glgFileGuard : exécutables bloqués, zip inspectés) +
   notes vocales enregistrées au micro (MediaRecorder, opt-in navigateur).
══════════════════════════════════════════ */
const _CHAT_T = {
  navLabel:  { fr:'Messagerie', en:'Chat', es:'Chat', de:'Chat', it:'Chat', ar:'الدردشة', zh:'聊天', ja:'チャット', ru:'Чат', pl:'Czat' },
  dms:       { fr:'Messages privés', en:'Direct messages', es:'Mensajes directos', de:'Direktnachrichten', it:'Messaggi diretti', ar:'الرسائل الخاصة', zh:'私信', ja:'ダイレクトメッセージ', ru:'Личные сообщения', pl:'Wiadomości prywatne' },
  groups:    { fr:'Groupes', en:'Groups', es:'Grupos', de:'Gruppen', it:'Gruppi', ar:'المجموعات', zh:'群组', ja:'グループ', ru:'Группы', pl:'Grupy' },
  newGroup:  { fr:'Nouveau groupe', en:'New group', es:'Nuevo grupo', de:'Neue Gruppe', it:'Nuovo gruppo', ar:'مجموعة جديدة', zh:'新建群组', ja:'新しいグループ', ru:'Новая группа', pl:'Nowa grupa' },
  groupName: { fr:'Nom du groupe…', en:'Group name…', es:'Nombre del grupo…', de:'Gruppenname…', it:'Nome del gruppo…', ar:'اسم المجموعة…', zh:'群组名称……', ja:'グループ名…', ru:'Название группы…', pl:'Nazwa grupy…' },
  create:    { fr:'Créer', en:'Create', es:'Crear', de:'Erstellen', it:'Crea', ar:'إنشاء', zh:'创建', ja:'作成', ru:'Создать', pl:'Utwórz' },
  addMember: { fr:'Ajouter un membre', en:'Add a member', es:'Añadir un miembro', de:'Mitglied hinzufügen', it:'Aggiungi un membro', ar:'إضافة عضو', zh:'添加成员', ja:'メンバーを追加', ru:'Добавить участника', pl:'Dodaj członka' },
  leave:     { fr:'Quitter le groupe', en:'Leave group', es:'Salir del grupo', de:'Gruppe verlassen', it:'Esci dal gruppo', ar:'مغادرة المجموعة', zh:'退出群组', ja:'グループを退出', ru:'Покинуть группу', pl:'Opuść grupę' },
  members:   { fr:'%s membres', en:'%s members', es:'%s miembros', de:'%s Mitglieder', it:'%s membri', ar:'%s أعضاء', zh:'%s 位成员', ja:'%s人のメンバー', ru:'Участников: %s', pl:'%s członków' },
  ph:        { fr:'Écris un message…', en:'Write a message…', es:'Escribe un mensaje…', de:'Nachricht schreiben…', it:'Scrivi un messaggio…', ar:'اكتب رسالة…', zh:'输入消息……', ja:'メッセージを入力…', ru:'Напишите сообщение…', pl:'Napisz wiadomość…' },
  send:      { fr:'Envoyer', en:'Send', es:'Enviar', de:'Senden', it:'Invia', ar:'إرسال', zh:'发送', ja:'送信', ru:'Отправить', pl:'Wyślij' },
  attach:    { fr:'Joindre un fichier (50 Mo max)', en:'Attach a file (50 MB max)', es:'Adjuntar un archivo (máx. 50 MB)', de:'Datei anhängen (max. 50 MB)', it:'Allega un file (max 50 MB)', ar:'إرفاق ملف (بحد أقصى 50 م.ب)', zh:'附加文件（最大 50 MB）', ja:'ファイルを添付（最大50MB）', ru:'Прикрепить файл (макс. 50 МБ)', pl:'Załącz plik (maks. 50 MB)' },
  record:    { fr:'Note vocale', en:'Voice note', es:'Nota de voz', de:'Sprachnotiz', it:'Nota vocale', ar:'رسالة صوتية', zh:'语音消息', ja:'ボイスメモ', ru:'Голосовое сообщение', pl:'Notatka głosowa' },
  recCancel: { fr:'Annuler', en:'Cancel', es:'Cancelar', de:'Abbrechen', it:'Annulla', ar:'إلغاء', zh:'取消', ja:'キャンセル', ru:'Отмена', pl:'Anuluj' },
  recDenied: { fr:'Micro refusé, autorise-le pour envoyer des notes vocales.', en:'Microphone denied, allow it to send voice notes.', es:'Micrófono denegado, permítelo para enviar notas de voz.', de:'Mikrofon verweigert, erlaube es für Sprachnotizen.', it:'Microfono negato, consentilo per inviare note vocali.', ar:'رُفض الميكروفون، اسمح به لإرسال الرسائل الصوتية.', zh:'麦克风被拒绝、允许后才能发送语音。', ja:'マイクが拒否されました、ボイスメモには許可が必要です。', ru:'Микрофон запрещён, разрешите его для голосовых.', pl:'Mikrofon odrzucony, zezwól, aby wysyłać notatki głosowe.' },
  typing:    { fr:'%s écrit…', en:'%s is typing…', es:'%s está escribiendo…', de:'%s schreibt…', it:'%s sta scrivendo…', ar:'%s يكتب…', zh:'%s 正在输入……', ja:'%sが入力中…', ru:'%s печатает…', pl:'%s pisze…' },
  edited:    { fr:'modifié', en:'edited', es:'editado', de:'bearbeitet', it:'modificato', ar:'معدَّل', zh:'已编辑', ja:'編集済み', ru:'изменено', pl:'edytowano' },
  edit:      { fr:'Modifier', en:'Edit', es:'Editar', de:'Bearbeiten', it:'Modifica', ar:'تعديل', zh:'编辑', ja:'編集', ru:'Изменить', pl:'Edytuj' },
  del:       { fr:'Supprimer', en:'Delete', es:'Eliminar', de:'Löschen', it:'Elimina', ar:'حذف', zh:'删除', ja:'削除', ru:'Удалить', pl:'Usuń' },
  save:      { fr:'Enregistrer', en:'Save', es:'Guardar', de:'Speichern', it:'Salva', ar:'حفظ', zh:'保存', ja:'保存', ru:'Сохранить', pl:'Zapisz' },
  loadMore:  { fr:'Messages précédents', en:'Earlier messages', es:'Mensajes anteriores', de:'Frühere Nachrichten', it:'Messaggi precedenti', ar:'رسائل أقدم', zh:'更早的消息', ja:'以前のメッセージ', ru:'Более ранние сообщения', pl:'Wcześniejsze wiadomości' },
  emptyConv: { fr:'Aucun message pour le moment, écris le premier.', en:'No messages yet, write the first one.', es:'Aún no hay mensajes, escribe el primero.', de:'Noch keine Nachrichten, schreib die erste.', it:'Nessun messaggio, scrivi il primo.', ar:'لا رسائل بعد، اكتب الأولى.', zh:'还没有消息、发出第一条吧。', ja:'まだメッセージがありません、最初の一通を送ろう。', ru:'Сообщений пока нет, напишите первое.', pl:'Brak wiadomości, napisz pierwszą.' },
  pickConv:  { fr:'Choisis une conversation à gauche, ou crée un groupe.', en:'Pick a conversation on the left, or create a group.', es:'Elige una conversación a la izquierda, o crea un grupo.', de:'Wähle links eine Unterhaltung, oder erstelle eine Gruppe.', it:'Scegli una conversazione a sinistra, o crea un gruppo.', ar:'اختر محادثة من اليسار، أو أنشئ مجموعة.', zh:'从左侧选择会话、或创建群组。', ja:'左から会話を選ぶか、グループを作成しよう。', ru:'Выберите беседу слева, или создайте группу.', pl:'Wybierz rozmowę po lewej, lub utwórz grupę.' },
  noFriends: { fr:'Ajoute des amis depuis ton profil pour discuter en privé.', en:'Add friends from your profile to chat privately.', es:'Añade amigos desde tu perfil para chatear en privado.', de:'Füge im Profil Freunde hinzu, um privat zu chatten.', it:'Aggiungi amici dal profilo per chattare in privato.', ar:'أضف أصدقاء من ملفك للدردشة الخاصة.', zh:'在个人资料中添加好友即可私聊。', ja:'プロフィールからフレンドを追加してプライベートチャット。', ru:'Добавьте друзей в профиле, чтобы переписываться.', pl:'Dodaj znajomych w profilu, aby rozmawiać prywatnie.' },
  groupsWeb: { fr:'Les groupes sont une exclusivité du launcher, télécharge-le pour créer tes serveurs.', en:'Groups are a launcher exclusive, download it to create your servers.', es:'Los grupos son exclusivos del launcher, descárgalo para crear tus servidores.', de:'Gruppen gibt es nur im Launcher, lade ihn herunter, um Server zu erstellen.', it:'I gruppi sono un\'esclusiva del launcher, scaricalo per creare i tuoi server.', ar:'المجموعات حصرية للمشغّل، حمّله لإنشاء خوادمك.', zh:'群组为启动器专属、下载后即可创建你的服务器。', ja:'グループはランチャー限定、ダウンロードしてサーバーを作ろう。', ru:'Группы, эксклюзив лаунчера. Скачай его, чтобы создавать серверы.', pl:'Grupy są ekskluzywne dla launchera, pobierz go, aby tworzyć serwery.' },
  signedOut: { fr:'Connecte-toi pour retrouver tes messages privés et tes groupes, synchronisés entre le site et le launcher.', en:'Sign in to find your direct messages and groups, synced between the site and the launcher.', es:'Inicia sesión para ver tus mensajes y grupos, sincronizados entre el sitio y el launcher.', de:'Melde dich an für deine Nachrichten und Gruppen, synchron zwischen Website und Launcher.', it:'Accedi per ritrovare messaggi e gruppi, sincronizzati tra sito e launcher.', ar:'سجّل الدخول لرؤية رسائلك ومجموعاتك، متزامنة بين الموقع والمشغّل.', zh:'登录即可查看你的私信和群组、在网站与启动器间同步。', ja:'サインインしてDMとグループへ、サイトとランチャーで同期。', ru:'Войдите, чтобы увидеть сообщения и группы, синхронизированы между сайтом и лаунчером.', pl:'Zaloguj się, aby zobaczyć wiadomości i grupy, zsynchronizowane między stroną a launcherem.' },
  tooBig:    { fr:'Fichier trop lourd (50 Mo max).', en:'File too large (50 MB max).', es:'Archivo demasiado grande (máx. 50 MB).', de:'Datei zu groß (max. 50 MB).', it:'File troppo grande (max 50 MB).', ar:'الملف كبير جداً (50 م.ب كحد أقصى).', zh:'文件过大（最大 50 MB）。', ja:'ファイルが大きすぎます（最大50MB）。', ru:'Файл слишком большой (макс. 50 МБ).', pl:'Plik jest za duży (maks. 50 MB).' },
  attImg:    { fr:'Image', en:'Image', es:'Imagen', de:'Bild', it:'Immagine', ar:'صورة', zh:'图片', ja:'画像', ru:'Изображение', pl:'Obraz' },
  attVid:    { fr:'Vidéo', en:'Video', es:'Vídeo', de:'Video', it:'Video', ar:'فيديو', zh:'视频', ja:'動画', ru:'Видео', pl:'Wideo' },
  attAud:    { fr:'Audio', en:'Audio', es:'Audio', de:'Audio', it:'Audio', ar:'صوت', zh:'音频', ja:'音声', ru:'Аудио', pl:'Audio' },
  you:       { fr:'Toi', en:'You', es:'Tú', de:'Du', it:'Tu', ar:'أنت', zh:'你', ja:'あなた', ru:'Вы', pl:'Ty' },
  call:      { fr:'Appel vocal', en:'Voice call', es:'Llamada de voz', de:'Sprachanruf', it:'Chiamata vocale', ar:'مكالمة صوتية', zh:'语音通话', ja:'ボイス通話', ru:'Голосовой звонок', pl:'Połączenie głosowe' },
  calling:   { fr:'Appel en cours…', en:'Calling…', es:'Llamando…', de:'Anruf läuft…', it:'Chiamata in corso…', ar:'جارٍ الاتصال…', zh:'呼叫中……', ja:'呼び出し中…', ru:'Звоним…', pl:'Dzwonię…' },
  incoming:  { fr:'%s t’appelle…', en:'%s is calling you…', es:'%s te está llamando…', de:'%s ruft dich an…', it:'%s ti sta chiamando…', ar:'%s يتصل بك…', zh:'%s 正在呼叫你……', ja:'%sから着信中…', ru:'%s звонит вам…', pl:'%s dzwoni do ciebie…' },
  accept:    { fr:'Répondre', en:'Answer', es:'Responder', de:'Annehmen', it:'Rispondi', ar:'رد', zh:'接听', ja:'応答', ru:'Ответить', pl:'Odbierz' },
  hangup:    { fr:'Raccrocher', en:'Hang up', es:'Colgar', de:'Auflegen', it:'Riaggancia', ar:'إنهاء المكالمة', zh:'挂断', ja:'通話終了', ru:'Завершить', pl:'Rozłącz' },
  mute:      { fr:'Couper le micro', en:'Mute microphone', es:'Silenciar micrófono', de:'Mikrofon stummschalten', it:'Disattiva microfono', ar:'كتم الميكروفون', zh:'静音麦克风', ja:'マイクをミュート', ru:'Выключить микрофон', pl:'Wycisz mikrofon' },
  unmute:    { fr:'Réactiver le micro', en:'Unmute microphone', es:'Activar micrófono', de:'Mikrofon aktivieren', it:'Riattiva microfono', ar:'إلغاء كتم الميكروفون', zh:'取消静音', ja:'ミュート解除', ru:'Включить микрофон', pl:'Włącz mikrofon' },
  busy:      { fr:'Occupé, déjà en communication.', en:'Busy, already in a call.', es:'Ocupado, ya está en una llamada.', de:'Besetzt, bereits im Gespräch.', it:'Occupato, già in chiamata.', ar:'مشغول، في مكالمة بالفعل.', zh:'忙线中、正在通话。', ja:'通話中のため応答できません。', ru:'Занято, уже в разговоре.', pl:'Zajęte, trwa już rozmowa.' },
  confirm:   { fr:'Valider', en:'Confirm', es:'Validar', de:'Bestätigen', it:'Conferma', ar:'تأكيد', zh:'确认', ja:'確定', ru:'Готово', pl:'Zatwierdź' },
  emojiT:    { fr:'Émojis', en:'Emoji', es:'Emojis', de:'Emojis', it:'Emoji', ar:'الإيموجي', zh:'表情符号', ja:'絵文字', ru:'Эмодзи', pl:'Emoji' },
  gifT:      { fr:'Envoyer un GIF', en:'Send a GIF', es:'Enviar un GIF', de:'GIF senden', it:'Invia una GIF', ar:'إرسال GIF', zh:'发送 GIF', ja:'GIFを送信', ru:'Отправить GIF', pl:'Wyślij GIF-a' },
  gifYours:  { fr:'Tes GIFs', en:'Your GIFs', es:'Tus GIFs', de:'Deine GIFs', it:'I tuoi GIF', ar:'ملفات GIF الخاصة بك', zh:'你的 GIF', ja:'あなたのGIF', ru:'Ваши GIF', pl:'Twoje GIF-y' },
  gifMemes:  { fr:'Mèmes', en:'Memes', es:'Memes', de:'Memes', it:'Meme', ar:'ميمز', zh:'梗图', ja:'ミーム', ru:'Мемы', pl:'Memy' },
  gifImport: { fr:'Importer un GIF', en:'Import a GIF', es:'Importar un GIF', de:'GIF importieren', it:'Importa una GIF', ar:'استيراد GIF', zh:'导入 GIF', ja:'GIFをインポート', ru:'Импортировать GIF', pl:'Importuj GIF-a' },
  gifDel:    { fr:'Supprimer de tes GIFs', en:'Remove from your GIFs', es:'Quitar de tus GIFs', de:'Aus deinen GIFs entfernen', it:'Rimuovi dai tuoi GIF', ar:'إزالة من ملفات GIF الخاصة بك', zh:'从你的 GIF 中删除', ja:'あなたのGIFから削除', ru:'Удалить из ваших GIF', pl:'Usuń z twoich GIF-ów' },
  gifHint:   { fr:'Envoie un mème ou importe tes propres GIFs, ils restent ici jusqu’à ce que tu les supprimes.', en:'Send a meme or import your own GIFs, they stay here until you delete them.', es:'Envía un meme o importa tus propios GIFs, se quedan aquí hasta que los borres.', de:'Sende ein Meme oder importiere eigene GIFs, sie bleiben hier, bis du sie löschst.', it:'Invia un meme o importa le tue GIF, restano qui finché non le elimini.', ar:'أرسل ميمًا أو استورد ملفات GIF الخاصة بك، تبقى هنا حتى تحذفها بنفسك.', zh:'发送梗图或导入你自己的 GIF, 它们会一直保留，直到你删除为止。', ja:'ミームを送るか、自分のGIFをインポートしよう、削除するまでここに残ります。', ru:'Отправьте мем или импортируйте свои GIF, они останутся здесь, пока вы их не удалите.', pl:'Wyślij mema lub importuj własne GIF-y, zostaną tu, dopóki ich nie usuniesz.' },
  gcall:     { fr:'Appel de groupe', en:'Group call', es:'Llamada de grupo', de:'Gruppenanruf', it:'Chiamata di gruppo', ar:'مكالمة جماعية', zh:'群组通话', ja:'グループ通話', ru:'Групповой звонок', pl:'Połączenie grupowe' },
  gIncoming: { fr:'%s appelle le groupe', en:'%s is calling the group', es:'%s está llamando al grupo', de:'%s ruft die Gruppe an', it:'%s sta chiamando il gruppo', ar:'%s يتصل بالمجموعة', zh:'%s 发起了群组通话', ja:'%s がグループに発信中', ru:'%s звонит группе', pl:'%s dzwoni do grupy' },
  gParts:    { fr:'%s participants', en:'%s participants', es:'%s participantes', de:'%s Teilnehmer', it:'%s partecipanti', ar:'%s مشاركين', zh:'%s 位参与者', ja:'参加者 %s 人', ru:'Участников: %s', pl:'Uczestnicy: %s' },
  gWaiting:  { fr:'Connexion au salon…', en:'Joining the call…', es:'Conectando a la llamada…', de:'Anruf wird beigetreten…', it:'Connessione alla chiamata…', ar:'جارٍ الانضمام إلى المكالمة…', zh:'正在加入通话…', ja:'通話に参加中…', ru:'Подключение к звонку…', pl:'Dołączanie do rozmowy…' },
  stickerT:  { fr:'Stickers', en:'Stickers', es:'Stickers', de:'Sticker', it:'Sticker', ar:'الملصقات', zh:'贴纸', ja:'スタンプ', ru:'Стикеры', pl:'Naklejki' },
  reactT:    { fr:'Réagir', en:'React', es:'Reaccionar', de:'Reagieren', it:'Reagisci', ar:'تفاعل', zh:'回应', ja:'リアクション', ru:'Отреагировать', pl:'Zareaguj' },
  playA:     { fr:'Écouter', en:'Play', es:'Reproducir', de:'Abspielen', it:'Riproduci', ar:'تشغيل', zh:'播放', ja:'再生', ru:'Слушать', pl:'Odtwórz' },
  attFile:   { fr:'Fichier', en:'File', es:'Archivo', de:'Datei', it:'File', ar:'ملف', zh:'文件', ja:'ファイル', ru:'Файл', pl:'Plik' },
  dl:        { fr:'Télécharger', en:'Download', es:'Descargar', de:'Herunterladen', it:'Scarica', ar:'تنزيل', zh:'下载', ja:'ダウンロード', ru:'Скачать', pl:'Pobierz' },
  fileBlocked:{ fr:'Type de fichier bloqué pour ta sécurité (exécutables et scripts interdits).', en:'File type blocked for your safety (executables and scripts are not allowed).', es:'Tipo de archivo bloqueado por tu seguridad (ejecutables y scripts prohibidos).', de:'Dateityp aus Sicherheitsgründen blockiert (ausführbare Dateien und Skripte verboten).', it:'Tipo di file bloccato per la tua sicurezza (eseguibili e script vietati).', ar:'نوع الملف محظور لحمايتك (الملفات التنفيذية والنصوص البرمجية ممنوعة).', zh:'为了你的安全，该文件类型已被拦截（禁止可执行文件和脚本）。', ja:'安全のためブロックされたファイル形式です（実行ファイル・スクリプトは禁止）。', ru:'Тип файла заблокирован ради вашей безопасности (исполняемые файлы и скрипты запрещены).', pl:'Typ pliku zablokowany dla twojego bezpieczeństwa (pliki wykonywalne i skrypty są zabronione).' },
  zipOnly:   { fr:'Archives : .zip uniquement, les .rar/.7z ne peuvent pas être inspectés.', en:"Archives: .zip only, .rar/.7z can't be inspected.", es:'Archivos comprimidos: solo .zip, los .rar/.7z no se pueden inspeccionar.', de:'Archive: nur .zip, .rar/.7z können nicht geprüft werden.', it:'Archivi: solo .zip, i .rar/.7z non possono essere ispezionati.', ar:'الأرشيفات: ‎.zip فقط، لا يمكن فحص ‎.rar/.7z.', zh:'压缩包仅支持 .zip, 无法检查 .rar/.7z。', ja:'アーカイブは .zip のみ、.rar/.7z は検査できません。', ru:'Архивы: только .zip, .rar/.7z нельзя проверить.', pl:'Archiwa: tylko .zip, .rar/.7z nie można sprawdzić.' },
  zipBad:    { fr:'Archive refusée : contenu chiffré, exécutable caché ou taille déclarée suspecte.', en:'Archive rejected: encrypted content, hidden executable or suspicious declared size.', es:'Archivo rechazado: contenido cifrado, ejecutable oculto o tamaño declarado sospechoso.', de:'Archiv abgelehnt: verschlüsselter Inhalt, verstecktes Programm oder verdächtige Größe.', it:'Archivio rifiutato: contenuto cifrato, eseguibile nascosto o dimensione dichiarata sospetta.', ar:'رُفض الأرشيف: محتوى مشفّر أو ملف تنفيذي مخفي أو حجم معلن مريب.', zh:'压缩包被拒绝：加密内容、隐藏的可执行文件或声明大小可疑。', ja:'アーカイブを拒否：暗号化された内容、隠れた実行ファイル、または不審な宣言サイズ。', ru:'Архив отклонён: зашифрованное содержимое, скрытый исполняемый файл или подозрительный заявленный размер.', pl:'Archiwum odrzucone: zaszyfrowana zawartość, ukryty plik wykonywalny lub podejrzany deklarowany rozmiar.' },
  pauseA:    { fr:'Pause', en:'Pause', es:'Pausa', de:'Pause', it:'Pausa', ar:'إيقاف مؤقت', zh:'暂停', ja:'一時停止', ru:'Пауза', pl:'Pauza' },
};
const _chT = k => (_CHAT_T[k] && (_CHAT_T[k][LANG] || _CHAT_T[k].en)) || '';

let _chatMe = null;
let _chat = { channels: [], current: null, rows: [], typingCh: null, media: null, recTimer: null };
let _chatRtUnsub = null;
let _chatRefreshT = null;

/* Badge non-lus, header (web) + FAB flottant (launcher), liste + live */
function _refreshChatBadge(n) {
  const count = (n != null) ? n : _chat.channels.reduce((s, c) => s + (c.unread || 0), 0);
  const b = $('nav-chat-dot');
  if (b) b.classList.toggle('on', count > 0);
  const f = $('glg-chatfab-dot');
  if (f) { f.textContent = count > 99 ? '99+' : (count || ''); f.classList.toggle('on', count > 0); }
}

/* ── BOUTON CHAT FLOTTANT (launcher) : bas-droite, TOUTES les sections -
   suit l'écran, badge non-lus, se masque sur la page chat elle-même.
   Sur le web, le chat reste dans le header (pas de FAB). ── */
function _initChatFab() {
  if (!IS_TAURI || document.getElementById('glg-chatfab')) return;
  const fab = document.createElement('button');
  fab.id = 'glg-chatfab';
  fab.className = 'glg-chatfab';
  fab.title = _chT('navLabel');
  fab.setAttribute('aria-label', _chT('navLabel'));
  fab.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.4c-4.9 0-8.6 3.1-8.6 7.2 0 2.1 1 4 2.7 5.3l-1.3 3.5 4.3-2a10 10 0 0 0 2.9.4c4.9 0 8.6-3.1 8.6-7.2S16.9 3.4 12 3.4z" fill="currentColor"/>
    </svg>
    <span class="glg-chatfab-dot" id="glg-chatfab-dot" aria-hidden="true"></span>`;
  fab.addEventListener('click', () => showPage('chat'));
  document.body.appendChild(fab);
  // Masqué quand on est DÉJÀ sur la page chat (classe posée à chaque navigation)
  document.addEventListener('glg:page-changed', e => {
    document.body.classList.toggle('glg-on-chat', e.detail && e.detail.name === 'chat');
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _initChatFab);
else _initChatFab();

/* Abonnement temps réel GLOBAL, démarré à la connexion (badge vivant même
   hors de la page chat). RLS filtre côté serveur : chacun ne reçoit que
   les messages de SES conversations. */
function _chatEnsureRealtime() {
  if (_chatRtUnsub || !window.GLG_AUTH?.isConfigured?.()) return;
  _callListen();   // appels vocaux : réception des sonneries sur MON canal
  _chatRtUnsub = GLG_AUTH.chatSubscribe(p => {
    const row = p?.new || p?.old || {};
    const t = p?.eventType;
    if (t === 'INSERT' && row.sender && row.sender !== _chatMe) {
      if (row.channel === _chat.current && $('chat-msgs')) {
        _chat.rows.push(p.new); _chatRenderMessages(true);
        GLG_AUTH.chatMarkRead(_chat.current);
      } else {
        const c = _chat.channels.find(x => x.channel === row.channel);
        if (c) c.unread = (c.unread || 0) + 1;
        _refreshChatBadge();
        _chatToastMsg(row, c);   // launcher en arrière-plan → toast Windows
      }
    }
    if (t === 'INSERT' && row.sender === _chatMe && row.channel === _chat.current && $('chat-msgs')) {
      if (!_chat.rows.some(r => r.id === row.id)) { _chat.rows.push(p.new); _chatRenderMessages(true); }
    }
    if (t === 'UPDATE' && row.channel === _chat.current) {
      const i = _chat.rows.findIndex(r => r.id === row.id);
      if (i >= 0) { _chat.rows[i] = p.new; _chatRenderMessages(); }
    }
    if (t === 'DELETE') {
      const i = _chat.rows.findIndex(r => r.id === row.id);
      if (i >= 0) { _chat.rows.splice(i, 1); _chatRenderMessages(); }
    }
    // Rafraîchit la liste (aperçus / tri / badge) au plus toutes les 2 s
    clearTimeout(_chatRefreshT);
    _chatRefreshT = setTimeout(() => { if ($('chat-rail')) _chatRefreshChannels(); }, 2000);
  });
}
/* Toast système pour un nouveau message (throttle 6 s par conversation). */
let _chatToastLast = {};
function _chatToastMsg(row, c) {
  try {
    if (!IS_TAURI || !row || (_userPrefs && _userPrefs.notif && _userPrefs.notif.chatMsg === false)) return;
    const now = Date.now();
    if (_chatToastLast[row.channel] && now - _chatToastLast[row.channel] < 6000) return;
    _chatToastLast[row.channel] = now;
    const who = (c && c.name) || _chT('navLabel');
    const att = row.attachment && (typeof row.attachment === 'object') ? row.attachment : null;
    const body = (row.body && String(row.body).slice(0, 120))
      || (att && att.kind === 'audio' ? '🎙' : att && att.kind === 'sticker' ? '🏷' : att ? '📎' : '…');
    GLG_TOAST.show(who, body);
  } catch (e) {}
}

function _chatTeardownRealtime() {
  try { _chatRtUnsub && _chatRtUnsub(); } catch (e) {}
  _chatRtUnsub = null;
  _chat = { channels: [], current: null, rows: [], typingCh: null, media: null, recTimer: null };
  _refreshChatBadge(0);
  _callTeardownListen();   // raccroche + ferme le canal d'appels au logout
}

async function buildChatPage() {
  const root = $('chat-root'); if (!root) return;
  const configured = !!window.GLG_AUTH?.isConfigured?.();
  const user = configured ? await GLG_AUTH.getUser() : null;
  if (!user) {
    root.innerHTML = `
      <section class="pp-signed-out"><div class="pp-so-inner reveal">
        <div class="pp-so-badge">${_ACCOUNT_ICON}</div>
        <h1 class="pp-so-title">${_chT('navLabel')}</h1>
        <p class="pp-so-desc">${_chT('signedOut')}</p>
        <div class="pp-so-actions">
          <button class="btn btn-primary" onclick="openAuthModal('login')">${_ppt('signIn')}</button>
          <button class="btn btn-outline" onclick="openAuthModal('signup')">${_ppt('createAcc')}</button>
        </div>
      </div></section>`;
    setTimeout(initReveal, 60);
    return;
  }
  _chatMe = user.id;
  _chatEnsureRealtime();
  root.innerHTML = `
    <div class="chat-shell">
      <aside class="chat-rail" id="chat-rail"><p class="lib-sec-note" style="padding:18px">···</p></aside>
      <div class="chat-main" id="chat-main">
        <div class="chat-empty">${_chT('pickConv')}</div>
      </div>
    </div>`;
  await _chatRefreshChannels();
  // Conversation demandée par openChatWith (profil public → « Message »).
  // Peut être un canal complet ou un simple uid (résolu ici, _chatMe connu).
  if (window._chatPending) {
    let ch = window._chatPending; window._chatPending = null;
    if (ch.indexOf(':') < 0) ch = GLG_AUTH.chatDmChannel(_chatMe, ch);
    _chatOpen(ch);
  }
}

async function _chatRefreshChannels() {
  const rail = $('chat-rail'); if (!rail) return;
  const r = await GLG_AUTH.chatChannels();
  _chat.channels = r.channels || [];
  _refreshChatBadge();
  const dms  = _chat.channels.filter(c => c.kind === 'dm');
  const grps = _chat.channels.filter(c => c.kind === 'group');
  const item = c => {
    const last = c.last_body ? escHtml(c.last_body.slice(0, 42))
               : c.last_attach_kind ? ('📎 ' + _chT(c.last_attach_kind === 'image' ? 'attImg' : c.last_attach_kind === 'video' ? 'attVid' : 'attAud'))
               : '';
    return `
    <button class="chat-conv ${c.channel === _chat.current ? 'active' : ''}" data-chan="${escHtml(c.channel)}" onclick="_chatOpen('${escHtml(c.channel)}')">
      <span class="chat-conv-ava">${c.kind === 'group'
        ? `<span class="chat-gava">${escHtml((c.name || '#').trim().charAt(0).toUpperCase())}</span>`
        : _userAvatarHTML({ username: c.name, avatar_url: c.avatar_url })}
        ${c.kind === 'dm' ? `<span class="pp-friend-dot" data-uid="${escHtml(c.other_id || '')}" aria-hidden="true"></span>` : ''}
      </span>
      <span class="chat-conv-body">
        <span class="chat-conv-name">${escHtml(c.name || '')}${c.kind === 'dm' ? _verifiedTag(c.name) : ''}</span>
        <span class="chat-conv-last">${last}</span>
      </span>
      ${c.unread ? `<span class="chat-conv-unread">${c.unread > 99 ? '99+' : c.unread}</span>` : ''}
    </button>`;
  };
  rail.innerHTML = `
    <div class="chat-rail-block">
      <div class="chat-rail-label">${_chT('dms')}</div>
      ${dms.length ? dms.map(item).join('') : `<p class="lib-sec-note chat-rail-note">${_chT('noFriends')}</p>`}
    </div>
    <div class="chat-rail-block">
      <div class="chat-rail-label">${_chT('groups')}
        ${IS_TAURI ? `<button class="chat-rail-add" onclick="_chatOpenGroupModal()" title="${_chT('newGroup')}" aria-label="${_chT('newGroup')}">+</button>` : ''}
      </div>
      ${IS_TAURI
        ? (grps.length ? grps.map(item).join('') : '')
        : `<div class="chat-groups-lock">
             <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5.5" y="10.5" width="13" height="9" rx="1.6" stroke="currentColor" stroke-width="1.4"/><path d="M8.5 10V8a3.5 3.5 0 0 1 7 0v2" stroke="currentColor" stroke-width="1.4"/></svg>
             <p>${_chT('groupsWeb')}</p>
             <button class="lib-sec-btn" onclick="showPage('library')">${_lxt('cta')} ${_ARR()}</button>
           </div>`}
    </div>`;
  document.dispatchEvent(new CustomEvent('glg:presence-changed'));
}

/* Ouvre le MP avec un joueur, bouton « Message » du profil public. */
function openChatWith(uid) {
  if (!uid) return;
  if (_chatMe) window._chatPending = GLG_AUTH.chatDmChannel(_chatMe, uid);
  else window._chatPending = uid; // résolu au build (getUser)
  showPage('chat');
}

async function _chatOpen(channel) {
  _chat.current = channel; _chat.rows = [];
  document.querySelectorAll('.chat-conv').forEach(b => b.classList.toggle('active', b.dataset.chan === channel));
  const c = _chat.channels.find(x => x.channel === channel);
  const main = $('chat-main'); if (!main) return;
  const isGroup = channel.indexOf('g:') === 0;
  main.innerHTML = `
    <div class="chat-head">
      <span class="chat-head-ava">${isGroup
        ? `<span class="chat-gava">${escHtml(((c && c.name) || '#').trim().charAt(0).toUpperCase())}</span>`
        : _userAvatarHTML({ username: (c && c.name) || '', avatar_url: c && c.avatar_url })}</span>
      <span class="chat-head-id">
        <b>${escHtml((c && c.name) || '')}</b>
        <small>${isGroup ? _chT('members').replace('%s', (c && c.members) || '?') : (GLG_PRESENCE.isOnline(c && c.other_id) ? _ft('online') : '')}</small>
      </span>
      <span class="chat-head-actions">
        ${!isGroup && c ? `<button class="chat-ic-btn chat-ic-call" onclick="_callStart('${escHtml(c.other_id || '')}','${escHtml(c.name || '')}')" title="${_chT('call')}" aria-label="${_chT('call')}">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.2 2.4 5 2.1c.4-.1.8.1 1 .5l1 2.1c.2.4.1.8-.2 1.1l-1 1c.7 1.4 1.9 2.6 3.4 3.4l1-1c.3-.3.7-.4 1.1-.2l2.1 1c.4.2.6.6.5 1l-.3 1.8c-.1.5-.5.8-1 .8C7.3 13.6 2.4 8.7 2.4 3.4c0-.5.3-.9.8-1z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
        </button>
        <button class="chat-ic-btn" onclick="openUserProfile('${escHtml(c.other_id || '')}')" title="${_at('profileItem')}" aria-label="${_at('profileItem')}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8.4" r="3.2" stroke="currentColor" stroke-width="1.3"/><path d="M5.4 19c1-3 3.5-4.6 6.6-4.6s5.6 1.6 6.6 4.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
        </button>` : ''}
        ${isGroup ? `<button class="chat-ic-btn chat-ic-call" onclick="_gcallStart()" title="${_chT('gcall')}" aria-label="${_chT('gcall')}">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.2 2.4 5 2.1c.4-.1.8.1 1 .5l1 2.1c.2.4.1.8-.2 1.1l-1 1c.7 1.4 1.9 2.6 3.4 3.4l1-1c.3-.3.7-.4 1.1-.2l2.1 1c.4.2.6.6.5 1l-.3 1.8c-.1.5-.5.8-1 .8C7.3 13.6 2.4 8.7 2.4 3.4c0-.5.3-.9.8-1z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
        </button>
        <button class="chat-ic-btn" onclick="_chatAddMemberModal()" title="${_chT('addMember')}" aria-label="${_chT('addMember')}">+</button>
        <button class="chat-ic-btn chat-ic-danger" onclick="_chatLeaveGroup()" title="${_chT('leave')}" aria-label="${_chT('leave')}">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 2H3.5A1.5 1.5 0 0 0 2 3.5v9A1.5 1.5 0 0 0 3.5 14H6M10.5 11.5 14 8l-3.5-3.5M14 8H6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>` : ''}
      </span>
    </div>
    <div class="chat-msgs" id="chat-msgs"><p class="lib-sec-note" style="padding:20px">···</p></div>
    <div class="chat-typing" id="chat-typing" aria-live="polite"></div>
    <div class="chat-pending" id="chat-pending" hidden></div>
    <div class="chat-compose">
      <button class="chat-ic-btn" id="chat-attach" title="${_chT('attach')}" aria-label="${_chT('attach')}">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M14 7.5 8.7 12.8a3.4 3.4 0 0 1-4.8-4.8L9.2 2.7a2.3 2.3 0 0 1 3.2 3.2L7.2 11a1.1 1.1 0 0 1-1.6-1.6l4.8-4.8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
      </button>
      <button class="chat-ic-btn" id="chat-mic" title="${_chT('record')}" aria-label="${_chT('record')}">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="6" y="1.6" width="4" height="8" rx="2" stroke="currentColor" stroke-width="1.2"/><path d="M3.4 7.4a4.6 4.6 0 0 0 9.2 0M8 12v2.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
      </button>
      <textarea id="chat-input" rows="1" maxlength="4000" placeholder="${_chT('ph')}"></textarea>
      <button class="chat-ic-btn chat-ic-gif" id="chat-gifbtn" title="${_chT('gifT')}" aria-label="${_chT('gifT')}">GIF</button>
      <button class="chat-ic-btn" id="chat-stickbtn" title="${_chT('stickerT')}" aria-label="${_chT('stickerT')}">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.5 4A1.5 1.5 0 0 1 4 2.5h8A1.5 1.5 0 0 1 13.5 4v5L9 13.5H4A1.5 1.5 0 0 1 2.5 12V4z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M9 13.5V10.5A1.5 1.5 0 0 1 10.5 9h3" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
      </button>
      <button class="chat-ic-btn" id="chat-emojibtn" title="${_chT('emojiT')}" aria-label="${_chT('emojiT')}">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6.2" stroke="currentColor" stroke-width="1.2"/><path d="M5.4 9.4a3.4 3.4 0 0 0 5.2 0" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M5.9 6.2h.01M10.1 6.2h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      </button>
      <button class="chat-send" id="chat-send" title="${_chT('send')}" aria-label="${_chT('send')}">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M1.8 8 14 2 11 14 7.6 9.6 1.8 8zM7.6 9.6 14 2" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
      </button>
      <input type="file" id="chat-file" hidden>
      <input type="file" id="chat-gif" hidden accept="image/gif">
    </div>`;
  // Composer : Entrée = envoyer (Maj+Entrée = retour ligne) + auto-hauteur + typing
  const inp = $('chat-input');
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _chatSendCurrent(); }
  });
  inp.addEventListener('input', () => {
    inp.style.height = 'auto'; inp.style.height = Math.min(120, inp.scrollHeight) + 'px';
    _chatTypingPing();
  });
  $('chat-send').addEventListener('click', _chatSendCurrent);
  $('chat-attach').addEventListener('click', () => $('chat-file').click());
  $('chat-file').addEventListener('change', () => _chatFilePicked('chat-file'));
  $('chat-gifbtn').addEventListener('click', ev => { ev.stopPropagation(); _chatGifToggle(); });
  $('chat-gif').addEventListener('change', _chatGifImported);
  $('chat-emojibtn').addEventListener('click', ev => { ev.stopPropagation(); _chatEmojiToggle(); });
  $('chat-stickbtn').addEventListener('click', ev => { ev.stopPropagation(); _chatStickToggle(); });
  $('chat-mic').addEventListener('click', _chatMicStart);
  _chatRenderPending();          // restaure le chip vocal en attente (si présent)
  _chatTypingSetup(channel);

  const r = await GLG_AUTH.chatMessages(channel);
  if (_chat.current !== channel) return;          // conversation changée entre-temps
  _chat.rows = r.messages || [];
  _chatRenderMessages(true);
  GLG_AUTH.chatMarkRead(channel);
  const cc = _chat.channels.find(x => x.channel === channel);
  if (cc) cc.unread = 0;
  _refreshChatBadge();
  document.querySelector(`.chat-conv[data-chan="${channel.replace(/"/g, '')}"] .chat-conv-unread`)?.remove();
  inp.focus();
}

/* ── ENVOI DE FICHIERS : garde-fous sécurité (côté client) ──────────────
   Réalité d'ingénierie : sans backend, PAS de vrai antivirus, ce qu'on
   bloque ici, c'est le vecteur d'infection classique du chat :
     • exécutables/scripts (extension FINALE décisive sous Windows),
     • noms piégés par caractères bidi (photo[U+202E]gnp.exe),
     • archives NON inspectables (.rar/.7z → refusées, .zip exigé),
     • .zip : lecture du répertoire central EN LOCAL → refus si entrée
       chiffrée, exécutable embarqué, nom bidi, zip64 exotique ou taille
       décompressée déclarée > 2 Go (bombe).
   Les fichiers reçus restent INERTES : simple téléchargement, jamais
   d'exécution par le launcher. Un scan serveur (VirusTotal/ClamAV via
   Worker) pourra s'ajouter plus tard sans changer ce flux. */
const _GLG_BAD_EXT = ['exe','msi','msix','appx','application','bat','cmd','com','scr','pif','cpl','msc','jar','js','jse','mjs','vbs','vbe','wsf','wsh','ps1','psm1','reg','hta','lnk','dll','sys','drv','xll','apk','app','dmg','pkg','deb','rpm','sh','bash','run','gadget','iso','img','vhd','vhdx','vb','py'];
const _GLG_OPAQUE_ARCH = ['rar','7z','tar','gz','tgz','bz2','xz','cab','arj','lzh','ace'];
function _glgExt(name) {
  const m = String(name || '').toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  return m ? m[1] : '';
}
function _glgFmtBytes(n) {
  n = +n || 0;
  const mb = LANG === 'fr' ? 'Mo' : 'MB', kb = LANG === 'fr' ? 'Ko' : 'KB';
  if (n >= 1048576) return (n / 1048576).toFixed(1).replace(/\.0$/, '') + ' ' + mb;
  if (n >= 1024) return Math.round(n / 1024) + ' ' + kb;
  return n + ' o';
}
async function _glgFileGuard(f) {
  const name = String(f.name || '');
  if (/[\u202A-\u202E\u2066-\u2069]/.test(name)) return { ok: false, code: 'fileBlocked' };
  const ext = _glgExt(name);
  if (_GLG_BAD_EXT.indexOf(ext) >= 0) return { ok: false, code: 'fileBlocked' };
  if (_GLG_OPAQUE_ARCH.indexOf(ext) >= 0) return { ok: false, code: 'zipOnly' };
  if (ext === 'zip') return _glgZipInspect(f);
  return { ok: true };
}
async function _glgZipInspect(f) {
  try {
    const tailSz = Math.min(f.size, 128 * 1024);
    const tail = new Uint8Array(await f.slice(f.size - tailSz).arrayBuffer());
    let e = -1;      // signature EOCD 50 4B 05 06, cherchée depuis la fin
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) { e = i; break; }
    }
    if (e < 0) return { ok: false, code: 'zipBad' };
    const dv = new DataView(tail.buffer, tail.byteOffset + e);
    const count = dv.getUint16(10, true), cdSize = dv.getUint32(12, true), cdOff = dv.getUint32(16, true);
    if (count === 0xFFFF || cdOff === 0xFFFFFFFF || cdSize > 8 * 1024 * 1024) return { ok: false, code: 'zipBad' };   // zip64/anormal : refus prudent
    const cd = new Uint8Array(await f.slice(cdOff, cdOff + cdSize).arrayBuffer());
    const cdv = new DataView(cd.buffer);
    const td = new TextDecoder();
    let p = 0, total = 0;
    for (let n = 0; n < count; n++) {
      if (p + 46 > cd.length || cdv.getUint32(p, true) !== 0x02014b50) return { ok: false, code: 'zipBad' };
      const flags = cdv.getUint16(p + 8, true);
      if (flags & 0x1) return { ok: false, code: 'zipBad' };                    // entrée chiffrée
      total += cdv.getUint32(p + 24, true);
      const nlen = cdv.getUint16(p + 28, true), elen = cdv.getUint16(p + 30, true), clen = cdv.getUint16(p + 32, true);
      const nm = td.decode(cd.subarray(p + 46, p + 46 + nlen));
      if (_GLG_BAD_EXT.indexOf(_glgExt(nm)) >= 0) return { ok: false, code: 'zipBad' };
      if (/[\u202A-\u202E\u2066-\u2069]/.test(nm)) return { ok: false, code: 'zipBad' };
      p += 46 + nlen + elen + clen;
    }
    if (total > 2 * 1024 * 1024 * 1024) return { ok: false, code: 'zipBad' };   // bombe déclarée
    return { ok: true };
  } catch (err) { return { ok: false, code: 'zipBad' }; }
}

function _chatAttachmentHTML(att, mid) {
  if (!att || !att.url) return '';
  const url = safeMediaUrl(att.url); if (!url) return '';
  // image : clic → visionneuse plein écran ; vidéo : lecteur inline + bouton ⤢
  if (att.kind === 'image') return `
    <button class="chat-att chat-att--img" onclick="_chatMediaOpen(${mid})" title="${escHtml(att.name || '')}">
      <img src="${url}" alt="${escHtml(att.name || '')}" loading="lazy">
    </button>`;
  if (att.kind === 'video') return `
    <span class="chat-att chat-att--vid">
      <video src="${url}" controls preload="metadata"></video>
      <button class="chat-att-expand" onclick="_chatMediaOpen(${mid})" title="⤢" aria-label="⤢">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M9.5 2h4.5v4.5M14 2 9 7M6.5 14H2V9.5M2 14l5-5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
      </button>
    </span>`;
  if (att.kind === 'audio') return `<audio class="chat-att chat-att--aud" src="${url}" controls preload="metadata"></audio>`;
  if (att.kind === 'sticker') return `
    <button class="chat-att chat-att--sticker" onclick="_chatMediaOpen(${mid})" title="${escHtml(att.name || '')}">
      <img src="${url}" alt="${escHtml(att.name || '')}" loading="lazy">
    </button>`;
  const fext = _glgExt(att.name);
  const fic = fext === 'zip' ? '🗜️'
            : ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'].indexOf(fext) >= 0 ? '📄'
            : ['xls', 'xlsx', 'csv', 'ods'].indexOf(fext) >= 0 ? '📊'
            : ['ppt', 'pptx', 'odp'].indexOf(fext) >= 0 ? '📽️' : '📎';
  return `<a class="chat-att chat-att--file" href="${url}" download="${escHtml(att.name || 'fichier')}" target="_blank" rel="noopener" title="${_chT('dl')}">
    <span class="chat-file-ic" aria-hidden="true">${fic}</span>
    <span class="chat-file-meta"><b>${escHtml(att.name || _chT('attFile'))}</b><small>${_glgFmtBytes(att.size)}${fext ? ' · ' + fext.toUpperCase() : ''}</small></span>
    <span class="chat-file-dl" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2v8m0 0 3.2-3.2M8 10 4.8 6.8M2.8 13.2h10.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span></a>`;
}

/* Visionneuse plein écran (image agrandie / vidéo lecture), Échap ou clic
   hors du média pour fermer. */
function _chatMediaOpen(mid) {
  const m = _chat.rows.find(x => x.id === mid);
  const att = m && m.attachment; if (!att) return;
  const url = safeMediaUrl(att.url); if (!url) return;
  document.getElementById('glg-mediaview')?.remove();
  const ov = document.createElement('div');
  ov.id = 'glg-mediaview';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.innerHTML = `
    <button class="mv-close" aria-label="✕">${_XSVG}</button>
    ${att.kind === 'video'
      ? `<video src="${url}" controls autoplay></video>`
      : `<img src="${url}" alt="${escHtml(att.name || '')}">`}
    ${att.name ? `<span class="mv-name">${escHtml(att.name)}</span>` : ''}`;
  const onKey = e => { if (e.key === 'Escape') close(); };
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
  ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('.mv-close')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(ov);
  setTimeout(() => ov.classList.add('open'), 20);
}

/* Message composé UNIQUEMENT d'émojis (≤ 8) → affichage géant façon
   Discord (bulle transparente, taille selon le nombre). Gère ZWJ,
   variantes FE0F, tons de peau, drapeaux (indicateurs régionaux) et
   keycaps, le moindre autre caractère annule le jumbo. */
function _chatEmojiOnly(s) {
  const t = String(s || '').replace(/\s+/g, '');
  if (!t || t.length > 160) return 0;
  const re = /(\p{Extended_Pictographic}[\u{1F3FB}-\u{1F3FF}]?\uFE0F?(?:\u200D\p{Extended_Pictographic}[\u{1F3FB}-\u{1F3FF}]?\uFE0F?)*|\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3)/gu;
  if (t.replace(re, '')) return 0;
  const n = (t.match(re) || []).length;
  return (n > 0 && n <= 8) ? n : 0;
}

function _chatMsgHTML(m, prev) {
  const own = m.sender === _chatMe;
  const c = _chat.channels.find(x => x.channel === _chat.current);
  const name = own ? _chT('you') : (c && c.kind === 'dm' ? (c.name || '') : '');
  let time = '';
  try { time = new Date(m.created_at).toLocaleTimeString(LANG_LOCALE[LANG] || 'en-US', { hour: '2-digit', minute: '2-digit' }); } catch (e) {}
  const compact = prev && prev.sender === m.sender && (new Date(m.created_at) - new Date(prev.created_at)) < 300000;
  const bodyHTML = m.body ? escHtml(m.body).replace(/\n/g, '<br>') : '';
  const jumbo = (!m.attachment && m.body) ? _chatEmojiOnly(m.body) : 0;
  // Réactions : chips { émoji: [uids] }, clic = toggle (optimiste + realtime)
  const rx = m.reactions && Object.keys(m.reactions).length ? `
    <div class="chat-rx">${Object.entries(m.reactions).map(([e, u]) => `
      <button class="chat-rx-chip ${Array.isArray(u) && u.indexOf(_chatMe) >= 0 ? 'mine' : ''}"
        onclick="_chatReact(${m.id}, '${escHtml(e).replace(/'/g, '&#39;')}')">${escHtml(e)} <b>${Array.isArray(u) ? u.length : 0}</b></button>`).join('')}
    </div>` : '';
  return `
  <div class="chat-msg ${own ? 'chat-msg--own' : ''} ${compact ? 'chat-msg--compact' : ''}" data-mid="${m.id}">
    ${!compact ? `<div class="chat-msg-meta"><b>${escHtml(name)}</b><time>${time}</time></div>` : ''}
    <div class="chat-bubble ${!bodyHTML && m.attachment ? 'chat-bubble--media' : ''} ${jumbo ? 'chat-bubble--jumbo ' + (jumbo <= 2 ? 'chat-jumbo--xl' : jumbo <= 4 ? 'chat-jumbo--lg' : 'chat-jumbo--md') : ''}">
      ${bodyHTML ? `<span class="chat-msg-body" id="chat-body-${m.id}">${bodyHTML}</span>` : ''}
      ${_chatAttachmentHTML(m.attachment, m.id)}
      ${m.edited_at ? `<span class="chat-edited">${_chT('edited')}</span>` : ''}
      <span class="chat-msg-tools">
        <button class="chat-tool" onclick="_chatReactOpen(${m.id}, event)" title="${_chT('reactT')}" aria-label="${_chT('reactT')}">☺</button>
        ${own && m.body ? `<button class="chat-tool" onclick="_chatEditStart(${m.id})" title="${_chT('edit')}" aria-label="${_chT('edit')}">✎</button>` : ''}
        ${own ? `<button class="chat-tool" onclick="_chatMsgDelete(${m.id})" title="${_chT('del')}" aria-label="${_chT('del')}">✕</button>` : ''}
      </span>
    </div>
    ${rx}
  </div>`;
}

function _chatRenderMessages(scroll) {
  const box = $('chat-msgs'); if (!box) return;
  if (!_chat.rows.length) { box.innerHTML = `<div class="chat-empty">${_chT('emptyConv')}</div>`; return; }
  let html = _chat.rows.length >= 40 ? `<button class="lib-sec-btn chat-more" onclick="_chatLoadMore()">${_chT('loadMore')}</button>` : '';
  let lastDay = '';
  _chat.rows.forEach((m, i) => {
    let day = '';
    try { day = new Date(m.created_at).toLocaleDateString(LANG_LOCALE[LANG] || 'en-US', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) {}
    if (day && day !== lastDay) { html += `<div class="chat-day"><span>${day}</span></div>`; lastDay = day; }
    html += _chatMsgHTML(m, i > 0 ? _chat.rows[i - 1] : null);
  });
  box.innerHTML = html;
  if (scroll) box.scrollTop = box.scrollHeight;
}

async function _chatLoadMore() {
  if (!_chat.rows.length) return;
  const r = await GLG_AUTH.chatMessages(_chat.current, _chat.rows[0].id);
  if (r.messages && r.messages.length) {
    _chat.rows = r.messages.concat(_chat.rows);
    _chatRenderMessages(false);
  } else { document.querySelector('.chat-more')?.remove(); }
}

async function _chatSendCurrent() {
  const inp = $('chat-input'); if (!inp || !_chat.current) return;
  const txt = inp.value.trim();
  const voice = _chatVoice;
  if (!txt && !voice) return;
  inp.value = ''; inp.style.height = 'auto';
  // Note vocale en attente (chip façon Instagram) : uploadée à L'ENVOI -
  // le même message porte la voix ET l'éventuel texte tapé avec.
  let attachment = null;
  if (voice) {
    _chatNote('⬆ …');
    const file = new File([voice.blob], 'note-vocale-' + Date.now() + '.webm', { type: voice.blob.type || 'audio/webm' });
    const up = await GLG_AUTH.chatUpload(file);
    _chatNote('');
    if (!up.ok) { _chatNote(up.code === 'size' ? _chT('tooBig') : '✕'); if (txt) inp.value = txt; return; }
    attachment = up.attachment;
    try { URL.revokeObjectURL(voice.url); } catch (e) {}
    _chatVoice = null; _chatRenderPending();
  }
  const r = await GLG_AUTH.chatSend(_chat.current, txt || null, attachment);
  if (r.ok && r.message && !_chat.rows.some(x => x.id === r.message.id)) {
    _chat.rows.push(r.message); _chatRenderMessages(true);
  }
  _chatRefreshChannels();
}

async function _chatFilePicked(inputId) {
  const inp = $(inputId || 'chat-file');
  const f = inp?.files?.[0]; if (!f || !_chat.current) return;
  inp.value = '';
  if (f.size > 50 * 1024 * 1024) { _chatNote(_chT('tooBig')); return; }
  const guard = await _glgFileGuard(f);
  if (!guard.ok) { _chatNote(_chT(guard.code)); return; }
  _chatNote('⬆ …');
  const up = await GLG_AUTH.chatUpload(f);
  _chatNote('');
  if (!up.ok) { _chatNote(up.code === 'size' ? _chT('tooBig') : '✕'); return; }
  const r = await GLG_AUTH.chatSend(_chat.current, null, up.attachment);
  if (r.ok && r.message && !_chat.rows.some(x => x.id === r.message.id)) {
    _chat.rows.push(r.message); _chatRenderMessages(true);
  }
  _chatRefreshChannels();
}
function _chatNote(t) { const el = $('chat-typing'); if (el) { el.textContent = t || ''; el.classList.toggle('on', !!t); } }

/* ── NOTE VOCALE v2 (façon Instagram) ────────────────────────────────────
   Micro → POP-UP CENTRÉE avec visualiseur audio réactif (AnalyserNode :
   les barres suivent l'intensité RÉELLE de la voix). « Valider » →
   CHIP vocal dans le composer (lecture/pause, mini-forme d'onde issue de
   l'enregistrement, durée, retrait), l'envoi se fait par le bouton ➤ ou
   Entrée, éventuellement accompagné d'un texte (même message). ── */
let _chatVoice = null;      // { blob, url, dur, peaks[] }, chip en attente
let _chatRecSess = null;    // session d'enregistrement en cours

function _chatRecModalOpen() {
  document.getElementById('glg-recmodal')?.remove();
  const ov = document.createElement('div');
  ov.id = 'glg-recmodal';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.setAttribute('aria-label', _chT('record'));
  ov.innerHTML = `
    <div class="rm-card">
      <div class="rm-head">
        <span class="rm-mic" aria-hidden="true">
          <svg width="17" height="17" viewBox="0 0 16 16" fill="none"><rect x="6" y="1.6" width="4" height="8" rx="2" stroke="currentColor" stroke-width="1.2"/><path d="M3.4 7.4a4.6 4.6 0 0 0 9.2 0M8 12v2.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
        </span>
        <span class="rm-title">${_chT('record')}</span>
        <span class="rm-time" id="rm-time">0:00</span>
      </div>
      <div class="rm-viz" id="rm-viz" aria-hidden="true">${'<i></i>'.repeat(28)}</div>
      <div class="rm-actions">
        <button class="auth-link" id="rm-cancel">${_chT('recCancel')}</button>
        <button class="btn btn-primary" id="rm-ok">${_chT('confirm')}</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  ov.querySelector('#rm-cancel').addEventListener('click', () => _chatMicFinish(false));
  ov.querySelector('#rm-ok').addEventListener('click', () => _chatMicFinish(true));
  setTimeout(() => ov.classList.add('open'), 20);
}

async function _chatMicStart() {
  if (_chatRecSess || !_chat.current) return;
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia(_glgMicConstraints()); }
  catch (e) { _chatNote(_chT('recDenied')); return; }
  let rec;
  try { rec = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' }); }
  catch (e) { rec = new MediaRecorder(stream); }
  const chunks = [];
  rec.ondataavailable = ev => { if (ev.data && ev.data.size) chunks.push(ev.data); };
  // Analyse temps réel de l'intensité vocale (échec ≠ bloquant : les barres
  // retombent sur une animation neutre si l'AudioContext est indisponible).
  // ⚠ resume() OBLIGATOIRE : l'AudioContext naît « suspended » (politique
  // autoplay, le geste utilisateur est consommé par le await getUserMedia)
  // et un contexte suspendu renvoie des zéros → barres inertes.
  let ctx = null, analyser = null;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) {} }
    const src = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;                 // domaine TEMPOREL (RMS voix)
    analyser.smoothingTimeConstant = 0.6;
    src.connect(analyser);
  } catch (e) {}
  _chatRecSess = { rec, stream, ctx, analyser, chunks, t0: Date.now(), peaks: [], raf: 0, timer: 0 };
  rec.start(250);
  _chatRecModalOpen();

  const data = analyser ? new Uint8Array(analyser.fftSize) : null;
  const bars = [...document.querySelectorAll('#rm-viz i')];
  const loop = () => {
    if (!_chatRecSess) return;
    let level = 0.12;
    if (analyser && data) {
      // RMS du signal temporel = intensité RÉELLE de la voix (fiable même
      // avec noiseSuppression, contrairement au spectre fréquentiel)
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) { const d = (data[i] - 128) / 128; sum += d * d; }
      level = Math.min(1, Math.sqrt(sum / data.length) * 3.4);   // parole ≈ RMS .05-.2
    }
    const t = Date.now() / 1000;
    bars.forEach((b, i) => {
      const c = Math.abs(i - (bars.length - 1) / 2) / (bars.length / 2);   // symétrie centrale
      const h = 6 + level * 52 * (1 - c * 0.72) * (0.78 + 0.22 * Math.sin(t * 7 + i * 1.3));
      b.style.height = Math.max(4, Math.round(h)) + 'px';
    });
    _chatRecSess.peaks.push(level);          // mémorisé → mini-forme d'onde du chip
    _chatRecSess.raf = requestAnimationFrame(loop);
  };
  _chatRecSess.raf = requestAnimationFrame(loop);
  _chatRecSess.timer = setInterval(() => {
    if (!_chatRecSess) return;
    const s = Math.floor((Date.now() - _chatRecSess.t0) / 1000);
    const el = $('rm-time'); if (el) el.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    if (s >= 120) _chatMicFinish(true);      // 2 min max
  }, 400);
}

function _chatMicFinish(keep) {
  const s = _chatRecSess; if (!s) return;
  _chatRecSess = null;
  cancelAnimationFrame(s.raf); clearInterval(s.timer);
  s.rec.onstop = () => {
    try { s.stream.getTracks().forEach(t => t.stop()); } catch (e) {}
    try { s.ctx && s.ctx.close(); } catch (e) {}
    document.getElementById('glg-recmodal')?.remove();
    if (!keep || !s.chunks.length) return;
    const blob = new Blob(s.chunks, { type: s.rec.mimeType || 'audio/webm' });
    const dur = Math.max(1, Math.round((Date.now() - s.t0) / 1000));
    // Ré-échantillonne les pics (~60/s) en 36 barres statiques normalisées
    const N = 36, out = [];
    const step = Math.max(1, Math.floor(s.peaks.length / N));
    for (let i = 0; i < N; i++) {
      const seg = s.peaks.slice(i * step, (i + 1) * step);
      out.push(seg.length ? seg.reduce((a, b) => a + b, 0) / seg.length : 0);
    }
    const mx = Math.max(0.08, ...out);
    if (_chatVoice) { try { URL.revokeObjectURL(_chatVoice.url); } catch (e) {} }
    _chatVoice = { blob, url: URL.createObjectURL(blob), dur, peaks: out.map(v => v / mx) };
    _chatRenderPending();
    $('chat-input')?.focus();
  };
  s.rec.stop();
}

/* Chip vocal en attente dans le composer (lecture, forme d'onde, retrait). */
function _chatRenderPending() {
  const host = $('chat-pending'); if (!host) return;
  if (!_chatVoice) { host.innerHTML = ''; host.hidden = true; return; }
  const dur = Math.floor(_chatVoice.dur / 60) + ':' + String(_chatVoice.dur % 60).padStart(2, '0');
  host.hidden = false;
  host.innerHTML = `
    <div class="chat-vc">
      <button class="chat-vc-play" id="chat-vc-play" title="${_chT('playA')}" aria-label="${_chT('playA')}">
        <svg class="vc-i-play" width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2.5 1.5l8 4.5-8 4.5v-9z" fill="currentColor"/></svg>
        <svg class="vc-i-pause" width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M3 1.5v9M9 1.5v9" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
      </button>
      <span class="chat-vc-wave" aria-hidden="true">${_chatVoice.peaks.map(p => `<i style="height:${Math.max(14, Math.round(p * 100))}%"></i>`).join('')}</span>
      <span class="chat-vc-dur">${dur}</span>
      <button class="chat-vc-x" aria-label="${_ft('remove')}" title="${_ft('remove')}">${_XSVG}</button>
      <audio id="chat-vc-audio" src="${_chatVoice.url}"></audio>
    </div>`;
  const audio = $('chat-vc-audio'), play = $('chat-vc-play');
  play.addEventListener('click', () => { if (audio.paused) audio.play(); else audio.pause(); });
  const setP = on => { play.classList.toggle('on', on); play.title = on ? _chT('pauseA') : _chT('playA'); play.setAttribute('aria-label', play.title); };
  audio.addEventListener('play', () => setP(true));
  audio.addEventListener('pause', () => setP(false));
  audio.addEventListener('ended', () => setP(false));
  host.querySelector('.chat-vc-x').addEventListener('click', () => {
    try { URL.revokeObjectURL(_chatVoice.url); } catch (e) {}
    _chatVoice = null; _chatRenderPending();
  });
}

/* ── Édition / suppression de SES messages ── */
function _chatEditStart(id) {
  const m = _chat.rows.find(x => x.id === id); if (!m || m.sender !== _chatMe) return;
  const span = $('chat-body-' + id); if (!span) return;
  span.outerHTML = `<span class="chat-edit-zone" id="chat-body-${id}">
      <textarea id="chat-edit-${id}" rows="2" maxlength="4000">${escHtml(m.body || '')}</textarea>
      <span class="chat-edit-actions">
        <button class="lib-sec-btn" onclick="_chatEditSave(${id})">${_chT('save')}</button>
        <button class="lib-sec-btn" onclick="_chatRenderMessages()">${_chT('recCancel')}</button>
      </span>
    </span>`;
  $('chat-edit-' + id)?.focus();
}
async function _chatEditSave(id) {
  const v = $('chat-edit-' + id)?.value?.trim(); if (!v) return;
  const r = await GLG_AUTH.chatEdit(id, v);
  if (r.ok) {
    const m = _chat.rows.find(x => x.id === id);
    if (m) { m.body = v; m.edited_at = new Date().toISOString(); }
  }
  _chatRenderMessages();
}
async function _chatMsgDelete(id) {
  const r = await GLG_AUTH.chatDelete(id);
  if (r.ok) { _chat.rows = _chat.rows.filter(x => x.id !== id); _chatRenderMessages(); _chatRefreshChannels(); }
}

/* ── Indicateur « écrit… » (broadcast éphémère, jamais stocké) ── */
let _chatTypingLast = 0, _chatTypingHide = null;
function _chatTypingSetup(channel) {
  const sb = window.GLG_AUTH?.getClient?.(); if (!sb) return;
  if (_chat.typingCh) { try { sb.removeChannel(_chat.typingCh); } catch (e) {} }
  _chat.typingCh = sb.channel('glg:typing:' + channel);
  _chat.typingCh.on('broadcast', { event: 'typing' }, p => {
    if (!p?.payload || p.payload.uid === _chatMe) return;
    const el = $('chat-typing'); if (!el) return;
    el.textContent = _chT('typing').replace('%s', p.payload.name || '…');
    el.classList.add('on');
    clearTimeout(_chatTypingHide);
    _chatTypingHide = setTimeout(() => el.classList.remove('on'), 3500);
  }).subscribe();
}
function _chatTypingPing() {
  const now = Date.now();
  if (now - _chatTypingLast < 2500 || !_chat.typingCh) return;
  _chatTypingLast = now;
  try {
    _chat.typingCh.send({ type: 'broadcast', event: 'typing',
      payload: { uid: _chatMe, name: (_accountProfile && _accountProfile.username) || '' } });
  } catch (e) {}
}

/* ── Groupes : création / ajout de membre / départ (modales légères) ── */
function _chatOpenGroupModal() {
  const m = $('glg-auth-modal'); if (!m) return;
  const friends = (_friendsCache && _friendsCache.friends) || [];
  m.innerHTML = `
    <div class="auth-box fr-modal" role="dialog" aria-modal="true" aria-label="${_chT('newGroup')}">
      <button class="auth-close" onclick="closeAuthModal()" aria-label="Close">${_XSVG}</button>
      <h3 class="auth-title">${_chT('newGroup')}</h3>
      <input type="text" id="chat-gname" class="auth-input" maxlength="60" placeholder="${_chT('groupName')}" style="margin-bottom:14px">
      <div class="chat-gm-list">
        ${friends.length ? friends.map(u => `
        <label class="chat-gm-row">
          <input type="checkbox" value="${escHtml(u.id)}">
          <span class="pp-fr-ava">${_userAvatarHTML(u)}</span>
          <span>${escHtml(u.username || '')}</span>
        </label>`).join('') : `<p class="lib-sec-note">${_chT('noFriends')}</p>`}
      </div>
      <button class="btn btn-primary" style="margin-top:16px" onclick="_chatCreateGroup()">${_chT('create')}</button>
    </div>`;
  m.classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => $('chat-gname')?.focus(), 60);
}
async function _chatCreateGroup() {
  const name = $('chat-gname')?.value?.trim(); if (!name) return;
  const ids = [...document.querySelectorAll('.chat-gm-row input:checked')].map(i => i.value);
  const r = await GLG_AUTH.chatGroupCreate(name, ids);
  closeAuthModal();
  if (r.ok) { await _chatRefreshChannels(); _chatOpen('g:' + r.gid); }
}
function _chatAddMemberModal() {
  const m = $('glg-auth-modal'); if (!m || !_chat.current || _chat.current.indexOf('g:') !== 0) return;
  const friends = (_friendsCache && _friendsCache.friends) || [];
  m.innerHTML = `
    <div class="auth-box fr-modal" role="dialog" aria-modal="true" aria-label="${_chT('addMember')}">
      <button class="auth-close" onclick="closeAuthModal()" aria-label="Close">${_XSVG}</button>
      <h3 class="auth-title">${_chT('addMember')}</h3>
      <div class="chat-gm-list">
        ${friends.length ? friends.map(u => `
        <button class="chat-gm-row chat-gm-row--btn" onclick="_chatAddMember('${escHtml(u.id)}')">
          <span class="pp-fr-ava">${_userAvatarHTML(u)}</span>
          <span>${escHtml(u.username || '')}</span>
        </button>`).join('') : `<p class="lib-sec-note">${_chT('noFriends')}</p>`}
      </div>
    </div>`;
  m.classList.add('open');
  document.body.style.overflow = 'hidden';
}
async function _chatAddMember(uid) {
  const gid = parseInt(String(_chat.current).slice(2), 10);
  await GLG_AUTH.chatGroupAdd(gid, uid);
  closeAuthModal();
  _chatRefreshChannels();
}
async function _chatLeaveGroup() {
  const gid = parseInt(String(_chat.current).slice(2), 10);
  await GLG_AUTH.chatGroupLeave(gid);
  _chat.current = null;
  const main = $('chat-main'); if (main) main.innerHTML = `<div class="chat-empty">${_chT('pickConv')}</div>`;
  _chatRefreshChannels();
}

/* ══════════════════════════════════════════
   APPELS VOCAUX 1:1, WebRTC pair-à-pair, qualité « Nitro » :
   opus (echoCancellation + noiseSuppression + autoGainControl, 64 kbps),
   liaison DIRECTE entre les deux joueurs (la distance ne dégrade pas :
   seul leur débit compte). Signalisation : Supabase broadcast éphémère
   (glg:call:<uid>, chacun écoute SON canal, on émet sur celui de l'autre).
   Garde-fou : seuls les AMIS peuvent faire sonner (vérifié à la réception).
══════════════════════════════════════════ */
/* Sonnerie d'appel entrant, deux tons WebAudio, boucle 2 s (façon Discord). */
let _ringCtx = null, _ringIv = null;
function _ringStart() {
  if (_ringIv) return;
  try {
    _ringCtx = _ringCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (_ringCtx.state === 'suspended') { const r = _ringCtx.resume(); if (r && r.catch) r.catch(() => {}); }
    const beep = () => { try {
      const t = _ringCtx.currentTime;
      [880, 660].forEach((f, i) => {
        const o = _ringCtx.createOscillator(), g = _ringCtx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0, t + i * .3);
        g.gain.linearRampToValueAtTime(.11, t + i * .3 + .05);
        g.gain.exponentialRampToValueAtTime(.001, t + i * .3 + .28);
        o.connect(g); g.connect(_ringCtx.destination);
        o.start(t + i * .3); o.stop(t + i * .3 + .32);
      });
    } catch (e) {} };
    beep(); _ringIv = setInterval(beep, 2000);
  } catch (e) {}
}
function _ringStop() { clearInterval(_ringIv); _ringIv = null; }

let _call = { pc:null, stream:null, otherId:null, otherName:'', state:'idle', t0:0, timer:null,
              sendCh:null, sendReady:false, sendQ:[], pendingOffer:null, iceQueue:[], ringTimeout:null };
let _callMyCh = null;
const _CALL_ICE = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] };

/* Canal personnel de réception, démarré à la connexion (chat realtime). */
function _callListen() {
  const sb = window.GLG_AUTH?.getClient?.();
  if (!sb || _callMyCh || !_chatMe) return;
  _callMyCh = sb.channel('glg:call:' + _chatMe);
  _callMyCh.on('broadcast', { event: 'sig' }, p => { try { _callOnSignal(p.payload || {}); } catch (e) {} }).subscribe();
}
function _callTeardownListen() {
  const sb = window.GLG_AUTH?.getClient?.();
  try { _callMyCh && sb && sb.removeChannel(_callMyCh); } catch (e) {}
  _callMyCh = null;
  if (_call.state !== 'idle') _callEnd(false);
  if (_gcall.state !== 'idle') _gcallEnd(false);   // appel de groupe → raccroche au logout
}
/* Émission one-shot (decline/busy, pas de canal d'appel ouvert). */
function _callSendTo(uid, payload) {
  try {
    const sb = window.GLG_AUTH?.getClient?.(); if (!sb || !uid) return;
    const ch = sb.channel('glg:call:' + uid);
    ch.subscribe(st => {
      if (st === 'SUBSCRIBED') {
        ch.send({ type: 'broadcast', event: 'sig', payload });
        setTimeout(() => { try { sb.removeChannel(ch); } catch (e) {} }, 1500);
      }
    });
  } catch (e) {}
}
/* Canal d'émission de l'appel EN COURS (offre/réponse/ICE/fin). */
function _callOpenSendCh(uid) {
  const sb = window.GLG_AUTH?.getClient?.(); if (!sb) return;
  _call.sendQ = []; _call.sendReady = false;
  _call.sendCh = sb.channel('glg:call:' + uid);
  _call.sendCh.subscribe(st => {
    if (st === 'SUBSCRIBED') {
      _call.sendReady = true;
      (_call.sendQ || []).forEach(p => _call.sendCh.send({ type: 'broadcast', event: 'sig', payload: p }));
      _call.sendQ = [];
    }
  });
}
function _callSend(p) {
  if (_call.sendReady && _call.sendCh) _call.sendCh.send({ type: 'broadcast', event: 'sig', payload: p });
  else (_call.sendQ = _call.sendQ || []).push(p);
}

/* Contraintes micro : qualité voix + périphérique choisi dans Options →
   Voix & vidéo (prefs.av.micId). Utilisé par les APPELS et les NOTES VOCALES. */
function _glgMicConstraints() {
  const av = (_userPrefs && _userPrefs.av) || {};
  const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  if (av.micId) audio.deviceId = { exact: av.micId };
  return { audio };
}

function _callAudioEl() {
  let a = document.getElementById('glg-call-audio');
  if (!a) { a = document.createElement('audio'); a.id = 'glg-call-audio'; a.autoplay = true; document.body.appendChild(a); }
  // Sortie audio choisie dans Options → Voix & vidéo (setSinkId si dispo)
  const av = (_userPrefs && _userPrefs.av) || {};
  if (av.outId && a.setSinkId) { try { const p = a.setSinkId(av.outId); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
  return a;
}
function _callNewPC() {
  const pc = new RTCPeerConnection(_CALL_ICE);
  _call.pc = pc;
  pc.onicecandidate = ev => { if (ev.candidate) _callSend({ t: 'ice', from: _chatMe, cand: ev.candidate.toJSON() }); };
  pc.ontrack = ev => {
    const a = _callAudioEl();
    a.srcObject = ev.streams[0];
    const pr = a.play && a.play(); if (pr && pr.catch) pr.catch(() => {});
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected' && _call.state !== 'live') {
      _call.state = 'live'; _call.t0 = Date.now(); _callStartTimer(); _callRenderBar();
    }
    if ((pc.connectionState === 'failed' || pc.connectionState === 'closed' ||
         pc.connectionState === 'disconnected') && _call.state === 'live') {
      _callEnd(false);
    }
  };
  return pc;
}
/* Qualité : plafond opus 64 kbps (voix cristalline, au-delà = inutile). */
function _callTune(pc) {
  try {
    pc.getSenders().forEach(s => {
      if (s.track && s.track.kind === 'audio') {
        const p = s.getParameters();
        p.encodings = [{ maxBitrate: 64000 }];
        const pr = s.setParameters(p); if (pr && pr.catch) pr.catch(() => {});
      }
    });
  } catch (e) {}
}

async function _callStart(uid, name) {
  if (!uid || _call.state !== 'idle' || _gcall.state !== 'idle' || uid === _chatMe) return;
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia(_glgMicConstraints()); }
  catch (e) { _chatNote(_chT('recDenied')); return; }
  _call.state = 'ringing-out'; _call.otherId = uid; _call.otherName = name || ''; _call.stream = stream; _call.iceQueue = [];
  _callOpenSendCh(uid);
  const pc = _callNewPC();
  stream.getTracks().forEach(tr => pc.addTrack(tr, stream));
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  _callTune(pc);
  _callSend({ t: 'ring', from: _chatMe, name: (_accountProfile && _accountProfile.username) || '', sdp: offer.sdp });
  _callRenderBar();
  // Sans réponse au bout de 45 s → on raccroche proprement
  _call.ringTimeout = setTimeout(() => { if (_call.state === 'ringing-out') _callEnd(true); }, 45000);
}

async function _callOnSignal(s) {
  if (!s || !s.t) return;
  if (s.t.charAt(0) === 'g') return _gcallOnSignal(s);   // appels de GROUPE (module dédié)
  if (s.t === 'ring') {
    if (_call.state !== 'idle' || _gcall.state !== 'idle') { _callSendTo(s.from, { t: 'busy', from: _chatMe }); return; }
    // Garde-fou : seuls les AMIS acceptés peuvent faire sonner
    let ok = ((_friendsCache && _friendsCache.friends) || []).some(f => f.id === s.from)
          || _chat.channels.some(c => c.kind === 'dm' && c.other_id === s.from);
    if (!ok) { try { const r = await GLG_AUTH.friendsList(); ok = (r.friends || []).some(f => f.id === s.from); } catch (e) {} }
    if (!ok) return;
    _call.state = 'ringing-in'; _call.otherId = s.from; _call.otherName = s.name || '';
    _call.pendingOffer = s.sdp; _call.iceQueue = [];
    _callRenderBar();
    _ringStart();
    GLG_TOAST.show(s.name || 'GLG', _chT('incoming').replace('%s', s.name || ''));
  } else if (s.t === 'answer') {
    if (_call.state !== 'ringing-out' || !_call.pc) return;
    clearTimeout(_call.ringTimeout);
    try { await _call.pc.setRemoteDescription({ type: 'answer', sdp: s.sdp }); } catch (e) { _callEnd(true); }
  } else if (s.t === 'ice') {
    if (_call.pc && _call.pc.remoteDescription) { try { await _call.pc.addIceCandidate(s.cand); } catch (e) {} }
    else if (s.cand) (_call.iceQueue = _call.iceQueue || []).push(s.cand);
  } else if (s.t === 'decline' || s.t === 'busy') {
    if (_call.state === 'ringing-out') { if (s.t === 'busy') _chatNote(_chT('busy')); _callEnd(false); }
  } else if (s.t === 'end') {
    if (_call.state !== 'idle' && s.from === _call.otherId) _callEnd(false);
  }
}

async function _callAccept() {
  if (_call.state !== 'ringing-in' || !_call.pendingOffer) return;
  _ringStop();
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia(_glgMicConstraints()); }
  catch (e) { _callDecline(); return; }
  _call.stream = stream;
  _callOpenSendCh(_call.otherId);
  const pc = _callNewPC();
  stream.getTracks().forEach(tr => pc.addTrack(tr, stream));
  try {
    await pc.setRemoteDescription({ type: 'offer', sdp: _call.pendingOffer });
    (_call.iceQueue || []).forEach(c => { const pr = pc.addIceCandidate(c); if (pr && pr.catch) pr.catch(() => {}); });
    _call.iceQueue = [];
    const ans = await pc.createAnswer();
    await pc.setLocalDescription(ans);
    _callTune(pc);
    _callSend({ t: 'answer', from: _chatMe, sdp: ans.sdp });
    _call.state = 'connecting';
    _callRenderBar();
  } catch (e) { _callEnd(true); }
}
function _callDecline() {
  _callSendTo(_call.otherId, { t: 'decline', from: _chatMe });
  _callEnd(false);
}
function _callToggleMute() {
  if (!_call.stream) return;
  _call.stream.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
  const muted = _call.stream.getAudioTracks().some(t => !t.enabled);
  const b = document.getElementById('cb-mute');
  if (b) { b.classList.toggle('off', muted); b.title = muted ? _chT('unmute') : _chT('mute'); b.setAttribute('aria-label', b.title); }
}
function _callEnd(notify) {
  if (notify === undefined) notify = true;
  _ringStop();
  if (notify && _call.otherId) {
    if (_call.sendReady) _callSend({ t: 'end', from: _chatMe });
    else _callSendTo(_call.otherId, { t: 'end', from: _chatMe });
  }
  try { _call.pc && _call.pc.close(); } catch (e) {}
  try { (_call.stream ? _call.stream.getTracks() : []).forEach(t => t.stop()); } catch (e) {}
  clearInterval(_call.timer); clearTimeout(_call.ringTimeout);
  const sb = window.GLG_AUTH?.getClient?.();
  try { _call.sendCh && sb && sb.removeChannel(_call.sendCh); } catch (e) {}
  const a = document.getElementById('glg-call-audio'); if (a) a.srcObject = null;
  _call = { pc:null, stream:null, otherId:null, otherName:'', state:'idle', t0:0, timer:null,
            sendCh:null, sendReady:false, sendQ:[], pendingOffer:null, iceQueue:[], ringTimeout:null };
  _callRenderBar();
}
function _callStartTimer() {
  clearInterval(_call.timer);
  _call.timer = setInterval(() => {
    const el = document.getElementById('cb-timer'); if (!el) return;
    const s = Math.floor((Date.now() - _call.t0) / 1000);
    el.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }, 1000);
}

/* Carte d'appel flottante (indépendante de la page, l'appel survit à la
   navigation dans le launcher, comme Discord). */
function _callRenderBar() {
  document.getElementById('glg-callbar')?.remove();
  if (_call.state === 'idle') return;
  const bar = document.createElement('div');
  bar.id = 'glg-callbar';
  const phoneIco = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.2 2.4 5 2.1c.4-.1.8.1 1 .5l1 2.1c.2.4.1.8-.2 1.1l-1 1c.7 1.4 1.9 2.6 3.4 3.4l1-1c.3-.3.7-.4 1.1-.2l2.1 1c.4.2.6.6.5 1l-.3 1.8c-.1.5-.5.8-1 .8C7.3 13.6 2.4 8.7 2.4 3.4c0-.5.3-.9.8-1z" fill="currentColor"/></svg>';
  const hangIco  = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M1.6 9.4C3.3 7.3 5.5 6.2 8 6.2s4.7 1.1 6.4 3.2c.3.4.3.9-.1 1.2l-1.3 1.2c-.3.3-.8.3-1.1 0l-1.5-1.3c-.2-.2-.3-.5-.3-.8v-1c-1.4-.5-2.8-.5-4.2 0v1c0 .3-.1.6-.3.8l-1.5 1.3c-.3.3-.8.3-1.1 0L1.7 10.6c-.4-.3-.4-.8-.1-1.2z" fill="currentColor"/></svg>';
  const micIco   = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="6" y="1.6" width="4" height="8" rx="2" stroke="currentColor" stroke-width="1.2"/><path d="M3.4 7.4a4.6 4.6 0 0 0 9.2 0M8 12v2.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>';
  if (_call.state === 'ringing-in') {
    bar.innerHTML = `
    <div class="cb-card cb-card--ring">
      <span class="cb-pulse" aria-hidden="true">${phoneIco}</span>
      <span class="cb-id"><b>${escHtml(_call.otherName || '')}</b><small>${_chT('incoming').replace('%s', escHtml(_call.otherName || ''))}</small></span>
      <span class="cb-actions">
        <button class="cb-btn cb-btn--ok" onclick="_callAccept()" title="${_chT('accept')}" aria-label="${_chT('accept')}">${phoneIco}</button>
        <button class="cb-btn cb-btn--no" onclick="_callDecline()" title="${_ft('decline')}" aria-label="${_ft('decline')}">${hangIco}</button>
      </span>
    </div>`;
  } else {
    const status = _call.state === 'live'
      ? `<span id="cb-timer">0:00</span>`
      : `<small>${_chT('calling')}</small>`;
    bar.innerHTML = `
    <div class="cb-card ${_call.state === 'live' ? 'cb-card--live' : ''}">
      <span class="${_call.state === 'live' ? 'cb-live-dot' : 'cb-pulse'}" aria-hidden="true">${phoneIco}</span>
      <span class="cb-id"><b>${escHtml(_call.otherName || '')}</b>${status}</span>
      <span class="cb-actions">
        ${_call.state === 'live' ? `<button class="cb-btn cb-btn--mute" id="cb-mute" onclick="_callToggleMute()" title="${_chT('mute')}" aria-label="${_chT('mute')}">${micIco}</button>` : ''}
        <button class="cb-btn cb-btn--no" onclick="_callEnd()" title="${_chT('hangup')}" aria-label="${_chT('hangup')}">${hangIco}</button>
      </span>
    </div>`;
  }
  document.body.appendChild(bar);
}

/* ══════════════════════════════════════════
   APPELS DE GROUPE, mesh WebRTC : chaque paire de participants est
   reliée en DIRECT (parfait jusqu'à ~6-8 joueurs), sonnerie individuelle
   (chacun accepte ou refuse, comme Discord). Signalisation :
   · sonnerie + SDP/ICE par PAIRE → canaux personnels glg:call:<uid>
     (messages préfixés g*, routés par _callOnSignal → _gcallOnSignal)
   · roster → canal broadcast de salon glg:groom:<room> (hello/here)
   · anti-glare : sur chaque paire, le plus GRAND uid crée l'offre.
══════════════════════════════════════════ */
let _gcall = _gcFresh();
function _gcFresh(){ return { state:'idle', room:null, gid:null, gname:'', fromId:null, fromName:'',
  stream:null, peers:{}, roomCh:null, muted:false, t0:0, timer:null, ringTimeout:null }; }
function _gcMyName(){ return (_accountProfile && _accountProfile.username) || ''; }

async function _gcallStart() {
  if (!_chat.current || String(_chat.current).indexOf('g:') !== 0) return;
  if (_call.state !== 'idle' || _gcall.state !== 'idle') return;
  const gid = parseInt(String(_chat.current).slice(2), 10);
  const cc = _chat.channels.find(x => x.channel === _chat.current);
  let members = [];
  try { const r = await GLG_AUTH.chatGroupMembers(gid); members = (r && r.members) || []; } catch (e) {}
  const others = members.filter(m => m && m.id && m.id !== _chatMe);
  if (!others.length) return;
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia(_glgMicConstraints()); }
  catch (e) { _chatNote(_chT('recDenied')); return; }
  _gcall = _gcFresh();
  _gcall.state = 'ringing-out'; _gcall.stream = stream;
  _gcall.gid = gid; _gcall.gname = (cc && cc.name) || '';
  _gcall.room = 'r' + gid + '-' + Date.now().toString(36);
  _gcJoinRoom();
  others.forEach(m => _callSendTo(m.id, { t:'gring', from:_chatMe, name:_gcMyName(), room:_gcall.room, gid, gname:_gcall.gname }));
  _gcRenderBar();
  // personne n'a rejoint au bout de 60 s → on raccroche proprement
  _gcall.ringTimeout = setTimeout(() => {
    if (_gcall.state === 'ringing-out' && !Object.values(_gcall.peers).some(p => p.live)) _gcallEnd(false);
  }, 60000);
}

async function _gcallOnSignal(s) {
  if (s.t === 'gring') {
    if (_call.state !== 'idle' || _gcall.state !== 'idle') { _callSendTo(s.from, { t:'gdecline', from:_chatMe, room:s.room }); return; }
    // Garde-fou : la RPC membres ne répond que si JE suis membre du groupe -
    // et on vérifie que l'appelant en fait bien partie.
    let ok = false;
    try { const r = await GLG_AUTH.chatGroupMembers(s.gid); ok = ((r && r.members) || []).some(m => m && m.id === s.from); } catch (e) {}
    if (!ok || _gcall.state !== 'idle') return;
    _gcall = _gcFresh();
    _gcall.state = 'ringing-in'; _gcall.room = s.room; _gcall.gid = s.gid;
    _gcall.gname = s.gname || ''; _gcall.fromId = s.from; _gcall.fromName = s.name || '';
    _gcRenderBar();
    _ringStart();
    GLG_TOAST.show(_gcall.gname || _chT('gcall'), _chT('gIncoming').replace('%s', s.name || ''));
    _gcall.ringTimeout = setTimeout(() => { if (_gcall.state === 'ringing-in') _gcallEnd(false); }, 45000);
    return;
  }
  if (!_gcall.room || s.room !== _gcall.room || !s.from) return;
  if (s.t === 'gdecline' || s.t === 'gleave') { _gcRemovePeer(s.from); return; }
  const P = _gcEnsurePeer(s.from, s.name);
  if (!P) return;
  if (s.t === 'goffer') {
    if (!_gcall.stream || P.pc) return;          // pas encore accepté / doublon
    P.pc = _gcNewPC(s.from);
    try {
      await P.pc.setRemoteDescription({ type:'offer', sdp:s.sdp });
      (P.iceQ || []).forEach(c => { const pr = P.pc.addIceCandidate(c); if (pr && pr.catch) pr.catch(() => {}); });
      P.iceQ = [];
      const ans = await P.pc.createAnswer();
      await P.pc.setLocalDescription(ans);
      _callTune(P.pc);
      _gcSend(s.from, { t:'ganswer', from:_chatMe, name:_gcMyName(), room:_gcall.room, sdp:ans.sdp });
    } catch (e) { _gcRemovePeer(s.from); }
  } else if (s.t === 'ganswer') {
    if (!P.pc) return;
    try {
      await P.pc.setRemoteDescription({ type:'answer', sdp:s.sdp });
      (P.iceQ || []).forEach(c => { const pr = P.pc.addIceCandidate(c); if (pr && pr.catch) pr.catch(() => {}); });
      P.iceQ = [];
    } catch (e) { _gcRemovePeer(s.from); }
  } else if (s.t === 'gice') {
    if (P.pc && P.pc.remoteDescription) { try { await P.pc.addIceCandidate(s.cand); } catch (e) {} }
    else if (s.cand) (P.iceQ = P.iceQ || []).push(s.cand);
  }
}

async function _gcallAccept() {
  if (_gcall.state !== 'ringing-in') return;
  _ringStop();
  clearTimeout(_gcall.ringTimeout);
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia(_glgMicConstraints()); }
  catch (e) { _gcallDecline(); return; }
  _gcall.stream = stream;
  _gcall.state = 'connecting';
  _gcJoinRoom();   // hello → les présents répondent here → offres selon la règle uid
  _gcRenderBar();
  // salon vide (appelant déjà parti) ou connexion impossible → fin propre,
  // jamais de micro ouvert dans le vide (annulé dès la 1re connexion : 'live')
  _gcall.ringTimeout = setTimeout(() => { if (_gcall.state === 'connecting') _gcallEnd(false); }, 30000);
}
function _gcallDecline() {
  if (_gcall.fromId) _callSendTo(_gcall.fromId, { t:'gdecline', from:_chatMe, room:_gcall.room });
  _gcallEnd(false);
}

/* Salon (roster) : hello à l'arrivée, here en réponse, idempotent. */
function _gcJoinRoom() {
  const sb = window.GLG_AUTH?.getClient?.(); if (!sb || !_gcall.room) return;
  _gcall.roomCh = sb.channel('glg:groom:' + _gcall.room);
  _gcall.roomCh.on('broadcast', { event: 'roster' }, p => {
    const m = p.payload || {};
    if (!m.from || m.from === _chatMe || !_gcall.room) return;
    if (m.k === 'hello' && _gcall.roomCh) {
      try { _gcall.roomCh.send({ type:'broadcast', event:'roster', payload:{ k:'here', from:_chatMe, name:_gcMyName() } }); } catch (e) {}
    }
    _gcEnsurePeer(m.from, m.name);
  }).subscribe(st => {
    if (st === 'SUBSCRIBED' && _gcall.roomCh) {
      try { _gcall.roomCh.send({ type:'broadcast', event:'roster', payload:{ k:'hello', from:_chatMe, name:_gcMyName() } }); } catch (e) {}
    }
  });
}

/* Ajoute un participant : canal d'émission dédié + offre si c'est mon rôle. */
function _gcEnsurePeer(uid, name) {
  if (!uid || uid === _chatMe || _gcall.state === 'idle') return null;
  const cur = _gcall.peers[uid];
  if (cur) { if (name && !cur.name) { cur.name = name; _gcRenderBar(); } return cur; }
  if (Object.keys(_gcall.peers).length >= 7) return null;   // mesh borné (~8 joueurs)
  const sb = window.GLG_AUTH?.getClient?.(); if (!sb) return null;
  const P = { pc:null, name:name || '', sendCh:null, sendReady:false, sendQ:[], iceQ:[], live:false };
  _gcall.peers[uid] = P;
  P.sendCh = sb.channel('glg:call:' + uid);
  P.sendCh.subscribe(st => {
    if (st === 'SUBSCRIBED') {
      P.sendReady = true;
      (P.sendQ || []).forEach(pl => P.sendCh.send({ type:'broadcast', event:'sig', payload:pl }));
      P.sendQ = [];
    }
  });
  // anti-glare : le plus grand uid de la paire initie l'offre
  if (_gcall.stream && String(_chatMe) > String(uid)) _gcOffer(uid);
  _gcRenderBar();
  return P;
}
function _gcSend(uid, payload) {
  const P = _gcall.peers[uid]; if (!P) return;
  if (P.sendReady && P.sendCh) P.sendCh.send({ type:'broadcast', event:'sig', payload });
  else (P.sendQ = P.sendQ || []).push(payload);
}
async function _gcOffer(uid) {
  const P = _gcall.peers[uid]; if (!P || P.pc) return;
  try {
    P.pc = _gcNewPC(uid);
    const offer = await P.pc.createOffer();
    await P.pc.setLocalDescription(offer);
    _callTune(P.pc);
    _gcSend(uid, { t:'goffer', from:_chatMe, name:_gcMyName(), room:_gcall.room, sdp:offer.sdp });
  } catch (e) { _gcRemovePeer(uid); }
}
function _gcNewPC(uid) {
  const pc = new RTCPeerConnection(_CALL_ICE);
  (_gcall.stream ? _gcall.stream.getTracks() : []).forEach(tr => pc.addTrack(tr, _gcall.stream));
  pc.onicecandidate = ev => { if (ev.candidate) _gcSend(uid, { t:'gice', from:_chatMe, room:_gcall.room, cand:ev.candidate.toJSON() }); };
  pc.ontrack = ev => {
    let a = document.getElementById('glg-gaudio-' + uid);
    if (!a) {
      a = document.createElement('audio'); a.id = 'glg-gaudio-' + uid; a.autoplay = true;
      const av = (_userPrefs && _userPrefs.av) || {};
      if (av.outId && a.setSinkId) { try { const p = a.setSinkId(av.outId); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
      document.body.appendChild(a);
    }
    a.srcObject = ev.streams[0];
    const pr = a.play && a.play(); if (pr && pr.catch) pr.catch(() => {});
  };
  pc.onconnectionstatechange = () => {
    const P = _gcall.peers[uid]; if (!P || P.pc !== pc) return;
    if (pc.connectionState === 'connected') {
      P.live = true;
      clearTimeout(_gcall.ringTimeout);
      if (_gcall.state !== 'live') { _gcall.state = 'live'; _gcall.t0 = Date.now(); _gcStartTimer(); }
      _gcRenderBar();
    }
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed' || pc.connectionState === 'disconnected') {
      _gcRemovePeer(uid);
    }
  };
  return pc;
}
function _gcRemovePeer(uid) {
  const P = _gcall.peers[uid]; if (!P) return;
  try { P.pc && P.pc.close(); } catch (e) {}
  const sb = window.GLG_AUTH?.getClient?.();
  try { P.sendCh && sb && sb.removeChannel(P.sendCh); } catch (e) {}
  const a = document.getElementById('glg-gaudio-' + uid); if (a) { a.srcObject = null; a.remove(); }
  delete _gcall.peers[uid];
  // plus personne en ligne alors qu'on était en direct → fin propre
  if (_gcall.state === 'live' && !Object.keys(_gcall.peers).length) { _gcallEnd(false); return; }
  _gcRenderBar();
}
function _gcallToggleMute() {
  if (!_gcall.stream) return;
  _gcall.stream.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
  _gcall.muted = _gcall.stream.getAudioTracks().some(t => !t.enabled);
  const b = document.getElementById('gcb-mute');
  if (b) { b.classList.toggle('off', _gcall.muted); b.title = _gcall.muted ? _chT('unmute') : _chT('mute'); b.setAttribute('aria-label', b.title); }
}
function _gcallEnd(notify) {
  if (notify === undefined) notify = true;
  _ringStop();
  if (notify) Object.keys(_gcall.peers).forEach(uid => _gcSend(uid, { t:'gleave', from:_chatMe, room:_gcall.room }));
  // laisser partir les gleave avant de fermer les canaux
  const peers = _gcall.peers, roomCh = _gcall.roomCh;
  setTimeout(() => {
    const sb = window.GLG_AUTH?.getClient?.();
    Object.keys(peers).forEach(uid => {
      try { peers[uid].pc && peers[uid].pc.close(); } catch (e) {}
      try { peers[uid].sendCh && sb && sb.removeChannel(peers[uid].sendCh); } catch (e) {}
      const a = document.getElementById('glg-gaudio-' + uid); if (a) { a.srcObject = null; a.remove(); }
    });
    try { roomCh && sb && sb.removeChannel(roomCh); } catch (e) {}
  }, notify ? 350 : 0);
  try { (_gcall.stream ? _gcall.stream.getTracks() : []).forEach(t => t.stop()); } catch (e) {}
  clearInterval(_gcall.timer); clearTimeout(_gcall.ringTimeout);
  _gcall = _gcFresh();
  _gcRenderBar();
}
function _gcStartTimer() {
  clearInterval(_gcall.timer);
  _gcall.timer = setInterval(() => {
    const el = document.getElementById('gcb-timer'); if (!el) return;
    const s = Math.floor((Date.now() - _gcall.t0) / 1000);
    el.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }, 1000);
}

/* Carte flottante de l'appel de groupe (survit à la navigation). */
function _gcRenderBar() {
  document.getElementById('glg-gcallbar')?.remove();
  if (_gcall.state === 'idle') return;
  const bar = document.createElement('div');
  bar.id = 'glg-gcallbar';
  const phoneIco = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.2 2.4 5 2.1c.4-.1.8.1 1 .5l1 2.1c.2.4.1.8-.2 1.1l-1 1c.7 1.4 1.9 2.6 3.4 3.4l1-1c.3-.3.7-.4 1.1-.2l2.1 1c.4.2.6.6.5 1l-.3 1.8c-.1.5-.5.8-1 .8C7.3 13.6 2.4 8.7 2.4 3.4c0-.5.3-.9.8-1z" fill="currentColor"/></svg>';
  const hangIco  = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M1.6 9.4C3.3 7.3 5.5 6.2 8 6.2s4.7 1.1 6.4 3.2c.3.4.3.9-.1 1.2l-1.3 1.2c-.3.3-.8.3-1.1 0l-1.5-1.3c-.2-.2-.3-.5-.3-.8v-1c-1.4-.5-2.8-.5-4.2 0v1c0 .3-.1.6-.3.8l-1.5 1.3c-.3.3-.8.3-1.1 0L1.7 10.6c-.4-.3-.4-.8-.1-1.2z" fill="currentColor"/></svg>';
  const micIco   = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="6" y="1.6" width="4" height="8" rx="2" stroke="currentColor" stroke-width="1.2"/><path d="M3.4 7.4a4.6 4.6 0 0 0 9.2 0M8 12v2.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>';
  const names = Object.values(_gcall.peers).filter(p => p.live).map(p => p.name || '?');
  if (_gcall.state === 'ringing-in') {
    bar.innerHTML = `
    <div class="cb-card cb-card--ring">
      <span class="cb-pulse" aria-hidden="true">${phoneIco}</span>
      <span class="cb-id"><b>${escHtml(_gcall.gname || _chT('gcall'))}</b><small>${escHtml(_chT('gIncoming').replace('%s', _gcall.fromName || ''))}</small></span>
      <span class="cb-actions">
        <button class="cb-btn cb-btn--ok" onclick="_gcallAccept()" title="${_chT('accept')}" aria-label="${_chT('accept')}">${phoneIco}</button>
        <button class="cb-btn cb-btn--no" onclick="_gcallDecline()" title="${_ft('decline')}" aria-label="${_ft('decline')}">${hangIco}</button>
      </span>
    </div>`;
  } else {
    const live = _gcall.state === 'live';
    const status = live
      ? `<span id="gcb-timer">0:00</span><small>${escHtml(_chT('gParts').replace('%s', String(names.length + 1)))}${names.length ? ', ' + escHtml(names.join(', ')).slice(0, 90) : ''}</small>`
      : `<small>${_chT(_gcall.state === 'ringing-out' ? 'calling' : 'gWaiting')}</small>`;
    bar.innerHTML = `
    <div class="cb-card ${live ? 'cb-card--live' : ''}">
      <span class="${live ? 'cb-live-dot' : 'cb-pulse'}" aria-hidden="true">${phoneIco}</span>
      <span class="cb-id"><b>${escHtml(_gcall.gname || _chT('gcall'))}</b>${status}</span>
      <span class="cb-actions">
        ${live ? `<button class="cb-btn cb-btn--mute ${_gcall.muted ? 'off' : ''}" id="gcb-mute" onclick="_gcallToggleMute()" title="${_chT('mute')}" aria-label="${_chT('mute')}">${micIco}</button>` : ''}
        <button class="cb-btn cb-btn--no" onclick="_gcallEnd()" title="${_chT('hangup')}" aria-label="${_chT('hangup')}">${hangIco}</button>
      </span>
    </div>`;
  }
  document.body.appendChild(bar);
}

/* ══════════════════════════════════════════
   OPTIONS → VOIX & VIDÉO (launcher), façon Discord, en mieux :
   périphériques d'entrée/sortie audio + caméra (enumerateDevices),
   TEST MICRO avec vumètre RMS live, bip de test de sortie (setSinkId),
   aperçu caméra. Choix persistés dans prefs.av, appliqués partout
   (_glgMicConstraints pour appels + notes vocales, _callAudioEl pour la
   sortie). Les libellés des périphériques n'apparaissent qu'après la
   première permission (comportement navigateur, repopulé après test).
══════════════════════════════════════════ */
let _avTest = null;   // test micro en cours { stream, ctx, raf }
let _avCam = null;    // flux d'aperçu caméra

async function _avPopulate(q) {
  const av = (_userPrefs && _userPrefs.av) || {};
  let devs = [];
  try { devs = await navigator.mediaDevices.enumerateDevices(); } catch (e) {}
  const fill = (sel, kind, cur) => {
    const el = q(sel); if (!el) return;
    el.innerHTML = `<option value="">${_ot('devDefault')}</option>` +
      devs.filter(d => d.kind === kind).map((d, i) =>
        `<option value="${escHtml(d.deviceId)}" ${d.deviceId === cur ? 'selected' : ''}>${escHtml(d.label || (_ot(kind === 'videoinput' ? 'camera' : kind === 'audioinput' ? 'micIn' : 'audioOut') + ' ' + (i + 1)))}</option>`).join('');
  };
  fill('#ap-av-mic', 'audioinput', av.micId);
  fill('#ap-av-out', 'audiooutput', av.outId);
  fill('#ap-av-cam', 'videoinput', av.camId);
}
function _avStopMicTest() {
  if (!_avTest) return;
  cancelAnimationFrame(_avTest.raf);
  try { _avTest.stream.getTracks().forEach(t => t.stop()); } catch (e) {}
  try { _avTest.ctx && _avTest.ctx.close(); } catch (e) {}
  _avTest = null;
  const b = document.getElementById('ap-av-mictest'); if (b) b.textContent = _ot('micTest');
  const m = document.querySelector('#ap-av-meter i'); if (m) m.style.width = '0%';
}
function _avStopCam() {
  if (!_avCam) return;
  try { _avCam.getTracks().forEach(t => t.stop()); } catch (e) {}
  _avCam = null;
  const v = document.getElementById('ap-av-campreview');
  if (v) { v.srcObject = null; v.hidden = true; }
  const b = document.getElementById('ap-av-camtest'); if (b) b.textContent = _ot('camTest');
}
/* Quitter la page = couper micro/caméra de test (jamais de flux fantôme) */
document.addEventListener('glg:page-changed', () => { _avStopMicTest(); _avStopCam(); });

function _wireAvPanel(q) {
  if (!q('#ap-av-mic')) return;
  _avPopulate(q);
  const save = () => _savePrefs({ av: {
    micId: q('#ap-av-mic')?.value || null,
    outId: q('#ap-av-out')?.value || null,
    camId: q('#ap-av-cam')?.value || null,
  } });
  ['#ap-av-mic', '#ap-av-out', '#ap-av-cam'].forEach(s => q(s)?.addEventListener('change', save));

  // ── Test micro : vumètre RMS live (mêmes réglages que les notes vocales)
  q('#ap-av-mictest')?.addEventListener('click', async () => {
    if (_avTest) { _avStopMicTest(); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia(_glgMicConstraints()); } catch (e) { return; }
    let ctx = null, analyser = null, data = null;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) {} }
      const src = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser(); analyser.fftSize = 1024;
      src.connect(analyser);
      data = new Uint8Array(analyser.fftSize);
    } catch (e) {}
    _avTest = { stream, ctx, raf: 0 };
    const btn = q('#ap-av-mictest'); if (btn) btn.textContent = _ot('testStop');
    _avPopulate(q);                       // les libellés arrivent avec la permission
    const meter = q('#ap-av-meter i');
    const loop = () => {
      if (!_avTest) return;
      let level = 0;
      if (analyser && data) {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) { const d = (data[i] - 128) / 128; sum += d * d; }
        level = Math.min(1, Math.sqrt(sum / data.length) * 3.4);
      }
      if (meter) meter.style.width = Math.round(level * 100) + '%';
      _avTest.raf = requestAnimationFrame(loop);
    };
    _avTest.raf = requestAnimationFrame(loop);
  });

  // ── Test de sortie : bip bref (660 Hz) routé vers le périphérique choisi
  q('#ap-av-outtest')?.addEventListener('click', async () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) {} }
      const dest = ctx.createMediaStreamDestination();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = 660; g.gain.value = 0.08;
      o.connect(g); g.connect(dest);
      const a = new Audio(); a.srcObject = dest.stream;
      const outId = q('#ap-av-out')?.value;
      if (outId && a.setSinkId) { try { await a.setSinkId(outId); } catch (e) {} }
      const pr = a.play(); if (pr && pr.catch) pr.catch(() => {});
      o.start();
      setTimeout(() => { try { o.stop(); ctx.close(); } catch (e) {} }, 450);
    } catch (e) {}
  });

  // ── Aperçu caméra (start/stop)
  q('#ap-av-camtest')?.addEventListener('click', async () => {
    const v = q('#ap-av-campreview'); if (!v) return;
    if (_avCam) { _avStopCam(); return; }
    const camId = q('#ap-av-cam')?.value;
    const video = camId ? { deviceId: { exact: camId } } : true;
    try { _avCam = await navigator.mediaDevices.getUserMedia({ video }); } catch (e) { return; }
    v.srcObject = _avCam; v.hidden = false;
    const btn = q('#ap-av-camtest'); if (btn) btn.textContent = _ot('testStop');
    _avPopulate(q);
  });
}

/* ══════════════════════════════════════════
   CHAT, ÉMOJIS · STICKERS · RÉACTIONS
   ──────────────────────────────────────────
   Émojis : picker COMPLET par catégories (Récents dynamiques, onglets,
   molette, scroll-spy), zéro dépendance, insertion au curseur.
   Stickers : pack maison GLG = les key arts des 8 œuvres (aucun upload,
   pièce jointe {kind:'sticker'} pointant sur l'asset du site).
   Réactions : toggle par joueur (RPC chat_react, optimiste + realtime),
   palette rapide sur chaque message. GIF : panneau memes + imports
   (historique persistant prefs.gifs, suppression manuelle).
══════════════════════════════════════════ */
const _EMO_T = {
  recent:    { fr:'Récents', en:'Recent', es:'Recientes', de:'Zuletzt verwendet', it:'Recenti', ar:'الأخيرة', zh:'最近使用', ja:'最近使った絵文字', ru:'Недавние', pl:'Ostatnie' },
  smileys:   { fr:'Visages', en:'Smileys', es:'Caritas', de:'Smileys', it:'Faccine', ar:'الوجوه', zh:'表情', ja:'顔', ru:'Смайлы', pl:'Buźki' },
  gestures:  { fr:'Gestes & mains', en:'Hands & gestures', es:'Manos y gestos', de:'Hände & Gesten', it:'Mani e gesti', ar:'الأيدي والإيماءات', zh:'手势', ja:'手・ジェスチャー', ru:'Жесты', pl:'Dłonie i gesty' },
  hearts:    { fr:'Cœurs', en:'Hearts', es:'Corazones', de:'Herzen', it:'Cuori', ar:'قلوب', zh:'爱心', ja:'ハート', ru:'Сердца', pl:'Serca' },
  animals:   { fr:'Animaux & nature', en:'Animals & nature', es:'Animales y naturaleza', de:'Tiere & Natur', it:'Animali e natura', ar:'حيوانات وطبيعة', zh:'动物与自然', ja:'動物・自然', ru:'Животные и природа', pl:'Zwierzęta i natura' },
  food:      { fr:'Nourriture & boissons', en:'Food & drink', es:'Comida y bebida', de:'Essen & Trinken', it:'Cibo e bevande', ar:'طعام وشراب', zh:'美食', ja:'食べ物・飲み物', ru:'Еда и напитки', pl:'Jedzenie i napoje' },
  activities:{ fr:'Activités & jeux', en:'Activities & games', es:'Actividades y juegos', de:'Aktivitäten & Spiele', it:'Attività e giochi', ar:'أنشطة وألعاب', zh:'活动与游戏', ja:'アクティビティ・ゲーム', ru:'Активности и игры', pl:'Aktywności i gry' },
  travel:    { fr:'Voyage & lieux', en:'Travel & places', es:'Viajes y lugares', de:'Reisen & Orte', it:'Viaggi e luoghi', ar:'سفر وأماكن', zh:'旅行与地点', ja:'旅行・場所', ru:'Путешествия и места', pl:'Podróże i miejsca' },
  objects:   { fr:'Objets', en:'Objects', es:'Objetos', de:'Objekte', it:'Oggetti', ar:'أشياء', zh:'物品', ja:'モノ', ru:'Предметы', pl:'Przedmioty' },
  symbols:   { fr:'Symboles', en:'Symbols', es:'Símbolos', de:'Symbole', it:'Simboli', ar:'رموز', zh:'符号', ja:'記号', ru:'Символы', pl:'Symbole' },
  all:       { fr:'Tous les émojis', en:'All emojis', es:'Todos los emojis', de:'Alle Emojis', it:'Tutte le emoji', ar:'كل الإيموجي', zh:'全部表情符号', ja:'すべての絵文字', ru:'Все эмодзи', pl:'Wszystkie emoji' },
};
const _emt = k => (_EMO_T[k] && (_EMO_T[k][LANG] || _EMO_T[k].en)) || '';

/* Chaque catégorie : [clé, émoji d'onglet, liste (séparée par espaces)].
   Pas de drapeaux nationaux : Windows ne les rend pas (paires de lettres). */
const _EMO_CATS = [
  ['smileys','😀','😀 😃 😄 😁 😆 😅 😂 🤣 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 🥲 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🤧 🥵 🥶 🥴 😵 🤯 🤠 🥳 🥸 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 ☠️ 💩 🤡 👹 👺 👻 👽 👾 🤖 😺 😸 😹 😻 😼 😽 🙀 😿 😾'],
  ['gestures','👋','👋 🤚 🖐️ ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💅 🤳 💪 🦾 🧠 👀 👁️ 👂 👃 👄 👅 🦷 🦿 🦵 🦶'],
  ['hearts','❤️','❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ♥️ 💋 💌 💍 💒 🌹 🥀 💐 🌺 💑 💏'],
  ['animals','🐻','🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐒 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐜 🕷️ 🦂 🐢 🐍 🦎 🦖 🦕 🐙 🦑 🦐 🦞 🦀 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🐅 🐆 🦓 🦍 🐘 🦏 🐪 🦒 🦘 🌵 🎄 🌲 🌳 🌴 🌱 🌿 ☘️ 🍀 🍁 🍂 🍄 🌷 🌸 🌼 🌻 🌞 🌝 🌚 🌙 ⭐ 🌟 ✨ ⚡ 🔥 🌈 ☀️ ⛅ ☁️ 🌧️ ⛈️ ❄️ ☃️ ⛄ 🌊 💧 💦 ☔'],
  ['food','🍕','🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥕 🌽 🌶️ 🥔 🍠 🥐 🍞 🥖 🥨 🧀 🥚 🍳 🥞 🧇 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🥪 🌮 🌯 🥗 🍝 🍜 🍲 🍛 🍣 🍱 🍤 🍙 🍚 🍘 🥟 🥠 🍢 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 🥛 ☕ 🍵 🧋 🍺 🍻 🥂 🍷 🥃 🍸 🍹 🧃 🧊'],
  ['activities','🎮','🎮 🕹️ 🎯 🎲 ♟️ 🧩 🎳 🎰 🃏 🀄 🏆 🥇 🥈 🥉 🏅 🎖️ ⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🏓 🏸 🏒 🥅 ⛳ 🏹 🎣 🥊 🥋 ⛸️ 🎿 🏂 🏋️ 🤸 🤺 🏇 🧘 🏄 🏊 🚴 🧗 🎪 🤹 🎭 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🎸 🎻 🎫 🎟️'],
  ['travel','🚀','🚗 🚕 🚙 🚌 🏎️ 🚓 🚑 🚒 🚚 🚜 🛴 🚲 🛵 🏍️ 🚨 🚃 🚝 🚄 🚂 ✈️ 🛫 🛬 🛩️ 🚀 🛸 🚁 🛶 ⛵ 🚤 🛳️ ⚓ 🗺️ 🗿 🗽 🗼 🏰 🏯 🏟️ 🎡 🎢 🎠 ⛲ ⛱️ 🏖️ 🏝️ 🌋 ⛰️ 🏔️ 🗻 🏕️ 🏠 🏡 🏢 🏭 🌃 🌆 🌇 🌉 🌌 🌍 🌎 🌏 🪐'],
  ['objects','💡','⌚ 📱 💻 ⌨️ 🖥️ 🖨️ 🖱️ 💾 💿 📀 📼 📷 📸 📹 🎥 📽️ 📞 ☎️ 📺 📻 🎙️ ⏰ ⌛ ⏳ 📡 🔋 🔌 💡 🔦 🕯️ 💸 💵 💰 💳 💎 ⚖️ 🔧 🔨 🛠️ ⛏️ 🔩 ⚙️ 🧲 💣 🧨 🔪 🗡️ ⚔️ 🛡️ 🔮 🧿 🔭 🔬 💊 💉 🧬 🦠 🧪 🌡️ 🧸 🎁 🎈 🎀 🎊 🎉 🪄 📦 📚 📖 ✏️ 🖊️ 🖌️ 🖍️ 📝 💼 📁 📊 📈 📉 ✂️ 📌 📎 🔑 🗝️ 🔒 🔓 🚪 🪑 🛋️ 🛏️'],
  ['symbols','✨','💯 ✅ ❌ ❓ ❗ ⁉️ 💤 💢 💥 💫 🕳️ ♻️ ⚜️ 🔱 📛 🔰 ⭕ ✔️ ✖️ ➕ ➖ ➗ ➰ ✳️ ✴️ ❇️ ©️ ®️ ™️ 🔀 🔁 ▶️ ⏸️ ⏹️ ⏭️ ⏮️ 🔼 🔽 🎵 🎶 ➡️ ⬅️ ⬆️ ⬇️ ↗️ ↘️ ↙️ ↖️ ↔️ ↕️ 🔄 🆗 🆕 🆓 🆒 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🟥 🟧 🟨 🟩 🟦 🟪 ⬛ ⬜ 🔶 🔷 🔸 🔹 🔺 🔻 💠 🔘 🏁 🚩 🏴 🏳️'],
];

/* Récents : mémoire locale de l'appareil (24 max, dédupliqués). */
function _emoRecGet() { try { const a = JSON.parse(localStorage.getItem('glg_emo_recent') || '[]'); return Array.isArray(a) ? a.filter(x => typeof x === 'string' && x.length <= 8 && !/[<>"'&\\]/.test(x)).slice(0, 24) : []; } catch (e) { return []; } }
function _emoRecPush(e) { try { const a = _emoRecGet().filter(x => x !== e); a.unshift(e); localStorage.setItem('glg_emo_recent', JSON.stringify(a.slice(0, 24))); } catch (err) {} }

/* « Tous les émojis » : générés depuis les blocs Unicode émoji, puis filtrés
   par RENDU RÉEL (canvas : tout glyphe identique au tofu de référence est
   écarté). Calculé au 1er open du picker (~300 ms), cache localStorage. */
let _emoAllMem = null;
function _emoAll() {
  if (_emoAllMem) return _emoAllMem;
  try { const c = JSON.parse(localStorage.getItem('glg_emo_all_v1') || 'null'); if (Array.isArray(c) && c.length > 300) return (_emoAllMem = c); } catch (e) {}
  const out = [];
  try {
    const cv = document.createElement('canvas'); cv.width = cv.height = 22;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.font = '17px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
    ctx.textBaseline = 'top';
    const sig = ch => {
      ctx.clearRect(0, 0, 22, 22); ctx.fillText(ch, 0, 1);
      const d = ctx.getImageData(0, 0, 22, 22).data;
      let h = 0; for (let i = 0; i < d.length; i += 16) h = (h * 31 + d[i] + d[i + 1] + d[i + 2] + d[i + 3]) >>> 0;
      return h;
    };
    const tofu = sig('\u{10FFFE}');   // codepoint non assigné = tofu de référence
    const vide = sig('');
    const seen = new Set(_EMO_CATS.flatMap(c => c[2].split(' ')));
    const ranges = [[0x1F600, 0x1F64F], [0x1F300, 0x1F5FF], [0x1F680, 0x1F6FF], [0x1F900, 0x1F9FF], [0x1FA70, 0x1FAFF], [0x2600, 0x26FF], [0x2700, 0x27BF]];
    for (const [a, b] of ranges) for (let cp = a; cp <= b; cp++) {
      const base = String.fromCodePoint(cp);
      const ch = cp < 0x1F000 ? base + '\uFE0F' : base;   // Misc/Dingbats → présentation émoji
      if (seen.has(ch) || seen.has(base)) continue;
      const g = sig(ch);
      if (g !== tofu && g !== vide) out.push(ch);
    }
    if (out.length > 300) { try { localStorage.setItem('glg_emo_all_v1', JSON.stringify(out)); } catch (e) {} }
  } catch (e) {}
  return (_emoAllMem = out);
}
// Pré-calcul en tâche de fond (1re visite ~1,5 s) → ouverture du picker instantanée
if ('requestIdleCallback' in window) requestIdleCallback(() => { try { _emoAll(); } catch (e) {} }, { timeout: 8000 });
else setTimeout(() => { try { _emoAll(); } catch (e) {} }, 4000);

let _chatPickOpen = null;   // 'emoji' | 'stick' | 'gif' | null

function _chatPickClose() {
  document.getElementById('glg-chatpick')?.remove();
  document.getElementById('glg-rxpick')?.remove();
  _chatPickOpen = null;
}
document.addEventListener('click', e => {
  // le .click() PROGRAMMATIQUE sur l'input fichier (Importer un GIF) bulle
  // jusqu'ici, sans cette garde il refermait le panneau à l'ouverture du
  // sélecteur de fichier.
  if (e.target && e.target.id === 'chat-gif') return;
  if (!e.target.closest('#glg-chatpick') && !e.target.closest('#glg-rxpick')) _chatPickClose();
});

function _chatPickShell(kind) {
  _chatPickClose();
  _chatPickOpen = kind;
  const host = document.createElement('div');
  host.id = 'glg-chatpick';
  host.setAttribute('data-lenis-prevent', '');   // molette NATIVE dans le picker (Lenis passe son tour)
  const compose = document.querySelector('.chat-compose');
  (compose ? compose.parentElement : document.body).appendChild(host);
  return host;
}

/* ── Picker émojis v2 : catégories complètes, onglets, molette (scroll
   natif), scroll-spy, Récents dynamiques, insertion au curseur. ── */
function _chatEmojiToggle() {
  if (_chatPickOpen === 'emoji') { _chatPickClose(); return; }
  const host = _chatPickShell('emoji');
  host.classList.add('chatpick--emo');
  const rec = _emoRecGet();
  const all = _emoAll();
  const cats = (rec.length ? [['recent', '🕘', rec]] : [])
    .concat(_EMO_CATS.map(c => [c[0], c[1], c[2].split(' ')]))
    .concat(all.length ? [['all', '🗂️', all]] : []);
  host.innerHTML = `
    <div class="chatpick-head">${_chT('emojiT')}</div>
    <div class="chatpick-tabs" role="tablist" aria-label="${_chT('emojiT')}">
      ${cats.map(([k, ico], i) => `<button class="chatpick-tab ${i === 0 ? 'on' : ''}" data-cat="${k}" role="tab" title="${_emt(k)}" aria-label="${_emt(k)}">${ico}</button>`).join('')}
    </div>
    <div class="chatpick-scroll" id="chatpick-scroll">
      ${cats.map(([k, , list]) => `
      <section class="chatpick-sec" data-cat="${k}">
        <h5 class="chatpick-sec-t">${_emt(k)}</h5>
        <div class="chatpick-grid">${list.map(e => `<button class="chatpick-emo" data-emo="${e}">${e}</button>`).join('')}</div>
      </section>`).join('')}
    </div>`;
  const sc = host.querySelector('#chatpick-scroll');
  // Insertion au curseur, délégation : UN listener pour ~600 émojis
  sc.addEventListener('click', ev => {
    const b = ev.target.closest('.chatpick-emo'); if (!b) return;
    const inp = $('chat-input'); if (!inp) return;
    const s = inp.selectionStart ?? inp.value.length, en = inp.selectionEnd ?? inp.value.length;
    inp.value = inp.value.slice(0, s) + b.dataset.emo + inp.value.slice(en);
    const pos = s + b.dataset.emo.length;
    inp.focus(); inp.setSelectionRange(pos, pos);
    _emoRecPush(b.dataset.emo);   // alimente « Récents » (prochaine ouverture)
    _chatTypingPing();
  });
  // Onglet → défile vers la section ; défilement → active l'onglet (spy)
  const tabs = [...host.querySelectorAll('.chatpick-tab')];
  const secs = [...host.querySelectorAll('.chatpick-sec')];
  tabs.forEach(t => t.addEventListener('click', () => {
    const sec = secs.find(x => x.dataset.cat === t.dataset.cat);
    if (sec) sc.scrollTo({ top: sec.offsetTop - 4, behavior: 'smooth' });
  }));
  let spy = 0;
  sc.addEventListener('scroll', () => {
    cancelAnimationFrame(spy);
    spy = requestAnimationFrame(() => {
      const y = sc.scrollTop + 48;
      let cur = secs[0];
      for (const s2 of secs) if (s2.offsetTop <= y) cur = s2;
      if (cur) tabs.forEach(t => t.classList.toggle('on', t.dataset.cat === cur.dataset.cat));
    });
  }, { passive: true });
}

/* ── PANNEAU GIF : mèmes proposés + imports personnels ──────────────────
   Mèmes : 20 classiques servis par le CDN Giphy (i.giphy.com, autorisé
   par la CSP img-src), chaque URL a été VÉRIFIÉE (200 + image/gif).
   Imports : .gif ≤50 Mo → bucket chat-media → historique prefs.gifs
   (synchronisé entre appareils), conservé jusqu'à suppression manuelle.
   Un mème envoyé rejoint aussi « Tes GIFs » (récemment utilisés). ── */
const _GLG_MEMES = [
  { u:'https://i.giphy.com/QMHoU66sBXqqLqYvGO.gif', n:'This is fine' },
  { u:'https://i.giphy.com/6nWhy3ulBL7GSCvKw6.gif', n:'Surprised Pikachu' },
  { u:'https://i.giphy.com/hEc4k5pN17GZq.gif',      n:'Confused Travolta' },
  { u:'https://i.giphy.com/62PP2yEIAZF6g.gif',      n:'Deal with it' },
  { u:'https://i.giphy.com/xT0xeJpnrWC4XWblEk.gif', n:'Mind blown' },
  { u:'https://i.giphy.com/a0h7sAqON67nO.gif',      n:'Great success' },
  { u:'https://i.giphy.com/8VrtCswiLDNnO.gif',      n:'Nailed it' },
  { u:'https://i.giphy.com/d3mlE7uhX8KFgEmY.gif',   n:'Roll safe' },
  { u:'https://i.giphy.com/l4Jz3a8jO92crUlWM.gif',  n:'Salt Bae' },
  { u:'https://i.giphy.com/fnuSiwXMTV3zmYDf6k.gif', n:'Who are you?' },
  { u:'https://i.giphy.com/32mC2kXYWCsg0.gif',      n:'Sweating' },
  { u:'https://i.giphy.com/HhTXt43pk1I1W.gif',      n:'Boom' },
  { u:'https://i.giphy.com/13HgwGsXF0aiGY.gif',     n:'Everything is fine' },
  { u:'https://i.giphy.com/JIX9t2j0ZTN9S.gif',      n:'Cat coding' },
  { u:'https://i.giphy.com/11sBLVxNs7v6WA.gif',     n:'Minions party' },
  { u:'https://i.giphy.com/kEKcOWl8RMLde.gif',      n:'Woo-hoo!' },
  { u:'https://i.giphy.com/3o6Zt6KHxJTbXCnSvu.gif', n:'Thank you' },
  { u:'https://i.giphy.com/l0MYt5jPR6QX5pnqM.gif',  n:'Celebrate' },
  { u:'https://i.giphy.com/5aLrlDiJPMPFS.gif',      n:'Stress max' },
  { u:'https://i.giphy.com/LTYT5GTIiAMBa.gif',      n:'Big sad' },
];

function _chatGifToggle() {
  if (_chatPickOpen === 'gif') { _chatPickClose(); return; }
  const host = _chatPickShell('gif');
  host.classList.add('chatpick--gif');
  _chatGifRender(host);
}
function _chatGifRender(host) {
  host = host || document.getElementById('glg-chatpick'); if (!host) return;
  const mine = (_userPrefs && _userPrefs.gifs) || [];
  const tile = (u0, n, del) => {
    const u = safeMediaUrl(u0);   // même filtre qu'à l'affichage des messages
    if (!u) return '';
    return `
      <button class="chatpick-gif" data-u="${escHtml(u)}" data-n="${escHtml(n)}" title="${escHtml(n)}">
        <img src="${escHtml(u)}" alt="${escHtml(n)}" loading="lazy">
        ${del ? `<span class="chatpick-gif-x" data-del="${escHtml(u)}" role="button" tabindex="0" title="${_chT('gifDel')}" aria-label="${_chT('gifDel')}">✕</span>` : ''}
      </button>`;
  };
  host.innerHTML = `
    <div class="chatpick-head">GIF
      <button class="chatpick-import" id="chatpick-import" title="${_chT('gifImport')}">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 10V2M4.6 5.4 8 2l3.4 3.4M3 13.4h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        ${_chT('gifImport')}</button>
    </div>
    <div class="chatpick-scroll chatpick-scroll--gif">
      ${mine.length
        ? `<section class="chatpick-sec"><h5 class="chatpick-sec-t">${_chT('gifYours')}</h5><div class="chatpick-gifs">${mine.map(g => tile(g.u, g.n, true)).join('')}</div></section>`
        : `<p class="chatpick-hint">${_chT('gifHint')}</p>`}
      <section class="chatpick-sec"><h5 class="chatpick-sec-t">${_chT('gifMemes')}</h5><div class="chatpick-gifs">${_GLG_MEMES.map(m => tile(m.u, m.n, false)).join('')}</div></section>
    </div>`;
  host.querySelector('#chatpick-import')?.addEventListener('click', ev => { ev.stopPropagation(); $('chat-gif')?.click(); });
  host.querySelector('.chatpick-scroll').addEventListener('click', ev => {
    const del = ev.target.closest('[data-del]');
    if (del) { ev.stopPropagation(); _chatGifDelete(del.dataset.del); return; }
    const b = ev.target.closest('.chatpick-gif'); if (!b) return;
    _chatGifSend(b.dataset.u, b.dataset.n);
  });
}
/* Mémorise un GIF en tête de « Tes GIFs » (dédupliqué, cap 48 via _normPrefs). */
function _chatGifRemember(url, name) {
  const cur = ((_userPrefs && _userPrefs.gifs) || []).filter(g => g.u !== url);
  cur.unshift({ u: url, n: (name || 'GIF').slice(0, 80) });
  _savePrefs({ gifs: cur });
}
async function _chatGifSend(url, name) {
  if (!_chat.current || !url) return;
  const chan = _chat.current;   // garde : la conversation peut changer pendant l'envoi
  _chatGifRemember(url, name);
  _chatPickClose();
  const r = await GLG_AUTH.chatSend(chan, null, { kind: 'image', url, name: name || 'GIF' });
  if (_chat.current === chan && r.ok && r.message && !_chat.rows.some(x => x.id === r.message.id)) {
    _chat.rows.push(r.message); _chatRenderMessages(true);
  }
  _chatRefreshChannels();
}
function _chatGifDelete(url) {
  const cur = ((_userPrefs && _userPrefs.gifs) || []).filter(g => g.u !== url);
  _savePrefs({ gifs: cur });
  if (_chatPickOpen === 'gif') _chatGifRender();
}
/* Import d'un .gif → upload chat-media → rejoint « Tes GIFs » (pas d'envoi
   automatique : tu choisis ensuite quand l'envoyer, comme sur Discord). */
async function _chatGifImported() {
  const inp = $('chat-gif');
  const f = inp?.files?.[0]; if (!f) return;
  inp.value = '';
  if (!/image\/gif/i.test(f.type || '')) { _chatNote('✕'); return; }
  if (f.size > 50 * 1024 * 1024) { _chatNote(_chT('tooBig')); return; }
  _chatNote('⬆ …');
  const up = await GLG_AUTH.chatUpload(f);
  _chatNote('');
  if (!up.ok || !up.attachment || !up.attachment.url) { _chatNote(up.code === 'size' ? _chT('tooBig') : '✕'); return; }
  _chatGifRemember(up.attachment.url, String(f.name || 'GIF').replace(/\.gif$/i, ''));
  // montre le nouvel arrivant : re-rend le panneau (le rouvre s'il a été fermé)
  if (_chatPickOpen === 'gif') _chatGifRender(); else _chatGifToggle();
}

/* ── Stickers maison : key arts des œuvres, envoi direct ── */
function _chatStickToggle() {
  if (_chatPickOpen === 'stick') { _chatPickClose(); return; }
  const host = _chatPickShell('stick');
  const works = (typeof ALL_WORKS !== 'undefined' ? filterByAge(ALL_WORKS) : []);
  host.innerHTML = `
    <div class="chatpick-head">${_chT('stickerT')} · GEEKLEARN GAMES</div>
    <div class="chatpick-sticks">
      ${works.map(w => `
      <button class="chatpick-stick" data-sid="${w.id}" title="${escHtml(w.title)}" aria-label="${escHtml(w.title)}">
        <img src="${av(w.cover)}" alt="" loading="lazy">
      </button>`).join('')}
    </div>`;
  host.querySelectorAll('.chatpick-stick').forEach(b => b.addEventListener('click', () => {
    const w = ALL_WORKS.find(x => x.id === b.dataset.sid); if (!w) return;
    _chatPickClose();
    _chatSendSticker(w);
  }));
}
async function _chatSendSticker(w) {
  if (!_chat.current) return;
  let url = av(w.cover);
  try { url = new URL(url, location.href).href; } catch (e) {}   // absolu (site & launcher)
  const r = await GLG_AUTH.chatSend(_chat.current, null, { kind: 'sticker', url, name: w.title });
  if (r.ok && r.message && !_chat.rows.some(x => x.id === r.message.id)) {
    _chat.rows.push(r.message); _chatRenderMessages(true);
  }
  _chatRefreshChannels();
}

/* ── Réactions : palette rapide ancrée au message ── */
const _CHAT_QUICK_RX = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎮'];
function _chatReactOpen(mid, ev) {
  ev && ev.stopPropagation();
  _chatPickClose();
  const pop = document.createElement('div');
  pop.id = 'glg-rxpick';
  pop.innerHTML = _CHAT_QUICK_RX.map(e => `<button class="chatpick-emo" data-emo="${e}">${e}</button>`).join('');
  document.body.appendChild(pop);
  const x = Math.min(Math.max(10, (ev?.clientX || 200) - pop.offsetWidth / 2), window.innerWidth - pop.offsetWidth - 10);
  const y = Math.max(10, (ev?.clientY || 200) - pop.offsetHeight - 12);
  pop.style.left = x + 'px'; pop.style.top = y + 'px';
  pop.querySelectorAll('.chatpick-emo').forEach(b => b.addEventListener('click', () => {
    _chatPickClose();
    _chatReact(mid, b.dataset.emo);
  }));
}
async function _chatReact(mid, emo) {
  // Optimiste : maj locale immédiate, le realtime UPDATE fera foi
  const m = _chat.rows.find(x => x.id === mid);
  if (m) {
    const r = Object.assign({}, m.reactions || {});
    const arr = (Array.isArray(r[emo]) ? r[emo] : []).slice();
    const i = arr.indexOf(_chatMe);
    if (i >= 0) arr.splice(i, 1); else arr.push(_chatMe);
    if (arr.length) r[emo] = arr; else delete r[emo];
    m.reactions = r;
    _chatRenderMessages();
  }
  try { await GLG_AUTH.chatReact(mid, emo); } catch (e) {}
}
