# OpenKot

OpenKot is just another wrapper around [OpenCode](https://opencode.ai) — so why does it exist?

In Malay slang, "kot" is commonly used to express uncertainty or probability. It can be likened to phrases like "maybe," "perhaps," or "I guess," and is often placed at the end of a sentence to soften a statement. For example, saying "Dia pergi kerja kot" means "Maybe he went to work". While it can imply a sense of confirmation, it is not typically used to express certainty without a doubt. Instead, it conveys a more casual or tentative approach to making claims.

OpenCode is powerful, but the UI should feel like yours. I built OpenKot because I wanted an interface that behaves exactly the way I think it should — and you should have that too. Fork it, change it, make it yours. It's also structured so AI agents can understand and modify it quickly — see `AGENTS.md` for a full map of the codebase.

A web-based UI for [OpenCode](https://opencode.ai) — run it locally, use it from any browser including mobile.

## Features

- **Chat** — Multi-model AI chat with streaming, session branching, fork
- **Trail** — Collapsible tool activity grouped per response turn
- **File Explorer** — Multi-tab file viewer with syntax highlighting, git status
- **Code Editor** — CodeMirror 6 with language-aware highlighting
- **Terminal** — xterm.js (desktop) + mobile-friendly fallback
- **Git Panel** — Stage, commit, push, pull, diff
- **Themes** — Flexoki, Tokyo Night, Nord, Catppuccin, Dracula, Solarized (dark/light)
- **Permission Mode** — Approve AI tool calls before execution
- **MCP Integration** — Context7 docs, Sequential Thinking, Chrome DevTools, and more
- **`openkot` CLI** — Start the UI from any directory globally


---

## Platform

Built and tested on **Windows**. Linux/macOS setup scripts exist but haven't been tested — contributions welcome.

## Requirements

- [Bun](https://bun.sh) ≥ 1.0
- Git

**Installing Bun on Windows** (run in PowerShell):
```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

Then restart your terminal so `bun` is available in PATH.

---

## Install

```bash
git clone https://github.com/keemzin/openkot.git
cd openkot
```

### Windows

```bat
copy/rename .env.example .env
setup.bat
```

This will:
1. Install dependencies (`bun install`)
2. Download the OpenCode binary into `vendor/opencode/`
3. Build the frontend (`bun run build`)
4. Register the `openkot` command globally (`bun link`)

### Linux / macOS

```bash
chmod +x setup.sh
./setup.sh
```

---

## Usage

There are two ways to run OpenKot depending on your workflow:

---

### Option A — `openkot` CLI (any directory)

Best when you want to point OpenKot at different projects without changing anything.

```
Usage:
  openkot [directory]          Start in directory (default: current dir)
  openkot .                    Start in current directory
  openkot stop                 Stop all instances
  openkot stop [dir]           Stop instance for directory
  openkot list                 List running instances
  openkot clean                Remove stale entries

Options:
  --port <port>                Web UI port (default: 3006)
  --opencode-port <port>       OpenCode port (default: 3358)
  --name <name>                Instance name
```

The browser opens automatically. Each directory gets its own isolated instance with its own port.

---

### Option B — `start.bat` (fixed WORKSPACE)

Best when you always work in the same place and want a simple double-click launch.

The `WORKSPACE/` folder inside the repo is the fixed working directory. Just put your files there (or symlink it), then:

```bat
start.bat
```

Opens at `http://localhost:3006` every time. No CLI needed, no PATH setup required — just Bun installed.

To change the default directory, edit `.env`:

```env
WORKING_DIR=WORKSPACE   # relative to repo root, or use an absolute path
```

---

**Which one should I use?**

| | `openkot` CLI | `start.bat` |
|---|---|---|
| Works from any folder | ✅ | ❌ |
| Multiple projects at once | ✅ | ❌ |
| Simple double-click launch | ❌ | ✅ |
| Needs `bun link` / PATH setup | ✅ | ❌ |
| Fixed workspace | ❌ | ✅ |

---

## Updating

```bash
git pull
bun install        # if dependencies changed
bun run build      # rebuild frontend
```

No need to re-run `bun link` unless you reinstalled Bun.

---

## Development Mode

```bash
bun run dev        # Vite + Express with hot reload
```

Or separately:
```bash
bun run dev:frontend   # Vite only
bun run server         # Express server only
```

---

## Configuration

### Environment (`.env`)

Edit `.env` in the project root:

```env
PORT=3006              # Web UI port
OPENCODE_PORT=3358     # OpenCode internal port
OPENCODE_HOST=0.0.0.0  # Bind host
WORKING_DIR=WORKSPACE  # Default working directory (relative or absolute)
```

The CLI overrides these with its own port allocation, so `.env` only matters for `bun run server` / `bun run dev`.

### OpenCode Config (`.opencode/opencode.jsonc`)

Configure permissions, MCP servers, and providers in `.opencode/opencode.jsonc`. A starter template is available at `.opencode/opencode .jsonc.example` — copy and rename it to get started.

Key sections:
- **permission** — Control which tools require approval (edit, bash, read, etc.)
- **mcp** — Enable MCP servers (Context7, Sequential Thinking, Chrome DevTools, etc.)
- **provider** — Configure AI model providers

---

## Architecture

```
React Frontend (src/main.tsx)
     ↓ SDK (direct, port 3358)              ↓ HTTP/WebSocket (via Express)
OpenCode Binary (vendor/opencode)        Express Server (server/index.js)
     ├── Serves dist/ (built React app)
     ├── Spawns OpenCode binary internally
     └── Direct handlers: /api/fs/*, /api/git/*, /api/terminal/*, /api/config/*
```

OpenCode-specific operations (sessions, messages, permissions, questions) use the SDK to connect directly to the OpenCode binary. Filesystem, git, terminal, and MCP config operations stay as Express routes.

---

## Troubleshooting

**`openkot` not found after setup**  
Add Bun's bin to your PATH:
- Windows: `C:\Users\<you>\.bun\bin`
- Linux/macOS: `~/.bun/bin`

**Port already in use**  
The CLI auto-detects free ports. If it still fails, run `openkot clean` then retry.

**OpenCode fails to start**  
Check the binary exists at `vendor/opencode/opencode.exe` (Windows) or `vendor/opencode/opencode`.  
Re-run `setup.bat` / `setup.sh` to re-download it.

**UI shows blank page**  
Run `bun run build` — the server needs `dist/` to exist.

**MCP config edits crash the server**  
Only happens if you start with a custom script that pipes stdout. Always use `openkot` or `start.bat`.

**MCP servers failing to start**  
Check `.opencode/opencode.jsonc` — ensure `enabled: true` and commands are valid. Check logs for npm/npx errors.

**Chrome DevTools MCP**  
Requires Chrome to be running with remote debugging. Start Chrome with `--remote-debugging-port=9222` flag.
