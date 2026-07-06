// Empêche la console Windows de s'ouvrir derrière le launcher en release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    glg_launcher_lib::run()
}
