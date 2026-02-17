# CraftStudio - CLAUDE.md

## Overview
CraftStudio is the unified desktop client for the Craftec ecosystem. Built with Tauri v2 (Rust) + React (TypeScript) + Vite.

## Project Structure
```
craftstudio/
├── Cargo.toml              # Workspace root
├── apps/desktop/
│   ├── src-tauri/           # Tauri Rust backend
│   │   ├── src/
│   │   │   ├── main.rs      # Entry point
│   │   │   ├── lib.rs       # Plugin registration, command handlers
│   │   │   └── commands.rs  # Tauri commands (get_identity, get_version)
│   │   └── tauri.conf.json  # Tauri configuration
│   ├── src/                 # React frontend
│   │   ├── App.tsx          # Root layout + page routing
│   │   ├── components/      # Sidebar, StatusBar
│   │   ├── modules/         # Page components (tunnel, data, wallet, identity, node, settings)
│   │   ├── store/           # Zustand stores (tunnelStore, identityStore)
│   │   ├── hooks/           # useWebSocket (daemon connection)
│   │   └── lib/             # RPC helpers
│   ├── package.json
│   └── vite.config.ts
```

## Setup
```bash
cd apps/desktop
pnpm install
```

## Build
```bash
# Frontend only
pnpm build

# Full Tauri build (from workspace root)
cargo build

# Dev mode (hot reload)
pnpm tauri dev
```

## Verify
```bash
pnpm build && cd ../.. && cargo build
```

## Architecture
- **Tauri shell**: Thin — window management, system tray, OS keychain, daemon lifecycle
- **Daemon** (future): Separate process, all protocol logic, communicates via WebSocket (JSON-RPC 2.0)
- **Frontend**: React SPA with Zustand state, TailwindCSS styling, Lucide icons

## Key Design Decisions
- WebSocket to daemon for protocol operations, Tauri commands for OS-level operations
- Dark mode default, Craftec brand colors
- Sidebar navigation: TunnelCraft, DataCraft, Identity, Node, Wallet, Settings
- See `docs/CRAFTSTUDIO_DESIGN.md` for full design doc

## Current State
- All pages wired to DataCraft daemon via WebSocket JSON-RPC 2.0
- Singleton `DaemonClient` at `src/services/daemon.ts` — auto-reconnect, typed methods
- `daemonStore` — reactive connection state used by StatusBar + DaemonOffline banner
- `dataCraftStore` — publish/list/access all go through daemon IPC
- `walletStore` — fundPool calls `settlement.fund_pool` via daemon
- NodePage loads peers, channels, receipts, status from daemon
- Graceful degradation: all pages work offline, show "Daemon offline" banner
- Tauri commands: `get_identity`, `get_version`, `get_config`, `save_config`
- Old `useWebSocket` hook still exists but superseded by `daemon` singleton

## Recent Updates (2025-01-17)
- **Enhanced DataCraft UI**: Reworked content management with clear separation between "Published Content" (I published this) and "Stored Content" (I'm storing others' content)
- **Publisher behavior**: Publisher deletes all pieces after distribution - UI correctly shows distribution status, not local piece count
- **Content health visualization**: Enhanced with per-segment rank display, redundancy levels (High/Good/Low/Critical), and provider count analysis
- **Network visibility**: Added NetworkPeersView component showing connected peers, capabilities, storage utilization, and piece distribution balance
- **Segment analysis**: ContentHealthDetail now displays detailed per-segment health with rank/k ratios and redundancy categorization
- **Distribution tracking**: Published content shows distribution status (distributed/distributing/local only) across network nodes
- **Instance management**: Verified start/stop functionality works correctly with `shutdown` RPC method
