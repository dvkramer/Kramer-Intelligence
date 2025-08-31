#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

use tauri::Manager;

fn main() {
  tauri::Builder::default()
    .on_page_load(|window, _payload| {
      if window.label() == "main" {
        let splashscreen = window.app_handle().get_webview_window("splashscreen").unwrap();
        splashscreen.close().unwrap();
        window.show().unwrap();
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
