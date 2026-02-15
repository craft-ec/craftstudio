mod commands;
mod config;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_identity,
            commands::get_version,
            commands::get_daemon_api_key,
            commands::pick_file,
            config::get_config,
            config::save_config,
            config::get_default_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
