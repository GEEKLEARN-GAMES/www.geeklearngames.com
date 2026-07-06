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
   `until` (optionnel, inclus) coupe l'offre automatiquement côté client —
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
  return item.price;
}

/* Fragment HTML de prix : badge −XX% + ancien prix barré + prix courant.
   Chaque montant garde son data-base-price → refreshDisplayedPrices()
   continue de convertir les devises sans reconstruire la page. */
function priceHTML(item, opts) {
  const o   = opts || {};
  const cls = 'glg-price' + (o.size ? ' glg-price--' + o.size : '');
  if (item.isFree || item.basePrice === 0 || item.basePrice == null)
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
/* Prix (promo appliquée) de l'édition sélectionnée — même contrat que priceHTML. */
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
  // mouseleave on the GRID CONTAINER — moving between buttons never fires
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
  _stopGateClock(); // gate is about to close
  window.GLG_GATE_FIELD?.burst(code); // impulsion : les drapeaux de la langue choisie fusent vers le haut
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
    // couvre encore la page (même chemin que le clic d'une carte —
    // age-gating et SEO gérés par showPage/buildDetail).
    if (window._bootWorkId) {
      const _bw = window._bootWorkId; window._bootWorkId = null;
      showPage('detail', _bw);
    } else if (window._bootPage) {
      // Raccourcis PWA (#works/#shop/#profile…) : router après construction.
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
  }, 700); // était 2000 — la construction du DOM prend <100 ms ; on garde un court battement cinématique
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
  // Bibliothèque — libellé hors tableau nav (id dédié, i18n _LIB_T)
  setText('nl-library',  _lbt('navLabel'));
  setText('nml-library', _lbt('navLabel'));
  // La bibliothèque déjà rendue se reconstruit dans la nouvelle langue
  if ($('library-root')?.childElementCount) buildLibraryPage();
  // Menu du compte (avatar) : régénère ses libellés dans la nouvelle langue
  if ($('nav-account-menu')) _buildAccountMenu();
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

  // Boutique v1 — contenu 100% généré par buildShopPage() (i18n interne
  // _SHOP_T). Si la page est déjà construite, on la reconstruit dans la
  // nouvelle langue.
  if ($('shop-root')?.childElementCount) buildShopPage();

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
  buildLauncherTeaser();
  initNav();
  initScrollProgress();
  initReveal();
  initCounters();
  initAnimations();
  initWorksFilters();
  buildWorksDeals();   // rail "Offres du moment" (après la barre de filtres)
  initContactEnhancements();
  initAuthUI();
  initA11y();
  applyWorksPageLabels();
  initAnimIdleObserver();
  // Initial SEO for the active page (re-runs on each language change via initSite)
  updateSEO(document.querySelector('.nav-link.active')?.dataset.nav || 'home', null);
  _siteBuilt = true; // enables age-gated re-render on auth changes
  // Touch swipe is now built into buildCarousel() — no separate init needed
  // Notify the GSAP animation layer that the site is ready
  document.dispatchEvent(new CustomEvent('glg:site-built'));
}

/* ══════════════════════════════════════════
   PERF — PAUSE DES ANIMATIONS HORS ÉCRAN
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
  setTimeout(() => { if (_veilEl) { _veilEl.style.opacity = '0'; _veilEl.classList.add('revealing'); } }, 40);
  setTimeout(() => { if (_veilEl) { _veilEl.style.opacity = '0'; _veilEl.classList.remove('revealing'); } }, 650);
}

/* Saut instantané en haut de page — réinitialise Lenis (smooth-scroll) puis le
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
    /* Build the store page on demand (deals + catalogue + teasers) */
    if (name === 'shop') buildShopPage();
    /* Build the player's game library on demand (Rockstar/Steam-style) */
    if (name === 'library') buildLibraryPage();
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
    url   = `${origin}/?work=${item.id}`; // URL réelle (non-fragment) = indexable + partageable
    image = `${origin}/${item.cover}`;
  } else {
    const navBtn = document.querySelector(`.nav-link[data-nav="${name}"]`);
    const lbl = navBtn ? navBtn.textContent.trim() : '';
    title = lbl ? `${lbl} — ${BASE}` : BASE;
    const descId = { home:'hero-desc', works:'works-desc', about:'about-desc', contact:'contact-desc', shop:'shop-sub' }[name];
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
    if (state.page === 'shop') buildShopPage();
    if (state.page === 'library') buildLibraryPage();
    if (state.page === 'works') requestAnimationFrame(buildCarousels);
    _scrollTopInstant();
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
        <div class="c-card-yr">${item.year} · ${priceHTML(item, { size:'sm' })}</div>
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
   BOUTIQUE v1 — vraie page magasin (remplace le "OOPS" en travaux)
   Offres du moment (promos actives) + catalogue complet (cartes store
   réutilisées : prix, promos, wishlist) + teasers "Prochainement".
══════════════════════════════════════════ */
const _SHOP_T = {
  eye:      { fr:'Boutique officielle', en:'Official store', es:'Tienda oficial', de:'Offizieller Store', it:'Store ufficiale', ar:'المتجر الرسمي', zh:'官方商店', ja:'公式ストア', ru:'Официальный магазин', pl:'Oficjalny sklep' },
  title:    { fr:'BOUTIQUE', en:'STORE', es:'TIENDA', de:'STORE', it:'STORE', ar:'المتجر', zh:'商店', ja:'ストア', ru:'МАГАЗИН', pl:'SKLEP' },
  sub:      { fr:'Figurines, peluches, vêtements et pièces collector à l\'effigie de nos mondes. L\'atelier prépare ses premières séries.', en:'Figurines, plushes, apparel and collector pieces from our worlds. The workshop is crafting its first runs.', es:'Figuras, peluches, ropa y piezas de coleccionista de nuestros mundos. El taller prepara sus primeras series.', de:'Figuren, Plüschtiere, Kleidung und Sammlerstücke aus unseren Welten. Die Werkstatt fertigt ihre ersten Serien.', it:'Figure, peluche, abbigliamento e pezzi da collezione dai nostri mondi. L\'atelier prepara le prime serie.', ar:'مجسّمات ودمى قطيفة وملابس وقطع للمقتنين من عوالمنا. الورشة تُعِدّ أولى سلاسلها.', zh:'来自我们世界的手办、毛绒玩具、服饰与典藏藏品。工坊正在打造第一批作品。', ja:'私たちの世界から生まれたフィギュア、ぬいぐるみ、アパレル、コレクターズアイテム。工房が最初のシリーズを製作中。', ru:'Фигурки, плюшевые игрушки, одежда и коллекционные предметы из наших миров. Мастерская готовит первые серии.', pl:'Figurki, pluszaki, odzież i przedmioty kolekcjonerskie z naszych światów. Warsztat przygotowuje pierwsze serie.' },
  gamesNotice: { fr:'Vous cherchez nos jeux et films interactifs ?', en:'Looking for our games and interactive films?', es:'¿Buscas nuestros juegos y films interactivos?', de:'Du suchst unsere Spiele und interaktiven Filme?', it:'Cerchi i nostri giochi e film interattivi?', ar:'تبحث عن ألعابنا وأفلامنا التفاعلية؟', zh:'在找我们的游戏与互动电影？', ja:'ゲームやインタラクティブフィルムをお探しですか？', ru:'Ищете наши игры и интерактивные фильмы?', pl:'Szukasz naszych gier i filmów interaktywnych?' },
  gamesNoticeSub: { fr:'Précommandes, offres et fiches détaillées vivent dans Nos Œuvres.', en:'Pre-orders, deals and full pages live in Our Works.', es:'Las reservas, ofertas y fichas completas están en Nuestras Obras.', de:'Vorbestellungen, Angebote und Detailseiten findest du unter Unsere Werke.', it:'Preordini, offerte e schede complete vivono in Le Nostre Opere.', ar:'الطلبات المسبقة والعروض والصفحات الكاملة في «أعمالنا».', zh:'预购、优惠与完整页面都在「我们的作品」。', ja:'予約、セール、詳細ページは「作品一覧」にあります。', ru:'Предзаказы, скидки и страницы игр — в разделе «Наши работы».', pl:'Przedsprzedaż, oferty i pełne strony znajdziesz w Naszych Dziełach.' },
  gamesCta: { fr:'Voir Nos Œuvres', en:'Browse Our Works', es:'Ver Nuestras Obras', de:'Zu unseren Werken', it:'Vai alle Opere', ar:'تصفّح أعمالنا', zh:'前往我们的作品', ja:'作品一覧へ', ru:'К нашим работам', pl:'Zobacz Nasze Dzieła' },
  figurines:{ fr:'Figurines', en:'Figurines', es:'Figuras', de:'Figuren', it:'Figurine', ar:'مجسّمات', zh:'手办', ja:'フィギュア', ru:'Фигурки', pl:'Figurki' },
  plush:    { fr:'Peluches', en:'Plushes', es:'Peluches', de:'Plüschtiere', it:'Peluche', ar:'دمى قطيفة', zh:'毛绒玩具', ja:'ぬいぐるみ', ru:'Плюшевые игрушки', pl:'Pluszaki' },
  apparel:  { fr:'Vêtements', en:'Apparel', es:'Ropa', de:'Kleidung', it:'Abbigliamento', ar:'ملابس', zh:'服饰', ja:'アパレル', ru:'Одежда', pl:'Odzież' },
  deals:    { fr:'Offres du moment', en:'Current deals', es:'Ofertas del momento', de:'Aktuelle Angebote', it:'Offerte del momento', ar:'العروض الحالية', zh:'当前优惠', ja:'開催中のセール', ru:'Текущие скидки', pl:'Aktualne oferty' },
  dealsSub: { fr:'Remises de précommande — appliquées automatiquement au panier.', en:'Pre-order discounts — applied automatically at checkout.', es:'Descuentos de reserva — aplicados automáticamente.', de:'Vorbesteller-Rabatte — automatisch angewendet.', it:'Sconti preordine — applicati automaticamente.', ar:'خصومات الطلب المسبق — تُطبَّق تلقائياً.', zh:'预购折扣——自动生效。', ja:'予約割引 — 自動的に適用されます。', ru:'Скидки за предзаказ — применяются автоматически.', pl:'Zniżki przedsprzedażowe — naliczane automatycznie.' },
  catalog:  { fr:'Tout le catalogue', en:'Full catalogue', es:'Catálogo completo', de:'Gesamter Katalog', it:'Catalogo completo', ar:'الكتالوج الكامل', zh:'完整目录', ja:'全カタログ', ru:'Весь каталог', pl:'Pełny katalog' },
  catalogSub:{ fr:'Huit mondes. Un seul standard : l\'intention.', en:'Eight worlds. One standard: intention.', es:'Ocho mundos. Un solo estándar: la intención.', de:'Acht Welten. Ein Standard: Intention.', it:'Otto mondi. Un solo standard: l\'intenzione.', ar:'ثمانية عوالم. معيار واحد: القصد.', zh:'八个世界。一个标准：用心。', ja:'8つの世界。基準はただひとつ、意図。', ru:'Восемь миров. Один стандарт: замысел.', pl:'Osiem światów. Jeden standard: intencja.' },
  soon:     { fr:'Prochainement', en:'Coming next', es:'Próximamente', de:'Demnächst', it:'Prossimamente', ar:'قريباً', zh:'即将推出', ja:'近日登場', ru:'Скоро', pl:'Wkrótce' },
  soonSub:  { fr:'La boutique s\'agrandira au fil des sorties.', en:'The store grows with every release.', es:'La tienda crece con cada lanzamiento.', de:'Der Store wächst mit jeder Veröffentlichung.', it:'Lo store cresce a ogni uscita.', ar:'يكبر المتجر مع كل إصدار.', zh:'商店随每次发售而成长。', ja:'ストアはリリースごとに成長します。', ru:'Магазин растёт с каждым релизом.', pl:'Sklep rośnie z każdą premierą.' },
  soonTag:  { fr:'Bientôt', en:'Coming soon', es:'Próximamente', de:'Bald', it:'Presto', ar:'قريباً', zh:'敬请期待', ja:'まもなく', ru:'Скоро', pl:'Wkrótce' },
  merch:    { fr:'Produits dérivés', en:'Merch', es:'Merchandising', de:'Merch', it:'Merch', ar:'منتجات', zh:'周边商品', ja:'グッズ', ru:'Мерч', pl:'Gadżety' },
  artbooks: { fr:'Artbooks', en:'Art books', es:'Art books', de:'Artbooks', it:'Artbook', ar:'كتب فنية', zh:'画集', ja:'アートブック', ru:'Артбуки', pl:'Artbooki' },
  ost:      { fr:'Bandes originales', en:'Soundtracks', es:'Bandas sonoras', de:'Soundtracks', it:'Colonne sonore', ar:'الموسيقى التصويرية', zh:'原声音乐', ja:'サウンドトラック', ru:'Саундтреки', pl:'Ścieżki dźwiękowe' },
  collector:{ fr:'Éditions collector', en:'Collector editions', es:'Ediciones de coleccionista', de:'Collector-Editionen', it:'Edizioni collector', ar:'إصدارات المقتنين', zh:'典藏版', ja:'コレクターズ版', ru:'Коллекционные издания', pl:'Edycje kolekcjonerskie' },
  view:     { fr:'Voir la fiche', en:'View page', es:'Ver ficha', de:'Zur Seite', it:'Vedi la scheda', ar:'عرض الصفحة', zh:'查看页面', ja:'ページを見る', ru:'К странице', pl:'Zobacz stronę' },
};
const _st = k => (_SHOP_T[k] && (_SHOP_T[k][LANG] || _SHOP_T[k].en)) || '';

/* Carte d'offre (précommande) — partagée entre la page Nos Œuvres (rail
   "Offres du moment") et tout futur usage store. */
function _shopDealHTML(w) {
  const tint = w.tint || '#ffffff';
  const tintRgb = hexToRgb(tint) || '255,255,255';
  return `
    <article class="shop-deal reveal" style="--tint:${tint};--tint-rgb:${tintRgb}" role="button" tabindex="0"
             aria-label="${w.title}" onclick="showPage('detail','${w.id}')"
             onkeydown="if(event.key==='Enter')showPage('detail','${w.id}')">
      <div class="shop-deal-cover"><img src="${av(w.cover)}" alt="" loading="lazy" decoding="async"></div>
      <div class="shop-deal-info">
        <span class="shop-deal-type">${getCatLabel(w)} · ${w.year}</span>
        <h3 class="shop-deal-title">${w.title}</h3>
        <p class="shop-deal-tagline">${getItemField(w, 'tagline') || ''}</p>
        <div class="shop-deal-price">${priceHTML(w)}</div>
        ${promoEndsHTML(w)}
        <span class="shop-deal-cta">${_st('view')} <span aria-hidden="true">${_ARR()}</span></span>
      </div>
      <button class="c-wish ${wishHas(w.id)?'on':''}" data-wish="${w.id}" aria-pressed="${wishHas(w.id)}"
              aria-label="${_wt('add')}" onclick="event.stopPropagation();toggleWish('${w.id}',this)">${_HEART_SVG}</button>
    </article>`;
}

/* Rail "Offres du moment" sur NOS ŒUVRES — la section d'achat des jeux et
   films. (La Boutique, elle, est dédiée au merchandising.) Inséré après la
   barre de filtres ; disparaît proprement s'il n'y a aucune promo active. */
function buildWorksDeals() {
  const page = $('page-works'); if (!page) return;
  let host = page.querySelector('#works-deals');
  const deals = filterByAge(ALL_WORKS).filter(w => activePromo(w));
  if (!deals.length) { host?.remove(); return; }
  if (!host) {
    host = document.createElement('section');
    host.id = 'works-deals';
    host.className = 'shop-sec shop-sec--deals works-deals';
    const anchor = page.querySelector('.works-filters') || page.querySelector('.works-hero');
    if (anchor) anchor.insertAdjacentElement('afterend', host);
    else page.prepend(host);
  }
  host.innerHTML = `
    <div class="shop-sec-head reveal">
      <div>
        <div class="dp-sec-label">${_st('deals')}</div>
        <p class="shop-sec-sub">${_st('dealsSub')}</p>
      </div>
    </div>
    <div class="shop-deals">${deals.map(_shopDealHTML).join('')}</div>`;
}

/* BOUTIQUE = MERCHANDISING UNIQUEMENT (décision studio) : figurines,
   peluches, vêtements, artbooks, BO, collector — les jeux/films s'achètent
   dans Nos Œuvres (bandeau de renvoi en bas de page). */
function buildShopPage() {
  const root = $('shop-root');
  if (!root) return;

  const CATS = [
    ['figurines', '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="6" r="2.6" stroke="currentColor" stroke-width="1.3"/><path d="M8 11.5c1-1.2 2.4-1.9 4-1.9s3 .7 4 1.9M12 9.6V16m0 0l-2.6 4.4M12 16l2.6 4.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M5.5 21h13" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>'],
    ['plush', '<svg viewBox="0 0 24 24" fill="none"><circle cx="7.5" cy="6.5" r="2" stroke="currentColor" stroke-width="1.3"/><circle cx="16.5" cy="6.5" r="2" stroke="currentColor" stroke-width="1.3"/><circle cx="12" cy="12.5" r="6" stroke="currentColor" stroke-width="1.3"/><circle cx="10" cy="11.5" r=".8" fill="currentColor"/><circle cx="14" cy="11.5" r=".8" fill="currentColor"/><path d="M10.6 14.6c.9.7 1.9.7 2.8 0" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>'],
    ['apparel', '<svg viewBox="0 0 24 24" fill="none"><path d="M9 4L4 7l1.8 3.4L8 9.5V20h8V9.5l2.2.9L20 7l-5-3a3 3 0 01-6 0z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>'],
    ['artbooks', '<svg viewBox="0 0 24 24" fill="none"><path d="M5 4h11a2 2 0 012 2v14H7a2 2 0 01-2-2V4z" stroke="currentColor" stroke-width="1.3"/><path d="M5 17h13" stroke="currentColor" stroke-width="1.3"/></svg>'],
    ['ost', '<svg viewBox="0 0 24 24" fill="none"><circle cx="7" cy="17" r="2.4" stroke="currentColor" stroke-width="1.3"/><circle cx="17" cy="15" r="2.4" stroke="currentColor" stroke-width="1.3"/><path d="M9.4 17V6l10-2v11" stroke="currentColor" stroke-width="1.3"/></svg>'],
    ['collector', '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3l2.5 5 5.5.8-4 3.9.95 5.5L12 16.5 7.05 18.1 8 12.7 4 8.8 9.5 8 12 3z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>'],
  ];

  root.innerHTML = `
    <div class="works-hero glg-pattern glg-line-after">
      <div class="glg-pattern-bg glg-pat-subtle" style="--glg-speed:60s;--glg-direction:reverse"></div>
      <p class="section-eye reveal">${_st('eye')}</p>
      <h1 class="section-h reveal" style="font-size:clamp(4rem,12vw,10rem);line-height:.88;margin-top:12px">${_st('title')}</h1>
      <p class="reveal" id="shop-sub" style="font-size:.87rem;color:var(--greyt);max-width:480px;line-height:1.82;margin-top:16px">${_st('sub')}</p>
    </div>

    <section class="shop-sec shop-sec--soon">
      <div class="shop-sec-head reveal">
        <div>
          <div class="dp-sec-label">${_st('soon')}</div>
          <p class="shop-sec-sub">${_st('soonSub')}</p>
        </div>
      </div>
      <div class="merch-grid">
        ${CATS.map(([key, svg], i) => `
        <div class="merch-cat reveal" style="transition-delay:${i * 0.05}s">
          <span class="merch-cat-soon">${_st('soonTag')}</span>
          <div class="merch-cat-ico">${svg}</div>
          <span class="merch-cat-name">${_st(key)}</span>
        </div>`).join('')}
      </div>
    </section>

    <section class="shop-sec shop-sec--redirect">
      <div class="shop-redirect reveal">
        <div class="shop-redirect-txt">
          <h2 class="shop-redirect-title">${_st('gamesNotice')}</h2>
          <p class="shop-sec-sub">${_st('gamesNoticeSub')}</p>
        </div>
        <button class="btn btn-primary btn-lg" onclick="showPage('works')">${_st('gamesCta')} <span aria-hidden="true">${_ARR()}</span></button>
      </div>
    </section>`;
  initAnimIdleObserver(); // le hero à motifs injecté ci-dessus doit aussi se mettre en pause hors écran
}

/* ══════════════════════════════════════════
   BIBLIOTHÈQUE (façon Rockstar/Steam) — jeux possédés du joueur
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
  signedOut:  { fr:'Connecte-toi pour retrouver tous les jeux que tu possèdes, prêts à installer et à lancer.', en:'Sign in to find every game you own, ready to install and launch.', es:'Inicia sesión para encontrar todos los juegos que posees, listos para instalar y jugar.', de:'Melde dich an, um alle deine Spiele zu finden — bereit zum Installieren und Starten.', it:'Accedi per ritrovare tutti i giochi che possiedi, pronti da installare e avviare.', ar:'سجّل الدخول لتجد كل ألعابك جاهزة للتثبيت والتشغيل.', zh:'登录后即可找到你拥有的所有游戏，随时安装与启动。', ja:'サインインすると、所有しているすべてのゲームをインストール・起動できます。', ru:'Войдите, чтобы увидеть все ваши игры — готовые к установке и запуску.', pl:'Zaloguj się, aby zobaczyć wszystkie posiadane gry — gotowe do instalacji i uruchomienia.' },
  empty:      { fr:'Aucun jeu pour le moment', en:'No games yet', es:'Aún no hay juegos', de:'Noch keine Spiele', it:'Ancora nessun gioco', ar:'لا ألعاب بعد', zh:'暂无游戏', ja:'まだゲームがありません', ru:'Пока нет игр', pl:'Brak gier' },
  emptyNote:  { fr:'Tes achats GEEKLEARN GAMES — et tes jeux des comptes liés Steam, Epic ou PlayStation — apparaîtront ici, prêts à installer.', en:'Your GEEKLEARN GAMES purchases — and games from linked Steam, Epic or PlayStation accounts — will appear here, ready to install.', es:'Tus compras de GEEKLEARN GAMES — y los juegos de cuentas vinculadas de Steam, Epic o PlayStation — aparecerán aquí.', de:'Deine GEEKLEARN-GAMES-Käufe — und Spiele verknüpfter Steam-, Epic- oder PlayStation-Konten — erscheinen hier.', it:'I tuoi acquisti GEEKLEARN GAMES — e i giochi degli account collegati Steam, Epic o PlayStation — appariranno qui.', ar:'ستظهر هنا مشترياتك من GEEKLEARN GAMES — وألعاب حساباتك المرتبطة على Steam وEpic وPlayStation.', zh:'你在 GEEKLEARN GAMES 的购买——以及已绑定的 Steam、Epic 或 PlayStation 账户中的游戏——都会显示在这里。', ja:'GEEKLEARN GAMESでの購入と、連携済みのSteam・Epic・PlayStationアカウントのゲームがここに表示されます。', ru:'Ваши покупки в GEEKLEARN GAMES — и игры привязанных аккаунтов Steam, Epic или PlayStation — появятся здесь.', pl:'Twoje zakupy w GEEKLEARN GAMES — oraz gry z połączonych kont Steam, Epic i PlayStation — pojawią się tutaj.' },
  browse:     { fr:'Parcourir Nos Œuvres', en:'Browse Our Works', es:'Ver Nuestras Obras', de:'Unsere Werke ansehen', it:'Sfoglia le Opere', ar:'تصفّح أعمالنا', zh:'浏览我们的作品', ja:'作品一覧を見る', ru:'К нашим работам', pl:'Przeglądaj Nasze Dzieła' },
  ownedOn:    { fr:'Possédé sur %s', en:'Owned on %s', es:'En propiedad en %s', de:'Im Besitz auf %s', it:'Posseduto su %s', ar:'مملوك على %s', zh:'拥有于%s', ja:'%sで所有', ru:'Куплено в %s', pl:'Posiadane na %s' },
  since:      { fr:'Ajouté le %s', en:'Added %s', es:'Añadido el %s', de:'Hinzugefügt am %s', it:'Aggiunto il %s', ar:'أُضيف في %s', zh:'添加于%s', ja:'%sに追加', ru:'Добавлено %s', pl:'Dodano %s' },
  handoffPlayT:{ fr:'Ouvrir le launcher pour jouer ?', en:'Open the launcher to play?', es:'¿Abrir el launcher para jugar?', de:'Launcher zum Spielen öffnen?', it:'Aprire il launcher per giocare?', ar:'فتح المشغّل للعب؟', zh:'打开启动器开始游戏？', ja:'ランチャーを開いてプレイしますか？', ru:'Открыть лаунчер, чтобы играть?', pl:'Otworzyć launcher, aby zagrać?' },
  handoffInstT:{ fr:'Ouvrir le launcher pour installer ?', en:'Open the launcher to install?', es:'¿Abrir el launcher para instalar?', de:'Launcher zum Installieren öffnen?', it:'Aprire il launcher per installare?', ar:'فتح المشغّل للتثبيت؟', zh:'打开启动器进行安装？', ja:'ランチャーを開いてインストールしますか？', ru:'Открыть лаунчер для установки?', pl:'Otworzyć launcher, aby zainstalować?' },
  handoffBody: { fr:'%s va s’ouvrir dans le launcher GEEKLEARN GAMES — tu confirmeras l’action là-bas.', en:'%s will open in the GEEKLEARN GAMES launcher — you’ll confirm the action there.', es:'%s se abrirá en el launcher de GEEKLEARN GAMES — confirmarás la acción allí.', de:'%s öffnet sich im GEEKLEARN-GAMES-Launcher — dort bestätigst du die Aktion.', it:'%s si aprirà nel launcher GEEKLEARN GAMES — confermerai l’azione lì.', ar:'سيُفتح %s في مشغّل GEEKLEARN GAMES — وستؤكد الإجراء هناك.', zh:'%s 将在 GEEKLEARN GAMES 启动器中打开——你将在那里确认操作。', ja:'%sはGEEKLEARN GAMESランチャーで開きます — 操作はそこで確認します。', ru:'%s откроется в лаунчере GEEKLEARN GAMES — действие вы подтвердите там.', pl:'%s otworzy się w launcherze GEEKLEARN GAMES — tam potwierdzisz działanie.' },
  open:       { fr:'Ouvrir le launcher', en:'Open launcher', es:'Abrir el launcher', de:'Launcher öffnen', it:'Apri il launcher', ar:'فتح المشغّل', zh:'打开启动器', ja:'ランチャーを開く', ru:'Открыть лаунчер', pl:'Otwórz launcher' },
  missT:      { fr:'Launcher introuvable', en:'Launcher not found', es:'Launcher no encontrado', de:'Launcher nicht gefunden', it:'Launcher non trovato', ar:'المشغّل غير موجود', zh:'未找到启动器', ja:'ランチャーが見つかりません', ru:'Лаунчер не найден', pl:'Nie znaleziono launchera' },
  missNote:   { fr:'Le launcher GEEKLEARN GAMES n’est pas encore installé sur cette machine. Il arrive très bientôt en téléchargement — tes jeux restent liés à ton compte, rien n’est perdu.', en:'The GEEKLEARN GAMES launcher isn’t installed on this machine yet. It’s coming very soon — your games stay tied to your account, nothing is lost.', es:'El launcher de GEEKLEARN GAMES aún no está instalado en este equipo. Llegará muy pronto — tus juegos permanecen vinculados a tu cuenta.', de:'Der GEEKLEARN-GAMES-Launcher ist auf diesem Rechner noch nicht installiert. Er kommt sehr bald — deine Spiele bleiben mit deinem Konto verknüpft.', it:'Il launcher GEEKLEARN GAMES non è ancora installato su questa macchina. Arriverà molto presto — i tuoi giochi restano legati al tuo account.', ar:'مشغّل GEEKLEARN GAMES غير مثبّت على هذا الجهاز بعد. سيتوفر قريباً جداً — تبقى ألعابك مرتبطة بحسابك.', zh:'这台设备尚未安装 GEEKLEARN GAMES 启动器。它很快就会推出——你的游戏始终绑定在你的账户上。', ja:'このマシンにはGEEKLEARN GAMESランチャーがまだインストールされていません。まもなく登場します — ゲームはアカウントに紐づいたままです。', ru:'Лаунчер GEEKLEARN GAMES ещё не установлен на этом компьютере. Он скоро выйдет — ваши игры остаются привязанными к аккаунту.', pl:'Launcher GEEKLEARN GAMES nie jest jeszcze zainstalowany na tym komputerze. Pojawi się już wkrótce — twoje gry pozostają przypisane do konta.' },
  ok:         { fr:'Compris', en:'Got it', es:'Entendido', de:'Verstanden', it:'Capito', ar:'فهمت', zh:'知道了', ja:'了解', ru:'Понятно', pl:'Rozumiem' },
};
const _lbt = k => (_LIB_T[k] && (_LIB_T[k][LANG] || _LIB_T[k].en)) || '';
/* Flèche directionnelle : « → » pointe EN ARRIÈRE en RTL (arabe) — miroir. */
const _ARR = () => (LANG === 'ar' ? '←' : '→');
const _LIB_PLAT_NAME = pid => (pid === 'glg' || !pid) ? 'GEEKLEARN GAMES' : ((typeof PLATS !== 'undefined' && PLATS[pid] && PLATS[pid].name) || pid);

let _libSelected = null;

/* Le joueur possède-t-il cette œuvre ? Lit le cache de profil maintenu par
   refreshAccountUI — synchrone, utilisable par buildDetail. */
function _ownsWork(id) {
  const lib = _accountProfile && _accountProfile.library;
  return Array.isArray(lib) && lib.some(e => e && e.id === id);
}

async function buildLibraryPage() {
  const root = $('library-root');
  if (!root) return;
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
  const lib = (Array.isArray(p.library) ? p.library : [])
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

  root.innerHTML = `
    <div class="lib-shell">
      <aside class="lib-rail" aria-label="${_lbt('eyebrow')}">
        <div class="lib-rail-head">
          <span>${_lbt('eyebrow')}</span>
          <span class="lib-count">${lib.length}</span>
        </div>
        <div class="lib-rail-list">
          ${lib.map(x => `
          <button class="lib-item ${x.w.id === _libSelected ? 'active' : ''}" data-lib="${x.w.id}" aria-current="${x.w.id === _libSelected ? 'true' : 'false'}">
            <span class="lib-item-cover"><img src="${av(x.w.cover)}" alt="" loading="lazy" decoding="async"></span>
            <span class="lib-item-name">${x.w.title}</span>
          </button>`).join('')}
        </div>
      </aside>
      <div class="lib-stage" id="lib-stage">${_libStageHTML(lib.find(x => x.w.id === _libSelected), recent)}</div>
    </div>`;

  root.querySelectorAll('[data-lib]').forEach(b => b.addEventListener('click', () => {
    _libSelected = b.dataset.lib;
    root.querySelectorAll('[data-lib]').forEach(x => { x.classList.toggle('active', x === b); x.setAttribute('aria-current', x === b ? 'true' : 'false'); });
    const stage = $('lib-stage');
    if (stage) {
      stage.classList.remove('lib-stage--in');
      stage.innerHTML = _libStageHTML(lib.find(x => x.w.id === _libSelected), recent);
      setTimeout(() => stage.classList.add('lib-stage--in'), 20); // setTimeout, pas rAF (onglet caché)
    }
  }));
  setTimeout(() => $('lib-stage')?.classList.add('lib-stage--in'), 30);
}

/* Vitrine du jeu sélectionné (key art plein cadre + actions launcher). */
function _libStageHTML(x, recent) {
  if (!x) return '';
  const w = x.e ? x.w : x, e = x.e || {};
  const tint = w.tint || '#ffffff';
  const rgb  = hexToRgb(tint) || '255,255,255';
  const rec  = (recent || []).find(r => r.id === w.id);
  let playedTxt = '';
  if (rec && rec.mins > 0) {
    const mins = Math.max(0, parseInt(rec.mins, 10) || 0);
    let h = '';
    try { h = new Intl.NumberFormat(LANG_LOCALE[LANG] || 'en-US', { maximumFractionDigits: mins >= 600 ? 0 : 1 }).format(mins / 60); } catch (err) { h = (mins / 60).toFixed(1); }
    playedTxt = mins >= 60 ? _rgt('playedH').replace('%s', h) : _rgt('playedM').replace('%s', String(mins));
  }
  let sinceTxt = '';
  if (e.at) { try { sinceTxt = _lbt('since').replace('%s', new Date(e.at).toLocaleDateString(LANG_LOCALE[LANG] || 'en-US', { day:'numeric', month:'long', year:'numeric' })); } catch (err) {} }
  const troph = _gameTrophySummary(w.id);
  return `
    <div class="lib-hero" style="--tint:${tint};--tint-rgb:${rgb}">
      <div class="lib-hero-bg" style="background-image:url('${av(w.cover)}')"></div>
      <div class="lib-hero-veil"></div>
      <div class="lib-hero-body">
        <span class="lib-eyebrow">${getCatLabel(w)} · ${w.year}</span>
        ${w.logo ? `<img class="lib-logo" src="${av(w.logo)}" alt="${w.title}">` : `<h1 class="lib-title">${w.title}</h1>`}
        <p class="lib-tagline">${getItemField(w, 'tagline') || ''}</p>
        <div class="lib-ctas">
          <button class="btn btn-primary btn-lg lib-play" onclick="launcherHandoff('${w.id}','play')">▶ ${_lbt('play')}</button>
          <button class="btn btn-outline btn-lg" onclick="launcherHandoff('${w.id}','install')">${_lbt('install')}</button>
        </div>
        <div class="lib-meta">
          <span>${_lbt('ownedOn').replace('%s', escHtml(_LIB_PLAT_NAME(e.platform)))}</span>
          ${sinceTxt ? `<span class="lib-meta-dot">·</span><span>${sinceTxt}</span>` : ''}
          ${playedTxt ? `<span class="lib-meta-dot">·</span><span>${playedTxt}</span>` : ''}
        </div>
        <div class="lib-links">
          <button class="lib-link" onclick="showPage('detail','${w.id}')">${_st('view')} <span aria-hidden="true">${_ARR()}</span></button>
          ${troph ? `<button class="lib-link" onclick="openTrophyList('${w.id}')">${_tt('section')} <span aria-hidden="true">${_ARR()}</span></button>` : ''}
        </div>
      </div>
    </div>`;
}

/* ── HAND-OFF LAUNCHER (glg:// — même mécanique que steam://) ───────────
   Le site demande, le launcher confirme. Si le protocole n'est pas
   enregistré (launcher absent), la page ne perd jamais le focus →
   on bascule la modale en état "launcher introuvable". */
function launcherHandoff(gameId, verb) {
  const w = ALL_WORKS.find(i => i.id === gameId);
  if (!w) return;
  // DANS le launcher : pas de modale de passage de relais — on agit direct
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
        const ghostYear = (String(it.year).match(/\d{4}/g) || []).pop() || '';
        return `
        <button class="rm-node ${i % 2 ? 'rm-node--r reveal reveal-right' : 'rm-node--l reveal reveal-left'}" style="--tint:${tint};--tint-rgb:${rgb}"
                onclick="showPage('detail','${it.id}')" aria-label="${it.title} — ${it.year}">
          <span class="rm-dot" aria-hidden="true"></span>
          <span class="rm-card">
            <span class="rm-card-top">
              <img class="rm-cover" src="${av(it.cover)}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none'">
              <span class="rm-card-meta">
                <span class="rm-date">${it.year}</span>
                <span class="rm-type">${getCatLabel(it)}</span>
              </span>
            </span>
            <span class="rm-name">${it.title}</span>
            <span class="rm-tag">${getItemField(it, 'tagline')}</span>
            <span class="rm-go">${L(_ROADMAP_T.cta)} <span class="rm-go-arr">→</span></span>
          </span>
          ${ghostYear ? `<span class="rm-ghost" aria-hidden="true">${ghostYear}</span>` : ''}
        </button>`;
      }).join('')}
    </div>`;
}

/* ══════════════════════════════════════════
   ACCUEIL — « LE LAUNCHER ARRIVE » (annonce du standalone V1.0.0)
   Fenêtre stylisée (chrome + rail bibliothèque esquissé) + 4 piliers +
   plateformes. Le launcher web étant complet, cette section vend l'app
   de bureau qui reprendra le même compte, la même bibliothèque.
══════════════════════════════════════════ */
const _LNCH_T = {
  eyebrow: { fr:'Application de bureau · bientôt', en:'Desktop app · coming soon', es:'Aplicación de escritorio · muy pronto', de:'Desktop-App · bald verfügbar', it:'App desktop · in arrivo', ar:'تطبيق سطح المكتب · قريباً', zh:'桌面应用 · 即将推出', ja:'デスクトップアプリ · 近日公開', ru:'Настольное приложение · скоро', pl:'Aplikacja desktopowa · już wkrótce' },
  title:   { fr:'LE LAUNCHER ARRIVE', en:'THE LAUNCHER IS COMING', es:'EL LAUNCHER LLEGA', de:'DER LAUNCHER KOMMT', it:'IL LAUNCHER STA ARRIVANDO', ar:'المشغّل قادم', zh:'启动器即将登场', ja:'ランチャーがやってくる', ru:'ЛАУНЧЕР УЖЕ БЛИЗКО', pl:'LAUNCHER NADCHODZI' },
  sub:     { fr:'Tout ce que tu utilises ici — compte, bibliothèque, amis, trophées — dans une application installée, plus rapide, avec mises à jour automatiques signées.', en:'Everything you use here — account, library, friends, trophies — in an installed app: faster, with signed automatic updates.', es:'Todo lo que usas aquí — cuenta, biblioteca, amigos, trofeos — en una aplicación instalada, más rápida y con actualizaciones automáticas firmadas.', de:'Alles, was du hier nutzt — Konto, Bibliothek, Freunde, Trophäen — in einer installierten App: schneller, mit signierten automatischen Updates.', it:'Tutto quello che usi qui — account, libreria, amici, trofei — in un\'app installata: più veloce, con aggiornamenti automatici firmati.', ar:'كل ما تستخدمه هنا — الحساب والمكتبة والأصدقاء والجوائز — في تطبيق مثبّت، أسرع، مع تحديثات تلقائية موقَّعة.', zh:'你在这里使用的一切——账户、游戏库、好友、奖杯——都将进入一款安装式应用：更快，且带有签名的自动更新。', ja:'ここで使うすべて — アカウント、ライブラリ、フレンド、トロフィー — がインストール型アプリに。より速く、署名付き自動アップデート対応。', ru:'Всё, чем вы пользуетесь здесь — аккаунт, библиотека, друзья, трофеи — в установленном приложении: быстрее, с подписанными автообновлениями.', pl:'Wszystko, czego używasz tutaj — konto, biblioteka, znajomi, trofea — w zainstalowanej aplikacji: szybszej, z podpisanymi automatycznymi aktualizacjami.' },
  f1t: { fr:'Une seule identité', en:'One identity', es:'Una sola identidad', de:'Eine Identität', it:'Un\'unica identità', ar:'هوية واحدة', zh:'同一身份', ja:'ひとつのアカウント', ru:'Единый аккаунт', pl:'Jedna tożsamość' },
  f1d: { fr:'Même compte, même bibliothèque, mêmes amis — le site et l\'app ne font qu\'un.', en:'Same account, same library, same friends — site and app are one.', es:'Misma cuenta, misma biblioteca, mismos amigos — el sitio y la app son uno.', de:'Gleiches Konto, gleiche Bibliothek, gleiche Freunde — Website und App sind eins.', it:'Stesso account, stessa libreria, stessi amici — sito e app sono una cosa sola.', ar:'الحساب نفسه والمكتبة نفسها والأصدقاء أنفسهم — الموقع والتطبيق واحد.', zh:'同一账户、同一游戏库、同样的好友——网站与应用合而为一。', ja:'同じアカウント、同じライブラリ、同じフレンド — サイトとアプリはひとつ。', ru:'Тот же аккаунт, та же библиотека, те же друзья — сайт и приложение едины.', pl:'To samo konto, ta sama biblioteka, ci sami znajomi — strona i aplikacja to jedno.' },
  f2t: { fr:'Installation & jeu en un clic', en:'One-click install & play', es:'Instalar y jugar en un clic', de:'Installieren & Spielen mit einem Klick', it:'Installa e gioca in un clic', ar:'تثبيت ولعب بنقرة', zh:'一键安装与启动', ja:'ワンクリックでインストール&プレイ', ru:'Установка и запуск в один клик', pl:'Instalacja i gra jednym kliknięciem' },
  f2d: { fr:'Le bouton Jouer du site ouvre l\'app (glg://) — elle télécharge, installe et lance.', en:'The site\'s Play button opens the app (glg://) — it downloads, installs and launches.', es:'El botón Jugar del sitio abre la app (glg://): descarga, instala y lanza.', de:'Der Spielen-Button der Website öffnet die App (glg://) — sie lädt, installiert und startet.', it:'Il pulsante Gioca del sito apre l\'app (glg://): scarica, installa e avvia.', ar:'زر اللعب في الموقع يفتح التطبيق (glg://) — فيُنزّل ويثبّت ويشغّل.', zh:'网站上的“开始游戏”按钮会打开应用（glg://）——由它完成下载、安装与启动。', ja:'サイトのプレイボタンがアプリ（glg://）を開き、ダウンロード・インストール・起動まで行います。', ru:'Кнопка «Играть» на сайте открывает приложение (glg://) — оно скачивает, устанавливает и запускает.', pl:'Przycisk Graj na stronie otwiera aplikację (glg://) — ona pobiera, instaluje i uruchamia.' },
  f3t: { fr:'Mises à jour signées', en:'Signed updates', es:'Actualizaciones firmadas', de:'Signierte Updates', it:'Aggiornamenti firmati', ar:'تحديثات موقَّعة', zh:'签名更新', ja:'署名付きアップデート', ru:'Подписанные обновления', pl:'Podpisane aktualizacje' },
  f3d: { fr:'Jeux et launcher se mettent à jour tout seuls, avec vérification cryptographique.', en:'Games and launcher update themselves, cryptographically verified.', es:'Los juegos y el launcher se actualizan solos, con verificación criptográfica.', de:'Spiele und Launcher aktualisieren sich selbst — kryptografisch verifiziert.', it:'Giochi e launcher si aggiornano da soli, con verifica crittografica.', ar:'تتحدّث الألعاب والمشغّل تلقائياً مع تحقق تشفيري.', zh:'游戏与启动器自动更新，并经过加密校验。', ja:'ゲームもランチャーも自動更新。暗号署名で検証されます。', ru:'Игры и лаунчер обновляются сами, с криптографической проверкой.', pl:'Gry i launcher aktualizują się same, z weryfikacją kryptograficzną.' },
  f4t: { fr:'Sécurité intégrale', en:'Full security', es:'Seguridad total', de:'Volle Sicherheit', it:'Sicurezza totale', ar:'أمان كامل', zh:'全面安全', ja:'万全のセキュリティ', ru:'Полная защита', pl:'Pełne bezpieczeństwo' },
  f4d: { fr:'2FA type Steam Guard, données chiffrées, vie privée respectée — déjà actifs ici.', en:'Steam Guard-style 2FA, encrypted data, privacy respected — already live here.', es:'2FA al estilo Steam Guard, datos cifrados, privacidad respetada — ya activos aquí.', de:'2FA im Steam-Guard-Stil, verschlüsselte Daten, gewahrte Privatsphäre — hier bereits aktiv.', it:'2FA in stile Steam Guard, dati cifrati, privacy rispettata — già attivi qui.', ar:'مصادقة ثنائية بأسلوب Steam Guard وبيانات مشفّرة وخصوصية محترمة — مفعّلة هنا بالفعل.', zh:'Steam 令牌式两步验证、数据加密、尊重隐私——这些已在此生效。', ja:'Steam Guard式2FA、暗号化データ、プライバシー尊重 — すでにここで稼働中。', ru:'2FA в стиле Steam Guard, шифрование данных, уважение к приватности — уже работает здесь.', pl:'2FA w stylu Steam Guard, szyfrowane dane, poszanowanie prywatności — już działa tutaj.' },
  notify:  { fr:'Être prévenu de la sortie', en:'Get notified at launch', es:'Avísame en el lanzamiento', de:'Zum Start benachrichtigen', it:'Avvisami al lancio', ar:'أعلمني عند الصدور', zh:'发布时通知我', ja:'リリース時に通知を受け取る', ru:'Сообщить о выходе', pl:'Powiadom mnie o premierze' },
  version: { fr:'V1.0.0 · Windows & macOS', en:'V1.0.0 · Windows & macOS', es:'V1.0.0 · Windows y macOS', de:'V1.0.0 · Windows & macOS', it:'V1.0.0 · Windows e macOS', ar:'V1.0.0 · Windows وmacOS', zh:'V1.0.0 · Windows 与 macOS', ja:'V1.0.0 · Windows & macOS', ru:'V1.0.0 · Windows и macOS', pl:'V1.0.0 · Windows i macOS' },
  eyebrowDl:{ fr:'Application de bureau · V1.0.0 disponible', en:'Desktop app · V1.0.0 available', es:'Aplicación de escritorio · V1.0.0 disponible', de:'Desktop-App · V1.0.0 verfügbar', it:'App desktop · V1.0.0 disponibile', ar:'تطبيق سطح المكتب · V1.0.0 متاح الآن', zh:'桌面应用 · V1.0.0 现已推出', ja:'デスクトップアプリ · V1.0.0 配信中', ru:'Настольное приложение · доступна V1.0.0', pl:'Aplikacja desktopowa · V1.0.0 dostępna' },
  titleDl: { fr:'TÉLÉCHARGE LE LAUNCHER', en:'DOWNLOAD THE LAUNCHER', es:'DESCARGA EL LAUNCHER', de:'LADE DEN LAUNCHER', it:'SCARICA IL LAUNCHER', ar:'حمّل المشغّل', zh:'下载启动器', ja:'ランチャーをダウンロード', ru:'СКАЧАЙ ЛАУНЧЕР', pl:'POBIERZ LAUNCHER' },
  dlWin:   { fr:'Télécharger pour Windows', en:'Download for Windows', es:'Descargar para Windows', de:'Für Windows herunterladen', it:'Scarica per Windows', ar:'تنزيل لويندوز', zh:'下载 Windows 版', ja:'Windows版をダウンロード', ru:'Скачать для Windows', pl:'Pobierz dla Windows' },
  dlMeta:  { fr:'%s Mo · installation en un clic · mises à jour automatiques signées', en:'%s MB · one-click install · signed auto-updates', es:'%s MB · instalación en un clic · actualizaciones automáticas firmadas', de:'%s MB · Ein-Klick-Installation · signierte Auto-Updates', it:'%s MB · installazione in un clic · aggiornamenti automatici firmati', ar:'%s م.ب · تثبيت بنقرة · تحديثات تلقائية موقَّعة', zh:'%s MB · 一键安装 · 签名自动更新', ja:'%s MB · ワンクリックインストール · 署名付き自動更新', ru:'%s МБ · установка в один клик · подписанные автообновления', pl:'%s MB · instalacja jednym kliknięciem · podpisane autoaktualizacje' },
  dlSoon:  { fr:'bientôt', en:'soon', es:'pronto', de:'bald', it:'presto', ar:'قريباً', zh:'即将推出', ja:'近日', ru:'скоро', pl:'wkrótce' },
  dlSha:   { fr:'Empreinte SHA-256 de l’installeur', en:'Installer SHA-256 checksum', es:'Huella SHA-256 del instalador', de:'SHA-256-Prüfsumme des Installers', it:'Impronta SHA-256 dell’installer', ar:'بصمة SHA-256 للمثبّت', zh:'安装包 SHA-256 校验值', ja:'インストーラのSHA-256チェックサム', ru:'Контрольная сумма SHA-256 установщика', pl:'Suma kontrolna SHA-256 instalatora' },
};
const _lnt = k => (_LNCH_T[k] && (_LNCH_T[k][LANG] || _LNCH_T[k].en)) || '';

/* Téléchargements du launcher — UNE seule source de vérité pour les URLs.
   Windows : installeur auto-hébergé (léger, 1,7 Mo). macOS/Linux : renseigner
   les URLs GitHub Releases à la 1re release CI (tag launcher-v*). */
const LAUNCHER_DL = {
  version: '1.0.0',
  sizeMB: 1.7,
  sha256: '7e3c72418291e1a1400a9be922c90edd70f66e75662b14cb0171b032b1ed1a59',
  win: 'download/GEEKLEARN-GAMES-Setup.exe',
  mac: null,   // ex.: https://github.com/<compte>/<repo>/releases/latest/download/GEEKLEARN.GAMES_1.0.0_aarch64.dmg
  linux: null, // ex.: .../GEEKLEARN.GAMES_1.0.0_amd64.AppImage
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
  // Bouton principal selon l'OS du visiteur ; plateformes sans artefact
  // publié = chip « bientôt » (URLs centralisées dans LAUNCHER_DL).
  const os = _dlOS();
  const dlIcon = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 2v8M4.5 6.5L8 10l3.5-3.5M2.5 13h11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  let sizeTxt = String(LAUNCHER_DL.sizeMB);
  try { sizeTxt = new Intl.NumberFormat(LANG_LOCALE[LANG] || 'en-US', { maximumFractionDigits: 1 }).format(LAUNCHER_DL.sizeMB); } catch (e) {}
  const primary = (os === 'mac' && !LAUNCHER_DL.mac) || (os === 'linux' && !LAUNCHER_DL.linux)
    ? `<span class="btn btn-outline btn-lg lt-dl-soon">${os === 'mac' ? 'macOS' : 'Linux'} — ${_lnt('dlSoon')}</span>
       <a class="btn btn-primary btn-lg" href="${LAUNCHER_DL.win}" download>${dlIcon} ${_lnt('dlWin')}</a>`
    : `<a class="btn btn-primary btn-lg" href="${LAUNCHER_DL[os === 'mac' ? 'mac' : os === 'linux' ? 'linux' : 'win'] || LAUNCHER_DL.win}" download>${dlIcon} ${os === 'mac' ? 'macOS' : os === 'linux' ? 'Linux' : _lnt('dlWin')}</a>`;
  host.innerHTML = `
    <div class="lt-inner">
      <div class="lt-copy">
        <p class="section-eye reveal">${_lnt('eyebrowDl')}</p>
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
        <div class="lt-platforms reveal">
          <span class="lt-plat ${LAUNCHER_DL.win ? 'lt-plat--on' : ''}">Windows 10/11</span>
          <span class="lt-plat ${LAUNCHER_DL.mac ? 'lt-plat--on' : ''}">macOS${LAUNCHER_DL.mac ? '' : ` — ${_lnt('dlSoon')}`}</span>
          <span class="lt-plat ${LAUNCHER_DL.linux ? 'lt-plat--on' : ''}">Linux${LAUNCHER_DL.linux ? '' : ` — ${_lnt('dlSoon')}`}</span>
        </div>
        <p class="lt-sha reveal">${_lnt('dlSha')} <code>${LAUNCHER_DL.sha256}</code></p>
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

/* Ornements vectoriels latéraux du hero — donnent une identité (teinte) propre
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

  // Build marquee content (repeated twice for seamless loop)
  const mqItems = [
    `<span class="dp-mq-item">${t('infoType')} <b>${localCat}</b></span><span class="dp-mq-dot">✦</span>`,
    `<span class="dp-mq-item">${t('infoYear')} <b>${item.year}</b></span><span class="dp-mq-dot">✦</span>`,
    `<span class="dp-mq-item">${t('infoStudio')} <b>GEEKLEARN GAMES</b></span><span class="dp-mq-dot">✦</span>`,
    `<span class="dp-mq-item">${t('infoStatus')} <b>${localStatus}</b></span><span class="dp-mq-dot">✦</span>`,
    `<span class="dp-mq-item">${t('infoPrice')} <b class="price-display" data-base-price="${basePriceNow}">${localPrice}</b></span><span class="dp-mq-dot">✦</span>`,
  ].join('');
  // One base set; _seamlessMarquee() fills + duplicates it after render (gap-proof loop)

  container.innerHTML = `

    <!-- ──────── HERO ──────── -->
    <div class="dp-hero">
      <div class="dp-hero-bg" style="background-image:url('${av(item.cover)}')"></div>
      <div class="dp-hero-vignette"></div>
      <div class="dp-hero-tint" style="background:${item.tint}"></div>
      ${_dpHeroArtHTML(item)}

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
          ${owned
            ? `<button class="btn btn-primary btn-lg" onclick="launcherHandoff('${item.id}','play')">▶ ${_lbt('play')}</button>`
            : `<button class="btn btn-primary btn-lg" onclick="openBuyModal('${item.id}')">${t('buyNow')} — ${localPrice}</button>`}
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
          : `<span class="dp-sticky-price">${priceHTML(item, { size:'sm' })}</span>
        <button class="dp-sticky-buy" onclick="openBuyModal('${item.id}')">${t('buyNow')} ${_ARR()}</button>`}
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
          <button class="dp-buybox-trailer" onclick="launcherHandoff('${item.id}','install')">${_lbt('install')}</button>` : `
          ${_dpEditionsHTML(item)}
          <div class="dp-buybox-price">${_editionPriceHTML(item)}</div>
          ${promoEndsHTML(item)}
          <button class="btn btn-primary dp-buybox-buy" onclick="openBuyModal('${item.id}')">${t('buyNow')} ${_ARR()}</button>
          <button class="dp-buybox-trailer" onclick="openTrailerModal('${item.id}')">▶ ${t('trailerBtn')}</button>`}
          <button class="dp-buybox-wish ${wishHas(item.id)?'on':''}" data-wish="${item.id}" aria-pressed="${wishHas(item.id)}" onclick="toggleWish('${item.id}',this)">
            <span class="dp-wish-ico">${_HEART_SVG}</span>
            <span class="dp-wish-label" data-wish-label>${wishHas(item.id)?_wt('inList'):_wt('add')}</span>
          </button>
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
          </div>
          ${_dpCapsHTML(item)}
          <div class="dp-buybox-facts">
            <div class="dp-fact"><span>${t('infoStudio') || 'Studio'}</span><b>GEEKLEARN GAMES</b></div>
            <div class="dp-fact"><span>${t('infoType') || 'Type'}</span><b>${localCat}</b></div>
            <div class="dp-fact"><span>${t('infoYear') || 'Year'}</span><b>${item.year}</b></div>
            ${_gameTrophySummary(item.id) ? `<div class="dp-fact dp-fact--btn" role="button" tabindex="0" onclick="openTrophyList('${item.id}')"><span>${_tt('section')}</span><b>${_gameTrophySummary(item.id).total} · ${_gameTrophySummary(item.id).tiers.platinum} ${_tt('platinum')} →</b></div>` : ''}
            <div class="dp-fact dp-fact--btn" id="dp-fact-rev" role="button" tabindex="0" style="display:none" onclick="document.getElementById('dp-reviews')?.scrollIntoView({behavior:'smooth',block:'start'})"><span>${_rvt('section')}</span><b></b></div>
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

  // Load player reviews (async — Supabase; shell renders instantly)
  _loadDpReviews(item);

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
/* « Acheter sur %s » — localisé (PLATS.cta était de l'anglais en dur). */
const _BUYON_T = { fr:'Acheter sur %s', en:'Buy on %s', es:'Comprar en %s', de:'Kaufen auf %s', it:'Acquista su %s', ar:'اشترِ على %s', zh:'在%s购买', ja:'%sで購入', ru:'Купить в %s', pl:'Kup na %s' };
const _platCta = p => (_BUYON_T[LANG] || _BUYON_T.en).replace('%s', (PLATS[p] && PLATS[p].name) || p);
/* Note honnête de la modale d'achat (les stores n'ont pas encore d'URL). */
const _BUYNOTE_T = {
  fr:'Les précommandes ouvriront ici à l’approche de la sortie — ajoute le titre à ta liste de souhaits pour être prévenu.',
  en:'Pre-orders will open here as release approaches — wishlist the title to get notified.',
  es:'Las reservas se abrirán aquí cuando se acerque el lanzamiento — añade el título a tu lista de deseos para recibir aviso.',
  de:'Vorbestellungen öffnen hier, wenn der Release näher rückt — setz den Titel auf deine Wunschliste, um benachrichtigt zu werden.',
  it:'I preordini apriranno qui all’avvicinarsi dell’uscita — aggiungi il titolo alla lista dei desideri per essere avvisato.',
  ar:'ستُفتح الطلبات المسبقة هنا مع اقتراب الإصدار — أضف اللعبة إلى قائمة رغباتك ليصلك إشعار.',
  zh:'临近发售时预购将在此开启——将作品加入心愿单即可收到通知。',
  ja:'発売が近づくとここで予約が始まります — ウィッシュリストに追加して通知を受け取りましょう。',
  ru:'Предзаказы откроются здесь ближе к выходу — добавьте игру в список желаемого, чтобы получить уведомление.',
  pl:'Przedsprzedaż ruszy tutaj przed premierą — dodaj tytuł do listy życzeń, aby dostać powiadomienie.',
};
function openBuyModal(id) {
  const item = ALL_WORKS.find(i => i.id === id);
  if (!item) return;
  setText('modal-eye', t('buyModal'));
  setText('modal-title', item.title);
  setText('modal-sub', `${getPriceNow(item)} · ${getStatusLabel(item)}`);
  // Rangées de plateformes NON cliquables (aucune URL de store n'existe
  // encore) : fini le faux bouton — état honnête + wishlist pour être prévenu.
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
          <button class="footer-lib" onclick="showPage('library')">${_lbt('navLabel')}</button>
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
  working:{fr:'Veuillez patienter…',en:'Please wait…',es:'Espera un momento…',de:'Bitte warten…',ar:'يرجى الانتظار…',zh:'请稍候…',ja:'お待ちください…',ru:'Подождите…',pl:'Proszę czekać…',it:'Attendere…'},
  logout:{fr:'Se déconnecter',en:'Log out',es:'Cerrar sesión',de:'Abmelden',ar:'تسجيل الخروج',zh:'退出登录',ja:'ログアウト',ru:'Выйти',pl:'Wyloguj się',it:'Esci'}, save:{fr:'Enregistrer',en:'Save',es:'Guardar',de:'Speichern',ar:'حفظ',zh:'保存',ja:'保存',ru:'Сохранить',pl:'Zapisz',it:'Salva'},
  saved:{fr:'Enregistré ✓',en:'Saved ✓',es:'Guardado ✓',de:'Gespeichert ✓',ar:'تم الحفظ ✓',zh:'已保存 ✓',ja:'保存しました ✓',ru:'Сохранено ✓',pl:'Zapisano ✓',it:'Salvato ✓'}, del:{fr:'Supprimer mon compte',en:'Delete my account',es:'Eliminar mi cuenta',de:'Mein Konto löschen',ar:'حذف حسابي',zh:'删除我的账号',ja:'アカウントを削除',ru:'Удалить аккаунт',pl:'Usuń moje konto',it:'Elimina il mio account'},
  delConfirm:{fr:'Supprimer définitivement ton compte ? Cette action est irréversible.',en:'Permanently delete your account? This cannot be undone.',es:'¿Eliminar tu cuenta de forma permanente? Esta acción no se puede deshacer.',de:'Konto endgültig löschen? Das kann nicht rückgängig gemacht werden.',ar:'حذف حسابك نهائيًا؟ لا يمكن التراجع عن هذا الإجراء.',zh:'永久删除你的账号？此操作无法撤销。',ja:'アカウントを完全に削除しますか？この操作は取り消せません。',ru:'Удалить аккаунт навсегда? Это действие необратимо.',pl:'Trwale usunąć konto? Tej operacji nie można cofnąć.',it:"Eliminare definitivamente il tuo account? L'azione è irreversibile."},
  memberSince:{fr:'Membre depuis',en:'Member since',es:'Miembro desde',de:'Mitglied seit',ar:'عضو منذ',zh:'注册于',ja:'登録日',ru:'В сообществе с',pl:'Członek od',it:'Membro dal'},
  haveAccount:{fr:'Déjà un compte ?',en:'Already have an account?',es:'¿Ya tienes una cuenta?',de:'Schon ein Konto?',ar:'لديك حساب بالفعل؟',zh:'已有账号？',ja:'すでにアカウントをお持ちですか？',ru:'Уже есть аккаунт?',pl:'Masz już konto?',it:'Hai già un account?'},
  noAccount:{fr:'Pas encore de compte ?',en:'No account yet?',es:'¿Aún no tienes cuenta?',de:'Noch kein Konto?',ar:'ليس لديك حساب بعد؟',zh:'还没有账号？',ja:'アカウントをお持ちでない方',ru:'Ещё нет аккаунта?',pl:'Nie masz jeszcze konta?',it:'Non hai ancora un account?'},
  checkEmail:{fr:'Compte créé ! Vérifie ta boîte mail pour confirmer ton adresse.',en:'Account created! Check your inbox to confirm your email.',es:'¡Cuenta creada! Revisa tu correo para confirmar tu dirección.',de:'Konto erstellt! Prüfe dein Postfach, um deine E-Mail zu bestätigen.',ar:'تم إنشاء الحساب! تحقق من بريدك لتأكيد عنوانك.',zh:'账号已创建！请查收邮件以确认你的邮箱。',ja:'アカウントを作成しました！メールを確認してアドレスを認証してください。',ru:'Аккаунт создан! Проверьте почту, чтобы подтвердить адрес.',pl:'Konto utworzone! Sprawdź skrzynkę, aby potwierdzić adres e-mail.',it:"Account creato! Controlla la tua casella per confermare l'indirizzo."},
  welcome:{fr:'Connecté ✓',en:'Signed in ✓',es:'Sesión iniciada ✓',de:'Angemeldet ✓',ar:'تم تسجيل الدخول ✓',zh:'已登录 ✓',ja:'サインインしました ✓',ru:'Вы вошли ✓',pl:'Zalogowano ✓',it:'Accesso effettuato ✓'},
  pwWeak:{fr:'Mot de passe trop faible (8+ caractères, mélange maj/min/chiffre/symbole).',en:'Password too weak (8+ chars, mix upper/lower/digit/symbol).',es:'Contraseña demasiado débil (8+ caracteres, mezcla mayús/minús/dígito/símbolo).',de:'Passwort zu schwach (8+ Zeichen, Mix aus Groß-/Kleinbuchstaben/Ziffer/Symbol).',ar:'كلمة المرور ضعيفة جدًا (8 أحرف على الأقل، مزيج من حروف كبيرة وصغيرة ورقم ورمز).',zh:'密码太弱（至少8位，需含大小写字母、数字和符号）。',ja:'パスワードが弱すぎます（8文字以上、大小英字・数字・記号の混在）。',ru:'Слишком слабый пароль (8+ символов, смесь заглавных/строчных/цифр/символов).',pl:'Hasło zbyt słabe (min. 8 znaków, duże/małe litery, cyfra, symbol).',it:'Password troppo debole (8+ caratteri, mix maiusc/minusc/cifra/simbolo).'},
  pwStrength:{fr:['Très faible','Faible','Correct','Bon','Excellent'],en:['Very weak','Weak','Fair','Good','Strong'],es:['Muy débil','Débil','Aceptable','Buena','Excelente'],de:['Sehr schwach','Schwach','Mittel','Gut','Stark'],ar:['ضعيفة جدًا','ضعيفة','مقبولة','جيدة','قوية'],zh:['非常弱','弱','一般','良好','很强'],ja:['非常に弱い','弱い','普通','良い','強い'],ru:['Очень слабый','Слабый','Средний','Хороший','Надёжный'],pl:['Bardzo słabe','Słabe','Średnie','Dobre','Mocne'],it:['Molto debole','Debole','Discreta','Buona','Forte']},
  uTaken:{fr:'Ce pseudo est déjà pris.',en:'This username is taken.',es:'Este nombre de usuario ya está en uso.',de:'Dieser Benutzername ist bereits vergeben.',ar:'اسم المستخدم هذا مأخوذ بالفعل.',zh:'该用户名已被使用。',ja:'このユーザー名は既に使われています。',ru:'Этот никнейм уже занят.',pl:'Ta nazwa użytkownika jest już zajęta.',it:'Questo nome utente è già in uso.'},
  uAvail:{fr:'Pseudo disponible ✓',en:'Username available ✓',es:'Nombre disponible ✓',de:'Benutzername verfügbar ✓',ar:'اسم المستخدم متاح ✓',zh:'用户名可用 ✓',ja:'このユーザー名は使えます ✓',ru:'Никнейм свободен ✓',pl:'Nazwa dostępna ✓',it:'Nome utente disponibile ✓'},
  uShort:{fr:'3 caractères minimum.',en:'At least 3 characters.',es:'Mínimo 3 caracteres.',de:'Mindestens 3 Zeichen.',ar:'3 أحرف على الأقل.',zh:'至少3个字符。',ja:'3文字以上。',ru:'Минимум 3 символа.',pl:'Co najmniej 3 znaki.',it:'Minimo 3 caratteri.'},
  uInvalid:{fr:'Lettres, chiffres, . _ - uniquement.',en:'Letters, numbers, . _ - only.',es:'Solo letras, números, . _ -',de:'Nur Buchstaben, Zahlen, . _ -',ar:'حروف وأرقام و . _ - فقط.',zh:'仅限字母、数字和 . _ -',ja:'英数字と . _ - のみ。',ru:'Только буквы, цифры, . _ -',pl:'Tylko litery, cyfry, . _ -',it:'Solo lettere, numeri, . _ -'},
  emailTaken:{fr:'Cet e-mail est déjà utilisé.',en:'This email is already in use.',es:'Este correo ya está en uso.',de:'Diese E-Mail wird bereits verwendet.',ar:'هذا البريد مستخدم بالفعل.',zh:'该邮箱已被使用。',ja:'このメールは既に使われています。',ru:'Эта почта уже используется.',pl:'Ten e-mail jest już używany.',it:'Questa e-mail è già in uso.'},
  emailInvalid:{fr:'E-mail invalide.',en:'Invalid email.',es:'Correo no válido.',de:'Ungültige E-Mail.',ar:'بريد إلكتروني غير صالح.',zh:'邮箱无效。',ja:'無効なメールアドレス。',ru:'Неверный e-mail.',pl:'Nieprawidłowy e-mail.',it:'E-mail non valida.'},
  badCreds:{fr:'E-mail ou mot de passe incorrect.',en:'Wrong email or password.',es:'Correo o contraseña incorrectos.',de:'E-Mail oder Passwort falsch.',ar:'البريد أو كلمة المرور غير صحيحة.',zh:'邮箱或密码错误。',ja:'メールまたはパスワードが正しくありません。',ru:'Неверная почта или пароль.',pl:'Błędny e-mail lub hasło.',it:'E-mail o password errati.'},
  notConfirmed:{fr:'E-mail pas encore confirmé — clique le lien reçu par mail.',en:'Email not confirmed yet — click the link sent to your inbox.',es:'Correo aún sin confirmar: haz clic en el enlace que te enviamos.',de:'E-Mail noch nicht bestätigt – klicke auf den zugesandten Link.',ar:'لم يتم تأكيد البريد بعد — انقر على الرابط المُرسل إلى بريدك.',zh:'邮箱尚未确认——请点击邮件中的链接。',ja:'メール未確認です——受信したリンクをクリックしてください。',ru:'Почта ещё не подтверждена — нажмите на ссылку из письма.',pl:'E-mail nie został jeszcze potwierdzony — kliknij link z wiadomości.',it:'E-mail non ancora confermata — clicca il link ricevuto.'},
  ageMin:{fr:'Tu dois avoir au moins 13 ans.',en:'You must be at least 13.',es:'Debes tener al menos 13 años.',de:'Du musst mindestens 13 Jahre alt sein.',ar:'يجب أن يكون عمرك 13 عامًا على الأقل.',zh:'你必须年满13岁。',ja:'13歳以上である必要があります。',ru:'Вам должно быть не менее 13 лет.',pl:'Musisz mieć co najmniej 13 lat.',it:'Devi avere almeno 13 anni.'},
  required:{fr:'Champ requis.',en:'Required field.',es:'Campo obligatorio.',de:'Pflichtfeld.',ar:'حقل مطلوب.',zh:'必填项。',ja:'必須項目です。',ru:'Обязательное поле.',pl:'Pole wymagane.',it:'Campo obbligatorio.'},
  genderReq:{fr:'Choisis une option.',en:'Please choose an option.',es:'Elige una opción.',de:'Bitte eine Option wählen.',ar:'يرجى اختيار خيار.',zh:'请选择一个选项。',ja:'選択してください。',ru:'Выберите вариант.',pl:'Wybierz opcję.',it:"Scegli un'opzione."},
  consentReq:{fr:'Tu dois accepter pour continuer.',en:'You must accept to continue.',es:'Debes aceptar para continuar.',de:'Du musst zustimmen, um fortzufahren.',ar:'يجب أن توافق للمتابعة.',zh:'你必须同意才能继续。',ja:'続行するには同意が必要です。',ru:'Чтобы продолжить, нужно согласие.',pl:'Musisz zaakceptować, aby kontynuować.',it:'Devi accettare per continuare.'},
  fail:{fr:"Échec — réessaie.",en:'Failed — please try again.',es:'Error: inténtalo de nuevo.',de:'Fehlgeschlagen – bitte erneut versuchen.',ar:'فشل — حاول مرة أخرى.',zh:'失败——请重试。',ja:'失敗しました——もう一度お試しください。',ru:'Не удалось — попробуйте снова.',pl:'Niepowodzenie — spróbuj ponownie.',it:'Operazione fallita — riprova.'},
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
  modOff:{fr:"Upload perso bientôt disponible (modération requise). Choisis un personnage pour l'instant.",en:'Custom upload coming soon (moderation required). Pick a character for now.',es:'La subida personalizada llegará pronto (requiere moderación). Elige un personaje por ahora.',de:'Eigener Upload kommt bald (Moderation erforderlich). Wähle vorerst einen Charakter.',ar:'رفع الصور المخصصة قريبًا (يتطلب إشرافًا). اختر شخصية الآن.',zh:'自定义上传即将推出（需审核）。请暂时选择一个角色。',ja:'カスタムアップロードは近日対応（要モデレーション）。今はキャラクターを選んでください。',ru:'Загрузка своих изображений скоро (нужна модерация). Пока выберите персонажа.',pl:'Własny upload wkrótce (wymaga moderacji). Na razie wybierz postać.',it:'Caricamento personalizzato in arrivo (richiede moderazione). Per ora scegli un personaggio.'},
  imgType:{fr:'Format non supporté (PNG, JPG, WEBP).',en:'Unsupported format (PNG, JPG, WEBP).',es:'Formato no admitido (PNG, JPG, WEBP).',de:'Format nicht unterstützt (PNG, JPG, WEBP).',ar:'صيغة غير مدعومة (PNG، JPG، WEBP).',zh:'不支持的格式（PNG、JPG、WEBP）。',ja:'対応していない形式です（PNG, JPG, WEBP）。',ru:'Формат не поддерживается (PNG, JPG, WEBP).',pl:'Nieobsługiwany format (PNG, JPG, WEBP).',it:'Formato non supportato (PNG, JPG, WEBP).'},
  imgSize:{fr:'Image trop lourde (max 2 Mo).',en:'Image too large (max 2 MB).',es:'Imagen demasiado grande (máx. 2 MB).',de:'Bild zu groß (max. 2 MB).',ar:'الصورة كبيرة جدًا (الحد الأقصى 2 ميغابايت).',zh:'图片过大（最大2 MB）。',ja:'画像が大きすぎます（最大2 MB）。',ru:'Изображение слишком большое (макс. 2 МБ).',pl:'Obraz zbyt duży (maks. 2 MB).',it:'Immagine troppo pesante (max 2 MB).'},
  imgRejected:{fr:'Image refusée par la modération.',en:'Image rejected by moderation.',es:'Imagen rechazada por moderación.',de:'Bild von der Moderation abgelehnt.',ar:'تم رفض الصورة من قبل الإشراف.',zh:'图片被审核拒绝。',ja:'画像がモデレーションにより拒否されました。',ru:'Изображение отклонено модерацией.',pl:'Obraz odrzucony przez moderację.',it:'Immagine rifiutata dalla moderazione.'},
  imgUploaded:{fr:'Avatar mis à jour ✓',en:'Avatar updated ✓',es:'Avatar actualizado ✓',de:'Avatar aktualisiert ✓',ar:'تم تحديث الصورة الرمزية ✓',zh:'头像已更新 ✓',ja:'アバターを更新しました ✓',ru:'Аватар обновлён ✓',pl:'Awatar zaktualizowany ✓',it:'Avatar aggiornato ✓'},
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
  // Contenu du menu — regénéré à chaque appel (les libellés suivent la langue)
  const itemsHTML = `
    <button class="acct-menu-item" data-act="profile" role="menuitem">${_at('profileItem')}</button>
    <button class="acct-menu-item" data-act="library" role="menuitem">${_lbt('navLabel')}</button>
    <button class="acct-menu-item" data-act="options" role="menuitem">${_at('optionsItem')}</button>
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
/* ── 2FA TOTP (Steam Guard maison) — i18n ── */
const _MFA_T = {
  title:    { fr:'Authentification à deux facteurs', en:'Two-factor authentication', es:'Autenticación en dos pasos', de:'Zwei-Faktor-Authentifizierung', it:'Autenticazione a due fattori', ar:'المصادقة الثنائية', zh:'两步验证', ja:'二段階認証', ru:'Двухфакторная аутентификация', pl:'Uwierzytelnianie dwuskładnikowe' },
  desc:     { fr:'Protège ton compte comme Steam Guard : un code à 6 chiffres depuis ton application d’authentification (Google Authenticator, Authy…) sera demandé à chaque connexion.', en:'Protect your account Steam Guard-style: a 6-digit code from your authenticator app (Google Authenticator, Authy…) will be required at every sign-in.', es:'Protege tu cuenta al estilo Steam Guard: se pedirá un código de 6 dígitos de tu app de autenticación en cada inicio de sesión.', de:'Schütze dein Konto im Steam-Guard-Stil: Bei jeder Anmeldung wird ein 6-stelliger Code aus deiner Authenticator-App verlangt.', it:'Proteggi il tuo account in stile Steam Guard: a ogni accesso verrà richiesto un codice a 6 cifre dalla tua app di autenticazione.', ar:'احمِ حسابك على طريقة Steam Guard: سيُطلب رمز من 6 أرقام من تطبيق المصادقة عند كل تسجيل دخول.', zh:'像 Steam 令牌一样保护你的账户：每次登录都需要输入身份验证器应用中的6位验证码。', ja:'Steam Guardのようにアカウントを保護：ログインごとに認証アプリの6桁コードが必要になります。', ru:'Защитите аккаунт в стиле Steam Guard: при каждом входе потребуется 6-значный код из приложения-аутентификатора.', pl:'Chroń konto w stylu Steam Guard: przy każdym logowaniu wymagany będzie 6-cyfrowy kod z aplikacji uwierzytelniającej.' },
  enable:   { fr:'Activer le 2FA', en:'Enable 2FA', es:'Activar 2FA', de:'2FA aktivieren', it:'Attiva 2FA', ar:'تفعيل المصادقة الثنائية', zh:'启用两步验证', ja:'二段階認証を有効化', ru:'Включить 2FA', pl:'Włącz 2FA' },
  disable:  { fr:'Désactiver', en:'Disable', es:'Desactivar', de:'Deaktivieren', it:'Disattiva', ar:'تعطيل', zh:'停用', ja:'無効化', ru:'Отключить', pl:'Wyłącz' },
  active:   { fr:'2FA actif — ton compte est protégé', en:'2FA active — your account is protected', es:'2FA activo — tu cuenta está protegida', de:'2FA aktiv — dein Konto ist geschützt', it:'2FA attivo — il tuo account è protetto', ar:'المصادقة الثنائية مفعّلة — حسابك محمي', zh:'两步验证已启用——你的账户受到保护', ja:'二段階認証が有効 — アカウントは保護されています', ru:'2FA включена — ваш аккаунт защищён', pl:'2FA aktywne — twoje konto jest chronione' },
  scan:     { fr:'1. Scanne ce QR code avec ton application d’authentification', en:'1. Scan this QR code with your authenticator app', es:'1. Escanea este código QR con tu app de autenticación', de:'1. Scanne diesen QR-Code mit deiner Authenticator-App', it:'1. Scansiona questo codice QR con la tua app di autenticazione', ar:'1. امسح رمز QR بتطبيق المصادقة', zh:'1. 用身份验证器应用扫描此二维码', ja:'1. 認証アプリでこのQRコードをスキャン', ru:'1. Отсканируйте этот QR-код приложением-аутентификатором', pl:'1. Zeskanuj ten kod QR aplikacją uwierzytelniającą' },
  manual:   { fr:'Ou saisis cette clé manuellement :', en:'Or enter this key manually:', es:'O introduce esta clave manualmente:', de:'Oder gib diesen Schlüssel manuell ein:', it:'Oppure inserisci questa chiave manualmente:', ar:'أو أدخل هذا المفتاح يدوياً:', zh:'或手动输入此密钥：', ja:'または、このキーを手動で入力：', ru:'Или введите этот ключ вручную:', pl:'Lub wpisz ten klucz ręcznie:' },
  confirm:  { fr:'2. Saisis le code à 6 chiffres généré', en:'2. Enter the generated 6-digit code', es:'2. Introduce el código de 6 dígitos generado', de:'2. Gib den generierten 6-stelligen Code ein', it:'2. Inserisci il codice a 6 cifre generato', ar:'2. أدخل الرمز المكوَّن من 6 أرقام', zh:'2. 输入生成的6位验证码', ja:'2. 生成された6桁コードを入力', ru:'2. Введите сгенерированный 6-значный код', pl:'2. Wpisz wygenerowany 6-cyfrowy kod' },
  verify:   { fr:'Vérifier', en:'Verify', es:'Verificar', de:'Bestätigen', it:'Verifica', ar:'تحقّق', zh:'验证', ja:'確認', ru:'Подтвердить', pl:'Zweryfikuj' },
  cancel:   { fr:'Annuler', en:'Cancel', es:'Cancelar', de:'Abbrechen', it:'Annulla', ar:'إلغاء', zh:'取消', ja:'キャンセル', ru:'Отмена', pl:'Anuluj' },
  badCode:  { fr:'Code invalide — réessaie.', en:'Invalid code — try again.', es:'Código no válido — inténtalo de nuevo.', de:'Ungültiger Code — versuch es erneut.', it:'Codice non valido — riprova.', ar:'رمز غير صالح — حاول مجدداً.', zh:'验证码无效——请重试。', ja:'コードが無効です — もう一度お試しください。', ru:'Неверный код — попробуйте ещё раз.', pl:'Nieprawidłowy kod — spróbuj ponownie.' },
  stepTitle:{ fr:'Vérification en deux étapes', en:'Two-step verification', es:'Verificación en dos pasos', de:'Bestätigung in zwei Schritten', it:'Verifica in due passaggi', ar:'التحقق بخطوتين', zh:'两步验证', ja:'2段階認証', ru:'Двухэтапная проверка', pl:'Weryfikacja dwuetapowa' },
  stepSub:  { fr:'Saisis le code à 6 chiffres de ton application d’authentification.', en:'Enter the 6-digit code from your authenticator app.', es:'Introduce el código de 6 dígitos de tu app de autenticación.', de:'Gib den 6-stelligen Code aus deiner Authenticator-App ein.', it:'Inserisci il codice a 6 cifre della tua app di autenticazione.', ar:'أدخل الرمز المكوَّن من 6 أرقام من تطبيق المصادقة.', zh:'请输入身份验证器应用中的6位验证码。', ja:'認証アプリの6桁コードを入力してください。', ru:'Введите 6-значный код из приложения-аутентификатора.', pl:'Wpisz 6-cyfrowy kod z aplikacji uwierzytelniającej.' },
  disableConfirm: { fr:'Désactiver la double authentification ? Ton compte sera moins protégé.', en:'Disable two-factor authentication? Your account will be less protected.', es:'¿Desactivar la autenticación en dos pasos? Tu cuenta estará menos protegida.', de:'Zwei-Faktor-Authentifizierung deaktivieren? Dein Konto ist dann weniger geschützt.', it:'Disattivare l’autenticazione a due fattori? Il tuo account sarà meno protetto.', ar:'تعطيل المصادقة الثنائية؟ سيصبح حسابك أقل حماية.', zh:'停用两步验证？你的账户保护将降低。', ja:'二段階認証を無効にしますか？アカウントの保護が弱くなります。', ru:'Отключить двухфакторную аутентификацию? Ваш аккаунт будет защищён хуже.', pl:'Wyłączyć uwierzytelnianie dwuskładnikowe? Twoje konto będzie słabiej chronione.' },
  err:      { fr:'Opération impossible pour le moment.', en:'Operation unavailable right now.', es:'Operación no disponible ahora mismo.', de:'Vorgang derzeit nicht möglich.', it:'Operazione non disponibile al momento.', ar:'العملية غير متاحة حالياً.', zh:'操作暂时不可用。', ja:'現在この操作はできません。', ru:'Операция сейчас недоступна.', pl:'Operacja chwilowo niedostępna.' },
};
const _mt = k => (_MFA_T[k] && (_MFA_T[k][LANG] || _MFA_T[k].en)) || '';

const _OPT_T = {
  settings:{fr:'Paramètres',en:'Settings',es:'Ajustes',de:'Einstellungen',it:'Impostazioni',ar:'الإعدادات',zh:'设置',ja:'設定',ru:'Настройки',pl:'Ustawienia'},
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
  settingsSub:{fr:'Gère ton compte, ton apparence, ta confidentialité et les mises à jour.',en:'Manage your account, appearance, privacy and updates.',es:'Gestiona tu cuenta, apariencia, privacidad y actualizaciones.',de:'Verwalte Konto, Aussehen, Datenschutz und Updates.',it:'Gestisci account, aspetto, privacy e aggiornamenti.',ar:'أدر حسابك ومظهرك وخصوصيتك والتحديثات.',zh:'管理账户、外观、隐私与更新。',ja:'アカウント・外観・プライバシー・更新を管理。',ru:'Управление аккаунтом, оформлением, приватностью и обновлениями.',pl:'Zarządzaj kontem, wyglądem, prywatnością i aktualizacjami.'},
  tabUpdates:{fr:'Mises à jour',en:'Updates',es:'Actualizaciones',de:'Updates',it:'Aggiornamenti',ar:'التحديثات',zh:'更新',ja:'更新',ru:'Обновления',pl:'Aktualizacje'},
  appVersion:{fr:'Version installée',en:'Installed version',es:'Versión instalada',de:'Installierte Version',it:'Versione installata',ar:'الإصدار المثبت',zh:'已安装版本',ja:'インストール済みバージョン',ru:'Установленная версия',pl:'Zainstalowana wersja'},
  upToDate:{fr:'Tu utilises la dernière version. ✓',en:'You’re on the latest version. ✓',es:'Estás en la última versión. ✓',de:'Du nutzt die neueste Version. ✓',it:'Hai l’ultima versione. ✓',ar:'أنت تستخدم أحدث إصدار. ✓',zh:'已是最新版本。✓',ja:'最新バージョンです。✓',ru:'У вас последняя версия. ✓',pl:'Masz najnowszą wersję. ✓'},
  checkUpdates:{fr:'Vérifier les mises à jour',en:'Check for updates',es:'Buscar actualizaciones',de:'Nach Updates suchen',it:'Cerca aggiornamenti',ar:'التحقق من التحديثات',zh:'检查更新',ja:'更新を確認',ru:'Проверить обновления',pl:'Sprawdź aktualizacje'},
  checking:{fr:'Vérification…',en:'Checking…',es:'Comprobando…',de:'Wird geprüft…',it:'Controllo…',ar:'جارٍ التحقق…',zh:'检查中…',ja:'確認中…',ru:'Проверка…',pl:'Sprawdzanie…'},
  launcherNote:{fr:'Dans l’application téléchargeable (launcher), les mises à jour s’installeront automatiquement depuis cette page.',en:'In the downloadable app (launcher), updates will install automatically from this page.',es:'En la app descargable (launcher), las actualizaciones se instalarán desde esta página.',de:'In der herunterladbaren App (Launcher) werden Updates über diese Seite installiert.',it:'Nell’app scaricabile (launcher), gli aggiornamenti si installeranno da questa pagina.',ar:'في التطبيق القابل للتنزيل، ستُثبَّت التحديثات من هذه الصفحة.',zh:'在可下载的客户端中，更新将从此页面自动安装。',ja:'ダウンロード版（ランチャー）では、更新はこのページから自動インストールされます。',ru:'В загружаемом приложении (лаунчере) обновления будут устанавливаться с этой страницы.',pl:'W aplikacji do pobrania (launcher) aktualizacje będą instalowane z tej strony.'},
  releaseNotes:{fr:'Notes de version',en:'Release notes',es:'Notas de versión',de:'Versionshinweise',it:'Note di rilascio',ar:'ملاحظات الإصدار',zh:'更新日志',ja:'リリースノート',ru:'Список изменений',pl:'Lista zmian'},
};
function _ot(k){ const m=_OPT_T[k]; return m ? (m[LANG]||m.en) : k; }
const GLG_VERSION = '1.0.0';

let _userPrefs = null;
function _defaultPrefs(){ return { accent:null, reducedMotion:false, sfx:false, notif:{friendReq:true,friendAcc:true,release:true}, privacy:{showTrophies:true,showWishlist:true,showOnline:true,showRecent:true} }; }
function _normPrefs(p){ const d=_defaultPrefs(); p=(p&&typeof p==='object')?p:{}; return {
  accent:(typeof p.accent==='string' && /^#[0-9a-fA-F]{3,8}$/.test(p.accent))?p.accent:null,
  reducedMotion:!!p.reducedMotion,
  sfx:!!p.sfx,
  notif:Object.assign({},d.notif,p.notif||{}),
  privacy:Object.assign({},d.privacy,p.privacy||{}) }; }
function _applyPrefs(p){
  _userPrefs = _normPrefs(p);
  document.documentElement.classList.toggle('glg-reduce-motion', _userPrefs.reducedMotion);
  if (_userPrefs.accent) document.documentElement.style.setProperty('--user-accent', _userPrefs.accent);
  else document.documentElement.style.removeProperty('--user-accent');
  window.GLG_SFX?.setEnabled(_userPrefs.sfx); // sons d'interface (opt-in)
  return _userPrefs;
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

/* « Quoi de neuf » — journal des versions (GLG_CHANGELOG, data.js).
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

/* Onglets des paramètres (partagés modale + page dédiée) — iconés (launcher). */
const _SET_TAB_ICONS = {
  profile: '<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5.4" r="2.6" stroke="currentColor" stroke-width="1.3"/><path d="M3 13.4c.9-2.2 2.7-3.4 5-3.4s4.1 1.2 5 3.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  perso:   '<svg viewBox="0 0 16 16" fill="none"><path d="M3 5h7M12.5 5H13M3 11h.5M6 11h7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="11" cy="5" r="1.7" stroke="currentColor" stroke-width="1.3"/><circle cx="4.6" cy="11" r="1.7" stroke="currentColor" stroke-width="1.3"/></svg>',
  notif:   '<svg viewBox="0 0 16 16" fill="none"><path d="M8 2.2c-2.3 0-3.7 1.7-3.7 3.9 0 3.1-1.1 4-1.1 4h9.6s-1.1-.9-1.1-4c0-2.2-1.4-3.9-3.7-3.9z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.7 12.6a1.4 1.4 0 002.6 0" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  privacy: '<svg viewBox="0 0 16 16" fill="none"><path d="M8 1.8L3 3.6v3.6c0 3.2 2.1 5.4 5 6.6 2.9-1.2 5-3.4 5-6.6V3.6L8 1.8z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M5.8 7.8l1.6 1.6 2.8-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  account: '<svg viewBox="0 0 16 16" fill="none"><circle cx="6" cy="8" r="2.6" stroke="currentColor" stroke-width="1.3"/><path d="M8.6 8H14M12 8v2.4M14 8v1.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  updates: '<svg viewBox="0 0 16 16" fill="none"><path d="M13.4 6.5A5.5 5.5 0 003.6 5M2.6 9.5A5.5 5.5 0 0012.4 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M13.6 2.6v3h-3M2.4 13.4v-3h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
function _settingsTabs(){
  const tab = (key, label, active) => `
        <button class="set-tab ${active ? 'active' : ''}" data-tab="${key}">
          <span class="set-tab-ico" aria-hidden="true">${_SET_TAB_ICONS[key] || ''}</span>
          <span>${label}</span>
        </button>`;
  return tab('profile', _ot('tabProfile'), true)
       + tab('perso',   _ot('tabPerso'))
       + tab('notif',   _ot('tabNotif'))
       + tab('privacy', _ot('tabPrivacy'))
       + tab('account', _ot('tabAccount'))
       + tab('updates', _ot('tabUpdates'));
}
/* Panneaux des paramètres (partagés modale + page dédiée). */
function _settingsPanels(p, u, pr){
  const uname = p.username || u.email?.split('@')[0] || '';
  return `
        <div class="set-panel active" data-panel="profile">
          <form id="auth-profile" novalidate>
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
        <div class="set-panel" data-panel="notif" hidden>
          <div class="set-toggle-list">
            ${_toggleHTML('ap-n-freq', _ot('notifFriendReq'), '', pr.notif.friendReq)}
            ${_toggleHTML('ap-n-facc', _ot('notifFriendAcc'), '', pr.notif.friendAcc)}
            ${_toggleHTML('ap-n-rel',  _ot('notifRelease'),  '', pr.notif.release)}
          </div>
        </div>
        <div class="set-panel" data-panel="privacy" hidden>
          <div class="set-toggle-list">
            ${_toggleHTML('ap-p-tro',  _ot('privShowTrophies'), '', pr.privacy.showTrophies)}
            ${_toggleHTML('ap-p-wish', _ot('privShowWishlist'), '', pr.privacy.showWishlist)}
            ${_toggleHTML('ap-p-onl',  _ot('privShowOnline'),   '', pr.privacy.showOnline)}
            ${_toggleHTML('ap-p-rec',  _ot('privShowRecent'),   _ot('privShowRecentD'), pr.privacy.showRecent)}
          </div>
        </div>
        <div class="set-panel" data-panel="account" hidden>
          <label class="auth-field"><span>${_at('email')}</span><input type="email" value="${u.email||''}" disabled></label>
          <div class="set-group-label">${_ot('changePw')}</div>
          <label class="auth-field"><span>${_ot('newPw')}</span><input type="password" id="ap-pw1" autocomplete="new-password"></label>
          <label class="auth-field"><span>${_ot('confirmPw')}</span><input type="password" id="ap-pw2" autocomplete="new-password"></label>
          <p class="auth-err" id="ap-pw-err" hidden></p>
          <button type="button" class="btn btn-outline set-w" id="ap-pw-save">${_ot('updatePw')}</button>
          <div class="set-group-label">${_mt('title')}</div>
          <div class="set-mfa" id="ap-mfa"><p class="set-update-status">…</p></div>
          <div class="set-group-label">${_ot('language')}</div>
          <button type="button" class="set-link-btn" id="ap-lang-btn">🌐 ${_ot('changeLang')}</button>
          <div class="auth-profile-actions">
            <button type="button" class="auth-link" id="ap-logout">${_at('logout')}</button>
            <button type="button" class="auth-link auth-link--danger" id="ap-delete">${_at('del')}</button>
          </div>
        </div>
        <div class="set-panel" data-panel="updates" hidden>
          <div class="set-update-row">
            <div><div class="set-group-label" style="margin:0 0 5px">${_ot('appVersion')}</div><div class="set-version">GEEKLEARN GAMES — v${GLG_VERSION}</div></div>
            <button type="button" class="btn btn-outline" id="ap-update-check">${_ot('checkUpdates')}</button>
          </div>
          <p class="set-update-status" id="ap-update-status">${_ot('upToDate')}</p>
          <p class="set-update-note">${_ot('launcherNote')}</p>
          <div class="set-group-label" style="margin-top:26px">${_ot('whatsNew')}</div>
          <div class="set-changelog">${_changelogHTML()}</div>
        </div>`;
}

/* Page dédiée PARAMÈTRES (#page-settings). Remplace l'ancienne pop-up : plus
   d'espace, plus de confort, et c'est ICI que le launcher standalone gérera
   ses mises à jour (onglet "Mises à jour"). */
async function buildSettingsPage(){
  const host = $('page-settings'); if(!host) return;
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
  const pr = _applyPrefs(p.prefs);
  const name = p.username || user.email?.split('@')[0] || '—';
  const since = p.created_at ? new Date(p.created_at).toLocaleDateString(LANG_LOCALE[LANG]||'en-US',{year:'numeric',month:'long'}) : '';
  host.innerHTML = `
    <section class="settings-page">
      <div class="settings-page-head settings-page-head--v2">
        <div class="settings-head-bg" aria-hidden="true" ${p.banner_url && safeMediaUrl(p.banner_url) ? `style="background-image:url('${safeMediaUrl(p.banner_url)}')"` : ''}></div>
        <button type="button" class="auth-avatar auth-avatar--btn settings-head-ava" id="ap-avatar" aria-label="${_at('avatarChange')}" title="${_at('avatarChange')}">
          ${_avatarDiscHTML(p, user)}
          <span class="auth-avatar-edit" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M11 2l3 3-8 8H3v-3l8-8z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg></span>
        </button>
        <div class="settings-head-id">
          <span class="settings-eyebrow">${_ot('settingsTitle')}</span>
          <h1 class="settings-page-title">${escHtml(name)}${_verifiedTag(name,'glg-verified--lg')}</h1>
          <p class="settings-page-sub">${user.email||''}${since?` · ${_at('memberSince')} ${since}`:''}</p>
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

/* Câblage des paramètres — scopé à `root` (modale OU page #page-settings). */
function _wireSettings(root) {
  root = root || $('glg-auth-modal'); if (!root) return;
  const q = sel => root.querySelector(sel);
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
  // Sons d'interface (opt-in) — petit "confirm" immédiat comme feedback
  $('ap-sfx')?.addEventListener('change', async e => {
    await _savePrefs({ sfx: e.target.checked });
    if (e.target.checked) window.GLG_SFX?.play('confirm');
  });
  // Notifications
  const notifSave = () => _savePrefs({ notif:{ friendReq:$('ap-n-freq').checked, friendAcc:$('ap-n-facc').checked, release:$('ap-n-rel').checked } });
  ['ap-n-freq','ap-n-facc','ap-n-rel'].forEach(id => $(id)?.addEventListener('change', notifSave));
  // Confidentialité (impacte l'affichage du profil)
  const privSave = async () => {
    await _savePrefs({ privacy:{ showTrophies:$('ap-p-tro').checked, showWishlist:$('ap-p-wish').checked, showOnline:$('ap-p-onl').checked, showRecent:$('ap-p-rec')?.checked !== false } });
    GLG_PRESENCE.setVisible($('ap-p-onl').checked);   // bascule visible/invisible immédiate
    if (document.getElementById('page-profile')?.classList.contains('active')) buildProfilePage();
  };
  ['ap-p-tro','ap-p-wish','ap-p-onl','ap-p-rec'].forEach(id => $(id)?.addEventListener('change', privSave));
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
  // Vérification de mise à jour — RÉELLE quand le service worker est actif
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
  // 2FA TOTP (Steam Guard maison) — état + enrôlement + désactivation
  _initMfaBlock(root);
  // Déconnexion / suppression — referme la modale (si présente) ET quitte la page
  $('ap-logout')?.addEventListener('click', async () => { await GLG_AUTH.signOut(); closeAuthModal(); refreshAccountUI(); showPage('home'); });
  $('ap-delete')?.addEventListener('click', async () => {
    if (!confirm(_at('delConfirm'))) return;
    const r = await GLG_AUTH.deleteAccount();
    if (r.ok) { closeAuthModal(); refreshAccountUI(); showPage('home'); }
    else _showErr('ap-err', _at('fail'));
  });
}

/* ── 2FA TOTP (Options → Compte) — états OFF / enrôlement / ON ──────────
   Le QR (SVG) et le secret viennent de l'API MFA Supabase (mfaEnroll).
   Annuler l'enrôlement dé-enrôle le facteur (pas de facteur fantôme). */
async function _initMfaBlock(root) {
  const box = (root || document).querySelector('#ap-mfa'); if (!box) return;
  if (!window.GLG_AUTH?.mfaFactors) { box.innerHTML = `<p class="set-update-status">${_mt('err')}</p>`; return; }
  const { ok, factors } = await GLG_AUTH.mfaFactors();
  if (!ok) { box.innerHTML = `<p class="set-update-status">${_mt('err')}</p>`; return; }
  factors.length ? _renderMfaOn(box, factors[0]) : _renderMfaOff(box);
}
/* Élément d'erreur UNIQUE du bloc 2FA (réutilisé — plus d'empilement). */
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
  // r.qr = SVG généré par Supabase (API MFA officielle) — source de confiance
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

/* After a picker action: go back to the edit modal, or — if launched from
   the member-space page — just close the overlay and refresh the page. */
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
  friendReqB:{fr:'%s souhaite vous ajouter.',en:'%s wants to add you.',es:'%s quiere añadirte.',de:'%s möchte dich hinzufügen.',ar:'يريد %s إضافتك.',zh:'%s 想添加你为好友。',ja:'%s さんがあなたを追加したがっています。',ru:'%s хочет добавить вас.',pl:'%s chce Cię dodać.',it:'%s vuole aggiungerti.'},
  friendOk:{fr:'Demande d’ami acceptée',en:'Friend request accepted',es:'Solicitud de amistad aceptada',de:'Freundschaftsanfrage angenommen',ar:'تم قبول طلب الصداقة',zh:'好友请求已接受',ja:'フレンド申請が承認されました',ru:'Запрос в друзья принят',pl:'Zaproszenie przyjęte',it:'Richiesta di amicizia accettata'},
  friendOkB:{fr:'%s et vous êtes maintenant amis.',en:'%s and you are now friends.',es:'%s y tú ahora sois amigos.',de:'%s und du seid jetzt Freunde.',ar:'أنت و%s أصبحتما صديقين الآن.',zh:'你和 %s 现在是好友了。',ja:'%s さんとフレンドになりました。',ru:'Теперь вы и %s друзья.',pl:'Ty i %s jesteście teraz znajomymi.',it:'Tu e %s ora siete amici.'},
  release:{fr:'Disponible !',en:'Out now!',es:'¡Ya disponible!',de:'Jetzt verfügbar!',ar:'متاح الآن!',zh:'现已推出！',ja:'配信開始！',ru:'Уже доступно!',pl:'Już dostępne!',it:'Ora disponibile!'},
  releaseB:{fr:'%s de votre liste de souhaits est sorti.',en:'%s from your wishlist is out.',es:'%s de tu lista de deseos ya está disponible.',de:'%s aus deiner Wunschliste ist erschienen.',ar:'صدر %s من قائمة رغباتك.',zh:'心愿单中的 %s 已发布。',ja:'ウィッシュリストの %s が配信されました。',ru:'%s из вашего списка желаемого вышел.',pl:'%s z Twojej listy życzeń jest już dostępny.',it:'%s dalla tua lista dei desideri è uscito.'},
  welcome:{fr:'Bienvenue sur GEEKLEARN GAMES',en:'Welcome to GEEKLEARN GAMES',es:'Bienvenido a GEEKLEARN GAMES',de:'Willkommen bei GEEKLEARN GAMES',ar:'مرحبًا بك في GEEKLEARN GAMES',zh:'欢迎来到 GEEKLEARN GAMES',ja:'GEEKLEARN GAMES へようこそ',ru:'Добро пожаловать в GEEKLEARN GAMES',pl:'Witaj w GEEKLEARN GAMES',it:'Benvenuto su GEEKLEARN GAMES'},
  welcomeB:{fr:'Votre espace membre est prêt. Liez vos comptes et ajoutez des amis.',en:'Your member space is ready. Link your accounts and add friends.',es:'Tu espacio de miembro está listo. Vincula tus cuentas y añade amigos.',de:'Dein Mitgliedsbereich ist bereit. Verknüpfe deine Konten und füge Freunde hinzu.',ar:'مساحة العضوية الخاصة بك جاهزة. اربط حساباتك وأضِف أصدقاء.',zh:'你的会员空间已就绪。关联账号并添加好友吧。',ja:'メンバースペースの準備ができました。アカウントを連携してフレンドを追加しましょう。',ru:'Ваш профиль готов. Привяжите аккаунты и добавьте друзей.',pl:'Twoja przestrzeń członkowska jest gotowa. Połącz konta i dodaj znajomych.',it:'Il tuo spazio membro è pronto. Collega i tuoi account e aggiungi amici.'},
  now:{fr:'à l’instant',en:'just now',es:'ahora mismo',de:'gerade eben',ar:'الآن',zh:'刚刚',ja:'たった今',ru:'только что',pl:'przed chwilą',it:'proprio ora'},
};
function _nt(k){ const m=_NOTIF_T[k]; return m ? (m[LANG]||m.en) : k; }

const GLG_NOTIF = (function(){
  let _uid = 'anon';
  let _list = [];
  let _seenFriends = null;   // baseline set (ids déjà amis) — null = pas encore initialisé
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
    _save(); _emit(); return true;
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
   PRÉSENCE EN LIGNE (Supabase Realtime presence) + notifs d'amis LIVE
   ──────────────────────────────────────────
   Un seul canal presence partagé ('glg:online', key = uid). On ne
   s'annonce que si prefs.privacy.showOnline le permet (mode invisible
   sinon — on VOIT les autres sans être vu, comme Steam). Les nouvelles
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

/* ── Lien d'invitation (?add=<uid>) — zéro backend, zéro spam ──────────
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

  /* ── Bibliothèque : le header ne la montre qu'aux joueurs CONNECTÉS ──
     Déconnecté = site vitrine épuré ; connecté = le site devient launcher
     (l'entrée apparaît aussi dans le menu déroulant de l'avatar et les
     footers, via la classe globale body.glg-authed). */
  ['nl-library', 'nml-library'].forEach(id => $(id)?.classList.toggle('is-auth', !!user));
  document.body.classList.toggle('glg-authed', !!user);

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
  signedOutP:{fr:'Connecte-toi pour accéder à ton profil, ta liste de souhaits et tes préférences — synchronisés sur tous tes appareils.',en:'Sign in to access your profile, wishlist and preferences — synced across all your devices.',es:'Inicia sesión para acceder a tu perfil, tu lista de deseos y tus preferencias, sincronizados en todos tus dispositivos.',de:'Melde dich an, um auf dein Profil, deine Wunschliste und deine Einstellungen zuzugreifen – auf allen Geräten synchronisiert.',ar:'سجّل الدخول للوصول إلى ملفك الشخصي وقائمة رغباتك وتفضيلاتك — متزامنة عبر جميع أجهزتك.',zh:'登录以访问你的个人资料、心愿单和偏好设置——在所有设备间同步。',ja:'サインインしてプロフィール、ウィッシュリスト、設定にアクセス——すべてのデバイスで同期されます。',ru:'Войдите, чтобы открыть профиль, список желаемого и настройки — синхронизированные на всех устройствах.',pl:'Zaloguj się, aby uzyskać dostęp do profilu, listy życzeń i ustawień — zsynchronizowanych na wszystkich urządzeniach.',it:'Accedi per gestire il tuo profilo, la lista dei desideri e le preferenze — sincronizzati su tutti i dispositivi.'},
  signIn:{fr:'Se connecter',en:'Sign in',es:'Iniciar sesión',de:'Anmelden',ar:'تسجيل الدخول',zh:'登录',ja:'サインイン',ru:'Войти',pl:'Zaloguj się',it:'Accedi'},
  createAcc:{fr:'Créer un compte',en:'Create account',es:'Crear cuenta',de:'Konto erstellen',ar:'إنشاء حساب',zh:'创建账号',ja:'アカウント作成',ru:'Создать аккаунт',pl:'Utwórz konto',it:'Crea un account'},
  edit:{fr:'Modifier le profil',en:'Edit profile',es:'Editar perfil',de:'Profil bearbeiten',ar:'تعديل الملف الشخصي',zh:'编辑资料',ja:'プロフィール編集',ru:'Редактировать профиль',pl:'Edytuj profil',it:'Modifica profilo'},
  editBanner:{fr:'Bannière',en:'Banner',es:'Portada',de:'Banner',ar:'الغلاف',zh:'横幅',ja:'バナー',ru:'Баннер',pl:'Baner',it:'Banner'},
  statWish:{fr:'Souhaits',en:'Wishlist',es:'Deseos',de:'Wunschliste',ar:'الرغبات',zh:'心愿单',ja:'ウィッシュリスト',ru:'Желаемое',pl:'Życzenia',it:'Desideri'},
  statMember:{fr:'Membre depuis',en:'Member since',es:'Miembro desde',de:'Mitglied seit',ar:'عضو منذ',zh:'注册于',ja:'登録日',ru:'В сообществе с',pl:'Członek od',it:'Membro dal'},
  statLib:{fr:'Bibliothèque',en:'Library',es:'Biblioteca',de:'Bibliothek',ar:'المكتبة',zh:'库',ja:'ライブラリ',ru:'Библиотека',pl:'Biblioteka',it:'Libreria'},
  soon:{fr:'Bientôt',en:'Soon',es:'Pronto',de:'Bald',ar:'قريبًا',zh:'即将推出',ja:'近日',ru:'Скоро',pl:'Wkrótce',it:'Presto'},
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
  const pr = _applyPrefs(p.prefs);   // confidentialité + accent + réduction d'animations
  const name  = p.username || user.email?.split('@')[0] || '—';
  const since = p.created_at ? new Date(p.created_at).toLocaleDateString(LANG_LOCALE[LANG]||'en-US',{year:'numeric',month:'long'}) : '—';
  const gLabel = p.gender==='male' ? _at('male') : p.gender==='female' ? _at('female') : (p.gender_other || _at('other'));
  const banner = safeMediaUrl(p.banner_url);

  host.innerHTML = `
    <section class="pp">
      <div class="pp-banner ${banner?'has-img':''}" ${banner?`style="background-image:url(${banner})"`:''}>
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
          <h1 class="pp-name">${escHtml(name)}${_verifiedTag(name,'glg-verified--lg')}</h1>
          ${pr.privacy.showTrophies ? `<span class="pp-level-chip" id="pp-level-chip"></span>` : ''}
          <div class="pp-badges">
            <span class="pp-badge">${escHtml(gLabel)}</span>
            ${p.age?`<span class="pp-badge">${p.age} ${_ppt('years')}</span>`:''}
            <span class="pp-badge pp-badge--muted">${_ppt('statMember')} ${since}</span>
          </div>
          ${p.bio ? `<p class="pp-bio">${escHtml(p.bio)}</p>` : `<button class="pp-bio-add" onclick="showPage('settings')">${_ppt('addBio')}</button>`}
        </div>
        <div class="pp-actions">
          <button class="btn btn-outline pp-edit-btn" onclick="showPage('settings')">${_ppt('edit')}</button>
        </div>
      </div>

      <div class="pp-stats">
        <div class="pp-stat"><b id="pp-stat-wish">${wishCount()}</b><span>${_ppt('statWish')}</span></div>
        <div class="pp-stat"><b id="pp-stat-trophies">0</b><span>${_tt('section')}</span></div>
        <div class="pp-stat"><b id="pp-stat-friends">0</b><span>${_ft('statFriends')}</span></div>
        <div class="pp-stat"><b id="pp-stat-reviews">0</b><span>${_rvt('section')}</span></div>
      </div>

      <!-- Disposition launcher : colonne principale (contenu vivant) + rail (infos froides) -->
      <div class="pp-cols">
        <div class="pp-main">
          <div class="pp-section pp-recent-section">
            <div class="pp-sec-head"><h2 class="pp-sec-title" data-idx="01 /">${_rgt('title')}</h2></div>
            ${_recentGamesHTML(p.recent_games, { owner: true })}
          </div>

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
  emptyOwn:{ fr:'Aucune session pour le moment — tes jeux lancés apparaîtront ici, comme sur Steam.', en:'No sessions yet — the games you launch will appear here, Steam-style.', es:'Aún no hay sesiones — los juegos que inicies aparecerán aquí.', de:'Noch keine Sessions — gestartete Spiele erscheinen hier.', it:'Nessuna sessione per ora — i giochi avviati appariranno qui.', ar:'لا جلسات بعد — ستظهر الألعاب التي تشغّلها هنا.', zh:'暂无游戏记录——你启动的游戏将显示在这里。', ja:'まだセッションがありません — 起動したゲームがここに表示されます。', ru:'Пока нет сессий — запущенные игры появятся здесь.', pl:'Brak sesji — uruchamiane gry pojawią się tutaj.' },
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
  emptyOwn:{ fr:'Partage tes plus beaux moments de jeu — ajoute ta première capture.', en:'Share your best gaming moments — add your first screenshot.', es:'Comparte tus mejores momentos de juego — añade tu primera captura.', de:'Teile deine besten Gaming-Momente — füge deinen ersten Screenshot hinzu.', it:'Condividi i tuoi momenti di gioco migliori — aggiungi il primo screenshot.', ar:'شارك أجمل لحظات لعبك — أضف أول لقطة.', zh:'分享你最精彩的游戏时刻——添加第一张截图。', ja:'最高のゲームの瞬間をシェアしよう — 最初の1枚を追加。', ru:'Поделитесь лучшими игровыми моментами — добавьте первый скриншот.', pl:'Podziel się najlepszymi momentami z gier — dodaj pierwszy zrzut.' },
  uploading:{ fr:'Envoi en cours…', en:'Uploading…', es:'Subiendo…', de:'Wird hochgeladen…', it:'Caricamento…', ar:'جارٍ الرفع…', zh:'上传中…', ja:'アップロード中…', ru:'Загрузка…', pl:'Przesyłanie…' },
  limit:  { fr:'Limite de 12 captures atteinte — supprime-en une d’abord.', en:'12-screenshot limit reached — delete one first.', es:'Límite de 12 capturas alcanzado — elimina una primero.', de:'Limit von 12 Screenshots erreicht — lösche zuerst einen.', it:'Limite di 12 screenshot raggiunto — eliminane uno prima.', ar:'بلغت حد 12 لقطة — احذف واحدة أولاً.', zh:'已达到12张上限——请先删除一张。', ja:'12枚の上限に達しました — 先に1枚削除してください。', ru:'Достигнут лимит в 12 скриншотов — сначала удалите один.', pl:'Osiągnięto limit 12 zrzutów — najpierw usuń jeden.' },
  fail:   { fr:'Envoi impossible — réessaie.', en:'Upload failed — try again.', es:'Error al subir — inténtalo de nuevo.', de:'Upload fehlgeschlagen — versuch es erneut.', it:'Caricamento non riuscito — riprova.', ar:'فشل الرفع — حاول مجدداً.', zh:'上传失败——请重试。', ja:'アップロードに失敗しました — もう一度お試しください。', ru:'Не удалось загрузить — попробуйте ещё раз.', pl:'Przesyłanie nie powiodło się — spróbuj ponownie.' },
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
        // Compression client : WebP ≤1600×1000 — un screenshot 4K devient ~150-400 Ko
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
   ami (jamais sur le sien — on ne se retire pas soi-même).
══════════════════════════════════════════════════════════ */
const _UP_T = {
  member:   { fr:'Membre depuis', en:'Member since', es:'Miembro desde', de:'Mitglied seit', it:'Membro dal', ar:'عضو منذ', zh:'加入于', ja:'登録日', ru:'Участник с', pl:'Członek od' },
  friendsN: { fr:'Amis', en:'Friends', es:'Amigos', de:'Freunde', it:'Amici', ar:'الأصدقاء', zh:'好友', ja:'フレンド', ru:'Друзья', pl:'Znajomi' },
  trophiesN:{ fr:'Trophées', en:'Trophies', es:'Trofeos', de:'Trophäen', it:'Trofei', ar:'الجوائز', zh:'奖杯', ja:'トロフィー', ru:'Трофеи', pl:'Trofea' },
  add:      { fr:'Ajouter en ami', en:'Add friend', es:'Añadir amigo', de:'Freund hinzufügen', it:'Aggiungi amico', ar:'إضافة صديق', zh:'添加好友', ja:'フレンド追加', ru:'Добавить в друзья', pl:'Dodaj znajomego' },
  accept:   { fr:'Accepter la demande', en:'Accept request', es:'Aceptar solicitud', de:'Anfrage annehmen', it:'Accetta richiesta', ar:'قبول الطلب', zh:'接受请求', ja:'リクエストを承認', ru:'Принять заявку', pl:'Przyjmij zaproszenie' },
  pending:  { fr:'Demande envoyée', en:'Request sent', es:'Solicitud enviada', de:'Anfrage gesendet', it:'Richiesta inviata', ar:'تم إرسال الطلب', zh:'请求已发送', ja:'リクエスト送信済み', ru:'Заявка отправлена', pl:'Wysłano zaproszenie' },
  remove:   { fr:'Retirer des amis', en:'Remove friend', es:'Eliminar amigo', de:'Freund entfernen', it:'Rimuovi amico', ar:'إزالة الصديق', zh:'移除好友', ja:'フレンド解除', ru:'Удалить из друзей', pl:'Usuń znajomego' },
  removeQ:  { fr:'Retirer cette personne de vos amis ?', en:'Remove this person from your friends?', es:'¿Eliminar a esta persona de tus amigos?', de:'Diese Person aus deinen Freunden entfernen?', it:'Rimuovere questa persona dai tuoi amici?', ar:'إزالة هذا الشخص من أصدقائك؟', zh:'将此人从好友中移除？', ja:'この人をフレンドから外しますか？', ru:'Удалить этого человека из друзей?', pl:'Usunąć tę osobę ze znajomych?' },
  mine:     { fr:'Mon espace', en:'My space', es:'Mi espacio', de:'Mein Bereich', it:'Il mio spazio', ar:'مساحتي', zh:'我的空间', ja:'マイスペース', ru:'Мой профиль', pl:'Mój profil' },
  noBio:    { fr:'Ce joueur n’a pas encore de bio.', en:'This player hasn’t added a bio yet.', es:'Este jugador aún no tiene biografía.', de:'Dieser Spieler hat noch keine Bio.', it:'Questo giocatore non ha ancora una bio.', ar:'لم يضف هذا اللاعب نبذة بعد.', zh:'该玩家尚未填写简介。', ja:'このプレイヤーはまだ自己紹介がありません。', ru:'Игрок ещё не добавил описание.', pl:'Ten gracz nie dodał jeszcze bio.' },
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

/* Rendu de la page profil PUBLIC d'un autre joueur — même disposition que la
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
    prof = { id:viewId, username:f.username||'—', avatar_url:f.avatar_url||null, banner_url:null, bio:null, created_at:null, friend_count:null, wishlist:[], achievements:[] };
  }
  if (!_friendsCache.friends.length && !_friendsCache.incoming.length && !_friendsCache.outgoing.length){
    try { const fr = await GLG_AUTH.friendsList?.(); if (fr && fr.ok) _friendsCache = { friends:fr.friends||[], incoming:fr.incoming||[], outgoing:fr.outgoing||[] }; } catch(e){}
  }
  const name = prof.username || '—';
  const since = prof.created_at ? new Date(prof.created_at).toLocaleDateString(LANG_LOCALE[LANG]||'en-US',{year:'numeric',month:'long'}) : '—';
  const banner = safeMediaUrl(prof.banner_url);
  const keys = new Set(Array.isArray(prof.achievements) ? prof.achievements : []);
  const d = computeTrophies(keys);                       // trophées calculés depuis SES déblocages
  const wids = Array.isArray(prof.wishlist) ? prof.wishlist : [];
  const wWorks = (typeof ALL_WORKS!=='undefined'?ALL_WORKS:[]).filter(w => wids.includes(w.id) && !isMatureHidden(w));
  const rel = await _userRelation(viewId);
  let action = '';
  if (rel === 'friend')        action = `<button class="btn btn-outline up-action up-action--remove" data-act="remove">${_upt('remove')}</button>`;
  else if (rel === 'incoming') action = `<button class="btn btn-primary up-action" data-act="accept">${_upt('accept')}</button>`;
  else if (rel === 'outgoing') action = `<span class="up-pending">${_upt('pending')}</span>`;
  else if (rel === 'self')     action = '';
  else                         action = `<button class="btn btn-primary up-action" data-act="add">${_upt('add')}</button>`;

  host.innerHTML = `
    <section class="pp pp--public">
      <div class="pp-banner ${banner?'has-img':''}" ${banner?`style="background-image:url(${banner})"`:''}><div class="pp-banner-scrim"></div></div>
      <div class="pp-head">
        <span class="pp-avatar pp-avatar--ro">${_userAvatarHTML(prof)}</span>
        <div class="pp-id">
          <h1 class="pp-name">${escHtml(name)}${_verifiedTag(name,'glg-verified--lg')}</h1>
          <span class="pp-level-chip"><span class="pp-lc-cup">${_TROPHY_SVG}</span><b>${_tt('levelShort')} ${d.level}</b><span class="pp-lc-bar"><i style="width:${d.nextPct}%"></i></span></span>
          <div class="pp-badges">
            ${GLG_PRESENCE.isOnline(viewId) ? `<span class="pp-badge pp-badge--online">${_ft('online')}</span>` : ''}
            <span class="pp-badge pp-badge--muted">${_ppt('statMember')} ${since}</span>
          </div>
          ${prof.bio ? `<p class="pp-bio">${escHtml(prof.bio)}</p>` : `<p class="pp-bio pp-bio--empty">${_upt('noBio')}</p>`}
        </div>
        <div class="pp-actions pp-actions--public">
          <button class="btn btn-outline pp-back-btn" onclick="_backFromPublic()">‹ ${_ft('title')}</button>
          ${action}
        </div>
      </div>
      <div class="pp-stats">
        <div class="pp-stat"><b>${d.earnedTotal}</b><span>${_tt('section')}</span></div>
        <div class="pp-stat"><b>${prof.friend_count!=null?prof.friend_count:'—'}</b><span>${_ft('statFriends')}</span></div>
        <div class="pp-stat"><b>${wWorks.length}</b><span>${_wt('title')}</span></div>
      </div>
      ${(() => { /* numérotation continue même quand « Jeux récents » est absent */
        let _pi = 0; const nidx = () => `${String(++_pi).padStart(2, '0')} /`;
        const rg = _recentGamesHTML(prof.recent_games);
        return `
      <div class="pp-cols">
        <div class="pp-main">
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
  _initProfileShots(viewId, { readOnly: true });

  const actBtn = host.querySelector('.up-action');
  if (actBtn) actBtn.addEventListener('click', async () => {
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
  });
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
  none:     { fr:'Aucun trophée débloqué pour l’instant — tes jeux rempliront cet espace.', en:'No trophies unlocked yet — your games will fill this in.', es:'Aún no hay trofeos — tus juegos los llenarán.', de:'Noch keine Trophäen — deine Spiele füllen das.', it:'Ancora nessun trofeo — i tuoi giochi lo riempiranno.', ar:'لا جوائز بعد — ألعابك ستملؤها.', zh:'尚无奖杯——你的游戏将填满这里。', ja:'まだトロフィーなし——ゲームが埋めていきます。', ru:'Пока нет трофеев — ваши игры их заполнят.', pl:'Brak trofeów — twoje gry je wypełnią.' },
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
}

/* ── Section "Évaluations" du profil (perso + public) — via user_reviews ── */
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

/* ── Flux "Activité récente" (profil perso) — merge client trophées/amis/évals,
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
          html: `${escHtml(txt.t)} <span class="pp-act-dim">— ${work.title}</span>` });
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

/* ── Rareté (signature PSN) — remplie en asynchrone, cache par session.
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
   ÉVALUATIONS DES JOUEURS (style Steam) — DB-backed, RLS + RPC rate-limitées
   ──────────────────────────────────────────
   Écriture réservée aux œuvres SORTIES (même règle que la notif "sorti") :
   tant qu'un titre est "coming soon", la section montre la preuve sociale
   réelle ("N joueurs l'attendent" via wishlist_count) — jamais d'étoiles
   vides mortes. Tout contenu utilisateur passe par escHtml (XSS).
══════════════════════════════════════════ */
const _REV_T = {
  section:  { fr:'Évaluations des joueurs', en:'Player reviews', es:'Reseñas de jugadores', de:'Spielerbewertungen', it:'Recensioni dei giocatori', ar:'تقييمات اللاعبين', zh:'玩家评价', ja:'プレイヤーレビュー', ru:'Отзывы игроков', pl:'Recenzje graczy' },
  countOne: { fr:'1 évaluation', en:'1 review', es:'1 reseña', de:'1 Bewertung', it:'1 recensione', ar:'تقييم واحد', zh:'1 条评价', ja:'1件のレビュー', ru:'1 отзыв', pl:'1 recenzja' },
  countMany:{ fr:'%s évaluations', en:'%s reviews', es:'%s reseñas', de:'%s Bewertungen', it:'%s recensioni', ar:'%s تقييمات', zh:'%s 条评价', ja:'%s件のレビュー', ru:'%s отзывов', pl:'%s recenzji' },
  delQ:     { fr:'Supprimer ton évaluation ?', en:'Delete your review?', es:'¿Eliminar tu reseña?', de:'Deine Bewertung löschen?', it:'Eliminare la tua recensione?', ar:'حذف تقييمك؟', zh:'删除你的评价？', ja:'レビューを削除しますか？', ru:'Удалить ваш отзыв?', pl:'Usunąć swoją recenzję?' },
  waiting:  { fr:'%s joueurs l’attendent déjà', en:'%s players are already waiting', es:'%s jugadores ya lo esperan', de:'%s Spieler warten bereits darauf', it:'%s giocatori lo stanno già aspettando', ar:'%s لاعبًا ينتظرونه بالفعل', zh:'已有 %s 名玩家在等待', ja:'すでに%s人のプレイヤーが待っています', ru:'%s игроков уже ждут', pl:'%s graczy już czeka' },
  opens:    { fr:'Les évaluations ouvriront à la sortie du titre.', en:'Reviews open when the title releases.', es:'Las reseñas se abrirán con el lanzamiento.', de:'Bewertungen öffnen zum Release.', it:'Le recensioni apriranno all’uscita.', ar:'تُفتح التقييمات عند صدور العنوان.', zh:'评价将在游戏发售后开放。', ja:'レビューはタイトル発売時に開放されます。', ru:'Отзывы откроются после выхода.', pl:'Recenzje otworzą się w dniu premiery.' },
  beFirst:  { fr:'Aucune évaluation pour l’instant — la tienne sera la première.', en:'No reviews yet — yours will be the first.', es:'Aún no hay reseñas: la tuya será la primera.', de:'Noch keine Bewertungen — deine wird die erste sein.', it:'Ancora nessuna recensione: la tua sarà la prima.', ar:'لا توجد تقييمات بعد — سيكون تقييمك الأول.', zh:'暂无评价——你的将是第一条。', ja:'まだレビューはありません。あなたが最初です。', ru:'Пока нет отзывов — ваш будет первым.', pl:'Brak recenzji — twoja będzie pierwsza.' },
  write:    { fr:'Rédiger une évaluation', en:'Write a review', es:'Escribir una reseña', de:'Bewertung schreiben', it:'Scrivi una recensione', ar:'اكتب تقييمًا', zh:'撰写评价', ja:'レビューを書く', ru:'Написать отзыв', pl:'Napisz recenzję' },
  edit:     { fr:'Modifier mon évaluation', en:'Edit my review', es:'Editar mi reseña', de:'Meine Bewertung bearbeiten', it:'Modifica la mia recensione', ar:'تعديل تقييمي', zh:'编辑我的评价', ja:'レビューを編集', ru:'Изменить мой отзыв', pl:'Edytuj moją recenzję' },
  ph:       { fr:'Partage ton expérience (facultatif)…', en:'Share your experience (optional)…', es:'Comparte tu experiencia (opcional)…', de:'Teile deine Erfahrung (optional)…', it:'Condividi la tua esperienza (facoltativo)…', ar:'شارك تجربتك (اختياري)…', zh:'分享你的体验（可选）…', ja:'体験を共有しよう（任意）…', ru:'Поделитесь впечатлениями (необязательно)…', pl:'Podziel się wrażeniami (opcjonalnie)…' },
  publish:  { fr:'Publier', en:'Publish', es:'Publicar', de:'Veröffentlichen', it:'Pubblica', ar:'نشر', zh:'发布', ja:'投稿', ru:'Опубликовать', pl:'Opublikuj' },
  update:   { fr:'Mettre à jour', en:'Update', es:'Actualizar', de:'Aktualisieren', it:'Aggiorna', ar:'تحديث', zh:'更新', ja:'更新', ru:'Обновить', pl:'Aktualizuj' },
  del:      { fr:'Supprimer', en:'Delete', es:'Eliminar', de:'Löschen', it:'Elimina', ar:'حذف', zh:'删除', ja:'削除', ru:'Удалить', pl:'Usuń' },
  signin:   { fr:'Connecte-toi pour évaluer ce titre.', en:'Sign in to review this title.', es:'Inicia sesión para reseñar este título.', de:'Melde dich an, um zu bewerten.', it:'Accedi per recensire questo titolo.', ar:'سجّل الدخول لتقييم هذا العنوان.', zh:'登录后即可评价该作品。', ja:'ログインしてレビューを書こう。', ru:'Войдите, чтобы оставить отзыв.', pl:'Zaloguj się, aby ocenić.' },
  report:   { fr:'Signaler', en:'Report', es:'Denunciar', de:'Melden', it:'Segnala', ar:'إبلاغ', zh:'举报', ja:'報告', ru:'Пожаловаться', pl:'Zgłoś' },
  reported: { fr:'Signalé', en:'Reported', es:'Denunciada', de:'Gemeldet', it:'Segnalata', ar:'تم الإبلاغ', zh:'已举报', ja:'報告済み', ru:'Отправлено', pl:'Zgłoszono' },
  needStars:{ fr:'Choisis une note (1–5 étoiles).', en:'Pick a rating (1–5 stars).', es:'Elige una nota (1–5 estrellas).', de:'Wähle eine Wertung (1–5 Sterne).', it:'Scegli un voto (1–5 stelle).', ar:'اختر تقييمًا (1–5 نجوم).', zh:'请选择评分（1–5 星）。', ja:'評価を選んでください（星1〜5）。', ru:'Выберите оценку (1–5 звёзд).', pl:'Wybierz ocenę (1–5 gwiazdek).' },
  err:      { fr:'Impossible d’enregistrer — réessaie.', en:'Could not save — try again.', es:'No se pudo guardar; inténtalo de nuevo.', de:'Speichern fehlgeschlagen — bitte erneut.', it:'Salvataggio non riuscito: riprova.', ar:'تعذّر الحفظ — حاول مجددًا.', zh:'保存失败，请重试。', ja:'保存できませんでした。再試行してください。', ru:'Не удалось сохранить — попробуйте ещё раз.', pl:'Nie udało się zapisać — spróbuj ponownie.' },
  limit:    { fr:'Limite atteinte — réessaie dans 24 h.', en:'Limit reached — try again in 24 h.', es:'Límite alcanzado; vuelve en 24 h.', de:'Limit erreicht — in 24 h erneut.', it:'Limite raggiunto: riprova tra 24 h.', ar:'بلغت الحد — حاول بعد 24 ساعة.', zh:'已达上限，请 24 小时后再试。', ja:'上限に達しました。24時間後に再試行してください。', ru:'Лимит исчерпан — повторите через 24 ч.', pl:'Limit osiągnięty — spróbuj za 24 h.' },
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

  /* — Agrégat : moyenne + histogramme hairlines (à la Steam) — */
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

  /* — Avant la sortie : preuve sociale réelle, pas d'étoiles mortes — */
  if (!released){
    if (waiting >= 10) html += `<p class="rv-waiting">${_rvt('waiting').replace('%s', waiting)}</p>`;
    html += `<p class="dp-rev-note">${_rvt('opens')}</p>`;
  } else if (user){
    /* — Formulaire (upsert : 1 avis par joueur, éditable) — */
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

  /* — Liste (pseudo cliquable → profil public, comme Steam) — */
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
        <span class="pp-link-id"><span class="pp-link-name">${pf.name}</span>${val?`<span class="pp-link-handle">${escHtml(val)}</span>`:`<span class="pp-link-muted">—</span>`}</span>
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

/* CAROUSEL TOUCH — superseded by buildWorksGrid(); the old carousel tracks
   (.carousel-track.films-t/.games-t) no longer exist. Kept as a real no-op so
   any lingering call site doesn't throw. */
function initCarouselTouch() { /* no-op */ }

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

/* Custom GLG cursor removed by design (default browser cursor). The old
   initGLGCursor() — with an unbounded rAF ring-follow loop — is deleted. */

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

  // ── Deep-link d'œuvre partageable (?work=<id>) — SEO + étape launcher ──
  // /?work=backrooms-liminal ouvre directement la fiche (après le choix de
  // langue si nécessaire). Consommé par selectLang une fois le site construit.
  // Les anciens liens #detail/<id> restent honorés.
  try {
    const qsWork = new URLSearchParams(location.search).get('work');
    let wid = qsWork || (location.hash.startsWith('#detail/') ? location.hash.slice(8) : null);
    if (wid && ALL_WORKS.some(w => w.id === wid)) window._bootWorkId = wid;
  } catch (e) {}

  // ── Pages profondes au boot (#works, #shop… — raccourcis PWA du manifest,
  // liens partagés). Consommé par selectLang après initSite, comme _bootWorkId.
  try {
    const h = (location.hash || '').replace(/^#/, '');
    if (!window._bootWorkId && ['works', 'shop', 'library', 'about', 'contact', 'profile', 'settings'].includes(h)) {
      window._bootPage = h;
    }
  } catch (e) {}

  // ── URL de langue partageable / SEO (?lang=xx) ─────────────────────────
  // Une URL comme /?lang=fr entre directement dans la langue demandée
  // (équivaut à un clic sur le drapeau : selectLang gère loader + failsafes).
  // C'est aussi ce que les balises hreflang annoncent aux moteurs.
  try {
    const qLang = new URLSearchParams(location.search).get('lang');
    if (qLang && LANG_GATE.some(l => l.code === qLang)) selectLang(qLang);
  } catch (e) {}
});

/* ══════════════════════════════════════════
   PWA — service worker (étape launcher)
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
