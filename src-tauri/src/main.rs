#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

use tauri::Manager;

fn main() {
  tauri::Builder::default()
    .setup(|app| {
      let splashscreen_window = app.get_webview_window("splashscreen").unwrap();
      let main_window = app.get_webview_window("main").unwrap();
      
      // We perform the initialization in a separate async task
      // so the splashscreen stays visible until the main window is ready
      tauri::async_runtime::spawn(async move {
        // Wait for 2 seconds to give the main window time to load the remote URL
        std::thread::sleep(std::time::Duration::from_secs(2));

        // After the setup is done, close the splashscreen and show the main window
        splashscreen_window.close().unwrap();
        main_window.show().unwrap();
      });
      
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}