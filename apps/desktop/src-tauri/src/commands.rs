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
pub fn get_daemon_api_key(data_dir: Option<String>) -> Result<String, String> {
    let path = if let Some(dir) = data_dir {
        expand_tilde(&dir).join("api_key")
    } else {
        dirs::home_dir()
            .ok_or_else(|| "Cannot determine home directory".to_string())?
            .join(".craftobj")
            .join("api_key")
    };
    fs::read_to_string(&path)
        .map(|s| s.trim().to_string())
        .map_err(|e| format!("Failed to read API key from {}: {}", path.display(), e))
}

/// A discovered local daemon configuration on disk.
#[derive(Serialize)]
pub struct LocalDaemonConfig {
    /// Absolute path to the data directory
    pub data_dir: String,
    /// Display name derived from path
    pub name: String,
    /// Whether an api_key file exists (daemon was initialized)
    pub has_api_key: bool,
    /// Whether manifests/chunks exist (has data)
    pub has_data: bool,
    /// The WS port if we can infer it (from socket name or default)
    pub ws_port: Option<u16>,
}

/// Scan well-known locations for existing daemon data directories.
#[tauri::command]
pub fn discover_local_daemons() -> Vec<LocalDaemonConfig> {
    let mut results = Vec::new();
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return results,
    };

    // 1. Default: ~/.craftobj
    let default_dir = home.join(".craftobj");
    if default_dir.exists() {
        results.push(probe_daemon_dir(&default_dir, "Default Node", Some(9091)));
    }

    // 2. CraftStudio-managed: ~/.craftstudio/instances*/
    let cs_dir = home.join(".craftstudio");
    if cs_dir.exists() {
        if let Ok(entries) = fs::read_dir(&cs_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                    if name.starts_with("instances") {
                        // Check if it has daemon data (manifests dir or api_key)
                        if path.join("api_key").exists() || path.join("manifests").exists() {
                            let index: u16 = name.trim_start_matches("instances-")
                                .parse().unwrap_or(0);
                            let port = 9091 + index;
                            results.push(probe_daemon_dir(&path, &format!("Instance {}", index), Some(port)));
                        }
                    }
                }
            }
        }
    }

    // 3. Temp dirs: /tmp/craftobj-node-*
    if let Ok(entries) = fs::read_dir("/tmp") {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                if name.starts_with("craftobj-node-") || name.starts_with("craftobj-") {
                    let index: u16 = name.trim_start_matches("craftobj-node-")
                        .parse().unwrap_or(0);
                    let port = 9091 + index;
                    results.push(probe_daemon_dir(&path, &name, Some(port)));
                }
            }
        }
    }

    results
}

fn probe_daemon_dir(path: &std::path::Path, name: &str, ws_port: Option<u16>) -> LocalDaemonConfig {
    LocalDaemonConfig {
        data_dir: path.to_string_lossy().to_string(),
        name: name.to_string(),
        has_api_key: path.join("api_key").exists(),
        has_data: path.join("manifests").exists() || path.join("chunks").exists(),
        ws_port,
    }
}

#[tauri::command]
pub fn pick_file() -> Option<String> {
    // Use rfd (Rust File Dialog) for native file picker
    let file = rfd::FileDialog::new()
        .set_title("Select file to publish")
        .pick_file()?;
    Some(file.to_string_lossy().into_owned())
}
