use serde::Serialize;

#[derive(Serialize)]
pub struct Identity {
    pub did: String,
}

#[derive(Serialize)]
pub struct VersionInfo {
    pub version: String,
    pub tauri_version: String,
}

#[tauri::command]
pub fn get_identity() -> Identity {
    // TODO: Load real DID from keystore/daemon
    Identity {
        did: "did:craftec:placeholder".to_string(),
    }
}

#[tauri::command]
pub fn get_version() -> VersionInfo {
    VersionInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        tauri_version: tauri::VERSION.to_string(),
    }
}
