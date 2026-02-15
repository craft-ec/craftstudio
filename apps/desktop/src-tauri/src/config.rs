use std::fs;
use std::path::PathBuf;

fn config_dir() -> PathBuf {
    let home = dirs::home_dir().expect("Cannot determine home directory");
    home.join(".craftstudio")
}

fn config_path() -> PathBuf {
    config_dir().join("config.json")
}

fn default_config_json() -> String {
    serde_json::json!({
        "schema_version": 1,
        "solana": { "cluster": "devnet" },
        "instances": [],
        "activeInstanceId": null,
        "ui": {
            "theme": "dark",
            "notifications": true,
            "startMinimized": false,
            "launchOnStartup": false
        }
    })
    .to_string()
}

#[tauri::command]
pub fn get_config() -> Result<String, String> {
    let path = config_path();
    if path.exists() {
        fs::read_to_string(&path).map_err(|e| format!("Failed to read config: {e}"))
    } else {
        Ok(default_config_json())
    }
}

#[tauri::command]
pub fn save_config(config: String) -> Result<(), String> {
    let dir = config_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create config dir: {e}"))?;
    // Validate JSON
    serde_json::from_str::<serde_json::Value>(&config)
        .map_err(|e| format!("Invalid JSON: {e}"))?;
    fs::write(config_path(), &config).map_err(|e| format!("Failed to write config: {e}"))
}

#[tauri::command]
pub fn get_default_config() -> String {
    default_config_json()
}

/// Read daemon config from a specific data directory.
/// Returns the JSON contents of `{data_dir}/config.json`, or a default if missing/corrupt.
#[tauri::command]
pub fn read_daemon_config(data_dir: String) -> Result<String, String> {
    let path = PathBuf::from(&data_dir).join("config.json");
    if path.exists() {
        let contents = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read daemon config: {e}"))?;
        // Validate it's valid JSON
        serde_json::from_str::<serde_json::Value>(&contents)
            .map_err(|e| format!("Corrupt daemon config: {e}"))?;
        Ok(contents)
    } else {
        Ok(default_daemon_config_json())
    }
}

/// Write daemon config to a specific data directory.
/// Creates the data dir and file if they don't exist.
#[tauri::command]
pub fn write_daemon_config(data_dir: String, config: String) -> Result<(), String> {
    let dir = PathBuf::from(&data_dir);
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create data dir: {e}"))?;
    // Validate JSON
    serde_json::from_str::<serde_json::Value>(&config)
        .map_err(|e| format!("Invalid daemon config JSON: {e}"))?;
    let path = dir.join("config.json");
    fs::write(&path, &config).map_err(|e| format!("Failed to write daemon config: {e}"))
}

fn default_daemon_config_json() -> String {
    serde_json::json!({
        "schema_version": 2,
        "capabilities": ["client", "storage"],
        "listen_port": 0,
        "ws_port": 9091,
        "socket_path": null,
        "capability_announce_interval_secs": 300,
        "reannounce_interval_secs": 600,
        "reannounce_threshold_secs": 1200,
        "challenger_interval_secs": null,
        "max_storage_bytes": 0
    })
    .to_string()
}
