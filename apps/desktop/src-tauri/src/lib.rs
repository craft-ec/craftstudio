mod commands;
mod config;
mod daemon_manager;

use daemon_manager::{DaemonConfig, DaemonInstance, DaemonLogLayer, DaemonManager, LogLine, SharedLogs};
use tauri::Manager;
use std::collections::HashMap;
use std::path::PathBuf;
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
        .setup(|app| {
            let manager = app.state::<Arc<DaemonManager>>();
            let config = DaemonConfig {
                data_dir: None,
                socket_path: None,
                ws_port: None,
                listen_addr: None,
                binary_path: None,
                capabilities: None,
            };
            match manager.start(config) {
                Ok(instance) => tracing::info!("Auto-started daemon (ws_port={})", instance.ws_port),
                Err(e) => tracing::warn!("Failed to auto-start daemon: {}", e),
            }
            Ok(())
        })
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

/// Run the daemon in headless mode (no Tauri window).
/// Same daemon logic as the GUI's in-process path, but blocks until Ctrl+C.
pub async fn run_headless() {
    use craftec_keystore;
    use craftec_network::NetworkConfig;
    use craftobj_daemon::service;
    use tracing::info;

    // Initialize logging (simple fmt, no daemon log layer needed)
    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));
    tracing_subscriber::registry()
        .with(env_filter)
        .with(tracing_subscriber::fmt::layer().with_target(true).with_level(true))
        .init();

    println!();
    println!("  CraftStudio v0.1.0 — headless daemon mode");
    println!();

    // Use same defaults as GUI mode (DaemonManager primary instance)
    let data_dir = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".craftobj");
    let socket_path = "/tmp/craftobj.sock".to_string();
    let ws_port: u16 = 9091;
    let listen_port: u16 = 44001;

    std::fs::create_dir_all(&data_dir).expect("Failed to create data dir");

    // Write default daemon config if needed
    let config_path = data_dir.join("config.json");
    if !config_path.exists() {
        let daemon_cfg = serde_json::json!({
            "schema_version": 2,
            "capabilities": ["client"],
            "listen_port": listen_port,
            "ws_port": ws_port,
            "socket_path": &socket_path,
            "storage_path": format!("{}/storage", data_dir.display()),
            "keypair_path": format!("{}/identity.json", data_dir.display()),
            "capability_announce_interval_secs": 300,
            "reannounce_interval_secs": 600,
            "reannounce_threshold_secs": 1200,
            "challenger_interval_secs": null,
            "max_storage_bytes": 10_737_418_240_u64
        });
        if let Err(e) = std::fs::write(&config_path, serde_json::to_string_pretty(&daemon_cfg).unwrap_or_default()) {
            eprintln!("Warning: failed to write default config: {}", e);
        }
    }

    // Load or generate node keypair
    let key_path = data_dir.join("node.key");
    let node_signing_key = craftec_keystore::load_or_generate_keypair(&key_path)
        .expect("Failed to load/generate node keypair");

    let secret_bytes = node_signing_key.secret_key_bytes();
    let mut ed_secret = secret_bytes.to_vec();
    let ed_libp2p = libp2p::identity::ed25519::SecretKey::try_from_bytes(&mut ed_secret)
        .expect("Invalid ed25519 secret");
    let keypair = libp2p::identity::Keypair::from(libp2p::identity::ed25519::Keypair::from(ed_libp2p));
    let dalek_key = ed25519_dalek::SigningKey::from_bytes(&node_signing_key.secret_key_bytes());

    let network_config = NetworkConfig {
        listen_addrs: vec![format!("/ip4/0.0.0.0/tcp/{}", listen_port).parse().expect("Invalid listen addr")],
        protocol_prefix: "craftobj".to_string(),
        ..Default::default()
    };

    let config_path_opt = if config_path.exists() { Some(config_path.clone()) } else { None };

    info!(data_dir = %data_dir.display(), socket = %socket_path, ws_port, "Starting headless daemon");

    let result = service::run_daemon_with_config(
        keypair,
        data_dir,
        socket_path,
        network_config,
        ws_port,
        config_path_opt,
        Some(dalek_key),
    )
    .await;

    if let Err(e) = result {
        eprintln!("Daemon exited with error: {}", e);
        std::process::exit(1);
    }
}
