# GEEKLEARN GAMES — Launcher de bureau (Tauri v2)

Le launcher est un **shell natif Windows/macOS** qui affiche le site
(`https://www.geeklearngames.com`) dans une fenêtre dédiée. Le site détecte
qu'il tourne « in-app » (user-agent `GLGLauncher`) et adapte son comportement :
pas de service worker, pas de modale de passage de relais, section « Le
launcher arrive » masquée, deep-links `glg://` reçus nativement.

**Pourquoi Tauri v2 (et pas Electron)** : binaire ~5-10 Mo (vs ~120 Mo),
webview système (WebView2/WKWebView), **updater signé intégré** (minisign),
plugin deep-link officiel pour `glg://`, instance unique. Le contenu reste le
site : chaque déploiement web met à jour le launcher instantanément, l'updater
ne sert qu'au shell lui-même.

---

## 1. Prérequis (une fois par machine)

| Outil | Windows | macOS |
|---|---|---|
| Rust | https://rustup.rs (rustup-init.exe) | `curl https://sh.rustup.rs -sSf \| sh` |
| CLI Tauri | `cargo install tauri-cli --version "^2"` | idem |
| Webview | WebView2 (déjà présent sur Win 10/11) | — (WKWebView natif) |
| Build tools | Visual Studio Build Tools (C++), demandé par rustup | Xcode Command Line Tools |

## 2. Icônes (une fois)

```bash
cd launcher/src-tauri
cargo tauri icon ../../assets/icons/web-app-manifest-512x512.png
```

## 3. Clés de signature des mises à jour (une fois, PRÉCIEUSES)

```bash
cargo tauri signer generate -w ~/.tauri/glg-launcher.key
```

- La commande affiche une **clé publique** → colle-la dans
  `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`.
- La **clé privée** (`~/.tauri/glg-launcher.key`) ne quitte JAMAIS ta machine
  (et un gestionnaire de mots de passe). Quiconque la possède peut signer des
  mises à jour installées automatiquement chez tous les joueurs.
- Renseigne aussi `plugins.updater.endpoints` avec ton repo GitHub :
  `https://github.com/<compte>/<repo>/releases/latest/download/latest.json`.

## 4. Développement

```bash
cd launcher/src-tauri
cargo tauri dev
```

En dev, `glg://` est enregistré automatiquement (`register_all()` dans
lib.rs). Teste depuis un navigateur : clique « Jouer » sur le site → le
launcher se focalise et sélectionne le jeu dans la Bibliothèque.

## 5. Build de production (installeurs)

```bash
# Sur Windows → .exe NSIS ; sur macOS → .dmg
set TAURI_SIGNING_PRIVATE_KEY=<contenu de la clé privée>     # PowerShell: $env:TAURI_SIGNING_PRIVATE_KEY="..."
set TAURI_SIGNING_PRIVATE_KEY_PASSWORD=<mot de passe choisi>
cargo tauri build
```

Artefacts dans `src-tauri/target/release/bundle/` :
- `nsis/GEEKLEARN GAMES_1.0.0_x64-setup.exe` (+ `.sig`)
- `dmg/GEEKLEARN GAMES_1.0.0_aarch64.dmg` (+ `.sig`)
- Les fichiers updater (`createUpdaterArtifacts`) sont produits à côté.

L'**installeur NSIS enregistre `glg://` dans le registre Windows** ; le
bundle macOS le déclare dans son Info.plist. Rien d'autre à faire.

## 6. Publier une release + mises à jour automatiques

Le workflow GitHub Actions fourni (`.github/workflows/build-launcher.yml`)
fait tout à chaque tag :

```bash
git tag launcher-v1.0.0 && git push --tags
```

Il compile Windows + macOS, signe les artefacts (secrets
`TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` à créer
dans Settings → Secrets), crée la GitHub Release et publie **latest.json** —
le manifeste que chaque launcher installé consulte au démarrage. Publier une
nouvelle version = bump `version` dans `tauri.conf.json` + `Cargo.toml`,
nouveau tag, c'est tout : les joueurs sont à jour au prochain lancement.

## 7. Architecture de confiance

```
Site web (navigateur)          Launcher installé
┌─────────────────────┐       ┌────────────────────────────┐
│ « ▶ Jouer »          │ glg:// │ single-instance → focus     │
│ → modale de relais   ├──────▶│ deep-link → __GLG_DEEPLINK  │
│ → l'OS ouvre le      │       │ → Bibliothèque, jeu         │
│   launcher           │       │   sélectionné               │
└─────────────────────┘       │ updater signé (minisign)    │
                               │ site chargé = launcher UI   │
                               └────────────────────────────┘
```

Le site distant n'a **aucun accès IPC** (capabilities minimales) : même une
compromission du site ne donne aucun pouvoir natif au contenu web. Étape
suivante (optionnelle) : signature de code OS (certificat Authenticode /
notarisation Apple) pour supprimer les avertissements SmartScreen/Gatekeeper.

## 8. Plateformes couvertes

| OS | Bundle | MAJ auto | glg:// | Compilé par |
|---|---|---|---|---|
| Windows 10/11 | `.exe` NSIS | ✅ | ✅ (registre, via l'installeur) | ta machine OU la CI |
| macOS (Apple Silicon + Intel) | `.dmg` / `.app` | ✅ | ✅ (Info.plist) | **la CI** (pas besoin d'un Mac) |
| Linux | `.AppImage` + `.deb` + `.rpm` | ✅ AppImage uniquement | ✅ (entrée .desktop — deb/rpm ; AppImage : après intégration au système) | **la CI** (ubuntu-22.04) |

Notes Linux : l'updater Tauri ne met à jour QUE le format AppImage (deb/rpm
passent par le gestionnaire de paquets de la distribution) — recommander
l'AppImage aux joueurs Linux. Le webview est webkit2gtk (installé par les
paquets deb/rpm ; inclus dans l'AppImage).
