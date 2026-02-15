mod commands;
mod config;
mod daemon_manager;

use daemon_manager::{DaemonConfig, DaemonInstance, DaemonManager, LogLine};
use std::sync::Arc;

#[tauri::command]
fn start_datacraft_daemon(
    state: tauri::State<'_, Arc<DaemonManager>>,
    config: DaemonConfig,
) -> Result<DaemonInstance, String> {
    state.start(config)
}

#[tauri::command]
fn stop_datacraft_daemon(
    state: tauri::State<'_, Arc<DaemonManager>>,
    pid: u32,
) -> Result<(), String> {
    state.stop(pid)
}

#[tauri::command]
fn list_datacraft_daemons(
    state: tauri::State<'_, Arc<DaemonManager>>,
) -> Vec<DaemonInstance> {
    state.list()
}

#[tauri::command]
fn get_daemon_logs(
    state: tauri::State<'_, Arc<DaemonManager>>,
    pid: u32,
    since: usize,
) -> Vec<LogLine> {
    state.get_logs(pid, since)
}

pub fn run() {
    let daemon_manager = Arc::new(DaemonManager::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(daemon_manager)
        .invoke_handler(tauri::generate_handler![
            commands::get_identity,
            commands::get_version,
            commands::get_daemon_api_key,
            commands::pick_file,
            config::get_config,
            config::save_config,
            config::get_default_config,
            start_datacraft_daemon,
            stop_datacraft_daemon,
            list_datacraft_daemons,
            get_daemon_logs,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
