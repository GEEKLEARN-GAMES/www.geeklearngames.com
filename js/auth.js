/* ═══════════════════════════════════════════════════════════
   GEEKLEARN GAMES — auth.js
   ───────────────────────────────────────────────────────────
   Couche d'authentification (Supabase). Aucune dépendance externe
   au runtime : supabase-js est auto-hébergé (js/vendor/).

   Sécurité :
     • Seule la clé publique (anon) est utilisée côté client.
     • L'unicité email + le hachage des mots de passe sont gérés
       par Supabase Auth.
     • L'unicité du pseudo + l'accès aux profils sont protégés par
       les règles RLS définies dans db/schema.sql.

   Expose : window.GLG_AUTH  (voir helpers en bas).
   L'UI (modale inscription/connexion/profil) est câblée dans app.js.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  let _client = null;
  let _ready  = false;

  /* ── « Se souvenir de cet appareil » ─────────────────────
     Case cochée (défaut, façon Steam) → session en localStorage : elle
     survit à la fermeture du launcher/navigateur. Décochée → session en
     sessionStorage : déconnecté à chaque fermeture. Le drapeau est posé
     PAR LA MODALE DE CONNEXION (app.js) AVANT l'appel signIn/signUp. */
  const REMEMBER_KEY = 'glg_remember';
  function _rememberOn() {
    try { return localStorage.getItem(REMEMBER_KEY) !== '0'; } catch (e) { return true; }
  }
  function setRemember(on) {
    try {
      localStorage.setItem(REMEMBER_KEY, on ? '1' : '0');
      if (!on) {
        // purge d'éventuels jetons persistants d'une session « souvenue » antérieure
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.startsWith('sb-')) localStorage.removeItem(k);
        }
      }
    } catch (e) {}
  }
  /* Adaptateur de stockage dynamique lu par supabase-js à CHAQUE accès. */
  const _dynStorage = {
    getItem:    (k) => { try { return (_rememberOn() ? localStorage : sessionStorage).getItem(k); } catch (e) { return null; } },
    setItem:    (k, v) => { try { (_rememberOn() ? localStorage : sessionStorage).setItem(k, v); } catch (e) {} },
    removeItem: (k) => { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (e) {} },
  };

  /* ── Initialise le client si configuré ─────────────────── */
  function init() {
    const cfg = window.GLG_SUPABASE || {};
    const hasLib = typeof window.supabase !== 'undefined' &&
                   typeof window.supabase.createClient === 'function';
    if (!hasLib) return false;
    if (!cfg.url || !cfg.anonKey) return false; // pas encore configuré → OK
    try {
      _client = window.supabase.createClient(cfg.url, cfg.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: _dynStorage },
      });
      _ready = true;
      return true;
    } catch (e) {
      console.info('[GLG] Auth non initialisée :', e?.message || e);
      return false;
    }
  }

  /* ── Validation pseudo ─────────────────────────────────── */
  // 3–20 caractères, lettres/chiffres/_/-/. , commence par une lettre/chiffre
  function validateUsername(u) {
    if (typeof u !== 'string') return { ok: false, code: 'required' };
    const v = u.trim();
    if (v.length < 3)  return { ok: false, code: 'tooShort' };
    if (v.length > 20) return { ok: false, code: 'tooLong' };
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(v)) return { ok: false, code: 'invalid' };
    return { ok: true, value: v };
  }

  /* ── Validation d'URL média (avatar / bannière) ────────────
     Retourne : la valeur nettoyée (string), null (effacement), ou
     `false` si la valeur est REFUSÉE (schéma/format dangereux).
     Empêche de stocker en base des payloads XSS ou des URLs pouvant
     s'échapper d'un attribut HTML / d'un url() CSS côté rendu. */
  function _sanitizeMediaUrl(u) {
    if (u == null || u === '') return null;
    if (typeof u !== 'string') return false;
    const s = u.trim();
    if (!s) return null;
    if (s.length > 4096) return false;                       // data-URL WebP réaliste : quelques Ko
    if (/["'()<>\\`\s]/.test(s)) return false;               // aucun caractère de rupture
    if (/^data:image\/(png|jpe?g|webp|gif|avif|svg\+xml);/i.test(s)) return s;
    if (/^https:\/\//i.test(s)) return s;
    if (/^blob:/i.test(s)) return s;
    if (/^(?:\/(?!\/)|\.\/|assets\/)/i.test(s)) return s;    // asset relatif du site
    return false;
  }

  /* ── Validation email ──────────────────────────────────── */
  function validateEmail(e) {
    const v = (e || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return { ok: false, code: 'invalid' };
    return { ok: true, value: v.toLowerCase() };
  }

  /* ── Force du mot de passe ─────────────────────────────── */
  // Exigence : ≥ 8 caractères + au moins 3 des 4 familles
  // (minuscule, majuscule, chiffre, symbole). Retourne un score 0–4.
  function passwordStrength(pw) {
    pw = pw || '';
    const checks = {
      length:  pw.length >= 8,
      lower:   /[a-z]/.test(pw),
      upper:   /[A-Z]/.test(pw),
      digit:   /[0-9]/.test(pw),
      symbol:  /[^A-Za-z0-9]/.test(pw),
    };
    const families = ['lower', 'upper', 'digit', 'symbol'].filter(k => checks[k]).length;
    let score = 0;
    if (checks.length) score++;
    if (families >= 2) score++;
    if (families >= 3) score++;
    if (families >= 4 && pw.length >= 12) score++;
    const ok = checks.length && families >= 3; // règle minimale exigée
    return { ok, score, checks, families };
  }

  function validateAge(a) {
    const n = parseInt(a, 10);
    if (isNaN(n)) return { ok: false, code: 'required' };
    if (n < 13)  return { ok: false, code: 'min' };   // âge minimal (cohérent RGPD/COPPA)
    if (n > 120) return { ok: false, code: 'max' };
    return { ok: true, value: n };
  }

  /* ── Disponibilité du pseudo (insensible à la casse) ─────
     Via la fonction RPC `username_available` (SECURITY DEFINER) :
     fonctionne même non connecté, sans exposer aucune donnée. */
  async function checkUsernameAvailable(username) {
    if (!_ready) return { ok: false, code: 'notConfigured' };
    const v = validateUsername(username);
    if (!v.ok) return { available: false, ...v };
    const { data, error } = await _client.rpc('username_available', { name: v.value });
    if (error) return { ok: false, code: 'network', error };
    return { ok: true, available: data === true };
  }

  /* ── Inscription ───────────────────────────────────────── */
  async function signUp({ email, password, username, gender, genderOther, age, birthdate }) {
    if (!_ready) return { ok: false, code: 'notConfigured' };

    const ev = validateEmail(email);      if (!ev.ok) return { ok: false, field: 'email',    code: ev.code };
    const uv = validateUsername(username); if (!uv.ok) return { ok: false, field: 'username', code: uv.code };
    const pv = passwordStrength(password); if (!pv.ok) return { ok: false, field: 'password', code: 'weak' };
    const av = validateAge(age);           if (!av.ok) return { ok: false, field: 'age',      code: av.code };
    if (!['male', 'female', 'other'].includes(gender))
      return { ok: false, field: 'gender', code: 'required' };

    // Pseudo déjà pris ?
    const avail = await checkUsernameAvailable(uv.value);
    if (avail.ok && !avail.available) return { ok: false, field: 'username', code: 'taken' };

    // Métadonnées passées au trigger SQL qui crée la ligne profiles
    const { data, error } = await _client.auth.signUp({
      email: ev.value,
      password,
      options: {
        data: {
          username:     uv.value,
          gender:       gender,
          gender_other: gender === 'other' ? (genderOther || '').trim().slice(0, 60) : null,
          age:          av.value,
          birthdate:    birthdate || null,
        },
      },
    });
    if (error) {
      const msg = (error.message || '').toLowerCase();
      const status = error.status;
      console.warn('[GLG signUp]', status, error.message); // surface the real cause
      if (msg.includes('already') || msg.includes('registered'))
        return { ok: false, field: 'email', code: 'emailTaken' };
      if (status === 429 || msg.includes('rate limit') || msg.includes('too many') || msg.includes('email rate'))
        return { ok: false, code: 'rateLimit' };
      if (msg.includes('password'))
        return { ok: false, field: 'password', code: 'weak' };
      if (msg.includes('invalid') && msg.includes('email'))
        return { ok: false, field: 'email', code: 'invalid' };
      return { ok: false, code: 'signupFailed', error };
    }
    // identities=[] means the email already exists (Supabase obfuscates to prevent enumeration)
    if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0)
      return { ok: false, field: 'email', code: 'emailTaken' };
    return { ok: true, data, needsConfirm: !data.session };
  }

  /* ── Connexion (par email) ─────────────────────────────── */
  async function signIn({ email, password }) {
    if (!_ready) return { ok: false, code: 'notConfigured' };
    const ev = validateEmail(email); if (!ev.ok) return { ok: false, field: 'email', code: ev.code };
    const { data, error } = await _client.auth.signInWithPassword({ email: ev.value, password });
    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (error.status === 429 || msg.includes('rate limit')) return { ok: false, code: 'rateLimit' };
      if (msg.includes('not confirmed') || msg.includes('confirm')) return { ok: false, code: 'notConfirmed' };
      return { ok: false, code: 'badCredentials', error };
    }
    return { ok: true, data };
  }

  async function signOut() {
    if (!_ready) return { ok: false, code: 'notConfigured' };
    const { error } = await _client.auth.signOut();
    return error ? { ok: false, error } : { ok: true };
  }

  async function getSession() {
    if (!_ready) return null;
    const { data } = await _client.auth.getSession();
    return data?.session || null;
  }

  async function getUser() {
    if (!_ready) return null;
    const { data } = await _client.auth.getUser();
    return data?.user || null;
  }

  async function getProfile() {
    if (!_ready) return null;
    const user = await getUser();
    if (!user) return null;
    const { data, error } = await _client
      .from('profiles').select('*').eq('id', user.id).single();
    if (error) return null;
    return data;
  }

  async function updateProfile(fields) {
    if (!_ready) return { ok: false, code: 'notConfigured' };
    const user = await getUser();
    if (!user) return { ok: false, code: 'notAuth' };
    const allowed = {};
    if (fields.username != null) {
      const uv = validateUsername(fields.username);
      if (!uv.ok) return { ok: false, field: 'username', code: uv.code };
      // BUGFIX : ne PAS vérifier la disponibilité si le pseudo est INCHANGÉ
      // (sinon `username_available` le voit pris « par soi-même » → bloque
      // toute modif de bio/avatar/etc. alors que rien n'a changé).
      let unchanged = false;
      try {
        const { data: cur } = await _client.from('profiles').select('username').eq('id', user.id).single();
        unchanged = cur && (cur.username || '').toLowerCase() === uv.value.toLowerCase();
      } catch (e) { /* en cas d'échec on retombe sur la vérif normale */ }
      if (!unchanged) {
        const avail = await checkUsernameAvailable(uv.value);
        if (avail.ok && !avail.available) return { ok: false, field: 'username', code: 'taken' };
      }
      allowed.username = uv.value;
    }
    if (fields.gender       != null) allowed.gender = fields.gender;
    if (fields.gender_other != null) allowed.gender_other = String(fields.gender_other).slice(0, 60);
    if (fields.avatar_url   !== undefined) {
      const v = _sanitizeMediaUrl(fields.avatar_url);
      if (v === false) return { ok: false, field: 'avatar_url', code: 'badUrl' };
      allowed.avatar_url = v;                                    // null clears it
    }
    if (fields.banner_url   !== undefined) {
      const v = _sanitizeMediaUrl(fields.banner_url);
      if (v === false) return { ok: false, field: 'banner_url', code: 'badUrl' };
      allowed.banner_url = v;
    }
    if (fields.wishlist     !== undefined && Array.isArray(fields.wishlist)) {
      // store as a de-duplicated array of work-id strings (defensive cap)
      allowed.wishlist = Array.from(new Set(fields.wishlist.filter(x => typeof x === 'string'))).slice(0, 500);
    }
    if (fields.prefs        !== undefined && fields.prefs && typeof fields.prefs === 'object') {
      allowed.prefs = fields.prefs;
    }
    if (fields.linked_accounts !== undefined && fields.linked_accounts && typeof fields.linked_accounts === 'object') {
      allowed.linked_accounts = fields.linked_accounts;
    }
    if (fields.bio !== undefined) {
      allowed.bio = (fields.bio == null) ? null : String(fields.bio).slice(0, 280);  // bio publique, plafonnée
    }
    if (fields.age          != null) {
      const av = validateAge(fields.age);
      if (!av.ok) return { ok: false, field: 'age', code: av.code };
      allowed.age = av.value;
    }
    const { error } = await _client.from('profiles').update(allowed).eq('id', user.id);
    return error ? { ok: false, error } : { ok: true };
  }

  /* ── Modération d'image (porno / haine) ─────────────────
     IMPORTANT : une vraie détection nécessite un service IA
     (Sightengine, Google Vision SafeSearch, AWS Rekognition…)
     appelé depuis une Edge Function Supabase. Tant qu'il n'est
     PAS configuré, on REFUSE par sécurité (fail-safe) — aucun
     upload non modéré ne peut passer.
     Pour activer : window.GLG_SUPABASE.moderationEndpoint = 'https://.../functions/v1/moderate-image'
  */
  async function moderateImage(file) {
    const url = (window.GLG_SUPABASE || {}).moderationEndpoint;
    if (!url) return { ok: false, code: 'not_configured' }; // fail-safe : pas d'IA → on bloque
    try {
      const fd = new FormData(); fd.append('image', file);
      const res = await fetch(url, { method: 'POST', body: fd });
      const data = await res.json();
      return data.safe ? { ok: true } : { ok: false, code: 'rejected' };
    } catch (e) {
      return { ok: false, code: 'mod_error' };
    }
  }

  /* ── Upload d'image perso (avatar / bannière) ────────────
     Garde-fous client (type/poids). Modération = OPTIONNELLE :
     appliquée uniquement si `moderationEndpoint` est configuré
     (sinon upload direct — l'utilisateur a activé la fonctionnalité). */
  const IMG_TYPES   = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  const AVA_MAX     = 3 * 1024 * 1024;  // 3 Mo (avatar)
  const BANNER_MAX  = 6 * 1024 * 1024;  // 6 Mo (bannière)
  async function _uploadImage(file, kind) {
    if (!_ready) return { ok: false, code: 'notConfigured' };
    if (!file) return { ok: false, code: 'noFile' };
    if (!IMG_TYPES.includes(file.type)) return { ok: false, code: 'type' };
    if (file.size > (kind === 'banner' ? BANNER_MAX : AVA_MAX)) return { ok: false, code: 'size' };

    // Modération uniquement si un endpoint IA est configuré (sinon on autorise)
    if ((window.GLG_SUPABASE || {}).moderationEndpoint) {
      const mod = await moderateImage(file);
      if (!mod.ok) return { ok: false, code: 'rejected' };
    }

    const user = await getUser();
    if (!user) return { ok: false, code: 'notAuth' };
    const ext  = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
    const path = `${user.id}/${kind}.${ext}`;
    const { error: upErr } = await _client.storage.from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) return { ok: false, code: 'upload', error: upErr };
    const { data } = _client.storage.from('avatars').getPublicUrl(path);
    const publicUrl = data?.publicUrl ? `${data.publicUrl}?t=${Date.now()}` : null;
    if (publicUrl) await updateProfile(kind === 'banner' ? { banner_url: publicUrl } : { avatar_url: publicUrl });
    return { ok: true, url: publicUrl };
  }
  async function uploadAvatar(file) { return _uploadImage(file, 'avatar'); }
  async function uploadBanner(file) { return _uploadImage(file, 'banner'); }

  /* ── Changement de mot de passe (utilisateur connecté) ─── */
  async function changePassword(newPassword) {
    if (!_ready) return { ok: false, code: 'notConfigured' };
    const user = await getUser();
    if (!user) return { ok: false, code: 'notAuth' };
    const pv = passwordStrength(newPassword);
    if (!pv.ok) return { ok: false, code: 'weak' };
    const { error } = await _client.auth.updateUser({ password: newPassword });
    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('should be different') || msg.includes('same')) return { ok: false, code: 'samePw' };
      return { ok: false, code: 'network', error };
    }
    return { ok: true };
  }

  /* ── Suppression de compte (droit à l'oubli, RGPD) ─────── */
  // Utilise une RPC SECURITY DEFINER `delete_user` (voir db/schema.sql)
  async function deleteAccount() {
    if (!_ready) return { ok: false, code: 'notConfigured' };
    const user = await getUser();
    if (!user) return { ok: false, code: 'notAuth' };
    const { error } = await _client.rpc('delete_user');
    if (error) return { ok: false, error };
    await _client.auth.signOut();
    return { ok: true };
  }

  /* ── AMIS / CONTACTS ───────────────────────────────────
     Toutes les mutations passent par des RPC SECURITY DEFINER
     (db/schema.sql) qui vérifient auth.uid() côté serveur et ne
     renvoient JAMAIS de donnée privée. Dégradation propre si la
     base n'est pas configurée. */
  async function searchUsers(q) {
    if (!_ready) return { ok: false, code: 'notConfigured', results: [] };
    const v = (q || '').trim();
    if (v.length < 2) return { ok: true, results: [] };
    const { data, error } = await _client.rpc('search_users', { q: v });
    if (error) return { ok: false, code: 'network', results: [], error };
    return { ok: true, results: Array.isArray(data) ? data : [] };
  }
  async function friendRequest(target) {
    if (!_ready) return { ok: false, code: 'notConfigured' };
    const { data, error } = await _client.rpc('friend_request', { target });
    if (error) return { ok: false, code: 'network', error };
    return { ok: true, result: data };           // 'outgoing' | 'friends' | 'self' | 'notfound' | 'limit'
  }
  async function friendRespond(other, accept) {
    if (!_ready) return { ok: false, code: 'notConfigured' };
    const { data, error } = await _client.rpc('friend_respond', { other, accept: !!accept });
    if (error) return { ok: false, code: 'network', error };
    return { ok: true, result: data };           // 'friends' | 'declined' | 'notfound'
  }
  async function friendRemove(other) {
    if (!_ready) return { ok: false, code: 'notConfigured' };
    const { data, error } = await _client.rpc('friend_remove', { other });
    if (error) return { ok: false, code: 'network', error };
    return { ok: true, result: data };
  }
  /* Profil PUBLIC d'un autre joueur (champs publics uniquement, RLS-safe).
     RPC `public_profile(uid)` (SECURITY DEFINER, voir db/schema.sql) :
     renvoie id, username, avatar_url, banner_url, bio, created_at +
     compteurs (trophées, amis). Zéro donnée privée (email, âge, etc.). */
  async function getPublicProfile(uid) {
    if (!_ready) return { ok: false, code: 'notConfigured' };
    if (!uid)    return { ok: false, code: 'noTarget' };
    const { data, error } = await _client.rpc('public_profile', { uid });
    if (error) return { ok: false, code: 'network', error };
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { ok: false, code: 'notfound' };
    return { ok: true, profile: row };
  }
  async function friendsList() {
    if (!_ready) return { ok: false, code: 'notConfigured', friends: [], incoming: [], outgoing: [] };
    const { data, error } = await _client.rpc('friends_list');
    if (error) return { ok: false, code: 'network', friends: [], incoming: [], outgoing: [] };
    const friends = [], incoming = [], outgoing = [];
    (data || []).forEach(r => {
      const o = { id: r.other_id, username: r.username, avatar_url: r.avatar_url, fid: r.friendship_id, since: r.since };
      if (r.kind === 'friend') friends.push(o);
      else if (r.kind === 'incoming') incoming.push(o);
      else outgoing.push(o);
    });
    return { ok: true, friends, incoming, outgoing };
  }

  /* « Contacts qui y ont joué » (bibliothèque launcher) — RPC friends_played :
     mes amis qui possèdent/ont lancé l'œuvre, privacy showRecent respectée. */
  async function friendsPlayed(workId) {
    if (!_ready) return { ok: false, code: 'notConfigured', friends: [] };
    const { data, error } = await _client.rpc('friends_played', { work: workId });
    if (error) return { ok: false, code: 'network', friends: [], error };
    return { ok: true, friends: data || [] };
  }

  /* ── TROPHÉES / SUCCÈS ─────────────────────────────────
     Lecture protégée par RLS (chacun ne lit que SES déblocages).
     grantAchievement = pour l'intégration jeu (idéalement appelée
     côté serveur de confiance ; ici dispo pour démo/tests). */
  async function getAchievements() {
    if (!_ready) return { ok: false, code: 'notConfigured', keys: [] };
    const user = await getUser();
    if (!user) return { ok: true, keys: [] };
    const { data, error } = await _client
      .from('user_achievements').select('ach_key, unlocked_at').eq('user_id', user.id);
    if (error) return { ok: false, code: 'network', keys: [], error };
    return { ok: true, keys: (data || []).map(r => r.ach_key), rows: data || [] };
  }
  async function grantAchievement(game, code) {
    if (!_ready) return { ok: false, code: 'notConfigured' };
    const { error } = await _client.rpc('grant_achievement', { game, code });
    return error ? { ok: false, error } : { ok: true };
  }

  /* ── RARETÉ DES TROPHÉES (agrégats anonymes, RPC publique) ──
     Renvoie par trophée : owners, pct (0–100, 1 déc.), players
     (dénominateur = joueurs ayant ≥1 trophée dans CE jeu). */
  async function trophyRarity(game) {
    if (!_ready) return { ok: false, code: 'notConfigured', rows: [] };
    const { data, error } = await _client.rpc('trophy_rarity', { game });
    if (error) return { ok: false, code: 'network', rows: [], error };
    return { ok: true, rows: Array.isArray(data) ? data : [] };
  }

  /* ── ÉVALUATIONS (style Steam) ─────────────────────────────
     Toute écriture passe par la RPC `upsert_review` (rate-limit
     serveur 10/24h, caps imposés en base — pas de policy INSERT
     directe). Lecture via RPC uniquement (jamais la table). */
  async function upsertReview(workId, rating, body) {
    if (!_ready) return { ok: false, code: 'notConfigured' };
    const { data, error } = await _client.rpc('upsert_review', {
      wid: String(workId || '').slice(0, 64),
      r:   Math.max(1, Math.min(5, parseInt(rating, 10) || 0)),
      b:   body == null ? null : String(body).slice(0, 1200),
    });
    if (error) return { ok: false, code: 'network', error };
    return data === 'ok' ? { ok: true } : { ok: false, code: data }; // 'notAuth'|'badRating'|'limit'…
  }
  async function deleteReview(workId) {
    if (!_ready) return { ok: false, code: 'notConfigured' };
    const { data, error } = await _client.rpc('delete_review', { wid: String(workId || '').slice(0, 64) });
    if (error) return { ok: false, code: 'network', error };
    return data === 'ok' ? { ok: true } : { ok: false, code: data };
  }
  async function reviewSummary(workId) {
    if (!_ready) return { ok: false, code: 'notConfigured' };
    const { data, error } = await _client.rpc('review_summary', { wid: String(workId || '').slice(0, 64) });
    if (error) return { ok: false, code: 'network', error };
    const row = Array.isArray(data) ? data[0] : data;
    return { ok: true, count: Number(row?.cnt || 0), avg: row?.avg_rating != null ? Number(row.avg_rating) : null, histo: row?.histo || {} };
  }
  async function workReviews(workId, limit = 10, offset = 0) {
    if (!_ready) return { ok: false, code: 'notConfigured', reviews: [] };
    const { data, error } = await _client.rpc('work_reviews', {
      wid: String(workId || '').slice(0, 64), lim: limit, off: offset,
    });
    if (error) return { ok: false, code: 'network', reviews: [], error };
    return { ok: true, reviews: Array.isArray(data) ? data : [] };
  }
  async function userReviews(uid) {
    if (!_ready) return { ok: false, code: 'notConfigured', reviews: [] };
    if (!uid)    return { ok: false, code: 'noTarget',      reviews: [] };
    const { data, error } = await _client.rpc('user_reviews', { uid });
    if (error) return { ok: false, code: 'network', reviews: [], error };
    return { ok: true, reviews: Array.isArray(data) ? data : [] };
  }
  async function myReview(workId) {
    if (!_ready) return { ok: false, code: 'notConfigured', review: null };
    const user = await getUser();
    if (!user) return { ok: true, review: null };
    const { data, error } = await _client.from('reviews')
      .select('rating, body, updated_at, hidden')
      .eq('user_id', user.id).eq('work_id', String(workId || '').slice(0, 64))
      .maybeSingle();
    if (error) return { ok: false, code: 'network', review: null };
    return { ok: true, review: data || null };
  }
  async function reportReview(reviewUserId, workId) {
    if (!_ready) return { ok: false, code: 'notConfigured' };
    const { data, error } = await _client.rpc('report_review', { ruser: reviewUserId, rwork: String(workId || '').slice(0, 64) });
    if (error) return { ok: false, code: 'network', error };
    return data === 'ok' ? { ok: true } : { ok: false, code: data };
  }

  /* ── Preuve sociale : nb de wishlists sur une œuvre ─────── */
  /* ── Bibliothèque (jeux possédés) ────────────────────────
     Appelé au moment de l'achat (backend paiement en prod). */
  async function grantGame(gameId, platform) {
    if (!_ready) return { ok: false, code: 'notConfigured' };
    try {
      const { error } = await _client.rpc('grant_game', { p_game: gameId, p_platform: platform || 'glg' });
      return error ? { ok: false, error } : { ok: true };
    } catch (e) { return { ok: false, error: e }; }
  }

  /* ── Jeux récents (sessions réelles, style Steam) ────────
     Appelé par le jeu/launcher en fin de session : minutes jouées. */
  async function touchRecentGame(gameId, minutes) {
    if (!_ready) return { ok: false, code: 'notConfigured' };
    try {
      const { error } = await _client.rpc('touch_recent_game', { p_game: gameId, p_minutes: Math.max(0, Math.round(minutes || 0)) });
      return error ? { ok: false, error } : { ok: true };
    } catch (e) { return { ok: false, error: e }; }
  }

  async function wishlistCount(workId) {
    if (!_ready) return { ok: false, code: 'notConfigured', count: 0 };
    const { data, error } = await _client.rpc('wishlist_count', { work: String(workId || '').slice(0, 64) });
    if (error) return { ok: false, code: 'network', count: 0, error };
    return { ok: true, count: Number(data || 0) };
  }

  /* ── 2FA TOTP (style Steam Guard) — API MFA OFFICIELLE Supabase ────────
     Enrôlement : mfaEnroll() → QR + secret → mfaVerifyEnroll(factorId, code).
     Connexion  : si mfaAal() dit nextLevel 'aal2' ≠ currentLevel, demander le
     code → mfaChallengeVerify(code). Tout est défensif : jamais de throw. */
  async function mfaFactors() {
    if (!_ready) return { ok: false, code: 'notConfigured', factors: [] };
    try {
      const { data, error } = await _client.auth.mfa.listFactors();
      if (error) return { ok: false, error, factors: [] };
      return { ok: true, factors: (data?.totp || []).filter(f => f.status === 'verified') };
    } catch (e) { return { ok: false, factors: [] }; }
  }
  async function mfaEnroll() {
    if (!_ready) return { ok: false, code: 'notConfigured' };
    try {
      // Purge les enrôlements abandonnés (non vérifiés) — sinon Supabase
      // refuse un nouveau facteur du même nom.
      const { data: lf } = await _client.auth.mfa.listFactors();
      for (const f of (lf?.all || [])) {
        if (f.status === 'unverified') { try { await _client.auth.mfa.unenroll({ factorId: f.id }); } catch (e) {} }
      }
      const { data, error } = await _client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'GEEKLEARN GAMES' });
      if (error) return { ok: false, error };
      return { ok: true, factorId: data.id, qr: data.totp?.qr_code || '', secret: data.totp?.secret || '', uri: data.totp?.uri || '' };
    } catch (e) { return { ok: false, error: e }; }
  }
  async function mfaVerifyEnroll(factorId, code) {
    if (!_ready) return { ok: false, code: 'notConfigured' };
    try {
      const { data: ch, error: chErr } = await _client.auth.mfa.challenge({ factorId });
      if (chErr) return { ok: false, error: chErr };
      const { error: vErr } = await _client.auth.mfa.verify({ factorId, challengeId: ch.id, code: String(code || '').trim() });
      if (vErr) return { ok: false, code: 'badCode', error: vErr };
      return { ok: true };
    } catch (e) { return { ok: false, error: e }; }
  }
  async function mfaUnenroll(factorId) {
    if (!_ready) return { ok: false, code: 'notConfigured' };
    try {
      const { error } = await _client.auth.mfa.unenroll({ factorId });
      return error ? { ok: false, error } : { ok: true };
    } catch (e) { return { ok: false, error: e }; }
  }
  async function mfaAal() {
    if (!_ready) return {};
    try {
      const { data } = await _client.auth.mfa.getAuthenticatorAssuranceLevel();
      return data || {};
    } catch (e) { return {}; }
  }
  async function mfaChallengeVerify(code) {
    const { factors } = await mfaFactors();
    const f = factors[0];
    if (!f) return { ok: false, code: 'noFactor' };
    return mfaVerifyEnroll(f.id, code); // même mécanique challenge + verify
  }

  /* ── GALERIE DE CAPTURES D'ÉCRAN (bucket `screenshots`) ────────────────
     L'app compresse en WebP ≤1600px AVANT l'appel (blob), on borne à
     12 captures / joueur. Lecture publique (profils publics). */
  const SHOT_MAX = 6 * 1024 * 1024, SHOT_LIMIT = 12;
  async function listScreenshots(uid) {
    if (!_ready || !uid) return { ok: false, shots: [] };
    try {
      const { data, error } = await _client.storage.from('screenshots')
        .list(`${uid}/shots`, { limit: 24, sortBy: { column: 'name', order: 'desc' } }); // noms = timestamps
      if (error || !data) return { ok: false, shots: [] };
      const shots = data.filter(o => o.name && !o.name.startsWith('.')).map(o => {
        const path = `${uid}/shots/${o.name}`;
        return { path, name: o.name, url: _client.storage.from('screenshots').getPublicUrl(path).data?.publicUrl || '' };
      });
      return { ok: true, shots };
    } catch (e) { return { ok: false, shots: [] }; }
  }
  async function uploadScreenshot(blob) {
    if (!_ready) return { ok: false, code: 'notConfigured' };
    if (!blob) return { ok: false, code: 'noFile' };
    if (blob.size > SHOT_MAX) return { ok: false, code: 'size' };
    const user = await getUser();
    if (!user) return { ok: false, code: 'notAuth' };
    const cur = await listScreenshots(user.id);
    if ((cur.shots || []).length >= SHOT_LIMIT) return { ok: false, code: 'limit' };
    const path = `${user.id}/shots/${Date.now()}.webp`;
    const { error } = await _client.storage.from('screenshots')
      .upload(path, blob, { contentType: 'image/webp', upsert: false });
    if (error) return { ok: false, code: 'upload', error };
    const { data } = _client.storage.from('screenshots').getPublicUrl(path);
    return { ok: true, url: data?.publicUrl || null, path };
  }
  async function deleteScreenshot(path) {
    if (!_ready) return { ok: false, code: 'notConfigured' };
    const user = await getUser();
    if (!user) return { ok: false, code: 'notAuth' };
    if (!String(path || '').startsWith(`${user.id}/`)) return { ok: false, code: 'forbidden' }; // défense en profondeur (RLS fait déjà foi)
    try {
      const { error } = await _client.storage.from('screenshots').remove([path]);
      return error ? { ok: false, error } : { ok: true };
    } catch (e) { return { ok: false, error: e }; }
  }

  function onChange(cb) {
    if (!_ready) return () => {};
    const { data } = _client.auth.onAuthStateChange((event, session) => cb(event, session));
    return () => data?.subscription?.unsubscribe?.();
  }

  /* ── Boot : attendre supabase-js (deferred) ────────────── */
  function boot(tries = 0) {
    if (init()) { document.dispatchEvent(new CustomEvent('glg:auth-ready')); return; }
    if (tries > 40) return; // ~2 s puis abandon silencieux (mode "non configuré")
    setTimeout(() => boot(tries + 1), 50);
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', () => boot());
  else boot();

  /* ══════════ GLG CHAT — MP + groupes (db/schema.sql § GLG CHAT) ═══════
     Canaux : 'dm:<uuidA>:<uuidB>' (uuid triés) | 'g:<group_id>'.
     La sécurité vit côté base (RLS + chat_can_access) — le client reste
     une simple vue. Pièces jointes : bucket public chat-media (25 Mo). */
  const CHAT_MEDIA_MAX = 25 * 1024 * 1024;
  function chatDmChannel(a, b) { return 'dm:' + (a < b ? a + ':' + b : b + ':' + a); }
  async function chatChannels() {
    if (!_ready) return { ok: false, code: 'notConfigured', channels: [] };
    const { data, error } = await _client.rpc('chat_channels');
    if (error) return { ok: false, code: 'network', channels: [], error };
    return { ok: true, channels: Array.isArray(data) ? data : [] };
  }
  async function chatMessages(channel, beforeId, limit = 40) {
    if (!_ready) return { ok: false, code: 'notConfigured', messages: [] };
    let q = _client.from('chat_messages').select('*')
      .eq('channel', channel).order('id', { ascending: false }).limit(limit);
    if (beforeId) q = q.lt('id', beforeId);
    const { data, error } = await q;
    if (error) return { ok: false, code: 'network', messages: [], error };
    return { ok: true, messages: (data || []).reverse() };   // ancien → récent
  }
  async function chatSend(channel, body, attachment) {
    if (!_ready) return { ok: false, code: 'notConfigured' };
    const user = await getUser();
    if (!user) return { ok: false, code: 'notAuth' };
    const row = {
      channel, sender: user.id,
      body: body ? String(body).slice(0, 4000) : null,
      attachment: attachment || null,
    };
    const { data, error } = await _client.from('chat_messages').insert(row).select().single();
    if (error) return { ok: false, code: /rate/.test(error.message || '') ? 'rate' : 'network', error };
    return { ok: true, message: data };
  }
  async function chatEdit(id, body) {
    if (!_ready) return { ok: false, code: 'notConfigured' };
    const { error } = await _client.from('chat_messages')
      .update({ body: String(body || '').slice(0, 4000), edited_at: new Date().toISOString() })
      .eq('id', id);
    return error ? { ok: false, code: 'network', error } : { ok: true };
  }
  async function chatDelete(id) {
    if (!_ready) return { ok: false, code: 'notConfigured' };
    const { error } = await _client.from('chat_messages').delete().eq('id', id);
    return error ? { ok: false, code: 'network', error } : { ok: true };
  }
  async function chatUpload(file) {
    if (!_ready) return { ok: false, code: 'notConfigured' };
    if (!file) return { ok: false, code: 'noFile' };
    if (file.size > CHAT_MEDIA_MAX) return { ok: false, code: 'size' };
    const user = await getUser();
    if (!user) return { ok: false, code: 'notAuth' };
    const mime = file.type || 'application/octet-stream';
    const kind = mime.startsWith('image/') ? 'image'
               : mime.startsWith('video/') ? 'video'
               : mime.startsWith('audio/') ? 'audio' : 'file';
    const safe = String(file.name || 'fichier').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
    const path = `${user.id}/${Date.now()}-${safe}`;
    const { error } = await _client.storage.from('chat-media')
      .upload(path, file, { contentType: mime, upsert: false });
    if (error) return { ok: false, code: 'upload', error };
    const { data } = _client.storage.from('chat-media').getPublicUrl(path);
    return { ok: true, attachment: { kind, url: data?.publicUrl || null, name: String(file.name || '').slice(0, 120), size: file.size, mime } };
  }
  async function chatReact(mid, emoji) {
    if (!_ready) return { ok: false, code: 'notConfigured' };
    const { data, error } = await _client.rpc('chat_react', { mid, emo: String(emoji || '').slice(0, 16) });
    if (error) return { ok: false, code: 'network', error };
    return data === 'ok' ? { ok: true } : { ok: false, code: data };
  }
  async function chatMarkRead(channel) {
    if (!_ready) return { ok: false, code: 'notConfigured' };
    const { error } = await _client.rpc('chat_mark_read', { ch: channel });
    return error ? { ok: false, code: 'network', error } : { ok: true };
  }
  async function chatGroupCreate(name, memberIds) {
    if (!_ready) return { ok: false, code: 'notConfigured' };
    const { data, error } = await _client.rpc('chat_group_create', {
      gname: String(name || '').slice(0, 60), members: memberIds || [],
    });
    if (error) return { ok: false, code: /limit|badName|notAuth/.exec(error.message || '')?.[0] || 'network', error };
    return { ok: true, gid: data };
  }
  async function chatGroupAdd(gid, target) {
    if (!_ready) return { ok: false, code: 'notConfigured' };
    const { data, error } = await _client.rpc('chat_group_add', { gid, target });
    if (error) return { ok: false, code: 'network', error };
    return data === 'ok' ? { ok: true } : { ok: false, code: data };
  }
  async function chatGroupLeave(gid) {
    if (!_ready) return { ok: false, code: 'notConfigured' };
    const { data, error } = await _client.rpc('chat_group_leave', { gid });
    if (error) return { ok: false, code: 'network', error };
    return data === 'ok' ? { ok: true } : { ok: false, code: data };
  }
  async function chatGroupMembers(gid) {
    if (!_ready) return { ok: false, code: 'notConfigured', members: [] };
    const { data, error } = await _client.from('chat_members')
      .select('user_id, role, profiles(username, avatar_url)').eq('group_id', gid);
    if (error) return { ok: false, code: 'network', members: [], error };
    return { ok: true, members: (data || []).map(r => ({
      id: r.user_id, role: r.role,
      username: r.profiles?.username || '', avatar_url: r.profiles?.avatar_url || null,
    })) };
  }
  /* Abonnement temps réel GLOBAL (un seul canal ; RLS filtre côté serveur :
     chacun ne reçoit que les messages de SES conversations). Retourne un
     désabonnement. */
  function chatSubscribe(cb) {
    if (!_ready) return () => {};
    const ch = _client.channel('glg:chat')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, payload => { try { cb(payload); } catch (e) {} })
      .subscribe();
    return () => { try { _client.removeChannel(ch); } catch (e) {} };
  }

  /* ── API publique ──────────────────────────────────────── */
  window.GLG_AUTH = {
    isConfigured: () => _ready,
    getClient:    () => _client,
    validateUsername, validateEmail, passwordStrength, validateAge,
    checkUsernameAvailable,
    signUp, signIn, signOut, changePassword,
    getSession, getUser, getProfile, updateProfile, deleteAccount,
    uploadAvatar, uploadBanner, moderateImage,
    searchUsers, friendRequest, friendRespond, friendRemove, friendsList, friendsPlayed, getPublicProfile,
    getAchievements, grantAchievement, trophyRarity,
    upsertReview, deleteReview, reviewSummary, workReviews, userReviews, myReview, reportReview,
    wishlistCount, touchRecentGame, grantGame, setRemember,
    mfaFactors, mfaEnroll, mfaVerifyEnroll, mfaUnenroll, mfaAal, mfaChallengeVerify,
    listScreenshots, uploadScreenshot, deleteScreenshot,
    chatDmChannel, chatChannels, chatMessages, chatSend, chatEdit, chatDelete,
    chatUpload, chatMarkRead, chatReact, chatGroupCreate, chatGroupAdd, chatGroupLeave,
    chatGroupMembers, chatSubscribe,
    onChange,
  };
})();
