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
│  ├─ protection.js        # Sécurité légère (honeypot + rate-limit form, noopener)
│  ├─ auth.js              # Comptes utilisateurs (Supabase)
│  ├─ config.js            # ⚙️ Clés Supabase (À REMPLIR — voir ci-dessous)
│  └─ vendor/              # Librairies auto-hébergées (gsap, scrolltrigger, lenis, supabase)
├─ db/
│  └─ schema.sql           # Schéma de la base Supabase (à exécuter 1 fois)
├─ tools/
│  └─ gen-keyart.py        # Génère les key-art procéduraux (placeholders premium)
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

### Architecture CSS (3 couches — important à comprendre)
Le style est organisé en **3 couches chargées dans cet ordre** (la dernière gagne) :

1. **`css/main.css`** — base : design tokens (`:root`), reset, layout, composants de fond.
2. **`css/glg-premium.css`** — couche « premium » : surcharges visuelles (beaucoup de
   `!important` historiques). Ne pas y ajouter de nouveautés.
3. **`css/glg-aaa.css`** — **couche de la refonte 2026** : c'est **ICI qu'on ajoute les
   nouveaux styles** (hero rotatif, hover teinté, comptes, accessibilité, etc.).
   Elle est organisée en sections numérotées `§1…§15` faciles à retrouver.

👉 **Pour modifier le style** : cherche d'abord dans `glg-aaa.css` ; ajoute tes nouvelles
règles à la fin, dans une nouvelle section `§N` commentée. Évite de toucher aux `!important`
de `glg-premium.css` sans tester (risque de régression).

> Note maintenance : une fusion complète des 3 couches + suppression des `!important`
> est volontairement **différée** (risque de régressions visuelles). La structure actuelle
> reste claire grâce à la numérotation des sections.

---

## ✏️ Modifier le contenu

- **Ajouter / éditer un film ou un jeu** → `js/data.js` (tableaux `FILMS` / `GAMES`).
  Chaque œuvre a : `id`, `title`, `tagline`, `cover`, `screenshots[]`, `tint`
  (sa couleur d'accent), `i18n` (traductions par langue), etc.
- **Traductions de l'interface** → `js/data.js` → objet `I18N`.
- **Équipe** → `js/data.js` → `TEAM`. **Récompenses** → `AWARDS`.
- **Images** → déposer dans le bon sous-dossier `assets/img/...` puis référencer le chemin.

### 🎨 Visuels d'œuvres (key-art) — placeholders premium & vrai art
Les covers/screenshots sont des **key-art procéduraux** générés par `tools/gen-keyart.py`
(atmosphère cinématique monochrome + couleur d'accent de l'œuvre). Pour les régénérer :
```bash
python tools/gen-keyart.py
```
**Remplacer par du vrai art** : dépose ton image au **même chemin** (ex. `assets/img/works/games/hush.svg`
ou pointe `cover`/`screenshots` vers un `.png/.jpg` dans `js/data.js`). Puis **bumpe `ASSET_VER`**
en haut de `js/app.js` (helper `av()`) : tous les visuels se rafraîchissent côté navigateur,
sans renommer un seul fichier.

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
