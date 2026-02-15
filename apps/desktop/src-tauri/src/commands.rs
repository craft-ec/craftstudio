use serde::Serialize;
use std::fs;
use std::path::PathBuf;

#[derive(Serialize)]
pub struct Identity {
    pub did: String,
}

#[derive(Serialize)]
pub struct VersionInfo {
    pub version: String,
    pub tauri_version: String,
}

/// Expand ~ to home directory
fn expand_tilde(path: &str) -> PathBuf {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest);
        }
    }
    PathBuf::from(path)
}

/// Read the keypair path from config and derive a DID.
/// The keypair file is expected to be a JSON array of bytes (Solana-style).
fn load_did_from_config() -> Option<String> {
    let config_path = dirs::home_dir()?.join(".craftstudio").join("config.json");
    let raw = fs::read_to_string(&config_path).ok()?;
    let config: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let keypair_path_str = config
        .get("identity")?
        .get("keypairPath")?
        .as_str()?;

    let kp_path = expand_tilde(keypair_path_str);
    let kp_raw = fs::read_to_string(&kp_path).ok()?;
    let bytes: Vec<u8> = serde_json::from_str(&kp_raw).ok()?;

    // Public key is bytes 32..64 of a 64-byte Solana keypair
    if bytes.len() >= 64 {
        let pubkey = &bytes[32..64];
        let encoded = bs58::encode(pubkey).into_string();
        Some(format!("did:craftec:{encoded}"))
    } else {
        None
    }
}

#[tauri::command]
pub fn get_identity() -> Identity {
    let did = load_did_from_config()
        .unwrap_or_else(|| "did:craftec:not-initialized".to_string());
    Identity { did }
}

#[tauri::command]
pub fn get_version() -> VersionInfo {
    VersionInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        tauri_version: tauri::VERSION.to_string(),
    }
}

#[tauri::command]
pub fn get_daemon_api_key() -> Result<String, String> {
    let path = dirs::home_dir()
        .ok_or_else(|| "Cannot determine home directory".to_string())?
        .join(".datacraft")
        .join("api_key");
    fs::read_to_string(&path)
        .map(|s| s.trim().to_string())
        .map_err(|e| format!("Failed to read API key from {}: {}", path.display(), e))
}

#[tauri::command]
pub fn pick_file() -> Option<String> {
    // Use rfd (Rust File Dialog) for native file picker
    let file = rfd::FileDialog::new()
        .set_title("Select file to publish")
        .pick_file()?;
    Some(file.to_string_lossy().into_owned())
}
