/* ═══════════════════════════════════════════════════════════
   GEEKLEARN GAMES — config.js
   ───────────────────────────────────────────────────────────
   Configuration Supabase pour le système de comptes.

   ▶ COMMENT REMPLIR (une seule fois) :
     1. Va sur https://supabase.com → crée un projet (gratuit).
     2. Project Settings → API.
     3. Copie "Project URL"      → champ  url
        Copie "anon public" key  → champ  anonKey
        (La clé "anon/public" est SANS DANGER côté navigateur :
         la sécurité réelle est assurée par les règles RLS de la base.)
     4. NE JAMAIS mettre ici la clé "service_role" (secrète).

   Tant que ces champs sont vides, le site fonctionne normalement
   mais les fonctions de compte sont désactivées proprement.
   ═══════════════════════════════════════════════════════════ */
window.GLG_SUPABASE = {
  url:     'https://rjtccuikevoeqgbssjnx.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqdGNjdWlrZXZvZXFnYnNzam54Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1OTA0MTEsImV4cCI6MjA5NjE2NjQxMX0.dBZ8ujG5ITyqG_AhvMB3lOtd6Sd-NukcoCE9NZgVc00',

  // (optionnel) Endpoint de modération d'image — à remplir plus tard pour activer
  // l'upload d'avatar personnalisé en sécurité (ex : Edge Function Supabase).
  moderationEndpoint: '',
};
