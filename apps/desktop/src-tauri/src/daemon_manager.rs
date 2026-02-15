use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DaemonConfig {
    pub data_dir: Option<String>,
    pub socket_path: Option<String>,
    pub ws_port: Option<u16>,
    pub listen_addr: Option<String>,
    pub binary_path: Option<String>,
    pub capabilities: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DaemonInstance {
    pub pid: u32,
    pub ws_port: u16,
    pub data_dir: String,
    pub socket_path: String,
    pub listen_addr: String,
    pub primary: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct LogLine {
    pub pid: u32,
    pub line: String,
    pub is_stderr: bool,
}

struct ManagedDaemon {
    info: DaemonInstance,
    child: Child,
}

pub struct DaemonManager {
    daemons: Mutex<Vec<ManagedDaemon>>,
    logs: Arc<Mutex<HashMap<u32, Vec<LogLine>>>>,
    next_index: Mutex<u32>,
}

impl DaemonManager {
    pub fn new() -> Self {
        Self {
            daemons: Mutex::new(Vec::new()),
            logs: Arc::new(Mutex::new(HashMap::new())),
            next_index: Mutex::new(0),
        }
    }

    fn find_binary(config_path: Option<&str>) -> Result<PathBuf, String> {
        if let Some(p) = config_path {
            let pb = PathBuf::from(p);
            if pb.exists() {
                return Ok(pb);
            }
        }

        // Same directory as current exe
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                let candidate = dir.join("datacraft-daemon");
                if candidate.exists() {
                    return Ok(candidate);
                }
            }
        }

        // ~/.cargo/bin/
        if let Some(home) = dirs::home_dir() {
            let candidate = home.join(".cargo").join("bin").join("datacraft-daemon");
            if candidate.exists() {
                return Ok(candidate);
            }
        }

        // PATH
        if let Ok(output) = Command::new("which")
            .arg("datacraft-daemon")
            .output()
        {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    return Ok(PathBuf::from(path));
                }
            }
        }

        Err("datacraft-daemon binary not found. Install it or provide a path.".to_string())
    }

    pub fn start(&self, config: DaemonConfig) -> Result<DaemonInstance, String> {
        let mut index = self.next_index.lock().unwrap();
        let is_primary = *index == 0;

        let ws_port = config.ws_port.unwrap_or(9091 + *index as u16);
        let listen_port = if is_primary { 44001 } else { 44001 + *index as u16 };
        let data_dir = config.data_dir.unwrap_or_else(|| {
            if is_primary {
                dirs::home_dir()
                    .unwrap_or_else(|| PathBuf::from("."))
                    .join(".datacraft")
                    .to_string_lossy()
                    .to_string()
            } else {
                format!("/tmp/datacraft-node-{}", *index)
            }
        });
        let socket_path = config.socket_path.unwrap_or_else(|| {
            if is_primary {
                "/tmp/datacraft.sock".to_string()
            } else {
                format!("/tmp/datacraft-{}.sock", *index)
            }
        });
        let listen_addr = config
            .listen_addr
            .unwrap_or_else(|| format!("/ip4/0.0.0.0/tcp/{}", listen_port));

        let binary = Self::find_binary(config.binary_path.as_deref())?;

        // Clean up dead processes before checking for conflicts
        {
            let mut daemons = self.daemons.lock().unwrap();
            daemons.retain_mut(|d| {
                match d.child.try_wait() {
                    Ok(Some(_)) => false, // exited
                    _ => true,
                }
            });
            if daemons.iter().any(|d| d.info.ws_port == ws_port) {
                return Err(format!("A daemon is already running on ws_port {}", ws_port));
            }
        }

        // Check if a daemon is already listening on this port (from a previous session)
        if std::net::TcpStream::connect(format!("127.0.0.1:{}", ws_port)).is_ok() {
            return Err(format!("Port {} already in use — daemon already running", ws_port));
        }

        // Build capabilities env var — default to "client" only if not specified
        let caps_env = config.capabilities
            .as_ref()
            .map(|caps| caps.join(","))
            .unwrap_or_else(|| "client".to_string());

        let mut child = Command::new(&binary)
            .arg("--data-dir")
            .arg(&data_dir)
            .arg("--socket")
            .arg(&socket_path)
            .arg("--ws-port")
            .arg(ws_port.to_string())
            .arg("--listen")
            .arg(&listen_addr)
            .env("CRAFTEC_CAPABILITIES", &caps_env)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn daemon: {}", e))?;

        let pid = child.id();

        // Set up log capture
        {
            let mut logs = self.logs.lock().unwrap();
            logs.insert(pid, Vec::new());
        }

        let logs_arc = Arc::clone(&self.logs);
        if let Some(stdout) = child.stdout.take() {
            let logs = Arc::clone(&logs_arc);
            thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines().flatten() {
                    let mut l = logs.lock().unwrap();
                    if let Some(v) = l.get_mut(&pid) {
                        v.push(LogLine { pid, line, is_stderr: false });
                        // Keep last 500 lines
                        if v.len() > 500 { v.drain(..v.len() - 500); }
                    }
                }
            });
        }

        if let Some(stderr) = child.stderr.take() {
            let logs = Arc::clone(&logs_arc);
            thread::spawn(move || {
                let reader = BufReader::new(stderr);
                for line in reader.lines().flatten() {
                    let mut l = logs.lock().unwrap();
                    if let Some(v) = l.get_mut(&pid) {
                        v.push(LogLine { pid, line, is_stderr: true });
                        if v.len() > 500 { v.drain(..v.len() - 500); }
                    }
                }
            });
        }

        let instance = DaemonInstance {
            pid,
            ws_port,
            data_dir: data_dir.clone(),
            socket_path: socket_path.clone(),
            listen_addr: listen_addr.clone(),
            primary: is_primary,
        };

        {
            let mut daemons = self.daemons.lock().unwrap();
            daemons.push(ManagedDaemon {
                info: instance.clone(),
                child,
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
            .ok_or_else(|| format!("No daemon with PID {}", pid))?;

        let mut daemon = daemons.remove(pos);
        daemon
            .child
            .kill()
            .map_err(|e| format!("Failed to kill daemon {}: {}", pid, e))?;
        let _ = daemon.child.wait();

        // Clean up logs
        let mut logs = self.logs.lock().unwrap();
        logs.remove(&pid);

        Ok(())
    }

    pub fn list(&self) -> Vec<DaemonInstance> {
        let mut daemons = self.daemons.lock().unwrap();
        // Check if processes are still alive
        daemons.retain_mut(|d| {
            match d.child.try_wait() {
                Ok(Some(_)) => false, // exited
                _ => true,
            }
        });
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
        for d in daemons.iter_mut() {
            let _ = d.child.kill();
            let _ = d.child.wait();
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
