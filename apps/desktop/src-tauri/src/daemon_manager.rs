use craftec_identity::Identity;
use craftec_ipc::server::IpcHandler;
use craftec_keystore;
use craftec_network::NetworkConfig;
use craftnet_daemon::DaemonService as CraftNetService;
use libp2p::identity::Keypair;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio::task::{AbortHandle, JoinHandle};
use tracing::{info, warn, error, Instrument};
use tracing_subscriber::Layer;

use crate::craftnet_adapter::CraftNetAdapter;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DaemonConfig {
    pub data_dir: Option<String>,
    pub socket_path: Option<String>,
    pub ws_port: Option<u16>,
    pub listen_addr: Option<String>,
    #[serde(default)]
    pub binary_path: Option<String>, // ignored, kept for API compat
    pub capabilities: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DaemonInstance {
    pub pid: u32, // instance ID (not a real PID)
    pub ws_port: u16,
    pub data_dir: String,
    pub socket_path: String,
    pub listen_addr: String,
    pub primary: bool,
    pub did: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct LogLine {
    pub pid: u32,
    pub line: String,
    pub is_stderr: bool,
}

struct ManagedDaemon {
    info: DaemonInstance,
    identity: Identity,
    _handle: JoinHandle<()>,
    abort: AbortHandle,
}

/// Shared log storage accessible from both the DaemonManager and tracing layer.
pub type SharedLogs = Arc<Mutex<HashMap<u32, Vec<LogLine>>>>;

/// A tracing Layer that captures log events into the shared buffer.
/// All daemon logs are routed to instance_id found in the current span's extensions,
/// or to a default bucket.
pub struct DaemonLogLayer {
    logs: SharedLogs,
}

impl DaemonLogLayer {
    pub fn new(logs: SharedLogs) -> Self {
        Self { logs }
    }
}

impl<S> Layer<S> for DaemonLogLayer
where
    S: tracing::Subscriber + for<'a> tracing_subscriber::registry::LookupSpan<'a>,
{
    fn on_event(&self, event: &tracing::Event<'_>, ctx: tracing_subscriber::layer::Context<'_, S>) {
        // Try to find instance_id from span hierarchy
        let mut instance_id: Option<u32> = None;
        if let Some(scope) = ctx.event_scope(event) {
            for span in scope {
                let exts = span.extensions();
                if let Some(id) = exts.get::<DaemonInstanceId>() {
                    instance_id = Some(id.0);
                    break;
                }
            }
        }

        let id = match instance_id {
            Some(id) => id,
            None => return, // Not inside a daemon span, skip
        };

        // Format the event
        let mut visitor = StringVisitor::default();
        event.record(&mut visitor);
        let level = event.metadata().level();
        let target = event.metadata().target();
        let line = format!("{} {} {}: {}", level, target, event.metadata().name(), visitor.0);

        let mut logs = self.logs.lock().unwrap();
        if let Some(v) = logs.get_mut(&id) {
            v.push(LogLine {
                pid: id,
                line,
                is_stderr: false,
            });
            if v.len() > 500 {
                v.drain(..v.len() - 500);
            }
        }
    }

    fn on_new_span(
        &self,
        attrs: &tracing::span::Attributes<'_>,
        id: &tracing::span::Id,
        ctx: tracing_subscriber::layer::Context<'_, S>,
    ) {
        // Check if this span has daemon_instance_id field
        let mut visitor = FieldVisitor::default();
        attrs.record(&mut visitor);
        if let Some(instance_id) = visitor.daemon_instance_id {
            if let Some(span) = ctx.span(id) {
                span.extensions_mut().insert(DaemonInstanceId(instance_id));
            }
        } else {
            // Inherit from parent
            if let Some(parent) = ctx.span(id).and_then(|s| s.parent()) {
                let exts = parent.extensions();
                if let Some(inherited) = exts.get::<DaemonInstanceId>().copied() {
                    drop(exts);
                    if let Some(span) = ctx.span(id) {
                        span.extensions_mut().insert(inherited);
                    }
                }
            }
        }
    }
}

#[derive(Clone, Copy)]
struct DaemonInstanceId(u32);

#[derive(Default)]
struct FieldVisitor {
    daemon_instance_id: Option<u32>,
}

impl tracing::field::Visit for FieldVisitor {
    fn record_u64(&mut self, field: &tracing::field::Field, value: u64) {
        if field.name() == "daemon_instance_id" {
            self.daemon_instance_id = Some(value as u32);
        }
    }
    fn record_debug(&mut self, _field: &tracing::field::Field, _value: &dyn std::fmt::Debug) {}
}

#[derive(Default)]
struct StringVisitor(String);

impl tracing::field::Visit for StringVisitor {
    fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn std::fmt::Debug) {
        if !self.0.is_empty() {
            self.0.push(' ');
        }
        if field.name() == "message" {
            self.0.push_str(&format!("{:?}", value));
        } else {
            self.0.push_str(&format!("{}={:?}", field, value));
        }
    }
}

pub struct DaemonManager {
    daemons: Mutex<Vec<ManagedDaemon>>,
    logs: SharedLogs,
    next_index: Mutex<u32>,
    runtime: tokio::runtime::Handle,
}

impl DaemonManager {
    pub fn new(logs: SharedLogs, runtime: tokio::runtime::Handle) -> Self {
        Self {
            daemons: Mutex::new(Vec::new()),
            logs,
            next_index: Mutex::new(0),
            runtime,
        }
    }

    pub fn start(&self, config: DaemonConfig) -> Result<DaemonInstance, String> {
        let mut index = self.next_index.lock().unwrap();
        let is_primary = *index == 0;
        let instance_id = *index;

        let ws_port = config.ws_port.unwrap_or(9091 + instance_id as u16);
        let listen_port = if is_primary { 44001 } else { 44001 + instance_id as u16 };
        let data_dir = config.data_dir.unwrap_or_else(|| {
            if is_primary {
                dirs::home_dir()
                    .unwrap_or_else(|| PathBuf::from("."))
                    .join(".craftobj")
                    .to_string_lossy()
                    .to_string()
            } else {
                format!("/tmp/craftobj-node-{}", instance_id)
            }
        });
        let socket_path = config.socket_path.unwrap_or_else(|| {
            if is_primary {
                "/tmp/craftobj.sock".to_string()
            } else {
                format!("/tmp/craftobj-{}.sock", instance_id)
            }
        });
        let listen_addr = config
            .listen_addr
            .unwrap_or_else(|| format!("/ip4/0.0.0.0/tcp/{}", listen_port));

        // Clean up finished tasks
        {
            let mut daemons = self.daemons.lock().unwrap();
            daemons.retain(|d| !d._handle.is_finished());
            if daemons.iter().any(|d| d.info.ws_port == ws_port) {
                return Err(format!("A daemon is already running on ws_port {}", ws_port));
            }
        }

        // Check if port already in use
        if std::net::TcpStream::connect(format!("127.0.0.1:{}", ws_port)).is_ok() {
            return Err(format!("Port {} already in use — daemon already running", ws_port));
        }

        // Collect boot peers from already-running instances
        let boot_peers: Vec<String> = {
            let daemons = self.daemons.lock().unwrap();
            daemons
                .iter()
                .filter(|d| !d._handle.is_finished())
                .map(|d| {
                    // Extract port from listen_addr (e.g. "/ip4/0.0.0.0/tcp/44001" -> 44001)
                    // and construct a localhost multiaddr for it
                    let port = d.info.listen_addr
                        .rsplit('/')
                        .next()
                        .and_then(|p| p.parse::<u16>().ok())
                        .unwrap_or(0);
                    format!("/ip4/127.0.0.1/tcp/{}", port)
                })
                .collect()
        };

        // Write default config if not already present, using DaemonConfig struct
        // so all fields (including newly added timing fields) are always included.
        {
            let config_path = std::path::Path::new(&data_dir).join("config.json");
            std::fs::create_dir_all(&data_dir).ok();
            if !config_path.exists() {
                let caps = config
                    .capabilities
                    .as_ref()
                    .cloned()
                    .unwrap_or_else(|| vec!["client".to_string()]);
                let mut daemon_cfg = craftobj_daemon::config::DaemonConfig::default();
                daemon_cfg.capabilities = caps;
                daemon_cfg.listen_port = listen_port;
                daemon_cfg.ws_port = ws_port;
                daemon_cfg.socket_path = Some(socket_path.clone());
                daemon_cfg.max_storage_bytes = 10_737_418_240;
                daemon_cfg.boot_peers = boot_peers.clone();
                if let Err(e) = daemon_cfg.save_to(&config_path) {
                    eprintln!(
                        "Warning: failed to write initial daemon config to {:?}: {}",
                        config_path, e
                    );
                }
            } else if !boot_peers.is_empty() {
                // Config exists — load, update boot_peers, save back.
                // Use DaemonConfig round-trip so no other fields are lost.
                let mut existing = craftobj_daemon::config::DaemonConfig::load_from(&config_path);
                existing.boot_peers = boot_peers.clone();
                if let Err(e) = existing.save_to(&config_path) {
                    eprintln!("Warning: failed to update boot_peers in {:?}: {}", config_path, e);
                }
            }
        }

        // Initialize daemon (same logic as daemon's main.rs)
        let data_dir_path = PathBuf::from(&data_dir);
        std::fs::create_dir_all(&data_dir_path)
            .map_err(|e| format!("Failed to create data dir: {}", e))?;

        let key_path = data_dir_path.join("node.key");
        let node_signing_key = craftec_keystore::load_or_generate_keypair(&key_path)
            .map_err(|e| format!("Failed to load/generate node keypair: {}", e))?;

        let secret_bytes = node_signing_key.secret_key_bytes();
        let mut ed_secret = secret_bytes.to_vec();
        let ed_libp2p = libp2p::identity::ed25519::SecretKey::try_from_bytes(&mut ed_secret)
            .map_err(|e| format!("Invalid ed25519 secret: {}", e))?;
        let keypair = Keypair::from(libp2p::identity::ed25519::Keypair::from(ed_libp2p));
        let peer_id = keypair.public().to_peer_id();

        let _node_pubkey_hex = hex::encode(node_signing_key.public_key_bytes());

        info!(
            "Starting in-process daemon instance {} (peer {})",
            instance_id,
            peer_id.to_string()
        );

        let mut network_config = NetworkConfig {
            protocol_prefix: "craftobj".to_string(),
            // Enable dual-Kademlia: CraftOBJ's swarm also hosts /craftnet/kad/1.0.0.
            // Peers discovered via mDNS are added to both DHTs automatically.
            secondary_protocol_prefix: Some("craftnet".to_string()),
            ..Default::default()
        };

        // Parse listen address
        let config_path_file = data_dir_path.join("config.json");
        if !listen_addr.is_empty() {
            network_config.listen_addrs = vec![listen_addr
                .parse()
                .map_err(|e| format!("Invalid listen addr: {}", e))?];
        } else if config_path_file.exists() {
            if let Ok(raw) = std::fs::read_to_string(&config_path_file) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&raw) {
                    if let Some(port) = json.get("listen_port").and_then(|v| v.as_u64()) {
                        let addr = format!("/ip4/0.0.0.0/tcp/{}", port);
                        network_config.listen_addrs = vec![addr
                            .parse()
                            .map_err(|e| format!("Invalid addr: {}", e))?];
                    }
                }
            }
        }

        let dalek_key =
            ed25519_dalek::SigningKey::from_bytes(&node_signing_key.secret_key_bytes());

        let config_path_opt = if config_path_file.exists() {
            Some(config_path_file)
        } else {
            None
        };

        // Initialize log buffer for this instance
        {
            let mut logs = self.logs.lock().unwrap();
            logs.insert(instance_id, Vec::new());
        }

        let logs_clone = Arc::clone(&self.logs);
        let (cmd_tx, cmd_rx) = tokio::sync::mpsc::channel(1024);
        let (evt_tx, evt_rx) = tokio::sync::mpsc::channel(1024);
        let (stream_tx, stream_rx) = tokio::sync::oneshot::channel();

        // Load daemon config from disk (or defaults) before init
        let daemon_config = if let Some(ref path) = config_path_opt {
            let cfg = craftobj_daemon::config::DaemonConfig::load_from(path);
            cfg
        } else {
            craftobj_daemon::config::DaemonConfig::load(&data_dir_path)
        };

        // ── Create CraftNet service for this instance ──
        let craftnet_secret = node_signing_key.secret_key_bytes();
        let craftnet_service = CraftNetService::new_with_data_dir(
            &craftnet_secret,
            &PathBuf::from(&data_dir),
        )
        .map_err(|e| format!("Failed to create CraftNet service: {}", e))?;

        let craftnet_service = Arc::new(craftnet_service);
        let craftnet_for_adapter = Arc::clone(&craftnet_service);

        let socket_path_for_ipc = socket_path.clone();
        let span = tracing::info_span!("daemon", daemon_instance_id = instance_id);
        let handle = self.runtime.spawn(async move {
            let socket_path = socket_path_for_ipc;
            // 1. Init CraftOBJ daemon (handler + swarm, no IPC)
            let daemon_handle = match craftobj_daemon::init_daemon(
                keypair,
                data_dir_path,
                network_config,
                daemon_config,
                Some(dalek_key),
                Some(cmd_rx),
                Some(evt_tx),
                Some(stream_tx),
            ).await {
                Ok(h) => h,
                Err(e) => {
                    error!("Failed to init daemon: {}", e);
                    let mut logs = logs_clone.lock().unwrap();
                    if let Some(v) = logs.get_mut(&instance_id) {
                        v.push(LogLine {
                            pid: instance_id,
                            line: format!("Daemon init failed: {}", e),
                            is_stderr: true,
                        });
                    }
                    return;
                }
            };

            // 2. Build unified IPC server with namespace routing
            let ipc = craftec_ipc::ServerBuilder::new(&socket_path)
                .with_websocket(ws_port)
                .with_api_key(daemon_handle.api_key.clone())
                .namespace("data", daemon_handle.handler.clone())
                .namespace("tunnel", Arc::new(CraftNetAdapter(craftnet_for_adapter.clone())) as Arc<dyn IpcHandler>)
                .default_handler(daemon_handle.handler.clone()); // backward compat: unnamespaced methods go to CraftOBJ

            // 3. Bridge DaemonEvent → String for the IPC event transport
            let ipc_event_tx = ipc.event_sender();
            let mut daemon_event_rx = daemon_handle.event_tx.subscribe();
            tokio::spawn(async move {
                loop {
                    match daemon_event_rx.recv().await {
                        Ok(event) => {
                            let notification: String = event.into();
                            let _ = ipc_event_tx.send(notification);
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                        Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                    }
                }
            });

            // 4. Run everything concurrently
            tokio::select! {
                _ = daemon_handle.loops => {
                    info!("Daemon instance {} loops ended", instance_id);
                }
                result = ipc.run() => {
                    if let Err(e) = result {
                        error!("IPC server error for instance {}: {}", instance_id, e);
                    }
                }
            }

            info!("Daemon instance {} exited cleanly", instance_id);
        }.instrument(span));

        let abort = handle.abort_handle();

        // Give CraftNet its swarm handles (once they become available) and auto-start
        self.runtime.spawn(async move {
            match stream_rx.await {
                Ok((stream_control, incoming_streams_rx)) => {
                    let handles = craftnet_daemon::SwarmHandles {
                        cmd_tx,
                        evt_rx,
                        stream_control,
                        incoming_streams_rx,
                        local_peer_id: peer_id,
                    };
                    craftnet_service.set_swarm_handles(handles).await;
                    // Auto-start CraftNet so it joins the network immediately
                    if let Err(e) = craftnet_service.start().await {
                        warn!("CraftNet auto-start failed: {}", e);
                    }
                }
                Err(e) => warn!("Failed to receive CraftNet stream handles: {}", e),
            }
        });

        // Create identity from the shared keypair
        let identity = Identity::from_secret_bytes(&node_signing_key.secret_key_bytes());
        let did_string = identity.did.to_string();

        info!(
            "Instance {} identity: {}",
            instance_id, did_string
        );

        let instance = DaemonInstance {
            pid: instance_id,
            ws_port,
            data_dir,
            socket_path,
            listen_addr,
            primary: is_primary,
            did: did_string,
        };

        {
            let mut daemons = self.daemons.lock().unwrap();
            daemons.push(ManagedDaemon {
                info: instance.clone(),
                identity,
                _handle: handle,
                abort,
            });
        }

        *index += 1;
        Ok(instance)
    }

    pub fn stop(&self, pid: u32) -> Result<(), String> {
        let mut daemons = self.daemons.lock().unwrap();
        let pos = daemons
            .iter()
            .position(|d| d.info.pid == pid)
            .ok_or_else(|| format!("No daemon with instance ID {}", pid))?;

        let daemon = daemons.remove(pos);
        daemon.abort.abort();

        // Clean up logs
        let mut logs = self.logs.lock().unwrap();
        logs.remove(&pid);

        Ok(())
    }

    pub fn list(&self) -> Vec<DaemonInstance> {
        let mut daemons = self.daemons.lock().unwrap();
        daemons.retain(|d| !d._handle.is_finished());
        daemons.iter().map(|d| d.info.clone()).collect()
    }

    pub fn get_logs(&self, pid: u32, since: usize) -> Vec<LogLine> {
        let logs = self.logs.lock().unwrap();
        if let Some(v) = logs.get(&pid) {
            if since < v.len() {
                v[since..].to_vec()
            } else {
                Vec::new()
            }
        } else {
            Vec::new()
        }
    }

    pub fn stop_all(&self) {
        let mut daemons = self.daemons.lock().unwrap();
        for d in daemons.iter() {
            d.abort.abort();
        }
        daemons.clear();
        self.logs.lock().unwrap().clear();
    }
}

impl Drop for DaemonManager {
    fn drop(&mut self) {
        self.stop_all();
    }
}
