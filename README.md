# GEEKLEARN GAMES — Site officiel

Site vitrine du studio **GEEKLEARN GAMES** (films interactifs & jeux vidéo).
Site **statique** : HTML + CSS + JavaScript pur, **sans étape de build**.
Pour le lancer, il suffit d'un serveur statique — aucun `npm install` requis.

---

## 🚀 Lancer le site en local

Choisis **une** méthode :

```bash
# Option A — Python (souvent déjà installé)
python -m http.server 5500

# Option B — Node (npx, sans installation globale)
npx serve -l 5500 .
```

Puis ouvre <http://localhost:5500>.

> Ouvrir `index.html` directement (double-clic, `file://`) fonctionne en partie,
> mais un petit serveur local est recommandé (chemins relatifs, polices, comptes).

---

## 📁 Arborescence

```
GLG8/
├─ index.html              # Page unique (toutes les "pages" sont des sections)
├─ site.webmanifest        # PWA / icônes
├─ robots.txt · sitemap.xml
├─ css/
│  ├─ main.css             # Styles de base (design tokens dans :root)
│  └─ glg-premium.css      # Couche visuelle premium (surcharge main.css)
├─ js/
│  ├─ data.js              # CONTENU : films, jeux, équipe, traductions (I18N)
│  ├─ app.js               # Logique : rendu, navigation, carrousels, gate langue
│  ├─ glg-animations.js    # GSAP + ScrollTrigger + Lenis (animations/scroll)
│  ├─ protection.js        # Sécurité légère (anti-devtools, anti-spam form)
│  ├─ auth.js              # Comptes utilisateurs (Supabase)
│  ├─ config.js            # ⚙️ Clés Supabase (À REMPLIR — voir ci-dessous)
│  └─ vendor/              # Librairies auto-hébergées (gsap, scrolltrigger, lenis, supabase)
├─ db/
│  └─ schema.sql           # Schéma de la base Supabase (à exécuter 1 fois)
└─ assets/
   ├─ icons/               # Favicons / icônes PWA
   └─ img/
      ├─ brand/            # Logo, mark, motif
      ├─ backgrounds/      # Fonds
      ├─ flags/            # Drapeaux du sélecteur de langue
      ├─ social/           # Icônes réseaux sociaux
      ├─ stores/           # Logos plateformes (Steam, Epic, PS, Xbox, Switch)
      ├─ team/             # Photos de l'équipe
      └─ works/            # Visuels des œuvres
         ├─ films/
         └─ games/
```

### Convention de nommage
Tous les fichiers/dossiers sont en **kebab-case**, **sans espaces, accents ni
parenthèses** (compatibilité serveurs + URLs propres).

---

## ✏️ Modifier le contenu

- **Ajouter / éditer un film ou un jeu** → `js/data.js` (tableaux `FILMS` / `GAMES`).
  Chaque œuvre a : `id`, `title`, `tagline`, `cover`, `screenshots[]`, `tint`
  (sa couleur d'accent), `i18n` (traductions par langue), etc.
- **Traductions de l'interface** → `js/data.js` → objet `I18N`.
- **Équipe** → `js/data.js` → `TEAM`. **Récompenses** → `AWARDS`.
- **Images** → déposer dans le bon sous-dossier `assets/img/...` puis référencer le chemin.

---

## 🔐 Comptes utilisateurs (Supabase)

Le système de comptes utilise **Supabase** (base Postgres + authentification gérée).

### Mise en route (une seule fois)
1. Crée un compte sur <https://supabase.com> et un nouveau projet (offre gratuite).
2. **SQL Editor** → colle et exécute le contenu de `db/schema.sql`.
3. **Project Settings → API** → copie :
   - *Project URL* → `js/config.js` → `url`
   - *anon public key* → `js/config.js` → `anonKey`
4. Recharge le site : les fonctions de compte s'activent automatiquement.

> La clé **anon/public** est sans danger côté navigateur : la sécurité réelle est
> assurée par les règles **RLS** (Row Level Security) définies dans `schema.sql`.
> Ne jamais exposer la clé `service_role`.

---

## 📨 Formulaire de contact

Envoi d'e-mails réel via **FormSubmit.co** vers `geeklearngames.studio@gmail.com`.
⚠️ **Première utilisation** : le tout premier envoi déclenche un e-mail
d'activation FormSubmit — il faut cliquer le lien **une fois** pour activer.

---

## 🌐 Déploiement

Site statique : déployable tel quel (Cloudflare Pages, Netlify, GitHub Pages, etc.).
Aucune compilation. Les comptes Supabase fonctionnent quel que soit l'hébergeur.
