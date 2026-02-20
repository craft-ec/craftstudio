mod commands;
mod config;
mod daemon_manager;

use daemon_manager::{DaemonConfig, DaemonInstance, DaemonLogLayer, DaemonManager, LogLine, SharedLogs};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;

#[tauri::command]
fn start_craftobj_daemon(
    state: tauri::State<'_, Arc<DaemonManager>>,
    config: DaemonConfig,
) -> Result<DaemonInstance, String> {
    state.start(config)
}

#[tauri::command]
fn stop_craftobj_daemon(
    state: tauri::State<'_, Arc<DaemonManager>>,
    pid: u32,
) -> Result<(), String> {
    state.stop(pid)
}

#[tauri::command]
fn list_craftobj_daemons(
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
    // Shared log storage for daemon instances
    let logs: SharedLogs = Arc::new(Mutex::new(HashMap::new()));

    // Set up tracing with both console output and daemon log capture
    let daemon_log_layer = DaemonLogLayer::new(Arc::clone(&logs));
    let fmt_layer = tracing_subscriber::fmt::layer()
        .with_target(true)
        .with_level(true);
    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));

    tracing_subscriber::registry()
        .with(env_filter)
        .with(fmt_layer)
        .with(daemon_log_layer)
        .init();

    // Get a handle to the tokio runtime (Tauri 2 runs on tokio)
    let runtime_handle = tokio::runtime::Handle::current();
    let daemon_manager = Arc::new(DaemonManager::new(logs, runtime_handle));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(daemon_manager)
        .invoke_handler(tauri::generate_handler![
            commands::get_identity,
            commands::get_version,
            commands::get_daemon_api_key,
            commands::discover_local_daemons,
            commands::pick_file,
            config::get_config,
            config::save_config,
            config::get_default_config,
            config::read_daemon_config,
            config::write_daemon_config,
            start_craftobj_daemon,
            stop_craftobj_daemon,
            list_craftobj_daemons,
            get_daemon_logs,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
