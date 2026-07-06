/* ═══════════════════════════════════════════════════════════════════════
   GEEKLEARN GAMES — gate-field.js
   ───────────────────────────────────────────────────────────────────────
   Champ de drapeaux cinématique derrière le Language Gate.
   « La pluie de drapeaux », version GPU-sobre : canvas 2D, sprites POOLÉS,
   bitmaps de drapeaux PRÉ-RASTÉRISÉS une seule fois au boot (on ne re-parse
   jamais le SVG par frame → c'est ce qui faisait ramer l'ancienne version DOM).

   API publique : window.GLG_GATE_FIELD = { start, stop, setTint, burst }
   - start()        démarre / reprend la boucle (crée le canvas au 1er appel)
   - stop()         gèle la boucle (onglet caché, sélection, fermeture)
   - setTint(code)  réveille en couleur les drapeaux d'UNE langue (null = repos)
   - burst(code)    impulsion ascendante + flash couleur à la sélection

   Dégradation propre : tous les appels côté app.js utilisent ?., donc si ce
   fichier ne charge pas OU si reduced-motion est actif, le gate fonctionne
   exactement comme avant (aura + wash conservés).
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CODES = ['fr', 'en', 'es', 'de', 'ar', 'zh', 'ja', 'ru', 'pl', 'it'];

  // Carte drapeau bakée à la plus grande taille utile (plan proche × dpr),
  // puis réduite par drawImage selon le plan → 1 seul bitmap/variante/langue.
  var CARD_W = 116, CARD_H = 74;         // ratio ~1.57 (drapeau)
  var PLANES = [                          // profondeur : échelle, vitesse px/s, alpha repos
    { scale: 0.60, speed: 7,  alpha: 0.06 },
    { scale: 0.85, speed: 11, alpha: 0.10 },
    { scale: 1.12, speed: 17, alpha: 0.15 },
  ];

  var canvas = null, ctx = null;
  var sprites = [];
  var bitmaps = {};                       // code -> { gray, color, ready }
  var running = false, rafId = 0, lastT = 0;
  var vw = 0, vh = 0, dpr = 1;
  var tintCode = null;                    // langue survolée (couleur)
  var burstCode = null, burstUntil = 0;   // langue sélectionnée (impulsion)
  var pointer = { x: -9999, y: -9999, active: false };
  var density = 26;
  var reduced = false;

  // Auto-throttle : si ça rame, on réduit puis on coupe (kill-switch).
  var frameAvg = 16, slowFrames = 0, throttled = false;

  function prefersReduced() {
    try {
      if (document.documentElement.classList.contains('glg-reduce-motion')) return true;
      return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) { return false; }
  }

  function roundRectPath(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // Bake une variante (gris sombre ou couleur) d'un drapeau dans un canvas offscreen.
  function bakeVariant(img, grayscale) {
    var s = Math.min(dpr, 1.5) * 1.15;    // marge pour le plan le plus proche
    var w = Math.round(CARD_W * s), h = Math.round(CARD_H * s), r = Math.round(10 * s);
    var oc = document.createElement('canvas');
    oc.width = w; oc.height = h;
    var octx = oc.getContext('2d');
    octx.save();
    roundRectPath(octx, 0.5, 0.5, w - 1, h - 1, r);
    octx.clip();
    // filtre appliqué UNE seule fois ici (jamais par frame)
    var canFilter = 'filter' in octx;
    if (grayscale && canFilter) octx.filter = 'grayscale(1) brightness(0.62) contrast(0.95)';
    // cover : on remplit la carte sans déformer
    var ir = img.width / img.height, cr = w / h, dw, dh, dx, dy;
    if (ir > cr) { dh = h; dw = h * ir; dx = (w - dw) / 2; dy = 0; }
    else { dw = w; dh = w / ir; dx = 0; dy = (h - dh) / 2; }
    try { octx.drawImage(img, dx, dy, dw, dh); } catch (e) {}
    octx.filter = 'none';
    // fallback grayscale si ctx.filter absent : voile luminance
    if (grayscale && !canFilter) {
      octx.globalCompositeOperation = 'saturation';
      octx.fillStyle = '#808080';
      octx.fillRect(0, 0, w, h);
      octx.globalCompositeOperation = 'source-over';
      octx.fillStyle = 'rgba(5,5,8,0.45)';
      octx.fillRect(0, 0, w, h);
    }
    octx.restore();
    // liseré fin (motif viseur / carte physique)
    octx.strokeStyle = grayscale ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.22)';
    octx.lineWidth = Math.max(1, s * 0.8);
    roundRectPath(octx, 0.5, 0.5, w - 1, h - 1, r);
    octx.stroke();
    return oc;
  }

  function loadBitmaps() {
    CODES.forEach(function (code) {
      if (bitmaps[code]) return;
      var slot = bitmaps[code] = { gray: null, color: null, ready: false };
      var img = new Image();
      img.decoding = 'async';
      img.onload = function () {
        try {
          slot.color = bakeVariant(img, false);
          slot.gray = bakeVariant(img, true);
          slot.ready = true;
        } catch (e) { /* garde le fallback carte sombre */ }
      };
      img.onerror = function () { /* fallback : carte sombre dessinée en direct */ };
      img.src = 'assets/img/flags/' + code + '.svg';
    });
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  function spawn(sprite, atTop) {
    var pi = (Math.random() * PLANES.length) | 0;
    sprite.plane = pi;
    sprite.code = CODES[(Math.random() * CODES.length) | 0];
    sprite.x = rand(-40, vw + 40);
    sprite.y = atTop ? rand(-CARD_H, -10) : rand(-CARD_H, vh);
    sprite.rot = rand(-0.18, 0.18);
    sprite.vrot = rand(-0.02, 0.02);
    sprite.drift = rand(-6, 6);           // dérive horizontale douce
    sprite.mix = 0;                        // 0 = gris, 1 = couleur
    sprite.alpha = 0;                      // fade-in à l'apparition
    sprite.ox = 0; sprite.oy = 0;          // offset répulsion curseur
  }

  function buildSprites() {
    sprites.length = 0;
    var n = density;
    for (var i = 0; i < n; i++) {
      var s = {};
      spawn(s, false);
      sprites.push(s);
    }
  }

  function resize() {
    if (!canvas) return;
    var gate = document.getElementById('lang-gate');
    vw = (gate ? gate.clientWidth : window.innerWidth) || window.innerWidth;
    vh = (gate ? gate.clientHeight : window.innerHeight) || window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    canvas.style.width = vw + 'px';
    canvas.style.height = vh + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // densité fonction de la surface
    var area = vw * vh;
    density = Math.max(10, Math.min(34, Math.round(area / 46000)));
    if (throttled) density = Math.round(density / 2);
    if (!sprites.length || Math.abs(sprites.length - density) > 4) buildSprites();
  }

  function ensureCanvas() {
    if (canvas) return true;
    var gate = document.getElementById('lang-gate');
    if (!gate) return false;
    canvas = document.createElement('canvas');
    canvas.id = 'gate-field';
    canvas.setAttribute('aria-hidden', 'true');
    // inséré juste après l'aura (fond), sous le wash et le contenu
    var aura = gate.querySelector('.gate-aura');
    if (aura && aura.nextSibling) gate.insertBefore(canvas, aura.nextSibling);
    else gate.insertBefore(canvas, gate.firstChild);
    ctx = canvas.getContext('2d', { alpha: true });
    gate.classList.add('gate--field');
    // pointeur (répulsion) — desktop uniquement
    if (window.matchMedia && window.matchMedia('(hover:hover)').matches) {
      gate.addEventListener('pointermove', function (e) {
        pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true;
      });
      gate.addEventListener('pointerleave', function () { pointer.active = false; });
    }
    window.addEventListener('resize', debouncedResize, { passive: true });
    resize();
    return true;
  }

  var _rt = 0;
  function debouncedResize() { clearTimeout(_rt); _rt = setTimeout(resize, 180); }

  function draw(now) {
    if (!running) return;
    var dt = Math.min((now - lastT) / 1000, 0.05); // clamp (onglet revenu au 1er plan)
    lastT = now;

    // frame-time moyen glissant → auto-throttle
    var ft = dt * 1000;
    frameAvg += (ft - frameAvg) * 0.05;
    if (frameAvg > 20) { if (++slowFrames > 60) applyThrottle(); }
    else slowFrames = 0;

    ctx.clearRect(0, 0, vw, vh);

    var bursting = burstCode && now < burstUntil;

    for (var i = 0; i < sprites.length; i++) {
      var s = sprites[i];
      var P = PLANES[s.plane];

      // impulsion à la sélection : la langue choisie fuse vers le haut
      var vy = P.speed;
      if (bursting && s.code === burstCode) vy = -260 * P.scale;
      s.y += vy * dt;
      s.x += s.drift * dt;
      s.rot += s.vrot * dt;

      // wrap vertical (dérive vers le bas → réapparaît en haut)
      if (s.y > vh + CARD_H) { spawn(s, true); continue; }
      if (s.y < -CARD_H * 1.5) { s.y = vh + CARD_H * 0.5; }
      if (s.x < -CARD_W) s.x = vw + CARD_W * 0.5;
      else if (s.x > vw + CARD_W) s.x = -CARD_W * 0.5;

      // répulsion douce du curseur (1 vecteur/sprite, pas de collisions)
      if (pointer.active) {
        var dx = s.x - pointer.x, dy = s.y - pointer.y;
        var d2 = dx * dx + dy * dy;
        if (d2 < 20000 && d2 > 1) {
          var d = Math.sqrt(d2), f = (1 - d / 141) * 22;
          s.ox += (dx / d) * f * dt * 6;
          s.oy += (dy / d) * f * dt * 6;
        }
      }
      s.ox *= 0.90; s.oy *= 0.90;          // retour élastique

      // cibles couleur/alpha selon la langue survolée / burst
      var lit = (tintCode && s.code === tintCode) || (bursting && s.code === burstCode);
      var targetMix = lit ? 1 : 0;
      var targetAlpha = lit ? Math.min(P.alpha + 0.34, 0.55) : P.alpha;
      s.mix += (targetMix - s.mix) * Math.min(dt * 6, 1);
      s.alpha += (targetAlpha - s.alpha) * Math.min(dt * 4, 1);

      var bmp = bitmaps[s.code];
      var w = CARD_W * P.scale, h = CARD_H * P.scale;
      var px = (s.x + s.ox) | 0, py = (s.y + s.oy) | 0;

      ctx.save();
      ctx.translate(px, py);
      if (s.rot) ctx.rotate(s.rot);
      if (bmp && bmp.ready) {
        if (s.mix < 0.98) { ctx.globalAlpha = s.alpha * (1 - s.mix); ctx.drawImage(bmp.gray, -w / 2, -h / 2, w, h); }
        if (s.mix > 0.02) { ctx.globalAlpha = s.alpha * s.mix; ctx.drawImage(bmp.color, -w / 2, -h / 2, w, h); }
      } else {
        // fallback : carte sombre le temps que le bitmap se bake
        ctx.globalAlpha = s.alpha;
        roundRectPath(ctx, -w / 2, -h / 2, w, h, 8 * P.scale);
        ctx.fillStyle = '#0e0f14';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    rafId = requestAnimationFrame(draw);
  }

  function applyThrottle() {
    slowFrames = 0;
    if (!throttled) {
      throttled = true;
      density = Math.max(8, Math.round(density / 2));
      buildSprites();
      frameAvg = 16;
    } else {
      stop();                 // kill-switch : le gate reste beau (aura + wash)
      if (canvas) canvas.style.display = 'none';
    }
  }

  // ── API publique ────────────────────────────────────────────────────
  function start() {
    reduced = prefersReduced();
    if (reduced || running) return;
    if (!ensureCanvas()) return;
    if (canvas) canvas.style.display = '';
    loadBitmaps();
    running = true;
    lastT = performance.now();
    rafId = requestAnimationFrame(draw);
  }

  function stop() {
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  }

  function setTint(code) {
    tintCode = code && CODES.indexOf(code) >= 0 ? code : null;
  }

  function burst(code) {
    if (reduced) return;
    if (code && CODES.indexOf(code) >= 0) {
      burstCode = code;
      burstUntil = performance.now() + 900;
    }
  }

  // onglet caché → gèle (rAF est de toute façon throttlé ; on évite le drift)
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop();
    else if (canvas && canvas.style.display !== 'none' &&
             document.getElementById('lang-gate') &&
             getComputedStyle(document.getElementById('lang-gate')).display !== 'none') {
      start();
    }
  });

  window.GLG_GATE_FIELD = { start: start, stop: stop, setTint: setTint, burst: burst };
})();
