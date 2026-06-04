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

  /* ── Initialise le client si configuré ─────────────────── */
  function init() {
    const cfg = window.GLG_SUPABASE || {};
    const hasLib = typeof window.supabase !== 'undefined' &&
                   typeof window.supabase.createClient === 'function';
    if (!hasLib) return false;
    if (!cfg.url || !cfg.anonKey) return false; // pas encore configuré → OK
    try {
      _client = window.supabase.createClient(cfg.url, cfg.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
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
  async function signUp({ email, password, username, gender, genderOther, age }) {
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
        },
      },
    });
    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('already') || msg.includes('registered') || error.status === 422)
        return { ok: false, field: 'email', code: 'emailTaken' };
      return { ok: false, code: 'signupFailed', error };
    }
    return { ok: true, data, needsConfirm: !data.session };
  }

  /* ── Connexion (par email) ─────────────────────────────── */
  async function signIn({ email, password }) {
    if (!_ready) return { ok: false, code: 'notConfigured' };
    const ev = validateEmail(email); if (!ev.ok) return { ok: false, field: 'email', code: ev.code };
    const { data, error } = await _client.auth.signInWithPassword({ email: ev.value, password });
    if (error) return { ok: false, code: 'badCredentials', error };
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
      const avail = await checkUsernameAvailable(uv.value);
      if (avail.ok && !avail.available) return { ok: false, field: 'username', code: 'taken' };
      allowed.username = uv.value;
    }
    if (fields.gender       != null) allowed.gender = fields.gender;
    if (fields.gender_other != null) allowed.gender_other = String(fields.gender_other).slice(0, 60);
    if (fields.avatar_url   !== undefined) allowed.avatar_url = fields.avatar_url; // preset path or storage URL
    if (fields.banner_url   !== undefined) allowed.banner_url = fields.banner_url;
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

  /* ── Upload d'un avatar personnalisé ─────────────────────
     Garde-fous client (type/poids/dimensions) + modération
     obligatoire avant stockage. */
  const AVA_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
  const AVA_MAX   = 2 * 1024 * 1024; // 2 Mo
  async function uploadAvatar(file) {
    if (!_ready) return { ok: false, code: 'notConfigured' };
    if (!file) return { ok: false, code: 'noFile' };
    if (!AVA_TYPES.includes(file.type)) return { ok: false, code: 'type' };
    if (file.size > AVA_MAX) return { ok: false, code: 'size' };

    // Modération obligatoire (fail-safe)
    const mod = await moderateImage(file);
    if (!mod.ok) return { ok: false, code: mod.code === 'not_configured' ? 'mod_off' : 'rejected' };

    const user = await getUser();
    if (!user) return { ok: false, code: 'notAuth' };
    const ext  = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
    const path = `${user.id}/avatar.${ext}`;
    const { error: upErr } = await _client.storage.from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) return { ok: false, code: 'upload', error: upErr };
    const { data } = _client.storage.from('avatars').getPublicUrl(path);
    const publicUrl = data?.publicUrl ? `${data.publicUrl}?t=${Date.now()}` : null;
    if (publicUrl) await updateProfile({ avatar_url: publicUrl });
    return { ok: true, url: publicUrl };
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

  /* ── API publique ──────────────────────────────────────── */
  window.GLG_AUTH = {
    isConfigured: () => _ready,
    getClient:    () => _client,
    validateUsername, validateEmail, passwordStrength, validateAge,
    checkUsernameAvailable,
    signUp, signIn, signOut,
    getSession, getUser, getProfile, updateProfile, deleteAccount,
    uploadAvatar, moderateImage,
    onChange,
  };
})();
