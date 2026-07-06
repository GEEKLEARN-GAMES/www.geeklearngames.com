// ═══════════════════════════════════════════════════════════════════════
//  GEEKLEARN GAMES — launcher de bureau (Tauri v2)
//  ─────────────────────────────────────────────────────────────────────
//  Rôle du shell :
//    1. Afficher le site (https://www.geeklearngames.com) dans une fenêtre
//       native — le site EST le launcher (il se sait "in-app" via l'UA
//       GLGLauncher posé dans tauri.conf.json → IS_TAURI côté app.js).
//    2. Posséder le protocole glg:// : quand le SITE WEB (dans un
//       navigateur) fait « Jouer » → l'OS ouvre CE launcher, qui transmet
//       l'URL au webview via window.__GLG_DEEPLINK(url) (défini app.js).
//    3. Instance unique : un second lancement (ou un glg:// pendant que le
//       launcher tourne) refocalise la fenêtre existante.
//    4. Mises à jour SIGNÉES automatiques au démarrage (plugin updater,
//       clé minisign — voir launcher/README.md pour générer les clés).
// ═══════════════════════════════════════════════════════════════════════

use tauri::Manager;

/// Transmet les URL glg:// au site chargé dans la fenêtre principale.
/// `__GLG_DEEPLINK` (app.js) sait attendre : si le gate de langue n'est pas
/// encore franchi, l'action est mise en attente puis consommée après.
fn handle_deep_link(app: &tauri::AppHandle, urls: Vec<String>) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
        for url in urls {
            if !url.starts_with("glg://") {
                continue;
            }
            // serde_json::to_string = échappement JS sûr de l'URL
            if let Ok(quoted) = serde_json::to_string(&url) {
                let js = format!("window.__GLG_DEEPLINK && window.__GLG_DEEPLINK({quoted});");
                let _ = win.eval(&js);
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // ⚠️ single-instance DOIT être le premier plugin enregistré.
        // Windows livre les glg:// d'un launcher déjà ouvert via argv du
        // second process → on les récupère ici puis on refocalise.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let urls: Vec<String> = argv
                .into_iter()
                .filter(|a| a.starts_with("glg://"))
                .collect();
            handle_deep_link(app, urls);
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // glg:// reçu au premier lancement (macOS passe par cet event,
            // Windows aussi quand le launcher était fermé).
            use tauri_plugin_deep_link::DeepLinkExt;
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                let urls: Vec<String> =
                    event.urls().iter().map(|u| u.to_string()).collect();
                handle_deep_link(&handle, urls);
            });

            // En DEV (cargo tauri dev), enregistre glg:// dans le registre
            // sans passer par l'installeur. En production, NSIS/DMG le font.
            #[cfg(all(desktop, debug_assertions))]
            {
                let _ = app.deep_link().register_all();
            }

            // ── Mises à jour signées, vérifiées au démarrage ─────────────
            // La signature minisign de chaque artefact est vérifiée avec la
            // pubkey de tauri.conf.json AVANT installation : un binaire non
            // signé par TA clé est refusé, même si l'endpoint est compromis.
            let handle2 = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                use tauri_plugin_updater::UpdaterExt;
                let Ok(updater) = handle2.updater() else { return };
                let Ok(Some(update)) = updater.check().await else { return };
                // Téléchargement + installation silencieux, puis relance :
                // même philosophie que Steam ("le launcher se met à jour").
                if update.download_and_install(|_, _| {}, || {}).await.is_ok() {
                    handle2.restart();
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("échec du démarrage du launcher GEEKLEARN GAMES");
}
