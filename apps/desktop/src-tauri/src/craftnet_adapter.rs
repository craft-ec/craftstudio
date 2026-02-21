//! CraftNet IPC adapter
//!
//! Wraps `craftnet_daemon::DaemonService` to implement `craftec_ipc::server::IpcHandler`,
//! bridging the CraftNet daemon's local IpcHandler with the unified craftec-ipc trait.

use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use craftnet_daemon::DaemonService as CraftNetService;
use serde_json::Value;

/// Adapter that makes a `CraftNetService` available as a `craftec_ipc::server::IpcHandler`.
///
/// CraftNet's `DaemonService` already implements its own `IpcHandler` trait (defined in
/// `craftnet-daemon`) with the same signature. This adapter delegates to that impl
/// so the service can be registered as a namespace in `craftec_ipc::ServerBuilder`.
pub struct CraftNetAdapter(pub Arc<CraftNetService>);

impl craftec_ipc::server::IpcHandler for CraftNetAdapter {
    fn handle(
        &self,
        method: &str,
        params: Option<Value>,
    ) -> Pin<Box<dyn Future<Output = Result<Value, String>> + Send + '_>> {
        // Delegate to CraftNet's own IpcHandler implementation
        craftnet_daemon::IpcHandler::handle(self.0.as_ref(), method, params)
    }
}
