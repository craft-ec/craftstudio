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
