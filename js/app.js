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
function buildGate() {
  const wrap = $('gate-langs');
  if (!wrap) return;

  // Render flag mosaic cards with full-bleed SVG images
  wrap.innerHTML = LANG_GATE.map((l, i) => `
    <button class="gate-lang" data-code="${l.code}"
            onclick="selectLang('${l.code}')" aria-label="${l.label}">
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

  // Hover: dim all non-hovered cards
  const btns = wrap.querySelectorAll('.gate-lang');
  btns.forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      btns.forEach(b => { if (b !== btn) b.classList.add('dimmed'); });
    });
    btn.addEventListener('mouseleave', () => {
      btns.forEach(b => b.classList.remove('dimmed'));
    });
  });
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

  // Footer
  setText('footer-desc', t('footerDesc'));
  setText('footer-nav-title', t('footerNavTitle'));
  setText('footer-works-title', t('footerWorksTitle'));
  setText('footer-follow-title', t('footerFollowTitle'));

  // Footer links nav labels — same order as navKeys
  const fNavKeys = ['home','works','shop','about','contact'];
  t('nav').forEach((label, i) => {
    setText('fnl-' + fNavKeys[i], label);
  });

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
  buildFooterWorks();
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

  /*
   * How many loops (copies of the items array) do we need?
   *
   * The -50% trick requires:  total track width ≥ 2 × viewport width
   * so that when the animation translates by -50%, the second half of the
   * track is always at least as wide as the viewport (no empty space visible).
   *
   * Card width: clamp(130px, 16vw, 200px) + 10px margin-right.
   * We add a 1.5× safety factor and enforce a minimum of 4 loops.
   */
  const vw       = window.innerWidth;
  const cardW    = Math.min(200, Math.max(130, vw * 0.16)) + 10; // width + margin
  const minLoops = Math.max(4, Math.ceil((vw * 3) / (items.length * cardW)));

  let html = '';
  for (let loop = 0; loop < minLoops; loop++) {
    items.forEach(item => { html += cardHTML(item, typeLabel); });
  }
  el.innerHTML = html;

  /*
   * games-t animation starts at translateX(-50%) via CSS.
   * No JS pre-positioning needed — the static CSS transform keeps the
   * element at -50% until the very first animation frame takes over.
   */
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

function buildFooterWorks() {
  const el = $('footer-works-links');
  if (!el) return;
  el.innerHTML = ALL_WORKS.map(w =>
    `<button onclick="showPage('detail','${w.id}')" id="fwl-${w.id}">${w.title}</button>`
  ).join('');
}

/* ══════════════════════════════════════════
   ABOUT PAGE
══════════════════════════════════════════ */
function buildAboutPage() {
  buildOrgTree();
  buildAwards();
}

/* ── Team alternating cards with L-bracket connectors ── */
function buildOrgTree() {
  const container = $('org-tree');
  if (!container || !TEAM.length) return;

  container.innerHTML = '';

  TEAM.forEach((member, i) => {
    const isLeft = i % 2 === 0; // even index → photo on left

    // Member card
    const card = document.createElement('div');
    card.className = `about-member${isLeft ? '' : ' about-member--right'} reveal`;
    card.innerHTML = memberCardHTML(member, isLeft);
    container.appendChild(card);

    // L-bracket connector between this card and the next (not after the last)
    if (i < TEAM.length - 1) {
      const conn = document.createElement('div');
      conn.className = `about-connector-row about-connector-row--${isLeft ? 'lr' : 'rl'}`;
      container.appendChild(conn);
    }
  });
}

/* Builds the inner HTML for one team member card */
function memberCardHTML(member, isLeft) {
  const words    = member.name.trim().split(/\s+/);
  const initials = words.length > 1
    ? words.map(w => w[0]).join('').slice(0, 2)
    : member.name.slice(0, 2);

  const photoBlock = `
    <div class="about-member-photo-wrap">
      ${member.photo
        ? `<img class="about-member-photo-img" src="${member.photo}" alt="${member.name}"
               onerror="this.style.display='none'">`
        : ''
      }
      <div class="about-member-photo-init">${initials.toUpperCase()}</div>
    </div>`;

  const textBlock = `
    <div class="about-member-content">
      <div class="about-member-name">${member.name}</div>
      <div class="about-member-role">${member.role}</div>
      <p class="about-member-quote">${member.quote}</p>
    </div>`;

  // Photo goes first (left) or last (right) in the grid
  return isLeft ? photoBlock + textBlock : textBlock + photoBlock;
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
  return `
  <footer class="glg-pattern glg-pat-subtle">
    <div class="glg-pattern-bg" style="--glg-speed:40s;--glg-direction:reverse"></div>
    <div class="footer-inner">
      <div>
        <div class="footer-logo">
          <img src="assets/images/logo/GEEKLEARN_GAMES_NEW_LOGO_V4_WHITE.png" alt="GLG" onerror="this.style.display='none'">
        </div>
        <p class="footer-brand-desc" id="footer-desc-d">An independent game studio creating interactive experiences that teach, move, and haunt your mind. Est. 2026, France.</p>
      </div>
      <div>
        <div class="footer-col-title">Navigate</div>
        <div class="footer-links">
          <button onclick="showPage('home')">Home</button>
          <button onclick="showPage('works')">Our Works</button>
          <button onclick="showPage('shop')">Shop</button>
          <button onclick="showPage('about')">About Us</button>
          <button onclick="showPage('contact')">Contact</button>
        </div>
      </div>
      <div>
        <div class="footer-col-title">Our Works</div>
        <div class="footer-links">
          ${ALL_WORKS.map(w => `<button onclick="showPage('detail','${w.id}')">${w.title}</button>`).join('')}
        </div>
      </div>
      <div>
        <div class="footer-col-title">Follow Us</div>
        <div class="footer-links">
          <a href="#" target="_blank" rel="noopener">Twitter / X</a>
          <a href="#" target="_blank" rel="noopener">Discord</a>
          <a href="#" target="_blank" rel="noopener">YouTube</a>
          <a href="#" target="_blank" rel="noopener">Instagram</a>
          <a href="#" target="_blank" rel="noopener">Steam</a>
        </div>
      </div>
    </div>
    <div class="footer-bottom">
      <span class="footer-copy">© ${new Date().getFullYear()} GeekLearn Games — ${t('copyright')}</span>
      <span class="footer-copy">Games that teach, move, haunt your mind.</span>
    </div>
  </footer>`;
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

  // Match against English title AND localised tagline/description keywords
  const matches = ALL_WORKS.filter(item =>
    item.title.toLowerCase().includes(q) ||
    (item.tagline && item.tagline.toLowerCase().includes(q))
  );

  if (!matches.length) {
    container.innerHTML = `<div class="search-empty">${t('searchNoResults') || 'No results for'} "${escHtml(query)}"</div>`;
    return;
  }

  container.innerHTML = matches.map(item => {
    const hl = item.title.replace(new RegExp('(' + escRe(q) + ')', 'gi'),
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
