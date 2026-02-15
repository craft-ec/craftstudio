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
- Scaffold complete with placeholder UI for all pages
- Tauri commands: `get_identity`, `get_version`
- WebSocket hook scaffolded (connects to ws://127.0.0.1:9091/ws)
- No daemon yet — just the Tauri shell + React frontend
