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

// ── Splash de démarrage / mise à jour (façon Epic, signé GLG) ────────────
// HTML + logo EMBARQUÉS dans le binaire (protocole glgsplash://) : le
// splash s'affiche instantanément, même hors ligne. La fenêtre `splash`
// (tauri.conf.json) le charge pendant que `main` (cachée) prépare le site.
const SPLASH_HTML: &str = include_str!("splash.html");
const SPLASH_ICON: &[u8] = include_bytes!("../icons/128x128.png");

/// Ferme le splash et révèle la fenêtre principale (site prêt derrière).
fn show_main(app: &tauri::AppHandle) {
    if let Some(m) = app.get_webview_window("main") {
        let _ = m.show();
        let _ = m.set_focus();
    }
    if let Some(s) = app.get_webview_window("splash") {
        let _ = s.close();
    }
}

fn splash_eval(app: &tauri::AppHandle, js: &str) {
    if let Some(s) = app.get_webview_window("splash") {
        let _ = s.eval(js);
    }
}

// ── Discord Rich Presence ────────────────────────────────────────────────
// Discord affiche « GEEKLEARN GAMES » + le logo officiel dans le statut du
// joueur. Prérequis côté portail développeur Discord : une Application
// nommée « GEEKLEARN GAMES » avec un asset Rich Presence nommé `glg-logo`.
// ID vide = fonctionnalité coupée. Échec TOUJOURS silencieux (Discord
// absent, fermé, IPC indisponible) — jamais bloquant pour le launcher.
const DISCORD_APP_ID: &str = "";

fn start_discord_presence() {
    if DISCORD_APP_ID.is_empty() {
        return;
    }
    std::thread::spawn(|| {
        use discord_rich_presence::{
            activity::{Activity, Assets},
            DiscordIpc, DiscordIpcClient,
        };
        loop {
            if let Ok(mut client) = DiscordIpcClient::new(DISCORD_APP_ID) {
                if client.connect().is_ok() {
                    loop {
                        let act = Activity::new().state("Dans le launcher").assets(
                            Assets::new()
                                .large_image("glg-logo")
                                .large_text("GEEKLEARN GAMES"),
                        );
                        // Discord fermé en cours de route → on sort et on
                        // retentera une connexion plus bas.
                        if client.set_activity(act).is_err() {
                            break;
                        }
                        std::thread::sleep(std::time::Duration::from_secs(60));
                    }
                    let _ = client.close();
                }
            }
            std::thread::sleep(std::time::Duration::from_secs(120));
        }
    });
}

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
        // Splash embarqué : HTML + logo servis depuis le binaire lui-même
        .register_uri_scheme_protocol("glgsplash", |_ctx, request| {
            if request.uri().path().ends_with("icon.png") {
                tauri::http::Response::builder()
                    .header("Content-Type", "image/png")
                    .body(SPLASH_ICON.to_vec())
                    .unwrap()
            } else {
                tauri::http::Response::builder()
                    .header("Content-Type", "text/html; charset=utf-8")
                    .body(SPLASH_HTML.as_bytes().to_vec())
                    .unwrap()
            }
        })
        .setup(|app| {
            // Statut Discord (logo + « Dans le launcher ») — non bloquant.
            start_discord_presence();

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
            // Façon Epic : le SPLASH GLG s'affiche d'abord (fenêtre `splash`),
            // `main` reste cachée. Pas de MAJ → on révèle le site. MAJ trouvée
            // → barre de progression sur le splash, installation signée
            // (minisign vérifié AVANT installation), puis relance.
            use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
            let updating = std::sync::Arc::new(AtomicBool::new(false));

            // Garde-fou : si la vérification traîne (réseau lent/absent),
            // on ne retient jamais le joueur plus de 12 s hors mise à jour.
            {
                let h = app.handle().clone();
                let updating = updating.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(12));
                    if !updating.load(Ordering::SeqCst) {
                        show_main(&h);
                    }
                });
            }

            let handle2 = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                use tauri_plugin_updater::UpdaterExt;
                let Ok(updater) = handle2.updater() else { show_main(&handle2); return };
                match updater.check().await {
                    Ok(Some(update)) => {
                        updating.store(true, Ordering::SeqCst);
                        splash_eval(&handle2, "window.__GLG_SPLASH && __GLG_SPLASH('update', 0)");
                        let progress_handle = handle2.clone();
                        let downloaded = std::sync::Arc::new(AtomicU64::new(0));
                        let ok = update
                            .download_and_install(
                                move |chunk, total| {
                                    let d = downloaded.fetch_add(chunk as u64, Ordering::SeqCst)
                                        + chunk as u64;
                                    if let Some(t) = total {
                                        let pct = (d.saturating_mul(100) / t.max(1)).min(100);
                                        splash_eval(
                                            &progress_handle,
                                            &format!("window.__GLG_SPLASH && __GLG_SPLASH('update', {pct})"),
                                        );
                                    }
                                },
                                || {},
                            )
                            .await
                            .is_ok();
                        if ok {
                            splash_eval(&handle2, "window.__GLG_SPLASH && __GLG_SPLASH('restart', 100)");
                            handle2.restart();
                        } else {
                            // Échec de MAJ : ne JAMAIS bloquer le joueur — on
                            // lance la version actuelle, retentative au prochain démarrage.
                            show_main(&handle2);
                        }
                    }
                    _ => show_main(&handle2),
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("échec du démarrage du launcher GEEKLEARN GAMES");
}
