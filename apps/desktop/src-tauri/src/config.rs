use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

fn config_dir() -> PathBuf {
    let home = dirs::home_dir().expect("Cannot determine home directory");
    home.join(".craftstudio")
}

fn config_path() -> PathBuf {
    config_dir().join("config.json")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DefaultConfig {
    pub solana: SolanaConfig,
    pub identity: IdentityConfig,
    pub daemons: DaemonsConfig,
    pub node: NodeConfig,
    pub ui: UiConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SolanaConfig {
    pub cluster: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_rpc_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usdc_mint_override: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdentityConfig {
    pub keypair_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DaemonsConfig {
    pub datacraft: DaemonEntry,
    pub tunnelcraft: DaemonEntry,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DaemonEntry {
    pub url: String,
    pub auto_connect: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeConfig {
    pub capabilities: Capabilities,
    pub storage_path: String,
    pub max_storage_gb: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bandwidth_limit_mbps: Option<u32>,
    pub port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Capabilities {
    pub storage: bool,
    pub relay: bool,
    pub aggregator: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiConfig {
    pub theme: String,
    pub notifications: bool,
    pub start_minimized: bool,
    pub launch_on_startup: bool,
}

fn default_config_json() -> String {
    serde_json::json!({
        "solana": { "cluster": "devnet" },
        "identity": { "keypairPath": "~/.craftstudio/identity.json" },
        "daemons": {
            "datacraft": { "url": "ws://127.0.0.1:9091", "autoConnect": true },
            "tunnelcraft": { "url": "ws://127.0.0.1:9092", "autoConnect": false }
        },
        "node": {
            "capabilities": { "storage": false, "relay": false, "aggregator": false },
            "storagePath": "~/.craftstudio/storage",
            "maxStorageGB": 50,
            "port": 4001
        },
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
